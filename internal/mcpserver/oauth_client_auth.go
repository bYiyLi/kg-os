package mcpserver

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

const (
	oauthClientFreshTTL       = 5 * time.Minute
	oauthClientStaleTTL       = time.Hour
	oauthAssertionSkew        = 30 * time.Second
	oauthAssertionLifetime    = 5 * time.Minute
	oauthAssertionRetryGrace  = 10 * time.Second
	oauthAssertionReplayLimit = 4096
	oauthClientCacheLimit     = 128
	oauthClientFetchLimit     = 8
	oauthAssertionMaxBytes    = 16 << 10
	oauthPrivateKeyJWT        = "private_key_jwt"
	oauthAssertionType        = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
)

var (
	errOAuthInvalidClient     = errors.New("invalid_client")
	errOAuthClientUnavailable = errors.New("temporarily_unavailable")
)

type oauthClientDocument struct {
	ClientID              string   `json:"client_id"`
	ClientName            string   `json:"client_name"`
	ClientURI             string   `json:"client_uri,omitempty"`
	Kind                  string   `json:"-"`
	RedirectURIs          []string `json:"redirect_uris"`
	AuthenticationMethod  string   `json:"token_endpoint_auth_method"`
	AuthenticationMethods []string `json:"token_endpoint_auth_methods_supported"`
	SigningAlgorithm      string   `json:"token_endpoint_auth_signing_alg"`
	JWKSURI               string   `json:"jwks_uri"`
	GrantTypes            []string `json:"grant_types"`
	ResponseTypes         []string `json:"response_types"`
}

func (d oauthClientDocument) allows(method string) bool {
	// As in Nexum: when the plural metadata field is present it is the
	// authoritative method set. Do not union conflicting declarations,
	// which could silently downgrade a signed client to public auth.
	if len(d.AuthenticationMethods) == 0 {
		return d.AuthenticationMethod == method
	}
	for _, candidate := range d.AuthenticationMethods {
		if candidate == method {
			return true
		}
	}
	return false
}

type oauthClientCacheEntry struct {
	document               oauthClientDocument
	freshUntil, staleUntil time.Time
}
type oauthClientFlight struct {
	done chan struct{}
	err  error
}
type oauthAssertionReplay struct {
	assertionHash, fingerprint [32]byte
	firstSeen, expires         time.Time
}

type oauthClientAuthenticator struct {
	client     *http.Client
	registered func(context.Context, string) (oauthClientDocument, error)
	now        func() time.Time
	mu         sync.Mutex
	documents  map[string]oauthClientCacheEntry
	flights    map[string]*oauthClientFlight
	assertions map[[32]byte]oauthAssertionReplay
	keys       *oauthJWKSResolver
}

func newOAuthClientAuthenticator(client *http.Client, now func() time.Time) *oauthClientAuthenticator {
	if client == nil {
		client = &http.Client{}
	}
	copyClient := *client
	if copyClient.Timeout <= 0 || copyClient.Timeout > 5*time.Second {
		copyClient.Timeout = 5 * time.Second
	}
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	if now == nil {
		now = time.Now
	}
	a := &oauthClientAuthenticator{client: &copyClient, now: now,
		documents: make(map[string]oauthClientCacheEntry), flights: make(map[string]*oauthClientFlight),
		assertions: make(map[[32]byte]oauthAssertionReplay)}
	a.keys = newOAuthJWKSResolver(a.client, now)
	return a
}

// Client permits stale metadata only during token/revocation authentication.
// New browser approvals always require fresh redirect authority.
func (a *oauthClientAuthenticator) Client(ctx context.Context, clientID string, allowStale bool) (oauthClientDocument, error) {
	if !validOAuthClientID(clientID) {
		if a.registered != nil {
			return a.registered(ctx, clientID)
		}
		return oauthClientDocument{}, errOAuthInvalidClient
	}
	now := a.now()
	a.mu.Lock()
	entry, cached := a.documents[clientID]
	if cached && entry.freshUntil.After(now) {
		a.mu.Unlock()
		return cloneOAuthClient(entry.document), nil
	}
	if flight := a.flights[clientID]; flight != nil {
		a.mu.Unlock()
		select {
		case <-ctx.Done():
			return oauthClientDocument{}, errOAuthClientUnavailable
		case <-flight.done:
			return a.currentClient(clientID, allowStale, flight.err)
		}
	}
	if len(a.flights) >= oauthClientFetchLimit {
		a.mu.Unlock()
		return a.currentClient(clientID, allowStale, errOAuthClientUnavailable)
	}
	flight := &oauthClientFlight{done: make(chan struct{})}
	a.flights[clientID] = flight
	a.mu.Unlock()
	document, err := a.fetchClient(ctx, clientID)
	a.mu.Lock()
	if err == nil {
		a.pruneClientsLocked(a.now())
		if len(a.documents) >= oauthClientCacheLimit {
			var oldestID string
			var oldest time.Time
			for id, item := range a.documents {
				if oldestID == "" || item.staleUntil.Before(oldest) {
					oldestID, oldest = id, item.staleUntil
				}
			}
			delete(a.documents, oldestID)
		}
		a.documents[clientID] = oauthClientCacheEntry{document: document, freshUntil: a.now().Add(oauthClientFreshTTL), staleUntil: a.now().Add(oauthClientStaleTTL)}
	} else if !errors.Is(err, errOAuthClientUnavailable) {
		// A successful fetch carrying invalid/new authority must not fall back
		// to a previously accepted document.
		delete(a.documents, clientID)
	}
	flight.err = err
	delete(a.flights, clientID)
	close(flight.done)
	a.mu.Unlock()
	return a.currentClient(clientID, allowStale, err)
}

