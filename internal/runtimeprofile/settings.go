package runtimeprofile

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"

	"github.com/BurntSushi/toml"
)

var (
	ErrSettingsConflict = errors.New("settings changed; reload before saving")
	ErrSettingsInvalid  = errors.New("invalid settings")
)

const maxSettingsConfigBytes = 1 << 20

type SettingsCredential struct {
	Source         string `json:"source"`
	Configured     bool   `json:"configured"`
	CanUpdate      bool   `json:"canUpdate"`
	PendingRestart bool   `json:"pendingRestart"`
}

type SettingsState struct {
	Effective      Config             `json:"effective"`
	Saved          Config             `json:"saved"`
	Revision       string             `json:"revision"`
	PendingRestart bool               `json:"pendingRestart"`
	Credential     SettingsCredential `json:"credential"`
}

type SettingsPatch struct {
	Server *ServerConfig `json:"server,omitempty"`
	Cache  *CacheConfig  `json:"cache,omitempty"`
	SQLite *SQLiteConfig `json:"sqlite,omitempty"`
}

// SettingsStore serializes this daemon's management writes. A revision also
// detects external edits observed before publication; it is not a filesystem
// transaction or a promise of coordination with arbitrary external writers.
type SettingsStore struct {
	mu           sync.Mutex
	paths        Paths
	effective    Config
	effectiveKey string
	revisionKey  [32]byte
}

func NewSettingsStore(paths Paths, effective Config) *SettingsStore {
	store := &SettingsStore{paths: paths, effective: cloneSettingsConfig(effective)}
	if effective.Embedding.APIKeyEnv != "" {
		store.effectiveKey = os.Getenv(effective.Embedding.APIKeyEnv)
	}
	if _, err := rand.Read(store.revisionKey[:]); err != nil {
		panic("cannot generate settings revision key")
	}
	return store
}

func (store *SettingsStore) Read() (SettingsState, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.readLocked()
}

func (store *SettingsStore) readLocked() (SettingsState, error) {
	body, err := readSettingsFile(store.paths.Config, maxSettingsConfigBytes, false)
	if err != nil {
		return SettingsState{}, err
	}
	normalized, err := ParseConfig(store.paths, body)
	if err != nil {
		return SettingsState{}, ErrSettingsInvalid
	}
	var saved Config
	if _, err = toml.Decode(string(body), &saved); err != nil {
		return SettingsState{}, ErrSettingsInvalid
	}
	saved = cloneSettingsConfig(saved)
	credential := SettingsCredential{Source: "none"}
	var key []byte
	privateFile := normalized.Embedding.APIKeyEnv == WebEmbeddingKeyEnv || store.effective.Embedding.APIKeyEnv == WebEmbeddingKeyEnv
	if privateFile {
		key, err = readSettingsFile(filepath.Join(store.paths.Root, webEmbeddingKeyFile), 8192, true)
		if errors.Is(err, os.ErrNotExist) {
			key, err = nil, nil
		}
		if err != nil {
			return SettingsState{}, err
		}
		if len(key) > 0 && !validSettingsKey(string(key)) {
			return SettingsState{}, ErrSettingsInvalid
		}
	}
	switch store.effective.Embedding.APIKeyEnv {
	case "":
	case WebEmbeddingKeyEnv:
		credential.Source = "private_file"
		credential.Configured = store.effectiveKey != ""
		credential.CanUpdate = normalized.Embedding.APIKeyEnv == WebEmbeddingKeyEnv && len(key) > 0
		credential.PendingRestart = !bytes.Equal(key, []byte(store.effectiveKey))
	default:
		credential.Source = "environment"
		credential.Configured = store.effectiveKey != ""
	}
	mac := hmac.New(sha256.New, store.revisionKey[:])
	_, _ = mac.Write(body)
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write(key)
	return SettingsState{
		Effective: cloneSettingsConfig(store.effective), Saved: saved,
		Revision: hex.EncodeToString(mac.Sum(nil)), Credential: credential,
		PendingRestart: !reflect.DeepEqual(cloneSettingsConfig(normalized), store.effective) || credential.PendingRestart,
	}, nil
}

func (store *SettingsStore) Update(revision string, patch SettingsPatch) (SettingsState, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	state, err := store.matchRevisionLocked(revision)
	if err != nil {
		return SettingsState{}, err
	}
	if patch.Server == nil && patch.Cache == nil && patch.SQLite == nil {
		return SettingsState{}, ErrSettingsInvalid
	}
	saved := state.Saved
	if patch.Server != nil {
		origin, originErr := NormalizePublicOrigin(patch.Server.PublicOrigin)
		if originErr != nil {
			return SettingsState{}, ErrSettingsInvalid
		}
		saved.Server = &ServerConfig{PublicOrigin: origin}
	}
	if patch.Cache != nil {
		saved.Cache = *patch.Cache
	}
	if patch.SQLite != nil {
		extensions, extensionErr := restoreSettingsExtensionSources(patch.SQLite.Extensions, state.Saved.SQLite.Extensions)
		if extensionErr != nil {
			return SettingsState{}, extensionErr
		}
		saved.SQLite.Extensions = extensions
	}
	var output bytes.Buffer
	if err = toml.NewEncoder(&output).Encode(saved); err != nil {
		return SettingsState{}, ErrSettingsInvalid
	}
	if output.Len() > maxSettingsConfigBytes {
		return SettingsState{}, ErrSettingsInvalid
	}
	if _, err = ParseConfig(store.paths, output.Bytes()); err != nil {
		return SettingsState{}, ErrSettingsInvalid
	}
	if err = store.replaceLocked(store.paths.Config, output.Bytes(), revision); err != nil {
		return SettingsState{}, err
	}
	return store.readLocked()
}

