package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func newTestSetup(t *testing.T) *setupController {
	t.Helper()
	eval := command.EvaluateKGOSD([]string{"--root", t.TempDir()})
	c, err := newSetupController(context.Background(), eval)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	return c
}

func setupTestRequest(c *setupController, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "http://127.0.0.1:4173"+path, strings.NewReader(body))
	if method == http.MethodPost {
		req.Header.Set("Origin", "http://127.0.0.1:4173")
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	c.ServeHTTP(w, req)
	return w
}

func mustCreateSetupToken(t *testing.T, c *setupController) string {
	t.Helper()
	response := setupTestRequest(c, http.MethodPost, "/api/v1/setup/rotate-token", "", "")
	if response.Code != http.StatusCreated {
		t.Fatalf("first token creation: %d %s", response.Code, response.Body.String())
	}
	var token runtimeprofile.Credential
	if err := json.Unmarshal(response.Body.Bytes(), &token); err != nil || token.Token == "" {
		t.Fatal("token creation response invalid")
	}
	return token.Token
}

func TestRestrictedSetupGateAndFirstTokenClaim(t *testing.T) {
	c := newTestSetup(t)
	status := setupTestRequest(c, "GET", "/api/v1/setup/status", "", "")
	if status.Code != 200 || !strings.Contains(status.Body.String(), "setup_required") {
		t.Fatalf("status = %d %s", status.Code, status.Body.String())
	}
	for _, tok := range []string{"", "wrong"} {
		rejected := setupTestRequest(c, "POST", "/api/v1/evolution/overview", tok, "{}")
		if rejected.Code != 503 || !strings.Contains(rejected.Body.String(), "INSTANCE_NOT_INITIALIZED") {
			t.Fatalf("business before ready = %d %s", rejected.Code, rejected.Body.String())
		}
	}
	home := setupTestRequest(c, "GET", "/", "", "")
	if home.Code != 302 || home.Header().Get("Location") != "/setup" {
		t.Fatalf("home = %d %q", home.Code, home.Header().Get("Location"))
	}
	if page := setupTestRequest(c, "GET", "/setup", "", ""); page.Code != 200 {
		t.Fatalf("setup Web unavailable: %d %q", page.Code, page.Body.String())
	}
	claim := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", "")
	if claim.Code != 201 || claim.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("claim = %d %s", claim.Code, claim.Body.String())
	}
	var got struct{ Token string }
	if err := json.Unmarshal(claim.Body.Bytes(), &got); err != nil || len(got.Token) != 43 {
		t.Fatal("missing one-time token")
	}
	if second := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", ""); second.Code != 401 ||
		strings.Contains(second.Body.String(), got.Token) {
		t.Fatal("duplicate claim leaked or overwrote token")
	}
	credential, err := runtimeprofile.LoadCredential(c.paths)
	if err != nil || credential.Token != got.Token {
		t.Fatal("root Token changed after first claim")
	}
	if bad := setupTestRequest(c, "POST", "/api/v1/setup/initialize", "", "{}"); bad.Code != 401 {
		t.Fatalf("unauthorized setup = %d", bad.Code)
	}
	if invalid := setupTestRequest(c, "POST", "/api/v1/setup/initialize", got.Token, `{"config":{}}`); invalid.Code != 400 {
		t.Fatalf("invalid config = %d %s", invalid.Code, invalid.Body.String())
	}
	if _, err := os.Stat(c.paths.Config); !os.IsNotExist(err) {
		t.Fatalf("invalid config published: %v", err)
	}
}

