package mcpserver

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const maxDocsPaths = 32
const maxDocsResponseBytes = 4 << 20

// The sole documentation source is generated at build time and embedded in
// kgosd. Reading it does not invoke the SDK bridge, WASM or the host filesystem.
//
//go:embed docs
var embeddedDocs embed.FS

type docPage struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func docsPaths(arguments any) ([]string, error) {
	if arguments == nil {
		return nil, nil
	}
	raw, err := json.Marshal(arguments)
	if err != nil {
		return nil, errors.New("INVALID_ARGUMENT: invalid documentation arguments")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return nil, errors.New("INVALID_ARGUMENT: expected documentation object")
	}
	if len(fields) == 0 {
		return nil, nil
	}
	value, ok := fields["paths"]
	if !ok || len(fields) != 1 || len(value) == 0 || value[0] != '[' {
		return nil, errors.New("INVALID_ARGUMENT: expected optional paths array")
	}
	var entries []json.RawMessage
	if err := json.Unmarshal(value, &entries); err != nil || len(entries) > maxDocsPaths {
		return nil, errors.New("INVALID_ARGUMENT: paths must contain at most 32 strings")
	}
	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if len(entry) == 0 || entry[0] != '"' {
			return nil, errors.New("INVALID_ARGUMENT: every path must be a string")
		}
		var path string
		if err := json.Unmarshal(entry, &path); err != nil {
			return nil, errors.New("INVALID_ARGUMENT: invalid documentation path")
		}
		paths = append(paths, path)
	}
	return paths, nil
}

func validDocPath(path string) bool {
	if !fs.ValidPath(path) || path == "." || !strings.HasSuffix(path, ".md") ||
		strings.ContainsAny(path, "\\:?#%") {
		return false
	}
	for _, segment := range strings.Split(path, "/") {
		if strings.HasPrefix(segment, ".") {
			return false
		}
	}
	return true
}

func readDocuments(ctx context.Context, source fs.FS, paths []string) (json.RawMessage, error) {
	if len(paths) == 0 {
		paths = []string{"index.md"}
	}
	if len(paths) > maxDocsPaths {
		return nil, errors.New("INVALID_ARGUMENT: too many documentation paths")
	}
	seen := make(map[string]bool, len(paths))
	for _, path := range paths {
		if !validDocPath(path) || seen[path] {
			return nil, errors.New("INVALID_ARGUMENT: invalid, duplicate or unknown documentation path")
		}
		seen[path] = true
	}
	pages := make([]docPage, 0, len(paths))
	for _, path := range paths {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		content, err := fs.ReadFile(source, "docs/"+path)
		if err != nil {
			return nil, errors.New("INVALID_ARGUMENT: invalid, duplicate or unknown documentation path")
		}
		pages = append(pages, docPage{Path: path, Content: string(content)})
	}
	raw, err := json.Marshal(struct {
		Documents []docPage `json:"documents"`
	}{Documents: pages})
	if err != nil {
		return nil, err
	}
	if len(raw) > maxDocsResponseBytes {
		return nil, errors.New("RESOURCE_ERROR: documentation response exceeds 4 MiB; request fewer paths")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return raw, nil
}

func (s *Server) registerDocs(server *mcp.Server) {
	closed := false
	server.AddTool(&mcp.Tool{
		Name:        "kgos_docs",
		Title:       "Read KG OS documentation",
		Description: "Read built-in KG OS SDK, Cypher 25 and task guides. Omit paths or pass [] for the task-oriented index; pass an array of 1–32 exact Markdown paths to read multiple full documents in order. Separate from JavaScript; call kgos_query or kgos_mutate to act.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{"paths": map[string]any{
				"type": "array", "items": map[string]any{"type": "string"},
				"maxItems":    maxDocsPaths,
				"description": "Exact virtual Markdown paths. Omit or pass [] to read index.md; pass 1–32 distinct paths to read multiple documents.",
			}},
			"additionalProperties": false,
		},
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: &closed, OpenWorldHint: &closed},
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		started := s.beginTool(ctx)
		paths, err := docsPaths(req.Params.Arguments)
		if err != nil {
			return s.finishTool(ctx, "kgos_docs", started, nil, err), nil
		}
		value, err := readDocuments(ctx, embeddedDocs, paths)
		return s.finishTool(ctx, "kgos_docs", started, value, err), nil
	})
}
