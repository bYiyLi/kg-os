package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
	"github.com/bYiyLi/kg-os/internal/observability"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func warmMCPDeadlineSandbox(t *testing.T) {
	t.Helper()
	// Keep cold WASM compilation outside the short request budget under -race.
	dispatch := func(context.Context, string, []json.RawMessage) (json.RawMessage, error) {
		return json.RawMessage(`null`), nil
	}
	stream := func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error { return nil }
	if _, err := mcpsandbox.ExecuteWithLimits(context.Background(), `return null`, true, dispatch, stream,
		mcpsandbox.Limits{Timeout: 30 * time.Second}); err != nil {
		t.Fatal(err)
	}
}

func newMCPDeadlineQueryRequest(t *testing.T, ctx context.Context, endpoint, protocol string, id int, code string) *http.Request {
	t.Helper()
	params := map[string]any{"name": "kgos_query", "arguments": map[string]any{"code": code}}
	if protocol == "2026-07-28" {
		params["_meta"] = map[string]any{
			mcp.MetaKeyProtocolVersion:    protocol,
			mcp.MetaKeyClientCapabilities: map[string]any{},
		}
	}
	raw, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": params})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/mcp", bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer request-deadline-test")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	request.Header.Set("Mcp-Protocol-Version", protocol)
	if protocol == "2026-07-28" {
		request.Header.Set("Mcp-Method", "tools/call")
		request.Header.Set("Mcp-Name", "kgos_query")
	}
	return request
}

func TestMCPRequestDeadlineDeliversTimeoutEnvelopeAndAllowsNextCall(t *testing.T) {
	warmMCPDeadlineSandbox(t)
	for _, protocol := range []string{"2025-06-18", "2026-07-28"} {
		for _, http2 := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/http2=%t", protocol, http2), func(t *testing.T) {
				service, err := New(&kernel.Service{}, Options{
					Token: "request-deadline-test", RequestTimeout: time.Second,
					MaxConcurrency: 1, Sandbox: mcpsandbox.Limits{Timeout: 5 * time.Second},
				})
				if err != nil {
					t.Fatal(err)
				}
				server := httptest.NewUnstartedServer(service.Handler())
				server.EnableHTTP2 = http2
				if http2 {
					server.StartTLS()
				} else {
					server.Start()
				}
				defer server.Close()
				client := server.Client()
				client.Timeout = mcpResponseWriteGrace + 3*time.Second
				call := func(id int, code string) struct {
					Code      string          `json:"code"`
					Data      json.RawMessage `json:"data"`
					Retryable *bool           `json:"retryable"`
				} {
					t.Helper()
					request := newMCPDeadlineQueryRequest(t, context.Background(), server.URL, protocol, id, code)
					response, err := client.Do(request)
					if err != nil {
						t.Fatalf("call %d lost its response: %v", id, err)
					}
					defer response.Body.Close()
					if response.StatusCode != http.StatusOK || (response.ProtoMajor == 2) != http2 {
						body, _ := io.ReadAll(response.Body)
						t.Fatalf("call %d status=%d protocol=%s body=%s", id, response.StatusCode, response.Proto, body)
					}
					var reply struct {
						Result *struct {
							IsError           bool            `json:"isError"`
							StructuredContent json.RawMessage `json:"structuredContent"`
							Content           []struct {
								Type string `json:"type"`
								Text string `json:"text"`
							} `json:"content"`
						} `json:"result"`
						Error json.RawMessage `json:"error"`
					}
					if err := json.NewDecoder(response.Body).Decode(&reply); err != nil {
						t.Fatalf("call %d has no complete JSON response: %v", id, err)
					}
					if reply.Result == nil || reply.Result.IsError || len(reply.Error) > 0 ||
						len(reply.Result.Content) != 1 || reply.Result.Content[0].Type != "text" {
						t.Fatalf("call %d did not return a normal ToolResult: %#v", id, reply)
					}
					if string(reply.Result.StructuredContent) != reply.Result.Content[0].Text {
						t.Fatalf("call %d returned inconsistent envelopes", id)
					}
					var envelope struct {
						Code      string          `json:"code"`
						Data      json.RawMessage `json:"data"`
						Retryable *bool           `json:"retryable"`
					}
					if err := json.Unmarshal(reply.Result.StructuredContent, &envelope); err != nil {
						t.Fatal(err)
					}
					return envelope
				}
				failed := call(1, `await new Promise(() => {})`)
				if failed.Code != "TIMEOUT" || failed.Retryable == nil || !*failed.Retryable {
					t.Fatalf("request deadline returned %#v", failed)
				}
				good := call(2, `return 42`)
				if good.Code != "ok" || string(good.Data) != "42" {
					t.Fatalf("request after timeout returned %#v", good)
				}
			})
		}
	}
}