func TestPreInitializationTokenRotationRevokesPreviousAccess(t *testing.T) {
	c := newTestSetup(t)
	claim := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", "")
	var first struct{ Token string }
	if err := json.Unmarshal(claim.Body.Bytes(), &first); err != nil || first.Token == "" {
		t.Fatal("first claim failed")
	}
	foreign := httptest.NewRequest("POST", "http://127.0.0.1:4173/api/v1/setup/rotate-token", nil)
	foreign.Header.Set("Origin", "https://untrusted.example")
	foreign.Header.Set("Authorization", "Bearer "+first.Token)
	rejectedOrigin := httptest.NewRecorder()
	c.ServeHTTP(rejectedOrigin, foreign)
	if rejectedOrigin.Code != 403 {
		t.Fatal("cross-origin token rotation was accepted")
	}
	login := setupTestRequest(c, "POST", "/api/v1/web/auth/login", first.Token, "")
	if login.Code != 200 {
		t.Fatalf("initial Web login failed: %d", login.Code)
	}
	var access struct {
		AccessToken  string `json:"accessToken"`
		DaemonBootID string `json:"daemonBootId"`
	}
	if err := json.Unmarshal(login.Body.Bytes(), &access); err != nil || access.AccessToken == "" {
		t.Fatal("invalid Web session response")
	}
	cookies := login.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("Web login did not create a Cookie")
	}
	response := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", first.Token, "")
	if response.Code != 201 || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("authenticated pre-initialization rotation failed: HTTP %d %s", response.Code, response.Body.String())
	}
	var second struct{ Token string }
	if err := json.Unmarshal(response.Body.Bytes(), &second); err != nil ||
		len(second.Token) != 43 || second.Token == first.Token {
		t.Fatal("rotation did not issue a fresh credential")
	}
	if stored, err := runtimeprofile.LoadCredential(c.paths); err != nil || stored.Token != second.Token {
		t.Fatal("rotated credential did not reach auth.json")
	}
	if denied := setupTestRequest(c, "POST", "/api/v1/web/auth/login", first.Token, ""); denied.Code != 401 {
		t.Fatal("old administrator Token still logs in")
	}
	restore := httptest.NewRequest("POST", "http://127.0.0.1:4173/api/v1/web/auth/session", nil)
	restore.Header.Set("Origin", "http://127.0.0.1:4173")
	restore.AddCookie(cookies[0])
	restored := httptest.NewRecorder()
	c.ServeHTTP(restored, restore)
	if restored.Code != 401 {
		t.Fatalf("previous Cookie Session survived rotation: HTTP %d", restored.Code)
	}
	staleRequest := httptest.NewRequest("POST", "http://127.0.0.1:4173/api/v1/setup/initialize", strings.NewReader(validWebSetupPayload()))
	staleRequest.Header.Set("Origin", "http://127.0.0.1:4173")
	staleRequest.Header.Set("Authorization", "Bearer "+access.AccessToken)
	staleRequest.Header.Set("X-KGOS-Expected-Daemon-Boot", access.DaemonBootID)
	staleResponse := httptest.NewRecorder()
	c.ServeHTTP(staleResponse, staleRequest)
	if staleResponse.Code != 401 {
		t.Fatalf("old Web Bearer initialized after rotation: HTTP %d", staleResponse.Code)
	}
	if repeated := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", ""); repeated.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous rotation after claim: %d", repeated.Code)
	}
	if permitted := setupTestRequest(c, "POST", "/api/v1/setup/initialize", second.Token, `{"config":{}}`); permitted.Code != 400 {
		t.Fatal("new Token did not authorize setup validation")
	}
	if _, err := os.Stat(c.paths.Config); !os.IsNotExist(err) {
		t.Fatal("Token rotation unexpectedly published Instance config")
	}
	if rejected := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", ""); rejected.Code != 401 {
		t.Fatal("rotation reopened anonymous claim")
	}
	if err := os.WriteFile(c.paths.Config, []byte("operator-owned"), 0600); err != nil {
		t.Fatal(err)
	}
	if rejected := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", second.Token, ""); rejected.Code != 409 {
		t.Fatal("rotation overwrote a configured Instance")
	}
	if persisted, err := runtimeprofile.LoadCredential(c.paths); err != nil || persisted.Token != second.Token {
		t.Fatal("rejected rotation changed the Token")
	}
}

func TestSetupFileExistingAndReadyCannotOverwrite(t *testing.T) {
	c := newTestSetup(t)
	config := c.paths.Config
	claim := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", "")
	if claim.Code != http.StatusCreated {
		t.Fatal("could not create first Token")
	}
	if err := os.WriteFile(config, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	var token struct{ Token string }
	_ = json.Unmarshal(claim.Body.Bytes(), &token)
	old, err := os.ReadFile(config)
	if err != nil {
		t.Fatal(err)
	}
	payload := `{"config":{"server":{"public_origin":"https://kgos.example.com"},"embedding":{"base_url":"https://api.openai.com/v1","model":"test","dimensions":1536,"similarity":"cosine"},"cache":{"path":"cache/openai-compatible.db","max_size_mb":4096},"fulltext":{"analyzer":"jieba"},"sqlite":{"extensions":[]}},"apiKey":null}`
	w := setupTestRequest(c, "POST", "/api/v1/setup/initialize", token.Token, payload)
	if w.Code != 409 {
		t.Fatalf("existing config status=%d body=%s", w.Code, w.Body.String())
	}
	after, _ := os.ReadFile(config)
	if string(after) != string(old) {
		t.Fatal("existing config overwritten")
	}
	c.mu.Lock()
	c.status = "ready"
	c.business = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	c.mu.Unlock()
	if w := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", token.Token, ""); w.Code != 409 {
		t.Fatal("claim allowed after ready")
	}
	if w := setupTestRequest(c, "GET", "/setup", "", ""); w.Code != 302 {
		t.Fatal("setup UI allowed after ready")
	}
	if w := setupTestRequest(c, "POST", "/api/v1/evolution/overview", "", "{}"); w.Code != 204 {
		t.Fatal("ready handler inaccessible")
	}
	if _, err := os.Stat(filepath.Join(c.paths.Root, "initialized.json")); !os.IsNotExist(err) {
		t.Fatal("test fabricated receipt")
	}
}

