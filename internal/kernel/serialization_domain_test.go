package kernel

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestDomainCanonicalIncludesRemainArraysThroughSnapshotAndYAML(t *testing.T) {
	t.Parallel()
	for _, includes := range [][]string{nil, {}, {"node:Z", "domain:A"}} {
		value := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "Research", Includes: includes}}
		body, err := RenderObjectYAML(value)
		if err != nil {
			t.Fatal(err)
		}
		reparsed, err := ParseObjectYAML(KindDomain, body)
		if err != nil {
			t.Fatal(err)
		}
		snapshotCopy := cloneDomain(*value.Domain)
		for _, actual := range []ObjectValue{reparsed, {Kind: KindDomain, Domain: &snapshotCopy}} {
			equal, err := CanonicalObjectEqual(value, actual)
			if err != nil || !equal {
				t.Fatalf("logical Domain changed through canonical YAML/Snapshot: %#v, %v", actual, err)
			}
		}
		encoded, err := RenderObjectJSON(value)
		if err != nil {
			t.Fatal(err)
		}
		var object map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &object); err != nil || !bytes.HasPrefix(object["includes"], []byte("[")) {
			t.Fatalf("Domain includes must be an array: %s, %v", encoded, err)
		}
		if len(includes) == 0 && string(object["includes"]) != "[]" {
			t.Fatalf("empty includes must be []: %s", encoded)
		}
		if includes == nil && value.Domain.Includes != nil {
			t.Fatal("public JSON encoding mutated nil includes in the input")
		}
	}
}
