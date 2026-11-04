package mcpoauth

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStoreFamilyAndTokenBudgetsPreserveCurrentCredentials(t *testing.T) {
	for _, kind := range []string{"family", "token"} {
		t.Run(kind, func(t *testing.T) {
			s, _ := openTestStore(t)
			ctx := context.Background()
			_, pair, b := issue(t, s, "budget", "none", testNow)
			code := testCode("waiting", testNow)
			if err := s.PutCode(ctx, code, testNow); err != nil {
				t.Fatal(err)
			}
			if kind == "family" {
				_, err := s.db.Exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO oauth_families(id,client_id,issuer,resource,scope,auth_method,generation,expires_at) SELECT 'filler-'||x,?,?,?,?,?,1,? FROM n", maxFamilies-1, b.ClientID, testIssuer, testIssuer, b.Scope, "none", pair.RefreshExpiresAt.UnixNano())
				if err != nil {
					t.Fatal(err)
				}
				if _, err = s.ExchangeCode(ctx, code.Hash, b.ClientID, code.RedirectURI, testIssuer, code.Challenge, tokenPair("waiting", "none", testNow), testNow); !errors.Is(err, ErrLimit) {
					t.Fatalf("family budget: %v", err)
				}
				if _, err = s.db.Exec("DELETE FROM oauth_families WHERE id LIKE 'filler-%'"); err != nil {
					t.Fatal(err)
				}
				if _, err = s.ExchangeCode(ctx, code.Hash, b.ClientID, code.RedirectURI, testIssuer, code.Challenge, tokenPair("waiting", "none", testNow), testNow); err != nil {
					t.Fatalf("budget failure consumed code: %v", err)
				}
			} else {
				_, err := s.db.Exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO oauth_tokens(hash,family_id,kind,generation,expires_at,consumed) SELECT printf('%064x',x),?,2,0,?,1 FROM n", maxTokens-2, b.FamilyID, pair.RefreshExpiresAt.UnixNano())
				if err != nil {
					t.Fatal(err)
				}
				if _, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, testIssuer, tokenPair("over", "none", testNow), testNow); !errors.Is(err, ErrLimit) {
					t.Fatalf("token budget: %v", err)
				}
				if _, err = s.CurrentRefresh(ctx, pair.RefreshHash, b.ClientID, testIssuer, testNow); err != nil {
					t.Fatalf("budget failure consumed refresh: %v", err)
				}
			}
			if _, err := s.ResolveAccess(ctx, pair.AccessHash, testNow); err != nil {
				t.Fatalf("budget displaced existing access: %v", err)
			}
		})
	}
}

func TestStoreSchemaFailuresAreNotCredentialFailures(t *testing.T) {
	for _, target := range []string{"code", "refresh", "access", "revoke", "budget", "metadata"} {
		t.Run(target, func(t *testing.T) {
			s, path := openTestStore(t)
			ctx := context.Background()
			code, pair, b := issue(t, s, "backend", "none", testNow)
			var err error
			switch target {
			case "code":
				if _, err = s.db.Exec("DROP TABLE oauth_codes"); err != nil {
					t.Fatal(err)
				}
				_, err = s.ExchangeCode(ctx, code.Hash, b.ClientID, code.RedirectURI, testIssuer, code.Challenge, tokenPair("again", "none", testNow), testNow)
			case "refresh":
				if _, err = s.db.Exec("DROP TABLE oauth_tokens"); err != nil {
					t.Fatal(err)
				}
				_, err = s.Rotate(ctx, pair.RefreshHash, b.ClientID, testIssuer, tokenPair("again", "none", testNow), testNow)
			case "access":
				if _, err = s.db.Exec("DROP TABLE oauth_families"); err != nil {
					t.Fatal(err)
				}
				_, err = s.ResolveAccess(ctx, pair.AccessHash, testNow)
			case "revoke":
				if _, err = s.db.Exec("DROP TABLE oauth_tokens"); err != nil {
					t.Fatal(err)
				}
				_, err = s.Revoke(ctx, pair.RefreshHash, b.ClientID, "none", testNow)
			case "budget":
				if _, err = s.db.Exec("ALTER TABLE oauth_codes RENAME TO missing_codes"); err != nil {
					t.Fatal(err)
				}
				err = s.transaction(ctx, func(tx *sql.Tx) error { return budget(ctx, tx, "SELECT count(*) FROM oauth_codes", maxCodes) })
			case "metadata":
				if _, err = s.db.Exec("DELETE FROM oauth_metadata WHERE key='root_fingerprint'"); err != nil {
					t.Fatal(err)
				}
				_ = s.Close()
				_, err = Open(path, testRoot, testIssuer, testIssuer)
			}
			if err == nil || errors.Is(err, ErrInvalidGrant) || errors.Is(err, ErrInvalidToken) {
				t.Fatalf("backend %s misclassified: %v", target, err)
			}
		})
	}
}

func TestStoreTransactionCancellationNeverCommits(t *testing.T) {
	s, _ := openTestStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	err := s.transaction(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "DELETE FROM oauth_metadata"); err != nil {
			return err
		}
		cancel()
		return nil
	})
	if err == nil {
		t.Fatal("cancelled transaction committed")
	}
	var count int
	if err = s.db.QueryRow("SELECT count(*) FROM oauth_metadata").Scan(&count); err != nil || count != 3 {
		t.Fatalf("cancelled transaction changed binding: %d %v", count, err)
	}
}

func TestStoreRejectsMissingPrivateParentAndOversizedFiles(t *testing.T) {
	path := filepath.Join(privateTempDir(t), "missing", "oauth.db")
	if _, err := Open(path, testRoot, testIssuer, testIssuer); err == nil {
		t.Fatal("missing parent accepted")
	}
	path = filepath.Join(privateTempDir(t), "large.db")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if err = file.Truncate(maxDatabaseBytes + 1); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	if _, err = Open(path, testRoot, testIssuer, testIssuer); err == nil {
		t.Fatal("oversized database accepted")
	}
	for _, root := range []string{"", strings.Repeat("X", 64)} {
		if _, err := Open(filepath.Join(privateTempDir(t), "invalid.db"), root, testIssuer, testIssuer); err == nil {
			t.Fatal("invalid root binding accepted")
		}
	}
}

func TestStoreRollingRefreshAndExpiredRecordCleanup(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	_, old, b := issue(t, s, "rolling", "none", testNow)
	later := testNow.Add(29 * 24 * time.Hour)
	next := tokenPair("rolling-next", "none", later)
	if _, err := s.Rotate(ctx, old.RefreshHash, b.ClientID, "", next, later); err != nil {
		t.Fatal(err)
	}
	afterOriginal := testNow.Add(31 * 24 * time.Hour)
	if _, err := s.CurrentRefresh(ctx, next.RefreshHash, b.ClientID, "", afterOriginal); err != nil {
		t.Fatalf("refresh did not roll forward: %v", err)
	}
	if err := s.PutCode(ctx, testCode("prune", afterOriginal), afterOriginal); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM oauth_tokens WHERE hash=?", old.RefreshHash).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired marker not pruned: %d %v", count, err)
	}
	if _, err := s.CurrentRefresh(ctx, next.RefreshHash, b.ClientID, "", later.Add(30*24*time.Hour)); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("idle refresh never expires: %v", err)
	}
}
