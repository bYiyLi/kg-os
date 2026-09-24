package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestEvolutionMergeCLIParsers(t *testing.T) {
	t.Parallel()
	start, err := parseEvolutionMergeStart([]string{
		"--branch", "main", "--source", "tag/release",
	})
	if err != nil || start.Branch != "main" || start.Source != "tag/release" {
		t.Fatalf("start = %#v err=%v", start, err)
	}
	conflicts, err := parseEvolutionMergeConflicts([]string{
		"merge-session/x", "--limit", "2", "--cursor", "next",
	})
	if err != nil || conflicts.Session != "merge-session/x" ||
		conflicts.Limit != 2 || conflicts.Cursor != "next" {
		t.Fatalf("conflicts = %#v err=%v", conflicts, err)
	}
	finalize, err := parseEvolutionMergeFinalize([]string{
		"merge-session/x", "--expected-revision", "3",
		"--author", "agent", "--message", "merge",
	})
	if err != nil || finalize.ExpectedRevision != 3 ||
		finalize.Author == nil || *finalize.Author != "agent" ||
		finalize.Message == nil || *finalize.Message != "merge" {
		t.Fatalf("finalize = %#v err=%v", finalize, err)
	}
	abort, err := parseEvolutionMergeAbort([]string{
		"merge-session/x", "--expected-revision", "4",
	})
	if err != nil || abort.ExpectedRevision != 4 {
		t.Fatalf("abort = %#v err=%v", abort, err)
	}
}

func TestEvolutionMergeCLIResolutionSources(t *testing.T) {
	t.Parallel()
	inline := `[{"conflictId":"c1","choice":"ours"}]`
	request, err := parseEvolutionMergeResolve(
		[]string{"merge-session/x", "--expected-revision", "2", "--resolutions", inline},
		nil,
		true,
	)
	if err != nil || request.ExpectedRevision != 2 || len(request.Resolutions) != 1 ||
		request.Resolutions[0].ConflictID != "c1" || request.Resolutions[0].Choice != "ours" {
		t.Fatalf("inline resolve = %#v err=%v", request, err)
	}

	valueRequest, err := parseEvolutionMergeResolve(
		[]string{"merge-session/x", "--expected-revision", "2"},
		strings.NewReader(`[{"conflictId":"c1","choice":"value","value":null}]`),
		false,
	)
	if err != nil || len(valueRequest.Resolutions) != 1 ||
		string(valueRequest.Resolutions[0].Value) != "null" {
		t.Fatalf("stdin value resolve = %#v err=%v", valueRequest, err)
	}

	path := filepath.Join(t.TempDir(), "resolutions.json")
	if err := os.WriteFile(path, []byte(inline), 0o600); err != nil {
		t.Fatalf("write resolutions file: %v", err)
	}
	fromFile, err := parseEvolutionMergeResolve(
		[]string{"merge-session/x", "--expected-revision", "2", "--resolutions-file", path},
		nil,
		true,
	)
	if err != nil || len(fromFile.Resolutions) != 1 {
		t.Fatalf("file resolve = %#v err=%v", fromFile, err)
	}
}

func TestEvolutionMergeCLIRejectsInvalidInputs(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{
		{},
		{"--branch", "main"},
		{"--source", "branch/side"},
		{"--branch", "main", "--source", "branch/side", "--branch", "other"},
		{"--branch", "main", "--source", "branch/side", "--unknown", "x"},
	} {
		if _, err := parseEvolutionMergeStart(args); err == nil {
			t.Fatalf("start args %#v were accepted", args)
		}
	}
	for _, args := range [][]string{
		{},
		{"--limit", "1"},
		{"merge-session/x", "--limit", "0"},
		{"merge-session/x", "--unknown"},
	} {
		if _, err := parseEvolutionMergeConflicts(args); err == nil {
			t.Fatalf("conflicts args %#v were accepted", args)
		}
	}
	for _, args := range [][]string{
		{},
		{"merge-session/x"},
		{"merge-session/x", "--expected-revision", "0", "--resolutions", "[]"},
		{"merge-session/x", "--expected-revision"},
		{"merge-session/x", "--expected-revision", "1"},
		{"merge-session/x", "--expected-revision", "1", "--expected-revision", "2", "--resolutions", "[]"},
		{"merge-session/x", "--expected-revision", "1", "--resolutions", "{}"},
		{"merge-session/x", "--expected-revision", "1", "--resolutions"},
		{"merge-session/x", "--expected-revision", "1", "--resolutions-file"},
		{"merge-session/x", "--expected-revision", "1", "--resolutions", "[]", "--resolutions-file", "x"},
		{"merge-session/x", "--expected-revision", "1", "--unknown", "x"},
	} {
		if _, err := parseEvolutionMergeResolve(args, strings.NewReader(""), true); err == nil {
			t.Fatalf("resolve args %#v were accepted", args)
		}
	}
	if _, err := parseEvolutionMergeResolve(
		[]string{"merge-session/x", "--expected-revision", "1"},
		strings.NewReader(strings.Repeat(" ", maxEvolutionCLIInputBytes+1)),
		false,
	); err == nil || kernel.AsPublicError(err).Code != kernel.CodeResource {
		t.Fatalf("oversized resolve stdin error = %v", err)
	}
	if _, err := parseEvolutionMergeResolve(
		[]string{
			"merge-session/x", "--expected-revision", "1",
			"--resolutions", `[{"conflictId":"c","choice":"ours","extra":1}]`,
		},
		nil,
		true,
	); err == nil || kernel.AsPublicError(err).Code != kernel.CodeParse {
		t.Fatalf("resolution unknown-field error = %v", err)
	}
	for _, args := range [][]string{
		{},
		{"merge-session/x"},
		{"merge-session/x", "--expected-revision", "-1"},
		{"merge-session/x", "--expected-revision"},
		{"merge-session/x", "--expected-revision", "1", "--expected-revision", "2"},
		{"merge-session/x", "--expected-revision", "1", "--author"},
		{"merge-session/x", "--expected-revision", "1", "--author", "a", "--author", "b"},
		{"merge-session/x", "--expected-revision", "1", "--message"},
		{"merge-session/x", "--expected-revision", "1", "--message", "a", "--message", "b"},
		{"merge-session/x", "--expected-revision", "1", "--unknown"},
	} {
		if _, err := parseEvolutionMergeFinalize(args); err == nil {
			t.Fatalf("finalize args %#v were accepted", args)
		}
	}
	for _, args := range [][]string{
		{},
		{"merge-session/x"},
		{"merge-session/x", "--expected-revision", "0"},
		{"merge-session/x", "--expected-revision", "1", "--other", "x"},
	} {
		if _, err := parseEvolutionMergeAbort(args); err == nil {
			t.Fatalf("abort args %#v were accepted", args)
		}
	}
}

