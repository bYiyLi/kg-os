package lithograph

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
)

type MergeSession struct {
	Session      string
	TargetBranch string
	Ours         string
	Theirs       string
	Revision     int64
	Status       string
	Unresolved   int64
}

type MergeSessionSummary struct {
	Session      string
	TargetBranch string
	Ours         string
	Theirs       string
	Revision     int64
	CreatedAt    int64
	Cursor       *string
}

type MergeConflict struct {
	ConflictID string
	Slot       string
	Base       json.RawMessage
	Ours       json.RawMessage
	Theirs     json.RawMessage
	Resolution json.RawMessage
	Cursor     *string
}

type MergeConflictPage struct {
	Session      string
	TargetBranch string
	Ours         string
	Theirs       string
	Revision     int64
	Items        []MergeConflict
	Cursor       *string
}

type MergeResolution struct {
	ConflictID string
	Choice     string
	Value      json.RawMessage
	HasValue   bool
}

type MergeFinalizeResult struct {
	Status string
	Commit string
}

func (host *Host) StartMerge(
	ctx context.Context,
	branch string,
	source string,
	expectedHead string,
) (MergeSession, error) {
	if branch == "" || !validCommitRef(source) || !validCommitRef(expectedHead) {
		return MergeSession{}, fmt.Errorf("merge branch, source commit, and expected head are required")
	}
	result, err := host.versionWrite(
		ctx,
		"CALL lithograph.merge.start($source, $expectedHead)",
		map[string]any{"source": source, "expectedHead": expectedHead},
		map[string]any{"branch": branch},
	)
	if err != nil {
		return MergeSession{}, err
	}
	return decodeMergeSession(result)
}

func (host *Host) GetMerge(ctx context.Context, session string) (MergeSession, error) {
	if session == "" {
		return MergeSession{}, fmt.Errorf("merge session is required")
	}
	result, err := host.QueryMetadata(
		ctx,
		"CALL lithograph.merge.get($session)",
		map[string]any{"session": session},
	)
	if err != nil {
		return MergeSession{}, err
	}
	return decodeMergeSession(result)
}

func (host *Host) ListMerges(
	ctx context.Context,
	limit int,
	cursor *string,
) ([]MergeSessionSummary, error) {
	if limit < 1 {
		return nil, fmt.Errorf("merge list limit must be positive")
	}
	cypher := "CALL lithograph.merge.list($limit)"
	params := map[string]any{"limit": limit}
	if cursor != nil {
		cypher = "CALL lithograph.merge.list($limit, $cursor)"
		params["cursor"] = *cursor
	}
	result, err := host.QueryMetadata(ctx, cypher, params)
	if err != nil {
		return nil, err
	}
	return decodeMergeSessionList(result)
}

// MergeConflicts reads the Session metadata and the requested conflict page
// under one SQLite read transaction. This preserves the exact revision even
// when the conflict page is empty.
func (host *Host) MergeConflicts(
	ctx context.Context,
	session string,
	limit int,
	cursor *string,
) (MergeConflictPage, error) {
	if session == "" || limit < 1 {
		return MergeConflictPage{}, fmt.Errorf("merge session and positive conflict limit are required")
	}
	operationCtx, done, err := host.operationContext(ctx)
	if err != nil {
		return MergeConflictPage{}, err
	}
	defer done()
	connection, err := host.acquire(operationCtx, host.readDB)
	if err != nil {
		return MergeConflictPage{}, err
	}
	defer connection.Close()
	if err := requireAutoCommit(connection); err != nil {
		discardConnection(connection)
		return MergeConflictPage{}, err
	}
	if _, err := connection.ExecContext(operationCtx, "BEGIN"); err != nil {
		return MergeConflictPage{}, fmt.Errorf("begin merge conflict read snapshot: %w", err)
	}
	active := true
	defer func() {
		if active {
			if _, rollbackErr := connection.ExecContext(context.WithoutCancel(operationCtx), "ROLLBACK"); rollbackErr != nil {
				discardConnection(connection)
			}
		}
	}()

	metadataResult, err := executeRaw(
		operationCtx,
		connection,
		"CALL lithograph.merge.get($session)",
		map[string]any{"session": session},
		nil,
	)
	if err != nil {
		return MergeConflictPage{}, err
	}
	metadata, err := decodeMergeSession(metadataResult)
	if err != nil {
		return MergeConflictPage{}, err
	}

	cypher := "CALL lithograph.merge.conflicts($session, $limit)"
	params := map[string]any{"session": session, "limit": limit}
	if cursor != nil {
		cypher = "CALL lithograph.merge.conflicts($session, $limit, $cursor)"
		params["cursor"] = *cursor
	}
	conflictResult, err := executeRaw(operationCtx, connection, cypher, params, nil)
	if err != nil {
		return MergeConflictPage{}, err
	}
	page, err := decodeMergeConflictPage(conflictResult, metadata.Session, metadata.Revision)
	if err != nil {
		return MergeConflictPage{}, err
	}
	page.TargetBranch = metadata.TargetBranch
	page.Ours = metadata.Ours
	page.Theirs = metadata.Theirs
	if _, err := connection.ExecContext(operationCtx, "COMMIT"); err != nil {
		return MergeConflictPage{}, fmt.Errorf("commit merge conflict read snapshot: %w", err)
	}
	active = false
	return page, nil
}

