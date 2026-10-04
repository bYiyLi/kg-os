package webstore

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/mattn/go-sqlite3"
)

func TestClosedSQLiteFailureDoesNotClaimSuccessfulReadOrSave(t *testing.T) {
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	input := cacheFixture(info.StoreID, frame)
	if err := store.db.Close(); err != nil {
		t.Fatal(err)
	}
	if status := store.Info(testContext); status.StorageStatus != "unavailable" || status.Error.Code != kernel.CodeConsistency {
		t.Fatalf("failed SQLite info: %+v", status)
	}
	_, err := store.Read(testContext, ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID})
	wantCode(t, err, kernel.CodeConsistency)
	_, err = store.CacheRead(testContext, input.CacheRequest)
	wantCode(t, err, kernel.CodeConsistency)
	_, err = store.CacheWrite(testContext, input)
	wantCode(t, err, kernel.CodeConsistency)
	_, err = store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID}, ExpectedRevision: &frame.Revision, MutationID: NewID(), Data: frame.Data})
	wantCode(t, err, kernel.CodeIO)
	_, err = store.List(testContext, ListRequest{StoreID: info.StoreID, Kind: "frame"})
	wantCode(t, err, kernel.CodeIO)
	_, err = store.Export(testContext)
	wantCode(t, err, kernel.CodeIO)
}

func TestFutureFormatWithUnknownMetadataLayoutStillExports(t *testing.T) {
	original, oldInfo := testStore(t)
	if _, err := original.db.Exec("PRAGMA user_version=2; ALTER TABLE metadata RENAME TO future_metadata"); err != nil {
		t.Fatal(err)
	}
	if err := original.Close(); err != nil {
		t.Fatal(err)
	}
	store := New(original.root, testDatabase)
	defer store.Close()
	info := store.Info(testContext)
	if info.StorageStatus != "unsupported" || info.FormatVersion != 2 || info.StoreID != "" || info.Error.Code != kernel.CodeUnsupportedOperation {
		t.Fatalf("unknown future layout: %+v", info)
	}
	_, err := store.List(testContext, ListRequest{StoreID: oldInfo.StoreID, Kind: "editor"})
	wantCode(t, err, kernel.CodeUnsupportedOperation)
	exported, err := store.Export(testContext)
	if err != nil {
		t.Fatal(err)
	}
	defer exported.Close()
	db, err := openSQLite(exported.path, true)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var id string
	if err := db.QueryRow("SELECT store_id FROM future_metadata").Scan(&id); err != nil || id != oldInfo.StoreID {
		t.Fatalf("future original export: %s %v", id, err)
	}
}

func TestInvalidStoredPayloadMetadataAndMissingSchemaAreConsistencyErrors(t *testing.T) {
	for _, mutation := range []string{
		"UPDATE metadata SET store_id='bad'",
		"UPDATE metadata SET database_id=''",
		"DROP TABLE metadata",
		"DROP TABLE records",
	} {
		t.Run(mutation, func(t *testing.T) {
			original, _ := testStore(t)
			if _, err := original.db.Exec(mutation); err != nil {
				t.Fatal(err)
			}
			if err := original.Close(); err != nil {
				t.Fatal(err)
			}
			store := New(original.root, testDatabase)
			defer store.Close()
			status := store.Info(testContext)
			if status.StorageStatus != "unavailable" || status.Error.Code != kernel.CodeConsistency {
				t.Fatalf("bad schema accepted: %+v", status)
			}
		})
	}
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	for _, mutation := range []string{"revision='bad'", "last_mutation_id='bad'", "data='broken'"} {
		if _, err := store.db.Exec("UPDATE records SET "+mutation+" WHERE id=?", frame.ID); err != nil {
			t.Fatal(err)
		}
		_, err := store.Read(testContext, ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID})
		wantCode(t, err, kernel.CodeConsistency)
		if mutation != "data='broken'" {
			_, err := store.List(testContext, ListRequest{StoreID: info.StoreID, Kind: "frame"})
			wantCode(t, err, kernel.CodeConsistency)
		}
		_, err = store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID}, ExpectedRevision: &frame.Revision, MutationID: NewID(), Data: frame.Data})
		wantCode(t, err, kernel.CodeConsistency)
		if _, err := store.db.Exec("UPDATE records SET revision=?,last_mutation_id=?,data=? WHERE id=?", frame.Revision, frame.LastMutationID, []byte(frame.Data), frame.ID); err != nil {
			t.Fatal(err)
		}
	}
	_, err := store.Delete(testContext, DeleteRequest{})
	wantCode(t, err, kernel.CodeInvalidArgument)
	full := strings.Repeat("9", 128)
	if _, err := store.db.Exec("UPDATE records SET revision=? WHERE id=?", full, frame.ID); err != nil {
		t.Fatal(err)
	}
	_, err = store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID}, ExpectedRevision: &full, MutationID: NewID(), Data: frame.Data})
	wantCode(t, err, kernel.CodeResource)
}

