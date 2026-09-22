package runtimeprofile

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestResolveExtensionsLocalDirectUsesImmutableCache(t *testing.T) {
	paths := testProfilePaths(t)
	source := filepath.Join(t.TempDir(), "fixture.so")
	if err := os.WriteFile(source, []byte("version-one"), 0o600); err != nil {
		t.Fatalf("write local extension: %v", err)
	}
	resolved, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{{
		Source:     source,
		Entrypoint: "sqlite3_fixture_init",
	}}, nil)
	if err != nil {
		t.Fatalf("resolve extension: %v", err)
	}
	if len(resolved) != 1 || resolved[0].SHA256 != hashBytes([]byte("version-one")) {
		t.Fatalf("resolved = %#v", resolved)
	}
	if resolved[0].Library == source ||
		!strings.HasPrefix(resolved[0].Library, filepath.Join(paths.ExtensionsDir, resolved[0].SHA256)) {
		t.Fatalf("library was not resolved into content cache: %q", resolved[0].Library)
	}
	if err := os.WriteFile(source, []byte("version-two"), 0o600); err != nil {
		t.Fatalf("replace source: %v", err)
	}
	content, err := os.ReadFile(resolved[0].Library)
	if err != nil {
		t.Fatalf("read resolved library: %v", err)
	}
	if string(content) != "version-one" {
		t.Fatalf("resolved artifact changed with source: %q", content)
	}
}

func TestResolveExtensionsLocalHashMismatch(t *testing.T) {
	paths := testProfilePaths(t)
	source := filepath.Join(t.TempDir(), "fixture.so")
	if err := os.WriteFile(source, []byte("fixture"), 0o600); err != nil {
		t.Fatalf("write local extension: %v", err)
	}
	_, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{{
		Source:     source,
		Entrypoint: "init",
		SHA256:     strings.Repeat("0", 64),
	}}, nil)
	if err == nil || !strings.Contains(err.Error(), "SHA-256 mismatch") {
		t.Fatalf("error = %v", err)
	}
}

func TestResolveExtensionsArchiveSupportsMultipleExactLibraries(t *testing.T) {
	paths := testProfilePaths(t)
	body := makeZip(t, []zipFixture{
		{name: "lib/one.so", body: "one", mode: 0o600},
		{name: "lib/two.so", body: "two", mode: 0o600},
	})
	source := filepath.Join(t.TempDir(), "bundle.zip")
	if err := os.WriteFile(source, body, 0o600); err != nil {
		t.Fatalf("write zip fixture: %v", err)
	}
	resolved, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{
		{Source: source, Library: "lib/one.so", Entrypoint: "one_init"},
		{Source: source, Library: "lib/two.so", Entrypoint: "two_init"},
	}, nil)
	if err != nil {
		t.Fatalf("resolve archive: %v", err)
	}
	if len(resolved) != 2 || resolved[0].SHA256 != resolved[1].SHA256 {
		t.Fatalf("resolved = %#v", resolved)
	}
	for index, want := range []string{"one", "two"} {
		content, err := os.ReadFile(resolved[index].Library)
		if err != nil {
			t.Fatalf("read resolved library %d: %v", index, err)
		}
		if string(content) != want {
			t.Fatalf("library %d = %q, want %q", index, content, want)
		}
	}
}

func TestResolveExtensionsTarGz(t *testing.T) {
	paths := testProfilePaths(t)
	body := makeTarGz(t, []tarFixture{
		{name: "lib/", typeflag: tar.TypeDir, mode: 0o700},
		{name: "lib/fixture.so", body: "fixture", typeflag: tar.TypeReg, mode: 0o600},
	})
	source := filepath.Join(t.TempDir(), "bundle.tar.gz")
	if err := os.WriteFile(source, body, 0o600); err != nil {
		t.Fatalf("write tar fixture: %v", err)
	}
	resolved, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{{
		Source:     source,
		Library:    "lib/fixture.so",
		Entrypoint: "init",
	}}, nil)
	if err != nil {
		t.Fatalf("resolve tar.gz: %v", err)
	}
	content, err := os.ReadFile(resolved[0].Library)
	if err != nil || string(content) != "fixture" {
		t.Fatalf("resolved tar library = %q, err = %v", content, err)
	}
}

