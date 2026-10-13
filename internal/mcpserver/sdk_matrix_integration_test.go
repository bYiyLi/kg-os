//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// This acceptance suite invokes each public SDK method through a real MCP
// client, isolated QuickJS/WASM guest, Go adapter, Kernel, and Lithograph.
// It never talks directly to the daemon API or to a TypeScript SDK gateway.
type methodMatrix struct {
	t       *testing.T
	ctx     context.Context
	session *mcp.ClientSession
	methods map[string]bool
}

func (m *methodMatrix) script(method string, arg any, write, stream bool) any {
	m.t.Helper()
	argText := ""
	if arg != nil {
		raw, err := json.Marshal(arg)
		if err != nil {
			m.t.Fatal(err)
		}
		argText = string(raw)
	}
	expr := method + "(" + argText + ")"
	code := "return await " + expr + ";"
	if stream {
		code = "const items=[];for await(const event of " + expr + "){items.push(event)}return items;"
	}
	toolName := "kgos_read"
	if write {
		toolName = "kgos_run"
	}
	reply, err := m.session.CallTool(m.ctx, &mcp.CallToolParams{Name: toolName, Arguments: map[string]any{"code": code}})
	if err != nil {
		m.t.Fatalf("%s call: %v", method, err)
	}
	if reply == nil || reply.IsError {
		m.t.Fatalf("%s returned MCP error: %#v", method, mcpText(m.t, reply))
	}
	content := mcpText(m.t, reply)
	m.methods[method] = true
	value, ok := content["result"]
	if !ok {
		m.t.Fatalf("%s missing JSON result: %#v", method, content)
	}
	return value
}

func (m *methodMatrix) run(method string, arg any, write bool) map[string]any {
	m.t.Helper()
	value := m.script(method, arg, write, false)
	data, ok := value.(map[string]any)
	if !ok {
		m.t.Fatalf("%s result is %T; expected object", method, value)
	}
	return data
}
func (m *methodMatrix) stream(method string, arg any, write bool) []any {
	m.t.Helper()
	value := m.script(method, arg, write, true)
	data, ok := value.([]any)
	if !ok {
		m.t.Fatalf("%s result is %T; expected events", method, value)
	}
	return data
}
func property(t *testing.T, obj map[string]any, key string) string {
	t.Helper()
	value, ok := obj[key].(string)
	if !ok {
		t.Fatalf("expected string property %q: %#v", key, obj)
	}
	return value
}
func array(t *testing.T, obj map[string]any, key string) []any {
	t.Helper()
	result, ok := obj[key].([]any)
	if !ok {
		t.Fatalf("expected array property %q: %#v", key, obj)
	}
	return result
}
func object(t *testing.T, value any) map[string]any {
	t.Helper()
	result, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("expected object, got %T: %#v", value, value)
	}
	return result
}
func addMatrixPatch(alias, yaml string) string {
	lines := strings.Split(strings.TrimSuffix(yaml, "\n"), "\n")
	result := []string{
		"diff --git a/" + alias + " b/" + alias,
		"new file mode 100644",
		"--- /dev/null", "+++ b/" + alias,
		fmt.Sprintf("@@ -0,0 +1,%d @@", len(lines)),
	}
	for _, line := range lines {
		result = append(result, "+"+line)
	}
	return strings.Join(result, "\n") + "\n"
}
func replaceMatrixPatch(ref, from, to string) string {
	original := strings.Split(strings.TrimSuffix(from, "\n"), "\n")
	updated := strings.Split(strings.TrimSuffix(to, "\n"), "\n")
	lines := []string{"diff --git a/" + ref + " b/" + ref, "--- a/" + ref, "+++ b/" + ref,
		fmt.Sprintf("@@ -1,%d +1,%d @@", len(original), len(updated))}
	for _, line := range original {
		lines = append(lines, "-"+line)
	}
	for _, line := range updated {
		lines = append(lines, "+"+line)
	}
	return strings.Join(lines, "\n") + "\n"
}

