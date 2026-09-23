//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestPhase05GraphSnapshotBranchMetadataAndValues(t *testing.T) {
	runtime := openPhase05Runtime(t)
	ctx := context.Background()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	author := "phase05@example.test"
	message := "phase05 Graph execute"
	created, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (a:Phase05A {id:'a'}), (b:Phase05B {id:'b'}), " +
			"(a)-[:PHASE05_LINK {weight:1}]->(b)",
		Author:  &author,
		Message: &message,
	})
	if err != nil {
		t.Fatalf("Graph execute create: %v", err)
	}
	if created.State == base || !strings.HasPrefix(created.State, "commit/") {
		t.Fatalf("execute state = %q, base = %q", created.State, base)
	}
	if got := graphCounter(t, created.Counters, "nodesCreated"); got != 2 {
		t.Fatalf("nodesCreated = %d, want 2", got)
	}
	if got := graphCounter(t, created.Counters, "relationshipsCreated"); got != 1 {
		t.Fatalf("relationshipsCreated = %d, want 1", got)
	}

	old := graphQuery(t, runtime, base, "MATCH (n:Phase05A) RETURN count(n) AS count", nil)
	if graphInt(t, old.Rows[0][0]) != 0 || old.State != base {
		t.Fatalf("historical query = %#v", old)
	}
	current := graphQuery(
		t, runtime, "branch/main", "MATCH (n:Phase05A) RETURN count(n) AS count", nil,
	)
	if graphInt(t, current.Rows[0][0]) != 1 || current.State != created.State {
		t.Fatalf("current query = %#v", current)
	}
	if _, err := runtime.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{
		At: "branch/main", Cypher: "CREATE (:Phase05ReadOnlyBlocked)",
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeReadOnlySnapshot {
		t.Fatalf("query write error = %v", err)
	}

	metadata := graphExecute(
		t,
		runtime,
		"main",
		"CALL lithograph.commit.get($state) YIELD author, message RETURN author, message",
		mustRawParams(t, map[string]any{"state": created.State}),
	)
	if graphString(t, metadata.Rows[0][0]) != author ||
		graphString(t, metadata.Rows[0][1]) != message {
		t.Fatalf("commit metadata = %#v", metadata.Rows)
	}

	graphExecute(t, runtime, "main", "CALL lithograph.branch.create('phase05-side', $from)",
		mustRawParams(t, map[string]any{"from": created.State}))
	graphExecute(t, runtime, "phase05-side", "CREATE (:Phase05SideOnly)", nil)
	graphExecute(t, runtime, "main", "CALL lithograph.branch.checkout('phase05-side')", nil)
	graphExecute(t, runtime, "main", "CREATE (:Phase05MainFresh)", nil)
	mainCount := graphQuery(
		t, runtime, "branch/main", "MATCH (n:Phase05MainFresh) RETURN count(n)", nil,
	)
	sideCount := graphQuery(
		t, runtime, "branch/phase05-side", "MATCH (n:Phase05MainFresh) RETURN count(n)", nil,
	)
	if graphInt(t, mainCount.Rows[0][0]) != 1 || graphInt(t, sideCount.Rows[0][0]) != 0 {
		t.Fatalf("fresh Branch checkout failed: main=%s side=%s", mainCount.Rows[0][0], sideCount.Rows[0][0])
	}

	params := json.RawMessage(
		`{"big":{"$type":"Integer","value":"9223372036854775807"},` +
			`"map":{"$type":"Map","entries":{"$type":"application","key":"v"}},` +
			`"vector":{"$type":"Vector","coordinateType":"FLOAT64","dimension":2,"values":[1.0,0.0]}}`,
	)
	values := graphQuery(
		t,
		runtime,
		"branch/main",
		"RETURN $big AS big, $map AS map, date('2026-09-16') AS date, "+
			"point({x:1.0,y:2.0}) AS point, "+
			"uuid('550e8400-e29b-41d4-a716-446655440000') AS uuid, $vector AS vector",
		params,
	)
	if len(values.Rows) != 1 || len(values.Rows[0]) != 6 {
		t.Fatalf("typed value rows = %#v", values.Rows)
	}
	assertTaggedValue(t, values.Rows[0][0], "Integer")
	assertTaggedValue(t, values.Rows[0][1], "Map")
	assertTaggedValue(t, values.Rows[0][2], "Date")
	assertTaggedValue(t, values.Rows[0][3], "Point")
	assertTaggedValue(t, values.Rows[0][4], "UUID")
	vector := assertTaggedValue(t, values.Rows[0][5], "Vector")
	if got := vector["coordinateType"]; got != "F64" {
		t.Fatalf("Vector coordinateType = %#v", got)
	}

	structural := graphQuery(
		t,
		runtime,
		"branch/main",
		"MATCH p=(a:Phase05A)-[r:PHASE05_LINK]->(b:Phase05B) "+
			"RETURN a AS node, r AS relationship, p AS path",
		nil,
	)
	if len(structural.Rows) != 1 {
		t.Fatalf("structural rows = %#v", structural.Rows)
	}
	assertTaggedValue(t, structural.Rows[0][0], "Node")
	assertTaggedValue(t, structural.Rows[0][1], "Relationship")
	assertTaggedValue(t, structural.Rows[0][2], "Path")
}

