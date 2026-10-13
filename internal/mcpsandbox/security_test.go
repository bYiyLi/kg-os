package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func sandboxMockDispatch(ctx context.Context, method string, args []json.RawMessage) (json.RawMessage, error) {
	return json.RawMessage(`{"success":true}`), nil
}
func sandboxMockStream(ctx context.Context, method string, args json.RawMessage, emit func(json.RawMessage) error) error {
	for _, event := range []string{`{"type":"columns","columns":["n"]}`, `{"type":"row","row":[1]}`, `{"type":"summary","state":"commit/abc"}`} {
		if err := emit(json.RawMessage(event)); err != nil {
			return err
		}
	}
	return nil
}

func TestSandboxLimitValidationAndErrorBoundary(t *testing.T) {
	tests := []struct {
		name    string
		limits  Limits
		code    string
		pattern string
	}{
		{"timeout-zero-allowed", Limits{Timeout: 0}, `return 17`, ""},
		{"timeout-negative", Limits{Timeout: -time.Second}, `return 1`, "invalid JavaScript sandbox budget"},
		{"memory-too-low", Limits{MemoryMiB: 7}, `return 1`, "invalid JavaScript sandbox budget"},
		{"memory-too-high", Limits{MemoryMiB: 513}, `return 1`, "invalid JavaScript sandbox budget"},
		{"output-too-small", Limits{MaxOutputBytes: 1}, `return 1`, "invalid JavaScript sandbox budget"},
		{"calls-too-many", Limits{MaxCalls: 100001}, `return 1`, "invalid JavaScript sandbox budget"},
		{"streams-too-many", Limits{MaxStreams: 513}, `return 1`, "invalid JavaScript sandbox budget"},
		{"code-budget", Limits{MaxCodeBytes: 8}, `return 1234567`, "RESOURCE_ERROR"},
		{"call-budget", Limits{MaxCalls: 1}, `await ontology.read({});await object.read({});return null`, "RESOURCE_ERROR"},
		{"output-budget", Limits{MaxOutputBytes: 1024}, `return "x".repeat(4096)`, "RESOURCE_ERROR"},
		{"runtime-exception", Limits{}, `throw new Error("malformed script")`, "SCRIPT_ERROR"},
		{"async-rejected", Limits{}, `await Promise.reject(new Error("rejected"))`, "SCRIPT_ERROR"},
		{"non-error-rejection", Limits{}, `throw "unstructured error"`, "SCRIPT_ERROR"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			// This is a test-harness watchdog, distinct from the enforced
			// Sandbox limit. Under -race, WASM guest initialization may be slow.
			ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
			defer cancel()
			output, err := ExecuteWithLimits(ctx, test.code, true, sandboxMockDispatch, sandboxMockStream, test.limits)
			if test.pattern == "" {
				if err != nil || string(output) != "17" {
					t.Fatalf("valid script: %s %v", output, err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), test.pattern) {
				t.Fatalf("expected %s, got %s %v", test.pattern, output, err)
			}
		})
	}
	for _, tc := range []struct {
		dispatch DispatchFunc
		stream   StreamFunc
	}{
		{nil, sandboxMockStream}, {sandboxMockDispatch, nil},
	} {
		if _, err := ExecuteWithLimits(context.Background(), `return null`, true, tc.dispatch, tc.stream, Limits{}); err == nil {
			t.Error("missing bridge adapter accepted")
		}
	}
}

