package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func testBridgeInvocation(ctx context.Context, readOnly bool) *invocation {
	return &invocation{
		ctx: ctx, readOnly: readOnly, streams: make(map[int]*streamSession),
		response: make(chan callResponse, 32), limits: Limits{MaxStreams: 1},
		dispatch: func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
			return json.RawMessage(`{"verified":true}`), nil
		},
		stream: func(ctx context.Context, method string, request json.RawMessage, emit func(json.RawMessage) error) error {
			for _, event := range []string{`{"type":"columns"}`, `{"type":"summary","state":"commit/ok"}`} {
				if err := emit(json.RawMessage(event)); err != nil {
					return err
				}
			}
			return nil
		},
	}
}

func TestGoBridgeCallValidatesMessageAndPublicBoundary(t *testing.T) {
	inv := testBridgeInvocation(context.Background(), true)
	defer inv.close()
	checks := []struct {
		name string
		req  callRequest
		code string
	}{
		{"malformed", callRequest{ID: 1, Method: "ontology.read", Params: "not-json"}, "INVALID_ARGUMENT"},
		{"resource", callRequest{ID: 2, Method: "ontology.read", Params: strings.Repeat("x", 1<<20+1)}, "RESOURCE_ERROR"},
		{"forbidden", callRequest{ID: 3, Method: "ontology.patch", Params: "[]"}, "PERMISSION_DENIED"},
		{"unknown", callRequest{ID: 4, Method: "future.sdk.method", Params: "[]"}, "PERMISSION_DENIED"},
		{"valid-read", callRequest{ID: 5, Method: "ontology.read", Params: "[{}]"}, ""},
		{"bad-stream-op", callRequest{ID: 6, Method: "stream-next", Params: "[]"}, "INVALID_ARGUMENT"},
	}
	for _, entry := range checks {
		t.Run(entry.name, func(t *testing.T) {
			inv.call(entry.req)
			select {
			case got := <-inv.response:
				if got.ID != entry.req.ID || got.Code != entry.code {
					t.Fatalf("call %#v got %#v", entry.req, got)
				}
				if entry.code == "" && !json.Valid([]byte(got.JSON)) {
					t.Errorf("valid Kernel result became invalid: %q", got.JSON)
				}
			case <-time.After(time.Second):
				t.Fatal("Go Bridge response blocked")
			}
		})
	}
	inv.dispatch = func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return json.RawMessage("not-valid-json"), nil
	}
	inv.call(callRequest{ID: 7, Method: "ontology.read", Params: "[{}]"})
	if got := <-inv.response; got.Code != "INTERNAL_ERROR" {
		t.Errorf("invalid Kernel JSON exposed: %#v", got)
	}
	inv.dispatch = func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return nil, &CallError{Code: "STATE_NOT_FOUND", Message: "Not found", Details: json.RawMessage(`{"state":"unknown"}`)}
	}
	inv.call(callRequest{ID: 8, Method: "ontology.read", Params: "[{}]"})
	if got := <-inv.response; got.Code != "STATE_NOT_FOUND" || !strings.Contains(got.Details, "unknown") {
		t.Errorf("public Code/Details lost: %#v", got)
	}
	inv.dispatch = func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return nil, errors.New("contains=private-workspace")
	}
	inv.call(callRequest{ID: 9, Method: "ontology.read", Params: "[{}]"})
	if got := <-inv.response; got.Code != "INTERNAL_ERROR" || strings.Contains(got.Message, "private-workspace") {
		t.Errorf("host error leaked: %#v", got)
	}
	inv.dispatch = func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		panic("private-administrator-token")
	}
	inv.call(callRequest{ID: 10, Method: "ontology.read", Params: "[{}]"})
	if got := <-inv.response; got.Code != "INTERNAL_ERROR" || strings.Contains(got.Message, "private-administrator-token") {
		t.Errorf("host panic leaked: %#v", got)
	}
}

