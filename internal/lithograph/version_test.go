package lithograph

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestVersionResultDecoders(t *testing.T) {
	t.Parallel()
	commitA := "commit/" + strings.Repeat("a", 64)
	commitB := "commit/" + strings.Repeat("b", 64)
	result := Result{
		Columns: []string{"commit", "parents", "author", "message", "committedAt", "hasData", "data"},
		Rows: [][]json.RawMessage{{
			rawJSON(t, commitB),
			rawJSON(t, []string{commitA}),
			rawJSON(t, "agent"),
			rawJSON(t, nil),
			rawJSON(t, int64(42)),
			rawJSON(t, true),
			json.RawMessage("{\"note\":\"x\"}"),
		}},
	}
	commit, err := decodeCommitResult(result)
	if err != nil || commit.Commit != commitB || len(commit.Parents) != 1 || commit.Parents[0] != commitA ||
		commit.Author == nil || *commit.Author != "agent" || commit.Message != nil ||
		commit.CommittedAt != 42 || !commit.HasData || string(commit.Data) != "{\"note\":\"x\"}" {
		t.Fatalf("commit = %#v err=%v", commit, err)
	}

	noData := result
	noData.Rows = [][]json.RawMessage{append([]json.RawMessage(nil), result.Rows[0]...)}
	noData.Rows[0][5] = rawJSON(t, false)
	noData.Rows[0][6] = json.RawMessage("null")
	commit, err = decodeCommitResult(noData)
	if err != nil || commit.HasData || commit.Data != nil {
		t.Fatalf("no-data commit = %#v err=%v", commit, err)
	}

	refs, err := decodeRefList(Result{
		Columns: []string{"name", "commit"},
		Rows: [][]json.RawMessage{
			{rawJSON(t, "main"), rawJSON(t, commitA)},
			{rawJSON(t, "side"), rawJSON(t, commitB)},
		},
	})
	if err != nil || len(refs) != 2 || refs[1].Name != "side" || refs[1].Commit != commitB {
		t.Fatalf("refs = %#v err=%v", refs, err)
	}

	log, err := decodeLogResult(Result{
		Columns: []string{"commit", "parents", "author", "message", "committedAt", "cursor"},
		Rows: [][]json.RawMessage{{
			rawJSON(t, commitB), rawJSON(t, []string{commitA}), rawJSON(t, nil),
			rawJSON(t, "message"), rawJSON(t, int64(7)), rawJSON(t, "next"),
		}},
	})
	if err != nil || len(log) != 1 || log[0].Commit != commitB || log[0].Cursor == nil || *log[0].Cursor != "next" {
		t.Fatalf("log = %#v err=%v", log, err)
	}
}

func TestVersionResultDecodersFailClosed(t *testing.T) {
	t.Parallel()
	commit := "commit/" + strings.Repeat("a", 64)
	for _, result := range []Result{
		{},
		{Columns: []string{"commit"}, Rows: [][]json.RawMessage{{rawJSON(t, "bad")}}},
		{Columns: []string{"commit", "parents"}, Rows: [][]json.RawMessage{{rawJSON(t, commit), rawJSON(t, []string{"bad"})}}},
	} {
		if _, err := decodeCommitResult(result); err == nil {
			t.Fatalf("invalid commit result was accepted: %#v", result)
		}
	}
	if _, err := decodeRefList(Result{
		Columns: []string{"name", "commit"},
		Rows:    [][]json.RawMessage{{rawJSON(t, ""), rawJSON(t, commit)}},
	}); err == nil {
		t.Fatal("empty ref name was accepted")
	}
	if _, err := decodeLogResult(Result{
		Columns: []string{"commit", "parents"},
		Rows:    [][]json.RawMessage{{rawJSON(t, "bad"), rawJSON(t, []string{})}},
	}); err == nil {
		t.Fatal("invalid log commit was accepted")
	}
	if _, err := rawCell(Result{}, 0, "missing"); err == nil {
		t.Fatal("missing raw cell was accepted")
	}
	if _, err := stringListCell(Result{Columns: []string{"v"}, Rows: [][]json.RawMessage{{json.RawMessage("1")}}}, 0, "v"); err == nil {
		t.Fatal("non-list cell was accepted")
	}
	if _, err := optionalStringCell(Result{Columns: []string{"v"}, Rows: [][]json.RawMessage{{json.RawMessage("1")}}}, 0, "v"); err == nil {
		t.Fatal("non-string optional cell was accepted")
	}
	if _, err := boolCell(Result{Columns: []string{"v"}, Rows: [][]json.RawMessage{{json.RawMessage("1")}}}, 0, "v"); err == nil {
		t.Fatal("non-bool cell was accepted")
	}
	if _, err := int64Cell(Result{Columns: []string{"v"}, Rows: [][]json.RawMessage{{json.RawMessage("\"x\"")}}}, 0, "v"); err == nil {
		t.Fatal("non-int cell was accepted")
	}
	for _, value := range []string{"", "commit/abc", "commit/" + strings.Repeat("A", 64), "branch/" + strings.Repeat("a", 64)} {
		if validCommitRef(value) {
			t.Fatalf("invalid commit ref %q was accepted", value)
		}
	}
	if !validCommitRef("commit/" + strings.Repeat("f", 64)) {
		t.Fatal("valid commit ref was rejected")
	}
}

