//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sync/atomic"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	host "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestRetrievalSkillQueries(t *testing.T) {
	for _, name := range []string{"KGOS_LITHOGRAPH_LIBRARY", "KGOS_LITHOGRAPH_PROVIDER_LIBRARY", "KGOS_JIEBA_LIBRARY"} {
		if _, err := os.Stat(os.Getenv(name)); err != nil {
			t.Fatalf("real native fixture %s required: %v", name, err)
		}
	}
	var requests atomic.Int64
	var failProvider atomic.Bool
	// Real native engine and Provider, controlled local HTTP embeddings: NOT a model-quality benchmark.
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if failProvider.Load() {
			http.Error(w, "controlled provider unavailable", http.StatusServiceUnavailable)
			return
		}
		var payload struct {
			Input json.RawMessage `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
			http.Error(w, "bad input", http.StatusBadRequest)
			return
		}
		var texts []string
		var single string
		if json.Unmarshal(payload.Input, &single) == nil {
			texts = []string{single}
		} else if err := json.Unmarshal(payload.Input, &texts); err != nil {
			t.Error(err)
			http.Error(w, "bad input", http.StatusBadRequest)
			return
		}
		data := make([]map[string]any, len(texts))
		for i, text := range texts {
			var vector []float64
			switch text {
			case "needle", "needle outside":
				vector = []float64{1, 0, 0}
			case "needle local":
				vector = []float64{0.8, 0.6, 0}
			case "related concept":
				vector = []float64{0, 1, 0}
			default:
				t.Errorf("unexpected embedding input %q", text)
				http.Error(w, "unknown fixture input", http.StatusBadRequest)
				return
			}
			data[i] = map[string]any{"object": "embedding", "embedding": vector, "index": i}
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{"object": "list", "model": "retrieval-fixture", "data": data, "usage": map[string]any{"prompt_tokens": 0, "total_tokens": 0}}); err != nil {
			t.Error(err)
		}
	}))
	defer provider.Close()
	r := openPhase05Runtime(t)
	options := map[string]any{
		"provider": "openai-compatible", "dimensions": 3, "similarity": "cosine",
		"providerConfig": map[string]any{"base_url": provider.URL + "/v1", "model": "retrieval-fixture", "send_dimensions": false, "encoding_format": "float", "cache": map[string]any{"enabled": true, "path": filepath.Join(t.TempDir(), "retrieval-cache.db"), "max_bytes": 16 << 20}},
	}
	graphExecute(t, r, "main", "CREATE FULLTEXT INDEX retrieval_text FOR (d:RetrievalDoc) ON EACH [d.body]", nil)
	graphExecute(t, r, "main", "CALL db.index.semantic.createNodeIndex($name, [$label], $property, $options)", mustRawParams(t, map[string]any{"name": "retrieval_semantic", "label": "RetrievalDoc", "property": "body", "options": options}))
	// Fixture creation belongs to test setup, never to the read-only Skill's operational instructions.
	seed := graphExecute(t, r, "main", `CREATE
 (p:RetrievalProject {key:'P',name:'Atlas',owner:'Mina'}), (q:RetrievalProject {key:'Q',name:'Atlas',owner:'Noah'}),
 (person:RetrievalPerson {key:'A'}), (org:RetrievalOrg {key:'O'}),
 (person)-[:RETRIEVAL_WORKS_AT {periodKey:'M1',role:'reviewer'}]->(org), (person)-[:RETRIEVAL_WORKS_AT {periodKey:'M2',role:'reviewer'}]->(org),
 (a:RetrievalComponent {key:'A'}), (b:RetrievalComponent {key:'B'}), (c:RetrievalComponent {key:'C'}),
 (a)-[:RETRIEVAL_DEPENDS_ON]->(b), (b)-[:RETRIEVAL_DEPENDS_ON]->(c),
 (:RetrievalTask {key:'T1',project:'P',status:'done'}), (:RetrievalTask {key:'T2',project:'P',status:'done'}),
 (:RetrievalTask {key:'T3',project:'P'}), (:RetrievalTask {key:'T4',project:'Q',status:'open'}),
 (:RetrievalDoc {key:'X',project:'Q',body:'needle outside',title:'Outside'}),
 (:RetrievalDoc {key:'P1',project:'P',body:'needle local',title:'Local'}),
 (:RetrievalDoc {key:'P2',project:'P',body:'related concept',title:'Related'}),
 (:RetrievalDoc {key:'P3',project:'P',title:'needle only in title'}),
 (:RetrievalStatus {key:'D',status:'planned'}),
 (:RetrievalPolicy {key:'V1',validFrom:date('2026-01-01'),validUntil:date('2026-11-01')}),
 (:RetrievalPolicy {key:'V2',validFrom:date('2026-11-01')}),
 (d:RetrievalDecision {key:'D',approval:'accepted'}),
 (d)-[:RETRIEVAL_APPLIES_TO {delivery:'pending'}]->(p),
 (d)-[:RETRIEVAL_APPLIES_TO {delivery:'verified',verification:'test-Q'}]->(q)`, nil)
	snapshot := seed.State
	if requests.Load() != 0 {
		t.Fatal("schema/data setup unexpectedly invoked embedding service")
	}
	queries := readRetrievalSkillExamples(t)
	byName := map[string]retrievalSkillExample{}
	for _, query := range queries {
		byName[query.name] = query
	}
	t.Run("structured-and-fulltext-no-embedding", func(t *testing.T) {
		assertRetrievalSkillQuery(t, r, snapshot, byName["exact-project"])
		assertRetrievalSkillQuery(t, r, snapshot, byName["fulltext-candidates"])
		if requests.Load() != 0 {
			t.Fatal("ordinary query invoked embedding Provider")
		}
	})
	for _, query := range queries {
		t.Run(query.name, func(t *testing.T) { assertRetrievalSkillQuery(t, r, snapshot, query); assertMainState(t, r, snapshot) })
	}
	if requests.Load() == 0 {
		t.Fatal("semantic queries never reached real Provider HTTP path")
	}
	t.Run("missing-index-is-error", func(t *testing.T) {
		_, err := r.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{At: snapshot, Cypher: "CALL db.index.fulltext.queryNodes('missing_retrieval_index','needle',{limit:1}) YIELD node RETURN node"})
		if err == nil {
			t.Fatal("missing index accepted as successful results")
		}
		assertMainState(t, r, snapshot)
	})
	t.Run("provider-failure-is-error", func(t *testing.T) {
		before := requests.Load()
		failProvider.Store(true)
		defer failProvider.Store(false)
		_, err := r.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{At: snapshot, Cypher: "CALL db.index.semantic.queryNodes('retrieval_semantic','uncached failure probe',{limit:2}) YIELD node RETURN node.key"})
		if err == nil || requests.Load() <= before {
			t.Fatalf("must observe real Provider failure, not empty success or skipped provider: %v", err)
		}
		assertMainState(t, r, snapshot)
	})
	t.Run("readonly-does-not-upgrade", func(t *testing.T) {
		_, err := r.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{At: snapshot, Cypher: "CREATE (:RetrievalAccidentalWrite)"})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeReadOnlySnapshot {
			t.Fatalf("unexpected readonly result: %v", err)
		}
		assertMainState(t, r, snapshot)
	})
	t.Run("incomplete-stream-has-no-success-summary", func(t *testing.T) {
		stopped := errors.New("test consumer stopped after first row")
		rows, summaries := 0, 0
		err := r.Kernel.StreamGraphQuery(context.Background(), kernel.GraphQueryRequest{At: snapshot, Cypher: "MATCH (t:RetrievalTask) RETURN t.key ORDER BY t.key"}, func(e kernel.GraphStreamEvent) error {
			if e.Type == "summary" {
				summaries++
			}
			if e.Type == "row" {
				rows++
				return stopped
			}
			return nil
		})
		if !errors.Is(err, stopped) || rows != 1 || summaries != 0 {
			t.Fatalf("partial stream: rows=%d summaries=%d err=%v", rows, summaries, err)
		}
		assertMainState(t, r, snapshot)
	})
	t.Run("pin-and-intentional-comparison", func(t *testing.T) {
		current := graphExecute(t, r, "main", "MATCH (r:RetrievalStatus {key:'D'}) SET r.status='implemented'", nil)
		if current.State == snapshot {
			t.Fatal("test concurrent update did not advance Head")
		}
		assertRetrievalSkillQuery(t, r, snapshot, byName["versioned-status"])
		now := byName["versioned-status"]
		now.rows = [][]any{{"implemented"}}
		assertRetrievalSkillQuery(t, r, current.State, now)
		moving := graphQuery(t, r, "branch/main", now.query, nil)
		if moving.State != current.State {
			t.Fatal("branch resolution did not identify its actual commit")
		}
		assertMainState(t, r, current.State)
	})
}

func assertRetrievalSkillQuery(t *testing.T, r *host.Runtime, state string, example retrievalSkillExample) {
	t.Helper()
	got := graphQuery(t, r, state, example.query, nil)
	if got.State != state {
		t.Fatalf("query %s returned a different snapshot", example.name)
	}
	encoded, err := json.Marshal(got.Rows)
	if err != nil {
		t.Fatal(err)
	}
	var rows [][]any
	if err := json.Unmarshal(encoded, &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		rows = [][]any{}
	}
	if !reflect.DeepEqual(got.Columns, example.columns) || !reflect.DeepEqual(rows, example.rows) {
		t.Fatalf("%s got columns=%v rows=%v, want columns=%v rows=%v", example.name, got.Columns, rows, example.columns, example.rows)
	}
}