func TestGoBridgeStreamHandleInvalidRequestsAndReadOnly(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	inv := testBridgeInvocation(ctx, true)
	defer inv.close()
	type check struct {
		method string
		args   []json.RawMessage
		code   string
	}
	for _, entry := range []check{
		{"stream-open", nil, "INVALID_ARGUMENT"},
		{"stream-open", []json.RawMessage{json.RawMessage(`"graph.streamExecute"`), json.RawMessage(`{}`)}, "PERMISSION_DENIED"},
		{"stream-open", []json.RawMessage{json.RawMessage(`"malicious method"`), json.RawMessage(`{}`)}, "PERMISSION_DENIED"},
		{"stream-open", []json.RawMessage{json.RawMessage(`9`), json.RawMessage(`{}`)}, "PERMISSION_DENIED"},
		{"stream-next", nil, "INVALID_ARGUMENT"},
		{"stream-next", []json.RawMessage{json.RawMessage(`"invalid"`)}, "INVALID_ARGUMENT"},
		{"stream-next", []json.RawMessage{json.RawMessage(`900`)}, "INVALID_ARGUMENT"},
		{"stream-return", nil, "INVALID_ARGUMENT"},
	} {
		_, err := inv.streamCall(entry.method, entry.args)
		var public *CallError
		if errors.As(err, &public) {
			if public.Code != entry.code {
				t.Errorf("method=%s wrong code %s", entry.method, public.Code)
			}
		} else if entry.code == "PERMISSION_DENIED" && errors.Is(err, errBadMethod) {
			// Host maps this precise allowlist error to PERMISSION_DENIED.
		} else {
			t.Errorf("unhandled stream error %s: %v", entry.method, err)
		}
	}
	stopped, err := inv.streamCall("stream-return", []json.RawMessage{json.RawMessage(`900`)})
	if err != nil || string(stopped) != "null" {
		t.Errorf("stream-return should be idempotent: %s %v", stopped, err)
	}
	opened, err := inv.streamCall("stream-open", []json.RawMessage{
		json.RawMessage(`"graph.streamQuery"`), json.RawMessage(`{"cypher":"RETURN 1"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	var info struct {
		StreamID int `json:"streamId"`
	}
	if err := json.Unmarshal(opened, &info); err != nil || info.StreamID == 0 {
		t.Fatalf("stream ID missing: %s %v", opened, err)
	}
	if _, err := inv.streamCall("stream-open", []json.RawMessage{
		json.RawMessage(`"graph.streamQuery"`), json.RawMessage(`{}`),
	}); err == nil || !strings.Contains(err.Error(), "stream budget") {
		t.Fatalf("max concurrent streams not enforced: %v", err)
	}
	id, _ := json.Marshal(info.StreamID)
	first, err := inv.streamCall("stream-next", []json.RawMessage{id})
	if err != nil || !strings.Contains(string(first), "columns") {
		t.Fatalf("not pull-based: %s %v", first, err)
	}
	second, err := inv.streamCall("stream-next", []json.RawMessage{id})
	if err != nil || !strings.Contains(string(second), "summary") {
		t.Fatalf("summary lost: %s %v", second, err)
	}
	done, err := inv.streamCall("stream-next", []json.RawMessage{id})
	if err != nil || string(done) != `{"done":true}` {
		t.Fatalf("normal stream must finish: %s %v", done, err)
	}
	if _, err := inv.streamCall("stream-next", []json.RawMessage{id}); err == nil {
		t.Fatal("already closed stream next succeeded")
	}
	opened, err = inv.streamCall("stream-open", []json.RawMessage{
		json.RawMessage(`"graph.streamQuery"`), json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(opened, &info); err != nil {
		t.Fatal(err)
	}
	id, _ = json.Marshal(info.StreamID)
	stopped, err = inv.streamCall("stream-return", []json.RawMessage{id})
	if err != nil || string(stopped) != "null" {
		t.Fatalf("early break didn't close Stream: %s %v", stopped, err)
	}
	if len(inv.streams) != 0 {
		t.Fatal("Stream resources not cleaned after early close")
	}
}

func TestGoBridgeStreamTerminalErrorAndCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	inv := testBridgeInvocation(ctx, false)
	inv.stream = func(ctx context.Context, method string, request json.RawMessage, emit func(json.RawMessage) error) error {
		if err := emit(json.RawMessage(`{"type":"columns"}`)); err != nil {
			return err
		}
		return &CallError{Code: "STATE_NOT_FOUND", Message: "Graph state unavailable"}
	}
	opened, err := inv.streamCall("stream-open", []json.RawMessage{
		json.RawMessage(`"graph.streamExecute"`), json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	var info struct {
		StreamID int `json:"streamId"`
	}
	if err := json.Unmarshal(opened, &info); err != nil {
		t.Fatal(err)
	}
	id, _ := json.Marshal(info.StreamID)
	if _, err := inv.streamCall("stream-next", []json.RawMessage{id}); err != nil {
		t.Fatal(err)
	}
	_, err = inv.streamCall("stream-next", []json.RawMessage{id})
	var public *CallError
	if !errors.As(err, &public) || public.Code != "STATE_NOT_FOUND" {
		t.Fatalf("terminal Graph failure lost: %v", err)
	}
	blocked := testBridgeInvocation(ctx, false)
	blocked.stream = func(ctx context.Context, method string, request json.RawMessage, emit func(json.RawMessage) error) error {
		<-ctx.Done()
		return ctx.Err()
	}
	opened, err = blocked.streamCall("stream-open", []json.RawMessage{
		json.RawMessage(`"graph.streamQuery"`), json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(opened, &info); err != nil {
		t.Fatal(err)
	}
	id, _ = json.Marshal(info.StreamID)
	cancel()
	_, err = blocked.streamCall("stream-next", []json.RawMessage{id})
	if err == nil {
		t.Fatal("cancelled stream unexpectedly succeeded")
	}
	blocked.close()
	inv.close()
}
