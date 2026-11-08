package mcpserver

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

func TestOAuthClientAssertionReplayBudgetNeverEvictsLiveAssertions(t *testing.T) {
	f := newOAuthAuthFixture(t)
	endpoint := "https://kgos.example/oauth/token"
	for index := 0; index < oauthAssertionReplayLimit; index++ {
		key := sha256.Sum256([]byte(fmt.Sprintf("existing-%d", index)))
		f.auth.assertions[key] = oauthAssertionReplay{expires: f.now.Add(time.Minute)}
	}
	form := oauthSignedForm(f.signed(t, f.claims("budget", endpoint), "first"))
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, form, ""); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("full replay cache did not fail closed: %v", err)
	}
	if len(f.auth.assertions) != oauthAssertionReplayLimit {
		t.Fatal("live replay records evicted")
	}
	f.now = f.now.Add(2 * time.Minute)
	if _, err := f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, form, ""); err != nil {
		t.Fatalf("expired replay records not reclaimed: %v", err)
	}
}

func TestOAuthClientAuthenticationRejectsWrongSignatureAlgorithmAndKey(t *testing.T) {
	f := newOAuthAuthFixture(t)
	endpoint := "https://kgos.example/oauth/token"
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: []byte(strings.Repeat("x", 32))}, (&jose.SignerOptions{}).WithHeader("kid", "first"))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := jwt.Signed(signer).Claims(f.claims("symmetric", endpoint)).Serialize()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, oauthSignedForm(raw), ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("HS256 client assertion accepted: %v", err)
	}
	other := newOAuthAuthFixture(t)
	raw = other.signed(t, f.claims("wrong-key", endpoint), "first")
	if _, err = f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, oauthSignedForm(raw), ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("untrusted signing key accepted: %v", err)
	}
	raw = f.signed(t, f.claims("missing-kid", endpoint), "")
	if _, err = f.auth.Authenticate(context.Background(), oauthTestClient, endpoint, oauthSignedForm(raw), ""); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("missing kid accepted: %v", err)
	}
}

func TestOAuthClientMetadataFailureClassificationAndFixedJWKSAuthority(t *testing.T) {
	f := newOAuthAuthFixture(t)
	for _, uri := range []string{
		"http://chatgpt.com/oauth/jwks.json",
		"https://chatgpt.com/oauth/jwks.json#", "https://user@chatgpt.com/oauth/jwks.json",
	} {
		if validOAuthJWKSURI(uri) {
			t.Errorf("untrusted JWKS URI accepted: %s", uri)
		}
	}
	for _, uri := range []string{"https://chatgpt.com/oauth/known-client/jwks.json", "https://muse.example.com/jwks.json", "https://chatgpt.com:443/oauth/jwks.json", "https://127.0.0.1/oauth/jwks.json", "https://198.18.0.16/oauth/jwks.json"} {
		if !validOAuthJWKSURI(uri) {
			t.Fatalf("valid HTTPS JWKS URI rejected due to IP range: %s", uri)
		}
	}
	for _, status := range []int{http.StatusForbidden, http.StatusFound} {
		f.transport.set(oauthTestClient, nil, status)
		if _, err := f.auth.Client(context.Background(), oauthTestClient, true); !errors.Is(err, errOAuthInvalidClient) {
			t.Fatalf("status %d misclassified: %v", status, err)
		}
	}
	for _, status := range []int{http.StatusServiceUnavailable, http.StatusTooManyRequests} {
		f.transport.set(oauthTestClient, nil, status)
		if _, err := f.auth.Client(context.Background(), oauthTestClient, true); !errors.Is(err, errOAuthClientUnavailable) {
			t.Fatalf("temporary status %d became credential failure: %v", status, err)
		}
	}
	f.transport.mu.Lock()
	f.transport.failure = true
	f.transport.mu.Unlock()
	if _, err := f.auth.Client(context.Background(), oauthTestClient, true); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("network failure became credential failure: %v", err)
	}
	f.transport.mu.Lock()
	f.transport.failure = false
	f.transport.statuses[oauthTestClient] = 200
	f.transport.bodies[oauthTestClient] = []byte(strings.Repeat("x", maxClientDocumentBytes+1))
	f.transport.mu.Unlock()
	if _, err := f.auth.Client(context.Background(), oauthTestClient, true); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("oversized metadata accepted: %v", err)
	}
}

func TestOAuthValidatedClientAndKeyCachesKeepHardBounds(t *testing.T) {
	f := newOAuthAuthFixture(t)
	for index := 0; index < oauthClientCacheLimit; index++ {
		f.auth.documents[fmt.Sprintf("https://chatgpt.com/oauth/previous-%d/client.json", index)] = oauthClientCacheEntry{freshUntil: f.now.Add(time.Minute), staleUntil: f.now.Add(time.Hour)}
	}
	if _, err := f.auth.Client(context.Background(), oauthTestClient, false); err != nil {
		t.Fatal(err)
	}
	if len(f.auth.documents) != oauthClientCacheLimit {
		t.Fatal("metadata cache hard bound exceeded")
	}
	for index := 0; index < oauthJWKSCacheLimit; index++ {
		f.auth.keys.entries[fmt.Sprintf("https://chatgpt.com/oauth/previous-%d/jwks.json", index)] = oauthJWKSCacheEntry{freshUntil: f.now.Add(time.Minute), staleUntil: f.now.Add(time.Hour)}
	}
	if _, err := f.auth.keys.Key(context.Background(), oauthTestJWKS, "first"); err != nil {
		t.Fatal(err)
	}
	if len(f.auth.keys.entries) != oauthJWKSCacheLimit {
		t.Fatal("JWKS cache hard bound exceeded")
	}
}
