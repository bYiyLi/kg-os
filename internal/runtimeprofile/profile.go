package runtimeprofile

import (
	"fmt"
	"os"
	"path/filepath"
)

type Paths struct {
	Root          string
	Config        string
	Auth          string
	Lock          string
	Database      string
	CacheDir      string
	ExtensionsDir string
	LogsDir       string
}

func ResolvePaths(root string) (Paths, error) {
	if root == "" {
		return Paths{}, fmt.Errorf("instance root is required")
	}
	if !filepath.IsAbs(root) {
		return Paths{}, fmt.Errorf("instance root must be an absolute path")
	}
	absolute := filepath.Clean(root)

	return Paths{
		Root:          absolute,
		Config:        filepath.Join(absolute, "config.toml"),
		Auth:          filepath.Join(absolute, "auth.json"),
		Lock:          filepath.Join(absolute, "kgosd.lock"),
		Database:      filepath.Join(absolute, "kgos.db"),
		CacheDir:      filepath.Join(absolute, "cache"),
		ExtensionsDir: filepath.Join(absolute, "extensions"),
		LogsDir:       filepath.Join(absolute, "logs"),
	}, nil
}

func EnsureDirectories(paths Paths) error {
	for _, path := range []string{paths.Root, paths.CacheDir, paths.ExtensionsDir, paths.LogsDir} {
		if err := os.MkdirAll(path, 0o700); err != nil {
			return fmt.Errorf("create runtime directory %q: %w", path, err)
		}
	}
	return nil
}
