//go:build lithograph_smoke

package lithograph

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"
)

// SQLite admits only one physical writer at a time. Separate write
// connections may be contending while processing independent Branches; a
// read connection must not inherit the longer write contention budget.
// Verify actual SQLite connection pragmas, not just a DSN string constant.
func TestPhase38WriterBusyTimeoutAndPoolIsolation(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(context.Background(), paths.Database, integrationExtensions(t),
		"unicode61", integrationSemantic(paths, false))
	if err != nil {
		t.Fatal(err)
	}
	defer host.Close()

	for _, tc := range []struct {
		name   string
		db     *sql.DB
		wantMS int
		wantN  int
	}{
		{name: "writer", db: host.writeDB, wantMS: 15000, wantN: 4},
		{name: "reader", db: host.readDB, wantMS: 5000, wantN: 8},
	} {
		t.Run(tc.name, func(t *testing.T) {
			connection, err := tc.db.Conn(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			defer connection.Close()
			var got int
			if err := connection.QueryRowContext(context.Background(), "PRAGMA busy_timeout").Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != tc.wantMS {
				t.Fatalf("%s SQLite busy_timeout=%d ms, want %d ms", tc.name, got, tc.wantMS)
			}
			if open := tc.db.Stats().MaxOpenConnections; open != tc.wantN {
				t.Fatalf("%s pool max open=%d, want %d", tc.name, open, tc.wantN)
			}
		})
	}
}

// Prove the timeout is effective for actual competing SQLite writes rather
// than merely checking DSN configuration. The second connection starts its
// own BEGIN IMMEDIATE while a different write connection holds the WAL lock.
func TestPhase38WriterWaitsPastOldBusyLimit(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(context.Background(), paths.Database, integrationExtensions(t),
		"unicode61", integrationSemantic(paths, false))
	if err != nil {
		t.Fatal(err)
	}
	defer host.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	held, err := host.writeDB.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	waiting, err := host.writeDB.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer waiting.Close()
	if _, err := held.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = held.ExecContext(context.Background(), "ROLLBACK") }()

	entered := make(chan struct{})
	result := make(chan error, 1)
	go func() {
		close(entered)
		_, beginErr := waiting.ExecContext(ctx, "BEGIN IMMEDIATE")
		result <- beginErr
	}()
	<-entered
	// 6 seconds exceeds the original SQLite busy timeout of 5 seconds.
	time.Sleep(6 * time.Second)
	select {
	case beginErr := <-result:
		t.Fatalf("second writer stopped before write lock released: %v", beginErr)
	default:
	}
	if _, err := held.ExecContext(ctx, "ROLLBACK"); err != nil {
		t.Fatalf("release first writer: %v", err)
	}
	select {
	case beginErr := <-result:
		if beginErr != nil {
			t.Fatalf("second writer failed despite released lock: %v", beginErr)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("second writer did not resume after lock release")
	}
	if _, err := waiting.ExecContext(ctx, "ROLLBACK"); err != nil {
		t.Fatalf("release second writer: %v", err)
	}
}

// The same context-aware Begin must continue after the competing SQLite
// writer finally releases its lock, without applying the caller's mutation
// more than once or publishing a partial graph history.
func TestPhase38BeginContinuesAfterLongWriterLock(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(context.Background(), paths.Database, integrationExtensions(t),
		"unicode61", integrationSemantic(paths, false))
	if err != nil {
		t.Fatal(err)
	}
	defer host.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	base, err := host.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	held, err := host.writeDB.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	if _, err := held.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = held.ExecContext(context.Background(), "ROLLBACK") }()
	type result struct {
		transaction *Transaction
		err         error
	}
	done := make(chan result, 1)
	go func() {
		tx, beginErr := host.Begin(ctx, map[string]any{"branch": "main", "expectedHead": base})
		done <- result{transaction: tx, err: beginErr}
	}()
	time.Sleep(6 * time.Second)
	select {
	case got := <-done:
		if got.transaction != nil {
			_ = got.transaction.Close()
		}
		t.Fatalf("Begin finished while another writer held the lock: %v", got.err)
	default:
	}
	if _, err := held.ExecContext(ctx, "ROLLBACK"); err != nil {
		t.Fatal(err)
	}
	var tx *Transaction
	select {
	case got := <-done:
		if got.err != nil {
			t.Fatalf("Begin did not recover after lock release: %v", got.err)
		}
		tx = got.transaction
	case <-time.After(4 * time.Second):
		t.Fatal("Begin did not recover after the SQLite lock was released")
	}
	if tx == nil {
		t.Fatal("no transaction after successful Begin")
	}
	defer tx.Close()
	if _, err := tx.Execute(ctx, "CREATE (:Phase38BeginWaitRecovered)", nil, nil); err != nil {
		t.Fatal(err)
	}
	_, err = tx.Commit(ctx)
	if err != nil {
		t.Fatalf("Commit after long lock wait: %v", err)
	}
	after, err := host.Query(ctx, QueryRequest{At: "branch/main", Cypher: "MATCH (n:Phase38BeginWaitRecovered) RETURN count(n) AS count"})
	if err != nil {
		t.Fatal(err)
	}
	if after.State == base || resultInteger(t, after.Result, 0, "count") != 1 {
		t.Fatalf("long-lock write did not commit exactly once: %+v", after)
	}
}

