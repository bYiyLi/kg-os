package mcpserver

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/buildinfo"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Options are scoped to one already-open KG OS Instance. Token is the existing
// Instance credential, never a separately configured MCP administrator secret.
type Options struct {
	Token               string
	Path                string
	OAuthIssuer         string
	OAuthClient         *http.Client
	MaxConcurrency      int
	RequestTimeout      time.Duration
	MaxRequestBytes     int64
	Sandbox             mcpsandbox.Limits
	PreviewMaxItems     int
	PreviewCacheEntries int
	PreviewCacheTTL     time.Duration
}

type Server struct {
	kernel              *kernel.Service
	digest              [32]byte
	handler             http.Handler
	semaphore           chan struct{}
	previewCache        previewCache
	timeout             time.Duration
	oauth               *oauthBroker
	sandbox             mcpsandbox.Limits
	previewMaxItems     int
	previewCacheEntries int
	previewCacheTTL     time.Duration
}
type oauthPrincipalKey struct{}

func New(k *kernel.Service, settings Options) (*Server, error) {
	if k == nil {
		return nil, errors.New("kernel is required")
	}
	if settings.Token == "" || len(settings.Token) > 4096 {
		return nil, errors.New("instance token is required for MCP")
	}
	if settings.Path == "" {
		settings.Path = "/mcp"
	}
	if !strings.HasPrefix(settings.Path, "/") || strings.ContainsAny(settings.Path, "?#{}\\\r\n") || settings.Path == "/" || settings.Path == "/api" || strings.HasPrefix(settings.Path, "/api/") || settings.Path == "/oauth" || strings.HasPrefix(settings.Path, "/oauth/") || settings.Path == "/.well-known" || strings.HasPrefix(settings.Path, "/.well-known/") {
		return nil, errors.New("invalid MCP path")
	}
	if settings.MaxConcurrency == 0 {
		settings.MaxConcurrency = 16
	}
	if settings.MaxConcurrency < 1 || settings.MaxConcurrency > 1024 {
		return nil, errors.New("invalid MCP max concurrency")
	}
	if settings.RequestTimeout == 0 {
		settings.RequestTimeout = 30 * time.Second
	}
	if settings.RequestTimeout < time.Millisecond || settings.RequestTimeout > 10*time.Minute {
		return nil, errors.New("invalid MCP request timeout")
	}
	if settings.MaxRequestBytes == 0 {
		settings.MaxRequestBytes = 1 << 20
	}
	if settings.MaxRequestBytes < 1024 || settings.MaxRequestBytes > 16<<20 {
		return nil, errors.New("invalid MCP request size budget")
	}
	if settings.PreviewMaxItems == 0 {
		settings.PreviewMaxItems = 50000
	}
	if settings.PreviewCacheEntries == 0 {
		settings.PreviewCacheEntries = 8
	}
	if settings.PreviewCacheTTL == 0 {
		settings.PreviewCacheTTL = 10 * time.Minute
	}
	if settings.PreviewMaxItems < 1 || settings.PreviewMaxItems > 1000000 || settings.PreviewCacheEntries < 1 || settings.PreviewCacheEntries > 64 || settings.PreviewCacheTTL < time.Second || settings.PreviewCacheTTL > 24*time.Hour {
		return nil, errors.New("invalid MCP Preview budget")
	}
	s := &Server{kernel: k, digest: sha256.Sum256([]byte(settings.Token)), semaphore: make(chan struct{}, settings.MaxConcurrency), timeout: settings.RequestTimeout,
		sandbox: settings.Sandbox, previewMaxItems: settings.PreviewMaxItems, previewCacheEntries: settings.PreviewCacheEntries, previewCacheTTL: settings.PreviewCacheTTL}
	if settings.OAuthIssuer != "" {
		broker, err := newOAuthBroker(settings.OAuthIssuer, settings.Path, settings.Token, settings.OAuthClient)
		if err != nil {
			return nil, err
		}
		s.oauth = broker
	}
	mcpHTTP := mcp.NewStreamableHTTPHandler(func(_ *http.Request) *mcp.Server { return s.toolServer() }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true, MaxRequestBodyBytes: settings.MaxRequestBytes, PropagateRequestCancellation: true})
	s.handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, authorized := s.principal(r.Header.Get("Authorization"))
		if !authorized {
			if s.oauth != nil {
				w.Header().Set("WWW-Authenticate", fmt.Sprintf("Bearer resource_metadata=%q", s.oauth.resourceMetadataURL()))
			} else {
				w.Header().Set("WWW-Authenticate", "Bearer")
			}
			http.Error(w, "MCP authorization required", http.StatusUnauthorized)
			return
		}
		if r.URL.Path != settings.Path {
			http.NotFound(w, r)
			return
		}
		ctx, cancel := context.WithTimeout(context.WithValue(r.Context(), oauthPrincipalKey{}, principal), s.timeout)
		defer cancel()
		select {
		case s.semaphore <- struct{}{}:
			defer func() { <-s.semaphore }()
		default:
			http.Error(w, "MCP server busy", http.StatusTooManyRequests)
			return
		}
		mcpHTTP.ServeHTTP(w, r.WithContext(ctx))
	})
	return s, nil
}
func (s *Server) Handler() http.Handler { return s.handler }

