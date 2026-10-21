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
	// OAuth derives its public Origin from the Instance's config.toml.
	paths, pathsErr := runtimeprofile.ResolvePaths(root)
	if pathsErr != nil {
		t.Fatal(pathsErr)
	}
	configBody, readErr := os.ReadFile(paths.Config)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if err := os.WriteFile(paths.Config, append([]byte("[server]\npublic_origin = \"https://kgos-dev.y2l.top\"\n\n"), configBody...), 0600); err != nil {
		t.Fatal(err)
	}
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
	// The D105 listener is now published before the Kernel is ready. Unlike
	// the earlier startup, a live endpoint alone is not business readiness.
	readyDeadline := time.Now().Add(30 * time.Second)
	ready := false
	for time.Now().Before(readyDeadline) {
		result, requestErr := client.Get(locator.Endpoint + "/api/v1/setup/status")
		if requestErr == nil {
			var state struct {
				State string `json:"state"`
			}
			if result.StatusCode == http.StatusOK {
				_ = json.NewDecoder(result.Body).Decode(&state)
			}
			result.Body.Close()
			if state.State == "ready" {
				ready = true
				break
			}
			if state.State == "error" {
				t.Fatal("startup reported a failed initialization")
			}
		}
		time.Sleep(25 * time.Millisecond)
	}
	if !ready {
		t.Fatal("KG OS never completed startup initialization")
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
	instance, err := runtimeprofile.LoadCredential(paths)
	if err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		method, path, token string
		want                int
	}{
		{"GET", "/mcp", "", 401}, {"GET", "/mcp", instance.Token, 405},
		{"POST", "/api/v1/evolution/overview", "wrong", 401},
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
