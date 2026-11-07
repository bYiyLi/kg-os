package daemon

import (
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWebSessionPersistenceRejectsCorruptedAndOversizedRecords(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
		perm os.FileMode
	}{
		{"unknown format version", `{"version":2,"sessions":{}}`, 0o600},
		{"missing sessions", `{"version":1}`, 0o600},
		{"invalid session identity", `{"version":1,"sessions":{"x":{"rootHash":"a","expires":1}}}`, 0o600},
		{"invalid expiration", `{"version":1,"sessions":{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"rootHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","expires":-1}}}`, 0o600},
		{"world-readable credentials", `{"version":1,"sessions":{}}`, 0o644},
		{"oversized session database", strings.Repeat("x", maxWebSessionFileBytes+1), 0o600},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, webSessionFile)
			if err := os.WriteFile(path, []byte(tc.body), tc.perm); err != nil {
				t.Fatal(err)
			}
			store := newWebSessionStore(root, "root-secret")
			if err := store.loadLocked(); err == nil {
				t.Fatal("corrupt/unsafe Web session storage was accepted")
			}
			unchanged, err := os.ReadFile(path)
			if err != nil || string(unchanged) != tc.body {
				t.Fatal("invalid Web session file was silently replaced")
			}
		})
	}
}

func TestWebSessionsRejectMissingRootAndBoundMemoryCaches(t *testing.T) {
	missing := newWebSessionStore("", "root-secret")
	if _, _, err := missing.login(); err == nil {
		t.Fatal("session login without Instance root succeeded")
	}
	if err := missing.saveLocked(map[string]storedWebSession{}); err == nil {
		t.Fatal("session save without Instance root succeeded")
	}
	store := newWebSessionStore(t.TempDir(), "root-secret")
	oversized := map[string]storedWebSession{
		strings.Repeat("s", maxWebSessionFileBytes): {Expires: time.Now().Add(time.Hour).Unix(), RootHash: store.rootHash},
	}
	if err := store.saveLocked(oversized); err == nil {
		t.Fatal("unbounded persisted Web session payload accepted")
	}
	store.loaded = true
	for i := 0; i < maxWebSessions; i++ {
		key := strings.Repeat(string(rune('a'+i%6)), 64)
		store.sessions[key] = storedWebSession{RootHash: store.rootHash, Expires: time.Now().Add(time.Hour).Unix()}
	}
	// Fill the remaining slots using distinct hashes; the limit check must be
	// against real current sessions, not merely the historical file size.
	for len(store.sessions) < maxWebSessions {
		store.sessions[webSecretHash(string(rune(len(store.sessions)))+"session")] = storedWebSession{
			RootHash: store.rootHash, Expires: time.Now().Add(time.Hour).Unix(),
		}
	}
	if _, _, err := store.login(); err == nil {
		t.Fatal("max Web session limit was bypassed")
	}
	cache := newWebSessionStore(t.TempDir(), "root-secret")
	first, err := cache.accessTokenLocked("owner")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxWebAccessTokens; i++ {
		if _, err := cache.accessTokenLocked("owner"); err != nil {
			t.Fatal(err)
		}
	}
	if len(cache.access) != maxWebAccessTokens || len(cache.accessOrder) != maxWebAccessTokens {
		t.Fatalf("Web Access cache exceeded bound: %d tokens", len(cache.access))
	}
	if _, retained := cache.access[webTokenDigest(first)]; retained {
		t.Fatal("old Web Access token was not evicted")
	}
}

func webTokenDigest(token string) [32]byte {
	return sha256.Sum256([]byte(token))
}

func TestWebSessionValidFileKeepsPersistedIdentity(t *testing.T) {
	root := t.TempDir()
	store := newWebSessionStore(root, "root-secret")
	secret, err := newWebSecret()
	if err != nil {
		t.Fatal(err)
	}
	hash := webSecretHash(secret)
	session := storedWebSession{RootHash: store.rootHash, Expires: time.Now().Add(time.Hour).Unix()}
	raw, err := json.Marshal(webSessionFileData{Version: 1, Sessions: map[string]storedWebSession{hash: session}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, webSessionFile), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.loadLocked(); err != nil || len(store.sessions) != 1 {
		t.Fatalf("existing valid session rejected: %v", err)
	}
	if !store.loaded || store.sessions[hash] != session {
		t.Fatal("loading session data changed authorization binding")
	}
}
