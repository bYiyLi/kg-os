//go:build lithograph_smoke

package daemon

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase05GraphHTTPJSONAndNDJSON(t *testing.T) {
	runtime := openDaemonRuntime(t, freePort(t))
	defer runtime.Close()
	handler := NewHandler(runtime, http.NotFoundHandler())

	execute := graphAPIRequest(
		t,
		handler,
		runtime.Credential.Token,
		"/api/v1/graph/execute",
		"application/json",
		kernel.GraphExecuteRequest{
			Branch: "main",
			Cypher: "CREATE (:Phase05HTTP {value:9223372036854775807}) RETURN 9223372036854775807 AS value",
		},
	)
	if execute.Code != http.StatusOK {
		t.Fatalf("execute status=%d body=%s", execute.Code, execute.Body.String())
	}
	var executed kernel.GraphExecuteResult
	if err := json.Unmarshal(execute.Body.Bytes(), &executed); err != nil {
		t.Fatalf("decode execute response: %v", err)
	}
	if !strings.HasPrefix(executed.State, "commit/") || len(executed.Rows) != 1 ||
		len(executed.Rows[0]) != 1 {
		t.Fatalf("execute response = %#v", executed)
	}
	var tagged map[string]any
	if err := json.Unmarshal(executed.Rows[0][0], &tagged); err != nil ||
		tagged["$type"] != "Integer" {
		t.Fatalf("large Integer = %s err=%v", executed.Rows[0][0], err)
	}

	query := graphAPIRequest(
		t,
		handler,
		runtime.Credential.Token,
		"/api/v1/graph/query",
		"application/json",
		kernel.GraphQueryRequest{
			At:     executed.State,
			Cypher: "MATCH (n:Phase05HTTP) RETURN count(n) AS count",
		},
	)
	if query.Code != http.StatusOK {
		t.Fatalf("query status=%d body=%s", query.Code, query.Body.String())
	}
	var queried kernel.GraphQueryResult
	if err := json.Unmarshal(query.Body.Bytes(), &queried); err != nil {
		t.Fatalf("decode query response: %v", err)
	}
	if queried.State != executed.State || len(queried.Rows) != 1 ||
		string(queried.Rows[0][0]) != "1" {
		t.Fatalf("query response = %#v", queried)
	}

	stream := graphAPIRequest(
		t,
		handler,
		runtime.Credential.Token,
		"/api/v1/graph/query",
		"application/x-ndjson",
		kernel.GraphQueryRequest{
			At:     executed.State,
			Cypher: "UNWIND [1,2] AS value RETURN value",
		},
	)
	if stream.Code != http.StatusOK ||
		stream.Header().Get("Content-Type") != "application/x-ndjson; charset=utf-8" {
		t.Fatalf("stream status=%d headers=%v body=%s", stream.Code, stream.Header(), stream.Body.String())
	}
	lines := strings.Split(strings.TrimSpace(stream.Body.String()), "\n")
	if len(lines) != 4 ||
		!strings.Contains(lines[0], `"type":"columns"`) ||
		!strings.Contains(lines[1], `"type":"row"`) ||
		!strings.Contains(lines[2], `"type":"row"`) ||
		!strings.Contains(lines[3], `"type":"summary"`) ||
		!strings.Contains(lines[3], executed.State) ||
		strings.Contains(lines[3], "counters") {
		t.Fatalf("stream body = %q", stream.Body.String())
	}

	blocked := graphAPIRequest(
		t,
		handler,
		runtime.Credential.Token,
		"/api/v1/graph/query",
		"application/json",
		kernel.GraphQueryRequest{
			At:     "branch/main",
			Cypher: "CREATE (:Phase05HTTPBlocked)",
		},
	)
	if blocked.Code != http.StatusBadRequest ||
		!strings.Contains(blocked.Body.String(), string(kernel.CodeReadOnlySnapshot)) {
		t.Fatalf("read-only status=%d body=%s", blocked.Code, blocked.Body.String())
	}
}

