package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type ontologyReadCLI struct {
	Refs   []string
	At     string
	Limit  int
	Cursor string
	Edit   bool
}

type ontologyPatchCLI struct {
	BaseState string
	Branch    string
	Patch     string
	PatchFile string
	Author    *string
	Message   *string
}

func runOntology(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if hasHelp(args) {
		_, _ = io.WriteString(stdout, ontologyHelp(detectLocale()))
		return 0
	}
	if len(args) != 0 && args[0] == "patch" {
		return runOntologyPatch(ctx, args[1:], stdin, stdinIsTTY, stdout, stderr)
	}
	input, err := parseOntologyReadCLI(args)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	if input.Edit {
		return runOntologyEdit(ctx, input, stdout, stderr)
	}
	return runOntologyRead(ctx, input, stdout, stderr)
}

func runOntologyRead(
	ctx context.Context,
	input ontologyReadCLI,
	stdout io.Writer,
	stderr io.Writer,
) int {
	target, code := resolveCLITarget(ctx, stderr)
	if code != 0 {
		return code
	}
	request := kernel.OntologyReadRequest{
		At:     input.At,
		Refs:   input.Refs,
		Limit:  input.Limit,
		Cursor: input.Cursor,
	}
	body, _, publicErr, transportErr := doAPIRequest(
		ctx, target.Endpoint, target.Token, "/api/v1/ontology/read", "application/json", request,
	)
	if transportErr != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	if publicErr != nil {
		return writePublicCLIError(stderr, publicErr, 1)
	}
	var result kernel.OntologyReadResult
	if err := json.Unmarshal(body, &result); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Ontology response", 3)
	}
	markdown, err := formatOntologyCLIRead(result)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, err.Error(), 3)
	}
	_, _ = io.WriteString(stdout, markdown)
	return 0
}

func runOntologyEdit(
	ctx context.Context,
	input ontologyReadCLI,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if !isResolvedState(input.At) {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "--edit --at must be commit/<64-hex>", 2)
	}
	if len(input.Refs) == 0 {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "--edit requires 1..100 OntologyRef values", 2)
	}
	target, code := resolveCLITarget(ctx, stderr)
	if code != 0 {
		return code
	}
	type objectBody struct {
		Ref  string
		Body []byte
	}
	objects := make([]objectBody, 0, len(input.Refs))
	for _, ref := range input.Refs {
		body, headers, publicErr, transportErr := doAPIRequest(
			ctx,
			target.Endpoint,
			target.Token,
			"/api/v1/ontology/object",
			"application/yaml",
			map[string]any{"at": input.At, "ref": ref},
		)
		if transportErr != nil {
			return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
		}
		if publicErr != nil {
			return writePublicCLIError(stderr, publicErr, 1)
		}
		if headers.Get("X-KGOS-State") != input.At || headers.Get("X-KGOS-Ref") != ref {
			return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned mismatched Object metadata", 3)
		}
		objects = append(objects, objectBody{Ref: ref, Body: body})
	}
	if len(objects) == 1 {
		_, _ = stdout.Write(objects[0].Body)
		return 0
	}
	var output bytes.Buffer
	fmt.Fprintf(&output, "# kgos-state: %s\n", input.At)
	for _, object := range objects {
		fmt.Fprintf(&output, "--- # kgos-ref: %s\n", object.Ref)
		output.Write(object.Body)
	}
	_, _ = stdout.Write(output.Bytes())
	return 0
}