func TestMCPPeerCancellationStopsHandlerAndReleasesSlot(t *testing.T) {
	warmMCPDeadlineSandbox(t)
	for _, protocol := range []string{"2025-06-18", "2026-07-28"} {
		for _, http2 := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/http2=%t", protocol, http2), func(t *testing.T) {
				var logs contractLog
				observer, err := observability.New(&logs, "")
				if err != nil {
					t.Fatal(err)
				}
				service, err := New(&kernel.Service{}, Options{
					Token: "request-deadline-test", RequestTimeout: 10 * time.Second,
					MaxConcurrency: 1, Sandbox: mcpsandbox.Limits{Timeout: 8 * time.Second},
				})
				if err != nil {
					t.Fatal(err)
				}
				server := httptest.NewUnstartedServer(observability.HTTPMiddleware(observer, service.Handler(), "/mcp"))
				server.EnableHTTP2 = http2
				if http2 {
					server.StartTLS()
				} else {
					server.Start()
				}
				defer server.Close()
				client := server.Client()
				waitFor := func(label string, within time.Duration, ready func() bool) {
					t.Helper()
					timeout := time.NewTimer(within)
					defer timeout.Stop()
					tick := time.NewTicker(5 * time.Millisecond)
					defer tick.Stop()
					for !ready() {
						select {
						case <-tick.C:
						case <-timeout.C:
							t.Fatalf("%s: %+v", label, observer.Snapshot())
						}
					}
				}
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				request := newMCPDeadlineQueryRequest(t, ctx, server.URL, protocol, 1, `await new Promise(() => {})`)
				finished := make(chan error, 1)
				go func() {
					response, err := client.Do(request)
					if response != nil {
						response.Body.Close()
					}
					finished <- err
				}()
				waitFor("handler did not start", 2*time.Second, func() bool {
					return observer.Snapshot().MCP.InFlight == 1
				})
				cancel()
				select {
				case err := <-finished:
					if !errors.Is(err, context.Canceled) {
						t.Fatalf("peer interruption returned %v, want context.Canceled", err)
					}
				case <-time.After(time.Second):
					t.Fatal("HTTP peer did not stop after cancellation")
				}
				// The HTTP response can end before an SDK-detached handler does.
				// Require the handler itself to observe CANCELLED and finish promptly.
				waitFor("peer cancellation left handler or slot active", time.Second, func() bool {
					snapshot := observer.Snapshot()
					return snapshot.MCP.InFlight == 0 && snapshot.HTTP.InFlight == 0 && len(service.semaphore) == 0
				})
				snapshot := observer.Snapshot()
				if snapshot.MCP.ToolCallsTotal != 1 || snapshot.MCP.ToolErrorsTotal != 1 ||
					!strings.Contains(logs.String(), `"event":"mcp.tool.finished"`) ||
					!strings.Contains(logs.String(), `"error_code":"CANCELLED"`) {
					t.Fatalf("handler did not classify peer cancellation once: %+v logs=%s", snapshot.MCP, logs.String())
				}
				nextCtx, stopNext := context.WithTimeout(context.Background(), 3*time.Second)
				defer stopNext()
				next := newMCPDeadlineQueryRequest(t, nextCtx, server.URL, protocol, 2, `return 42`)
				response, err := client.Do(next)
				if err != nil {
					t.Fatalf("next call failed after peer cancellation: %v", err)
				}
				defer response.Body.Close()
				var reply struct {
					Result struct {
						StructuredContent struct {
							Code string          `json:"code"`
							Data json.RawMessage `json:"data"`
						} `json:"structuredContent"`
					} `json:"result"`
				}
				if err := json.NewDecoder(response.Body).Decode(&reply); err != nil ||
					response.StatusCode != http.StatusOK || (response.ProtoMajor == 2) != http2 ||
					reply.Result.StructuredContent.Code != "ok" || string(reply.Result.StructuredContent.Data) != "42" {
					t.Fatalf("next call returned status=%d protocol=%s result=%+v err=%v", response.StatusCode, response.Proto, reply, err)
				}
				snapshot = observer.Snapshot()
				if snapshot.MCP.ToolCallsTotal != 2 || snapshot.MCP.ToolErrorsTotal != 1 || snapshot.MCP.InFlight != 0 {
					t.Fatalf("peer interruption replayed work or prevented recovery: %+v", snapshot.MCP)
				}
			})
		}
	}
}

