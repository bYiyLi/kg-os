package lithograph

import (
	"context"
	"crypto/rand"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
	sqlite3 "github.com/mattn/go-sqlite3"
)

var driverSequence atomic.Uint64

type Host struct {
	readDB   *sql.DB
	writeDB  *sql.DB
	baseline Baseline
	analyzer string

	mu           sync.Mutex
	lifetime     context.Context
	cancel       context.CancelFunc
	active       sync.WaitGroup
	transactions map[*Transaction]struct{}
	closed       bool
}

func Open(
	ctx context.Context,
	databasePath string,
	extensions []runtimeprofile.ResolvedExtension,
	analyzer string,
	semantic runtimeprofile.SemanticDefaults,
) (*Host, error) {
	if len(extensions) == 0 {
		return nil, fmt.Errorf("at least one SQLite extension is required")
	}
	if !filepath.IsAbs(databasePath) {
		return nil, fmt.Errorf("database path must be absolute")
	}

	driverName := registerDriver(extensions)
	bootstrapDB, err := openPool(driverName, databasePath, false, 1)
	if err != nil {
		return nil, err
	}
	bootstrapConn, err := bootstrapDB.Conn(ctx)
	if err != nil {
		_ = bootstrapDB.Close()
		return nil, fmt.Errorf("open Lithograph bootstrap connection: %w", err)
	}

	baseline, bootstrapErr := bootstrap(ctx, bootstrapConn, analyzer, semantic)
	closeConnErr := bootstrapConn.Close()
	closeDBErr := bootstrapDB.Close()
	if bootstrapErr != nil {
		return nil, bootstrapErr
	}
	if closeConnErr != nil {
		return nil, fmt.Errorf("close Lithograph bootstrap connection: %w", closeConnErr)
	}
	if closeDBErr != nil {
		return nil, fmt.Errorf("close Lithograph bootstrap pool: %w", closeDBErr)
	}

	writeDB, err := openPool(driverName, databasePath, false, 4)
	if err != nil {
		return nil, err
	}
	readDB, err := openPool(driverName, databasePath, true, 8)
	if err != nil {
		_ = writeDB.Close()
		return nil, err
	}
	lifetime, cancel := context.WithCancel(context.Background())
	host := &Host{
		readDB:       readDB,
		writeDB:      writeDB,
		baseline:     baseline,
		analyzer:     analyzer,
		lifetime:     lifetime,
		cancel:       cancel,
		transactions: make(map[*Transaction]struct{}),
	}
	if err := host.verifyActivatedPools(ctx); err != nil {
		_ = host.Close()
		return nil, err
	}
	return host, nil
}

func registerDriver(extensions []runtimeprofile.ResolvedExtension) string {
	driverName := fmt.Sprintf("kgos-lithograph-%d", driverSequence.Add(1))
	resolved := append([]runtimeprofile.ResolvedExtension(nil), extensions...)
	officialJieba := false
	for _, extension := range resolved {
		if extension.Entrypoint == runtimeprofile.JiebaEntrypoint {
			officialJieba = true
		}
	}
	sql.Register(driverName, &sqlite3.SQLiteDriver{
		ConnectHook: func(connection *sqlite3.SQLiteConn) error {
			for _, extension := range resolved {
				if err := connection.LoadExtension(extension.Library, extension.Entrypoint); err != nil {
					return fmt.Errorf(
						"load SQLite extension %s with entrypoint %s: %w",
						extension.Library,
						extension.Entrypoint,
						err,
					)
				}
			}
			if officialJieba {
				if err := probeOfficialJieba(connection); err != nil {
					return err
				}
			}
			return nil
		},
	})
	return driverName
}

func probeOfficialJieba(connection *sqlite3.SQLiteConn) error {
	const table = "kgos_official_jieba_probe"
	if _, err := connection.Exec("CREATE VIRTUAL TABLE temp."+table+" USING fts5(body, tokenize='jieba')", nil); err != nil {
		return fmt.Errorf("probe official Jieba registration: %w", err)
	}
	if _, err := connection.Exec("INSERT INTO temp."+table+"(body) VALUES ('这是知识图。')", nil); err != nil {
		return fmt.Errorf("probe official Jieba indexing: %w", err)
	}
	rows, err := connection.Query("SELECT count(*) FROM temp."+table+" WHERE "+table+" MATCH '知识图'", nil)
	if err != nil {
		return fmt.Errorf("probe official Jieba query: %w", err)
	}
	value := make([]driver.Value, 1)
	nextErr := rows.Next(value)
	closeErr := rows.Close()
	if nextErr != nil || closeErr != nil || len(value) != 1 || value[0] != int64(1) {
		return fmt.Errorf("official Jieba query did not match the Chinese probe corpus: row=%v close=%v", nextErr, closeErr)
	}
	if _, err := connection.Exec("DROP TABLE temp."+table, nil); err != nil {
		return fmt.Errorf("clean official Jieba probe: %w", err)
	}
	return nil
}

