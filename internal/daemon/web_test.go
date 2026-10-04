package daemon

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
	"github.com/bYiyLi/kg-os/internal/webstore"
)

func webRequest(t *testing.T, handler http.Handler, path string, body any, token, boot string) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if boot != "" {
		request.Header.Set(expectedBootHeader, boot)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestWebAPIAuthenticationLazyStorageAndBootGuard(t *testing.T) {
	root := filepath.Join(t.TempDir(), "web")
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "private-test-token"}, Web: webstore.New(root, "test-database")}
	defer runtime.Close()
	handler := NewHandler(runtime, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	unauthorized := webRequest(t, handler, "/api/v1/web/data/info", struct{}{}, "", "stale")
	if unauthorized.Code != http.StatusUnauthorized || !strings.Contains(unauthorized.Body.String(), "AUTHENTICATION_FAILED") {
		t.Fatalf("auth precedence: %d %s", unauthorized.Code, unauthorized.Body.String())
	}
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatalf("unauthenticated info created directory: %v", err)
	}
	infoResponse := webRequest(t, handler, "/api/v1/web/data/info", struct{}{}, runtime.Credential.Token, "")
	var info struct {
		DaemonBootID string `json:"daemonBootId"`
		webstore.Info
	}
	if err := json.Unmarshal(infoResponse.Body.Bytes(), &info); err != nil || infoResponse.Code != 200 || info.StorageStatus != "ready" || len(info.DaemonBootID) != 36 {
		t.Fatalf("info: %d %s %v", infoResponse.Code, infoResponse.Body.String(), err)
	}
	for _, path := range []string{"/api/v1/web/data/info", "/api/v1/web/data/save", "/api/v1/graph/query", "/api/v1/graph/execute", "/api/v1/object/patch", "/api/v1/evolution/branch/create", "/api/unknown"} {
		response := webRequest(t, handler, path, struct{}{}, runtime.Credential.Token, "old-daemon")
		if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "WEB_CONNECTION_CHANGED") {
			t.Fatalf("unguarded %s: %d %s", path, response.Code, response.Body.String())
		}
	}
	response := webRequest(t, handler, "/api/v1/web/data/info", struct{}{}, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 200 {
		t.Fatalf("exact guard: %d %s", response.Code, response.Body.String())
	}
	restarted := NewHandler(runtime, nil)
	response = webRequest(t, restarted, "/api/v1/web/data/info", struct{}{}, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 409 {
		t.Fatalf("restarted guard accepted old boot: %d", response.Code)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set(expectedBootHeader, "old")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("boot guard blocked static assets: %d", recorder.Code)
	}
	for _, values := range [][]string{{""}, {info.DaemonBootID, info.DaemonBootID}} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/web/data/info", strings.NewReader("{}"))
		request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
		request.Header.Set("Content-Type", "application/json")
		request.Header[http.CanonicalHeaderKey(expectedBootHeader)] = values
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != 409 {
			t.Fatalf("ambiguous/empty guard accepted: %d", response.Code)
		}
	}
}

