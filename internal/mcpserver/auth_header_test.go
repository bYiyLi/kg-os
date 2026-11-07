package mcpserver

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpoauth"
)

func TestMCPAndOAuthBearerAuthenticationSchemeIsCaseInsensitive(t *testing.T) {
	const token = "Case-Sensitive-Test-Token"
	root := t.TempDir()
	if err := os.Chmod(root, 0o700); err != nil {
		t.Fatal(err)
	}
	store, err := mcpoauth.Open(filepath.Join(root, "mcp-oauth.db"), fmt.Sprintf("%x", sha256.Sum256([]byte(token))), "https://kgos.example", "https://kgos.example/mcp")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server, err := New(&kernel.Service{}, Options{Token: token, OAuthIssuer: "https://kgos.example", OAuthStore: store})
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range []struct {
		name, header string
		valid        bool
	}{
		{"canonical", "Bearer " + token, true},
		{"lowercase-scheme", "bearer " + token, true},
		{"mixed-case-scheme", "bEaReR " + token, true},
		{"multiple-spaces", "Bearer   " + token, true},
		{"existing-api-whitespace", "Bearer\t" + token, true},
		{"missing-header", "", false},
		{"empty-token", "Bearer ", false},
		{"different-scheme", "Basic " + token, false},
		{"scheme-suffix", "BearerX " + token, false},
		{"extra-token", "Bearer " + token + " extra", false},
		{"token-case-mismatch", "bearer " + strings.ToLower(token), false},
		{"wrong-token", "bearer wrong-token", false},
		{"oversized-header", "Bearer " + strings.Repeat("x", 4097), false},
	} {
		t.Run(entry.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/mcp", nil)
			request.Header.Set("Authorization", entry.header)
			response := httptest.NewRecorder()
			server.Handler().ServeHTTP(response, request)
			want := http.StatusUnauthorized
			if entry.valid {
				want = http.StatusMethodNotAllowed
			}
			if response.Code != want {
				t.Errorf("MCP authentication status=%d; want %d", response.Code, want)
			}

			request = httptest.NewRequest(http.MethodGet, "https://kgos.example/oauth/request?request_id=short", nil)
			request.Header.Set("Authorization", entry.header)
			response = httptest.NewRecorder()
			server.oauth.serveHTTP(response, request)
			want = http.StatusUnauthorized
			if entry.valid {
				// The deliberately invalid reference is checked only after
				// authenticating the same existing Instance credential.
				want = http.StatusBadRequest
			}
			if response.Code != want {
				t.Errorf("OAuth Web authentication status=%d; want %d", response.Code, want)
			}
		})
	}
}

func TestMCPOAuthAccessTokenAcceptsCaseInsensitiveSchemeWithoutWebPrivilege(t *testing.T) {
	f := newOAuthFixture(t)
	server := f.service
	token := f.grant(nil)["access_token"].(string)
	for _, scheme := range []string{"Bearer ", "bearer ", "bEaReR   "} {
		request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/mcp", nil)
		request.Header.Set("Authorization", scheme+token)
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, request)
		if response.Code != http.StatusMethodNotAllowed {
			t.Errorf("OAuth MCP credential rejected for scheme %q: status=%d", scheme, response.Code)
		}
		if server.oauth.validWebBearer(scheme + token) {
			t.Errorf("OAuth MCP credential acquired Web privilege for scheme %q", scheme)
		}
	}
}
