package mcpserver

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// Authorization tickets, grants, refresh secrets and fetched CIMD documents
// all have independent expiry and must be evicted without touching valid
// sessions. No token or code is persisted across a process restart.
func TestOAuthPrunesEverySensitiveCredentialClass(t *testing.T) {
	broker, err := newOAuthBroker("https://kgos.example.com", "/mcp", "unique-admin-token", &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	broker.now = func() time.Time { return now }
	expired := now.Add(-time.Millisecond)
	live := now.Add(time.Hour)
	for index, until := range []time.Time{expired, live} {
		key := oauthHash(strings.Repeat(string(rune('x'+index)), 43))
		ticket := oauthAuthorization{expires: until, clientID: oauthTestClient}
		grant := oauthGrant{issuer: broker.issuer, resource: broker.resource, scope: oauthScope, expires: until, clientID: oauthTestClient}
		broker.tickets[key] = ticket
		broker.codes[key] = ticket
		broker.access[key] = grant
		broker.refresh[key] = grant
		broker.documents[string(rune('a'+index))] = cachedOAuthDocument{redirects: []string{oauthTestRedirect}, expires: until}
	}
	broker.mu.Lock()
	broker.pruneLocked()
	broker.mu.Unlock()
	if len(broker.tickets) != 1 || len(broker.codes) != 1 || len(broker.access) != 1 || len(broker.refresh) != 1 || len(broker.documents) != 1 {
		t.Fatalf("stale OAuth secrets not evicted: ticket=%d code=%d access=%d refresh=%d client=%d",
			len(broker.tickets), len(broker.codes), len(broker.access), len(broker.refresh), len(broker.documents))
	}
	liveToken := strings.Repeat("y", 43)
	if _, ok := broker.principal(liveToken); !ok {
		t.Fatal("non-expired authorization was lost")
	}
	for _, token := range []string{"", "abc", strings.Repeat("z", 513), strings.Repeat("$", 43), strings.Repeat("x", 43)} {
		if _, ok := broker.principal(token); ok {
			t.Errorf("invalid or expired OAuth token authorized %q", token[:min(len(token), 12)])
		}
	}
	broker.mu.Lock()
	previous := broker.access[oauthHash(liveToken)]
	previous.scope = "other:scope"
	broker.access[oauthHash(liveToken)] = previous
	broker.mu.Unlock()
	if _, ok := broker.principal(liveToken); ok {
		t.Fatal("grant with mismatched scope accepted")
	}
	previous.scope = oauthScope
	previous.resource = "https://other.example"
	broker.mu.Lock()
	broker.access[oauthHash(liveToken)] = previous
	broker.mu.Unlock()
	if _, ok := broker.principal(liveToken); ok {
		t.Fatal("grant with mismatched audience accepted")
	}
}
