package mcpoauth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

var testNow = time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)

const testIssuer = "https://kgos.example"
const testRoot = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func digest(value string) string {
	d := sha256.Sum256([]byte(value))
	return hex.EncodeToString(d[:])
}
func openTestStore(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(privateTempDir(t), "mcp-oauth.db")
	s, err := Open(path, testRoot, testIssuer, testIssuer)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s, path
}
func tokenPair(seed, method string, now time.Time) Tokens {
	return Tokens{AccessHash: digest(seed + "access"), RefreshHash: digest(seed + "refresh"), AuthMethod: method, AccessExpiresAt: now.Add(time.Hour), RefreshExpiresAt: now.Add(30 * 24 * time.Hour)}
}
func testCode(seed string, now time.Time) Code {
	return Code{Hash: digest(seed + "code"), Binding: Binding{FamilyID: seed, ClientID: "https://chatgpt.com/oauth/client.json", Issuer: testIssuer, Resource: testIssuer, Scope: "kgos:access offline_access"}, RedirectURI: "https://chatgpt.com/connector_platform_oauth_redirect", Challenge: "pkce-challenge", ExpiresAt: now.Add(time.Minute)}
}
func issue(t *testing.T, s *Store, seed, method string, now time.Time) (Code, Tokens, Binding) {
	t.Helper()
	code := testCode(seed, now)
	if err := s.PutCode(context.Background(), code, now); err != nil {
		t.Fatal(err)
	}
	pair := tokenPair(seed, method, now)
	b, err := s.ExchangeCode(context.Background(), code.Hash, code.Binding.ClientID, code.RedirectURI, testIssuer, code.Challenge, pair, now)
	if err != nil {
		t.Fatal(err)
	}
	return code, pair, b
}

func TestStorePersistsLifecycleAndConsumedTokenRevocation(t *testing.T) {
	s, path := openTestStore(t)
	ctx := context.Background()
	code, pair, b := issue(t, s, "first", "private_key_jwt", testNow)
	if b.Generation != 1 || b.AuthMethod != "private_key_jwt" || b.Scope != code.Binding.Scope {
		t.Fatalf("wrong binding: %+v", b)
	}
	if _, err := s.ExchangeCode(ctx, code.Hash, b.ClientID, code.RedirectURI, testIssuer, code.Challenge, tokenPair("replay", "private_key_jwt", testNow), testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("code replay: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err := Open(path, testRoot, testIssuer, testIssuer)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err = s.ResolveAccess(ctx, pair.AccessHash, testNow); err != nil {
		t.Fatalf("access after restart: %v", err)
	}
	later := testNow.Add(30 * time.Minute)
	next := tokenPair("second", "private_key_jwt", later)
	rotated, err := s.Rotate(ctx, pair.RefreshHash, b.ClientID, "", next, later)
	if err != nil || rotated.Generation != 2 {
		t.Fatalf("rotation: %+v %v", rotated, err)
	}
	if _, err = s.ResolveAccess(ctx, pair.AccessHash, later); err != nil {
		t.Fatalf("previous access should retain hard lifetime: %v", err)
	}
	if _, err = s.CurrentRefresh(ctx, pair.RefreshHash, b.ClientID, "", later); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("consumed token current: %v", err)
	}
	current, err := s.CurrentRefresh(ctx, next.RefreshHash, b.ClientID, testIssuer, later)
	if err != nil || current.Generation != 2 {
		t.Fatalf("current: %+v %v", current, err)
	}
	family, err := s.Revoke(ctx, pair.RefreshHash, b.ClientID, "private_key_jwt", later)
	if err != nil || family != b.FamilyID {
		t.Fatalf("revoke consumed refresh: %s %v", family, err)
	}
	if _, err = s.ResolveAccess(ctx, next.AccessHash, later); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("revoked access: %v", err)
	}
	if _, err = s.CurrentRefresh(ctx, next.RefreshHash, b.ClientID, "", later); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("revoked refresh: %v", err)
	}
	if family, err = s.Revoke(ctx, pair.RefreshHash, b.ClientID, "private_key_jwt", later); err != nil || family != "" {
		t.Fatalf("repeated revoke must be uniform: %s %v", family, err)
	}
}

