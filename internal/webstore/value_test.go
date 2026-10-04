package webstore

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const typedNode = `{"$type":"Node","elementId":"node-a","labels":["Person"],"properties":{"$type":"business","age":42}}`
const typedRelationship = `{"$type":"Relationship","elementId":"rel-a","type":"LINK","start":"node-a","end":"node-a","properties":{"weight":1.0}}`

func TestLithographJSONValuesPreserveGraphTypesAndPrecision(t *testing.T) {
	values := []string{
		`null`, `true`, `"text"`, `[]`, `{}`, `{"nested":[null,false,{"value":2}]}`,
		`9007199254740991`, `-9007199254740991`, `1e100`, `1e20`, `9007199254740992.0`, `-0.0`, `0.00000000000000001`,
		`{"$type":"Integer","value":"9223372036854775807"}`,
		`{"$type":"Integer","value":"-9223372036854775808"}`,
		`{"$type":"Float","value":"NaN"}`, `{"$type":"Float","value":"Infinity"}`, `{"$type":"Float","value":"-Infinity"}`,
		`{"$type":"Map","entries":{"$type":"Node","elementId":"business","nested":{"$type":"Map","entries":{"$type":"application"}}}}`,
		typedNode, typedRelationship,
		`{"$type":"Path","nodes":[` + typedNode + `],"relationships":[]}`,
		`{"$type":"Path","nodes":[` + typedNode + `,` + typedNode + `],"relationships":[` + typedRelationship + `]}`,
		`{"$type":"Date","value":"2026-09-16"}`,
		`{"$type":"LocalTime","value":"12:30:00.123456789"}`,
		`{"$type":"Time","value":"12:30:00+08:00"}`,
		`{"$type":"LocalDateTime","value":"2026-09-16T12:30:00"}`,
		`{"$type":"ZonedDateTime","value":"2026-09-16T12:30:00Z","zone":"Z"}`,
		`{"$type":"Duration","value":"P1DT2H"}`,
		`{"$type":"UUID","value":"550e8400-e29b-41d4-a716-446655440000"}`,
		`{"$type":"Point","crs":"cartesian","coordinates":[1.0,2.0]}`,
		`{"$type":"Point","crs":"cartesian-3d","coordinates":[1.0,2.0,3.0]}`,
		`{"$type":"Point","crs":"wgs-84","coordinates":[180.0,-90.0]}`,
		`{"$type":"Point","crs":"wgs-84-3d","coordinates":[180.0,90.0,3.0]}`,
		`{"$type":"Vector","coordinateType":"I8","dimension":2,"values":[-128,127]}`,
		`{"$type":"Vector","coordinateType":"I16","dimension":2,"values":[-32768,32767]}`,
		`{"$type":"Vector","coordinateType":"I32","dimension":2,"values":[-2147483648,2147483647]}`,
		`{"$type":"Vector","coordinateType":"I64","dimension":2,"values":[{"$type":"Integer","value":"-9223372036854775808"},{"$type":"Integer","value":"9223372036854775807"}]}`,
		`{"$type":"Vector","coordinateType":"F32","dimension":2,"values":[1.0,3e38]}`,
		`{"$type":"Vector","coordinateType":"F64","dimension":2,"values":[1e100,{"$type":"Integer","value":"9223372036854775807"}]}`,
	}
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	input := cacheFixture(info.StoreID, frame)
	input.Result.Rows = nil
	for _, value := range values {
		if !validLithographValue(json.RawMessage(value)) {
			t.Errorf("valid Lithograph value rejected: %s", value)
		}
		input.Result.Rows = append(input.Result.Rows, []json.RawMessage{json.RawMessage(value)})
	}
	stored, err := store.CacheWrite(testContext, input)
	if err != nil || !stored.Stored {
		t.Fatalf("typed cache write: %+v %v", stored, err)
	}
	read, err := store.CacheRead(testContext, input.CacheRequest)
	if err != nil || !read.Hit || len(read.Result.Rows) != len(values) {
		t.Fatalf("typed cache read: %+v %v", read, err)
	}
	for index, value := range values {
		if !bytes.Equal(read.Result.Rows[index][0], []byte(value)) {
			t.Errorf("value bytes changed: %s -> %s", value, read.Result.Rows[index][0])
		}
	}
}