// OAuthRoutes belong on the same HTTP listener as the four MCP tools and
// existing Instance Bearer API. They do not grant access to /api/v1/*.
func (s *Server) OAuthRoutes() map[string]http.Handler {
	if s.oauth == nil {
		return nil
	}
	return s.oauth.routes()
}
func (s *Server) authorized(value string) bool {
	_, ok := s.principal(value)
	return ok
}
func (s *Server) principal(value string) (string, bool) {
	if !strings.HasPrefix(value, "Bearer ") || len(value) > 4103 {
		return "", false
	}
	provided := strings.TrimPrefix(value, "Bearer ")
	if provided == "" {
		return "", false
	}
	hash := sha256.Sum256([]byte(provided))
	if subtle.ConstantTimeCompare(hash[:], s.digest[:]) == 1 {
		return fmt.Sprintf("%x", s.digest), true
	}
	if s.oauth != nil {
		return s.oauth.principal(provided)
	}
	return "", false
}
func toolResult(value any, err error) (*mcp.CallToolResult, error) {
	if err != nil {
		code := "INTERNAL_ERROR"
		message := "KG OS MCP operation failed"
		var details json.RawMessage
		var public *kernel.PublicError
		var script *mcpsandbox.ScriptError
		if errors.As(err, &public) {
			code = string(public.Code)
			message = public.Message
			if public.Details != nil {
				details, _ = json.Marshal(public.Details)
			}
		} else if errors.As(err, &script) {
			code = script.Code
			message = script.Message
			details = script.Details
		} else if errors.Is(err, context.Canceled) {
			code = "CANCELLED"
			message = "Call cancelled; writes may have completed"
		} else if strings.HasPrefix(err.Error(), "RESOURCE_ERROR:") {
			code = "RESOURCE_ERROR"
			message = "Sandbox resource limit exceeded"
		} else if strings.HasPrefix(err.Error(), "INVALID_ARGUMENT:") {
			code = "INVALID_ARGUMENT"
			message = "Invalid MCP tool arguments"
		} else if strings.HasPrefix(err.Error(), "VIEW_EXPIRED:") {
			code = "VIEW_EXPIRED"
			message = "Preview revision is expired or unavailable"
		} else if strings.HasPrefix(err.Error(), "SCRIPT_RESULT_ERROR:") {
			code = "SCRIPT_RESULT_ERROR"
			message = "Script must return a JSON-compatible value"
		} else if strings.HasPrefix(err.Error(), "SCRIPT_ERROR:") {
			code = "SCRIPT_ERROR"
			message = "JavaScript execution failed"
		}
		body := map[string]any{"code": code, "message": message}
		if len(details) > 0 && len(details) <= 1<<20 && json.Valid(details) && string(details) != "null" {
			body["details"] = details
		}
		raw, _ := json.Marshal(body)
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(raw)}}, IsError: true}, nil
	}
	raw, marshalErr := json.Marshal(value)
	if marshalErr != nil {
		return toolResult(nil, marshalErr)
	}
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(raw)}}}, nil
}
func (s *Server) toolServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "kgos", Version: buildinfo.Version}, nil)
	closed := false
	yes := true
	preview := mcp.AddTool[PreviewInput, any]
	preview(server, &mcp.Tool{Name: "kgos_preview", Title: "KG OS ontology preview", Description: "Read a stable Markdown line window for all Branches and pinned Ontologies.", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: &closed, DestructiveHint: &closed}}, func(ctx context.Context, _ *mcp.CallToolRequest, input PreviewInput) (*mcp.CallToolResult, any, error) {
		principal, _ := ctx.Value(oauthPrincipalKey{}).(string)
		if principal == "" {
			result, _ := toolResult(nil, errors.New("authorization context unavailable"))
			return result, nil, nil
		}
		value, err := s.preview(ctx, principal, input)
		result, _ := toolResult(value, err)
		return result, nil, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "state_ancestry", Title: "KG OS Commit ancestry", Description: "Read the pinned Commit DAG and full original messages in Markdown.", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: &closed, DestructiveHint: &closed}}, func(ctx context.Context, _ *mcp.CallToolRequest, input AncestryInput) (*mcp.CallToolResult, any, error) {
		value, err := StateAncestry(ctx, s.kernel, input)
		result, _ := toolResult(value, err)
		return result, nil, nil
	})
	type ScriptInput struct {
		Code string `json:"code" jsonschema:"required"`
	}
	adapter := Adapter{Kernel: s.kernel}
	for _, item := range []struct {
		Name, Title, Description string
		ReadOnly                 bool
	}{
		{"kgos_read", "KG OS JavaScript read", "Execute async JavaScript with read-only ontology/object/graph/evolution SDK methods. Explicit return required.", true},
		{"kgos_run", "KG OS JavaScript read/write", "Execute async JavaScript with read and write SDK methods. Each write commits independently, cancellations may leave writes completed.", false},
	} {
		entry := item
		serverName := entry.Name
		mcp.AddTool(server, &mcp.Tool{Name: serverName, Title: entry.Title, Description: entry.Description, Annotations: &mcp.ToolAnnotations{ReadOnlyHint: entry.ReadOnly, OpenWorldHint: &closed, DestructiveHint: &yes}}, func(ctx context.Context, _ *mcp.CallToolRequest, input ScriptInput) (*mcp.CallToolResult, any, error) {
			if input.Code == "" {
				result, _ := toolResult(nil, fmt.Errorf("SCRIPT_ERROR: code is empty"))
				return result, nil, nil
			}
			raw, err := mcpsandbox.ExecuteWithLimits(ctx, input.Code, entry.ReadOnly, adapter.Invoke, adapter.Stream, s.sandbox)
			if err != nil {
				result, _ := toolResult(nil, err)
				return result, nil, nil
			}
			result, _ := toolResult(map[string]json.RawMessage{"result": raw}, nil)
			return result, nil, nil
		})
	}
	return server
}
