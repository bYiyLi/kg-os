package webstore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

var testContext = context.Background()

const testDatabase = "database-fixture"
const testState = "commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func testStore(t *testing.T) (*Store, Info) {
	t.Helper()
	store := New(filepath.Join(t.TempDir(), "web"), testDatabase)
	t.Cleanup(func() { _ = store.Close() })
	info := store.Info(testContext)
	if info.StorageStatus != "ready" {
		t.Fatalf("open store: %+v", info)
	}
	return store, info
}

func wantCode(t *testing.T, err error, code kernel.ErrorCode) {
	t.Helper()
	if err == nil || kernel.AsPublicError(err).Code != code {
		t.Fatalf("error = %v, want %s", err, code)
	}
}

func saveFixture(t *testing.T, store *Store, info Info, kind string, data string) Record {
	t.Helper()
	record, err := store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: kind, ID: NewID()}, MutationID: NewID(), Data: json.RawMessage(data)})
	if err != nil {
		t.Fatalf("save fixture: %v", err)
	}
	return record
}

func intPointer(value int) *int { return &value }

func TestStoreLazyPrivateSQLiteAndConcurrentInitialization(t *testing.T) {
	store := New(filepath.Join(t.TempDir(), "web"), testDatabase)
	t.Cleanup(func() { _ = store.Close() })
	if _, err := os.Stat(store.root); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("New created Web directory: %v", err)
	}
	results := make(chan Info, 12)
	var group sync.WaitGroup
	for range 12 {
		group.Go(func() { results <- store.Info(testContext) })
	}
	group.Wait()
	close(results)
	var storeID string
	for result := range results {
		if result.StorageStatus != "ready" || !validID(result.StoreID) || result.DatabaseID != testDatabase || result.BindingStatus != "matched" || result.Usage == nil {
			t.Fatalf("info: %+v", result)
		}
		if storeID != "" && result.StoreID != storeID {
			t.Fatal("concurrent initialization created different stores")
		}
		storeID = result.StoreID
	}
	var mode string
	var synchronous int
	if err := store.db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("journal mode = %s, %v", mode, err)
	}
	if err := store.db.QueryRow("PRAGMA synchronous").Scan(&synchronous); err != nil || synchronous != 2 {
		t.Fatalf("synchronous = %d, %v", synchronous, err)
	}
	for _, path := range []string{store.root, store.path, store.cacheDir, store.path + "-wal", store.path + "-shm"} {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if runtime.GOOS != "windows" {
			wanted := os.FileMode(0o600)
			if info.IsDir() {
				wanted = 0o700
			}
			if info.Mode().Perm() != wanted {
				t.Fatalf("%s mode %o, want %o", filepath.Base(path), info.Mode().Perm(), wanted)
			}
		}
	}
	files, err := filepath.Glob(filepath.Join(store.root, ".ui-create-*"))
	if err != nil || len(files) != 0 {
		t.Fatalf("creation temporaries remain: %v, %v", files, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	info := store.Info(testContext)
	if info.StorageStatus != "unavailable" || info.Error.Code != kernel.CodeIO {
		t.Fatalf("closed info: %+v", info)
	}
}

func TestRecordsCASConcurrencyExactInputAndTombstones(t *testing.T) {
	store, info := testStore(t)
	initial := saveFixture(t, store, info, "editor", `{"version":1,"statement":"RETURN (","paramsText":"{\n  broken","number":9223372036854775807}`)
	key := ReadRequest{StoreID: info.StoreID, Kind: initial.Kind, ID: initial.ID}
	loaded, err := store.Read(testContext, key)
	if err != nil || !bytes.Equal(loaded.Data, initial.Data) || loaded.Revision != "1" {
		t.Fatalf("read: %+v, %v", loaded, err)
	}
	var successes int
	var winner Record
	var group sync.WaitGroup
	var mu sync.Mutex
	for range 8 {
		group.Go(func() {
			result, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &initial.Revision, MutationID: NewID(), Data: json.RawMessage(`{"version":1,"statement":"changed"}`)})
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				successes++
				winner = result
			} else if kernel.AsPublicError(err).Code != CodeChanged {
				t.Errorf("CAS: %v", err)
			}
		})
	}
	group.Wait()
	if successes != 1 || winner.Revision != "2" {
		t.Fatalf("CAS winners=%d, record=%+v", successes, winner)
	}
	read, err := store.Read(testContext, key)
	if err != nil || read.LastMutationID != winner.LastMutationID {
		t.Fatalf("lost response verification: %+v, %v", read, err)
	}
	deleted, err := store.Delete(testContext, DeleteRequest{ReadRequest: key, ExpectedRevision: &winner.Revision, MutationID: NewID()})
	if err != nil || !deleted.Deleted || deleted.Revision != "3" || string(deleted.Data) != "null" {
		t.Fatalf("delete: %+v, %v", deleted, err)
	}
	var payload any
	if err := store.db.QueryRow("SELECT data FROM records WHERE id=?", initial.ID).Scan(&payload); err != nil || payload != nil {
		t.Fatalf("tombstone retained data: %v, %v", payload, err)
	}
	for _, revision := range []*string{nil, &initial.Revision, &deleted.Revision} {
		_, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: revision, MutationID: NewID(), Data: json.RawMessage(`{"version":1}`)})
		wantCode(t, err, CodeChanged)
	}
	tombstone, err := store.Read(testContext, key)
	if err != nil || !tombstone.Deleted || string(tombstone.Data) != "null" {
		t.Fatalf("read tombstone: %+v, %v", tombstone, err)
	}
	missing := key
	missing.ID = NewID()
	_, err = store.Read(testContext, missing)
	wantCode(t, err, CodeNotFound)
	_, err = store.Delete(testContext, DeleteRequest{ReadRequest: missing, ExpectedRevision: &initial.Revision, MutationID: NewID()})
	wantCode(t, err, CodeChanged)
	_, err = store.Delete(testContext, DeleteRequest{ReadRequest: key, MutationID: NewID()})
	wantCode(t, err, kernel.CodeInvalidArgument)
	key.StoreID = NewID()
	_, err = store.Read(testContext, key)
	wantCode(t, err, CodeChanged)
}

