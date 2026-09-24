package kernel

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestEvolutionRefValidationMatchesLithographProfile(t *testing.T) {
	t.Parallel()
	valid := []string{"main", "feature/review", "é", string([]rune{0x85}), strings.Repeat("a", 255)}
	for _, name := range valid {
		if err := validateRefName(name, "Branch"); err != nil {
			t.Fatalf("validateRefName(%q): %v", name, err)
		}
	}
	invalid := []string{
		"", strings.Repeat("a", 256), "/feature", "feature/", "feature//review", ".", "..",
		"feature/./review", "feature/../review", "feature\x00review", "feature\x1freview", "feature\x7freview",
	}
	for _, name := range invalid {
		if err := validateRefName(name, "Branch"); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("validateRefName(%q) error = %v", name, err)
		}
	}

	commit := "commit/" + strings.Repeat("a", 64)
	for _, ref := range []string{commit, "branch/feature/review", "tag/release"} {
		if err := validateStateRef(ref); err != nil {
			t.Fatalf("validateStateRef(%q): %v", ref, err)
		}
	}
	for _, ref := range []string{
		"", "main", "commit/" + strings.Repeat("A", 64), "commit/" + strings.Repeat("a", 63),
		"branch/.", "tag/x//y",
	} {
		if err := validateStateRef(ref); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("validateStateRef(%q) error = %v", ref, err)
		}
	}
}

func TestEvolutionCursorAndChangeFrontierAreStrict(t *testing.T) {
	t.Parallel()
	cursor := evolutionCursor{
		Version: 1, Op: "diff", Before: "commit/" + strings.Repeat("a", 64),
		After: "commit/" + strings.Repeat("b", 64), LastKey: "frontier",
	}
	encoded, err := encodeEvolutionCursor(cursor)
	if err != nil {
		t.Fatalf("encode cursor: %v", err)
	}
	decoded, err := decodeEvolutionCursor(encoded)
	if err != nil || decoded != cursor {
		t.Fatalf("decode cursor = %#v err=%v, want %#v", decoded, err, cursor)
	}
	if _, err := decodeEvolutionCursor("not-base64"); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("invalid cursor error = %v", err)
	}

	left := Change{
		Change: "update", Kind: KindNodeDefinition, Path: "/indexes",
		BeforeRef: "node:Doc", AfterRef: "node:Doc",
		Before: json.RawMessage("{\"name\":\"a\"}"), After: json.RawMessage("{\"name\":\"a2\"}"),
	}
	right := left
	right.Before = json.RawMessage("{\"name\":\"b\"}")
	right.After = json.RawMessage("{\"name\":\"b2\"}")
	if changeKey(left) == changeKey(right) {
		t.Fatal("distinct changes with the same public primary key share a pagination frontier")
	}
	changes := []Change{left, right}
	firstKey := changeKey(left)
	if offset, err := validatedChangeOffset(changes, 1, firstKey, "Diff"); err != nil || offset != 1 {
		t.Fatalf("valid frontier offset=%d err=%v", offset, err)
	}
	for _, test := range []struct {
		offset int
		key    string
	}{
		{-1, firstKey},
		{3, firstKey},
		{1, "wrong"},
		{0, firstKey},
	} {
		if _, err := validatedChangeOffset(changes, test.offset, test.key, "Diff"); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("tampered frontier offset=%d key=%q error=%v", test.offset, test.key, err)
		}
	}
	for _, body := range []string{
		"{\"v\":1,\"op\":\"diff\",\"unknown\":1}",
		"{\"v\":1,\"op\":\"diff\"} {}",
		"{\"v\":2,\"op\":\"diff\"}",
	} {
		raw := base64.RawURLEncoding.EncodeToString([]byte(body))
		if _, err := decodeEvolutionCursor(raw); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("cursor %q error=%v", body, err)
		}
	}
}

