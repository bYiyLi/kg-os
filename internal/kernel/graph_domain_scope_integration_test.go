//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestDomainScopedGraphQueryAndStreamV034(t *testing.T) {
	runtime := openPhase05Runtime(t)
	ctx := context.Background()
	initial, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	def := func(name string) kernel.ObjectValue {
		return kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: name,
			Properties:  []kernel.Property{{Name: "value", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		}}
	}
	domain := func(name string, includes ...string) kernel.ObjectValue {
		return kernel.ObjectValue{Kind: kernel.KindDomain, Domain: &kernel.Domain{Name: name, Includes: includes}}
	}
	patch := addObjectPatch(t, "new:node-definition:a", def("ScopedA")) +
		addObjectPatch(t, "new:node-definition:b", def("ScopedB")) +
		addObjectPatch(t, "new:node-definition:outside", def("ScopedOutside")) +
		addObjectPatch(t, "new:domain:child", domain("ScopedChild", "new:node-definition:b")) +
		addObjectPatch(t, "new:domain:parent", domain("ScopedParent", "new:node-definition:a", "new:domain:child")) +
		addObjectPatch(t, "new:domain:empty", domain("ScopedEmpty"))
	model, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{Branch: "main", BaseState: initial, Patch: patch})
	if err != nil {
		t.Fatalf("seed model: %v", err)
	}
	created, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:ScopedA {value:'a'}), (:ScopedB {value:'b'}), (:ScopedOutside {value:'outside'})",
	})
	if err != nil {
		t.Fatalf("seed knowledge: %v", err)
	}
	count := func(req kernel.GraphQueryRequest, want int) {
		t.Helper()
		res, err := runtime.Kernel.QueryGraph(ctx, req)
		if err != nil {
			t.Fatalf("query %+v: %v", req, err)
		}
		if len(res.Rows) != 1 || len(res.Rows[0]) != 1 || graphInt(t, res.Rows[0][0]) != int64(want) {
			t.Fatalf("query %+v returned %v; want %d", req, res.Rows, want)
		}
	}
	toDomain := func(value string) json.RawMessage {
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return encoded
	}
	parent := toDomain("domain:ScopedParent")
	child := toDomain("domain:ScopedChild")
	empty := toDomain("domain:ScopedEmpty")
	cypher := "MATCH (n) RETURN count(n) AS total"
	count(kernel.GraphQueryRequest{At: created.State, Domain: parent, Cypher: cypher}, 2)
	count(kernel.GraphQueryRequest{At: created.State, Domain: child, Cypher: cypher}, 1)
	count(kernel.GraphQueryRequest{At: created.State, Domain: empty, Cypher: cypher}, 0)
	count(kernel.GraphQueryRequest{At: model.State, Domain: parent, Cypher: cypher}, 0)
	count(kernel.GraphQueryRequest{At: created.State, Cypher: "MATCH (n) WHERE NOT n:__kgos_internal RETURN count(n)"}, 3)
	count(kernel.GraphQueryRequest{
		At: created.State, Cypher: cypher,
		GraphView: json.RawMessage("{\"requireAnyLabels\":[\"ScopedB\",\"ScopedOutside\"]}"),
	}, 2)
	var streamed []kernel.GraphStreamEvent
	err = runtime.Kernel.StreamGraphQuery(ctx, kernel.GraphQueryRequest{
		At: created.State, Domain: parent, Cypher: cypher,
	}, func(e kernel.GraphStreamEvent) error { streamed = append(streamed, e); return nil })
	if err != nil || len(streamed) != 3 || streamed[0].Type != "columns" || streamed[1].Type != "row" || streamed[2].Type != "summary" {
		t.Fatalf("stream scope: %v / %#v", err, streamed)
	}
	if streamed[1].Row == nil || graphInt(t, (*streamed[1].Row)[0]) != 2 {
		t.Fatalf("scoped streaming rows %#v", streamed[1])
	}
	for _, req := range []kernel.GraphQueryRequest{
		{At: created.State, Domain: parent, GraphView: json.RawMessage("{}"), Cypher: cypher},
	} {
		_, err := runtime.Kernel.QueryGraph(ctx, req)
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
			t.Fatalf("expected INVALID_ARGUMENT for %+v: %v", req, err)
		}
	}
	unknown := toDomain("domain:Unrecognized")
	_, err = runtime.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{At: created.State, Domain: unknown, Cypher: cypher})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("unknown domain error %v", err)
	}
}