func openPool(driverName, databasePath string, readOnly bool, maxOpen int) (*sql.DB, error) {
	mode := "rwc"
	if readOnly {
		mode = "ro"
	}
	uriPath := databasePath
	if runtime.GOOS == "windows" {
		uriPath = "/" + filepath.ToSlash(databasePath)
	}
	dsnURL := &url.URL{
		Scheme: "file",
		Path:   uriPath,
	}
	query := dsnURL.Query()
	query.Set("mode", mode)
	query.Set("_busy_timeout", "5000")
	dsnURL.RawQuery = query.Encode()

	db, err := sql.Open(driverName, dsnURL.String())
	if err != nil {
		return nil, fmt.Errorf("open SQLite pool: %w", err)
	}
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxOpen)
	return db, nil
}

func bootstrap(
	ctx context.Context,
	connection *sql.Conn,
	analyzer string,
	semantic runtimeprofile.SemanticDefaults,
) (Baseline, error) {
	if err := probeSQLite(ctx, connection); err != nil {
		return Baseline{}, err
	}
	version, err := readVersion(ctx, connection)
	if err != nil {
		return Baseline{}, err
	}
	uninitialized := version.DatabaseID == nil && version.StorageFormat.Current == nil
	if (version.DatabaseID == nil) != (version.StorageFormat.Current == nil) {
		return Baseline{}, fmt.Errorf("lithograph database has inconsistent initialization metadata")
	}
	if uninitialized {
		if _, err := scalarJSON(ctx, connection, "SELECT lithograph_init()"); err != nil {
			return Baseline{}, fmt.Errorf("initialize Lithograph database: %w", err)
		}
		version, err = readVersion(ctx, connection)
		if err != nil {
			return Baseline{}, err
		}
	}
	baseline, err := requireCompatibleVersion(version)
	if err != nil {
		return Baseline{}, err
	}
	if err := verifyMain(ctx, connection); err != nil {
		return Baseline{}, err
	}
	if err := verifyAnalyzer(ctx, connection, analyzer); err != nil {
		return Baseline{}, err
	}
	if err := verifyExecutionCapabilities(ctx, connection); err != nil {
		return Baseline{}, err
	}
	if err := verifySemanticProvider(ctx, connection, semantic); err != nil {
		return Baseline{}, err
	}
	return baseline, nil
}

func probeSQLite(ctx context.Context, connection *sql.Conn) error {
	var version string
	if err := connection.QueryRowContext(ctx, "SELECT sqlite_version()").Scan(&version); err != nil {
		return fmt.Errorf("read SQLite version: %w", err)
	}
	parts := strings.Split(version, ".")
	if len(parts) < 2 {
		return fmt.Errorf("invalid SQLite version %q", version)
	}
	major, majorErr := strconv.Atoi(parts[0])
	minor, minorErr := strconv.Atoi(parts[1])
	if majorErr != nil || minorErr != nil || major < 3 || (major == 3 && minor < 45) {
		return fmt.Errorf("SQLite version %q is below 3.45.0", version)
	}

	const ftsProbe = "kgos_runtime_fts_probe"
	_, _ = connection.ExecContext(ctx, "DROP TABLE IF EXISTS temp."+ftsProbe)
	if _, err := connection.ExecContext(ctx, "CREATE VIRTUAL TABLE temp."+ftsProbe+" USING fts5(body)"); err != nil {
		return fmt.Errorf("probe SQLite FTS5: %w", err)
	}
	if _, err := connection.ExecContext(ctx, "DROP TABLE temp."+ftsProbe); err != nil {
		return fmt.Errorf("clean SQLite FTS5 probe: %w", err)
	}
	return nil
}

