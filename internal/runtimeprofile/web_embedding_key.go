package runtimeprofile

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

const WebEmbeddingKeyEnv = "KGOS_WEB_EMBEDDING_API_KEY"
const webEmbeddingKeyFile = "embedding-api-key"

var webEmbeddingOwner struct {
	sync.Mutex
	instanceRoot string
}

// WriteWebEmbeddingKey persists only the provider credential; it is never part
// of config.toml, an IndexDefinition or a public API response.
func WriteWebEmbeddingKey(paths Paths, key string) error {
	if key == "" || len(key) > 8192 || strings.ContainsAny(key, "\r\n\x00") {
		return errors.New("invalid embedding credential")
	}
	path := filepath.Join(paths.Root, webEmbeddingKeyFile)
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
			return errors.New("embedding credential file is not private")
		}
		previous, readErr := os.ReadFile(path)
		if readErr != nil || subtle.ConstantTimeCompare(previous, []byte(key)) != 1 {
			return errors.New("embedding credential is already configured")
		}
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return errors.New("cannot inspect embedding credential file")
	}
	tmp, err := os.CreateTemp(paths.Root, ".embedding-key-*")
	if err != nil {
		return errors.New("cannot prepare embedding credential file")
	}
	defer os.Remove(tmp.Name())
	if err = tmp.Chmod(0o600); err == nil {
		_, err = io.WriteString(tmp, key)
	}
	if err == nil {
		err = tmp.Sync()
	}
	closeErr := tmp.Close()
	if err != nil || closeErr != nil {
		return errors.New("cannot write embedding credential file")
	}
	// Like config.toml, credentials may never replace a file created between
	// the initial check and publication by another process.
	if err = os.Link(tmp.Name(), path); err != nil {
		if errors.Is(err, os.ErrExist) {
			return errors.New("embedding credential is already configured")
		}
		return errors.New("cannot publish embedding credential file")
	}
	return syncDirectory(paths.Root)
}

// ResolveWebEmbeddingKey is used only when config explicitly selects the
// reserved name. The existing Provider still reads the variable on demand.
func ResolveWebEmbeddingKey(paths Paths, config Config) error {
	if config.Embedding.APIKeyEnv != WebEmbeddingKeyEnv {
		return nil
	}
	webEmbeddingOwner.Lock()
	defer webEmbeddingOwner.Unlock()
	path := filepath.Join(paths.Root, webEmbeddingKeyFile)
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() ||
		(runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) ||
		info.Size() < 1 || info.Size() > 8192 {
		return fmt.Errorf("invalid private embedding credential file")
	}
	file, err := os.Open(path)
	if err != nil {
		return errors.New("cannot read private embedding credential")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 8193))
	if err != nil || len(data) == 0 || len(data) > 8192 || strings.ContainsAny(string(data), "\r\n\x00") {
		return errors.New("invalid private embedding credential")
	}
	if existing, found := os.LookupEnv(WebEmbeddingKeyEnv); found {
		if webEmbeddingOwner.instanceRoot != paths.Root || existing != string(data) {
			return errors.New("reserved embedding credential environment variable conflicts with instance configuration")
		}
		return nil
	}
	if err = os.Setenv(WebEmbeddingKeyEnv, string(data)); err != nil {
		return errors.New("cannot expose private embedding credential to Provider")
	}
	webEmbeddingOwner.instanceRoot = paths.Root
	return nil
}

// The daemon owns one Instance. Releasing its Runtime also releases its
// process-local credential so retries and isolated tests cannot inherit it.
func ReleaseWebEmbeddingKey(paths Paths) {
	webEmbeddingOwner.Lock()
	defer webEmbeddingOwner.Unlock()
	if webEmbeddingOwner.instanceRoot == paths.Root {
		_ = os.Unsetenv(WebEmbeddingKeyEnv)
		webEmbeddingOwner.instanceRoot = ""
	}
}
