//go:build lithograph_smoke

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/buildinfo"
)

func TestRunStartsPackagedRuntimeAndStopsOnContextCancellation(t *testing.T) {
	prepareKGOSDTestRuntimePackage(t)
	root := t.TempDir()
	writeKGOSDIntegrationConfig(t, root)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan int, 1)
	var stderr bytes.Buffer
	go func() {
		done <- run(ctx, []string{"--root", root}, nil, &stderr)
	}()

	waitForKGOSDLocator(t, root)
	cancel()
	select {
	case code := <-done:
		if code != 0 {
			t.Fatalf("run exit code = %d, stderr = %q", code, stderr.String())
		}
	case <-time.After(10 * time.Second):
		t.Fatal("kgosd run did not stop after cancellation")
	}
}

func prepareKGOSDTestRuntimePackage(t *testing.T) {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	packageRoot := filepath.Dir(executable)
	suffix := ".so"
	if runtime.GOOS == "darwin" {
		suffix = ".dylib"
	}
	daemon := filepath.Join(packageRoot, "kgosd")
	extensions := filepath.Join(packageRoot, "extensions")
	manifestPath := filepath.Join(packageRoot, "manifest.json")
	if err := os.MkdirAll(extensions, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = os.Remove(daemon)
		_ = os.Remove(manifestPath)
		_ = os.RemoveAll(extensions)
	})
	if err := os.WriteFile(daemon, []byte("kgosd test runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	files := []struct {
		source string
		target string
	}{
		{
			source: os.Getenv("KGOS_LITHOGRAPH_LIBRARY"),
			target: filepath.Join(extensions, "lithograph"+suffix),
		},
		{
			source: os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY"),
			target: filepath.Join(extensions, "lithograph-openai-compatible"+suffix),
		},
	}
	for _, file := range files {
		body, err := os.ReadFile(file.source)
		if err != nil {
			t.Fatalf("read native fixture %q: %v", file.source, err)
		}
		if err := os.WriteFile(file.target, body, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}
	manifestFiles := make([]map[string]string, 0, 3)
	for _, path := range []string{daemon, files[0].target, files[1].target} {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		relative, err := filepath.Rel(packageRoot, path)
		if err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(body)
		manifestFiles = append(manifestFiles, map[string]string{
			"file": filepath.ToSlash(relative), "sha256": hex.EncodeToString(digest[:]),
		})
	}
	manifest := map[string]any{
		"arch": arch, "files": manifestFiles, "platform": runtime.GOOS, "version": buildinfo.Version,
	}
	body, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, append(body, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeKGOSDIntegrationConfig(t *testing.T, root string) {
	t.Helper()
	body := "[cache]\npath = \"cache/openai-compatible.db\"\nmax_size_mb = 16\n\n" +
		"[fulltext]\nanalyzer = \"unicode61\"\n\n" +
		"[embedding]\nbase_url = \"https://example.invalid/v1\"\n" +
		"model = \"kgosd-integration\"\ndimensions = 3\nsimilarity = \"cosine\"\napi_key_env = \"\"\n"
	if err := os.WriteFile(filepath.Join(root, "config.toml"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func waitForKGOSDLocator(t *testing.T, root string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		body, err := os.ReadFile(filepath.Join(root, "kgosd.lock"))
		if err == nil {
			var locator map[string]any
			if json.Unmarshal(body, &locator) == nil {
				if endpoint, ok := locator["endpoint"].(string); ok && endpoint != "" {
					return
				}
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("kgosd did not publish a Runtime locator")
}
