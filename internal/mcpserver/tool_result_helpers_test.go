package mcpserver

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func toolEnvelope(t *testing.T, result *mcp.CallToolResult) map[string]any {
	t.Helper()
	if result == nil || result.IsError || len(result.Content) != 1 || result.StructuredContent == nil {
		t.Fatalf("expected a normal MCP business result: %#v", result)
	}
	text, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("expected JSON text content, got %T", result.Content[0])
	}
	var envelope map[string]any
	if err := json.Unmarshal([]byte(text.Text), &envelope); err != nil {
		t.Fatalf("invalid business result JSON: %v", err)
	}
	encoded, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	var structured map[string]any
	if err := json.Unmarshal(encoded, &structured); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(envelope, structured) {
		t.Fatalf("text and structured business results differ: text=%s structured=%s", text.Text, encoded)
	}
	code, ok := envelope["code"].(string)
	if !ok || code == "" {
		t.Fatalf("business result lacks a code: %#v", envelope)
	}
	if code == "ok" {
		if _, exists := envelope["data"]; !exists {
			t.Fatalf("successful business result lacks data: %#v", envelope)
		}
		if _, exists := envelope["retryable"]; exists {
			t.Fatalf("successful business result contains retryable: %#v", envelope)
		}
	} else {
		if message, ok := envelope["message"].(string); !ok || message == "" {
			t.Fatalf("failed business result lacks a message: %#v", envelope)
		}
		if _, ok := envelope["retryable"].(bool); !ok {
			t.Fatalf("failed business result lacks retryable: %#v", envelope)
		}
		if _, exists := envelope["data"]; exists {
			t.Fatalf("failed business result contains success data: %#v", envelope)
		}
	}
	return envelope
}

func toolData(t *testing.T, result *mcp.CallToolResult) any {
	t.Helper()
	envelope := toolEnvelope(t, result)
	if envelope["code"] != "ok" {
		t.Fatalf("expected successful business result: %#v", envelope)
	}
	return envelope["data"]
}

func toolDataObject(t *testing.T, result *mcp.CallToolResult) map[string]any {
	t.Helper()
	value := toolData(t, result)
	data, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("expected object data, got %T: %#v", value, value)
	}
	return data
}

func toolErrorCode(t *testing.T, result *mcp.CallToolResult) string {
	t.Helper()
	envelope := toolEnvelope(t, result)
	code := envelope["code"].(string)
	if code == "ok" {
		t.Fatalf("expected a failed business result: %#v", envelope)
	}
	return code
}
