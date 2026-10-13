//go:build lithograph_smoke

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	runtimeprofile "github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestPhase16UnifiedKGOSDHTTPAuthAndOAuthRoutes(t *testing.T) {
	prepareKGOSDTestRuntimePackage(t)
	root := t.TempDir()
	writeKGOSDIntegrationConfig(t, root)
	t.Setenv("KGOS_MCP_TOKEN", "isolated-external-admin-secret")
	t.Setenv("KGOS_MCP_OAUTH_ISSUER", "https://kgos-dev.y2l.top")
	ctx, cancel := context.WithCancel(context.Background())
	client := &http.Client{Timeout: 6 * time.Second}
	done := make(chan int, 1)
	var stderr bytes.Buffer
	go func() { done <- run(ctx, []string{"--root", root}, io.Discard, &stderr) }()
	defer func() {
		client.CloseIdleConnections()
		cancel()
		select {
		case code := <-done:
			if code != 0 {
				t.Errorf("unified daemon stopped with code=%d: %s", code, stderr.String())
			}
		case <-time.After(12 * time.Second):
			t.Error("unified daemon did not shut down")
		}
	}()
	waitForKGOSDLocator(t, root, done, &stderr)
	paths, err := runtimeprofile.ResolvePaths(root)
	if err != nil {
		t.Fatal(err)
	}
	locatorBody, err := os.ReadFile(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	var locator struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.Unmarshal(locatorBody, &locator); err != nil || locator.Endpoint == "" {
		t.Fatal("missing daemon endpoint")
	}
	request := func(method, path, token string) *http.Response {
		t.Helper()
		body := io.Reader(nil)
		if method == "POST" {
			body = strings.NewReader("{}")
		}
		req, err := http.NewRequest(method, locator.Endpoint+path, body)
		if err != nil {
			t.Fatal(err)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if method == "POST" {
			req.Header.Set("Content-Type", "application/json")
		}
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return response
	}
	home := request("GET", "/", "")
	if home.StatusCode != 200 {
		t.Errorf("embedded Web unavailable: %d", home.StatusCode)
	}
	_, _ = io.Copy(io.Discard, home.Body)
	home.Body.Close()
	adminToken := "isolated-external-admin-secret"
	instance, err := runtimeprofile.LoadCredential(paths)
	if err != nil {
		t.Fatal(err)
	}
	if instance.Token == adminToken {
		t.Fatal("Instance and MCP credentials are not distinct")
	}
	for _, check := range []struct {
		method, path, token string
		want                int
	}{
		{"GET", "/mcp", "", 401}, {"GET", "/mcp", instance.Token, 401},
		{"POST", "/api/v1/evolution/overview", adminToken, 401},
		{"POST", "/api/v1/evolution/overview", instance.Token, 200},
		{"GET", "/.well-known/oauth-authorization-server", "", 200},
		{"GET", "/.well-known/oauth-protected-resource/mcp", "", 200},
	} {
		result := request(check.method, check.path, check.token)
		if result.StatusCode != check.want {
			t.Errorf("%s %s with credential=%t: got %d expected %d", check.method, check.path, check.token != "", result.StatusCode, check.want)
		}
		if result.StatusCode == 401 && check.path == "/mcp" &&
			!strings.Contains(result.Header.Get("WWW-Authenticate"), "oauth-protected-resource/mcp") {
			t.Error("OAuth Bearer challenge resource metadata missing")
		}
		_, _ = io.Copy(io.Discard, result.Body)
		result.Body.Close()
	}
	meta := request("GET", "/.well-known/oauth-authorization-server", "")
	data, err := io.ReadAll(io.LimitReader(meta.Body, 8192))
	meta.Body.Close()
	if err != nil || !strings.Contains(string(data), "https://kgos-dev.y2l.top") {
		t.Fatalf("unified listener OAuth metadata missing: %s %v", data, err)
	}
}

func TestPhase16UnifiedKGOSDRejectsReusedInstanceToken(t *testing.T) {
	prepareKGOSDTestRuntimePackage(t)
	root := t.TempDir()
	writeKGOSDIntegrationConfig(t, root)
	rt, err := runtimeprofile.ResolvePaths(root)
	if err != nil {
		t.Fatal(err)
	}
	original, err := runtimeprofile.LoadOrCreateCredential(rt)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("KGOS_MCP_TOKEN", original.Token)
	var stderr bytes.Buffer
	result := run(context.Background(), []string{"--root", root}, io.Discard, &stderr)
	if result != 1 || !strings.Contains(stderr.String(), "MCP token must differ from Instance token") {
		t.Fatalf("reused credential did not fail closed: code=%d stderr=%s", result, stderr.String())
	}
	if strings.Contains(stderr.String(), original.Token) {
		t.Fatal("sensitive Instance bearer leaked in diagnostic")
	}
}
