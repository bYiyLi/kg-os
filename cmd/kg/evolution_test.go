package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestEvolutionCLIStateDataInputContract(t *testing.T) {
	t.Parallel()
	created, err := parseEvolutionStateCreate([]string{"--branch", "main", "--data", "null"})
	if err != nil || created.Branch != "main" || string(created.Data) != "null" {
		t.Fatalf("state create = %#v err=%v", created, err)
	}
	created, err = parseEvolutionStateCreate([]string{"--branch", "main"})
	if err != nil || created.Data != nil {
		t.Fatalf("state create without data = %#v err=%v", created, err)
	}
	if _, err := parseEvolutionStateCreate([]string{"--branch", "main", "--data", ""}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeParse {
		t.Fatalf("empty inline data error = %v", err)
	}
	if _, err := parseEvolutionStateCreate([]string{"--branch", "main", "--data", "null", "--data-file", "x"}); err == nil {
		t.Fatal("duplicate data sources were accepted")
	}

	set, err := parseEvolutionStateSetData(
		[]string{"branch/main"}, strings.NewReader(" null \n"), false,
	)
	if err != nil || set.State != "branch/main" || string(set.Data) != "null" {
		t.Fatalf("stdin set-data = %#v err=%v", set, err)
	}
	if _, err := parseEvolutionStateSetData([]string{"branch/main"}, strings.NewReader(""), true); err == nil {
		t.Fatal("TTY set-data without explicit source was accepted")
	}
	if _, err := parseEvolutionStateSetData([]string{"branch/main", "--data-file", "missing-phase06-file"}, nil, true); err == nil || kernel.AsPublicError(err).Code != kernel.CodeIO {
		t.Fatalf("missing data file error = %v", err)
	}
	dataFile := filepath.Join(t.TempDir(), "data.json")
	if err := os.WriteFile(dataFile, []byte(" null \n"), 0o600); err != nil {
		t.Fatalf("write data file: %v", err)
	}
	fromFile, err := parseEvolutionStateCreate([]string{"--branch", "main", "--data-file", dataFile})
	if err != nil || string(fromFile.Data) != "null" {
		t.Fatalf("data-file create = %#v err=%v", fromFile, err)
	}
	if _, err := parseEvolutionStateSetData(
		[]string{"branch/main"},
		strings.NewReader(strings.Repeat(" ", maxEvolutionCLIInputBytes+1)),
		false,
	); err == nil || kernel.AsPublicError(err).Code != kernel.CodeResource {
		t.Fatalf("oversized stdin error = %v", err)
	}
}

func TestEvolutionCLIReadParsingAndNoMergeCommand(t *testing.T) {
	t.Parallel()
	diff, err := parseEvolutionDiff([]string{
		"--before", "branch/main", "--after", "tag/release", "--scope", "object",
		"--object-ref", "node:Doc", "--anchor-state", "branch/main", "--limit", "2", "--cursor", "next",
	})
	if err != nil || diff.Scope != "object" || diff.Object == nil || diff.Object.Ref != "node:Doc" ||
		diff.Limit != 2 || diff.Cursor != "next" {
		t.Fatalf("diff parse = %#v err=%v", diff, err)
	}
	if _, err := parseEvolutionHistory([]string{"branch/main", "--scope", "all", "--object-ref", "node:Doc"}); err == nil {
		t.Fatal("non-object history accepted object filter")
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := runEvolution(context.Background(), []string{"merge", "start"}, strings.NewReader(""), true, &stdout, &stderr)
	if code != 2 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeInvalidArgument)) {
		t.Fatalf("merge command exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	help := evolutionHelp(localeEnglish)
	if strings.Contains(help, "merge") {
		t.Fatalf("Phase 06 help exposes Merge: %q", help)
	}
}

func TestEvolutionCLIJSONFormatting(t *testing.T) {
	t.Parallel()
	compact, err := formatEvolutionJSON([]byte(" { \"state\" : \"x\" } \n"), false)
	if err != nil || string(compact) != "{\"state\":\"x\"}\n" {
		t.Fatalf("compact = %q err=%v", compact, err)
	}
	pretty, err := formatEvolutionJSON([]byte("{\"state\":\"x\"}"), true)
	if err != nil || !strings.Contains(string(pretty), "\n  \"state\"") || pretty[len(pretty)-1] != '\n' {
		t.Fatalf("pretty = %q err=%v", pretty, err)
	}
}

func TestEvolutionCLIParsersCoverBoundaries(t *testing.T) {
	t.Parallel()
	ancestry, err := parseEvolutionAncestry([]string{"branch/main", "--limit", "2", "--cursor", "next"})
	if err != nil || ancestry.Root != "branch/main" || ancestry.Limit != 2 || ancestry.Cursor != "next" {
		t.Fatalf("ancestry parse = %#v err=%v", ancestry, err)
	}
	for _, args := range [][]string{
		{},
		{"--limit", "1"},
		{"branch/main", "--limit", "0"},
		{"branch/main", "--limit", "1001"},
		{"branch/main", "--limit", "x"},
		{"branch/main", "--limit", "1", "--limit", "2"},
		{"branch/main", "--cursor", "a", "--cursor", "b"},
		{"branch/main", "--unknown"},
	} {
		if _, err := parseEvolutionAncestry(args); err == nil {
			t.Fatalf("ancestry args %#v were accepted", args)
		}
	}

	if _, err := parseEvolutionHistory([]string{"branch/main", "--scope", "object", "--object-ref", "node:Doc"}); err == nil {
		t.Fatal("object history without anchor was accepted")
	}
	if _, err := parseEvolutionHistory([]string{"branch/main", "--scope", "bad"}); err == nil {
		t.Fatal("invalid history scope was accepted")
	}
	if _, err := parseEvolutionDiff([]string{"--before", "branch/main", "--scope", "all"}); err == nil {
		t.Fatal("diff without --after was accepted")
	}
	if _, err := parseEvolutionDiff([]string{"--before", "branch/main", "--before", "tag/x", "--after", "tag/y", "--scope", "all"}); err == nil {
		t.Fatal("duplicate --before was accepted")
	}

	if _, err := parseSingleNamedOption([]string{"--from", "branch/main", "--other", "x"}, "--from"); err == nil {
		t.Fatal("unknown named option was accepted")
	}
	if _, err := parseSingleNamedOption(nil, "--from"); err == nil {
		t.Fatal("missing named option was accepted")
	}
	if value, err := parseSingleNamedOption([]string{"--from", "branch/main"}, "--from"); err != nil || value != "branch/main" {
		t.Fatalf("named option = %q err=%v", value, err)
	}

	if _, _, err := extractEvolutionPretty([]string{"--pretty", "--pretty"}); err == nil {
		t.Fatal("duplicate --pretty was accepted")
	}
	args, pretty, err := extractEvolutionPretty([]string{"overview", "--pretty"})
	if err != nil || !pretty || len(args) != 1 || args[0] != "overview" {
		t.Fatalf("pretty extraction = %#v %v err=%v", args, pretty, err)
	}
	if !strings.Contains(evolutionHelp(localeChinese), "KG OS Evolution") {
		t.Fatal("Chinese Evolution help was not rendered")
	}

	var stderr bytes.Buffer
	code := evolutionInputError(&stderr, &kernel.PublicError{Code: kernel.CodeParse, Message: "bad data"})
	if code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeParse)) {
		t.Fatalf("public input error exit=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	code = evolutionInputError(&stderr, errors.New("bad args"))
	if code != 2 || !strings.Contains(stderr.String(), string(kernel.CodeInvalidArgument)) {
		t.Fatalf("usage input error exit=%d stderr=%q", code, stderr.String())
	}
}

func TestEvolutionCLIStateParserFailureMatrix(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{
		{},
		{"--data", "null"},
		{"--branch", "main", "--branch", "side"},
		{"--branch", "main", "--data", "null", "--data", "null"},
		{"--branch", "main", "--data-file", "a", "--data-file", "b"},
		{"--branch", "main", "--author", "a", "--author", "b"},
		{"--branch", "main", "--message", "a", "--message", "b"},
		{"--branch", "main", "--unknown", "x"},
	} {
		if _, err := parseEvolutionStateCreate(args); err == nil {
			t.Fatalf("state create args %#v were accepted", args)
		}
	}
	for _, args := range [][]string{
		{},
		{"branch/main", "branch/side", "--data", "null"},
		{"branch/main", "--data", "null", "--data", "null"},
		{"branch/main", "--data-file", "a", "--data-file", "b"},
		{"branch/main", "--unknown", "x"},
	} {
		if _, err := parseEvolutionStateSetData(args, strings.NewReader(""), true); err == nil {
			t.Fatalf("state set-data args %#v were accepted", args)
		}
	}
	if _, err := formatEvolutionJSON([]byte("{"), false); err == nil {
		t.Fatal("invalid compact JSON was accepted")
	}
	if _, err := formatEvolutionJSON([]byte("{"), true); err == nil {
		t.Fatal("invalid pretty JSON was accepted")
	}
}

func TestEvolutionCLIInvalidCommandMatrix(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{
		{},
		{"overview", "extra"},
		{"get"},
		{"get", "a", "b"},
		{"ancestry"},
		{"history", "branch/main"},
		{"diff", "--before", "branch/main"},
		{"state"},
		{"state", "unknown"},
		{"state", "clear-data"},
		{"branch"},
		{"branch", "unknown"},
		{"branch", "list", "extra"},
		{"branch", "create"},
		{"branch", "delete"},
		{"tag"},
		{"tag", "unknown"},
		{"tag", "list", "extra"},
		{"tag", "create"},
		{"tag", "move"},
		{"tag", "delete"},
	} {
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		code := runEvolution(context.Background(), args, strings.NewReader(""), true, &stdout, &stderr)
		if code != 2 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeInvalidArgument)) {
			t.Fatalf("args=%#v exit=%d stdout=%q stderr=%q", args, code, stdout.String(), stderr.String())
		}
	}
}
