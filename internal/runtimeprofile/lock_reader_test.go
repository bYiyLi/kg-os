package runtimeprofile

import (
	"errors"
	"path/filepath"
	"testing"
)

func TestReadActiveEndpointRequiresActiveOwner(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "kgosd.lock")
	if _, err := ReadActiveEndpoint(path); !errors.Is(err, ErrNoActiveDaemon) {
		t.Fatalf("missing lock error = %v", err)
	}
	owner, err := AcquireLock(path)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	if _, err := ReadActiveEndpoint(path); err == nil {
		t.Fatal("unpublished active lock must not produce endpoint")
	}
	if err := owner.PublishEndpoint("http://127.0.0.1:4765"); err != nil {
		t.Fatalf("publish: %v", err)
	}
	endpoint, err := ReadActiveEndpoint(path)
	if err != nil {
		t.Fatalf("read active endpoint: %v", err)
	}
	if endpoint != "http://127.0.0.1:4765" {
		t.Fatalf("endpoint = %q", endpoint)
	}
	if err := owner.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	if _, err := ReadActiveEndpoint(path); !errors.Is(err, ErrNoActiveDaemon) {
		t.Fatalf("stale lock error = %v", err)
	}
}
