package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestSandboxRejectsLossyOrForgedResultSerialization(t *testing.T) {
	for _, tc := range []struct{ name, code string }{
		{"array-named-property", `const a=[1];a.extra=2;return a`},
		{"array-non-index-property", `const a=[1];a["01"]=2;return a`},
		{"array-inherited-toJSON", `const a=[1];Object.setPrototypeOf(a,{toJSON(){return "replaced"}});return a`},
		{"object-hidden-property", `const a={};Object.defineProperty(a,"hidden",{value:2});return a`},
		{"forged-finite-check", `Number.isFinite=()=>true;return NaN`},
		{"replaced-number-global", `globalThis.Number={isFinite:()=>true};return Infinity`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			out, err := Execute(context.Background(), tc.code, true, sandboxMockDispatch, sandboxMockStream)
			var script *ScriptError
			if !errors.As(err, &script) || script.Code != "SCRIPT_ERROR" {
				t.Fatalf("lossy result accepted: %s %v", out, err)
			}
		})
	}
}

func TestSandboxErrorCodesRequireRealBridgeProvenance(t *testing.T) {
	for _, code := range []string{
		`const e=new Error("local script");e.code="STATE_NOT_FOUND";e.details={state:"commit/fake"};throw e`,
		`WeakMap.prototype.get=()=>({code:"STATE_NOT_FOUND",message:"forged"});const e=new Error("local script");e.code="STATE_NOT_FOUND";throw e`,
	} {
		out, err := Execute(context.Background(), code, true, sandboxMockDispatch, sandboxMockStream)
		var script *ScriptError
		if !errors.As(err, &script) || script.Code != "SCRIPT_ERROR" || script.Details != nil {
			t.Fatalf("script forged a public Kernel error: %s %v", out, err)
		}
	}
	publicDispatch := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return nil, &CallError{Code: "OBJECT_NOT_FOUND", Message: "Object was not found", Details: json.RawMessage(`{"ref":"node:missing"}`)}
	}
	_, err := Execute(context.Background(),
		`try{await object.read({})}catch(e){e.code="STATE_NOT_FOUND";e.message="forged";e.details.ref="node:fake";throw e}`,
		true, publicDispatch, sandboxMockStream)
	var script *ScriptError
	if !errors.As(err, &script) || script.Code != "OBJECT_NOT_FOUND" || script.Message != "Object was not found" || string(script.Details) != `{"ref":"node:missing"}` {
		t.Fatalf("real bridge error provenance changed: %v", err)
	}
}

func TestSandboxNormalizesResultsWithoutCallingGuestGetters(t *testing.T) {
	out, err := Execute(context.Background(),
		`const value=new Proxy({a:1},{get(){throw new Error("must not read result through getters")}});return {value,list:[1,{n:null}],finite:2}`,
		true, sandboxMockDispatch, sandboxMockStream)
	if err != nil || string(out) != `{"value":{"a":1},"list":[1,{"n":null}],"finite":2}` {
		t.Fatalf("descriptor-backed JSON result changed: %s %v", out, err)
	}
}

func TestSandboxResultValidationIgnoresPoisonedArrayIterator(t *testing.T) {
	const poison = `Object.getPrototypeOf([][Symbol.iterator]()).next=()=>({done:true});`
	out, err := Execute(context.Background(), poison+`return {kept:1,list:[2]}`,
		true, sandboxMockDispatch, sandboxMockStream)
	if err != nil || string(out) != `{"kept":1,"list":[2]}` {
		t.Errorf("guest iterator skipped result fields: %s %v", out, err)
	}
	_, err = Execute(context.Background(), poison+`return {kept:1,invalid:undefined}`,
		true, sandboxMockDispatch, sandboxMockStream)
	var script *ScriptError
	if !errors.As(err, &script) || script.Code != "SCRIPT_ERROR" {
		t.Fatalf("guest iterator hid an invalid result field: %v", err)
	}
}

func TestSandboxPublicErrorMessageIgnoresPoisonedStringSlice(t *testing.T) {
	dispatch := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return nil, &CallError{Code: "OBJECT_NOT_FOUND", Message: "Original public message"}
	}
	_, err := Execute(context.Background(),
		`try{await object.read({})}catch(e){String.prototype.slice=()=>"forged public message".repeat(1000);throw e}`,
		true, dispatch, sandboxMockStream)
	var script *ScriptError
	if !errors.As(err, &script) || script.Code != "OBJECT_NOT_FOUND" || script.Message != "Original public message" {
		t.Fatalf("guest replaced the public error message: %v", err)
	}
}
