package runtime

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/mcpoauth"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestRuntimeOAuthStorePersistsAndClosesWithRuntime(t *testing.T) {
	paths := runtimeprofile.Paths{Root: t.TempDir()}
	if err := os.Chmod(paths.Root, 0o700); err != nil {
		t.Fatal(err)
	}
	config := runtimeprofile.Config{Server: &runtimeprofile.ServerConfig{PublicOrigin: "https://kgos.example"}}
	credential := runtimeprofile.Credential{Token: "runtime-oauth-root"}
	store, err := openOAuthStore(paths, credential, config, "/mcp")
	if err != nil {
		t.Fatal(err)
	}
	r := &Runtime{OAuthStore: store}
	ctx := context.Background()
	now := time.Now()
	hash := func(value string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(value))) }
	if err := store.PutCode(ctx, mcpoauth.Code{
		Hash: hash("code"), Binding: mcpoauth.Binding{FamilyID: "family", ClientID: "https://chatgpt.com/oauth/client.json", Issuer: "https://kgos.example", Resource: "https://kgos.example/mcp", Scope: "mcp"},
		RedirectURI: "https://chatgpt.com/callback", Challenge: "challenge", ExpiresAt: now.Add(time.Minute),
	}, now); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ExchangeCode(ctx, hash("code"), "https://chatgpt.com/oauth/client.json", "https://chatgpt.com/callback", "https://kgos.example/mcp", "challenge",
		mcpoauth.Tokens{AccessHash: hash("access"), RefreshHash: hash("refresh"), AccessExpiresAt: now.Add(time.Hour), RefreshExpiresAt: now.Add(30 * 24 * time.Hour), AuthMethod: "none"}, now); err != nil {
		t.Fatal(err)
	}
	if err := r.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ResolveAccess(ctx, hash("access"), now); err == nil {
		t.Fatal("Runtime did not close OAuth store")
	}
	reopened, err := openOAuthStore(paths, credential, config, "/mcp")
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if _, err := reopened.ResolveAccess(ctx, hash("access"), now); err != nil {
		t.Fatalf("credential lost after runtime restart: %v", err)
	}
}

func TestRuntimeOAuthStoreFailureRemainsIndependent(t *testing.T) {
	paths := runtimeprofile.Paths{Root: t.TempDir()}
	if err := os.Chmod(paths.Root, 0o700); err != nil {
		t.Fatal(err)
	}
	config := runtimeprofile.Config{Server: &runtimeprofile.ServerConfig{PublicOrigin: "https://kgos.example"}}
	if err := os.WriteFile(filepath.Join(paths.Root, "mcp-oauth.db"), []byte("damaged store"), 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := openOAuthStore(paths, runtimeprofile.Credential{Token: "root"}, config, "/mcp")
	if store != nil || err == nil {
		t.Fatalf("damaged OAuth store accepted: %v", err)
	}
	r := &Runtime{OAuthStore: store, OAuthStoreError: err}
	if err := r.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(paths.Root, "mcp-oauth.db"))
	if err != nil || string(data) != "damaged store" {
		t.Fatal("damaged store replaced")
	}
	if store, err := openOAuthStore(paths, runtimeprofile.Credential{}, runtimeprofile.Config{}, "/mcp"); store != nil || err != nil {
		t.Fatal("OAuth-disabled runtime tried to open credential store")
	}
}

func TestRuntimeOAuthStoreUsesCustomMCPResourcePath(t *testing.T) {
	paths := runtimeprofile.Paths{Root: t.TempDir()}
	if err := os.Chmod(paths.Root, 0o700); err != nil {
		t.Fatal(err)
	}
	origin := "https://kgos.example"
	config := runtimeprofile.Config{Server: &runtimeprofile.ServerConfig{PublicOrigin: origin}}
	store, err := openOAuthStore(paths, runtimeprofile.Credential{Token: "custom-path-root"}, config, "/agents/mcp")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	sum := sha256.Sum256([]byte("custom-path-code"))
	code := mcpoauth.Code{
		Hash: fmt.Sprintf("%x", sum),
		Binding: mcpoauth.Binding{FamilyID: "custom-path-family", ClientID: "https://client.example/oauth/client.json",
			Issuer: origin, Resource: origin + "/agents/mcp", Scope: "mcp"},
		RedirectURI: "https://client.example/callback", Challenge: "pkce", ExpiresAt: time.Now().Add(time.Minute),
	}
	if err := store.PutCode(context.Background(), code, time.Now()); err != nil {
		t.Fatalf("configured MCP endpoint was rejected as audience: %v", err)
	}
	code.Binding.Resource = origin + "/mcp"
	sum = sha256.Sum256([]byte("wrong-custom-path-code"))
	code.Hash = fmt.Sprintf("%x", sum)
	if err := store.PutCode(context.Background(), code, time.Now()); err == nil {
		t.Fatal("custom MCP path accepted the default /mcp audience")
	}
}
