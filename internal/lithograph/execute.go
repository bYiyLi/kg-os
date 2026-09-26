package lithograph

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	sqlite3 "github.com/mattn/go-sqlite3"
)

func (host *Host) Query(ctx context.Context, request QueryRequest) (QueryResult, error) {
	if request.At == "" {
		return QueryResult{}, fmt.Errorf("query state is required")
	}
	if request.Cypher == "" {
		return QueryResult{}, fmt.Errorf("query Cypher is required")
	}
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return QueryResult{}, err
	}
	defer done()
	connection, err := host.acquire(operationCtx, host.readDB)
	if err != nil {
		return QueryResult{}, err
	}
	defer connection.Close()
	state, err := resolveCommit(operationCtx, connection, request.At)
	if err != nil {
		return QueryResult{}, fmt.Errorf("resolve query state %q: %w", request.At, err)
	}
	result, err := executeRaw(operationCtx, connection, request.Cypher, request.Params, map[string]any{"at": state})
	if err != nil {
		return QueryResult{}, fmt.Errorf("execute query at %q: %w", state, err)
	}
	return QueryResult{State: state, Result: result}, nil
}

// ResolveState resolves a Lithograph StateRef to its immutable commit ref
// without executing a caller query.
func (host *Host) ResolveState(ctx context.Context, stateRef string) (string, error) {
	if stateRef == "" {
		return "", fmt.Errorf("state ref is required")
	}
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return "", err
	}
	defer done()
	connection, err := host.acquire(operationCtx, host.readDB)
	if err != nil {
		return "", err
	}
	defer connection.Close()
	state, err := resolveCommit(operationCtx, connection, stateRef)
	if err != nil {
		return "", fmt.Errorf("resolve state %q: %w", stateRef, err)
	}
	return state, nil
}

// QueryMetadata executes a read-only Lithograph version/ref metadata query
// without options.at. Version procedures such as branch.list, tag.list and
// commit.get reject historical execution options and expose their own explicit
// version arguments where applicable.
func (host *Host) QueryMetadata(
	ctx context.Context,
	cypher string,
	params map[string]any,
) (Result, error) {
	if cypher == "" {
		return Result{}, fmt.Errorf("metadata query Cypher is required")
	}
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return Result{}, err
	}
	defer done()
	connection, err := host.acquire(operationCtx, host.readDB)
	if err != nil {
		return Result{}, err
	}
	defer connection.Close()
	result, err := executeRaw(operationCtx, connection, cypher, params, nil)
	if err != nil {
		return Result{}, fmt.Errorf("execute Lithograph metadata query: %w", err)
	}
	return result, nil
}

func (host *Host) Execute(ctx context.Context, request ExecuteRequest) (Result, error) {
	if request.Branch == "" {
		return Result{}, fmt.Errorf("execute branch is required")
	}
	if request.Cypher == "" {
		return Result{}, fmt.Errorf("execute Cypher is required")
	}
	return host.withWriteConnection(ctx, func(operationCtx context.Context, connection *sql.Conn) (Result, error) {
		if _, err := executeRaw(
			operationCtx,
			connection,
			"CALL lithograph.branch.checkout($branch)",
			map[string]any{"branch": request.Branch},
			nil,
		); err != nil {
			return Result{}, fmt.Errorf("checkout branch %q: %w", request.Branch, err)
		}
		options := executionOptions(request.Author, request.Message)
		return executeRaw(operationCtx, connection, request.Cypher, request.Params, options)
	})
}

func (host *Host) withWriteConnection(
	ctx context.Context,
	execute func(context.Context, *sql.Conn) (Result, error),
) (result Result, returnErr error) {
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return Result{}, err
	}
	defer done()
	connection, err := host.acquireWriteConnection(operationCtx)
	if err != nil {
		return Result{}, err
	}
	defer joinWriteCleanup(&returnErr, connection)
	return execute(operationCtx, connection)
}

func (host *Host) StreamQuery(
	ctx context.Context,
	request QueryRequest,
	consume func(string, Event) error,
) (string, error) {
	if consume == nil {
		return "", fmt.Errorf("stream consumer is required")
	}
	if request.At == "" || request.Cypher == "" {
		return "", fmt.Errorf("query state and Cypher are required")
	}
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return "", err
	}
	defer done()
	connection, err := host.acquire(operationCtx, host.readDB)
	if err != nil {
		return "", err
	}
	defer connection.Close()
	state, err := resolveCommit(operationCtx, connection, request.At)
	if err != nil {
		return "", fmt.Errorf("resolve query state %q: %w", request.At, err)
	}
	if err := streamRaw(
		operationCtx,
		connection,
		request.Cypher,
		request.Params,
		map[string]any{"at": state},
		func(event Event) error { return consume(state, event) },
	); err != nil {
		return "", fmt.Errorf("stream query at %q: %w", state, err)
	}
	return state, nil
}