func TestInitializedInstanceMissingArtifactIsNotRecreated(t *testing.T) {
	for _, missing := range []string{"credential", "database"} {
		t.Run(missing, func(t *testing.T) {
			root := t.TempDir()
			paths, err := runtimeprofile.ResolvePaths(root)
			if err != nil {
				t.Fatal(err)
			}
			if err = os.MkdirAll(paths.Root, 0o700); err != nil {
				t.Fatal(err)
			}
			if missing != "credential" {
				if _, err = runtimeprofile.LoadOrCreateCredential(paths); err != nil {
					t.Fatal(err)
				}
			}
			if missing != "database" {
				if err = os.WriteFile(paths.Database, []byte("existing-user-data"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if err = runtimeprofile.PublishInitializationReceipt(paths); err != nil {
				t.Fatal(err)
			}
			evaluation := command.EvaluateKGOSD([]string{"--root", root})
			setup, err := newSetupController(context.Background(), evaluation)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(setup.Close)
			if state := setup.state(); state.State != "error" {
				t.Fatalf("existing incomplete Instance = %q, want error", state.State)
			}
			recorder := setupTestRequest(setup, http.MethodPost, "/api/v1/evolution/overview", "", "{}")
			if recorder.Code != http.StatusServiceUnavailable ||
				!strings.Contains(recorder.Body.String(), "INSTANCE_UNAVAILABLE") {
				t.Fatalf("missing artifact business response %d: %s", recorder.Code, recorder.Body.String())
			}
			if missing == "credential" {
				if _, err = os.Stat(paths.Auth); !os.IsNotExist(err) {
					t.Fatal("initialized Instance generated a replacement root Token")
				}
			}
		})
	}
}

func TestSetupClaimNeverRevealsCredentialCreatedAfterDaemonStartup(t *testing.T) {
	setup := newTestSetup(t)
	external, err := runtimeprofile.LoadOrCreateCredential(setup.paths)
	if err != nil {
		t.Fatal(err)
	}
	result := setupTestRequest(setup, http.MethodPost, "/api/v1/setup/rotate-token", "", "")
	if result.Code != http.StatusUnauthorized ||
		!strings.Contains(result.Body.String(), "AUTHENTICATION_FAILED") ||
		strings.Contains(result.Body.String(), external.Token) {
		t.Fatalf("external credential must not be revealed: HTTP %d", result.Code)
	}
	persisted, err := runtimeprofile.LoadCredential(setup.paths)
	if err != nil || persisted.Token != external.Token {
		t.Fatal("operator-owned Instance Token was changed")
	}
}

func TestTokenFirstStatusAndRotationRequireAuthentication(t *testing.T) {
	c := newTestSetup(t)
	statusPath := "/api/v1/setup/status"
	if got := setupTestRequest(c, http.MethodGet, statusPath, "", ""); got.Code != http.StatusOK {
		t.Fatalf("unclaimed status must be readable: %d", got.Code)
	}
	oldToken := mustCreateSetupToken(t, c)
	if got := setupTestRequest(c, http.MethodGet, statusPath, "", ""); got.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous status exposed claimed instance: %d", got.Code)
	}
	if got := setupTestRequest(c, http.MethodPost, "/api/v1/setup/rotate-token", "", ""); got.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous rotation after first Token: %d", got.Code)
	}
	if got := setupTestRequest(c, http.MethodGet, statusPath, oldToken, ""); got.Code != http.StatusOK ||
		strings.Contains(got.Body.String(), oldToken) {
		t.Fatalf("authorized setup status failed or leaked root Token: %d", got.Code)
	}
	rotated := setupTestRequest(c, http.MethodPost, "/api/v1/setup/rotate-token", oldToken, "")
	if rotated.Code != http.StatusCreated {
		t.Fatalf("authorized rotation failed: %d %s", rotated.Code, rotated.Body.String())
	}
	var current runtimeprofile.Credential
	if err := json.Unmarshal(rotated.Body.Bytes(), &current); err != nil || current.Token == "" ||
		current.Token == oldToken {
		t.Fatal("new root Token missing or unchanged")
	}
	if got := setupTestRequest(c, http.MethodGet, statusPath, oldToken, ""); got.Code != http.StatusUnauthorized {
		t.Fatalf("old Token still works after rotation: %d", got.Code)
	}
	if got := setupTestRequest(c, http.MethodGet, statusPath, current.Token, ""); got.Code != http.StatusOK {
		t.Fatalf("new Token cannot read status: %d", got.Code)
	}
}

func TestConcurrentInitialTokenCreationCanOnlySucceedOnce(t *testing.T) {
	c := newTestSetup(t)
	results := make(chan int, 12)
	for i := 0; i < cap(results); i++ {
		go func() {
			response := setupTestRequest(c, http.MethodPost, "/api/v1/setup/rotate-token", "", "")
			results <- response.Code
		}()
	}
	created, rejected := 0, 0
	for i := 0; i < cap(results); i++ {
		switch code := <-results; code {
		case http.StatusCreated:
			created++
		case http.StatusUnauthorized:
			rejected++
		default:
			t.Fatalf("unexpected concurrent HTTP status: %d", code)
		}
	}
	if created != 1 || rejected != cap(results)-1 {
		t.Fatalf("initial creations %d rejected %d", created, rejected)
	}
}

func TestExternalCredentialCannotEnableAnonymousSetup(t *testing.T) {
	c := newTestSetup(t)
	operatorToken, err := runtimeprofile.ClaimCredential(c.paths)
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/v1/setup/status", "/api/v1/setup/rotate-token"} {
		method := http.MethodGet
		if path == "/api/v1/setup/rotate-token" {
			method = http.MethodPost
		}
		response := setupTestRequest(c, method, path, "", "")
		if response.Code != http.StatusUnauthorized || strings.Contains(response.Body.String(), operatorToken.Token) {
			t.Fatalf("unauthenticated %s: %d", path, response.Code)
		}
	}
	persisted, err := runtimeprofile.LoadCredential(c.paths)
	if err != nil || persisted.Token != operatorToken.Token {
		t.Fatal("external operator credential was replaced")
	}
}

