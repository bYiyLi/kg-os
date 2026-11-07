// Package mcpoauth owns durable MCP OAuth credentials, separate from graph data.
package mcpoauth

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var (
	ErrInvalidGrant   = errors.New("invalid OAuth grant")
	ErrInvalidToken   = errors.New("invalid OAuth access token")
	ErrInvalid        = ErrInvalidToken
	ErrLimit          = errors.New("OAuth storage budget exceeded")
	ErrClientNotFound = errors.New("OAuth client not registered")
)

const (
	maxFamilies      = 256
	maxCodes         = 128
	maxTokens        = 65536
	maxDatabaseBytes = 64 << 20
	maxClients       = 512
)

// RegisteredClient is a DCR identity, not an OAuth authorization grant.
type RegisteredClient struct {
	ID           string
	Name         string
	URI          string
	RedirectURIs []string
	CreatedAt    time.Time
}

type Binding struct {
	FamilyID   string
	ClientID   string
	Issuer     string
	Resource   string
	Scope      string
	AuthMethod string
	Generation int64
}

type Code struct {
	Hash        string
	Binding     Binding
	RedirectURI string
	Challenge   string
	ExpiresAt   time.Time
}

type Tokens struct {
	AccessHash       string
	RefreshHash      string
	AccessExpiresAt  time.Time
	RefreshExpiresAt time.Time
	AuthMethod       string
}

type Store struct {
	db       *sql.DB
	issuer   string
	resource string
}

// Open never replaces a damaged or unsafe store. The caller owns Close and
// preserves any error as OAuth unavailability rather than an in-memory fallback.
func Open(path, rootFingerprint, issuer, resource string) (_ *Store, resultErr error) {
	if !filepath.IsAbs(path) || !validHash(rootFingerprint) || issuer == "" || resource == "" || len(issuer) > 2048 || len(resource) > 2048 {
		return nil, errors.New("invalid OAuth store binding")
	}
	if err := privateDirectory(filepath.Dir(path)); err != nil {
		return nil, err
	}
	created, err := prepareFile(path)
	if err != nil {
		return nil, err
	}
	if err := checkSidecars(path); err != nil {
		return nil, err
	}
	u := url.URL{Scheme: "file", Path: path}
	q := u.Query()
	q.Set("_busy_timeout", "1000")
	q.Set("_foreign_keys", "on")
	q.Set("_txlock", "immediate")
	q.Set("_journal_mode", "DELETE")
	q.Set("_synchronous", "FULL")
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite3", u.String())
	if err != nil {
		return nil, fmt.Errorf("open OAuth store: %w", err)
	}
	defer func() {
		if resultErr != nil {
			_ = db.Close()
		}
	}()
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	s := &Store{db: db, issuer: issuer, resource: resource}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.initialize(ctx, rootFingerprint, created); err != nil {
		return nil, err
	}
	if err := checkSidecars(path); err != nil {
		return nil, err
	}
	return s, nil
}

func privateDirectory(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect OAuth store directory: %w", err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || (runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0) {
		return errors.New("OAuth store directory must be private")
	}
	return nil
}

