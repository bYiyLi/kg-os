package webstore

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/mattn/go-sqlite3"
)

type Store struct {
	mu                                                 sync.Mutex
	root, path, cacheDir, databaseID                   string
	db                                                 *sql.DB
	metadata                                           Info
	fileIdentity, directoryIdentity                    os.FileInfo
	closed                                             bool
	snapshots                                          map[string]*listSnapshot
	cache                                              map[string]*cacheEntry
	cacheLoaded                                        bool
	cursorKey                                          []byte
	now                                                func() time.Time
	logicalLimit, physicalLimit, cacheLimit, itemLimit int64
}

func New(directory, databaseID string) *Store {
	return &Store{root: directory, path: filepath.Join(directory, "ui.db"),
		cacheDir: filepath.Join(directory, "cache"), databaseID: databaseID,
		snapshots: make(map[string]*listSnapshot), cache: make(map[string]*cacheEntry), now: time.Now,
		logicalLimit: LogicalLimit, physicalLimit: PhysicalLimit, cacheLimit: CacheLimit, itemLimit: CacheItemLimit,
		cursorKey: []byte(NewID())}
}

func (store *Store) Close() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	store.snapshots = nil
	store.cache = nil
	if store.db != nil {
		return store.db.Close()
	}
	return nil
}

func openSQLite(path string, readonly bool) (*sql.DB, error) {
	uriPath := filepath.ToSlash(path)
	if runtime.GOOS == "windows" {
		uriPath = "/" + uriPath
	}
	uri := url.URL{Scheme: "file", Path: uriPath}
	query := uri.Query()
	query.Set("_busy_timeout", "5000")
	query.Set("_synchronous", "FULL")
	if readonly {
		query.Set("mode", "ro")
	} else {
		query.Set("mode", "rw")
	}
	uri.RawQuery = query.Encode()
	db, err := sql.Open("sqlite3", uri.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

const schema = `CREATE TABLE metadata (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL,
 store_id TEXT NOT NULL, database_id TEXT NOT NULL);
 CREATE TABLE records (kind TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL,
 deleted INTEGER NOT NULL CHECK(deleted IN (0,1)), data BLOB,
 last_mutation_id TEXT NOT NULL, logical_bytes INTEGER NOT NULL,
 PRIMARY KEY(kind,id), CHECK((deleted=1 AND data IS NULL) OR (deleted=0 AND data IS NOT NULL)));
 PRAGMA user_version=1;`

func (store *Store) create(ctx context.Context) (returnErr error) {
	temp, err := privateTemp(store.root, ".ui-create-*.db")
	if err != nil {
		return err
	}
	path := temp.Name()
	_ = temp.Close()
	defer func() {
		for _, suffix := range []string{"", "-journal", "-wal", "-shm"} {
			_ = os.Remove(path + suffix)
		}
	}()
	db, err := openSQLite(path, false)
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, schema); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO metadata VALUES(1,?,?,?)", FormatVersion, NewID(), store.databaseID); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	if err = db.Close(); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	err = file.Sync()
	_ = file.Close()
	if err != nil {
		return err
	}
	if err = store.guardFiles(); err != nil {
		return err
	}
	// Link publishes without overwriting an operator-created original. Both
	// paths are on the same volume and the completed temporary file is private.
	if err = os.Link(path, store.path); err != nil {
		return err
	}
	return syncDirectory(store.root)
}

func (store *Store) prepare(ctx context.Context) error {
	if store.closed {
		return ioError(os.ErrClosed)
	}
	if store.db != nil {
		if err := store.guardFiles(); err != nil {
			return ioError(err)
		}
		file, fileErr := os.Lstat(store.path)
		directory, directoryErr := os.Lstat(store.root)
		if fileErr != nil || directoryErr != nil || !os.SameFile(file, store.fileIdentity) || !os.SameFile(directory, store.directoryIdentity) {
			return consistency(fmt.Errorf("managed Web storage was replaced while open"))
		}
		return nil
	}
	if store.databaseID == "" {
		return ioError(fmt.Errorf("knowledge database identity is unavailable"))
	}
	if store.root == "" || !filepath.IsAbs(store.root) {
		return ioError(fmt.Errorf("web directory is unavailable"))
	}
	if err := guardPath(filepath.Dir(store.root), true, false); err != nil {
		return ioError(err)
	}
	if err := privateDirectory(store.root); err != nil {
		return ioError(err)
	}
	if err := store.guardFiles(); err != nil {
		return ioError(err)
	}
	cleanTemporaries(store.root, ".ui-create-", ".ui-export-")
	if _, err := os.Lstat(store.path); errors.Is(err, os.ErrNotExist) {
		if err := store.create(ctx); err != nil {
			return ioError(err)
		}
	}
	if err := store.secureFiles(); err != nil {
		return ioError(err)
	}
	db, err := openSQLite(store.path, true)
	if err != nil {
		return ioError(err)
	}
	valid := false
	defer func() {
		if !valid {
			_ = db.Close()
		}
	}()
	var check string
	if err := db.QueryRowContext(ctx, "PRAGMA quick_check").Scan(&check); err != nil || check != "ok" {
		return consistency(err)
	}
	var fileVersion int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&fileVersion); err != nil {
		return consistency(err)
	}
	metadata := Info{StorageStatus: "ready", CurrentDatabaseID: store.databaseID}
	metadataErr := db.QueryRowContext(ctx, "SELECT format_version,store_id,database_id FROM metadata WHERE singleton=1").Scan(
		&metadata.FormatVersion, &metadata.StoreID, &metadata.DatabaseID)
	if metadataErr != nil || !validID(metadata.StoreID) || metadata.DatabaseID == "" {
		if fileVersion <= FormatVersion {
			return consistency(metadataErr)
		}
		// The common metadata layout may itself change in a future format. The
		// SQLite format marker still permits diagnostic info and logical export.
		metadata = Info{StorageStatus: "unsupported", FormatVersion: fileVersion, CurrentDatabaseID: store.databaseID}
	} else {
		metadata.BindingStatus = "matched"
		if fileVersion > FormatVersion {
			metadata.FormatVersion = fileVersion
		}
	}
	if metadata.DatabaseID != "" && metadata.DatabaseID != store.databaseID {
		metadata.BindingStatus = "mismatch"
		metadata.StorageStatus = "mismatch"
		metadata.Error = publicError(kernel.CodeConsistency, "Web store belongs to another Knowledge database", nil)
	}
	if metadata.FormatVersion != FormatVersion {
		metadata.StorageStatus = "unsupported"
		metadata.Error = kernel.AsPublicError(unsupported(metadata.FormatVersion))
	} else {
		rows, err := db.QueryContext(ctx, "SELECT kind,id,revision,deleted,data,last_mutation_id,logical_bytes FROM records LIMIT 0")
		if err != nil {
			return consistency(err)
		}
		_ = rows.Close()
	}
	if metadata.StorageStatus == "ready" {
		if err := db.Close(); err != nil {
			return ioError(err)
		}
		db, err = openSQLite(store.path, false)
		if err != nil {
			return ioError(err)
		}
		var mode string
		if err := db.QueryRowContext(ctx, "PRAGMA journal_mode=WAL").Scan(&mode); err != nil || mode != "wal" {
			return ioError(err)
		}
		if _, err := db.ExecContext(ctx, "PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=1048576;"); err != nil {
			return ioError(err)
		}
	}
	if err := store.secureFiles(); err != nil {
		return ioError(err)
	}
	store.fileIdentity, err = os.Lstat(store.path)
	if err != nil {
		return ioError(err)
	}
	store.directoryIdentity, err = os.Lstat(store.root)
	if err != nil {
		return ioError(err)
	}
	store.db, store.metadata, valid = db, metadata, true
	return nil
}