func TestCustomMCPPathIsGatedBeforeAuthentication(t *testing.T) {
	root := t.TempDir()
	evaluation := command.EvaluateKGOSD([]string{"--root", root, "--mcp-path", "/agents/mcp"})
	if evaluation.Mode != command.DaemonModeRun {
		t.Fatal("invalid custom MCP path test configuration")
	}
	setup, err := newSetupController(context.Background(), evaluation)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(setup.Close)
	for _, path := range []string{"/agents/mcp", "/agents/mcp/sessions"} {
		result := setupTestRequest(setup, http.MethodPost, path, "bad-token", "{}")
		if result.Code != http.StatusServiceUnavailable ||
			!strings.Contains(result.Body.String(), "INSTANCE_NOT_INITIALIZED") {
			t.Fatalf("custom MCP route %q failed setup gate: %d %s", path, result.Code, result.Body.String())
		}
	}
}

func TestSetupClaimRejectsCrossOriginWithoutCreatingCredential(t *testing.T) {
	setup := newTestSetup(t)
	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4173/api/v1/setup/rotate-token", nil)
	request.Header.Set("Origin", "https://unexpected.example")
	response := httptest.NewRecorder()
	setup.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin claim = HTTP %d, want 403", response.Code)
	}
	if _, err := os.Stat(setup.paths.Auth); !os.IsNotExist(err) {
		t.Fatal("cross-origin request created a root credential")
	}
}

func validWebSetupPayload() string {
	return `{"config":{"server":{"public_origin":"https://kgos.example.com"},"embedding":{"base_url":"https://api.openai.com/v1","model":"test-model","dimensions":1536,"similarity":"cosine"},"cache":{"path":"cache/openai-compatible.db","max_size_mb":4096},"fulltext":{"analyzer":"jieba"},"sqlite":{"extensions":[]}},"apiKey":null}`
}

func decodeSetupInput(t *testing.T, body string) setupInitializeRequest {
	t.Helper()
	var input setupInitializeRequest
	if err := json.Unmarshal([]byte(body), &input); err != nil {
		t.Fatal(err)
	}
	return input
}

