//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"strings"
	"testing"
)

func TestPhase16PreviewRejectsStaleAndMalformedPinnedData(t *testing.T) {
	rt := phase16Runtime(t)
	ctx := context.Background()
	overview, err := rt.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	b := previewBuilder{kernel: rt.Kernel, maxItems: 3}
	if _, err = b.snapshot(ctx, "main", "branch/main"); err == nil ||
		!strings.Contains(err.Error(), "RESOURCE_ERROR") {
		t.Fatalf("a moving Branch ref was incorrectly used as a pinned Commit: %v", err)
	}
	for _, badState := range []string{"commit/not-hex", "branch/nonexistent"} {
		if _, err := b.paginate(ctx, badState, ""); err == nil {
			t.Errorf("accepted nonexistent/invalid Ontology pin %s", badState)
		}
	}
	if _, err := b.snapshot(ctx, "main", "commit/not-hex"); err == nil {
		t.Fatal("stale Commit should not render authoritative Preview")
	}
	if _, _, err := b.loadBodies(ctx, overview.State, []string{"node:DoesNotExist"}); err == nil {
		t.Fatal("missing canonical Ontology body returned as complete")
	}
	if _, _, _, err := b.collect(ctx, overview.State, []kernel.Summary{{
		Kind: kernel.KindDomain, Ref: "domain:DoesNotExist", Name: "DoesNotExist",
	}}); err == nil {
		t.Fatal("unresolvable Domain scope was silently projected")
	}
	empty, err := b.paginate(ctx, overview.State, "")
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty Knowledge Base read was incomplete: %#v %v", empty, err)
	}
	if _, err := b.snapshot(ctx, "main", overview.State); err != nil {
		t.Fatalf("a real pinned, empty Ontology snapshot should remain readable: %v", err)
	}
}
