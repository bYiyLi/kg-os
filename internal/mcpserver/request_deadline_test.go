package mcpserver

import (
	"context"
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
)

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
	case <-time.After(time.Second):
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
