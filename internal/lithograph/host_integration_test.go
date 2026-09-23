//go:build lithograph_smoke

package lithograph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestHostLifecycleQueryExecuteStreamAndReopen(t *testing.T) {
	paths := integrationPaths(t)
	extensions := integrationExtensions(t)
	semantic := integrationSemantic(paths, false)

	host, err := Open(context.Background(), paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatalf("open Lithograph host: %v", err)
	}
	baseline := host.Baseline()
	if baseline.DatabaseID == "" ||
		baseline.StorageFormat != expectedStorageFormat ||
		baseline.CypherProfile != expectedCypherProfile {
		t.Fatalf("unexpected baseline: %#v", baseline)
	}

	initial, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1 AS value",
	})
	if err != nil {
		t.Fatalf("query initial state: %v", err)
	}
	if !strings.HasPrefix(initial.State, "commit/") {
		t.Fatalf("initial state = %q", initial.State)
	}
	if got := resultInteger(t, initial.Result, 0, "value"); got != 1 {
		t.Fatalf("query value = %d", got)
	}

	if _, err := host.Execute(context.Background(), ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Phase01Host {value: 7})",
	}); err != nil {
		t.Fatalf("execute mutation: %v", err)
	}
	after, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Host) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query mutation: %v", err)
	}
	if after.State == initial.State {
		t.Fatal("mutation did not advance main state")
	}
	if got := resultInteger(t, after.Result, 0, "count"); got != 1 {
		t.Fatalf("node count = %d", got)
	}

	_, err = host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "CREATE (:ReadOnlyWrite)",
	})
	if err == nil {
		t.Fatal("read-only query accepted a write")
	}

	var events []Event
	state, err := host.StreamQuery(
		context.Background(),
		QueryRequest{
			At:     "branch/main",
			Cypher: "UNWIND range(1,3) AS value RETURN value",
		},
		func(_ string, event Event) error {
			events = append(events, event)
			return nil
		},
	)
	if err != nil {
		t.Fatalf("stream query: %v", err)
	}
	if state != after.State {
		t.Fatalf("stream state = %q, want %q", state, after.State)
	}
	if got := eventTypes(events); got != "columns,row,row,row,summary" {
		t.Fatalf("stream events = %q", got)
	}

	events = nil
	if _, err := host.StreamQuery(
		context.Background(),
		QueryRequest{
			At:     "branch/main",
			Cypher: "UNWIND [] AS value RETURN value",
		},
		func(_ string, event Event) error {
			events = append(events, event)
			return nil
		},
	); err != nil {
		t.Fatalf("stream zero-row query: %v", err)
	}
	if got := eventTypes(events); got != "columns,summary" {
		t.Fatalf("zero-row stream events = %q", got)
	}

	consumerErr := errors.New("stop consumer")
	seenRows := 0
	_, err = host.StreamQuery(
		context.Background(),
		QueryRequest{
			At:     "branch/main",
			Cypher: "UNWIND range(1,1000) AS value RETURN value",
		},
		func(_ string, event Event) error {
			if event.Type == "row" {
				seenRows++
				return consumerErr
			}
			return nil
		},
	)
	if !errors.Is(err, consumerErr) || seenRows != 1 {
		t.Fatalf("early close err=%v rows=%d", err, seenRows)
	}

	seenRows = 0
	err = host.StreamExecute(
		context.Background(),
		ExecuteRequest{
			Branch: "main",
			Cypher: "UNWIND range(1,100) AS value " +
				"CREATE (:Phase01StreamRollback {value: value}) RETURN value",
		},
		func(event Event) error {
			if event.Type == "row" {
				seenRows++
				return consumerErr
			}
			return nil
		},
	)
	if !errors.Is(err, consumerErr) || seenRows != 1 {
		t.Fatalf("write early close err=%v rows=%d", err, seenRows)
	}
	rolledBack, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01StreamRollback) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query rolled-back stream: %v", err)
	}
	if got := resultInteger(t, rolledBack.Result, 0, "count"); got != 0 {
		t.Fatalf("incomplete ordinary stream left %d durable nodes", got)
	}

	if err := host.Close(); err != nil {
		t.Fatalf("close host: %v", err)
	}
	reopened, err := Open(context.Background(), paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatalf("reopen Lithograph host: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	if reopened.Baseline() != baseline {
		t.Fatalf("reopened baseline = %#v, want %#v", reopened.Baseline(), baseline)
	}
	reopenedResult, err := reopened.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Host) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query reopened host: %v", err)
	}
	if got := resultInteger(t, reopenedResult.Result, 0, "count"); got != 1 {
		t.Fatalf("reopened node count = %d", got)
	}
}

