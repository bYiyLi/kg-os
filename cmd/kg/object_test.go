package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestObjectDispatchHelpAndUsageErrors(t *testing.T) {
	t.Setenv("LANG", "en_US.UTF-8")
	for _, test := range []struct {
		name       string
		args       []string
		wantCode   int
		wantStdout string
		wantStderr string
	}{
		{name: "help", args: []string{"--help"}, wantCode: 0, wantStdout: "KG OS Object commands"},
		{name: "missing subcommand", args: nil, wantCode: 2, wantStderr: "object subcommand is required"},
		{name: "unknown subcommand", args: []string{"list"}, wantCode: 2, wantStderr: "unknown object subcommand"},
	} {
		t.Run(test.name, func(t *testing.T) {
			var stdout, stderr strings.Builder
			code := runObject(
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
				t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
			}
		})
	}

	t.Setenv("LANG", "zh_CN.UTF-8")
	if got := objectHelp(detectLocale()); !strings.Contains(got, "KG OS Object 命令") {
		t.Fatalf("Chinese Object help = %q", got)
	}
}

func TestObjectReadCLIInputAndFormatting(t *testing.T) {
	if _, err := parseObjectReadCLI([]string{"node:A", "--refs-file", "refs", "--at", "branch/main"}); err == nil {
		t.Fatal("positional refs + --refs-file unexpectedly accepted")
	}
	if _, err := parseObjectReadCLI([]string{"node:A", "--at", "branch/main", "--format", "yaml"}); err == nil {
		t.Fatal("--format without --body unexpectedly accepted")
	}
	if _, err := parseObjectReadCLI([]string{"node:A", "--at", "branch/main", "--body", "--pretty"}); err == nil {
		t.Fatal("YAML --pretty unexpectedly accepted")
	}
	input, err := parseObjectReadCLI([]string{"node:A", "node:B", "--at", "branch/main", "--body", "--format", "json", "--pretty"})
	if err != nil || len(input.Refs) != 2 || input.Format != "json" || !input.Body || !input.Pretty {
		t.Fatalf("parsed input = %#v, err=%v", input, err)
	}

	var stderr strings.Builder
	refs, code := loadObjectRefs(
		objectReadCLI{},
		strings.NewReader("node:A\r\n\nrelationship:R\r\n"),
		false,
		&stderr,
	)
	if code != 0 || stderr.Len() != 0 ||
		len(refs) != 2 || refs[0] != "node:A" || refs[1] != "relationship:R" {
		t.Fatalf("stdin refs=%#v code=%d stderr=%q", refs, code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadObjectRefs(
		objectReadCLI{},
		strings.NewReader("node:A\nnode:A\n"),
		false,
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), "duplicate Object Ref") {
		t.Fatalf("duplicate stdin code=%d stderr=%q", code, stderr.String())
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "refs.txt")
	if err := os.WriteFile(path, []byte("domain:core\nnode:Person\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stderr.Reset()
	refs, code = loadObjectRefs(objectReadCLI{RefsFile: path}, strings.NewReader(""), true, &stderr)
	if code != 0 || len(refs) != 2 || refs[0] != "domain:core" || refs[1] != "node:Person" {
		t.Fatalf("file refs=%#v code=%d stderr=%q", refs, code, stderr.String())
	}
}

func TestObjectReadCLIRejectsInvalidOptionCombinationsAndSources(t *testing.T) {
	tooMany := make([]string, 0, 203)
	for index := 0; index < 101; index++ {
		tooMany = append(tooMany, "n:"+strconv.Itoa(index))
	}
	tooMany = append(tooMany, "--at", "branch/main")
	for _, args := range [][]string{
		{"n:1"},
		{"n:1", "--at", "branch/main", "--at", "branch/other"},
		{"--refs-file", "a", "--refs-file", "b", "--at", "branch/main"},
		{"n:1", "--at", "branch/main", "--body", "--body"},
		{"n:1", "--at", "branch/main", "--format", "toml", "--body"},
		{"n:1", "--at", "branch/main", "--format", "json", "--format", "json", "--body"},
		{"n:1", "--at", "branch/main", "--pretty", "--pretty"},
		{"n:1", "--at", "branch/main", "--wat"},
		tooMany,
	} {
		if _, err := parseObjectReadCLI(args); err == nil {
			t.Fatalf("parseObjectReadCLI(%q) unexpectedly succeeded", args)
		}
	}

	var stderr strings.Builder
	if _, code := loadObjectRefs(objectReadCLI{}, strings.NewReader(""), true, &stderr); code != 2 {
		t.Fatalf("TTY missing refs code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadObjectRefs(
		objectReadCLI{RefsFile: filepath.Join(t.TempDir(), "missing")},
		strings.NewReader(""),
		true,
		&stderr,
	); code != 2 {
		t.Fatalf("missing refs file code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadObjectRefs(
		objectReadCLI{Refs: []string{"n:01"}},
		strings.NewReader(""),
		true,
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), "INVALID_ARGUMENT") {
		t.Fatalf("invalid ref code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := readObjectRefsText(bytes.NewReader([]byte{0xff}), "refs stdin", &stderr); code != 2 {
		t.Fatalf("invalid UTF-8 code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if _, code := readObjectRefsText(strings.NewReader("n:1\rn:2\n"), "refs stdin", &stderr); code != 2 {
		t.Fatalf("bare CR code=%d stderr=%q", code, stderr.String())
	}
}

func TestObjectReadCLIFormatsBatchWithoutExtraReads(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	result := kernel.ObjectReadResult{
		State: state,
		Results: []kernel.ObjectReadItem{
			{Kind: kernel.KindDomain, Ref: "domain:A", Value: json.RawMessage(`{"name":"A","includes":[]}`)},
			{Kind: kernel.KindDomain, Ref: "domain:B", Value: json.RawMessage(`{"name":"B","includes":[]}`)},
		},
	}
	yamlBody, err := formatObjectReadCLI(result, objectReadCLI{Body: true, Format: "yaml"})
	if err != nil {
		t.Fatal(err)
	}
	want := "# kgos-state: " + state + "\n" +
		"--- # kgos-ref: domain:A\nname: \"A\"\nincludes: []\n" +
		"--- # kgos-ref: domain:B\nname: \"B\"\nincludes: []\n"
	if string(yamlBody) != want {
		t.Fatalf("YAML batch = %q, want %q", yamlBody, want)
	}
	jsonBody, err := formatObjectReadCLI(result, objectReadCLI{Body: true, Format: "json"})
	if err != nil {
		t.Fatal(err)
	}
	if string(jsonBody) != "[{\"name\":\"A\",\"includes\":[]},{\"name\":\"B\",\"includes\":[]}]\n" {
		t.Fatalf("JSON batch = %s", jsonBody)
	}
}

func TestObjectReadCLIFormatsSingleBodiesAndJSONPretty(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	result := kernel.ObjectReadResult{
		State: state,
		Results: []kernel.ObjectReadItem{{
			Kind:  kernel.KindDomain,
			Ref:   "domain:A",
			Value: json.RawMessage(`{"name":"A","includes":[]}`),
		}},
	}
	pretty, err := formatObjectReadCLI(result, objectReadCLI{Body: true, Format: "json", Pretty: true})
	if err != nil || !strings.Contains(string(pretty), "\n  \"name\": \"A\"") {
		t.Fatalf("pretty JSON = %q err=%v", pretty, err)
	}
	yamlBody, err := formatObjectReadCLI(result, objectReadCLI{Body: true, Format: "yaml"})
	if err != nil || string(yamlBody) != "name: \"A\"\nincludes: []\n" {
		t.Fatalf("single YAML = %q err=%v", yamlBody, err)
	}
	envelope, err := formatObjectReadCLI(result, objectReadCLI{Pretty: true})
	if err != nil || !strings.Contains(string(envelope), "\n  \"state\": ") {
		t.Fatalf("pretty envelope = %q err=%v", envelope, err)
	}
	if _, err := formatObjectReadCLI(result, objectReadCLI{Body: true, Format: "toml"}); err == nil {
		t.Fatal("unsupported Object body format unexpectedly succeeded")
	}
	if _, err := marshalCLIJSON(make(chan int), false); err == nil {
		t.Fatal("marshalCLIJSON channel unexpectedly succeeded")
	}
}

func TestRunObjectReadUsesOneBatchRequestAndNoPartialStdout(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	requests := 0
	configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/api/v1/object/read" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		var input kernel.ObjectReadRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		if input.At != state || len(input.Refs) != 2 {
			t.Fatalf("input = %#v", input)
		}
		_ = json.NewEncoder(w).Encode(kernel.ObjectReadResult{
			State: state,
			Results: []kernel.ObjectReadItem{
				{Kind: kernel.KindDomain, Ref: "domain:A", Value: json.RawMessage(`{"name":"A","includes":[]}`)},
				{Kind: kernel.KindDomain, Ref: "domain:B", Value: json.RawMessage(`{"name":"B","includes":[]}`)},
			},
		})
	}))
	var stdout, stderr strings.Builder
	code := runObjectRead(
		context.Background(),
		[]string{"domain:A", "domain:B", "--at", state},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	)
	if code != 0 || requests != 1 || stderr.Len() != 0 || !strings.Contains(stdout.String(), `"state":"`+state+`"`) {
		t.Fatalf("code=%d requests=%d stdout=%q stderr=%q", code, requests, stdout.String(), stderr.String())
	}

	requests = 0
	configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"code":"OBJECT_NOT_FOUND","message":"missing"}`)
	}))
	stdout.Reset()
	stderr.Reset()
	code = runObjectRead(
		context.Background(),
		[]string{"domain:A", "domain:missing", "--at", state},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	)
	if code != 1 || requests != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "OBJECT_NOT_FOUND") {
		t.Fatalf("failure code=%d requests=%d stdout=%q stderr=%q", code, requests, stdout.String(), stderr.String())
	}
}

func TestRunObjectPatchAcceptsInlineFileAndStdinAsOneRequest(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	patchText := "diff --git a/n:1 b/n:1\n"
	dir := t.TempDir()
	patchPath := filepath.Join(dir, "object.diff")
	if err := os.WriteFile(patchPath, []byte(patchText), 0o600); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name       string
		args       []string
		stdin      string
		stdinIsTTY bool
	}{
		{
			name:       "inline",
			args:       []string{"--base-state", state, "--branch", "main", "--patch", patchText},
			stdinIsTTY: true,
		},
		{
			name:       "file",
			args:       []string{"--base-state", state, "--branch", "main", "--patch-file", patchPath},
			stdinIsTTY: true,
		},
		{
			name:       "stdin",
			args:       []string{"--base-state", state, "--branch", "main"},
			stdin:      patchText,
			stdinIsTTY: false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			requests := 0
			configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				if r.URL.Path != "/api/v1/object/patch" {
					t.Fatalf("path = %s", r.URL.Path)
				}
				var input kernel.PatchRequest
				if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
					t.Fatal(err)
				}
				if input.BaseState != state || input.Branch != "main" || input.Patch != patchText {
					t.Fatalf("input = %#v", input)
				}
				_ = json.NewEncoder(w).Encode(kernel.PatchResult{
					State: state, Created: []kernel.CreatedObject{}, Transitions: []kernel.RefTransition{},
				})
			}))
			var stdout, stderr strings.Builder
			code := runObjectPatch(
				context.Background(),
				test.args,
				strings.NewReader(test.stdin),
				test.stdinIsTTY,
				&stdout,
				&stderr,
			)
			if code != 0 || requests != 1 || stderr.Len() != 0 ||
				!strings.Contains(stdout.String(), "\"state\":\""+state+"\"") {
				t.Fatalf(
					"code=%d requests=%d stdout=%q stderr=%q",
					code,
					requests,
					stdout.String(),
					stderr.String(),
				)
			}
		})
	}
}
