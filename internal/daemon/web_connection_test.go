package daemon

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestWebDataInfoRequiresBearerAndReturnsEphemeralBoot(t *testing.T) {
	t.Parallel()
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "test-secret"}}
	handler := NewHandler(runtime, http.NotFoundHandler())
	info := func(token string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/web/data/info", strings.NewReader("{}"))
		request.Header.Set("Content-Type", "application/json")
		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	for _, token := range []string{"", "wrong"} {
		response := info(token)
		if response.Code != http.StatusUnauthorized || strings.Contains(response.Body.String(), "daemonBootId") {
			t.Fatalf("unauthorized info leaked boot identity: %d %s", response.Code, response.Body.String())
		}
	}
	first := info("test-secret")
	if first.Code != http.StatusOK {
		t.Fatalf("info status = %d; body=%s", first.Code, first.Body.String())
	}
	var body webDataInfo
	if err := json.Unmarshal(first.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(body.DaemonBootID) {
		t.Fatalf("boot ID is not a v4 UUID: %q", body.DaemonBootID)
	}
	if body.StorageStatus != "unsupported" {
		t.Fatalf("unimplemented UI store advertised as %q", body.StorageStatus)
	}
	var again webDataInfo
	if err := json.Unmarshal(info("test-secret").Body.Bytes(), &again); err != nil {
		t.Fatal(err)
	}
	if body.DaemonBootID != again.DaemonBootID {
		t.Fatal("boot ID changed during one handler lifetime")
	}
	var another webDataInfo
	second := NewHandler(runtime, http.NotFoundHandler())
	request := httptest.NewRequest(http.MethodPost, "/api/v1/web/data/info", strings.NewReader("{}"))
	request.Header.Set("Authorization", "Bearer test-secret")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	second.ServeHTTP(response, request)
	if err := json.Unmarshal(response.Body.Bytes(), &another); err != nil {
		t.Fatal(err)
	}
	if another.DaemonBootID == body.DaemonBootID {
		t.Fatal("different daemon handlers reused the boot ID")
	}
}

func TestWebConnectionGuardRejectsChangedBootBeforeDispatch(t *testing.T) {
	t.Parallel()
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "test-secret"}}
	called := 0
	route := ExtraRoute{Path: "/api/v1/test/write", Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called++
		w.WriteHeader(http.StatusNoContent)
	})}
	handler := NewHandler(runtime, http.NotFoundHandler(), route)
	infoRequest := httptest.NewRequest(http.MethodPost, "/api/v1/web/data/info", strings.NewReader("{}"))
	infoRequest.Header.Set("Content-Type", "application/json")
	infoRequest.Header.Set("Authorization", "Bearer test-secret")
	infoResponse := httptest.NewRecorder()
	handler.ServeHTTP(infoResponse, infoRequest)
	var info webDataInfo
	if err := json.Unmarshal(infoResponse.Body.Bytes(), &info); err != nil {
		t.Fatal(err)
	}
	send := func(path, token string, expected []string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}"))
		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
		for _, boot := range expected {
			request.Header.Add(expectedDaemonBootHeader, boot)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	for _, test := range []struct {
		name   string
		token  string
		header []string
		status int
		code   kernel.ErrorCode
	}{
		{name: "correct boot", token: "test-secret", header: []string{info.DaemonBootID}, status: http.StatusNoContent},
		{name: "legacy without guard", token: "test-secret", status: http.StatusNoContent},
		{name: "changed boot", token: "test-secret", header: []string{newDaemonBootID()}, status: http.StatusConflict, code: kernel.CodeWebConnectionChanged},
		{name: "empty guard", token: "test-secret", header: []string{""}, status: http.StatusConflict, code: kernel.CodeWebConnectionChanged},
		{name: "duplicate guard", token: "test-secret", header: []string{info.DaemonBootID, info.DaemonBootID}, status: http.StatusConflict, code: kernel.CodeWebConnectionChanged},
		{name: "missing bearer dominates", header: []string{"bad"}, status: http.StatusUnauthorized, code: kernel.CodeAuthenticationFailed},
		{name: "invalid bearer dominates", token: "wrong", header: []string{"bad"}, status: http.StatusUnauthorized, code: kernel.CodeAuthenticationFailed},
	} {
		t.Run(test.name, func(t *testing.T) {
			previous := called
			response := send("/api/v1/test/write", test.token, test.header)
			if response.Code != test.status {
				t.Fatalf("status = %d, expected %d; body=%s", response.Code, test.status, response.Body.String())
			}
			if test.code != "" {
				var err kernel.PublicError
				if decodeErr := json.Unmarshal(response.Body.Bytes(), &err); decodeErr != nil || err.Code != test.code {
					t.Fatalf("wrong error: %#v %v", err, decodeErr)
				}
			}
			if response.Code == http.StatusNoContent && called != previous+1 || response.Code != http.StatusNoContent && called != previous {
				t.Fatal("guard allowed a rejected mutation or blocked an accepted one")
			}
		})
	}
	// Ordinary non-API routes never acquire an API boot requirement.
	response := send("/", "", []string{"old-boot"})
	if response.Code != http.StatusNotFound {
		t.Fatalf("fallback status = %d", response.Code)
	}

	oldBoot := info.DaemonBootID
	newHandler := NewHandler(runtime, http.NotFoundHandler(), route)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/test/write", nil)
	request.Header.Set("Authorization", "Bearer test-secret")
	request.Header.Set(expectedDaemonBootHeader, oldBoot)
	response = httptest.NewRecorder()
	newHandler.ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("old page sent a request to a new handler: %d", response.Code)
	}
}

func TestWebConnectionGuardProtectsAuthenticatedOAuthDecision(t *testing.T) {
	t.Parallel()
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "secret"}}
	called := 0
	authorization := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called++
		w.WriteHeader(http.StatusNoContent)
	})
	handler := NewHandler(runtime, http.NotFoundHandler(),
		ExtraRoute{Path: "/oauth/request", Handler: authorization},
		ExtraRoute{Path: "/oauth/decision", Handler: authorization},
		ExtraRoute{Path: "/oauth/token", Handler: authorization},
	)
	for _, path := range []string{"/oauth/request", "/oauth/decision"} {
		request := httptest.NewRequest(http.MethodPost, path, nil)
		request.Header.Set("Authorization", "Bearer secret")
		request.Header.Set(expectedDaemonBootHeader, "stale-boot")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusConflict || called != 0 {
			t.Fatalf("%s sent OAuth request across a changed daemon: status=%d called=%d", path, response.Code, called)
		}
	}
	// OAuth token exchange is not a Web-authenticated operation.
	request := httptest.NewRequest(http.MethodPost, "/oauth/token", nil)
	request.Header.Set(expectedDaemonBootHeader, "stale-boot")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent || called != 1 {
		t.Fatalf("OAuth token route changed: status=%d called=%d", response.Code, called)
	}
}
