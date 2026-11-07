package mcpserver

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

const oauthTestJWKS = "https://chatgpt.com/oauth/jwks.json"

type oauthAuthTransport struct {
	mu       sync.Mutex
	bodies   map[string][]byte
	statuses map[string]int
	counts   map[string]int
	failure  bool
	block    chan struct{}
	entered  chan struct{}
}

func (r *oauthAuthTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	r.mu.Lock()
	uri := request.URL.String()
	r.counts[uri]++
	status, exists := r.statuses[uri]
	if !exists {
		status = 200
	}
	body := append([]byte(nil), r.bodies[uri]...)
	failure, block, entered := r.failure, r.block, r.entered
	r.mu.Unlock()
	if entered != nil {
		select {
		case entered <- struct{}{}:
		default:
		}
	}
	if block != nil {
		select {
		case <-block:
		case <-request.Context().Done():
			return nil, request.Context().Err()
		}
	}
	if failure {
		return nil, errors.New("untrusted network details")
	}
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(string(body))), Header: make(http.Header), Request: request}, nil
}

func (r *oauthAuthTransport) set(uri string, value any, status int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.bodies[uri], _ = json.Marshal(value)
	r.statuses[uri] = status
}

func (r *oauthAuthTransport) count(uri string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.counts[uri]
}

type oauthAuthFixture struct {
	auth      *oauthClientAuthenticator
	transport *oauthAuthTransport
	key       *rsa.PrivateKey
	now       time.Time
}

func newOAuthAuthFixture(t *testing.T) *oauthAuthFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	r := &oauthAuthTransport{bodies: make(map[string][]byte), statuses: make(map[string]int), counts: make(map[string]int)}
	f := &oauthAuthFixture{key: key, transport: r, now: time.Date(2026, 11, 4, 1, 0, 0, 0, time.UTC)}
	r.set(oauthTestClient, oauthClientDocument{ClientID: oauthTestClient, ClientName: "ChatGPT", RedirectURIs: []string{oauthTestRedirect}, AuthenticationMethod: oauthPrivateKeyJWT,
		AuthenticationMethods: []string{"none", oauthPrivateKeyJWT}, JWKSURI: oauthTestJWKS, SigningAlgorithm: "RS256"}, 200)
	r.set(oauthTestJWKS, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "first", Use: "sig", Algorithm: "RS256"}}}, 200)
	f.auth = newOAuthClientAuthenticator(&http.Client{Transport: r}, func() time.Time { return f.now })
	return f
}

func (f *oauthAuthFixture) claims(id, endpoint string) jwt.Claims {
	return jwt.Claims{Issuer: oauthTestClient, Subject: oauthTestClient, Audience: jwt.Audience{endpoint}, ID: id,
		IssuedAt: jwt.NewNumericDate(f.now), Expiry: jwt.NewNumericDate(f.now.Add(4 * time.Minute))}
}

func (f *oauthAuthFixture) signed(t *testing.T, claims jwt.Claims, kid string) string {
	t.Helper()
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: f.key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", kid))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := jwt.Signed(signer).Claims(claims).Serialize()
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func oauthSignedForm(assertion string) url.Values {
	return url.Values{"client_id": {oauthTestClient}, "grant_type": {"refresh_token"}, "refresh_token": {"opaque-refresh"}, "resource": {"https://kgos.example"},
		"client_assertion_type": {oauthAssertionType}, "client_assertion": {assertion}}
}

func TestOAuthPrivateJWTAuthenticatesAndBoundsIdenticalRefreshAssertionRetry(t *testing.T) {
	f := newOAuthAuthFixture(t)
	endpoint := "https://kgos.example/oauth/token"
	form := oauthSignedForm(f.signed(t, f.claims("first-assertion", endpoint), "first"))
	for _, elapsed := range []time.Duration{0, 5 * time.Second} {
		f.now = f.now.Add(elapsed)
		method, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, form, "")
		if err != nil || method != oauthPrivateKeyJWT {
			t.Fatalf("signed refresh at %v: %q %v", elapsed, method, err)
		}
	}
	form.Set("refresh_token", "different-refresh")
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, form, ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("assertion crossed request: %v", err)
	}
	form.Set("refresh_token", "opaque-refresh")
	form.Set("scope", "kgos:access")
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, form, ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("assertion crossed scope: %v", err)
	}
	form.Del("scope")
	f.now = f.now.Add(6 * time.Second)
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, form, ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("assertion replay grace exceeded: %v", err)
	}
	if f.transport.count(oauthTestClient) != 1 || f.transport.count(oauthTestJWKS) != 1 {
		t.Fatal("fresh metadata/keys unnecessarily fetched")
	}
}

