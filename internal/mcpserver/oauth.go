package mcpserver

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sync"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
)

const (
	oauthScope             = "kgos:access"
	ticketLifetime         = 5 * time.Minute
	codeLifetime           = time.Minute
	accessLifetime         = time.Hour
	refreshLifetime        = 30 * 24 * time.Hour
	clientCacheLifetime    = 5 * time.Minute
	maxPendingOAuth        = 128
	maxOAuthTokens         = 256
	maxClientDocumentBytes = 16384
)

var (
	oauthSecretPattern     = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	oauthVerifierPattern   = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
	oauthVisiblePattern    = regexp.MustCompile(`^[!-~]{1,512}$`)
	oauthClientPathPattern = regexp.MustCompile(`^/oauth/(?:client\.json|[A-Za-z0-9_-]{1,100}/client\.json)$`)
)

type oauthAuthorization struct {
	clientID, redirectURI, resource, state, challenge string
	expires                                           time.Time
}
type oauthGrant struct {
	clientID, issuer, resource, scope string
	expires                           time.Time
}
type cachedOAuthDocument struct {
	redirects []string
	expires   time.Time
}

// oauthBroker is process-local. Every restart invalidates codes and issued
// credentials. Authorization uses the existing Instance identity.
// Only hashes of bearer credentials are stored.
type oauthBroker struct {
	issuer, resource, path string
	instanceDigest         [32]byte
	client                 *http.Client
	now                    func() time.Time
	mu                     sync.Mutex
	tickets                map[[32]byte]oauthAuthorization
	codes                  map[[32]byte]oauthAuthorization
	access                 map[[32]byte]oauthGrant
	refresh                map[[32]byte]oauthGrant
	documents              map[string]cachedOAuthDocument
	metadataRequests       int
}

func newOAuthBroker(issuer, path, instanceToken string, client *http.Client) (*oauthBroker, error) {
	parsed, err := url.Parse(issuer)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
		(parsed.Path != "" && parsed.Path != "/") || parsed.Opaque != "" ||
		(parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1"))) {
		return nil, errors.New("OAuth issuer must be a public HTTPS origin (loopback HTTP is permitted)")
	}
	// Reject suspicious literal URLs rather than normalizing away ambiguity.
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
	return &oauthBroker{
		issuer: normalized, resource: normalized, path: path, instanceDigest: sha256.Sum256([]byte(instanceToken)),
		client: &copyClient, now: time.Now,
		tickets: make(map[[32]byte]oauthAuthorization), codes: make(map[[32]byte]oauthAuthorization),
		access: make(map[[32]byte]oauthGrant), refresh: make(map[[32]byte]oauthGrant),
		documents: make(map[string]cachedOAuthDocument),
	}, nil
}

func randomOAuthSecret() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}
func oauthHash(s string) [32]byte { return sha256.Sum256([]byte(s)) }
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
	for key, value := range o.codes {
		if !value.expires.After(now) {
			delete(o.codes, key)
		}
	}
	for key, value := range o.access {
		if !value.expires.After(now) {
			delete(o.access, key)
		}
	}
	for key, value := range o.refresh {
		if !value.expires.After(now) {
			delete(o.refresh, key)
		}
	}
	for key, value := range o.documents {
		if !value.expires.After(now) {
			delete(o.documents, key)
		}
	}
}

func (o *oauthBroker) principal(token string) (string, bool) {
	if len(token) < 43 || len(token) > 512 || !oauthVerifierPattern.MatchString(token) {
		return "", false
	}
	hash := oauthHash(token)
	o.mu.Lock()
	defer o.mu.Unlock()
	o.pruneLocked()
	grant, ok := o.access[hash]
	if !ok || grant.issuer != o.issuer || grant.resource != o.resource || grant.scope != oauthScope || !grant.expires.After(o.now()) {
		return "", false
	}
	// A grant represents the same Instance identity, but is valid for MCP only.
	return fmt.Sprintf("%x", o.instanceDigest), true
}

func validOAuthClientID(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Host == "chatgpt.com" && parsed.User == nil &&
		parsed.Opaque == "" && parsed.RawQuery == "" && parsed.Fragment == "" &&
		oauthClientPathPattern.MatchString(parsed.Path) && parsed.String() == raw
}
func validOAuthRedirect(raw string) bool {
	if len(raw) == 0 || len(raw) > 2048 {
		return false
	}
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Host == "chatgpt.com" &&
		parsed.User == nil && parsed.Fragment == "" && parsed.Opaque == "" && parsed.String() == raw
}

