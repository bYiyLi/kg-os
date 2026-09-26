package runtimeprofile

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDiscoverRuntimePackageFromExecutableVerifiesPackage(t *testing.T) {
	root := t.TempDir()
	librarySuffix, err := nativeLibrarySuffix(runtime.GOOS)
	if err != nil {
		t.Skip(err)
	}
	daemon := filepath.Join(root, "kgosd")
	extensions := filepath.Join(root, "extensions")
	if err := os.MkdirAll(extensions, 0o700); err != nil {
		t.Fatal(err)
	}
	lithograph := filepath.Join(extensions, "lithograph"+librarySuffix)
	provider := filepath.Join(extensions, "lithograph-openai-compatible"+librarySuffix)
	jieba := filepath.Join(extensions, "kgos-jieba"+librarySuffix)
	licenses := filepath.Join(root, "licenses")
	if err := os.MkdirAll(licenses, 0o700); err != nil {
		t.Fatal(err)
	}
	notice := filepath.Join(root, "JIEBA-NOTICE.md")
	tokenizerLicense := filepath.Join(licenses, "sqlite-simple-tokenizer-MIT.txt")
	jiebaLicense := filepath.Join(licenses, "jieba-rs-MIT.txt")
	for path, body := range map[string]string{
		daemon:           "kgosd",
		lithograph:       "lithograph",
		provider:         "provider",
		jieba:            "jieba",
		notice:           "notice",
		tokenizerLicense: "tokenizer license",
		jiebaLicense:     "jieba license",
	} {
		if err := os.WriteFile(path, []byte(body), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	manifest := runtimeManifest{
		Arch:     runtimePackageArch(runtime.GOARCH),
		Platform: runtime.GOOS,
		Version:  "fixture",
		Go:       "go fixture",
	}
	for _, path := range []string{daemon, lithograph, provider, jieba, notice, tokenizerLicense, jiebaLicense} {
		hash, err := LocalFileSHA256(path)
		if err != nil {
			t.Fatal(err)
		}
		relative, _ := filepath.Rel(root, path)
		manifest.Files = append(manifest.Files, runtimeManifestFile{
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

	pkg, err := DiscoverRuntimePackageFromExecutable(daemon)
	if err != nil {
		t.Fatalf("discover: %v", err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	if pkg.Root != canonicalRoot ||
		pkg.Daemon != filepath.Join(canonicalRoot, filepath.Base(daemon)) ||
		pkg.Lithograph != filepath.Join(canonicalRoot, "extensions", filepath.Base(lithograph)) ||
		pkg.Provider != filepath.Join(canonicalRoot, "extensions", filepath.Base(provider)) ||
		pkg.Jieba != filepath.Join(canonicalRoot, "extensions", filepath.Base(jieba)) ||
		pkg.LithographSHA256 == "" ||
		pkg.ProviderSHA256 == "" ||
		pkg.JiebaSHA256 == "" ||
		pkg.Version != "fixture" {
		t.Fatalf("runtime package = %#v", pkg)
	}
	official := pkg.OfficialExtensions()
	if len(official) != 3 ||
		official[0].Entrypoint != LithographEntrypoint ||
		official[1].Entrypoint != ProviderEntrypoint ||
		official[2].Entrypoint != JiebaEntrypoint {
		t.Fatalf("official extensions = %#v", official)
	}
	if err := os.Remove(jieba); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverRuntimePackageFromExecutable(daemon); err == nil ||
		!strings.Contains(err.Error(), "kgos-jieba") {
		t.Fatalf("missing official Jieba error = %v", err)
	}
	if err := os.WriteFile(jieba, []byte("tampered"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverRuntimePackageFromExecutable(daemon); err == nil ||
		!strings.Contains(err.Error(), "SHA-256") {
		t.Fatalf("tampered official Jieba error = %v", err)
	}
	if err := os.WriteFile(jieba, []byte("jieba"), 0o700); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(provider, []byte("tampered"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverRuntimePackageFromExecutable(daemon); err == nil ||
		!strings.Contains(err.Error(), "SHA-256") {
		t.Fatalf("tampered runtime error = %v", err)
	}
}

func TestDiscoverRuntimePackageRejectsTargetAndManifestErrors(t *testing.T) {
	root := t.TempDir()
	daemon := filepath.Join(root, "kgosd")
	if err := os.WriteFile(daemon, []byte("kgosd"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverRuntimePackageFromExecutable(daemon); err == nil ||
		!strings.Contains(err.Error(), "manifest") {
		t.Fatalf("missing manifest error = %v", err)
	}

	manifest := runtimeManifest{
		Arch:     "wrong",
		Platform: runtime.GOOS,
		Version:  "fixture",
		Go:       "go fixture",
	}
	body, _ := json.Marshal(manifest)
	if err := os.WriteFile(filepath.Join(root, "manifest.json"), body, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := DiscoverRuntimePackageFromExecutable(daemon); err == nil ||
		!strings.Contains(err.Error(), "does not match process") {
		t.Fatalf("target mismatch error = %v", err)
	}
}

func TestRuntimePackagePlatformMappings(t *testing.T) {
	if got := runtimePackagePlatform("windows"); got != "win32" {
		t.Fatalf("windows runtime platform = %q", got)
	}
	if got := runtimePackageArch("amd64"); got != "x64" {
		t.Fatalf("amd64 runtime arch = %q", got)
	}
	if got := runtimePackageArch("arm64"); got != "arm64" {
		t.Fatalf("arm64 runtime arch = %q", got)
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
	for _, unsupported := range []string{"plan9"} {
		if _, err := nativeLibrarySuffix(unsupported); err == nil {
			t.Fatalf("unsupported platform %q did not fail", unsupported)
		}
	}
}
