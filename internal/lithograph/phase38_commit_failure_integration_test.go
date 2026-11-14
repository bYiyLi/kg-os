//go:build lithograph_smoke

package lithograph

import (
	"context"
	"database/sql/driver"
	"encoding/hex"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"sync"

	sqlite3 "github.com/mattn/go-sqlite3"
	"testing"
	"time"
)

// Exercise failure after real SQLite writes have been staged but before they
// can become a durable graph Commit. The test deliberately uses only a private
// temporary database; invalidating the write connection cannot affect Prod.
func TestPhase38CommitBoundaryFailuresKeepUnpublishedState(t *testing.T) {
	for _, mode := range []string{"deadline_after_stage", "lost_write_connection", "query_only_commit"} {
		t.Run(mode, func(t *testing.T) {
			ctx := context.Background()
			paths := integrationPaths(t)
			extensions := integrationExtensions(t)
			semantic := integrationSemantic(paths, false)
			host, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
			if err != nil {
				t.Fatal(err)
			}
			defer host.Close()
			base, err := host.ResolveState(ctx, "branch/main")
			if err != nil {
				t.Fatal(err)
			}
			tx, err := host.Begin(ctx, map[string]any{"branch": "main", "expectedHead": base})
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Close()
			staged, err := tx.Execute(ctx, "CREATE (a:Phase38Source), (b:Phase38Claim) CREATE (a)-[:PHASE38_EVIDENCES]->(b) RETURN count(a) AS count", nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			if resultInteger(t, staged, 0, "count") != 1 {
				t.Fatal("staged graph did not include expected source")
			}
			stagedRead, err := tx.Execute(ctx, "MATCH (:Phase38Source)-[r:PHASE38_EVIDENCES]->(:Phase38Claim) RETURN count(r) AS count", nil, nil)
			if err != nil || resultInteger(t, stagedRead, 0, "count") != 1 {
				t.Fatalf("edge not staged in transaction: %v", err)
			}
			var commitCtx context.Context = ctx
			if mode == "deadline_after_stage" {
				var cancel context.CancelFunc
				commitCtx, cancel = context.WithDeadline(ctx, time.Now().Add(-time.Second))
				defer cancel()
			} else if mode == "lost_write_connection" {
				// Simulate a broken SQLite connection at the Commit boundary.
				// database/sql must discard it, never reuse a staged transaction.
				err = tx.connection.Raw(func(any) error { return driver.ErrBadConn })
				if !errors.Is(err, driver.ErrBadConn) {
					t.Fatalf("inject failed connection: %v", err)
				}
			} else {
				// Deny writes on this exact SQLite connection after its staged
				// graph has been validated; Commit must not publish it.
				if _, err := tx.connection.ExecContext(ctx, "PRAGMA query_only=ON"); err != nil {
					t.Fatalf("inject query_only before Commit: %v", err)
				}
			}
			if _, err := tx.Commit(commitCtx); err == nil {
				t.Fatal("Commit succeeded despite injected failure")
			} else if mode == "deadline_after_stage" && !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("expected canceled Commit: %v", err)
			} else if mode == "query_only_commit" {
				if !strings.Contains(err.Error(), "LITHOGRAPH_IO_ERROR") ||
					!strings.Contains(err.Error(), "readonly database") {
					t.Fatalf("expected a real SQLite write failure from Commit: %v", err)
				}
				t.Logf("SQLite rejected Commit after the staged graph: %v", err)
			}
			// Explicitly release the uncommitted transaction and verify the
			// currently running Host before testing a fresh process reopen.
			if err := tx.Close(); err != nil {
				t.Fatalf("abort failed Commit transaction: %v", err)
			}
			inProcess, err := host.Query(ctx, QueryRequest{
				At: "branch/main", Cypher: "MATCH (:Phase38Source)-[r:PHASE38_EVIDENCES]->(:Phase38Claim) RETURN count(r) AS count",
			})
			if err != nil || inProcess.State != base || resultInteger(t, inProcess.Result, 0, "count") != 0 {
				t.Fatalf("failed Commit leaked staged data in live Host: state=%s expected=%s err=%v", inProcess.State, base, err)
			}
			if err := host.Close(); err != nil {
				t.Fatalf("close host after failed commit: %v", err)
			}
			reopened, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
			if err != nil {
				t.Fatalf("reopen after failure: %v", err)
			}
			defer reopened.Close()
			current, err := reopened.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (a:Phase38Source)-[r:PHASE38_EVIDENCES]->(b:Phase38Claim) RETURN count(r) AS count"})
			if err != nil {
				t.Fatal(err)
			}
			if current.State != base || resultInteger(t, current.Result, 0, "count") != 0 {
				t.Fatalf("failed commit leaked staged graph: state=%s wanted=%s rows=%+v", current.State, base, current.Result.Rows)
			}
			if _, err := reopened.Execute(ctx, ExecuteRequest{Branch: "main", Cypher: "CREATE (:Phase38Recovered)"}); err != nil {
				t.Fatalf("new writer failed after failed commit: %v", err)
			}
		})
	}
}

