//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase16FullOntologyMultiplePagesNeverTruncates(t *testing.T) {
	rt := phase16Runtime(t)
	ctx := context.Background()
	overview, err := rt.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var patch strings.Builder
	for i := 0; i < 102; i++ {
		alias := fmt.Sprintf("new:node-definition:page-%03d", i)
		body := fmt.Sprintf("name: \"PageDefinition%03d\"\nproperties:\n  - name: \"index\"\n    type: \"INTEGER\"\nconstraints: []\n", i)
		patch.WriteString(addMatrixPatch(alias, body))
	}
	written, err := rt.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: overview.State, Branch: "main", Patch: patch.String(),
	})
	if err != nil {
		t.Fatal(err)
	}
	builder := previewBuilder{kernel: rt.Kernel, maxItems: 200}
	all, err := builder.paginate(ctx, written.State, "")
	if err != nil || len(all) != 102 {
		t.Fatalf("full Ontology pagination lost items: %d %v", len(all), err)
	}
	seen := make(map[string]bool, len(all))
	for _, item := range all {
		if seen[item.Ref] {
			t.Fatalf("duplicate Definition page element: %s", item.Ref)
		}
		seen[item.Ref] = true
	}
	if len(seen) != 102 {
		t.Fatal("duplicate or missing Definition identities")
	}
	bounded := previewBuilder{kernel: rt.Kernel, maxItems: 100}
	if _, err := bounded.paginate(ctx, written.State, ""); err == nil ||
		!strings.Contains(err.Error(), "RESOURCE_ERROR") {
		t.Fatalf("page two escaped item budget, returning incomplete authoritative model: %v", err)
	}
	server, err := New(rt.Kernel, Options{Token: "phase16-pagination", PreviewMaxItems: 200})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := server.preview(ctx, "administrator", PreviewInput{})
	if err != nil || preview.TotalLines < 102 {
		t.Fatalf("large but bounded Ontology view failed: %#v %v", preview, err)
	}
	if !strings.Contains(preview.Preview, "PageDefinition000") {
		t.Fatal("first Ontology Definition absent from complete view")
	}
	end := preview.TotalLines
	tail, err := server.preview(ctx, "administrator", PreviewInput{
		ViewRevision: preview.ViewRevision, Offset: end,
	})
	if err != nil || tail.TotalLines != end || tail.LineCount != 0 {
		t.Fatalf("offset==totalLines lost pinned view semantics: %#v %v", tail, err)
	}
	t.Logf("real pinned multi-page Ontology: %d Definitions, %d Markdown lines", len(all), end)
}
