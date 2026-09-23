package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const maxObjectCLIInputBytes = 16 << 20

type objectReadCLI struct {
	Refs     []string
	RefsFile string
	At       string
	Body     bool
	Format   string
	Pretty   bool
}

func runObject(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if hasHelp(args) {
		_, _ = io.WriteString(stdout, objectHelp(detectLocale()))
		return 0
	}
	if len(args) == 0 {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "object subcommand is required", 2)
	}
	switch args[0] {
	case "read":
		return runObjectRead(ctx, args[1:], stdin, stdinIsTTY, stdout, stderr)
	case "patch":
		return runObjectPatch(ctx, args[1:], stdin, stdinIsTTY, stdout, stderr)
	default:
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, fmt.Sprintf("unknown object subcommand %q", args[0]), 2)
	}
}

func runObjectRead(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	input, err := parseObjectReadCLI(args)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	refs, code := loadObjectRefs(input, stdin, stdinIsTTY, stderr)
	if code != 0 {
		return code
	}
	target, code := resolveCLITarget(ctx, stderr)
	if code != 0 {
		return code
	}
	body, _, publicErr, transportErr := doAPIRequest(
		ctx,
		target.Endpoint,
		target.Token,
		"/api/v1/object/read",
		"application/json",
		kernel.ObjectReadRequest{At: input.At, Refs: refs},
	)
	if transportErr != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	if publicErr != nil {
		return writePublicCLIError(stderr, publicErr, 1)
	}
	var result kernel.ObjectReadResult
	if err := json.Unmarshal(body, &result); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Object response", 3)
	}
	output, err := formatObjectReadCLI(result, input)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, err.Error(), 3)
	}
	_, _ = stdout.Write(output)
	return 0
}

func runObjectPatch(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	return runPatchCommand(
		ctx,
		args,
		stdin,
		stdinIsTTY,
		stdout,
		stderr,
		"/api/v1/object/patch",
		"object patch",
	)
}

func parseObjectReadCLI(args []string) (objectReadCLI, error) {
	input := objectReadCLI{}
	for index := 0; index < len(args); index++ {
		arg := args[index]
		switch arg {
		case "--at":
			value, next, err := nextUniqueCLIValue(args, index, "--at", input.At)
			if err != nil {
				return input, err
			}
			input.At = value
			index = next
		case "--refs-file":
			value, next, err := nextCLIValue(args, index, "--refs-file")
			if err != nil {
				return input, err
			}
			if input.RefsFile != "" {
				return input, fmt.Errorf("--refs-file may be provided only once")
			}
			input.RefsFile = value
			index = next
		case "--body":
			if input.Body {
				return input, fmt.Errorf("--body may be provided only once")
			}
			input.Body = true
		case "--format":
			value, next, err := nextCLIValue(args, index, "--format")
			if err != nil {
				return input, err
			}
			if input.Format != "" {
				return input, fmt.Errorf("--format may be provided only once")
			}
			if value != "yaml" && value != "json" {
				return input, fmt.Errorf("--format must be yaml or json")
			}
			input.Format = value
			index = next
		case "--pretty":
			if input.Pretty {
				return input, fmt.Errorf("--pretty may be provided only once")
			}
			input.Pretty = true
		default:
			if strings.HasPrefix(arg, "-") {
				return input, fmt.Errorf("unknown object read option %q", arg)
			}
			input.Refs = append(input.Refs, arg)
		}
	}
	if input.At == "" {
		return input, fmt.Errorf("--at is required")
	}
	if input.RefsFile != "" && len(input.Refs) != 0 {
		return input, fmt.Errorf("positional refs and --refs-file are mutually exclusive")
	}
	if input.Format != "" && !input.Body {
		return input, fmt.Errorf("--format requires --body")
	}
	if input.Body && input.Format == "" {
		input.Format = "yaml"
	}
	if input.Pretty && input.Body && input.Format == "yaml" {
		return input, fmt.Errorf("--pretty is valid only for JSON output")
	}
	if len(input.Refs) > 100 {
		return input, fmt.Errorf("object read accepts at most 100 refs")
	}
	return input, nil
}

