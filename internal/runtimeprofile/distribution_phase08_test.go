package runtimeprofile

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPhase08RuntimePackageManifestValidationFailures(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(t *testing.T, root string, manifest *runtimeManifest)
		body   func(valid []byte) []byte
		want   string
	}{
		{
			name: "malformed json",
			body: func([]byte) []byte { return []byte("{") },
			want: "decode runtime manifest",
		},
		{
			name: "trailing json",
			body: func(valid []byte) []byte { return append(valid, []byte("{}")...) },
			want: "exactly one JSON object",
		},
		{
			name: "empty version",
			mutate: func(t *testing.T, _ string, manifest *runtimeManifest) {
				t.Helper()
				manifest.Version = ""
			},
			want: "version must be non-empty",
		},
		{
			name: "invalid file entry",
			mutate: func(t *testing.T, _ string, manifest *runtimeManifest) {
				t.Helper()
				manifest.Files[0].File = ""
			},
			want: "invalid file entry",
		},
		{
			name: "invalid sha",
			mutate: func(t *testing.T, _ string, manifest *runtimeManifest) {
				t.Helper()
				manifest.Files[0].SHA256 = strings.Repeat("A", 64)
			},
			want: "invalid sha256",
		},
		{
			name: "duplicate file",
			mutate: func(t *testing.T, _ string, manifest *runtimeManifest) {
				t.Helper()
				manifest.Files[1] = manifest.Files[0]
			},
			want: "duplicate file",
		},
		{
			name: "wrong file count",
			mutate: func(t *testing.T, _ string, manifest *runtimeManifest) {
				t.Helper()
				manifest.Files = manifest.Files[:2]
			},
			want: "exactly the required native files",
		},
		{
			name: "missing required name",
			mutate: func(t *testing.T, _ string, manifest *runtimeManifest) {
				t.Helper()
				manifest.Files[2].File = "extensions/unexpected"
			},
			want: "runtime manifest is missing",
		},
		{
			name: "missing required payload",
			mutate: func(t *testing.T, root string, manifest *runtimeManifest) {
				t.Helper()
				path := filepath.Join(root, filepath.FromSlash(manifest.Files[2].File))
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
			},
			want: "verify runtime file",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			root, daemon, manifest := phase08RuntimePackageFixture(t)
			if test.mutate != nil {
				test.mutate(t, root, &manifest)
			}
			valid, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			body := append(valid, '\n')
			if test.body != nil {
				body = test.body(valid)
			}
			if err := os.WriteFile(filepath.Join(root, "manifest.json"), body, 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := DiscoverRuntimePackageFromExecutable(daemon); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want substring %q", err, test.want)
			}
		})
	}
}

func phase08RuntimePackageFixture(t *testing.T) (string, string, runtimeManifest) {
	t.Helper()
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
	paths := []string{
		daemon,
		filepath.Join(extensions, "lithograph"+librarySuffix),
		filepath.Join(extensions, "lithograph-openai-compatible"+librarySuffix),
	}
	for index, path := range paths {
		if err := os.WriteFile(path, []byte{byte(index + 1)}, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	manifest := runtimeManifest{
		Arch:     runtimePackageArch(runtime.GOARCH),
		Platform: runtime.GOOS,
		Version:  "fixture",
	}
	for _, path := range paths {
		hash, err := LocalFileSHA256(path)
		if err != nil {
			t.Fatal(err)
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			t.Fatal(err)
		}
		manifest.Files = append(manifest.Files, runtimeManifestFile{
			File: filepath.ToSlash(relative), SHA256: hash,
		})
	}
	return root, daemon, manifest
}
