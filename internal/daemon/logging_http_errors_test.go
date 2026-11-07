package daemon

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

func TestPublicJSONErrorsKeepSafeCodesInRequestHistory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "logs")
	store, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := observability.New(io.Discard, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	handler := observability.HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/object/read":
			kernel.WriteJSONError(w, &kernel.PublicError{Code: kernel.CodeParse, Message: "private-value-not-for-logs"})
		case "/api/v1/graph/query":
			writeJSONErrorStatus(w, http.StatusNotAcceptable,
				&kernel.PublicError{Code: kernel.CodeInvalidArgument, Message: "private-value-not-for-logs"})
		case "/api/v1/web/auth/login":
			observability.SecurityHTTP("web.auth.login", func(w http.ResponseWriter, _ *http.Request) {
				kernel.WriteJSONError(w, &kernel.PublicError{Code: kernel.CodeAuthenticationFailed,
					Message: "private-value-not-for-logs"})
			})(w, r)
		case "/api/v1/setup/initialize":
			SetupError(w, http.StatusConflict, kernel.CodeSetupConflict, "private-value-not-for-logs")
		}
	}))
	type testCase struct {
		path   string
		status int
		code   kernel.ErrorCode
	}
	var recorded []struct {
		id string
		testCase
	}
	for _, tt := range []testCase{
		{"/api/v1/object/read", http.StatusBadRequest, kernel.CodeParse},
		{"/api/v1/graph/query", http.StatusNotAcceptable, kernel.CodeInvalidArgument},
		{"/api/v1/web/auth/login", http.StatusUnauthorized, kernel.CodeAuthenticationFailed},
		{"/api/v1/setup/initialize", http.StatusConflict, kernel.CodeSetupConflict},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, tt.path, nil))
		if response.Code != tt.status {
			t.Fatalf("status for %s = %d, expected %d", tt.path, response.Code, tt.status)
		}
		recorded = append(recorded, struct {
			id string
			testCase
		}{id: response.Header().Get(observability.RequestIDHeader), testCase: tt})
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := observer.Close(shutdown); err != nil {
		t.Fatal(err)
	}
	reopened, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reopened.Close(context.Background()) }()
	for _, tt := range recorded {
		detail, err := reopened.Get(context.Background(), observability.RequestGetInput{RequestID: tt.id})
		if err != nil || detail.Request.Status != tt.status || detail.Request.Outcome != "error" ||
			detail.Request.ErrorCode != string(tt.code) {
			t.Fatalf("missing public error class for %s: %+v, %v", tt.path, detail.Request, err)
		}
	}
	logs, err := reopened.ListLogs(context.Background(), observability.LogListInput{})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range logs.Items {
		for _, value := range item.Fields {
			if value == "private-value-not-for-logs" {
				t.Fatalf("response message leaked to log: %+v", item)
			}
		}
	}
}
