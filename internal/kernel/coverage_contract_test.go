package kernel

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func requirePublicCode(t *testing.T, err error, code ErrorCode) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s error", code)
	}
	if got := AsPublicError(err).Code; got != code {
		t.Fatalf("error code = %s, want %s (%v)", got, code, err)
	}
}

func TestPublicErrorMappingCoverage(t *testing.T) {
	t.Parallel()
	if AsPublicError(nil) != nil {
		t.Fatal("nil error must remain nil")
	}
	var nilPublic *PublicError
	if nilPublic.Error() != "<nil>" {
		t.Fatalf("nil PublicError = %q", nilPublic.Error())
	}
	cause := errors.New("cause")
	public := &PublicError{Code: CodeType, Message: "bad", Cause: cause}
	if AsPublicError(public) != public || !errors.Is(public, cause) ||
		public.Error() != "TYPE_ERROR: bad" {
		t.Fatalf("public error identity/unwrap failed: %#v", public)
	}

	categories := []struct {
		category string
		code     ErrorCode
		message  string
	}{
		{"VERSION_NOT_FOUND", CodeStateNotFound, "state was not found"},
		{"BRANCH_HEAD_MOVED", CodeStaleBaseState, "target branch head no longer matches baseState"},
		{"INVALID_ARGUMENT", CodeInvalidArgument, "invalid input"},
		{"PARSE_ERROR", CodeParse, "parse failed"},
		{"SEMANTIC_ERROR", CodeSemantic, "semantic failed"},
		{"TYPE_ERROR", CodeType, "type failed"},
		{"SCHEMA_ERROR", CodeSchema, "schema failed"},
		{"CONSTRAINT_ERROR", CodeConstraint, "constraint failed"},
		{"RESOURCE_ERROR", CodeResource, "resource failed"},
		{"IO_ERROR", CodeIO, "io failed"},
		{"BRANCH_NOT_FOUND", CodeBranchNotFound, "branch failed"},
		{"TAG_NOT_FOUND", CodeTagNotFound, "tag failed"},
		{"READ_ONLY_SNAPSHOT", CodeReadOnlySnapshot, "read only"},
	}
	for _, test := range categories {
		test := test
		t.Run(test.category, func(t *testing.T) {
			err := fmt.Errorf("wrapper: LITHOGRAPH_%s: %s", test.category, test.message)
			got := AsPublicError(err)
			if got.Code != test.code || got.Message != test.message || !errors.Is(got, err) {
				t.Fatalf("mapped = %#v", got)
			}
		})
	}
	unknown := errors.New("plain internal error")
	if got := AsPublicError(unknown); got.Code != CodeInternal || got.Message != "internal KG OS error" {
		t.Fatalf("unknown map = %#v", got)
	}
	if lithographCategory("no marker") != "" ||
		lithographCategory("LITHOGRAPH_TYPE_ERROR") != "" ||
		lithographCategory("x LITHOGRAPH_TYPE_ERROR: y") != "TYPE_ERROR" {
		t.Fatal("Lithograph category parsing is inconsistent")
	}
	if safeDatabaseMessage("plain") != "database operation failed" ||
		safeDatabaseMessage("LITHOGRAPH_TYPE_ERROR") != "database operation failed" ||
		safeDatabaseMessage("x LITHOGRAPH_TYPE_ERROR: safe") != "safe" {
		t.Fatal("safe database message mapping is inconsistent")
	}

	statuses := map[ErrorCode]int{
		CodeAuthenticationFailed: http.StatusUnauthorized,
		CodeObjectNotFound:       http.StatusNotFound,
		CodeStateNotFound:        http.StatusNotFound,
		CodeBranchNotFound:       http.StatusNotFound,
		CodeTagNotFound:          http.StatusNotFound,
		CodeObjectConflict:       http.StatusConflict,
		CodePatchBaseMismatch:    http.StatusConflict,
		CodeStaleBaseState:       http.StatusConflict,
		CodeConstraint:           http.StatusConflict,
		CodeInvalidArgument:      http.StatusBadRequest,
		CodeParse:                http.StatusBadRequest,
		CodeSemantic:             http.StatusBadRequest,
		CodeType:                 http.StatusBadRequest,
		CodeReservedIdentifier:   http.StatusBadRequest,
		CodeUnsupportedOperation: http.StatusBadRequest,
		CodeSchema:               http.StatusBadRequest,
		CodeReadOnlySnapshot:     http.StatusBadRequest,
		CodeResource:             http.StatusRequestEntityTooLarge,
		CodeIO:                   http.StatusInternalServerError,
		CodeInternal:             http.StatusInternalServerError,
	}
	for code, want := range statuses {
		if got := HTTPStatus(&PublicError{Code: code, Message: "x"}); got != want {
			t.Fatalf("HTTPStatus(%s) = %d, want %d", code, got, want)
		}
	}
	recorder := httptest.NewRecorder()
	WriteJSONError(recorder, &PublicError{
		Code: CodeObjectConflict, Message: "conflict", Details: map[string]any{"name": "x"},
	})
	if recorder.Code != http.StatusConflict ||
		recorder.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("error response = %d %#v", recorder.Code, recorder.Header())
	}
	var decoded PublicError
	if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil ||
		decoded.Code != CodeObjectConflict ||
		decoded.Details["name"] != "x" {
		t.Fatalf("error body = %#v err=%v", decoded, err)
	}
}

