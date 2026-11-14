//go:build lithograph_smoke && linux

package lithograph

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
	sqlite3 "github.com/mattn/go-sqlite3"
	"golang.org/x/sys/unix"
)

// Exercise real Linux ENOSPC from the OS, rather than SQLite's page quota.
// This is opt-in and requires a dedicated, bounded Docker tmpfs at /phase38.
// Never fill a host disk, shared /tmp, or a persistent KG OS Instance.
func TestPhase38LinuxTmpfsENOSPCKeepsRelationshipPatchAtomic(t *testing.T) {
	root := os.Getenv("KGOS_PHASE38_ENOSPC_ROOT")
	if root == "" {
		t.Skip("requires isolated 16 MiB Docker tmpfs and explicit opt-in")
	}
	if root != "/phase38" {
		t.Fatalf("refuse disk-fill test outside dedicated /phase38: %q", root)
	}
	var filesystem unix.Statfs_t
	if err := unix.Statfs(root, &filesystem); err != nil {
		t.Fatal(err)
	}
	capacity := filesystem.Blocks * uint64(filesystem.Bsize)
	if filesystem.Type != unix.TMPFS_MAGIC || capacity < 8<<20 || capacity > 32<<20 {
		t.Fatalf("ENOSPC test requires <=32 MiB dedicated tmpfs, got type=%d capacity=%d", filesystem.Type, capacity)
	}
	fixture, err := os.MkdirTemp(root, "kgos-phase38-full-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(fixture) })
	paths, err := runtimeprofile.ResolvePaths(fixture)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
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
	if _, err := tx.Execute(ctx, "CREATE (a:Phase38FullSource), (b:Phase38FullClaim) CREATE (a)-[:PHASE38_FULL_EVIDENCES]->(b)", nil, nil); err != nil {
		t.Fatalf("stage before physical ENOSPC: %v", err)
	}
	staged, err := tx.Execute(ctx, "MATCH (:Phase38FullSource)-[r:PHASE38_FULL_EVIDENCES]->(:Phase38FullClaim) RETURN count(r) AS count", nil, nil)
	if err != nil || resultInteger(t, staged, 0, "count") != 1 {
		t.Fatalf("missing staged graph before ENOSPC: %v", err)
	}

	// Fill only this private bounded tmpfs. Observe actual OS ENOSPC from
	// write(2), not a guessed free-space threshold or injected SQLite PRAGMA.
	filler := filepath.Join(fixture, "tmpfs-filler")
	file, err := os.OpenFile(filler, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0600)
	if err != nil {
		t.Fatal(err)
	}
	chunk := make([]byte, 64<<10)
	var exhausted bool
	for written := uint64(0); written < capacity*2; {
		n, writeErr := file.Write(chunk)
		written += uint64(n)
		if errors.Is(writeErr, syscall.ENOSPC) {
			exhausted = true
			break
		}
		if writeErr != nil || n == 0 {
			_ = file.Close()
			t.Fatalf("unexpected tmpfs filler write: bytes=%d err=%v", n, writeErr)
		}
	}
	if !exhausted {
		_ = file.Close()
		t.Fatal("tmpfs did not return actual ENOSPC")
	}
	_, commitErr := tx.Commit(ctx)
	if commitErr == nil {
		_ = file.Close()
		t.Fatal("SQLite committed staged Relationship while tmpfs was out of space")
	}
	category, _, code, typed := ErrorDetails(commitErr)
	if !typed || category != CategoryResource || code != int(sqlite3.ErrFull) {
		_ = file.Close()
		t.Fatalf("real ENOSPC must preserve RESOURCE_ERROR/SQLITE_FULL: category=%q sqlite=%d typed=%v err=%v", category, code, typed, commitErr)
	}
	var native sqlite3.Error
	if !errors.As(commitErr, &native) || native.Code != sqlite3.ErrFull {
		_ = file.Close()
		t.Fatalf("real ENOSPC lost native SQLITE_FULL: %v", commitErr)
	}
	t.Logf("actual tmpfs ENOSPC rejected Commit: sqlite=%d category=%s", native.Code, category)

	// Capacity returns only after the test-owned filler descriptor closes.
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filler); err != nil {
		t.Fatal(err)
	}
	if err := tx.Close(); err != nil {
		t.Fatalf("close failed write transaction after recovery: %v", err)
	}
	unchanged, err := host.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (:Phase38FullSource)-[r:PHASE38_FULL_EVIDENCES]->(:Phase38FullClaim) RETURN count(r) AS count"})
	if err != nil || unchanged.State != base || resultInteger(t, unchanged.Result, 0, "count") != 0 {
		t.Fatalf("physical ENOSPC persisted a partial Relationship: state=%q base=%q err=%v", unchanged.State, base, err)
	}
	if err := host.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	after, err := reopened.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (:Phase38FullSource)-[r:PHASE38_FULL_EVIDENCES]->(:Phase38FullClaim) RETURN count(r) AS count"})
	if err != nil || after.State != base || resultInteger(t, after.Result, 0, "count") != 0 {
		t.Fatalf("reopened graph differs after ENOSPC: state=%q base=%q err=%v", after.State, base, err)
	}
	if _, err := reopened.Execute(ctx, ExecuteRequest{Branch: "main", Cypher: "CREATE (:Phase38AfterFull)"}); err != nil {
		t.Fatalf("database could not resume writes after ENOSPC: %v", err)
	}
	var integrity string
	if err := reopened.readDB.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		t.Fatalf("database integrity after ENOSPC: %q err=%v", integrity, err)
	}
	t.Log(fmt.Sprintf("physical ENOSPC rollback + reopening: original state=%s, recovery intact", base))
}
