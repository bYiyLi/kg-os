//go:build lithograph_smoke

package lithograph

import (
	"context"
	"database/sql/driver"
	"errors"
	"strings"
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
