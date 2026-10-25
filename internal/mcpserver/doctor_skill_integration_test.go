//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/lithograph"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Fixture preparation is outside Doctor execution and only writes t.TempDir().
// Each diagnostic executes the literal shipped probe through real MCP/QuickJS.
func TestDoctorSkillReadProbe(t *testing.T) {
	for _, scenario := range []string{"empty", "models", "invalid"} {
		t.Run(scenario, func(t *testing.T) {
			runtime := phase16Runtime(t)
			ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
			defer cancel()
			initial, err := runtime.Kernel.EvolutionOverview(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "untouched", From: initial.State}); err != nil {
				t.Fatal(err)
			}
			if scenario != "empty" {
				patch := ""
				for _, name := range []string{"AuditRecord", "AuditTask"} {
					patch += addMatrixPatch("new:node-definition:"+name,
						fmt.Sprintf("name: %s\nproperties:\n  - name: key\n    type: STRING\nconstraints: []\n", name))
				}
				if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: initial.State, Patch: patch}); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "invalid" {
				_, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
					Branch: "main", Cypher: "MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='AuditRecord' DETACH DELETE d FINISH",
				})
				if err != nil {
					t.Fatal(err)
				}
			}
			before, err := runtime.Kernel.EvolutionBranchList(ctx)
			if err != nil {
				t.Fatal(err)
			}
			head, err := runtime.Kernel.EvolutionOverview(ctx)
			if err != nil {
				t.Fatal(err)
			}
			server, err := New(runtime.Kernel, Options{Token: "doctor-isolated-test"})
			if err != nil {
				t.Fatal(err)
			}
			httpServer := httptest.NewServer(server.Handler())
			defer httpServer.Close()
			client := mcp.NewClient(&mcp.Implementation{Name: "doctor-test", Version: "1"}, nil)
			session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
				Endpoint: httpServer.URL + "/mcp", DisableStandaloneSSE: true,
				HTTPClient: &http.Client{Transport: bearerRoundTripper{token: "doctor-isolated-test", transport: http.DefaultTransport}},
			}, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer session.Close()
			docs, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "kgos_docs", Arguments: map[string]any{
				"paths": []string{"guides/reading.md", "guides/evolution.md", "sdk/evolution/get.md", "sdk/ontology/read.md"},
			}})
			if err != nil {
				t.Fatalf("read documentation transport: %v", err)
			}
			if docs == nil {
				t.Fatal("read documentation returned no MCP result")
			}
			if docs.IsError {
				t.Fatalf("read documentation MCP error: %#v", mcpText(t, docs))
			}
			reply, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "kgos_query", Arguments: map[string]any{"code": doctorSkillProbe(t)}})
			if err != nil {
				t.Fatalf("literal Doctor probe transport: %v", err)
			}
			if reply == nil {
				t.Fatal("literal Doctor probe returned no MCP result")
			}
			if reply.IsError {
				t.Fatalf("literal Doctor probe MCP error: %#v", mcpText(t, reply))
			}
			got := object(t, mcpText(t, reply)["result"])
			if got["state"] != head.State || got["inspectedState"] != head.State || got["defaultBranch"] != head.DefaultBranch {
				t.Fatalf("probe mixed states: %#v", got)
			}
			consistency := object(t, got["consistency"])
			issues := array(t, consistency, "issues")
			if scenario == "invalid" {
				if consistency["status"] != "invalid" || len(issues) == 0 || got["ontologyReadable"] != nil || got["overview"] != nil {
					t.Fatalf("invalid State was represented as readable: %#v", got)
				}
			} else {
				if consistency["status"] != "valid" || len(issues) != 0 || got["ontologyReadable"] != true || got["ontologyState"] != head.State {
					t.Fatalf("valid State probe: %#v", got)
				}
				overview := array(t, got, "overview")
				if len(overview) != 1 {
					t.Fatalf("overview shape: %#v", overview)
				}
				item := object(t, overview[0])
				wantCount, wantMore := float64(0), false
				if scenario == "models" {
					wantCount, wantMore = 2, true
				}
				if item["total"] != wantCount || item["hasMore"] != wantMore {
					t.Fatalf("one-item overview must preserve scope/continuation: %#v", item)
				}
			}
			if _, ok := got["data"]; ok {
				t.Fatal("unneeded mutable State Data exposed")
			}
			after, err := runtime.Kernel.EvolutionBranchList(ctx)
			if err != nil || !reflect.DeepEqual(before, after) {
				t.Fatalf("Doctor read changed Branch heads: %v before=%#v after=%#v", err, before, after)
			}
			if !strings.HasPrefix(head.State, "commit/") {
				t.Fatal("test did not resolve a real immutable State")
			}
		})
	}
}