func TestSandboxDoSTimeoutAndCancellation(t *testing.T) {
	tests := []struct{ name, code string }{
		{"tight-loop", `for(;;){}`},
		{"hanging-promise", `await new Promise(() => {})`},
		{"self-recursive", `function f(){ return f(); } f(); return 1`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			limit := Limits{Timeout: 150 * time.Millisecond}
			start := time.Now()
			_, err := ExecuteWithLimits(context.Background(), tc.code, true, sandboxMockDispatch, sandboxMockStream, limit)
			// The budget remains 150ms; -race and simultaneous native suites
			// may add several seconds of WASM compilation/teardown overhead.
			if time.Since(start) > 15*time.Second {
				t.Fatalf("%s prevented bounded termination: %v", tc.name, err)
			}
			if err == nil {
				t.Fatalf("unbounded guest escaped resource limits: %s", tc.name)
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(75 * time.Millisecond); cancel() }()
	_, err := ExecuteWithLimits(ctx, `while(true){}`, true, sandboxMockDispatch, sandboxMockStream, Limits{Timeout: 2 * time.Second})
	var script *ScriptError
	if !errors.As(err, &script) || script.Code != "CANCELLED" {
		t.Fatalf("cancelled WASM was not terminated: %v", err)
	}
	out, err := Execute(context.Background(), `return 42`, true, sandboxMockDispatch, sandboxMockStream)
	if err != nil || string(out) != "42" {
		t.Fatalf("WASM panic/timeout poisoned a new invocation: %s %v", out, err)
	}
}

func TestSandboxStreamSecurityAndEarlyExit(t *testing.T) {
	exitObserved := make(chan struct{}, 1)
	stream := func(ctx context.Context, method string, request json.RawMessage, emit func(json.RawMessage) error) error {
		defer func() {
			if ctx.Err() != nil {
				select {
				case exitObserved <- struct{}{}:
				default:
				}
			}
		}()
		if err := emit(json.RawMessage(`{"type":"columns","columns":["n"]}`)); err != nil {
			return err
		}
		// A producer must not run past the first event once the guest breaks;
		// it may observe cancellation instead of yielding another event.
		return emit(json.RawMessage(`{"type":"row","row":[2]}`))
	}
	result, err := Execute(context.Background(),
		`const values=[];for await(const item of graph.streamQuery({cypher:"RETURN 1"})){values.push(item.type);break}return values`,
		true, sandboxMockDispatch, stream)
	if err != nil || !strings.Contains(string(result), "columns") {
		t.Fatalf("stream break failed: %s %v", result, err)
	}
	select {
	case <-exitObserved:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("early stream close failed to cancel producer")
	}
	rejectStream := func(ctx context.Context, method string, request json.RawMessage, emit func(json.RawMessage) error) error {
		if err := emit(json.RawMessage(`{"type":"columns","columns":["n"]}`)); err != nil {
			return err
		}
		return &CallError{Code: "STATE_NOT_FOUND", Message: "Stream target is unavailable", Details: json.RawMessage(`{"at":"missing"}`)}
	}
	_, err = Execute(context.Background(),
		`for await(const item of graph.streamQuery({at:"missing",cypher:"RETURN 1"})){}return null`,
		true, sandboxMockDispatch, rejectStream)
	var failure *ScriptError
	if !errors.As(err, &failure) || failure.Code != "STATE_NOT_FOUND" || !json.Valid(failure.Details) {
		t.Fatalf("stream lost public terminal error: %v", err)
	}
	// JS can reflect all it wants; the bridge must reject the attempted write
	// when invoked through graph.streamExecute or via ordinary SDK methods.
	called := false
	forbiddenStream := func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error {
		called = true
		return nil
	}
	result, err = Execute(context.Background(),
		`try{for await(const item of graph.streamExecute({branch:"main",cypher:"CREATE ()"})){} }catch(e){return e.code}return "unexpected"`,
		true, sandboxMockDispatch, forbiddenStream)
	if err != nil || called || !strings.Contains(string(result), "PERMISSION_DENIED") {
		t.Fatalf("stream read-only bypass: %s %v called=%t", result, err, called)
	}
}

func TestSandboxSafeKernelPanicAndMemoryBudget(t *testing.T) {
	failing := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		panic("secret=private-runtime-credential")
	}
	out, err := Execute(context.Background(),
		`try{await ontology.read({})}catch(e){return {code:e.code,message:e.message}}`,
		true, failing, sandboxMockStream)
	if err != nil || !strings.Contains(string(out), `"code":"INTERNAL_ERROR"`) ||
		strings.Contains(string(out), "private-runtime-credential") {
		t.Fatalf("Kernel panic leaked host Secret: %s %v", out, err)
	}
	for _, code := range []string{
		`return Object.create({inherited:1})`,
		`return { get secret(){throw new Error("unexpected side effect")} }`,
		`const a=[];a.push(a);return a`,
		`return { [Symbol.for("secret")]:1 }`,
		`return Array(3)`,
	} {
		_, err = Execute(context.Background(), code, true, sandboxMockDispatch, sandboxMockStream)
		var script *ScriptError
		if !errors.As(err, &script) || script.Code != "SCRIPT_ERROR" {
			t.Fatalf("unsafe value %q accepted: %v", code, err)
		}
	}
}
