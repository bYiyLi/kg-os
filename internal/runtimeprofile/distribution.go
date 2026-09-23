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
)

type Distribution struct {
	Root             string
	KG               string
	Daemon           string
	Lithograph       string
	LithographSHA256 string
	Provider         string
	ProviderSHA256   string
	Manifest         string
}

type distributionManifestFile struct {
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
}

type distributionManifest struct {
	Arch     string                     `json:"arch"`
	Files    []distributionManifestFile `json:"files"`
	Go       string                     `json:"go"`
	Platform string                     `json:"platform"`
	Version  string                     `json:"version"`
}

func DiscoverDistribution() (Distribution, error) {
	executable, err := os.Executable()
	if err != nil {
		return Distribution{}, fmt.Errorf("locate kg executable: %w", err)
	}
	return DiscoverDistributionFromExecutable(executable)
}

func DiscoverDistributionFromExecutable(executable string) (Distribution, error) {
	canonical, err := filepath.EvalSymlinks(executable)
	if err != nil {
		return Distribution{}, fmt.Errorf("resolve kg executable: %w", err)
	}
	canonical, err = filepath.Abs(canonical)
	if err != nil {
		return Distribution{}, fmt.Errorf("resolve kg executable path: %w", err)
	}
	root := filepath.Dir(filepath.Clean(canonical))
	binarySuffix := ""
	if runtime.GOOS == "windows" {
		binarySuffix = ".exe"
	}
	librarySuffix, err := nativeLibrarySuffix(runtime.GOOS)
	if err != nil {
		return Distribution{}, err
	}
	distribution := Distribution{
		Root:       root,
		KG:         filepath.Join(root, "kg"+binarySuffix),
		Daemon:     filepath.Join(root, "kgosd"+binarySuffix),
		Lithograph: filepath.Join(root, "extensions", "lithograph"+librarySuffix),
		Provider: filepath.Join(
			root,
			"extensions",
			"lithograph-openai-compatible"+librarySuffix,
		),
		Manifest: filepath.Join(root, "manifest.json"),
	}
	if err := distribution.verify(); err != nil {
		return Distribution{}, err
	}
	return distribution, nil
}

func (distribution *Distribution) verify() error {
	body, err := os.ReadFile(distribution.Manifest)
	if err != nil {
		return fmt.Errorf("read distribution manifest: %w", err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	var parsed distributionManifest
	if err := decoder.Decode(&parsed); err != nil {
		return fmt.Errorf("decode distribution manifest: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return fmt.Errorf("distribution manifest must contain exactly one JSON object")
	}
	if parsed.Platform != runtime.GOOS || parsed.Arch != distributionArch(runtime.GOARCH) {
		return fmt.Errorf(
			"distribution target %s/%s does not match runtime %s/%s",
			parsed.Platform,
			parsed.Arch,
			runtime.GOOS,
			runtime.GOARCH,
		)
	}
	expected := map[string]*string{
		relativeSlash(distribution.Root, distribution.KG):         nil,
		relativeSlash(distribution.Root, distribution.Daemon):     nil,
		relativeSlash(distribution.Root, distribution.Lithograph): &distribution.LithographSHA256,
		relativeSlash(distribution.Root, distribution.Provider):   &distribution.ProviderSHA256,
	}
	manifestHashes := make(map[string]string, len(parsed.Files))
	for _, file := range parsed.Files {
		if file.File == "" || len(file.SHA256) != 64 {
			return fmt.Errorf("distribution manifest contains invalid file entry")
		}
		if _, err := hex.DecodeString(file.SHA256); err != nil ||
			strings.ToLower(file.SHA256) != file.SHA256 {
			return fmt.Errorf("distribution manifest contains invalid sha256 for %q", file.File)
		}
		if _, exists := manifestHashes[file.File]; exists {
			return fmt.Errorf("distribution manifest contains duplicate file %q", file.File)
		}
		manifestHashes[file.File] = file.SHA256
	}
	for file, targetHash := range expected {
		want, ok := manifestHashes[file]
		if !ok {
			return fmt.Errorf("distribution manifest is missing %q", file)
		}
		actual, err := LocalFileSHA256(filepath.Join(distribution.Root, filepath.FromSlash(file)))
		if err != nil {
			return fmt.Errorf("verify distribution file %q: %w", file, err)
		}
		if actual != want {
			return fmt.Errorf("distribution file %q failed SHA-256 verification", file)
		}
		if targetHash != nil {
			*targetHash = want
		}
	}
	return nil
}

func distributionArch(goarch string) string {
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
		return "", fmt.Errorf("unsupported distribution platform %q", goos)
	}
}