func TestQueryPinsExactHistoricalCommit(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		integrationSemantic(paths, false),
	)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}
	defer host.Close()

	before, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Historical) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("read historical base: %v", err)
	}
	if _, err := host.Execute(context.Background(), ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Phase01Historical)",
	}); err != nil {
		t.Fatalf("advance main: %v", err)
	}
	historical, err := host.Query(context.Background(), QueryRequest{
		At:     before.State,
		Cypher: "MATCH (n:Phase01Historical) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query exact historical commit: %v", err)
	}
	if historical.State != before.State {
		t.Fatalf("historical state = %q, want %q", historical.State, before.State)
	}
	if got := resultInteger(t, historical.Result, 0, "count"); got != 0 {
		t.Fatalf("historical commit observed %d future nodes", got)
	}
}

func TestExecutionRejectsInvalidRequestsAndEncoding(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		integrationSemantic(paths, false),
	)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}
	defer host.Close()

	if _, err := host.Query(context.Background(), QueryRequest{}); err == nil {
		t.Fatal("query without state was accepted")
	}
	if _, err := host.Query(context.Background(), QueryRequest{At: "branch/main"}); err == nil {
		t.Fatal("query without Cypher was accepted")
	}
	if _, err := host.Query(context.Background(), QueryRequest{
		At: "branch/missing", Cypher: "RETURN 1",
	}); err == nil {
		t.Fatal("query with missing state was accepted")
	}
	if _, err := host.Query(context.Background(), QueryRequest{
		At: "branch/main", Cypher: "RETURN $value", Params: map[string]any{"value": func() {}},
	}); err == nil || !strings.Contains(err.Error(), "encode Lithograph params") {
		t.Fatalf("query invalid params error = %v", err)
	}

	if _, err := host.Execute(context.Background(), ExecuteRequest{}); err == nil {
		t.Fatal("execute without branch was accepted")
	}
	if _, err := host.Execute(context.Background(), ExecuteRequest{Branch: "main"}); err == nil {
		t.Fatal("execute without Cypher was accepted")
	}
	if _, err := host.Execute(context.Background(), ExecuteRequest{
		Branch: "missing", Cypher: "RETURN 1",
	}); err == nil {
		t.Fatal("execute with missing branch was accepted")
	}
	author, message := "phase01", "metadata"
	if _, err := host.Execute(context.Background(), ExecuteRequest{
		Branch: "main", Cypher: "RETURN 1 AS value", Author: &author, Message: &message,
	}); err != nil {
		t.Fatalf("execute with metadata: %v", err)
	}

	if _, err := host.StreamQuery(context.Background(), QueryRequest{}, func(string, Event) error { return nil }); err == nil {
		t.Fatal("stream query without state/Cypher was accepted")
	}
	if _, err := host.StreamQuery(
		context.Background(),
		QueryRequest{At: "branch/main", Cypher: "RETURN 1"},
		nil,
	); err == nil || !strings.Contains(err.Error(), "consumer") {
		t.Fatalf("nil query stream consumer error = %v", err)
	}
	if err := host.StreamExecute(context.Background(), ExecuteRequest{}, func(Event) error { return nil }); err == nil {
		t.Fatal("stream execute without branch/Cypher was accepted")
	}
	if err := host.StreamExecute(
		context.Background(),
		ExecuteRequest{Branch: "main", Cypher: "RETURN 1"},
		nil,
	); err == nil || !strings.Contains(err.Error(), "consumer") {
		t.Fatalf("nil execute stream consumer error = %v", err)
	}
}

