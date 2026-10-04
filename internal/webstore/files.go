package webstore

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Web paths are daemon-selected. Lstat plus the platform reparse guard rejects
// redirection before creating, opening, publishing, or deleting any managed file.
func guardPath(path string, directory bool, allowMissing bool) error {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) && allowMissing {
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || directory != info.IsDir() || !directory && !info.Mode().IsRegular() {
		return fmt.Errorf("unsafe managed Web path")
	}
	return rejectReparse(path)
}

func privateDirectory(path string) error {
	if err := guardPath(path, true, true); err != nil {
		return err
	}
	if err := os.Mkdir(path, 0o700); err != nil && !errors.Is(err, os.ErrExist) {
		return err
	}
	if err := guardPath(path, true, false); err != nil {
		return err
	}
	return makePrivate(path, true)
}

func (store *Store) guardFiles() error {
	if store.root == "" || !filepath.IsAbs(store.root) {
		return fmt.Errorf("web directory is unavailable")
	}
	if err := guardPath(filepath.Dir(store.root), true, false); err != nil {
		return err
	}
	if err := guardPath(store.root, true, false); err != nil {
		return err
	}
	for _, path := range []string{store.path, store.path + "-wal", store.path + "-shm", store.path + "-journal"} {
		if err := guardPath(path, false, true); err != nil {
			return err
		}
	}
	return nil
}

func (store *Store) secureFiles() error {
	if err := store.guardFiles(); err != nil {
		return err
	}
	for _, path := range []string{store.path, store.path + "-wal", store.path + "-shm", store.path + "-journal"} {
		if _, err := os.Lstat(path); errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err := makePrivate(path, false); err != nil {
			return err
		}
	}
	return nil
}

func privateTemp(directory, pattern string) (*os.File, error) {
	if err := guardPath(directory, true, false); err != nil {
		return nil, err
	}
	file, err := os.CreateTemp(directory, pattern)
	if err != nil {
		return nil, err
	}
	if err := makePrivate(file.Name(), false); err != nil {
		_ = file.Close()
		_ = os.Remove(file.Name())
		return nil, err
	}
	return file, nil
}

func fileSize(path string) int64 {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return 0
	}
	return info.Size()
}

// A new daemon owns the instance lock, so no previous download or cache writer
// can still own these reserved temporary names. Cleanup never follows links.
func cleanTemporaries(directory string, prefixes ...string) {
	if guardPath(directory, true, false) != nil {
		return
	}
	file, err := os.Open(directory)
	if err != nil {
		return
	}
	defer file.Close()
	for {
		entries, err := file.ReadDir(256)
		for _, entry := range entries {
			for _, prefix := range prefixes {
				if strings.HasPrefix(entry.Name(), prefix) {
					path := filepath.Join(directory, entry.Name())
					if guardPath(path, false, false) == nil {
						_ = os.Remove(path)
					}
					break
				}
			}
		}
		if err == io.EOF || err != nil {
			return
		}
	}
}