func TestPhase16MCPAll31SDKMethods(t *testing.T) {
	runtime := phase16Runtime(t)
	svc, err := New(runtime.Kernel, Options{Token: "sdk-matrix-secret"})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(svc.Handler())
	defer server.Close()
	// A 31-method end-to-end matrix instantiates multiple isolated WASM
	// guests. Go's race detector can amplify compilation cost considerably.
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "go-mcp-sdk-matrix", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint: server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: bearerRoundTripper{token: "sdk-matrix-secret", transport: http.DefaultTransport}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	calls := &methodMatrix{t: t, ctx: ctx, session: session, methods: make(map[string]bool)}
	initial := property(t, calls.run("evolution.overview", nil, false), "state")
	branch := "go-matrix"
	created := calls.run("evolution.branch.create", map[string]any{"name": branch, "from": initial}, true)
	if property(t, created, "name") != branch {
		t.Fatal("Branch was not created")
	}
	found := false
	for _, value := range array(t, calls.run("evolution.branch.list", nil, false), "items") {
		if object(t, value)["name"] == branch {
			found = true
		}
	}
	if !found {
		t.Fatal("created Branch absent")
	}
	marked := calls.run("evolution.state.create", map[string]any{"branch": branch, "data": map[string]any{"acceptance": "go-matrix"},
		"author": "Go MCP matrix", "message": "Go state data"}, true)
	markedState := property(t, marked, "state")
	detail := calls.run("evolution.get", map[string]string{"state": markedState}, false)
	if object(t, detail["data"])["acceptance"] != "go-matrix" {
		t.Fatalf("state data mismatch: %#v", detail)
	}
	updated := calls.run("evolution.state.setData", map[string]any{"state": markedState, "data": map[string]any{"acceptance": "updated"}}, true)
	if object(t, updated["data"])["acceptance"] != "updated" {
		t.Fatal("setData did not persist")
	}
	calls.run("evolution.state.clearData", map[string]string{"state": markedState}, true)
	if calls.run("evolution.get", map[string]string{"state": markedState}, false)["hasData"] != false {
		t.Fatal("clearData failed")
	}
	if len(array(t, calls.run("evolution.ancestry", map[string]any{"root": markedState, "limit": 10}, false), "items")) < 2 {
		t.Fatal("Ancestry incomplete")
	}
	matrixContinue(t, calls, initial, branch)
}

