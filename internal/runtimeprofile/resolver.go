package runtimeprofile

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	maxRedirects       = 5
	defaultMaxDownload = int64(512 << 20)
	defaultMaxExtract  = int64(1 << 30)
	defaultMaxFile     = int64(512 << 20)
	defaultMaxEntries  = 4096
)

type ResolverLimits struct {
	MaxDownloadBytes  int64
	MaxExtractBytes   int64
	MaxFileBytes      int64
	MaxArchiveEntries int
}

type ResolvedExtension struct {
	SHA256     string
	Library    string
	Entrypoint string
}

type artifactManifest struct {
	SHA256 string            `json:"sha256"`
	Files  map[string]string `json:"files"`
}

func ResolveExtensions(
	ctx context.Context,
	paths Paths,
	configs []ExtensionConfig,
	client *http.Client,
) ([]ResolvedExtension, error) {
	limits := ResolverLimits{
		MaxDownloadBytes:  defaultMaxDownload,
		MaxExtractBytes:   defaultMaxExtract,
		MaxFileBytes:      defaultMaxFile,
		MaxArchiveEntries: defaultMaxEntries,
	}
	return resolveExtensions(ctx, paths, configs, client, limits)
}

// CachedExtensionReady performs the same integrity validation used by the
// resolver for an already-cached remote extension without downloading,
// repairing, or publishing anything.
func CachedExtensionReady(paths Paths, config ExtensionConfig) (bool, error) {
	remote, sourcePath, err := validateAndClassifyExtensionConfig(&config)
	if err != nil {
		return false, err
	}
	if !remote {
		return false, nil
	}
	limits := ResolverLimits{
		MaxDownloadBytes:  defaultMaxDownload,
		MaxExtractBytes:   defaultMaxExtract,
		MaxFileBytes:      defaultMaxFile,
		MaxArchiveEntries: defaultMaxEntries,
	}
	_, ok := loadCachedArtifact(
		paths.ExtensionsDir,
		config.SHA256,
		sourcePath,
		config.Library,
		limits,
	)
	return ok, nil
}

func resolveExtensions(
	ctx context.Context,
	paths Paths,
	configs []ExtensionConfig,
	client *http.Client,
	limits ResolverLimits,
) ([]ResolvedExtension, error) {
	if err := validateResolverLimits(limits); err != nil {
		return nil, err
	}
	resolved := make([]ResolvedExtension, 0, len(configs))
	for index, config := range configs {
		artifact, err := resolveExtension(ctx, paths, config, client, limits)
		if err != nil {
			return nil, fmt.Errorf("resolve sqlite.extensions[%d]: %w", index, err)
		}
		resolved = append(resolved, artifact)
	}
	return resolved, nil
}

func resolveExtension(
	ctx context.Context,
	paths Paths,
	config ExtensionConfig,
	client *http.Client,
	limits ResolverLimits,
) (ResolvedExtension, error) {
	remote, sourcePath, err := validateAndClassifyExtensionConfig(&config)
	if err != nil {
		return ResolvedExtension{}, err
	}
	if remote {
		if cached, ok := loadCachedArtifact(
			paths.ExtensionsDir,
			config.SHA256,
			sourcePath,
			config.Library,
			limits,
		); ok {
			return ResolvedExtension{
				SHA256:     config.SHA256,
				Library:    cached.Library,
				Entrypoint: config.Entrypoint,
			}, nil
		}
	}

	artifactBytes, err := readSource(ctx, config.Source, remote, client, limits.MaxDownloadBytes)
	if err != nil {
		return ResolvedExtension{}, err
	}
	actualHash := hashBytes(artifactBytes)
	if config.SHA256 != "" && actualHash != config.SHA256 {
		return ResolvedExtension{}, fmt.Errorf("artifact SHA-256 mismatch: got %s", actualHash)
	}
	if cached, ok := loadCachedArtifact(
		paths.ExtensionsDir,
		actualHash,
		sourcePath,
		config.Library,
		limits,
	); ok {
		return ResolvedExtension{
			SHA256:     actualHash,
			Library:    cached.Library,
			Entrypoint: config.Entrypoint,
		}, nil
	}

	library, err := publishArtifact(paths.ExtensionsDir, sourcePath, config.Library, actualHash, artifactBytes, limits)
	if err != nil {
		return ResolvedExtension{}, err
	}
	return ResolvedExtension{
		SHA256:     actualHash,
		Library:    library,
		Entrypoint: config.Entrypoint,
	}, nil
}

