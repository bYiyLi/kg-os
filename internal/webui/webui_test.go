package webui

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testFiles() fs.FS {
	return fstest.MapFS{
		"index.html": {Data: []byte("<h1>KG OS shell</h1>")},
		"app.js":     {Data: []byte("export {};")},
		"data.bin":   {Data: []byte{1, 2, 3}},
	}
}

func TestShellServesAssetsAndRoutes(t *testing.T) {
	t.Parallel()
	handler := NewHandler(testFiles())

	for _, test := range []struct {
		name        string
		method      string
		target      string
		status      int
		contentType string
		contains    string
	}{
		{name: "root", method: http.MethodGet, target: "/", status: 200, contentType: "text/html", contains: "KG OS"},
		{name: "asset", method: http.MethodGet, target: "/app.js", status: 200, contentType: "text/javascript", contains: "export"},
		{name: "binary", method: http.MethodGet, target: "/data.bin", status: 200, contentType: "application/octet-stream"},
		{name: "spa route", method: http.MethodGet, target: "/ontology/person", status: 200, contains: "KG OS"},
		{name: "head", method: http.MethodHead, target: "/", status: 200},
		{name: "missing asset", method: http.MethodGet, target: "/missing.js", status: 404},
		{name: "api", method: http.MethodGet, target: "/api/status", status: 404},
		{name: "hidden", method: http.MethodGet, target: "/.gitkeep", status: 404},
		{name: "post", method: http.MethodPost, target: "/", status: 405},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(test.method, test.target, nil)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("status = %d, want %d", response.Code, test.status)
			}
			if test.contentType != "" && !strings.Contains(response.Header().Get("Content-Type"), test.contentType) {
				t.Fatalf("content type = %q, want %q", response.Header().Get("Content-Type"), test.contentType)
			}
			if test.method == http.MethodHead && response.Body.Len() != 0 {
				t.Fatalf("HEAD returned a body: %q", response.Body.String())
			}
			if test.contains != "" && !strings.Contains(response.Body.String(), test.contains) {
				t.Fatalf("body %q does not contain %q", response.Body.String(), test.contains)
			}
		})
	}
}

func TestShellHandlesFilesystemFailure(t *testing.T) {
	t.Parallel()
	handler := NewHandler(errorFS{})
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", response.Code)
	}
}

func TestEmbeddedHandlerUsesBundledFilesystem(t *testing.T) {
	t.Parallel()
	handler, err := EmbeddedHandler()
	if err != nil {
		t.Fatalf("open embedded handler: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("reserved embedded API status = %d, want 404", response.Code)
	}
}

type errorFS struct{}

func (errorFS) Open(string) (fs.File, error) {
	return nil, fs.ErrInvalid
}
