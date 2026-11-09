//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

// Regression for the two production 2026-11-09 OOM incidents: a Knowledge-only
// Patch previously issued one SET per existing Binding (505 in production).
// Use a real, similarly sized Ontology and observe its actual Lithograph spans.
func TestPhase37KnowledgePatchDoesNotRewrite505Bindings(t *testing.T) {
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	state, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}

	// 5 Domain + 50 Definition + 50*9 Property = 505 Binding nodes.
	for batch := 0; batch < 5; batch++ {
		var patch strings.Builder
		for number := batch * 10; number < (batch+1)*10; number++ {
			name := fmt.Sprintf("Bulk%03d", number)
			properties := make([]kernel.Property, 9)
			for i := range properties {
				properties[i] = kernel.Property{Name: fmt.Sprintf("p%d", i), Type: "STRING"}
			}
			patch.WriteString(addObjectPatch(t, "new:node-definition:"+name, kernel.ObjectValue{
				Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{
					Kind: kernel.KindNodeDefinition, Name: name, Properties: properties,
					Constraints: []kernel.Constraint{},
				},
			}))
		}
		if batch == 0 {
			for number := 0; number < 5; number++ {
				name := fmt.Sprintf("FixtureDomain%d", number)
				patch.WriteString(addObjectPatch(t, "new:domain:"+name, kernel.ObjectValue{
					Kind: kernel.KindDomain, Domain: &kernel.Domain{
						Name: name, Includes: []string{fmt.Sprintf("new:node-definition:Bulk%03d", number)},
					},
				}))
			}
		}
		result, patchErr := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
			BaseState: state, Branch: "main", Patch: patch.String(),
		})
		if patchErr != nil {
			t.Fatalf("seed Binding batch %d: %v", batch, patchErr)
		}
		state = result.State
	}
	if got := querySingleInt(t, runtime, state,
		"MATCH (n:__kgos_internal) RETURN count(n) AS count"); got != 505 {
		t.Fatalf("fixture Binding count = %d, want 505", got)
	}
	firstBinding := querySingleString(t, runtime, state,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Bulk000' RETURN elementId(d) AS id")
	firstProperty := querySingleString(t, runtime, state,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Bulk000' AND p.__kgos_name='p0' RETURN elementId(p) AS id")

	observer, err := observability.New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	storePath := filepath.Join(root, "phase37-traces")
	store, err := observability.OpenStore(storePath, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)

	var pendingPatch string
	var pendingResult kernel.PatchResult
	var pendingErr error
	handler := observability.HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pendingResult, pendingErr = runtime.Kernel.PatchObjects(r.Context(), kernel.PatchRequest{
			BaseState: state, Branch: "main", Patch: pendingPatch,
		})
		if pendingErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	requestIDs := make([]string, 0, 6)
	apply := func(name, patch string) {
		t.Helper()
		pendingPatch = patch
		pendingErr = nil
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/object/patch", nil))
		if pendingErr != nil || response.Code != http.StatusNoContent {
			t.Fatalf("%s Patch: HTTP %d, error %v", name, response.Code, pendingErr)
		}
		requestID := response.Header().Get(observability.RequestIDHeader)
		if requestID == "" {
			t.Fatalf("%s missing authoritative trace request ID", name)
		}
		requestIDs = append(requestIDs, requestID)
		state = pendingResult.State
	}

	apply("Knowledge Add", addRawObjectPatch("new:knowledge-node:only",
		"labels:\n  - \"Bulk000\"\nproperties:\n  \"p0\": \"first\"\n"))
	var knowledgeRef string
	for _, created := range pendingResult.Created {
		if created.Alias == "only" {
			knowledgeRef = created.Ref
		}
	}
	if knowledgeRef == "" {
		t.Fatalf("Knowledge Add missing ref: %+v", pendingResult.Created)
	}
	knowledge, err := runtime.Kernel.ReadObject(ctx, state, knowledgeRef)
	if err != nil {
		t.Fatal(err)
	}
	updatedKnowledge := strings.Replace(string(knowledge.YAML), "\"first\"", "\"second\"", 1)
	if updatedKnowledge == string(knowledge.YAML) {
		t.Fatalf("Knowledge update target missing original property: %s", knowledge.YAML)
	}
	apply("Knowledge Update", replaceObjectPatch(knowledgeRef, string(knowledge.YAML), updatedKnowledge))
	knowledge, err = runtime.Kernel.ReadObject(ctx, state, knowledgeRef)
	if err != nil {
		t.Fatal(err)
	}
	apply("Knowledge Delete", deleteObjectPatch(knowledgeRef, string(knowledge.YAML)))

	definition, err := runtime.Kernel.ReadObject(ctx, state, "node:Bulk000")
	if err != nil {
		t.Fatal(err)
	}
	changedDefinition := strings.Replace(string(definition.YAML), "name: \"Bulk000\"\n",
		"name: \"Bulk000\"\ntitle: \"Updated\"\n", 1)
	if changedDefinition == string(definition.YAML) {
		t.Fatalf("Definition metadata target missing: %s", definition.YAML)
	}
	apply("Definition title", replaceObjectPatch("node:Bulk000", string(definition.YAML), changedDefinition))

	definition, err = runtime.Kernel.ReadObject(ctx, state, "node:Bulk000")
	if err != nil {
		t.Fatal(err)
	}
	changedProperty := strings.Replace(string(definition.YAML),
		"  - name: \"p0\"\n    type: \"STRING\"",
		"  - name: \"p0\"\n    title: \"Changed\"\n    type: \"STRING\"", 1)
	if changedProperty == string(definition.YAML) {
		t.Fatalf("Property metadata target missing: %s", definition.YAML)
	}
	apply("Property title", replaceObjectPatch("node:Bulk000", string(definition.YAML), changedProperty))

	domain, err := runtime.Kernel.ReadObject(ctx, state, "domain:FixtureDomain0")
	if err != nil {
		t.Fatal(err)
	}
	changedDomain := strings.Replace(string(domain.YAML), "  - \"node:Bulk000\"",
		"  - \"node:Bulk000\"\n  - \"node:Bulk001\"", 1)
	if changedDomain == string(domain.YAML) {
		t.Fatalf("Domain membership target missing: %s", domain.YAML)
	}
	apply("Domain membership", replaceObjectPatch("domain:FixtureDomain0", string(domain.YAML), changedDomain))

	if got := querySingleInt(t, runtime, state,
		"MATCH (n:__kgos_internal) RETURN count(n) AS count"); got != 505 {
		t.Fatalf("Binding count changed after Patch sequence: %d", got)
	}
	if got := querySingleString(t, runtime, state,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Bulk000' RETURN elementId(d) AS id"); got != firstBinding {
		t.Fatalf("unrelated Definition identity changed: %q -> %q", firstBinding, got)
	}
	if got := querySingleString(t, runtime, state,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Bulk000' AND p.__kgos_name='p0' RETURN elementId(p) AS id"); got != firstProperty {
		t.Fatalf("unrelated Property identity changed: %q -> %q", firstProperty, got)
	}
	if got := querySingleString(t, runtime, state,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Bulk000' RETURN d.__kgos_title AS title"); got != "Updated" {
		t.Fatalf("Definition title not persisted: %q", got)
	}
	if got := querySingleString(t, runtime, state,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Bulk000' AND p.__kgos_name='p0' RETURN p.__kgos_title AS title"); got != "Changed" {
		t.Fatalf("Property title not persisted: %q", got)
	}

	closeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := observer.Close(closeCtx); err != nil {
		t.Fatal(err)
	}
	reopened, err := observability.OpenStore(storePath, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reopened.Close(ctx) }()
	wantExecutes := []int{17, 19, 20, 27, 27, 27}
	for i, requestID := range requestIDs {
		trace, traceErr := reopened.Get(ctx, observability.RequestGetInput{RequestID: requestID})
		if traceErr != nil {
			t.Fatal(traceErr)
		}
		if trace.Coverage.Truncated {
			t.Fatalf("Patch %d trace was truncated; cannot assert actual execution count", i)
		}
		count := 0
		for _, span := range trace.Spans {
			if span.Name == "lithograph.execute" {
				count++
			}
		}
		t.Logf("505 Binding fixture: Patch %d executed %d Lithograph statements", i, count)
		if count != wantExecutes[i] {
			t.Fatalf("Patch %d performed %d Lithograph executes with 505 Bindings; want %d", i, count, wantExecutes[i])
		}
	}
}