func (host *Host) ResolveMerge(
	ctx context.Context,
	session string,
	expectedRevision int64,
	resolutions []MergeResolution,
) (MergeSession, error) {
	if session == "" || expectedRevision < 1 {
		return MergeSession{}, fmt.Errorf("merge session and positive expected revision are required")
	}
	native := make([]map[string]any, 0, len(resolutions))
	for _, resolution := range resolutions {
		if resolution.ConflictID == "" || resolution.Choice == "" {
			return MergeSession{}, fmt.Errorf("merge resolution conflict id and choice are required")
		}
		item := map[string]any{
			"conflictId": resolution.ConflictID,
			"choice":     resolution.Choice,
		}
		if resolution.HasValue {
			if len(resolution.Value) == 0 || !json.Valid(resolution.Value) {
				return MergeSession{}, fmt.Errorf("merge resolution value must be valid JSON")
			}
			item["value"] = json.RawMessage(append([]byte(nil), resolution.Value...))
		}
		native = append(native, item)
	}
	result, err := host.versionWrite(
		ctx,
		"CALL lithograph.merge.resolve($session, $expectedRevision, $resolutions)",
		map[string]any{
			"session":          session,
			"expectedRevision": expectedRevision,
			"resolutions":      native,
		},
		nil,
	)
	if err != nil {
		return MergeSession{}, err
	}
	return decodeMergeResolveResult(result, session)
}

func (host *Host) FinalizeMerge(
	ctx context.Context,
	session string,
	expectedRevision int64,
	author *string,
	message *string,
) (MergeFinalizeResult, error) {
	if session == "" || expectedRevision < 1 {
		return MergeFinalizeResult{}, fmt.Errorf("merge session and positive expected revision are required")
	}
	result, err := host.versionWrite(
		ctx,
		"CALL lithograph.merge.finalize($session, $expectedRevision)",
		map[string]any{"session": session, "expectedRevision": expectedRevision},
		executionOptions(author, message),
	)
	if err != nil {
		return MergeFinalizeResult{}, err
	}
	return decodeMergeFinalizeResult(result)
}

func (host *Host) AbortMerge(ctx context.Context, session string, expectedRevision int64) (string, error) {
	if session == "" || expectedRevision < 1 {
		return "", fmt.Errorf("merge session and positive expected revision are required")
	}
	result, err := host.versionWrite(
		ctx,
		"CALL lithograph.merge.abort($session, $expectedRevision)",
		map[string]any{"session": session, "expectedRevision": expectedRevision},
		nil,
	)
	if err != nil {
		return "", err
	}
	if len(result.Rows) != 1 {
		return "", fmt.Errorf("merge.abort returned %d rows, want 1", len(result.Rows))
	}
	actual, err := stringCell(result, 0, "session")
	if err != nil {
		return "", err
	}
	if actual == "" || actual != session {
		return "", fmt.Errorf("merge.abort returned unexpected session")
	}
	return actual, nil
}