func (store *Store) check(ctx context.Context, id string, write bool) error {
	if err := store.prepare(ctx); err != nil {
		return err
	}
	if store.metadata.StorageStatus == "unsupported" {
		return store.metadata.Error
	}
	if id != store.metadata.StoreID {
		return changed("", "", nil)
	}
	if write && store.metadata.StorageStatus != "ready" {
		return store.metadata.Error
	}
	return nil
}

func (store *Store) Info(ctx context.Context) Info {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.prepare(ctx); err != nil {
		return Info{StorageStatus: "unavailable", Error: kernel.AsPublicError(err)}
	}
	result := store.metadata
	usage := Usage{DatabaseBytes: fileSize(store.path), WALBytes: fileSize(store.path + "-wal")}
	if result.FormatVersion == FormatVersion {
		if err := store.db.QueryRowContext(ctx, "SELECT coalesce(sum(logical_bytes),0) FROM records").Scan(&usage.LogicalBytes); err != nil {
			result.StorageStatus = "unavailable"
			result.Error = kernel.AsPublicError(consistency(err))
			return result
		}
	}
	if !store.cacheLoaded && result.StorageStatus == "ready" {
		store.cacheLoaded = store.scanCache()
	}
	for _, entry := range store.cache {
		usage.CacheBytes += entry.Size
	}
	result.Usage = &usage
	return result
}

func storageError(err error) error {
	var sqlite sqlite3.Error
	if errors.As(err, &sqlite) && sqlite.Code == sqlite3.ErrFull {
		return resource()
	}
	return ioError(err)
}

func recordBytes(record Record) int64 {
	encoded, _ := json.Marshal(record)
	return int64(len(encoded))
}
