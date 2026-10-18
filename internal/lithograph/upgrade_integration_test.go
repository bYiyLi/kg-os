//go:build lithograph_smoke

package lithograph

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestQuotedGraphNamesSurviveSnapshotsAndReopen(t *testing.T) {
	for _, test := range []struct {
		name         string
		label        string
		relationship string
	}{
		{name: "ascii", label: "UpgradePerson", relationship: "UPGRADE_KNOWS"},
		{name: "chinese", label: "升级人物", relationship: "认识"},
		{name: "embedded-backtick", label: "人物`旧友", relationship: "识`别"},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			paths := integrationPaths(t)
			extensions := integrationExtensions(t)
			semantic := integrationSemantic(paths, false)
			host, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = host.Close() })
			label := "`" + strings.ReplaceAll(test.label, "`", "``") + "`"
			relationship := "`" + strings.ReplaceAll(test.relationship, "`", "``") + "`"
			if _, err := host.Execute(ctx, ExecuteRequest{
				Branch: "main",
				Cypher: fmt.Sprintf("CREATE (a:%s {name: 'before'}), (b:%s {name: 'peer'}) CREATE (a)-[:%s {kind: 'before'}]->(b)", label, label, relationship),
			}); err != nil {
				t.Fatalf("create quoted graph names: %v", err)
			}
			query := fmt.Sprintf("MATCH (a:%s)-[r:%s]->(b:%s) WHERE a:%s RETURN a.name AS name, r.kind AS kind, labels(a)[0] AS label, type(r) AS relationship", label, relationship, label, label)
			check := func(at, want string) string {
				t.Helper()
				result, err := host.Query(ctx, QueryRequest{At: at, Cypher: query})
				if err != nil {
					t.Fatalf("match quoted graph names at %s: %v", at, err)
				}
				if len(result.Result.Rows) != 1 {
					t.Fatalf("match quoted graph names at %s returned %d rows, want 1", at, len(result.Result.Rows))
				}
				for column, expected := range map[string]string{
					"name": want, "kind": want, "label": test.label, "relationship": test.relationship,
				} {
					value, err := stringCell(result.Result, 0, column)
					if err != nil || value != expected {
						t.Fatalf("%s at %s = %q, %v; want %q", column, at, value, err, expected)
					}
				}
				return result.State
			}
			before := check("branch/main", "before")
			if _, err := host.Execute(ctx, ExecuteRequest{
				Branch: "main",
				Cypher: fmt.Sprintf("MATCH (a:%s)-[r:%s]->() SET a.name = 'after', r.kind = 'after'", label, relationship),
			}); err != nil {
				t.Fatalf("update quoted graph names: %v", err)
			}
			if after := check("branch/main", "after"); after == before {
				t.Fatal("update did not advance the graph state")
			}
			check(before, "before")
			if err := host.Close(); err != nil {
				t.Fatalf("close host: %v", err)
			}
			reopened, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
			if err != nil {
				t.Fatalf("reopen host: %v", err)
			}
			host = reopened
			check("branch/main", "after")
			check(before, "before")
		})
	}
}

func TestLongExpressionCancellationRollsBackAndRecovers(t *testing.T) {
	const expression = "reduce(total=0,i IN range(1,1000)|total+reduce(inner=0,j IN range(1,20000)|inner+j))"
	for _, explicit := range []bool{false, true} {
		t.Run(fmt.Sprintf("explicit=%t", explicit), func(t *testing.T) {
			ctx, finish := context.WithTimeout(context.Background(), 10*time.Second)
			defer finish()
			paths := integrationPaths(t)
			host, err := Open(ctx, paths.Database, integrationExtensions(t), "unicode61", integrationSemantic(paths, false))
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = host.Close() })
			before, err := host.ResolveState(ctx, "branch/main")
			if err != nil {
				t.Fatal(err)
			}
			canceled, cancel := context.WithCancel(ctx)
			defer cancel()
			var timer *time.Timer
			defer func() {
				if timer != nil {
					timer.Stop()
				}
			}()
			var events []Event
			canceledAt := make(chan time.Time, 1)
			consume := func(event Event) error {
				events = append(events, event)
				if event.Type == "columns" {
					// Start cancellation after the cursor is executing. The nested
					// expression has little output but substantial in-row work.
					timer = time.AfterFunc(25*time.Millisecond, func() {
						canceledAt <- time.Now()
						cancel()
					})
				}
				return nil
			}
			if explicit {
				transaction, err := host.Begin(ctx, nil)
				if err != nil {
					t.Fatal(err)
				}
				defer transaction.Close()
				if _, err := transaction.Execute(ctx, "CREATE (:UpgradeCanceled)", nil, nil); err != nil {
					t.Fatalf("stage explicit mutation: %v", err)
				}
				err = transaction.Stream(canceled, "RETURN "+expression+" AS value", nil, nil, consume)
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("cancel explicit long expression: %v", err)
				}
				if _, err := transaction.Commit(ctx); err == nil || !strings.Contains(err.Error(), "closed") {
					t.Fatalf("canceled explicit transaction remained committable: %v", err)
				}
			} else {
				err = host.StreamExecute(canceled, ExecuteRequest{
					Branch: "main",
					Cypher: "CREATE (:UpgradeCanceled) RETURN " + expression + " AS value",
				}, consume)
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("cancel mutating long expression: %v", err)
				}
			}
			if elapsed := time.Since(<-canceledAt); elapsed > time.Second {
				t.Fatalf("long expression cancellation and cleanup took %s after cancellation", elapsed)
			}
			if got := eventTypes(events); got != "columns" {
				t.Fatalf("canceled expression stream = %q, want columns without a row or success summary", got)
			}
			after, err := host.Query(ctx, QueryRequest{
				At:     "branch/main",
				Cypher: "MATCH (n:UpgradeCanceled) RETURN count(n) AS count",
			})
			if err != nil {
				t.Fatalf("query after cancellation: %v", err)
			}
			if count := resultInteger(t, after.Result, 0, "count"); count != 0 || after.State != before {
				t.Fatalf("cancellation published graph changes: count=%d state=%s, want 0 at %s", count, after.State, before)
			}
			if _, err := host.Execute(ctx, ExecuteRequest{Branch: "main", Cypher: "CREATE (:UpgradeRecovered)"}); err != nil {
				t.Fatalf("write connection did not recover: %v", err)
			}
		})
	}
}
