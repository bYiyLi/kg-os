package mcpserver

import (
	"log/slog"
	"net/http"

	"github.com/bYiyLi/kg-os/internal/observability"
)

// Callers pass only fixed classifications. Credentials, claims and upstream or
// SQLite error strings never enter diagnostic fields.
func oauthDiagnostic(r *http.Request, code, cause string) {
	operation := "oauth.token.exchange"
	if r.URL.Path == "/oauth/revoke" {
		operation = "oauth.token.revoke"
	}
	observability.Log(r.Context(), slog.LevelWarn, "oauth", "oauth.request.failed",
		slog.String("operation", operation), slog.String("error_code", code), slog.String("cause_class", cause))
}
func oauthServerFailure(w http.ResponseWriter, r *http.Request, cause string) {
	oauthDiagnostic(r, "server_error", cause)
	w.Header().Set("Retry-After", "1")
	oauthFailure(w, http.StatusServiceUnavailable, "server_error")
}
