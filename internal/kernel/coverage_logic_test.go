package kernel

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestReadRenderingAndSummaryCoverage(t *testing.T) {
	t.Parallel()
	state := "commit/" + strings.Repeat("a", 64)
	title := "Title"
	description := "Description"
	from := "node:Person"
	to := "node:Document"
	docRef := OntologyRef{Kind: KindNodeDefinition, Name: "Document"}
	personRef := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	relRef := OntologyRef{Kind: KindRelationshipDefinition, Name: "AUTHORED"}
	s := &snapshot{
		State: state,
		Domains: map[string]*domainRecord{
			"Content": {Value: Domain{
				Name: "Content", Title: &title, Description: &description,
				Includes: []string{docRef.String(), relRef.String()},
			}},
		},
		Definitions: map[OntologyRef]*definitionRecord{
			docRef: {Value: Definition{
				Kind: KindNodeDefinition, Name: "Document", Title: &title, Description: &description,
				Labels: []string{"Searchable"},
				Properties: []Property{
					{Name: "id", Type: "STRING", Required: true, Unique: true, Description: &description,
						Indexes: []Index{{Name: "doc_id", Type: "range"}}},
				},
				Constraints: []Constraint{{Name: "doc_key", Type: "key", Properties: []string{"id"}}},
				Indexes:     []Index{{Name: "doc_text", Type: "fulltext", Targets: []string{"node:Document"}, Properties: []string{"id"}}},
			}},
			personRef: {Value: Definition{
				Kind: KindNodeDefinition, Name: "Person",
				Properties: []Property{{Name: "name", Type: "STRING"}}, Constraints: []Constraint{},
			}},
			relRef: {Value: Definition{
				Kind: KindRelationshipDefinition, Name: "AUTHORED", From: &from, To: &to,
				Properties: []Property{{Name: "since", Type: "DATE"}}, Constraints: []Constraint{},
			}},
		},
	}

	overview, err := renderOverview(s, 100, "")
	if err != nil || overview.Total != 2 ||
		!strings.Contains(overview.Markdown, "# Ontology") ||
		!strings.Contains(overview.Markdown, "Content") ||
		!strings.Contains(overview.Markdown, "Person") {
		t.Fatalf("overview = %#v err=%v", overview, err)
	}
	emptyOverview, err := renderOverview(&snapshot{
		State: state, Domains: map[string]*domainRecord{}, Definitions: map[OntologyRef]*definitionRecord{},
	}, 10, "")
	if err != nil || !strings.Contains(emptyOverview.Markdown, "没有调用方 Ontology") {
		t.Fatalf("empty overview = %#v err=%v", emptyOverview, err)
	}
	domain, err := renderDomain(s, OntologyRef{Kind: KindDomain, Name: "Content"}, 1, "")
	if err != nil || domain.Total != 2 || domain.Cursor == "" ||
		!strings.Contains(domain.Markdown, "Description") {
		t.Fatalf("domain = %#v err=%v", domain, err)
	}
	if _, err := renderDomain(s, OntologyRef{Kind: KindDomain, Name: "Missing"}, 10, ""); err == nil {
		t.Fatal("missing Domain rendered")
	}
	badDomain := &snapshot{
		State: state,
		Domains: map[string]*domainRecord{
			"Bad": {Value: Domain{Name: "Bad", Includes: []string{"bad:X"}}},
		},
		Definitions: map[OntologyRef]*definitionRecord{},
	}
	if _, err := renderDomain(badDomain, OntologyRef{Kind: KindDomain, Name: "Bad"}, 10, ""); err == nil {
		t.Fatal("invalid Domain member accepted")
	}
	danglingDomain := &snapshot{
		State: state,
		Domains: map[string]*domainRecord{
			"Bad": {Value: Domain{Name: "Bad", Includes: []string{"node:Missing"}}},
		},
		Definitions: map[OntologyRef]*definitionRecord{},
	}
	if _, err := renderDomain(danglingDomain, OntologyRef{Kind: KindDomain, Name: "Bad"}, 10, ""); err == nil {
		t.Fatal("dangling Domain member accepted")
	}

	nodeItem, err := renderDefinition(s, docRef)
	if err != nil ||
		!strings.Contains(nodeItem.Markdown, "Additional labels") ||
		!strings.Contains(nodeItem.Markdown, "required") ||
		!strings.Contains(nodeItem.Markdown, "unique") ||
		!strings.Contains(nodeItem.Markdown, "## Constraints") ||
		!strings.Contains(nodeItem.Markdown, "## Indexes") {
		t.Fatalf("node markdown = %q err=%v", nodeItem.Markdown, err)
	}
	relItem, err := renderDefinition(s, relRef)
	if err != nil || !strings.Contains(relItem.Markdown, "node:Person") ||
		!strings.Contains(relItem.Markdown, "node:Document") {
		t.Fatalf("relationship markdown = %q err=%v", relItem.Markdown, err)
	}
	if _, err := renderDefinition(s, OntologyRef{Kind: KindNodeDefinition, Name: "Missing"}); err == nil {
		t.Fatal("missing Definition rendered")
	}
	if summary, err := s.summary(OntologyRef{Kind: KindDomain, Name: "Content"}); err != nil || summary.Kind != KindDomain {
		t.Fatalf("Domain summary = %#v err=%v", summary, err)
	}
	if summary, err := s.summary(relRef); err != nil || summary.From == nil {
		t.Fatalf("Relationship summary = %#v err=%v", summary, err)
	}
	if _, err := s.summary(OntologyRef{Kind: KindDomain, Name: "Missing"}); err == nil {
		t.Fatal("missing summary accepted")
	}
	if _, err := s.summary(OntologyRef{Kind: "bad", Name: "x"}); err == nil {
		t.Fatal("bad summary kind accepted")
	}

	if descriptionOrMissing(nil) != "未提供说明" || descriptionOrMissing(&description) != description {
		t.Fatal("description fallback mismatch")
	}
	if endpointText(nil) != "any" || endpointText(&from) != from {
		t.Fatal("endpoint text mismatch")
	}
	if err := validateResolvedState(state); err != nil {
		t.Fatalf("valid resolved State: %v", err)
	}
	for _, raw := range []string{"main", "commit/x" + strings.Repeat("a", 63), "commit/" + strings.Repeat("A", 64)} {
		if err := validateResolvedState(raw); err == nil {
			t.Fatalf("invalid resolved State accepted: %q", raw)
		}
	}
	if err := validateBranchName("main"); err != nil {
		t.Fatalf("valid branch: %v", err)
	}
	for _, branch := range []string{"", "  ", "a\x00b"} {
		if err := validateBranchName(branch); err == nil {
			t.Fatalf("invalid branch accepted: %q", branch)
		}
	}
}