func TestDecimalRevisionAndFailedWritesPreserveConfirmedRecord(t *testing.T) {
	store, info := testStore(t)
	record := saveFixture(t, store, info, "workspace", `{"version":1,"raw":"unchanged"}`)
	large := "90071992547409929999999999999999999999"
	if _, err := store.db.Exec("UPDATE records SET revision=? WHERE id=?", large, record.ID); err != nil {
		t.Fatal(err)
	}
	key := ReadRequest{StoreID: info.StoreID, Kind: record.Kind, ID: record.ID}
	updated, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &large, MutationID: NewID(), Data: record.Data})
	if err != nil || updated.Revision != "90071992547409930000000000000000000000" {
		t.Fatalf("decimal revision: %+v, %v", updated, err)
	}
	request := SaveRequest{ReadRequest: key, ExpectedRevision: &updated.Revision, MutationID: NewID(), Data: json.RawMessage(`{"version":1,"raw":"replacement"}`)}
	store.logicalLimit = recordBytes(updated) - 1
	_, err = store.Save(testContext, request)
	wantCode(t, err, kernel.CodeResource)
	store.logicalLimit = LogicalLimit
	store.physicalLimit = fileSize(store.path) + 4096
	_, err = store.Save(testContext, request)
	wantCode(t, err, kernel.CodeResource)
	store.physicalLimit = PhysicalLimit
	ctx, cancel := context.WithCancel(testContext)
	cancel()
	_, err = store.Save(ctx, request)
	wantCode(t, err, kernel.CodeIO)
	read, err := store.Read(testContext, key)
	if err != nil || read.Revision != updated.Revision || !bytes.Equal(read.Data, updated.Data) {
		t.Fatalf("failure replaced confirmation: %+v, %v", read, err)
	}
	_, err = store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &updated.Revision, MutationID: NewID(), Data: json.RawMessage(`{"version":1,"large":"` + strings.Repeat("x", RecordLimit) + `"}`)})
	wantCode(t, err, kernel.CodeResource)
}

