package webstore

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func framePayload(statement, mode, status string, closed bool) json.RawMessage {
	encoded, _ := json.Marshal(map[string]any{"version": 1, "mode": mode, "statement": statement, "params": map[string]any{"limit": 1}, "readState": testState, "resultState": testState, "status": status, "closed": closed})
	return encoded
}

func cacheFixture(storeID string, frame Record) CacheWriteRequest {
	return CacheWriteRequest{CacheRequest: CacheRequest{StoreID: storeID, FrameID: frame.ID}, FrameRevision: frame.Revision,
		Result: CacheResult{State: testState, Columns: []string{"value"}, Rows: [][]json.RawMessage{{json.RawMessage(`{"$type":"Integer","value":"9223372036854775807"}`)}}, ValueEncoding: "lithograph-json-v1"}}
}

func saveFrame(t *testing.T, store *Store, info Info, mode, status string, closed bool) Record {
	t.Helper()
	return saveFixture(t, store, info, "frame", string(framePayload("RETURN $limit", mode, status, closed)))
}

func TestCacheIdentityViewportLateWritesAndTombstones(t *testing.T) {
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	input := cacheFixture(info.StoreID, frame)
	written, err := store.CacheWrite(testContext, input)
	if err != nil || !written.Stored {
		t.Fatalf("cache write: %+v, %v", written, err)
	}
	read, err := store.CacheRead(testContext, input.CacheRequest)
	if err != nil || !read.Hit || read.Result == nil || !bytes.Equal(read.Result.Rows[0][0], input.Result.Rows[0][0]) {
		t.Fatalf("typed read: %+v, %v", read, err)
	}
	var payload map[string]any
	if err := json.Unmarshal(frame.Data, &payload); err != nil {
		t.Fatal(err)
	}
	payload["viewport"] = map[string]any{"x": 1, "y": 2}
	data, _ := json.Marshal(payload)
	updated, err := store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID}, ExpectedRevision: &frame.Revision, MutationID: NewID(), Data: data})
	if err != nil {
		t.Fatal(err)
	}
	read, err = store.CacheRead(testContext, input.CacheRequest)
	if err != nil || !read.Hit {
		t.Fatalf("viewport invalidated stable query: %+v, %v", read, err)
	}
	_, err = store.CacheWrite(testContext, input)
	wantCode(t, err, CodeChanged)
	input.FrameRevision = updated.Revision
	wrongState := input
	wrongState.Result.State = "commit/" + strings.Repeat("b", 64)
	_, err = store.CacheWrite(testContext, wrongState)
	wantCode(t, err, kernel.CodeInvalidArgument)
	payload["statement"] = "RETURN 2"
	data, _ = json.Marshal(payload)
	changed, err := store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID}, ExpectedRevision: &updated.Revision, MutationID: NewID(), Data: data})
	if err != nil {
		t.Fatal(err)
	}
	read, err = store.CacheRead(testContext, input.CacheRequest)
	if err != nil || read.Hit {
		t.Fatalf("changed query cache: %+v, %v", read, err)
	}
	_, err = store.CacheWrite(testContext, input)
	wantCode(t, err, CodeChanged)
	input.FrameRevision = changed.Revision
	written, err = store.CacheWrite(testContext, input)
	if err != nil || !written.Stored {
		t.Fatalf("changed frame new cache: %+v, %v", written, err)
	}
	deleted, err := store.Delete(testContext, DeleteRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID}, ExpectedRevision: &changed.Revision, MutationID: NewID()})
	if err != nil {
		t.Fatal(err)
	}
	read, err = store.CacheRead(testContext, input.CacheRequest)
	if err != nil || read.Hit {
		t.Fatalf("deleted cache read: %+v, %v", read, err)
	}
	input.FrameRevision = deleted.Revision
	_, err = store.CacheWrite(testContext, input)
	wantCode(t, err, CodeChanged)
	input.FrameID = NewID()
	_, err = store.CacheWrite(testContext, input)
	wantCode(t, err, CodeNotFound)
	read, err = store.CacheRead(testContext, input.CacheRequest)
	if err != nil || read.Hit {
		t.Fatalf("missing cache read: %+v, %v", read, err)
	}
}