func TestResolveExtensionsRejectsUnsafeArchives(t *testing.T) {
	tests := []struct {
		name       string
		filename   string
		body       func(*testing.T) []byte
		library    string
		wantSubstr string
	}{
		{
			name:     "zip traversal",
			filename: "bad.zip",
			body: func(t *testing.T) []byte {
				return makeZip(t, []zipFixture{{name: "../outside.so", body: "bad", mode: 0o600}})
			},
			library:    "outside.so",
			wantSubstr: "unsafe path",
		},
		{
			name:     "zip symlink",
			filename: "bad.zip",
			body: func(t *testing.T) []byte {
				return makeZip(t, []zipFixture{{
					name: "fixture.so",
					body: "target",
					mode: os.ModeSymlink | 0o777,
				}})
			},
			library:    "fixture.so",
			wantSubstr: "non-regular",
		},
		{
			name:     "tar hardlink",
			filename: "bad.tar.gz",
			body: func(t *testing.T) []byte {
				return makeTarGz(t, []tarFixture{{
					name:     "fixture.so",
					typeflag: tar.TypeLink,
					linkname: "other.so",
				}})
			},
			library:    "fixture.so",
			wantSubstr: "unsupported entry",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			paths := testProfilePaths(t)
			source := filepath.Join(t.TempDir(), test.filename)
			if err := os.WriteFile(source, test.body(t), 0o600); err != nil {
				t.Fatalf("write archive fixture: %v", err)
			}
			_, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{{
				Source:     source,
				Library:    test.library,
				Entrypoint: "init",
			}}, nil)
			if err == nil || !strings.Contains(err.Error(), test.wantSubstr) {
				t.Fatalf("error = %v, want %q", err, test.wantSubstr)
			}
		})
	}
}

func TestResolveExtensionsRejectsMissingLibraryAndResourceOverflow(t *testing.T) {
	paths := testProfilePaths(t)
	body := makeZip(t, []zipFixture{{name: "fixture.so", body: "12345", mode: 0o600}})
	source := filepath.Join(t.TempDir(), "bundle.zip")
	if err := os.WriteFile(source, body, 0o600); err != nil {
		t.Fatalf("write archive fixture: %v", err)
	}
	_, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{{
		Source:     source,
		Library:    "missing.so",
		Entrypoint: "init",
	}}, nil)
	if err == nil || !strings.Contains(err.Error(), "is missing") {
		t.Fatalf("missing library error = %v", err)
	}

	limits := ResolverLimits{
		MaxDownloadBytes:  int64(len(body) + 1),
		MaxExtractBytes:   100,
		MaxFileBytes:      4,
		MaxArchiveEntries: 10,
	}
	_, err = resolveExtensions(context.Background(), paths, []ExtensionConfig{{
		Source:     source,
		Library:    "fixture.so",
		Entrypoint: "init",
	}}, nil, limits)
	if err == nil || !strings.Contains(err.Error(), "file limit") {
		t.Fatalf("resource limit error = %v", err)
	}
}

func TestResolveExtensionsHTTPSAndOfflineCache(t *testing.T) {
	paths := testProfilePaths(t)
	body := []byte("remote-extension")
	requests := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		requests++
		_, _ = writer.Write(body)
	}))
	config := ExtensionConfig{
		Source:     server.URL + "/fixture.so",
		Entrypoint: "init",
		SHA256:     hashBytes(body),
	}
	resolved, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{config}, server.Client())
	if err != nil {
		server.Close()
		t.Fatalf("resolve remote extension: %v", err)
	}
	if requests != 1 {
		server.Close()
		t.Fatalf("requests = %d, want 1", requests)
	}
	server.Close()

	failingClient := &http.Client{
		Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("network must not be used")
		}),
	}
	cached, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{config}, failingClient)
	if err != nil {
		t.Fatalf("resolve cached remote extension offline: %v", err)
	}
	if cached[0].Library != resolved[0].Library {
		t.Fatalf("cached library = %q, original = %q", cached[0].Library, resolved[0].Library)
	}
}

func TestResolveExtensionsRepairsCorruptRemoteCache(t *testing.T) {
	paths := testProfilePaths(t)
	body := []byte("remote-extension")
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	config := ExtensionConfig{
		Source:     server.URL + "/fixture.so",
		Entrypoint: "init",
		SHA256:     hashBytes(body),
	}
	resolved, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{config}, server.Client())
	if err != nil {
		t.Fatalf("initial resolve: %v", err)
	}
	if err := os.WriteFile(resolved[0].Library, []byte("corrupt"), 0o600); err != nil {
		t.Fatalf("corrupt cached library: %v", err)
	}
	repaired, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{config}, server.Client())
	if err != nil {
		t.Fatalf("repair cache: %v", err)
	}
	content, err := os.ReadFile(repaired[0].Library)
	if err != nil || !bytes.Equal(content, body) {
		t.Fatalf("repaired content = %q, err = %v", content, err)
	}
}

