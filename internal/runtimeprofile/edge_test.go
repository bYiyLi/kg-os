package runtimeprofile

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestArchiveValidationAndLimits(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name string
		path string
		ok   bool
	}{
		{name: "valid", path: "lib/extension.so", ok: true},
		{name: "directory", path: "lib/", ok: true},
		{name: "empty", path: ""},
		{name: "root", path: "/"},
		{name: "absolute", path: "/tmp/extension.so"},
		{name: "backslash", path: "lib\\extension.so"},
		{name: "dot", path: "lib/./extension.so"},
		{name: "dotdot", path: "lib/../extension.so"},
		{name: "empty component", path: "lib//extension.so"},
	} {
		t.Run(test.name, func(t *testing.T) {
			name, err := validateArchiveEntry(test.path)
			if test.ok {
				if err != nil || name == "" {
					t.Fatalf("valid archive path %q = %q, %v", test.path, name, err)
				}
				return
			}
			if err == nil {
				t.Fatalf("unsafe archive path %q was accepted as %q", test.path, name)
			}
		})
	}

	limits := ResolverLimits{
		MaxDownloadBytes:  1024,
		MaxExtractBytes:   6,
		MaxFileBytes:      5,
		MaxArchiveEntries: 1,
	}
	root := t.TempDir()
	if err := extractZip([]byte("not-a-zip"), root, limits); err == nil {
		t.Fatal("malformed zip was accepted")
	}
	if err := extractTarGz([]byte("not-a-gzip"), root, limits); err == nil {
		t.Fatal("malformed tar.gz was accepted")
	}

	twoZip := makeZip(t, []zipFixture{
		{name: "one", body: "1", mode: 0o600},
		{name: "two", body: "2", mode: 0o600},
	})
	if err := extractZip(twoZip, t.TempDir(), limits); err == nil ||
		!strings.Contains(err.Error(), "entries") {
		t.Fatalf("zip entry limit error = %v", err)
	}
	duplicateZip := makeZip(t, []zipFixture{
		{name: "same", body: "1", mode: 0o600},
		{name: "same", body: "2", mode: 0o600},
	})
	duplicateLimits := limits
	duplicateLimits.MaxArchiveEntries = 3
	if err := extractZip(duplicateZip, t.TempDir(), duplicateLimits); err == nil ||
		!strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("zip duplicate error = %v", err)
	}
	overflowZip := makeZip(t, []zipFixture{
		{name: "one", body: "1234", mode: 0o600},
		{name: "two", body: "5678", mode: 0o600},
	})
	overflowLimits := duplicateLimits
	overflowLimits.MaxExtractBytes = 7
	if err := extractZip(overflowZip, t.TempDir(), overflowLimits); err == nil ||
		!strings.Contains(err.Error(), "extracted-size") {
		t.Fatalf("zip extracted-size error = %v", err)
	}

	twoTar := makeTarGz(t, []tarFixture{
		{name: "one", body: "1", typeflag: tar.TypeReg, mode: 0o600},
		{name: "two", body: "2", typeflag: tar.TypeReg, mode: 0o600},
	})
	if err := extractTarGz(twoTar, t.TempDir(), limits); err == nil ||
		!strings.Contains(err.Error(), "entries") {
		t.Fatalf("tar entry limit error = %v", err)
	}
	duplicateTar := makeTarGz(t, []tarFixture{
		{name: "same", body: "1", typeflag: tar.TypeReg, mode: 0o600},
		{name: "same", body: "2", typeflag: tar.TypeReg, mode: 0o600},
	})
	if err := extractTarGz(duplicateTar, t.TempDir(), duplicateLimits); err == nil ||
		!strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("tar duplicate error = %v", err)
	}
	overflowTar := makeTarGz(t, []tarFixture{
		{name: "one", body: "1234", typeflag: tar.TypeReg, mode: 0o600},
		{name: "two", body: "5678", typeflag: tar.TypeReg, mode: 0o600},
	})
	if err := extractTarGz(overflowTar, t.TempDir(), overflowLimits); err == nil ||
		!strings.Contains(err.Error(), "extracted-size") {
		t.Fatalf("tar extracted-size error = %v", err)
	}
}

