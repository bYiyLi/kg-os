//go:build lithograph_smoke

package lithograph

import (
	"context"
	"os"
	"testing"
)

// These faults affect only a test-owned SQLite file after the real Host has
// closed. They simulate a corrupted on-disk image, NOT a physical disk failure.
// Reopen must fail closed; recovery is only from an intact original snapshot.
func TestPhase38CorruptSQLiteFileFailsClosedAndIntactSnapshotRestores(t *testing.T) {
	ctx := context.Background()
	paths := integrationPaths(t)
	extensions := integrationExtensions(t)
	semantic := integrationSemantic(paths, false)
	host, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatal(err)
	}
	initial, err := host.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	_, err = host.Execute(ctx, ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (a:Phase38Source), (b:Phase38Claim) CREATE (a)-[:PHASE38_EVIDENCES]->(b)",
	})
	if err != nil {
		t.Fatal(err)
	}
	durable, err := host.Query(ctx, QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (:Phase38Source)-[r:PHASE38_EVIDENCES]->(:Phase38Claim) RETURN count(r) AS count",
	})
	if err != nil || durable.State == initial || resultInteger(t, durable.Result, 0, "count") != 1 {
		t.Fatalf("expected an intact committed graph: initial=%q state=%q err=%v", initial, durable.State, err)
	}
	if err := host.Close(); err != nil {
		t.Fatal(err)
	}
	intact, err := os.ReadFile(paths.Database)
	if err != nil {
		t.Fatal(err)
	}
	if len(intact) < 4096 {
		t.Fatalf("SQLite fixture unexpectedly small: %d", len(intact))
	}
	for _, scenario := range []struct {
		name   string
		damage func([]byte) []byte
	}{
		{name: "destroy_header", damage: func(original []byte) []byte {
			image := append([]byte(nil), original...)
			copy(image[:16], []byte("PHASE38_CORRUPTED"))
			return image
		}},
		{name: "truncate_database", damage: func(original []byte) []byte {
			return append([]byte(nil), original[:127]...)
		}},
		{name: "truncate_to_zero", damage: func([]byte) []byte {
			return []byte{}
		}},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			if err := os.WriteFile(paths.Database, scenario.damage(intact), 0600); err != nil {
				t.Fatal(err)
			}
			damaged, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
			if err == nil {
				_ = damaged.Close()
				t.Fatal("corrupted database reopened or was silently reinitialized")
			}
			t.Logf("corruption was rejected by SQLite/Lithograph bootstrap: %v", err)
			// Repair the test file from a known-good exact snapshot after all
			// failing connections are closed, never auto-reset a damaged graph.
			for _, suffix := range []string{"-wal", "-shm"} {
				if err := os.Remove(paths.Database + suffix); err != nil && !os.IsNotExist(err) {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(paths.Database, intact, 0600); err != nil {
				t.Fatal(err)
			}
			recovered, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
			if err != nil {
				t.Fatalf("restoring intact snapshot did not reopen: %v", err)
			}
			var integrity string
			if err := recovered.readDB.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
				_ = recovered.Close()
				t.Fatalf("restored SQLite image failed integrity_check: result=%q err=%v", integrity, err)
			}
			state, err := recovered.Query(ctx, QueryRequest{
				At:     "branch/main",
				Cypher: "MATCH (:Phase38Source)-[r:PHASE38_EVIDENCES]->(:Phase38Claim) RETURN count(r) AS count",
			})
			if err != nil || state.State != durable.State || resultInteger(t, state.Result, 0, "count") != 1 {
				_ = recovered.Close()
				t.Fatalf("restored durable state differs: got=%q want=%q err=%v", state.State, durable.State, err)
			}
			if _, err := recovered.Execute(ctx, ExecuteRequest{Branch: "main", Cypher: "CREATE (:Phase38Recovered)"}); err != nil {
				_ = recovered.Close()
				t.Fatalf("fresh writes failed after restoring intact data: %v", err)
			}
			if err := recovered.Close(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
