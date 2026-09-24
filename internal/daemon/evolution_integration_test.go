//go:build lithograph_smoke

package daemon

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase06EvolutionHTTPContract(t *testing.T) {
	runtime := openDaemonRuntime(t, freePort(t))
	defer runtime.Close()
	handler := NewHandler(runtime, http.NotFoundHandler())

	overview := evolutionAPIRequest(t, handler, runtime.Credential.Token, http.MethodPost, "/api/v1/evolution/overview", struct{}{})
	if overview.Code != http.StatusOK {
		t.Fatalf("overview status=%d body=%s", overview.Code, overview.Body.String())
	}
	var summary kernel.EvolutionOverviewResult
	if err := json.Unmarshal(overview.Body.Bytes(), &summary); err != nil || summary.DefaultBranch != "main" || !strings.HasPrefix(summary.State, "commit/") {
		t.Fatalf("overview = %#v err=%v", summary, err)
	}

	unauthorized := evolutionAPIRequest(t, handler, "wrong", http.MethodPost, "/api/v1/evolution/get", kernel.EvolutionGetRequest{State: summary.State})
	if unauthorized.Code != http.StatusUnauthorized || !strings.Contains(unauthorized.Body.String(), string(kernel.CodeAuthenticationFailed)) {
		t.Fatalf("unauthorized status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}
	method := evolutionAPIRequest(t, handler, runtime.Credential.Token, http.MethodGet, "/api/v1/evolution/overview", struct{}{})
	if method.Code != http.StatusMethodNotAllowed || method.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("method status=%d allow=%q body=%s", method.Code, method.Header().Get("Allow"), method.Body.String())
	}

	created := evolutionAPIRequest(t, handler, runtime.Credential.Token, http.MethodPost, "/api/v1/evolution/state/create", map[string]any{
		"branch": "main",
		"data":   nil,
		"author": "phase06-http",
	})
	if created.Code != http.StatusOK {
		t.Fatalf("state create status=%d body=%s", created.Code, created.Body.String())
	}
	var state kernel.StateCreateResult
	if err := json.Unmarshal(created.Body.Bytes(), &state); err != nil || state.State == summary.State {
		t.Fatalf("state create = %#v err=%v", state, err)
	}
	get := evolutionAPIRequest(t, handler, runtime.Credential.Token, http.MethodPost, "/api/v1/evolution/get", kernel.EvolutionGetRequest{State: state.State})
	if get.Code != http.StatusOK {
		t.Fatalf("get status=%d body=%s", get.Code, get.Body.String())
	}
	var detail kernel.EvolutionGetResult
	if err := json.Unmarshal(get.Body.Bytes(), &detail); err != nil || !detail.HasData || string(detail.Data) != "null" || detail.Author == nil || *detail.Author != "phase06-http" {
		t.Fatalf("state detail = %#v err=%v", detail, err)
	}

	malformed := evolutionAPIRequest(t, handler, runtime.Credential.Token, http.MethodPost, "/api/v1/evolution/get", kernel.EvolutionGetRequest{State: "commit/bad"})
	if malformed.Code != http.StatusBadRequest || !strings.Contains(malformed.Body.String(), string(kernel.CodeInvalidArgument)) {
		t.Fatalf("malformed StateRef status=%d body=%s", malformed.Code, malformed.Body.String())
	}
	notFound := evolutionAPIRequest(t, handler, runtime.Credential.Token, http.MethodPost, "/api/v1/evolution/get", kernel.EvolutionGetRequest{State: "commit/" + strings.Repeat("0", 64)})
	if notFound.Code != http.StatusNotFound || !strings.Contains(notFound.Body.String(), string(kernel.CodeStateNotFound)) {
		t.Fatalf("missing State status=%d body=%s", notFound.Code, notFound.Body.String())
	}

	merge := evolutionAPIRequest(t, handler, runtime.Credential.Token, http.MethodPost, "/api/v1/evolution/merge/start", struct{}{})
	if merge.Code != http.StatusNotFound {
		t.Fatalf("Phase 06 unexpectedly registered Merge route: status=%d body=%s", merge.Code, merge.Body.String())
	}
}

func evolutionAPIRequest(
	t *testing.T,
	handler http.Handler,
	token string,
	method string,
	path string,
	value any,
) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %s payload: %v", path, err)
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
