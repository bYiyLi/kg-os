package kernel

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestEvolutionMergeEarlyValidation(t *testing.T) {
	t.Parallel()
	service := &Service{}
	ctx := context.Background()

	for _, request := range []MergeStartRequest{
		{},
		{Branch: "/bad", Source: "branch/main"},
		{Branch: "main"},
		{Branch: "main", Source: "bad"},
	} {
		if _, err := service.EvolutionMergeStart(ctx, request); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("start %#v error = %v", request, err)
		}
	}
	if _, err := service.EvolutionMergeList(ctx, MergeListRequest{Limit: -1}); err == nil ||
		AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("list invalid limit error = %v", err)
	}
	if _, err := service.EvolutionMergeGet(ctx, MergeGetRequest{}); err == nil ||
		AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("get empty session error = %v", err)
	}
	for _, request := range []MergeConflictsRequest{
		{},
		{Session: "opaque", Limit: -1},
		{Session: "opaque", Limit: maxEvolutionLimit + 1},
	} {
		if _, err := service.EvolutionMergeConflicts(ctx, request); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("conflicts %#v error = %v", request, err)
		}
	}
	for _, request := range []MergeResolveRequest{
		{},
		{Session: "opaque"},
		{Session: "opaque", ExpectedRevision: 1},
		{
			Session: "opaque", ExpectedRevision: 1,
			Resolutions: []MergeResolution{{ConflictID: "", Choice: "ours"}},
		},
		{
			Session: "opaque", ExpectedRevision: 1,
			Resolutions: []MergeResolution{
				{ConflictID: "c", Choice: "ours"},
				{ConflictID: "c", Choice: "theirs"},
			},
		},
		{
			Session: "opaque", ExpectedRevision: 1,
			Resolutions: []MergeResolution{{ConflictID: "c", Choice: "bad"}},
		},
		{
			Session: "opaque", ExpectedRevision: 1,
			Resolutions: []MergeResolution{{ConflictID: "c", Choice: "value"}},
		},
		{
			Session: "opaque", ExpectedRevision: 1,
			Resolutions: []MergeResolution{{
				ConflictID: "c", Choice: "ours", Value: json.RawMessage("1"),
			}},
		},
	} {
		if _, err := service.EvolutionMergeResolve(ctx, request); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("resolve %#v error = %v", request, err)
		}
	}
	for _, request := range []MergeFinalizeRequest{
		{},
		{Session: "opaque"},
	} {
		if _, err := service.EvolutionMergeFinalize(ctx, request); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("finalize %#v error = %v", request, err)
		}
	}
	for _, request := range []MergeAbortRequest{
		{},
		{Session: "opaque"},
	} {
		if _, err := service.EvolutionMergeAbort(ctx, request); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("abort %#v error = %v", request, err)
		}
	}
}

func TestMergeResolutionValidationAndErrorMapping(t *testing.T) {
	t.Parallel()
	for _, valid := range []MergeResolution{
		{ConflictID: "c", Choice: "ours"},
		{ConflictID: "c", Choice: "theirs"},
		{ConflictID: "c", Choice: "value", Value: json.RawMessage("null")},
		{ConflictID: "c", Choice: "value", Value: json.RawMessage(`{"x":1}`)},
	} {
		if err := validatePublicMergeResolution(valid); err != nil {
			t.Fatalf("valid resolution %#v rejected: %v", valid, err)
		}
	}
	for _, invalid := range []MergeResolution{
		{Choice: "ours", Value: json.RawMessage("null")},
		{Choice: "theirs", Value: json.RawMessage("1")},
		{Choice: "value"},
		{Choice: "value", Value: json.RawMessage("{")},
		{Choice: "other"},
	} {
		if err := validatePublicMergeResolution(invalid); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("invalid resolution %#v error = %v", invalid, err)
		}
	}
	if err := validateMergeSessionToken(""); err == nil {
		t.Fatal("empty Session token accepted")
	}
	if err := validateMergeSessionToken("not-parsed-by-kgos"); err != nil {
		t.Fatalf("opaque Session token rejected: %v", err)
	}
	if err := validateExpectedMergeRevision(0); err == nil {
		t.Fatal("zero revision accepted")
	}
	if err := validateExpectedMergeRevision(1); err != nil {
		t.Fatalf("positive revision rejected: %v", err)
	}

	cases := []struct {
		category lithograph.ErrorCategory
		want     ErrorCode
	}{
		{lithograph.CategoryBranchHeadMoved, CodeBranchHeadMoved},
		{lithograph.CategoryMergeConflict, CodeMergeConflict},
		{lithograph.CategoryMergeSessionNotFound, CodeMergeSessionNotFound},
		{lithograph.CategoryMergeSessionChanged, CodeMergeSessionChanged},
		{lithograph.CategoryInvalidArgument, CodeInvalidArgument},
	}
	for _, test := range cases {
		err := mergePublicError(&lithograph.DatabaseError{
			Category: test.category, Message: "test", SQLiteCode: 1,
		})
		if err.Code != test.want {
			t.Fatalf("%s mapped to %s, want %s", test.category, err.Code, test.want)
		}
	}
	public := publicError(CodeType, "typed", nil)
	if mergePublicError(public) != public {
		t.Fatal("existing PublicError was not preserved")
	}
	if got := mergePublicError(errors.New("plain")); got.Code != CodeInternal {
		t.Fatalf("plain error code = %s", got.Code)
	}
	if mergePublicError(nil) != nil {
		t.Fatal("nil merge error did not remain nil")
	}
	if AsPublicError(unsafeMergeProjectionError()).Code != CodeConsistency ||
		AsPublicError(unsafeMergeResolutionValueError()).Code != CodeConsistency {
		t.Fatal("unsafe merge mapping errors are not consistency errors")
	}
}