func TestSchemaCompilerCoverage(t *testing.T) {
	t.Parallel()
	node := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	rel := OntologyRef{Kind: KindRelationshipDefinition, Name: "R"}
	if _, err := createConstraintCypher(constraintSpec{Name: "c", Owner: node, Type: "unique"}); err == nil {
		t.Fatal("empty Constraint properties accepted")
	}
	if cypher, err := createConstraintCypher(constraintSpec{
		Name: "c", Owner: node, Type: "unique", Properties: []string{"a", "b"},
	}); err != nil || !strings.Contains(cypher, "IS UNIQUE") {
		t.Fatalf("node unique = %q err=%v", cypher, err)
	}
	if cypher, err := createConstraintCypher(constraintSpec{
		Name: "c", Owner: rel, Type: "key", Properties: []string{"a"},
	}); err != nil || !strings.Contains(cypher, "RELATIONSHIP KEY") {
		t.Fatalf("relationship key = %q err=%v", cypher, err)
	}
	if _, err := createConstraintCypher(constraintSpec{
		Name: "c", Owner: OntologyRef{Kind: KindDomain, Name: "D"}, Type: "key", Properties: []string{"a"},
	}); err == nil {
		t.Fatal("Domain Constraint owner accepted")
	}
	if _, err := createConstraintCypher(constraintSpec{
		Name: "c", Owner: node, Type: "bad", Properties: []string{"a"},
	}); err == nil {
		t.Fatal("bad Constraint type accepted")
	}
	if dropConstraintCypher("a`b") != "DROP CONSTRAINT `a``b`" ||
		dropIndexCypher("a`b") != "DROP INDEX `a``b`" {
		t.Fatal("drop quoting mismatch")
	}

	semantic := map[string]any{"provider": "openai-compatible"}
	tests := []struct {
		name    string
		index   logicalIndex
		want    string
		wantErr bool
	}{
		{"missing target", logicalIndex{Name: "i", Type: "range", Properties: []string{"p"}}, "", true},
		{"mixed kind", logicalIndex{Name: "i", Type: "fulltext", Targets: []OntologyRef{node, rel}, Properties: []string{"p"}}, "", true},
		{"vector multi property", logicalIndex{Name: "i", Type: "vector", Targets: []OntologyRef{node}, Properties: []string{"a", "b"}}, "", true},
		{"node range", logicalIndex{Name: "i", Type: "range", Targets: []OntologyRef{node}, Properties: []string{"p"}}, "CREATE RANGE INDEX", false},
		{"node text", logicalIndex{Name: "i", Type: "text", Targets: []OntologyRef{node}, Properties: []string{"p"}}, "CREATE TEXT INDEX", false},
		{"node point", logicalIndex{Name: "i", Type: "point", Targets: []OntologyRef{node}, Properties: []string{"p"}}, "CREATE POINT INDEX", false},
		{"relationship range", logicalIndex{Name: "i", Type: "range", Targets: []OntologyRef{rel}, Properties: []string{"p"}}, "()-[r:", false},
		{"bad target", logicalIndex{Name: "i", Type: "range", Targets: []OntologyRef{{Kind: KindDomain, Name: "D"}}, Properties: []string{"p"}}, "", true},
		{"fulltext", logicalIndex{Name: "i", Type: "fulltext", Targets: []OntologyRef{node}, Properties: []string{"p"}}, "CREATE FULLTEXT INDEX", false},
		{"vector node", logicalIndex{Name: "i", Type: "vector", Targets: []OntologyRef{node}, Properties: []string{"p"}}, "createNodeIndex", false},
		{"vector relationship", logicalIndex{Name: "i", Type: "vector", Targets: []OntologyRef{rel}, Properties: []string{"p"}}, "createRelationshipIndex", false},
		{"bad type", logicalIndex{Name: "i", Type: "other", Targets: []OntologyRef{node}, Properties: []string{"p"}}, "", true},
	}
	for _, test := range tests {
		cypher, params, err := createIndexCypher(test.index, "unicode61", semantic)
		if test.wantErr {
			if err == nil {
				t.Fatalf("%s unexpectedly succeeded: %q %#v", test.name, cypher, params)
			}
			continue
		}
		if err != nil || !strings.Contains(cypher, test.want) {
			t.Fatalf("%s = %q %#v err=%v", test.name, cypher, params, err)
		}
	}
	fullHidden := map[string]any{"indexConfig": map[string]any{
		"fulltext.analyzer": "porter", "fulltext.eventually_consistent": false,
	}}
	if analyzer, err := fullTextAnalyzerFromHidden(fullHidden); err != nil || analyzer != "porter" {
		t.Fatalf("hidden analyzer = %q err=%v", analyzer, err)
	}
	for _, hidden := range []map[string]any{
		{},
		{"indexConfig": map[string]any{}},
		{"indexConfig": map[string]any{"fulltext.analyzer": ""}},
	} {
		if _, err := fullTextAnalyzerFromHidden(hidden); err == nil {
			t.Fatalf("invalid fulltext hidden accepted: %#v", hidden)
		}
	}
	semanticHidden := map[string]any{"indexConfig": map[string]any{"provider": "openai-compatible"}}
	if options, err := semanticOptionsFromHidden(semanticHidden); err != nil || options["provider"] != "openai-compatible" {
		t.Fatalf("semantic hidden = %#v err=%v", options, err)
	}
	if _, err := semanticOptionsFromHidden(map[string]any{}); err == nil {
		t.Fatal("missing semantic indexConfig accepted")
	}

	indexWithHidden := logicalIndex{
		Name: "hidden", Type: "fulltext", Targets: []OntologyRef{node}, Properties: []string{"p"}, Hidden: fullHidden,
	}
	if cypher, _, err := createIndexCypher(indexWithHidden, "unicode61", nil); err != nil ||
		!strings.Contains(cypher, "porter") {
		t.Fatalf("preserved fulltext hidden = %q err=%v", cypher, err)
	}
	semanticIndex := logicalIndex{
		Name: "semantic", Type: "vector", Targets: []OntologyRef{node}, Properties: []string{"p"},
		Hidden: semanticHidden,
	}
	if _, params, err := createIndexCypher(semanticIndex, "", map[string]any{"provider": "default"}); err != nil ||
		params["options"].(map[string]any)["provider"] != "openai-compatible" {
		t.Fatalf("preserved semantic params = %#v err=%v", params, err)
	}
}