func TestOriginalReplacementAndUnavailablePathsStopWrites(t *testing.T) {
	store, info := testStore(t)
	if runtime.GOOS == "windows" {
		if err := store.db.Close(); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Rename(store.path, store.path+".archived"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.path, []byte("replacement original"), 0o600); err != nil {
		t.Fatal(err)
	}
	archived, err := os.ReadFile(store.path + ".archived")
	if err != nil {
		t.Fatal(err)
	}
	// Check before touching SQLite: a closed connection on Windows can itself
	// make Info fail and hide a missed physical replacement.
	wantCode(t, store.prepare(testContext), kernel.CodeConsistency)
	for range 2 {
		status := store.Info(testContext)
		if status.StorageStatus != "unavailable" || status.Error.Code != kernel.CodeConsistency {
			t.Fatalf("replacement not detected: %+v", status)
		}
		_, err := store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "editor", ID: NewID()}, MutationID: NewID(), Data: json.RawMessage(`{"version":1}`)})
		wantCode(t, err, kernel.CodeConsistency)
	}
	data, err := os.ReadFile(store.path)
	if err != nil || string(data) != "replacement original" {
		t.Fatalf("new original changed: %s %v", data, err)
	}
	data, err = os.ReadFile(store.path + ".archived")
	if err != nil || string(data) != string(archived) {
		t.Fatalf("archived original changed: %v", err)
	}
	for _, root := range []string{"", "relative", filepath.Join(t.TempDir(), "missing-parent", "web")} {
		store := New(root, testDatabase)
		defer store.Close()
		if info := store.Info(testContext); info.StorageStatus != "unavailable" || info.Error.Code != kernel.CodeIO {
			t.Fatalf("invalid root accepted: %+v", info)
		}
	}
	for _, path := range []string{filepath.Join(t.TempDir(), "web"), filepath.Join(t.TempDir(), "ui.db")} {
		if err := os.WriteFile(path, []byte("file instead of directory"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := privateDirectory(path); err == nil {
			t.Fatal("privateDirectory accepted a file")
		}
	}
	if _, err := privateTemp(filepath.Join(t.TempDir(), "missing"), "test-*"); err == nil {
		t.Fatal("privateTemp accepted missing parent")
	}
	if err := syncDirectory(filepath.Join(t.TempDir(), "missing")); err == nil && runtime.GOOS != "windows" {
		t.Fatal("directory sync accepted missing directory")
	}
}

func TestSQLiteAllocationAndFailedStatementPreservePreviousCommit(t *testing.T) {
	store, info := testStore(t)
	record := saveFixture(t, store, info, "editor", `{"version":1,"text":"confirmed"}`)
	key := ReadRequest{StoreID: info.StoreID, Kind: record.Kind, ID: record.ID}
	store.physicalLimit = fileSize(store.path) + 32 + 8*(4096+24)
	_, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &record.Revision, MutationID: NewID(), Data: json.RawMessage(`{"version":1,"text":"` + strings.Repeat("x", 100000) + `"}`)})
	wantCode(t, err, kernel.CodeResource)
	store.physicalLimit = PhysicalLimit
	if _, err := store.db.Exec(`CREATE TRIGGER fail_update BEFORE UPDATE ON records BEGIN SELECT RAISE(ABORT,'injected failure'); END`); err != nil {
		t.Fatal(err)
	}
	_, err = store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &record.Revision, MutationID: NewID(), Data: json.RawMessage(`{"version":1,"text":"unconfirmed"}`)})
	wantCode(t, err, kernel.CodeIO)
	read, err := store.Read(testContext, key)
	if err != nil || read.Revision != record.Revision || string(read.Data) != string(record.Data) {
		t.Fatalf("failed SQLite write changed committed input: %+v %v", read, err)
	}
}