func TestArchiveWriteFailures(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := writeArchiveStream(root, "large", strings.NewReader("12345"), 4); err == nil ||
		!strings.Contains(err.Error(), "file limit") {
		t.Fatalf("archive stream limit error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "existing"), []byte("x"), 0o600); err != nil {
		t.Fatalf("write existing archive target: %v", err)
	}
	if err := writeArchiveStream(root, "existing", strings.NewReader("x"), 4); err == nil ||
		!strings.Contains(err.Error(), "create extension archive entry") {
		t.Fatalf("archive existing-target error = %v", err)
	}
	if err := writeArchiveStream(root, "reader-error", errorReader{}, 4); err == nil ||
		!strings.Contains(err.Error(), "extract extension archive entry") {
		t.Fatalf("archive reader error = %v", err)
	}
	blocking := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocking, []byte("x"), 0o600); err != nil {
		t.Fatalf("write blocking parent: %v", err)
	}
	if err := writeArchiveStream(blocking, "child", strings.NewReader("x"), 4); err == nil ||
		!strings.Contains(err.Error(), "parent directory") {
		t.Fatalf("archive parent error = %v", err)
	}
}

func TestResolverIOAndCacheHelpers(t *testing.T) {
	t.Parallel()
	if _, err := readRegularFile(filepath.Join(t.TempDir(), "missing"), 10); err == nil {
		t.Fatal("missing local extension was accepted")
	}
	if _, err := readRegularFile(t.TempDir(), 10); err == nil ||
		!strings.Contains(err.Error(), "regular file") {
		t.Fatalf("directory extension error = %v", err)
	}
	large := filepath.Join(t.TempDir(), "large")
	if err := os.WriteFile(large, []byte("12345"), 0o600); err != nil {
		t.Fatalf("write large extension: %v", err)
	}
	if _, err := readRegularFile(large, 4); err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("local extension limit error = %v", err)
	}

	notFoundClient := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(strings.NewReader("missing")),
			Header:     make(http.Header),
		}, nil
	})}
	if _, err := readSource(context.Background(), "https://example.test/missing", true, notFoundClient, 10); err == nil ||
		!strings.Contains(err.Error(), "HTTP 404") {
		t.Fatalf("remote HTTP error = %v", err)
	}
	readErrorClient := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(errorReader{}),
			Header:     make(http.Header),
		}, nil
	})}
	if _, err := readSource(context.Background(), "https://example.test/error", true, readErrorClient, 10); err == nil ||
		!strings.Contains(err.Error(), "read extension response") {
		t.Fatalf("remote read error = %v", err)
	}
	networkClient := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("network down")
	})}
	if _, err := readSource(context.Background(), "https://example.test/error", true, networkClient, 10); err == nil ||
		!strings.Contains(err.Error(), "download extension") {
		t.Fatalf("remote network error = %v", err)
	}

	redirectSentinel := errors.New("custom redirect")
	baseClient := &http.Client{
		Timeout: time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return redirectSentinel
		},
	}
	bounded := boundedHTTPSClient(baseClient)
	request, _ := http.NewRequest(http.MethodGet, "https://example.test/next", nil)
	if err := bounded.CheckRedirect(request, []*http.Request{{}}); !errors.Is(err, redirectSentinel) {
		t.Fatalf("custom redirect error = %v", err)
	}
	if bounded.Timeout != time.Second {
		t.Fatalf("custom timeout = %s", bounded.Timeout)
	}
	if boundedHTTPSClient(nil).Timeout != 60*time.Second {
		t.Fatal("default resolver client timeout was not applied")
	}
	chunkedOverflow := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode:    http.StatusOK,
			ContentLength: -1,
			Body:          io.NopCloser(strings.NewReader("123456")),
			Header:        make(http.Header),
		}, nil
	})}
	if _, err := readSource(
		context.Background(),
		"https://example.test/overflow",
		true,
		chunkedOverflow,
		5,
	); err == nil || !strings.Contains(err.Error(), "download exceeds") {
		t.Fatalf("chunked overflow error = %v", err)
	}
	if _, err := readSource(
		context.Background(),
		"://",
		true,
		nil,
		10,
	); err == nil || !strings.Contains(err.Error(), "create extension request") {
		t.Fatalf("invalid request URL error = %v", err)
	}

	root := t.TempDir()
	if _, ok := safeCachedPath(root, ""); ok {
		t.Fatal("empty cached path was accepted")
	}
	if _, ok := safeCachedPath(root, filepath.Join(root, "absolute")); ok {
		t.Fatal("absolute cached path was accepted")
	}
	if _, ok := safeCachedPath(root, "../outside"); ok {
		t.Fatal("traversal cached path was accepted")
	}
	if path, ok := safeCachedPath(root, "payload/file"); !ok ||
		path != filepath.Join(root, "payload", "file") {
		t.Fatalf("safe cached path = %q, %v", path, ok)
	}
	if equalHashes(map[string]string{"a": "1"}, map[string]string{"a": "2"}) {
		t.Fatal("different hashes were equal")
	}
	if equalHashes(map[string]string{"a": "1"}, map[string]string{"a": "1", "b": "2"}) {
		t.Fatal("different hash-map sizes were equal")
	}
	if !equalHashes(map[string]string{"a": "1"}, map[string]string{"a": "1"}) {
		t.Fatal("identical hashes were not equal")
	}

	writePath := filepath.Join(root, "once")
	if err := writeFileSync(writePath, []byte("value"), 0o600); err != nil {
		t.Fatalf("writeFileSync: %v", err)
	}
	if err := writeFileSync(writePath, []byte("again"), 0o600); err == nil {
		t.Fatal("writeFileSync overwrote an existing file")
	}
	if name := canonicalDirectLibraryName(); name == "" || !strings.HasPrefix(name, "extension.") {
		t.Fatalf("canonical direct library name = %q on %s", name, runtime.GOOS)
	}
}