func TestMalformedLithographValuesAreRejected(t *testing.T) {
	values := []string{
		``, `broken`, `1 2`, `1e400`, `9007199254740993`, `-9007199254740993`,
		`{"$type":7}`, `{"$type":"application"}`, `[{"$type":"unknown"}]`, `{"nested":9007199254740993}`,
		`{"$type":"Integer","value":7}`, `{"$type":"Integer","value":"9223372036854775808"}`,
		`{"$type":"Integer","value":"01"}`, `{"$type":"Integer","value":"-0"}`, `{"$type":"Integer","value":"1","extra":true}`,
		`{"$type":"Float","value":7}`, `{"$type":"Float","value":"finite"}`,
		`{"$type":"Map","entries":[]}`, `{"$type":"Map","entries":{"invalid":{"$type":"Node"}}}`,
		`{"$type":"Node"}`, `{"$type":"Node","elementId":1,"labels":[],"properties":{}}`,
		`{"$type":"Node","elementId":"n","labels":"Person","properties":{}}`,
		`{"$type":"Node","elementId":"n","labels":[1],"properties":{}}`,
		`{"$type":"Node","elementId":"n","labels":[],"properties":[]}`,
		`{"$type":"Relationship"}`, `{"$type":"Relationship","elementId":"r","type":1,"start":"a","end":"b","properties":{}}`,
		`{"$type":"Relationship","elementId":"r","type":"L","start":"a","end":"b","properties":null}`,
		`{"$type":"Path"}`, `{"$type":"Path","nodes":[],"relationships":[]}`,
		`{"$type":"Path","nodes":[{}],"relationships":[]}`,
		`{"$type":"Path","nodes":[` + typedNode + `,` + typedNode + `],"relationships":[{}]}`,
		`{"$type":"Path","nodes":[` + typedNode + `,` + typedNode + `],"relationships":[{"$type":"Relationship"}]}`,
		`{"$type":"Date","value":1}`, `{"$type":"Time","value":""}`,
		`{"$type":"ZonedDateTime","value":"x"}`, `{"$type":"ZonedDateTime","value":"x","zone":""}`,
		`{"$type":"UUID","value":"550E8400-E29B-41D4-A716-446655440000"}`,
		`{"$type":"Point"}`, `{"$type":"Point","crs":1,"coordinates":[]}`,
		`{"$type":"Point","crs":"unknown","coordinates":[1.0,2.0]}`,
		`{"$type":"Point","crs":"cartesian","coordinates":[1.0]}`,
		`{"$type":"Point","crs":"cartesian","coordinates":["1",2.0]}`,
		`{"$type":"Point","crs":"wgs-84","coordinates":[180.0,91.0]}`,
		`{"$type":"Point","crs":"cartesian","coordinates":[9007199254740993,2.0]}`,
		`{"$type":"Vector"}`, `{"$type":"Vector","coordinateType":"unknown","dimension":1,"values":[1]}`,
		`{"$type":"Vector","coordinateType":"I8","dimension":1,"values":[128]}`,
		`{"$type":"Vector","coordinateType":"I64","dimension":1,"values":[9007199254740993]}`,
		`{"$type":"Vector","coordinateType":"I32","dimension":1,"values":[1.0]}`,
		`{"$type":"Vector","coordinateType":"F32","dimension":1,"values":[1e100]}`,
		`{"$type":"Vector","coordinateType":"F64","dimension":1,"values":[{"$type":"Float","value":"Infinity"}]}`,
		`{"$type":"Vector","coordinateType":"F64","dimension":0,"values":[]}`,
		`{"$type":"Vector","coordinateType":"F64","dimension":4097,"values":[]}`,
		`{"$type":"Vector","coordinateType":"F64","dimension":2,"values":[1.0]}`,
		`{"$type":"Vector","coordinateType":"F64","dimension":{"$type":"Integer","value":"1"},"values":[1.0]}`,
	}
	for _, value := range values {
		if validLithographValue(json.RawMessage(value)) {
			t.Errorf("malformed Lithograph value accepted: %s", value)
		}
	}
}

func TestInvalidTypedCacheWritePreservesConfirmedCacheAndBadFileBecomesMiss(t *testing.T) {
	store, info := testStore(t)
	frame := saveFrame(t, store, info, "query", "complete", false)
	input := cacheFixture(info.StoreID, frame)
	written, err := store.CacheWrite(testContext, input)
	if err != nil || !written.Stored {
		t.Fatalf("initial write: %+v %v", written, err)
	}
	for _, raw := range []string{`{"$type":"Integer","value":7}`, `{"$type":"Node"}`, `9007199254740993`} {
		invalid := input
		invalid.Result.Rows = [][]json.RawMessage{{json.RawMessage(raw)}}
		_, err := store.CacheWrite(testContext, invalid)
		wantCode(t, err, kernel.CodeInvalidArgument)
		read, err := store.CacheRead(testContext, input.CacheRequest)
		if err != nil || !read.Hit || !bytes.Equal(read.Result.Rows[0][0], input.Result.Rows[0][0]) {
			t.Fatalf("invalid write replaced confirmed cache: %+v %v", read, err)
		}
	}
	cached, _, err := store.loadCache(frame.ID)
	if err != nil {
		t.Fatal(err)
	}
	cached.Result.Rows = [][]json.RawMessage{{json.RawMessage(`{"$type":"Integer","value":7}`)}}
	encoded, err := json.Marshal(cached)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.cachePath(frame.ID), encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	read, err := store.CacheRead(testContext, input.CacheRequest)
	if err != nil || read.Hit {
		t.Fatalf("invalid on-disk typed cache did not become miss: %+v %v", read, err)
	}
	if _, err := os.Stat(store.cachePath(frame.ID)); !os.IsNotExist(err) {
		t.Fatalf("invalid cache not removed: %v", err)
	}
	record, err := store.Read(testContext, ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: frame.ID})
	if err != nil || record.Revision != frame.Revision || !bytes.Equal(record.Data, frame.Data) {
		t.Fatalf("invalid cache changed persistent frame: %+v %v", record, err)
	}
}
