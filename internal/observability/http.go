package observability

import (
	"bufio"
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"go.opentelemetry.io/otel/trace"
)

// HTTPMiddleware issues trusted request identifiers before authentication.
// It observes status codes only, never bodies, and preserves streaming.
func HTTPMiddleware(o *Observer, next http.Handler, mcpPath ...string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, id, err := WithRequest(r.Context(), o)
		if err != nil {
			http.Error(w, "service unavailable", http.StatusServiceUnavailable)
			return
		}
		route := routeClass(r.URL.Path, mcpPath)
		operation := routeOperation(r.URL.Path, route)
		if route == "api" || route == "web_auth" {
			ctx = WithSurface(ctx, "api")
		}
		// Observability's own polling, static UI assets and health probes
		// cannot produce new observed business requests or circular traces.
		observe := route != "static" &&
			!(route == "mcp" && r.Method == http.MethodGet) &&
			!strings.HasPrefix(r.URL.Path, "/api/v1/system/observability/") &&
			r.URL.Path != "/api/v1/system/diagnostics"
		if observe {
			var spanCtx context.Context
			spanCtx, _ = StartSpan(ctx, "http."+route)
			ctx = spanCtx
		}
		w.Header().Set(RequestIDHeader, id)
		start := time.Now()
		if observe && o.store != nil {
			traceID, _ := activeSpanID(ctx)
			o.store.RequestStart(requestRecord{
				Time: start, RunID: o.runID, RequestID: id, TraceID: traceID,
				Route: route, Surface: Surface(ctx), Method: safeMethod(r.Method),
			})
		}
		o.HTTPStart()
		tracked := &statusWriter{ResponseWriter: w}
		defer func() {
			status := tracked.status
			if recovered := recover(); recovered != nil {
				status = http.StatusInternalServerError
				defer panic(recovered)
			}
			if status == 0 {
				status = http.StatusOK
			}
			elapsed := time.Since(start)
			probe := route == "mcp" && r.Method == http.MethodGet && status == http.StatusUnauthorized
			if probe {
				o.HTTPProbeEnd()
			} else {
				o.HTTPEnd(status, elapsed)
			}
			// Static assets and observability's own polling never generate
			// persisted access events. They remain in transport metrics where
			// applicable, but cannot generate recursive diagnostic traffic.
			if !observe {
				return
			}
			level := slog.LevelInfo
			if status >= 500 {
				level = slog.LevelError
			} else if status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusTooManyRequests {
				level = slog.LevelWarn
			}
			outcome := "succeeded"
			if status < 200 || status >= 400 {
				outcome = "error"
			}
			streamOutcome, streamCode := StreamResult(ctx)
			// A normal JSON API can fail before a Kernel operation begins.
			// Use the public error code captured by the response writer rather
			// than trying to infer an error class from HTTP status alone.
			if outcome == "error" && streamCode == "" {
				streamCode = tracked.errorCode
			}
			if streamOutcome == "error" {
				outcome = "error"
				if level < slog.LevelWarn {
					level = slog.LevelWarn
				}
			} else if streamOutcome == "succeeded" && outcome == "succeeded" {
				outcome = "succeeded"
			}
			attrs := []slog.Attr{
				slog.String("route", route), slog.String("surface", Surface(ctx)),
				slog.String("operation", operation),
				slog.String("method", safeMethod(r.Method)), slog.String("outcome", outcome),
				slog.Int("status", status), slog.Int64("duration_ms", elapsed.Milliseconds()),
			}
			if streamCode != "" {
				attrs = append(attrs, slog.String("error_code", streamCode))
			}
			o.Log(ctx, level, "http", "http.request.finished", attrs...)
			if observe {
				if o.store != nil {
					traceID, _ := activeSpanID(ctx)
					o.store.RequestEnd(requestRecord{
						Time: time.Now(), RunID: o.runID, RequestID: id, TraceID: traceID,
						Route: route, Surface: Surface(ctx), Method: safeMethod(r.Method),
						Status: status, DurationMS: elapsed.Milliseconds(), Outcome: outcome, ErrorCode: streamCode,
					})
				}
				SpanOutcome(trace.SpanFromContext(ctx), outcome)
				trace.SpanFromContext(ctx).End()
			}
		}()
		next.ServeHTTP(tracked, r.WithContext(ctx))
	})
}