func TestProjectMergeConflictDispatchAndUnsupportedSlots(t *testing.T) {
	t.Parallel()
	service := &Service{}
	ours := mergeProjectorSnapshot()
	theirs := mergeProjectorSnapshot()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	ours.Definitions[ref] = mergeDefinitionRecord(ref, "n:1", "name")
	theirs.Definitions[ref] = mergeDefinitionRecord(ref, "n:1", "name")
	ours.Definitions[ref].Value.Labels = []string{"A"}
	theirs.Definitions[ref].Value.Labels = []string{"B"}
	index := Index{Name: "person_text", Type: "fulltext", Properties: []string{"name"}}
	ours.Definitions[ref].Value.Indexes = []Index{index}
	theirsIndex := index
	theirsIndex.Type = "range"
	theirs.Definitions[ref].Value.Indexes = []Index{theirsIndex}
	ours.Definitions[ref].Value.Constraints = []Constraint{{
		Name: "person_unique", Type: "unique", Properties: []string{"name"},
	}}
	theirs.Definitions[ref].Value.Constraints = []Constraint{{
		Name: "person_unique", Type: "key", Properties: []string{"name"},
	}}
	for _, conflict := range []lithograph.MergeConflict{
		{
			ConflictID: "graph", Slot: "graph/node/Person",
			Ours:   json.RawMessage(`{"implied_labels":["A"]}`),
			Theirs: json.RawMessage(`{"implied_labels":["B"]}`),
		},
		{
			ConflictID: "constraint", Slot: "constraint/person_unique",
			Ours:   json.RawMessage(`{"kind":"unique"}`),
			Theirs: json.RawMessage(`{"kind":"key"}`),
		},
		{
			ConflictID: "index", Slot: "index/person_text",
			Ours:   json.RawMessage(`{"kind":"fulltext"}`),
			Theirs: json.RawMessage(`{"kind":"range"}`),
		},
	} {
		if _, err := service.projectMergeConflict(
			context.Background(), conflict, "ours", "theirs", ours, theirs,
		); err != nil {
			t.Fatalf("dispatch %q: %v", conflict.Slot, err)
		}
	}
	if _, err := service.projectMergeConflict(
		context.Background(),
		lithograph.MergeConflict{ConflictID: "bad", Slot: "unknown/slot"},
		"ours", "theirs", ours, theirs,
	); err == nil || AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("unknown slot error = %v", err)
	}
	if _, err := service.projectNodeConflict(
		context.Background(),
		lithograph.MergeConflict{ConflictID: "bad", Slot: "node/"},
		"ours", "theirs", ours, theirs,
	); err == nil {
		t.Fatal("empty Node slot id was accepted")
	}
	if _, err := service.projectRelationshipConflict(
		context.Background(),
		lithograph.MergeConflict{ConflictID: "bad", Slot: "relationship/"},
		"ours", "theirs", ours, theirs,
	); err == nil {
		t.Fatal("empty Relationship slot id was accepted")
	}
}