// Resolve a completed fetch against current authority, not a snapshot captured
// before waiting. A later validated fetch may have removed a method or redirect.
func (a *oauthClientAuthenticator) currentClient(clientID string, allowStale bool, fetchErr error) (oauthClientDocument, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	entry, ok := a.documents[clientID]
	now := a.now()
	if ok && (entry.freshUntil.After(now) || (allowStale && errors.Is(fetchErr, errOAuthClientUnavailable) && entry.staleUntil.After(now))) {
		return cloneOAuthClient(entry.document), nil
	}
	if fetchErr == nil {
		fetchErr = errOAuthClientUnavailable
	}
	return oauthClientDocument{}, fetchErr
}

func cloneOAuthClient(document oauthClientDocument) oauthClientDocument {
	document.RedirectURIs = append([]string(nil), document.RedirectURIs...)
	document.AuthenticationMethods = append([]string(nil), document.AuthenticationMethods...)
	document.GrantTypes = append([]string(nil), document.GrantTypes...)
	document.ResponseTypes = append([]string(nil), document.ResponseTypes...)
	return document
}

func (a *oauthClientAuthenticator) pruneClientsLocked(now time.Time) {
	for id, entry := range a.documents {
		if !entry.staleUntil.After(now) {
			delete(a.documents, id)
		}
	}
}

func (a *oauthClientAuthenticator) fetchClient(ctx context.Context, clientID string) (oauthClientDocument, error) {
	var document oauthClientDocument
	data, err := fetchOAuthJSON(ctx, a.client, clientID, maxClientDocumentBytes)
	if err != nil {
		return document, err
	}
	if json.Unmarshal(data, &document) != nil || document.ClientID != clientID || strings.TrimSpace(document.ClientName) == "" || len(document.ClientName) > 512 ||
		len(document.RedirectURIs) == 0 || len(document.RedirectURIs) > 128 ||
		len(document.AuthenticationMethods) > 8 {
		return oauthClientDocument{}, errOAuthInvalidClient
	}
	if document.AuthenticationMethod == "" && len(document.AuthenticationMethods) == 0 {
		document.AuthenticationMethod = "none"
	}
	if !document.allows("none") && !document.allows(oauthPrivateKeyJWT) {
		return oauthClientDocument{}, errOAuthInvalidClient
	}
	for _, redirect := range document.RedirectURIs {
		if !validOAuthRedirect(redirect) {
			return oauthClientDocument{}, errOAuthInvalidClient
		}
	}
	if !oauthOnlyAllowed(document.GrantTypes, "authorization_code", "refresh_token") ||
		!oauthOnlyAllowed(document.ResponseTypes, "code") ||
		(document.ClientURI != "" && !validOAuthClientURI(document.ClientURI)) {
		return oauthClientDocument{}, errOAuthInvalidClient
	}
	if document.allows(oauthPrivateKeyJWT) && (!validOAuthJWKSURI(document.JWKSURI) ||
		(document.SigningAlgorithm != "" && document.SigningAlgorithm != string(jose.RS256))) {
		return oauthClientDocument{}, errOAuthInvalidClient
	}
	document.Kind = "cimd"
	return document, nil
}

func fetchOAuthJSON(ctx context.Context, client *http.Client, target string, limit int64) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, errOAuthInvalidClient
	}
	request.Header.Set("Accept", "application/json")
	response, err := client.Do(request)
	if err != nil {
		if errors.Is(err, errOAuthUnsafeDestination) {
			return nil, errOAuthInvalidClient
		}
		return nil, errOAuthClientUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
		return nil, errOAuthClientUnavailable
	}
	if response.StatusCode != http.StatusOK || response.ContentLength > limit {
		return nil, errOAuthInvalidClient
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, errOAuthClientUnavailable
	}
	if int64(len(data)) > limit {
		return nil, errOAuthInvalidClient
	}
	return data, nil
}