func matrixContinue(t *testing.T, calls *methodMatrix, origin, branch string) {
	var branchHead string
	for _, item := range array(t, calls.run("evolution.branch.list", nil, false), "items") {
		entry := object(t, item)
		if entry["name"] == branch {
			branchHead = property(t, entry, "state")
		}
	}
	if branchHead == "" {
		t.Fatal("Branch head missing")
	}
	seeded := calls.run("object.patch", map[string]any{
		"branch": branch, "baseState": branchHead,
		"patch": addMatrixPatch("new:knowledge-node:matrix-item",
			"labels:\n  - \"SdkMatrix\"\nproperties:\n  \"name\": \"Before\"\n"),
	}, true)
	created := array(t, seeded, "created")
	if len(created) != 1 {
		t.Fatalf("expected one Knowledge Node, got %#v", seeded)
	}
	ref := property(t, object(t, created[0]), "ref")
	seededState := property(t, seeded, "state")
	values := array(t, calls.run("object.read", map[string]any{"at": seededState, "refs": []string{ref}}, false), "results")
	if len(values) != 1 {
		t.Fatal("Knowledge Object unavailable")
	}
	texts := array(t, calls.run("object.readText", map[string]any{"at": seededState, "refs": []string{ref}}, false), "results")
	original := property(t, object(t, texts[0]), "body")
	if !strings.Contains(original, "Before") {
		t.Fatalf("unexpected canonical Knowledge YAML %s", original)
	}

	side := "go-matrix-side"
	calls.run("evolution.branch.create", map[string]string{"name": side, "from": seededState}, true)
	ours := calls.run("object.patch", map[string]any{
		"branch": branch, "baseState": seededState, "patch": replaceMatrixPatch(ref, original, strings.Replace(original, "Before", "Ours", 1)),
	}, true)
	theirs := calls.run("object.patch", map[string]any{
		"branch": side, "baseState": seededState, "patch": replaceMatrixPatch(ref, original, strings.Replace(original, "Before", "Theirs", 1)),
	}, true)
	if ours["state"] == theirs["state"] {
		t.Fatal("Branch history did not diverge")
	}
	merge := calls.run("evolution.merge.start", map[string]string{"branch": branch, "source": "branch/" + side}, true)
	if merge["status"] != "conflicted" {
		t.Fatalf("expected conflicted Merge: %#v", merge)
	}
	sessionID := property(t, merge, "session")
	listed := calls.run("evolution.merge.list", map[string]int{"limit": 10}, false)
	if len(array(t, listed, "items")) == 0 {
		t.Fatal("Merge Session missing from list")
	}
	got := calls.run("evolution.merge.get", map[string]string{"session": sessionID}, false)
	if got["revision"] != merge["revision"] {
		t.Fatal("Merge revision drifted")
	}
	conflicts := array(t, calls.run("evolution.merge.conflicts", map[string]any{"session": sessionID, "limit": 20}, false), "items")
	if len(conflicts) == 0 {
		t.Fatal("expected real Knowledge Property conflicts")
	}
	resolutions := make([]map[string]any, 0, len(conflicts))
	for _, raw := range conflicts {
		conflict := object(t, raw)
		resolutions = append(resolutions, map[string]any{"conflictId": conflict["conflictId"], "choice": "ours"})
	}
	resolved := calls.run("evolution.merge.resolve", map[string]any{
		"session": sessionID, "expectedRevision": merge["revision"], "resolutions": resolutions,
	}, true)
	if resolved["unresolved"] != float64(0) {
		t.Fatalf("unresolved conflicts %#v", resolved)
	}
	merged := calls.run("evolution.merge.finalize", map[string]any{
		"session": sessionID, "expectedRevision": resolved["revision"],
	}, true)
	mergedState := property(t, merged, "state")
	result := array(t, calls.run("object.read", map[string]any{"at": mergedState, "refs": []string{ref}}, false), "results")
	properties := object(t, object(t, result[0])["value"])
	if object(t, properties["properties"])["name"] != "Ours" {
		t.Fatalf("Merge lost ours decision: %#v", properties)
	}
	abortedStart := calls.run("evolution.merge.start", map[string]string{"branch": branch, "source": "branch/" + side}, true)
	aborted := calls.run("evolution.merge.abort", map[string]any{
		"session": abortedStart["session"], "expectedRevision": abortedStart["revision"],
	}, true)
	if aborted["session"] != abortedStart["session"] {
		t.Fatal("Merge abort mismatch")
	}
	calls.run("evolution.branch.delete", map[string]string{"name": side}, true)

	domainPatch := addMatrixPatch("new:domain:matrix",
		"name: \"SdkMatrix\"\nincludes:\n  - \"new:node-definition:matrix\"\n") +
		addMatrixPatch("new:node-definition:matrix",
			"name: \"SdkMatrixItem\"\nproperties:\n  - name: \"name\"\n    type: \"STRING\"\nconstraints: []\n")
	model := calls.run("ontology.patch", map[string]any{
		"baseState": mergedState, "branch": branch, "patch": domainPatch,
	}, true)
	ontology := array(t, calls.run("ontology.read", map[string]any{
		"at": model["state"], "refs": []string{"domain:SdkMatrix"},
	}, false), "results")
	if len(ontology) != 1 || len(array(t, object(t, ontology[0]), "items")) != 1 {
		t.Fatalf("Ontology Domain membership incomplete: %#v", ontology)
	}
	matrixGraphAndHistory(t, calls, origin, branch, mergedState)
}
