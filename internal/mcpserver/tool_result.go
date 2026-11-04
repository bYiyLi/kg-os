package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
	"github.com/bYiyLi/kg-os/internal/observability"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const maxToolResponseBytes = 4 << 20

type toolFailure struct {
	Code      string          `json:"code"`
	Message   string          `json:"message"`
	Retryable bool            `json:"retryable"`
	Details   json.RawMessage `json:"details,omitempty"`
}

func classifyToolFailure(err error, mutable, started bool) toolFailure {
	failure := toolFailure{Code: "INTERNAL_ERROR", Message: "KG OS MCP operation failed"}
	var public *kernel.PublicError
	var script *mcpsandbox.ScriptError
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		failure.Code, failure.Message = "TIMEOUT", "Call timed out"
	case errors.Is(err, context.Canceled):
		failure.Code, failure.Message = "CANCELLED", "Call cancelled"
	case errors.As(err, &public):
		failure.Code, failure.Message = string(public.Code), public.Message
		if public.Details != nil {
			failure.Details, _ = json.Marshal(public.Details)
		}
	case errors.As(err, &script):
		failure.Code, failure.Message, failure.Details = script.Code, script.Message, script.Details
	default:
		for _, item := range []struct{ code, message string }{
			{"RESOURCE_ERROR", "MCP resource limit exceeded; request fewer documents or reduce script output"},
			{"INVALID_ARGUMENT", "Invalid MCP tool arguments"},
			{"VIEW_EXPIRED", "Preview revision is expired or unavailable"},
			{"SCRIPT_RESULT_ERROR", "Script must return a JSON-compatible value"},
			{"SCRIPT_ERROR", "JavaScript execution failed"},
		} {
			if strings.HasPrefix(err.Error(), item.code+":") {
				failure.Code, failure.Message = item.code, item.message
				break
			}
		}
	}
	if failure.Code == "" || failure.Code == "ok" {
		failure.Code, failure.Message = "INTERNAL_ERROR", "KG OS MCP operation failed"
	}
	if failure.Message == "" {
		failure.Message = "KG OS MCP operation failed"
	}
	if len(failure.Details) > 1<<20 || !json.Valid(failure.Details) || string(failure.Details) == "null" {
		failure.Details = nil
	}
	failure.Retryable = !mutable && (failure.Code == "TIMEOUT" || failure.Code == "IO_ERROR")
	if mutable && started && !strings.Contains(failure.Message, "writes may have completed") {
		failure.Message += "; writes may have completed. Read the actual State or History before retrying"
	}
	return failure
}

func encodedToolResult(raw json.RawMessage) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: string(raw)}}, StructuredContent: raw,
	}
}

// The budget covers both serialized representations, rather than only the
// business value. JSON-RPC framing is added by the official MCP SDK.
func buildToolResult(value any, err error, mutable, started bool) (result *mcp.CallToolResult, code string) {
	defer func() {
		if recover() != nil {
			message := "KG OS MCP operation failed"
			if mutable && started {
				message += "; writes may have completed. Read the actual State or History before retrying"
			}
			raw, _ := json.Marshal(toolFailure{Code: "INTERNAL_ERROR", Message: message})
			result, code = encodedToolResult(raw), "INTERNAL_ERROR"
		}
	}()
	var body any
	if err != nil {
		failure := classifyToolFailure(err, mutable, started)
		body, code = failure, failure.Code
	} else {
		body = struct {
			Code string `json:"code"`
			Data any    `json:"data"`
		}{Code: "ok", Data: value}
	}
	raw, marshalErr := json.Marshal(body)
	if marshalErr != nil {
		failure := classifyToolFailure(marshalErr, mutable, started)
		raw, _ = json.Marshal(failure)
		code = failure.Code
	}
	result = encodedToolResult(raw)
	wire, marshalErr := json.Marshal(result)
	if marshalErr != nil || len(wire) > maxToolResponseBytes {
		failure := classifyToolFailure(errors.New("RESOURCE_ERROR: response budget exceeded"), mutable, started)
		raw, _ = json.Marshal(failure)
		return encodedToolResult(raw), failure.Code
	}
	return result, code
}

func toolResult(value any, err error) (*mcp.CallToolResult, error) {
	result, _ := buildToolResult(value, err, false, false)
	return result, nil
}

func (s *Server) beginTool(ctx context.Context) time.Time {
	if observer := observability.FromContext(ctx); observer != nil {
		observer.ToolStart()
	}
	return time.Now()
}

func (s *Server) finishTool(ctx context.Context, name string, started time.Time, value any, err error, dispatched bool) *mcp.CallToolResult {
	mutable := name == "kgos_mutate"
	result, code := buildToolResult(value, err, mutable, dispatched)
	if observer := observability.FromContext(ctx); observer != nil {
		observer.Tool(ctx, name, code, time.Since(started))
	}
	return result
}
