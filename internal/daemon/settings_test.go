package daemon

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

const settingsTestConfig = `[server]
public_origin = "https://kg.example.com"
[cache]
path = "cache/provider.db"
max_size_mb = 4096
[fulltext]
analyzer = "jieba"
[embedding]
base_url = "https://api.example.com/v1"
model = "embedding-model"
dimensions = 1536
similarity = "cosine"
api_key_env = ""
`

func settingsAPI(t *testing.T, options SettingsOptions, privateKey bool) (http.Handler, webAuthResponse, runtimeprofile.Paths) {
	t.Helper()
	paths, err := runtimeprofile.ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	body := settingsTestConfig
	if privateKey {
		t.Setenv(runtimeprofile.WebEmbeddingKeyEnv, "initial-private-key")
		body = strings.Replace(body, `api_key_env = ""`, `api_key_env = "`+runtimeprofile.WebEmbeddingKeyEnv+`"`, 1)
		if err = runtimeprofile.WriteWebEmbeddingKey(paths, "initial-private-key"); err != nil {
			t.Fatal(err)
		}
	}
	if err = os.WriteFile(paths.Config, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	config, err := runtimeprofile.LoadConfig(paths)
	if err != nil {
		t.Fatal(err)
	}
	rt := &runtimehost.Runtime{Paths: paths, Config: config, Credential: runtimeprofile.Credential{Token: "settings-root-secret"}}
	handler := NewHandlerWithSettings(rt, http.NotFoundHandler(), options)
	login := sessionRequest(handler, "/api/v1/web/auth/login", rt.Credential.Token, "", "", sessionTestOrigin)
	return handler, sessionResult(t, login), paths
}

func settingsRequest(handler http.Handler, access webAuthResponse, action, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, sessionTestOrigin+"/api/v1/web/settings/"+action, strings.NewReader(body))
	r.Header.Set("Origin", sessionTestOrigin)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+access.AccessToken)
	r.Header.Set(expectedDaemonBootHeader, access.DaemonBootID)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func settingsResult(t *testing.T, result *httptest.ResponseRecorder) settingsSnapshot {
	t.Helper()
	if result.Code != http.StatusOK {
		t.Fatalf("settings status %d: %s", result.Code, result.Body.String())
	}
	var state settingsSnapshot
	if err := json.Unmarshal(result.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	return state
}

func TestSettingsReadAndSaveUseRealConfigAndKeepEffectiveState(t *testing.T) {
	t.Parallel()
	options := SettingsOptions{MCPPath: "/custom-mcp", Parameters: []SettingsParameter{{Key: "mcp-max-concurrency", Value: "5", Source: "--mcp-max-concurrency"}}, Endpoint: func() (string, error) { return "http://127.0.0.1:4567", nil }}
	handler, access, paths := settingsAPI(t, options, false)
	read := settingsRequest(handler, access, "read", "{}")
	state := settingsResult(t, read)
	if state.Saved.Cache.Path != "cache/provider.db" || state.Effective.Cache.Path == state.Saved.Cache.Path || state.PendingRestart || state.Runtime.MCPPath != "/custom-mcp" || state.DatabasePath != paths.Database || len(state.Runtime.Parameters) != 1 {
		t.Fatalf("incorrect settings snapshot: %+v", state)
	}
	if !strings.Contains(read.Body.String(), `"extensions":[]`) || !strings.Contains(read.Body.String(), `"base_url":`) || read.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("incorrect JSON/header shape: %s", read.Body.String())
	}
	payload := `{"revision":"` + state.Revision + `","server":{"public_origin":"https://changed.example.com"}}`
	saved := settingsResult(t, settingsRequest(handler, access, "update", payload))
	if !saved.PendingRestart || saved.Saved.Server.PublicOrigin != "https://changed.example.com" || saved.Effective.Server.PublicOrigin != "https://kg.example.com" {
		t.Fatalf("save confused effective and pending values: %+v", saved)
	}
	if retry := settingsRequest(handler, access, "update", payload); retry.Code != http.StatusConflict {
		t.Fatalf("stale update status=%d", retry.Code)
	}
	body, err := os.ReadFile(paths.Config)
	if err != nil || !strings.Contains(string(body), "changed.example.com") || !strings.Contains(string(body), "embedding-model") {
		t.Fatalf("persistence failed: %v", err)
	}
	immutable := settingsRequest(handler, access, "update", `{"revision":"`+saved.Revision+`","embedding":{"model":"replacement"}}`)
	if immutable.Code != http.StatusBadRequest {
		t.Fatalf("immutable config accepted: %d", immutable.Code)
	}
}

func TestSettingsRequireAuthenticationOriginAndBoot(t *testing.T) {
	t.Parallel()
	handler, access, _ := settingsAPI(t, SettingsOptions{}, false)
	for _, test := range []struct {
		token, boot, origin string
		want                int
	}{
		{"", access.DaemonBootID, sessionTestOrigin, http.StatusUnauthorized},
		{"settings-root-secret", "", sessionTestOrigin, http.StatusConflict},
		{"settings-root-secret", access.DaemonBootID, "https://other.example.com", http.StatusForbidden},
		{"settings-root-secret", "wrong-boot", sessionTestOrigin, http.StatusConflict},
	} {
		r := httptest.NewRequest(http.MethodPost, sessionTestOrigin+"/api/v1/web/settings/read", strings.NewReader("{}"))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+test.token)
		r.Header.Set("Origin", test.origin)
		r.Header.Set(expectedDaemonBootHeader, test.boot)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != test.want || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("boundary status=%d want=%d headers=%v", w.Code, test.want, w.Header())
		}
	}
}