func readVersion(ctx context.Context, connection *sql.Conn) (versionInfo, error) {
	raw, err := scalarJSON(ctx, connection, "SELECT lithograph_version()")
	if err != nil {
		return versionInfo{}, fmt.Errorf("read Lithograph version: %w", err)
	}
	var version versionInfo
	if err := json.Unmarshal(raw, &version); err != nil {
		return versionInfo{}, fmt.Errorf("decode Lithograph version: %w", err)
	}
	return version, nil
}

func requireCompatibleVersion(version versionInfo) (Baseline, error) {
	if version.Extension != expectedExtension {
		return Baseline{}, fmt.Errorf("lithograph extension %q is incompatible; require %s", version.Extension, expectedExtension)
	}
	if version.CypherProfile != expectedCypherProfile {
		return Baseline{}, fmt.Errorf("lithograph Cypher profile %q is incompatible; require %s", version.CypherProfile, expectedCypherProfile)
	}
	if version.DatabaseID == nil || *version.DatabaseID == "" {
		return Baseline{}, fmt.Errorf("lithograph databaseId is missing after initialization")
	}
	if version.StorageFormat.Current == nil || *version.StorageFormat.Current != expectedStorageFormat {
		return Baseline{}, fmt.Errorf("lithograph storage format is incompatible; require %d", expectedStorageFormat)
	}
	return Baseline{
		DatabaseID:    *version.DatabaseID,
		StorageFormat: *version.StorageFormat.Current,
		CypherProfile: version.CypherProfile,
	}, nil
}

func verifyMain(ctx context.Context, connection *sql.Conn) error {
	branches, err := executeRaw(ctx, connection, "CALL lithograph.branch.list()", nil, nil)
	if err != nil {
		return fmt.Errorf("list Lithograph branches: %w", err)
	}
	nameColumn, hasName := columnIndex(branches.Columns, "name")
	commitColumn, hasCommit := columnIndex(branches.Columns, "commit")
	if !hasName || !hasCommit {
		return fmt.Errorf("lithograph branch.list result is missing name/commit columns")
	}
	mainCommit := ""
	for _, row := range branches.Rows {
		if nameColumn >= len(row) || commitColumn >= len(row) {
			continue
		}
		var name string
		var commit string
		if json.Unmarshal(row[nameColumn], &name) == nil && json.Unmarshal(row[commitColumn], &commit) == nil && name == "main" {
			mainCommit = commit
			break
		}
	}
	if mainCommit == "" {
		return fmt.Errorf("lithograph main branch is missing")
	}
	resolved, err := resolveCommit(ctx, connection, "branch/main")
	if err != nil {
		return fmt.Errorf("resolve Lithograph main branch: %w", err)
	}
	if resolved != mainCommit {
		return fmt.Errorf("lithograph main branch head mismatch: list=%q resolved=%q", mainCommit, resolved)
	}
	return nil
}

func verifyAnalyzer(ctx context.Context, connection *sql.Conn, analyzer string) error {
	if analyzer == "" {
		return fmt.Errorf("full-text analyzer must be non-empty")
	}
	const table = "kgos_analyzer_probe"
	_, _ = connection.ExecContext(ctx, "DROP TABLE IF EXISTS temp."+table)
	quoted := strings.ReplaceAll(analyzer, "'", "''")
	statement := "CREATE VIRTUAL TABLE temp." + table + " USING fts5(body, tokenize='" + quoted + "')"
	if _, err := connection.ExecContext(ctx, statement); err != nil {
		return fmt.Errorf("full-text analyzer %q is unavailable: %w", analyzer, err)
	}
	if _, err := connection.ExecContext(ctx, "DROP TABLE temp."+table); err != nil {
		return fmt.Errorf("clean full-text analyzer probe: %w", err)
	}
	return nil
}

