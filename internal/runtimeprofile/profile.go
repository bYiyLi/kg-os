package runtimeprofile

import (
	"fmt"
	"os"
	"path/filepath"
)

type Paths struct {
	WorkspaceRoot string
	Root          string
	Config        string
	Auth          string
	Lock          string
	Database      string
	CacheDir      string
	ExtensionsDir string
	LogsDir       string
	WebDir        string
	WebDatabase   string
	WebCacheDir   string
}

func ResolvePaths(root string) (Paths, error) {
	if root == "" {
		return Paths{}, fmt.Errorf("workspace root is required")
	}
	if !filepath.IsAbs(root) {
		return Paths{}, fmt.Errorf("workspace root must be an absolute path")
	}
	workspaceRoot := filepath.Clean(root)
	instanceRoot := filepath.Join(workspaceRoot, ".kgos")

	return Paths{
		WorkspaceRoot: workspaceRoot,
		Root:          instanceRoot,
		Config:        filepath.Join(instanceRoot, "config.toml"),
		Auth:          filepath.Join(instanceRoot, "auth.json"),
		Lock:          filepath.Join(instanceRoot, "kgosd.lock"),
		Database:      filepath.Join(instanceRoot, "kgos.db"),
		CacheDir:      filepath.Join(instanceRoot, "cache"),
		ExtensionsDir: filepath.Join(instanceRoot, "extensions"),
		LogsDir:       filepath.Join(instanceRoot, "logs"),
		WebDir:        filepath.Join(instanceRoot, "web"),
		WebDatabase:   filepath.Join(instanceRoot, "web", "ui.db"),
		WebCacheDir:   filepath.Join(instanceRoot, "web", "cache"),
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
