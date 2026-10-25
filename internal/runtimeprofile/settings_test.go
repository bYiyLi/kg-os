package runtimeprofile

import (
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
)

func settingsFixture(t *testing.T, keyEnv string) (*SettingsStore, Paths) {
	t.Helper()
	paths := testProfilePaths(t)
	body := "[server]\npublic_origin = \"https://kg.example.com\"\n" + strings.Replace(completeRuntimeConfig("", ""), "api_key_env = \"\"", "api_key_env = "+quoteTOML(keyEnv), 1)
	writeConfig(t, paths, body)
	config, err := LoadConfig(paths)
	if err != nil {
		t.Fatal(err)
	}
	if keyEnv == WebEmbeddingKeyEnv {
		t.Setenv(keyEnv, "original-private-key")
		if err = WriteWebEmbeddingKey(paths, "original-private-key"); err != nil {
			t.Fatal(err)
		}
	}
	return NewSettingsStore(paths, config), paths
}

func TestSettingsReadDistinguishesSavedAndEffectiveWithoutSecrets(t *testing.T) {
	store, _ := settingsFixture(t, WebEmbeddingKeyEnv)
	state, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	if state.PendingRestart || state.Credential.PendingRestart || !state.Credential.Configured || !state.Credential.CanUpdate ||
		state.Credential.Source != "private_file" || state.Saved.Cache.Path != RecommendedCachePath || !filepath.IsAbs(state.Effective.Cache.Path) {
		t.Fatalf("unexpected state: %#v", state)
	}
	body, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "original-private-key") || strings.Contains(string(body), "APIKeyEnv") ||
		!strings.Contains(string(body), `"extensions":[]`) || !strings.Contains(string(body), `"api_key_env"`) {
		t.Fatalf("invalid public settings shape: %s", body)
	}
	state.Effective.Server.PublicOrigin = "https://untrusted.example.com"
	state.Saved.Cache.Path = "changed"
	again, err := store.Read()
	if err != nil || again.Effective.Server.PublicOrigin != "https://kg.example.com" || again.Saved.Cache.Path != RecommendedCachePath {
		t.Fatalf("caller mutated store: %#v %v", again, err)
	}
}

