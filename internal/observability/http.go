package observability

import (
	"bufio"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"
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
		if route == "api" || route == "web_auth" {
			ctx = WithSurface(ctx, "api")
		}
		w.Header().Set(RequestIDHeader, id)
		start := time.Now()
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
			// Static assets count toward transport metrics but stay out of
			// access logs; expected Docker health probes count toward neither.
			if route == "static" || probe {
				return
			}
			level := slog.LevelInfo
			if status >= 500 {
				level = slog.LevelError
			} else if status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusTooManyRequests {
				level = slog.LevelWarn
			}
			o.Log(ctx, level, "http", "http.request.finished",
				slog.String("route", route), slog.String("method", safeMethod(r.Method)),
				slog.Int("status", status), slog.Int64("duration_ms", elapsed.Milliseconds()))
		}()
		next.ServeHTTP(tracked, r.WithContext(ctx))
	})
}

func routeClass(path string, mcpPath []string) string {
	switch {
	case path == "/mcp", len(mcpPath) != 0 && path == mcpPath[0]:
		return "mcp"
	case path == "/oauth/authorize", path == "/oauth/token", path == "/oauth/decision", path == "/oauth/request":
		return "oauth"
	case strings.HasPrefix(path, "/api/v1/web/auth/"):
		return "web_auth"
	case strings.HasPrefix(path, "/api/v1/"):
		return "api"
	default:
		return "static"
	}
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
	status int
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
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	_ = http.NewResponseController(w.ResponseWriter).Flush()
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