func TestSnapshotSchemaHelperCoverage(t *testing.T) {
	t.Parallel()
	if kind, err := schemaEntityKind("NODE"); err != nil || kind != KindNodeDefinition {
		t.Fatalf("NODE kind = %q err=%v", kind, err)
	}
	if kind, err := schemaEntityKind("RELATIONSHIP"); err != nil || kind != KindRelationshipDefinition {
		t.Fatalf("RELATIONSHIP kind = %q err=%v", kind, err)
	}
	if _, err := schemaEntityKind("OTHER"); err == nil {
		t.Fatal("unsupported Schema entity accepted")
	}

	if n, ok := jsonNumber(float64(3)); !ok || n != 3 {
		t.Fatal("float integer decode failed")
	}
	if _, ok := jsonNumber(float64(3.5)); ok {
		t.Fatal("fractional number accepted")
	}
	if n, ok := jsonNumber(json.Number("4")); !ok || n != 4 {
		t.Fatal("json.Number decode failed")
	}
	if _, ok := jsonNumber(json.Number("x")); ok {
		t.Fatal("bad json.Number accepted")
	}
	if _, ok := jsonNumber("3"); ok {
		t.Fatal("string number accepted")
	}
	if cloneAnyMap(nil) != nil {
		t.Fatal("nil clone is not nil")
	}
	original := map[string]any{"nested": map[string]any{"x": "y"}}
	clone := cloneAnyMap(original)
	clone["nested"].(map[string]any)["x"] = "z"
	if original["nested"].(map[string]any)["x"] != "y" {
		t.Fatal("clone mutated source")
	}

	validSemantic := map[string]any{
		"provider": "openai-compatible",
		"providerConfig": map[string]any{
			"base_url": "https://example.invalid/v1", "model": "m",
			"send_dimensions": false, "encoding_format": "float",
			"cache": map[string]any{"enabled": true, "path": "/tmp/cache.db", "max_bytes": float64(10)},
		},
		"dimensions": float64(3), "similarity": "euclidean",
	}
	invalidMutations := []func(map[string]any){
		func(c map[string]any) { c["unknown"] = true },
		func(c map[string]any) { c["provider"] = "other" },
		func(c map[string]any) { c["providerConfig"] = "bad" },
		func(c map[string]any) { c["providerConfig"].(map[string]any)["unknown"] = true },
		func(c map[string]any) { c["providerConfig"].(map[string]any)["send_dimensions"] = true },
		func(c map[string]any) { c["providerConfig"].(map[string]any)["encoding_format"] = "base64" },
		func(c map[string]any) { c["providerConfig"].(map[string]any)["api_key_env"] = "" },
		func(c map[string]any) { c["providerConfig"].(map[string]any)["cache"] = "bad" },
		func(c map[string]any) {
			c["providerConfig"].(map[string]any)["cache"].(map[string]any)["unknown"] = true
		},
		func(c map[string]any) {
			c["providerConfig"].(map[string]any)["cache"].(map[string]any)["enabled"] = "bad"
		},
		func(c map[string]any) { c["dimensions"] = float64(0) },
		func(c map[string]any) { c["dimensions"] = float64(4097) },
		func(c map[string]any) { c["similarity"] = "dot" },
	}
	for _, mutate := range invalidMutations {
		body, _ := json.Marshal(validSemantic)
		var config map[string]any
		_ = json.Unmarshal(body, &config)
		mutate(config)
		if err := validateSemanticIndexConfig(config); err == nil {
			t.Fatalf("invalid semantic config accepted: %#v", config)
		}
	}

	standardRow := resultRow{"options": mustJSON(map[string]any{})}
	if config, err := decodeIndexOptions(standardRow, "range"); err != nil || len(config) != 0 {
		t.Fatalf("standard options = %#v err=%v", config, err)
	}
	if _, err := decodeIndexOptions(resultRow{"options": mustJSON(map[string]any{"x": true})}, "range"); err == nil {
		t.Fatal("standard hidden options accepted")
	}
	if _, err := decodeIndexOptions(resultRow{"options": mustJSON(map[string]any{})}, "fulltext"); err == nil {
		t.Fatal("missing fulltext indexConfig accepted")
	}
	fulltextGood := resultRow{"options": mustJSON(map[string]any{
		"indexConfig": map[string]any{"fulltext.analyzer": "unicode61", "fulltext.eventually_consistent": false},
	})}
	if _, err := decodeIndexOptions(fulltextGood, "fulltext"); err != nil {
		t.Fatalf("valid fulltext options rejected: %v", err)
	}
	for _, config := range []map[string]any{
		{"indexConfig": map[string]any{"fulltext.analyzer": "", "fulltext.eventually_consistent": false}},
		{"indexConfig": map[string]any{"fulltext.analyzer": "unicode61", "fulltext.eventually_consistent": true}},
		{"indexConfig": map[string]any{"fulltext.analyzer": "unicode61"}},
	} {
		if _, err := decodeIndexOptions(resultRow{"options": mustJSON(config)}, "fulltext"); err == nil {
			t.Fatalf("invalid fulltext options accepted: %#v", config)
		}
	}
}

