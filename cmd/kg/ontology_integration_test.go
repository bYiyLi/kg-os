//go:build lithograph_smoke

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestOntologyCLIRealDaemonE2E(t *testing.T) {
	home := t.TempDir()
	port := freeOntologyCLIPort(t)
	writeOntologyCLIConfig(t, home, port)
	runtime, err := runtimehost.Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	serverCtx, cancelServer := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- daemon.Serve(
			serverCtx,
			runtime,
			daemon.NewHandler(runtime, http.NotFoundHandler()),
			io.Discard,
		)
	}()
	waitForOntologyCLIEndpoint(t, runtime)
	t.Setenv("KG_HOME", home)
	t.Setenv("KG_TOKEN", runtime.Credential.Token)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if code := run(
		context.Background(),
		[]string{"ontology", "--at", "branch/main"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("overview exit = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if stderr.Len() != 0 || !strings.Contains(stdout.String(), "# Ontology") {
		t.Fatalf("overview stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	base, err := runtime.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	doc := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Doc",
			Properties:  []kernel.Property{{Name: "title", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	patchText := ontologyCLIAddPatch(t, "new:node-definition:doc", doc)
	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(),
		[]string{"ontology", "patch", "--base-state", base, "--branch", "main"},
		strings.NewReader(patchText),
		false,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("patch exit = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var patchResult kernel.PatchResult
	if err := json.Unmarshal(stdout.Bytes(), &patchResult); err != nil {
		t.Fatalf("decode patch stdout: %v (%q)", err, stdout.String())
	}
	if patchResult.State == "" || patchResult.State == base || len(patchResult.Created) != 1 {
		t.Fatalf("patch result = %#v", patchResult)
	}

	wantBody, err := runtime.Kernel.ReadObject(context.Background(), patchResult.State, "node:Doc")
	if err != nil {
		t.Fatalf("read expected canonical body: %v", err)
	}
	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(),
		[]string{"ontology", "node:Doc", "--at", patchResult.State, "--edit"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("edit exit = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if !bytes.Equal(stdout.Bytes(), wantBody.YAML) || stderr.Len() != 0 {
		t.Fatalf("edit stdout=%q want=%q stderr=%q", stdout.String(), wantBody.YAML, stderr.String())
	}

	t.Setenv("KG_TOKEN", "wrong-token")
	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(),
		[]string{"ontology", "--at", patchResult.State},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 1 {
		t.Fatalf("wrong-token exit = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeAuthenticationFailed)) ||
		strings.Contains(stderr.String(), "wrong-token") {
		t.Fatalf("wrong-token stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	t.Setenv("KG_TOKEN", "")
	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(),
		[]string{"ontology", "--at", patchResult.State},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 2 {
		t.Fatalf("missing-token exit = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeAuthenticationFailed)) {
		t.Fatalf("missing-token stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	t.Setenv("KG_TOKEN", runtime.Credential.Token)
	cancelServer()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("stop daemon: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("daemon did not stop")
	}
	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(),
		[]string{"ontology", "--at", patchResult.State},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 3 {
		t.Fatalf("transport exit = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
		t.Fatalf("transport stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}

func ontologyCLIAddPatch(t *testing.T, target string, value kernel.ObjectValue) string {
	t.Helper()
	body, err := kernel.RenderObjectYAML(value)
	if err != nil {
		t.Fatalf("render object: %v", err)
	}
	lines := strings.Split(strings.TrimSuffix(string(body), "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", target, target)
	patch.WriteString("new file mode 100644\n")
	patch.WriteString("--- /dev/null\n")
	fmt.Fprintf(&patch, "+++ b/%s\n", target)
	fmt.Fprintf(&patch, "@@ -0,0 +1,%d @@\n", len(lines))
	for _, line := range lines {
		fmt.Fprintf(&patch, "+%s\n", line)
	}
	return patch.String()
}

func waitForOntologyCLIEndpoint(t *testing.T, runtime *runtimehost.Runtime) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := runtime.Endpoint(); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("daemon did not publish endpoint")
}

func freeOntologyCLIPort(t *testing.T) int {
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

func writeOntologyCLIConfig(t *testing.T, home string, port int) {
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
			"model = \"phase02-cli\"\ndimensions = 3\nsimilarity = \"cosine\"\n",
		port,
		strconv.Quote(mainLibrary),
		strconv.Quote(providerLibrary),
	)
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte(body), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
}