func (host *Host) StreamExecute(
	ctx context.Context,
	request ExecuteRequest,
	consume func(Event) error,
) (returnErr error) {
	if request.Branch == "" || request.Cypher == "" {
		return fmt.Errorf("execute branch and Cypher are required")
	}
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return err
	}
	defer done()
	connection, err := host.acquireWriteConnection(operationCtx)
	if err != nil {
		return err
	}
	defer joinWriteCleanup(&returnErr, connection)
	if _, err := executeRaw(
		operationCtx,
		connection,
		"CALL lithograph.branch.checkout($branch)",
		map[string]any{"branch": request.Branch},
		nil,
	); err != nil {
		return fmt.Errorf("checkout branch %q: %w", request.Branch, err)
	}
	return streamRaw(
		operationCtx,
		connection,
		request.Cypher,
		request.Params,
		executionOptions(request.Author, request.Message),
		consume,
	)
}

func executeRaw(
	ctx context.Context,
	connection *sql.Conn,
	cypher string,
	params any,
	options any,
) (Result, error) {
	paramsJSON, err := marshalObject(params)
	if err != nil {
		return Result{}, fmt.Errorf("encode Lithograph params: %w", err)
	}
	optionsJSON, err := marshalObject(options)
	if err != nil {
		return Result{}, fmt.Errorf("encode Lithograph options: %w", err)
	}
	raw, err := scalarJSON(
		ctx,
		connection,
		"SELECT lithograph(?, ?, ?)",
		cypher,
		paramsJSON,
		optionsJSON,
	)
	if err != nil {
		return Result{}, err
	}
	return decodeResult(raw)
}

func streamRaw(
	ctx context.Context,
	connection *sql.Conn,
	cypher string,
	params any,
	options any,
	consume func(Event) error,
) error {
	if consume == nil {
		return fmt.Errorf("stream consumer is required")
	}
	paramsJSON, err := marshalObject(params)
	if err != nil {
		return fmt.Errorf("encode Lithograph params: %w", err)
	}
	optionsJSON, err := marshalObject(options)
	if err != nil {
		return fmt.Errorf("encode Lithograph options: %w", err)
	}
	rows, err := connection.QueryContext(
		ctx,
		"SELECT ordinal,event,data FROM lithograph_rows(?, ?, ?)",
		cypher,
		paramsJSON,
		optionsJSON,
	)
	if err != nil {
		return normalizeDatabaseError(err)
	}
	defer rows.Close()
	lastOrdinal := -1
	terminalSummary := false
	for rows.Next() {
		var event Event
		var data []byte
		if err := rows.Scan(&event.Ordinal, &event.Type, &data); err != nil {
			return fmt.Errorf("scan Lithograph stream event: %w", err)
		}
		if event.Ordinal != lastOrdinal+1 {
			return fmt.Errorf("lithograph stream ordinal jumped from %d to %d", lastOrdinal, event.Ordinal)
		}
		lastOrdinal = event.Ordinal
		event.Data = append(json.RawMessage(nil), data...)
		if terminalSummary {
			return fmt.Errorf("lithograph stream emitted %q after terminal summary", event.Type)
		}
		if event.Type == "summary" {
			terminalSummary = true
		}
		if err := consume(event); err != nil {
			_ = rows.Close()
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return normalizeDatabaseError(err)
	}
	if !terminalSummary {
		return fmt.Errorf("lithograph stream ended without terminal summary")
	}
	return nil
}

func resolveCommit(ctx context.Context, connection *sql.Conn, stateRef string) (string, error) {
	if stateRef == "" {
		return "", fmt.Errorf("state ref is required")
	}
	result, err := executeRaw(
		ctx,
		connection,
		"CALL lithograph.commit.get($ref)",
		map[string]any{"ref": stateRef},
		nil,
	)
	if err != nil {
		return "", err
	}
	if len(result.Rows) != 1 {
		return "", fmt.Errorf("commit.get returned %d rows, want 1", len(result.Rows))
	}
	commit, err := stringCell(result, 0, "commit")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(commit, "commit/") {
		return "", fmt.Errorf("commit.get returned invalid commit ref %q", commit)
	}
	return commit, nil
}

func executionOptions(author, message *string) map[string]any {
	options := make(map[string]any, 2)
	if author != nil {
		options["author"] = *author
	}
	if message != nil {
		options["message"] = *message
	}
	return options
}

func marshalObject(value any) (string, error) {
	if value == nil {
		return "{}", nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	if string(raw) == "null" {
		return "{}", nil
	}
	if len(raw) == 0 || raw[0] != '{' {
		return "", fmt.Errorf("value must encode as a JSON object")
	}
	return string(raw), nil
}

func requireAutoCommit(connection *sql.Conn) error {
	var autocommit bool
	err := connection.Raw(func(driverConnection any) error {
		sqliteConnection, ok := driverConnection.(*sqlite3.SQLiteConn)
		if !ok {
			return fmt.Errorf("unexpected SQLite driver connection %T", driverConnection)
		}
		autocommit = sqliteConnection.AutoCommit()
		return nil
	})
	if err != nil {
		return fmt.Errorf("inspect SQLite autocommit state: %w", err)
	}
	if !autocommit {
		return fmt.Errorf("SQLite connection has an active transaction")
	}
	return nil
}
