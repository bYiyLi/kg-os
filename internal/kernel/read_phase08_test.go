package kernel

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestPhase08ReadReachableErrorContracts(t *testing.T) {
	service := &Service{}
	for _, request := range []OntologyReadRequest{
		{},
		{At: "branch/main", Refs: []string{"invalid"}},
		{At: "branch/main", Limit: -1},
		{
			At:     "branch/main",
			Refs:   []string{"domain:A", "domain:B"},
			Cursor: "cursor",
		},
	} {
		if _, err := service.ReadOntology(context.Background(), request); err == nil {
			t.Fatalf("invalid Ontology read unexpectedly succeeded: %#v", request)
		}
	}
	if _, err := service.ReadObjectTexts(context.Background(), ObjectReadRequest{}); err == nil {
		t.Fatal("Object text read without State/refs unexpectedly succeeded")
	}
}

func TestPhase08OntologyReadRenderingErrors(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	snapshot := &snapshot{
		State:       state,
		Domains:     map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{},
	}

	if _, err := renderOverview(snapshot, 10, "%%%"); err == nil {
		t.Fatal("overview accepted an invalid cursor")
	}

	missingDomain := OntologyRef{Kind: KindDomain, Name: "Missing"}
	if _, err := renderDomain(snapshot, missingDomain, 10, ""); err == nil ||
		AsPublicError(err).Code != CodeObjectNotFound {
		t.Fatalf("missing Domain error = %v", err)
	}

	badDomain := OntologyRef{Kind: KindDomain, Name: "Bad"}
	snapshot.Domains["Bad"] = &domainRecord{
		Value: Domain{Name: "Bad", Includes: []string{"not-a-ref"}},
	}
	if _, err := renderDomain(snapshot, badDomain, 10, ""); err == nil ||
		AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("invalid Domain member error = %v", err)
	}

	missingMemberDomain := OntologyRef{Kind: KindDomain, Name: "MissingMember"}
	snapshot.Domains["MissingMember"] = &domainRecord{
		Value: Domain{Name: "MissingMember", Includes: []string{"node:Absent"}},
	}
	if _, err := renderDomain(snapshot, missingMemberDomain, 10, ""); err == nil ||
		AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("missing Domain member error = %v", err)
	}

	emptyDomain := OntologyRef{Kind: KindDomain, Name: "Empty"}
	snapshot.Domains["Empty"] = &domainRecord{Value: Domain{Name: "Empty"}}
	if _, err := renderDomain(snapshot, emptyDomain, 10, "%%%"); err == nil {
		t.Fatal("Domain accepted an invalid cursor")
	}
}

func TestPhase08ReadCursorAndBudgetErrors(t *testing.T) {
	if _, err := decodeReadCursor("%%%"); err == nil {
		t.Fatal("invalid base64 cursor unexpectedly decoded")
	}
	invalidJSON := base64.RawURLEncoding.EncodeToString([]byte("{"))
	if _, err := decodeReadCursor(invalidJSON); err == nil {
		t.Fatal("invalid JSON cursor unexpectedly decoded")
	}
	wrongVersion := base64.RawURLEncoding.EncodeToString(
		[]byte(`{"v":2,"state":"commit/a","scope":"overview","offset":0}`),
	)
	if _, err := decodeReadCursor(wrongVersion); err == nil {
		t.Fatal("unsupported cursor version unexpectedly decoded")
	}
	trailing := base64.RawURLEncoding.EncodeToString(
		[]byte(`{"v":1,"state":"commit/a","scope":"overview","offset":0}{}`),
	)
	if _, err := decodeReadCursor(trailing); err == nil {
		t.Fatal("cursor with trailing JSON unexpectedly decoded")
	}

	oversized := OntologyReadResult{
		State: "commit/a",
		Results: []OntologyReadItem{
			{Kind: "overview", Markdown: strings.Repeat("x", maxReadBytes+1)},
		},
	}
	if _, err := enforceReadBudget(oversized); err == nil ||
		AsPublicError(err).Code != CodeResource {
		t.Fatalf("oversized Ontology result error = %v", err)
	}
}

func TestPhase08ObjectReadHelperErrors(t *testing.T) {
	ref := ObjectRef{Kind: KindKnowledgeNode, ID: "1"}
	if _, err := singleKnowledgeRow(lithograph.Result{
		Columns: []string{"n"},
		Rows:    [][]json.RawMessage{{}},
	}, ref, "Node"); err == nil || AsPublicError(err).Code != CodeInternal {
		t.Fatalf("malformed Knowledge row error = %v", err)
	}
	if _, err := singleKnowledgeRow(lithograph.Result{
		Columns: []string{"n"},
	}, ref, "Node"); err == nil || AsPublicError(err).Code != CodeObjectNotFound {
		t.Fatalf("missing Knowledge row error = %v", err)
	}
	if _, err := singleKnowledgeRow(lithograph.Result{
		Columns: []string{"n"},
		Rows: [][]json.RawMessage{
			{json.RawMessage("null")},
			{json.RawMessage("null")},
		},
	}, ref, "Node"); err == nil || AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("duplicate Knowledge row error = %v", err)
	}

	snapshot := &snapshot{
		Domains:     map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{},
	}
	if _, err := snapshot.objectValue(OntologyRef{Kind: KindDomain, Name: "Missing"}); err == nil ||
		AsPublicError(err).Code != CodeObjectNotFound {
		t.Fatalf("missing Domain object value error = %v", err)
	}
	if _, err := snapshot.objectValue(
		OntologyRef{Kind: KindNodeDefinition, Name: "Missing"},
	); err == nil || AsPublicError(err).Code != CodeObjectNotFound {
		t.Fatalf("missing Definition object value error = %v", err)
	}
	if _, err := snapshot.objectValue(OntologyRef{Kind: KindKnowledgeNode, Name: "x"}); err == nil ||
		AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("unsupported snapshot object kind error = %v", err)
	}

	service := &Service{}
	if _, err := service.readKnowledgeObject(
		context.Background(),
		"commit/a",
		ObjectRef{Kind: KindDomain, Name: "D"},
	); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("unsupported Knowledge read kind error = %v", err)
	}
}