func TestHostContextCancellation(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		integrationSemantic(paths, false),
	)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}
	t.Cleanup(func() { _ = host.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, err = host.StreamQuery(
		ctx,
		QueryRequest{
			At:     "branch/main",
			Cypher: "UNWIND range(1,1000000000) AS value RETURN value",
		},
		func(string, Event) error { return nil },
	)
	if err == nil {
		t.Fatal("long stream ignored context cancellation")
	}
	if !errors.Is(err, context.DeadlineExceeded) &&
		!errors.Is(err, context.Canceled) &&
		!strings.Contains(strings.ToLower(err.Error()), "interrupt") {
		t.Fatalf("cancellation error = %v", err)
	}

	if _, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1 AS value",
	}); err != nil {
		t.Fatalf("host unusable after cancellation: %v", err)
	}
}

func TestExplicitTransactionCommitAbortAndFailClosed(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		integrationSemantic(paths, false),
	)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}
	t.Cleanup(func() { _ = host.Close() })

	before, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1",
	})
	if err != nil {
		t.Fatalf("read initial state: %v", err)
	}
	transaction, err := host.Begin(context.Background(), map[string]any{
		"branch":       "main",
		"expectedHead": before.State,
		"message":      "phase01 transaction",
	})
	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}
	first, err := transaction.Execute(
		context.Background(),
		"CREATE (:Phase01Tx {value: 1})",
		nil,
		nil,
	)
	if err != nil {
		t.Fatalf("first staged mutation: %v", err)
	}
	second, err := transaction.Execute(
		context.Background(),
		"CREATE (:Phase01Tx {value: 2})",
		nil,
		nil,
	)
	if err != nil {
		t.Fatalf("second staged mutation: %v", err)
	}
	if summaryCommit(t, first) != "" || summaryCommit(t, second) != "" {
		t.Fatal("staged mutation exposed a durable commit before tx_commit")
	}
	staged, err := transaction.Execute(
		context.Background(),
		"MATCH (n:Phase01Tx) RETURN count(n) AS count",
		nil,
		nil,
	)
	if err != nil {
		t.Fatalf("read staged state: %v", err)
	}
	if got := resultInteger(t, staged, 0, "count"); got != 2 {
		t.Fatalf("staged count = %d", got)
	}
	external, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Tx) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("read durable state during transaction: %v", err)
	}
	if got := resultInteger(t, external.Result, 0, "count"); got != 0 {
		t.Fatalf("staged transaction leaked durable nodes: %d", got)
	}
	commitRaw, err := transaction.Commit(context.Background())
	if err != nil {
		t.Fatalf("commit transaction: %v", err)
	}
	commit := commitRef(t, commitRaw)
	committed, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Tx) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("read committed transaction: %v", err)
	}
	if committed.State != commit || committed.State == before.State {
		t.Fatalf("committed state=%q tx commit=%q before=%q", committed.State, commit, before.State)
	}
	if got := resultInteger(t, committed.Result, 0, "count"); got != 2 {
		t.Fatalf("committed count = %d", got)
	}

	abortTx, err := host.Begin(context.Background(), map[string]any{"branch": "main"})
	if err != nil {
		t.Fatalf("begin abort transaction: %v", err)
	}
	if _, err := abortTx.Execute(
		context.Background(),
		"CREATE (:Phase01Aborted)",
		nil,
		nil,
	); err != nil {
		t.Fatalf("stage abort node: %v", err)
	}
	if err := abortTx.Abort(context.Background()); err != nil {
		t.Fatalf("abort transaction: %v", err)
	}
	aborted, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Aborted) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query aborted transaction: %v", err)
	}
	if got := resultInteger(t, aborted.Result, 0, "count"); got != 0 {
		t.Fatalf("aborted nodes became durable: %d", got)
	}

	failing, err := host.Begin(context.Background(), map[string]any{"branch": "main"})
	if err != nil {
		t.Fatalf("begin failing transaction: %v", err)
	}
	if _, err := failing.Execute(
		context.Background(),
		"CREATE (:Phase01Failed)",
		nil,
		nil,
	); err != nil {
		t.Fatalf("stage failing node: %v", err)
	}
	if _, err := failing.Execute(context.Background(), "THIS IS NOT CYPHER", nil, nil); err == nil {
		t.Fatal("invalid Cypher unexpectedly succeeded")
	}
	if _, err := failing.Execute(context.Background(), "RETURN 1", nil, nil); err == nil ||
		!strings.Contains(err.Error(), "closed") {
		t.Fatalf("failed transaction remained usable: %v", err)
	}
	failed, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Failed) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query failed transaction: %v", err)
	}
	if got := resultInteger(t, failed.Result, 0, "count"); got != 0 {
		t.Fatalf("failed transaction leaked durable nodes: %d", got)
	}

	stale, err := host.Begin(context.Background(), map[string]any{
		"branch":       "main",
		"expectedHead": before.State,
	})
	if err == nil {
		_ = stale.Close()
		t.Fatal("stale expectedHead was accepted")
	}
}

