package webstore

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestNewDaemonCleansPrivateOrphanTemporariesAndPreservesOriginals(t *testing.T) {
	root := filepath.Join(t.TempDir(), "web")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{".ui-create-orphan.db", ".ui-export-orphan.db", ".ui-export-orphan.db-journal", "ui.db.backup"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("original input"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	outside := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(outside, []byte("outside original"), 0o600); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		if err := os.Symlink(outside, filepath.Join(root, ".ui-export-link.db")); err != nil {
			t.Fatal(err)
		}
	}
	store := New(root, testDatabase)
	defer store.Close()
	info := store.Info(testContext)
	if info.StorageStatus != "ready" {
		t.Fatalf("startup cleanup: %+v", info)
	}
	for _, name := range []string{".ui-create-orphan.db", ".ui-export-orphan.db", ".ui-export-orphan.db-journal"} {
		if _, err := os.Stat(filepath.Join(root, name)); !os.IsNotExist(err) {
			t.Fatalf("orphan retained: %s %v", name, err)
		}
	}
	if data, err := os.ReadFile(filepath.Join(root, "ui.db.backup")); err != nil || string(data) != "original input" {
		t.Fatalf("backup removed: %s %v", data, err)
	}
	if data, err := os.ReadFile(outside); err != nil || string(data) != "outside original" {
		t.Fatalf("cleanup followed link: %s %v", data, err)
	}
	if err := os.WriteFile(filepath.Join(store.cacheDir, ".cache-orphan"), []byte("cached input"), 0o600); err != nil {
		t.Fatal(err)
	}
	store.cacheLoaded = false
	if current := store.Info(testContext); current.StorageStatus != "ready" {
		t.Fatalf("cache cleanup blocked UI: %+v", current)
	}
	if _, err := os.Stat(filepath.Join(store.cacheDir, ".cache-orphan")); !os.IsNotExist(err) {
		t.Fatalf("cache orphan retained: %v", err)
	}
	cleanTemporaries(filepath.Join(t.TempDir(), "missing"), ".cache-")
	if err := New("relative", testDatabase).guardFiles(); err == nil {
		t.Fatal("relative managed directory accepted")
	}
}
