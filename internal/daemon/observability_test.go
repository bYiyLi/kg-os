package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/observability"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func diagnosticsRequest(handler http.Handler, token, boot, origin string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, sessionTestOrigin+"/api/v1/system/diagnostics", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if boot != "" {
		req.Header.Set(expectedDaemonBootHeader, boot)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	result := httptest.NewRecorder()
	handler.ServeHTTP(result, req)
	return result
}

func TestDiagnosticsReadOnlyAuthAndRequestCorrelation(t *testing.T) {
	root := t.TempDir()
	runtime := &runtimehost.Runtime{
		Paths:      runtimeprofile.Paths{Root: root},
		Credential: runtimeprofile.Credential{Token: "instance-secret"},
	}
	var logs bytes.Buffer
	observer, err := observability.New(&logs, "")
	if err != nil {
		t.Fatal(err)
	}
	var observedSurface string
	handler := observability.HTTPMiddleware(observer, NewHandler(runtime, http.NotFoundHandler(), ExtraRoute{
		Path: "/api/v1/diagnostic-probe",
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !authenticate(w, r, runtime.Credential.Token) {
				return
			}
			observedSurface = observability.Surface(r.Context())
			w.WriteHeader(http.StatusNoContent)
		}),
	}))
	for _, token := range []string{"", "fake-oauth-access", "wrong-secret"} {
		w := diagnosticsRequest(handler, token, "", "")
		if w.Code != http.StatusUnauthorized || len(w.Header().Get(observability.RequestIDHeader)) != 36 {
			t.Fatalf("unauthenticated diagnostic: status=%d id=%q", w.Code, w.Header().Get(observability.RequestIDHeader))
		}
	}
	rootAccess := diagnosticsRequest(handler, "instance-secret", "", "")
	if rootAccess.Code != http.StatusOK {
		t.Fatalf("diagnostics status=%d body=%s", rootAccess.Code, rootAccess.Body.String())
	}
	var snapshot observability.Snapshot
	if err := json.Unmarshal(rootAccess.Body.Bytes(), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.HTTP.RequestsTotal != 3 || snapshot.HTTP.InFlight != 1 ||
		snapshot.Business.OperationsTotal != 0 {
		t.Fatalf("unexpected live metrics: %+v", snapshot)
	}
	login := httptest.NewRequest(http.MethodPost, sessionTestOrigin+"/api/v1/web/auth/login", nil)
	login.Header.Set("Authorization", "Bearer instance-secret")
	login.Header.Set("Origin", sessionTestOrigin)
	loginResponse := httptest.NewRecorder()
	handler.ServeHTTP(loginResponse, login)
	access := sessionResult(t, loginResponse)
	web := diagnosticsRequest(handler, access.AccessToken, access.DaemonBootID, sessionTestOrigin)
	if web.Code != http.StatusOK {
		t.Fatalf("Web access status=%d body=%s", web.Code, web.Body.String())
	}
	stale := diagnosticsRequest(handler, access.AccessToken, "wrong-daemon", sessionTestOrigin)
	if stale.Code != http.StatusConflict {
		t.Fatalf("boot guard was bypassed: %d", stale.Code)
	}
	probe := httptest.NewRequest(http.MethodPost, sessionTestOrigin+"/api/v1/diagnostic-probe", nil)
	probe.Header.Set("Authorization", "Bearer "+access.AccessToken)
	probe.Header.Set("Origin", sessionTestOrigin)
	probe.Header.Set(expectedDaemonBootHeader, access.DaemonBootID)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, probe)
	if recorder.Code != http.StatusNoContent || observedSurface != "web" {
		t.Fatalf("trusted web source lost: status=%d surface=%q", recorder.Code, observedSurface)
	}
	if strings.Contains(logs.String(), "instance-secret") || strings.Contains(logs.String(), access.AccessToken) {
		t.Fatal("diagnostics log exposed an authentication secret")
	}
}

func TestDiagnosticsRejectsNonEmptyAndInvalidBody(t *testing.T) {
	var logs bytes.Buffer
	observer, err := observability.New(&logs, "")
	if err != nil {
		t.Fatal(err)
	}
	rt := &runtimehost.Runtime{Paths: runtimeprofile.Paths{Root: t.TempDir()}, Credential: runtimeprofile.Credential{Token: "token"}}
	handler := observability.HTTPMiddleware(observer, NewHandler(rt, http.NotFoundHandler()))
	for _, value := range []string{`{"extra":"secret"}`, "not-json"} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/system/diagnostics", strings.NewReader(value))
		req.Header.Set("Authorization", "Bearer token")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("accepted invalid diagnostic body: %s status=%d", value, w.Code)
		}
	}
}

func TestBusinessEventsDoNotLeakThroughPublicHTTP(t *testing.T) {
	observer, err := observability.New(&bytes.Buffer{}, "")
	if err != nil {
		t.Fatal(err)
	}
	// A request-scoped business event may be generated independently of the
	// transport result. The response must never include internal log details.
	handler := observability.HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observability.Business(r.Context(), observability.BusinessResult{Operation: "object.patch", Outcome: "unknown"})
		http.Error(w, "safe public failure", http.StatusConflict)
	}))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/v1/object/patch", nil))
	if w.Code != http.StatusConflict || strings.Contains(w.Body.String(), "business.operation") {
		t.Fatalf("diagnostic data leaked into API body: %s", w.Body.String())
	}
}
