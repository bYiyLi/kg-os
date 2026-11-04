package mcpserver

import (
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
)

func TestOAuthJWKSUnknownKidProbesHaveBoundedCooldown(t *testing.T) {
	f := newOAuthAuthFixture(t)
	ctx := context.Background()
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "first"); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 50; index++ {
		if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, fmt.Sprintf("random-%d", index)); !errors.Is(err, errOAuthClientUnavailable) {
			t.Fatalf("unknown kid during cooldown: %v", err)
		}
	}
	if f.transport.count(oauthTestJWKS) != 1 {
		t.Fatal("random kids bypassed JWKS cooldown")
	}
	f.now = f.now.Add(oauthJWKSProbeCooldown + time.Second)
	f.transport.set(oauthTestJWKS, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &f.key.PublicKey, KeyID: "rotated", Use: "sig", Algorithm: "RS256"}}}, 200)
	if _, err := f.auth.keys.Key(ctx, oauthTestJWKS, "rotated"); err != nil {
		t.Fatalf("key rotation not re-probed after cooldown: %v", err)
	}
	if f.transport.count(oauthTestJWKS) != 2 {
		t.Fatal("key rotation probe count mismatch")
	}
	other := "https://chatgpt.com/oauth/other/jwks.json"
	f.transport.set(other, nil, 503)
	for index := 0; index < 20; index++ {
		if _, err := f.auth.keys.Key(ctx, other, fmt.Sprintf("random-%d", index)); !errors.Is(err, errOAuthClientUnavailable) {
			t.Fatal(err)
		}
	}
	if f.transport.count(other) != 1 {
		t.Fatal("cold failure retries were not bounded")
	}
}

func TestOAuthFetchWaitersUseCurrentAuthorityForStaleFallback(t *testing.T) {
	f := newOAuthAuthFixture(t)
	// A waiting request may resume after a newer validated fetch has completed.
	// Its prior transient failure must consult the latest authority under lock.
	f.auth.documents[oauthTestClient] = oauthClientCacheEntry{document: oauthClientDocument{ClientID: oauthTestClient, AuthenticationMethod: "none"}, freshUntil: f.now.Add(time.Minute), staleUntil: f.now.Add(time.Hour)}
	doc, err := f.auth.currentClient(oauthTestClient, true, errOAuthClientUnavailable)
	if err != nil || doc.allows(oauthPrivateKeyJWT) || !doc.allows("none") {
		t.Fatalf("older client authority returned: %+v %v", doc, err)
	}
	f.auth.keys.entries[oauthTestJWKS] = oauthJWKSCacheEntry{keys: map[string]*rsa.PublicKey{"new": &f.key.PublicKey}, freshUntil: f.now.Add(time.Minute), staleUntil: f.now.Add(time.Hour)}
	if _, err := f.auth.keys.currentKey(oauthTestJWKS, "first", errOAuthClientUnavailable); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("removed old key returned to waiter: %v", err)
	}
	delete(f.auth.documents, oauthTestClient)
	delete(f.auth.keys.entries, oauthTestJWKS)
	if _, err := f.auth.currentClient(oauthTestClient, true, errOAuthClientUnavailable); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("invalidated document resurrected: %v", err)
	}
	if _, err := f.auth.keys.currentKey(oauthTestJWKS, "new", errOAuthClientUnavailable); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("invalidated key resurrected: %v", err)
	}
}
