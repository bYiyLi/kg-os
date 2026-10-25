package daemon

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSettingsRejectMalformedBodiesWithoutWriting(t *testing.T) {
	t.Parallel()
	handler, access, paths := settingsAPI(t, SettingsOptions{}, false)
	original, err := os.ReadFile(paths.Config)
	if err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{"read", "update", "embedding-key", "test-embedding"} {
		for _, body := range []string{"{", `{"unknown":"field"}`, `{} {}`} {
			response := settingsRequest(handler, access, action, body)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("%s malformed request status=%d", action, response.Code)
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("%s error response could be cached", action)
			}
		}
	}
	oversized := settingsRequest(handler, access, "embedding-key", `{"apiKey":"`+strings.Repeat("a", 64<<10)+`"}`)
	if oversized.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("settings body limit was not enforced: %d", oversized.Code)
	}
	after, err := os.ReadFile(paths.Config)
	if err != nil || !bytes.Equal(original, after) {
		t.Fatal("rejected request changed configuration")
	}
}

func TestSettingsRouteRejectsUnsupportedMethodAndUnguardedRequests(t *testing.T) {
	t.Parallel()
	handler, access, _ := settingsAPI(t, SettingsOptions{}, false)
	for _, test := range []struct {
		method, token, boot string
		want                int
	}{
		{http.MethodGet, "settings-root-secret", access.DaemonBootID, http.StatusMethodNotAllowed},
		{http.MethodPost, "settings-root-secret", "", http.StatusConflict},
		{http.MethodPost, "incorrect", "", http.StatusUnauthorized},
	} {
		request := httptest.NewRequest(test.method, sessionTestOrigin+"/api/v1/web/settings/read", strings.NewReader("{}"))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Origin", sessionTestOrigin)
		request.Header.Set("Authorization", "Bearer "+test.token)
		if test.boot != "" {
			request.Header.Set(expectedDaemonBootHeader, test.boot)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != test.want {
			t.Fatalf("unguarded/method request status=%d want=%d", response.Code, test.want)
		}
		if test.method == http.MethodGet && response.Header().Get("Allow") != http.MethodPost {
			t.Fatal("method response did not advertise POST")
		}
	}
}

func TestSettingsUnavailableConfigReturnsSafeErrors(t *testing.T) {
	t.Parallel()
	handler, access, paths := settingsAPI(t, SettingsOptions{}, false)
	state := settingsResult(t, settingsRequest(handler, access, "read", "{}"))
	if err := os.WriteFile(paths.Config, []byte("private-invalid-input = ["), 0o600); err != nil {
		t.Fatal(err)
	}
	read := settingsRequest(handler, access, "read", "{}")
	if read.Code != http.StatusBadRequest || strings.Contains(read.Body.String(), "private-invalid-input") {
		t.Fatal("invalid configuration exposed raw parsing content")
	}
	if err := os.Remove(paths.Config); err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{"read", "update", "embedding-key"} {
		body := "{}"
		if action != "read" {
			body = `{"revision":"` + state.Revision + `"}`
		}
		response := settingsRequest(handler, access, action, body)
		if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), paths.Root) {
			t.Fatalf("missing configuration did not return a safe error: %s status=%d", action, response.Code)
		}
	}
	if _, err := os.Stat(paths.Config); !os.IsNotExist(err) {
		t.Fatal("failed update recreated missing configuration")
	}
}

func TestSettingsRejectsInvalidKeyWithoutChangingFile(t *testing.T) {
	handler, access, paths := settingsAPI(t, SettingsOptions{}, true)
	state := settingsResult(t, settingsRequest(handler, access, "read", "{}"))
	keyPath := filepath.Join(paths.Root, "embedding-api-key")
	original, err := os.ReadFile(keyPath)
	if err != nil {
		t.Fatal(err)
	}
	response := settingsRequest(handler, access, "embedding-key", `{"revision":"`+state.Revision+`","apiKey":"invalid\ncredential"}`)
	if response.Code != http.StatusBadRequest || strings.Contains(response.Body.String(), "invalid") && strings.Contains(response.Body.String(), "credential") {
		t.Fatal("invalid credential was accepted or echoed")
	}
	after, err := os.ReadFile(keyPath)
	if err != nil || !bytes.Equal(original, after) {
		t.Fatal("invalid credential changed the private file")
	}
}

func TestSettingsProbeUnavailableReturnsExplicitError(t *testing.T) {
	t.Parallel()
	handler, access, _ := settingsAPI(t, SettingsOptions{}, false)
	response := settingsRequest(handler, access, "test-embedding", "{}")
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "UNSUPPORTED_OPERATION") {
		t.Fatalf("unavailable probe implied a result: status=%d", response.Code)
	}
}