// Authenticate never infers client identity from unverified assertion claims.
// A private assertion is checked only against that client's trusted metadata.
func (a *oauthClientAuthenticator) Authenticate(ctx context.Context, clientID, endpoint string, form url.Values, authorization string) (string, error) {
	if authorization != "" || form.Has("client_secret") {
		return "", errOAuthInvalidClient
	}
	for key, values := range form {
		if len(values) != 1 || len(key) > 128 {
			return "", errOAuthInvalidClient
		}
	}
	if form.Get("client_id") != clientID {
		return "", errOAuthInvalidClient
	}
	document, err := a.Client(ctx, clientID, true)
	if err != nil {
		return "", err
	}
	assertion, assertionType := form.Get("client_assertion"), form.Get("client_assertion_type")
	if assertion == "" && assertionType == "" && !form.Has("client_assertion") && !form.Has("client_assertion_type") {
		if !document.allows("none") {
			return "", errOAuthInvalidClient
		}
		return "none", nil
	}
	if !document.allows(oauthPrivateKeyJWT) || assertionType != oauthAssertionType || len(assertion) == 0 || len(assertion) > oauthAssertionMaxBytes {
		return "", errOAuthInvalidClient
	}
	token, err := jwt.ParseSigned(assertion, []jose.SignatureAlgorithm{jose.RS256})
	if err != nil || len(token.Headers) != 1 || token.Headers[0].KeyID == "" || len(token.Headers[0].KeyID) > 128 {
		return "", errOAuthInvalidClient
	}
	key, err := a.keys.Key(ctx, document.JWKSURI, token.Headers[0].KeyID)
	if err != nil {
		return "", err
	}
	var claims jwt.Claims
	if token.Claims(key, &claims) != nil || claims.Issuer != clientID || claims.Subject != clientID ||
		len(claims.Audience) != 1 || claims.Audience[0] != endpoint || claims.Expiry == nil || claims.IssuedAt == nil ||
		claims.ID == "" || len(claims.ID) > 128 {
		return "", errOAuthInvalidClient
	}
	now := a.now()
	expires, issued := claims.Expiry.Time(), claims.IssuedAt.Time()
	if !expires.After(now.Add(-oauthAssertionSkew)) || issued.After(now.Add(oauthAssertionSkew)) ||
		issued.Before(now.Add(-oauthAssertionLifetime-oauthAssertionSkew)) || !expires.After(issued) ||
		expires.Sub(issued) > oauthAssertionLifetime || expires.After(now.Add(oauthAssertionLifetime+oauthAssertionSkew)) ||
		(claims.NotBefore != nil && (claims.NotBefore.Time().After(now.Add(oauthAssertionSkew)) || claims.NotBefore.Time().After(expires))) {
		return "", errOAuthInvalidClient
	}
	fingerprint := oauthAssertionFingerprint(endpoint, form)
	assertionHash := sha256.Sum256([]byte(assertion))
	replayKey := sha256.Sum256([]byte(clientID + "\x00" + claims.ID))
	a.mu.Lock()
	defer a.mu.Unlock()
	for key, entry := range a.assertions {
		if !entry.expires.After(now) {
			delete(a.assertions, key)
		}
	}
	if previous, ok := a.assertions[replayKey]; ok {
		if strings.HasSuffix(endpoint, "/oauth/token") && form.Get("grant_type") == "refresh_token" && form.Get("refresh_token") != "" &&
			previous.assertionHash == assertionHash && previous.fingerprint == fingerprint && now.Before(previous.firstSeen.Add(oauthAssertionRetryGrace)) {
			return oauthPrivateKeyJWT, nil
		}
		return "", errOAuthInvalidClient
	}
	if len(a.assertions) >= oauthAssertionReplayLimit {
		return "", errOAuthClientUnavailable
	}
	a.assertions[replayKey] = oauthAssertionReplay{assertionHash: assertionHash, fingerprint: fingerprint, firstSeen: now, expires: expires.Add(oauthAssertionSkew)}
	return oauthPrivateKeyJWT, nil
}

func oauthAssertionFingerprint(endpoint string, form url.Values) [32]byte {
	clean := make(url.Values, len(form))
	for key, values := range form {
		if key == "client_assertion" {
			continue
		}
		for _, value := range values {
			// A digest is sufficient to bind a request and avoids retaining raw
			// refresh tokens, codes, or verifiers in replay cache state.
			sum := sha256.Sum256([]byte(value))
			clean.Add(key, hex.EncodeToString(sum[:]))
		}
	}
	return sha256.Sum256([]byte(endpoint + "\x00" + clean.Encode()))
}
