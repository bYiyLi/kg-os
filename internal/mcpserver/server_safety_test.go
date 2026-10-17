package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestGoMCPServerFailsClosedOnInvalidOptions(t *testing.T) {
	if _, err := New(nil, Options{Token: "valid"}); err == nil {
		t.Fatal("nil Kernel accepted")
	}
	cases := []struct {
		name   string
		mutate func(*Options)
	}{
		{"missing-token", func(p *Options) { p.Token = "" }},
		{"oversized-token", func(p *Options) { p.Token = strings.Repeat("x", 4097) }},
		{"root-route", func(p *Options) { p.Path = "/" }},
		{"http-api-route", func(p *Options) { p.Path = "/api/private" }},
		{"api-root-route", func(p *Options) { p.Path = "/api" }},
		{"oauth-route", func(p *Options) { p.Path = "/oauth/token" }},
		{"oauth-root-route", func(p *Options) { p.Path = "/oauth" }},
		{"metadata-root-route", func(p *Options) { p.Path = "/.well-known" }},
		{"malformed-http-pattern", func(p *Options) { p.Path = "/mcp/{unclosed" }},
		{"metadata-route", func(p *Options) { p.Path = "/.well-known/example" }},
		{"invalid-route", func(p *Options) { p.Path = "/mcp?token=secret" }},
		{"max-concurrency-negative", func(p *Options) { p.MaxConcurrency = -1 }},
		{"max-concurrency-too-large", func(p *Options) { p.MaxConcurrency = 1025 }},
		{"request-timeout-short", func(p *Options) { p.RequestTimeout = time.Microsecond }},
		{"request-timeout-long", func(p *Options) { p.RequestTimeout = 11 * time.Minute }},
		{"request-budget-tiny", func(p *Options) { p.MaxRequestBytes = 4 }},
		{"request-budget-excess", func(p *Options) { p.MaxRequestBytes = 17 << 20 }},
		{"preview-items-negative", func(p *Options) { p.PreviewMaxItems = -1 }},
		{"preview-items-excess", func(p *Options) { p.PreviewMaxItems = 1_000_001 }},
		{"cache-count-negative", func(p *Options) { p.PreviewCacheEntries = -1 }},
		{"cache-count-excess", func(p *Options) { p.PreviewCacheEntries = 65 }},
		{"cache-ttl-short", func(p *Options) { p.PreviewCacheTTL = time.Nanosecond }},
		{"cache-ttl-long", func(p *Options) { p.PreviewCacheTTL = 25 * time.Hour }},
		{"oauth-http-untrusted", func(p *Options) { p.OAuthIssuer = "http://untrusted.example" }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			options := Options{Token: "isolated-administrator", Path: "/mcp"}
			test.mutate(&options)
			if _, err := New(&kernel.Service{}, options); err == nil {
				t.Fatalf("invalid MCP server configuration accepted: %#v", options)
			}
		})
	}
	enabled, err := New(&kernel.Service{}, Options{Token: "isolated-administrator"})
	if err != nil || enabled.Handler() == nil || len(enabled.OAuthRoutes()) != 0 {
		t.Fatalf("basic static bearer MCP service failed: %v", err)
	}
	if enabled.authorized("Bearer incorrect") || enabled.authorized("") || enabled.authorized("Basic isolated-administrator") ||
		enabled.authorized("Bearer "+strings.Repeat("x", 4100)) {
		t.Fatal("invalid external MCP credentials authorized")
	}
	if !enabled.authorized("Bearer isolated-administrator") {
		t.Fatal("static administrator credential denied")
	}
}

func TestMCPToolErrorMappingKeepsPublicContract(t *testing.T) {
	details := map[string]any{"state": "commit/abc", "action": "retry"}
	tests := []struct {
		err    error
		code   string
		public bool
	}{
		{errors.New("infrastructure secret=do-not-leak"), "INTERNAL_ERROR", false},
		{fmt.Errorf("RESOURCE_ERROR: out of memory"), "RESOURCE_ERROR", false},
		{fmt.Errorf("INVALID_ARGUMENT: malformed"), "INVALID_ARGUMENT", false},
		{fmt.Errorf("VIEW_EXPIRED: stale"), "VIEW_EXPIRED", false},
		{fmt.Errorf("SCRIPT_RESULT_ERROR: invalid value"), "SCRIPT_RESULT_ERROR", false},
		{fmt.Errorf("SCRIPT_ERROR: runtime exception"), "SCRIPT_ERROR", false},
		{context.Canceled, "CANCELLED", false},
		{context.DeadlineExceeded, "TIMEOUT", false},
		{&kernel.PublicError{Code: "STATE_NOT_FOUND", Message: "Requested State is unavailable", Details: details}, "STATE_NOT_FOUND", true},
		{&mcpsandbox.ScriptError{Code: "OBJECT_NOT_FOUND", Message: "Requested Object not found",
			Details: json.RawMessage("{\"ref\":\"object:missing\"}")}, "OBJECT_NOT_FOUND", true},
	}
	for _, tc := range tests {
		result, err := toolResult(nil, tc.err)
		if err != nil || result == nil || !result.IsError || len(result.Content) != 1 {
			t.Fatalf("unexpected tool error %#v %v", result, err)
		}
		textContent, ok := result.Content[0].(*mcp.TextContent)
		if !ok {
			t.Fatalf("wrong error content type %T", result.Content[0])
		}
		var body map[string]any
		if err := json.Unmarshal([]byte(textContent.Text), &body); err != nil {
			t.Fatal(err)
		}
		if body["code"] != tc.code {
			t.Errorf("expected error code %s: %#v", tc.code, body)
		}
		if tc.public && body["details"] == nil {
			t.Errorf("public error details lost: %#v", body)
		}
		if !tc.public && body["details"] != nil {
			t.Errorf("internal details leaked: %#v", body)
		}
		if strings.Contains(textContent.Text, "do-not-leak") {
			t.Fatal("internal server credentials leaked")
		}
	}
	good, err := toolResult(map[string]any{"result": json.RawMessage("{\"count\":7}")}, nil)
	if err != nil || good.IsError {
		t.Fatalf("valid MCP tool result failed: %v", err)
	}
	if len(good.Content) != 1 {
		t.Fatal("expected one JSON response")
	}
	invalid, err := toolResult(func() {}, nil)
	if err != nil || !invalid.IsError {
		t.Fatal("non-JSON tool result was not reported as error")
	}
}

func TestGoMCPServerAuthAndCustomPath(t *testing.T) {
	svc, err := New(&kernel.Service{}, Options{Token: "isolated-admin", Path: "/tools/mcp", MaxConcurrency: 1})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(svc.Handler())
	defer server.Close()
	for _, tc := range []struct {
		path, auth string
		status     int
	}{
		{"/tools/mcp", "", 401}, {"/tools/mcp", "Bearer wrong", 401},
		{"/tools/mcp", "Bearer isolated-admin", 405},
		{"/other", "Bearer isolated-admin", 404},
	} {
		req, _ := http.NewRequest("GET", server.URL+tc.path, nil)
		if tc.auth != "" {
			req.Header.Set("Authorization", tc.auth)
		}
		result, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		result.Body.Close()
		if result.StatusCode != tc.status {
			t.Errorf("path=%s auth=%t unexpected status %d; expected %d", tc.path, tc.auth != "", result.StatusCode, tc.status)
		}
	}
}
