package daemon

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestRequestedGraphMediaTypeHonorsQualityAndJSONTieBreak(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		accept string
		want   string
		ok     bool
	}{
		{accept: "", want: "application/json", ok: true},
		{accept: "application/json", want: "application/json", ok: true},
		{accept: "application/x-ndjson", want: "application/x-ndjson", ok: true},
		{
			accept: "application/json;q=0.2, application/x-ndjson;q=0.9",
			want:   "application/x-ndjson",
			ok:     true,
		},
		{
			accept: "application/x-ndjson;q=0.8, application/json;q=0.8",
			want:   "application/json",
			ok:     true,
		},
		{accept: "application/*", want: "application/json", ok: true},
		{accept: "application/json;q=0, */*;q=1", want: "application/x-ndjson", ok: true},
		{accept: "application/x-ndjson;q=0, */*;q=1", want: "application/json", ok: true},
		{accept: "text/plain", ok: false},
	} {
		got, err := requestedGraphMediaType(test.accept)
		if test.ok && err != nil {
			t.Fatalf("Accept %q: %v", test.accept, err)
		}
		if !test.ok && err == nil {
			t.Fatalf("Accept %q unexpectedly resolved to %q", test.accept, got)
		}
		if test.ok && got != test.want {
			t.Fatalf("Accept %q = %q, want %q", test.accept, got, test.want)
		}
	}
}

func TestWriteGraphStreamSuccessAndTerminalError(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	t.Run("success", func(t *testing.T) {
		response := httptest.NewRecorder()
		writeGraphStream(response, func(consume func(kernel.GraphStreamEvent) error) error {
			columns := []string{"value"}
			row := []json.RawMessage{json.RawMessage("9223372036854775807")}
			if err := consume(kernel.GraphStreamEvent{Type: "columns", Columns: &columns}); err != nil {
				return err
			}
			if err := consume(kernel.GraphStreamEvent{Type: "row", Row: &row}); err != nil {
				return err
			}
			return consume(kernel.GraphStreamEvent{Type: "summary", State: &state})
		})
		if response.Code != http.StatusOK ||
			response.Header().Get("Content-Type") != "application/x-ndjson; charset=utf-8" ||
			!response.Flushed {
			t.Fatalf("status=%d headers=%v flushed=%v", response.Code, response.Header(), response.Flushed)
		}
		lines := strings.Split(strings.TrimSpace(response.Body.String()), "\n")
		if len(lines) != 3 ||
			!strings.Contains(lines[0], `"type":"columns"`) ||
			!strings.Contains(lines[1], "9223372036854775807") ||
			!strings.Contains(lines[2], `"type":"summary"`) ||
			strings.Contains(lines[2], "counters") {
			t.Fatalf("stream body = %q", response.Body.String())
		}
	})

	t.Run("error before first event", func(t *testing.T) {
		response := httptest.NewRecorder()
		writeGraphStream(response, func(func(kernel.GraphStreamEvent) error) error {
			return &kernel.PublicError{Code: kernel.CodeSemantic, Message: "bad query"}
		})
		if response.Code != http.StatusBadRequest ||
			response.Header().Get("Content-Type") != "application/json; charset=utf-8" ||
			strings.Contains(response.Body.String(), `"type":"error"`) {
			t.Fatalf("status=%d headers=%v body=%q", response.Code, response.Header(), response.Body.String())
		}
	})

	t.Run("error after rows", func(t *testing.T) {
		response := httptest.NewRecorder()
		writeGraphStream(response, func(consume func(kernel.GraphStreamEvent) error) error {
			columns := []string{"value"}
			row := []json.RawMessage{json.RawMessage("1")}
			if err := consume(kernel.GraphStreamEvent{Type: "columns", Columns: &columns}); err != nil {
				return err
			}
			if err := consume(kernel.GraphStreamEvent{Type: "row", Row: &row}); err != nil {
				return err
			}
			return &kernel.PublicError{Code: kernel.CodeResource, Message: "stopped"}
		})
		lines := strings.Split(strings.TrimSpace(response.Body.String()), "\n")
		if response.Code != http.StatusOK || len(lines) != 3 ||
			!strings.Contains(lines[2], `"type":"error"`) ||
			!strings.Contains(lines[2], string(kernel.CodeResource)) {
			t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
		}
	})

	t.Run("missing terminal", func(t *testing.T) {
		response := httptest.NewRecorder()
		writeGraphStream(response, func(consume func(kernel.GraphStreamEvent) error) error {
			columns := []string{"value"}
			return consume(kernel.GraphStreamEvent{Type: "columns", Columns: &columns})
		})
		if response.Code != http.StatusOK ||
			!strings.Contains(response.Body.String(), `"type":"error"`) ||
			!strings.Contains(response.Body.String(), string(kernel.CodeInternal)) {
			t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
		}
	})
}

