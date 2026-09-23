//go:build lithograph_smoke

package daemon

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestServePublishesEndpointAndStopsGracefully(t *testing.T) {
	port := freePort(t)
	runtime := openDaemonRuntime(t, port)
	defer runtime.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var output bytes.Buffer
	done := make(chan error, 1)
	go func() {
		done <- Serve(ctx, runtime, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
			response.WriteHeader(http.StatusNoContent)
		}), &output)
	}()

	endpoint := waitForEndpoint(t, runtime)
	response, err := http.Get(endpoint)
	if err != nil {
		t.Fatalf("GET daemon endpoint: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("daemon status = %d", response.StatusCode)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("serve after cancellation: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("daemon did not stop after cancellation")
	}
	if !strings.Contains(output.String(), "KG OS daemon: "+endpoint) {
		t.Fatalf("daemon output = %q", output.String())
	}
}

func TestServeCancellationCancelsActiveRequestContext(t *testing.T) {
	port := freePort(t)
	runtime := openDaemonRuntime(t, port)
	defer runtime.Close()

	ctx, cancel := context.WithCancel(context.Background())
	requestStarted := make(chan struct{})
	requestCanceled := make(chan struct{})
	serveDone := make(chan error, 1)
	go func() {
		serveDone <- Serve(ctx, runtime, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			close(requestStarted)
			<-request.Context().Done()
			close(requestCanceled)
			response.WriteHeader(http.StatusNoContent)
		}), nil)
	}()

	endpoint := waitForEndpoint(t, runtime)
	clientDone := make(chan error, 1)
	go func() {
		response, err := http.Get(endpoint)
		if response != nil {
			_ = response.Body.Close()
		}
		clientDone <- err
	}()
	select {
	case <-requestStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("active request did not start")
	}
	cancel()
	select {
	case <-requestCanceled:
	case <-time.After(5 * time.Second):
		t.Fatal("daemon cancellation did not cancel active request context")
	}
	select {
	case err := <-serveDone:
		if err != nil {
			t.Fatalf("serve after active-request cancellation: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("daemon did not stop after active-request cancellation")
	}
	select {
	case <-clientDone:
	case <-time.After(5 * time.Second):
		t.Fatal("HTTP client did not finish after daemon cancellation")
	}
}

func TestServeRejectsOccupiedPortAndClosedRuntimePublication(t *testing.T) {
	t.Run("occupied port", func(t *testing.T) {
		listener, err := net.Listen("tcp4", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("reserve port: %v", err)
		}
		defer listener.Close()
		port := listener.Addr().(*net.TCPAddr).Port
		runtime := openDaemonRuntime(t, port)
		defer runtime.Close()
		err = Serve(context.Background(), runtime, http.NotFoundHandler(), nil)
		if err == nil || !strings.Contains(err.Error(), "listen on") {
			t.Fatalf("occupied-port error = %v", err)
		}
	})

	t.Run("closed runtime", func(t *testing.T) {
		port := freePort(t)
		runtime := openDaemonRuntime(t, port)
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
		err := Serve(context.Background(), runtime, http.NotFoundHandler(), nil)
		if err == nil || !strings.Contains(err.Error(), "publish daemon endpoint") {
			t.Fatalf("closed-runtime error = %v", err)
		}
	})
}

func waitForEndpoint(t *testing.T, runtime *runtimehost.Runtime) string {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		endpoint, err := runtime.Endpoint()
		if err == nil {
			return endpoint
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("daemon did not publish endpoint")
	return ""
}

func freePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("allocate free port: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatalf("release free port: %v", err)
	}
	return port
}

func openDaemonRuntime(t *testing.T, port int) *runtimehost.Runtime {
	t.Helper()
	home := t.TempDir()
	writeDaemonConfig(t, home, port)
	runtime, err := runtimehost.Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open daemon runtime: %v", err)
	}
	return runtime
}

func writeDaemonConfig(t *testing.T, home string, port int) {
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
			"[cache]\npath = \"cache/openai-compatible.db\"\nmax_size_mb = 16\n\n"+
			"[[sqlite.extensions]]\nsource = %s\nentrypoint = \"sqlite3_lithograph_init\"\n\n"+
			"[[sqlite.extensions]]\nsource = %s\nentrypoint = \"sqlite3_lithographopenaicompatible_init\"\n\n"+
			"[fulltext]\nanalyzer = \"unicode61\"\n\n"+
			"[embedding]\nbase_url = \"https://example.invalid/v1\"\n"+
			"model = \"phase01-fixture\"\ndimensions = 3\nsimilarity = \"cosine\"\napi_key_env = \"\"\n",
		port,
		strconv.Quote(mainLibrary),
		strconv.Quote(providerLibrary),
	)
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte(body), 0o600); err != nil {
		t.Fatalf("write daemon config: %v", err)
	}
}