func validateResolverLimits(limits ResolverLimits) error {
	if limits.MaxDownloadBytes <= 0 ||
		limits.MaxExtractBytes <= 0 ||
		limits.MaxFileBytes <= 0 ||
		limits.MaxArchiveEntries <= 0 {
		return fmt.Errorf("resolver limits must be positive")
	}
	return nil
}

func readSource(
	ctx context.Context,
	source string,
	remote bool,
	client *http.Client,
	limit int64,
) ([]byte, error) {
	if !remote {
		return readRegularFile(source, limit)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, fmt.Errorf("create extension request: %w", err)
	}
	httpClient := boundedHTTPSClient(client)
	response, err := httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("download extension: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("download extension: HTTP %d", response.StatusCode)
	}
	if response.ContentLength > limit {
		return nil, fmt.Errorf("extension download exceeds %d bytes", limit)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read extension response: %w", err)
	}
	if int64(len(body)) > limit {
		return nil, fmt.Errorf("extension download exceeds %d bytes", limit)
	}
	return body, nil
}

func boundedHTTPSClient(base *http.Client) *http.Client {
	client := &http.Client{}
	if base != nil {
		*client = *base
	}
	if client.Timeout == 0 {
		client.Timeout = 60 * time.Second
	}
	previousCheck := client.CheckRedirect
	client.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) > maxRedirects {
			return fmt.Errorf("too many extension redirects")
		}
		if request.URL.Scheme != "https" {
			return fmt.Errorf("extension redirect must remain HTTPS")
		}
		if previousCheck != nil {
			return previousCheck(request, via)
		}
		return nil
	}
	return client
}

func readRegularFile(path string, limit int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open local extension: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("stat local extension: %w", err)
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("local extension source must be a regular file")
	}
	if info.Size() > limit {
		return nil, fmt.Errorf("local extension exceeds %d bytes", limit)
	}
	body, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read local extension: %w", err)
	}
	if int64(len(body)) > limit {
		return nil, fmt.Errorf("local extension exceeds %d bytes", limit)
	}
	return body, nil
}

func publishArtifact(
	extensionsDir string,
	sourcePath string,
	libraryConfig string,
	hash string,
	artifactBytes []byte,
	limits ResolverLimits,
) (string, error) {
	if err := os.MkdirAll(extensionsDir, 0o700); err != nil {
		return "", fmt.Errorf("create extensions cache: %w", err)
	}
	staging, err := os.MkdirTemp(extensionsDir, ".resolve-*")
	if err != nil {
		return "", fmt.Errorf("create extension staging directory: %w", err)
	}
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(staging)
		}
	}()

	if err := writeFileSync(filepath.Join(staging, "artifact"), artifactBytes, 0o600); err != nil {
		return "", err
	}
	payload := filepath.Join(staging, "payload")
	if err := os.Mkdir(payload, 0o700); err != nil {
		return "", fmt.Errorf("create extension payload directory: %w", err)
	}

	libraryRelative := ""
	if isArchivePath(sourcePath) {
		if strings.HasSuffix(strings.ToLower(sourcePath), ".zip") {
			if err := extractZip(artifactBytes, payload, limits); err != nil {
				return "", err
			}
		} else {
			if err := extractTarGz(artifactBytes, payload, limits); err != nil {
				return "", err
			}
		}
		libraryRelative = filepath.Join("payload", filepath.FromSlash(libraryConfig))
	} else {
		libraryRelative = filepath.Join("payload", canonicalDirectLibraryName())
		if err := writeFileSync(filepath.Join(staging, libraryRelative), artifactBytes, 0o600); err != nil {
			return "", err
		}
	}

	libraryPath := filepath.Join(staging, libraryRelative)
	libraryInfo, err := os.Lstat(libraryPath)
	if err != nil {
		return "", fmt.Errorf("archive library %q is missing: %w", libraryConfig, err)
	}
	if !libraryInfo.Mode().IsRegular() {
		return "", fmt.Errorf("resolved extension library must be a regular file")
	}
	fileHashes, err := hashPayloadFiles(staging, payload, limits)
	if err != nil {
		return "", err
	}
	manifest := artifactManifest{
		SHA256: hash,
		Files:  fileHashes,
	}
	manifestBody, err := json.Marshal(manifest)
	if err != nil {
		return "", fmt.Errorf("encode extension cache manifest: %w", err)
	}
	manifestBody = append(manifestBody, '\n')
	if err := writeFileSync(filepath.Join(staging, "manifest.json"), manifestBody, 0o600); err != nil {
		return "", err
	}

	destination := filepath.Join(extensionsDir, hash)
	if err := os.RemoveAll(destination); err != nil {
		return "", fmt.Errorf("remove invalid extension cache: %w", err)
	}
	if err := os.Rename(staging, destination); err != nil {
		return "", fmt.Errorf("publish extension cache: %w", err)
	}
	published = true
	if err := syncDirectory(extensionsDir); err != nil {
		return "", err
	}
	return filepath.Join(destination, libraryRelative), nil
}

