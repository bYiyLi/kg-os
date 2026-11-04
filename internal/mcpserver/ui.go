package mcpserver

import (
	"context"
	"encoding/base64"

	"github.com/bYiyLi/kg-os/internal/webui"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const workspaceResourceURI = "ui://kgos/workspace/v1"
const workspaceMIMEType = "text/html;profile=mcp-app"

type workspaceOutput struct {
	View string `json:"view"`
}

const workspaceIconSVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><g fill=\"none\" stroke=\"#000\" stroke-width=\"5\" stroke-linecap=\"round\"><path d=\"M16 17L48 32 16 47M16 17v30\"/><circle cx=\"16\" cy=\"17\" r=\"5\" fill=\"#000\"/><circle cx=\"48\" cy=\"32\" r=\"5\" fill=\"#000\"/><circle cx=\"16\" cy=\"47\" r=\"5\" fill=\"#000\"/></g></svg>"

func (s *Server) registerWorkspace(server *mcp.Server) {
	server.AddResource(&mcp.Resource{
		Name:        "KG OS Workspace",
		URI:         workspaceResourceURI,
		MIMEType:    workspaceMIMEType,
		Description: "KG OS knowledge graph workspace (interactive UI)",
	}, func(_ context.Context, _ *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		html, err := webui.EmbeddedMCPApp()
		if err != nil {
			return nil, err
		}
		return &mcp.ReadResourceResult{
			Contents: []*mcp.ResourceContents{{
				URI:      workspaceResourceURI,
				MIMEType: workspaceMIMEType,
				Text:     string(html),
				Meta: mcp.Meta{"ui": map[string]any{
					"csp": map[string]any{
						"connectDomains":  []string{},
						"resourceDomains": []string{},
					},
				}},
			}},
		}, nil
	})

	closed := false
	registerTypedTool(s, server, &mcp.Tool{
		Name:        "kgos_workspace",
		Title:       "KG OS Workspace",
		Description: "Open the interactive KG OS workspace in a supported MCP Apps host. This app-only entrypoint accepts no arguments; opening the interface does not directly read or modify KG OS data.",
		Annotations: &mcp.ToolAnnotations{
			ReadOnlyHint:    true,
			DestructiveHint: &closed,
			OpenWorldHint:   &closed,
		},
		Meta: mcp.Meta{
			"ui": map[string]any{
				"resourceUri": workspaceResourceURI,
				"visibility":  []string{"app"},
			},
			"openai/ui": map[string]any{
				"entrypoints": []map[string]string{{"type": "global"}, {"type": "thread"}},
			},
		},
		Icons: []mcp.Icon{{
			Source:   "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(workspaceIconSVG)),
			MIMEType: "image/svg+xml",
			Sizes:    []string{"any"},
		}},
	}, schemaFor[workspaceOutput](), func(_ context.Context, _ struct{}) (any, error) {
		return workspaceOutput{View: "workspace"}, nil
	})
}