func TestGraphHTTPStreamStopsOnWriterFailure(t *testing.T) {
	writer := &failingGraphResponseWriter{header: make(http.Header)}
	stream := &graphHTTPStream{
		response: writer, controller: http.NewResponseController(writer),
	}
	columns := []string{"value"}
	err := stream.writeEvent(kernel.GraphStreamEvent{Type: "columns", Columns: &columns})
	var writeErr *graphStreamWriteError
	if !errors.As(err, &writeErr) {
		t.Fatalf("write error = %v", err)
	}
	if writeErr.Error() != "broken pipe" || !errors.Is(writeErr, writeErr.err) {
		t.Fatalf("write error identity = %v", writeErr)
	}
}

func TestGraphHTTPStreamDefensiveBranches(t *testing.T) {
	t.Run("requires flusher", func(t *testing.T) {
		writer := &noFlushGraphWriter{header: make(http.Header)}
		writeGraphStream(writer, func(func(kernel.GraphStreamEvent) error) error {
			t.Fatal("stream callback should not run without a flusher")
			return nil
		})
		if writer.status != http.StatusInternalServerError ||
			!strings.Contains(writer.body.String(), string(kernel.CodeInternal)) {
			t.Fatalf("status=%d body=%q", writer.status, writer.body.String())
		}
	})

	t.Run("missing terminal before first event", func(t *testing.T) {
		response := httptest.NewRecorder()
		writeGraphStream(response, func(func(kernel.GraphStreamEvent) error) error { return nil })
		if response.Code != http.StatusInternalServerError ||
			!strings.Contains(response.Body.String(), string(kernel.CodeInternal)) {
			t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
		}
	})

	t.Run("event after terminal", func(t *testing.T) {
		response := httptest.NewRecorder()
		stream := &graphHTTPStream{
			response: response, controller: http.NewResponseController(response), terminal: true,
		}
		columns := []string{"value"}
		err := stream.writeEvent(kernel.GraphStreamEvent{Type: "columns", Columns: &columns})
		var writeErr *graphStreamWriteError
		if !errors.As(err, &writeErr) {
			t.Fatalf("event-after-terminal error = %v", err)
		}
	})

	t.Run("error after terminal is ignored", func(t *testing.T) {
		response := httptest.NewRecorder()
		stream := &graphHTTPStream{
			response: response, controller: http.NewResponseController(response), terminal: true,
		}
		if err := stream.writeError(&kernel.PublicError{Code: kernel.CodeInternal, Message: "ignored"}); err != nil {
			t.Fatalf("write terminal error: %v", err)
		}
		if response.Body.Len() != 0 {
			t.Fatalf("terminal stream wrote body %q", response.Body.String())
		}
	})

	t.Run("short write", func(t *testing.T) {
		writer := &shortGraphWriter{header: make(http.Header)}
		stream := &graphHTTPStream{
			response: writer, controller: http.NewResponseController(writer),
		}
		columns := []string{"value"}
		err := stream.writeEvent(kernel.GraphStreamEvent{Type: "columns", Columns: &columns})
		var writeErr *graphStreamWriteError
		if !errors.As(err, &writeErr) || !errors.Is(err, io.ErrShortWrite) {
			t.Fatalf("short-write error = %v", err)
		}
	})

	t.Run("flush failure", func(t *testing.T) {
		writer := &flushFailGraphWriter{header: make(http.Header)}
		stream := &graphHTTPStream{
			response: writer, controller: http.NewResponseController(writer),
		}
		columns := []string{"value"}
		err := stream.writeEvent(kernel.GraphStreamEvent{Type: "columns", Columns: &columns})
		var writeErr *graphStreamWriteError
		if !errors.As(err, &writeErr) || !strings.Contains(err.Error(), "flush failed") {
			t.Fatalf("flush error = %v", err)
		}
	})
}