func loadCachedArtifact(
	extensionsDir string,
	hash string,
	sourcePath string,
	libraryConfig string,
	limits ResolverLimits,
) (ResolvedExtension, bool) {
	if hash == "" {
		return ResolvedExtension{}, false
	}
	root := filepath.Join(extensionsDir, hash)
	manifestBytes, err := os.ReadFile(filepath.Join(root, "manifest.json"))
	if err != nil {
		return ResolvedExtension{}, false
	}
	var manifest artifactManifest
	decoder := json.NewDecoder(strings.NewReader(string(manifestBytes)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil || manifest.SHA256 != hash {
		return ResolvedExtension{}, false
	}
	artifact, err := readRegularFile(filepath.Join(root, "artifact"), limits.MaxDownloadBytes)
	if err != nil || hashBytes(artifact) != hash {
		return ResolvedExtension{}, false
	}
	payload := filepath.Join(root, "payload")
	actualFiles, err := hashPayloadFiles(root, payload, limits)
	if err != nil || !equalHashes(actualFiles, manifest.Files) {
		return ResolvedExtension{}, false
	}
	libraryRelative := filepath.Join("payload", canonicalDirectLibraryName())
	if isArchivePath(sourcePath) {
		libraryRelative = filepath.Join("payload", filepath.FromSlash(libraryConfig))
	}
	expectedLibraryHash, exists := manifest.Files[filepath.ToSlash(libraryRelative)]
	if !exists {
		return ResolvedExtension{}, false
	}
	libraryPath, ok := safeCachedPath(root, libraryRelative)
	if !ok {
		return ResolvedExtension{}, false
	}
	library, err := readRegularFile(libraryPath, limits.MaxFileBytes)
	if err != nil || hashBytes(library) != expectedLibraryHash {
		return ResolvedExtension{}, false
	}
	return ResolvedExtension{SHA256: hash, Library: libraryPath}, true
}

func hashPayloadFiles(root, payload string, limits ResolverLimits) (map[string]string, error) {
	files := make(map[string]string)
	var total int64
	entries := 0
	err := filepath.WalkDir(payload, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		entries++
		if entries > limits.MaxArchiveEntries {
			return fmt.Errorf("extension cache payload exceeds %d files", limits.MaxArchiveEntries)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("extension cache payload contains non-regular entry %q", path)
		}
		if info.Size() > limits.MaxFileBytes {
			return fmt.Errorf("extension cache payload file %q exceeds file limit", path)
		}
		total += info.Size()
		if total > limits.MaxExtractBytes {
			return fmt.Errorf("extension cache payload exceeds extracted-size limit")
		}
		body, err := readRegularFile(path, limits.MaxFileBytes)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		files[filepath.ToSlash(relative)] = hashBytes(body)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("hash extension cache payload: %w", err)
	}
	return files, nil
}

func equalHashes(left, right map[string]string) bool {
	if len(left) != len(right) {
		return false
	}
	for path, digest := range left {
		if right[path] != digest {
			return false
		}
	}
	return true
}

func canonicalDirectLibraryName() string {
	switch runtime.GOOS {
	case "darwin":
		return "extension.dylib"
	case "windows":
		return "extension.dll"
	default:
		return "extension.so"
	}
}

func safeCachedPath(root, relative string) (string, bool) {
	if relative == "" || filepath.IsAbs(relative) {
		return "", false
	}
	cleaned := filepath.Clean(relative)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", false
	}
	joined := filepath.Join(root, cleaned)
	relativeToRoot, err := filepath.Rel(root, joined)
	if err != nil || relativeToRoot == ".." || strings.HasPrefix(relativeToRoot, ".."+string(filepath.Separator)) {
		return "", false
	}
	return joined, true
}

func writeFileSync(path string, body []byte, mode os.FileMode) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("create %q: %w", path, err)
	}
	closed := false
	defer func() {
		if !closed {
			_ = file.Close()
		}
	}()
	if _, err := file.Write(body); err != nil {
		return fmt.Errorf("write %q: %w", path, err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close %q: %w", path, err)
	}
	closed = true
	return nil
}

func hashBytes(body []byte) string {
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:])
}
