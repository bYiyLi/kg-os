package lithograph

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestMergeResultDecoders(t *testing.T) {
	t.Parallel()
	ours := "commit/" + strings.Repeat("a", 64)
	theirs := "commit/" + strings.Repeat("b", 64)
	session := "merge-session/123"
	status := Result{
		Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "status", "unresolved",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, ours), rawJSON(t, theirs),
			rawJSON(t, int64(2)), rawJSON(t, "conflicted"), rawJSON(t, int64(1)),
		}},
	}
	decoded, err := decodeMergeSession(status)
	if err != nil || decoded.Session != session || decoded.TargetBranch != "main" ||
		decoded.Ours != ours || decoded.Theirs != theirs || decoded.Revision != 2 ||
		decoded.Status != "conflicted" || decoded.Unresolved != 1 {
		t.Fatalf("merge session = %#v err=%v", decoded, err)
	}

	list, err := decodeMergeSessionList(Result{
		Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "createdAt", "cursor",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, ours), rawJSON(t, theirs),
			rawJSON(t, int64(2)), rawJSON(t, int64(7)), rawJSON(t, "next"),
		}},
	})
	if err != nil || len(list) != 1 || list[0].Cursor == nil || *list[0].Cursor != "next" {
		t.Fatalf("merge list = %#v err=%v", list, err)
	}

	page, err := decodeMergeConflictPage(Result{
		Columns: []string{
			"session", "revision", "conflictId", "slot", "base", "ours", "theirs",
			"resolution", "cursor",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, int64(2)), rawJSON(t, "c1"),
			rawJSON(t, "node/1/property/name"), rawJSON(t, "base"), rawJSON(t, "ours"),
			rawJSON(t, "theirs"), rawJSON(t, map[string]any{"choice": "ours"}),
			rawJSON(t, "cursor"),
		}},
	}, session, 2)
	if err != nil || page.Revision != 2 || len(page.Items) != 1 ||
		page.Items[0].ConflictID != "c1" || page.Cursor == nil || *page.Cursor != "cursor" {
		t.Fatalf("conflict page = %#v err=%v", page, err)
	}
	lastPage, err := decodeMergeConflictPage(Result{
		Columns: []string{
			"session", "revision", "conflictId", "slot", "base", "ours", "theirs",
			"resolution", "cursor",
		},
		Rows: [][]json.RawMessage{
			{
				rawJSON(t, session), rawJSON(t, int64(2)), rawJSON(t, "c1"),
				rawJSON(t, "node/1/property/name"), rawJSON(t, "base"), rawJSON(t, "ours"),
				rawJSON(t, "theirs"), rawJSON(t, nil), rawJSON(t, "intermediate"),
			},
			{
				rawJSON(t, session), rawJSON(t, int64(2)), rawJSON(t, "c2"),
				rawJSON(t, "node/2/property/name"), rawJSON(t, "base"), rawJSON(t, "ours"),
				rawJSON(t, "theirs"), rawJSON(t, nil), rawJSON(t, nil),
			},
		},
	}, session, 2)
	if err != nil || len(lastPage.Items) != 2 || lastPage.Cursor != nil {
		t.Fatalf("last conflict page retained intermediate cursor: %#v err=%v", lastPage, err)
	}

	resolved, err := decodeMergeResolveResult(Result{
		Columns: []string{"session", "revision", "status", "unresolved"},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, int64(3)), rawJSON(t, "ready"), rawJSON(t, int64(0)),
		}},
	}, session)
	if err != nil || resolved.Revision != 3 || resolved.Status != "ready" || resolved.Unresolved != 0 {
		t.Fatalf("resolve result = %#v err=%v", resolved, err)
	}

	for _, result := range []Result{
		{Columns: []string{"status", "commit"}, Rows: [][]json.RawMessage{{
			rawJSON(t, "up_to_date"), rawJSON(t, ours),
		}}},
		{Columns: []string{"status", "commit"}, Rows: [][]json.RawMessage{{
			rawJSON(t, "fast_forward"), rawJSON(t, theirs),
		}}},
		{Columns: []string{"status", "commit"}, Rows: [][]json.RawMessage{{
			rawJSON(t, "merged"), rawJSON(t, ours),
		}}},
	} {
		if _, err := decodeMergeFinalizeResult(result); err != nil {
			t.Fatalf("valid finalize result rejected: %v", err)
		}
	}
}