func TestMCPRequestDeadlineReleasesSlowBodyConcurrencySlot(t *testing.T) {
	service, err := New(&kernel.Service{}, Options{
		Token: "request-deadline-test", RequestTimeout: 20 * time.Millisecond, MaxConcurrency: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service.Handler())
	defer server.Close()
	address := strings.TrimPrefix(server.URL, "http://")
	connection, err := net.Dial("tcp", address)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	_, err = fmt.Fprintf(connection,
		"POST /mcp HTTP/1.1\r\nHost: %s\r\nAuthorization: Bearer request-deadline-test\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: 100\r\n\r\n", address)
	if err != nil {
		t.Fatal(err)
	}
	// The peer leaves the declared request body unfinished. Context cancellation
	// alone cannot interrupt a network Body.Read, even long after its deadline.
	time.Sleep(200 * time.Millisecond)
	request, err := http.NewRequest(http.MethodGet, server.URL+"/mcp", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer request-deadline-test")
	client := &http.Client{Timeout: time.Second}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("request slot remained unavailable after body deadline: got %d, want %d", response.StatusCode, http.StatusMethodNotAllowed)
	}
}

func TestMCPRequestDeadlineAllowsLaterKeepAliveRequest(t *testing.T) {
	service, err := New(&kernel.Service{}, Options{Token: "request-deadline-test", RequestTimeout: 20 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service.Handler())
	defer server.Close()
	transport := &http.Transport{MaxConnsPerHost: 1}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: time.Second}
	for index := range 2 {
		if index != 0 {
			time.Sleep(100 * time.Millisecond)
		}
		request, err := http.NewRequest(http.MethodGet, server.URL+"/mcp", nil)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Authorization", "Bearer request-deadline-test")
		reused := false
		request = request.WithContext(httptrace.WithClientTrace(request.Context(), &httptrace.ClientTrace{
			GotConn: func(info httptrace.GotConnInfo) { reused = info.Reused },
		}))
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_, err = io.Copy(io.Discard, response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != http.StatusMethodNotAllowed {
			t.Fatalf("normal keep-alive request %d failed: status=%d error=%v", index, response.StatusCode, err)
		}
		if index != 0 && !reused {
			t.Fatal("expired request deadline prevented connection reuse")
		}
	}
}

func TestMCPRequestDeadlineInterruptsUnreadResponse(t *testing.T) {
	finished := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		boundMCPRequestIO(response, time.Now().Add(20*time.Millisecond))
		// More than a loopback TCP send buffer, without allocating one giant reply.
		chunk := []byte(strings.Repeat("x", 64<<10))
		for range 1024 {
			if _, err := response.Write(chunk); err != nil {
				finished <- err
				return
			}
		}
		finished <- nil
	}))
	defer server.Close()
	connection, err := net.Dial("tcp", strings.TrimPrefix(server.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	if _, err := fmt.Fprint(connection, "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n"); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-finished:
		if err == nil {
			t.Fatal("unread response unexpectedly bypassed the network write deadline")
		}
	case <-time.After(mcpResponseWriteGrace + time.Second):
		t.Fatal("unread response blocked beyond the request deadline")
	}
}

