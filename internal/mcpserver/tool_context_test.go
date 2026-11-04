package mcpserver

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestToolFailureUnwrapsPublicContextErrors(t *testing.T) {
	for _, test := range []struct {
		name string
		err  error
		code string
	}{
		{"deadline", context.DeadlineExceeded, "TIMEOUT"},
		{"cancelled", context.Canceled, "CANCELLED"},
	} {
		t.Run(test.name, func(t *testing.T) {
			wrapped := fmt.Errorf("adapter call: %w", kernel.AsPublicError(test.err))
			result, err := toolResult(nil, wrapped)
			if err != nil {
				t.Fatal(err)
			}
			if got := toolErrorCode(t, result); got != test.code {
				t.Fatalf("wrapped context error code = %s, want %s", got, test.code)
			}
		})
	}
}

func TestRegisteredToolContextOverridesWrappedHandlerErrors(t *testing.T) {
	for _, kind := range []string{"deadline", "peer"} {
		for _, preserveCause := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/cause_%t", kind, preserveCause), func(t *testing.T) {
				started := make(chan struct{}, 1)
				service := &Server{}
				server := mcp.NewServer(&mcp.Implementation{Name: "context-test", Version: "1"}, nil)
				registerTypedTool(service, server, &mcp.Tool{Name: "wait"}, map[string]any{}, func(ctx context.Context, _ struct{}) (any, error) {
					started <- struct{}{}
					<-ctx.Done()
					failure := kernel.AsPublicError(ctx.Err())
					if !preserveCause {
						failure.Cause = nil
					}
					return nil, failure
				})
				peer, cancelPeer := context.WithCancel(context.Background())
				defer cancelPeer()
				transport := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
				httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
					budget := 10 * time.Second
					if kind == "deadline" {
						budget = 250 * time.Millisecond
					}
					ctx := context.WithValue(request.Context(), requestDeadlineKey{}, time.Now().Add(budget))
					ctx = context.WithValue(ctx, requestPeerKey{}, peer)
					transport.ServeHTTP(w, request.WithContext(ctx))
				}))
				defer httpServer.Close()
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				client := mcp.NewClient(&mcp.Implementation{Name: "context-client", Version: "1"}, nil)
				session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: httpServer.URL, DisableStandaloneSSE: true}, nil)
				if err != nil {
					t.Fatal(err)
				}
				defer session.Close()
				type outcome struct {
					result *mcp.CallToolResult
					err    error
				}
				finished := make(chan outcome, 1)
				go func() {
					result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "wait", Arguments: map[string]any{}})
					finished <- outcome{result, err}
				}()
				select {
				case <-started:
				case <-ctx.Done():
					t.Fatal("registered handler did not start")
				}
				want := "TIMEOUT"
				if kind == "peer" {
					want = "CANCELLED"
					cancelPeer()
				}
				select {
				case got := <-finished:
					if got.err != nil {
						t.Fatal(got.err)
					}
					if code := toolErrorCode(t, got.result); code != want {
						t.Fatalf("context result = %s, want %s", code, want)
					}
				case <-ctx.Done():
					t.Fatal("context failure did not produce a business result")
				}
			})
		}
	}
}

func TestActiveRequestPreservesResourceAndBusinessErrors(t *testing.T) {
	service := &Server{}
	server := mcp.NewServer(&mcp.Implementation{Name: "active-test", Version: "1"}, nil)
	for name, failure := range map[string]error{
		"resource": &mcpsandbox.ScriptError{Code: "RESOURCE_ERROR", Message: "Sandbox deadline exceeded; writes may have completed"},
		"business": &kernel.PublicError{Code: kernel.CodeStateNotFound, Message: "Requested State is unavailable"},
	} {
		registerTypedTool(service, server, &mcp.Tool{Name: name}, map[string]any{}, func(context.Context, struct{}) (any, error) { return nil, failure })
	}
	transport := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		ctx := context.WithValue(request.Context(), requestDeadlineKey{}, time.Now().Add(5*time.Second))
		transport.ServeHTTP(w, request.WithContext(ctx))
	}))
	defer httpServer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "active-client", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: httpServer.URL, DisableStandaloneSSE: true}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	for name, want := range map[string]string{"resource": "RESOURCE_ERROR", "business": "STATE_NOT_FOUND"} {
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: map[string]any{}})
		if err != nil {
			t.Fatal(err)
		}
		if got := toolErrorCode(t, result); got != want {
			t.Fatalf("active request returned %s, want %s", got, want)
		}
	}
}