func TestPublishArtifactAndCacheIntegrityFailures(t *testing.T) {
	limits := ResolverLimits{
		MaxDownloadBytes:  1 << 20,
		MaxExtractBytes:   1 << 20,
		MaxFileBytes:      1 << 20,
		MaxArchiveEntries: 100,
	}

	t.Run("cache directory is a file", func(t *testing.T) {
		cachePath := filepath.Join(t.TempDir(), "extensions")
		if err := os.WriteFile(cachePath, []byte("file"), 0o600); err != nil {
			t.Fatalf("write cache blocker: %v", err)
		}
		if _, err := publishArtifact(
			cachePath,
			"fixture.so",
			"",
			hashBytes([]byte("fixture")),
			[]byte("fixture"),
			limits,
		); err == nil || !strings.Contains(err.Error(), "extensions cache") {
			t.Fatalf("cache-directory error = %v", err)
		}
	})

	for _, test := range []struct {
		name       string
		sourcePath string
		library    string
		body       []byte
		want       string
	}{
		{
			name:       "invalid zip",
			sourcePath: "bundle.zip",
			library:    "fixture.so",
			body:       []byte("not zip"),
			want:       "zip archive",
		},
		{
			name:       "invalid tar",
			sourcePath: "bundle.tar.gz",
			library:    "fixture.so",
			body:       []byte("not gzip"),
			want:       "tar.gz archive",
		},
		{
			name:       "missing archive library",
			sourcePath: "bundle.zip",
			library:    "missing.so",
			body: makeZip(t, []zipFixture{{
				name: "other.so",
				body: "other",
				mode: 0o600,
			}}),
			want: "is missing",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := publishArtifact(
				t.TempDir(),
				test.sourcePath,
				test.library,
				hashBytes(test.body),
				test.body,
				limits,
			); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("publish error = %v, want %q", err, test.want)
			}
		})
	}

	prepare := func(t *testing.T) (string, string, string) {
		t.Helper()
		extensionsDir := t.TempDir()
		body := []byte("direct-extension")
		hash := hashBytes(body)
		library, err := publishArtifact(
			extensionsDir,
			"fixture.so",
			"",
			hash,
			body,
			limits,
		)
		if err != nil {
			t.Fatalf("prepare cache: %v", err)
		}
		return extensionsDir, hash, library
	}

	t.Run("valid direct cache", func(t *testing.T) {
		extensionsDir, hash, library := prepare(t)
		cached, ok := loadCachedArtifact(extensionsDir, hash, "fixture.so", "", limits)
		if !ok || cached.Library != library || cached.SHA256 != hash {
			t.Fatalf("valid cache = %#v, %v", cached, ok)
		}
	})

	t.Run("read-only cached remote inspection", func(t *testing.T) {
		extensionsDir, hash, _ := prepare(t)
		paths := Paths{ExtensionsDir: extensionsDir}
		config := ExtensionConfig{
			Source:     "https://example.test/fixture.so",
			Entrypoint: "sqlite3_fixture_init",
			SHA256:     hash,
		}
		ready, err := CachedExtensionReady(paths, config)
		if err != nil || !ready {
			t.Fatalf("cached remote ready=%v err=%v", ready, err)
		}
		if err := os.WriteFile(
			filepath.Join(extensionsDir, hash, "artifact"),
			[]byte("corrupt"),
			0o600,
		); err != nil {
			t.Fatal(err)
		}
		ready, err = CachedExtensionReady(paths, config)
		if err != nil || ready {
			t.Fatalf("corrupt cached remote ready=%v err=%v", ready, err)
		}
		config.Source = "relative.so"
		if _, err := CachedExtensionReady(paths, config); err == nil {
			t.Fatal("invalid cached extension config was accepted")
		}
		config = ExtensionConfig{
			Source:     filepath.Join(t.TempDir(), "local.so"),
			Entrypoint: "sqlite3_fixture_init",
		}
		ready, err = CachedExtensionReady(paths, config)
		if err != nil || ready {
			t.Fatalf("local source cached readiness = %v, %v", ready, err)
		}
	})

	t.Run("empty hash", func(t *testing.T) {
		if _, ok := loadCachedArtifact(t.TempDir(), "", "fixture.so", "", limits); ok {
			t.Fatal("empty cache hash was accepted")
		}
	})

	t.Run("missing manifest", func(t *testing.T) {
		if _, ok := loadCachedArtifact(
			t.TempDir(),
			strings.Repeat("0", 64),
			"fixture.so",
			"",
			limits,
		); ok {
			t.Fatal("missing cache manifest was accepted")
		}
	})

	t.Run("malformed manifest", func(t *testing.T) {
		extensionsDir, hash, _ := prepare(t)
		if err := os.WriteFile(
			filepath.Join(extensionsDir, hash, "manifest.json"),
			[]byte("{"),
			0o600,
		); err != nil {
			t.Fatalf("corrupt manifest: %v", err)
		}
		if _, ok := loadCachedArtifact(extensionsDir, hash, "fixture.so", "", limits); ok {
			t.Fatal("malformed cache manifest was accepted")
		}
	})

	t.Run("corrupt artifact", func(t *testing.T) {
		extensionsDir, hash, _ := prepare(t)
		if err := os.WriteFile(
			filepath.Join(extensionsDir, hash, "artifact"),
			[]byte("corrupt"),
			0o600,
		); err != nil {
			t.Fatalf("corrupt artifact: %v", err)
		}
		if _, ok := loadCachedArtifact(extensionsDir, hash, "fixture.so", "", limits); ok {
			t.Fatal("corrupt cached artifact was accepted")
		}
	})

	t.Run("corrupt payload", func(t *testing.T) {
		extensionsDir, hash, library := prepare(t)
		if err := os.WriteFile(library, []byte("corrupt"), 0o600); err != nil {
			t.Fatalf("corrupt payload: %v", err)
		}
		if _, ok := loadCachedArtifact(extensionsDir, hash, "fixture.so", "", limits); ok {
			t.Fatal("corrupt cache payload was accepted")
		}
	})

	t.Run("requested archive library absent", func(t *testing.T) {
		extensionsDir, hash, _ := prepare(t)
		if _, ok := loadCachedArtifact(
			extensionsDir,
			hash,
			"bundle.zip",
			"missing.so",
			limits,
		); ok {
			t.Fatal("cache accepted a library absent from the manifest")
		}
	})
}

