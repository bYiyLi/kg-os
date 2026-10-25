package mcpserver

import (
	"net/http"
	"net/url"

	"github.com/bYiyLi/kg-os/internal/daemon"
)

// allowedOrigin validates every HTTP method, including the safe methods that
// generic CSRF middleware exempts. Non-browser MCP clients may omit Origin.
func (s *Server) allowedOrigin(r *http.Request) bool {
	origins := r.Header.Values("Origin")
	if len(origins) == 0 {
		return true
	}
	if len(origins) != 1 || origins[0] == "" {
		return false
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
		return false
	}
	// A TLS-terminating proxy may replace Host on the upstream request. Its
	// configured public Origin remains the trusted browser origin.
	if s.oauth != nil && origins[0] == s.oauth.issuer {
		return true
	}
	parsed, err := url.Parse(origins[0])
	return err == nil && origins[0] == parsed.Scheme+"://"+parsed.Host && daemon.ValidSetupOrigin(r)
}