// Exercise the cancellation while the SQLite native commit callback is
// executing, not merely before invoking the Lithograph Commit SQL. The
// callback is installed ONLY on a temporary fixture's physical connection;
// returning 1 makes SQLite reject the actual COMMIT deterministically.
func TestPhase38CancelledWhileSQLiteCommitIsExecuting(t *testing.T) {
	t.Run("cancel", func(t *testing.T) { testPhase38NativeCommitRejected(t, false) })
	t.Run("deadline", func(t *testing.T) { testPhase38NativeCommitRejected(t, true) })
}

func testPhase38NativeCommitRejected(t *testing.T, deadline bool) {
	ctx := context.Background()
	paths := integrationPaths(t)
	extensions := integrationExtensions(t)
	semantic := integrationSemantic(paths, false)
	host, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatal(err)
	}
	defer host.Close()
	base, err := host.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := host.Begin(ctx, map[string]any{"branch": "main", "expectedHead": base})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Close()
	if _, err := tx.Execute(ctx, "CREATE (a:Phase38Source), (b:Phase38Claim) CREATE (a)-[:PHASE38_EVIDENCES]->(b)", nil, nil); err != nil {
		t.Fatal(err)
	}

	entered := make(chan struct{})
	proceed := make(chan struct{})
	var enterOnce sync.Once
	err = tx.connection.Raw(func(raw any) error {
		native, ok := raw.(*sqlite3.SQLiteConn)
		if !ok {
			return fmt.Errorf("expected SQLite native connection, got %T", raw)
		}
		native.RegisterCommitHook(func() int {
			enterOnce.Do(func() { close(entered) })
			<-proceed
			return 1
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	var requestCtx context.Context
	var cancel context.CancelFunc
	if deadline {
		requestCtx, cancel = context.WithTimeout(ctx, 4*time.Second)
	} else {
		requestCtx, cancel = context.WithCancel(ctx)
	}
	defer cancel()
	done := make(chan error, 1)
	go func() { _, commitErr := tx.Commit(requestCtx); done <- commitErr }()
	select {
	case <-entered:
		if deadline {
			select {
			case <-requestCtx.Done():
				if !errors.Is(requestCtx.Err(), context.DeadlineExceeded) {
					close(proceed)
					t.Fatalf("unexpected native commit deadline result: %v", requestCtx.Err())
				}
			case <-time.After(7 * time.Second):
				cancel()
				close(proceed)
				t.Fatal("native Commit did not observe its in-flight deadline")
			}
		} else {
			cancel()
		}
		close(proceed)
	case err := <-done:
		close(proceed)
		t.Fatalf("Commit ended before entering SQLite's commit hook: %v", err)
	case <-time.After(8 * time.Second):
		cancel()
		close(proceed)
		t.Fatal("Commit SQL never entered SQLite's commit hook")
	}
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("SQLite accepted a commit after the native hook rejected it")
		}
		if deadline && !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("expected in-flight deadline error: %v", err)
		}
		if !deadline && !errors.Is(err, context.Canceled) {
			t.Fatalf("expected in-flight cancellation error: %v", err)
		}
		t.Logf("SQLite native commit rejected after mid-call cancellation/deadline: %v", err)
	case <-time.After(8 * time.Second):
		t.Fatal("canceled native Commit did not return")
	}
	if err := tx.Close(); err != nil {
		t.Fatalf("cleanup after canceled native commit: %v", err)
	}
	before, err := host.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (:Phase38Source)-[r:PHASE38_EVIDENCES]->(:Phase38Claim) RETURN count(r) AS count"})
	if err != nil || before.State != base || resultInteger(t, before.Result, 0, "count") != 0 {
		t.Fatalf("native commit rejection leaked data: state=%s base=%s err=%v", before.State, base, err)
	}
	if err := host.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	actual, err := reopened.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (:Phase38Source)-[r:PHASE38_EVIDENCES]->(:Phase38Claim) RETURN count(r) AS count"})
	if err != nil || actual.State != base || resultInteger(t, actual.Result, 0, "count") != 0 {
		t.Fatalf("native commit rejection persisted partial graph: state=%s base=%s err=%v", actual.State, base, err)
	}
	if _, err := reopened.Execute(ctx, ExecuteRequest{Branch: "main", Cypher: "CREATE (:Phase38AfterFailure)"}); err != nil {
		t.Fatalf("native commit rejection left writers unusable: %v", err)
	}
}