func TestListSnapshotBoundariesRepeatAndExpiry(t *testing.T) {
	store, info := testStore(t)
	var records []Record
	for range 5 {
		records = append(records, saveFixture(t, store, info, "query", `{"version":1,"statement":"RETURN 1"}`))
	}
	input := ListRequest{StoreID: info.StoreID, Kind: "query", Limit: intPointer(2)}
	first, err := store.List(testContext, input)
	if err != nil || len(first.Items) != 2 || first.Cursor == "" {
		t.Fatalf("first page: %+v, %v", first, err)
	}
	for _, record := range records {
		_, err := store.Delete(testContext, DeleteRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "query", ID: record.ID}, ExpectedRevision: &record.Revision, MutationID: NewID()})
		if err != nil {
			t.Fatal(err)
		}
	}
	saveFixture(t, store, info, "query", `{"version":1}`)
	input.Cursor = first.Cursor
	second, err := store.List(testContext, input)
	if err != nil || len(second.Items) != 2 || second.Items[0].Deleted || second.Items[0].Revision != "1" {
		t.Fatalf("snapshot page: %+v, %v", second, err)
	}
	repeated, err := store.List(testContext, input)
	if err != nil || repeated.Cursor != second.Cursor || repeated.Items[0] != second.Items[0] {
		t.Fatalf("repeat cursor changed page: %+v, %v", repeated, err)
	}
	input.Cursor = second.Cursor
	last, err := store.List(testContext, input)
	if err != nil || len(last.Items) != 1 || last.Cursor != "" {
		t.Fatalf("last page: %+v, %v", last, err)
	}
	invalidInputs := []ListRequest{
		{StoreID: info.StoreID, Kind: "query", Limit: intPointer(0)},
		{StoreID: info.StoreID, Kind: "query", Limit: intPointer(1001)},
		{StoreID: info.StoreID, Kind: "other"},
		{StoreID: info.StoreID, Kind: "query", Limit: intPointer(3), Cursor: first.Cursor},
		{StoreID: info.StoreID, Kind: "draft", Limit: intPointer(2), Cursor: first.Cursor},
		{StoreID: info.StoreID, Kind: "query", Cursor: "malformed"},
	}
	for _, input := range invalidInputs {
		_, err := store.List(testContext, input)
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	store.now = func() time.Time { return time.Now().Add(6 * time.Minute) }
	input.Cursor = first.Cursor
	_, err = store.List(testContext, input)
	wantCode(t, err, kernel.CodeInvalidArgument)
	input.Cursor = ""
	input.Limit = nil
	fresh, err := store.List(testContext, input)
	if err != nil || len(fresh.Items) != 6 {
		t.Fatalf("fresh snapshot: %+v, %v", fresh, err)
	}
	empty, err := store.List(testContext, ListRequest{StoreID: info.StoreID, Kind: "editor"})
	if err != nil || empty.Items == nil || len(empty.Items) != 0 {
		t.Fatalf("empty list: %+v, %v", empty, err)
	}
}

