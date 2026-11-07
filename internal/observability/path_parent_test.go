package observability

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreRejectsSymlinkedInstanceParentBeforeCreatingFiles(t *testing.T) {
	outside := t.TempDir()
	instance := filepath.Join(t.TempDir(), ".kgos")
	if err := os.Symlink(outside, instance); err != nil {
		t.Skipf("symbolic links unavailable on this platform: %v", err)
	}
	if store, err := OpenStore(filepath.Join(instance, "logs"), io.Discard); err == nil {
		t.Fatalf("symlinked Instance parent was accepted: %+v", store)
	}
	_, err := os.Stat(filepath.Join(outside, "logs"))
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("diagnostic store wrote outside the Instance: %v", err)
	}
}