func routeClass(path string, mcpPath []string) string {
	switch {
	case path == "/mcp", len(mcpPath) != 0 && path == mcpPath[0]:
		return "mcp"
	case path == "/oauth/register", path == "/oauth/authorize", path == "/oauth/token", path == "/oauth/revoke", path == "/oauth/decision", path == "/oauth/request":
		return "oauth"
	case strings.HasPrefix(path, "/api/v1/web/auth/"):
		return "web_auth"
	case strings.HasPrefix(path, "/api/v1/"):
		return "api"
	default:
		return "static"
	}
}

// Only registered static routes may become diagnostic operation names.
// An arbitrary request URL (including its path or query) is never persisted.
func routeOperation(path, route string) string {
	if route == "mcp" {
		return "mcp.transport"
	}
	switch path {
	case "/api/v1/graph/query", "/api/v1/graph/execute",
		"/api/v1/setup/status", "/api/v1/setup/rotate-token",
		"/api/v1/setup/initialize", "/api/v1/setup/validate-embedding",
		"/api/v1/object/read", "/api/v1/object/read-text", "/api/v1/object/patch",
		"/api/v1/ontology/read", "/api/v1/ontology/object", "/api/v1/ontology/patch",
		"/api/v1/evolution/overview", "/api/v1/evolution/get", "/api/v1/evolution/ancestry",
		"/api/v1/evolution/history", "/api/v1/evolution/diff",
		"/api/v1/evolution/state/create", "/api/v1/evolution/state/set-data", "/api/v1/evolution/state/clear-data",
		"/api/v1/evolution/branch/list", "/api/v1/evolution/branch/create", "/api/v1/evolution/branch/delete",
		"/api/v1/evolution/tag/list", "/api/v1/evolution/tag/create", "/api/v1/evolution/tag/move", "/api/v1/evolution/tag/delete",
		"/api/v1/evolution/merge/start", "/api/v1/evolution/merge/list", "/api/v1/evolution/merge/get",
		"/api/v1/evolution/merge/conflicts", "/api/v1/evolution/merge/resolve",
		"/api/v1/evolution/merge/finalize", "/api/v1/evolution/merge/abort",
		"/api/v1/system/diagnostics", "/api/v1/web/data/info",
		"/api/v1/web/auth/login", "/api/v1/web/auth/logout", "/api/v1/web/auth/session",
		"/api/v1/web/settings/read", "/api/v1/web/settings/update", "/api/v1/web/settings/embedding-key",
		"/api/v1/web/settings/test-embedding",
		"/api/v1/system/observability/overview", "/api/v1/system/observability/requests/list",
		"/api/v1/system/observability/requests/get", "/api/v1/system/observability/logs/list":
		return strings.ReplaceAll(strings.TrimPrefix(path, "/api/v1/"), "/", ".")
	case "/oauth/register", "/oauth/authorize", "/oauth/token", "/oauth/revoke", "/oauth/decision", "/oauth/request":
		return strings.TrimPrefix(path, "/")
	}
	return route + ".unmapped"
}

func safeMethod(method string) string {
	switch method {
	case "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS":
		return method
	}
	return "other"
}

type statusWriter struct {
	http.ResponseWriter
	status    int
	errorCode string
}

// RecordPublicError accepts only a known-format public code. It propagates
// through nested response wrappers (e.g. security endpoints) without adding
// headers or inspecting response bodies.
func (w *statusWriter) RecordPublicError(code string) {
	w.errorCode = SafeCode(code)
	if parent, ok := w.ResponseWriter.(interface{ RecordPublicError(string) }); ok {
		parent.RecordPublicError(w.errorCode)
	}
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (w *statusWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *statusWriter) Flush() {
	_ = w.FlushError()
}

// ResponseController prefers FlushError over Flush when available. Preserve
// the underlying I/O failure so an NDJSON stream is not falsely completed.
func (w *statusWriter) FlushError() error {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return http.NewResponseController(w.ResponseWriter).Flush()
}
func (w *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return http.NewResponseController(w.ResponseWriter).Hijack()
}

// SecurityHTTP is invoked by an authentication endpoint owner. The final
// security decision is known here without inspecting credentials or bodies.
func SecurityHTTP(operation string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		record := &statusWriter{ResponseWriter: w}
		next(record, r)
		if r.Method != http.MethodPost {
			return
		}
		switch {
		case record.status >= 200 && record.status < 300:
			Security(r.Context(), operation, "applied")
		case record.status >= 500:
			Security(r.Context(), operation, "unknown")
		default:
			Security(r.Context(), operation, "rejected")
		}
	}
}
