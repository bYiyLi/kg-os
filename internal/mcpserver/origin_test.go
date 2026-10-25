package mcpserver

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestMCPOriginRejectsUntrustedOriginsOnEveryMethod(t *testing.T) {
	server, err := New(&kernel.Service{}, Options{Token: "origin-test-token", OAuthIssuer: "https://kgos.example"})
	if err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodPost, http.MethodDelete} {
		for _, origins := range [][]string{
			{"https://attacker.example"}, {"null"}, {""},
			{"https://kgos.example", "https://attacker.example"},
			{"https://kgos.example", "https://kgos.example"},
			{"https://kgos.example, https://attacker.example"},
			{"https://kgos.example/"}, {"https://user@kgos.example"},
			{"https://kgos.example?query"}, {"https://kgos.example#fragment"},
			{"https://kgos.example?"}, {"https://kgos.example#"},
		} {
			request := httptest.NewRequest(method, "https://kgos.example/mcp", strings.NewReader(`{}`))
			request.Header.Set("Authorization", "Bearer origin-test-token")
			for _, origin := range origins {
				request.Header.Add("Origin", origin)
			}
			response := httptest.NewRecorder()
			server.Handler().ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Errorf("%s Origin=%q status=%d; want 403", method, origins, response.Code)
			}
		}
	}
}

func TestMCPOriginAllowsNativeClientsAndExistingSameOriginContract(t *testing.T) {
	server, err := New(&kernel.Service{}, Options{Token: "origin-test-token", OAuthIssuer: "https://kgos.example/"})
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range []struct {
		name, target, origin string
		secure               bool
	}{
		{"native", "http://127.0.0.1/mcp", "", false},
		{"loopback", "http://127.0.0.1/mcp", "http://127.0.0.1", false},
		{"public-proxy-host-rewrite", "http://127.0.0.1/mcp", "https://kgos.example", false},
		{"same-origin-tls", "https://another.example/mcp", "https://another.example", true},
	} {
		t.Run(entry.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, entry.target, nil)
			request.Header.Set("Authorization", "Bearer origin-test-token")
			if entry.origin != "" {
				request.Header.Set("Origin", entry.origin)
			}
			if entry.secure {
				request.TLS = &tls.ConnectionState{}
			}
			response := httptest.NewRecorder()
			server.Handler().ServeHTTP(response, request)
			if response.Code != http.StatusMethodNotAllowed {
				t.Fatalf("trusted request rejected before stateless transport: status=%d", response.Code)
			}
		})
	}
	for _, entry := range []struct{ target, origin string }{
		{"http://remote.example/mcp", "http://remote.example"},
		{"https://kgos.example/mcp", "http://kgos.example"},
	} {
		request := httptest.NewRequest(http.MethodPost, entry.target, nil)
		request.Header.Set("Origin", entry.origin)
		if server.allowedOrigin(request) {
			t.Errorf("unsafe origin accepted: %s -> %s", entry.origin, entry.target)
		}
	}
}

func TestMCPOriginPreservesBrowserFetchMetadataBoundary(t *testing.T) {
	server, err := New(&kernel.Service{}, Options{Token: "origin-test-token", OAuthIssuer: "https://kgos.example"})
	if err != nil {
		t.Fatal(err)
	}
	for _, origin := range []string{"http://127.0.0.1", "https://kgos.example"} {
		for _, site := range []string{"", "same-origin", "same-site", "cross-site", "none"} {
			request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/mcp", nil)
			request.Header.Set("Authorization", "Bearer origin-test-token")
			request.Header.Set("Origin", origin)
			if site != "" {
				request.Header.Set("Sec-Fetch-Site", site)
			}
			response := httptest.NewRecorder()
			server.Handler().ServeHTTP(response, request)
			want := http.StatusForbidden
			if site == "" || site == "same-origin" {
				want = http.StatusMethodNotAllowed
			}
			if response.Code != want {
				t.Errorf("Origin=%s Sec-Fetch-Site=%q status=%d; want %d", origin, site, response.Code, want)
			}
		}
	}
}