func TestVersionCommitAndLogFieldFailures(t *testing.T) {
	t.Parallel()
	commit := "commit/" + strings.Repeat("a", 64)
	parent := "commit/" + strings.Repeat("b", 64)
	validCommit := Result{
		Columns: []string{"commit", "parents", "author", "message", "committedAt", "hasData", "data"},
		Rows: [][]json.RawMessage{{
			rawJSON(t, commit), rawJSON(t, []string{parent}), rawJSON(t, nil), rawJSON(t, nil),
			rawJSON(t, int64(1)), rawJSON(t, true), rawJSON(t, map[string]any{"x": 1}),
		}},
	}
	for _, mutate := range []func(*Result){
		func(result *Result) { result.Rows[0][1] = json.RawMessage("1") },
		func(result *Result) { result.Rows[0][2] = json.RawMessage("1") },
		func(result *Result) { result.Rows[0][3] = json.RawMessage("1") },
		func(result *Result) { result.Rows[0][4] = json.RawMessage("\"bad\"") },
		func(result *Result) { result.Rows[0][5] = json.RawMessage("1") },
		func(result *Result) { result.Rows[0] = result.Rows[0][:6] },
	} {
		result := Result{Columns: append([]string(nil), validCommit.Columns...)}
		result.Rows = [][]json.RawMessage{append([]json.RawMessage(nil), validCommit.Rows[0]...)}
		mutate(&result)
		if _, err := decodeCommitResult(result); err == nil {
			t.Fatalf("invalid commit field result was accepted: %#v", result)
		}
	}

	validLog := Result{
		Columns: []string{"commit", "parents", "author", "message", "committedAt", "cursor"},
		Rows: [][]json.RawMessage{{
			rawJSON(t, commit), rawJSON(t, []string{parent}), rawJSON(t, nil),
			rawJSON(t, nil), rawJSON(t, int64(1)), rawJSON(t, nil),
		}},
	}
	for _, mutate := range []func(*Result){
		func(result *Result) { result.Rows[0][1] = json.RawMessage("1") },
		func(result *Result) { result.Rows[0][1] = rawJSON(t, []string{"bad"}) },
		func(result *Result) { result.Rows[0][2] = json.RawMessage("1") },
		func(result *Result) { result.Rows[0][3] = json.RawMessage("1") },
		func(result *Result) { result.Rows[0][4] = json.RawMessage("\"bad\"") },
		func(result *Result) { result.Rows[0][5] = json.RawMessage("1") },
	} {
		result := Result{Columns: append([]string(nil), validLog.Columns...)}
		result.Rows = [][]json.RawMessage{append([]json.RawMessage(nil), validLog.Rows[0]...)}
		mutate(&result)
		if _, err := decodeLogResult(result); err == nil {
			t.Fatalf("invalid log field result was accepted: %#v", result)
		}
	}

	if _, err := decodeRefList(Result{
		Columns: []string{"commit"},
		Rows:    [][]json.RawMessage{{rawJSON(t, commit)}},
	}); err == nil {
		t.Fatal("ref list without name column was accepted")
	}
	if _, err := decodeRefList(Result{
		Columns: []string{"name", "commit"},
		Rows:    [][]json.RawMessage{{rawJSON(t, "main"), rawJSON(t, "bad")}},
	}); err == nil {
		t.Fatal("ref list with invalid commit was accepted")
	}
}

