//go:build lithograph_smoke

package main

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestRunStartsRealRuntimeAndStopsOnContext(t *testing.T) {
	home := t.TempDir()
	port := freeMainPort(t)
	writeMainIntegrationConfig(t, home, port)
	t.Setenv("KG_HOME", home)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	done := make(chan int, 1)
	go func() {
		done <- run(ctx, nil, &stdout, &stderr)
	}()

	address := fmt.Sprintf("127.0.0.1:%d", port)
	deadline := time.Now().Add(15 * time.Second)
	for {
		select {
		case code := <-done:
			t.Fatalf("kgosd exited before listening: code=%d stderr=%q", code, stderr.String())
		default:
		}
		connection, err := net.DialTimeout("tcp4", address, 50*time.Millisecond)
		if err == nil {
			_ = connection.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("kgosd did not begin listening: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()

	var code int
	select {
	case code = <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("kgosd did not stop after context cancellation")
	}
	if code != 0 {
		t.Fatalf("exit code = %d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), fmt.Sprintf("http://127.0.0.1:%d", port)) {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func freeMainPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("allocate port: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatalf("release port: %v", err)
	}
	return port
}

func writeMainIntegrationConfig(t *testing.T, home string, port int) {
	t.Helper()
	mainLibrary := os.Getenv("KGOS_LITHOGRAPH_LIBRARY")
	providerLibrary := os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY")
	if mainLibrary == "" || providerLibrary == "" {
		t.Fatal("Lithograph integration libraries are required")
	}
	mainLibrary, _ = filepath.Abs(mainLibrary)
	providerLibrary, _ = filepath.Abs(providerLibrary)
	body := fmt.Sprintf(
		"[server]\nhost = \"127.0.0.1\"\nport = %d\n\n"+
			"[cache]\nenabled = false\nmax_size_mb = 16\n\n"+
			"[[sqlite.extensions]]\nsource = %s\nentrypoint = \"sqlite3_lithograph_init\"\n\n"+
			"[[sqlite.extensions]]\nsource = %s\nentrypoint = \"sqlite3_lithographopenaicompatible_init\"\n\n"+
			"[fulltext]\nanalyzer = \"unicode61\"\n\n"+
			"[embedding]\nbase_url = \"https://example.invalid/v1\"\n"+
			"model = \"phase01-fixture\"\ndimensions = 3\nsimilarity = \"cosine\"\n",
		port,
		strconv.Quote(mainLibrary),
		strconv.Quote(providerLibrary),
	)
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte(body), 0o600); err != nil {
		t.Fatalf("write config.toml: %v", err)
	}
}
