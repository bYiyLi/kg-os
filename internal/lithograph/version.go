package lithograph

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var ErrBranchHeadMoved = errors.New("branch head moved")

type Commit struct {
	Commit      string
	Parents     []string
	Author      *string
	Message     *string
	CommittedAt int64
	HasData     bool
	Data        json.RawMessage
}

type VersionRef struct {
	Name   string
	Commit string
}

type LogEntry struct {
	Commit      string
	Parents     []string
	Author      *string
	Message     *string
	CommittedAt int64
	Cursor      *string
}

type Patch struct {
	Format     int               `json:"format"`
	DatabaseID string            `json:"databaseId"`
	From       string            `json:"from"`
	To         string            `json:"to"`
	Operations []json.RawMessage `json:"operations"`
}

func (host *Host) GetCommit(ctx context.Context, ref string) (Commit, error) {
	if ref == "" {
		return Commit{}, fmt.Errorf("commit ref is required")
	}
	result, err := host.QueryMetadata(
		ctx,
		"CALL lithograph.commit.get($ref)",
		map[string]any{"ref": ref},
	)
	if err != nil {
		return Commit{}, err
	}
	return decodeCommitResult(result)
}

func (host *Host) ListBranches(ctx context.Context) ([]VersionRef, error) {
	result, err := host.QueryMetadata(ctx, "CALL lithograph.branch.list()", nil)
	if err != nil {
		return nil, err
	}
	return decodeRefList(result)
}

func (host *Host) ListTags(ctx context.Context) ([]VersionRef, error) {
	result, err := host.QueryMetadata(ctx, "CALL lithograph.tag.list()", nil)
	if err != nil {
		return nil, err
	}
	return decodeRefList(result)
}

func (host *Host) Log(ctx context.Context, root string, limit int, cursor *string) ([]LogEntry, error) {
	if root == "" {
		return nil, fmt.Errorf("log root is required")
	}
	if limit < 1 {
		return nil, fmt.Errorf("log limit must be positive")
	}
	cypher := "CALL lithograph.log($root, $limit)"
	params := map[string]any{"root": root, "limit": limit}
	if cursor != nil {
		cypher = "CALL lithograph.log($root, $limit, $cursor)"
		params["cursor"] = *cursor
	}
	result, err := host.QueryMetadata(ctx, cypher, params)
	if err != nil {
		return nil, err
	}
	return decodeLogResult(result)
}

func (host *Host) Diff(ctx context.Context, before, after string) (Patch, error) {
	if before == "" || after == "" {
		return Patch{}, fmt.Errorf("diff before and after are required")
	}
	result, err := host.QueryMetadata(
		ctx,
		"CALL lithograph.diff($before, $after)",
		map[string]any{"before": before, "after": after},
	)
	if err != nil {
		return Patch{}, err
	}
	if len(result.Rows) != 1 {
		return Patch{}, fmt.Errorf("lithograph.diff returned %d rows, want 1", len(result.Rows))
	}
	cell, err := rawCell(result, 0, "patch")
	if err != nil {
		return Patch{}, err
	}
	var patch Patch
	if err := json.Unmarshal(cell, &patch); err != nil {
		return Patch{}, fmt.Errorf("decode Lithograph patch: %w", err)
	}
	if patch.Format != 1 || patch.DatabaseID == "" || !validCommitRef(patch.From) || !validCommitRef(patch.To) || patch.Operations == nil {
		return Patch{}, fmt.Errorf("lithograph diff returned an invalid patch envelope")
	}
	return patch, nil
}