func TestPhase05GraphHTTPWriteFailureStopsPullingAndPreservesTransactionSemantics(t *testing.T) {
	runtime := openDaemonRuntime(t, freePort(t))
	defer runtime.Close()
	handler := NewHandler(runtime, http.NotFoundHandler())

	ordinary := newFailingGraphWriter(2)
	request := authenticatedGraphRequest(
		t,
		runtime.Credential.Token,
		"/api/v1/graph/execute",
		kernel.GraphExecuteRequest{
			Branch: "main",
			Cypher: "UNWIND range(1,100) AS value CREATE (:Phase05HTTPRollback {value:value}) RETURN value",
		},
		"application/x-ndjson",
	)
	handler.ServeHTTP(ordinary, request)
	if ordinary.writeCalls != 2 || ordinary.failures != 1 {
		t.Fatalf("ordinary writer calls=%d failures=%d", ordinary.writeCalls, ordinary.failures)
	}
	rolledBack, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase05HTTPRollback) RETURN count(n)",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(rolledBack.Rows) != 1 || string(rolledBack.Rows[0][0]) != "0" {
		t.Fatalf("ordinary stream write failure left rows: %#v", rolledBack.Rows)
	}

	durable := newFailingGraphWriter(2)
	request = authenticatedGraphRequest(
		t,
		runtime.Credential.Token,
		"/api/v1/graph/execute",
		kernel.GraphExecuteRequest{
			Branch: "main",
			Cypher: "UNWIND range(1,100) AS value " +
				"CALL (value) { CREATE (:Phase05HTTPDurable {value:value}) } " +
				"IN TRANSACTIONS OF 2 ROWS RETURN value",
		},
		"application/x-ndjson",
	)
	handler.ServeHTTP(durable, request)
	if durable.writeCalls != 2 || durable.failures != 1 {
		t.Fatalf("durable writer calls=%d failures=%d", durable.writeCalls, durable.failures)
	}
	durableRows, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase05HTTPDurable) RETURN count(n)",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(durableRows.Rows) != 1 || string(durableRows.Rows[0][0]) == "0" {
		t.Fatalf("transaction-subquery durable work was lost: %#v", durableRows.Rows)
	}

	finalized := newFailingGraphWriter(3)
	request = authenticatedGraphRequest(
		t,
		runtime.Credential.Token,
		"/api/v1/graph/execute",
		kernel.GraphExecuteRequest{
			Branch: "main",
			Cypher: "CREATE (:Phase05HTTPSummaryCommitted) RETURN 1 AS value",
		},
		"application/x-ndjson",
	)
	handler.ServeHTTP(finalized, request)
	if finalized.writeCalls != 3 || finalized.failures != 1 {
		t.Fatalf("summary-failure writer calls=%d failures=%d", finalized.writeCalls, finalized.failures)
	}
	committedRows, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase05HTTPSummaryCommitted) RETURN count(n)",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(committedRows.Rows) != 1 || string(committedRows.Rows[0][0]) != "1" {
		t.Fatalf("summary delivery failure lost finalized write: %#v", committedRows.Rows)
	}
}

func TestPhase05GraphHTTPClientDisconnectCancelsOrdinaryWrite(t *testing.T) {
	runtime := openDaemonRuntime(t, freePort(t))
	defer runtime.Close()
	baseHandler := NewHandler(runtime, http.NotFoundHandler())
	handlerDone := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		baseHandler.ServeHTTP(response, request)
		close(handlerDone)
	}))
	defer server.Close()

	payload, err := json.Marshal(kernel.GraphExecuteRequest{
		Branch: "main",
		Cypher: "UNWIND range(1,10000) AS value " +
			"CREATE (:Phase05HTTPDisconnectRollback {value:value}) RETURN value",
	})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(
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
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("start Graph stream: %v", err)
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
		t.Fatalf("read first row = %q err=%v", row, err)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatalf("disconnect Graph client: %v", err)
	}
	select {
	case <-handlerDone:
	case <-time.After(5 * time.Second):
		t.Fatal("Graph handler continued running after client disconnect")
	}
	rolledBack, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At:     "branch/main",
		Cypher: "MATCH (n:Phase05HTTPDisconnectRollback) RETURN count(n)",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(rolledBack.Rows) != 1 || string(rolledBack.Rows[0][0]) != "0" {
		t.Fatalf("client disconnect left ordinary write durable: %#v", rolledBack.Rows)
	}
}

func graphAPIRequest(
	t *testing.T,
	handler http.Handler,
	token string,
	path string,
	accept string,
	payload any,
) *httptest.ResponseRecorder {
	t.Helper()
	request := authenticatedGraphRequest(t, token, path, payload, accept)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func authenticatedGraphRequest(
	t *testing.T,
	token string,
	path string,
	payload any,
	accept string,
) *http.Request {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", accept)
	return request
}

type failingGraphWriter struct {
	header     http.Header
	failAt     int
	writeCalls int
	failures   int
}

func newFailingGraphWriter(failAt int) *failingGraphWriter {
	return &failingGraphWriter{header: make(http.Header), failAt: failAt}
}

func (writer *failingGraphWriter) Header() http.Header { return writer.header }
func (*failingGraphWriter) WriteHeader(int)            {}
func (*failingGraphWriter) Flush()                     {}

func (writer *failingGraphWriter) Write(body []byte) (int, error) {
	writer.writeCalls++
	if writer.writeCalls >= writer.failAt {
		writer.failures++
		return 0, io.ErrClosedPipe
	}
	return len(body), nil
}

func TestFailingGraphWriterErrorIdentity(t *testing.T) {
	writer := newFailingGraphWriter(1)
	_, err := writer.Write([]byte("x"))
	if !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("writer error = %v", err)
	}
}