func TestPreserveCorruptFutureAndMismatchedStores(t *testing.T) {
	t.Run("corrupt", func(t *testing.T) {
		root := filepath.Join(t.TempDir(), "web")
		if err := os.Mkdir(root, 0o700); err != nil {
			t.Fatal(err)
		}
		original := []byte("not a SQLite database; preserve recovery evidence")
		path := filepath.Join(root, "ui.db")
		if err := os.WriteFile(path, original, 0o600); err != nil {
			t.Fatal(err)
		}
		store := New(root, testDatabase)
		defer store.Close()
		info := store.Info(testContext)
		if info.StorageStatus != "unavailable" || info.Error.Code != kernel.CodeConsistency || info.StoreID != "" {
			t.Fatalf("corrupt info: %+v", info)
		}
		_, err := store.Export(testContext)
		wantCode(t, err, kernel.CodeConsistency)
		actual, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(actual, original) {
			t.Fatalf("corrupt original changed: %s, %v", actual, err)
		}
	})
	for _, mode := range []string{"mismatch", "unsupported"} {
		t.Run(mode, func(t *testing.T) {
			original, info := testStore(t)
			record := saveFixture(t, original, info, "editor", `{"version":1,"statement":"recovery input"}`)
			if mode == "unsupported" {
				if _, err := original.db.Exec("UPDATE metadata SET format_version=2"); err != nil {
					t.Fatal(err)
				}
			}
			if err := original.Close(); err != nil {
				t.Fatal(err)
			}
			databaseID := testDatabase
			if mode == "mismatch" {
				databaseID = "different-database"
			}
			store := New(original.root, databaseID)
			defer store.Close()
			info = store.Info(testContext)
			if info.StorageStatus != mode || info.Error == nil || info.StoreID == "" {
				t.Fatalf("%s info: %+v", mode, info)
			}
			key := ReadRequest{StoreID: info.StoreID, Kind: record.Kind, ID: record.ID}
			code := kernel.CodeConsistency
			if mode == "unsupported" {
				code = kernel.CodeUnsupportedOperation
			}
			_, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &record.Revision, MutationID: NewID(), Data: record.Data})
			wantCode(t, err, code)
			read, err := store.Read(testContext, key)
			if mode == "mismatch" {
				if err != nil || !bytes.Equal(read.Data, record.Data) {
					t.Fatalf("recovery read: %+v, %v", read, err)
				}
			} else {
				wantCode(t, err, code)
			}
			exported, err := store.Export(testContext)
			if err != nil {
				t.Fatalf("%s export: %v", mode, err)
			}
			defer exported.Close()
			copyDB, err := openSQLite(exported.path, true)
			if err != nil {
				t.Fatal(err)
			}
			defer copyDB.Close()
			var text []byte
			if err := copyDB.QueryRow("SELECT data FROM records WHERE id=?", record.ID).Scan(&text); err != nil || !bytes.Equal(text, record.Data) {
				t.Fatalf("export original payload: %s, %v", text, err)
			}
		})
	}
}

