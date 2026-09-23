package runtimeprofile

import (
	"errors"
	"fmt"
	"net"
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
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	endpoint := fmt.Sprintf("http://%s", listener.Addr())
	if err := owner.PublishEndpoint(endpoint); err != nil {
		t.Fatalf("publish: %v", err)
	}
	gotEndpoint, err := ReadActiveEndpoint(path)
	if err != nil {
		t.Fatalf("read active endpoint: %v", err)
	}
	if gotEndpoint != endpoint {
		t.Fatalf("endpoint = %q, want %q", gotEndpoint, endpoint)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}
	status := InspectDaemon(path)
	if status.State != DaemonUnavailable || status.Endpoint != endpoint || status.Err == nil {
		t.Fatalf("unreachable active endpoint status = %#v", status)
	}
	if err := owner.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	if _, err := ReadActiveEndpoint(path); !errors.Is(err, ErrNoActiveDaemon) {
		t.Fatalf("stale lock error = %v", err)
	}
}