func runOntologyPatch(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	input, err := parseOntologyPatchCLI(args)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	if !isResolvedState(input.BaseState) {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "--base-state must be commit/<64-hex>", 2)
	}
	patchText, code := loadPatchPayload(input, stdin, stdinIsTTY, stderr)
	if code != 0 {
		return code
	}
	target, code := resolveCLITarget(ctx, stderr)
	if code != 0 {
		return code
	}
	request := kernel.PatchRequest{
		BaseState: input.BaseState,
		Branch:    input.Branch,
		Patch:     patchText,
		Author:    input.Author,
		Message:   input.Message,
	}
	body, _, publicErr, transportErr := doAPIRequest(
		ctx, target.Endpoint, target.Token, "/api/v1/ontology/patch", "application/json", request,
	)
	if transportErr != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	if publicErr != nil {
		return writePublicCLIError(stderr, publicErr, 1)
	}
	var result kernel.PatchResult
	if err := json.Unmarshal(body, &result); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Patch response", 3)
	}
	encoded, _ := json.Marshal(result)
	_, _ = stdout.Write(append(encoded, '\n'))
	return 0
}

func parseOntologyReadCLI(args []string) (ontologyReadCLI, error) {
	input := ontologyReadCLI{}
	for index := 0; index < len(args); index++ {
		arg := args[index]
		switch arg {
		case "--at":
			value, next, err := nextCLIValue(args, index, "--at")
			if err != nil {
				return input, err
			}
			if input.At != "" {
				return input, fmt.Errorf("--at may be provided only once")
			}
			input.At = value
			index = next
		case "--limit":
			value, next, err := nextCLIValue(args, index, "--limit")
			if err != nil {
				return input, err
			}
			parsed, err := strconv.Atoi(value)
			if err != nil || parsed < 1 || parsed > 1000 {
				return input, fmt.Errorf("--limit must be between 1 and 1000")
			}
			input.Limit = parsed
			index = next
		case "--cursor":
			value, next, err := nextCLIValue(args, index, "--cursor")
			if err != nil {
				return input, err
			}
			if input.Cursor != "" {
				return input, fmt.Errorf("--cursor may be provided only once")
			}
			input.Cursor = value
			index = next
		case "--edit":
			if input.Edit {
				return input, fmt.Errorf("--edit may be provided only once")
			}
			input.Edit = true
		case "--pretty":
			return input, fmt.Errorf("--pretty is not valid for Ontology text output")
		default:
			if strings.HasPrefix(arg, "-") {
				return input, fmt.Errorf("unknown ontology option %q", arg)
			}
			input.Refs = append(input.Refs, arg)
		}
	}
	if input.At == "" {
		return input, fmt.Errorf("--at is required")
	}
	if len(input.Refs) > 100 {
		return input, fmt.Errorf("ontology read accepts at most 100 refs")
	}
	seenRefs := map[string]struct{}{}
	for _, ref := range input.Refs {
		if _, duplicate := seenRefs[ref]; duplicate {
			return input, fmt.Errorf("duplicate Ontology Ref %q", ref)
		}
		seenRefs[ref] = struct{}{}
	}
	if input.Edit && (input.Limit != 0 || input.Cursor != "") {
		return input, fmt.Errorf("--edit does not accept pagination options")
	}
	if input.Cursor != "" && len(input.Refs) > 1 {
		return input, fmt.Errorf("--cursor accepts Overview or one Domain ref only")
	}
	return input, nil
}

