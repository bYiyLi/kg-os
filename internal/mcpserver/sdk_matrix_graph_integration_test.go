//go:build lithograph_smoke

package mcpserver

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func matrixGraphAndHistory(t *testing.T, calls *methodMatrix, origin, branch, mergedState string) {
	graphResult := calls.run("graph.execute", map[string]string{
		"branch": branch, "cypher": "CREATE (:SdkMatrixGraph {value:7}), (:SdkMatrixItem {name:'scoped'}) RETURN 7 AS value",
	}, true)
	graphState := property(t, graphResult, "state")
	rows := array(t, calls.run("graph.query", map[string]any{
		"at": graphState, "cypher": "MATCH (n:SdkMatrixGraph) RETURN count(n) AS count",
	}, false), "rows")
	if len(rows) != 1 {
		t.Fatalf("Graph query rows: %#v", rows)
	}
	cells, ok := rows[0].([]any)
	if !ok || len(cells) != 1 || cells[0] != float64(1) {
		t.Fatalf("Graph query typed values: %#v", rows)
	}
	scoped := array(t, calls.run("graph.query", map[string]any{
		"at": graphState, "domain": "domain:SdkMatrix",
		"cypher": "MATCH (n) RETURN count(n) AS count",
	}, false), "rows")
	if len(scoped) != 1 || len(scoped[0].([]any)) != 1 || scoped[0].([]any)[0] != float64(1) {
		t.Fatalf("MCP Domain query did not return the scoped Node: %#v", scoped)
	}
	scopedStream := calls.stream("graph.streamQuery", map[string]any{
		"at": graphState, "domain": "domain:SdkMatrix",
		"cypher": "MATCH (n) RETURN count(n) AS count",
	}, false)
	if len(scopedStream) != 3 || object(t, scopedStream[2])["type"] != "summary" ||
		object(t, scopedStream[1])["row"].([]any)[0] != float64(1) {
		t.Fatalf("MCP Domain stream not scoped: %#v", scopedStream)
	}
	for _, rawDomain := range []any{nil, 42, "domain:NotPresent"} {
		code := "INVALID_ARGUMENT"
		if rawDomain == "domain:NotPresent" {
			code = "OBJECT_NOT_FOUND"
		}
		encoded, _ := json.Marshal(map[string]any{"at": graphState, "domain": rawDomain, "cypher": "MATCH (n) RETURN count(n)"})
		failed := matrixRawTool(t, calls, "kgos_query", map[string]any{
			"code": "return await graph.query(" + string(encoded) + ");",
		})
		if toolErrorCode(t, failed) != code {
			t.Fatalf("MCP scope error %v should be %s: %#v", rawDomain, code, toolEnvelope(t, failed))
		}
	}
	events := calls.stream("graph.streamQuery", map[string]string{
		"at": graphState, "cypher": "UNWIND [1,2] AS n RETURN n",
	}, false)
	for i, kind := range []string{"columns", "row", "row", "summary"} {
		if i >= len(events) || object(t, events[i])["type"] != kind {
			t.Fatalf("Graph query stream invalid: %#v", events)
		}
	}
	if len(events) != 4 || object(t, events[len(events)-1])["state"] != graphState {
		t.Fatalf("Graph query stream missing summary: %#v", events)
	}
	written := calls.stream("graph.streamExecute", map[string]string{
		"branch": branch, "cypher": "CREATE (:SdkMatrixStream {value:11}) RETURN 11 AS value",
	}, true)
	if len(written) != 3 || object(t, written[2])["type"] != "summary" {
		t.Fatalf("Graph execute stream invalid: %#v", written)
	}
	latest := property(t, object(t, written[2]), "state")
	difference := calls.run("evolution.diff", map[string]any{
		"before": origin, "after": mergedState, "scope": "all", "limit": 50,
	}, false)
	array(t, difference, "items")
	history := calls.run("evolution.history", map[string]any{
		"root": latest, "scope": "all", "limit": 50,
	}, false)
	if len(array(t, history, "items")) < 1 {
		t.Fatal("Evolution history missing")
	}
	tagName := "go-matrix-tag"
	calls.run("evolution.tag.create", map[string]string{"name": tagName, "target": latest}, true)
	found := false
	for _, item := range array(t, calls.run("evolution.tag.list", nil, false), "items") {
		if object(t, item)["name"] == tagName {
			found = true
		}
	}
	if !found {
		t.Fatal("Tag not found")
	}
	calls.run("evolution.tag.move", map[string]string{"name": tagName, "target": origin}, true)
	calls.run("evolution.tag.delete", map[string]string{"name": tagName}, true)
	if calls.run("evolution.overview", nil, false)["state"] != origin {
		t.Fatal("Test Branch mutated main")
	}

	first := matrixTool(t, calls, "kgos_ontology_overview", map[string]any{"offset": 0, "limit": 100})
	total, ok := first["totalLines"].(float64)
	if !ok || total < 100 {
		t.Fatalf("Preview pagination fixture incomplete: %#v", first)
	}
	revision := property(t, first, "viewRevision")
	received := int(first["lineCount"].(float64))
	var document strings.Builder
	document.WriteString(property(t, first, "preview"))
	for received < int(total) {
		next := matrixTool(t, calls, "kgos_ontology_overview", map[string]any{"offset": received, "limit": 100, "viewRevision": revision})
		if property(t, next, "viewRevision") != revision || next["totalLines"] != total {
			t.Fatalf("Preview state changed: %#v", next)
		}
		count := int(next["lineCount"].(float64))
		if count <= 0 {
			t.Fatal("Preview pagination stalled")
		}
		received += count
		document.WriteString(property(t, next, "preview"))
	}
	if !strings.Contains(document.String(), "SdkMatrix") || !strings.Contains(document.String(), branch) {
		t.Fatal("Preview missing Domain or Branch")
	}
	ancestry := matrixTool(t, calls, "kgos_commit_ancestry", map[string]any{"root": "branch/" + branch, "limit": 100})
	if !strings.Contains(property(t, ancestry, "markdown"), mergedState) {
		t.Fatal("Ancestry missing merged Commit")
	}

	denied := matrixRawTool(t, calls, "kgos_query", map[string]any{
		"code": "return await evolution.branch.create({name:'read-must-not-write',from:" + stringifyString(origin) + "});",
	})
	if toolErrorCode(t, denied) != "PERMISSION_DENIED" {
		t.Fatalf("Read authorization failed: %#v", toolEnvelope(t, denied))
	}
	missing := matrixRawTool(t, calls, "kgos_query", map[string]any{
		"code": "return await evolution.get({state:'commit/" + strings.Repeat("0", 64) + "'});",
	})
	if toolErrorCode(t, missing) != "STATE_NOT_FOUND" {
		t.Fatalf("Missing State code changed: %#v", toolEnvelope(t, missing))
	}
	required := []string{
		"ontology.read", "ontology.patch", "object.read", "object.readText", "object.patch",
		"graph.query", "graph.execute", "graph.streamQuery", "graph.streamExecute",
		"evolution.overview", "evolution.get", "evolution.ancestry", "evolution.history", "evolution.diff",
		"evolution.state.create", "evolution.state.setData", "evolution.state.clearData",
		"evolution.branch.list", "evolution.branch.create", "evolution.branch.delete",
		"evolution.tag.list", "evolution.tag.create", "evolution.tag.move", "evolution.tag.delete",
		"evolution.merge.start", "evolution.merge.list", "evolution.merge.get", "evolution.merge.conflicts",
		"evolution.merge.resolve", "evolution.merge.finalize", "evolution.merge.abort",
	}
	for _, method := range required {
		if !calls.methods[method] {
			t.Errorf("SDK method not exercised: %s", method)
		}
	}
	if len(calls.methods) != len(required) {
		t.Fatalf("expected 31, observed %d SDK methods: %#v", len(calls.methods), calls.methods)
	}
	t.Log("Go-native MCP 31/31 SDK methods passed through QuickJS, Kernel and Lithograph")
}

func stringifyString(value string) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}
func matrixRawTool(t *testing.T, calls *methodMatrix, name string, params map[string]any) *mcp.CallToolResult {
	t.Helper()
	result, err := calls.session.CallTool(calls.ctx, &mcp.CallToolParams{Name: name, Arguments: params})
	if err != nil {
		t.Fatalf("MCP Tool %s: %v", name, err)
	}
	return result
}
func matrixTool(t *testing.T, calls *methodMatrix, name string, params map[string]any) map[string]any {
	t.Helper()
	result := matrixRawTool(t, calls, name, params)
	return mcpText(t, result)
}