func TestPatchParserFailureCoverage(t *testing.T) {
	t.Parallel()
	invalid := []string{
		"",
		"diff --git a/x b/x\r\n",
		"not a diff\n",
		"diff --git x y\n",
		"diff --git a/x b/x\nold mode 100644\n",
		"diff --git a/x b/x\nnew file mode 100644\n",
		"diff --git a/x b/y\n--- a/x\n+++ b/y\n@@ -1 +1 @@\n-a\n+b\n",
		"diff --git a/x b/x\nindex abc..def 100644\n",
	}
	for _, patch := range invalid {
		if _, err := parseGitPatch(patch); err == nil {
			t.Fatalf("invalid patch accepted:\n%s", patch)
		}
	}
	for _, line := range []string{
		"@@ invalid",
		"@@ -x +1 @@",
	} {
		if _, _, err := parsePatchHunk([]string{line}, 0); err == nil {
			t.Fatalf("invalid hunk header accepted: %q", line)
		}
	}
	if _, _, err := parsePatchHunk([]string{"@@ -1 +1 @@", "\\ No newline at end of file"}, 0); err == nil {
		t.Fatal("no-newline marker accepted")
	}
	if _, _, err := parsePatchHunk([]string{"@@ -1 +1 @@", "?bad"}, 0); err == nil {
		t.Fatal("bad hunk prefix accepted")
	}
	if _, _, err := parsePatchHunk([]string{"@@ -1,2 +1 @@", " a"}, 0); err == nil {
		t.Fatal("short hunk accepted")
	}
	if _, err := applyExactHunks("a\n", []patchHunk{{OldStart: 3, OldCount: 0, NewStart: 3, NewCount: 0}}); err == nil {
		t.Fatal("out-of-range hunk accepted")
	}
	if _, err := applyExactHunks("a\n", []patchHunk{{OldStart: 1, OldCount: 1, NewStart: 2, NewCount: 1, Lines: []string{" a"}}}); err == nil {
		t.Fatal("inconsistent new range accepted")
	}
	if _, err := applyExactHunks("a\n", []patchHunk{{OldStart: 1, OldCount: 1, NewStart: 1, NewCount: 1, Lines: []string{" b"}}}); err == nil {
		t.Fatal("mismatched context accepted")
	}
	if _, err := applyExactHunks("a\n", []patchHunk{{OldStart: 1, OldCount: 1, NewStart: 1, NewCount: 0, Lines: []string{"-b"}}}); err == nil {
		t.Fatal("mismatched removal accepted")
	}
	if lines := documentLines(""); lines != nil {
		t.Fatalf("empty document lines = %#v", lines)
	}
	if got := documentLines("a\nb"); len(got) != 2 {
		t.Fatalf("non-newline document lines = %#v", got)
	}
	for _, raw := range []string{"a/x", "x y", "a/x b/y extra"} {
		if _, _, err := parseDiffGitPaths(raw); err == nil {
			t.Fatalf("bad diff paths accepted: %q", raw)
		}
	}
	if _, err := parseSingleGitPath("a b"); err == nil {
		t.Fatal("multiple single paths accepted")
	}
	for _, raw := range []string{"\"unterminated", `"\xZZ"`, string([]byte{0xff})} {
		if _, err := splitGitTokens(raw); err == nil {
			t.Fatalf("bad Git token accepted: %q", raw)
		}
	}
}