func TestPhase05GraphSearchLoadCSVSchemaAndTransactions(t *testing.T) {
	runtime := openPhase05Runtime(t)
	ctx := context.Background()

	graphExecute(
		t,
		runtime,
		"main",
		"CREATE (:Phase05Doc {id:'graph', title:'Knowledge graph', lang:'en', "+
			"embedding:vector([1.0,0.0],2,FLOAT64)}), "+
			"(:Phase05Doc {id:'sql', title:'SQL database', lang:'en', "+
			"embedding:vector([0.0,1.0],2,FLOAT64)})",
		nil,
	)
	graphExecute(
		t,
		runtime,
		"main",
		"CREATE FULLTEXT INDEX phase05_text FOR (d:Phase05Doc) ON EACH [d.title]",
		nil,
	)
	fulltext := graphQuery(
		t,
		runtime,
		"branch/main",
		"CALL db.index.fulltext.queryNodes('phase05_text', $query, {limit:10}) "+
			"YIELD node, score RETURN node.id AS id, score",
		mustRawParams(t, map[string]any{"query": "graph"}),
	)
	if len(fulltext.Rows) != 1 || graphString(t, fulltext.Rows[0][0]) != "graph" {
		t.Fatalf("Full-text result = %#v", fulltext.Rows)
	}
	if _, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At: "branch/main",
		Cypher: "CALL db.index.fulltext.queryNodes('phase05_text', $query, " +
			"{limit:10, analyzer:'phase05_missing_tokenizer'}) " +
			"YIELD node, score RETURN node.id AS id, score",
		Params: mustRawParams(t, map[string]any{"query": "graph"}),
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeSemantic {
		t.Fatalf("unavailable Full-text analyzer error = %v", err)
	}

	graphExecute(
		t,
		runtime,
		"main",
		"CREATE VECTOR INDEX phase05_embedding FOR (d:Phase05Doc) ON (d.embedding) "+
			"WITH [d.lang] OPTIONS {indexConfig:{`vector.dimensions`:2,"+
			"`vector.similarity_function`:'cosine'}}",
		nil,
	)
	rawVector := json.RawMessage(
		`{"embedding":{"$type":"Vector","coordinateType":"FLOAT64","dimension":2,"values":[1.0,0.0]}}`,
	)
	vector := graphQuery(
		t,
		runtime,
		"branch/main",
		"MATCH (d:Phase05Doc) SEARCH d IN (VECTOR INDEX phase05_embedding "+
			"FOR $embedding WHERE d.lang='en' LIMIT 1) RETURN d.id AS id, $embedding AS queryVector",
		rawVector,
	)
	if len(vector.Rows) != 1 || graphString(t, vector.Rows[0][0]) != "graph" {
		t.Fatalf("Raw Vector result = %#v", vector.Rows)
	}
	assertTaggedValue(t, vector.Rows[0][1], "Vector")

	show := graphQuery(
		t,
		runtime,
		"branch/main",
		"SHOW ALL INDEXES YIELD name WHERE name IN ['phase05_text','phase05_embedding'] "+
			"RETURN count(name) AS count",
		nil,
	)
	if graphInt(t, show.Rows[0][0]) != 2 {
		t.Fatalf("SHOW index count = %s", show.Rows[0][0])
	}
	head, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	version := graphExecute(
		t,
		runtime,
		"main",
		"CALL lithograph.commit.get($state) YIELD commit RETURN commit",
		mustRawParams(t, map[string]any{"state": head}),
	)
	if graphString(t, version.Rows[0][0]) != head {
		t.Fatalf("Version procedure result = %#v, head=%s", version.Rows, head)
	}

	csvPath := filepath.Join(t.TempDir(), "people.csv")
	if err := os.WriteFile(csvPath, []byte("id,name\nalice,Alice\nbob,Bob\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	source := (&url.URL{Scheme: "file", Path: csvPath}).String()
	imported := graphExecute(
		t,
		runtime,
		"main",
		"LOAD CSV WITH HEADERS FROM $source AS row "+
			"MERGE (p:Phase05Imported {id:row.id}) SET p.name=row.name "+
			"RETURN count(p) AS imported",
		mustRawParams(t, map[string]any{"source": source}),
	)
	if len(imported.Rows) != 1 || graphInt(t, imported.Rows[0][0]) != 2 {
		t.Fatalf("LOAD CSV result = %#v", imported.Rows)
	}

	batched := graphExecute(
		t,
		runtime,
		"main",
		"UNWIND [1,2] AS value CALL (value) { CREATE (:Phase05Batch {value:value}) } "+
			"IN TRANSACTIONS OF 1 ROWS RETURN value ORDER BY value",
		nil,
	)
	if len(batched.Rows) != 2 || graphInt(t, batched.Rows[0][0]) != 1 ||
		graphInt(t, batched.Rows[1][0]) != 2 {
		t.Fatalf("transaction subquery rows = %#v", batched.Rows)
	}

	graphExecute(t, runtime, "main", "CREATE (:__kgos_phase05_public_probe {id:1})", nil)
	reservedLooking := graphQuery(
		t,
		runtime,
		"branch/main",
		"MATCH (n:__kgos_phase05_public_probe) RETURN count(n)",
		nil,
	)
	if graphInt(t, reservedLooking.Rows[0][0]) != 1 {
		t.Fatalf("reserved-looking Graph identifier was blocked: %#v", reservedLooking.Rows)
	}
}

func TestPhase05GraphManagedSemanticPassthrough(t *testing.T) {
	var requests atomic.Int64
	provider := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Errorf("read Provider request: %v", err)
			response.WriteHeader(http.StatusInternalServerError)
			return
		}
		var payload struct {
			Input json.RawMessage `json:"input"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Errorf("decode Provider request: %v", err)
			response.WriteHeader(http.StatusBadRequest)
			return
		}
		count := semanticInputCount(t, payload.Input)
		data := make([]map[string]any, count)
		for index := range count {
			data[index] = map[string]any{
				"object": "embedding", "embedding": []float64{1, 0, 0}, "index": index,
			}
		}
		response.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{
			"object": "list", "data": data, "model": "phase05-fixture",
			"usage": map[string]any{"prompt_tokens": 0, "total_tokens": 0},
		})
	}))
	defer provider.Close()

	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	runtime, err := runtimehost.Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open Semantic runtime: %v", err)
	}
	closed := false
	t.Cleanup(func() {
		if !closed {
			_ = runtime.Close()
		}
	})
	cachePath := filepath.Join(t.TempDir(), "semantic-cache.db")
	options := map[string]any{
		"provider": "openai-compatible",
		"providerConfig": map[string]any{
			"base_url":        provider.URL + "/v1",
			"model":           "phase05-fixture",
			"send_dimensions": false,
			"encoding_format": "float",
			"cache": map[string]any{
				"enabled":   true,
				"path":      cachePath,
				"max_bytes": 16 << 20,
			},
		},
		"dimensions": 3,
		"similarity": "cosine",
	}
	graphExecute(
		t,
		runtime,
		"main",
		"CALL db.index.semantic.createNodeIndex($name, [$label], $property, $options)",
		mustRawParams(t, map[string]any{
			"name": "phase05_semantic", "label": "Phase05Semantic",
			"property": "content", "options": options,
		}),
	)
	graphExecute(
		t,
		runtime,
		"main",
		"CREATE (:Phase05Semantic {content:$content})",
		mustRawParams(t, map[string]any{"content": "knowledge graph"}),
	)
	historicalState, err := runtime.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatalf("resolve Semantic historical State: %v", err)
	}
	result := graphQuery(
		t,
		runtime,
		"branch/main",
		"CALL db.index.semantic.queryNodes($index, $query, {limit:10}) "+
			"YIELD node, score RETURN node.content AS content, score",
		mustRawParams(t, map[string]any{
			"index": "phase05_semantic", "query": "knowledge graph",
		}),
	)
	if len(result.Rows) != 1 || graphString(t, result.Rows[0][0]) != "knowledge graph" {
		t.Fatalf("Semantic result = %#v", result.Rows)
	}
	if requests.Load() == 0 {
		t.Fatal("Semantic query did not reach Provider")
	}
	providerRequests := requests.Load()
	second := graphQuery(
		t,
		runtime,
		historicalState,
		"CALL db.index.semantic.queryNodes($index, $query, {limit:10}) "+
			"YIELD node, score RETURN node.content AS content, score",
		mustRawParams(t, map[string]any{
			"index": "phase05_semantic", "query": "knowledge graph",
		}),
	)
	if len(second.Rows) != 1 || second.State != historicalState {
		t.Fatalf("cached historical Semantic result = %#v", second)
	}
	if requests.Load() != providerRequests {
		t.Fatalf(
			"warm public Graph Semantic query missed Provider cache: %d -> %d",
			providerRequests,
			requests.Load(),
		)
	}
	graphExecute(t, runtime, "main", "DROP INDEX phase05_semantic", nil)
	historical := graphQuery(
		t,
		runtime,
		historicalState,
		"CALL db.index.semantic.queryNodes($index, $query, {limit:10}) "+
			"YIELD node, score RETURN node.content AS content, score",
		mustRawParams(t, map[string]any{
			"index": "phase05_semantic", "query": "knowledge graph",
		}),
	)
	if len(historical.Rows) != 1 || historical.State != historicalState {
		t.Fatalf("historical Semantic IndexDefinition was not usable: %#v", historical)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close Semantic runtime: %v", err)
	}
	closed = true
	reopened, err := runtimehost.Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("reopen Semantic runtime: %v", err)
	}
	defer reopened.Close()
	reopenedResult := graphQuery(
		t,
		reopened,
		historicalState,
		"CALL db.index.semantic.queryNodes($index, $query, {limit:10}) "+
			"YIELD node, score RETURN node.content AS content, score",
		mustRawParams(t, map[string]any{
			"index": "phase05_semantic", "query": "knowledge graph",
		}),
	)
	if len(reopenedResult.Rows) != 1 || reopenedResult.State != historicalState {
		t.Fatalf("reopened cached Semantic result = %#v", reopenedResult)
	}
	if requests.Load() != providerRequests {
		t.Fatalf(
			"Provider cache did not survive public Graph reopen: %d -> %d",
			providerRequests,
			requests.Load(),
		)
	}
}

func TestPhase05GraphSemanticProviderWaitCancellation(t *testing.T) {
	providerStarted := make(chan struct{})
	providerRelease := make(chan struct{})
	var startedOnce sync.Once
	provider := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		startedOnce.Do(func() { close(providerStarted) })
		select {
		case <-request.Context().Done():
			return
		case <-providerRelease:
		}
		response.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{
			"object": "list",
			"data": []map[string]any{{
				"object": "embedding", "embedding": []float64{1, 0, 0}, "index": 0,
			}},
			"model": "phase05-cancel-fixture",
			"usage": map[string]any{"prompt_tokens": 0, "total_tokens": 0},
		})
	}))
	defer provider.Close()

	runtime := openPhase05Runtime(t)
	options := map[string]any{
		"provider": "openai-compatible",
		"providerConfig": map[string]any{
			"base_url":        provider.URL + "/v1",
			"model":           "phase05-cancel-fixture",
			"send_dimensions": false,
			"encoding_format": "float",
			"cache": map[string]any{
				"enabled":   true,
				"path":      filepath.Join(t.TempDir(), "semantic-cancel-cache.db"),
				"max_bytes": 16 << 20,
			},
		},
		"dimensions": 3,
		"similarity": "cosine",
	}
	graphExecute(
		t,
		runtime,
		"main",
		"CALL db.index.semantic.createNodeIndex($name, [$label], $property, $options)",
		mustRawParams(t, map[string]any{
			"name": "phase05_semantic_cancel", "label": "Phase05SemanticCancel",
			"property": "content", "options": options,
		}),
	)
	graphExecute(
		t,
		runtime,
		"main",
		"CREATE (:Phase05SemanticCancel {content:'provider wait'})",
		nil,
	)
	params := mustRawParams(t, map[string]any{
		"index": "phase05_semantic_cancel", "query": "provider wait",
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, queryErr := runtime.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{
			At: "branch/main",
			Cypher: "CALL db.index.semantic.queryNodes($index, $query, {limit:10}) " +
				"YIELD node, score RETURN node.content, score",
			Params: params,
		})
		done <- queryErr
	}()
	select {
	case <-providerStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("Semantic Provider request did not start")
	}
	cancel()
	close(providerRelease)
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("Semantic Provider wait returned success after cancellation")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Semantic Provider wait did not stop after cancellation")
	}
}

func TestPhase05GraphStreamingCancellationAndDurability(t *testing.T) {
	runtime := openPhase05Runtime(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	err := runtime.Kernel.StreamGraphQuery(
		ctx,
		kernel.GraphQueryRequest{
			At: "branch/main", Cypher: "UNWIND range(1,1000000000) AS value RETURN value",
		},
		func(kernel.GraphStreamEvent) error { return nil },
	)
	if err == nil {
		t.Fatal("Graph query stream ignored context cancellation")
	}
	if _, queryErr := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At: "branch/main", Cypher: "RETURN 1 AS value",
	}); queryErr != nil {
		t.Fatalf("runtime unusable after stream cancellation: %v", queryErr)
	}

	consumerErr := errors.New("phase05 consumer stopped")
	err = runtime.Kernel.StreamGraphExecute(
		context.Background(),
		kernel.GraphExecuteRequest{
			Branch: "main",
			Cypher: "UNWIND range(1,100) AS value CREATE (:Phase05Rollback {value:value}) RETURN value",
		},
		func(event kernel.GraphStreamEvent) error {
			if event.Type == "row" {
				return consumerErr
			}
			return nil
		},
	)
	if !errors.Is(err, consumerErr) {
		t.Fatalf("ordinary early-close error = %v", err)
	}
	rolledBack := graphQuery(
		t, runtime, "branch/main", "MATCH (n:Phase05Rollback) RETURN count(n)", nil,
	)
	if graphInt(t, rolledBack.Rows[0][0]) != 0 {
		t.Fatalf("ordinary stream early-close left data: %#v", rolledBack.Rows)
	}

	err = runtime.Kernel.StreamGraphExecute(
		context.Background(),
		kernel.GraphExecuteRequest{
			Branch: "main",
			Cypher: "UNWIND range(1,100) AS value " +
				"CALL (value) { CREATE (:Phase05DurableBatch {value:value}) } " +
				"IN TRANSACTIONS OF 2 ROWS RETURN value",
		},
		func(event kernel.GraphStreamEvent) error {
			if event.Type == "row" {
				return consumerErr
			}
			return nil
		},
	)
	if !errors.Is(err, consumerErr) {
		t.Fatalf("transaction-subquery early-close error = %v", err)
	}
	durable := graphQuery(
		t, runtime, "branch/main", "MATCH (n:Phase05DurableBatch) RETURN count(n)", nil,
	)
	if graphInt(t, durable.Rows[0][0]) == 0 {
		t.Fatalf("transaction-subquery durable batches were rolled back: %#v", durable.Rows)
	}
}

func openPhase05Runtime(t *testing.T) *runtimehost.Runtime {
	t.Helper()
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	runtime, err := runtimehost.Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open Phase 05 runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Errorf("close Phase 05 runtime: %v", err)
		}
	})
	return runtime
}

func graphExecute(
	t *testing.T,
	runtime *runtimehost.Runtime,
	branch string,
	cypher string,
	params json.RawMessage,
) kernel.GraphExecuteResult {
	t.Helper()
	result, err := runtime.Kernel.ExecuteGraph(context.Background(), kernel.GraphExecuteRequest{
		Branch: branch, Cypher: cypher, Params: params,
	})
	if err != nil {
		t.Fatalf("Graph execute %q: %v", cypher, err)
	}
	return result
}

func graphQuery(
	t *testing.T,
	runtime *runtimehost.Runtime,
	at string,
	cypher string,
	params json.RawMessage,
) kernel.GraphQueryResult {
	t.Helper()
	result, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At: at, Cypher: cypher, Params: params,
	})
	if err != nil {
		t.Fatalf("Graph query %q: %v", cypher, err)
	}
	return result
}

func mustRawParams(t *testing.T, value map[string]any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func graphCounter(t *testing.T, raw json.RawMessage, name string) int64 {
	t.Helper()
	var counters map[string]int64
	if err := json.Unmarshal(raw, &counters); err != nil {
		t.Fatalf("decode counters %s: %v", raw, err)
	}
	value, ok := counters[name]
	if !ok {
		t.Fatalf("counter %q missing from %s", name, raw)
	}
	return value
}

func graphInt(t *testing.T, raw json.RawMessage) int64 {
	t.Helper()
	var value int64
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("decode Integer %s: %v", raw, err)
	}
	return value
}

func graphString(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("decode String %s: %v", raw, err)
	}
	return value
}

func assertTaggedValue(t *testing.T, raw json.RawMessage, wantType string) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("decode tagged value %s: %v", raw, err)
	}
	if got := value["$type"]; got != wantType {
		t.Fatalf("tagged value type = %#v, want %q; raw=%s", got, wantType, raw)
	}
	return value
}

func semanticInputCount(t *testing.T, raw json.RawMessage) int {
	t.Helper()
	var one string
	if json.Unmarshal(raw, &one) == nil {
		return 1
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err != nil {
		t.Fatalf("decode embedding input %s: %v", raw, err)
	}
	if len(many) == 0 {
		t.Fatalf("empty embedding input: %s", raw)
	}
	return len(many)
}
