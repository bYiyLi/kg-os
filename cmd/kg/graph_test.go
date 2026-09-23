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

func TestGraphDispatchHelpAndUsage(t *testing.T) {
	t.Setenv("LANG", "en_US.UTF-8")
	for _, test := range []struct {
		args       []string
		wantCode   int
		wantStdout string
		wantStderr string
	}{
		{args: []string{"--help"}, wantCode: 0, wantStdout: "KG OS Graph commands"},
		{args: nil, wantCode: 2, wantStderr: "graph subcommand is required"},
		{args: []string{"search"}, wantCode: 2, wantStderr: "unknown graph subcommand"},
	} {
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			test.args,
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != test.wantCode ||
			(test.wantStdout != "" && !strings.Contains(stdout.String(), test.wantStdout)) ||
			(test.wantStderr != "" && !strings.Contains(stderr.String(), test.wantStderr)) {
			t.Fatalf("args=%q code=%d stdout=%q stderr=%q", test.args, code, stdout.String(), stderr.String())
		}
	}
	t.Setenv("LANG", "zh_CN.UTF-8")
	if got := graphHelp(detectLocale()); !strings.Contains(got, "KG OS Graph 命令") {
		t.Fatalf("Chinese Graph help = %q", got)
	}
}

func TestParseGraphCLIContracts(t *testing.T) {
	query, err := parseGraphCLI("query", []string{
		"--at", "branch/main",
		"--cypher", "RETURN 1",
		"--params", "{}",
		"--pretty",
	})
	if err != nil || query.At != "branch/main" || !query.cypherSet || !query.paramsSet || !query.Pretty {
		t.Fatalf("query = %#v err=%v", query, err)
	}
	execute, err := parseGraphCLI("execute", []string{
		"--branch", "main",
		"--cypher-file", "query.cypher",
		"--params-file", "params.json",
		"--author", "",
		"--message", "message",
		"--stream",
	})
	if err != nil || execute.Branch != "main" || !execute.cypherFileSet ||
		!execute.paramsFileSet || execute.Author == nil || *execute.Author != "" ||
		execute.Message == nil || *execute.Message != "message" || !execute.Stream {
		t.Fatalf("execute = %#v err=%v", execute, err)
	}

	for _, args := range [][]string{
		{"--cypher", "RETURN 1"},
		{"--at", "branch/main", "--cypher", "RETURN 1", "--cypher-file", "q"},
		{"--at", "branch/main", "--params", "{}", "--params-file", "p"},
		{"--at", "branch/main", "--cypher", "RETURN 1", "--pretty", "--stream"},
		{"--at", "branch/main", "--branch", "main", "--cypher", "RETURN 1"},
		{"--at", "branch/main", "--cypher", "", "--cypher", "RETURN 1"},
		{"--at", "branch/main", "--params", "", "--params", "{}"},
	} {
		if _, err := parseGraphCLI("query", args); err == nil {
			t.Fatalf("query args %q unexpectedly accepted", args)
		}
	}
	for _, args := range [][]string{
		{"--cypher", "RETURN 1"},
		{"--branch", "main", "--at", "branch/main", "--cypher", "RETURN 1"},
		{"--branch", "main", "--cypher", "RETURN 1", "--branch", "other"},
	} {
		if _, err := parseGraphCLI("execute", args); err == nil {
			t.Fatalf("execute args %q unexpectedly accepted", args)
		}
	}
}