func prepareFile(path string) (bool, error) {
	file, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
	if err == nil {
		if err = file.Close(); err != nil {
			return false, fmt.Errorf("close new OAuth store: %w", err)
		}
		return true, nil
	}
	if !errors.Is(err, os.ErrExist) {
		return false, fmt.Errorf("create OAuth store: %w", err)
	}
	if err = privateFile(path); err != nil {
		return false, err
	}
	return false, nil
}
func privateFile(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect OAuth store file: %w", err)
	}
	if !info.Mode().IsRegular() || (runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0) || info.Size() > maxDatabaseBytes {
		return errors.New("OAuth store file has invalid type, permissions or size")
	}
	return nil
}
func checkSidecars(path string) error {
	for _, suffix := range []string{"-journal", "-wal", "-shm"} {
		if err := privateFile(path + suffix); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func (s *Store) initialize(ctx context.Context, rootFingerprint string, created bool) error {
	var version int
	if err := s.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read OAuth store version: %w", err)
	}
	if version != 0 && version != 1 && version != 2 {
		return errors.New("unsupported OAuth store version")
	}
	if version == 0 {
		var tables int
		if err := s.db.QueryRowContext(ctx, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").Scan(&tables); err != nil {
			return fmt.Errorf("inspect OAuth schema: %w", err)
		}
		if tables != 0 || !created {
			return errors.New("OAuth store has no recognized schema")
		}
	}
	var integrity string
	if err := s.db.QueryRowContext(ctx, "PRAGMA quick_check(1)").Scan(&integrity); err != nil || integrity != "ok" {
		return errors.New("OAuth store integrity check failed")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("initialize OAuth transaction: %w", err)
	}
	defer tx.Rollback()
	if version == 0 {
		for _, statement := range []string{
			"CREATE TABLE oauth_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
			"CREATE TABLE oauth_families (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, issuer TEXT NOT NULL, resource TEXT NOT NULL, scope TEXT NOT NULL, auth_method TEXT NOT NULL, generation INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL)",
			"CREATE TABLE oauth_codes (hash TEXT PRIMARY KEY, family_id TEXT NOT NULL, client_id TEXT NOT NULL, issuer TEXT NOT NULL, resource TEXT NOT NULL, scope TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL)",
			"CREATE TABLE oauth_tokens (hash TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES oauth_families(id) ON DELETE CASCADE, kind INTEGER NOT NULL, generation INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)",
			"CREATE INDEX oauth_tokens_family ON oauth_tokens(family_id)",
			"CREATE INDEX oauth_tokens_expiry ON oauth_tokens(expires_at)",
		} {
			if _, err = tx.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("create OAuth schema: %w", err)
			}
		}
	}
	if version < 2 {
		if _, err = tx.ExecContext(ctx, "CREATE TABLE oauth_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, uri TEXT NOT NULL, redirects TEXT NOT NULL, created_at INTEGER NOT NULL)"); err != nil {
			return fmt.Errorf("create OAuth client registry: %w", err)
		}
		if _, err = tx.ExecContext(ctx, "PRAGMA user_version=2"); err != nil {
			return fmt.Errorf("set OAuth schema version: %w", err)
		}
	}
	expected := map[string]string{"root_fingerprint": rootFingerprint, "issuer": s.issuer, "resource": s.resource}
	reset := version == 0
	migrateLegacyResource := false
	for key, want := range expected {
		var got string
		err = tx.QueryRowContext(ctx, "SELECT value FROM oauth_metadata WHERE key=?", key).Scan(&got)
		if errors.Is(err, sql.ErrNoRows) {
			if version != 0 {
				return errors.New("OAuth store binding is missing")
			}
			reset = true
		} else if err != nil {
			return fmt.Errorf("read OAuth store binding: %w", err)
		} else if got != want {
			if key == "resource" && got == s.issuer && strings.HasPrefix(want, s.issuer+"/") {
				migrateLegacyResource = true
			} else {
				reset = true
			}
		}
	}
	if migrateLegacyResource && !reset {
		// Upgrade only the binding of the OAuth store. Historical Families,
		// Codes and Access Tokens retain their original audience and expiry.
		if _, err = tx.ExecContext(ctx, "UPDATE oauth_metadata SET value=? WHERE key='resource'", s.resource); err != nil {
			return fmt.Errorf("migrate OAuth resource binding: %w", err)
		}
	}
	if reset {
		if _, err = tx.ExecContext(ctx, "DELETE FROM oauth_clients"); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, "DELETE FROM oauth_codes"); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, "DELETE FROM oauth_families"); err != nil {
			return err
		}
		for key, value := range expected {
			if _, err = tx.ExecContext(ctx, "INSERT INTO oauth_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value); err != nil {
				return err
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit OAuth schema: %w", err)
	}
	return nil
}

func (s *Store) Close() error { return s.db.Close() }