func TestOAuthPrivateJWTRejectsUntrustedClaimsAndEndpointReplay(t *testing.T) {
	f := newOAuthAuthFixture(t)
	endpoint := "https://kgos.example/oauth/token"
	cases := []struct {
		name   string
		mutate func(*jwt.Claims)
	}{
		{"issuer", func(c *jwt.Claims) { c.Issuer = "https://attacker.example/client" }},
		{"subject", func(c *jwt.Claims) { c.Subject = "another-client" }},
		{"audience", func(c *jwt.Claims) { c.Audience = jwt.Audience{"https://attacker.example/oauth/token"} }},
		{"extra-audience", func(c *jwt.Claims) { c.Audience = append(c.Audience, "https://attacker.example") }},
		{"expired", func(c *jwt.Claims) { c.Expiry = jwt.NewNumericDate(f.now.Add(-time.Minute)) }},
		{"future-issued", func(c *jwt.Claims) { c.IssuedAt = jwt.NewNumericDate(f.now.Add(time.Minute)) }},
		{"old-issued", func(c *jwt.Claims) { c.IssuedAt = jwt.NewNumericDate(f.now.Add(-6 * time.Minute)) }},
		{"long-life", func(c *jwt.Claims) { c.Expiry = jwt.NewNumericDate(f.now.Add(6 * time.Minute)) }},
		{"missing-expiry", func(c *jwt.Claims) { c.Expiry = nil }},
		{"missing-issued", func(c *jwt.Claims) { c.IssuedAt = nil }},
		{"missing-jti", func(c *jwt.Claims) { c.ID = "" }},
		{"future-not-before", func(c *jwt.Claims) { c.NotBefore = jwt.NewNumericDate(f.now.Add(time.Minute)) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			claims := f.claims(tc.name, endpoint)
			tc.mutate(&claims)
			if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, oauthSignedForm(f.signed(t, claims, "first")), ""); !errors.Is(err, errOAuthInvalidClient) {
				t.Fatalf("untrusted claims accepted: %v", err)
			}
		})
	}
	revoke := "https://kgos.example/oauth/revoke"
	form := oauthSignedForm(f.signed(t, f.claims("revoke", revoke), "first"))
	form.Del("grant_type")
	form.Set("token", "revoked-token")
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, revoke, form, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, revoke, form, ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("revocation assertion replay accepted: %v", err)
	}
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, form, ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("revocation assertion crossed endpoint: %v", err)
	}
}

func TestOAuthClientAuthenticationNeverDowngradesInvalidAssertions(t *testing.T) {
	f := newOAuthAuthFixture(t)
	endpoint := "https://kgos.example/oauth/token"
	plain := url.Values{"client_id": {oauthTestClient}, "grant_type": {"refresh_token"}, "refresh_token": {"opaque"}}
	if method, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, plain, ""); err != nil || method != "none" {
		t.Fatalf("public method: %q %v", method, err)
	}
	for _, tc := range []struct {
		name   string
		values url.Values
		header string
	}{
		{"empty-assertion", url.Values{"client_id": {oauthTestClient}, "client_assertion": {""}}, ""},
		{"malformed", oauthSignedForm("not-a-jwt"), ""},
		{"secret", url.Values{"client_id": {oauthTestClient}, "client_secret": {"secret"}}, ""},
		{"header", plain, "Basic credential"},
		{"duplicate", url.Values{"client_id": {oauthTestClient, oauthTestClient}}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, tc.values, tc.header); !errors.Is(err, errOAuthInvalidClient) {
				t.Fatalf("invalid authentication accepted: %v", err)
			}
		})
	}
	if _, err := f.auth.Authenticate(context.Background(), "https://untrusted.example/client.json", endpoint, plain, ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("untrusted client accepted: %v", err)
	}
	if f.transport.count("https://untrusted.example/client.json") != 0 {
		t.Fatal("untrusted metadata fetched")
	}
}

