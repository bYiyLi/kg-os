package runtimeprofile

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestResolvePathsAndEnsureDirectories(t *testing.T) {
	working := t.TempDir()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	if err := os.Chdir(working); err != nil {
		t.Fatalf("change working directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(previous); err != nil {
			t.Errorf("restore working directory: %v", err)
		}
	})

	paths, err := ResolvePaths("profile")
	if err != nil {
		t.Fatalf("resolve explicit KG_HOME: %v", err)
	}
	wantHome, err := filepath.Abs("profile")
	if err != nil {
		t.Fatalf("resolve expected home: %v", err)
	}
	if paths.Home != wantHome {
		t.Fatalf("home = %q, want %q", paths.Home, wantHome)
	}
	if paths.Config != filepath.Join(wantHome, "config.toml") ||
		paths.Auth != filepath.Join(wantHome, "auth.json") ||
		paths.Lock != filepath.Join(wantHome, "kgosd.lock") ||
		paths.Database != filepath.Join(wantHome, "kgos.db") {
		t.Fatalf("unexpected profile paths: %#v", paths)
	}
	if err := EnsureDirectories(paths); err != nil {
		t.Fatalf("ensure runtime directories: %v", err)
	}
	for _, directory := range []string{paths.Home, paths.CacheDir, paths.ExtensionsDir, paths.LogsDir} {
		info, err := os.Stat(directory)
		if err != nil {
			t.Fatalf("stat %q: %v", directory, err)
		}
		if !info.IsDir() {
			t.Fatalf("%q is not a directory", directory)
		}
	}
}

func TestResolvePathsDefaultHome(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("os.UserHomeDir does not consistently follow HOME on Windows")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	paths, err := ResolvePaths("")
	if err != nil {
		t.Fatalf("resolve default KG_HOME: %v", err)
	}
	if paths.Home != filepath.Join(home, defaultDirectoryName) {
		t.Fatalf("home = %q", paths.Home)
	}
}

func TestLoadConfigRequiresExplicitValuesAndMapsSemanticDefaults(t *testing.T) {
	paths := testProfilePaths(t)
	extension := filepath.Join(t.TempDir(), "extension.so")
	if err := os.WriteFile(extension, []byte("extension"), 0o600); err != nil {
		t.Fatalf("write extension fixture: %v", err)
	}
	writeConfig(t, paths, completeRuntimeConfig(
		"[[sqlite.extensions]]\nsource = "+quoteTOML(extension)+"\nentrypoint = \"sqlite3_fixture_init\"",
		"",
	))

	config, err := LoadConfig(paths, func(string) (string, bool) { return "", false })
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if config.Server.Host != "127.0.0.1" || config.Server.Port != 4765 {
		t.Fatalf("server = %#v", config.Server)
	}
	wantCache := filepath.Join(paths.Home, "cache/openai-compatible.db")
	if config.Cache.Path != wantCache || config.Cache.MaxSizeMB != 4096 {
		t.Fatalf("cache = %#v", config.Cache)
	}
	if config.FullText.Analyzer != "unicode61" {
		t.Fatalf("fulltext analyzer = %q", config.FullText.Analyzer)
	}
	if config.Embedding.BaseURL != "https://example.test/v1" ||
		config.Embedding.Similarity != "cosine" ||
		config.Embedding.APIKeyEnv != "" {
		t.Fatalf("embedding = %#v", config.Embedding)
	}
	semantic := config.SemanticDefaults()
	if semantic.Provider != "openai-compatible" ||
		!semantic.CacheEnabled ||
		semantic.CachePath != wantCache ||
		semantic.CacheMaxBytes != 4096*1024*1024 {
		t.Fatalf("semantic defaults = %#v", semantic)
	}
}