func TestSettingsPrivateKeyUpdateDoesNotExposeOrActivateSecret(t *testing.T) {
	handler, access, _ := settingsAPI(t, SettingsOptions{}, true)
	state := settingsResult(t, settingsRequest(handler, access, "read", "{}"))
	response := settingsRequest(handler, access, "embedding-key", `{"revision":"`+state.Revision+`","apiKey":"replacement-private-key"}`)
	updated := settingsResult(t, response)
	if !updated.Credential.CanUpdate || !updated.Credential.PendingRestart || !updated.PendingRestart || updated.Credential.Source != "private_file" {
		t.Fatalf("incorrect credential state: %+v", updated.Credential)
	}
	if strings.Contains(response.Body.String(), "replacement-private-key") || strings.Contains(response.Body.String(), "initial-private-key") || strings.Contains(response.Body.String(), "settings-root-secret") {
		t.Fatal("settings response leaked credentials")
	}
	if os.Getenv(runtimeprofile.WebEmbeddingKeyEnv) != "initial-private-key" {
		t.Fatal("file update changed current process credential")
	}
}

func TestSettingsProbeUsesCallbackAndBoundsConcurrentWork(t *testing.T) {
	t.Parallel()
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	options := SettingsOptions{ProbeEmbedding: func(ctx context.Context) SettingsProbeResult {
		calls.Add(1)
		close(started)
		select {
		case <-release:
		case <-ctx.Done():
		}
		return SettingsProbeResult{OK: true, Dimensions: 1536}
	}}
	handler, access, _ := settingsAPI(t, options, false)
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- settingsRequest(handler, access, "test-embedding", "{}") }()
	<-started
	busy := settingsRequest(handler, access, "test-embedding", "{}")
	if busy.Code != http.StatusTooManyRequests || !strings.Contains(busy.Body.String(), `"reason":"busy"`) {
		t.Fatalf("probe concurrency unbounded: %d %s", busy.Code, busy.Body.String())
	}
	close(release)
	result := <-done
	if result.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(result.Body.String(), `"dimensions":1536`) {
		t.Fatalf("probe callback failed: %d %s", result.Code, result.Body.String())
	}
}

func TestSettingsResponsesRedactLegacyURLCredentialsWithoutChangingPersistence(t *testing.T) {
	t.Parallel()
	paths, err := runtimeprofile.ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	embeddingURL := (&url.URL{Scheme: "https", Host: "api.example.com", Path: "/v1", User: url.UserPassword("embedding-user", "embedding-password")}).String()
	extensionURL := (&url.URL{Scheme: "https", Host: "downloads.example.com", Path: "/tool.so", User: url.UserPassword("extension-user", "extension-password")}).String()
	body := strings.Replace(settingsTestConfig, "https://api.example.com/v1", embeddingURL, 1) +
		"\n[[sqlite.extensions]]\nsource = \"" + extensionURL + "\"\nentrypoint = \"sqlite3_custom_init\"\nsha256 = \"" + strings.Repeat("0", 64) + "\"\n"
	if err = os.WriteFile(paths.Config, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	config, err := runtimeprofile.LoadConfig(paths)
	if err != nil {
		t.Fatal(err)
	}
	rt := &runtimehost.Runtime{Paths: paths, Config: config, Credential: runtimeprofile.Credential{Token: "settings-root-secret"}}
	handler := NewHandlerWithSettings(rt, http.NotFoundHandler(), SettingsOptions{})
	access := sessionResult(t, sessionRequest(handler, "/api/v1/web/auth/login", rt.Credential.Token, "", "", sessionTestOrigin))
	read := settingsRequest(handler, access, "read", "{}")
	state := settingsResult(t, read)
	assertRedacted := func(response *httptest.ResponseRecorder) {
		t.Helper()
		for _, secret := range []string{"embedding-user", "embedding-password", "extension-user", "extension-password"} {
			if strings.Contains(response.Body.String(), secret) {
				t.Fatal("settings response exposed legacy URL credentials")
			}
		}
	}
	assertRedacted(read)
	if state.Effective.Embedding.BaseURL != "https://api.example.com/v1" || state.Saved.SQLite.Extensions[0].Source != "https://downloads.example.com/tool.so" {
		t.Fatal("settings URL projection changed endpoint structure")
	}
	cache := settingsRequest(handler, access, "update", `{"revision":"`+state.Revision+`","cache":{"path":"cache/provider.db","max_size_mb":2048}}`)
	state = settingsResult(t, cache)
	assertRedacted(cache)
	state.Saved.SQLite.Extensions[0].Entrypoint = "sqlite3_updated_init"
	payload, err := json.Marshal(struct {
		Revision string                      `json:"revision"`
		SQLite   runtimeprofile.SQLiteConfig `json:"sqlite"`
	}{state.Revision, state.Saved.SQLite})
	if err != nil {
		t.Fatal(err)
	}
	updated := settingsRequest(handler, access, "update", string(payload))
	settingsResult(t, updated)
	assertRedacted(updated)
	persisted, err := runtimeprofile.LoadConfig(paths)
	if err != nil || persisted.Embedding.BaseURL != embeddingURL || persisted.SQLite.Extensions[0].Source != extensionURL || persisted.SQLite.Extensions[0].Entrypoint != "sqlite3_updated_init" || persisted.Cache.MaxSizeMB != 2048 {
		t.Fatal("redacted configuration round-trip changed legacy credential sources")
	}
}
