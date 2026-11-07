package observability

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestCorruptDiagnosticSQLiteIsNotOverwrittenOrAllowedToAffectBusinessFiles(t *testing.T) {
	root := t.TempDir()
	logs := filepath.Join(root, ".kgos", "logs")
	if err := os.MkdirAll(logs, 0o700); err != nil {
		t.Fatal(err)
	}
	database := filepath.Join(logs, "observability.sqlite")
	corrupted := bytes.Repeat([]byte("not-a-diagnostic-sqlite-file"), 2048)
	if err := os.WriteFile(database, corrupted, 0o600); err != nil {
		t.Fatal(err)
	}
	business := filepath.Join(root, ".kgos", "kgos.db")
	sentinel := []byte("business-database-fixture-do-not-touch")
	if err := os.WriteFile(business, sentinel, 0o600); err != nil {
		t.Fatal(err)
	}
	if store, err := OpenStore(logs, io.Discard); err == nil {
		_ = store.Close(t.Context())
		t.Fatal("corrupt diagnostic database was silently treated as healthy")
	}
	got, err := os.ReadFile(database)
	if err != nil || !bytes.Equal(got, corrupted) {
		t.Fatalf("corrupt diagnostic file was overwritten or removed: %v", err)
	}
	got, err = os.ReadFile(business)
	if err != nil || !bytes.Equal(got, sentinel) {
		t.Fatalf("diagnostic failure damaged the business database: %v", err)
	}
}