func TestCreationAndPathFailuresLeaveNoPublishedHalfStore(t *testing.T) {
	root := filepath.Join(t.TempDir(), "web")
	store := New(root, testDatabase)
	defer store.Close()
	ctx, cancel := context.WithCancel(testContext)
	cancel()
	info := store.Info(ctx)
	if info.StorageStatus != "unavailable" || info.Error.Code != kernel.CodeIO {
		t.Fatalf("cancelled create: %+v", info)
	}
	if _, err := os.Stat(store.path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("half database published: %v", err)
	}
	files, err := os.ReadDir(root)
	if err != nil || len(files) != 0 {
		t.Fatalf("failed creation leaked files: %v, %v", files, err)
	}
	if info := store.Info(testContext); info.StorageStatus != "ready" {
		t.Fatalf("retry creation: %+v", info)
	}
	if runtime.GOOS == "windows" {
		return
	}
	for _, target := range []string{"web", "ui.db", "ui.db-wal", "ui.db-shm", "ui.db-journal"} {
		t.Run(target, func(t *testing.T) {
			parent := t.TempDir()
			root := filepath.Join(parent, "web")
			outside := t.TempDir()
			if target != "web" {
				if err := os.Mkdir(root, 0o700); err != nil {
					t.Fatal(err)
				}
				outside = filepath.Join(outside, "target")
				if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			link := root
			if target != "web" {
				link = filepath.Join(root, target)
			}
			if err := os.Symlink(outside, link); err != nil {
				t.Fatal(err)
			}
			store := New(root, testDatabase)
			defer store.Close()
			if info := store.Info(testContext); info.StorageStatus != "unavailable" || info.Error.Code != kernel.CodeIO {
				t.Fatalf("redirected path accepted: %+v", info)
			}
			if target != "web" {
				actual, err := os.ReadFile(outside)
				if err != nil || string(actual) != "outside" {
					t.Fatalf("outside changed: %s %v", actual, err)
				}
			}
		})
	}
}

func TestExportVacuumRemovesDeletedTextAndCleansTemporary(t *testing.T) {
	store, info := testStore(t)
	marker := "deleted-secret-payload-unique-fixture-1234567890"
	record := saveFixture(t, store, info, "draft", `{"version":1,"subtype":"object","text":"`+marker+`"}`)
	_, err := store.Delete(testContext, DeleteRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: record.Kind, ID: record.ID}, ExpectedRevision: &record.Revision, MutationID: NewID()})
	if err != nil {
		t.Fatal(err)
	}
	exported, err := store.Export(testContext)
	if err != nil {
		t.Fatal(err)
	}
	path := exported.path
	data, err := os.ReadFile(path)
	if err != nil || !bytes.HasPrefix(data, []byte("SQLite format 3")) || bytes.Contains(data, []byte(marker)) {
		t.Fatalf("unclean export: %v", err)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("export privacy: %+v, %v", info, err)
		}
	}
	if err := exported.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("export temporary leaked: %v", err)
	}
	ctx, cancel := context.WithCancel(testContext)
	cancel()
	_, err = store.Export(ctx)
	wantCode(t, err, kernel.CodeIO)
	files, err := filepath.Glob(filepath.Join(store.root, ".ui-export-*"))
	if err != nil || len(files) != 0 {
		t.Fatalf("failed export leaked: %v, %v", files, err)
	}
}

func TestValidationRejectsEnvelopeButPreservesIncompleteText(t *testing.T) {
	store, info := testStore(t)
	key := ReadRequest{StoreID: info.StoreID, Kind: "editor", ID: NewID()}
	invalidData := []string{`null`, `[]`, `{}`, `{"version":2}`, `{"version":"1"}`, `{"version":1} {}`, `{"version":1,"statement":`}
	for _, data := range invalidData {
		_, err := store.Save(testContext, SaveRequest{ReadRequest: key, MutationID: NewID(), Data: json.RawMessage(data)})
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	for _, revision := range []string{"", "0", "01", "-1", "1.1", "a", strings.Repeat("9", 129)} {
		_, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &revision, MutationID: NewID(), Data: json.RawMessage(`{"version":1}`)})
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	for _, id := range []string{"../escape", strings.ToUpper(NewID()), "", strings.Replace(NewID(), "-", "x", 1)} {
		bad := key
		bad.ID = id
		_, err := store.Read(testContext, bad)
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	bad := key
	bad.Kind = "object"
	_, err := store.Read(testContext, bad)
	wantCode(t, err, kernel.CodeInvalidArgument)
	_, err = store.Save(testContext, SaveRequest{ReadRequest: key, MutationID: "bad", Data: json.RawMessage(`{"version":1}`)})
	wantCode(t, err, kernel.CodeInvalidArgument)
	for _, kind := range []string{"draft", "frame"} {
		key.Kind = kind
		_, err := store.Save(testContext, SaveRequest{ReadRequest: key, MutationID: NewID(), Data: json.RawMessage(`{"version":1}`)})
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	for _, subtype := range []string{"object", "merge", "state-data"} {
		saveFixture(t, store, info, "draft", `{"version":1,"subtype":"`+subtype+`","text":"{ broken"}`)
	}
}
