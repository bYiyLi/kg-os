package mcpserver

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bYiyLi/kg-os/internal/mcpoauth"
	"github.com/bYiyLi/kg-os/internal/observability"
)

const (
	oauthScope                = "kgos:access"
	oauthOfflineScope         = "offline_access"
	ticketLifetime            = 5 * time.Minute
	codeLifetime              = time.Minute
	accessLifetime            = 24 * time.Hour
	accessRefreshHint         = accessLifetime - time.Minute
	refreshLifetime           = 30 * 24 * time.Hour
	clientCacheLifetime       = 5 * time.Minute
	maxPendingOAuth           = 128
	maxOAuthTokens            = 256
	maxClientDocumentBytes    = 16384
	oauthRefreshRetryLifetime = 30 * time.Second
	maxOAuthRefreshRetries    = 1024
)

var (
	oauthSecretPattern     = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	oauthVerifierPattern   = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
	oauthVisiblePattern    = regexp.MustCompile(`^[!-~]{1,512}$`)
	oauthClientPathPattern = regexp.MustCompile(`^/oauth/(?:client\.json|[A-Za-z0-9_-]{1,100}/client\.json)$`)
)

type oauthAuthorization struct {
	clientID, redirectURI, resource, state, challenge, scope string
	expires                                                  time.Time
}

type oauthTokenPair struct {
	AccessToken  string
	RefreshToken string
	Scope        string
}

func (p oauthTokenPair) response() map[string]any {
	return map[string]any{
		"access_token": p.AccessToken, "token_type": "Bearer",
		"expires_in": int(accessRefreshHint / time.Second), "refresh_token": p.RefreshToken, "scope": p.Scope,
	}
}

type oauthRefreshRetry struct {
	clientID, resource, requestedScope string
	pair                               oauthTokenPair
	binding                            mcpoauth.Binding
	expires                            time.Time
}

// Only pending browser decisions and short retry responses are process-local.
// Issued credentials and their rotation/revocation authority live in Store.
type oauthBroker struct {
	issuer, resource, path string
	instanceDigest         [32]byte
	client                 *http.Client
	now                    func() time.Time
	mu                     sync.Mutex
	tickets                map[[32]byte]oauthAuthorization
	clientAuth             *oauthClientAuthenticator
	store                  *mcpoauth.Store
	storeErr               error
	tokenMu                sync.Mutex
	retries                map[[32]byte]oauthRefreshRetry
}