func parseOntologyPatchCLI(args []string) (ontologyPatchCLI, error) {
	input := ontologyPatchCLI{}
	for index := 0; index < len(args); index++ {
		arg := args[index]
		switch arg {
		case "--base-state":
			value, next, err := nextCLIValue(args, index, "--base-state")
			if err != nil {
				return input, err
			}
			if input.BaseState != "" {
				return input, fmt.Errorf("--base-state may be provided only once")
			}
			input.BaseState = value
			index = next
		case "--branch":
			value, next, err := nextCLIValue(args, index, "--branch")
			if err != nil {
				return input, err
			}
			if input.Branch != "" {
				return input, fmt.Errorf("--branch may be provided only once")
			}
			input.Branch = value
			index = next
		case "--patch":
			value, next, err := nextCLIValue(args, index, "--patch")
			if err != nil {
				return input, err
			}
			if input.Patch != "" {
				return input, fmt.Errorf("--patch may be provided only once")
			}
			input.Patch = value
			index = next
		case "--patch-file":
			value, next, err := nextCLIValue(args, index, "--patch-file")
			if err != nil {
				return input, err
			}
			if input.PatchFile != "" {
				return input, fmt.Errorf("--patch-file may be provided only once")
			}
			input.PatchFile = value
			index = next
		case "--author":
			value, next, err := nextCLIValue(args, index, "--author")
			if err != nil {
				return input, err
			}
			if input.Author != nil {
				return input, fmt.Errorf("--author may be provided only once")
			}
			input.Author = &value
			index = next
		case "--message":
			value, next, err := nextCLIValue(args, index, "--message")
			if err != nil {
				return input, err
			}
			if input.Message != nil {
				return input, fmt.Errorf("--message may be provided only once")
			}
			input.Message = &value
			index = next
		default:
			return input, fmt.Errorf("unknown ontology patch option %q", arg)
		}
	}
	if input.BaseState == "" {
		return input, fmt.Errorf("--base-state is required")
	}
	if input.Branch == "" {
		return input, fmt.Errorf("--branch is required")
	}
	if input.Patch != "" && input.PatchFile != "" {
		return input, fmt.Errorf("--patch and --patch-file are mutually exclusive")
	}
	return input, nil
}

func loadPatchPayload(
	input ontologyPatchCLI,
	stdin io.Reader,
	stdinIsTTY bool,
	stderr io.Writer,
) (string, int) {
	if input.Patch != "" {
		if !utf8.ValidString(input.Patch) {
			return "", writeLocalCLIError(stderr, kernel.CodeParse, "patch input is not valid UTF-8 text", 2)
		}
		if len(input.Patch) > 16<<20 {
			return "", writeLocalCLIError(stderr, kernel.CodeResource, "patch input exceeds resource limit", 2)
		}
		return input.Patch, 0
	}
	if input.PatchFile != "" {
		file, err := os.Open(input.PatchFile)
		if err != nil {
			return "", writeLocalCLIError(stderr, kernel.CodeIO, "read --patch-file failed", 2)
		}
		defer file.Close()
		return readPatchText(file, "patch file", stderr)
	}
	if stdinIsTTY {
		return "", writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "patch input is required", 2)
	}
	return readPatchText(stdin, "patch stdin", stderr)
}

func readPatchText(reader io.Reader, source string, stderr io.Writer) (string, int) {
	body, err := io.ReadAll(io.LimitReader(reader, 16<<20+1))
	if err != nil {
		return "", writeLocalCLIError(stderr, kernel.CodeIO, "read "+source+" failed", 2)
	}
	if len(body) > 16<<20 {
		return "", writeLocalCLIError(stderr, kernel.CodeResource, "patch input exceeds resource limit", 2)
	}
	if !utf8.Valid(body) {
		return "", writeLocalCLIError(stderr, kernel.CodeParse, source+" is not valid UTF-8 text", 2)
	}
	return string(body), 0
}

func nextCLIValue(args []string, index int, name string) (string, int, error) {
	if index+1 >= len(args) || strings.HasPrefix(args[index+1], "--") {
		return "", index, fmt.Errorf("%s requires a value", name)
	}
	return args[index+1], index + 1, nil
}

type cliTarget struct {
	Endpoint string
	Token    string
}

func resolveCLITarget(ctx context.Context, stderr io.Writer) (cliTarget, int) {
	paths, err := runtimeprofile.ResolvePaths(os.Getenv("KG_HOME"))
	if err != nil {
		return cliTarget{}, writeLocalCLIError(stderr, kernel.CodeIO, "resolve KG_HOME failed", 2)
	}
	endpoint, err := ensureRuntime(ctx, paths)
	if err != nil {
		return cliTarget{}, writeLocalCLIError(stderr, kernel.CodeIO, "ensure kgosd failed: "+err.Error(), 2)
	}
	token := os.Getenv("KG_TOKEN")
	if token == "" {
		credential, err := runtimeprofile.LoadCredential(paths)
		if err != nil {
			return cliTarget{}, writeLocalCLIError(
				stderr,
				kernel.CodeAuthenticationFailed,
				"local KG OS credential is unavailable",
				2,
			)
		}
		token = credential.Token
	}
	return cliTarget{Endpoint: strings.TrimRight(endpoint, "/"), Token: token}, 0
}

