package observability

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExpectedMCPHealthProbeDoesNotInflateErrorRate(t *testing.T) {
	observer, output := testObserver(t, "INFO")
	handler := HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	for index := 0; index < 12; index++ {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/mcp", nil))
		if response.Code != http.StatusUnauthorized || response.Header().Get(RequestIDHeader) == "" {
			t.Fatal("MCP probe lost authentication or request ID")
		}
	}
	snapshot := observer.Snapshot()
	if snapshot.HTTP.RequestsTotal != 0 || snapshot.HTTP.Non2xxTotal != 0 ||
		snapshot.HTTP.InFlight != 0 || output.Len() != 0 {
		t.Fatalf("expected probe inflated diagnostics: %+v %s", snapshot.HTTP, output.String())
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/mcp", nil))
	if observer.Snapshot().HTTP.Non2xxTotal != 1 {
		t.Fatal("real unauthorized POST must be included in HTTP metrics")
	}
	observer.HTTPProbeEnd()
	if observer.Snapshot().HTTP.InFlight != 0 {
		t.Fatal("probe counter underflow")
	}
}

func TestHTTPMiddlewarePanicRetainsErrorMetricsAndPropagatesPanic(t *testing.T) {
	observer, output := testObserver(t, "INFO")
	handler := HTTPMiddleware(observer, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("private-handler-panic")
	}))
	func() {
		defer func() {
			if recovered := recover(); recovered != "private-handler-panic" {
				t.Fatalf("panic swallowed or replaced: %v", recovered)
			}
		}()
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/graph/execute", nil))
	}()
	stats := observer.Snapshot()
	if stats.HTTP.RequestsTotal != 1 || stats.HTTP.Non2xxTotal != 1 || stats.HTTP.InFlight != 0 {
		t.Fatalf("panic lost in-flight/error metrics: %+v", stats.HTTP)
	}
	if len(parsedLines(t, output.String())) != 1 || output.Len() == 0 {
		t.Fatal("panic not safely observed")
	}
	if bytes.Contains(output.Bytes(), []byte("private-handler-panic")) {
		t.Fatal("panic payload leaked into access logs")
	}
}