func TestStoreWrongBindingsNeverConsumeOrRevoke(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	code := testCode("signed", testNow)
	pair := tokenPair("signed", "private_key_jwt", testNow)
	if err := s.PutCode(ctx, code, testNow); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ client, redirect, resource, challenge string }{
		{"other", code.RedirectURI, testIssuer, code.Challenge},
		{code.Binding.ClientID, "https://wrong.example", testIssuer, code.Challenge},
		{code.Binding.ClientID, code.RedirectURI, "https://wrong.example", code.Challenge},
		{code.Binding.ClientID, code.RedirectURI, testIssuer, "wrong"},
	} {
		if _, err := s.ExchangeCode(ctx, code.Hash, tc.client, tc.redirect, tc.resource, tc.challenge, pair, testNow); !errors.Is(err, ErrInvalidGrant) {
			t.Fatalf("binding accepted: %v", err)
		}
	}
	b, err := s.ExchangeCode(ctx, code.Hash, code.Binding.ClientID, code.RedirectURI, testIssuer, code.Challenge, pair, testNow)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ client, resource, method string }{{"other", testIssuer, "private_key_jwt"}, {b.ClientID, "https://wrong.example", "private_key_jwt"}, {b.ClientID, testIssuer, "none"}} {
		p := tokenPair(tc.client+tc.resource+tc.method, tc.method, testNow)
		if _, err = s.Rotate(ctx, pair.RefreshHash, tc.client, tc.resource, p, testNow); !errors.Is(err, ErrInvalidGrant) {
			t.Fatalf("bad rotation: %v", err)
		}
		if tc.client != b.ClientID || tc.method != b.AuthMethod {
			if family, err := s.Revoke(ctx, pair.RefreshHash, tc.client, tc.method, testNow); err != nil || family != "" {
				t.Fatalf("bad revoke: %q %v", family, err)
			}
		}
	}
	if _, err = s.CurrentRefresh(ctx, pair.RefreshHash, b.ClientID, testIssuer, testNow); err != nil {
		t.Fatalf("bad request destroyed refresh: %v", err)
	}
}

func TestStoreRefreshReplayRevokesOnlyItsFamily(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	code, old, b := issue(t, s, "public", "none", testNow)
	_, other, _ := issue(t, s, "other", "none", testNow)
	next := tokenPair("next", "none", testNow)
	if _, err := s.Rotate(ctx, old.RefreshHash, b.ClientID, testIssuer, next, testNow); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Rotate(ctx, old.RefreshHash, b.ClientID, testIssuer, tokenPair("replay", "none", testNow), testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("old refresh replay: %v", err)
	}
	if _, err := s.ResolveAccess(ctx, next.AccessHash, testNow); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("replayed family still valid: %v", err)
	}
	if _, err := s.ResolveAccess(ctx, other.AccessHash, testNow); err != nil {
		t.Fatalf("other family affected: %v", err)
	}
	if _, err := s.ResolveAccess(ctx, old.AccessHash, testNow); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("old access still valid: %v", err)
	}
	if _, err := s.ExchangeCode(ctx, code.Hash, b.ClientID, code.RedirectURI, testIssuer, code.Challenge, next, testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatal(err)
	}
}

func TestStoreTransactionsRollBackConsumption(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	_, old, b := issue(t, s, "atomic", "none", testNow)
	bad := tokenPair("bad", "none", testNow)
	bad.AccessHash = old.AccessHash
	if _, err := s.Rotate(ctx, old.RefreshHash, b.ClientID, testIssuer, bad, testNow); err == nil || errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("expected backend collision: %v", err)
	}
	if _, err := s.CurrentRefresh(ctx, old.RefreshHash, b.ClientID, testIssuer, testNow); err != nil {
		t.Fatalf("rollback consumed refresh: %v", err)
	}
	code := testCode("code-atomic", testNow)
	if err := s.PutCode(ctx, code, testNow); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ExchangeCode(ctx, code.Hash, b.ClientID, code.RedirectURI, testIssuer, code.Challenge, bad, testNow); err == nil {
		t.Fatal("collision accepted")
	}
	if _, err := s.ExchangeCode(ctx, code.Hash, b.ClientID, code.RedirectURI, testIssuer, code.Challenge, tokenPair("good", "none", testNow), testNow); err != nil {
		t.Fatalf("rollback consumed code: %v", err)
	}
}

