package runtimeprofile

import (
	"fmt"
	"os"
	"path/filepath"
)

const defaultDirectoryName = ".kgosd"

type Paths struct {
	Home          string
	Config        string
	Auth          string
	Lock          string
	Database      string
	CacheDir      string
	ExtensionsDir string
	LogsDir       string
}

func ResolvePaths(explicitHome string) (Paths, error) {
	home := explicitHome
	if home == "" {
		userHome, err := os.UserHomeDir()
		if err != nil {
			return Paths{}, fmt.Errorf("resolve user home: %w", err)
		}
		home = filepath.Join(userHome, defaultDirectoryName)
	}

	absolute, err := filepath.Abs(home)
	if err != nil {
		return Paths{}, fmt.Errorf("resolve KG_HOME: %w", err)
	}
	absolute = filepath.Clean(absolute)

	return Paths{
		Home:          absolute,
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
	for _, path := range []string{paths.Home, paths.CacheDir, paths.ExtensionsDir, paths.LogsDir} {
		if err := os.MkdirAll(path, 0o700); err != nil {
			return fmt.Errorf("create runtime directory %q: %w", path, err)
		}
	}
	return nil
}
