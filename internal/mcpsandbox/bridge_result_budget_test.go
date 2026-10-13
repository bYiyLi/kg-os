package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestGoBridgeBoundsIntermediateSDKResultsAndStreamEvents(t *testing.T) {
	inv := testBridgeInvocation(context.Background(), true)
	defer inv.close()
	inv.limits.MaxOutputBytes = 1024
	large := json.RawMessage(`{"data":"` + strings.Repeat("X", 2048) + `"}`)
	inv.dispatch = func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return large, nil
	}
	inv.call(callRequest{ID: 1, Method: "ontology.read", Params: "[{}]"})
	if response := <-inv.response; response.Code != "RESOURCE_ERROR" || response.JSON != "" {
		t.Fatalf("oversized Kernel result reached guest: %#v", response)
	}
	inv.dispatch = func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return json.RawMessage(`{"safe":true}`), nil
	}
	inv.call(callRequest{ID: 2, Method: "ontology.read", Params: "[{}]"})
	if response := <-inv.response; response.Code != "" || response.JSON != `{"safe":true}` {
		t.Fatalf("valid Kernel result rejected: %#v", response)
	}

	inv.stream = func(_ context.Context, _ string, _ json.RawMessage, emit func(json.RawMessage) error) error {
		return emit(large)
	}
	opened, err := inv.streamCall("stream-open", []json.RawMessage{
		json.RawMessage(`"graph.streamQuery"`), json.RawMessage(`{"cypher":"RETURN 1"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	var handle struct {
		StreamID int `json:"streamId"`
	}
	if err := json.Unmarshal(opened, &handle); err != nil {
		t.Fatal(err)
	}
	streamID, _ := json.Marshal(handle.StreamID)
	_, err = inv.streamCall("stream-next", []json.RawMessage{streamID})
	var public *CallError
	if !errors.As(err, &public) || public.Code != "RESOURCE_ERROR" {
		t.Fatalf("oversized Graph event did not fail closed: %v", err)
	}
	if len(inv.streams) != 0 {
		t.Fatal("oversized Graph stream left a live handle")
	}
}

func TestWASMScriptCanCatchOversizedKernelResult(t *testing.T) {
	large := json.RawMessage(`{"value":"` + strings.Repeat("A", 2048) + `"}`)
	result, err := ExecuteWithLimits(context.Background(),
		`try { await ontology.read({at:"branch/main"}); return "unbounded"; } catch(e) { return e.code; }`,
		true,
		func(context.Context, string, []json.RawMessage) (json.RawMessage, error) { return large, nil },
		func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error { return nil },
		Limits{MaxOutputBytes: 1024},
	)
	if err != nil || string(result) != `"RESOURCE_ERROR"` {
		t.Fatalf("guest lost bridge budget error: %s %v", result, err)
	}
}