func (host *Host) CreateCommit(
	ctx context.Context,
	branch string,
	expectedParent string,
	data *json.RawMessage,
	author, message *string,
) (string, error) {
	if branch == "" {
		return "", fmt.Errorf("commit branch is required")
	}
	if !validCommitRef(expectedParent) {
		return "", fmt.Errorf("valid expected parent commit is required")
	}
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return "", err
	}
	defer done()
	connection, err := host.acquire(operationCtx, host.writeDB)
	if err != nil {
		return "", err
	}
	defer connection.Close()
	if err := requireAutoCommit(connection); err != nil {
		discardConnection(connection)
		return "", err
	}
	if _, err := connection.ExecContext(operationCtx, "BEGIN IMMEDIATE"); err != nil {
		return "", fmt.Errorf("begin State create writer boundary: %w", err)
	}
	active := true
	defer func() {
		if active {
			if _, rollbackErr := connection.ExecContext(context.WithoutCancel(operationCtx), "ROLLBACK"); rollbackErr != nil {
				discardConnection(connection)
			}
		}
	}()

	parent, err := resolveCommit(operationCtx, connection, "branch/"+branch)
	if err != nil {
		return "", fmt.Errorf("resolve State create branch %q: %w", branch, err)
	}
	if parent != expectedParent {
		return "", fmt.Errorf("%w: branch %q changed from %s to %s", ErrBranchHeadMoved, branch, expectedParent, parent)
	}

	cypher := "CALL lithograph.commit.create()"
	params := map[string]any(nil)
	if data != nil {
		if !json.Valid(*data) {
			return "", fmt.Errorf("commit data is not valid JSON")
		}
		cypher = "CALL lithograph.commit.create($data)"
		params = map[string]any{"data": json.RawMessage(append([]byte(nil), (*data)...))}
	}
	options := executionOptions(author, message)
	options["branch"] = branch
	result, err := executeRaw(operationCtx, connection, cypher, params, options)
	if err != nil {
		return "", fmt.Errorf("create State on branch %q: %w", branch, err)
	}
	if len(result.Rows) != 1 {
		return "", fmt.Errorf("commit.create returned %d rows, want 1", len(result.Rows))
	}
	created, err := stringCell(result, 0, "commit")
	if err != nil {
		return "", err
	}
	if !validCommitRef(created) {
		return "", fmt.Errorf("commit.create returned invalid commit ref %q", created)
	}
	createdMeta, err := executeRaw(
		operationCtx,
		connection,
		"CALL lithograph.commit.get($ref)",
		map[string]any{"ref": created},
		nil,
	)
	if err != nil {
		return "", fmt.Errorf("verify created State: %w", err)
	}
	meta, err := decodeCommitResult(createdMeta)
	if err != nil {
		return "", err
	}
	if len(meta.Parents) != 1 || meta.Parents[0] != parent {
		return "", fmt.Errorf("created State parent mismatch")
	}
	if _, err := connection.ExecContext(operationCtx, "COMMIT"); err != nil {
		return "", fmt.Errorf("commit State create writer boundary: %w", err)
	}
	active = false
	return created, nil
}

func (host *Host) SetCommitData(ctx context.Context, commit string, data json.RawMessage) (json.RawMessage, error) {
	if !validCommitRef(commit) || !json.Valid(data) {
		return nil, fmt.Errorf("valid commit ref and JSON data are required")
	}
	result, err := host.versionWrite(
		ctx,
		"CALL lithograph.commit.data.set($commit, $data)",
		map[string]any{"commit": commit, "data": json.RawMessage(append([]byte(nil), data...))},
		nil,
	)
	if err != nil {
		return nil, err
	}
	if len(result.Rows) != 1 {
		return nil, fmt.Errorf("commit.data.set returned %d rows, want 1", len(result.Rows))
	}
	actual, err := stringCell(result, 0, "commit")
	if err != nil || actual != commit {
		return nil, fmt.Errorf("commit.data.set returned unexpected commit")
	}
	return rawCell(result, 0, "data")
}

func (host *Host) ClearCommitData(ctx context.Context, commit string) error {
	if !validCommitRef(commit) {
		return fmt.Errorf("valid commit ref is required")
	}
	result, err := host.versionWrite(
		ctx,
		"CALL lithograph.commit.data.clear($commit)",
		map[string]any{"commit": commit},
		nil,
	)
	if err != nil {
		return err
	}
	if len(result.Rows) != 1 {
		return fmt.Errorf("commit.data.clear returned %d rows, want 1", len(result.Rows))
	}
	actual, err := stringCell(result, 0, "commit")
	if err != nil || actual != commit {
		return fmt.Errorf("commit.data.clear returned unexpected commit")
	}
	return nil
}

