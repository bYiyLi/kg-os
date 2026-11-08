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
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bYiyLi/kg-os/internal/mcpoauth"
	"github.com/bYiyLi/kg-os/internal/observability"
)

const (
	oauthScope                = "mcp"
	legacyOAuthScope          = "kgos:access"
	oauthOfflineScope         = "offline_access"
	ticketLifetime            = 5 * time.Minute
	codeLifetime              = 5 * time.Minute
	accessLifetime            = 15 * time.Minute
	accessRefreshHint         = accessLifetime - time.Minute
	refreshLifetime           = 30 * 24 * time.Hour
	clientCacheLifetime       = 5 * time.Minute
	maxPendingOAuth           = 128
	maxOAuthTokens            = 256
	maxClientDocumentBytes    = 64 << 10
	oauthRefreshRetryLifetime = 30 * time.Second
	maxOAuthRefreshRetries    = 1024
)

var (
	oauthSecretPattern   = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	oauthVerifierPattern = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
	oauthVisiblePattern  = regexp.MustCompile(`^[!-~]{1,512}$`)
)

type oauthAuthorization struct {
	clientID, redirectURI, resource, state, challenge, scope           string
	clientName, clientKind, redirectHost, redirectOrigin, redirectPath string
	loopback                                                           bool
	expires                                                            time.Time
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
	registrationTimes      map[string][]time.Time
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
		client = secureOAuthClient()
	}
	copyClient := *client
	if copyClient.Timeout == 0 || copyClient.Timeout > 5*time.Second {
		copyClient.Timeout = 5 * time.Second
	}
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	o := &oauthBroker{
		issuer: normalized, resource: normalized + path, path: path, instanceDigest: sha256.Sum256([]byte(instanceToken)),
		client: &copyClient, now: time.Now, tickets: make(map[[32]byte]oauthAuthorization),
		retries: make(map[[32]byte]oauthRefreshRetry), registrationTimes: make(map[string][]time.Time),
	}
	o.clientAuth = newOAuthClientAuthenticator(o.client, func() time.Time { return o.now() })
	o.clientAuth.registered = o.registeredClient
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
	if !ok {
		// Already issued access tokens retain their hard expiry through migration.
		scope, ok = legacyScope(binding.Scope)
	}
	legacyAudience := false
	if _, legacy := legacyScope(binding.Scope); legacy {
		legacyAudience = binding.Resource == o.issuer && o.resource == o.issuer+o.path
	}
	if !ok || scope != binding.Scope || binding.Issuer != o.issuer ||
		(binding.Resource != o.resource && !legacyAudience) {
		return "", mcpoauth.ErrInvalid
	}
	return fmt.Sprintf("%x", o.instanceDigest), nil
}
func legacyScope(value string) (string, bool) {
	if value == legacyOAuthScope || value == legacyOAuthScope+" "+oauthOfflineScope {
		return value, true
	}
	return "", false
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
	return validOAuthHTTPSURL(raw, true)
}
func validOAuthRedirect(raw string) bool {
	if len(raw) == 0 || len(raw) > 2048 {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" ||
		parsed.Opaque != "" || parsed.String() != raw {
		return false
	}
	hostname := parsed.Hostname()
	if !validOAuthRedirectHost(hostname) {
		return false
	}
	if parsed.Scheme == "https" {
		return true
	}
	if parsed.Scheme != "http" {
		return false
	}
	if strings.EqualFold(parsed.Hostname(), "localhost") {
		return true
	}
	ip, err := netip.ParseAddr(parsed.Hostname())
	return err == nil && ip.IsLoopback()
}

// URL parsing accepts wildcard DNS labels (such as *.example.org). An OAuth
// redirect host must instead be a concrete IP, localhost or DNS name; redirect
// matching itself remains byte-for-byte exact.
func validOAuthRedirectHost(host string) bool {
	if host == "" || len(host) > 253 || strings.ContainsAny(host, "*?%\\") {
		return false
	}
	if _, err := netip.ParseAddr(host); err == nil {
		return true
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, r := range label {
			if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-') {
				return false
			}
		}
	}
	return true
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
		"/oauth/register", "/oauth/authorize", "/oauth/request", "/oauth/decision", "/oauth/token", "/oauth/revoke"}
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
		if r.Method == http.MethodOptions {
			o.metadataOptions(w)
			return
		}
		if r.Method != http.MethodGet {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		o.metadataCORS(w)
		oauthJSON(w, 200, map[string]any{"resource": o.resource, "authorization_servers": []string{o.issuer}, "scopes_supported": []string{oauthScope, oauthOfflineScope}})
	case "/.well-known/oauth-authorization-server":
		if r.Method == http.MethodOptions {
			o.metadataOptions(w)
			return
		}
		if r.Method != http.MethodGet {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		o.metadataCORS(w)
		oauthJSON(w, 200, map[string]any{
			"issuer": o.issuer, "authorization_endpoint": o.issuer + "/oauth/authorize", "token_endpoint": o.issuer + "/oauth/token",
			"revocation_endpoint": o.issuer + "/oauth/revoke", "registration_endpoint": o.issuer + "/oauth/register", "response_types_supported": []string{"code"},
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
		case "/oauth/register":
			if r.Method == http.MethodPost {
				o.registerClient(w, r)
				return
			}
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

func (o *oauthBroker) metadataCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}
func (o *oauthBroker) metadataOptions(w http.ResponseWriter) {
	o.metadataCORS(w)
	w.WriteHeader(http.StatusNoContent)
}