func TestOAuthClientMetadataStaleDoesNotReplaceNewAuthority(t *testing.T) {
	f := newOAuthAuthFixture(t)
	ctx := context.Background()
	if _, err := f.auth.Client(ctx, oauthTestClient, false); err != nil {
		t.Fatal(err)
	}
	f.now = f.now.Add(6 * time.Minute)
	f.transport.set(oauthTestClient, nil, 503)
	if _, err := f.auth.Client(ctx, oauthTestClient, true); err != nil {
		t.Fatalf("validated stale unavailable: %v", err)
	}
	if _, err := f.auth.Client(ctx, oauthTestClient, false); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("browser approval accepted stale authority: %v", err)
	}
	f.transport.set(oauthTestClient, oauthClientDocument{ClientID: oauthTestClient, ClientName: "Updated Client", RedirectURIs: []string{oauthTestRedirect}, AuthenticationMethod: "none"}, 200)
	doc, err := f.auth.Client(ctx, oauthTestClient, true)
	if err != nil || doc.allows(oauthPrivateKeyJWT) {
		t.Fatalf("new authority ignored: %+v %v", doc, err)
	}
	doc.RedirectURIs[0] = "https://untrusted.example"
	doc, err = f.auth.Client(ctx, oauthTestClient, true)
	if err != nil || doc.RedirectURIs[0] != oauthTestRedirect {
		t.Fatal("caller changed cached redirect")
	}
	f.now = f.now.Add(6 * time.Minute)
	f.transport.set(oauthTestClient, nil, 503)
	doc, err = f.auth.Client(ctx, oauthTestClient, true)
	if err != nil || doc.allows(oauthPrivateKeyJWT) {
		t.Fatalf("older signing authority restored: %+v %v", doc, err)
	}
	f.now = f.now.Add(time.Hour)
	if _, err = f.auth.Client(ctx, oauthTestClient, true); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("stale beyond hard limit: %v", err)
	}
}

func TestOAuthJWKSStaleRequiresPreviouslyValidatedMatchingKid(t *testing.T) {
	f := newOAuthAuthFixture(t)
	ctx := context.Background()
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "first"); err != nil {
		t.Fatal(err)
	}
	f.now = f.now.Add(6 * time.Minute)
	f.transport.set(oauthTestJWKS, nil, 503)
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "first"); err != nil {
		t.Fatalf("known stale key unavailable: %v", err)
	}
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "new-kid"); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("unknown key guessed: %v", err)
	}
	f.now = f.now.Add(oauthJWKSProbeCooldown + time.Second)
	f.transport.set(oauthTestJWKS, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &f.key.PublicKey, KeyID: "new-kid", Use: "sig", Algorithm: "RS256"}}}, 200)
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "new-kid"); err != nil {
		t.Fatal(err)
	}
	f.now = f.now.Add(oauthJWKSProbeCooldown + time.Second)
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "first"); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("removed key restored after valid fetch: %v", err)
	}
	f.now = f.now.Add(6 * time.Minute)
	f.transport.set(oauthTestJWKS, nil, 503)
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "first"); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("removed key guessed from older set: %v", err)
	}
	f.now = f.now.Add(time.Hour)
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "new-kid"); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("stale key beyond hard limit: %v", err)
	}
}

func TestOAuthClientMetadataFetchCoalescesAndWaiterCanCancel(t *testing.T) {
	f := newOAuthAuthFixture(t)
	f.transport.mu.Lock()
	f.transport.block = make(chan struct{})
	f.transport.entered = make(chan struct{}, 1)
	block, entered := f.transport.block, f.transport.entered
	f.transport.mu.Unlock()
	finished := make(chan error, 1)
	go func() { _, err := f.auth.Client(context.Background(), oauthTestClient, false); finished <- err }()
	<-entered
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := f.auth.Client(ctx, oauthTestClient, false); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("cancelled waiter: %v", err)
	}
	close(block)
	if err := <-finished; err != nil {
		t.Fatal(err)
	}
	if f.transport.count(oauthTestClient) != 1 {
		t.Fatal("concurrent metadata requests not coalesced")
	}
}

func TestOAuthClientAndJWKSRejectInvalidMetadataWithoutStaleFallback(t *testing.T) {
	f := newOAuthAuthFixture(t)
	ctx := context.Background()
	if _, err := f.auth.Client(ctx, oauthTestClient, false); err != nil {
		t.Fatal(err)
	}
	f.now = f.now.Add(6 * time.Minute)
	f.transport.set(oauthTestClient, oauthClientDocument{ClientID: oauthTestClient, RedirectURIs: []string{oauthTestRedirect}, AuthenticationMethod: oauthPrivateKeyJWT, JWKSURI: "http://127.0.0.1/private"}, 200)
	if _, err := f.auth.Client(ctx, oauthTestClient, true); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("invalid JWKS authority accepted: %v", err)
	}
	if f.transport.count("http://127.0.0.1/private") != 0 {
		t.Fatal("untrusted keys fetched")
	}
	f.transport.set(oauthTestJWKS, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &f.key.PublicKey, KeyID: "first", Use: "sig", Algorithm: "RS256"}, {Key: &f.key.PublicKey, KeyID: "first", Use: "sig", Algorithm: "RS256"}}}, 200)
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "first"); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("ambiguous signing key accepted: %v", err)
	}
}
