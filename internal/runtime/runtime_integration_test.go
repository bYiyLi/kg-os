//go:build lithograph_smoke

package runtime

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestRuntimeOpenLockResolverCredentialAndReopen(t *testing.T) {
	home := t.TempDir()
	writeIntegrationConfig(t, home, "")

	first, err := Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	baseline := first.Database.Baseline()
	token := first.Credential.Token
	if token == "" {
		t.Fatal("runtime credential token is empty")
	}
	if len(first.Extensions) != 2 {
		t.Fatalf("resolved extensions = %d, want 2", len(first.Extensions))
	}
	for _, extension := range first.Extensions {
		if !strings.HasPrefix(extension.Library, first.Paths.ExtensionsDir+string(filepath.Separator)) {
			t.Fatalf("extension library %q is outside content cache %q", extension.Library, first.Paths.ExtensionsDir)
		}
	}
	if _, err := os.Stat(first.Paths.Database); err != nil {
		t.Fatalf("runtime database was not created: %v", err)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(first.Paths.Auth)
		if err != nil {
			t.Fatalf("stat auth.json: %v", err)
		}
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("auth.json mode = %o", info.Mode().Perm())
		}
	}

	second, err := Open(context.Background(), home, nil)
	if second != nil {
		_ = second.Close()
	}
	if !errors.Is(err, runtimeprofile.ErrLocked) {
		t.Fatalf("second runtime open error = %v", err)
	}

	const endpoint = "http://127.0.0.1:4765"
	if err := first.PublishEndpoint(endpoint); err != nil {
		t.Fatalf("publish endpoint: %v", err)
	}
	gotEndpoint, err := first.Endpoint()
	if err != nil {
		t.Fatalf("read endpoint: %v", err)
	}
	if gotEndpoint != endpoint {
		t.Fatalf("endpoint = %q, want %q", gotEndpoint, endpoint)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close runtime: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close runtime twice: %v", err)
	}

	reopened, err := Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("reopen runtime: %v", err)
	}
	defer reopened.Close()
	if reopened.Credential.Token != token {
		t.Fatal("runtime credential rotated across reopen")
	}
	if reopened.Database.Baseline() != baseline {
		t.Fatalf("reopened baseline = %#v, want %#v", reopened.Database.Baseline(), baseline)
	}
}

func TestRuntimeStartupFailureReleasesLock(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte("[server]\nport = 0\n"), 0o600); err != nil {
		t.Fatalf("write invalid config: %v", err)
	}
	opened, err := Open(context.Background(), home, nil)
	if opened != nil {
		_ = opened.Close()
	}
	if err == nil {
		t.Fatal("invalid runtime config was accepted")
	}
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatalf("resolve paths: %v", err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatalf("startup failure leaked instance lock: %v", err)
	}
	if err := lock.Close(); err != nil {
		t.Fatalf("close recovered lock: %v", err)
	}
}

