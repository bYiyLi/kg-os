package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type requestDeadlineKey struct{}
type requestPeerKey struct{}

func schemaFor[T any]() *jsonschema.Schema {
	schema, err := jsonschema.For[T](nil)
	if err != nil {
		panic(fmt.Sprintf("build MCP schema: %v", err))
	}
	return schema
}

func resultSchema(data any) any {
	return map[string]any{
		"type": "object", "additionalProperties": false, "required": []string{"code"},
		"properties": map[string]any{
			"code": map[string]any{"type": "string"}, "data": data,
			"message": map[string]any{"type": "string"}, "retryable": map[string]any{"type": "boolean"}, "details": map[string]any{},
		},
		"oneOf": []any{
			map[string]any{"properties": map[string]any{"code": map[string]any{"const": "ok"}}, "required": []string{"data"}},
			map[string]any{"properties": map[string]any{"code": map[string]any{"not": map[string]any{"const": "ok"}}}, "required": []string{"message", "retryable"}, "not": map[string]any{"required": []string{"data"}}},
		},
	}
}

func registerTypedTool[In any](s *Server, server *mcp.Server, tool *mcp.Tool, dataSchema any, handler func(context.Context, In) (any, error)) {
	input := schemaFor[In]()
	input.AdditionalProperties = &jsonschema.Schema{Not: &jsonschema.Schema{}}
	tool.InputSchema = input
	s.registerTool(server, tool, dataSchema, func(ctx context.Context, req *mcp.CallToolRequest) (any, error) {
		var value In
		if err := json.Unmarshal(normalizedArguments(req.Params.Arguments), &value); err != nil {
			return nil, errors.New("INVALID_ARGUMENT: invalid tool arguments")
		}
		return handler(ctx, value)
	})
}

func normalizedArguments(raw json.RawMessage) json.RawMessage {
	if len(bytes.TrimSpace(raw)) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return json.RawMessage(`{}`)
	}
	return raw
}

func (s *Server) registerTool(server *mcp.Server, tool *mcp.Tool, dataSchema any, handler func(context.Context, *mcp.CallToolRequest) (any, error)) {
	encoded, err := json.Marshal(tool.InputSchema)
	if err != nil {
		panic("invalid MCP input schema")
	}
	var input jsonschema.Schema
	if err := json.Unmarshal(encoded, &input); err != nil {
		panic("invalid MCP input schema")
	}
	resolved, err := input.Resolve(nil)
	if err != nil {
		panic("invalid MCP input schema")
	}
	tool.OutputSchema = resultSchema(dataSchema)
	server.AddTool(tool, func(ctx context.Context, req *mcp.CallToolRequest) (result *mcp.CallToolResult, callErr error) {
		// Older protocol revisions detach cancellation in the SDK. Retain our
		// server-owned request deadline even when that transport context detaches.
		if deadline, ok := ctx.Value(requestDeadlineKey{}).(time.Time); ok {
			var cancel context.CancelFunc
			ctx, cancel = context.WithDeadline(ctx, deadline)
			defer cancel()
			// Older protocol revisions detach HTTP cancellation in the SDK.
			// Reattach the trusted peer signal without attaching our execution
			// deadline to the SDK's separate response-delivery lifecycle.
			if peer, ok := ctx.Value(requestPeerKey{}).(context.Context); ok {
				stop := context.AfterFunc(peer, cancel)
				defer stop()
				if peer.Err() != nil {
					cancel()
				}
			}
		}
		ctx, toolSpan := observability.StartSpan(ctx, "mcp.tool")
		defer toolSpan.End()
		started := s.beginTool(ctx)
		var value any
		var runErr error
		dispatched := false
		defer func() {
			if recover() != nil {
				runErr = errors.New("MCP tool handler panic")
				observability.Log(ctx, slog.LevelError, "mcp", "mcp.tool.panic", slog.String("tool", tool.Name), slog.String("cause_class", "panic"))
			}
			// Kernel public errors can wrap cancellation as INTERNAL_ERROR.
			// The MCP request's actual cancellation remains authoritative here.
			if err := ctx.Err(); err != nil {
				runErr = err
			}
			result = s.finishTool(ctx, tool.Name, started, value, runErr, dispatched)
			callErr = nil
		}()
		var arguments any
		if err := json.Unmarshal(normalizedArguments(req.Params.Arguments), &arguments); err != nil || resolved.Validate(arguments) != nil {
			runErr = errors.New("INVALID_ARGUMENT: invalid tool arguments")
			return nil, nil
		}
		if err := ctx.Err(); err != nil {
			runErr = err
			return nil, nil
		}
		dispatched = true
		value, runErr = handler(ctx, req)
		return nil, nil
	})
}