func TestResolveExtensionRejectsInvalidConfigBeforeIO(t *testing.T) {
	paths := testProfilePaths(t)
	_, err := resolveExtension(
		context.Background(),
		paths,
		ExtensionConfig{Source: "relative.so", Entrypoint: "init"},
		nil,
		ResolverLimits{
			MaxDownloadBytes:  1,
			MaxExtractBytes:   1,
			MaxFileBytes:      1,
			MaxArchiveEntries: 1,
		},
	)
	if err == nil || !strings.Contains(err.Error(), "absolute local") {
		t.Fatalf("invalid extension config error = %v", err)
	}
}

func TestHashPayloadLimitsAndCorruption(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	payload := filepath.Join(root, "payload")
	if err := os.Mkdir(payload, 0o700); err != nil {
		t.Fatalf("mkdir payload: %v", err)
	}
	limits := ResolverLimits{
		MaxDownloadBytes:  100,
		MaxExtractBytes:   100,
		MaxFileBytes:      100,
		MaxArchiveEntries: 1,
	}
	if err := os.WriteFile(filepath.Join(payload, "one"), []byte("1"), 0o600); err != nil {
		t.Fatalf("write payload one: %v", err)
	}
	if err := os.WriteFile(filepath.Join(payload, "two"), []byte("2"), 0o600); err != nil {
		t.Fatalf("write payload two: %v", err)
	}
	if _, err := hashPayloadFiles(root, payload, limits); err == nil ||
		!strings.Contains(err.Error(), "files") {
		t.Fatalf("payload entry limit error = %v", err)
	}
	limits.MaxArchiveEntries = 10
	limits.MaxFileBytes = 0
	if _, err := hashPayloadFiles(root, payload, limits); err == nil ||
		!strings.Contains(err.Error(), "file limit") {
		t.Fatalf("payload file limit error = %v", err)
	}
	limits.MaxFileBytes = 100
	limits.MaxExtractBytes = 1
	if _, err := hashPayloadFiles(root, payload, limits); err == nil ||
		!strings.Contains(err.Error(), "extracted-size") {
		t.Fatalf("payload extracted-size error = %v", err)
	}
	limits.MaxExtractBytes = 100
	if err := os.Remove(filepath.Join(payload, "two")); err != nil {
		t.Fatalf("remove payload two: %v", err)
	}
	if err := os.Symlink("one", filepath.Join(payload, "link")); err == nil {
		if _, err := hashPayloadFiles(root, payload, limits); err == nil ||
			!strings.Contains(err.Error(), "non-regular") {
			t.Fatalf("payload symlink error = %v", err)
		}
	}
	if _, err := hashPayloadFiles(root, filepath.Join(root, "missing"), limits); err == nil {
		t.Fatal("missing payload directory was accepted")
	}
}

