package daemon

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func observabilityRequest(handler http.Handler, token, boot, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, sessionTestOrigin+path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", sessionTestOrigin)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if boot != "" {
		request.Header.Set(expectedDaemonBootHeader, boot)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestObservabilityRoutesUseExistingAuthAndBoundedQueries(t *testing.T) {
	const instanceToken = "instance-private-secret"
	root := t.TempDir()
	store, err := observability.OpenStore(filepath.Join(root, "logs"), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := observability.New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = observer.Close(ctx)
	}()
	runtime := &runtimehost.Runtime{
		Paths:      runtimeprofile.Paths{Root: root},
		Credential: runtimeprofile.Credential{Token: instanceToken},
	}
	handler := observability.HTTPMiddleware(observer, NewHandler(runtime, http.NotFoundHandler()))
	const overview = "/api/v1/system/observability/overview"
	const list = "/api/v1/system/observability/requests/list"
	const get = "/api/v1/system/observability/requests/get"
	const logs = "/api/v1/system/observability/logs/list"
	for _, path := range []string{overview, list, get, logs} {
		for _, token := range []string{"", "random-oauth-access-token", "wrong-instance"} {
			result := observabilityRequest(handler, token, "", path, "{}")
			if result.Code != http.StatusUnauthorized {
				t.Fatalf("diagnostic route=%s authorized token=%q status=%d", path, token, result.Code)
			}
		}
	}
	result := observabilityRequest(handler, instanceToken, "", overview, "{}")
	if result.Code != http.StatusOK {
		t.Fatalf("instance overview status=%d body=%s", result.Code, result.Body.String())
	}
	var decoded map[string]any
	if err := json.Unmarshal(result.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["availability"] != "available" {
		t.Fatalf("unexpected diagnostic availability: %+v", decoded)
	}
	for _, input := range []struct{ path, body string }{
		{list, "{\"limit\":101}"},
		{list, "{\"cursor\":\"1:../../private\"}"},
		{get, "{\"request_id\":\"../../private\"}"},
		{logs, "{\"limit\":101}"},
		{logs, "{\"cursor\":\"../../private\"}"},
		{logs, "{\"level\":\"PRIVATE\"}"},
		{overview, "{\"from\":\"1970-01-01T00:00:00Z\"}"},
	} {
		bad := observabilityRequest(handler, instanceToken, "", input.path, input.body)
		if bad.Code != http.StatusBadRequest || !strings.Contains(bad.Body.String(), "INVALID_ARGUMENT") {
			t.Fatalf("invalid diagnostic request accepted: %s %s status=%d body=%s",
				input.path, input.body, bad.Code, bad.Body.String())
		}
		if strings.Contains(bad.Body.String(), "../../private") {
			t.Fatal("untrusted diagnostic filter leaked into error")
		}
	}
	login := httptest.NewRequest(http.MethodPost, sessionTestOrigin+"/api/v1/web/auth/login", nil)
	login.Header.Set("Authorization", "Bearer "+instanceToken)
	login.Header.Set("Origin", sessionTestOrigin)
	loginResult := httptest.NewRecorder()
	handler.ServeHTTP(loginResult, login)
	access := sessionResult(t, loginResult)
	web := observabilityRequest(handler, access.AccessToken, access.DaemonBootID, list, "{}")
	if web.Code != http.StatusOK {
		t.Fatalf("Web session rejected by diagnostic API: %d %s", web.Code, web.Body.String())
	}
	webLogs := observabilityRequest(handler, access.AccessToken, access.DaemonBootID, logs, "{}")
	if webLogs.Code != http.StatusOK {
		t.Fatalf("Web log timeline rejected: %d %s", webLogs.Code, webLogs.Body.String())
	}
	staleLogs := observabilityRequest(handler, access.AccessToken, "different-instance", logs, "{}")
	if staleLogs.Code != http.StatusConflict {
		t.Fatalf("Web boot guard bypassed for logs: %d", staleLogs.Code)
	}
	stale := observabilityRequest(handler, access.AccessToken, "different-instance", overview, "{}")
	if stale.Code != http.StatusConflict {
		t.Fatalf("Web boot guard bypassed: %d", stale.Code)
	}
	recent := observabilityRequest(handler, instanceToken, "", list, "{}")
	if recent.Code != http.StatusOK || strings.Contains(recent.Body.String(), instanceToken) {
		t.Fatalf("unprotected request list: %d %s", recent.Code, recent.Body.String())
	}
}

func TestObservabilityRoutesRejectMethodAndInvalidBody(t *testing.T) {
	store, err := observability.OpenStore(filepath.Join(t.TempDir(), "logs"), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := observability.New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = observer.Close(ctx)
	}()
	runtime := &runtimehost.Runtime{
		Paths:      runtimeprofile.Paths{Root: t.TempDir()},
		Credential: runtimeprofile.Credential{Token: "admin-token"},
	}
	handler := observability.HTTPMiddleware(observer, NewHandler(runtime, http.NotFoundHandler()))
	get := httptest.NewRequest(http.MethodGet, "/api/v1/system/observability/overview", nil)
	get.Header.Set("Authorization", "Bearer admin-token")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, get)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET diagnostic query accepted: %d", w.Code)
	}
	bad := observabilityRequest(handler, "admin-token", "", "/api/v1/system/observability/requests/list", "{\"extra\":\"secret\"}")
	if bad.Code != http.StatusBadRequest {
		t.Fatalf("arbitrary body fields accepted: %d", bad.Code)
	}
}

func TestObservabilityRoutesRemainUnavailableWhenStoreFailedToOpen(t *testing.T) {
	// kgosd continues without persistent diagnostics if that independent
	// SQLite database cannot open; a non-nil Observer is not enough.
	observer, err := observability.New(io.Discard, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := observer.Close(ctx); err != nil {
			t.Fatal(err)
		}
	}()
	const token = "instance-test-secret"
	runtime := &runtimehost.Runtime{
		Paths:      runtimeprofile.Paths{Root: t.TempDir()},
		Credential: runtimeprofile.Credential{Token: token},
	}
	handler := observability.HTTPMiddleware(observer, NewHandler(runtime, http.NotFoundHandler()))
	for _, path := range []string{
		"/api/v1/system/observability/overview",
		"/api/v1/system/observability/requests/list",
		"/api/v1/system/observability/requests/get",
		"/api/v1/system/observability/logs/list",
	} {
		body := "{}"
		if strings.HasSuffix(path, "/requests/get") {
			body = "{\"request_id\":\"req_" + strings.Repeat("a", 32) + "\"}"
		}
		result := observabilityRequest(handler, token, "", path, body)
		if result.Code != http.StatusOK {
			t.Fatalf("storeless route=%s returned HTTP %d: %s",
				path, result.Code, result.Body.String())
		}
		var value map[string]any
		if err := json.Unmarshal(result.Body.Bytes(), &value); err != nil {
			t.Fatal(err)
		}
		if value["availability"] != "unavailable" {
			t.Fatalf("storeless route=%s invented availability: %s",
				path, result.Body.String())
		}
		unauthorized := observabilityRequest(handler, "", "", path, body)
		if unauthorized.Code != http.StatusUnauthorized {
			t.Fatalf("storeless route=%s bypassed authorization: %d", path, unauthorized.Code)
		}
	}
	process := observabilityRequest(handler, token, "", "/api/v1/system/diagnostics", "{}")
	if process.Code != http.StatusOK {
		t.Fatalf("process diagnostics should remain available: HTTP %d", process.Code)
	}
}
