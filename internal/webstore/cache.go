package webstore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const cacheTTL = 7 * 24 * time.Hour

type cacheEntry struct {
	Fingerprint       string
	Size              int64
	Created, LastUsed time.Time
}

type cacheFile struct {
	Version     int         `json:"version"`
	StoreID     string      `json:"storeId"`
	DatabaseID  string      `json:"databaseId"`
	FrameID     string      `json:"frameId"`
	Fingerprint string      `json:"fingerprint"`
	Created     time.Time   `json:"created"`
	Result      CacheResult `json:"result"`
}

func validCommit(state string) bool {
	if len(state) != 71 || !strings.HasPrefix(state, "commit/") {
		return false
	}
	for _, character := range state[7:] {
		if !(character >= '0' && character <= '9' || character >= 'a' && character <= 'f') {
			return false
		}
	}
	return true
}

func validateCache(input CacheWriteRequest) error {
	if !validID(input.StoreID) || !validID(input.FrameID) || !validRevision(input.FrameRevision) {
		return invalid("Web cache requires storeId, frameId, and frameRevision")
	}
	result := input.Result
	if !validCommit(result.State) || result.ValueEncoding != "lithograph-json-v1" || result.Columns == nil || result.Rows == nil {
		return invalid("Web cache requires complete typed rows, columns, and pinned state")
	}
	for _, row := range result.Rows {
		if row == nil || len(row) != len(result.Columns) {
			return invalid("Web cache row does not match columns")
		}
		for _, value := range row {
			if !validLithographValue(value) {
				return invalid("Web cache contains an invalid Lithograph JSON v1 value")
			}
		}
	}
	return nil
}

func (store *Store) fingerprint(record Record) (string, string, bool) {
	if record.Deleted {
		return "", "", false
	}
	var frame frameData
	if json.Unmarshal(record.Data, &frame) != nil || frame.Mode != "query" || frame.Status != "complete" || frame.Closed == nil || *frame.Closed || frame.Statement == nil || frame.Params == nil || !validCommit(frame.ReadState) || frame.ResultState != frame.ReadState {
		return "", "", false
	}
	params, err := frame.parameters()
	if err != nil {
		return "", "", false
	}
	binding := struct {
		StoreID, DatabaseID, FrameID, State, Statement, ValueEncoding string
		Params                                                        map[string]json.RawMessage
	}{
		store.metadata.StoreID, store.metadata.DatabaseID, record.ID, frame.ReadState, *frame.Statement, "lithograph-json-v1", params}
	encoded, _ := json.Marshal(binding)
	hash := sha256.Sum256(encoded)
	return hex.EncodeToString(hash[:]), frame.ReadState, true
}

func (store *Store) cachePath(frameID string) string {
	return filepath.Join(store.cacheDir, frameID+".json")
}

func (store *Store) invalidateCache(frameID string) {
	delete(store.cache, frameID)
	if guardPath(store.cacheDir, true, false) == nil && guardPath(store.cachePath(frameID), false, false) == nil {
		_ = os.Remove(store.cachePath(frameID))
	}
}

func (store *Store) loadCache(frameID string) (cacheFile, int64, error) {
	path := store.cachePath(frameID)
	if err := guardPath(store.cacheDir, true, false); err != nil {
		return cacheFile{}, 0, err
	}
	if err := guardPath(path, false, false); err != nil {
		return cacheFile{}, 0, err
	}
	file, err := os.Open(path)
	if err != nil {
		return cacheFile{}, 0, err
	}
	defer file.Close()
	encoded, err := io.ReadAll(io.LimitReader(file, store.itemLimit+1))
	if err != nil {
		return cacheFile{}, 0, err
	}
	var cached cacheFile
	if int64(len(encoded)) > store.itemLimit || json.Unmarshal(encoded, &cached) != nil || cached.Version != 1 || cached.StoreID != store.metadata.StoreID || cached.DatabaseID != store.metadata.DatabaseID || cached.FrameID != frameID || cached.Created.IsZero() || cached.Created.After(store.now()) || !store.now().Before(cached.Created.Add(cacheTTL)) {
		return cacheFile{}, 0, invalid("Web cache is unavailable")
	}
	return cached, int64(len(encoded)), nil
}