func TestEvolutionStructuredDiffDecoderFailsClosed(t *testing.T) {
	t.Parallel()
	valid := lithographPatchForTest(
		"{\"op\":\"AddNode\",\"elementId\":\"n:1\"}",
		"{\"op\":\"SetProperty\",\"owner\":\"relationship/2\"}",
		"{\"op\":\"SetSchema\"}",
	)
	refs, err := changedKnowledgeRefs(valid)
	if err != nil || len(refs) != 2 || refs[0] != "n:1" || refs[1] != "r:2" {
		t.Fatalf("valid refs = %#v err=%v", refs, err)
	}
	for _, raw := range []string{
		"{", "{\"elementId\":\"n:1\"}", "{\"op\":\"AddNode\"}",
		"{\"op\":\"SetProperty\",\"owner\":\"other/1\"}",
		"{\"op\":\"FutureOperation\"}", "{\"op\":\"AddNode\",\"elementId\":\"n:01\"}",
	} {
		patch := lithographPatchForTest(raw)
		if _, err := changedKnowledgeRefs(patch); err == nil || AsPublicError(err).Code != CodeInternal {
			t.Fatalf("operation %q error = %v", raw, err)
		}
	}
}

func TestEvolutionConsistencyDiagnosticMarkerSurvivesPublicProjection(t *testing.T) {
	t.Parallel()
	base := publicError(CodeConsistency, "generic public consistency message", nil)
	marked := markConsistencyIssue("BINDING_DANGLING", base)
	if got := consistencyIssueCode(marked); got != "BINDING_DANGLING" {
		t.Fatalf("issue code = %q", got)
	}
	if got := AsPublicError(marked); got != base {
		t.Fatalf("AsPublicError(marked) = %#v, want original public error", got)
	}
	status, err := consistencyStatusFromError(marked)
	if err != nil || status.Status != "invalid" || len(status.Issues) != 1 ||
		status.Issues[0].Code != "BINDING_DANGLING" {
		t.Fatalf("marked consistency status = %#v err=%v", status, err)
	}
	operational := publicError(CodeIO, "storage unavailable", nil)
	if status, err := consistencyStatusFromError(operational); err == nil ||
		AsPublicError(err).Code != CodeIO || status.Status != "" {
		t.Fatalf("operational consistency status = %#v err=%v", status, err)
	}
	if !isConsistencyBoundary(marked) || isConsistencyBoundary(operational) {
		t.Fatal("history consistency boundary classification is incorrect")
	}
}

func TestEvolutionDiffHelpersProjectPublicChanges(t *testing.T) {
	t.Parallel()
	beforeNode := ObjectValue{
		Kind: KindKnowledgeNode,
		KnowledgeNode: &KnowledgeNode{
			Labels:     []string{"Person"},
			Properties: map[string]json.RawMessage{"name": json.RawMessage("\"Alice\"")},
		},
	}
	afterNode := ObjectValue{
		Kind: KindKnowledgeNode,
		KnowledgeNode: &KnowledgeNode{
			Labels:     []string{"Person", "Author"},
			Properties: map[string]json.RawMessage{"name": json.RawMessage("\"Alicia\"")},
		},
	}
	changes := compareKnowledgeObject("n:1", KindKnowledgeNode, beforeNode, afterNode)
	if len(changes) != 2 {
		t.Fatalf("knowledge changes = %#v", changes)
	}
	foundLabels := false
	foundProperties := false
	for _, change := range changes {
		switch change.Path {
		case "/labels":
			foundLabels = change.Change == "restructure"
		case "/properties":
			foundProperties = change.Change == "update"
		}
	}
	if !foundLabels || !foundProperties {
		t.Fatalf("knowledge change kinds = %#v", changes)
	}

	leftIDs := map[string]string{"old": "id-1", "stable": "id-2"}
	rightIDs := map[string]string{"new": "id-1", "stable": "id-2"}
	if !propertyNamesByIdentityChanged(leftIDs, rightIDs) {
		t.Fatal("property identity rename was not detected")
	}
	if propertyNamesByIdentityChanged(leftIDs, leftIDs) {
		t.Fatal("unchanged property identity was reported as rename")
	}

	fullText := Index{
		Name: "docs", Type: "fulltext",
		hiddenOptions: map[string]any{
			"indexConfig": map[string]any{"fulltext.analyzer": "unicode61"},
		},
	}
	if got := evolutionIndexConfiguration(fullText); got["analyzer"] != "unicode61" {
		t.Fatalf("full-text configuration = %#v", got)
	}
	vectorConfig := map[string]any{"provider": "openai-compatible", "dimensions": float64(8)}
	vector := Index{
		Name: "semantic", Type: "vector",
		hiddenOptions: map[string]any{"indexConfig": vectorConfig},
	}
	gotVector := evolutionIndexConfiguration(vector)
	if gotVector["provider"] != "openai-compatible" || gotVector["dimensions"] != float64(8) {
		t.Fatalf("vector configuration = %#v", gotVector)
	}
	gotVector["provider"] = "changed"
	if vectorConfig["provider"] != "openai-compatible" {
		t.Fatal("vector configuration was not cloned")
	}
	if got := evolutionIndexConfiguration(Index{Name: "range", Type: "range"}); got != nil {
		t.Fatalf("range configuration = %#v", got)
	}

	refs := []OntologyRef{{Kind: KindNodeDefinition, Name: "A"}, {Kind: KindNodeDefinition, Name: "B"}}
	if !sameOntologyRefs(refs, append([]OntologyRef(nil), refs...)) {
		t.Fatal("equal ontology refs were not equal")
	}
	if sameOntologyRefs(refs, refs[:1]) ||
		sameOntologyRefs(refs, []OntologyRef{{Kind: KindNodeDefinition, Name: "A"}, {Kind: KindNodeDefinition, Name: "C"}}) {
		t.Fatal("different ontology refs were equal")
	}
	if got := escapeJSONPointer("a~/b"); got != "a~0~1b" {
		t.Fatalf("escaped pointer = %q", got)
	}
}

