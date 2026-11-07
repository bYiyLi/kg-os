//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestRealGraphReadSpansReportSuccessAndFailureSeparately(t *testing.T) {
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	runtime, err := openKernelIntegrationRuntime(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()

	observer, err := observability.New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "trace-logs")
	store, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	handler := observability.HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		state, scopeErr := runtime.Database.ResolveState(request.Context(), "branch/main")
		if scopeErr != nil {
			t.Errorf("resolve real immutable State: %v", scopeErr)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if _, queryErr := runtime.Kernel.QueryGraph(request.Context(), kernel.GraphQueryRequest{
			At: state, Cypher: "RETURN 1 AS n",
		}); queryErr != nil {
			t.Errorf("real graph read failed: %v", queryErr)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if _, queryErr := runtime.Kernel.QueryGraph(request.Context(), kernel.GraphQueryRequest{
			At: state,
		}); kernel.AsPublicError(queryErr).Code != kernel.CodeInvalidArgument {
			t.Errorf("expected read-only invalid argument: %v", queryErr)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/graph/query", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("real graph request unexpectedly failed: %d", response.Code)
	}
	requestID := response.Header().Get(observability.RequestIDHeader)
	if requestID == "" {
		t.Fatal("server did not create the authoritative Request ID")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := observer.Close(ctx); err != nil {
		t.Fatal(err)
	}
	reopened, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reopened.Close(context.Background()) }()
	detail, err := reopened.Get(ctx, observability.RequestGetInput{RequestID: requestID})
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, span := range detail.Spans {
		if span.Name == "kernel.graph.query" {
			counts[span.Outcome]++
		}
	}
	if counts["succeeded"] != 1 || counts["error"] != 1 {
		t.Fatalf("read stage incorrectly lost its real outcome: %+v (spans %+v)", counts, detail.Spans)
	}
}