// CreateClient atomically limits registered DCR identities without conferring access.
func (s *Store) CreateClient(ctx context.Context, client RegisteredClient) error {
	if len(client.ID) < 32 || len(client.ID) > 128 || len(client.Name) == 0 || len(client.Name) > 255 ||
		len(client.URI) > 2048 || len(client.RedirectURIs) == 0 || len(client.RedirectURIs) > 20 || client.CreatedAt.IsZero() {
		return ErrInvalidGrant
	}
	for _, redirect := range client.RedirectURIs {
		if redirect == "" || len(redirect) > 2048 {
			return ErrInvalidGrant
		}
	}
	redirects, err := json.Marshal(client.RedirectURIs)
	if err != nil {
		return ErrInvalidGrant
	}
	return s.transaction(ctx, func(tx *sql.Tx) error {
		// Bound anonymous registration storage without removing a client that
		// still owns an unexpired OAuth code or an active refresh family.
		now := client.CreatedAt.UnixNano()
		cutoff := client.CreatedAt.Add(-30 * 24 * time.Hour).UnixNano()
		if _, err := tx.ExecContext(ctx, `DELETE FROM oauth_clients
			WHERE created_at < ?
			AND NOT EXISTS (
				SELECT 1 FROM oauth_codes c
				WHERE c.client_id=oauth_clients.id AND c.expires_at>?
			)
			AND NOT EXISTS (
				SELECT 1 FROM oauth_families f
				WHERE f.client_id=oauth_clients.id AND f.revoked=0 AND f.expires_at>?
			)`, cutoff, now, now); err != nil {
			return fmt.Errorf("prune unused OAuth clients: %w", err)
		}
		if err := budget(ctx, tx, "SELECT count(*) FROM oauth_clients", maxClients); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, "INSERT INTO oauth_clients(id,name,uri,redirects,created_at) VALUES(?,?,?,?,?)",
			client.ID, client.Name, client.URI, string(redirects), client.CreatedAt.UnixNano())
		if err != nil {
			return fmt.Errorf("register OAuth client: %w", err)
		}
		return nil
	})
}

func (s *Store) GetClient(ctx context.Context, id string) (RegisteredClient, error) {
	var client RegisteredClient
	var redirects string
	var created int64
	err := s.db.QueryRowContext(ctx, "SELECT id,name,uri,redirects,created_at FROM oauth_clients WHERE id=?", id).
		Scan(&client.ID, &client.Name, &client.URI, &redirects, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return client, ErrClientNotFound
	}
	if err != nil {
		return client, fmt.Errorf("read OAuth client: %w", err)
	}
	if err := json.Unmarshal([]byte(redirects), &client.RedirectURIs); err != nil || len(client.RedirectURIs) == 0 {
		return RegisteredClient{}, errors.New("invalid stored OAuth client")
	}
	client.CreatedAt = time.Unix(0, created).UTC()
	return client, nil
}

func validHash(value string) bool {
	if len(value) != 64 || strings.ToLower(value) != value {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}
func (s *Store) validBinding(b Binding) bool {
	return b.FamilyID != "" && len(b.FamilyID) <= 128 && b.ClientID != "" && len(b.ClientID) <= 2048 && b.Issuer == s.issuer && b.Resource == s.resource && b.Scope != "" && len(b.Scope) <= 256
}
func validTokens(t Tokens, now time.Time) bool {
	return validHash(t.AccessHash) && validHash(t.RefreshHash) && t.AccessHash != t.RefreshHash && t.AccessExpiresAt.After(now) && t.RefreshExpiresAt.After(t.AccessExpiresAt) && (t.AuthMethod == "none" || t.AuthMethod == "private_key_jwt")
}
func (s *Store) transaction(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin OAuth transaction: %w", err)
	}
	defer tx.Rollback()
	if err = fn(tx); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit OAuth transaction: %w", err)
	}
	return nil
}
func cleanup(ctx context.Context, tx *sql.Tx, now time.Time) error {
	for _, statement := range []string{"DELETE FROM oauth_codes WHERE expires_at<=?", "DELETE FROM oauth_tokens WHERE expires_at<=?", "DELETE FROM oauth_families WHERE expires_at<=?"} {
		if _, err := tx.ExecContext(ctx, statement, now.UnixNano()); err != nil {
			return fmt.Errorf("clean OAuth store: %w", err)
		}
	}
	return nil
}
func budget(ctx context.Context, tx *sql.Tx, query string, limit int) error {
	var count int
	if err := tx.QueryRowContext(ctx, query).Scan(&count); err != nil {
		return fmt.Errorf("count OAuth records: %w", err)
	}
	if count >= limit {
		return ErrLimit
	}
	return nil
}

