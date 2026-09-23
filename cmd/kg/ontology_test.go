package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("read failed") }

func TestParseOntologyReadCLIRejectsDuplicateRefs(t *testing.T) {
	t.Parallel()
	_, err := parseOntologyReadCLI([]string{
		"node:Doc",
		"node:Doc",
		"--at",
		"branch/main",
		"--edit",
	})
	if err == nil || !strings.Contains(err.Error(), "duplicate Ontology Ref") {
		t.Fatalf("duplicate Ref error = %v", err)
	}
}

func TestReadPatchTextRejectsInvalidUTF8AndOversize(t *testing.T) {
	t.Parallel()
	var stderr strings.Builder
	if _, code := readPatchText(bytes.NewReader([]byte{0xff}), "patch stdin", &stderr); code != 2 {
		t.Fatalf("invalid UTF-8 exit = %d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), string(kernel.CodeParse)) {
		t.Fatalf("invalid UTF-8 stderr=%q", stderr.String())
	}
	stderr.Reset()
	oversize := bytes.Repeat([]byte{'x'}, (16<<20)+1)
	if _, code := readPatchText(bytes.NewReader(oversize), "patch file", &stderr); code != 2 {
		t.Fatalf("oversize exit = %d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), string(kernel.CodeResource)) {
		t.Fatalf("oversize stderr=%q", stderr.String())
	}
}

func TestParseOntologyReadCLIMatrix(t *testing.T) {
	t.Parallel()
	valid, err := parseOntologyReadCLI([]string{"node:A", "--at", "branch/main", "--limit", "2", "--cursor", "c"})
	if err != nil || valid.At != "branch/main" || valid.Limit != 2 || valid.Cursor != "c" || len(valid.Refs) != 1 {
		t.Fatalf("valid read parse = %#v err=%v", valid, err)
	}
	tooMany := make([]string, 101)
	for i := range tooMany {
		tooMany[i] = "node:" + strconv.Itoa(i)
	}
	tooMany = append(tooMany, "--at", "branch/main")
	tests := [][]string{
		{},
		{"--at"},
		{"--at", "a", "--at", "b"},
		{"--at", "a", "--limit"},
		{"--at", "a", "--limit", "0"},
		{"--at", "a", "--limit", "x"},
		{"--at", "a", "--cursor"},
		{"--at", "a", "--cursor", "x", "--cursor", "y"},
		{"--at", "a", "--edit", "--edit"},
		{"--at", "a", "--pretty"},
		{"--at", "a", "--unknown"},
		{"node:A", "--at", "a", "--edit", "--limit", "1"},
		{"node:A", "node:B", "--at", "a", "--cursor", "c"},
		tooMany,
	}
	for _, args := range tests {
		if _, err := parseOntologyReadCLI(args); err == nil {
			t.Errorf("parseOntologyReadCLI(%q) unexpectedly succeeded", args)
		}
	}
}

func TestParseOntologyPatchCLIMatrix(t *testing.T) {
	t.Parallel()
	valid, err := parseOntologyPatchCLI([]string{
		"--base-state", "commit/" + strings.Repeat("a", 64),
		"--branch", "main",
		"--patch", "diff",
		"--author", "A",
		"--message", "M",
	})
	if err != nil || valid.Branch != "main" || valid.Patch != "diff" || valid.Author == nil || valid.Message == nil {
		t.Fatalf("valid patch parse = %#v err=%v", valid, err)
	}
	tests := [][]string{
		{},
		{"--base-state"},
		{"--base-state", "a", "--base-state", "b", "--branch", "main"},
		{"--base-state", "a", "--branch"},
		{"--base-state", "a", "--branch", "main", "--branch", "other"},
		{"--base-state", "a", "--branch", "main", "--patch"},
		{"--base-state", "a", "--branch", "main", "--patch", "a", "--patch", "b"},
		{"--base-state", "a", "--branch", "main", "--patch-file"},
		{"--base-state", "a", "--branch", "main", "--patch-file", "a", "--patch-file", "b"},
		{"--base-state", "a", "--branch", "main", "--author"},
		{"--base-state", "a", "--branch", "main", "--author", "a", "--author", "b"},
		{"--base-state", "a", "--branch", "main", "--message"},
		{"--base-state", "a", "--branch", "main", "--message", "a", "--message", "b"},
		{"--base-state", "a", "--branch", "main", "--wat"},
		{"--branch", "main"},
		{"--base-state", "a"},
		{"--base-state", "a", "--branch", "main", "--patch", "a", "--patch-file", "b"},
	}
	for _, args := range tests {
		if _, err := parseOntologyPatchCLI(args); err == nil {
			t.Errorf("parseOntologyPatchCLI(%q) unexpectedly succeeded", args)
		}
	}
}

func TestLoadPatchPayloadSources(t *testing.T) {
	t.Parallel()
	var stderr strings.Builder
	text, code := loadPatchPayload(ontologyPatchCLI{Patch: "diff"}, strings.NewReader(""), true, &stderr)
	if code != 0 || text != "diff" {
		t.Fatalf("inline patch = %q code=%d stderr=%q", text, code, stderr.String())
	}
	stderr.Reset()
	invalid := string([]byte{0xff})
	if _, code := loadPatchPayload(ontologyPatchCLI{Patch: invalid}, strings.NewReader(""), true, &stderr); code != 2 {
		t.Fatalf("invalid inline patch code=%d", code)
	}
	stderr.Reset()
	if _, code := loadPatchPayload(ontologyPatchCLI{}, strings.NewReader(""), true, &stderr); code != 2 {
		t.Fatalf("TTY without patch code=%d", code)
	}
	stderr.Reset()
	text, code = loadPatchPayload(ontologyPatchCLI{}, strings.NewReader("stdin patch"), false, &stderr)
	if code != 0 || text != "stdin patch" {
		t.Fatalf("stdin patch = %q code=%d stderr=%q", text, code, stderr.String())
	}
	tmp := t.TempDir()
	path := filepath.Join(tmp, "patch.diff")
	if err := os.WriteFile(path, []byte("file patch"), 0o600); err != nil {
		t.Fatal(err)
	}
	stderr.Reset()
	text, code = loadPatchPayload(ontologyPatchCLI{PatchFile: path}, strings.NewReader(""), true, &stderr)
	if code != 0 || text != "file patch" {
		t.Fatalf("file patch = %q code=%d stderr=%q", text, code, stderr.String())
	}
	stderr.Reset()
	if _, code := loadPatchPayload(ontologyPatchCLI{PatchFile: filepath.Join(tmp, "missing")}, strings.NewReader(""), true, &stderr); code != 2 {
		t.Fatalf("missing patch file code=%d", code)
	}
	stderr.Reset()
	if _, code := readPatchText(failingReader{}, "patch stdin", &stderr); code != 2 {
		t.Fatalf("failing reader code=%d", code)
	}
}

func TestOntologyFormattingHelpers(t *testing.T) {
	t.Parallel()
	state := "commit/" + strings.Repeat("a", 64)
	if _, err := formatOntologyCLIRead(kernel.OntologyReadResult{}); err == nil {
		t.Fatal("empty result must fail")
	}
	if _, err := formatOntologyCLIRead(kernel.OntologyReadResult{
		State: state, Results: []kernel.OntologyReadItem{{Kind: "overview"}},
	}); err == nil {
		t.Fatal("single empty markdown must fail")
	}
	single, err := formatOntologyCLIRead(kernel.OntologyReadResult{
		State: state, Results: []kernel.OntologyReadItem{{Kind: "overview", Markdown: "# One\n"}},
	})
	if err != nil || single != "# One\n" {
		t.Fatalf("single format = %q err=%v", single, err)
	}
	batch, err := formatOntologyCLIRead(kernel.OntologyReadResult{
		State: state,
		Results: []kernel.OntologyReadItem{
			{Kind: "overview", Markdown: "---\nstate: x\n---\n# Overview\n", Total: 2, Cursor: "next"},
			{Ref: "node:A", Kind: "node-definition", Markdown: "# A\n"},
		},
	})
	if err != nil || !strings.Contains(batch, "kind: \"batch\"") ||
		!strings.Contains(batch, "# Overview") || !strings.Contains(batch, "node:A") {
		t.Fatalf("batch format = %q err=%v", batch, err)
	}
	if _, err := formatOntologyCLIRead(kernel.OntologyReadResult{
		State: state,
		Results: []kernel.OntologyReadItem{
			{Kind: "overview", Markdown: "# ok\n"},
			{Kind: "node-definition", Markdown: ""},
		},
	}); err == nil {
		t.Fatal("batch empty body must fail")
	}
	if got := stripMarkdownFrontMatter("plain"); got != "plain" {
		t.Fatalf("plain strip = %q", got)
	}
	if got := stripMarkdownFrontMatter("---\nmissing"); got != "---\nmissing" {
		t.Fatalf("unterminated strip = %q", got)
	}
	if !isResolvedState(state) || isResolvedState("commit/"+strings.Repeat("A", 64)) || isResolvedState("branch/main") {
		t.Fatal("resolved state validation mismatch")
	}
	if !hasHelp([]string{"x", "-h"}) || hasHelp([]string{"x"}) {
		t.Fatal("help detection mismatch")
	}
}

func TestDoAPIRequestResponseMapping(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token" || r.Header.Get("Accept") != "application/json" {
			t.Fatalf("headers = %#v", r.Header)
		}
		w.Header().Set("X-Test", "ok")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer server.Close()
	body, headers, public, err := doAPIRequest(
		context.Background(), server.URL, "token", "/x", "application/json", map[string]any{"a": 1},
	)
	if err != nil || public != nil || string(body) != `{"ok":true}` || headers.Get("X-Test") != "ok" {
		t.Fatalf("success body=%q headers=%v public=%v err=%v", body, headers, public, err)
	}

	errorServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = io.WriteString(w, `{"code":"OBJECT_CONFLICT","message":"conflict"}`)
	}))
	defer errorServer.Close()
	_, _, public, err = doAPIRequest(context.Background(), errorServer.URL, "token", "/x", "application/json", nil)
	if err != nil || public == nil || public.Code != kernel.CodeObjectConflict {
		t.Fatalf("public error = %#v err=%v", public, err)
	}

	malformed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{}`)
	}))
	defer malformed.Close()
	if _, _, _, err := doAPIRequest(context.Background(), malformed.URL, "token", "/x", "application/json", nil); err == nil {
		t.Fatal("malformed daemon error must fail")
	}
	if _, _, _, err := doAPIRequest(context.Background(), "://bad", "token", "/x", "application/json", nil); err == nil {
		t.Fatal("bad endpoint must fail")
	}
}

func TestRunOntologyLocalFailuresAndHelp(t *testing.T) {
	t.Setenv("KG_TOKEN", "")
	var stdout, stderr strings.Builder
	if code := runOntology(context.Background(), []string{"--help"}, strings.NewReader(""), true, &stdout, &stderr); code != 0 ||
		!strings.Contains(stdout.String(), "Ontology") {
		t.Fatalf("help code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runOntology(context.Background(), []string{"--at", "branch/main"}, strings.NewReader(""), true, &stdout, &stderr); code != 2 {
		t.Fatalf("missing token read code=%d stderr=%q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runOntology(context.Background(), []string{"node:A", "--at", "branch/main", "--edit"}, strings.NewReader(""), true, &stdout, &stderr); code != 2 {
		t.Fatalf("unresolved edit code=%d stderr=%q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runOntology(context.Background(), []string{"patch", "--base-state", "bad", "--branch", "main", "--patch", "x"}, strings.NewReader(""), true, &stdout, &stderr); code != 2 {
		t.Fatalf("bad patch state code=%d stderr=%q", code, stderr.String())
	}
}

func TestNextCLIValueAndErrorWriter(t *testing.T) {
	t.Parallel()
	value, next, err := nextCLIValue([]string{"--x", "v"}, 0, "--x")
	if err != nil || value != "v" || next != 1 {
		t.Fatalf("next value = %q %d %v", value, next, err)
	}
	if _, _, err := nextCLIValue([]string{"--x"}, 0, "--x"); err == nil {
		t.Fatal("missing value must fail")
	}
	if _, _, err := nextCLIValue([]string{"--x", "--y"}, 0, "--x"); err == nil {
		t.Fatal("option-looking value must fail")
	}
	var stderr strings.Builder
	if code := writeLocalCLIError(&stderr, kernel.CodeInvalidArgument, "bad", 2); code != 2 ||
		!strings.Contains(stderr.String(), "INVALID_ARGUMENT") {
		t.Fatalf("error writer code=%d stderr=%q", code, stderr.String())
	}
}

func configureFakeCLIDaemon(t *testing.T, handler http.Handler) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	home := t.TempDir()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = lock.Close() })
	if err := lock.PublishEndpoint(server.URL); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KG_HOME", home)
	t.Setenv("KG_TOKEN", "token")
}

func TestRunOntologyReadAdapterFailures(t *testing.T) {
	t.Run("public error", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusConflict)
			_, _ = io.WriteString(w, `{"code":"OBJECT_CONFLICT","message":"conflict"}`)
		}))
		var stdout, stderr strings.Builder
		code := runOntologyRead(context.Background(), ontologyReadCLI{At: "branch/main"}, &stdout, &stderr)
		if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "OBJECT_CONFLICT") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, "not-json")
		}))
		var stdout, stderr strings.Builder
		code := runOntologyRead(context.Background(), ontologyReadCLI{At: "branch/main"}, &stdout, &stderr)
		if code != 3 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("invalid logical response", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `{"state":"commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","results":[]}`)
		}))
		var stdout, stderr strings.Builder
		code := runOntologyRead(context.Background(), ontologyReadCLI{At: "branch/main"}, &stdout, &stderr)
		if code != 3 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
}

func TestRunOntologyEditBatchAndFailures(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	t.Run("batch framing", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var input kernel.ObjectReadRequest
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatal(err)
			}
			if len(input.Refs) != 2 {
				t.Fatalf("refs = %#v", input.Refs)
			}
			_ = json.NewEncoder(w).Encode(kernel.ObjectReadResult{
				State: input.At,
				Results: []kernel.ObjectReadItem{
					{Kind: kernel.KindDomain, Ref: input.Refs[0], Value: json.RawMessage(`{"name":"A","includes":[]}`)},
					{Kind: kernel.KindDomain, Ref: input.Refs[1], Value: json.RawMessage(`{"name":"B","includes":[]}`)},
				},
			})
		}))
		var stdout, stderr strings.Builder
		code := runOntologyEdit(
			context.Background(),
			ontologyReadCLI{At: state, Refs: []string{"domain:A", "domain:B"}, Edit: true},
			&stdout,
			&stderr,
		)
		if code != 0 || stderr.Len() != 0 ||
			!strings.Contains(stdout.String(), "# kgos-state: "+state) ||
			!strings.Contains(stdout.String(), "--- # kgos-ref: domain:A") ||
			!strings.Contains(stdout.String(), "--- # kgos-ref: domain:B") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("metadata mismatch", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_ = json.NewEncoder(w).Encode(kernel.ObjectReadResult{
				State: state,
				Results: []kernel.ObjectReadItem{
					{Kind: kernel.KindDomain, Ref: "domain:Other", Value: json.RawMessage(`{"name":"A","includes":[]}`)},
				},
			})
		}))
		var stdout, stderr strings.Builder
		code := runOntologyEdit(
			context.Background(),
			ontologyReadCLI{At: state, Refs: []string{"domain:A"}, Edit: true},
			&stdout,
			&stderr,
		)
		if code != 3 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeIO)) {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("public error", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = io.WriteString(w, `{"code":"OBJECT_NOT_FOUND","message":"missing"}`)
		}))
		var stdout, stderr strings.Builder
		code := runOntologyEdit(
			context.Background(),
			ontologyReadCLI{At: state, Refs: []string{"domain:A"}, Edit: true},
			&stdout,
			&stderr,
		)
		if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "OBJECT_NOT_FOUND") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})
}

func TestRunOntologyPatchAdapterFailures(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	t.Run("public error", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusConflict)
			_, _ = io.WriteString(w, `{"code":"STALE_BASE_STATE","message":"stale"}`)
		}))
		var stdout, stderr strings.Builder
		code := runOntologyPatch(
			context.Background(),
			[]string{"--base-state", state, "--branch", "main", "--patch", "diff"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		)
		if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "STALE_BASE_STATE") {
			t.Fatalf("code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, "bad")
		}))
		var stdout, stderr strings.Builder
		code := runOntologyPatch(
			context.Background(),
			[]string{"--base-state", state, "--branch", "main", "--patch", "diff"},
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

func TestStdinIsTerminalRegularFile(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "stdin")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if stdinIsTerminal(file) {
		t.Fatal("regular file reported as terminal")
	}
}

func configureCLIEndpoint(t *testing.T, endpoint string) {
	t.Helper()
	home := t.TempDir()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = lock.Close() })
	if err := lock.PublishEndpoint(endpoint); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KG_HOME", home)
	t.Setenv("KG_TOKEN", "token")
}

func TestRunOntologyRemainingLocalBranches(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)

	t.Run("dispatcher parse error", func(t *testing.T) {
		var stdout, stderr strings.Builder
		if code := runOntology(
			context.Background(), []string{"--unknown"}, strings.NewReader(""), true, &stdout, &stderr,
		); code != 2 {
			t.Fatalf("code=%d stderr=%q", code, stderr.String())
		}
	})

	t.Run("edit requires refs", func(t *testing.T) {
		var stdout, stderr strings.Builder
		if code := runOntologyEdit(
			context.Background(), ontologyReadCLI{At: state, Edit: true}, &stdout, &stderr,
		); code != 2 {
			t.Fatalf("code=%d stderr=%q", code, stderr.String())
		}
	})

	t.Run("inactive daemon", func(t *testing.T) {
		home := t.TempDir()
		t.Setenv("KG_HOME", home)
		t.Setenv("KG_TOKEN", "token")
		var stdout, stderr strings.Builder
		if code := runOntologyEdit(
			context.Background(),
			ontologyReadCLI{At: state, Refs: []string{"domain:A"}, Edit: true},
			&stdout,
			&stderr,
		); code != 2 {
			t.Fatalf("edit code=%d stderr=%q", code, stderr.String())
		}
		stdout.Reset()
		stderr.Reset()
		if code := runOntologyPatch(
			context.Background(),
			[]string{"--base-state", state, "--branch", "main", "--patch", "diff"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		); code != 2 {
			t.Fatalf("patch code=%d stderr=%q", code, stderr.String())
		}
	})

	t.Run("patch parse error", func(t *testing.T) {
		var stdout, stderr strings.Builder
		if code := runOntologyPatch(
			context.Background(), nil, strings.NewReader(""), true, &stdout, &stderr,
		); code != 2 {
			t.Fatalf("code=%d stderr=%q", code, stderr.String())
		}
	})

	t.Run("patch missing payload", func(t *testing.T) {
		var stdout, stderr strings.Builder
		if code := runOntologyPatch(
			context.Background(),
			[]string{"--base-state", state, "--branch", "main"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		); code != 2 {
			t.Fatalf("code=%d stderr=%q", code, stderr.String())
		}
	})

	t.Run("unavailable runtime", func(t *testing.T) {
		configureCLIEndpoint(t, "http://127.0.0.1:1")
		var stdout, stderr strings.Builder
		if code := runOntologyEdit(
			context.Background(),
			ontologyReadCLI{At: state, Refs: []string{"domain:A"}, Edit: true},
			&stdout,
			&stderr,
		); code != 2 {
			t.Fatalf("edit code=%d stderr=%q", code, stderr.String())
		}
		stdout.Reset()
		stderr.Reset()
		if code := runOntologyPatch(
			context.Background(),
			[]string{"--base-state", state, "--branch", "main", "--patch", "diff"},
			strings.NewReader(""),
			true,
			&stdout,
			&stderr,
		); code != 2 {
			t.Fatalf("patch code=%d stderr=%q", code, stderr.String())
		}
	})

	t.Run("inline patch oversize", func(t *testing.T) {
		var stderr strings.Builder
		_, code := loadPatchPayload(
			ontologyPatchCLI{Patch: strings.Repeat("x", (16<<20)+1)},
			strings.NewReader(""),
			true,
			&stderr,
		)
		if code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeResource)) {
			t.Fatalf("code=%d stderr=%q", code, stderr.String())
		}
	})
}

func TestDoAPIRequestRemainingFailures(t *testing.T) {
	t.Parallel()
	if _, _, _, err := doAPIRequest(
		context.Background(),
		"http://127.0.0.1",
		"token",
		"/x",
		"application/json",
		map[string]any{"bad": make(chan int)},
	); err == nil {
		t.Fatal("unmarshalable input unexpectedly succeeded")
	}
	if _, _, _, err := doAPIRequest(
		context.Background(),
		"http://127.0.0.1:1",
		"token",
		"/x",
		"application/json",
		nil,
	); err == nil {
		t.Fatal("closed endpoint unexpectedly succeeded")
	}
	large := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(bytes.Repeat([]byte{'x'}, (16<<20)+1))
	}))
	defer large.Close()
	if _, _, _, err := doAPIRequest(
		context.Background(),
		large.URL,
		"token",
		"/x",
		"application/json",
		nil,
	); err == nil || !strings.Contains(err.Error(), "resource limit") {
		t.Fatalf("oversize response error = %v", err)
	}
}