func (store *SettingsStore) UpdateEmbeddingKey(revision, key string) (SettingsState, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	state, err := store.matchRevisionLocked(revision)
	if err != nil {
		return SettingsState{}, err
	}
	if !state.Credential.CanUpdate || !validSettingsKey(key) {
		return SettingsState{}, ErrSettingsInvalid
	}
	if err = store.replaceLocked(filepath.Join(store.paths.Root, webEmbeddingKeyFile), []byte(key), revision); err != nil {
		return SettingsState{}, err
	}
	return store.readLocked()
}

func (store *SettingsStore) matchRevisionLocked(revision string) (SettingsState, error) {
	state, err := store.readLocked()
	if err != nil {
		return SettingsState{}, err
	}
	if revision == "" || !hmac.Equal([]byte(revision), []byte(state.Revision)) {
		return SettingsState{}, ErrSettingsConflict
	}
	return state, nil
}

func (store *SettingsStore) replaceLocked(path string, body []byte, revision string) error {
	temp, err := os.CreateTemp(store.paths.Root, ".settings-*")
	if err != nil {
		return errors.New("cannot prepare settings")
	}
	defer os.Remove(temp.Name())
	if err = temp.Chmod(0o600); err == nil {
		_, err = temp.Write(body)
	}
	if err == nil {
		err = temp.Sync()
	}
	closeErr := temp.Close()
	if err != nil || closeErr != nil {
		return errors.New("cannot write settings")
	}
	if _, err = store.matchRevisionLocked(revision); err != nil {
		return err
	}
	if err = os.Rename(temp.Name(), path); err != nil {
		return errors.New("cannot publish settings")
	}
	if err = syncDirectory(store.paths.Root); err != nil {
		return errors.New("cannot synchronize settings")
	}
	return nil
}

func readSettingsFile(path string, limit int64, private bool) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, os.ErrNotExist
		}
		return nil, errors.New("cannot inspect settings file")
	}
	if !validSettingsFileInfo(info, limit, private) {
		return nil, ErrSettingsInvalid
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, errors.New("cannot open settings file")
	}
	defer file.Close()
	actual, err := file.Stat()
	if err != nil || !os.SameFile(info, actual) {
		return nil, ErrSettingsConflict
	}
	if !validSettingsFileInfo(actual, limit, private) {
		return nil, ErrSettingsInvalid
	}
	body, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, errors.New("cannot read settings file")
	}
	if int64(len(body)) > limit {
		return nil, ErrSettingsInvalid
	}
	return body, nil
}

func validSettingsFileInfo(info os.FileInfo, limit int64, private bool) bool {
	return info.Mode().IsRegular() && info.Size() <= limit &&
		(!private || (info.Size() > 0 && (runtime.GOOS == "windows" || info.Mode().Perm() == 0o600)))
}

func validSettingsKey(key string) bool {
	return key != "" && len(key) <= 8192 && !strings.ContainsAny(key, "\r\n\x00")
}

// RedactSettingsURL removes URL credentials from settings response copies.
// Local file paths remain unchanged, including paths that are not valid URLs.
func RedactSettingsURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User == nil {
		return raw
	}
	parsed.User = nil
	return parsed.String()
}

// A response never reveals legacy URL credentials. Preserve them when a
// caller round-trips the redacted source, but never accept new URL credentials
// or guess which original source an ambiguous redacted URL identifies.
func restoreSettingsExtensionSources(incoming, previous []ExtensionConfig) ([]ExtensionConfig, error) {
	result := append([]ExtensionConfig{}, incoming...)
	for index := range result {
		parsed, err := url.Parse(result[index].Source)
		if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.User != nil {
			return nil, ErrSettingsInvalid
		}
		var original string
		for _, old := range previous {
			if RedactSettingsURL(old.Source) != result[index].Source {
				continue
			}
			if original != "" && original != old.Source {
				return nil, ErrSettingsInvalid
			}
			original = old.Source
		}
		if original != "" {
			result[index].Source = original
		}
	}
	return result, nil
}

func cloneSettingsConfig(config Config) Config {
	if config.Server != nil {
		server := *config.Server
		config.Server = &server
	}
	config.SQLite.Extensions = append([]ExtensionConfig{}, config.SQLite.Extensions...)
	return config
}
