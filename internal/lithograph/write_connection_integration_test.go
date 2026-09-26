//go:build lithograph_smoke

package lithograph

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestWriteConnectionsRestoreMainAcrossGraphAndVersion(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(context.Background(), paths.Database, integrationExtensions(t), "unicode61", integrationSemantic(paths, false))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = host.Close() })
	ctx := context.Background()
	feature, err := host.CreateBranch(ctx, "feature", "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := host.Execute(ctx, ExecuteRequest{Branch: feature.Name, Cypher: "CREATE (:Phase10Feature {value: 1})"}); err != nil {
		t.Fatal(err)
	}
	main, err := host.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	source, err := host.ResolveState(ctx, "branch/feature")
	if err != nil {
		t.Fatal(err)
	}
	session, err := host.StartMerge(ctx, "main", source, main)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := host.FinalizeMerge(ctx, session.Session, session.Revision, nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := host.DeleteBranch(ctx, feature.Name); err != nil {
		t.Fatalf("delete merged Branch after Graph execute: %v", err)
	}

	// The write pool has four physical connections. Exercise all of them under
	// concurrent, branch-specific Graph operations, then let Version delete each
	// Branch without a caller-side checkout.
	const workers = 4
	for index := range workers {
		if _, err := host.CreateBranch(ctx, fmt.Sprintf("parallel-%d", index), "branch/main"); err != nil {
			t.Fatal(err)
		}
	}
	var wait sync.WaitGroup
	errorsByWorker := make(chan error, workers)
	for index := range workers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			branch := fmt.Sprintf("parallel-%d", index)
			for range 8 {
				if _, err := host.Execute(ctx, ExecuteRequest{Branch: branch, Cypher: "RETURN 1 AS value"}); err != nil {
					errorsByWorker <- err
					return
				}
			}
		}()
	}
	wait.Wait()
	close(errorsByWorker)
	for err := range errorsByWorker {
		t.Fatal(err)
	}
	for index := range workers {
		if _, err := host.DeleteBranch(ctx, fmt.Sprintf("parallel-%d", index)); err != nil {
			t.Fatalf("delete Branch after concurrent reuse: %v", err)
		}
	}
}

func TestWriteConnectionsCleanupErrorsCancellationAndUnsafeState(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(context.Background(), paths.Database, integrationExtensions(t), "unicode61", integrationSemantic(paths, false))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = host.Close() })
	ctx := context.Background()
	for _, name := range []string{"ordinary-error", "stream-error", "stream-close", "cancelled", "unsafe"} {
		if _, err := host.CreateBranch(ctx, name, "branch/main"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := host.Execute(ctx, ExecuteRequest{Branch: "ordinary-error", Cypher: "INVALID CYPHER"}); err == nil {
		t.Fatal("invalid Cypher succeeded")
	}
	if _, err := host.DeleteBranch(ctx, "ordinary-error"); err != nil {
		t.Fatalf("ordinary error leaked Branch: %v", err)
	}
	if err := host.StreamExecute(ctx, ExecuteRequest{Branch: "stream-error", Cypher: "INVALID CYPHER"}, func(Event) error {
		return nil
	}); err == nil {
		t.Fatal("invalid Cypher stream succeeded")
	}
	if _, err := host.DeleteBranch(ctx, "stream-error"); err != nil {
		t.Fatalf("stream terminal error leaked Branch: %v", err)
	}
	stop := errors.New("stop stream")
	err = host.StreamExecute(ctx, ExecuteRequest{Branch: "stream-close", Cypher: "UNWIND range(1, 10) AS value RETURN value"}, func(event Event) error {
		if event.Type == "row" {
			return stop
		}
		return nil
	})
	if !errors.Is(err, stop) {
		t.Fatalf("stream early-close error = %v", err)
	}
	if _, err := host.DeleteBranch(ctx, "stream-close"); err != nil {
		t.Fatalf("stream early-close leaked Branch: %v", err)
	}
	canceled, cancel := context.WithCancel(ctx)
	err = host.StreamExecute(canceled, ExecuteRequest{Branch: "cancelled", Cypher: "UNWIND range(1, 10) AS value RETURN value"}, func(event Event) error {
		if event.Type == "row" {
			cancel()
			return context.Canceled
		}
		return nil
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled stream error = %v", err)
	}
	if _, err := host.DeleteBranch(ctx, "cancelled"); err != nil {
		t.Fatalf("canceled stream leaked Branch: %v", err)
	}

	connection, err := host.acquireWriteConnection(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := executeRaw(ctx, connection, "CALL lithograph.branch.checkout('unsafe')", nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		t.Fatal(err)
	}
	if err := releaseWriteConnection(connection); err == nil {
		t.Fatal("active transaction was returned to the pool")
	}
	if _, err := host.DeleteBranch(ctx, "unsafe"); err != nil {
		t.Fatalf("unsafe connection was reused: %v", err)
	}
	if _, err := host.Execute(ctx, ExecuteRequest{Branch: "main", Cypher: "RETURN 1"}); err != nil {
		t.Fatalf("write pool did not recover after discard: %v", err)
	}

	transaction, err := host.Begin(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	discardConnection(transaction.connection)
	_, err = transaction.Execute(ctx, "RETURN 1", nil, nil)
	if err == nil || !strings.Contains(err.Error(), "abort failed Lithograph transaction") {
		t.Fatalf("operation and cleanup failures were not both reported: %v", err)
	}
	if _, err := host.Execute(ctx, ExecuteRequest{Branch: "main", Cypher: "RETURN 1"}); err != nil {
		t.Fatalf("write pool did not recover after failed transaction cleanup: %v", err)
	}
}
