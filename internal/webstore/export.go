package webstore

import (
	"context"
	"os"
)

type ExportFile struct {
	*os.File
	Size int64
	path string
}

func (export *ExportFile) Close() error {
	err := export.File.Close()
	if guardPath(export.path, false, false) == nil {
		_ = os.Remove(export.path)
	}
	return err
}

func (store *Store) Export(ctx context.Context) (_ *ExportFile, returnErr error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.prepare(ctx); err != nil {
		return nil, err
	}
	// An empty, private, server-selected file is a valid VACUUM INTO target.
	// Reserving it first prevents any publicly readable content before ACLs.
	file, err := privateTemp(store.root, ".ui-export-*.db")
	if err != nil {
		return nil, ioError(err)
	}
	path := file.Name()
	_ = file.Close()
	defer func() {
		if returnErr != nil {
			for _, suffix := range []string{"", "-journal", "-wal", "-shm"} {
				_ = os.Remove(path + suffix)
			}
		}
	}()
	if _, err := store.db.ExecContext(ctx, "VACUUM INTO ?", path); err != nil {
		return nil, storageError(err)
	}
	if err := guardPath(path, false, false); err != nil {
		return nil, ioError(err)
	}
	file, err = os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return nil, ioError(err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return nil, ioError(err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, ioError(err)
	}
	return &ExportFile{File: file, Size: info.Size(), path: path}, nil
}