func (s *Store) PutCode(ctx context.Context, code Code, now time.Time) error {
	if !validHash(code.Hash) || !s.validBinding(code.Binding) || code.RedirectURI == "" || code.Challenge == "" {
		return ErrInvalidGrant
	}
	if !code.ExpiresAt.After(now) {
		return classify("expired", ErrInvalidGrant)
	}
	return s.transaction(ctx, func(tx *sql.Tx) error {
		if err := cleanup(ctx, tx, now); err != nil {
			return err
		}
		if err := budget(ctx, tx, "SELECT count(*) FROM oauth_codes", maxCodes); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, "INSERT INTO oauth_codes(hash,family_id,client_id,issuer,resource,scope,redirect_uri,challenge,expires_at) VALUES(?,?,?,?,?,?,?,?,?)", code.Hash, code.Binding.FamilyID, code.Binding.ClientID, code.Binding.Issuer, code.Binding.Resource, code.Binding.Scope, code.RedirectURI, code.Challenge, code.ExpiresAt.UnixNano())
		if err != nil {
			return fmt.Errorf("store OAuth code: %w", err)
		}
		return nil
	})
}

// CodeScope returns the original grant scope without consuming the code.
// The token endpoint uses this solely to reject pre-upgrade code exchange;
// ExchangeCode remains the atomic authority for redemption and PKCE.
func (s *Store) CodeScope(ctx context.Context, hash string) (string, error) {
	if !validHash(hash) {
		return "", ErrInvalidGrant
	}
	var scope string
	err := s.db.QueryRowContext(ctx, "SELECT scope FROM oauth_codes WHERE hash=?", hash).Scan(&scope)
	if errors.Is(err, sql.ErrNoRows) {
		return "", classify("not_found", ErrInvalidGrant)
	}
	if err != nil {
		return "", fmt.Errorf("read OAuth code scope: %w", err)
	}
	return scope, nil
}

func (s *Store) ExchangeCode(ctx context.Context, hash, clientID, redirectURI, resource, challenge string, tokens Tokens, now time.Time) (Binding, error) {
	if !validHash(hash) || !validTokens(tokens, now) {
		return Binding{}, ErrInvalidGrant
	}
	var b Binding
	err := s.transaction(ctx, func(tx *sql.Tx) error {
		var redirect, wantChallenge string
		var expiry int64
		err := tx.QueryRowContext(ctx, "SELECT family_id,client_id,issuer,resource,scope,redirect_uri,challenge,expires_at FROM oauth_codes WHERE hash=?", hash).Scan(&b.FamilyID, &b.ClientID, &b.Issuer, &b.Resource, &b.Scope, &redirect, &wantChallenge, &expiry)
		if errors.Is(err, sql.ErrNoRows) {
			return classify("not_found", ErrInvalidGrant)
		}
		if err != nil {
			return fmt.Errorf("read OAuth code: %w", err)
		}
		if b.ClientID != clientID {
			return classify("client_mismatch", ErrInvalidGrant)
		}
		if b.Issuer != s.issuer || b.Resource != s.resource || resource != b.Resource {
			return classify("resource_mismatch", ErrInvalidGrant)
		}
		if redirectURI != redirect || wantChallenge != challenge {
			return ErrInvalidGrant
		}
		if expiry <= now.UnixNano() {
			return classify("expired", ErrInvalidGrant)
		}
		if err = cleanup(ctx, tx, now); err != nil {
			return err
		}
		if err = budget(ctx, tx, "SELECT count(*) FROM oauth_families WHERE revoked=0", maxFamilies); err != nil {
			return err
		}
		if err = budget(ctx, tx, "SELECT count(*) FROM oauth_tokens", maxTokens-1); err != nil {
			return err
		}
		b.Generation = 1
		b.AuthMethod = tokens.AuthMethod
		_, err = tx.ExecContext(ctx, "INSERT INTO oauth_families(id,client_id,issuer,resource,scope,auth_method,generation,expires_at) VALUES(?,?,?,?,?,?,?,?)", b.FamilyID, b.ClientID, b.Issuer, b.Resource, b.Scope, b.AuthMethod, b.Generation, tokens.RefreshExpiresAt.UnixNano())
		if err != nil {
			return fmt.Errorf("store OAuth family: %w", err)
		}
		if err = insertTokens(ctx, tx, b, tokens); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "DELETE FROM oauth_codes WHERE hash=?", hash)
		return err
	})
	return b, err
}

