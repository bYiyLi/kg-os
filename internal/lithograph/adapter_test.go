package lithograph

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

var scriptedDriverSequence atomic.Uint64

type scriptedDriver struct {
	query func(string, []driver.NamedValue) (driver.Rows, error)
}

func (scripted scriptedDriver) Open(string) (driver.Conn, error) {
	return &scriptedConn{query: scripted.query}, nil
}

type scriptedConn struct {
	query func(string, []driver.NamedValue) (driver.Rows, error)
}

func (*scriptedConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare is not supported")
}

func (*scriptedConn) Close() error {
	return nil
}

func (*scriptedConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transaction is not supported")
}

func (connection *scriptedConn) QueryContext(
	_ context.Context,
	query string,
	args []driver.NamedValue,
) (driver.Rows, error) {
	return connection.query(query, args)
}

type scriptedRows struct {
	columns []string
	values  [][]driver.Value
	err     error
	index   int
}

func (rows *scriptedRows) Columns() []string {
	return rows.columns
}

func (*scriptedRows) Close() error {
	return nil
}

func (rows *scriptedRows) Next(dest []driver.Value) error {
	if rows.index < len(rows.values) {
		copy(dest, rows.values[rows.index])
		rows.index++
		return nil
	}
	if rows.err != nil {
		err := rows.err
		rows.err = nil
		return err
	}
	return io.EOF
}

func scriptedSQLConn(
	t *testing.T,
	query func(string, []driver.NamedValue) (driver.Rows, error),
) *sql.Conn {
	t.Helper()
	name := fmt.Sprintf("kgos-scripted-%d", scriptedDriverSequence.Add(1))
	sql.Register(name, scriptedDriver{query: query})
	database, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open scripted database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	connection, err := database.Conn(context.Background())
	if err != nil {
		t.Fatalf("open scripted connection: %v", err)
	}
	t.Cleanup(func() { _ = connection.Close() })
	return connection
}

func streamRows(values [][]driver.Value, rowErr error) *scriptedRows {
	return &scriptedRows{
		columns: []string{"ordinal", "event", "data"},
		values:  values,
		err:     rowErr,
	}
}

type queryStep struct {
	contains string
	value    []byte
	rows     driver.Rows
	err      error
}

func scriptedSequenceSQLConn(t *testing.T, steps ...queryStep) *sql.Conn {
	t.Helper()
	index := 0
	connection := scriptedSQLConn(t, func(query string, args []driver.NamedValue) (driver.Rows, error) {
		if index >= len(steps) {
			return nil, fmt.Errorf("unexpected query after script end: %s", query)
		}
		step := steps[index]
		index++
		label := query
		if len(args) != 0 {
			label += " :: " + fmt.Sprint(args[0].Value)
		}
		if step.contains != "" && !strings.Contains(label, step.contains) {
			return nil, fmt.Errorf("script step %d expected %q in %q", index-1, step.contains, label)
		}
		if step.err != nil {
			return nil, step.err
		}
		if step.rows != nil {
			return step.rows, nil
		}
		return &scriptedRows{
			columns: []string{"value"},
			values:  [][]driver.Value{{step.value}},
		}, nil
	})
	t.Cleanup(func() {
		if index != len(steps) {
			t.Errorf("script consumed %d/%d query steps", index, len(steps))
		}
	})
	return connection
}

func commitEnvelope(commit string) []byte {
	return []byte(fmt.Sprintf(
		`{"columns":["commit"],"rows":[[%q]],"summary":{}}`,
		commit,
	))
}

func valueEnvelope() []byte {
	return []byte(`{"columns":["value"],"rows":[[1]],"summary":{}}`)
}