func TestSettingsUpdatePersistsOnlyMutableGroupsAndRequiresRestart(t *testing.T) {
	store, paths := settingsFixture(t, "")
	before, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	ext := ExtensionConfig{Source: "https://example.com/extension.so", Entrypoint: "sqlite3_fixture_init", SHA256: strings.Repeat("a", 64)}
	after, err := store.Update(before.Revision, SettingsPatch{
		Server: &ServerConfig{PublicOrigin: "https://new.example.com/"},
		Cache:  &CacheConfig{Path: "cache/new.db", MaxSizeMB: 123},
		SQLite: &SQLiteConfig{Extensions: []ExtensionConfig{ext}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !after.PendingRestart || before.Revision == after.Revision || after.Saved.Server.PublicOrigin != "https://new.example.com" ||
		after.Saved.Cache.Path != "cache/new.db" || after.Saved.Cache.MaxSizeMB != 123 || len(after.Saved.SQLite.Extensions) != 1 {
		t.Fatalf("update not persisted: %#v", after)
	}
	if !reflect.DeepEqual(after.Effective, before.Effective) || after.Saved.Embedding != before.Saved.Embedding || after.Saved.FullText != before.Saved.FullText {
		t.Fatal("update changed effective or immutable configuration")
	}
	loaded, err := LoadConfig(paths)
	if err != nil || loaded.Cache.MaxSizeMB != 123 || !strings.HasSuffix(loaded.Cache.Path, "cache/new.db") {
		t.Fatalf("cannot restart with saved configuration: %#v %v", loaded, err)
	}
	info, err := os.Stat(paths.Config)
	if err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
		t.Fatalf("saved config not private: %v %v", info, err)
	}
	if _, err = store.Update(before.Revision, SettingsPatch{Server: &ServerConfig{PublicOrigin: "https://stale.example.com"}}); !errors.Is(err, ErrSettingsConflict) {
		t.Fatalf("stale save accepted: %v", err)
	}
}

func TestSettingsInvalidUpdatesAndExternalChangesDoNotOverwrite(t *testing.T) {
	store, paths := settingsFixture(t, "")
	state, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(paths.Config)
	if err != nil {
		t.Fatal(err)
	}
	invalid := []SettingsPatch{
		{},
		{Server: &ServerConfig{PublicOrigin: "http://public.example.com"}},
		{Cache: &CacheConfig{Path: "kgos.db", MaxSizeMB: 10}},
		{Cache: &CacheConfig{Path: "cache/new.db", MaxSizeMB: 0}},
		{SQLite: &SQLiteConfig{Extensions: []ExtensionConfig{{Source: "relative.so", Entrypoint: "init"}}}},
	}
	for _, patch := range invalid {
		if _, err = store.Update(state.Revision, patch); !errors.Is(err, ErrSettingsInvalid) {
			t.Fatalf("invalid patch not rejected: %#v %v", patch, err)
		}
		body, readErr := os.ReadFile(paths.Config)
		if readErr != nil || string(body) != string(original) {
			t.Fatal("failed update changed original config")
		}
	}
	external := append(original, []byte("\n# external operator edit\n")...)
	if err = os.WriteFile(paths.Config, external, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Update(state.Revision, SettingsPatch{Cache: &CacheConfig{Path: "cache/overwritten.db", MaxSizeMB: 1}}); !errors.Is(err, ErrSettingsConflict) {
		t.Fatalf("external edit not detected: %v", err)
	}
	body, err := os.ReadFile(paths.Config)
	if err != nil || string(body) != string(external) {
		t.Fatal("external edit was overwritten")
	}
}

func TestSettingsPrivateCredentialRotationIsIsolatedAndRevisionProtected(t *testing.T) {
	store, paths := settingsFixture(t, WebEmbeddingKeyEnv)
	before, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(paths.Config)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"", "bad\ncredential", strings.Repeat("k", 8193)} {
		if _, err = store.UpdateEmbeddingKey(before.Revision, key); !errors.Is(err, ErrSettingsInvalid) {
			t.Fatalf("invalid key accepted: %v", err)
		}
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, key := range []string{"replacement-one", "replacement-two"} {
		wg.Go(func() {
			_, updateErr := store.UpdateEmbeddingKey(before.Revision, key)
			results <- updateErr
		})
	}
	wg.Wait()
	close(results)
	successes, conflicts := 0, 0
	for updateErr := range results {
		switch {
		case updateErr == nil:
			successes++
		case errors.Is(updateErr, ErrSettingsConflict):
			conflicts++
		default:
			t.Fatalf("unexpected update error: %v", updateErr)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent rotations: %d succeeded, %d conflicted", successes, conflicts)
	}
	after, err := store.Read()
	if err != nil || !after.PendingRestart || !after.Credential.PendingRestart || after.Revision == before.Revision {
		t.Fatalf("rotation state incorrect: %#v %v", after, err)
	}
	if os.Getenv(WebEmbeddingKeyEnv) != "original-private-key" {
		t.Fatal("rotation hot-reloaded the active credential")
	}
	config, err := os.ReadFile(paths.Config)
	if err != nil || string(config) != string(original) {
		t.Fatal("credential rotation changed config")
	}
	keyPath := filepath.Join(paths.Root, webEmbeddingKeyFile)
	info, err := os.Stat(keyPath)
	if err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
		t.Fatalf("rotation created unsafe file: %v %v", info, err)
	}
}

func TestSettingsExternalCredentialsCannotBeManagedByWeb(t *testing.T) {
	t.Setenv("SETTINGS_TEST_EXTERNAL_KEY", "external-credential")
	for _, env := range []string{"", "SETTINGS_TEST_EXTERNAL_KEY"} {
		store, paths := settingsFixture(t, env)
		before, err := store.Read()
		if err != nil {
			t.Fatal(err)
		}
		if before.Credential.CanUpdate || before.Credential.Configured != (env != "") {
			t.Fatalf("invalid external credential status: %#v", before.Credential)
		}
		if _, err = store.UpdateEmbeddingKey(before.Revision, "web-takeover"); !errors.Is(err, ErrSettingsInvalid) {
			t.Fatalf("external credential overwritten: %v", err)
		}
		if _, err = os.Stat(filepath.Join(paths.Root, webEmbeddingKeyFile)); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("unexpected private key created")
		}
	}
}

func TestSettingsRejectsUnsafeFiles(t *testing.T) {
	store, paths := settingsFixture(t, "")
	original := paths.Config + ".original"
	if err := os.Rename(paths.Config, original); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(original, paths.Config); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Read(); !errors.Is(err, ErrSettingsInvalid) {
		t.Fatalf("symlink config accepted: %v", err)
	}
	privateStore, privatePaths := settingsFixture(t, WebEmbeddingKeyEnv)
	keyPath := filepath.Join(privatePaths.Root, webEmbeddingKeyFile)
	if runtime.GOOS != "windows" {
		if err := os.Chmod(keyPath, 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := privateStore.Read(); !errors.Is(err, ErrSettingsInvalid) {
			t.Fatalf("public credential file accepted: %v", err)
		}
	}
}

func settingsLegacyURLFixture(t *testing.T, sources ...string) (*SettingsStore, Paths) {
	t.Helper()
	paths := testProfilePaths(t)
	blocks := make([]string, 0, len(sources))
	for _, source := range sources {
		blocks = append(blocks, "[[sqlite.extensions]]\nsource = "+quoteTOML(source)+
			"\nentrypoint = \"sqlite3_fixture_init\"\nsha256 = \""+strings.Repeat("a", 64)+"\"")
	}
	body := strings.Replace(completeRuntimeConfig(strings.Join(blocks, "\n"), ""),
		"https://example.test/v1", settingsURLWithCredentials("/v1", "embed-user", "embed-secret"), 1)
	writeConfig(t, paths, body)
	config, err := LoadConfig(paths)
	if err != nil {
		t.Fatal(err)
	}
	return NewSettingsStore(paths, config), paths
}

func settingsURLWithCredentials(path, username, password string) string {
	return (&url.URL{Scheme: "https", Host: "example.test", Path: path, User: url.UserPassword(username, password)}).String()
}

func TestSettingsExtensionRedactedSourceRoundTripPreservesLegacyCredentials(t *testing.T) {
	legacy := settingsURLWithCredentials("/extension.so", "extension-user", "extension-secret")
	store, paths := settingsLegacyURLFixture(t, legacy)
	before, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	extensions := append([]ExtensionConfig{}, before.Saved.SQLite.Extensions...)
	extensions[0].Source = RedactSettingsURL(extensions[0].Source)
	if extensions[0].Source != "https://example.test/extension.so" {
		t.Fatalf("invalid redacted URL: %s", extensions[0].Source)
	}
	if _, err = store.Update(before.Revision, SettingsPatch{SQLite: &SQLiteConfig{Extensions: extensions}}); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadConfig(paths)
	if err != nil || loaded.SQLite.Extensions[0].Source != legacy {
		t.Fatalf("legacy extension credentials changed: %#v %v", loaded.SQLite.Extensions, err)
	}
	if extensions[0].Source != "https://example.test/extension.so" {
		t.Fatal("request slice was mutated")
	}
}

func TestSettingsRejectsIncomingURLCredentialsAndAmbiguousLegacySources(t *testing.T) {
	for _, sources := range [][]string{
		{settingsURLWithCredentials("/extension.so", "first", "secret")},
		{settingsURLWithCredentials("/extension.so", "first", "secret"), settingsURLWithCredentials("/extension.so", "second", "other")},
	} {
		store, paths := settingsLegacyURLFixture(t, sources...)
		before, err := store.Read()
		if err != nil {
			t.Fatal(err)
		}
		original, err := os.ReadFile(paths.Config)
		if err != nil {
			t.Fatal(err)
		}
		incoming := before.Saved.SQLite.Extensions[0]
		incoming.Source = settingsURLWithCredentials("/new.so", "new-user", "new-secret")
		if len(sources) > 1 {
			incoming.Source = "https://example.test/extension.so"
		}
		if _, err = store.Update(before.Revision, SettingsPatch{SQLite: &SQLiteConfig{Extensions: []ExtensionConfig{incoming}}}); !errors.Is(err, ErrSettingsInvalid) {
			t.Fatalf("unsafe or ambiguous source accepted: %v", err)
		}
		actual, err := os.ReadFile(paths.Config)
		if err != nil || string(actual) != string(original) {
			t.Fatal("rejected source update changed configuration")
		}
	}
}

func TestSettingsCacheUpdatePreservesLegacyURLs(t *testing.T) {
	legacy := settingsURLWithCredentials("/extension.so", "old-user", "old-secret")
	store, paths := settingsLegacyURLFixture(t, legacy)
	before, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.Update(before.Revision, SettingsPatch{Cache: &CacheConfig{Path: "cache/updated.db", MaxSizeMB: 32}}); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadConfig(paths)
	if err != nil || loaded.SQLite.Extensions[0].Source != legacy || loaded.Embedding.BaseURL != before.Saved.Embedding.BaseURL {
		t.Fatalf("unrelated URL changed: %#v %v", loaded, err)
	}
	if RedactSettingsURL(loaded.Embedding.BaseURL) != "https://example.test/v1" ||
		RedactSettingsURL("/local/file@name.so") != "/local/file@name.so" ||
		RedactSettingsURL("//user@host/path") != "//user@host/path" {
		t.Fatal("URL redaction altered paths or retained credentials")
	}
	if _, err = restoreSettingsExtensionSources([]ExtensionConfig{{Source: "//user@host/path"}}, nil); err != nil {
		t.Fatalf("absolute local path mistaken for credentials: %v", err)
	}
}

func TestSettingsUnavailableConfigCannotBeOverwritten(t *testing.T) {
	for _, problem := range []string{"missing", "malformed", "oversized"} {
		t.Run(problem, func(t *testing.T) {
			store, paths := settingsFixture(t, "")
			before, err := store.Read()
			if err != nil {
				t.Fatal(err)
			}
			var body []byte
			switch problem {
			case "missing":
				err = os.Remove(paths.Config)
			case "malformed":
				body = []byte("[embedding\ninvalid")
				err = os.WriteFile(paths.Config, body, 0o600)
			case "oversized":
				body = []byte(strings.Repeat("x", maxSettingsConfigBytes+1))
				err = os.WriteFile(paths.Config, body, 0o600)
			}
			if err != nil {
				t.Fatal(err)
			}
			if _, err = store.Read(); err == nil {
				t.Fatal("unavailable configuration was accepted")
			}
			if _, err = store.Update(before.Revision, SettingsPatch{Cache: &CacheConfig{Path: "cache/new.db", MaxSizeMB: 1}}); err == nil {
				t.Fatal("update replaced unavailable configuration")
			}
			actual, readErr := os.ReadFile(paths.Config)
			if problem == "missing" {
				if !errors.Is(readErr, os.ErrNotExist) {
					t.Fatalf("missing config was recreated: %v", readErr)
				}
			} else if readErr != nil || string(actual) != string(body) {
				t.Fatal("failed update overwrote invalid file")
			}
		})
	}
}

func TestSettingsUnavailablePrivateKeyCannotBeReplaced(t *testing.T) {
	for _, problem := range []string{"missing", "malformed", "empty", "oversized"} {
		t.Run(problem, func(t *testing.T) {
			store, paths := settingsFixture(t, WebEmbeddingKeyEnv)
			before, err := store.Read()
			if err != nil {
				t.Fatal(err)
			}
			keyPath := filepath.Join(paths.Root, webEmbeddingKeyFile)
			var body []byte
			switch problem {
			case "missing":
				err = os.Remove(keyPath)
			case "malformed":
				body = []byte("unexpected\ncredential")
				err = os.WriteFile(keyPath, body, 0o600)
			case "empty":
				body = []byte{}
				err = os.WriteFile(keyPath, body, 0o600)
			case "oversized":
				body = []byte(strings.Repeat("x", 8193))
				err = os.WriteFile(keyPath, body, 0o600)
			}
			if err != nil {
				t.Fatal(err)
			}
			state, readErr := store.Read()
			if problem == "missing" {
				if readErr != nil || state.Credential.CanUpdate || !state.Credential.PendingRestart {
					t.Fatalf("missing credential status incorrect: %#v %v", state.Credential, readErr)
				}
			} else if !errors.Is(readErr, ErrSettingsInvalid) {
				t.Fatalf("invalid private key accepted: %v", readErr)
			}
			if _, err = store.UpdateEmbeddingKey(before.Revision, "replacement"); err == nil {
				t.Fatal("unsafe or missing private key replaced")
			}
			actual, actualErr := os.ReadFile(keyPath)
			if problem == "missing" {
				if !errors.Is(actualErr, os.ErrNotExist) {
					t.Fatal("missing private key recreated")
				}
			} else if actualErr != nil || string(actual) != string(body) {
				t.Fatal("invalid private key overwritten")
			}
		})
	}
}

func TestSettingsAtomicPublicationFailuresPreserveOriginal(t *testing.T) {
	store, paths := settingsFixture(t, "")
	before, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(paths.Config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = readSettingsFile(filepath.Join(paths.Config, "child"), 10, false); err == nil {
		t.Fatal("non-directory settings path accepted")
	}
	store.paths.Root = paths.Config
	if err = store.replaceLocked(paths.Config, []byte("replacement"), before.Revision); err == nil {
		t.Fatal("temporary file created under non-directory root")
	}
	store.paths.Root = paths.Root
	if err = store.replaceLocked(paths.Config, []byte("replacement"), "stale"); !errors.Is(err, ErrSettingsConflict) {
		t.Fatalf("publication ignored revision: %v", err)
	}
	directory := filepath.Join(paths.Root, "publication-target")
	if err = os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err = store.replaceLocked(directory, []byte("replacement"), before.Revision); err == nil {
		t.Fatal("regular settings file replaced a directory")
	}
	actual, err := os.ReadFile(paths.Config)
	if err != nil || string(actual) != string(original) {
		t.Fatal("publication failure changed original configuration")
	}
	leftovers, err := filepath.Glob(filepath.Join(paths.Root, ".settings-*"))
	if err != nil || len(leftovers) != 0 {
		t.Fatalf("publication failure left temporary files: %v %v", leftovers, err)
	}
}

func TestSettingsOversizedPatchDoesNotPublishUnreadableConfig(t *testing.T) {
	store, paths := settingsFixture(t, "")
	before, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(paths.Config)
	if err != nil {
		t.Fatal(err)
	}
	patch := SettingsPatch{Cache: &CacheConfig{Path: strings.Repeat("x", maxSettingsConfigBytes), MaxSizeMB: 1}}
	if _, err = store.Update(before.Revision, patch); !errors.Is(err, ErrSettingsInvalid) {
		t.Fatalf("oversized patch accepted: %v", err)
	}
	actual, err := os.ReadFile(paths.Config)
	if err != nil || string(actual) != string(original) {
		t.Fatal("oversized patch replaced original configuration")
	}
}

func TestSettingsPermissionFailuresPreserveExistingFiles(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("requires Unix permission enforcement for the current unprivileged user")
	}
	store, paths := settingsFixture(t, WebEmbeddingKeyEnv)
	before, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(paths.Config, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(paths.Root, 0o700); _ = os.Chmod(paths.Config, 0o600) })
	if _, err = store.Read(); err == nil {
		t.Fatal("unreadable configuration was accepted")
	}
	if err = os.Chmod(paths.Config, 0o600); err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(paths.Root, 0o500); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Update(before.Revision, SettingsPatch{Cache: &CacheConfig{Path: "cache/rejected.db", MaxSizeMB: 1}}); err == nil {
		t.Fatal("configuration updated despite non-writable instance directory")
	}
	if _, err = store.UpdateEmbeddingKey(before.Revision, "replacement"); err == nil {
		t.Fatal("private key updated despite non-writable instance directory")
	}
	after, err := store.Read()
	if err != nil || after.Revision != before.Revision || after.PendingRestart {
		t.Fatalf("failed publication changed settings: %#v %v", after, err)
	}
}
