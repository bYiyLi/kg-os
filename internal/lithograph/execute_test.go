package lithograph

import "testing"

func TestMarshalObjectTreatsTypedNilMapAsEmptyObject(t *testing.T) {
	var values map[string]any
	encoded, err := marshalObject(values)
	if err != nil {
		t.Fatalf("marshal typed nil map: %v", err)
	}
	if encoded != "{}" {
		t.Fatalf("encoded typed nil map = %q", encoded)
	}
}

func TestMarshalObjectRejectsNonObject(t *testing.T) {
	if _, err := marshalObject([]string{"not", "an", "object"}); err == nil {
		t.Fatal("non-object JSON was accepted")
	}
}
