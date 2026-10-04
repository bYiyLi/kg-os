package webstore

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func scanRecord(row interface{ Scan(...any) error }) (Record, error) {
	var record Record
	var data []byte
	err := row.Scan(&record.Kind, &record.ID, &record.Revision, &record.Deleted, &data, &record.LastMutationID)
	if err != nil {
		return Record{}, err
	}
	if !validKind(record.Kind) || !validID(record.ID) || !validID(record.LastMutationID) || !validRevision(record.Revision) {
		return Record{}, fmt.Errorf("invalid stored Web record")
	}
	if record.Deleted {
		record.Data = json.RawMessage("null")
	} else {
		if err := validateData(record.Kind, data); err != nil {
			return Record{}, err
		}
		record.Data = data
	}
	return record, nil
}

const recordSelect = "SELECT kind,id,revision,deleted,data,last_mutation_id FROM records WHERE kind=? AND id=?"

func (store *Store) read(ctx context.Context, input ReadRequest) (Record, error) {
	record, err := scanRecord(store.db.QueryRowContext(ctx, recordSelect, input.Kind, input.ID))
	if errors.Is(err, sql.ErrNoRows) {
		return Record{}, recordMissing(input.Kind, input.ID)
	}
	if err != nil {
		return Record{}, consistency(err)
	}
	return record, nil
}

func (store *Store) Read(ctx context.Context, input ReadRequest) (Record, error) {
	if err := validateKey(input); err != nil {
		return Record{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.check(ctx, input.StoreID, false); err != nil {
		return Record{}, err
	}
	return store.read(ctx, input)
}

func (store *Store) Save(ctx context.Context, input SaveRequest) (Record, error) {
	if err := validateMutation(input.ReadRequest, input.ExpectedRevision, input.MutationID); err != nil {
		return Record{}, err
	}
	if err := validateData(input.Kind, input.Data); err != nil {
		return Record{}, err
	}
	return store.mutate(ctx, input.ReadRequest, input.ExpectedRevision, input.MutationID, input.Data, false)
}

func (store *Store) Delete(ctx context.Context, input DeleteRequest) (Record, error) {
	if err := validateMutation(input.ReadRequest, input.ExpectedRevision, input.MutationID); err != nil {
		return Record{}, err
	}
	if input.ExpectedRevision == nil {
		return Record{}, invalid("Web delete requires expectedRevision")
	}
	return store.mutate(ctx, input.ReadRequest, input.ExpectedRevision, input.MutationID, nil, true)
}

func (store *Store) prepareWrite(ctx context.Context) error {
	var busy, logPages, checkpointed int
	if err := store.db.QueryRowContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)").Scan(&busy, &logPages, &checkpointed); err != nil {
		return storageError(err)
	}
	if busy != 0 {
		return resource()
	}
	var pageSize int64
	if err := store.db.QueryRowContext(ctx, "PRAGMA page_size").Scan(&pageSize); err != nil {
		return storageError(err)
	}
	if _, err := store.db.ExecContext(ctx, "PRAGMA cache_spill=OFF"); err != nil {
		return storageError(err)
	}
	available := store.physicalLimit - 32
	if available < 2*pageSize+24 || fileSize(store.path) >= store.physicalLimit {
		return resource()
	}
	// No cache spill means each dirty page is emitted once at commit. Reserve
	// both the resulting DB and an entire DB worth of WAL frames: automatic
	// checkpointing may grow the DB without truncating the retained WAL.
	maximum := available / (2*pageSize + 24)
	if _, err := store.db.ExecContext(ctx, "PRAGMA max_page_count="+strconv.FormatInt(maximum, 10)); err != nil {
		return storageError(err)
	}
	return nil
}