// redirectsFor downloads only a fixed, HTTPS ChatGPT Client ID Metadata URL.
// The cap applies to declared and actual bytes, and redirects are never followed.
func (o *oauthBroker) redirectsFor(ctx context.Context, clientID string) ([]string, error) {
	if !validOAuthClientID(clientID) {
		return nil, errors.New("invalid_client")
	}
	o.mu.Lock()
	o.pruneLocked()
	if cached, ok := o.documents[clientID]; ok {
		result := append([]string(nil), cached.redirects...)
		o.mu.Unlock()
		return result, nil
	}
	if o.metadataRequests >= 8 || len(o.documents) >= maxPendingOAuth {
		o.mu.Unlock()
		return nil, errors.New("temporarily_unavailable")
	}
	o.metadataRequests++
	o.mu.Unlock()
	defer func() { o.mu.Lock(); o.metadataRequests--; o.mu.Unlock() }()
	metadataCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(metadataCtx, http.MethodGet, clientID, nil)
	if err != nil {
		return nil, errors.New("invalid_client")
	}
	req.Header.Set("Accept", "application/json")
	response, err := o.client.Do(req)
	if err != nil {
		return nil, errors.New("invalid_client")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || response.ContentLength > maxClientDocumentBytes {
		return nil, errors.New("invalid_client")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxClientDocumentBytes+1))
	if err != nil || len(data) > maxClientDocumentBytes {
		return nil, errors.New("invalid_client")
	}
	var document struct {
		ClientID              string   `json:"client_id"`
		RedirectURIs          []string `json:"redirect_uris"`
		AuthenticationMethod  string   `json:"token_endpoint_auth_method"`
		AuthenticationMethods []string `json:"token_endpoint_auth_methods_supported"`
	}
	if err := json.Unmarshal(data, &document); err != nil {
		return nil, errors.New("invalid_client")
	}
	supported := document.AuthenticationMethod == "none"
	for _, method := range document.AuthenticationMethods {
		if method == "none" {
			supported = true
		}
	}
	if document.ClientID != clientID || len(document.RedirectURIs) == 0 || len(document.RedirectURIs) > 128 || !supported {
		return nil, errors.New("invalid_client")
	}
	for _, redirect := range document.RedirectURIs {
		if !validOAuthRedirect(redirect) {
			return nil, errors.New("invalid_client")
		}
	}
	o.mu.Lock()
	o.pruneLocked()
	if len(o.documents) < maxPendingOAuth {
		o.documents[clientID] = cachedOAuthDocument{redirects: append([]string(nil), document.RedirectURIs...), expires: o.now().Add(clientCacheLifetime)}
	}
	o.mu.Unlock()
	return document.RedirectURIs, nil
}

func (o *oauthBroker) resourceMetadataPath() string {
	return "/.well-known/oauth-protected-resource" + o.path
}
func (o *oauthBroker) resourceMetadataURL() string { return o.issuer + o.resourceMetadataPath() }
func (o *oauthBroker) routes() map[string]http.Handler {
	paths := []string{"/.well-known/oauth-protected-resource", o.resourceMetadataPath(),
		"/.well-known/oauth-authorization-server", "/oauth/authorize", "/oauth/request",
		"/oauth/decision", "/oauth/token"}
	routes := make(map[string]http.Handler, len(paths))
	for _, path := range paths {
		if path == "/oauth/token" {
			routes[path] = observability.SecurityHTTP("oauth.token.exchange", o.serveHTTP)
		} else {
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
		oauthJSON(w, 200, map[string]any{"resource": o.resource, "authorization_servers": []string{o.issuer}, "scopes_supported": []string{oauthScope}})
	case "/.well-known/oauth-authorization-server":
		if r.Method != http.MethodGet {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		oauthJSON(w, 200, map[string]any{
			"issuer": o.issuer, "authorization_endpoint": o.issuer + "/oauth/authorize",
			"token_endpoint": o.issuer + "/oauth/token", "response_types_supported": []string{"code"},
			"grant_types_supported":                          []string{"authorization_code", "refresh_token"},
			"code_challenge_methods_supported":               []string{"S256"},
			"token_endpoint_auth_methods_supported":          []string{"none"},
			"client_id_metadata_document_supported":          true,
			"authorization_response_iss_parameter_supported": true,
			"scopes_supported":                               []string{oauthScope},
		})
	case "/oauth/authorize":
		if r.Method == http.MethodGet {
			o.beginAuthorization(w, r)
			return
		}
		oauthFailure(w, 405, "invalid_request")
	case "/oauth/request":
		if r.Method != http.MethodGet {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		o.authorizationDetails(w, r)
	case "/oauth/decision":
		if r.Method != http.MethodPost {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		o.finishAuthorization(w, r)
	case "/oauth/token":
		if r.Method != http.MethodPost {
			oauthFailure(w, 405, "invalid_request")
			return
		}
		o.issueToken(w, r)
	default:
		http.NotFound(w, r)
	}
}
