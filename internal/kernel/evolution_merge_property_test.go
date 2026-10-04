package kernel

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestMergePropertyProjectionKeepsAggregateGuardAndFallsBackToScalar(t *testing.T) {
	t.Parallel()
	native := lithograph.MergeConflict{Base: json.RawMessage("1.0"), Ours: json.RawMessage("1"), Theirs: json.RawMessage("2.0")}
	for _, divergent := range []bool{false, true} {
		ours := json.RawMessage(`{"score":1,"negative":0}`)
		theirs := json.RawMessage(`{"score":2.0,"negative":0}`)
		if divergent {
			theirs = json.RawMessage(`{"score":2.0,"negative":-0.0}`)
		}
		public := MergeConflict{Kind: KindKnowledgeNode, Path: "/properties", Ours: ours, Theirs: theirs}
		projection, err := projectKnowledgePropertyMergeConflict(public, native, "score", ours, theirs)
		if err != nil {
			t.Fatal(err)
		}
		if divergent {
			if projection.Public.Path != "/properties/score" || string(projection.Public.Base) != "1.0" ||
				string(projection.Public.Ours) != "1" || string(projection.Public.Theirs) != "2.0" {
				t.Fatalf("scalar numeric projection lost property family: %#v", projection.Public)
			}
			mapped, err := projection.ToNative(json.RawMessage("3.0"))
			if err != nil || string(mapped) != "3.0" {
				t.Fatalf("scalar Float reverse mapping = %s, %v", mapped, err)
			}
			if _, err := projection.ToNative(json.RawMessage(`{"score":3.0,"negative":-0.0}`)); err == nil || AsPublicError(err).Code != CodeType {
				t.Fatalf("scalar resolution accepted an aggregate: %v", err)
			}
		} else {
			if projection.Public.Path != "/properties" || string(projection.Public.Base) != `{"negative":0,"score":1.0}` ||
				string(projection.Public.Ours) != string(ours) || string(projection.Public.Theirs) != string(theirs) {
				t.Fatalf("compatible aggregate projection changed: %#v", projection.Public)
			}
			mapped, err := projection.ToNative(json.RawMessage(`{"score":3.0,"negative":0}`))
			if err != nil || string(mapped) != "3.0" {
				t.Fatalf("aggregate reverse mapping = %s, %v", mapped, err)
			}
			if _, err := projection.ToNative(json.RawMessage(`{"score":3.0,"negative":-0.0}`)); err == nil || AsPublicError(err).Code != CodeConsistency {
				t.Fatalf("aggregate guard allowed an unrelated change: %v", err)
			}
		}
	}
}

func TestMergePropertyScalarProjectionEscapesExactKeysAndStoredTypedValues(t *testing.T) {
	t.Parallel()
	ours := json.RawMessage(`{"score":1,"a~/b":10,"negative":0}`)
	theirs := json.RawMessage(`{"score":2.0,"a~/b":12,"negative":-0.0}`)
	for property, path := range map[string]string{"score": "/properties/score", "a~/b": "/properties/a~0~1b"} {
		oursValue, theirsValue := json.RawMessage("1"), json.RawMessage("2.0")
		if property != "score" {
			oursValue, theirsValue = json.RawMessage("10"), json.RawMessage("12")
		}
		for _, value := range []string{"1.0", "-0.0", "1e+20", `{"$type":"Integer","value":"9223372036854775807"}`, `{"$type":"Float","value":"NaN"}`, `{"$type":"Float","value":"Infinity"}`, `[1.0,2.0]`} {
			native := lithograph.MergeConflict{
				Base: json.RawMessage(value), Ours: oursValue, Theirs: theirsValue,
				Resolution: json.RawMessage(`{"choice":"value","value":` + value + `}`),
			}
			projection, err := projectKnowledgePropertyMergeConflict(
				MergeConflict{Kind: KindKnowledgeRelationship, Path: "/properties"}, native, property, ours, theirs,
			)
			if err != nil || projection.Public.Path != path || string(projection.Public.Base) != value ||
				projection.Public.Resolution == nil || string(projection.Public.Resolution.Value) != value {
				t.Fatalf("typed %s projection = %#v, %v", value, projection.Public, err)
			}
			mapped, err := projection.ToNative(json.RawMessage(value))
			if err != nil || string(mapped) != value {
				t.Fatalf("typed %s resolution = %s, %v", value, mapped, err)
			}
		}
	}
}