func TestBeginDefaultsMainAndRejectsInvalidOptions(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		integrationSemantic(paths, false),
	)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}
	defer host.Close()

	before, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1 AS value",
	})
	if err != nil {
		t.Fatalf("read main before default transaction: %v", err)
	}
	transaction, err := host.Begin(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin default transaction: %v", err)
	}
	if _, err := transaction.Execute(
		context.Background(),
		"CREATE (:Phase01DefaultTx)",
		nil,
		nil,
	); err != nil {
		t.Fatalf("execute default transaction: %v", err)
	}
	commitRaw, err := transaction.Commit(context.Background())
	if err != nil {
		t.Fatalf("commit default transaction: %v", err)
	}
	commit := commitRef(t, commitRaw)
	after, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01DefaultTx) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("read main after default transaction: %v", err)
	}
	if after.State != commit || after.State == before.State {
		t.Fatalf("default transaction state=%q commit=%q before=%q", after.State, commit, before.State)
	}
	if got := resultInteger(t, after.Result, 0, "count"); got != 1 {
		t.Fatalf("default transaction node count = %d", got)
	}

	if transaction, err := host.Begin(
		context.Background(),
		map[string]any{"author": func() {}},
	); transaction != nil || err == nil || !strings.Contains(err.Error(), "encode transaction options") {
		if transaction != nil {
			_ = transaction.Close()
		}
		t.Fatalf("invalid transaction encoding error = %v", err)
	}
	if transaction, err := host.Begin(
		context.Background(),
		map[string]any{"unknown": true},
	); transaction != nil || err == nil {
		if transaction != nil {
			_ = transaction.Close()
		}
		t.Fatalf("unknown transaction option error = %v", err)
	}

	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if transaction, err := host.Begin(canceled, nil); transaction != nil || err == nil {
		if transaction != nil {
			_ = transaction.Close()
		}
		t.Fatalf("canceled Begin error = %v", err)
	}
}