func TestEvolutionScopeAndConsistencyProjection(t *testing.T) {
	t.Parallel()
	for _, scope := range []string{"all", "ontology", "knowledge"} {
		if err := validateEvolutionScope(scope, nil); err != nil {
			t.Fatalf("scope %q: %v", scope, err)
		}
	}
	object := &EvolutionObjectFilter{AnchorState: "branch/main", Ref: "node:Doc"}
	if err := validateEvolutionScope("object", object); err != nil {
		t.Fatalf("object scope: %v", err)
	}
	for _, test := range []struct {
		scope  string
		object *EvolutionObjectFilter
	}{
		{scope: "all", object: object},
		{scope: "object", object: nil},
		{scope: "object", object: &EvolutionObjectFilter{AnchorState: "branch/main", Ref: "bad"}},
		{scope: "bad"},
	} {
		if err := validateEvolutionScope(test.scope, test.object); err == nil {
			t.Fatalf("scope %q object=%#v was accepted", test.scope, test.object)
		}
	}

	cases := []struct {
		issue  string
		public string
	}{
		{"BINDING_DUPLICATE", "Ontology binding identity is duplicated"},
		{"BINDING_MISSING", "Ontology binding coverage is incomplete"},
		{"BINDING_KIND_MISMATCH", "Ontology binding kind does not match its public Schema target"},
		{"BINDING_DANGLING", "Ontology binding target cannot be resolved"},
	}
	for _, test := range cases {
		err := markConsistencyIssue(test.issue, publicError(CodeConsistency, "internal diagnostic text", nil))
		if got := consistencyIssueCode(err); got != test.issue {
			t.Fatalf("issue code = %q, want %q", got, test.issue)
		}
		if got := consistencyIssueMessage(err); got != test.public {
			t.Fatalf("issue message for %q = %q, want %q", test.issue, got, test.public)
		}
	}
	reserved := publicError(CodeConsistency, "duplicate reserved Graph Type node identity", nil)
	if got := consistencyIssueCode(reserved); got != "RESERVED_SCHEMA_INVALID" ||
		consistencyIssueMessage(reserved) != "Reserved KG OS Schema is invalid" {
		t.Fatalf("reserved consistency projection = %q / %q", got, consistencyIssueMessage(reserved))
	}
	nonConsistency := publicError(CodeType, "bad", nil)
	if got := sanitizedConsistencyError(nonConsistency); got != nonConsistency {
		t.Fatalf("non-consistency error changed: %#v", got)
	}
	sanitized := AsPublicError(sanitizedConsistencyError(markConsistencyIssue(
		"BINDING_MISSING",
		publicError(CodeConsistency, "internal diagnostic text", nil),
	)))
	if sanitized.Code != CodeConsistency || sanitized.Details["issue"] != "BINDING_MISSING" {
		t.Fatalf("sanitized error = %#v", sanitized)
	}
}

func lithographPatchForTest(operations ...string) lithograph.Patch {
	raw := make([]json.RawMessage, len(operations))
	for index, operation := range operations {
		raw[index] = json.RawMessage(operation)
	}
	return lithograph.Patch{
		Format: 1, DatabaseID: "db", From: "commit/" + strings.Repeat("a", 64),
		To: "commit/" + strings.Repeat("b", 64), Operations: raw,
	}
}
