package runtimeprofile

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestWebEmbeddingKeyIsPrivateAndCannotBeReplaced(t *testing.T) {
	paths, err := ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(paths.Root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err = WriteWebEmbeddingKey(paths, "first-private-key"); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(paths.Root, webEmbeddingKeyFile)
	info, err := os.Stat(path)
	if err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
		t.Fatalf("unsafe private key file: %v %v", info, err)
	}
	if err = WriteWebEmbeddingKey(paths, "first-private-key"); err != nil {
		t.Fatalf("idempotent retry failed: %v", err)
	}
	if err = WriteWebEmbeddingKey(paths, "replacement"); err == nil {
		t.Fatal("second request replaced an existing private credential")
	}
	body, err := os.ReadFile(path)
	if err != nil || string(body) != "first-private-key" {
		t.Fatalf("private key changed: %v", err)
	}
	for _, secret := range []string{"", "bad\nkey", strings.Repeat("x", 8193)} {
		if WriteWebEmbeddingKey(paths, secret) == nil {
			t.Fatal("invalid credential was accepted")
		}
	}
}

func TestWebEmbeddingKeyIsOnlyLoadedForExplicitReservedName(t *testing.T) {
	paths, err := ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(paths.Root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err = WriteWebEmbeddingKey(paths, "private-value"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ReleaseWebEmbeddingKey(paths) })
	var cfg Config
	cfg.Embedding.APIKeyEnv = "OPENAI_API_KEY"
	if err = ResolveWebEmbeddingKey(paths, cfg); err != nil {
		t.Fatal(err)
	}
	cfg.Embedding.APIKeyEnv = WebEmbeddingKeyEnv
	if _, set := os.LookupEnv(WebEmbeddingKeyEnv); set {
		t.Fatal("unexpected inherited reserved key")
	}
	if err = ResolveWebEmbeddingKey(paths, cfg); err != nil {
		t.Fatal(err)
	}
	if value := os.Getenv(WebEmbeddingKeyEnv); value != "private-value" {
		t.Fatal("private key not available to Provider")
	}
	if err = ResolveWebEmbeddingKey(paths, cfg); err != nil {
		t.Fatalf("same Instance retry failed: %v", err)
	}
	ReleaseWebEmbeddingKey(paths)
	if _, set := os.LookupEnv(WebEmbeddingKeyEnv); set {
		t.Fatal("private key remained in process environment")
	}
	t.Setenv(WebEmbeddingKeyEnv, "external-secret")
	if err = ResolveWebEmbeddingKey(paths, cfg); err == nil {
		t.Fatal("host environment collision was not rejected")
	}
}