// The Host layer must interrupt its pre-transaction wait when the real
// caller Context expires. Raw SQLite busy handlers cannot interrupt until
// their current slice finishes; Begin is responsible for those short slices.
func TestPhase38BusyWriterRespectsCanceledRequest(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(context.Background(), paths.Database, integrationExtensions(t),
		"unicode61", integrationSemantic(paths, false))
	if err != nil {
		t.Fatal(err)
	}
	defer host.Close()
	ctx := context.Background()
	held, err := host.writeDB.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	if _, err := held.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = held.ExecContext(context.Background(), "ROLLBACK") }()
	requestCtx, cancel := context.WithTimeout(ctx, 250*time.Millisecond)
	defer cancel()
	started := time.Now()
	done := make(chan error, 1)
	go func() {
		tx, beginErr := host.Begin(requestCtx, map[string]any{"branch": "main"})
		if tx != nil {
			_ = tx.Close()
		}
		done <- beginErr
	}()
	select {
	case beginErr := <-done:
		if beginErr == nil {
			t.Fatal("cancelled writer unexpectedly began transaction")
		}
		if !errors.Is(beginErr, context.DeadlineExceeded) {
			t.Fatalf("Begin returned %v, want real request deadline", beginErr)
		}
		if elapsed := time.Since(started); elapsed > 3*time.Second {
			t.Fatalf("canceled begin held SQLite connection for %s", elapsed)
		}
	case <-time.After(3 * time.Second):
		_, _ = held.ExecContext(context.Background(), "ROLLBACK")
		<-done
		t.Fatal("Begin ignored canceled request for over 3 seconds")
	}
}

// Cancellation can arrive after tx_begin succeeds while registration waits
// on the Host lifecycle mutex. Never return an already-canceled transaction.
func TestPhase38CanceledDuringRegistrationDoesNotReturnTransaction(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(context.Background(), paths.Database, integrationExtensions(t),
		"unicode61", integrationSemantic(paths, false))
	if err != nil {
		t.Fatal(err)
	}
	defer host.Close()
	base, err := host.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	held, err := host.writeDB.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	if _, err := held.ExecContext(context.Background(), "BEGIN IMMEDIATE"); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = held.ExecContext(context.Background(), "ROLLBACK") }()

	requestCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	type attempt struct {
		tx  *Transaction
		err error
	}
	done := make(chan attempt, 1)
	go func() {
		tx, beginErr := host.Begin(requestCtx, map[string]any{
			"branch": "main", "expectedHead": base,
		})
		done <- attempt{tx: tx, err: beginErr}
	}()
	deadline := time.Now().Add(5 * time.Second)
	for host.writeDB.Stats().InUse < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if host.writeDB.Stats().InUse < 2 {
		cancel()
		<-done
		t.Fatal("Begin never acquired a competing write connection")
	}

	host.mu.Lock()
	locked := true
	defer func() {
		if locked {
			host.mu.Unlock()
		}
	}()
	if _, err := held.ExecContext(context.Background(), "ROLLBACK"); err != nil {
		cancel()
		t.Fatal(err)
	}
	// Once the writer lock is released, Begin should finish its short busy
	// slice and block at registerTransaction until we release host.mu.
	time.Sleep(1500 * time.Millisecond)
	select {
	case got := <-done:
		cancel()
		host.mu.Unlock()
		locked = false
		if got.tx != nil {
			_ = got.tx.Close()
		}
		t.Fatalf("Begin returned before registration could finish: %v", got.err)
	default:
	}
	cancel()
	host.mu.Unlock()
	locked = false
	select {
	case got := <-done:
		if got.tx != nil {
			_ = got.tx.Close()
			t.Fatal("Begin returned a transaction after its Context was canceled")
		}
		if !errors.Is(got.err, context.Canceled) {
			t.Fatalf("Begin returned %v instead of the request cancellation", got.err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("canceling while registering left Begin blocked")
	}
	host.mu.Lock()
	active := len(host.transactions)
	host.mu.Unlock()
	if active != 0 || host.writeDB.Stats().InUse != 1 {
		t.Fatalf("canceled Begin leaked a transaction or write connection: transactions=%d, in_use=%d",
			active, host.writeDB.Stats().InUse)
	}
	if got, err := host.ResolveState(context.Background(), "branch/main"); err != nil || got != base {
		t.Fatalf("canceled Begin changed durable Branch: %q, err=%v", got, err)
	}
}