func TestStoreConcurrentRefreshHasOneCommitAndDetectsReplay(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	_, old, b := issue(t, s, "concurrent", "none", testNow)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, seed := range []string{"one", "two"} {
		wg.Add(1)
		go func(seed string) {
			defer wg.Done()
			_, err := s.Rotate(ctx, old.RefreshHash, b.ClientID, testIssuer, tokenPair(seed, "none", testNow), testNow)
			errs <- err
		}(seed)
	}
	wg.Wait()
	close(errs)
	success, replay := 0, 0
	for err := range errs {
		if err == nil {
			success++
		} else if errors.Is(err, ErrInvalidGrant) {
			replay++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || replay != 1 {
		t.Fatalf("outcomes: success=%d replay=%d", success, replay)
	}
}

func TestStoreRootIssuerAndResourceChangesInvalidate(t *testing.T) {
	for _, field := range []string{"root", "issuer", "resource"} {
		t.Run(field, func(t *testing.T) {
			s, path := openTestStore(t)
			_, pair, _ := issue(t, s, field, "none", testNow)
			_ = s.Close()
			root, issuer, resource := testRoot, testIssuer, testIssuer
			switch field {
			case "root":
				root = strings.Repeat("b", 64)
			case "issuer":
				issuer = "https://new.example"
			case "resource":
				resource = "https://new.example/mcp"
			}
			next, err := Open(path, root, issuer, resource)
			if err != nil {
				t.Fatal(err)
			}
			defer next.Close()
			if _, err = next.ResolveAccess(context.Background(), pair.AccessHash, testNow); !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("binding change retained old access: %v", err)
			}
		})
	}
}

func TestStoreExpiryLimitsAndInvalidInputs(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	_, pair, b := issue(t, s, "expiry", "none", testNow)
	if _, err := s.ResolveAccess(ctx, pair.AccessHash, testNow.Add(time.Hour)); !errors.Is(err, ErrInvalidToken) {
		t.Fatal(err)
	}
	if _, err := s.CurrentRefresh(ctx, pair.RefreshHash, b.ClientID, "", testNow.Add(31*24*time.Hour)); !errors.Is(err, ErrInvalidGrant) {
		t.Fatal(err)
	}
	if _, err := s.ResolveAccess(ctx, "not-hash", testNow); !errors.Is(err, ErrInvalidToken) {
		t.Fatal(err)
	}
	if _, err := s.CurrentRefresh(ctx, "bad", b.ClientID, "", testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatal(err)
	}
	if family, err := s.Revoke(ctx, "bad", b.ClientID, "none", testNow); err != nil || family != "" {
		t.Fatal(family, err)
	}
	if family, err := s.Revoke(ctx, digest("unknown"), b.ClientID, "none", testNow); err != nil || family != "" {
		t.Fatal(family, err)
	}
	if _, err := s.CurrentRefresh(ctx, pair.AccessHash, b.ClientID, "", testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatal(err)
	}
	if _, err := s.ResolveAccess(ctx, pair.RefreshHash, testNow); !errors.Is(err, ErrInvalidToken) {
		t.Fatal(err)
	}
	for _, code := range []Code{{}, testCode("expired", testNow.Add(-time.Hour))} {
		if err := s.PutCode(ctx, code, testNow); !errors.Is(err, ErrInvalidGrant) {
			t.Fatal(err)
		}
	}
	if _, err := s.ExchangeCode(ctx, "bad", b.ClientID, "", "", "", pair, testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatal(err)
	}
	if _, err := s.Rotate(ctx, "bad", b.ClientID, "", pair, testNow); !errors.Is(err, ErrInvalidGrant) {
		t.Fatal(err)
	}
	for i := 0; i < maxCodes; i++ {
		code := testCode("limit-"+time.Duration(i).String(), testNow)
		if err := s.PutCode(ctx, code, testNow); err != nil {
			t.Fatal(i, err)
		}
	}
	if err := s.PutCode(ctx, testCode("over", testNow), testNow); !errors.Is(err, ErrLimit) {
		t.Fatalf("code bound: %v", err)
	}
	if err := s.PutCode(ctx, testCode("clean", testNow.Add(2*time.Minute)), testNow.Add(2*time.Minute)); err != nil {
		t.Fatalf("expired cleanup: %v", err)
	}
}

func TestStoreBackendFailuresRemainServerFailures(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	_, pair, b := issue(t, s, "closed", "none", testNow)
	_ = s.Close()
	if _, err := s.ResolveAccess(ctx, pair.AccessHash, testNow); err == nil || errors.Is(err, ErrInvalidToken) {
		t.Fatalf("backend failure became invalid token: %v", err)
	}
	if _, err := s.CurrentRefresh(ctx, pair.RefreshHash, b.ClientID, "", testNow); err == nil || errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("backend failure became invalid grant: %v", err)
	}
	if _, err := s.Revoke(ctx, pair.RefreshHash, b.ClientID, "none", testNow); err == nil {
		t.Fatal("closed backend reported revoked")
	}
	if err := s.PutCode(ctx, testCode("unavailable", testNow), testNow); err == nil {
		t.Fatal("closed backend accepted code")
	}
}

