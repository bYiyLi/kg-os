package kernel

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestKnowledgeNodeJSONAndYAMLEmptyLabelsAreEquivalent(t *testing.T) {
	t.Parallel()
	for _, labels := range [][]string{nil, {}, {"Z", "A"}} {
		value := ObjectValue{Kind: KindKnowledgeNode, KnowledgeNode: &KnowledgeNode{
			Labels: labels, Properties: map[string]json.RawMessage{"text": json.RawMessage(`"two"`)},
		}}
		body, err := RenderObjectYAML(value)
		if err != nil {
			t.Fatal(err)
		}
		reparsed, err := ParseObjectYAML(KindKnowledgeNode, bytes.TrimSuffix(body, []byte("\n")))
		if err != nil {
			t.Fatal(err)
		}
		originalJSON, err := RenderObjectJSON(value)
		if err != nil {
			t.Fatal(err)
		}
		reparsedJSON, err := RenderObjectJSON(reparsed)
		if err != nil || !bytes.Equal(originalJSON, reparsedJSON) {
			t.Fatalf("logical Node changed through canonical YAML: %s -> %s, %v", originalJSON, reparsedJSON, err)
		}
		var object map[string]json.RawMessage
		if err := json.Unmarshal(originalJSON, &object); err != nil {
			t.Fatal(err)
		}
		if len(object["labels"]) == 0 || object["labels"][0] != '[' {
			t.Fatalf("labels must be an array: %s", originalJSON)
		}
		if len(labels) == 0 && string(object["labels"]) != "[]" {
			t.Fatalf("empty labels must be []: %s", originalJSON)
		}
	}
}