func TestMergePropertyScalarAbsenceAndExplicitDeletion(t *testing.T) {
	t.Parallel()
	native := lithograph.MergeConflict{
		Base: json.RawMessage("null"), Ours: json.RawMessage("null"), Theirs: json.RawMessage("2.0"),
		Resolution: json.RawMessage(`{"choice":"value","value":null}`),
	}
	projection, err := projectKnowledgePropertyMergeConflict(
		MergeConflict{Kind: KindKnowledgeNode, Path: "/properties", BaseRef: "n:1", OursRef: "n:1", TheirsRef: "n:1"},
		native, "score", json.RawMessage(`{"negative":0}`), json.RawMessage(`{"score":2.0,"negative":-0.0}`),
	)
	if err != nil || projection.Public.Base != nil || projection.Public.Ours != nil || string(projection.Public.Theirs) != "2.0" {
		t.Fatalf("missing property sides became null: %#v, %v", projection.Public, err)
	}
	encoded, err := json.Marshal(projection.Public)
	if err != nil || strings.Contains(string(encoded), `"base":`) || strings.Contains(string(encoded), `"ours":`) ||
		!strings.Contains(string(encoded), `"value":null`) {
		t.Fatalf("absence/deletion wire = %s, %v", encoded, err)
	}
	if mapped, err := projection.ToNative(json.RawMessage("null")); err != nil || string(mapped) != "null" {
		t.Fatalf("explicit scalar deletion = %s, %v", mapped, err)
	}
}

func TestMergePropertyScalarRejectsInvalidValuesAndUnsafeSlots(t *testing.T) {
	t.Parallel()
	native := lithograph.MergeConflict{Base: json.RawMessage("1.0"), Ours: json.RawMessage("1"), Theirs: json.RawMessage("2.0")}
	ours, theirs := json.RawMessage(`{"score":1,"negative":0}`), json.RawMessage(`{"score":2.0,"negative":-0.0}`)
	projection, err := projectKnowledgePropertyMergeConflict(MergeConflict{}, native, "score", ours, theirs)
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []struct {
		raw  string
		code ErrorCode
	}{
		{"", CodeType}, {"1.0 2", CodeType}, {`{"other":0}`, CodeType},
		{`{"$type":"Integer","value":7}`, CodeType}, {`[1,2.0]`, CodeType},
		{`{"$type":"Vector","elementType":"F64","values":[1.0]}`, CodeUnsupportedOperation},
	} {
		if _, err := projection.ToNative(json.RawMessage(value.raw)); err == nil || AsPublicError(err).Code != value.code {
			t.Fatalf("invalid scalar %s was accepted: %v", value.raw, err)
		}
	}
	for _, property := range []string{"", "__kgos_name", "bad\x00key"} {
		if _, err := projectKnowledgePropertyMergeConflict(MergeConflict{}, native, property, ours, theirs); err == nil || AsPublicError(err).Code != CodeConsistency {
			t.Fatalf("unsafe public property %q accepted: %v", property, err)
		}
	}
	for _, raw := range []json.RawMessage{json.RawMessage("null"), json.RawMessage(`{"score":null}`)} {
		if _, err := projectKnowledgePropertyMergeConflict(MergeConflict{}, native, "score", raw, theirs); err == nil {
			t.Fatalf("invalid actual properties were accepted: %s", raw)
		}
	}
	if _, err := projectKnowledgePropertyMergeConflict(MergeConflict{}, native, "score", json.RawMessage(`{"negative":0}`), theirs); err == nil || AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("missing actual property mismatched native side: %v", err)
	}
	for _, raw := range []json.RawMessage{json.RawMessage(`{"unknown":1}`), json.RawMessage(`{"$type":"Vector"}`)} {
		if _, err := projectKnowledgePropertyScalar(raw); err == nil || AsPublicError(err).Code != CodeConsistency {
			t.Fatalf("invalid native scalar was publicly projected: %s, %v", raw, err)
		}
	}
}