func (store *Store) mutate(ctx context.Context, key ReadRequest, expected *string, mutation string, data json.RawMessage, deleted bool) (Record, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.check(ctx, key.StoreID, true); err != nil {
		return Record{}, err
	}
	if err := store.prepareWrite(ctx); err != nil {
		return Record{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Record{}, storageError(err)
	}
	defer tx.Rollback()
	old, readErr := scanRecord(tx.QueryRowContext(ctx, recordSelect, key.Kind, key.ID))
	exists := readErr == nil
	if readErr != nil && !errors.Is(readErr, sql.ErrNoRows) {
		return Record{}, consistency(readErr)
	}
	if exists && (expected == nil || old.Deleted || old.Revision != *expected) {
		return Record{}, changed(key.Kind, key.ID, &old)
	}
	if !exists && expected != nil {
		return Record{}, changed(key.Kind, key.ID, nil)
	}
	record := Record{Header: Header{Kind: key.Kind, ID: key.ID, Revision: "1", Deleted: deleted, LastMutationID: mutation}, Data: data}
	if exists {
		record.Revision = nextRevision(old.Revision)
	}
	if len(record.Revision) > 128 {
		return Record{}, resource()
	}
	if deleted {
		record.Data = json.RawMessage("null")
	}
	var oldBytes, total int64
	if exists {
		if err := tx.QueryRowContext(ctx, "SELECT logical_bytes FROM records WHERE kind=? AND id=?", key.Kind, key.ID).Scan(&oldBytes); err != nil {
			return Record{}, storageError(err)
		}
	}
	if err := tx.QueryRowContext(ctx, "SELECT coalesce(sum(logical_bytes),0) FROM records").Scan(&total); err != nil {
		return Record{}, storageError(err)
	}
	size := recordBytes(record)
	if total-oldBytes+size > store.logicalLimit {
		return Record{}, resource()
	}
	var storedData any
	if !deleted {
		storedData = []byte(data)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO records(kind,id,revision,deleted,data,last_mutation_id,logical_bytes)
 VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,
 deleted=excluded.deleted,data=excluded.data,last_mutation_id=excluded.last_mutation_id,logical_bytes=excluded.logical_bytes`,
		key.Kind, key.ID, record.Revision, deleted, storedData, mutation, size)
	if err != nil {
		return Record{}, storageError(err)
	}
	var pageCount, pageSize int64
	if err := tx.QueryRowContext(ctx, "PRAGMA page_count").Scan(&pageCount); err != nil {
		return Record{}, storageError(err)
	}
	if err := tx.QueryRowContext(ctx, "PRAGMA page_size").Scan(&pageSize); err != nil {
		return Record{}, storageError(err)
	}
	if max(fileSize(store.path), pageCount*pageSize)+32+pageCount*(pageSize+24) > store.physicalLimit {
		return Record{}, resource()
	}
	if err := store.secureFiles(); err != nil {
		return Record{}, ioError(err)
	}
	if err := tx.Commit(); err != nil {
		return Record{}, storageError(err)
	}
	if key.Kind == "frame" {
		oldFingerprint, _, oldEligible := store.fingerprint(old)
		newFingerprint, _, newEligible := store.fingerprint(record)
		if !oldEligible || !newEligible || oldFingerprint != newFingerprint {
			store.invalidateCache(key.ID)
		}
	}
	return record, nil
}

type listSnapshot struct {
	storeID, kind string
	limit         int
	items         []Header
	bytes         int64
	expires       time.Time
}

const snapshotBudget = 64 << 20

func (store *Store) List(ctx context.Context, input ListRequest) (ListResult, error) {
	limit := 100
	if input.Limit != nil {
		limit = *input.Limit
	}
	if !validID(input.StoreID) || !validKind(input.Kind) || limit < 1 || limit > 1000 {
		return ListResult{}, invalid("Web list requires storeId, kind, and limit between 1 and 1000")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.check(ctx, input.StoreID, false); err != nil {
		return ListResult{}, err
	}
	var retained int64
	for id, snapshot := range store.snapshots {
		if !store.now().Before(snapshot.expires) {
			delete(store.snapshots, id)
		} else {
			retained += snapshot.bytes
		}
	}
	var snapshot *listSnapshot
	var snapshotID string
	offset := 0
	if input.Cursor != "" {
		var valid bool
		snapshotID, offset, valid = store.decodeCursor(input.Cursor)
		snapshot = store.snapshots[snapshotID]
		if !valid || snapshot == nil || snapshot.storeID != input.StoreID || snapshot.kind != input.Kind || snapshot.limit != limit || offset >= len(snapshot.items) {
			return ListResult{}, invalid("Web list cursor does not match its snapshot")
		}
	} else {
		snapshotID = NewID()
		snapshot = &listSnapshot{storeID: input.StoreID, kind: input.Kind, limit: limit, expires: store.now().Add(5 * time.Minute)}
		rows, err := store.db.QueryContext(ctx, "SELECT kind,id,revision,deleted,last_mutation_id FROM records WHERE kind=? ORDER BY id", input.Kind)
		if err != nil {
			return ListResult{}, storageError(err)
		}
		defer rows.Close()
		for rows.Next() {
			var header Header
			if err := rows.Scan(&header.Kind, &header.ID, &header.Revision, &header.Deleted, &header.LastMutationID); err != nil {
				return ListResult{}, storageError(err)
			}
			if !validKind(header.Kind) || !validID(header.ID) || !validRevision(header.Revision) || !validID(header.LastMutationID) {
				return ListResult{}, consistency(fmt.Errorf("invalid stored Web record header"))
			}
			encoded, _ := json.Marshal(header)
			snapshot.bytes += int64(len(encoded))
			if snapshot.bytes+retained > snapshotBudget {
				return ListResult{}, resource()
			}
			snapshot.items = append(snapshot.items, header)
		}
		if err := rows.Err(); err != nil {
			return ListResult{}, storageError(err)
		}
	}
	end := min(offset+snapshot.limit, len(snapshot.items))
	result := ListResult{Items: append([]Header{}, snapshot.items[offset:end]...)}
	if end < len(snapshot.items) {
		if input.Cursor == "" && len(store.snapshots) >= 16 {
			return ListResult{}, resource()
		}
		result.Cursor = store.encodeCursor(snapshotID, end)
		store.snapshots[snapshotID] = snapshot
	}
	return result, nil
}

func (store *Store) encodeCursor(id string, offset int) string {
	payload := []byte(id + ":" + strconv.Itoa(offset))
	mac := hmac.New(sha256.New, store.cursorKey)
	_, _ = mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (store *Store) decodeCursor(cursor string) (string, int, bool) {
	if len(cursor) > 256 {
		return "", 0, false
	}
	parts := strings.Split(cursor, ".")
	if len(parts) != 2 {
		return "", 0, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", 0, false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", 0, false
	}
	mac := hmac.New(sha256.New, store.cursorKey)
	_, _ = mac.Write(payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return "", 0, false
	}
	fields := strings.Split(string(payload), ":")
	if len(fields) != 2 || !validID(fields[0]) {
		return "", 0, false
	}
	offset, err := strconv.Atoi(fields[1])
	return fields[0], offset, err == nil && offset > 0
}