func (store *Store) scanCache() bool {
	if err := privateDirectory(store.cacheDir); err != nil {
		return false
	}
	cleanTemporaries(store.cacheDir, ".cache-")
	directory, err := os.Open(store.cacheDir)
	if err != nil {
		return false
	}
	defer directory.Close()
	store.cache = make(map[string]*cacheEntry)
	for {
		files, err := directory.ReadDir(256)
		if err != nil && err != io.EOF {
			return false
		}
		for _, file := range files {
			id := strings.TrimSuffix(file.Name(), ".json")
			if !strings.HasSuffix(file.Name(), ".json") || !validID(id) {
				continue
			}
			cached, size, loadErr := store.loadCache(id)
			if loadErr != nil {
				store.invalidateCache(id)
				continue
			}
			lastUsed := cached.Created
			if info, err := os.Stat(store.cachePath(id)); err == nil {
				lastUsed = info.ModTime()
			}
			store.cache[id] = &cacheEntry{Fingerprint: cached.Fingerprint, Size: size, Created: cached.Created, LastUsed: lastUsed}
			if len(store.cache) > 16384 {
				store.evictCache(0)
			}
		}
		if err == io.EOF {
			break
		}
	}
	store.evictCache(0)
	return true
}

func (store *Store) evictCache(extra int64) {
	var total int64
	for id, entry := range store.cache {
		if !store.now().Before(entry.Created.Add(cacheTTL)) {
			store.invalidateCache(id)
		} else {
			total += entry.Size
		}
	}
	for total+extra > store.cacheLimit || len(store.cache) >= 16384 {
		var oldest string
		for id, entry := range store.cache {
			if oldest == "" || entry.LastUsed.Before(store.cache[oldest].LastUsed) {
				oldest = id
			}
		}
		if oldest == "" {
			return
		}
		total -= store.cache[oldest].Size
		store.invalidateCache(oldest)
	}
}