// SQLite max_page_count is a real pager capacity limit in a test-only DB.
// The limit must be set BEFORE graph writes; after staging, the pages may
// already be allocated and there is nothing left for Commit to allocate.
// A follow-up uncapped control proves the same payload is valid. This is a
// capacity-limit simulation, not physical media damage. The error must preserve
// Lithograph's structured RESOURCE_ERROR and the native SQLITE_FULL code.

func TestPhase38SQLitePageQuotaRejectsPatchWithoutPartialCommit(t *testing.T) {
	ctx := context.Background()
	paths := integrationPaths(t)
	extensions := integrationExtensions(t)
	semantic := integrationSemantic(paths, false)
	host, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatal(err)
	}
	defer host.Close()
	base, err := host.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := host.Begin(ctx, map[string]any{"branch": "main", "expectedHead": base})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Close()
	var pages int
	if err := tx.connection.QueryRowContext(ctx, "PRAGMA page_count").Scan(&pages); err != nil {
		t.Fatal(err)
	}
	if pages <= 0 {
		t.Fatalf("unexpected page_count %d", pages)
	}
	var actualLimit int
	if err := tx.connection.QueryRowContext(ctx, "PRAGMA max_page_count = "+fmt.Sprint(pages)).Scan(&actualLimit); err != nil {
		t.Fatal(err)
	}
	if actualLimit != pages {
		t.Fatalf("max_page_count not applied: current=%d limit=%d", pages, actualLimit)
	}
	// A noncompressible graph property requires far more pages than the
	// baseline SQLite file has. The pager must reject the first capacity
	// crossing, whether Lithograph flushes during Execute or Commit.
	randomBytes := make([]byte, 2<<20)
	_, _ = rand.New(rand.NewSource(38)).Read(randomBytes)
	payload := hex.EncodeToString(randomBytes)
	_, err = tx.Execute(ctx, "CREATE (n:Phase38Quota {payload: $payload}) RETURN count(n) AS count", map[string]any{"payload": payload}, nil)
	if err == nil {
		_, err = tx.Commit(ctx)
	}
	if err == nil {
		t.Fatal("huge graph patch succeeded despite SQLite page quota")
	}
	category, _, sqliteCode, typed := ErrorDetails(err)
	if !typed || category != CategoryResource || sqliteCode != int(sqlite3.ErrFull) {
		t.Fatalf("page quota must preserve RESOURCE_ERROR/SQLITE_FULL: category=%s code=%d typed=%v err=%v", category, sqliteCode, typed, err)
	}
	var native sqlite3.Error
	if !errors.As(err, &native) || native.Code != sqlite3.ErrFull {
		t.Fatalf("page quota lost native SQLITE_FULL cause: code=%d extended=%d err=%v", native.Code, native.ExtendedCode, err)
	}
	t.Logf("quota error details: category=%s code=%d typed=%v raw_sqlite=%d extended=%d", category, sqliteCode, typed, native.Code, native.ExtendedCode)
	t.Logf("SQLite page quota rejected a graph write/Commit: %v", err)
	if err := tx.Close(); err != nil {
		t.Fatalf("close failed after page quota: %v", err)
	}
	actual, err := host.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (n:Phase38Quota) RETURN count(n) AS count"})
	if err != nil || actual.State != base || resultInteger(t, actual.Result, 0, "count") != 0 {
		t.Fatalf("page quota leaked committed data: state=%q base=%q err=%v", actual.State, base, err)
	}
	if err := host.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	actual, err = reopened.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (n:Phase38Quota) RETURN count(n) AS count"})
	if err != nil || actual.State != base || resultInteger(t, actual.Result, 0, "count") != 0 {
		t.Fatalf("SQLite quota failure left partial history: state=%q base=%q err=%v", actual.State, base, err)
	}
	// Paired control: without the temporary page limit, the SAME Cypher and
	// payload must successfully commit and occupy additional physical pages.
	// Otherwise an unrelated parser/extension error could falsely pass the
	// preceding "must return an error" assertion.
	if _, err := reopened.Execute(ctx, ExecuteRequest{
		Branch: "main", Cypher: "CREATE (n:Phase38Quota {payload: $payload}) RETURN count(n) AS count",
		Params: map[string]any{"payload": payload},
	}); err != nil {
		t.Fatalf("uncapped control rejected the same valid patch: %v", err)
	}
	control, err := reopened.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (n:Phase38Quota) RETURN count(n) AS count"})
	if err != nil || control.State == base || resultInteger(t, control.Result, 0, "count") != 1 {
		t.Fatalf("uncapped control did not persist its one graph node: state=%q base=%q err=%v", control.State, base, err)
	}
	var grownPages int
	if err := reopened.readDB.QueryRowContext(ctx, "PRAGMA page_count").Scan(&grownPages); err != nil || grownPages <= pages {
		t.Fatalf("uncapped control did not grow SQLite beyond the injected quota: before=%d after=%d err=%v", pages, grownPages, err)
	}
}
