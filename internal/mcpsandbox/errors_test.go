package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestPublicSDKErrorPreservesCodeAndDetails(t *testing.T) {
	dispatch := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return nil, &CallError{Code: "OBJECT_NOT_FOUND", Message: "Object was not found",
			Details: json.RawMessage(`{"ref":"node:missing"}`)}
	}
	noStream := func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error { return nil }
	out, err := Execute(context.Background(), `try{await object.read({at:"branch/main",refs:["node:missing"]})}catch(e){return {code:e.code,message:e.message,details:e.details}}`, true, dispatch, noStream)
	if err != nil || !strings.Contains(string(out), `"code":"OBJECT_NOT_FOUND"`) ||
		!strings.Contains(string(out), `"ref":"node:missing"`) {
		t.Fatalf("Public SDK error changed: %s, %v", out, err)
	}
	_, err = Execute(context.Background(), `await object.read({at:"branch/main",refs:["node:missing"]})`, true, dispatch, noStream)
	var script *ScriptError
	if !errors.As(err, &script) || script.Code != "OBJECT_NOT_FOUND" || !json.Valid(script.Details) {
		t.Fatalf("Uncaught SDK error lost: %v", err)
	}
}

func TestScriptReturnAndSandboxIsolation(t *testing.T) {
	dispatch := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return json.RawMessage(`null`), nil
	}
	noStream := func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error { return nil }
	for _, code := range []string{`return undefined`, `return NaN`, `return BigInt(1)`, `return {a:()=>1}`, `return Object.assign({}, {a:undefined})`} {
		_, err := Execute(context.Background(), code, true, dispatch, noStream)
		var script *ScriptError
		if !errors.As(err, &script) || script.Code != "SCRIPT_ERROR" {
			t.Fatalf("script invalid result %q accepted: %v", code, err)
		}
	}
	out, err := Execute(context.Background(), `return {process:typeof process,require:typeof require,fetch:typeof fetch,WebSocket:typeof WebSocket}`, true, dispatch, noStream)
	if err != nil || !strings.Contains(string(out), `"process":"undefined"`) || !strings.Contains(string(out), `"fetch":"undefined"`) {
		t.Fatalf("Guest host API exposed: %s %v", out, err)
	}
}
