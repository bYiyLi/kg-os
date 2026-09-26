package runtimeprofile

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	LithographEntrypoint = "sqlite3_lithograph_init"
	ProviderEntrypoint   = "sqlite3_lithographopenaicompatible_init"
	JiebaEntrypoint      = "sqlite3_kgosjieba_init"
)

type RuntimePackage struct {
	Root             string
	Daemon           string
	Lithograph       string
	LithographSHA256 string
	Provider         string
	ProviderSHA256   string
	Jieba            string
	JiebaSHA256      string
	JiebaNotice      string
	TokenizerLicense string
	JiebaLicense     string
	Manifest         string
	Version          string
}

type runtimeManifestFile struct {
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
}

type runtimeManifest struct {
	Arch     string                `json:"arch"`
	Files    []runtimeManifestFile `json:"files"`
	Go       string                `json:"go"`
	Platform string                `json:"platform"`
	Version  string                `json:"version"`
}

func DiscoverRuntimePackage() (RuntimePackage, error) {
	executable, err := os.Executable()
	if err != nil {
		return RuntimePackage{}, fmt.Errorf("locate kgosd executable: %w", err)
	}
	return DiscoverRuntimePackageFromExecutable(executable)
}

func DiscoverRuntimePackageFromExecutable(executable string) (RuntimePackage, error) {
	canonical, err := filepath.EvalSymlinks(executable)
	if err != nil {
		return RuntimePackage{}, fmt.Errorf("resolve kgosd executable: %w", err)
	}
	canonical, err = filepath.Abs(canonical)
	if err != nil {
		return RuntimePackage{}, fmt.Errorf("resolve kgosd executable path: %w", err)
	}
	root := filepath.Dir(filepath.Clean(canonical))
	binarySuffix := ""
	if runtime.GOOS == "windows" {
		binarySuffix = ".exe"
	}
	librarySuffix, err := nativeLibrarySuffix(runtime.GOOS)
	if err != nil {
		return RuntimePackage{}, err
	}
	pkg := RuntimePackage{
		Root:       root,
		Daemon:     filepath.Join(root, "kgosd"+binarySuffix),
		Lithograph: filepath.Join(root, "extensions", "lithograph"+librarySuffix),
		Provider: filepath.Join(
			root,
			"extensions",
			"lithograph-openai-compatible"+librarySuffix,
		),
		Jieba:            filepath.Join(root, "extensions", "kgos-jieba"+librarySuffix),
		JiebaNotice:      filepath.Join(root, "JIEBA-NOTICE.md"),
		TokenizerLicense: filepath.Join(root, "licenses", "sqlite-simple-tokenizer-MIT.txt"),
		JiebaLicense:     filepath.Join(root, "licenses", "jieba-rs-MIT.txt"),
		Manifest:         filepath.Join(root, "manifest.json"),
	}
	if err := pkg.verify(); err != nil {
		return RuntimePackage{}, err
	}
	return pkg, nil
}

func (pkg RuntimePackage) OfficialExtensions() []ExtensionConfig {
	return []ExtensionConfig{
		{
			Source:     pkg.Lithograph,
			Entrypoint: LithographEntrypoint,
			SHA256:     pkg.LithographSHA256,
		},
		{
			Source:     pkg.Provider,
			Entrypoint: ProviderEntrypoint,
			SHA256:     pkg.ProviderSHA256,
		},
		{
			Source:     pkg.Jieba,
			Entrypoint: JiebaEntrypoint,
			SHA256:     pkg.JiebaSHA256,
		},
	}
}

func (pkg *RuntimePackage) verify() error {
	body, err := os.ReadFile(pkg.Manifest)
	if err != nil {
		return fmt.Errorf("read runtime manifest: %w", err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	var parsed runtimeManifest
	if err := decoder.Decode(&parsed); err != nil {
		return fmt.Errorf("decode runtime manifest: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return fmt.Errorf("runtime manifest must contain exactly one JSON object")
	}
	if parsed.Version == "" {
		return fmt.Errorf("runtime manifest version must be non-empty")
	}
	if parsed.Platform != runtimePackagePlatform(runtime.GOOS) || parsed.Arch != runtimePackageArch(runtime.GOARCH) {
		return fmt.Errorf(
			"runtime target %s/%s does not match process %s/%s",
			parsed.Platform,
			parsed.Arch,
			runtime.GOOS,
			runtime.GOARCH,
		)
	}
	pkg.Version = parsed.Version

	expected := map[string]*string{
		relativeSlash(pkg.Root, pkg.Daemon):           nil,
		relativeSlash(pkg.Root, pkg.Lithograph):       &pkg.LithographSHA256,
		relativeSlash(pkg.Root, pkg.Provider):         &pkg.ProviderSHA256,
		relativeSlash(pkg.Root, pkg.Jieba):            &pkg.JiebaSHA256,
		relativeSlash(pkg.Root, pkg.JiebaNotice):      nil,
		relativeSlash(pkg.Root, pkg.TokenizerLicense): nil,
		relativeSlash(pkg.Root, pkg.JiebaLicense):     nil,
	}
	manifestHashes := make(map[string]string, len(parsed.Files))
	for _, file := range parsed.Files {
		if file.File == "" || len(file.SHA256) != 64 {
			return fmt.Errorf("runtime manifest contains invalid file entry")
		}
		if _, err := hex.DecodeString(file.SHA256); err != nil ||
			strings.ToLower(file.SHA256) != file.SHA256 {
			return fmt.Errorf("runtime manifest contains invalid sha256 for %q", file.File)
		}
		if _, exists := manifestHashes[file.File]; exists {
			return fmt.Errorf("runtime manifest contains duplicate file %q", file.File)
		}
		manifestHashes[file.File] = file.SHA256
	}
	if len(manifestHashes) != len(expected) {
		return fmt.Errorf("runtime manifest must contain exactly the required native files")
	}
	for file, targetHash := range expected {
		want, ok := manifestHashes[file]
		if !ok {
			return fmt.Errorf("runtime manifest is missing %q", file)
		}
		actual, err := LocalFileSHA256(filepath.Join(pkg.Root, filepath.FromSlash(file)))
		if err != nil {
			return fmt.Errorf("verify runtime file %q: %w", file, err)
		}
		if actual != want {
			return fmt.Errorf("runtime file %q failed SHA-256 verification", file)
		}
		if targetHash != nil {
			*targetHash = want
		}
	}
	return nil
}

func runtimePackagePlatform(goos string) string {
	if goos == "windows" {
		return "win32"
	}
	return goos
}

func runtimePackageArch(goarch string) string {
	if goarch == "amd64" {
		return "x64"
	}
	return goarch
}

func LocalFileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func relativeSlash(root, path string) string {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	return filepath.ToSlash(relative)
}

func nativeLibrarySuffix(goos string) (string, error) {
	switch goos {
	case "darwin":
		return ".dylib", nil
	case "linux":
		return ".so", nil
	case "windows":
		return ".dll", nil
	default:
		return "", fmt.Errorf("unsupported runtime platform %q", goos)
	}
}