func TestCredentialAndLockFailurePaths(t *testing.T) {
	t.Parallel()
	parent := t.TempDir()
	missingParent := filepath.Join(parent, "missing", "auth.json")
	if _, err := createCredential(missingParent, strings.NewReader(strings.Repeat("x", credentialEntropyBytes))); err == nil ||
		!strings.Contains(err.Error(), "temporary file") {
		t.Fatalf("credential missing-parent error = %v", err)
	}
	existing := filepath.Join(parent, "auth.json")
	if err := os.WriteFile(existing, []byte("{}"), 0o600); err != nil {
		t.Fatalf("write existing auth: %v", err)
	}
	if _, err := createCredential(existing, strings.NewReader(strings.Repeat("x", credentialEntropyBytes))); err == nil ||
		!strings.Contains(err.Error(), "appeared") {
		t.Fatalf("credential existing-target error = %v", err)
	}
	if err := syncDirectory(filepath.Join(parent, "missing")); err == nil ||
		!strings.Contains(err.Error(), "open runtime directory") {
		t.Fatalf("sync missing directory error = %v", err)
	}

	paths := testProfilePaths(t)
	lock, err := AcquireLock(paths.Lock)
	if err != nil {
		t.Fatalf("acquire lock: %v", err)
	}
	if err := lock.PublishEndpoint(""); err == nil {
		t.Fatal("empty endpoint was published")
	}
	if err := lock.Close(); err != nil {
		t.Fatalf("close lock: %v", err)
	}
	if _, err := lock.Endpoint(); !errors.Is(err, os.ErrClosed) {
		t.Fatalf("closed endpoint error = %v", err)
	}
	if err := lock.PublishEndpoint("http://127.0.0.1:1"); !errors.Is(err, os.ErrClosed) {
		t.Fatalf("closed publish error = %v", err)
	}

	directoryLockPath := t.TempDir()
	if _, err := AcquireLock(directoryLockPath); err == nil ||
		!strings.Contains(err.Error(), "open kgosd.lock") {
		t.Fatalf("directory lock error = %v", err)
	}
	closedFile, err := os.CreateTemp(t.TempDir(), "lock")
	if err != nil {
		t.Fatalf("create lock fd: %v", err)
	}
	if err := closedFile.Close(); err != nil {
		t.Fatalf("close lock fd: %v", err)
	}
	broken := &InstanceLock{file: closedFile}
	if _, err := broken.Endpoint(); err == nil {
		t.Fatal("closed lock file endpoint succeeded")
	}
	if err := broken.replace([]byte("x")); err == nil {
		t.Fatal("closed lock file replace succeeded")
	}
	if err := tryFileLock(closedFile); err == nil {
		t.Fatal("locked a closed file descriptor")
	}
	if err := unlockFile(closedFile); err == nil {
		t.Fatal("unlocked a closed file descriptor")
	}
}