func verifyExecutionCapabilities(ctx context.Context, connection *sql.Conn) error {
	var validationRaw []byte
	if err := connection.QueryRowContext(ctx, "SELECT lithograph_validate(?)", "RETURN 1 AS value").Scan(&validationRaw); err != nil {
		return fmt.Errorf("validate Lithograph Cypher capability: %w", err)
	}
	var validation struct {
		Valid bool `json:"valid"`
	}
	if err := json.Unmarshal(validationRaw, &validation); err != nil || !validation.Valid {
		return fmt.Errorf("lithograph validate capability returned an invalid response")
	}
	if _, err := executeRaw(ctx, connection, "RETURN 1 AS value", nil, nil); err != nil {
		return fmt.Errorf("probe Lithograph buffered execution: %w", err)
	}
	rows, err := connection.QueryContext(
		ctx,
		"SELECT ordinal,event,data FROM lithograph_rows(?)",
		"RETURN 1 AS value",
	)
	if err != nil {
		return fmt.Errorf("probe Lithograph streaming execution: %w", err)
	}
	defer rows.Close()
	events := make([]string, 0, 3)
	for rows.Next() {
		var ordinal int
		var event string
		var data []byte
		if err := rows.Scan(&ordinal, &event, &data); err != nil {
			return fmt.Errorf("scan Lithograph streaming probe: %w", err)
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("consume Lithograph streaming probe: %w", err)
	}
	if strings.Join(events, ",") != "columns,row,summary" {
		return fmt.Errorf("unexpected Lithograph streaming probe events: %v", events)
	}
	if err := verifyExplicitTransactionCapabilities(ctx, connection); err != nil {
		return err
	}
	return nil
}

func verifyExplicitTransactionCapabilities(ctx context.Context, connection *sql.Conn) (returnErr error) {
	before, err := resolveCommit(ctx, connection, "branch/main")
	if err != nil {
		return fmt.Errorf("resolve main before explicit transaction probe: %w", err)
	}
	active := false
	defer func() {
		if !active {
			return
		}
		_, abortErr := scalarJSON(context.WithoutCancel(ctx), connection, "SELECT lithograph_tx_abort()")
		if abortErr != nil && returnErr == nil {
			returnErr = fmt.Errorf("abort failed explicit transaction probe: %w", abortErr)
		}
	}()

	if _, err := scalarJSON(ctx, connection, "SELECT lithograph_tx_begin(?)", "{}"); err != nil {
		return fmt.Errorf("begin explicit transaction probe: %w", err)
	}
	active = true
	if _, err := executeRaw(ctx, connection, "RETURN 1 AS value", nil, nil); err != nil {
		return fmt.Errorf("execute explicit transaction probe: %w", err)
	}
	commitRaw, err := scalarJSON(ctx, connection, "SELECT lithograph_tx_commit()")
	if err != nil {
		return fmt.Errorf("commit explicit transaction probe: %w", err)
	}
	active = false
	var committed map[string]any
	if err := json.Unmarshal(commitRaw, &committed); err != nil {
		return fmt.Errorf("decode explicit transaction commit probe: %w", err)
	}
	commit, _ := committed["commit"].(string)
	if commit != before {
		return fmt.Errorf("pure-read explicit transaction changed commit: got %q want %q", commit, before)
	}

	if _, err := scalarJSON(ctx, connection, "SELECT lithograph_tx_begin(?)", "{}"); err != nil {
		return fmt.Errorf("begin explicit abort probe: %w", err)
	}
	active = true
	if _, err := scalarJSON(ctx, connection, "SELECT lithograph_tx_abort()"); err != nil {
		return fmt.Errorf("abort explicit transaction probe: %w", err)
	}
	active = false
	after, err := resolveCommit(ctx, connection, "branch/main")
	if err != nil {
		return fmt.Errorf("resolve main after explicit transaction probe: %w", err)
	}
	if after != before {
		return fmt.Errorf("explicit transaction capability probe changed main head: before=%q after=%q", before, after)
	}
	return nil
}

func verifySemanticProvider(
	ctx context.Context,
	connection *sql.Conn,
	semantic runtimeprofile.SemanticDefaults,
) (returnErr error) {
	before, err := resolveCommit(ctx, connection, "branch/main")
	if err != nil {
		return fmt.Errorf("resolve main before Semantic readiness probe: %w", err)
	}
	if _, err := scalarJSON(ctx, connection, "SELECT lithograph_tx_begin(?)", "{}"); err != nil {
		return fmt.Errorf("begin Semantic readiness probe: %w", err)
	}
	active := true
	defer func() {
		if active {
			_, abortErr := scalarJSON(context.WithoutCancel(ctx), connection, "SELECT lithograph_tx_abort()")
			if returnErr == nil && abortErr != nil {
				returnErr = fmt.Errorf("abort Semantic readiness probe: %w", abortErr)
			}
		}
	}()

	probeName, err := randomProbeName()
	if err != nil {
		return err
	}
	params := map[string]any{
		"name":     probeName,
		"label":    probeName + "_label",
		"property": probeName + "_property",
		"options":  semantic.IndexOptions(),
	}
	if _, err := executeRaw(
		ctx,
		connection,
		"CALL db.index.semantic.createNodeIndex($name, [$label], $property, $options)",
		params,
		nil,
	); err != nil {
		return fmt.Errorf("validate Semantic provider configuration: %w", err)
	}
	if _, err := scalarJSON(ctx, connection, "SELECT lithograph_tx_abort()"); err != nil {
		return fmt.Errorf("abort Semantic readiness probe: %w", err)
	}
	active = false
	after, err := resolveCommit(ctx, connection, "branch/main")
	if err != nil {
		return fmt.Errorf("resolve main after Semantic readiness probe: %w", err)
	}
	if before != after {
		return fmt.Errorf("semantic readiness probe changed main head: before=%q after=%q", before, after)
	}
	return nil
}

func randomProbeName() (string, error) {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate Semantic readiness probe name: %w", err)
	}
	return "__kgos_phase01_" + hex.EncodeToString(bytes), nil
}