func TestVersionDiffEnvelopeFailsClosed(t *testing.T) {
	t.Parallel()
	before := "commit/" + strings.Repeat("a", 64)
	after := "commit/" + strings.Repeat("b", 64)
	cases := []Result{
		{Columns: []string{"patch"}, Rows: nil},
		{Columns: []string{"other"}, Rows: [][]json.RawMessage{{rawJSON(t, "x")}}},
		{Columns: []string{"patch"}, Rows: [][]json.RawMessage{{json.RawMessage("\"not-a-patch\"")}}},
		{Columns: []string{"patch"}, Rows: [][]json.RawMessage{{rawJSON(t, Patch{
			Format: 2, DatabaseID: "db", From: before, To: after, Operations: []json.RawMessage{},
		})}}},
	}
	for _, result := range cases {
		result := result
		host := scriptedVersionReadHost(t, func(cypher string) (Result, bool) {
			if cypher != "CALL lithograph.diff($before, $after)" {
				return Result{}, false
			}
			return result, true
		})
		if _, err := host.Diff(context.Background(), before, after); err == nil {
			t.Fatalf("invalid Diff result was accepted: %#v", result)
		}
	}
}

func rawJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	return body
}

func TestVersionReadAdapterPublicMethods(t *testing.T) {
	t.Parallel()
	commitA := "commit/" + strings.Repeat("a", 64)
	commitB := "commit/" + strings.Repeat("b", 64)
	patch := Patch{
		Format: 1, DatabaseID: "db-id", From: commitA, To: commitB,
		Operations: []json.RawMessage{},
	}
	responses := map[string]Result{
		"CALL lithograph.commit.get($ref)": {
			Columns: []string{"commit", "parents", "author", "message", "committedAt", "hasData", "data"},
			Rows: [][]json.RawMessage{{
				rawJSON(t, commitB), rawJSON(t, []string{commitA}), rawJSON(t, nil), rawJSON(t, nil),
				rawJSON(t, int64(10)), rawJSON(t, false), rawJSON(t, nil),
			}},
		},
		"CALL lithograph.branch.list()": {
			Columns: []string{"name", "commit"},
			Rows:    [][]json.RawMessage{{rawJSON(t, "main"), rawJSON(t, commitB)}},
		},
		"CALL lithograph.tag.list()": {
			Columns: []string{"name", "commit"},
			Rows:    [][]json.RawMessage{{rawJSON(t, "release"), rawJSON(t, commitA)}},
		},
		"CALL lithograph.log($root, $limit)": {
			Columns: []string{"commit", "parents", "author", "message", "committedAt", "cursor"},
			Rows: [][]json.RawMessage{{
				rawJSON(t, commitB), rawJSON(t, []string{commitA}), rawJSON(t, nil),
				rawJSON(t, nil), rawJSON(t, int64(10)), rawJSON(t, "next"),
			}},
		},
		"CALL lithograph.log($root, $limit, $cursor)": {
			Columns: []string{"commit", "parents", "author", "message", "committedAt", "cursor"},
			Rows: [][]json.RawMessage{{
				rawJSON(t, commitA), rawJSON(t, []string{}), rawJSON(t, nil),
				rawJSON(t, nil), rawJSON(t, int64(1)), rawJSON(t, nil),
			}},
		},
		"CALL lithograph.diff($before, $after)": {
			Columns: []string{"patch"},
			Rows:    [][]json.RawMessage{{rawJSON(t, patch)}},
		},
	}
	host := scriptedVersionReadHost(t, func(cypher string) (Result, bool) {
		result, ok := responses[cypher]
		return result, ok
	})
	ctx := context.Background()
	commit, err := host.GetCommit(ctx, commitB)
	if err != nil || commit.Commit != commitB || len(commit.Parents) != 1 || commit.Parents[0] != commitA {
		t.Fatalf("GetCommit = %#v err=%v", commit, err)
	}
	branches, err := host.ListBranches(ctx)
	if err != nil || len(branches) != 1 || branches[0].Name != "main" {
		t.Fatalf("ListBranches = %#v err=%v", branches, err)
	}
	tags, err := host.ListTags(ctx)
	if err != nil || len(tags) != 1 || tags[0].Name != "release" {
		t.Fatalf("ListTags = %#v err=%v", tags, err)
	}
	log, err := host.Log(ctx, commitB, 1, nil)
	if err != nil || len(log) != 1 || log[0].Cursor == nil || *log[0].Cursor != "next" {
		t.Fatalf("Log first = %#v err=%v", log, err)
	}
	cursor := "next"
	log, err = host.Log(ctx, commitB, 1, &cursor)
	if err != nil || len(log) != 1 || log[0].Commit != commitA || log[0].Cursor != nil {
		t.Fatalf("Log continuation = %#v err=%v", log, err)
	}
	diff, err := host.Diff(ctx, commitA, commitB)
	if err != nil || diff.From != commitA || diff.To != commitB || diff.DatabaseID != "db-id" {
		t.Fatalf("Diff = %#v err=%v", diff, err)
	}
}

