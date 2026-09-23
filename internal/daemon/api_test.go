package daemon

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestOntologyAPIAuthorizationFailuresAreUniform(t *testing.T) {
	t.Parallel()
	runtime := &runtimehost.Runtime{
		Credential: runtimeprofile.Credential{Token: "correct-secret"},
	}
	handler := NewHandler(runtime, http.NotFoundHandler())
	for _, header := range []string{"", "Basic abc", "Bearer ", "Bearer wrong-secret"} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/ontology/read", strings.NewReader("{}"))
		request.Header.Set("Content-Type", "application/json")
		if header != "" {
			request.Header.Set("Authorization", header)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("header %q status = %d", header, response.Code)
		}
		var public kernel.PublicError
		if err := json.Unmarshal(response.Body.Bytes(), &public); err != nil {
			t.Fatalf("decode error: %v", err)
		}
		if public.Code != kernel.CodeAuthenticationFailed || public.Message != "authentication failed" {
			t.Fatalf("header %q error = %#v", header, public)
		}
		if strings.Contains(response.Body.String(), "correct-secret") || strings.Contains(response.Body.String(), "wrong-secret") {
			t.Fatalf("header %q leaked credential: %s", header, response.Body.String())
		}
	}
}

func TestAuthenticateBearerSchemeIsCaseInsensitive(t *testing.T) {
	t.Parallel()
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	request.Header.Set("Authorization", "bEaReR correct-secret")
	response := httptest.NewRecorder()
	if !authenticate(response, request, "correct-secret") {
		t.Fatalf("case-insensitive Bearer scheme was rejected: status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestRequestedObjectMediaTypeHonorsQuality(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		accept string
		want   string
		ok     bool
	}{
		{accept: "", want: "application/json", ok: true},
		{accept: "application/yaml", want: "application/yaml", ok: true},
		{accept: "application/json;q=0.2, application/yaml;q=0.9", want: "application/yaml", ok: true},
		{accept: "application/yaml;q=0, application/json;q=0.5", want: "application/json", ok: true},
		{accept: "application/*", want: "application/json", ok: true},
		{accept: "application/json;q=0, */*;q=1", want: "application/yaml", ok: true},
		{accept: "application/yaml;q=0, */*;q=1", want: "application/json", ok: true},
		{accept: "text/plain", ok: false},
	} {
		got, err := requestedObjectMediaType(test.accept)
		if test.ok && err != nil {
			t.Fatalf("Accept %q: %v", test.accept, err)
		}
		if !test.ok && err == nil {
			t.Fatalf("Accept %q unexpectedly resolved to %q", test.accept, got)
		}
		if test.ok && got != test.want {
			t.Fatalf("Accept %q = %q, want %q", test.accept, got, test.want)
		}
	}
}

func TestOntologyAPIMethodNotAllowedUses405(t *testing.T) {
	t.Parallel()
	runtime := &runtimehost.Runtime{
		Credential: runtimeprofile.Credential{Token: "correct-secret"},
	}
	handler := NewHandler(runtime, http.NotFoundHandler())
	request := httptest.NewRequest(http.MethodGet, "/api/v1/ontology/read", nil)
	request.Header.Set("Authorization", "Bearer correct-secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d; body=%q", response.Code, http.StatusMethodNotAllowed, response.Body.String())
	}
	if response.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("Allow = %q", response.Header().Get("Allow"))
	}
}

func TestDecodeJSONRequestBoundaries(t *testing.T) {
	t.Parallel()
	type input struct {
		Value string
	}
	for _, test := range []struct {
		name        string
		contentType string
		body        string
		wantCode    kernel.ErrorCode
	}{
		{name: "wrong content type", contentType: "text/plain", body: "{}", wantCode: kernel.CodeInvalidArgument},
		{name: "malformed", contentType: "application/json", body: "{", wantCode: kernel.CodeParse},
		{name: "trailing", contentType: "application/json", body: "{} {}", wantCode: kernel.CodeParse},
		{name: "unknown field", contentType: "application/json", body: "{\"other\":\"x\"}", wantCode: kernel.CodeParse},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(test.body))
			request.Header.Set("Content-Type", test.contentType)
			response := httptest.NewRecorder()
			var decoded input
			err := decodeJSONRequest(response, request, &decoded)
			if err == nil || kernel.AsPublicError(err).Code != test.wantCode {
				t.Fatalf("error = %v, want %s", err, test.wantCode)
			}
		})
	}

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{\"Value\":\"ok\"}"))
	request.Header.Set("Content-Type", "application/json; charset=utf-8")
	response := httptest.NewRecorder()
	var decoded input
	if err := decodeJSONRequest(response, request, &decoded); err != nil || decoded.Value != "ok" {
		t.Fatalf("valid JSON decode = %#v err=%v", decoded, err)
	}

	large := append([]byte("{\"Value\":\""), bytes.Repeat([]byte("x"), maxAPIRequestBytes)...)
	large = append(large, []byte("\"}")...)
	request = httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(large))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	if err := decodeJSONRequest(response, request, &decoded); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeResource {
		t.Fatalf("oversize error = %v", err)
	}
}

func TestOntologyHandlerAdapterErrorBranches(t *testing.T) {
	t.Parallel()
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "secret"}}
	fallback := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.WriteHeader(http.StatusTeapot)
	})
	handler := NewHandler(runtime, fallback)
	request := httptest.NewRequest(http.MethodGet, "/not-api", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusTeapot {
		t.Fatalf("fallback status = %d", response.Code)
	}

	for _, path := range []string{
		"/api/v1/ontology/read",
		"/api/v1/ontology/object",
		"/api/v1/ontology/patch",
	} {
		request = httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer secret")
		response = httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s GET status = %d", path, response.Code)
		}

		request = httptest.NewRequest(http.MethodPost, path, strings.NewReader("{"))
		request.Header.Set("Authorization", "Bearer secret")
		request.Header.Set("Content-Type", "application/json")
		response = httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s malformed status = %d body=%s", path, response.Code, response.Body.String())
		}
	}
}