func newOAuthBroker(issuer, path, instanceToken string, client *http.Client) (*oauthBroker, error) {
	parsed, err := url.Parse(issuer)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
		(parsed.Path != "" && parsed.Path != "/") || parsed.Opaque != "" ||
		(parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1"))) {
		return nil, errors.New("OAuth issuer must be a public HTTPS origin (loopback HTTP is permitted)")
	}
	normalized := parsed.Scheme + "://" + parsed.Host
	if issuer != normalized && issuer != normalized+"/" {
		return nil, errors.New("OAuth issuer must be an origin")
	}
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	copyClient := *client
	if copyClient.Timeout == 0 || copyClient.Timeout > 5*time.Second {
		copyClient.Timeout = 5 * time.Second
	}
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	o := &oauthBroker{
		issuer: normalized, resource: normalized, path: path, instanceDigest: sha256.Sum256([]byte(instanceToken)),
		client: &copyClient, now: time.Now, tickets: make(map[[32]byte]oauthAuthorization),
		retries: make(map[[32]byte]oauthRefreshRetry),
	}
	o.clientAuth = newOAuthClientAuthenticator(o.client, func() time.Time { return o.now() })
	return o, nil
}
func randomOAuthSecret() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}
func oauthHash(s string) [32]byte     { return sha256.Sum256([]byte(s)) }
func oauthHashString(s string) string { sum := oauthHash(s); return hex.EncodeToString(sum[:]) }
func onlyOAuthValue(values url.Values, key string) string {
	entries := values[key]
	if len(entries) != 1 {
		return ""
	}
	return entries[0]
}
func oauthJSON(w http.ResponseWriter, status int, value any) {
	oauthHeaders(w)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func oauthHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("Pragma", "no-cache")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Content-Type-Options", "nosniff")
}
func oauthFailure(w http.ResponseWriter, status int, kind string) {
	oauthJSON(w, status, map[string]string{"error": kind})
}
func (o *oauthBroker) pruneLocked() {
	now := o.now()
	for key, value := range o.tickets {
		if !value.expires.After(now) {
			delete(o.tickets, key)
		}
	}
}
func (o *oauthBroker) available() error {
	if o.storeErr != nil {
		return o.storeErr
	}
	if o.store == nil {
		return errors.New("OAuth credential store is unavailable")
	}
	return nil
}
func (o *oauthBroker) authorize(ctx context.Context, token string) (string, error) {
	if len(token) != 43 || !oauthSecretPattern.MatchString(token) {
		return "", mcpoauth.ErrInvalid
	}
	if err := o.available(); err != nil {
		return "", err
	}
	binding, err := o.store.ResolveAccess(ctx, oauthHashString(token), o.now())
	if err != nil {
		return "", err
	}
	scope, ok := normalizeOAuthScope(binding.Scope)
	if !ok || scope != binding.Scope || binding.Issuer != o.issuer || binding.Resource != o.resource {
		return "", mcpoauth.ErrInvalid
	}
	return fmt.Sprintf("%x", o.instanceDigest), nil
}
func (o *oauthBroker) principal(token string) (string, bool) {
	principal, err := o.authorize(context.Background(), token)
	return principal, err == nil
}
func normalizeOAuthScope(value string) (string, bool) {
	if value == "" {
		return oauthScope, true
	}
	fields := strings.Fields(value)
	base, offline := false, false
	for _, field := range fields {
		switch field {
		case oauthScope:
			base = true
		case oauthOfflineScope:
			offline = true
		default:
			return "", false
		}
	}
	if !base {
		return "", false
	}
	if offline {
		return oauthScope + " " + oauthOfflineScope, true
	}
	return oauthScope, true
}
func validOAuthClientID(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Host == "chatgpt.com" && parsed.User == nil &&
		parsed.Opaque == "" && parsed.RawQuery == "" && !parsed.ForceQuery && parsed.Fragment == "" && parsed.RawPath == "" && oauthClientPathPattern.MatchString(parsed.Path) && parsed.String() == raw
}
func validOAuthRedirect(raw string) bool {
	if len(raw) == 0 || len(raw) > 2048 {
		return false
	}
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Host == "chatgpt.com" && parsed.User == nil &&
		parsed.Fragment == "" && parsed.Opaque == "" && parsed.String() == raw
}
func (o *oauthBroker) redirectsFor(ctx context.Context, clientID string) ([]string, error) {
	document, err := o.clientAuth.Client(ctx, clientID, false)
	if err != nil {
		return nil, err
	}
	return append([]string(nil), document.RedirectURIs...), nil
}
func (o *oauthBroker) resourceMetadataPath() string {
	return "/.well-known/oauth-protected-resource" + o.path
}
func (o *oauthBroker) resourceMetadataURL() string { return o.issuer + o.resourceMetadataPath() }
func (o *oauthBroker) routes() map[string]http.Handler {
	paths := []string{"/.well-known/oauth-protected-resource", o.resourceMetadataPath(), "/.well-known/oauth-authorization-server",
		"/oauth/authorize", "/oauth/request", "/oauth/decision", "/oauth/token", "/oauth/revoke"}
	routes := make(map[string]http.Handler, len(paths))
	for _, path := range paths {
		switch path {
		case "/oauth/token":
			routes[path] = observability.SecurityHTTP("oauth.token.exchange", o.serveHTTP)
		case "/oauth/revoke":
			routes[path] = observability.SecurityHTTP("oauth.token.revoke", o.serveHTTP)
		default:
			routes[path] = http.HandlerFunc(o.serveHTTP)
		}
	}
	return routes
}
func (o *oauthBroker) serveHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/.well-known/oauth-protected-resource", o.resourceMetadataPath():
		if r.Method != http.MethodGet {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		oauthJSON(w, 200, map[string]any{"resource": o.resource, "authorization_servers": []string{o.issuer}, "scopes_supported": []string{oauthScope, oauthOfflineScope}})
	case "/.well-known/oauth-authorization-server":
		if r.Method != http.MethodGet {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		oauthJSON(w, 200, map[string]any{
			"issuer": o.issuer, "authorization_endpoint": o.issuer + "/oauth/authorize", "token_endpoint": o.issuer + "/oauth/token",
			"revocation_endpoint": o.issuer + "/oauth/revoke", "response_types_supported": []string{"code"},
			"grant_types_supported": []string{"authorization_code", "refresh_token"}, "code_challenge_methods_supported": []string{"S256"},
			"token_endpoint_auth_methods_supported":            []string{"none", "private_key_jwt"},
			"revocation_endpoint_auth_methods_supported":       []string{"none", "private_key_jwt"},
			"token_endpoint_auth_signing_alg_values_supported": []string{"RS256"},
			"client_id_metadata_document_supported":            true, "authorization_response_iss_parameter_supported": true,
			"scopes_supported": []string{oauthScope, oauthOfflineScope},
		})
	default:
		if err := o.available(); err != nil {
			if r.URL.Path == "/oauth/token" || r.URL.Path == "/oauth/revoke" {
				oauthServerFailure(w, r, "store_unavailable")
			} else {
				oauthFailure(w, 503, "temporarily_unavailable")
			}
			return
		}
		switch r.URL.Path {
		case "/oauth/authorize":
			if r.Method == http.MethodGet {
				o.beginAuthorization(w, r)
				return
			}
		case "/oauth/request":
			if r.Method == http.MethodGet {
				o.authorizationDetails(w, r)
				return
			}
		case "/oauth/decision":
			if r.Method == http.MethodPost {
				o.finishAuthorization(w, r)
				return
			}
		case "/oauth/token":
			if r.Method == http.MethodPost {
				o.issueToken(w, r)
				return
			}
		case "/oauth/revoke":
			if r.Method == http.MethodPost {
				o.revokeToken(w, r)
				return
			}
		default:
			http.NotFound(w, r)
			return
		}
		oauthFailure(w, 405, "invalid_request")
	}
}