func TestAdditionalConfigFailures(t *testing.T) {
	paths := testProfilePaths(t)
	extension := filepath.Join(t.TempDir(), "extension.so")
	if err := os.WriteFile(extension, []byte("extension"), 0o600); err != nil {
		t.Fatalf("write extension fixture: %v", err)
	}
	valid := completeRuntimeConfig(
		"[[sqlite.extensions]]\nsource = "+quoteTOML(extension)+"\nentrypoint = \"init\"",
		"",
	)
	for _, test := range []struct {
		name string
		body string
		want string
	}{
		{name: "zero cache", body: strings.Replace(valid, "max_size_mb = 4096", "max_size_mb = 0", 1), want: "cache.max_size_mb"},
		{name: "cache size overflow", body: strings.Replace(valid, "max_size_mb = 4096", "max_size_mb = 9223372036854775807", 1), want: "supported range"},
		{name: "empty analyzer", body: strings.Replace(valid, "analyzer = \"unicode61\"", "analyzer = \" \"", 1), want: "fulltext.analyzer"},
		{name: "empty entrypoint", body: strings.Replace(valid, "entrypoint = \"init\"", "entrypoint = \"\"", 1), want: "entrypoint"},
		{name: "http extension", body: strings.Replace(valid, quoteTOML(extension), "\"http://example.test/x.so\"", 1), want: "https"},
		{name: "empty model", body: strings.Replace(valid, "model = \"fixture\"", "model = \"\"", 1), want: "embedding.model"},
		{name: "dimensions high", body: strings.Replace(valid, "dimensions = 8", "dimensions = 4097", 1), want: "dimensions"},
		{name: "whitespace env", body: strings.Replace(valid, "api_key_env = \"\"", "api_key_env = \" \"", 1), want: "api_key_env"},
		{name: "ftp base", body: strings.Replace(valid, "https://example.test/v1", "ftp://example.test/v1", 1), want: "HTTP(S)"},
	} {
		t.Run(test.name, func(t *testing.T) {
			writeConfig(t, paths, test.body)
			if _, err := LoadConfig(paths, func(string) (string, bool) { return "value", true }); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("config error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestEnsureDirectoriesRejectsFileHome(t *testing.T) {
	parent := t.TempDir()
	home := filepath.Join(parent, "home")
	if err := os.WriteFile(home, []byte("file"), 0o600); err != nil {
		t.Fatalf("write home fixture: %v", err)
	}
	paths, err := ResolvePaths(home)
	if err != nil {
		t.Fatalf("resolve file home: %v", err)
	}
	if err := EnsureDirectories(paths); err == nil || !strings.Contains(err.Error(), "runtime directory") {
		t.Fatalf("file home ensure error = %v", err)
	}
}

func TestZipDirectoryAndTarDirectoryExtraction(t *testing.T) {
	limits := ResolverLimits{
		MaxDownloadBytes:  1024,
		MaxExtractBytes:   1024,
		MaxFileBytes:      1024,
		MaxArchiveEntries: 10,
	}
	zipBody := makeZip(t, []zipFixture{
		{name: "lib/", mode: os.ModeDir | 0o700},
		{name: "lib/file", body: "value", mode: 0o600},
	})
	zipRoot := t.TempDir()
	if err := extractZip(zipBody, zipRoot, limits); err != nil {
		t.Fatalf("extract zip directory: %v", err)
	}
	if body, err := os.ReadFile(filepath.Join(zipRoot, "lib", "file")); err != nil || !bytes.Equal(body, []byte("value")) {
		t.Fatalf("zip extracted body = %q err=%v", body, err)
	}

	tarBody := makeTarGz(t, []tarFixture{
		{name: "lib/", typeflag: tar.TypeDir, mode: 0o700},
		{name: "lib/file", body: "value", typeflag: tar.TypeReg, mode: 0o600},
	})
	tarRoot := t.TempDir()
	if err := extractTarGz(tarBody, tarRoot, limits); err != nil {
		t.Fatalf("extract tar directory: %v", err)
	}
	if body, err := os.ReadFile(filepath.Join(tarRoot, "lib", "file")); err != nil || !bytes.Equal(body, []byte("value")) {
		t.Fatalf("tar extracted body = %q err=%v", body, err)
	}
}

func TestValidateLibraryPathRejectsUnsafeForms(t *testing.T) {
	for _, test := range []struct {
		name string
		path string
	}{
		{name: "empty", path: ""},
		{name: "absolute", path: filepath.Join(string(filepath.Separator), "tmp", "extension.so")},
		{name: "backslash", path: "lib\\extension.so"},
		{name: "dot", path: "lib/./extension.so"},
		{name: "dotdot", path: "lib/../extension.so"},
		{name: "empty component", path: "lib//extension.so"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := validateLibraryPath(test.path); err == nil {
				t.Fatalf("unsafe archive library path %q was accepted", test.path)
			}
		})
	}
	if err := validateLibraryPath("lib/extension.so"); err != nil {
		t.Fatalf("valid archive library path rejected: %v", err)
	}
}

func TestRuntimeProfileRejectsMissingHomeAndNULConfig(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Setenv("HOME", "")
		if _, err := ResolvePaths(""); err == nil || !strings.Contains(err.Error(), "user home") {
			t.Fatalf("missing HOME error = %v", err)
		}
	}

	if _, _, err := validateAndClassifyExtensionConfig(&ExtensionConfig{
		Source:     "bad\x00source",
		Entrypoint: "init",
	}); err == nil || !strings.Contains(err.Error(), "source") {
		t.Fatalf("NUL source error = %v", err)
	}
	if _, _, err := validateAndClassifyExtensionConfig(&ExtensionConfig{
		Source:     filepath.Join(t.TempDir(), "extension.so"),
		Entrypoint: "bad\x00entrypoint",
	}); err == nil || !strings.Contains(err.Error(), "entrypoint") {
		t.Fatalf("NUL entrypoint error = %v", err)
	}
}

var _ = zip.Store