func TestPatchPlannerHelperCoverage(t *testing.T) {
	t.Parallel()
	owner := OntologyRef{Kind: KindRelationshipDefinition, Name: "R"}
	oldRef, newRef := "node:Old", "node:New"
	currentValue := oldRef
	current := &currentValue
	if err := applyEndpointTransitions(owner, "from", &oldRef, &current, map[string]string{oldRef: newRef}, false); err != nil ||
		current == nil || *current != newRef {
		t.Fatalf("derived endpoint = %#v err=%v", current, err)
	}
	currentValue = newRef
	current = &currentValue
	if err := applyEndpointTransitions(owner, "from", &oldRef, &current, map[string]string{oldRef: newRef}, true); err != nil {
		t.Fatalf("explicit mandatory endpoint rejected: %v", err)
	}
	otherValue := "node:Other"
	other := &otherValue
	if err := applyEndpointTransitions(owner, "from", &oldRef, &other, map[string]string{oldRef: newRef}, true); err == nil {
		t.Fatal("conflicting explicit endpoint accepted")
	}
	var nilEndpoint *string
	if err := applyEndpointTransitions(owner, "from", &oldRef, &nilEndpoint, map[string]string{oldRef: newRef}, true); err == nil {
		t.Fatal("explicit endpoint removal accepted")
	}
	if err := applyEndpointTransitions(owner, "from", &oldRef, nil, map[string]string{oldRef: newRef}, false); err == nil {
		t.Fatal("nil endpoint pointer accepted")
	}

	plan := &plannedState{
		Transitions: map[string]string{"node:Old": "node:New"},
		Aliases: map[string]CreatedObject{
			"new:node-definition:a": {Ref: "node:A"},
		},
		PropertyRenames: map[OntologyRef]map[string]string{
			{Kind: KindNodeDefinition, Name: "A"}: {"old": "new"},
		},
	}
	logical, err := plan.logicalIndexFromDeclaration(
		OntologyRef{Kind: KindNodeDefinition, Name: "A"},
		indexDeclaration{
			Name: "i", Type: "fulltext",
			Targets: []string{"new:node-definition:a", "node:Old"}, Properties: []string{"old"},
		},
	)
	if err != nil || len(logical.Targets) != 2 || logical.Properties[0] != "new" {
		t.Fatalf("logical Index = %#v err=%v", logical, err)
	}
	if _, err := plan.logicalIndexFromDeclaration(
		OntologyRef{Kind: KindNodeDefinition, Name: "A"},
		indexDeclaration{Name: "i", Type: "range", Targets: []string{"bad:x"}, Properties: []string{"p"}},
	); err == nil {
		t.Fatal("invalid logical Index target accepted")
	}

	validNode := &plannedObject{Value: ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{
		Kind: KindNodeDefinition, Name: "A", Properties: []Property{{Name: "p", Type: "STRING"}}, Constraints: []Constraint{},
	}}}
	validDomain := &plannedObject{Value: ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "D", Includes: []string{"node:A"}}}}
	validPlan := &plannedState{Objects: map[OntologyRef]*plannedObject{
		{Kind: KindNodeDefinition, Name: "A"}: validNode,
		{Kind: KindDomain, Name: "D"}:         validDomain,
	}}
	if err := validPlan.validateReferences(); err != nil {
		t.Fatalf("valid references: %v", err)
	}
	badDomain := *validDomain
	badDomain.Value.Domain = &Domain{Name: "D", Includes: []string{"node:Missing"}}
	badPlan := &plannedState{Objects: map[OntologyRef]*plannedObject{
		{Kind: KindNodeDefinition, Name: "A"}: validNode,
		{Kind: KindDomain, Name: "D"}:         &badDomain,
	}}
	if err := badPlan.validateReferences(); err == nil {
		t.Fatal("dangling Domain reference accepted")
	}
	badEndpoint := "domain:D"
	relObject := &plannedObject{Value: ObjectValue{Kind: KindRelationshipDefinition, Definition: &Definition{
		Kind: KindRelationshipDefinition, Name: "R", From: &badEndpoint,
		Properties: []Property{{Name: "p", Type: "STRING"}}, Constraints: []Constraint{},
	}}}
	badEndpointPlan := &plannedState{Objects: map[OntologyRef]*plannedObject{
		{Kind: KindDomain, Name: "D"}:                 validDomain,
		{Kind: KindRelationshipDefinition, Name: "R"}: relObject,
	}}
	if err := badEndpointPlan.validateReferences(); err == nil {
		t.Fatal("non-node Relationship endpoint accepted")
	}

	if _, err := refFromObject(ObjectValue{Kind: KindDomain}); err == nil {
		t.Fatal("missing Domain body accepted")
	}
	if _, err := refFromObject(ObjectValue{Kind: KindNodeDefinition}); err == nil {
		t.Fatal("missing Definition body accepted")
	}
	if _, err := refFromObject(ObjectValue{Kind: "bad"}); err == nil {
		t.Fatal("bad Object kind accepted")
	}
	domainValue := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "Old"}}
	setObjectName(domainValue, "New")
	if domainValue.Domain.Name != "New" {
		t.Fatal("Domain name not set")
	}
	definitionValue := ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{Name: "Old"}}
	setObjectName(definitionValue, "New")
	if definitionValue.Definition.Name != "New" {
		t.Fatal("Definition name not set")
	}
	if containsOntologyRef([]OntologyRef{{Kind: KindDomain, Name: "A"}}, OntologyRef{Kind: KindDomain, Name: "B"}) {
		t.Fatal("containsOntologyRef false positive")
	}
	if !containsOntologyRef([]OntologyRef{{Kind: KindDomain, Name: "A"}}, OntologyRef{Kind: KindDomain, Name: "A"}) {
		t.Fatal("containsOntologyRef false negative")
	}
}