func doAPIRequest(
	ctx context.Context,
	endpoint string,
	token string,
	path string,
	accept string,
	input any,
) ([]byte, http.Header, *kernel.PublicError, error) {
	payload, err := json.Marshal(input)
	if err != nil {
		return nil, nil, nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+path, bytes.NewReader(payload))
	if err != nil {
		return nil, nil, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", accept)
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, nil, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 16<<20+1))
	if err != nil {
		return nil, nil, nil, err
	}
	if len(body) > 16<<20 {
		return nil, nil, nil, fmt.Errorf("daemon response exceeds resource limit")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var public kernel.PublicError
		if err := json.Unmarshal(body, &public); err != nil || public.Code == "" {
			return nil, nil, nil, fmt.Errorf("daemon returned malformed error response")
		}
		return nil, response.Header.Clone(), &public, nil
	}
	return body, response.Header.Clone(), nil, nil
}

func writeLocalCLIError(stderr io.Writer, code kernel.ErrorCode, message string, exit int) int {
	return writePublicCLIError(stderr, &kernel.PublicError{Code: code, Message: message}, exit)
}

func writePublicCLIError(stderr io.Writer, public *kernel.PublicError, exit int) int {
	body, err := json.Marshal(public)
	if err == nil {
		_, _ = stderr.Write(append(body, '\n'))
	}
	return exit
}

func formatOntologyCLIRead(result kernel.OntologyReadResult) (string, error) {
	if result.State == "" || len(result.Results) == 0 {
		return "", fmt.Errorf("daemon returned an incomplete Ontology read result")
	}
	if len(result.Results) == 1 {
		if result.Results[0].Markdown == "" {
			return "", fmt.Errorf("daemon returned an empty Ontology Markdown body")
		}
		return result.Results[0].Markdown, nil
	}
	var output strings.Builder
	fmt.Fprintf(&output, "---\nstate: %s\nkind: %q\ncount: %d\n---\n",
		strconv.Quote(result.State), "batch", len(result.Results))
	for _, item := range result.Results {
		fmt.Fprintf(&output, "\n---\nref: ")
		if item.Ref == "" {
			output.WriteString("null")
		} else {
			output.WriteString(strconv.Quote(item.Ref))
		}
		fmt.Fprintf(&output, "\nkind: %s\ntotal: %d\ncursor: ",
			strconv.Quote(item.Kind), item.Total)
		if item.Cursor == "" {
			output.WriteString("null")
		} else {
			output.WriteString(strconv.Quote(item.Cursor))
		}
		output.WriteString("\n---\n")
		body := stripMarkdownFrontMatter(item.Markdown)
		if body == "" {
			return "", fmt.Errorf("daemon returned an empty Ontology Markdown body")
		}
		output.WriteString(body)
	}
	return output.String(), nil
}

func stripMarkdownFrontMatter(markdown string) string {
	if !strings.HasPrefix(markdown, "---\n") {
		return markdown
	}
	index := strings.Index(markdown[4:], "\n---\n")
	if index < 0 {
		return markdown
	}
	return markdown[4+index+5:]
}

func isResolvedState(value string) bool {
	if !strings.HasPrefix(value, "commit/") || len(value) != len("commit/")+64 {
		return false
	}
	for _, r := range strings.TrimPrefix(value, "commit/") {
		if !strings.ContainsRune("0123456789abcdef", r) {
			return false
		}
	}
	return true
}

func hasHelp(args []string) bool {
	for _, arg := range args {
		if arg == "--help" || arg == "-h" {
			return true
		}
	}
	return false
}

func stdinIsTerminal(file *os.File) bool {
	info, err := file.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}
