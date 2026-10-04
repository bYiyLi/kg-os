package webstore

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhysicalBudgetIncludesAutomaticCheckpointAndRetainedWAL(t *testing.T) {
	store, info := testStore(t)
	record := saveFixture(t, store, info, "editor", `{"version":1,"text":"confirmed"}`)
	key := ReadRequest{StoreID: info.StoreID, Kind: record.Kind, ID: record.ID}
	store.physicalLimit = 5 << 20
	large := json.RawMessage(`{"version":1,"text":"` + strings.Repeat("x", 3<<20) + `"}`)
	_, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &record.Revision, MutationID: NewID(), Data: large})
	wantCode(t, err, kernel.CodeResource)
	read, err := store.Read(testContext, key)
	if err != nil || read.Revision != record.Revision || !bytes.Equal(read.Data, record.Data) {
		t.Fatalf("physical rejection replaced confirmation: %+v %v", read, err)
	}
	var spill int
	if err := store.db.QueryRow("PRAGMA cache_spill").Scan(&spill); err != nil || spill != 0 {
		t.Fatalf("cache spill allows repeated WAL page writes: %d %v", spill, err)
	}
	// This successful write exceeds wal_autocheckpoint=256 pages. SQLite grows
	// the main DB, but retains the WAL until the next explicit checkpoint.
	data := json.RawMessage(`{"version":1,"text":"` + strings.Repeat("x", 2<<20) + `"}`)
	updated, err := store.Save(testContext, SaveRequest{ReadRequest: key, ExpectedRevision: &record.Revision, MutationID: NewID(), Data: data})
	if err != nil || updated.Revision != "2" {
		t.Fatalf("within-budget checkpoint write: %+v %v", updated, err)
	}
	databaseBytes, walBytes := fileSize(store.path), fileSize(store.path+"-wal")
	if databaseBytes < 2<<20 || walBytes < 2<<20 || databaseBytes+walBytes > store.physicalLimit {
		t.Fatalf("DB+WAL exceeded physical quota: db=%d wal=%d limit=%d", databaseBytes, walBytes, store.physicalLimit)
	}
}
