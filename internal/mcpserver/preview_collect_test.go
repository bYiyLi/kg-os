package mcpserver

import (
	"context"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"testing"
)

func TestPreviewCollectRejectsInconsistentOntology(t *testing.T) {
	builder := previewBuilder{maxItems: 1}
	node := kernel.Summary{Kind: kernel.KindNodeDefinition, Ref: "node:Person", Name: "Person"}
	domains, defs, members, err := builder.collect(context.Background(), "commit/unused", []kernel.Summary{node})
	if err != nil || len(domains) != 0 || len(defs) != 1 || len(members) != 0 {
		t.Fatalf("standalone Definition incorrectly projected: %v %#v %#v", err, domains, defs)
	}
	if _, _, _, err = builder.collect(context.Background(), "commit/unused", []kernel.Summary{
		{Kind: kernel.ObjectKind("unsupported-kind"), Ref: "unknown:x", Name: "x"},
	}); err == nil {
		t.Fatal("unknown Ontology kind silently accepted")
	}
	if _, _, _, err = builder.collect(context.Background(), "commit/unused", []kernel.Summary{
		node, {Kind: kernel.KindNodeDefinition, Ref: "node:Other", Name: "Other"},
	}); err == nil {
		t.Fatal("oversized Ontology silently accepted")
	}
	if _, _, _, err = builder.collect(context.Background(), "commit/unused", []kernel.Summary{
		node, {Kind: kernel.KindNodeDefinition, Ref: "node:Person", Name: "Conflicting"},
	}); err == nil {
		t.Fatal("conflicting Ontology identity silently merged")
	}
}