func (host *Host) QueryMergeCandidate(
	ctx context.Context,
	session string,
	revision int64,
	cypher string,
) (Result, error) {
	if session == "" || revision < 1 || cypher == "" {
		return Result{}, fmt.Errorf("merge candidate session, positive revision, and Cypher are required")
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
	result, err := executeRaw(
		operationCtx,
		connection,
		cypher,
		nil,
		map[string]any{
			"mergeSession": map[string]any{"id": session, "revision": revision},
		},
	)
	if err != nil {
		return Result{}, fmt.Errorf("execute merge candidate query: %w", err)
	}
	return result, nil
}

func decodeMergeSession(result Result) (MergeSession, error) {
	if len(result.Rows) != 1 {
		return MergeSession{}, fmt.Errorf("merge session operation returned %d rows, want 1", len(result.Rows))
	}
	session, err := stringCell(result, 0, "session")
	if err != nil || session == "" {
		return MergeSession{}, fmt.Errorf("merge session operation returned invalid session")
	}
	branch, err := stringCell(result, 0, "targetBranch")
	if err != nil || branch == "" {
		return MergeSession{}, fmt.Errorf("merge session operation returned invalid target Branch")
	}
	ours, err := stringCell(result, 0, "ours")
	if err != nil || !validCommitRef(ours) {
		return MergeSession{}, fmt.Errorf("merge session operation returned invalid ours Commit")
	}
	theirs, err := stringCell(result, 0, "theirs")
	if err != nil || !validCommitRef(theirs) {
		return MergeSession{}, fmt.Errorf("merge session operation returned invalid theirs Commit")
	}
	revision, err := int64Cell(result, 0, "revision")
	if err != nil || revision < 1 {
		return MergeSession{}, fmt.Errorf("merge session operation returned invalid revision")
	}
	status, err := stringCell(result, 0, "status")
	if err != nil || !validMergeSessionStatus(status) {
		return MergeSession{}, fmt.Errorf("merge session operation returned invalid status")
	}
	unresolved, err := int64Cell(result, 0, "unresolved")
	if err != nil || unresolved < 0 {
		return MergeSession{}, fmt.Errorf("merge session operation returned invalid unresolved count")
	}
	return MergeSession{
		Session: session, TargetBranch: branch, Ours: ours, Theirs: theirs,
		Revision: revision, Status: status, Unresolved: unresolved,
	}, nil
}

func decodeMergeSessionList(result Result) ([]MergeSessionSummary, error) {
	items := make([]MergeSessionSummary, 0, len(result.Rows))
	for row := range result.Rows {
		session, err := stringCell(result, row, "session")
		if err != nil || session == "" {
			return nil, fmt.Errorf("merge.list returned invalid session")
		}
		branch, err := stringCell(result, row, "targetBranch")
		if err != nil || branch == "" {
			return nil, fmt.Errorf("merge.list returned invalid target Branch")
		}
		ours, err := stringCell(result, row, "ours")
		if err != nil || !validCommitRef(ours) {
			return nil, fmt.Errorf("merge.list returned invalid ours Commit")
		}
		theirs, err := stringCell(result, row, "theirs")
		if err != nil || !validCommitRef(theirs) {
			return nil, fmt.Errorf("merge.list returned invalid theirs Commit")
		}
		revision, err := int64Cell(result, row, "revision")
		if err != nil || revision < 1 {
			return nil, fmt.Errorf("merge.list returned invalid revision")
		}
		createdAt, err := int64Cell(result, row, "createdAt")
		if err != nil || createdAt < 0 {
			return nil, fmt.Errorf("merge.list returned invalid createdAt")
		}
		cursor, err := optionalStringCell(result, row, "cursor")
		if err != nil {
			return nil, err
		}
		if cursor != nil && *cursor == "" {
			return nil, fmt.Errorf("merge.list returned empty cursor")
		}
		items = append(items, MergeSessionSummary{
			Session: session, TargetBranch: branch, Ours: ours, Theirs: theirs,
			Revision: revision, CreatedAt: createdAt, Cursor: cursor,
		})
	}
	return items, nil
}

func decodeMergeConflictPage(
	result Result,
	session string,
	revision int64,
) (MergeConflictPage, error) {
	page := MergeConflictPage{Session: session, Revision: revision, Items: make([]MergeConflict, 0, len(result.Rows))}
	for row := range result.Rows {
		actualSession, err := stringCell(result, row, "session")
		if err != nil || actualSession != session {
			return MergeConflictPage{}, fmt.Errorf("merge.conflicts returned unexpected session")
		}
		actualRevision, err := int64Cell(result, row, "revision")
		if err != nil || actualRevision != revision {
			return MergeConflictPage{}, fmt.Errorf("merge.conflicts returned unexpected revision")
		}
		conflictID, err := stringCell(result, row, "conflictId")
		if err != nil || conflictID == "" {
			return MergeConflictPage{}, fmt.Errorf("merge.conflicts returned invalid conflictId")
		}
		slot, err := stringCell(result, row, "slot")
		if err != nil || slot == "" {
			return MergeConflictPage{}, fmt.Errorf("merge.conflicts returned invalid slot")
		}
		base, err := validRawCell(result, row, "base")
		if err != nil {
			return MergeConflictPage{}, err
		}
		ours, err := validRawCell(result, row, "ours")
		if err != nil {
			return MergeConflictPage{}, err
		}
		theirs, err := validRawCell(result, row, "theirs")
		if err != nil {
			return MergeConflictPage{}, err
		}
		resolution, err := validRawCell(result, row, "resolution")
		if err != nil {
			return MergeConflictPage{}, err
		}
		cursor, err := optionalStringCell(result, row, "cursor")
		if err != nil {
			return MergeConflictPage{}, err
		}
		if cursor != nil && *cursor == "" {
			return MergeConflictPage{}, fmt.Errorf("merge.conflicts returned empty cursor")
		}
		page.Cursor = cursor
		page.Items = append(page.Items, MergeConflict{
			ConflictID: conflictID, Slot: slot, Base: base, Ours: ours, Theirs: theirs,
			Resolution: resolution, Cursor: cursor,
		})
	}
	return page, nil
}

func decodeMergeResolveResult(result Result, session string) (MergeSession, error) {
	if len(result.Rows) != 1 {
		return MergeSession{}, fmt.Errorf("merge.resolve returned %d rows, want 1", len(result.Rows))
	}
	actualSession, err := stringCell(result, 0, "session")
	if err != nil || actualSession != session {
		return MergeSession{}, fmt.Errorf("merge.resolve returned unexpected session")
	}
	revision, err := int64Cell(result, 0, "revision")
	if err != nil || revision < 1 {
		return MergeSession{}, fmt.Errorf("merge.resolve returned invalid revision")
	}
	status, err := stringCell(result, 0, "status")
	if err != nil || !validMergeSessionStatus(status) {
		return MergeSession{}, fmt.Errorf("merge.resolve returned invalid status")
	}
	unresolved, err := int64Cell(result, 0, "unresolved")
	if err != nil || unresolved < 0 {
		return MergeSession{}, fmt.Errorf("merge.resolve returned invalid unresolved count")
	}
	return MergeSession{Session: session, Revision: revision, Status: status, Unresolved: unresolved}, nil
}

func decodeMergeFinalizeResult(result Result) (MergeFinalizeResult, error) {
	if len(result.Rows) != 1 {
		return MergeFinalizeResult{}, fmt.Errorf("merge.finalize returned %d rows, want 1", len(result.Rows))
	}
	status, err := stringCell(result, 0, "status")
	if err != nil || (status != "up_to_date" && status != "fast_forward" && status != "merged") {
		return MergeFinalizeResult{}, fmt.Errorf("merge.finalize returned invalid status")
	}
	commit, err := stringCell(result, 0, "commit")
	if err != nil || !validCommitRef(commit) {
		return MergeFinalizeResult{}, fmt.Errorf("merge.finalize returned invalid commit")
	}
	return MergeFinalizeResult{Status: status, Commit: commit}, nil
}

func validMergeSessionStatus(status string) bool {
	return status == "up_to_date" || status == "fast_forward" || status == "conflicted" || status == "ready"
}

func validRawCell(result Result, row int, column string) (json.RawMessage, error) {
	raw, err := rawCell(result, row, column)
	if err != nil {
		return nil, err
	}
	if !json.Valid(raw) || len(bytes.TrimSpace(raw)) == 0 {
		return nil, fmt.Errorf("lithograph result has invalid JSON in %q", column)
	}
	return raw, nil
}
