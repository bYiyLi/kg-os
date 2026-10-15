package observability

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRotatorBoundedPrivateAndSymlinkSafe(t *testing.T) {
	t.Parallel()
	dir := filepath.Join(t.TempDir(), "logs")
	writer, err := NewRotatingWriter(dir, 80, 5)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 35; i++ {
		if _, err := writer.Write([]byte(strings.Repeat("x", 19) + "\n")); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 5 {
		t.Fatalf("rotation files: %d %v", len(files), err)
	}
	for _, entry := range files {
		info, err := entry.Info()
		if err != nil || info.Size() > 80 {
			t.Fatalf("unbounded file %s: %v %v", entry.Name(), info, err)
		}
		if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
			t.Fatalf("public log file %s mode %v", entry.Name(), info.Mode())
		}
	}
	if err := os.Remove(filepath.Join(dir, "kgosd.log")); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(t.TempDir(), "important")
	if err := os.WriteFile(secret, []byte("untouched"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, filepath.Join(dir, "kgosd.log")); err == nil {
		if _, err := NewRotatingWriter(dir, 80, 5); err == nil {
			t.Fatal("followed log symlink")
		}
		body, err := os.ReadFile(secret)
		if err != nil || string(body) != "untouched" {
			t.Fatal("log writer modified redirected sensitive file")
		}
	} else if !errors.Is(err, os.ErrPermission) && runtime.GOOS != "windows" {
		t.Fatalf("unexpected symlink failure: %v", err)
	}
}

func TestRotatorDropsOversizedRecordWithoutGrowing(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "logs")
	writer, err := NewRotatingWriter(dir, 10, 2)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()
	if n, err := writer.Write([]byte(strings.Repeat("s", 50))); err != nil || n != 50 {
		t.Fatalf("oversized record result = %d %v", n, err)
	}
	info, err := os.Stat(filepath.Join(dir, "kgosd.log"))
	if err != nil || info.Size() != 0 {
		t.Fatalf("oversized diagnostic exceeded limit: %v %v", info, err)
	}
}