func TestMCPRequestDeadlineKeepsOtherHTTP2StreamsAvailable(t *testing.T) {
	service, err := New(&kernel.Service{}, Options{
		Token: "request-deadline-test", RequestTimeout: 40 * time.Millisecond, MaxConcurrency: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(service.Handler())
	server.EnableHTTP2 = true
	server.StartTLS()
	defer server.Close()
	client := server.Client()
	client.Timeout = time.Second
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/mcp", reader)
	if err != nil {
		t.Fatal(err)
	}
	request.ContentLength = 100
	request.Header.Set("Authorization", "Bearer request-deadline-test")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	finished := make(chan struct{})
	go func() {
		response, requestErr := client.Do(request)
		if requestErr == nil {
			response.Body.Close()
		}
		close(finished)
	}()
	if _, err := writer.Write([]byte("{")); err != nil {
		t.Fatal(err)
	}
	time.Sleep(200 * time.Millisecond)
	ordinary, err := http.NewRequest(http.MethodGet, server.URL+"/mcp", nil)
	if err != nil {
		t.Fatal(err)
	}
	ordinary.Header.Set("Authorization", "Bearer request-deadline-test")
	reused := false
	ordinary = ordinary.WithContext(httptrace.WithClientTrace(ordinary.Context(), &httptrace.ClientTrace{
		GotConn: func(info httptrace.GotConnInfo) { reused = info.Reused },
	}))
	response, err := client.Do(ordinary)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if !reused || response.ProtoMajor != 2 || response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("slow stream affected another HTTP/2 request: reused=%t protocol=%s status=%d", reused, response.Proto, response.StatusCode)
	}
	writer.Close()
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("slow HTTP/2 stream did not finish after its deadline")
	}
}

func TestMCPRequestDeadlineBoundsRejectedRequestBody(t *testing.T) {
	for _, test := range []struct{ name, headers string }{
		{"unauthorized", ""},
		{"cross-origin", "Authorization: Bearer request-deadline-test\r\nOrigin: https://untrusted.invalid\r\n"},
	} {
		t.Run(test.name, func(t *testing.T) {
			service, err := New(&kernel.Service{}, Options{Token: "request-deadline-test", RequestTimeout: 20 * time.Millisecond})
			if err != nil {
				t.Fatal(err)
			}
			server := httptest.NewServer(service.Handler())
			defer server.Close()
			address := strings.TrimPrefix(server.URL, "http://")
			connection, err := net.Dial("tcp", address)
			if err != nil {
				t.Fatal(err)
			}
			defer connection.Close()
			if err := connection.SetReadDeadline(time.Now().Add(300 * time.Millisecond)); err != nil {
				t.Fatal(err)
			}
			if _, err := fmt.Fprintf(connection, "POST /mcp HTTP/1.1\r\nHost: %s\r\n%sContent-Length: 100\r\n\r\n", address, test.headers); err != nil {
				t.Fatal(err)
			}
			// An invalid peer may receive a rejection or a closed connection, but
			// must not stall net/http's drain of its deliberately unfinished body.
			var reply [1024]byte
			_, err = connection.Read(reply[:])
			if timeout, ok := err.(net.Error); ok && timeout.Timeout() {
				t.Fatalf("rejected request body outlived the MCP request deadline: %v", err)
			}
		})
	}
}
