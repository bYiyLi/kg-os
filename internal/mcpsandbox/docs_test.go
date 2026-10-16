package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestDocsReadEnforcesSandboxOutputBudget(t *testing.T) {
	result, err := ExecuteWithLimits(
		context.Background(),
		`try { await docs.read("sdk/index.md"); return "unexpected"; } catch (e) { return e.code; }`,
		true,
		func(_ context.Context, method string, args []json.RawMessage) (json.RawMessage, error) {
			if method != "docs.read" {
				return nil, errBadMethod
			}
			return ReadDoc(args)
		},
		func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error {
			return nil
		},
		Limits{MaxOutputBytes: 1024},
	)
	if err != nil || string(result) != `"RESOURCE_ERROR"` {
		t.Fatalf("docs.read bypassed the SDK response budget: %s %v", result, err)
	}
}

func TestDocsCatalogAndCompleteMCPInventory(t *testing.T) {
	raw, err := ReadDoc([]json.RawMessage{json.RawMessage(`"sdk/index.md"`)})
	if err != nil {
		t.Fatal(err)
	}
	var index string
	if err := json.Unmarshal(raw, &index); err != nil {
		t.Fatal(err)
	}
	for name := range readMethods {
		if !strings.Contains(index, "`"+name+"`") {
			t.Errorf("undocumented read method %q", name)
		}
	}
	for name := range writeMethods {
		if !strings.Contains(index, "`"+name+"`") {
			t.Errorf("undocumented write method %q", name)
		}
	}
	for _, path := range []string{"index.md", "sdk/types/index.md", "cypher/index.md", "cypher/functions-reference.md", "cypher/procedures-reference.md", "guides/index.md", "sdk/types/StateRef.md", "sdk/types/MergeResolution.md", "sdk/evolution/merge/resolve.md"} {
		input, _ := json.Marshal(path)
		value, err := ReadDoc([]json.RawMessage{input})
		if err != nil || len(value) < 20 {
			t.Fatalf("docs.read(%s) = %s, %v", path, value, err)
		}
	}
	for _, check := range []struct{ path, contains string }{
		{"cypher/functions-reference.md", "elementId(input"},
		{"cypher/procedures-reference.md", "lithograph.merge.resolve("},
		{"sdk/types/MergeResolution.md", "sdk/types/MergeConflictResolution.md"},
		{"sdk/types/GraphExecuteResult.md", "sdk/types/GraphQueryResult.md"},
		{"sdk/types/index.md", "sdk/types/MergeResolution.md"},
	} {
		path, _ := json.Marshal(check.path)
		body, err := ReadDoc([]json.RawMessage{path})
		if err != nil || !strings.Contains(string(body), check.contains) {
			t.Fatalf("missing pinned reference %q: %s %v", check.path, body, err)
		}
	}
}

func TestDocsReadRejectsHostPathsAndUnknownFiles(t *testing.T) {
	for _, args := range [][]json.RawMessage{
		nil, {}, {json.RawMessage(`null`)}, {json.RawMessage(`123`)},
		{json.RawMessage(`""`)}, {json.RawMessage(`"/etc/passwd"`)},
		{json.RawMessage(`"../sdk/index.md"`)}, {json.RawMessage(`"sdk/../index.md"`)},
		{json.RawMessage(`"sdk\\index.md"`)}, {json.RawMessage(`"https://example.com/a.md"`)},
		{json.RawMessage(`"sdk/index.md?x=1"`)}, {json.RawMessage(`"sdk/index.md#anchor"`)},
		{json.RawMessage(`".secret.md"`)}, {json.RawMessage(`"SDK/INDEX.md"`)},
		{json.RawMessage(`"sdk/index.md"`), json.RawMessage(`"extra"`)},
	} {
		_, err := ReadDoc(args)
		var public *CallError
		if !errors.As(err, &public) || public.Code != "INVALID_ARGUMENT" || strings.Contains(public.Message, "/etc") {
			t.Fatalf("invalid path %q: %v", args, err)
		}
	}
}
