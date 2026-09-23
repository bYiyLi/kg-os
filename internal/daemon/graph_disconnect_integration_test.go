//go:build lithograph_smoke

package daemon

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase05GraphHTTPClientCancellationStopsExecution(t *testing.T) {
	runtime := openDaemonRuntime(t, freePort(t))
	defer runtime.Close()
	requestDone := make(chan struct{})
	base := NewHandler(runtime, http.NotFoundHandler())
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		base.ServeHTTP(response, request)
		if request.URL.Path == "/api/v1/graph/execute" {
			close(requestDone)
		}
	}))
	defer server.Close()

	payload, err := json.Marshal(kernel.GraphExecuteRequest{
		Branch: "main",
		Cypher: "UNWIND range(1,10000) AS value " +
			"CREATE (:Phase05HTTPClientCancel {value:value}) RETURN value",
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		server.URL+"/api/v1/graph/execute",
		bytes.NewReader(payload),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/x-ndjson")
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("start streaming execute: %v", err)
	}
	reader := bufio.NewReader(response.Body)
	columns, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(columns, `"type":"columns"`) {
		_ = response.Body.Close()
		t.Fatalf("read columns = %q err=%v", columns, err)
	}
	row, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(row, `"type":"row"`) {
		_ = response.Body.Close()
		t.Fatalf("read row = %q err=%v", row, err)
	}
	cancel()
	_ = response.Body.Close()

	select {
	case <-requestDone:
	case <-time.After(5 * time.Second):
		t.Fatal("client cancellation did not stop the public Graph handler")
	}
	result, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase05HTTPClientCancel) RETURN count(n)",
	})
	if err != nil {
		t.Fatalf("query after client cancellation: %v", err)
	}
	if len(result.Rows) != 1 || string(result.Rows[0][0]) != "0" {
		t.Fatalf("client-canceled ordinary stream left durable rows: %#v", result.Rows)
	}
}
