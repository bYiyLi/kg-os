package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestSandboxDeadlineCausesRemainDistinct(t *testing.T) {
	for _, test := range []struct {
		name  string
		code  string
		ctx   func() (context.Context, context.CancelFunc)
		limit time.Duration
	}{
		{"request-deadline", "TIMEOUT", func() (context.Context, context.CancelFunc) {
			return context.WithTimeout(context.Background(), 75*time.Millisecond)
		}, 2 * time.Second},
		{"client-cancel", "CANCELLED", func() (context.Context, context.CancelFunc) {
			ctx, cancel := context.WithCancel(context.Background())
			go func() {
				time.Sleep(75 * time.Millisecond)
				cancel()
			}()
			return ctx, cancel
		}, 2 * time.Second},
		{"sandbox-deadline", "RESOURCE_ERROR", func() (context.Context, context.CancelFunc) {
			return context.WithCancel(context.Background())
		}, 75 * time.Millisecond},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := test.ctx()
			defer cancel()
			out, err := ExecuteWithLimits(ctx, `await new Promise(() => {})`, true,
				sandboxMockDispatch, sandboxMockStream, Limits{Timeout: test.limit})
			var script *ScriptError
			if out != nil || !errors.As(err, &script) || script.Code != test.code {
				t.Fatalf("deadline classification: output=%s error=%v, want %s", out, err, test.code)
			}
			if !strings.Contains(script.Message, "writes may have completed") {
				t.Fatalf("interruption lost uncertain write warning: %q", script.Message)
			}
		})
	}
}

func TestSandboxInterruptedWriteIsNotReplayed(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var writes atomic.Int32
	dispatch := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		writes.Add(1)
		cancel()
		return json.RawMessage(`{"saved":true}`), nil
	}
	out, err := Execute(ctx, `await object.patch({}); return "saved"`, false, dispatch, sandboxMockStream)
	var script *ScriptError
	if out != nil || !errors.As(err, &script) || script.Code != "CANCELLED" || writes.Load() != 1 {
		t.Fatalf("interrupted write output=%s error=%v writes=%d", out, err, writes.Load())
	}
}

func TestSandboxStreamPanicIsContained(t *testing.T) {
	for _, method := range []string{"streamQuery", "streamExecute"} {
		t.Run(method, func(t *testing.T) {
			var calls atomic.Int32
			producerContext := make(chan context.Context, 1)
			stream := func(ctx context.Context, _ string, _ json.RawMessage, emit func(json.RawMessage) error) error {
				calls.Add(1)
				producerContext <- ctx
				if err := emit(json.RawMessage(`{"type":"columns","columns":["n"]}`)); err != nil {
					return err
				}
				panic("secret=private-stream-credential")
			}
			code := `for await (const event of graph.` + method + `({})) {} return "complete"`
			out, err := Execute(context.Background(), code, method == "streamQuery", sandboxMockDispatch, stream)
			var script *ScriptError
			if out != nil || !errors.As(err, &script) || script.Code != "INTERNAL_ERROR" {
				t.Fatalf("stream panic result=%s error=%v", out, err)
			}
			if script.Message != "Internal SDK stream failed" || strings.Contains(err.Error(), "private-stream-credential") {
				t.Fatalf("stream panic exposed private diagnostics: %v", err)
			}
			if calls.Load() != 1 {
				t.Fatalf("failed stream was replayed %d times", calls.Load())
			}
			streamCtx := <-producerContext
			select {
			case <-streamCtx.Done():
			case <-time.After(time.Second):
				t.Fatal("panicking producer context was not cancelled")
			}
			out, err = Execute(context.Background(), `return 42`, true, sandboxMockDispatch, sandboxMockStream)
			if err != nil || string(out) != "42" {
				t.Fatalf("stream panic poisoned subsequent invocation: %s %v", out, err)
			}
		})
	}
}

func TestGoBridgeStreamPanicCleansUpOnce(t *testing.T) {
	inv := testBridgeInvocation(context.Background(), true)
	defer inv.close()
	inv.stream = func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error {
		panic("private-stream-panic")
	}
	opened, err := inv.streamCall("stream-open", []json.RawMessage{json.RawMessage(`"graph.streamQuery"`), json.RawMessage(`{}`)})
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
	_, err = inv.streamCall("stream-next", []json.RawMessage{id})
	var public *CallError
	if !errors.As(err, &public) || public.Code != "INTERNAL_ERROR" || len(inv.streams) != 0 {
		t.Fatalf("panic terminal result=%v retained streams=%d", err, len(inv.streams))
	}
	if result, err := inv.streamCall("stream-return", []json.RawMessage{id}); err != nil || string(result) != "null" {
		t.Fatalf("closed stream cleanup must remain idempotent: %s %v", result, err)
	}
	if _, err := inv.streamCall("stream-next", []json.RawMessage{id}); err == nil {
		t.Fatal("closed stream yielded a second terminal result")
	}
}