func TestSemanticQueryUsesProviderOwnedCacheAcrossReadOnlyConnectionsAndReopen(t *testing.T) {
	var requests atomic.Int64
	provider := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Errorf("read embedding request: %v", err)
			response.WriteHeader(http.StatusInternalServerError)
			return
		}
		var payload struct {
			Input json.RawMessage `json:"input"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Errorf("decode embedding request: %v", err)
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		count := embeddingInputCount(t, payload.Input)
		data := make([]map[string]any, 0, count)
		for index := 0; index < count; index++ {
			data = append(data, map[string]any{
				"object":    "embedding",
				"embedding": []float64{1, 0, 0},
				"index":     index,
			})
		}
		response.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{
			"object": "list",
			"data":   data,
			"model":  "phase01-fixture",
			"usage": map[string]any{
				"prompt_tokens": 0,
				"total_tokens":  0,
			},
		})
	}))
	defer provider.Close()

	paths := integrationPaths(t)
	semantic := integrationSemantic(paths, true)
	semantic.BaseURL = provider.URL + "/v1"
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		semantic,
	)
	if err != nil {
		t.Fatalf("open host with Provider cache: %v", err)
	}
	if requests.Load() != 0 {
		_ = host.Close()
		t.Fatalf("startup readiness probe contacted Provider %d times", requests.Load())
	}

	indexOptions := map[string]any{
		"provider": "openai-compatible",
		"providerConfig": map[string]any{
			"base_url":        semantic.BaseURL,
			"model":           semantic.Model,
			"send_dimensions": false,
			"encoding_format": "float",
			"cache": map[string]any{
				"enabled":   true,
				"path":      semantic.CachePath,
				"max_bytes": semantic.CacheMaxBytes,
			},
		},
		"dimensions": semantic.Dimensions,
		"similarity": semantic.Similarity,
	}
	if _, err := host.Execute(context.Background(), ExecuteRequest{
		Branch: "main",
		Cypher: "CALL db.index.semantic.createNodeIndex($name, [$label], $property, $options)",
		Params: map[string]any{
			"name":     "phase01_semantic",
			"label":    "Phase01Semantic",
			"property": "content",
			"options":  indexOptions,
		},
	}); err != nil {
		_ = host.Close()
		t.Fatalf("create Semantic index: %v", err)
	}
	if _, err := host.Execute(context.Background(), ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Phase01Semantic {content: $content})",
		Params: map[string]any{"content": "cached semantic text"},
	}); err != nil {
		_ = host.Close()
		t.Fatalf("create Semantic source node: %v", err)
	}

	before, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1 AS value",
	})
	if err != nil {
		_ = host.Close()
		t.Fatalf("read state before Semantic query: %v", err)
	}
	query := QueryRequest{
		At: "branch/main",
		Cypher: "CALL db.index.semantic.queryNodes($index, $query, {limit: 10}) " +
			"YIELD node, score RETURN node.content AS content, score",
		Params: map[string]any{
			"index": "phase01_semantic",
			"query": "cached semantic text",
		},
	}
	first, err := host.Query(context.Background(), query)
	if err != nil {
		_ = host.Close()
		t.Fatalf("first Semantic query: %v", err)
	}
	if len(first.Result.Rows) != 1 {
		_ = host.Close()
		t.Fatalf("first Semantic rows = %d", len(first.Result.Rows))
	}
	if first.State != before.State {
		_ = host.Close()
		t.Fatalf("Semantic read changed graph state: before=%q after=%q", before.State, first.State)
	}
	initialRequests := requests.Load()
	if initialRequests == 0 {
		_ = host.Close()
		t.Fatal("Semantic query did not call the Provider")
	}
	if _, err := host.Query(context.Background(), query); err != nil {
		_ = host.Close()
		t.Fatalf("second Semantic query: %v", err)
	}
	if requests.Load() != initialRequests {
		_ = host.Close()
		t.Fatalf("warm Provider cache was missed: requests %d -> %d", initialRequests, requests.Load())
	}
	if _, err := os.Stat(semantic.CachePath); err != nil {
		_ = host.Close()
		t.Fatalf("Provider cache database was not created: %v", err)
	}
	if err := host.Close(); err != nil {
		t.Fatalf("close cached host: %v", err)
	}

	reopened, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		semantic,
	)
	if err != nil {
		t.Fatalf("reopen cached host: %v", err)
	}
	defer reopened.Close()
	if _, err := reopened.Query(context.Background(), query); err != nil {
		t.Fatalf("Semantic query after reopen: %v", err)
	}
	if requests.Load() != initialRequests {
		t.Fatalf("Provider cache did not survive reopen: requests %d -> %d", initialRequests, requests.Load())
	}
	after, err := reopened.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1 AS value",
	})
	if err != nil {
		t.Fatalf("read state after cached query: %v", err)
	}
	if after.State != before.State {
		t.Fatalf("cached Semantic read changed graph state: before=%q after=%q", before.State, after.State)
	}
}

func TestHostRejectsUnavailableFullTextAnalyzer(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"phase01_missing_tokenizer",
		integrationSemantic(paths, false),
	)
	if host != nil {
		_ = host.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "unavailable") {
		t.Fatalf("missing analyzer error = %v", err)
	}
}

func TestTransactionSubqueryUsesWriteConnection(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		integrationSemantic(paths, false),
	)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}
	defer host.Close()
	_, err = host.Execute(context.Background(), ExecuteRequest{
		Branch: "main",
		Cypher: "UNWIND range(1,5) AS value " +
			"CALL (value) { CREATE (:Phase01Batch {value: value}) } IN TRANSACTIONS OF 2 ROWS",
	})
	if err != nil {
		t.Fatalf("execute transaction subquery: %v", err)
	}
	result, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01Batch) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query transaction subquery result: %v", err)
	}
	if got := resultInteger(t, result.Result, 0, "count"); got != 5 {
		t.Fatalf("transaction subquery created %d nodes, want 5", got)
	}

	consumerErr := errors.New("stop transaction subquery stream")
	err = host.StreamExecute(
		context.Background(),
		ExecuteRequest{
			Branch: "main",
			Cypher: "UNWIND range(1,100) AS value " +
				"CALL (value) { CREATE (:Phase01DurableBatch {value: value}) } " +
				"IN TRANSACTIONS OF 2 ROWS RETURN value",
		},
		func(event Event) error {
			if event.Type == "row" {
				return consumerErr
			}
			return nil
		},
	)
	if !errors.Is(err, consumerErr) {
		t.Fatalf("transaction subquery early-close error = %v", err)
	}
	durable, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01DurableBatch) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query durable transaction-subquery batches: %v", err)
	}
	if got := resultInteger(t, durable.Result, 0, "count"); got == 0 {
		t.Fatal("early-close incorrectly rolled back already durable transaction-subquery batches")
	}
}

func TestExplicitTransactionReadCloseAndIncompleteStream(t *testing.T) {
	paths := integrationPaths(t)
	host, err := Open(
		context.Background(),
		paths.Database,
		integrationExtensions(t),
		"unicode61",
		integrationSemantic(paths, false),
	)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}
	defer host.Close()

	base, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1 AS value",
	})
	if err != nil {
		t.Fatalf("read base state: %v", err)
	}
	readTx, err := host.Begin(context.Background(), map[string]any{"branch": "main"})
	if err != nil {
		t.Fatalf("begin read transaction: %v", err)
	}
	if _, err := readTx.Execute(context.Background(), "RETURN 1 AS value", nil, nil); err != nil {
		t.Fatalf("execute read transaction: %v", err)
	}
	readCommit, err := readTx.Commit(context.Background())
	if err != nil {
		t.Fatalf("commit read transaction: %v", err)
	}
	if got := commitRef(t, readCommit); got != base.State {
		t.Fatalf("pure-read transaction commit = %q, want base %q", got, base.State)
	}

	closeTx, err := host.Begin(context.Background(), map[string]any{"branch": "main"})
	if err != nil {
		t.Fatalf("begin close transaction: %v", err)
	}
	if _, err := closeTx.Execute(
		context.Background(),
		"CREATE (:Phase01ClosedTx)",
		nil,
		nil,
	); err != nil {
		t.Fatalf("stage close transaction: %v", err)
	}
	if err := closeTx.Close(); err != nil {
		t.Fatalf("close active transaction: %v", err)
	}
	closedResult, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01ClosedTx) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query closed transaction: %v", err)
	}
	if got := resultInteger(t, closedResult.Result, 0, "count"); got != 0 {
		t.Fatalf("transaction Close left %d durable nodes", got)
	}

	streamTx, err := host.Begin(context.Background(), map[string]any{"branch": "main"})
	if err != nil {
		t.Fatalf("begin stream transaction: %v", err)
	}
	if _, err := streamTx.Execute(
		context.Background(),
		"CREATE (:Phase01IncompleteTx)",
		nil,
		nil,
	); err != nil {
		t.Fatalf("stage incomplete transaction: %v", err)
	}
	consumerErr := errors.New("stop explicit stream")
	err = streamTx.Stream(
		context.Background(),
		"UNWIND range(1,1000) AS value RETURN value",
		nil,
		nil,
		func(event Event) error {
			if event.Type == "row" {
				return consumerErr
			}
			return nil
		},
	)
	if !errors.Is(err, consumerErr) {
		t.Fatalf("incomplete explicit stream error = %v", err)
	}
	if _, err := streamTx.Execute(context.Background(), "RETURN 1", nil, nil); err == nil ||
		!strings.Contains(err.Error(), "closed") {
		t.Fatalf("incomplete explicit transaction remained usable: %v", err)
	}
	incomplete, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01IncompleteTx) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query incomplete transaction: %v", err)
	}
	if got := resultInteger(t, incomplete.Result, 0, "count"); got != 0 {
		t.Fatalf("incomplete explicit stream left %d durable nodes", got)
	}
}

func TestHostCloseCancelsActiveWorkAndAbortsIdleTransaction(t *testing.T) {
	paths := integrationPaths(t)
	extensions := integrationExtensions(t)
	semantic := integrationSemantic(paths, false)
	host, err := Open(context.Background(), paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatalf("open host: %v", err)
	}

	idleTx, err := host.Begin(context.Background(), map[string]any{"branch": "main"})
	if err != nil {
		t.Fatalf("begin idle transaction: %v", err)
	}
	if _, err := idleTx.Execute(
		context.Background(),
		"CREATE (:Phase01ShutdownRollback)",
		nil,
		nil,
	); err != nil {
		t.Fatalf("stage shutdown transaction: %v", err)
	}

	started := make(chan struct{})
	streamDone := make(chan error, 1)
	go func() {
		_, streamErr := host.StreamQuery(
			context.Background(),
			QueryRequest{
				At:     "branch/main",
				Cypher: "UNWIND range(1,1000000000) AS value RETURN value",
			},
			func(_ string, event Event) error {
				if event.Type == "columns" {
					close(started)
				}
				return nil
			},
		)
		streamDone <- streamErr
	}()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("long stream did not start")
	}

	closeDone := make(chan error, 1)
	go func() { closeDone <- host.Close() }()
	select {
	case closeErr := <-closeDone:
		if closeErr != nil {
			t.Fatalf("close host: %v", closeErr)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("host close did not cancel active work")
	}
	select {
	case streamErr := <-streamDone:
		if streamErr == nil {
			t.Fatal("active stream completed successfully during host shutdown")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("active stream did not stop after host shutdown")
	}
	if _, err := host.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "RETURN 1",
	}); err == nil || !strings.Contains(err.Error(), "closed") {
		t.Fatalf("closed host accepted new work: %v", err)
	}

	reopened, err := Open(context.Background(), paths.Database, extensions, "unicode61", semantic)
	if err != nil {
		t.Fatalf("reopen host after shutdown: %v", err)
	}
	defer reopened.Close()
	result, err := reopened.Query(context.Background(), QueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase01ShutdownRollback) RETURN count(n) AS count",
	})
	if err != nil {
		t.Fatalf("query shutdown rollback: %v", err)
	}
	if got := resultInteger(t, result.Result, 0, "count"); got != 0 {
		t.Fatalf("shutdown left %d uncommitted nodes durable", got)
	}
	if err := host.Close(); err != nil {
		t.Fatalf("close host twice: %v", err)
	}
}

func integrationPaths(t *testing.T) runtimeprofile.Paths {
	t.Helper()
	paths, err := runtimeprofile.ResolvePaths(t.TempDir())
	if err != nil {
		t.Fatalf("resolve integration paths: %v", err)
	}
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatalf("create integration paths: %v", err)
	}
	return paths
}

func integrationExtensions(t *testing.T) []runtimeprofile.ResolvedExtension {
	t.Helper()
	mainLibrary := os.Getenv("KGOS_LITHOGRAPH_LIBRARY")
	providerLibrary := os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY")
	if mainLibrary == "" || providerLibrary == "" {
		t.Fatal("KGOS_LITHOGRAPH_LIBRARY and KGOS_LITHOGRAPH_PROVIDER_LIBRARY are required")
	}
	mainLibrary, _ = filepath.Abs(mainLibrary)
	providerLibrary, _ = filepath.Abs(providerLibrary)
	return []runtimeprofile.ResolvedExtension{
		{Library: mainLibrary, Entrypoint: "sqlite3_lithograph_init"},
		{Library: providerLibrary, Entrypoint: "sqlite3_lithographopenaicompatible_init"},
	}
}

func integrationSemantic(paths runtimeprofile.Paths, cache bool) runtimeprofile.SemanticDefaults {
	return runtimeprofile.SemanticDefaults{
		Provider:      "openai-compatible",
		BaseURL:       "https://example.invalid/v1",
		Model:         "phase01-fixture",
		Dimensions:    3,
		Similarity:    "cosine",
		CacheEnabled:  cache,
		CachePath:     filepath.Join(paths.CacheDir, "openai-compatible.db"),
		CacheMaxBytes: 16 << 20,
	}
}

func resultInteger(t *testing.T, result Result, row int, column string) int64 {
	t.Helper()
	position, ok := columnIndex(result.Columns, column)
	if !ok || row >= len(result.Rows) || position >= len(result.Rows[row]) {
		t.Fatalf("missing %s in result %#v", column, result.Columns)
	}
	var value int64
	if err := json.Unmarshal(result.Rows[row][position], &value); err != nil {
		t.Fatalf("decode integer result: %v", err)
	}
	return value
}

func summaryCommit(t *testing.T, result Result) string {
	t.Helper()
	var summary struct {
		Commit *string `json:"commit"`
	}
	if err := json.Unmarshal(result.Summary, &summary); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	if summary.Commit == nil {
		return ""
	}
	return *summary.Commit
}

func commitRef(t *testing.T, raw []byte) string {
	t.Helper()
	var value struct {
		Commit string `json:"commit"`
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("decode transaction commit: %v", err)
	}
	if !strings.HasPrefix(value.Commit, "commit/") {
		t.Fatalf("transaction commit = %q", value.Commit)
	}
	return value.Commit
}

func eventTypes(events []Event) string {
	types := make([]string, 0, len(events))
	for _, event := range events {
		types = append(types, event.Type)
	}
	return strings.Join(types, ",")
}

func embeddingInputCount(t *testing.T, raw json.RawMessage) int {
	t.Helper()
	var single string
	if err := json.Unmarshal(raw, &single); err == nil {
		return 1
	}
	var batch []string
	if err := json.Unmarshal(raw, &batch); err == nil {
		return len(batch)
	}
	t.Fatalf("unsupported embedding input: %s", fmt.Sprintf("%s", raw))
	return 0
}