func TestCacheRecoveryRejectsForgedBindingsAndMalformedRows(t *testing.T) {
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	input := cacheFixture(info.StoreID, frame)
	for _, mutate := range []func(*cacheFile){
		func(c *cacheFile) { c.Fingerprint = "different" },
		func(c *cacheFile) { c.Result.Rows = nil },
		func(c *cacheFile) { c.Result.State = "commit/" + strings.Repeat("b", 64) },
		func(c *cacheFile) { c.Created = store.now().Add(time.Hour) },
		func(c *cacheFile) { c.StoreID = NewID() },
		func(c *cacheFile) { c.DatabaseID = "other" },
		func(c *cacheFile) { c.Version = 2 },
	} {
		result, err := store.CacheWrite(testContext, input)
		if err != nil || !result.Stored {
			t.Fatalf("write: %+v %v", result, err)
		}
		cached, _, err := store.loadCache(frame.ID)
		if err != nil {
			t.Fatal(err)
		}
		mutate(&cached)
		encoded, _ := json.Marshal(cached)
		if err := os.WriteFile(store.cachePath(frame.ID), encoded, 0o600); err != nil {
			t.Fatal(err)
		}
		read, err := store.CacheRead(testContext, input.CacheRequest)
		if err != nil || read.Hit {
			t.Fatalf("invalid recovered cache was used: %+v %v", read, err)
		}
	}
	if err := os.WriteFile(filepath.Join(store.cacheDir, "unmanaged.txt"), []byte("ignored"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.cachePath(frame.ID), []byte("bad"), 0o600); err != nil {
		t.Fatal(err)
	}
	store.cacheLoaded = false
	if status := store.Info(testContext); status.StorageStatus != "ready" {
		t.Fatalf("bad cache blocked UI: %+v", status)
	}
	if _, err := os.Stat(store.cachePath(frame.ID)); !os.IsNotExist(err) {
		t.Fatalf("invalid cache not cleaned: %v", err)
	}
	if _, err := os.Stat(filepath.Join(store.cacheDir, "unmanaged.txt")); err != nil {
		t.Fatalf("scan deleted unmanaged content: %v", err)
	}
	store.cacheLoaded = false
	if cleared, err := store.CacheClear(testContext, CacheClearRequest{StoreID: info.StoreID}); err != nil || cleared.Cleared != 0 {
		t.Fatalf("empty recovery clear: %+v %v", cleared, err)
	}
	store.cacheLoaded = false
	if err := os.Remove(filepath.Join(store.cacheDir, "unmanaged.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(store.cacheDir); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.cacheDir, []byte("not a directory"), 0o600); err != nil {
		t.Fatal(err)
	}
	if result, err := store.CacheWrite(testContext, input); err != nil || result.Stored {
		t.Fatalf("cache directory failure became error: %+v %v", result, err)
	}
	if result, err := store.CacheRead(testContext, input.CacheRequest); err != nil || result.Hit {
		t.Fatalf("cache directory failure: %+v %v", result, err)
	}
}

func TestSnapshotBudgetOpaqueTokensAndStorageErrorMapping(t *testing.T) {
	store, info := testStore(t)
	for range 3 {
		saveFixture(t, store, info, "query", `{"version":1}`)
	}
	input := ListRequest{StoreID: info.StoreID, Kind: "query", Limit: intPointer(1)}
	for range 16 {
		page, err := store.List(testContext, input)
		if err != nil || page.Cursor == "" {
			t.Fatalf("snapshot: %+v %v", page, err)
		}
	}
	_, err := store.List(testContext, input)
	wantCode(t, err, kernel.CodeResource)
	for _, cursor := range []string{strings.Repeat("x", 257), "@@.invalid", "eA.@@", "eA.YQ", store.encodeCursor(NewID(), 1), store.encodeCursor(NewID(), 0), store.encodeCursor("bad", 1), store.encodeCursor(NewID(), 99999)} {
		input.Cursor = cursor
		_, err := store.List(testContext, input)
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	store.snapshots = map[string]*listSnapshot{"reserved": {bytes: snapshotBudget, expires: time.Now().Add(time.Minute)}}
	input.Cursor = ""
	_, err = store.List(testContext, input)
	wantCode(t, err, kernel.CodeResource)
	wantCode(t, storageError(sqlite3.Error{Code: sqlite3.ErrFull}), kernel.CodeResource)
	wantCode(t, storageError(context.Canceled), kernel.CodeIO)
	if validID("00000000-0000-0000-0000-00000000000g") || validCommit("commit/"+strings.Repeat("g", 64)) {
		t.Fatal("invalid hex identity accepted")
	}
}