func (store *Store) CacheWrite(ctx context.Context, input CacheWriteRequest) (CacheWriteResult, error) {
	if err := validateCache(input); err != nil {
		return CacheWriteResult{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.check(ctx, input.StoreID, true); err != nil {
		return CacheWriteResult{}, err
	}
	record, err := store.read(ctx, ReadRequest{StoreID: input.StoreID, Kind: "frame", ID: input.FrameID})
	if err != nil {
		return CacheWriteResult{}, err
	}
	if record.Deleted || record.Revision != input.FrameRevision {
		return CacheWriteResult{}, changed("frame", input.FrameID, &record)
	}
	fingerprint, state, eligible := store.fingerprint(record)
	if !eligible || state != input.Result.State {
		return CacheWriteResult{}, invalid("Web cache requires an open, complete query frame at the same state")
	}
	cached := cacheFile{Version: 1, StoreID: store.metadata.StoreID, DatabaseID: store.metadata.DatabaseID, FrameID: input.FrameID, Fingerprint: fingerprint, Created: store.now(), Result: input.Result}
	encoded, err := json.Marshal(cached)
	if err != nil {
		return CacheWriteResult{}, invalid("Web cache result is invalid")
	}
	if int64(len(encoded)) > store.itemLimit || int64(len(encoded)) > store.cacheLimit {
		return CacheWriteResult{}, nil
	}
	// Recover the disposable LRU index from private files after daemon restart.
	if !store.cacheLoaded {
		store.cacheLoaded = store.scanCache()
		if !store.cacheLoaded {
			return CacheWriteResult{}, nil
		}
	}
	store.invalidateCache(input.FrameID)
	store.evictCache(int64(len(encoded)))
	if err := guardPath(store.cacheDir, true, false); err != nil {
		return CacheWriteResult{}, nil
	}
	if err := guardPath(store.cachePath(input.FrameID), false, true); err != nil {
		return CacheWriteResult{}, nil
	}
	file, err := privateTemp(store.cacheDir, ".cache-*")
	if err != nil {
		return CacheWriteResult{}, nil
	}
	path := file.Name()
	defer os.Remove(path)
	_, writeErr := file.Write(encoded)
	if writeErr == nil {
		writeErr = file.Sync()
	}
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		return CacheWriteResult{}, nil
	}
	if guardPath(store.cacheDir, true, false) != nil || guardPath(store.cachePath(input.FrameID), false, true) != nil {
		return CacheWriteResult{}, nil
	}
	if os.Rename(path, store.cachePath(input.FrameID)) != nil || syncDirectory(store.cacheDir) != nil {
		return CacheWriteResult{}, nil
	}
	_ = os.Chtimes(store.cachePath(input.FrameID), cached.Created, cached.Created)
	store.cache[input.FrameID] = &cacheEntry{Fingerprint: fingerprint, Size: int64(len(encoded)), Created: cached.Created, LastUsed: cached.Created}
	return CacheWriteResult{Stored: true}, nil
}

func (store *Store) CacheRead(ctx context.Context, input CacheRequest) (CacheReadResult, error) {
	if !validID(input.StoreID) || !validID(input.FrameID) {
		return CacheReadResult{}, invalid("Web cache requires storeId and frameId")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.check(ctx, input.StoreID, false); err != nil {
		return CacheReadResult{}, err
	}
	if store.metadata.StorageStatus != "ready" {
		return CacheReadResult{}, nil
	}
	record, err := store.read(ctx, ReadRequest{StoreID: input.StoreID, Kind: "frame", ID: input.FrameID})
	if err != nil {
		if public, ok := err.(*kernel.PublicError); ok && public.Code == CodeNotFound {
			return CacheReadResult{}, nil
		}
		return CacheReadResult{}, err
	}
	fingerprint, _, eligible := store.fingerprint(record)
	if !eligible {
		store.invalidateCache(input.FrameID)
		return CacheReadResult{}, nil
	}
	if !store.cacheLoaded {
		store.cacheLoaded = store.scanCache()
		if !store.cacheLoaded {
			return CacheReadResult{}, nil
		}
	}
	cached, size, err := store.loadCache(input.FrameID)
	if err != nil || cached.Fingerprint != fingerprint {
		store.invalidateCache(input.FrameID)
		return CacheReadResult{}, nil
	}
	if err := validateCache(CacheWriteRequest{CacheRequest: input, FrameRevision: record.Revision, Result: cached.Result}); err != nil {
		store.invalidateCache(input.FrameID)
		return CacheReadResult{}, nil
	}
	if cached.Result.State != recordState(record) {
		store.invalidateCache(input.FrameID)
		return CacheReadResult{}, nil
	}
	store.cache[input.FrameID] = &cacheEntry{Fingerprint: fingerprint, Size: size, Created: cached.Created, LastUsed: store.now()}
	_ = os.Chtimes(store.cachePath(input.FrameID), store.now(), store.now())
	return CacheReadResult{Hit: true, Result: &cached.Result}, nil
}

func recordState(record Record) string {
	var frame frameData
	_ = json.Unmarshal(record.Data, &frame)
	return frame.ReadState
}

func (store *Store) CacheClear(ctx context.Context, input CacheClearRequest) (CacheClearResult, error) {
	if !validID(input.StoreID) {
		return CacheClearResult{}, invalid("Web cache requires storeId")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.check(ctx, input.StoreID, true); err != nil {
		return CacheClearResult{}, err
	}
	if !store.cacheLoaded {
		store.cacheLoaded = store.scanCache()
	}
	result := CacheClearResult{}
	for id := range store.cache {
		path := store.cachePath(id)
		if guardPath(store.cacheDir, true, false) == nil && guardPath(path, false, false) == nil && os.Remove(path) == nil {
			result.Cleared++
		}
		delete(store.cache, id)
	}
	return result, nil
}
