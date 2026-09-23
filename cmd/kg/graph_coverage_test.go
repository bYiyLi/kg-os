package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestGraphCLIAdditionalFailureBoundaries(t *testing.T) {
	var stderr strings.Builder
	if _, code := readGraphCypher(&failingGraphReader{}, "Cypher stdin", &stderr); code != 2 ||
		!strings.Contains(stderr.String(), string(kernel.CodeIO)) {
		t.Fatalf("reader failure code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := readGraphCypher(
		bytes.NewReader(bytes.Repeat([]byte("x"), maxGraphCLIInputBytes+1)),
		"Cypher stdin",
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeResource)) {
		t.Fatalf("oversize Cypher code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadGraphCypher(
		graphCLI{CypherFile: filepath.Join(t.TempDir(), "missing"), cypherFileSet: true},
		strings.NewReader(""),
		true,
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
		t.Fatalf("missing Cypher file code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadGraphParams(
		graphCLI{ParamsFile: filepath.Join(t.TempDir(), "missing"), paramsFileSet: true},
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
		t.Fatalf("missing params file code=%d stderr=%q", code, stderr.String())
	}
	oversize := filepath.Join(t.TempDir(), "params.json")
	if err := os.WriteFile(oversize, bytes.Repeat([]byte(" "), maxGraphCLIInputBytes+1), 0o600); err != nil {
		t.Fatal(err)
	}
	stderr.Reset()
	if _, code := loadGraphParams(
		graphCLI{ParamsFile: oversize, paramsFileSet: true},
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeResource)) {
		t.Fatalf("oversize params code=%d stderr=%q", code, stderr.String())
	}
}

type failingGraphReader struct{}

func (*failingGraphReader) Read([]byte) (int, error) {
	return 0, io.ErrUnexpectedEOF
}

func TestGraphAdditionalResponseValidation(t *testing.T) {
	state := "commit/" + strings.Repeat("d", 64)
	if validGraphQueryResult(kernel.GraphQueryResult{State: state}) {
		t.Fatal("query result without columns/rows accepted")
	}
	if validGraphQueryResult(kernel.GraphQueryResult{
		State: state, Columns: []string{"a"}, Rows: [][]json.RawMessage{{}},
	}) {
		t.Fatal("query result with mismatched row width accepted")
	}
	if validGraphExecuteResult(kernel.GraphExecuteResult{
		State: state, Columns: []string{}, Rows: [][]json.RawMessage{}, Counters: json.RawMessage("[]"),
	}) {
		t.Fatal("execute result with non-object counters accepted")
	}
	if validGraphStreamSummary(
		[]byte(`{"type":"summary","state":"`+state+`","counters":{}}`),
		false,
	) {
		t.Fatal("query stream summary with counters accepted")
	}
	if validGraphStreamSummary([]byte(`{"type":"summary","state":"bad"}`), false) {
		t.Fatal("stream summary with invalid state accepted")
	}
}

func TestGraphAdditionalStreamProtocolFailures(t *testing.T) {
	state := "commit/" + strings.Repeat("e", 64)
	columns := "{\"type\":\"columns\",\"columns\":[\"a\"]}\n"
	for _, test := range []struct {
		name    string
		body    string
		execute bool
		want    string
	}{
		{name: "row before columns", body: "{\"type\":\"row\",\"row\":[1]}\n", want: "row preceded"},
		{name: "wrong row width", body: columns + "{\"type\":\"row\",\"row\":[]}\n", want: "invalid Graph stream row"},
		{name: "unknown event", body: columns + "{\"type\":\"progress\"}\n", want: "unknown Graph stream event"},
		{name: "error before columns", body: "{\"type\":\"error\",\"error\":{\"code\":\"IO_ERROR\",\"message\":\"x\"}}\n", want: "error preceded"},
		{name: "malformed event", body: "{\n", want: "malformed Graph stream event"},
		{name: "incomplete event", body: columns + "{\"type\":\"row\"", want: "incomplete event"},
		{name: "invalid summary", body: columns + "{\"type\":\"summary\",\"state\":\"bad\"}\n", want: "invalid Graph stream summary"},
		{
			name: "execute summary missing counters", execute: true,
			body: columns + "{\"type\":\"summary\",\"state\":\"" + state + "\"}\n",
			want: "invalid Graph stream summary",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			var stdout, stderr strings.Builder
			code := consumeGraphStream(strings.NewReader(test.body), test.execute, &stdout, &stderr)
			if code != 3 || !strings.Contains(stderr.String(), test.want) {
				t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
			}
		})
	}
}

func TestGraphAdditionalHTTPFailureBoundaries(t *testing.T) {
	state := "commit/" + strings.Repeat("f", 64)
	t.Run("wrong success content type", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, "{}")
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{"query", "--at", state, "--cypher", "RETURN 1", "--stream"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 3 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
	t.Run("malformed public error", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, "not-json")
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{"query", "--at", state, "--cypher", "BAD", "--stream"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 3 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
}