func TestStreamRawRejectsMalformedEventSequences(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		values [][]driver.Value
		rowErr error
		want   string
	}{
		{
			name: "ordinal jump",
			values: [][]driver.Value{
				{int64(0), "columns", []byte("[]")},
				{int64(2), "summary", []byte("{}")},
			},
			want: "ordinal jumped",
		},
		{
			name: "after summary",
			values: [][]driver.Value{
				{int64(0), "summary", []byte("{}")},
				{int64(1), "row", []byte("[]")},
			},
			want: "after terminal summary",
		},
		{
			name:   "missing summary",
			values: [][]driver.Value{{int64(0), "columns", []byte("[]")}},
			want:   "without terminal summary",
		},
		{
			name:   "scan error",
			values: [][]driver.Value{{"bad-ordinal", "columns", []byte("[]")}},
			want:   "scan Lithograph stream event",
		},
		{
			name:   "rows error",
			values: [][]driver.Value{{int64(0), "columns", []byte("[]")}},
			rowErr: errors.New("row failure"),
			want:   "row failure",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			connection := scriptedSQLConn(t, func(string, []driver.NamedValue) (driver.Rows, error) {
				return streamRows(test.values, test.rowErr), nil
			})
			err := streamRaw(
				context.Background(),
				connection,
				"RETURN 1",
				nil,
				nil,
				func(Event) error { return nil },
			)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("stream error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestStreamRawRejectsAdapterAndEncodingFailures(t *testing.T) {
	t.Parallel()
	connection := scriptedSQLConn(t, func(string, []driver.NamedValue) (driver.Rows, error) {
		return nil, errors.New("query failed")
	})
	if err := streamRaw(context.Background(), connection, "RETURN 1", nil, nil, nil); err == nil ||
		!strings.Contains(err.Error(), "consumer") {
		t.Fatalf("nil consumer error = %v", err)
	}
	if err := streamRaw(
		context.Background(),
		connection,
		"RETURN $value",
		map[string]any{"value": func() {}},
		nil,
		func(Event) error { return nil },
	); err == nil || !strings.Contains(err.Error(), "params") {
		t.Fatalf("params encoding error = %v", err)
	}
	if err := streamRaw(
		context.Background(),
		connection,
		"RETURN 1",
		nil,
		map[string]any{"bad": func() {}},
		func(Event) error { return nil },
	); err == nil || !strings.Contains(err.Error(), "options") {
		t.Fatalf("options encoding error = %v", err)
	}
	if err := streamRaw(
		context.Background(),
		connection,
		"RETURN 1",
		nil,
		nil,
		func(Event) error { return nil },
	); err == nil || !strings.Contains(err.Error(), "query failed") {
		t.Fatalf("query adapter error = %v", err)
	}
}

func TestExecuteRawAndResolveCommitRejectMalformedAdapterResults(t *testing.T) {
	t.Parallel()
	if _, err := executeRaw(
		context.Background(),
		scriptedSQLConn(t, func(string, []driver.NamedValue) (driver.Rows, error) {
			return &scriptedRows{columns: []string{"value"}, values: [][]driver.Value{{[]byte("{")}}}, nil
		}),
		"RETURN 1",
		nil,
		nil,
	); err == nil {
		t.Fatal("invalid Lithograph result JSON was accepted")
	}

	queryError := scriptedSQLConn(t, func(string, []driver.NamedValue) (driver.Rows, error) {
		return nil, errors.New("scalar query failed")
	})
	if _, err := executeRaw(context.Background(), queryError, "RETURN 1", nil, nil); err == nil ||
		!strings.Contains(err.Error(), "scalar query failed") {
		t.Fatalf("execute adapter error = %v", err)
	}
	if _, err := executeRaw(
		context.Background(),
		queryError,
		"RETURN 1",
		map[string]any{"bad": func() {}},
		nil,
	); err == nil || !strings.Contains(err.Error(), "params") {
		t.Fatalf("execute params error = %v", err)
	}
	if _, err := executeRaw(
		context.Background(),
		queryError,
		"RETURN 1",
		nil,
		map[string]any{"bad": func() {}},
	); err == nil || !strings.Contains(err.Error(), "options") {
		t.Fatalf("execute options error = %v", err)
	}

	if _, err := resolveCommit(context.Background(), nil, ""); err == nil {
		t.Fatal("empty state ref was accepted")
	}
	for _, test := range []struct {
		name     string
		envelope []byte
		want     string
	}{
		{name: "zero rows", envelope: []byte(`{"columns":["commit"],"rows":[],"summary":{}}`), want: "0 rows"},
		{name: "two rows", envelope: []byte(`{"columns":["commit"],"rows":[["commit/a"],["commit/b"]],"summary":{}}`), want: "2 rows"},
		{name: "missing column", envelope: []byte(`{"columns":["other"],"rows":[["commit/a"]],"summary":{}}`), want: "missing"},
		{name: "wrong type", envelope: []byte(`{"columns":["commit"],"rows":[[1]],"summary":{}}`), want: "decode"},
		{name: "bad prefix", envelope: []byte(`{"columns":["commit"],"rows":[["branch/main"]],"summary":{}}`), want: "invalid commit ref"},
	} {
		t.Run(test.name, func(t *testing.T) {
			connection := scriptedSQLConn(t, func(string, []driver.NamedValue) (driver.Rows, error) {
				return &scriptedRows{
					columns: []string{"value"},
					values:  [][]driver.Value{{test.envelope}},
				}, nil
			})
			if _, err := resolveCommit(context.Background(), connection, "branch/main"); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("resolve error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestVerifyMainRejectsMalformedBaseline(t *testing.T) {
	tests := []struct {
		name  string
		steps []queryStep
		want  string
	}{
		{
			name: "missing columns",
			steps: []queryStep{{
				contains: "branch.list",
				value:    []byte(`{"columns":["name"],"rows":[["main"]],"summary":{}}`),
			}},
			want: "name/commit",
		},
		{
			name: "missing main",
			steps: []queryStep{{
				contains: "branch.list",
				value:    []byte(`{"columns":["name","commit"],"rows":[["other","commit/a"]],"summary":{}}`),
			}},
			want: "main branch is missing",
		},
		{
			name: "resolve error",
			steps: []queryStep{
				{
					contains: "branch.list",
					value:    []byte(`{"columns":["name","commit"],"rows":[["main","commit/a"]],"summary":{}}`),
				},
				{contains: "commit.get", err: errors.New("resolve failed")},
			},
			want: "resolve Lithograph main branch",
		},
		{
			name: "head mismatch",
			steps: []queryStep{
				{
					contains: "branch.list",
					value:    []byte(`{"columns":["name","commit"],"rows":[["main","commit/a"]],"summary":{}}`),
				},
				{contains: "commit.get", value: commitEnvelope("commit/b")},
			},
			want: "head mismatch",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			connection := scriptedSequenceSQLConn(t, test.steps...)
			if err := verifyMain(context.Background(), connection); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("verifyMain error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestVerifyExecutionCapabilitiesRejectsBrokenSurface(t *testing.T) {
	valid := queryStep{contains: "lithograph_validate", value: []byte(`{"valid":true}`)}
	buffered := queryStep{contains: "RETURN 1 AS value", value: valueEnvelope()}
	goodStream := queryStep{
		contains: "lithograph_rows",
		rows: streamRows([][]driver.Value{
			{int64(0), "columns", []byte(`["value"]`)},
			{int64(1), "row", []byte(`[1]`)},
			{int64(2), "summary", []byte(`{}`)},
		}, nil),
	}
	tests := []struct {
		name  string
		steps []queryStep
		want  string
	}{
		{
			name:  "validate query error",
			steps: []queryStep{{contains: "lithograph_validate", err: errors.New("validate failed")}},
			want:  "validate Lithograph Cypher capability",
		},
		{
			name:  "invalid validation response",
			steps: []queryStep{{contains: "lithograph_validate", value: []byte(`{"valid":false}`)}},
			want:  "invalid response",
		},
		{
			name:  "buffered failure",
			steps: []queryStep{valid, {contains: "RETURN 1 AS value", err: errors.New("buffered failed")}},
			want:  "buffered execution",
		},
		{
			name:  "stream query failure",
			steps: []queryStep{valid, buffered, {contains: "lithograph_rows", err: errors.New("stream failed")}},
			want:  "streaming execution",
		},
		{
			name: "stream scan failure",
			steps: []queryStep{
				valid,
				buffered,
				{contains: "lithograph_rows", rows: streamRows(
					[][]driver.Value{{"bad", "columns", []byte(`[]`)}},
					nil,
				)},
			},
			want: "scan Lithograph streaming probe",
		},
		{
			name: "stream rows failure",
			steps: []queryStep{
				valid,
				buffered,
				{contains: "lithograph_rows", rows: streamRows(
					[][]driver.Value{{int64(0), "columns", []byte(`[]`)}},
					errors.New("rows failed"),
				)},
			},
			want: "consume Lithograph streaming probe",
		},
		{
			name: "unexpected stream events",
			steps: []queryStep{
				valid,
				buffered,
				{contains: "lithograph_rows", rows: streamRows(
					[][]driver.Value{
						{int64(0), "columns", []byte(`[]`)},
						{int64(1), "summary", []byte(`{}`)},
					},
					nil,
				)},
			},
			want: "unexpected Lithograph streaming probe events",
		},
		{
			name: "explicit transaction readiness failure",
			steps: []queryStep{
				valid,
				buffered,
				goodStream,
				{contains: "commit.get", err: errors.New("commit lookup failed")},
			},
			want: "resolve main before explicit transaction probe",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			connection := scriptedSequenceSQLConn(t, test.steps...)
			if err := verifyExecutionCapabilities(context.Background(), connection); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("capability error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestVerifyExplicitTransactionCapabilitiesFailures(t *testing.T) {
	base := "commit/base"
	lookup := queryStep{contains: "commit.get", value: commitEnvelope(base)}
	begin := queryStep{contains: "lithograph_tx_begin", value: []byte(`{"baseCommit":"commit/base"}`)}
	execute := queryStep{contains: "RETURN 1 AS value", value: valueEnvelope()}
	commit := queryStep{contains: "lithograph_tx_commit", value: []byte(`{"commit":"commit/base"}`)}
	abort := queryStep{contains: "lithograph_tx_abort", value: []byte(`{"aborted":true}`)}
	tests := []struct {
		name  string
		steps []queryStep
		want  string
	}{
		{
			name:  "initial resolve",
			steps: []queryStep{{contains: "commit.get", err: errors.New("lookup failed")}},
			want:  "resolve main before",
		},
		{
			name:  "begin",
			steps: []queryStep{lookup, {contains: "lithograph_tx_begin", err: errors.New("begin failed")}},
			want:  "begin explicit transaction probe",
		},
		{
			name: "execute",
			steps: []queryStep{
				lookup,
				begin,
				{contains: "RETURN 1 AS value", err: errors.New("execute failed")},
				abort,
			},
			want: "execute explicit transaction probe",
		},
		{
			name: "commit",
			steps: []queryStep{
				lookup,
				begin,
				execute,
				{contains: "lithograph_tx_commit", err: errors.New("commit failed")},
				abort,
			},
			want: "commit explicit transaction probe",
		},
		{
			name:  "commit JSON",
			steps: []queryStep{lookup, begin, execute, {contains: "lithograph_tx_commit", value: []byte("{")}},
			want:  "decode explicit transaction commit probe",
		},
		{
			name: "changed read commit",
			steps: []queryStep{
				lookup,
				begin,
				execute,
				{contains: "lithograph_tx_commit", value: []byte(`{"commit":"commit/other"}`)},
			},
			want: "pure-read explicit transaction changed commit",
		},
		{
			name: "abort begin",
			steps: []queryStep{
				lookup,
				begin,
				execute,
				commit,
				{contains: "lithograph_tx_begin", err: errors.New("second begin failed")},
			},
			want: "begin explicit abort probe",
		},
		{
			name: "abort",
			steps: []queryStep{
				lookup,
				begin,
				execute,
				commit,
				begin,
				{contains: "lithograph_tx_abort", err: errors.New("abort failed")},
				abort,
			},
			want: "abort explicit transaction probe",
		},
		{
			name: "final resolve",
			steps: []queryStep{
				lookup,
				begin,
				execute,
				commit,
				begin,
				abort,
				{contains: "commit.get", err: errors.New("final lookup failed")},
			},
			want: "resolve main after",
		},
		{
			name: "final mismatch",
			steps: []queryStep{
				lookup,
				begin,
				execute,
				commit,
				begin,
				abort,
				{contains: "commit.get", value: commitEnvelope("commit/other")},
			},
			want: "changed main head",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			connection := scriptedSequenceSQLConn(t, test.steps...)
			if err := verifyExplicitTransactionCapabilities(context.Background(), connection); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("explicit transaction error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestVerifySemanticProviderFailures(t *testing.T) {
	base := "commit/base"
	lookup := queryStep{contains: "commit.get", value: commitEnvelope(base)}
	begin := queryStep{contains: "lithograph_tx_begin", value: []byte(`{"baseCommit":"commit/base"}`)}
	semanticExecute := queryStep{contains: "semantic.createNodeIndex", value: valueEnvelope()}
	abort := queryStep{contains: "lithograph_tx_abort", value: []byte(`{"aborted":true}`)}
	semantic := runtimeprofile.SemanticDefaults{
		Provider:      "openai-compatible",
		BaseURL:       "https://example.invalid/v1",
		Model:         "fixture",
		APIKeyEnv:     "PHASE01_KEY",
		Dimensions:    3,
		Similarity:    "cosine",
		CacheEnabled:  true,
		CachePath:     "/tmp/phase01-cache.db",
		CacheMaxBytes: 1024,
	}
	tests := []struct {
		name  string
		steps []queryStep
		want  string
	}{
		{
			name:  "initial resolve",
			steps: []queryStep{{contains: "commit.get", err: errors.New("lookup failed")}},
			want:  "resolve main before Semantic readiness probe",
		},
		{
			name:  "begin",
			steps: []queryStep{lookup, {contains: "lithograph_tx_begin", err: errors.New("begin failed")}},
			want:  "begin Semantic readiness probe",
		},
		{
			name: "provider config",
			steps: []queryStep{
				lookup,
				begin,
				{contains: "semantic.createNodeIndex", err: errors.New("semantic failed")},
				abort,
			},
			want: "validate Semantic provider configuration",
		},
		{
			name: "abort",
			steps: []queryStep{
				lookup,
				begin,
				semanticExecute,
				{contains: "lithograph_tx_abort", err: errors.New("abort failed")},
				abort,
			},
			want: "abort Semantic readiness probe",
		},
		{
			name: "final resolve",
			steps: []queryStep{
				lookup,
				begin,
				semanticExecute,
				abort,
				{contains: "commit.get", err: errors.New("final lookup failed")},
			},
			want: "resolve main after Semantic readiness probe",
		},
		{
			name: "final mismatch",
			steps: []queryStep{
				lookup,
				begin,
				semanticExecute,
				abort,
				{contains: "commit.get", value: commitEnvelope("commit/other")},
			},
			want: "changed main head",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			connection := scriptedSequenceSQLConn(t, test.steps...)
			if err := verifySemanticProvider(context.Background(), connection, semantic); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("semantic readiness error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestTransactionLifecycleFailurePaths(t *testing.T) {
	newHost := func() *Host {
		lifetime, cancel := context.WithCancel(context.Background())
		t.Cleanup(cancel)
		return &Host{
			lifetime:     lifetime,
			cancel:       cancel,
			transactions: make(map[*Transaction]struct{}),
		}
	}

	t.Run("closed host rejects operations", func(t *testing.T) {
		host := newHost()
		host.closed = true
		transaction := &Transaction{host: host}
		if _, err := transaction.Execute(context.Background(), "RETURN 1", nil, nil); err == nil {
			t.Fatal("execute on closed host succeeded")
		}
		if err := transaction.Stream(
			context.Background(),
			"RETURN 1",
			nil,
			nil,
			func(Event) error { return nil },
		); err == nil {
			t.Fatal("stream on closed host succeeded")
		}
		if _, err := transaction.Commit(context.Background()); err == nil {
			t.Fatal("commit on closed host succeeded")
		}
		if err := transaction.Abort(context.Background()); err == nil {
			t.Fatal("abort on closed host succeeded")
		}
	})

	t.Run("stream success", func(t *testing.T) {
		host := newHost()
		connection := scriptedSequenceSQLConn(t, queryStep{
			contains: "lithograph_rows",
			rows: streamRows([][]driver.Value{
				{int64(0), "columns", []byte(`["value"]`)},
				{int64(1), "row", []byte(`[1]`)},
				{int64(2), "summary", []byte(`{}`)},
			}, nil),
		})
		transaction := &Transaction{host: host, connection: connection}
		host.transactions[transaction] = struct{}{}
		if err := transaction.Stream(
			context.Background(),
			"RETURN 1",
			nil,
			nil,
			func(Event) error { return nil },
		); err != nil {
			t.Fatalf("stream transaction: %v", err)
		}
	})

	t.Run("commit failure fails closed", func(t *testing.T) {
		host := newHost()
		connection := scriptedSequenceSQLConn(
			t,
			queryStep{contains: "lithograph_tx_commit", err: errors.New("commit failed")},
			queryStep{contains: "lithograph_tx_abort", value: []byte(`{"aborted":true}`)},
		)
		transaction := &Transaction{host: host, connection: connection}
		host.transactions[transaction] = struct{}{}
		if _, err := transaction.Commit(context.Background()); err == nil ||
			!strings.Contains(err.Error(), "commit Lithograph transaction") {
			t.Fatalf("commit failure = %v", err)
		}
		if !transaction.closed || transaction.connection != nil {
			t.Fatal("failed commit did not close transaction")
		}
	})

	t.Run("abort failure fails closed", func(t *testing.T) {
		host := newHost()
		connection := scriptedSequenceSQLConn(
			t,
			queryStep{contains: "lithograph_tx_abort", err: errors.New("abort failed")},
			queryStep{contains: "lithograph_tx_abort", value: []byte(`{"aborted":true}`)},
		)
		transaction := &Transaction{host: host, connection: connection}
		host.transactions[transaction] = struct{}{}
		if err := transaction.Abort(context.Background()); err == nil ||
			!strings.Contains(err.Error(), "abort Lithograph transaction") {
			t.Fatalf("abort failure = %v", err)
		}
		if !transaction.closed || transaction.connection != nil {
			t.Fatal("failed abort did not close transaction")
		}
	})

	t.Run("close variants", func(t *testing.T) {
		host := newHost()
		closed := &Transaction{host: host, closed: true}
		if err := closed.Close(); err != nil {
			t.Fatalf("close already closed: %v", err)
		}

		nilConnection := &Transaction{host: host}
		host.transactions[nilConnection] = struct{}{}
		if err := nilConnection.Close(); err != nil {
			t.Fatalf("close nil connection: %v", err)
		}
		if !nilConnection.closed {
			t.Fatal("nil-connection transaction was not closed")
		}

		abortFailure := &Transaction{
			host: host,
			connection: scriptedSequenceSQLConn(
				t,
				queryStep{contains: "lithograph_tx_abort", err: errors.New("close abort failed")},
			),
		}
		host.transactions[abortFailure] = struct{}{}
		if err := abortFailure.Close(); err == nil ||
			!strings.Contains(err.Error(), "during close") {
			t.Fatalf("close abort failure = %v", err)
		}
	})

	t.Run("failClosed variants", func(t *testing.T) {
		host := newHost()
		nilConnection := &Transaction{host: host}
		host.transactions[nilConnection] = struct{}{}
		nilConnection.failClosed()
		if !nilConnection.closed {
			t.Fatal("nil-connection failClosed did not close")
		}

		sqliteDB, err := sql.Open("sqlite3", ":memory:")
		if err != nil {
			t.Fatalf("open SQLite: %v", err)
		}
		defer sqliteDB.Close()
		sqliteConnection, err := sqliteDB.Conn(context.Background())
		if err != nil {
			t.Fatalf("open SQLite connection: %v", err)
		}
		autoCommit := &Transaction{host: host, connection: sqliteConnection}
		host.transactions[autoCommit] = struct{}{}
		autoCommit.failClosed()
		if !autoCommit.closed || autoCommit.connection != nil {
			t.Fatal("autocommit failClosed did not release connection")
		}

		abortError := &Transaction{
			host: host,
			connection: scriptedSequenceSQLConn(
				t,
				queryStep{contains: "lithograph_tx_abort", err: errors.New("abort cleanup failed")},
			),
		}
		host.transactions[abortError] = struct{}{}
		abortError.failClosed()
		if !abortError.closed || abortError.connection != nil {
			t.Fatal("abort-error failClosed did not release connection")
		}
	})
}

func TestSQLiteHostHelperFailures(t *testing.T) {
	t.Parallel()
	database, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open bundled SQLite: %v", err)
	}
	defer database.Close()
	connection, err := database.Conn(context.Background())
	if err != nil {
		t.Fatalf("open bundled SQLite connection: %v", err)
	}
	defer connection.Close()

	if err := requireAutoCommit(connection); err != nil {
		t.Fatalf("fresh connection autocommit: %v", err)
	}
	if _, err := connection.ExecContext(context.Background(), "BEGIN"); err != nil {
		t.Fatalf("begin SQLite transaction: %v", err)
	}
	if err := requireAutoCommit(connection); err == nil ||
		!strings.Contains(err.Error(), "active transaction") {
		t.Fatalf("active SQLite transaction error = %v", err)
	}
	if _, err := connection.ExecContext(context.Background(), "ROLLBACK"); err != nil {
		t.Fatalf("rollback SQLite transaction: %v", err)
	}
	if _, err := readVersion(context.Background(), connection); err == nil ||
		!strings.Contains(err.Error(), "Lithograph version") {
		t.Fatalf("missing Lithograph version error = %v", err)
	}
	if err := probeSQLite(context.Background(), connection); err != nil {
		t.Fatalf("plain SQLite runtime probe: %v", err)
	}
	if err := verifyMain(context.Background(), connection); err == nil {
		t.Fatal("plain SQLite passed main verification")
	}
	if err := verifyExecutionCapabilities(context.Background(), connection); err == nil {
		t.Fatal("plain SQLite passed execution capability verification")
	}
	if err := verifyExplicitTransactionCapabilities(context.Background(), connection); err == nil {
		t.Fatal("plain SQLite passed explicit transaction verification")
	}
	if err := verifySemanticProvider(
		context.Background(),
		connection,
		runtimeprofile.SemanticDefaults{},
	); err == nil {
		t.Fatal("plain SQLite passed Semantic provider verification")
	}
	if err := verifyAnalyzer(context.Background(), connection, "unicode61"); err != nil {
		t.Fatalf("unicode61 analyzer probe: %v", err)
	}

	if _, err := openPool("missing-driver", filepath.Join(t.TempDir(), "db.sqlite"), false, 1); err == nil {
		t.Fatal("unknown SQLite driver was accepted")
	}
	badExtension := runtimeprofile.ResolvedExtension{
		Library:    filepath.Join(t.TempDir(), "missing-extension"),
		Entrypoint: "sqlite3_missing_init",
	}
	if host, err := Open(
		context.Background(),
		filepath.Join(t.TempDir(), "db.sqlite"),
		[]runtimeprofile.ResolvedExtension{badExtension},
		"unicode61",
		runtimeprofile.SemanticDefaults{},
	); err == nil {
		_ = host.Close()
		t.Fatal("missing extension was accepted")
	}
}
