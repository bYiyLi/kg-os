package observability

import (
	"context"
	"io"
	"testing"
)

func TestLossCounterPersistsAcrossRestartWithoutDoubleCounting(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	store.dropped.Add(7)
	current, err := store.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil || current.Coverage.Dropped != 7 || !current.Coverage.Truncated {
		t.Fatalf("uncommitted loss not visible: %+v %v", current.Coverage, err)
	}
	closeDiagnosticStore(t, store)

	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	previous, err := reopened.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil || previous.Coverage.Dropped != 7 || !previous.Coverage.Truncated {
		t.Fatalf("loss silently vanished or duplicated after restart: %+v %v", previous.Coverage, err)
	}
	reopened.dropped.Add(3)
	mixed, err := reopened.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil || mixed.Coverage.Dropped != 10 {
		t.Fatalf("persisted plus outstanding loss counted incorrectly: %+v %v", mixed.Coverage, err)
	}
	closeDiagnosticStore(t, reopened)
	finalStore, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, finalStore)
	final, err := finalStore.List(context.Background(), RequestListInput{})
	if err != nil || final.Coverage.Dropped != 10 {
		t.Fatalf("loss cumulative count did not survive two restarts: %+v %v", final.Coverage, err)
	}
}

func TestLossBucketsRemainBoundedByRetention(t *testing.T) {
	store, _ := newPrivateStoreForTest(t)
	defer closeDiagnosticStore(t, store)
	store.dropped.Add(1)
	ctx := context.Background()
	if err := store.writeBatch(ctx, nil); err != nil {
		t.Fatal(err)
	}
	// The bucket must be a single per-minute aggregate, not a new row for
	// every dropped request or a second unbounded event stream.
	var buckets, dropped int64
	if err := store.db.QueryRowContext(ctx,
		"SELECT COUNT(*), COALESCE(SUM(dropped),0) FROM loss_buckets").Scan(&buckets, &dropped); err != nil {
		t.Fatal(err)
	}
	if buckets != 1 || dropped != 1 {
		t.Fatalf("loss records are not bounded aggregates: buckets=%d dropped=%d", buckets, dropped)
	}
}
