package mcpserver

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
)

// Faults are injected at the SDK bridge, not into a live knowledge base.
// The actual QuickJS runtime executes the verbatim published diagnostic probe.
func TestDoctorSkillProbeKeepsReadFailureEvidence(t *testing.T) {
	methods := []string{"evolution.overview", "evolution.get", "ontology.read"}
	for index, failedMethod := range methods {
		t.Run(failedMethod, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			state := "commit/" + strings.Repeat("a", 64)
			calls := []string{}
			dispatch := func(_ context.Context, method string, args []json.RawMessage) (json.RawMessage, error) {
				calls = append(calls, method)
				if method == failedMethod {
					return nil, &mcpsandbox.CallError{Code: "RESOURCE_ERROR", Message: "synthetic-sensitive-detail"}
				}
				switch method {
				case "evolution.overview":
					return json.Marshal(map[string]any{"defaultBranch": "main", "state": state})
				case "evolution.get":
					if len(args) != 1 || !strings.Contains(string(args[0]), state) {
						t.Error("inspection did not use the resolved immutable State")
					}
					return json.Marshal(map[string]any{"state": state, "consistency": map[string]any{"status": "valid", "issues": []any{}}, "data": "unneeded-sidecar"})
				default:
					t.Errorf("unexpected SDK call: %s", method)
					return json.RawMessage(`null`), nil
				}
			}
			stream := func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error {
				t.Error("unexpected streaming call")
				return nil
			}
			raw, err := mcpsandbox.Execute(ctx, doctorSkillProbe(t), true, dispatch, stream)
			if err != nil {
				t.Fatalf("read failure discarded prior evidence instead of returning a diagnostic: %v", err)
			}
			var got struct {
				State          string          `json:"state"`
				InspectedState string          `json:"inspectedState"`
				Consistency    json.RawMessage `json:"consistency"`
				ReadError      struct {
					Method string `json:"method"`
					Code   string `json:"code"`
				} `json:"readError"`
			}
			if err := json.Unmarshal(raw, &got); err != nil {
				t.Fatal(err)
			}
			if got.ReadError.Method != failedMethod || got.ReadError.Code != "RESOURCE_ERROR" {
				t.Fatalf("failed read was not represented accurately: %s", raw)
			}
			if index > 0 && got.State != state {
				t.Fatalf("resolved State was lost: %s", raw)
			}
			if index > 1 && (got.InspectedState != state || !strings.Contains(string(got.Consistency), `"valid"`)) {
				t.Fatalf("successful consistency evidence was lost: %s", raw)
			}
			if !reflect.DeepEqual(calls, methods[:index+1]) {
				t.Fatalf("probe continued past failure or retried: %v", calls)
			}
			for _, forbidden := range []string{"synthetic-sensitive-detail", "unneeded-sidecar", `"ontologyReadable":true`} {
				if strings.Contains(string(raw), forbidden) {
					t.Fatalf("failure response leaks data or claims an unperformed success: %s", raw)
				}
			}
		})
	}
}
