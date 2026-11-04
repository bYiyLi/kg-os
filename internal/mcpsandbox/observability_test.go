package mcpsandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestSandboxHostPanicsLogSafeDiagnosticsWhenCaughtByScript(t *testing.T) {
	for _, test := range []struct {
		stage string
		code  string
	}{
		{"sdk_call", `try { await object.read({private:"sensitive-sdk-arguments"}) } catch(e) { return {code:e.code} }`},
		{"stream_producer", `try { for await (const event of graph.streamQuery({private:"sensitive-sdk-arguments"})) {} } catch(e) { return {code:e.code} }`},
	} {
		t.Run(test.stage, func(t *testing.T) {
			var output bytes.Buffer
			observer, err := observability.New(&output, "")
			if err != nil {
				t.Fatal(err)
			}
			ctx, requestID, err := observability.WithRequest(context.Background(), observer)
			if err != nil {
				t.Fatal(err)
			}
			dispatch := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
				panic("private-panic-credential")
			}
			stream := func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error {
				panic("private-panic-credential")
			}
			result, err := Execute(ctx, test.code, true, dispatch, stream)
			if err != nil || string(result) != `{"code":"INTERNAL_ERROR"}` {
				t.Fatalf("caught host panic changed script return: %s %v", result, err)
			}
			var event map[string]any
			if err := json.Unmarshal(output.Bytes(), &event); err != nil {
				t.Fatalf("expected one safe panic diagnostic: %s %v", output.String(), err)
			}
			if event["event"] != "sandbox.host.panic" || event["cause_class"] != "panic" ||
				event["stage"] != test.stage || event["request_id"] != requestID || event["level"] != "ERROR" {
				t.Fatalf("panic diagnostic lost fixed classification or request association: %#v", event)
			}
			if strings.Contains(output.String(), "private-panic-credential") || strings.Contains(output.String(), "sensitive-sdk-arguments") {
				t.Fatalf("host panic exposed sensitive diagnostics: %s", output.String())
			}
		})
	}
}

func TestSandboxMetricsCountActualBudgetLimits(t *testing.T) {
	var output bytes.Buffer
	observer, err := observability.New(&output, "")
	if err != nil {
		t.Fatal(err)
	}
	ctx, _, err := observability.WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	_, err = ExecuteWithLimits(ctx, `return "sensitive script content"`, true, nil, nil, Limits{MaxCodeBytes: 8})
	if err == nil || !strings.HasPrefix(err.Error(), "RESOURCE_ERROR:") {
		t.Fatalf("expected real sandbox code limit failure: %v", err)
	}
	if got := observer.Snapshot().Sandbox.ResourceLimitsTotal; got != 1 {
		t.Fatalf("real sandbox budget limit count=%d want=1", got)
	}
	if strings.Contains(output.String(), "sensitive script content") ||
		!strings.Contains(output.String(), "\"event\":\"sandbox.resource.limit\"") {
		t.Fatal("missing safe sandbox budget event or script text leaked")
	}
}