func insertTokens(ctx context.Context, tx *sql.Tx, b Binding, t Tokens) error {
	for _, v := range []struct {
		hash   string
		kind   int
		expiry time.Time
	}{{t.AccessHash, 1, t.AccessExpiresAt}, {t.RefreshHash, 2, t.RefreshExpiresAt}} {
		if _, err := tx.ExecContext(ctx, "INSERT INTO oauth_tokens(hash,family_id,kind,generation,expires_at) VALUES(?,?,?,?,?)", v.hash, b.FamilyID, v.kind, b.Generation, v.expiry.UnixNano()); err != nil {
			return fmt.Errorf("store OAuth token: %w", err)
		}
	}
	return nil
}

const tokenQuery = "SELECT f.id,f.client_id,f.issuer,f.resource,f.scope,f.auth_method,f.generation,f.revoked,f.expires_at,t.kind,t.generation,t.expires_at,t.consumed FROM oauth_tokens t JOIN oauth_families f ON f.id=t.family_id WHERE t.hash=?"

type tokenState struct {
	binding      Binding
	revoked      int
	familyExpiry int64
	kind         int
	generation   int64
	expiry       int64
	consumed     int
}

func readToken(ctx context.Context, query interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, hash string) (tokenState, error) {
	var t tokenState
	err := query.QueryRowContext(ctx, tokenQuery, hash).Scan(&t.binding.FamilyID, &t.binding.ClientID, &t.binding.Issuer, &t.binding.Resource, &t.binding.Scope, &t.binding.AuthMethod, &t.binding.Generation, &t.revoked, &t.familyExpiry, &t.kind, &t.generation, &t.expiry, &t.consumed)
	return t, err
}
func (s *Store) resourceMatches(b Binding) bool {
	if b.Resource == s.resource {
		return true
	}
	// Read-only compatibility for issued pre-P36 Access credentials. A new
	// Family can never be created with this legacy resource after migration.
	return strings.HasPrefix(s.resource, s.issuer+"/") && b.Resource == s.issuer &&
		(b.Scope == "kgos:access" || b.Scope == "kgos:access offline_access")
}

func (s *Store) current(t tokenState, now time.Time) bool {
	return t.revoked == 0 && t.familyExpiry > now.UnixNano() && t.expiry > now.UnixNano() &&
		t.binding.Issuer == s.issuer && s.resourceMatches(t.binding)
}

func (s *Store) Rotate(ctx context.Context, hash, clientID, resource string, tokens Tokens, now time.Time) (Binding, error) {
	if !validHash(hash) || !validTokens(tokens, now) {
		return Binding{}, ErrInvalidGrant
	}
	var b Binding
	var replay bool
	err := s.transaction(ctx, func(tx *sql.Tx) error {
		old, err := readToken(ctx, tx, hash)
		if errors.Is(err, sql.ErrNoRows) {
			return classify("not_found", ErrInvalidGrant)
		}
		if err != nil {
			return fmt.Errorf("read OAuth refresh: %w", err)
		}
		b = old.binding
		if old.kind != 2 {
			return ErrInvalidGrant
		}
		if b.ClientID != clientID {
			return classify("client_mismatch", ErrInvalidGrant)
		}
		if resource != "" && b.Resource != resource {
			return classify("resource_mismatch", ErrInvalidGrant)
		}
		if b.AuthMethod != tokens.AuthMethod {
			return classify("auth_method_mismatch", ErrInvalidGrant)
		}
		if cause := s.tokenFailure(old, now); cause != "" {
			return classify(cause, ErrInvalidGrant)
		}
		if old.consumed != 0 || old.generation != b.Generation {
			replay = true
			_, err = tx.ExecContext(ctx, "UPDATE oauth_families SET revoked=1 WHERE id=?", b.FamilyID)
			return err
		}
		if err = cleanup(ctx, tx, now); err != nil {
			return err
		}
		if err = budget(ctx, tx, "SELECT count(*) FROM oauth_tokens", maxTokens-1); err != nil {
			return err
		}
		b.Generation++
		_, err = tx.ExecContext(ctx, "UPDATE oauth_tokens SET consumed=1 WHERE hash=?", hash)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "UPDATE oauth_families SET generation=?,expires_at=? WHERE id=?", b.Generation, tokens.RefreshExpiresAt.UnixNano(), b.FamilyID)
		if err != nil {
			return err
		}
		return insertTokens(ctx, tx, b, tokens)
	})
	if err == nil && replay {
		return b, classify("replay", ErrInvalidGrant)
	}
	return b, err
}

