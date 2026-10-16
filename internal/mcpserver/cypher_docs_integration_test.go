//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
)

func phase22Manual(t *testing.T, path string) []string {
	t.Helper()
	arg, _ := json.Marshal("cypher/" + path)
	raw, err := mcpsandbox.ReadDoc([]json.RawMessage{arg})
	if err != nil {
		t.Fatal(err)
	}
	var body string
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	blocks := strings.Split(body, "```cypher\n")
	if len(blocks) == 1 {
		return nil
	}
	var queries []string
	for _, block := range blocks[1:] {
		query, _, ok := strings.Cut(block, "\n```")
		if !ok {
			t.Fatalf("Unclosed Cypher block in %s", path)
		}
		queries = append(queries, strings.TrimSpace(query))
	}
	return queries
}

func TestPhase22CypherExamplesAgainstRealKGOSLithograph(t *testing.T) {
	host := phase16Runtime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	if _, err := host.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "manual-qa", From: "branch/main",
	}); err != nil {
		t.Fatal(err)
	}
	execute := func(cypher string, params json.RawMessage) (kernel.GraphExecuteResult, error) {
		return host.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
			Branch: "manual-qa", Cypher: cypher, Params: params,
		})
	}
	if _, err := execute(`CREATE (a:Person {id:'alice', name:'Alice', age:30, department:'Engineering'}), (b:Person {id:'bob', name:'Bob', age:20, department:'Engineering'}), (c:Company {name:'Acme'}), (a)-[:KNOWS {since:2025}]->(b), (a)-[:WORKS_AT]->(c), (:Doc {title:'Graph search',embedding:[1.0,0.0]}) FINISH`, nil); err != nil {
		t.Fatalf("Failed to establish synthetic Cypher fixture: %v", err)
	}
	csvServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte("name\nAlice\n"))
	}))
	defer csvServer.Close()

	type scenario struct {
		write  bool
		params string
		// For examples documenting an index/Provider prerequisite, errors from
		// a missing prerequisite are expected. Syntax errors are never accepted.
		missing string
	}
	table := map[string][]scenario{
		"index.md": {}, "schema.md": {},
		"syntax.md":       {{}},
		"reading.md":      {{}, {}},
		"patterns.md":     {{}, {params: `{"prefix":"Al"}`}},
		"paths.md":        {{}},
		"expressions.md":  {{}, {}},
		"aggregation.md":  {{}, {}},
		"composition.md":  {{}, {}},
		"mutations.md":    {{write: true}, {write: true, params: `{"id":"demo","name":"Updated"}`}, {write: true, params: `{"id":"demo","name":"Again"}`}, {write: true, params: `{"id":"demo"}`}},
		"search.md":       {{params: `{"text":"Graph"}`, missing: "doc_text"}, {params: `{"embedding":[1.0,0.0]}`, missing: "doc_embedding"}, {params: `{"query":"Graph"}`, missing: "document_semantic"}},
		"procedures.md":   {{}, {}},
		"transactions.md": {{params: `{"uri":"<fixture>"}`}},
		"diagnostics.md":  {{}, {}},
		"functions.md":    {{}},
	}
	count := 0
	for page, cases := range table {
		cases := cases
		t.Run(page, func(t *testing.T) {
			blocks := phase22Manual(t, page)
			if len(blocks) != len(cases) {
				t.Fatalf("Doc %s contains %d Cypher blocks but %d acceptance cases", page, len(blocks), len(cases))
			}
			for i, item := range cases {
				if err := ctx.Err(); err != nil {
					t.Fatal(err)
				}
				sql := blocks[i]
				params := json.RawMessage(item.params)
				if page == "transactions.md" {
					params, _ = json.Marshal(map[string]any{"uri": csvServer.URL})
				}
				var rows [][]json.RawMessage
				var err error
				if item.write {
					var result kernel.GraphExecuteResult
					result, err = execute(sql, params)
					rows = result.Rows
				} else {
					var result kernel.GraphQueryResult
					result, err = host.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{
						At: "branch/manual-qa", Cypher: sql, Params: params,
					})
					rows = result.Rows
				}
				if item.missing != "" {
					if err == nil {
						t.Fatalf("%s example %d unexpectedly succeeded without its required index/provider", page, i)
					}
					if !strings.Contains(err.Error(), "SEMANTIC_ERROR") ||
						!strings.Contains(err.Error(), "Index "+item.missing+" does not exist") {
						t.Fatalf("%s example %d should fail only for its absent index %q: %v", page, i, item.missing, err)
					}
				} else if err != nil {
					t.Fatalf("%s example %d failed against Lithograph v0.3.1: %v\n%s", page, i, err, sql)
				} else if len(rows) == 0 && page != "mutations.md" && page != "diagnostics.md" && page != "search.md" {
					t.Logf("Valid empty result in %s example %d", page, i)
				}
				count++
			}
		})
	}
	if count != 0 {
		t.Logf("Verified %d executed Cypher manual snippets against KG OS / Lithograph v0.3.1", count)
	}
}

func TestPhase22MCPFunctionProcedureCatalogMatchesRuntime(t *testing.T) {
	host := phase16Runtime(t)
	for _, tc := range []struct {
		doc, cypher string
		expected    int
	}{
		{"functions-reference.md", "SHOW FUNCTIONS YIELD name RETURN name", 169},
		{"procedures-reference.md", "SHOW PROCEDURES YIELD name RETURN name", 38},
	} {
		t.Run(tc.doc, func(t *testing.T) {
			values, err := host.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
				At: "branch/main", Cypher: tc.cypher,
			})
			if err != nil {
				t.Fatal(err)
			}
			names := map[string]bool{}
			for _, row := range values.Rows {
				if len(row) != 1 {
					t.Fatalf("unexpected SHOW row %q", row)
				}
				var name string
				if err := json.Unmarshal(row[0], &name); err != nil {
					t.Fatal(err)
				}
				names[name] = true
			}
			if len(names) != tc.expected {
				t.Fatalf("Runtime catalog has %d names, want %d", len(names), tc.expected)
			}
			arg, _ := json.Marshal("cypher/" + tc.doc)
			raw, err := mcpsandbox.ReadDoc([]json.RawMessage{arg})
			if err != nil {
				t.Fatal(err)
			}
			var text string
			if err := json.Unmarshal(raw, &text); err != nil {
				t.Fatal(err)
			}
			for name := range names {
				if !strings.Contains(text, "`"+name+"(") {
					t.Errorf("Runtime %q missing from MCP %s", name, tc.doc)
				}
			}
			var sample []string
			for name := range names {
				sample = append(sample, name)
			}
			sort.Strings(sample)
			t.Logf("Verified pinned %d names; first=%q", len(sample), sample[0])
		})
	}
}