func TestWebAPIRecordCASCacheMissAndCompactDownload(t *testing.T) {
	root := filepath.Join(t.TempDir(), "web")
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "test-token"}, Web: webstore.New(root, "database")}
	defer runtime.Close()
	handler := NewHandler(runtime, nil)
	response := webRequest(t, handler, "/api/v1/web/data/info", struct{}{}, runtime.Credential.Token, "")
	var info struct {
		DaemonBootID string `json:"daemonBootId"`
		webstore.Info
	}
	if err := json.Unmarshal(response.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	key := webstore.ReadRequest{StoreID: info.StoreID, Kind: "editor", ID: webstore.NewID()}
	request := webstore.SaveRequest{ReadRequest: key, MutationID: webstore.NewID(), Data: json.RawMessage(`{"version":1,"statement":"not yet valid ("}`)}
	response = webRequest(t, handler, "/api/v1/web/data/save", request, runtime.Credential.Token, info.DaemonBootID)
	var saved webstore.Record
	if err := json.Unmarshal(response.Body.Bytes(), &saved); err != nil || response.Code != 200 || saved.Revision != "1" {
		t.Fatalf("save: %d %s %v", response.Code, response.Body.String(), err)
	}
	response = webRequest(t, handler, "/api/v1/web/data/save", request, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 409 || !strings.Contains(response.Body.String(), "WEB_DATA_CHANGED") {
		t.Fatalf("create collision: %d %s", response.Code, response.Body.String())
	}
	response = webRequest(t, handler, "/api/v1/web/data/read", key, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 200 || !strings.Contains(response.Body.String(), saved.LastMutationID) {
		t.Fatalf("read lost response: %d %s", response.Code, response.Body.String())
	}
	response = webRequest(t, handler, "/api/v1/web/data/list", webstore.ListRequest{StoreID: info.StoreID, Kind: "editor"}, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 200 || strings.Contains(response.Body.String(), "not yet valid") {
		t.Fatalf("list leaked full payload: %d %s", response.Code, response.Body.String())
	}
	response = webRequest(t, handler, "/api/v1/web/cache/read", webstore.CacheRequest{StoreID: info.StoreID, FrameID: webstore.NewID()}, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 200 || strings.TrimSpace(response.Body.String()) != `{"hit":false}` {
		t.Fatalf("miss: %d %s", response.Code, response.Body.String())
	}
	response = webRequest(t, handler, "/api/v1/web/data/delete", webstore.DeleteRequest{ReadRequest: key, ExpectedRevision: &saved.Revision, MutationID: webstore.NewID()}, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"data":null`) {
		t.Fatalf("delete: %d %s", response.Code, response.Body.String())
	}
	response = webRequest(t, handler, "/api/v1/web/data/export", struct{}{}, runtime.Credential.Token, info.DaemonBootID)
	if response.Code != 200 || response.Header().Get("Content-Type") != "application/vnd.sqlite3" || !bytes.HasPrefix(response.Body.Bytes(), []byte("SQLite format 3")) || bytes.Contains(response.Body.Bytes(), []byte("not yet valid")) || bytes.Contains(response.Body.Bytes(), []byte(runtime.Credential.Token)) {
		t.Fatalf("export: %d %s", response.Code, response.Header().Get("Content-Type"))
	}
	if files, err := filepath.Glob(filepath.Join(root, ".ui-export-*")); err != nil || len(files) != 0 {
		t.Fatalf("temp export files: %v %v", files, err)
	}
}

func TestWebAPIInvalidInputStatusesAndFaultDiagnostics(t *testing.T) {
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "test-token"}}
	handler := NewHandler(runtime, nil)
	response := webRequest(t, handler, "/api/v1/web/data/info", struct{}{}, runtime.Credential.Token, "")
	var diagnostic struct {
		DaemonBootID string `json:"daemonBootId"`
		webstore.Info
	}
	if err := json.Unmarshal(response.Body.Bytes(), &diagnostic); err != nil || response.Code != 200 || diagnostic.StorageStatus != "unavailable" || diagnostic.Error.Code != kernel.CodeIO || diagnostic.DaemonBootID == "" {
		t.Fatalf("fault info: %d %s %v", response.Code, response.Body.String(), err)
	}
	for _, path := range []string{"/api/v1/web/data/info", "/api/v1/web/data/export", "/api/v1/web/cache/clear"} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != 405 || response.Header().Get("Allow") != http.MethodPost {
			t.Fatalf("method: %s %d", path, response.Code)
		}
		response = webRequest(t, handler, path, map[string]any{"path": "../auth.json"}, runtime.Credential.Token, "")
		if response.Code != 400 {
			t.Fatalf("unknown field: %s %d %s", path, response.Code, response.Body.String())
		}
	}
	response = webRequest(t, handler, "/api/v1/web/data/export", struct{}{}, runtime.Credential.Token, "")
	if response.Code != 500 || !strings.Contains(response.Body.String(), "IO_ERROR") {
		t.Fatalf("export fault: %d %s", response.Code, response.Body.String())
	}
	for _, err := range []error{&kernel.PublicError{Code: webstore.CodeNotFound, Message: "missing"}, &kernel.PublicError{Code: kernel.CodeResource, Message: "quota"}} {
		response := httptest.NewRecorder()
		writeWebError(response, err)
		wanted := 413
		if kernel.AsPublicError(err).Code == webstore.CodeNotFound {
			wanted = 404
		}
		if response.Code != wanted {
			t.Fatalf("error mapping: %v => %d", err, response.Code)
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/web/data/info", io.LimitReader(strings.NewReader(strings.Repeat(" ", maxAPIRequestBytes+1)), maxAPIRequestBytes+1))
	request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("transport limit: %d %s", response.Code, response.Body.String())
	}
}
