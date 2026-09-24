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

}

func TestPhase07EvolutionMergeHTTPContract(t *testing.T) {
	runtime := openDaemonRuntime(t, freePort(t))
	defer runtime.Close()
	handler := NewHandler(runtime, http.NotFoundHandler())
	token := runtime.Credential.Token

	overview := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/overview", struct{}{},
	)
	if overview.Code != http.StatusOK {
		t.Fatalf("overview status=%d body=%s", overview.Code, overview.Body.String())
	}
	var summary kernel.EvolutionOverviewResult
	if err := json.Unmarshal(overview.Body.Bytes(), &summary); err != nil {
		t.Fatalf("decode overview: %v", err)
	}

	start := evolutionAPIRequest(
		t,
		handler,
		token,
		http.MethodPost,
		"/api/v1/evolution/merge/start",
		kernel.MergeStartRequest{Branch: "main", Source: summary.State},
	)
	if start.Code != http.StatusOK {
		t.Fatalf("merge start status=%d body=%s", start.Code, start.Body.String())
	}
	var session kernel.MergeSession
	if err := json.Unmarshal(start.Body.Bytes(), &session); err != nil ||
		session.Status != "up_to_date" || session.Unresolved != 0 || session.Revision < 1 {
		t.Fatalf("merge start = %#v err=%v", session, err)
	}

	list := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/merge/list",
		kernel.MergeListRequest{Limit: 10},
	)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), session.Session) {
		t.Fatalf("merge list status=%d body=%s", list.Code, list.Body.String())
	}
	get := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/merge/get",
		kernel.MergeGetRequest{Session: session.Session},
	)
	if get.Code != http.StatusOK {
		t.Fatalf("merge get status=%d body=%s", get.Code, get.Body.String())
	}
	conflicts := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/merge/conflicts",
		kernel.MergeConflictsRequest{Session: session.Session, Limit: 1},
	)
	if conflicts.Code != http.StatusOK {
		t.Fatalf("merge conflicts status=%d body=%s", conflicts.Code, conflicts.Body.String())
	}
	var page kernel.MergeConflictsResult
	if err := json.Unmarshal(conflicts.Body.Bytes(), &page); err != nil ||
		page.Revision != session.Revision || len(page.Items) != 0 {
		t.Fatalf("merge conflicts = %#v err=%v", page, err)
	}

	resolve := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/merge/resolve",
		kernel.MergeResolveRequest{
			Session: session.Session, ExpectedRevision: session.Revision,
			Resolutions: []kernel.MergeResolution{},
		},
	)
	if resolve.Code != http.StatusOK {
		t.Fatalf("merge resolve status=%d body=%s", resolve.Code, resolve.Body.String())
	}
	var resolved kernel.MergeSession
	if err := json.Unmarshal(resolve.Body.Bytes(), &resolved); err != nil ||
		resolved.Revision != session.Revision || resolved.Status != "up_to_date" {
		t.Fatalf("merge resolve = %#v err=%v", resolved, err)
	}
	finalize := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/merge/finalize",
		kernel.MergeFinalizeRequest{
			Session: session.Session, ExpectedRevision: resolved.Revision,
		},
	)
	if finalize.Code != http.StatusOK {
		t.Fatalf("merge finalize status=%d body=%s", finalize.Code, finalize.Body.String())
	}
	var finalized kernel.MergeFinalizeResult
	if err := json.Unmarshal(finalize.Body.Bytes(), &finalized); err != nil ||
		finalized.Status != "up_to_date" || finalized.State != summary.State {
		t.Fatalf("merge finalize = %#v err=%v", finalized, err)
	}

	abortStart := evolutionAPIRequest(
		t,
		handler,
		token,
		http.MethodPost,
		"/api/v1/evolution/merge/start",
		kernel.MergeStartRequest{Branch: "main", Source: summary.State},
	)
	if abortStart.Code != http.StatusOK {
		t.Fatalf("abortable merge start status=%d body=%s", abortStart.Code, abortStart.Body.String())
	}
	var abortable kernel.MergeSession
	if err := json.Unmarshal(abortStart.Body.Bytes(), &abortable); err != nil {
		t.Fatalf("decode abortable session: %v", err)
	}
	abort := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/merge/abort",
		kernel.MergeAbortRequest{
			Session: abortable.Session, ExpectedRevision: abortable.Revision,
		},
	)
	if abort.Code != http.StatusOK {
		t.Fatalf("merge abort status=%d body=%s", abort.Code, abort.Body.String())
	}

	missing := evolutionAPIRequest(
		t, handler, token, http.MethodPost, "/api/v1/evolution/merge/get",
		kernel.MergeGetRequest{Session: abortable.Session},
	)
	if missing.Code != http.StatusNotFound ||
		!strings.Contains(missing.Body.String(), string(kernel.CodeMergeSessionNotFound)) {
		t.Fatalf("missing merge status=%d body=%s", missing.Code, missing.Body.String())
	}
	unauthorized := evolutionAPIRequest(
		t, handler, "wrong", http.MethodPost, "/api/v1/evolution/merge/list",
		kernel.MergeListRequest{},
	)
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("merge unauthorized status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}
	method := evolutionAPIRequest(
		t, handler, token, http.MethodGet, "/api/v1/evolution/merge/list",
		kernel.MergeListRequest{},
	)
	if method.Code != http.StatusMethodNotAllowed || method.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("merge method status=%d allow=%q", method.Code, method.Header().Get("Allow"))
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
