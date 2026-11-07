package mcpoauth

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestPhase36V1MigrationPreservesAccessAndDCRRegistration(t *testing.T) {
	ctx := context.Background()
	s, path := openTestStore(t)
	_, oldPair, oldBinding := issue(t, s, "phase36-legacy", "none", testNow)
	if _, err := s.db.ExecContext(ctx, "DROP TABLE oauth_clients"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.ExecContext(ctx, "PRAGMA user_version=1"); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, testRoot, testIssuer, testIssuer)
	if err != nil {
		t.Fatalf("v1 to v2 OAuth migration failed: %v", err)
	}
	var version int
	if err := reopened.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil || version != 2 {
		t.Fatalf("OAuth schema version not upgraded: %d %v", version, err)
	}
	got, err := reopened.ResolveAccess(ctx, oldPair.AccessHash, testNow)
	if err != nil || got.FamilyID != oldBinding.FamilyID || got.Scope != oldBinding.Scope {
		t.Fatalf("existing OAuth family lost on migration: %+v %v", got, err)
	}
	client := RegisteredClient{
		ID:   "kg_mcp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq",
		Name: "Muse Desktop", URI: "https://muse.example.org",
		RedirectURIs: []string{"http://127.0.0.1:44444/callback"},
		CreatedAt:    testNow,
	}
	if err := reopened.CreateClient(ctx, client); err != nil {
		t.Fatalf("register after migration: %v", err)
	}
	if err := reopened.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err = Open(path, testRoot, testIssuer, testIssuer)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := reopened.GetClient(ctx, client.ID)
	if err != nil || stored.Name != client.Name || stored.RedirectURIs[0] != client.RedirectURIs[0] {
		t.Fatalf("DCR registration did not persist: %+v %v", stored, err)
	}
	if _, err := reopened.ResolveAccess(ctx, oldPair.AccessHash, testNow.Add(time.Minute)); err != nil {
		t.Fatalf("legacy Access token unexpectedly removed: %v", err)
	}
	if err := reopened.Close(); err != nil {
		t.Fatal(err)
	}
	newRoot := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	reopened, err = Open(path, newRoot, testIssuer, testIssuer)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if _, err := reopened.GetClient(ctx, client.ID); !errors.Is(err, ErrClientNotFound) {
		t.Fatalf("DCR registration survived root identity rotation: %v", err)
	}
	if _, err := reopened.ResolveAccess(ctx, oldPair.AccessHash, testNow); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("legacy access survived root identity rotation: %v", err)
	}
}

func TestPhase36PrunesOnlyOldDCRClientsWithoutActiveAuthority(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	oldAt := testNow.Add(-31 * 24 * time.Hour)
	makeClient := func(id string, created time.Time) RegisteredClient {
		return RegisteredClient{
			ID:   "kg_mcp_" + id,
			Name: "Desktop", RedirectURIs: []string{"http://127.0.0.1:7777/callback"},
			CreatedAt: created,
		}
	}
	unused := makeClient("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", oldAt)
	active := makeClient("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", oldAt)
	pending := makeClient("ccccccccccccccccccccccccccccccccccccccccccc", oldAt)
	for _, client := range []RegisteredClient{unused, active, pending} {
		if err := s.CreateClient(ctx, client); err != nil {
			t.Fatal(err)
		}
	}
	grant := testCode("old-dcr-grant", testNow)
	grant.Binding.ClientID = active.ID
	grant.Binding.Scope = "mcp offline_access"
	grant.RedirectURI = active.RedirectURIs[0]
	if err := s.PutCode(ctx, grant, testNow); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ExchangeCode(ctx, grant.Hash, active.ID, grant.RedirectURI, testIssuer,
		grant.Challenge, tokenPair("old-dcr", "none", testNow), testNow); err != nil {
		t.Fatal(err)
	}
	code := testCode("pending-dcr-grant", testNow)
	code.Binding.ClientID = pending.ID
	code.Binding.Scope = "mcp"
	code.RedirectURI = pending.RedirectURIs[0]
	if err := s.PutCode(ctx, code, testNow); err != nil {
		t.Fatal(err)
	}
	current := makeClient("ddddddddddddddddddddddddddddddddddddddddddd", testNow)
	if err := s.CreateClient(ctx, current); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetClient(ctx, unused.ID); !errors.Is(err, ErrClientNotFound) {
		t.Fatalf("orphaned expired registration was not reclaimed: %v", err)
	}
	for _, id := range []string{active.ID, pending.ID, current.ID} {
		if _, err := s.GetClient(ctx, id); err != nil {
			t.Fatalf("still-authorized registration was pruned: %s %v", id, err)
		}
	}
}

func TestPhase36ResourceAudienceMigrationPreservesIssuedAccess(t *testing.T) {
	ctx := context.Background()
	legacy, path := openTestStore(t)
	_, oldTokens, oldBinding := issue(t, legacy, "legacy-resource", "none", testNow)
	if oldBinding.Resource != testIssuer || oldBinding.Scope != "kgos:access offline_access" {
		t.Fatalf("legacy fixture changed: %+v", oldBinding)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}
	canonical := testIssuer + "/mcp"
	store, err := Open(path, testRoot, testIssuer, canonical)
	if err != nil {
		t.Fatalf("legacy binding migration failed: %v", err)
	}
	var metadataResource string
	if err := store.db.QueryRowContext(ctx, "SELECT value FROM oauth_metadata WHERE key='resource'").Scan(&metadataResource); err != nil || metadataResource != canonical {
		t.Fatalf("migrated metadata resource: %q %v", metadataResource, err)
	}
	oldAccess, err := store.ResolveAccess(ctx, oldTokens.AccessHash, testNow)
	if err != nil || oldAccess.Resource != testIssuer || oldAccess.Scope != oldBinding.Scope {
		t.Fatalf("pre-upgrade Access changed/invalid: %+v %v", oldAccess, err)
	}
	if _, err := store.ResolveAccess(ctx, oldTokens.AccessHash, testNow.Add(time.Hour)); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("legacy expiry changed: %v", err)
	}
	code := testCode("new-resource", testNow)
	code.Binding.Resource = canonical
	code.Binding.Scope = "mcp offline_access"
	if err := store.PutCode(ctx, code, testNow); err != nil {
		t.Fatal(err)
	}
	newTokens := tokenPair("new-resource", "none", testNow)
	newGrant, err := store.ExchangeCode(ctx, code.Hash, code.Binding.ClientID, code.RedirectURI, canonical, code.Challenge, newTokens, testNow)
	if err != nil || newGrant.Resource != canonical {
		t.Fatalf("new authorization got wrong resource: %+v %v", newGrant, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, testRoot, testIssuer, canonical)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	for _, token := range []string{oldTokens.AccessHash, newTokens.AccessHash} {
		if _, err := reopened.ResolveAccess(ctx, token, testNow); err != nil {
			t.Fatalf("resource migration lost an old/new Access: %v", err)
		}
	}
}