func TestLoadConfigExplicitValues(t *testing.T) {
	paths := testProfilePaths(t)
	extension := filepath.Join(t.TempDir(), "extension.zip")
	if err := os.WriteFile(extension, []byte("archive"), 0o600); err != nil {
		t.Fatalf("write extension fixture: %v", err)
	}
	configText := strings.Join([]string{
		"[server]",
		"host = \"0.0.0.0\"",
		"port = 9000",
		"",
		"[cache]",
		"path = \"derived/provider.db\"",
		"max_size_mb = 2",
		"",
		"[[sqlite.extensions]]",
		"source = " + quoteTOML(extension),
		"library = \"lib/extension.so\"",
		"entrypoint = \"sqlite3_fixture_init\"",
		"",
		"[fulltext]",
		"analyzer = \"porter unicode61\"",
		"",
		"[embedding]",
		"base_url = \"http://127.0.0.1:8080/v1\"",
		"model = \"fixture-model\"",
		"dimensions = 3",
		"similarity = \"euclidean\"",
		"api_key_env = \"FIXTURE_KEY\"",
	}, "\n")
	writeConfig(t, paths, configText)

	config, err := LoadConfig(paths, func(name string) (string, bool) {
		return "secret", name == "FIXTURE_KEY"
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if config.Cache.Path != filepath.Join(paths.Home, "derived/provider.db") {
		t.Fatalf("cache path = %q", config.Cache.Path)
	}
	semantic := config.SemanticDefaults()
	if !semantic.CacheEnabled || semantic.CacheMaxBytes != 2*1024*1024 ||
		semantic.APIKeyEnv != "FIXTURE_KEY" ||
		semantic.Similarity != "euclidean" {
		t.Fatalf("semantic defaults = %#v", semantic)
	}
}

func TestLoadConfigRejectsInvalidInputs(t *testing.T) {
	paths := testProfilePaths(t)
	extension := filepath.Join(t.TempDir(), "extension.so")
	if err := os.WriteFile(extension, []byte("extension"), 0o600); err != nil {
		t.Fatalf("write extension fixture: %v", err)
	}
	validExtension := "[[sqlite.extensions]]\nsource = " + quoteTOML(extension) + "\nentrypoint = \"init\""
	valid := completeRuntimeConfig(validExtension, "")
	tests := []struct {
		name       string
		config     string
		lookup     LookupEnv
		wantSubstr string
	}{
		{
			name:       "missing required field",
			config:     strings.Replace(valid, "host = \"127.0.0.1\"\n", "", 1),
			wantSubstr: "missing required field server.host",
		},
		{
			name:       "removed cache enabled",
			config:     strings.Replace(valid, "[cache]\n", "[cache]\nenabled = false\n", 1),
			wantSubstr: "unknown field",
		},
		{
			name:       "unknown field",
			config:     valid + "unknown = true\n",
			wantSubstr: "unknown field",
		},
		{
			name:       "hostname",
			config:     strings.Replace(valid, "host = \"127.0.0.1\"", "host = \"localhost\"", 1),
			wantSubstr: "IPv4",
		},
		{
			name:       "invalid port",
			config:     strings.Replace(valid, "port = 4765", "port = 0", 1),
			wantSubstr: "server.port",
		},
		{
			name:       "missing extension",
			config:     completeRuntimeConfig("", ""),
			wantSubstr: "sqlite.extensions",
		},
		{
			name:       "cache main collision",
			config:     strings.Replace(valid, "path = \"cache/openai-compatible.db\"", "path = "+quoteTOML(paths.Database), 1),
			wantSubstr: "kgos.db",
		},
		{
			name: "relative extension",
			config: completeRuntimeConfig(
				"[[sqlite.extensions]]\nsource = \"extension.so\"\nentrypoint = \"init\"",
				"",
			),
			wantSubstr: "absolute local",
		},
		{
			name: "remote missing sha",
			config: completeRuntimeConfig(
				"[[sqlite.extensions]]\nsource = \"https://example.test/extension.so\"\nentrypoint = \"init\"",
				"",
			),
			wantSubstr: "sha256 is required",
		},
		{
			name: "direct with library",
			config: completeRuntimeConfig(
				validExtension+"\nlibrary = \"lib.so\"",
				"",
			),
			wantSubstr: "library is only valid",
		},
		{
			name: "bad archive library",
			config: completeRuntimeConfig(
				"[[sqlite.extensions]]\nsource = \"https://example.test/a.zip\"\n"+
					"library = \"../lib.so\"\nentrypoint = \"init\"\n"+
					"sha256 = \""+strings.Repeat("0", 64)+"\"",
				"",
			),
			wantSubstr: "safe relative",
		},
		{
			name: "bad sha",
			config: completeRuntimeConfig(
				"[[sqlite.extensions]]\nsource = \"https://example.test/a.so\"\nentrypoint = \"init\"\n"+
					"sha256 = \""+strings.Repeat("A", 64)+"\"",
				"",
			),
			wantSubstr: "lowercase",
		},
		{
			name:       "invalid base url",
			config:     strings.Replace(valid, "https://example.test/v1", "https://example.test/v1?q=1", 1),
			wantSubstr: "query or fragment",
		},
		{
			name:       "invalid dimensions",
			config:     strings.Replace(valid, "dimensions = 8", "dimensions = 0", 1),
			wantSubstr: "dimensions",
		},
		{
			name:       "invalid similarity",
			config:     strings.Replace(valid, "similarity = \"cosine\"", "similarity = \"dot\"", 1),
			wantSubstr: "similarity",
		},
		{
			name:       "missing api key env field",
			config:     strings.Replace(valid, "api_key_env = \"\"\n", "", 1),
			wantSubstr: "embedding.api_key_env",
		},
		{
			name:       "missing api key environment value",
			config:     strings.Replace(valid, "api_key_env = \"\"", "api_key_env = \"MISSING_KEY\"", 1),
			lookup:     func(string) (string, bool) { return "", false },
			wantSubstr: "not set or empty",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			writeConfig(t, paths, test.config)
			lookup := test.lookup
			if lookup == nil {
				lookup = func(string) (string, bool) { return "", false }
			}
			_, err := LoadConfig(paths, lookup)
			if err == nil || !strings.Contains(err.Error(), test.wantSubstr) {
				t.Fatalf("error = %v, want substring %q", err, test.wantSubstr)
			}
		})
	}
}

func completeRuntimeConfig(extensionBlock, suffix string) string {
	parts := []string{
		"[server]",
		"host = \"127.0.0.1\"",
		"port = 4765",
		"",
		"[cache]",
		"path = \"cache/openai-compatible.db\"",
		"max_size_mb = 4096",
		"",
	}
	if extensionBlock != "" {
		parts = append(parts, extensionBlock, "")
	}
	parts = append(parts,
		"[fulltext]",
		"analyzer = \"unicode61\"",
		"",
		"[embedding]",
		"base_url = \"https://example.test/v1\"",
		"model = \"fixture\"",
		"dimensions = 8",
		"similarity = \"cosine\"",
		"api_key_env = \"\"",
	)
	return strings.Join(parts, "\n") + "\n" + suffix
}

func TestLoadOrCreateCredentialCreatesAndReusesToken(t *testing.T) {
	paths := testProfilePaths(t)
	credential, err := LoadOrCreateCredential(paths)
	if err != nil {
		t.Fatalf("create credential: %v", err)
	}
	decoded, err := base64.RawURLEncoding.DecodeString(credential.Token)
	if err != nil {
		t.Fatalf("decode token: %v", err)
	}
	if len(decoded) != credentialEntropyBytes {
		t.Fatalf("token entropy bytes = %d", len(decoded))
	}
	info, err := os.Stat(paths.Auth)
	if err != nil {
		t.Fatalf("stat auth.json: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Fatalf("auth.json mode = %o", info.Mode().Perm())
	}
	reloaded, err := LoadOrCreateCredential(paths)
	if err != nil {
		t.Fatalf("reload credential: %v", err)
	}
	if reloaded.Token != credential.Token {
		t.Fatal("credential rotated on restart")
	}
}

func TestLoadOrCreateCredentialFailsClosed(t *testing.T) {
	paths := testProfilePaths(t)
	tests := []struct {
		name string
		body string
	}{
		{name: "malformed", body: "{"},
		{name: "empty", body: "{\"token\":\"\"}\n"},
		{name: "unknown", body: "{\"token\":\"x\",\"extra\":true}\n"},
		{name: "trailing", body: "{\"token\":\"x\"}\n{}\n"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := os.WriteFile(paths.Auth, []byte(test.body), 0o600); err != nil {
				t.Fatalf("write auth fixture: %v", err)
			}
			if _, err := LoadOrCreateCredential(paths); err == nil {
				t.Fatal("invalid auth.json was accepted")
			}
			_ = os.Remove(paths.Auth)
		})
	}
	if runtime.GOOS != "windows" {
		if err := os.WriteFile(paths.Auth, []byte("{\"token\":\"x\"}\n"), 0o644); err != nil {
			t.Fatalf("write insecure auth fixture: %v", err)
		}
		if _, err := LoadOrCreateCredential(paths); err == nil || !strings.Contains(err.Error(), "0600") {
			t.Fatalf("insecure permissions error = %v", err)
		}
	}
}

func TestCreateCredentialPropagatesRandomFailure(t *testing.T) {
	paths := testProfilePaths(t)
	_, err := createCredential(paths.Auth, errorReader{})
	if err == nil || !strings.Contains(err.Error(), "generate auth token") {
		t.Fatalf("error = %v", err)
	}
}

func TestInstanceLockLifecycle(t *testing.T) {
	paths := testProfilePaths(t)
	if err := os.WriteFile(paths.Lock, []byte("stale"), 0o600); err != nil {
		t.Fatalf("write stale lock: %v", err)
	}
	lock, err := AcquireLock(paths.Lock)
	if err != nil {
		t.Fatalf("acquire lock: %v", err)
	}
	content, err := os.ReadFile(paths.Lock)
	if err != nil {
		t.Fatalf("read cleared lock: %v", err)
	}
	if len(content) != 0 {
		t.Fatalf("stale lock content survived: %q", content)
	}
	if _, err := lock.Endpoint(); err == nil {
		t.Fatal("empty lock content exposed an endpoint")
	}
	if _, err := AcquireLock(paths.Lock); !errors.Is(err, ErrLocked) {
		t.Fatalf("second acquire error = %v", err)
	}
	const endpoint = "http://127.0.0.1:4765"
	if err := lock.PublishEndpoint(endpoint); err != nil {
		t.Fatalf("publish endpoint: %v", err)
	}
	gotEndpoint, err := lock.Endpoint()
	if err != nil {
		t.Fatalf("read endpoint: %v", err)
	}
	if gotEndpoint != endpoint {
		t.Fatalf("endpoint = %q", gotEndpoint)
	}
	if err := lock.Close(); err != nil {
		t.Fatalf("close lock: %v", err)
	}
	if err := lock.Close(); err != nil {
		t.Fatalf("close lock twice: %v", err)
	}
	if err := lock.PublishEndpoint(endpoint); !errors.Is(err, os.ErrClosed) {
		t.Fatalf("publish after close error = %v", err)
	}
	reacquired, err := AcquireLock(paths.Lock)
	if err != nil {
		t.Fatalf("reacquire lock: %v", err)
	}
	if err := reacquired.Close(); err != nil {
		t.Fatalf("close reacquired lock: %v", err)
	}
}

func testProfilePaths(t *testing.T) Paths {
	t.Helper()
	paths, err := ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatalf("resolve test profile: %v", err)
	}
	if err := EnsureDirectories(paths); err != nil {
		t.Fatalf("create test profile: %v", err)
	}
	return paths
}

func writeConfig(t *testing.T, paths Paths, body string) {
	t.Helper()
	if err := os.WriteFile(paths.Config, []byte(body), 0o600); err != nil {
		t.Fatalf("write config.toml: %v", err)
	}
}

func quoteTOML(value string) string {
	return "\"" + strings.ReplaceAll(value, "\\", "\\\\") + "\""
}

type errorReader struct{}

func (errorReader) Read([]byte) (int, error) {
	return 0, errors.New("fixture random failure")
}
