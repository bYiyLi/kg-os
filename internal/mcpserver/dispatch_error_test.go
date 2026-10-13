package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
)

type stubRequest struct {
	Ref string `json:"ref"`
}
type stubResponse struct {
	Success bool `json:"success"`
}

func TestGoSDKDispatchBoundaryErrorAndArgumentValidation(t *testing.T) {
	ctx := context.Background()
	invoke := func(context.Context, stubRequest) (stubResponse, error) {
		return stubResponse{Success: true}, nil
	}
	if value, err := call(ctx, []json.RawMessage{json.RawMessage(`{"ref":"node:Person"}`)}, invoke); err != nil ||
		!strings.Contains(string(value), "true") {
		t.Fatalf("valid SDK call did not return public JSON: %s %v", value, err)
	}
	for _, args := range [][]json.RawMessage{
		nil, {}, {json.RawMessage(`{}`), json.RawMessage(`{}`)},
		{json.RawMessage("not-json")}, {json.RawMessage(`"wrong-type"`)},
	} {
		if _, err := call(ctx, args, invoke); err == nil {
			t.Errorf("malformed SDK args accepted: %#v", args)
		}
	}
	noInput := func(context.Context) (stubResponse, error) { return stubResponse{Success: true}, nil }
	if value, err := noArgs(ctx, nil, noInput); err != nil || !json.Valid(value) {
		t.Fatalf("valid no-args method: %s %v", value, err)
	}
	if _, err := noArgs(ctx, []json.RawMessage{json.RawMessage(`{}`)}, noInput); err == nil {
		t.Fatal("evolution.overview with extra parameters accepted")
	}
	expected := &kernel.PublicError{Code: "STATE_NOT_FOUND", Message: "No such Commit", Details: map[string]any{"state": "commit/missing"}}
	fail := func(context.Context, stubRequest) (stubResponse, error) { return stubResponse{}, expected }
	_, err := call(ctx, []json.RawMessage{json.RawMessage(`{"ref":"commit/missing"}`)}, fail)
	var public *mcpsandbox.CallError
	if !errors.As(err, &public) || public.Code != "STATE_NOT_FOUND" || !strings.Contains(string(public.Details), "commit/missing") {
		t.Fatalf("public SDK error lost in Go Bridge: %v", err)
	}
	noInputFail := func(context.Context) (stubResponse, error) { return stubResponse{}, expected }
	_, err = noArgs(ctx, nil, noInputFail)
	if !errors.As(err, &public) || public.Code != "STATE_NOT_FOUND" {
		t.Fatalf("public no-args SDK error lost: %v", err)
	}
	detailsLarge := strings.Repeat("x", 1<<20+4)
	excessive := &kernel.PublicError{Code: "INVALID_ARGUMENT", Message: "Cannot return oversized metadata", Details: map[string]any{"raw": detailsLarge}}
	converted := publicCallError(excessive)
	if !errors.As(converted, &public) || len(public.Details) != 0 {
		t.Fatalf("oversized Kernel error metadata not bounded: %v", converted)
	}
}

func TestSDKStreamGoAdapterDisallowsMalformedTargets(t *testing.T) {
	adapter := Adapter{Kernel: &kernel.Service{}}
	ctx := context.Background()
	callback := func(json.RawMessage) error { return nil }
	for _, entry := range []struct {
		method string
		raw    string
		want   string
	}{
		{"future.graph.stream", "{}", "PERMISSION_DENIED"},
		{"graph.streamQuery", "not-json", "INVALID_ARGUMENT"},
		{"graph.streamExecute", "not-json", "INVALID_ARGUMENT"},
	} {
		err := adapter.Stream(ctx, entry.method, json.RawMessage(entry.raw), callback)
		var callErr *mcpsandbox.CallError
		if !errors.As(err, &callErr) || callErr.Code != entry.want {
			t.Errorf("method=%s untrusted Stream args mapped as %v", entry.method, err)
		}
	}
	if _, err := adapter.Invoke(ctx, "future.sdk.method", nil); err == nil {
		t.Fatal("unregistered SDK method unexpectedly available through Go Bridge")
	}
}
