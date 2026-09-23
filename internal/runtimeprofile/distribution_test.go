package runtimeprofile

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDiscoverDistributionFromExecutableVerifiesPackage(t *testing.T) {
	root := t.TempDir()
	binarySuffix := ""
	if runtime.GOOS == "windows" {
		binarySuffix = ".exe"
	}
	librarySuffix, err := nativeLibrarySuffix(runtime.GOOS)
	if err != nil {
		t.Skip(err)
	}
	kg := filepath.Join(root, "kg"+binarySuffix)
	daemon := filepath.Join(root, "kgosd"+binarySuffix)
	extensions := filepath.Join(root, "extensions")
	if err := os.MkdirAll(extensions, 0o700); err != nil {
		t.Fatal(err)
	}
	lithograph := filepath.Join(extensions, "lithograph"+librarySuffix)
	provider := filepath.Join(extensions, "lithograph-openai-compatible"+librarySuffix)
	for path, body := range map[string]string{
		kg:         "kg",
		daemon:     "kgosd",
		lithograph: "lithograph",
		provider:   "provider",
	} {
		if err := os.WriteFile(path, []byte(body), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	manifest := distributionManifest{
		Arch:     distributionArch(runtime.GOARCH),
		Platform: runtime.GOOS,
		Version:  "fixture",
		Go:       "go fixture",
	}
	for _, path := range []string{kg, daemon, lithograph, provider} {
		hash, err := LocalFileSHA256(path)
		if err != nil {
			t.Fatal(err)
		}
		relative, _ := filepath.Rel(root, path)
		manifest.Files = append(manifest.Files, distributionManifestFile{
			File: filepath.ToSlash(relative), SHA256: hash,
		})
	}
	body, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "manifest.json"), append(body, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}

	distribution, err := DiscoverDistributionFromExecutable(kg)
	if err != nil {
		t.Fatalf("discover: %v", err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	if distribution.Daemon != filepath.Join(canonicalRoot, filepath.Base(daemon)) ||
		distribution.Lithograph != filepath.Join(canonicalRoot, "extensions", filepath.Base(lithograph)) ||
		distribution.Provider != filepath.Join(canonicalRoot, "extensions", filepath.Base(provider)) ||
		distribution.LithographSHA256 == "" ||
		distribution.ProviderSHA256 == "" {
		t.Fatalf("distribution = %#v", distribution)
	}

	if err := os.WriteFile(provider, []byte("tampered"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverDistributionFromExecutable(kg); err == nil ||
		!strings.Contains(err.Error(), "SHA-256") {
		t.Fatalf("tampered distribution error = %v", err)
	}
}

func TestDiscoverDistributionRejectsTargetAndManifestErrors(t *testing.T) {
	root := t.TempDir()
	binarySuffix := ""
	if runtime.GOOS == "windows" {
		binarySuffix = ".exe"
	}
	kg := filepath.Join(root, "kg"+binarySuffix)
	if err := os.WriteFile(kg, []byte("kg"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverDistributionFromExecutable(kg); err == nil ||
		!strings.Contains(err.Error(), "manifest") {
		t.Fatalf("missing manifest error = %v", err)
	}
	manifest := distributionManifest{
		Arch:     "wrong",
		Platform: runtime.GOOS,
		Version:  "fixture",
		Go:       "go fixture",
		Files:    []distributionManifestFile{},
	}
	body, _ := json.Marshal(manifest)
	if err := os.WriteFile(filepath.Join(root, "manifest.json"), body, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverDistributionFromExecutable(kg); err == nil ||
		!strings.Contains(err.Error(), "does not match runtime") {
		t.Fatalf("target mismatch error = %v", err)
	}
}

func TestDistributionPlatformMappings(t *testing.T) {
	if got := distributionArch("amd64"); got != "x64" {
		t.Fatalf("amd64 distribution arch = %q", got)
	}
	if got := distributionArch("arm64"); got != "arm64" {
		t.Fatalf("arm64 distribution arch = %q", got)
	}
	for _, test := range []struct {
		goos string
		want string
	}{
		{goos: "darwin", want: ".dylib"},
		{goos: "linux", want: ".so"},
		{goos: "windows", want: ".dll"},
	} {
		got, err := nativeLibrarySuffix(test.goos)
		if err != nil || got != test.want {
			t.Fatalf("nativeLibrarySuffix(%q) = %q, %v", test.goos, got, err)
		}
	}
	if _, err := nativeLibrarySuffix("plan9"); err == nil {
		t.Fatal("unsupported platform did not fail")
	}
}
