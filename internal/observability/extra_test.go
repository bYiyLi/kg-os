package observability

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDiagnosticLevelsCountersAndSecurityDecisions(t *testing.T) {
	t.Parallel()
	for _, level := range []string{"", "info", "Debug", "warn", "ERROR"} {
		o, _ := testObserver(t, level)
		if o == nil {
			t.Fatalf("invalid logger: %q", level)
		}
	}
	o, output := testObserver(t, "DEBUG")
	ctx, _, err := WithRequest(context.Background(), o)
	if err != nil {
		t.Fatal(err)
	}
	Log(ctx, slog.LevelDebug, "runtime", "runtime.debug")
	Log(ctx, slog.LevelError, "runtime", "runtime.failed")
	Security(ctx, "oauth.token.exchange", "rejected")
	if len(parsedLines(t, output.String())) != 3 {
		t.Fatal("log level filter dropped DEBUG or ERROR")
	}
	for _, test := range []struct {
		outcome string
		err     error
		before  bool
	}{
		{"applied", nil, false},
		{"rejected", errors.New("invalid request"), true},
		{"unknown", errors.New("possibly committed"), false},
	} {
		if got := ErrorOutcome(test.err, test.before); got != test.outcome {
			t.Fatalf("ErrorOutcome = %q want %q", got, test.outcome)
		}
	}
	Business(ctx, BusinessResult{Operation: "evolution.merge.start", Outcome: "unexpected", State: "commit/bad-token"})
	o.HTTPStart()
	o.HTTPEnd(http.StatusInternalServerError, 2*time.Second)
	o.HTTPStart()
	o.HTTPEnd(http.StatusNoContent, 160*time.Millisecond)
	o.HTTPStart()
	o.HTTPEnd(http.StatusUnauthorized, 700*time.Millisecond)
	o.ToolStart()
	o.Tool(ctx, "kgos_read", "RESOURCE_ERROR", time.Millisecond)
	o.ToolStart()
	o.Tool(ctx, "kgos_run", "TIMEOUT", time.Second)
	o.ToolStart()
	o.Tool(ctx, "kgos_run", "CANCELLED", time.Millisecond)
	if o.Snapshot().Sandbox.ResourceLimitsTotal != 0 {
		t.Fatal("Tool RESOURCE_ERROR must not impersonate a sandbox budget limit")
	}
	o.SandboxLimit(ctx)
	stats := o.Snapshot()
	if stats.HTTP.RequestsTotal != 3 || stats.HTTP.Non2xxTotal != 2 ||
		stats.HTTP.InFlight != 0 || stats.HTTP.Latency.LE1000 != 2 ||
		stats.HTTP.Latency.LE250 != 1 || stats.HTTP.Latency.Over1000 != 1 ||
		stats.MCP.ToolErrorsTotal != 3 || stats.MCP.ToolTimeoutsTotal != 1 ||
		stats.Sandbox.ResourceLimitsTotal != 1 || stats.Business.Outcomes["unknown"] != 1 {
		t.Fatalf("wrong cumulative metrics: %+v", stats)
	}
}

func TestHTTPRoutingAndSecurityStatusBoundaries(t *testing.T) {
	t.Parallel()
	o, output := testObserver(t, "INFO")
	for _, test := range []struct {
		method, path string
		status       int
		wantRoute    string
	}{
		{"POST", "/custom-mcp", http.StatusOK, "mcp"},
		{"POST", "/oauth/token?code=secret-value", http.StatusForbidden, "oauth"},
		{"GET", "/api/v1/web/auth/session", http.StatusNoContent, "web_auth"},
		{"POST", "/api/v1/graph/query", http.StatusBadRequest, "api"},
		{"GET", "/.well-known/oauth-protected-resource", http.StatusOK, "static"},
	} {
		handler := HTTPMiddleware(o, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(test.status)
		}), "/custom-mcp")
		req := httptest.NewRequest(test.method, test.path, nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != test.status || RequestID(req.Context()) != "" {
			t.Fatalf("wrong response for %s", test.path)
		}
		if test.wantRoute == "static" {
			continue
		}
		lines := parsedLines(t, output.String())
		if last := lines[len(lines)-1]; last["route"] != test.wantRoute {
			t.Fatalf("route mismatch: %+v", last)
		}
	}
	if strings.Contains(output.String(), "secret-value") {
		t.Fatal("OAuth query secret leaked")
	}
	ctx, _, err := WithRequest(context.Background(), o)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		status   int
		decision string
	}{
		{http.StatusCreated, "applied"},
		{http.StatusForbidden, "rejected"},
		{http.StatusServiceUnavailable, "unknown"},
	} {
		action := SecurityHTTP("web.auth.login", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(test.status)
		})
		action(httptest.NewRecorder(), httptest.NewRequestWithContext(ctx, http.MethodPost, "/api/v1/web/auth/login", nil))
		logs := parsedLines(t, output.String())
		if logs[len(logs)-1]["decision"] != test.decision {
			t.Fatalf("auth event lost: %+v", logs[len(logs)-1])
		}
	}
	before := len(parsedLines(t, output.String()))
	SecurityHTTP("web.auth.login", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusMethodNotAllowed)
	})(httptest.NewRecorder(), httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/v1/web/auth/login", nil))
	if len(parsedLines(t, output.String())) != before {
		t.Fatal("GET must not emit a POST authentication event")
	}
}