func TestMergeResultDecodersFailClosed(t *testing.T) {
	t.Parallel()
	commit := "commit/" + strings.Repeat("a", 64)
	session := "merge-session/x"
	for _, result := range []Result{
		{},
		{Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "status", "unresolved",
		}, Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, "bad"), rawJSON(t, commit),
			rawJSON(t, int64(1)), rawJSON(t, "ready"), rawJSON(t, int64(0)),
		}}},
		{Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "status", "unresolved",
		}, Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, commit), rawJSON(t, commit),
			rawJSON(t, int64(0)), rawJSON(t, "ready"), rawJSON(t, int64(0)),
		}}},
		{Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "status", "unresolved",
		}, Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, commit), rawJSON(t, commit),
			rawJSON(t, int64(1)), rawJSON(t, "unknown"), rawJSON(t, int64(0)),
		}}},
	} {
		if _, err := decodeMergeSession(result); err == nil {
			t.Fatalf("invalid merge session result accepted: %#v", result)
		}
	}
	if _, err := decodeMergeConflictPage(Result{
		Columns: []string{
			"session", "revision", "conflictId", "slot", "base", "ours", "theirs",
			"resolution", "cursor",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, int64(2)), rawJSON(t, ""),
			rawJSON(t, "node/1"), rawJSON(t, nil), rawJSON(t, nil), rawJSON(t, nil),
			rawJSON(t, nil), rawJSON(t, nil),
		}},
	}, session, 2); err == nil {
		t.Fatal("invalid conflict id was accepted")
	}
	if _, err := decodeMergeFinalizeResult(Result{
		Columns: []string{"status", "commit"},
		Rows:    [][]json.RawMessage{{rawJSON(t, "ready"), rawJSON(t, commit)}},
	}); err == nil {
		t.Fatal("invalid finalize status was accepted")
	}
}

func TestMergeAdapterInputValidation(t *testing.T) {
	t.Parallel()
	host := &Host{}
	ctx := context.Background()
	commit := "commit/" + strings.Repeat("a", 64)
	if _, err := host.StartMerge(ctx, "", commit, commit); err == nil {
		t.Fatal("empty merge branch was accepted")
	}
	if _, err := host.StartMerge(ctx, "main", "bad", commit); err == nil {
		t.Fatal("invalid source commit was accepted")
	}
	if _, err := host.GetMerge(ctx, ""); err == nil {
		t.Fatal("empty merge session was accepted")
	}
	if _, err := host.ListMerges(ctx, 0, nil); err == nil {
		t.Fatal("zero merge list limit was accepted")
	}
	if _, err := host.MergeConflicts(ctx, "", 1, nil); err == nil {
		t.Fatal("empty conflict session was accepted")
	}
	if _, err := host.ResolveMerge(ctx, "s", 0, nil); err == nil {
		t.Fatal("zero resolve revision was accepted")
	}
	if _, err := host.ResolveMerge(ctx, "s", 1, []MergeResolution{{
		ConflictID: "c", Choice: "value", HasValue: true, Value: json.RawMessage("{"),
	}}); err == nil {
		t.Fatal("invalid resolution JSON was accepted")
	}
	if _, err := host.FinalizeMerge(ctx, "s", 0, nil, nil); err == nil {
		t.Fatal("zero finalize revision was accepted")
	}
	if _, err := host.AbortMerge(ctx, "s", 0); err == nil {
		t.Fatal("zero abort revision was accepted")
	}
	if _, err := host.QueryMergeCandidate(ctx, "", 1, "RETURN 1"); err == nil {
		t.Fatal("empty candidate session was accepted")
	}
	if _, err := host.QueryMergeCandidate(ctx, "s", 0, "RETURN 1"); err == nil {
		t.Fatal("zero candidate revision was accepted")
	}
	if _, err := host.QueryMergeCandidate(ctx, "s", 1, ""); err == nil {
		t.Fatal("empty candidate Cypher was accepted")
	}
}