func (host *Host) CreateBranch(ctx context.Context, name, from string) (VersionRef, error) {
	return host.refWrite(ctx, "CALL lithograph.branch.create($name, $from)", map[string]any{"name": name, "from": from}, false)
}

func (host *Host) DeleteBranch(ctx context.Context, name string) (VersionRef, error) {
	return host.refWrite(ctx, "CALL lithograph.branch.delete($name)", map[string]any{"name": name}, true)
}

func (host *Host) CreateTag(ctx context.Context, name, target string) (VersionRef, error) {
	return host.refWrite(ctx, "CALL lithograph.tag.create($name, $target)", map[string]any{"name": name, "target": target}, false)
}

func (host *Host) MoveTag(ctx context.Context, name, target string) (VersionRef, string, error) {
	result, err := host.versionWrite(
		ctx,
		"CALL lithograph.tag.move($name, $target)",
		map[string]any{"name": name, "target": target},
		nil,
	)
	if err != nil {
		return VersionRef{}, "", err
	}
	if len(result.Rows) != 1 {
		return VersionRef{}, "", fmt.Errorf("tag.move returned %d rows, want 1", len(result.Rows))
	}
	actualName, err := stringCell(result, 0, "name")
	if err != nil {
		return VersionRef{}, "", err
	}
	previous, err := stringCell(result, 0, "previousCommit")
	if err != nil {
		return VersionRef{}, "", err
	}
	commit, err := stringCell(result, 0, "commit")
	if err != nil {
		return VersionRef{}, "", err
	}
	if actualName != name || !validCommitRef(previous) || !validCommitRef(commit) {
		return VersionRef{}, "", fmt.Errorf("tag.move returned invalid result")
	}
	return VersionRef{Name: actualName, Commit: commit}, previous, nil
}

func (host *Host) DeleteTag(ctx context.Context, name string) (VersionRef, error) {
	return host.refWrite(ctx, "CALL lithograph.tag.delete($name)", map[string]any{"name": name}, true)
}

func (host *Host) refWrite(ctx context.Context, cypher string, params map[string]any, previous bool) (VersionRef, error) {
	result, err := host.versionWrite(ctx, cypher, params, nil)
	if err != nil {
		return VersionRef{}, err
	}
	if len(result.Rows) != 1 {
		return VersionRef{}, fmt.Errorf("version ref operation returned %d rows, want 1", len(result.Rows))
	}
	name, err := stringCell(result, 0, "name")
	if err != nil {
		return VersionRef{}, err
	}
	column := "commit"
	if previous {
		column = "previousCommit"
	}
	commit, err := stringCell(result, 0, column)
	if err != nil {
		return VersionRef{}, err
	}
	if name == "" || !validCommitRef(commit) {
		return VersionRef{}, fmt.Errorf("version ref operation returned invalid result")
	}
	return VersionRef{Name: name, Commit: commit}, nil
}

func (host *Host) versionWrite(ctx context.Context, cypher string, params map[string]any, options map[string]any) (Result, error) {
	return host.withWriteConnection(ctx, func(operationCtx context.Context, connection *sql.Conn) (Result, error) {
		return executeRaw(operationCtx, connection, cypher, params, options)
	})
}

func decodeCommitResult(result Result) (Commit, error) {
	if len(result.Rows) != 1 {
		return Commit{}, fmt.Errorf("commit.get returned %d rows, want 1", len(result.Rows))
	}
	commit, err := stringCell(result, 0, "commit")
	if err != nil {
		return Commit{}, err
	}
	if !validCommitRef(commit) {
		return Commit{}, fmt.Errorf("commit.get returned invalid commit ref %q", commit)
	}
	parents, err := stringListCell(result, 0, "parents")
	if err != nil {
		return Commit{}, err
	}
	for _, parent := range parents {
		if !validCommitRef(parent) {
			return Commit{}, fmt.Errorf("commit.get returned invalid parent ref")
		}
	}
	author, err := optionalStringCell(result, 0, "author")
	if err != nil {
		return Commit{}, err
	}
	message, err := optionalStringCell(result, 0, "message")
	if err != nil {
		return Commit{}, err
	}
	committedAt, err := int64Cell(result, 0, "committedAt")
	if err != nil {
		return Commit{}, err
	}
	hasData, err := boolCell(result, 0, "hasData")
	if err != nil {
		return Commit{}, err
	}
	data, err := rawCell(result, 0, "data")
	if err != nil {
		return Commit{}, err
	}
	if !hasData {
		data = nil
	}
	return Commit{
		Commit: commit, Parents: parents, Author: author, Message: message,
		CommittedAt: committedAt, HasData: hasData, Data: data,
	}, nil
}