func TestWebConfigValidationAndNoAuthPublication(t *testing.T) {
	c := newTestSetup(t)
	cases := []struct {
		name  string
		input string
	}{
		{name: "no config", input: `{}`},
		{name: "missing key mode", input: `{"config":{"server":{"public_origin":"https://kgos.example.com"},"embedding":{"base_url":"https://api.openai.com/v1","model":"test-model","dimensions":1536,"similarity":"cosine"},"cache":{"path":"cache/openai-compatible.db","max_size_mb":4096},"fulltext":{"analyzer":"jieba"},"sqlite":{"extensions":[]}}}`},
		{name: "invalid embedding dimension", input: strings.Replace(validWebSetupPayload(), `"dimensions":1536`, `"dimensions":5000`, 1)},
		{name: "unsupported dot similarity", input: strings.Replace(validWebSetupPayload(), `"similarity":"cosine"`, `"similarity":"dot"`, 1)},
		{name: "unexpected extension", input: strings.Replace(validWebSetupPayload(), `"extensions":[]`, `"extensions":[{"source":"/tmp/invalid.so","entrypoint":"sqlite3_test_init"}]`, 1)},
		{name: "non-string credential", input: strings.Replace(validWebSetupPayload(), `"apiKey":null`, `"apiKey":99`, 1)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			input := decodeSetupInput(t, tc.input)
			if err := c.publishWebConfig(input); err == nil {
				t.Fatal("invalid Web configuration was published")
			}
			if _, err := os.Stat(c.paths.Config); !os.IsNotExist(err) {
				t.Fatalf("invalid configuration left a file: %v", err)
			}
		})
	}
	original := decodeSetupInput(t, validWebSetupPayload())
	if err := c.publishWebConfig(original); err != nil {
		t.Fatalf("Web configuration not published: %v", err)
	}
	loaded, err := runtimeprofile.LoadConfig(c.paths)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.FullText.Analyzer != "jieba" || loaded.Embedding.Model != "test-model" ||
		loaded.Embedding.APIKeyEnv != "" || loaded.Cache.MaxSizeMB != 4096 {
		t.Fatalf("unexpected persisted settings: %#v", loaded)
	}
	if _, err = os.Stat(filepath.Join(c.paths.Root, "embedding-api-key")); !os.IsNotExist(err) {
		t.Fatal("no-auth configuration wrote a secret")
	}
	if err := c.publishWebConfig(original); err == nil {
		t.Fatal("second Web submit replaced existing config")
	}
}

func TestWebConfigPublishesPrivateKeyBeforeTOML(t *testing.T) {
	c := newTestSetup(t)
	const key = "secret-used-only-for-embedding"
	input := decodeSetupInput(t, strings.Replace(validWebSetupPayload(), `"apiKey":null`, `"apiKey":"secret-used-only-for-embedding"`, 1))
	if err := c.publishWebConfig(input); err != nil {
		t.Fatalf("publish Web-managed API key config: %v", err)
	}
	body, err := os.ReadFile(c.paths.Config)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), key) || !strings.Contains(string(body), runtimeprofile.WebEmbeddingKeyEnv) {
		t.Fatal("TOML included secret or omitted reserved env key")
	}
	saved, err := os.ReadFile(filepath.Join(c.paths.Root, "embedding-api-key"))
	if err != nil || string(saved) != key {
		t.Fatalf("private key lost: %v", err)
	}
	if err := c.publishWebConfig(input); err == nil {
		t.Fatal("Web configuration overwrote already-published TOML")
	}
}

func TestSetupAPIInputValidationAndAcceptedBootstrap(t *testing.T) {
	c := newTestSetup(t)
	claim := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", "")
	var secret struct{ Token string }
	if err := json.Unmarshal(claim.Body.Bytes(), &secret); err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{"", "{", `{"unknown":true}`, `{} {}`, `{"config":{}}`} {
		response := setupTestRequest(c, "POST", "/api/v1/setup/initialize", secret.Token, body)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("malformed setup %q = HTTP %d", body, response.Code)
		}
		if _, err := os.Stat(c.paths.Config); !os.IsNotExist(err) {
			t.Fatal("malformed API payload published a configuration")
		}
	}
	response := setupTestRequest(c, "POST", "/api/v1/setup/initialize", secret.Token, validWebSetupPayload())
	if response.Code != http.StatusAccepted {
		t.Fatalf("complete setup refused: HTTP %d: %s", response.Code, response.Body.String())
	}
	if _, err := runtimeprofile.LoadConfig(c.paths); err != nil {
		t.Fatalf("accepted Web configuration not persisted: %v", err)
	}
	if competing := setupTestRequest(c, "POST", "/api/v1/setup/initialize", secret.Token, validWebSetupPayload()); competing.Code != http.StatusConflict {
		t.Fatalf("repeated setup request = HTTP %d", competing.Code)
	}
	c.Close()
	if complete, err := runtimeprofile.InitializationComplete(c.paths); err != nil || complete {
		t.Fatalf("missing test runtime should not publish receipt: %v, complete=%t", err, complete)
	}
}