func TestRuntimeStartupFailuresAfterConfigReleaseLock(t *testing.T) {
	t.Run("malformed credential", func(t *testing.T) {
		home := t.TempDir()
		writeIntegrationConfig(t, home, "")
		if err := os.WriteFile(filepath.Join(home, "auth.json"), []byte("{"), 0o600); err != nil {
			t.Fatalf("write malformed auth.json: %v", err)
		}
		opened, err := Open(context.Background(), home, nil)
		if opened != nil {
			_ = opened.Close()
		}
		if err == nil || !strings.Contains(err.Error(), "decode auth.json") {
			t.Fatalf("malformed credential error = %v", err)
		}
		assertRuntimeLockReleased(t, home)
	})

	t.Run("cache parent blocked by file", func(t *testing.T) {
		home := t.TempDir()
		blocking := filepath.Join(t.TempDir(), "cache-parent")
		if err := os.WriteFile(blocking, []byte("file"), 0o600); err != nil {
			t.Fatalf("write cache parent blocker: %v", err)
		}
		cachePath := filepath.Join(blocking, "provider.db")
		writeIntegrationConfig(t, home, cachePath)
		opened, err := Open(context.Background(), home, nil)
		if opened != nil {
			_ = opened.Close()
		}
		if err == nil || !strings.Contains(err.Error(), "Provider cache parent") {
			t.Fatalf("blocked cache parent error = %v", err)
		}
		assertRuntimeLockReleased(t, home)
	})

	t.Run("missing extension", func(t *testing.T) {
		home := t.TempDir()
		writeIntegrationConfig(t, home, "")
		body, err := os.ReadFile(filepath.Join(home, "config.toml"))
		if err != nil {
			t.Fatalf("read config.toml: %v", err)
		}
		missing := filepath.Join(t.TempDir(), "missing-extension.dylib")
		mainLibrary := os.Getenv("KGOS_LITHOGRAPH_LIBRARY")
		mainLibrary, _ = filepath.Abs(mainLibrary)
		body = []byte(strings.Replace(string(body), strconv.Quote(mainLibrary), strconv.Quote(missing), 1))
		if err := os.WriteFile(filepath.Join(home, "config.toml"), body, 0o600); err != nil {
			t.Fatalf("rewrite config.toml: %v", err)
		}
		opened, err := Open(context.Background(), home, nil)
		if opened != nil {
			_ = opened.Close()
		}
		if err == nil || !strings.Contains(err.Error(), "open local extension") {
			t.Fatalf("missing extension error = %v", err)
		}
		assertRuntimeLockReleased(t, home)
	})
}

func assertRuntimeLockReleased(t *testing.T, home string) {
	t.Helper()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatalf("resolve paths: %v", err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatalf("startup failure leaked instance lock: %v", err)
	}
	if err := lock.Close(); err != nil {
		t.Fatalf("close recovered lock: %v", err)
	}
}

func TestRuntimeCreatesExternalProviderCacheParentWithoutCreatingCacheDatabase(t *testing.T) {
	home := t.TempDir()
	external := filepath.Join(t.TempDir(), "nested", "provider", "cache.db")
	writeIntegrationConfig(t, home, external)
	opened, err := Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open runtime with external cache path: %v", err)
	}
	defer opened.Close()
	if opened.Config.Cache.Path != external {
		t.Fatalf("cache path = %q, want %q", opened.Config.Cache.Path, external)
	}
	if info, err := os.Stat(filepath.Dir(external)); err != nil || !info.IsDir() {
		t.Fatalf("external cache parent was not created: info=%v err=%v", info, err)
	}
	if _, err := os.Stat(external); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("KG OS pre-created Provider cache database: err=%v", err)
	}
}

func writeIntegrationConfig(t *testing.T, home string, cachePath string) {
	t.Helper()
	mainLibrary := os.Getenv("KGOS_LITHOGRAPH_LIBRARY")
	providerLibrary := os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY")
	if mainLibrary == "" || providerLibrary == "" {
		t.Fatal("KGOS_LITHOGRAPH_LIBRARY and KGOS_LITHOGRAPH_PROVIDER_LIBRARY are required")
	}
	mainLibrary, _ = filepath.Abs(mainLibrary)
	providerLibrary, _ = filepath.Abs(providerLibrary)
	if cachePath == "" {
		cachePath = "cache/openai-compatible.db"
	}
	cache := "[cache]\npath = " + strconv.Quote(cachePath) + "\nmax_size_mb = 16\n\n"
	body := "[server]\nhost = \"127.0.0.1\"\nport = 4765\n\n" +
		cache +
		"[[sqlite.extensions]]\nsource = " + strconv.Quote(mainLibrary) + "\n" +
		"entrypoint = \"sqlite3_lithograph_init\"\n\n" +
		"[[sqlite.extensions]]\nsource = " + strconv.Quote(providerLibrary) + "\n" +
		"entrypoint = \"sqlite3_lithographopenaicompatible_init\"\n\n" +
		"[fulltext]\nanalyzer = \"unicode61\"\n\n" +
		"[embedding]\nbase_url = \"https://example.invalid/v1\"\n" +
		"model = \"phase01-fixture\"\ndimensions = 3\nsimilarity = \"cosine\"\napi_key_env = \"\"\n"
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte(body), 0o600); err != nil {
		t.Fatalf("write config.toml: %v", err)
	}
}