func TestStoreRejectsUnsafeFilesWithoutReplacement(t *testing.T) {
	for _, kind := range []string{"corrupt", "empty", "directory", "symlink", "public", "sidecar", "sidecar-symlink", "version", "foreign"} {
		t.Run(kind, func(t *testing.T) {
			dir := privateTempDir(t)
			path := filepath.Join(dir, "oauth.db")
			switch kind {
			case "corrupt":
				if err := os.WriteFile(path, []byte("not a database"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "empty":
				if err := os.WriteFile(path, nil, 0o600); err != nil {
					t.Fatal(err)
				}
			case "directory":
				if err := os.Mkdir(path, 0o700); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				target := filepath.Join(dir, "target")
				if err := os.WriteFile(target, []byte("private"), 0o600); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(target, path); err != nil {
					t.Fatal(err)
				}
			case "public":
				if runtime.GOOS == "windows" {
					t.Skip("Unix permissions")
				}
				if err := os.WriteFile(path, nil, 0o644); err != nil {
					t.Fatal(err)
				}
			case "sidecar", "sidecar-symlink":
				if runtime.GOOS == "windows" {
					t.Skip("Unix permissions")
				}
				if kind == "sidecar" {
					if err := os.WriteFile(path+"-journal", nil, 0o644); err != nil {
						t.Fatal(err)
					}
				} else {
					target := filepath.Join(dir, "target")
					if err := os.WriteFile(target, nil, 0o600); err != nil {
						t.Fatal(err)
					}
					if err := os.Symlink(target, path+"-journal"); err != nil {
						t.Fatal(err)
					}
				}
			case "version", "foreign":
				s, err := Open(path, testRoot, testIssuer, testIssuer)
				if err != nil {
					t.Fatal(err)
				}
				if kind == "version" {
					_, err = s.db.Exec("PRAGMA user_version=2")
				} else {
					_, err = s.db.Exec("PRAGMA user_version=0")
				}
				if err != nil {
					t.Fatal(err)
				}
				_ = s.Close()
			}
			if s, err := Open(path, testRoot, testIssuer, testIssuer); err == nil {
				_ = s.Close()
				t.Fatal("unsafe store accepted")
			}
			if kind == "corrupt" {
				data, err := os.ReadFile(path)
				if err != nil || string(data) != "not a database" {
					t.Fatal("damaged store was replaced", err)
				}
			}
		})
	}
	if _, err := Open("relative", testRoot, testIssuer, testIssuer); err == nil {
		t.Fatal("relative path accepted")
	}
	dir := privateTempDir(t)
	if runtime.GOOS != "windows" {
		if err := os.Chmod(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if _, err := Open(filepath.Join(dir, "oauth.db"), testRoot, testIssuer, testIssuer); err == nil {
			t.Fatal("unsafe parent accepted")
		}
	}
}

func TestStoreFileContainsOnlyCredentialDigests(t *testing.T) {
	s, path := openTestStore(t)
	_, _, _ = issue(t, s, "raw-never-written", "none", testNow)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "raw-never-writtenaccess") || strings.Contains(string(data), "raw-never-writtencode") {
		t.Fatal("raw credential persisted")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Fatalf("database mode %o", info.Mode().Perm())
	}
}

func privateTempDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.Chmod(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestStorePreservesIssuedAccessExpiryAcrossPolicyChangeAndRestart(t *testing.T) {
	s, path := openTestStore(t)
	ctx := context.Background()
	// Storage is policy-independent: the earlier one-hour credential keeps its
	// persisted deadline while a newly issued credential can last a full day.
	_, legacy, _ := issue(t, s, "legacy-hour", "none", testNow)
	code := testCode("current-day", testNow)
	if err := s.PutCode(ctx, code, testNow); err != nil {
		t.Fatal(err)
	}
	current := tokenPair("current-day", "none", testNow)
	current.AccessExpiresAt = testNow.Add(24 * time.Hour)
	if _, err := s.ExchangeCode(ctx, code.Hash, code.Binding.ClientID, code.RedirectURI, testIssuer, code.Challenge, current, testNow); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, testRoot, testIssuer, testIssuer)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	beforeHour := testNow.Add(time.Hour - time.Nanosecond)
	if _, err := reopened.ResolveAccess(ctx, legacy.AccessHash, beforeHour); err != nil {
		t.Fatalf("legacy token expired early: %v", err)
	}
	atHour := testNow.Add(time.Hour)
	if _, err := reopened.ResolveAccess(ctx, legacy.AccessHash, atHour); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("old issued expiry was extended: %v", err)
	}
	for _, when := range []time.Time{atHour.Add(time.Second), testNow.Add(24*time.Hour - time.Nanosecond)} {
		if _, err := reopened.ResolveAccess(ctx, current.AccessHash, when); err != nil {
			t.Fatalf("new daily token expired early at %v: %v", when, err)
		}
	}
	if _, err := reopened.ResolveAccess(ctx, current.AccessHash, testNow.Add(24*time.Hour)); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("daily token accepted at hard expiry: %v", err)
	}
}