func TestResolveExtensionsRepairsCorruptArchiveSibling(t *testing.T) {
	paths := testProfilePaths(t)
	body := makeZip(t, []zipFixture{
		{name: "lib/fixture.so", body: "library", mode: 0o600},
		{name: "lib/runtime.dat", body: "runtime-data", mode: 0o600},
	})
	source := filepath.Join(t.TempDir(), "bundle.zip")
	if err := os.WriteFile(source, body, 0o600); err != nil {
		t.Fatalf("write archive fixture: %v", err)
	}
	config := ExtensionConfig{
		Source:     source,
		Library:    "lib/fixture.so",
		Entrypoint: "init",
	}
	resolved, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{config}, nil)
	if err != nil {
		t.Fatalf("initial archive resolve: %v", err)
	}
	sibling := filepath.Join(filepath.Dir(resolved[0].Library), "runtime.dat")
	if err := os.WriteFile(sibling, []byte("corrupt"), 0o600); err != nil {
		t.Fatalf("corrupt archive sibling: %v", err)
	}
	if _, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{config}, nil); err != nil {
		t.Fatalf("repair archive cache: %v", err)
	}
	repaired, err := os.ReadFile(sibling)
	if err != nil {
		t.Fatalf("read repaired archive sibling: %v", err)
	}
	if string(repaired) != "runtime-data" {
		t.Fatalf("archive sibling was not repaired: %q", repaired)
	}
}

func TestResolveExtensionsHTTPSRedirectPolicy(t *testing.T) {
	t.Run("https downgrade rejected", func(t *testing.T) {
		paths := testProfilePaths(t)
		server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			http.Redirect(writer, request, "http://example.test/fixture.so", http.StatusFound)
		}))
		defer server.Close()
		_, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{{
			Source:     server.URL + "/start",
			Entrypoint: "init",
			SHA256:     strings.Repeat("0", 64),
		}}, server.Client())
		if err == nil || !strings.Contains(err.Error(), "remain HTTPS") {
			t.Fatalf("redirect error = %v", err)
		}
	})

	t.Run("redirect bound enforced", func(t *testing.T) {
		paths := testProfilePaths(t)
		var server *httptest.Server
		server = httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			step, _ := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/"))
			if step < maxRedirects+2 {
				http.Redirect(
					writer,
					request,
					server.URL+"/"+strconv.Itoa(step+1),
					http.StatusFound,
				)
				return
			}
			_, _ = writer.Write([]byte("never reached"))
		}))
		defer server.Close()
		_, err := ResolveExtensions(context.Background(), paths, []ExtensionConfig{{
			Source:     server.URL + "/0",
			Entrypoint: "init",
			SHA256:     strings.Repeat("0", 64),
		}}, server.Client())
		if err == nil || !strings.Contains(err.Error(), "too many extension redirects") {
			t.Fatalf("redirect error = %v", err)
		}
	})
}

func TestResolveExtensionsRejectsDownloadLimit(t *testing.T) {
	paths := testProfilePaths(t)
	body := []byte("1234567890")
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Length", strconv.Itoa(len(body)))
		_, _ = writer.Write(body)
	}))
	defer server.Close()
	_, err := resolveExtensions(
		context.Background(),
		paths,
		[]ExtensionConfig{{
			Source:     server.URL + "/fixture.so",
			Entrypoint: "init",
			SHA256:     hashBytes(body),
		}},
		server.Client(),
		ResolverLimits{
			MaxDownloadBytes:  5,
			MaxExtractBytes:   100,
			MaxFileBytes:      100,
			MaxArchiveEntries: 10,
		},
	)
	if err == nil || !strings.Contains(err.Error(), "download exceeds") {
		t.Fatalf("download limit error = %v", err)
	}
}

func TestResolverLimitsMustBePositive(t *testing.T) {
	_, err := resolveExtensions(
		context.Background(),
		testProfilePaths(t),
		nil,
		nil,
		ResolverLimits{},
	)
	if err == nil || !strings.Contains(err.Error(), "limits must be positive") {
		t.Fatalf("limits error = %v", err)
	}
}

type zipFixture struct {
	name string
	body string
	mode os.FileMode
}

func makeZip(t *testing.T, fixtures []zipFixture) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for _, fixture := range fixtures {
		header := &zip.FileHeader{Name: fixture.name, Method: zip.Store}
		header.SetMode(fixture.mode)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatalf("create zip entry: %v", err)
		}
		if _, err := io.WriteString(entry, fixture.body); err != nil {
			t.Fatalf("write zip entry: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}
	return buffer.Bytes()
}

type tarFixture struct {
	name     string
	body     string
	typeflag byte
	mode     int64
	linkname string
}

func makeTarGz(t *testing.T, fixtures []tarFixture) []byte {
	t.Helper()
	var buffer bytes.Buffer
	gzipWriter := gzip.NewWriter(&buffer)
	writer := tar.NewWriter(gzipWriter)
	for _, fixture := range fixtures {
		header := &tar.Header{
			Name:     fixture.name,
			Mode:     fixture.mode,
			Typeflag: fixture.typeflag,
			Linkname: fixture.linkname,
		}
		if fixture.typeflag == tar.TypeReg || fixture.typeflag == 0 {
			header.Size = int64(len(fixture.body))
		}
		if err := writer.WriteHeader(header); err != nil {
			t.Fatalf("write tar header: %v", err)
		}
		if header.Size != 0 {
			if _, err := io.WriteString(writer, fixture.body); err != nil {
				t.Fatalf("write tar body: %v", err)
			}
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close tar writer: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip writer: %v", err)
	}
	return buffer.Bytes()
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}