func (s *Store) ResolveAccess(ctx context.Context, hash string, now time.Time) (Binding, error) {
	if !validHash(hash) {
		return Binding{}, ErrInvalidToken
	}
	t, err := readToken(ctx, s.db, hash)
	if errors.Is(err, sql.ErrNoRows) {
		return Binding{}, classify("not_found", ErrInvalidToken)
	}
	if err != nil {
		return Binding{}, fmt.Errorf("read OAuth access: %w", err)
	}
	if t.kind != 1 {
		return Binding{}, ErrInvalidToken
	}
	if cause := s.tokenFailure(t, now); cause != "" {
		return Binding{}, classify(cause, ErrInvalidToken)
	}
	return t.binding, nil
}

func (s *Store) CurrentRefresh(ctx context.Context, hash, clientID, resource string, now time.Time) (Binding, error) {
	if !validHash(hash) {
		return Binding{}, ErrInvalidGrant
	}
	t, err := readToken(ctx, s.db, hash)
	if errors.Is(err, sql.ErrNoRows) {
		return Binding{}, classify("not_found", ErrInvalidGrant)
	}
	if err != nil {
		return Binding{}, fmt.Errorf("read current OAuth refresh: %w", err)
	}
	if t.kind != 2 {
		return Binding{}, ErrInvalidGrant
	}
	if t.binding.ClientID != clientID {
		return Binding{}, classify("client_mismatch", ErrInvalidGrant)
	}
	if resource != "" && t.binding.Resource != resource {
		return Binding{}, classify("resource_mismatch", ErrInvalidGrant)
	}
	if cause := s.tokenFailure(t, now); cause != "" {
		return Binding{}, classify(cause, ErrInvalidGrant)
	}
	if t.consumed != 0 || t.generation != t.binding.Generation {
		return Binding{}, classify("replay", ErrInvalidGrant)
	}
	return t.binding, nil
}

// Revoke deliberately reports the same success for unknown or unrelated tokens.
// Consumed refresh hashes remain linked to the family until their own expiry.
func (s *Store) Revoke(ctx context.Context, hash, clientID, authMethod string, now time.Time) (string, error) {
	if !validHash(hash) {
		return "", nil
	}
	var family string
	err := s.transaction(ctx, func(tx *sql.Tx) error {
		t, err := readToken(ctx, tx, hash)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read revocation token: %w", err)
		}
		if !s.current(t, now) || t.binding.ClientID != clientID || t.binding.AuthMethod != authMethod {
			return nil
		}
		family = t.binding.FamilyID
		_, err = tx.ExecContext(ctx, "UPDATE oauth_families SET revoked=1 WHERE id=?", family)
		return err
	})
	return family, err
}

// classifiedError carries only a fixed diagnostic category; the protocol sentinel
// remains available through errors.Is. Cause never returns an arbitrary message.
type classifiedError struct {
	reason string
	err    error
}

func (e *classifiedError) Error() string { return e.err.Error() }
func (e *classifiedError) Unwrap() error { return e.err }
func classify(reason string, err error) error {
	return &classifiedError{reason: reason, err: err}
}

// Cause is safe for observability fields. Unknown errors are backend failures,
// regardless of their Error text; credential material never becomes a category.
func Cause(err error) string {
	if err == nil {
		return ""
	}
	var classified *classifiedError
	if errors.As(err, &classified) {
		switch classified.reason {
		case "invalid_grant", "not_found", "expired", "client_mismatch", "resource_mismatch", "auth_method_mismatch", "replay", "revoked", "budget", "backend":
			return classified.reason
		}
		return "backend"
	}
	if errors.Is(err, ErrLimit) {
		return "budget"
	}
	if errors.Is(err, ErrInvalidGrant) || errors.Is(err, ErrInvalidToken) {
		return "invalid_grant"
	}
	return "backend"
}

func (s *Store) tokenFailure(t tokenState, now time.Time) string {
	if t.binding.Issuer != s.issuer || !s.resourceMatches(t.binding) {
		return "resource_mismatch"
	}
	if t.revoked != 0 {
		return "revoked"
	}
	if t.familyExpiry <= now.UnixNano() || t.expiry <= now.UnixNano() {
		return "expired"
	}
	return ""
}
