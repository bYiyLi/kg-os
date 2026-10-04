package webstore

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func frameParamsPayload(t *testing.T, paramsText *string) json.RawMessage {
	t.Helper()
	data := map[string]any{
		"version": 1, "mode": "query", "statement": "RETURN $value", "params": json.RawMessage(`{"value":1}`),
		"readState": testState, "resultState": testState, "status": "complete", "closed": false,
	}
	if paramsText != nil {
		data["paramsText"] = *paramsText
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestFrameParamsTextPreservesExactNumbersAndRecordBytes(t *testing.T) {
	store, info := testStore(t)
	text := " {\n\"value\":1.0,\"zero\":-0.0,\"big\":9223372036854775807," +
		`"typed":{"$type":"Integer","value":"9223372036854775807"},"nested":[1.0,-0.0,9223372036854775807]} `
	data := frameParamsPayload(t, &text)
	record := saveFixture(t, store, info, "frame", string(data))
	loaded, err := store.Read(testContext, ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: record.ID})
	if err != nil || !bytes.Equal(loaded.Data, data) {
		t.Fatalf("frame wire bytes changed: %s, %v", loaded.Data, err)
	}
	var frame frameData
	if err := json.Unmarshal(loaded.Data, &frame); err != nil || frame.ParamsText == nil || *frame.ParamsText != text {
		t.Fatalf("raw params text changed: %+v, %v", frame, err)
	}
	params, err := frame.parameters()
	if err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]string{
		"value": "1.0", "zero": "-0.0", "big": "9223372036854775807",
		"typed": `{"$type":"Integer","value":"9223372036854775807"}`, "nested": `[1.0,-0.0,9223372036854775807]`,
	} {
		if string(params[key]) != want {
			t.Fatalf("actual query parameter %s = %s; want %s", key, params[key], want)
		}
	}
	legacy := record
	legacy.Data = frameParamsPayload(t, nil)
	legacyFingerprint, _, eligible := store.fingerprint(legacy)
	if !eligible {
		t.Fatal("legacy frame without paramsText became ineligible")
	}
	rawFingerprint, _, eligible := store.fingerprint(record)
	if !eligible || legacyFingerprint == rawFingerprint {
		t.Fatal("fingerprint ignored the actual raw query parameters")
	}
}

func TestFrameParamsTextChangesInvalidateCacheWithoutRounding(t *testing.T) {
	store, info := testStore(t)
	frame := saveFixture(t, store, info, "frame", string(frameParamsPayload(t, nil)))
	input := cacheFixture(info.StoreID, frame)
	if written, err := store.CacheWrite(testContext, input); err != nil || !written.Stored {
		t.Fatalf("legacy cache write: %+v, %v", written, err)
	}
	for _, step := range []struct {
		text    string
		wantHit bool
	}{
		{`{"value":1}`, true},
		{" { \"value\" : 1 }\n", true},
		{`{"value":1.0}`, false},
		{`{"value":-0.0}`, false},
		{`{"value":0.0}`, false},
		{`{"value":9223372036854775807}`, false},
		{`{"value":9223372036854775806}`, false},
	} {
		updated, err := store.Save(testContext, SaveRequest{
			ReadRequest:      ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID},
			ExpectedRevision: &frame.Revision, MutationID: NewID(), Data: frameParamsPayload(t, &step.text),
		})
		if err != nil {
			t.Fatal(err)
		}
		read, err := store.CacheRead(testContext, input.CacheRequest)
		if err != nil || read.Hit != step.wantHit {
			t.Fatalf("cache binding for %s: %+v, %v; want hit %v", step.text, read, err, step.wantHit)
		}
		if _, err := store.CacheWrite(testContext, input); err == nil {
			t.Fatal("paramsText update accepted a late cache write")
		} else {
			wantCode(t, err, CodeChanged)
		}
		frame = updated
		input.FrameRevision = frame.Revision
		if written, err := store.CacheWrite(testContext, input); err != nil || !written.Stored {
			t.Fatalf("current raw-params cache write: %+v, %v", written, err)
		}
	}
}

func TestFrameParamsTextRejectsInvalidObjectTextAndKeepsConfirmedRecord(t *testing.T) {
	store, info := testStore(t)
	valid := "{}"
	frame := saveFixture(t, store, info, "frame", string(frameParamsPayload(t, &valid)))
	input := cacheFixture(info.StoreID, frame)
	if written, err := store.CacheWrite(testContext, input); err != nil || !written.Stored {
		t.Fatalf("empty raw-params cache write: %+v, %v", written, err)
	}
	invalidFields := []json.RawMessage{json.RawMessage("null"), json.RawMessage("1"), json.RawMessage("true"), json.RawMessage("{}"), json.RawMessage("[]")}
	for _, text := range []string{"", "null", "[]", "true", "1", `"value"`, "{", "{} {}", `{"value":NaN}`} {
		encoded, _ := json.Marshal(text)
		invalidFields = append(invalidFields, encoded)
		bad := frame
		bad.Data = frameParamsPayload(t, &text)
		if _, _, eligible := store.fingerprint(bad); eligible {
			t.Fatalf("invalid raw parameters remained cache eligible: %q", text)
		}
	}
	for _, field := range invalidFields {
		var object map[string]json.RawMessage
		if err := json.Unmarshal(frame.Data, &object); err != nil {
			t.Fatal(err)
		}
		object["paramsText"] = field
		data, err := json.Marshal(object)
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.Save(testContext, SaveRequest{
			ReadRequest:      ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID},
			ExpectedRevision: &frame.Revision, MutationID: NewID(), Data: data,
		})
		wantCode(t, err, kernel.CodeInvalidArgument)
	}
	loaded, err := store.Read(testContext, ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID})
	if err != nil || loaded.Revision != frame.Revision || !bytes.Equal(loaded.Data, frame.Data) {
		t.Fatalf("invalid paramsText damaged confirmed record: %+v, %v", loaded, err)
	}
	if cached, err := store.CacheRead(testContext, input.CacheRequest); err != nil || !cached.Hit {
		t.Fatalf("invalid paramsText damaged confirmed cache: %+v, %v", cached, err)
	}
}