func decodeRefList(result Result) ([]VersionRef, error) {
	items := make([]VersionRef, 0, len(result.Rows))
	for row := range result.Rows {
		name, err := stringCell(result, row, "name")
		if err != nil {
			return nil, err
		}
		commit, err := stringCell(result, row, "commit")
		if err != nil {
			return nil, err
		}
		if name == "" || !validCommitRef(commit) {
			return nil, fmt.Errorf("version ref list returned invalid result")
		}
		items = append(items, VersionRef{Name: name, Commit: commit})
	}
	return items, nil
}

func decodeLogResult(result Result) ([]LogEntry, error) {
	items := make([]LogEntry, 0, len(result.Rows))
	for row := range result.Rows {
		commit, err := stringCell(result, row, "commit")
		if err != nil || !validCommitRef(commit) {
			return nil, fmt.Errorf("lithograph.log returned invalid commit")
		}
		parents, err := stringListCell(result, row, "parents")
		if err != nil {
			return nil, err
		}
		for _, parent := range parents {
			if !validCommitRef(parent) {
				return nil, fmt.Errorf("lithograph.log returned invalid parent")
			}
		}
		author, err := optionalStringCell(result, row, "author")
		if err != nil {
			return nil, err
		}
		message, err := optionalStringCell(result, row, "message")
		if err != nil {
			return nil, err
		}
		committedAt, err := int64Cell(result, row, "committedAt")
		if err != nil {
			return nil, err
		}
		cursor, err := optionalStringCell(result, row, "cursor")
		if err != nil {
			return nil, err
		}
		items = append(items, LogEntry{
			Commit: commit, Parents: parents, Author: author, Message: message,
			CommittedAt: committedAt, Cursor: cursor,
		})
	}
	return items, nil
}

func rawCell(result Result, row int, column string) (json.RawMessage, error) {
	position, ok := columnIndex(result.Columns, column)
	if !ok || row < 0 || row >= len(result.Rows) || position >= len(result.Rows[row]) {
		return nil, fmt.Errorf("lithograph result is missing row %d column %q", row, column)
	}
	return append(json.RawMessage(nil), result.Rows[row][position]...), nil
}

func stringListCell(result Result, row int, column string) ([]string, error) {
	raw, err := rawCell(result, row, column)
	if err != nil {
		return nil, err
	}
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, fmt.Errorf("decode Lithograph %q list: %w", column, err)
	}
	return values, nil
}

func optionalStringCell(result Result, row int, column string) (*string, error) {
	raw, err := rawCell(result, row, column)
	if err != nil {
		return nil, err
	}
	if string(raw) == "null" {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode Lithograph %q value: %w", column, err)
	}
	return &value, nil
}

func boolCell(result Result, row int, column string) (bool, error) {
	raw, err := rawCell(result, row, column)
	if err != nil {
		return false, err
	}
	var value bool
	if err := json.Unmarshal(raw, &value); err != nil {
		return false, fmt.Errorf("decode Lithograph %q value: %w", column, err)
	}
	return value, nil
}

func int64Cell(result Result, row int, column string) (int64, error) {
	raw, err := rawCell(result, row, column)
	if err != nil {
		return 0, err
	}
	var value int64
	if err := json.Unmarshal(raw, &value); err != nil {
		return 0, fmt.Errorf("decode Lithograph %q value: %w", column, err)
	}
	return value, nil
}

func validCommitRef(value string) bool {
	if len(value) != len("commit/")+64 || !strings.HasPrefix(value, "commit/") {
		return false
	}
	for _, char := range value[len("commit/"):] {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}