func TestMergeDecoderFailureMatrix(t *testing.T) {
	t.Parallel()
	commitA := "commit/" + strings.Repeat("a", 64)
	commitB := "commit/" + strings.Repeat("b", 64)
	session := "merge-session/x"

	validList := Result{
		Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "createdAt", "cursor",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, commitA), rawJSON(t, commitB),
			rawJSON(t, int64(1)), rawJSON(t, int64(1)), rawJSON(t, nil),
		}},
	}
	for name, mutate := range map[string]func(*Result){
		"empty session": func(result *Result) { result.Rows[0][0] = rawJSON(t, "") },
		"empty branch":  func(result *Result) { result.Rows[0][1] = rawJSON(t, "") },
		"bad ours":      func(result *Result) { result.Rows[0][2] = rawJSON(t, "bad") },
		"bad theirs":    func(result *Result) { result.Rows[0][3] = rawJSON(t, "bad") },
		"bad revision":  func(result *Result) { result.Rows[0][4] = rawJSON(t, int64(0)) },
		"bad created":   func(result *Result) { result.Rows[0][5] = rawJSON(t, int64(-1)) },
		"empty cursor":  func(result *Result) { result.Rows[0][6] = rawJSON(t, "") },
	} {
		result := cloneMergeTestResult(validList)
		mutate(&result)
		if _, err := decodeMergeSessionList(result); err == nil {
			t.Fatalf("%s list result was accepted", name)
		}
	}
	if items, err := decodeMergeSessionList(Result{Columns: validList.Columns}); err != nil ||
		len(items) != 0 {
		t.Fatalf("empty merge list = %#v err=%v", items, err)
	}

	validConflict := Result{
		Columns: []string{
			"session", "revision", "conflictId", "slot", "base", "ours", "theirs",
			"resolution", "cursor",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, int64(2)), rawJSON(t, "c"),
			rawJSON(t, "node/1"), rawJSON(t, nil), rawJSON(t, true), rawJSON(t, nil),
			rawJSON(t, nil), rawJSON(t, nil),
		}},
	}
	for name, mutate := range map[string]func(*Result){
		"wrong session":      func(result *Result) { result.Rows[0][0] = rawJSON(t, "other") },
		"wrong revision":     func(result *Result) { result.Rows[0][1] = rawJSON(t, int64(3)) },
		"empty conflict":     func(result *Result) { result.Rows[0][2] = rawJSON(t, "") },
		"empty slot":         func(result *Result) { result.Rows[0][3] = rawJSON(t, "") },
		"invalid base":       func(result *Result) { result.Rows[0][4] = json.RawMessage("{") },
		"invalid ours":       func(result *Result) { result.Rows[0][5] = json.RawMessage("{") },
		"invalid theirs":     func(result *Result) { result.Rows[0][6] = json.RawMessage("{") },
		"invalid resolution": func(result *Result) { result.Rows[0][7] = json.RawMessage("{") },
		"empty cursor":       func(result *Result) { result.Rows[0][8] = rawJSON(t, "") },
	} {
		result := cloneMergeTestResult(validConflict)
		mutate(&result)
		if _, err := decodeMergeConflictPage(result, session, 2); err == nil {
			t.Fatalf("%s conflict result was accepted", name)
		}
	}
	page, err := decodeMergeConflictPage(
		Result{Columns: validConflict.Columns}, session, 2,
	)
	if err != nil || page.Session != session || page.Revision != 2 || len(page.Items) != 0 {
		t.Fatalf("empty conflict page = %#v err=%v", page, err)
	}

	validResolve := Result{
		Columns: []string{"session", "revision", "status", "unresolved"},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, int64(2)), rawJSON(t, "ready"), rawJSON(t, int64(0)),
		}},
	}
	for name, mutate := range map[string]func(*Result){
		"wrong session":  func(result *Result) { result.Rows[0][0] = rawJSON(t, "other") },
		"bad revision":   func(result *Result) { result.Rows[0][1] = rawJSON(t, int64(0)) },
		"bad status":     func(result *Result) { result.Rows[0][2] = rawJSON(t, "bad") },
		"bad unresolved": func(result *Result) { result.Rows[0][3] = rawJSON(t, int64(-1)) },
	} {
		result := cloneMergeTestResult(validResolve)
		mutate(&result)
		if _, err := decodeMergeResolveResult(result, session); err == nil {
			t.Fatalf("%s resolve result was accepted", name)
		}
	}
	if _, err := decodeMergeResolveResult(Result{
		Columns: validResolve.Columns,
		Rows: append(
			cloneMergeTestResult(validResolve).Rows,
			cloneMergeTestResult(validResolve).Rows[0],
		),
	}, session); err == nil {
		t.Fatal("multi-row resolve result was accepted")
	}

	for _, result := range []Result{
		{},
		{
			Columns: []string{"status", "commit"},
			Rows: [][]json.RawMessage{
				{rawJSON(t, "merged"), rawJSON(t, commitA)},
				{rawJSON(t, "merged"), rawJSON(t, commitB)},
			},
		},
		{
			Columns: []string{"status", "commit"},
			Rows:    [][]json.RawMessage{{rawJSON(t, "merged"), rawJSON(t, "bad")}},
		},
	} {
		if _, err := decodeMergeFinalizeResult(result); err == nil {
			t.Fatalf("invalid finalize result accepted: %#v", result)
		}
	}
	if _, err := validRawCell(
		Result{Columns: []string{"v"}, Rows: [][]json.RawMessage{{nil}}}, 0, "v",
	); err == nil {
		t.Fatal("empty raw merge cell was accepted")
	}
	for _, status := range []string{"up_to_date", "fast_forward", "conflicted", "ready"} {
		if !validMergeSessionStatus(status) {
			t.Fatalf("valid Merge Session status %q rejected", status)
		}
	}
	if validMergeSessionStatus("merged") {
		t.Fatal("finalize-only status accepted as Session status")
	}
}