func TestWriteGraphStreamAppliesPerEventBackpressure(t *testing.T) {
	writer := newBlockingGraphResponseWriter()
	streamAdvanced := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		writeGraphStream(writer, func(consume func(kernel.GraphStreamEvent) error) error {
			columns := []string{"value"}
			if err := consume(kernel.GraphStreamEvent{Type: "columns", Columns: &columns}); err != nil {
				return err
			}
			close(streamAdvanced)
			state := "commit/" + strings.Repeat("e", 64)
			return consume(kernel.GraphStreamEvent{Type: "summary", State: &state})
		})
	}()

	select {
	case <-writer.firstWriteStarted:
	case <-time.After(time.Second):
		t.Fatal("first NDJSON write did not start")
	}
	select {
	case <-streamAdvanced:
		t.Fatal("stream pulled the next event before the first write completed")
	case <-time.After(20 * time.Millisecond):
	}
	close(writer.releaseFirstWrite)
	select {
	case <-streamAdvanced:
	case <-time.After(time.Second):
		t.Fatal("stream did not advance after the first write completed")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("stream did not finish")
	}
}

type failingGraphResponseWriter struct {
	header http.Header
}

func (writer *failingGraphResponseWriter) Header() http.Header { return writer.header }
func (*failingGraphResponseWriter) WriteHeader(int)            {}
func (*failingGraphResponseWriter) Write([]byte) (int, error)  { return 0, errors.New("broken pipe") }
func (*failingGraphResponseWriter) Flush()                     {}

type noFlushGraphWriter struct {
	header http.Header
	body   strings.Builder
	status int
}

func (writer *noFlushGraphWriter) Header() http.Header { return writer.header }
func (writer *noFlushGraphWriter) WriteHeader(status int) {
	writer.status = status
}
func (writer *noFlushGraphWriter) Write(body []byte) (int, error) {
	if writer.status == 0 {
		writer.status = http.StatusOK
	}
	return writer.body.Write(body)
}

type shortGraphWriter struct {
	header http.Header
}

func (writer *shortGraphWriter) Header() http.Header { return writer.header }
func (*shortGraphWriter) WriteHeader(int)            {}
func (*shortGraphWriter) Flush()                     {}
func (*shortGraphWriter) Write(body []byte) (int, error) {
	if len(body) == 0 {
		return 0, nil
	}
	return len(body) - 1, nil
}

type flushFailGraphWriter struct {
	header http.Header
}

func (writer *flushFailGraphWriter) Header() http.Header { return writer.header }
func (*flushFailGraphWriter) WriteHeader(int)            {}
func (*flushFailGraphWriter) Flush()                     {}
func (*flushFailGraphWriter) FlushError() error          { return errors.New("flush failed") }
func (*flushFailGraphWriter) Write(body []byte) (int, error) {
	return len(body), nil
}

type blockingGraphResponseWriter struct {
	header            http.Header
	firstWriteStarted chan struct{}
	releaseFirstWrite chan struct{}
	writes            int
}

func newBlockingGraphResponseWriter() *blockingGraphResponseWriter {
	return &blockingGraphResponseWriter{
		header:            make(http.Header),
		firstWriteStarted: make(chan struct{}),
		releaseFirstWrite: make(chan struct{}),
	}
}

func (writer *blockingGraphResponseWriter) Header() http.Header { return writer.header }
func (*blockingGraphResponseWriter) WriteHeader(int)            {}
func (*blockingGraphResponseWriter) Flush()                     {}

func (writer *blockingGraphResponseWriter) Write(body []byte) (int, error) {
	writer.writes++
	if writer.writes == 1 {
		close(writer.firstWriteStarted)
		<-writer.releaseFirstWrite
	}
	return len(body), nil
}

func TestGraphAPIAuthorizationMethodDecodeAndNegotiation(t *testing.T) {
	t.Parallel()
	runtime := &runtimehost.Runtime{Credential: runtimeprofile.Credential{Token: "secret"}}
	handler := NewHandler(runtime, http.NotFoundHandler())
	for _, path := range []string{"/api/v1/graph/query", "/api/v1/graph/execute"} {
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}"))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s unauthenticated status = %d", path, response.Code)
		}

		request = httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer secret")
		response = httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s GET status = %d", path, response.Code)
		}

		request = httptest.NewRequest(http.MethodPost, path, strings.NewReader("{"))
		request.Header.Set("Authorization", "Bearer secret")
		request.Header.Set("Content-Type", "application/json")
		response = httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("%s malformed status = %d body=%s", path, response.Code, response.Body.String())
		}

		body := `{"cypher":"RETURN 1"`
		if strings.HasSuffix(path, "/query") {
			body += `,"at":"branch/main"}`
		} else {
			body += `,"branch":"main"}`
		}
		request = httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer secret")
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "text/plain")
		response = httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotAcceptable {
			t.Fatalf("%s negotiation status = %d body=%s", path, response.Code, response.Body.String())
		}
	}
}