func TestCachePersistsAcrossRestartAndTTLBecomesMiss(t *testing.T) {
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	input := cacheFixture(info.StoreID, frame)
	result, err := store.CacheWrite(testContext, input)
	if err != nil || !result.Stored {
		t.Fatalf("write: %+v %v", result, err)
	}
	created := store.cache[frame.ID].Created
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := New(store.root, testDatabase)
	defer reopened.Close()
	current := reopened.Info(testContext)
	if current.StoreID != info.StoreID || current.Usage == nil || current.Usage.CacheBytes == 0 {
		t.Fatalf("reopen usage: %+v", current)
	}
	read, err := reopened.CacheRead(testContext, input.CacheRequest)
	if err != nil || !read.Hit {
		t.Fatalf("reopen result: %+v %v", read, err)
	}
	reopened.now = func() time.Time { return created.Add(cacheTTL + time.Second) }
	read, err = reopened.CacheRead(testContext, input.CacheRequest)
	if err != nil || read.Hit {
		t.Fatalf("expired result: %+v %v", read, err)
	}
	if _, err := os.Stat(reopened.cachePath(frame.ID)); !os.IsNotExist(err) {
		t.Fatalf("expired file was retained: %v", err)
	}
}

func TestCacheLRUSizeBudgetsAndClear(t *testing.T) {
	store, info := testStore(t)
	base := time.Now()
	store.now = func() time.Time { return base }
	first := saveFrame(t, store, info, "query", "complete", false)
	firstInput := cacheFixture(info.StoreID, first)
	result, err := store.CacheWrite(testContext, firstInput)
	if err != nil || !result.Stored {
		t.Fatalf("first write: %+v %v", result, err)
	}
	size := store.cache[first.ID].Size
	store.cacheLimit = 2*size + 256
	second := saveFrame(t, store, info, "query", "complete", false)
	store.now = func() time.Time { return base.Add(time.Minute) }
	result, err = store.CacheWrite(testContext, cacheFixture(info.StoreID, second))
	if err != nil || !result.Stored {
		t.Fatalf("second write: %+v %v", result, err)
	}
	store.now = func() time.Time { return base.Add(2 * time.Minute) }
	if result, err := store.CacheRead(testContext, firstInput.CacheRequest); err != nil || !result.Hit {
		t.Fatalf("touch first: %+v %v", result, err)
	}
	third := saveFrame(t, store, info, "query", "complete", false)
	store.now = func() time.Time { return base.Add(3 * time.Minute) }
	result, err = store.CacheWrite(testContext, cacheFixture(info.StoreID, third))
	if err != nil || !result.Stored {
		t.Fatalf("third write: %+v %v", result, err)
	}
	if read, err := store.CacheRead(testContext, CacheRequest{StoreID: info.StoreID, FrameID: second.ID}); err != nil || read.Hit {
		t.Fatalf("LRU retained oldest: %+v %v", read, err)
	}
	if read, err := store.CacheRead(testContext, firstInput.CacheRequest); err != nil || !read.Hit {
		t.Fatalf("LRU removed recent: %+v %v", read, err)
	}
	store.itemLimit = 100
	result, err = store.CacheWrite(testContext, firstInput)
	if err != nil || result.Stored {
		t.Fatalf("oversized result published: %+v %v", result, err)
	}
	store.itemLimit = CacheItemLimit
	if read, err := store.CacheRead(testContext, firstInput.CacheRequest); err != nil || !read.Hit {
		t.Fatalf("oversize removed prior cache: %+v %v", read, err)
	}
	cleared, err := store.CacheClear(testContext, CacheClearRequest{StoreID: info.StoreID})
	if err != nil || cleared.Cleared != 2 {
		t.Fatalf("clear: %+v %v", cleared, err)
	}
	if read, err := store.CacheRead(testContext, firstInput.CacheRequest); err != nil || read.Hit {
		t.Fatalf("clear read: %+v %v", read, err)
	}
	if loaded, err := store.Read(testContext, ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: first.ID}); err != nil || loaded.Deleted {
		t.Fatalf("cache clear damaged durable frame: %+v %v", loaded, err)
	}
}