func TestRefAndAliasBoundaryCoverage(t *testing.T) {
	t.Parallel()
	for _, ref := range []OntologyRef{
		{Kind: KindDomain, Name: "A B"},
		{Kind: KindNodeDefinition, Name: "Node/一"},
		{Kind: KindRelationshipDefinition, Name: "REL"},
	} {
		parsed, err := ParseOntologyRef(ref.String())
		if err != nil || parsed != ref {
			t.Fatalf("round trip %v -> %v, %v", ref, parsed, err)
		}
	}
	if got := (OntologyRef{Kind: "unknown", Name: "x"}).String(); got != "x" {
		t.Fatalf("unknown-kind String = %q", got)
	}
	for _, raw := range []string{
		"bogus:x",
		"node:",
		"node:%",
		"node:%GG",
		"node:%2f",
		"node:%41",
		"node:%FF",
	} {
		if _, err := ParseOntologyRef(raw); err == nil {
			t.Fatalf("invalid Ref accepted: %q", raw)
		}
	}
	if value, ok := fromHex('9'); !ok || value != 9 {
		t.Fatal("numeric hex decode failed")
	}
	if value, ok := fromHex('F'); !ok || value != 15 {
		t.Fatal("uppercase hex decode failed")
	}
	if value, ok := fromHex('a'); !ok || value != 10 {
		t.Fatal("lowercase hex decode helper failed")
	}
	if _, ok := fromHex('z'); ok {
		t.Fatal("invalid hex accepted")
	}

	for _, raw := range []string{
		"domain:x",
		"new:",
		"new:knowledge-node:x",
		"new:domain:",
		"new:domain:%2f",
		"new:domain:%01",
		"new:domain:" + strings.Repeat("x", 256),
	} {
		if _, _, err := parseNewTarget(raw); err == nil {
			t.Fatalf("invalid new target accepted: %q", raw)
		}
	}
	for _, raw := range []string{
		"new:domain:d",
		"new:node-definition:n",
		"new:relationship-definition:r",
	} {
		if _, alias, err := parseNewTarget(raw); err != nil || alias == "" {
			t.Fatalf("valid new target %q: alias=%q err=%v", raw, alias, err)
		}
	}
}

