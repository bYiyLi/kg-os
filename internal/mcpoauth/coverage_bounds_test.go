package mcpoauth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestOAuthClientRegistryRejectsInvalidEntriesAndCorruptStoredRedirects(t *testing.T) {
	store, _ := openTestStore(t)
	ctx := context.Background()
	client := RegisteredClient{
		ID: "kg_mcp_" + strings.Repeat("a", 43), Name: "Desktop Client",
		URI:          "https://client.example",
		RedirectURIs: []string{"http://127.0.0.1:3000/callback"},
		CreatedAt:    testNow,
	}
	for _, tc := range []struct {
		name   string
		mutate func(*RegisteredClient)
	}{
		{"short identity", func(c *RegisteredClient) { c.ID = "short" }},
		{"missing name", func(c *RegisteredClient) { c.Name = "" }},
		{"long client URI", func(c *RegisteredClient) { c.URI = "https://" + strings.Repeat("x", 2049) }},
		{"missing redirects", func(c *RegisteredClient) { c.RedirectURIs = nil }},
		{"too many redirects", func(c *RegisteredClient) {
			c.RedirectURIs = make([]string, 21)
			for i := range c.RedirectURIs {
				c.RedirectURIs[i] = "https://client.example/callback"
			}
		}},
		{"unknown creation time", func(c *RegisteredClient) { c.CreatedAt = time.Time{} }},
		{"empty redirect", func(c *RegisteredClient) { c.RedirectURIs[0] = "" }},
		{"oversized redirect", func(c *RegisteredClient) { c.RedirectURIs[0] = "https://" + strings.Repeat("x", 2049) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := client
			input.RedirectURIs = append([]string(nil), client.RedirectURIs...)
			tc.mutate(&input)
			if err := store.CreateClient(ctx, input); !errors.Is(err, ErrInvalidGrant) {
				t.Fatalf("unbounded OAuth registry entry persisted: %v", err)
			}
		})
	}
	if err := store.CreateClient(ctx, client); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, "UPDATE oauth_clients SET redirects='invalid-json' WHERE id=?", client.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetClient(ctx, client.ID); err == nil {
		t.Fatal("corrupt persisted callback list became an authorized Client")
	}
}

func TestOAuthCredentialStoreRejectsWrongRefreshBindingAndDatabaseFailure(t *testing.T) {
	store, _ := openTestStore(t)
	ctx := context.Background()
	_, pair, grant := issue(t, store, "binding-check", "none", testNow)
	if _, err := store.CurrentRefresh(ctx, pair.RefreshHash, "other-client", "", testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("refresh accepted a different client: %v", err)
	}
	if _, err := store.CurrentRefresh(ctx, pair.RefreshHash, grant.ClientID, "https://other.example/mcp", testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("refresh accepted a different resource: %v", err)
	}
	if _, err := store.CodeScope(ctx, "invalid-hash"); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("nonexistent credential scope was readable: %v", err)
	}
	if err := store.db.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetClient(ctx, "kg_mcp_"+strings.Repeat("a", 43)); err == nil {
		t.Fatal("closed OAuth registry silently returned an empty registration")
	}
	if _, err := store.CodeScope(ctx, digest("closed-code")); err == nil {
		t.Fatal("closed OAuth code store was interpreted as missing consent")
	}
	if _, err := store.ResolveAccess(ctx, pair.AccessHash, testNow); err == nil {
		t.Fatal("closed store allowed cached OAuth Access")
	}
	if _, err := store.CurrentRefresh(ctx, pair.RefreshHash, grant.ClientID, "", testNow); err == nil {
		t.Fatal("closed store permitted refresh verification")
	}
	if err := store.CreateClient(ctx, RegisteredClient{
		ID: "kg_mcp_" + strings.Repeat("b", 43), Name: "Desktop", RedirectURIs: []string{"https://client.example/callback"}, CreatedAt: testNow,
	}); err == nil {
		t.Fatal("unavailable store silently accepted Client registration")
	}
}
