package observability

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSlowRequestsCanAlsoBeErrors(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	observer, err := New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	handler := HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/slow-error" {
			time.Sleep(2050 * time.Millisecond)
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	for _, path := range []string{"/api/v1/success", "/api/v1/slow-error"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, path, nil))
	}
	closeObserverForTest(t, observer)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	snapshot, err := reopened.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Total != 2 || snapshot.Success != 1 || snapshot.Errors != 1 ||
		snapshot.Slow != 1 || snapshot.Incomplete != 0 {
		t.Fatalf("slow/error intersection was misclassified: %+v", snapshot)
	}
}