func TestVersionAdapterInputValidation(t *testing.T) {
	t.Parallel()
	host := &Host{}
	if _, err := host.GetCommit(context.Background(), ""); err == nil {
		t.Fatal("empty commit ref was accepted")
	}
	if _, err := host.Log(context.Background(), "", 1, nil); err == nil {
		t.Fatal("empty log root was accepted")
	}
	if _, err := host.Log(context.Background(), "commit/x", 0, nil); err == nil {
		t.Fatal("zero log limit was accepted")
	}
	if _, err := host.Diff(context.Background(), "", "x"); err == nil {
		t.Fatal("empty diff endpoint was accepted")
	}
	if _, err := host.CreateCommit(context.Background(), "", "bad", nil, nil, nil); err == nil {
		t.Fatal("empty commit branch was accepted")
	}
	if _, err := host.CreateCommit(context.Background(), "main", "bad", nil, nil, nil); err == nil {
		t.Fatal("invalid expected parent was accepted")
	}
	if _, err := host.SetCommitData(context.Background(), "bad", json.RawMessage("null")); err == nil {
		t.Fatal("invalid set-data commit was accepted")
	}
	if _, err := host.SetCommitData(context.Background(), "commit/"+strings.Repeat("a", 64), json.RawMessage("{")); err == nil {
		t.Fatal("invalid set-data JSON was accepted")
	}
	if err := host.ClearCommitData(context.Background(), "bad"); err == nil {
		t.Fatal("invalid clear-data commit was accepted")
	}
}

func scriptedVersionReadHost(t *testing.T, resultFor func(string) (Result, bool)) *Host {
	t.Helper()
	name := fmt.Sprintf("kgos-version-read-%d", scriptedDriverSequence.Add(1))
	sql.Register(name, scriptedDriver{query: func(_ string, args []driver.NamedValue) (driver.Rows, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("missing Cypher argument")
		}
		cypher, ok := args[0].Value.(string)
		if !ok {
			return nil, fmt.Errorf("Cypher argument is %T", args[0].Value)
		}
		result, ok := resultFor(cypher)
		if !ok {
			return nil, fmt.Errorf("unexpected Cypher %q", cypher)
		}
		body, err := json.Marshal(result)
		if err != nil {
			return nil, err
		}
		return &scriptedRows{
			columns: []string{"value"},
			values:  [][]driver.Value{{body}},
		}, nil
	}})
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open scripted Version database: %v", err)
	}
	lifetime, cancel := context.WithCancel(context.Background())
	host := &Host{
		readDB: db, writeDB: db, lifetime: lifetime, cancel: cancel,
		transactions: map[*Transaction]struct{}{},
	}
	t.Cleanup(func() {
		cancel()
		_ = db.Close()
	})
	return host
}
