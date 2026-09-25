//go:build lithograph_smoke

package daemon

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase05GraphDaemonShutdownCancelsActiveStream(t *testing.T) {
	runtime := openDaemonRuntime(t)
	defer runtime.Close()
	serverCtx, cancelServer := context.WithCancel(context.Background())
	serveDone := make(chan error, 1)
	go func() {
		serveDone <- Serve(
			serverCtx,
			runtime,
			NewHandler(runtime, http.NotFoundHandler()),
			io.Discard,
		)
	}()
	endpoint := waitForEndpoint(t, runtime)

	payload, err := json.Marshal(kernel.GraphExecuteRequest{
		Branch: "main",
		Cypher: "UNWIND range(1,10000) AS value " +
			"CREATE (:Phase05ShutdownCancel {value:value}) RETURN value",
	})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(
		http.MethodPost,
		endpoint+"/api/v1/graph/execute",
		bytes.NewReader(payload),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/x-ndjson")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("start shutdown Graph stream: %v", err)
	}
	reader := bufio.NewReader(response.Body)
	columns, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(columns, "\"type\":\"columns\"") {
		_ = response.Body.Close()
		t.Fatalf("read columns = %q err=%v", columns, err)
	}
	row, err := reader.ReadString('\n')
	if err != nil || !strings.Contains(row, "\"type\":\"row\"") {
		_ = response.Body.Close()
		t.Fatalf("read row = %q err=%v", row, err)
	}
	cancelServer()
	select {
	case err := <-serveDone:
		if err != nil {
			_ = response.Body.Close()
			t.Fatalf("Serve after Graph shutdown cancellation: %v", err)
		}
	case <-time.After(5 * time.Second):
		_ = response.Body.Close()
		t.Fatal("daemon shutdown did not stop active Graph stream")
	}
	_ = response.Body.Close()

	result, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase05ShutdownCancel) RETURN count(n)",
	})
	if err != nil {
		t.Fatalf("query shutdown rollback: %v", err)
	}
	if len(result.Rows) != 1 || string(result.Rows[0][0]) != "0" {
		t.Fatalf("daemon-shutdown ordinary stream left durable rows: %#v", result.Rows)
	}
}