func loadObjectRefs(
	input objectReadCLI,
	stdin io.Reader,
	stdinIsTTY bool,
	stderr io.Writer,
) ([]string, int) {
	refs := append([]string(nil), input.Refs...)
	if input.RefsFile != "" {
		file, err := os.Open(input.RefsFile)
		if err != nil {
			return nil, writeLocalCLIError(stderr, kernel.CodeIO, "read --refs-file failed", 2)
		}
		defer file.Close()
		var code int
		refs, code = readObjectRefsText(file, "refs file", stderr)
		if code != 0 {
			return nil, code
		}
	} else if len(refs) == 0 {
		if stdinIsTTY {
			return nil, writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "Object refs are required", 2)
		}
		var code int
		refs, code = readObjectRefsText(stdin, "refs stdin", stderr)
		if code != 0 {
			return nil, code
		}
	}
	if len(refs) < 1 || len(refs) > 100 {
		return nil, writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "Object read requires 1..100 refs", 2)
	}
	seen := map[string]struct{}{}
	for _, raw := range refs {
		if _, duplicate := seen[raw]; duplicate {
			return nil, writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "duplicate Object Ref "+raw, 2)
		}
		seen[raw] = struct{}{}
		if _, err := kernel.ParseObjectRef(raw); err != nil {
			return nil, writePublicCLIError(stderr, kernel.AsPublicError(err), 2)
		}
	}
	return refs, 0
}

func readObjectRefsText(reader io.Reader, source string, stderr io.Writer) ([]string, int) {
	body, err := io.ReadAll(io.LimitReader(reader, maxObjectCLIInputBytes+1))
	if err != nil {
		return nil, writeLocalCLIError(stderr, kernel.CodeIO, "read "+source+" failed", 2)
	}
	if len(body) > maxObjectCLIInputBytes {
		return nil, writeLocalCLIError(stderr, kernel.CodeResource, "Object ref input exceeds resource limit", 2)
	}
	if !utf8.Valid(body) {
		return nil, writeLocalCLIError(stderr, kernel.CodeParse, source+" is not valid UTF-8 text", 2)
	}
	text := strings.ReplaceAll(string(body), "\r\n", "\n")
	if strings.ContainsRune(text, '\r') {
		return nil, writeLocalCLIError(stderr, kernel.CodeParse, source+" contains invalid line endings", 2)
	}
	refs := []string{}
	for _, line := range strings.Split(text, "\n") {
		if line == "" {
			continue
		}
		refs = append(refs, line)
	}
	return refs, 0
}

func formatObjectReadCLI(result kernel.ObjectReadResult, input objectReadCLI) ([]byte, error) {
	if !input.Body {
		return marshalCLIJSON(result, input.Pretty)
	}
	if input.Format == "json" {
		if len(result.Results) == 1 {
			if input.Pretty {
				var output bytes.Buffer
				if err := json.Indent(&output, result.Results[0].Value, "", "  "); err != nil {
					return nil, err
				}
				output.WriteByte('\n')
				return output.Bytes(), nil
			}
			return append(append([]byte(nil), result.Results[0].Value...), '\n'), nil
		}
		values := make([]json.RawMessage, 0, len(result.Results))
		for _, item := range result.Results {
			values = append(values, item.Value)
		}
		return marshalCLIJSON(values, input.Pretty)
	}
	if input.Format != "yaml" {
		return nil, fmt.Errorf("unsupported Object body format %q", input.Format)
	}
	bodies := make([][]byte, 0, len(result.Results))
	for _, item := range result.Results {
		value, err := kernel.ParseObjectJSON(item.Kind, item.Value)
		if err != nil {
			return nil, err
		}
		body, err := kernel.RenderObjectYAML(value)
		if err != nil {
			return nil, err
		}
		bodies = append(bodies, body)
	}
	if len(bodies) == 1 {
		return bodies[0], nil
	}
	var output bytes.Buffer
	fmt.Fprintf(&output, "# kgos-state: %s\n", result.State)
	for index, body := range bodies {
		fmt.Fprintf(&output, "--- # kgos-ref: %s\n", result.Results[index].Ref)
		output.Write(body)
	}
	return output.Bytes(), nil
}

func marshalCLIJSON(value any, pretty bool) ([]byte, error) {
	var (
		body []byte
		err  error
	)
	if pretty {
		body, err = json.MarshalIndent(value, "", "  ")
	} else {
		body, err = json.Marshal(value)
	}
	if err != nil {
		return nil, err
	}
	return append(body, '\n'), nil
}