func TestCacheRejectsNonCompleteQueriesAndMalformedValues(t *testing.T) {
	store, info := testStore(t)
	for _, fixture := range []struct {
		mode, status string
		closed       bool
	}{{"execute", "complete", false}, {"query", "partial", false}, {"query", "cancelled", false}, {"query", "running", false}, {"query", "failed", false}, {"query", "unknown", false}, {"query", "queued", false}, {"query", "complete", true}} {
		frame := saveFrame(t, store, info, fixture.mode, fixture.status, fixture.closed)
		_, err := store.CacheWrite(testContext, cacheFixture(info.StoreID, frame))
		wantCode(t, err, kernel.CodeInvalidArgument)
		read, err := store.CacheRead(testContext, CacheRequest{StoreID: info.StoreID, FrameID: frame.ID})
		if err != nil || read.Hit {
			t.Fatalf("ineligible cache read: %+v %v", read, err)
		}
	}
	frame := saveFrame(t, store, info, "query", "complete", false)
	base := cacheFixture(info.StoreID, frame)
	for _, mutate := range []func(*CacheWriteRequest){
		func(input *CacheWriteRequest) { input.StoreID = "bad" }, func(input *CacheWriteRequest) { input.FrameID = "bad" }, func(input *CacheWriteRequest) { input.FrameRevision = "0" },
		func(input *CacheWriteRequest) { input.Result.State = "branch/main" }, func(input *CacheWriteRequest) { input.Result.Columns = nil }, func(input *CacheWriteRequest) { input.Result.Rows = nil }, func(input *CacheWriteRequest) { input.Result.ValueEncoding = "other" }, func(input *CacheWriteRequest) { input.Result.Rows = [][]json.RawMessage{nil} }, func(input *CacheWriteRequest) { input.Result.Rows = [][]json.RawMessage{{}} }, func(input *CacheWriteRequest) { input.Result.Rows = [][]json.RawMessage{{json.RawMessage("broken")}} },
	} {
		input := base
		mutate(&input)
		_, err := store.CacheWrite(testContext, input)
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	_, err := store.CacheRead(testContext, CacheRequest{})
	wantCode(t, err, kernel.CodeInvalidArgument)
	_, err = store.CacheClear(testContext, CacheClearRequest{})
	wantCode(t, err, kernel.CodeInvalidArgument)
	for _, data := range []string{`{"version":1,"mode":"query","statement":"x","params":{},"closed":false,"status":"bad"}`, `{"version":1,"mode":"bad","statement":"x","params":{},"closed":false,"status":"complete"}`, `{"version":1,"mode":"query","statement":1,"params":{},"closed":false,"status":"complete"}`} {
		_, err := store.Save(testContext, SaveRequest{ReadRequest: ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: NewID()}, MutationID: NewID(), Data: json.RawMessage(data)})
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
}

func TestCacheCorruptionAndFilesystemFailureAreBestEffort(t *testing.T) {
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	input := cacheFixture(info.StoreID, frame)
	if result, err := store.CacheWrite(testContext, input); err != nil || !result.Stored {
		t.Fatalf("write: %+v %v", result, err)
	}
	if err := os.WriteFile(store.cachePath(frame.ID), []byte("broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if result, err := store.CacheRead(testContext, input.CacheRequest); err != nil || result.Hit {
		t.Fatalf("corrupt read: %+v %v", result, err)
	}
	if err := os.Mkdir(store.cachePath(frame.ID), 0o700); err != nil {
		t.Fatal(err)
	}
	if result, err := store.CacheWrite(testContext, input); err != nil || result.Stored {
		t.Fatalf("unsafe cache path write: %+v %v", result, err)
	}
	if err := os.Remove(store.cachePath(frame.ID)); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" {
		return
	}
	if err := os.Remove(store.cacheDir); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.Symlink(outside, store.cacheDir); err != nil {
		t.Fatal(err)
	}
	if result, err := store.CacheWrite(testContext, input); err != nil || result.Stored {
		t.Fatalf("redirected cache write: %+v %v", result, err)
	}
	if result, err := store.CacheRead(testContext, input.CacheRequest); err != nil || result.Hit {
		t.Fatalf("redirected cache read: %+v %v", result, err)
	}
	files, err := os.ReadDir(outside)
	if err != nil || len(files) != 0 {
		t.Fatalf("outside cache content: %v %v", files, err)
	}
	if files, err := filepath.Glob(filepath.Join(store.root, ".cache-*")); err != nil || len(files) != 0 {
		t.Fatalf("cache temp leak: %v %v", files, err)
	}
}