func TestModelClosedProfileCoverage(t *testing.T) {
	t.Parallel()
	validProperty := func() Property { return Property{Name: "p", Type: "STRING"} }
	expect := func(code ErrorCode, value ObjectValue) {
		t.Helper()
		requirePublicCode(t, normalizeObject(value), code)
	}

	expect(CodeType, ObjectValue{Kind: KindDomain})
	expect(CodeType, ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "D", Includes: []string{}}, Definition: &Definition{}})
	expect(CodeInvalidArgument, ObjectValue{Kind: "nope"})
	expect(CodeReservedIdentifier, ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "__kgos_x", Includes: []string{}}})
	expect(CodeType, ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "D", Includes: []string{"node:X", "node:X"}}})
	expect(CodeInvalidArgument, ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "D", Includes: []string{"bad:X"}}})

	expect(CodeType, ObjectValue{Kind: KindNodeDefinition})
	expect(CodeInvalidArgument, ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{Kind: KindNodeDefinition, Name: "N"}})
	from := "node:X"
	expect(CodeType, ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
		Kind: KindNodeDefinition, Name: "N", From: &from, Properties: []Property{validProperty()}, Constraints: []Constraint{},
	}})
	expect(CodeType, ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
		Kind: KindNodeDefinition, Name: "N", Labels: []string{"N"}, Properties: []Property{validProperty()}, Constraints: []Constraint{},
	}})
	expect(CodeType, ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
		Kind: KindNodeDefinition, Name: "N", Labels: []string{"L", "L"}, Properties: []Property{validProperty()}, Constraints: []Constraint{},
	}})
	expect(CodeReservedIdentifier, ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
		Kind: KindNodeDefinition, Name: "N", Labels: []string{"__kgos_x"}, Properties: []Property{validProperty()}, Constraints: []Constraint{},
	}})
	expect(CodeType, ObjectValue{Kind: KindRelationshipDefinition, Definition: &Definition{
		Kind: KindRelationshipDefinition, Name: "R", Labels: []string{"L"}, Properties: []Property{validProperty()}, Constraints: []Constraint{},
	}})
	badEndpoint := "domain:D"
	expect(CodeType, ObjectValue{Kind: KindRelationshipDefinition, Definition: &Definition{
		Kind: KindRelationshipDefinition, Name: "R", From: &badEndpoint, Properties: []Property{validProperty()}, Constraints: []Constraint{},
	}})

	cases := []struct {
		code        ErrorCode
		properties  []Property
		constraints []Constraint
		indexes     []Index
	}{
		{CodeType, []Property{{Name: "p", Type: "STRING"}, {Name: "p", Type: "STRING"}}, nil, nil},
		{CodeType, []Property{{Name: "p", Type: " "}}, nil, nil},
		{CodeType, []Property{{Name: "p", Type: "STRING NOT NULL | INTEGER"}}, nil, nil},
		{CodeUnsupportedOperation, []Property{{Name: "p", Type: "VECTOR<FLOAT>"}}, nil, nil},
		{CodeReservedIdentifier, []Property{{Name: "p", Type: "STRING", RenameFrom: "__kgos_old"}}, nil, nil},
		{CodeUnsupportedOperation, []Property{validProperty()}, []Constraint{{Type: "not_null", Properties: []string{"p"}}}, nil},
		{CodeType, []Property{validProperty()}, []Constraint{{Type: "bad", Properties: []string{"p"}}}, nil},
		{CodeReservedIdentifier, []Property{validProperty()}, []Constraint{{Name: "__kgos_c", Type: "unique", Properties: []string{"p"}}}, nil},
		{CodeType, []Property{validProperty()}, []Constraint{{Type: "unique"}}, nil},
		{CodeType, []Property{validProperty()}, []Constraint{{Type: "unique", Properties: []string{"missing"}}}, nil},
		{CodeType, []Property{validProperty()}, []Constraint{{Type: "unique", Properties: []string{"p"}, LegacyValueType: "STRING"}}, nil},
		{CodeType, []Property{{Name: "p", Type: "STRING", Constraints: []Constraint{{Type: "unique", Properties: []string{"p"}}}}}, nil, nil},
		{CodeType, []Property{validProperty()}, nil, []Index{{Name: "i", Type: "bad", Properties: []string{"p"}}}},
		{CodeReservedIdentifier, []Property{validProperty()}, nil, []Index{{Name: "__kgos_i", Type: "range", Properties: []string{"p"}}}},
		{CodeType, []Property{validProperty()}, nil, []Index{{Name: "i", Type: "range"}}},
		{CodeType, []Property{validProperty()}, nil, []Index{{Name: "i", Type: "range", Properties: []string{"missing"}}}},
		{CodeType, []Property{{Name: "p", Type: "STRING"}}, nil, []Index{{Name: "i", Type: "text", Properties: []string{"p", "p2"}}}},
		{CodeType, []Property{{Name: "p", Type: "INTEGER"}}, nil, []Index{{Name: "i", Type: "vector", Properties: []string{"p"}}}},
		{CodeType, []Property{{Name: "p", Type: "INTEGER"}}, nil, []Index{{Name: "i", Type: "fulltext", Properties: []string{"p"}}}},
		{CodeType, []Property{validProperty()}, nil, []Index{{Name: "i", Type: "range", Targets: []string{"node:X"}, Properties: []string{"p"}}}},
		{CodeType, []Property{{Name: "p", Type: "STRING", Indexes: []Index{{Name: "i", Type: "range", Properties: []string{"p"}}}}}, nil, nil},
		{CodeType, []Property{{Name: "p", Type: "STRING", Indexes: []Index{{Name: "i", Type: "fulltext", Targets: []string{"node:X"}}}}}, nil, nil},
	}
	for index, test := range cases {
		value := ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
			Kind: KindNodeDefinition, Name: fmt.Sprintf("N%d", index), Properties: test.properties,
			Constraints: test.constraints, Indexes: test.indexes,
		}}
		expect(test.code, value)
	}

	duplicateNames := ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
		Kind: KindNodeDefinition, Name: "Dup", Properties: []Property{
			{Name: "a", Type: "STRING", Indexes: []Index{{Name: "same", Type: "range"}}},
			{Name: "b", Type: "STRING", Indexes: []Index{{Name: "same", Type: "range"}}},
		}, Constraints: []Constraint{},
	}}
	expect(CodeType, duplicateNames)
	duplicateConstraints := ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
		Kind: KindNodeDefinition, Name: "DupC", Properties: []Property{{Name: "a", Type: "STRING"}},
		Constraints: []Constraint{
			{Name: "c1", Type: "unique", Properties: []string{"a"}},
			{Name: "c2", Type: "unique", Properties: []string{"a"}},
		},
	}}
	expect(CodeType, duplicateConstraints)
}

