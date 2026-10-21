package runtimeprofile

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPublishConfigRejectsInvalidInputWithoutCreatingFile(t *testing.T) {
	paths := testProfilePaths(t)
	if err := PublishConfig(paths, []byte("unknown = 1\n")); err == nil {
		t.Fatal("invalid configuration accepted")
	}
	if _, err := os.Stat(paths.Config); !os.IsNotExist(err) {
		t.Fatalf("invalid config was published: %v", err)
	}
}

func TestPublishConfigIsPrivateAtomicAndNeverReplacesCallerConfig(t *testing.T) {
	paths := testProfilePaths(t)
	body := []byte(completeRuntimeConfig("", ""))
	if err := PublishConfig(paths, body); err != nil {
		t.Fatalf("publish config: %v", err)
	}
	stored, err := os.ReadFile(paths.Config)
	if err != nil || string(stored) != string(body) {
		t.Fatalf("written config differs: %v", err)
	}
	info, err := os.Stat(paths.Config)
	if err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
		t.Fatalf("config not private: %v %v", info, err)
	}
	replacement := []byte(strings.ReplaceAll(string(body), "fixture", "replacement"))
	if err := PublishConfig(paths, replacement); err == nil {
		t.Fatal("existing operator config was overwritten")
	}
	again, err := os.ReadFile(paths.Config)
	if err != nil || string(again) != string(body) {
		t.Fatalf("existing config was changed: %v", err)
	}
	matches, err := filepath.Glob(filepath.Join(paths.Root, ".config-*.tmp"))
	if err != nil || len(matches) > 0 {
		t.Fatalf("temporary config not cleaned: %v %v", matches, err)
	}
}

func TestPublishConfigWithoutInstanceDirectoryCannotWrite(t *testing.T) {
	paths, err := ResolvePaths(filepath.Join(t.TempDir(), "missing-workspace"))
	if err != nil {
		t.Fatal(err)
	}
	if err := PublishConfig(paths, []byte(completeRuntimeConfig("", ""))); err == nil {
		t.Fatal("published without a private Instance directory")
	}
	if _, err := os.Stat(paths.Config); !os.IsNotExist(err) {
		t.Fatalf("config unexpectedly exists: %v", err)
	}
}
