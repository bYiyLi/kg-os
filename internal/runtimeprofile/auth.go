package runtimeprofile

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
)

const credentialEntropyBytes = 32

type Credential struct {
	Token string `json:"token"`
}

func LoadOrCreateCredential(paths Paths) (Credential, error) {
	credential, err := LoadCredential(paths)
	if err == nil {
		return credential, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return Credential{}, err
	}
	return createCredential(paths.Auth, rand.Reader)
}

func LoadCredential(paths Paths) (Credential, error) {
	return loadCredential(paths.Auth)
}

func loadCredential(path string) (Credential, error) {
	file, err := os.Open(path)
	if err != nil {
		return Credential{}, fmt.Errorf("open auth.json: %w", err)
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return Credential{}, fmt.Errorf("stat auth.json: %w", err)
	}
	if err := ensureCredentialPrivate(path, info); err != nil {
		return Credential{}, err
	}

	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var credential Credential
	if err := decoder.Decode(&credential); err != nil {
		return Credential{}, fmt.Errorf("decode auth.json: %w", err)
	}
	if credential.Token == "" {
		return Credential{}, fmt.Errorf("auth.json token must be non-empty")
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Credential{}, fmt.Errorf("auth.json must contain exactly one JSON object")
	}
	return credential, nil
}

func createCredential(path string, random io.Reader) (Credential, error) {
	randomBytes := make([]byte, credentialEntropyBytes)
	if _, err := io.ReadFull(random, randomBytes); err != nil {
		return Credential{}, fmt.Errorf("generate auth token: %w", err)
	}
	credential := Credential{Token: base64.RawURLEncoding.EncodeToString(randomBytes)}
	body, err := json.Marshal(credential)
	if err != nil {
		return Credential{}, fmt.Errorf("encode auth.json: %w", err)
	}
	body = append(body, '\n')

	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".auth-*.tmp")
	if err != nil {
		return Credential{}, fmt.Errorf("create auth.json temporary file: %w", err)
	}
	temporaryPath := temporary.Name()
	published := false
	defer func() {
		_ = temporary.Close()
		if !published {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return Credential{}, fmt.Errorf("secure auth.json temporary file: %w", err)
	}
	if err := ensureCredentialPrivate(temporaryPath, nil); err != nil {
		return Credential{}, err
	}
	if _, err := io.Copy(temporary, bytes.NewReader(body)); err != nil {
		return Credential{}, fmt.Errorf("write auth.json temporary file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return Credential{}, fmt.Errorf("sync auth.json temporary file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return Credential{}, fmt.Errorf("close auth.json temporary file: %w", err)
	}
	if _, err := os.Stat(path); err == nil {
		return Credential{}, fmt.Errorf("auth.json appeared while creating credential")
	} else if !errors.Is(err, os.ErrNotExist) {
		return Credential{}, fmt.Errorf("check auth.json before publish: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return Credential{}, fmt.Errorf("publish auth.json: %w", err)
	}
	published = true
	if err := syncDirectory(directory); err != nil {
		return Credential{}, err
	}
	return credential, nil
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open runtime directory for sync: %w", err)
	}
	defer directory.Close()
	if runtime.GOOS == "windows" {
		return nil
	}
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("sync runtime directory: %w", err)
	}
	return nil
}