func TestSerializationStrictCoverage(t *testing.T) {
	t.Parallel()
	invalidYAML := []struct {
		kind ObjectKind
		body string
	}{
		{KindDomain, "["},
		{KindDomain, "name: D\nincludes: []\n---\nname: E\nincludes: []\n"},
		{KindDomain, "!custom {name: D, includes: []}\n"},
		{KindDomain, "- name\n"},
		{KindDomain, "name: D\nunknown: x\nincludes: []\n"},
		{KindNodeDefinition, "name: N\nfrom: null\nproperties: []\nconstraints: []\n"},
		{KindNodeDefinition, "name: N\nto: null\nproperties: []\nconstraints: []\n"},
		{KindRelationshipDefinition, "name: R\nproperties: []\nconstraints: []\n"},
	}
	for _, test := range invalidYAML {
		if _, err := ParseObjectYAML(test.kind, []byte(test.body)); err == nil {
			t.Fatalf("invalid YAML accepted: %q", test.body)
		}
	}
	if _, err := parseObjectYAMLRaw("bad", []byte("name: x\n")); err == nil {
		t.Fatal("unsupported raw kind accepted")
	}

	count := 0
	if err := validateYAMLNode(nil, 0, &count, map[*yaml.Node]bool{}); err != nil {
		t.Fatalf("nil YAML node: %v", err)
	}
	count = maxYAMLNodes
	if err := validateYAMLNode(&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "x"}, 0, &count, map[*yaml.Node]bool{}); err == nil {
		t.Fatal("YAML node count resource limit not enforced")
	}
	count = 0
	cycle := &yaml.Node{Kind: yaml.AliasNode}
	cycle.Alias = cycle
	if err := validateYAMLNode(cycle, 0, &count, map[*yaml.Node]bool{}); err == nil {
		t.Fatal("cyclic YAML alias accepted")
	}
	count = 0
	if err := validateYAMLNode(&yaml.Node{Kind: yaml.AliasNode}, 0, &count, map[*yaml.Node]bool{}); err == nil {
		t.Fatal("nil YAML alias accepted")
	}
	count = 0
	mapNode := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map", Content: []*yaml.Node{
		{Kind: yaml.SequenceNode, Tag: "!!seq"}, {Kind: yaml.ScalarNode, Tag: "!!str", Value: "x"},
	}}
	if err := validateYAMLNode(mapNode, 0, &count, map[*yaml.Node]bool{}); err == nil {
		t.Fatal("non-scalar mapping key accepted")
	}

	if _, err := topLevelYAMLFields(&yaml.Node{Kind: yaml.SequenceNode}); err == nil {
		t.Fatal("non-document top-level accepted")
	}
	if err := validateRequiredFields(KindDomain, map[string]struct{}{}); err == nil {
		t.Fatal("missing Domain fields accepted")
	}
	if err := validateRequiredFields("bad", map[string]struct{}{}); err == nil {
		t.Fatal("unknown required-fields kind accepted")
	}

	domain := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "D", Includes: []string{}}}
	if body, err := RenderObjectJSON(domain); err != nil || !strings.Contains(string(body), "\"name\":\"D\"") {
		t.Fatalf("render Domain JSON: %q err=%v", body, err)
	}
	from := "node:A"
	rel := ObjectValue{Kind: KindRelationshipDefinition, Definition: &Definition{
		Kind: KindRelationshipDefinition, Name: "R", From: &from, To: nil,
		Properties: []Property{{Name: "p", Type: "STRING"}}, Constraints: []Constraint{},
	}}
	if body, err := RenderObjectYAML(rel); err != nil ||
		!strings.Contains(string(body), "from: \"node:A\"") ||
		!strings.Contains(string(body), "to: null") {
		t.Fatalf("render Relationship YAML: %q err=%v", body, err)
	}
	if _, err := RenderObjectYAML(ObjectValue{Kind: "bad"}); err == nil {
		t.Fatal("unsupported YAML render kind accepted")
	}
	if _, err := RenderObjectJSON(ObjectValue{Kind: "bad"}); err == nil {
		t.Fatal("unsupported JSON render kind accepted")
	}
	if node := stringNode("line1\nline2"); node.Style != yaml.LiteralStyle {
		t.Fatalf("multiline string style = %v", node.Style)
	}
	if node := stringNode("line1\r\nline2"); node.Style != yaml.DoubleQuotedStyle {
		t.Fatalf("CR multiline string style = %v", node.Style)
	}
	if !containsControl("x\r") || containsControl("x\n\t") {
		t.Fatal("control detection mismatch")
	}
	if nullableStringNode(nil).Tag != "!!null" {
		t.Fatal("nil nullable string is not null")
	}
	value := "x"
	if nullableStringNode(&value).Value != "x" {
		t.Fatal("nullable string value lost")
	}
	if boolNode(false).Value != "false" || boolNode(true).Value != "true" {
		t.Fatal("bool rendering mismatch")
	}
	if equal, err := CanonicalObjectEqual(domain, domain); err != nil || !equal {
		t.Fatalf("canonical equality = %v, %v", equal, err)
	}
	if _, err := CanonicalObjectEqual(ObjectValue{Kind: "bad"}, domain); err == nil {
		t.Fatal("invalid canonical left object accepted")
	}
}