func (host *Host) verifyActivatedPools(ctx context.Context) error {
	write, err := host.acquire(ctx, host.writeDB)
	if err != nil {
		return fmt.Errorf("activate read-write Lithograph pool: %w", err)
	}
	if err := write.Close(); err != nil {
		return fmt.Errorf("close activation read-write connection: %w", err)
	}
	read, err := host.acquire(ctx, host.readDB)
	if err != nil {
		return fmt.Errorf("activate read-only Lithograph pool: %w", err)
	}
	if err := read.Close(); err != nil {
		return fmt.Errorf("close activation read-only connection: %w", err)
	}
	return nil
}

func (host *Host) acquire(ctx context.Context, pool *sql.DB) (*sql.Conn, error) {
	connection, err := pool.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire SQLite connection: %w", err)
	}
	return connection, nil
}

func (host *Host) Baseline() Baseline {
	return host.baseline
}

func (host *Host) operationContext(parent context.Context) (context.Context, func(), error) {
	host.mu.Lock()
	if host.closed {
		host.mu.Unlock()
		return nil, nil, fmt.Errorf("lithograph host is closed")
	}
	host.active.Add(1)
	lifetime := host.lifetime
	host.mu.Unlock()

	ctx, cancel := context.WithCancel(parent)
	stop := context.AfterFunc(lifetime, cancel)
	done := func() {
		stop()
		cancel()
		host.active.Done()
	}
	return ctx, done, nil
}

func (host *Host) registerTransaction(transaction *Transaction) error {
	host.mu.Lock()
	defer host.mu.Unlock()
	if host.closed {
		return fmt.Errorf("lithograph host is closed")
	}
	host.transactions[transaction] = struct{}{}
	return nil
}

func (host *Host) unregisterTransaction(transaction *Transaction) {
	host.mu.Lock()
	delete(host.transactions, transaction)
	host.mu.Unlock()
}

func (host *Host) Close() error {
	host.mu.Lock()
	if host.closed {
		host.mu.Unlock()
		return nil
	}
	host.closed = true
	if host.cancel != nil {
		host.cancel()
	}
	transactions := make([]*Transaction, 0, len(host.transactions))
	for transaction := range host.transactions {
		transactions = append(transactions, transaction)
	}
	host.mu.Unlock()

	var failures []string
	for _, transaction := range transactions {
		if err := transaction.Close(); err != nil {
			failures = append(failures, "transaction: "+err.Error())
		}
	}
	host.active.Wait()
	if host.readDB != nil {
		if err := host.readDB.Close(); err != nil {
			failures = append(failures, "read pool: "+err.Error())
		}
	}
	if host.writeDB != nil {
		if err := host.writeDB.Close(); err != nil {
			failures = append(failures, "write pool: "+err.Error())
		}
	}
	if len(failures) != 0 {
		return fmt.Errorf("close Lithograph host: %s", strings.Join(failures, "; "))
	}
	return nil
}

func scalarJSON(ctx context.Context, connection *sql.Conn, query string, args ...any) ([]byte, error) {
	var raw []byte
	if err := connection.QueryRowContext(ctx, query, args...).Scan(&raw); err != nil {
		return nil, normalizeDatabaseError(err)
	}
	return append([]byte(nil), raw...), nil
}