func TestMergeReadAdapterAndWriteConnectionFailurePaths(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ours := "commit/" + strings.Repeat("a", 64)
	theirs := "commit/" + strings.Repeat("b", 64)
	session := "merge-session/read"
	statusResult := Result{
		Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "status", "unresolved",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, ours), rawJSON(t, theirs),
			rawJSON(t, int64(2)), rawJSON(t, "ready"), rawJSON(t, int64(0)),
		}},
	}
	listResult := Result{
		Columns: []string{
			"session", "targetBranch", "ours", "theirs", "revision", "createdAt", "cursor",
		},
		Rows: [][]json.RawMessage{{
			rawJSON(t, session), rawJSON(t, "main"), rawJSON(t, ours), rawJSON(t, theirs),
			rawJSON(t, int64(2)), rawJSON(t, int64(9)), rawJSON(t, nil),
		}},
	}
	candidateResult := Result{
		Columns: []string{"value"},
		Rows:    [][]json.RawMessage{{rawJSON(t, int64(1))}},
	}
	readHost := scriptedVersionReadHost(t, func(cypher string) (Result, bool) {
		switch cypher {
		case "CALL lithograph.merge.get($session)":
			return statusResult, true
		case "CALL lithograph.merge.list($limit)":
			return listResult, true
		case "CALL lithograph.merge.list($limit, $cursor)":
			return listResult, true
		case "RETURN 1 AS value":
			return candidateResult, true
		default:
			return Result{}, false
		}
	})
	got, err := readHost.GetMerge(ctx, session)
	if err != nil || got.Session != session || got.Revision != 2 {
		t.Fatalf("GetMerge = %#v err=%v", got, err)
	}
	listed, err := readHost.ListMerges(ctx, 10, nil)
	if err != nil || len(listed) != 1 || listed[0].Session != session {
		t.Fatalf("ListMerges = %#v err=%v", listed, err)
	}
	cursor := "next"
	listed, err = readHost.ListMerges(ctx, 10, &cursor)
	if err != nil || len(listed) != 1 {
		t.Fatalf("ListMerges cursor = %#v err=%v", listed, err)
	}
	candidate, err := readHost.QueryMergeCandidate(ctx, session, 2, "RETURN 1 AS value")
	if err != nil || len(candidate.Rows) != 1 || string(candidate.Rows[0][0]) != "1" {
		t.Fatalf("QueryMergeCandidate = %#v err=%v", candidate, err)
	}

	// The scripted driver is intentionally not go-sqlite3, so write-oriented
	// methods reach the adapter's autocommit safety check and fail before any
	// procedure can execute. These assertions cover fail-closed connection
	// handling without fabricating a second Merge store.
	writeCases := []struct {
		name string
		call func(*Host) error
	}{
		{
			name: "start",
			call: func(host *Host) error {
				_, err := host.StartMerge(ctx, "main", theirs, ours)
				return err
			},
		},
		{
			name: "resolve",
			call: func(host *Host) error {
				_, err := host.ResolveMerge(ctx, session, 2, []MergeResolution{{
					ConflictID: "c", Choice: "value", HasValue: true,
					Value: json.RawMessage(`{"x":1}`),
				}})
				return err
			},
		},
		{
			name: "finalize",
			call: func(host *Host) error {
				author := "agent"
				message := "merge"
				_, err := host.FinalizeMerge(ctx, session, 2, &author, &message)
				return err
			},
		},
		{
			name: "abort",
			call: func(host *Host) error {
				_, err := host.AbortMerge(ctx, session, 2)
				return err
			},
		},
	}
	for _, test := range writeCases {
		test := test
		t.Run(test.name, func(t *testing.T) {
			host := scriptedVersionReadHost(t, func(string) (Result, bool) {
				return Result{}, false
			})
			if err := test.call(host); err == nil ||
				!strings.Contains(err.Error(), "autocommit") {
				t.Fatalf("%s write safety error = %v", test.name, err)
			}
		})
	}
	conflictHost := scriptedVersionReadHost(t, func(string) (Result, bool) {
		return Result{}, false
	})
	if _, err := conflictHost.MergeConflicts(ctx, session, 10, &cursor); err == nil ||
		!strings.Contains(err.Error(), "autocommit") {
		t.Fatalf("MergeConflicts read-snapshot safety error = %v", err)
	}
}

func cloneMergeTestResult(input Result) Result {
	result := Result{Columns: append([]string(nil), input.Columns...)}
	result.Rows = make([][]json.RawMessage, len(input.Rows))
	for index := range input.Rows {
		result.Rows[index] = append([]json.RawMessage(nil), input.Rows[index]...)
	}
	return result
}