func TestRunEvolutionMergeUsageBranches(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{
		{},
		{"unknown"},
		{"start"},
		{"list", "--limit", "0"},
		{"get"},
		{"conflicts"},
		{"resolve"},
		{"finalize"},
		{"abort"},
	} {
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		code := runEvolutionMerge(
			context.Background(),
			args,
			strings.NewReader(""),
			true,
			false,
			&stdout,
			&stderr,
		)
		if code != 2 || stdout.Len() != 0 ||
			!strings.Contains(stderr.String(), string(kernel.CodeInvalidArgument)) {
			t.Fatalf("args=%#v exit=%d stdout=%q stderr=%q", args, code, stdout.String(), stderr.String())
		}
	}
}

func TestMergeResolutionInputFailureBranches(t *testing.T) {
	t.Parallel()
	input := mergeResolutionsCLI{}
	if _, handled, err := parseMergeResolutionsOption(
		[]string{"--other"}, 0, &input,
	); handled || err != nil {
		t.Fatalf("unknown resolutions option handled=%v err=%v", handled, err)
	}
	if _, handled, err := parseMergeResolutionsOption(
		[]string{"--resolutions", "[]"}, 0, &input,
	); !handled || err != nil || !input.inlineSet {
		t.Fatalf("inline resolutions handled=%v input=%#v err=%v", handled, input, err)
	}
	if _, _, err := parseMergeResolutionsOption(
		[]string{"--resolutions", "[]"}, 0, &input,
	); err == nil {
		t.Fatal("duplicate inline resolutions accepted")
	}
	fileInput := mergeResolutionsCLI{}
	if _, handled, err := parseMergeResolutionsOption(
		[]string{"--resolutions-file", "x"}, 0, &fileInput,
	); !handled || err != nil || !fileInput.fileSet {
		t.Fatalf("file resolutions handled=%v input=%#v err=%v", handled, fileInput, err)
	}
	if _, _, err := parseMergeResolutionsOption(
		[]string{"--resolutions-file", "y"}, 0, &fileInput,
	); err == nil {
		t.Fatal("duplicate resolutions file accepted")
	}
	if _, err := loadMergeResolutionsJSON(
		mergeResolutionsCLI{File: "missing-phase07-resolutions", fileSet: true},
		nil,
		true,
	); err == nil || kernel.AsPublicError(err).Code != kernel.CodeIO {
		t.Fatalf("missing resolutions file error = %v", err)
	}
	if _, err := loadMergeResolutionsJSON(
		mergeResolutionsCLI{},
		errorReader{},
		false,
	); err == nil || kernel.AsPublicError(err).Code != kernel.CodeIO {
		t.Fatalf("resolutions read error = %v", err)
	}
	if _, err := loadMergeResolutionsJSON(
		mergeResolutionsCLI{},
		strings.NewReader(""),
		true,
	); err == nil {
		t.Fatal("TTY resolutions without explicit source accepted")
	}
	for _, raw := range []string{"", "{", "{}", "null"} {
		if _, err := loadMergeResolutionsJSON(
			mergeResolutionsCLI{Inline: raw, inlineSet: true},
			nil,
			true,
		); err == nil || kernel.AsPublicError(err).Code != kernel.CodeParse {
			t.Fatalf("invalid inline resolutions %q error = %v", raw, err)
		}
	}
	if _, handled, err := parseMergeResolutionsOption(
		[]string{"--resolutions"}, 0, &mergeResolutionsCLI{},
	); !handled || err == nil {
		t.Fatalf("missing inline resolutions handled=%v err=%v", handled, err)
	}
	if _, handled, err := parseMergeResolutionsOption(
		[]string{"--resolutions-file"}, 0, &mergeResolutionsCLI{},
	); !handled || err == nil {
		t.Fatalf("missing resolutions file handled=%v err=%v", handled, err)
	}
}

type errorReader struct{}

func (errorReader) Read([]byte) (int, error) { return 0, errors.New("read failed") }

var _ io.Reader = errorReader{}