func TestGraphCLIInputSourcesAndRawParams(t *testing.T) {
	dir := t.TempDir()
	cypherPath := filepath.Join(dir, "query.cypher")
	if err := os.WriteFile(cypherPath, []byte("RETURN $n AS n\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	paramsPath := filepath.Join(dir, "params.json")
	rawParams := `{"n":9223372036854775807,"decimal":1.234567890123456789}`
	if err := os.WriteFile(paramsPath, []byte(rawParams), 0o600); err != nil {
		t.Fatal(err)
	}
	var stderr strings.Builder
	cypher, code := loadGraphCypher(
		graphCLI{CypherFile: cypherPath, cypherFileSet: true},
		strings.NewReader("ignored"),
		false,
		&stderr,
	)
	if code != 0 || cypher != "RETURN $n AS n\n" || stderr.Len() != 0 {
		t.Fatalf("cypher=%q code=%d stderr=%q", cypher, code, stderr.String())
	}
	params, code := loadGraphParams(
		graphCLI{ParamsFile: paramsPath, paramsFileSet: true},
		&stderr,
	)
	if code != 0 || string(params) != rawParams {
		t.Fatalf("params=%s code=%d stderr=%q", params, code, stderr.String())
	}

	stderr.Reset()
	cypher, code = loadGraphCypher(
		graphCLI{},
		strings.NewReader("RETURN 2"),
		false,
		&stderr,
	)
	if code != 0 || cypher != "RETURN 2" {
		t.Fatalf("stdin cypher=%q code=%d stderr=%q", cypher, code, stderr.String())
	}

	stderr.Reset()
	if _, code := loadGraphCypher(graphCLI{}, strings.NewReader(""), true, &stderr); code != 2 {
		t.Fatalf("TTY missing Cypher code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadGraphCypher(
		graphCLI{Cypher: "", cypherSet: true},
		strings.NewReader("RETURN 3"),
		false,
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), "empty") {
		t.Fatalf("explicit empty Cypher code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := readGraphCypher(bytes.NewReader([]byte{0xff}), "Cypher stdin", &stderr); code != 2 ||
		!strings.Contains(stderr.String(), string(kernel.CodeParse)) {
		t.Fatalf("invalid UTF-8 code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadGraphParams(
		graphCLI{Params: "[]", paramsSet: true},
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeInvalidArgument)) {
		t.Fatalf("array params code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadGraphParams(
		graphCLI{Params: "{", paramsSet: true},
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeParse)) {
		t.Fatalf("invalid params code=%d stderr=%q", code, stderr.String())
	}
}

func TestRunGraphQueryAndExecuteJSON(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	t.Run("query preserves params and values", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v1/graph/query" ||
				r.Header.Get("Accept") != "application/json" ||
				r.Header.Get("Authorization") != "Bearer token" {
				t.Fatalf("request path=%s headers=%v", r.URL.Path, r.Header)
			}
			var input kernel.GraphQueryRequest
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatal(err)
			}
			if input.At != state || input.Cypher != "RETURN $n AS n" ||
				string(input.Params) != `{"n":9223372036854775807}` {
				t.Fatalf("input = %#v params=%s", input, input.Params)
			}
			_ = json.NewEncoder(w).Encode(kernel.GraphQueryResult{
				State:   state,
				Columns: []string{"n"},
				Rows:    [][]json.RawMessage{{json.RawMessage("9223372036854775807")}},
			})
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{
				"query", "--at", state, "--cypher", "RETURN $n AS n",
				"--params", `{"n":9223372036854775807}`,
			},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 0 || stderr.Len() != 0 ||
			!strings.Contains(stdout.String(), "9223372036854775807") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("execute pretty", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v1/graph/execute" {
				t.Fatalf("path = %s", r.URL.Path)
			}
			var input kernel.GraphExecuteRequest
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatal(err)
			}
			if input.Branch != "main" || input.Author == nil || *input.Author != "A" ||
				input.Message == nil || *input.Message != "M" {
				t.Fatalf("input = %#v", input)
			}
			_ = json.NewEncoder(w).Encode(kernel.GraphExecuteResult{
				State:    state,
				Columns:  []string{},
				Rows:     [][]json.RawMessage{},
				Counters: json.RawMessage(`{"nodesCreated":1}`),
			})
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{
				"execute", "--branch", "main", "--cypher", "CREATE (:X)",
				"--author", "A", "--message", "M", "--pretty",
			},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 0 || stderr.Len() != 0 ||
			!strings.Contains(stdout.String(), "\n  \"counters\":") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
}

func TestRunGraphJSONFailureClassification(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	t.Run("public error", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"code":"SEMANTIC_ERROR","message":"bad"}`)
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{"query", "--at", state, "--cypher", "BAD"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "SEMANTIC_ERROR") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
	t.Run("malformed success", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `{"state":"bad","columns":[],"rows":[]}`)
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{"query", "--at", state, "--cypher", "RETURN 1"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 3 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
	t.Run("execute public error", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"code":"CONSTRAINT_ERROR","message":"bad execute"}`)
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{"execute", "--branch", "main", "--cypher", "CREATE (:X)"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "CONSTRAINT_ERROR") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
	t.Run("execute malformed success", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `{"state":"`+state+`","columns":[],"rows":[],"counters":[]}`)
		}))
		var stdout, stderr strings.Builder
		code := runGraph(
			context.Background(),
			[]string{"execute", "--branch", "main", "--cypher", "CREATE (:X)"},
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

func TestRunGraphStreamSuccessTerminalErrorAndIncompleteTransport(t *testing.T) {
	state := "commit/" + strings.Repeat("b", 64)
	columns := "{\"type\":\"columns\",\"columns\":[\"value\"]}\n"
	row := "{\"type\":\"row\",\"row\":[1]}\n"
	summary := "{\"type\":\"summary\",\"state\":\"" + state + "\"}\n"

	t.Run("success", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Accept") != "application/x-ndjson" {
				t.Fatalf("Accept = %q", r.Header.Get("Accept"))
			}
			w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
			_, _ = io.WriteString(w, columns+row+summary)
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
		if code != 0 || stderr.Len() != 0 || stdout.String() != columns+row+summary {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("terminal error stays off stdout", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/x-ndjson")
			_, _ = io.WriteString(w, columns+row+
				"{\"type\":\"error\",\"error\":{\"code\":\"RESOURCE_ERROR\",\"message\":\"stopped\"}}\n")
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
		if code != 1 || stdout.String() != columns+row ||
			!strings.Contains(stderr.String(), string(kernel.CodeResource)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("incomplete EOF preserves partial output", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/x-ndjson")
			_, _ = io.WriteString(w, columns+row)
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
		if code != 3 || stdout.String() != columns+row ||
			!strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("pre-event public error", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"code":"PARSE_ERROR","message":"bad"}`)
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
		if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeParse)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("data after summary", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/x-ndjson")
			_, _ = io.WriteString(w, columns+summary+row)
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
		if code != 3 || stdout.String() != columns ||
			!strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
}

func TestConsumeGraphExecuteStreamRequiresCounters(t *testing.T) {
	state := "commit/" + strings.Repeat("c", 64)
	stream := "{\"type\":\"columns\",\"columns\":[]}\n" +
		"{\"type\":\"summary\",\"state\":\"" + state + "\"}\n"
	var stdout, stderr strings.Builder
	code := consumeGraphStream(strings.NewReader(stream), true, &stdout, &stderr)
	if code != 3 || stdout.String() != "{\"type\":\"columns\",\"columns\":[]}\n" ||
		!strings.Contains(stderr.String(), string(kernel.CodeIO)) {
		t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}
