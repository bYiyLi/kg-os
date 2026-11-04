package mcpserver

import (
	"strings"
	"testing"
	"time"
)

// Pending consent stays process-local; issued token expiry is enforced by the
// persistent store rather than copied back into a broker-local credential map.
func TestOAuthPrunesExpiredTicketsAndRejectsExpiredCredentials(t *testing.T) {
	f := newOAuthFixture(t)
	now := time.Now()
	f.broker.now = func() time.Time { return now }
	f.broker.tickets[oauthHash("expired-ticket")] = oauthAuthorization{expires: now.Add(-time.Second)}
	f.broker.tickets[oauthHash("live-ticket")] = oauthAuthorization{expires: now.Add(time.Minute)}
	f.broker.mu.Lock()
	f.broker.pruneLocked()
	f.broker.mu.Unlock()
	if len(f.broker.tickets) != 1 {
		t.Fatalf("pending consent pruning retained expired records: %d", len(f.broker.tickets))
	}
	live, _ := f.seedPair("live", now)
	expired, _ := f.seedPair("expired", now.Add(-accessLifetime-time.Second))
	if _, ok := f.broker.principal(live); !ok {
		t.Fatal("valid persisted credential was lost")
	}
	for _, token := range []string{"", "abc", strings.Repeat("z", 513), strings.Repeat("$", 43), expired} {
		if _, ok := f.broker.principal(token); ok {
			t.Fatal("invalid or expired credential was accepted")
		}
	}
}
