package daemon

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

const (
	webSessionFile         = "web-sessions.json"
	webSessionLifetime     = 30 * 24 * time.Hour
	maxWebSessions         = 64
	maxWebSessionFileBytes = 65536
	maxWebAccessTokens     = 512
)

type storedWebSession struct {
	RootHash string `json:"rootHash"`
	Expires  int64  `json:"expires"`
}

type webSessionFileData struct {
	Version  int                         `json:"version"`
	Sessions map[string]storedWebSession `json:"sessions"`
}

type webSessionStore struct {
	mu          sync.Mutex
	path        string
	rootHash    string
	cookieName  string
	loaded      bool
	sessions    map[string]storedWebSession
	access      map[[32]byte]string
	accessOrder [][32]byte
	now         func() time.Time
}

func newWebSessionStore(root, token string) *webSessionStore {
	path := ""
	if root != "" {
		path = filepath.Join(root, webSessionFile)
	}
	digest := sha256.Sum256([]byte(token))
	rootDigest := sha256.Sum256([]byte(filepath.Clean(root)))
	return &webSessionStore{
		path: path, rootHash: hex.EncodeToString(digest[:]),
		cookieName: "kgos_ws_" + hex.EncodeToString(rootDigest[:8]),
		sessions:   make(map[string]storedWebSession),
		access:     make(map[[32]byte]string), now: time.Now,
	}
}

func newWebSecret() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}

func validWebSecret(value string) bool {
	if len(value) != 43 {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(raw) == 32 && base64.RawURLEncoding.EncodeToString(raw) == value
}

func webSecretHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (s *webSessionStore) loadLocked() error {
	if s.loaded {
		return nil
	}
	if s.path == "" {
		return errors.New("web sessions require an Instance directory")
	}
	info, err := os.Lstat(s.path)
	if errors.Is(err, os.ErrNotExist) {
		s.loaded = true
		return nil
	}
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() ||
		(runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0) ||
		info.Size() > maxWebSessionFileBytes {
		return errors.New("web session store has invalid type, permissions or size")
	}
	file, err := os.Open(s.path)
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxWebSessionFileBytes+1))
	if err != nil {
		return err
	}
	var decoded webSessionFileData
	if err = json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	if decoded.Version != 1 || decoded.Sessions == nil || len(decoded.Sessions) > maxWebSessions {
		return errors.New("web session store has an unsupported format")
	}
	for key, session := range decoded.Sessions {
		if len(key) != 64 || session.Expires <= 0 || len(session.RootHash) != 64 {
			return errors.New("web session store has invalid records")
		}
	}
	s.sessions = decoded.Sessions
	s.loaded = true
	return nil
}

func (s *webSessionStore) saveLocked(next map[string]storedWebSession) error {
	if s.path == "" {
		return errors.New("web session store is unavailable")
	}
	data, err := json.Marshal(webSessionFileData{Version: 1, Sessions: next})
	if err != nil {
		return err
	}
	if len(data) > maxWebSessionFileBytes {
		return errors.New("web session budget exceeded")
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".web-session-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err = tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err = tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	if err = os.Rename(tmp.Name(), s.path); err != nil {
		return err
	}
	dir, err := os.Open(filepath.Dir(s.path))
	if err == nil {
		_ = dir.Sync()
		_ = dir.Close()
	}
	s.sessions = next
	return nil
}

func (s *webSessionStore) cleanedLocked() map[string]storedWebSession {
	result := make(map[string]storedWebSession)
	now := s.now().Unix()
	for key, record := range s.sessions {
		if record.Expires > now && record.RootHash == s.rootHash {
			result[key] = record
		}
	}
	return result
}

func (s *webSessionStore) login() (string, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return "", "", err
	}
	next := s.cleanedLocked()
	if len(next) >= maxWebSessions {
		return "", "", errors.New("web session limit reached")
	}
	cookie, err := newWebSecret()
	if err != nil {
		return "", "", err
	}
	hash := webSecretHash(cookie)
	next[hash] = storedWebSession{RootHash: s.rootHash, Expires: s.now().Add(webSessionLifetime).Unix()}
	if err = s.saveLocked(next); err != nil {
		return "", "", err
	}
	access, err := s.accessTokenLocked(hash)
	if err != nil {
		return "", "", err
	}
	return cookie, access, nil
}

func (s *webSessionStore) accessTokenLocked(hash string) (string, error) {
	secret, err := newWebSecret()
	if err != nil {
		return "", err
	}
	token := "kgws_" + secret
	digest := sha256.Sum256([]byte(token))
	if len(s.accessOrder) >= maxWebAccessTokens {
		delete(s.access, s.accessOrder[0])
		s.accessOrder = s.accessOrder[1:]
	}
	s.access[digest] = hash
	s.accessOrder = append(s.accessOrder, digest)
	return token, nil
}

func (s *webSessionStore) restore(cookie string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return "", err
	}
	if !validWebSecret(cookie) {
		return "", os.ErrPermission
	}
	hash := webSecretHash(cookie)
	record, ok := s.sessions[hash]
	if !ok || record.Expires <= s.now().Unix() || record.RootHash != s.rootHash {
		return "", os.ErrPermission
	}
	next := s.cleanedLocked()
	next[hash] = storedWebSession{RootHash: s.rootHash, Expires: s.now().Add(webSessionLifetime).Unix()}
	if err := s.saveLocked(next); err != nil {
		return "", err
	}
	return s.accessTokenLocked(hash)
}

func (s *webSessionStore) logout(cookie string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return err
	}
	next := s.cleanedLocked()
	hash := webSecretHash(cookie)
	delete(next, hash)
	if err := s.saveLocked(next); err != nil {
		return err
	}
	for digest, key := range s.access {
		if key == hash {
			delete(s.access, digest)
		}
	}
	return nil
}

func (s *webSessionStore) allows(token string) bool {
	if !stringsHasWebAccessPrefix(token) {
		return false
	}
	digest := sha256.Sum256([]byte(token))
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return false
	}
	hash, ok := s.access[digest]
	if !ok {
		return false
	}
	session, ok := s.sessions[hash]
	return ok && session.RootHash == s.rootHash && session.Expires > s.now().Unix()
}

func stringsHasWebAccessPrefix(token string) bool {
	return len(token) == 48 && token[:5] == "kgws_" && validWebSecret(token[5:])
}
