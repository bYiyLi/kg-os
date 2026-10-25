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

func TestFirstRunStateMatrixProtectsExistingFiles(t *testing.T) {
	for _, test := range []struct {
		name, config, receipt, credential, database, expected string
	}{
		{"missing all", "", "", "", "", "setup_required"},
		{"orphan database", "", "", "", "existing", "error"},
		{"invalid operator config", "unrecognized = true", "", "", "", "error"},
		{"corrupt receipt", "", "not-json", "", "", "error"},
		{"invalid credential", "", "", "not-json", "", "error"},
		{"valid config, no receipt", `[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096
[fulltext]
analyzer = "jieba"
[embedding]
base_url = "https://api.openai.com/v1"
model = "fixture"
dimensions = 1536
similarity = "cosine"
api_key_env = ""
`, "", "", "", "initializing"},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			paths, err := runtimeprofile.ResolvePaths(root)
			if err != nil {
				t.Fatal(err)
			}
			if err = os.MkdirAll(paths.Root, 0o700); err != nil {
				t.Fatal(err)
			}
			for _, file := range []struct{ path, body string }{
				{paths.Config, test.config}, {paths.Auth, test.credential},
				{paths.Database, test.database},
				{filepath.Join(paths.Root, "initialized.json"), test.receipt},
			} {
				if file.body != "" {
					if err = os.WriteFile(file.path, []byte(file.body), 0o600); err != nil {
						t.Fatal(err)
					}
				}
			}
			ev := command.EvaluateKGOSD([]string{"--root", root})
			controller, err := newSetupController(context.Background(), ev)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(controller.Close)
			if view := controller.state(); view.State != test.expected {
				t.Fatalf("state = %s, expected %s", view.State, test.expected)
			}
			if controller.status == "error" && controller.autoStart {
				t.Fatal("unsafe configuration attempted automatic initialization")
			}
		})
	}
}

func TestFirstRunRoutesAreStatusFirstAndMethodsRestricted(t *testing.T) {
	c := newTestSetup(t)
	for _, test := range []struct {
		method, path string
		expected     int
	}{
		{"GET", "/api/v1/setup/status", 200},
		{"POST", "/api/v1/setup/status", 405},
		{"GET", "/api/v1/setup/rotate-token", 405},
		{"GET", "/api/v1/setup/initialize", 405},
		{"POST", "/api/v1/setup/initialize", 401},
		{"POST", "/api/v1/ontology/read", 503},
		{"GET", "/.well-known/oauth-authorization-server", 503},
		{"GET", "/oauth/token", 503},
		{"GET", "/mcp", 503},
		{"GET", "/", 302},
		{"GET", "/setup", 200},
		{"GET", "/other-page", 302},
		{"GET", "/favicon.ico", 404},
	} {
		got := setupTestRequest(c, test.method, test.path, "wrong", "{}")
		if got.Code != test.expected {
			t.Fatalf("%s %s: HTTP %d want %d: %s", test.method, test.path, got.Code, test.expected, got.Body.String())
		}
	}
}

func TestFirstRunExistingConfigResumeAndRequestSafety(t *testing.T) {
	c := newTestSetup(t)
	claimed := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", "")
	if claimed.Code != 201 {
		t.Fatalf("claim: HTTP %d", claimed.Code)
	}
	var root struct{ Token string }
	if err := json.Unmarshal(claimed.Body.Bytes(), &root); err != nil {
		t.Fatal(err)
	}
	input := decodeSetupInput(t, validWebSetupPayload())
	if err := c.publishWebConfig(input); err != nil {
		t.Fatal(err)
	}
	if bad := setupTestRequest(c, "POST", "/api/v1/setup/initialize", root.Token, validWebSetupPayload()); bad.Code != 409 {
		t.Fatalf("existing config accepted replacement: %d", bad.Code)
	}
	if wrong := setupTestRequest(c, "POST", "/api/v1/setup/initialize", "wrong", "{}"); wrong.Code != 401 {
		t.Fatalf("wrong credential accepted: %d", wrong.Code)
	}
	// Check the in-progress guard deterministically. A background bootstrap in
	// this test has no native Runtime and can fail before the next HTTP request,
	// legitimately allowing a fresh retry instead of returning 409.
	c.mu.Lock()
	c.status = "initializing"
	c.mu.Unlock()
	if repeat := setupTestRequest(c, "POST", "/api/v1/setup/initialize", root.Token, "{}"); repeat.Code != 409 {
		t.Fatalf("in-progress initialization accepted another request: %d", repeat.Code)
	}
	c.mu.Lock()
	c.status = "error"
	c.mu.Unlock()
	started := setupTestRequest(c, "POST", "/api/v1/setup/initialize", root.Token, "{}")
	if started.Code != 202 {
		t.Fatalf("resume rejected: %d %s", started.Code, started.Body.String())
	}
	c.Close()
	after, err := os.ReadFile(c.paths.Config)
	if err != nil || !strings.Contains(string(after), "test-model") {
		t.Fatal("resume discarded operator config")
	}
	if _, err := os.Stat(filepath.Join(c.paths.Root, "initialized.json")); !os.IsNotExist(err) {
		t.Fatal("missing test runtime published initialization receipt")
	}
}

func TestFirstRunPreReadyWebSessionRestoresCredential(t *testing.T) {
	c := newTestSetup(t)
	claimed := setupTestRequest(c, "POST", "/api/v1/setup/rotate-token", "", "")
	if claimed.Code != 201 {
		t.Fatalf("claim failed: %d", claimed.Code)
	}
	var secret struct{ Token string }
	if err := json.Unmarshal(claimed.Body.Bytes(), &secret); err != nil {
		t.Fatal(err)
	}
	logged := setupTestRequest(c, "POST", "/api/v1/web/auth/login", secret.Token, "{}")
	if logged.Code != 200 {
		t.Fatalf("pre-ready web login failed: %d %s", logged.Code, logged.Body.String())
	}
	cookies := logged.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("missing private pre-ready Session Cookie")
	}
	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4173/api/v1/web/auth/session", nil)
	request.Header.Set("Origin", "http://127.0.0.1:4173")
	request.AddCookie(cookies[0])
	response := httptest.NewRecorder()
	c.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("pre-ready session did not restore: HTTP %d", response.Code)
	}
	if strings.Contains(response.Body.String(), secret.Token) {
		t.Fatal("pre-ready session exposed root Token")
	}
}
