package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const maxEvolutionCLIInputBytes = 16 << 20

type evolutionPageCLI struct {
	Limit  int
	Cursor string
}

type evolutionScopeCLI struct {
	Scope       string
	ObjectRef   string
	AnchorState string
	evolutionPageCLI
}

type evolutionDataCLI struct {
	Inline    string
	File      string
	inlineSet bool
	fileSet   bool
}

func runEvolution(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if hasHelp(args) {
		_, _ = io.WriteString(stdout, evolutionHelp(detectLocale()))
		return 0
	}
	args, pretty, err := extractEvolutionPretty(args)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	if len(args) == 0 {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "evolution command is required", 2)
	}

	switch args[0] {
	case "overview":
		if len(args) != 1 {
			return evolutionUsageError(stderr, "overview does not accept positional arguments")
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/overview", struct{}{}, pretty, stdout, stderr)
	case "get":
		if len(args) != 2 {
			return evolutionUsageError(stderr, "get requires exactly one StateRef")
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/get", kernel.EvolutionGetRequest{State: args[1]}, pretty, stdout, stderr)
	case "ancestry":
		request, parseErr := parseEvolutionAncestry(args[1:])
		if parseErr != nil {
			return evolutionUsageError(stderr, parseErr.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/ancestry", request, pretty, stdout, stderr)
	case "history":
		request, parseErr := parseEvolutionHistory(args[1:])
		if parseErr != nil {
			return evolutionUsageError(stderr, parseErr.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/history", request, pretty, stdout, stderr)
	case "diff":
		request, parseErr := parseEvolutionDiff(args[1:])
		if parseErr != nil {
			return evolutionUsageError(stderr, parseErr.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/diff", request, pretty, stdout, stderr)
	case "state":
		return runEvolutionState(ctx, args[1:], stdin, stdinIsTTY, pretty, stdout, stderr)
	case "branch":
		return runEvolutionBranch(ctx, args[1:], pretty, stdout, stderr)
	case "tag":
		return runEvolutionTag(ctx, args[1:], pretty, stdout, stderr)
	default:
		return evolutionUsageError(stderr, fmt.Sprintf("unknown evolution command %q", args[0]))
	}
}

func runEvolutionState(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	pretty bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if len(args) == 0 {
		return evolutionUsageError(stderr, "state command is required")
	}
	switch args[0] {
	case "create":
		request, err := parseEvolutionStateCreate(args[1:])
		if err != nil {
			return evolutionInputError(stderr, err)
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/state/create", request, pretty, stdout, stderr)
	case "set-data":
		request, err := parseEvolutionStateSetData(args[1:], stdin, stdinIsTTY)
		if err != nil {
			return evolutionInputError(stderr, err)
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/state/set-data", request, pretty, stdout, stderr)
	case "clear-data":
		if len(args) != 2 {
			return evolutionUsageError(stderr, "state clear-data requires exactly one StateRef")
		}
		return runEvolutionRequest(
			ctx,
			"/api/v1/evolution/state/clear-data",
			kernel.StateClearDataRequest{State: args[1]},
			pretty,
			stdout,
			stderr,
		)
	default:
		return evolutionUsageError(stderr, fmt.Sprintf("unknown evolution state command %q", args[0]))
	}
}

func runEvolutionBranch(
	ctx context.Context,
	args []string,
	pretty bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if len(args) == 0 {
		return evolutionUsageError(stderr, "branch command is required")
	}
	switch args[0] {
	case "list":
		if len(args) != 1 {
			return evolutionUsageError(stderr, "branch list does not accept arguments")
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/branch/list", struct{}{}, pretty, stdout, stderr)
	case "create":
		if len(args) < 2 {
			return evolutionUsageError(stderr, "branch create requires a name")
		}
		from, err := parseSingleNamedOption(args[2:], "--from")
		if err != nil {
			return evolutionUsageError(stderr, err.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/branch/create", kernel.BranchCreateRequest{Name: args[1], From: from}, pretty, stdout, stderr)
	case "delete":
		if len(args) != 2 {
			return evolutionUsageError(stderr, "branch delete requires exactly one name")
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/branch/delete", kernel.BranchDeleteRequest{Name: args[1]}, pretty, stdout, stderr)
	default:
		return evolutionUsageError(stderr, fmt.Sprintf("unknown evolution branch command %q", args[0]))
	}
}

func runEvolutionTag(
	ctx context.Context,
	args []string,
	pretty bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if len(args) == 0 {
		return evolutionUsageError(stderr, "tag command is required")
	}
	switch args[0] {
	case "list":
		if len(args) != 1 {
			return evolutionUsageError(stderr, "tag list does not accept arguments")
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/tag/list", struct{}{}, pretty, stdout, stderr)
	case "create", "move":
		if len(args) < 2 {
			return evolutionUsageError(stderr, "tag "+args[0]+" requires a name")
		}
		target, err := parseSingleNamedOption(args[2:], "--target")
		if err != nil {
			return evolutionUsageError(stderr, err.Error())
		}
		if args[0] == "create" {
			return runEvolutionRequest(ctx, "/api/v1/evolution/tag/create", kernel.TagCreateRequest{Name: args[1], Target: target}, pretty, stdout, stderr)
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/tag/move", kernel.TagMoveRequest{Name: args[1], Target: target}, pretty, stdout, stderr)
	case "delete":
		if len(args) != 2 {
			return evolutionUsageError(stderr, "tag delete requires exactly one name")
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/tag/delete", kernel.TagDeleteRequest{Name: args[1]}, pretty, stdout, stderr)
	default:
		return evolutionUsageError(stderr, fmt.Sprintf("unknown evolution tag command %q", args[0]))
	}
}

func runEvolutionRequest(
	ctx context.Context,
	path string,
	request any,
	pretty bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	target, code := resolveCLITarget(ctx, stderr)
	if code != 0 {
		return code
	}
	body, _, publicErr, transportErr := doAPIRequest(ctx, target.Endpoint, target.Token, path, "application/json", request)
	if transportErr != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	if publicErr != nil {
		return writePublicCLIError(stderr, publicErr, 1)
	}
	formatted, err := formatEvolutionJSON(body, pretty)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned invalid Evolution JSON", 3)
	}
	_, _ = stdout.Write(formatted)
	return 0
}

func formatEvolutionJSON(body []byte, pretty bool) ([]byte, error) {
	var output bytes.Buffer
	if pretty {
		if err := json.Indent(&output, bytes.TrimSpace(body), "", "  "); err != nil {
			return nil, err
		}
	} else if err := json.Compact(&output, bytes.TrimSpace(body)); err != nil {
		return nil, err
	}
	output.WriteByte('\n')
	return output.Bytes(), nil
}

func parseEvolutionAncestry(args []string) (kernel.EvolutionAncestryRequest, error) {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return kernel.EvolutionAncestryRequest{}, fmt.Errorf("ancestry requires a StateRef")
	}
	page, err := parseEvolutionPageOptions(args[1:])
	if err != nil {
		return kernel.EvolutionAncestryRequest{}, err
	}
	return kernel.EvolutionAncestryRequest{Root: args[0], Limit: page.Limit, Cursor: page.Cursor}, nil
}

func parseEvolutionHistory(args []string) (kernel.EvolutionHistoryRequest, error) {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return kernel.EvolutionHistoryRequest{}, fmt.Errorf("history requires a StateRef")
	}
	options, err := parseEvolutionScopeOptions(args[1:])
	if err != nil {
		return kernel.EvolutionHistoryRequest{}, err
	}
	return kernel.EvolutionHistoryRequest{
		Root: args[0], Scope: options.Scope, Object: evolutionObjectFilter(options),
		Limit: options.Limit, Cursor: options.Cursor,
	}, nil
}

func parseEvolutionDiff(args []string) (kernel.EvolutionDiffRequest, error) {
	before := ""
	after := ""
	scopeArgs := make([]string, 0, len(args))
	for index := 0; index < len(args); index++ {
		switch args[index] {
		case "--before":
			value, next, err := nextUniqueCLIValue(args, index, "--before", before)
			if err != nil {
				return kernel.EvolutionDiffRequest{}, err
			}
			before = value
			index = next
		case "--after":
			value, next, err := nextUniqueCLIValue(args, index, "--after", after)
			if err != nil {
				return kernel.EvolutionDiffRequest{}, err
			}
			after = value
			index = next
		default:
			scopeArgs = append(scopeArgs, args[index])
		}
	}
	if before == "" || after == "" {
		return kernel.EvolutionDiffRequest{}, fmt.Errorf("diff requires --before and --after")
	}
	options, err := parseEvolutionScopeOptions(scopeArgs)
	if err != nil {
		return kernel.EvolutionDiffRequest{}, err
	}
	return kernel.EvolutionDiffRequest{
		Before: before, After: after, Scope: options.Scope, Object: evolutionObjectFilter(options),
		Limit: options.Limit, Cursor: options.Cursor,
	}, nil
}

func parseEvolutionScopeOptions(args []string) (evolutionScopeCLI, error) {
	input := evolutionScopeCLI{}
	for index := 0; index < len(args); index++ {
		switch args[index] {
		case "--scope":
			value, next, err := nextUniqueCLIValue(args, index, "--scope", input.Scope)
			if err != nil {
				return input, err
			}
			input.Scope = value
			index = next
		case "--object-ref":
			value, next, err := nextUniqueCLIValue(args, index, "--object-ref", input.ObjectRef)
			if err != nil {
				return input, err
			}
			input.ObjectRef = value
			index = next
		case "--anchor-state":
			value, next, err := nextUniqueCLIValue(args, index, "--anchor-state", input.AnchorState)
			if err != nil {
				return input, err
			}
			input.AnchorState = value
			index = next
		default:
			next, handled, err := parseEvolutionPageOption(args, index, &input.evolutionPageCLI)
			if err != nil {
				return input, err
			}
			if !handled {
				return input, fmt.Errorf("unknown Evolution option %q", args[index])
			}
			index = next
		}
	}
	if input.Scope == "" {
		return input, fmt.Errorf("--scope is required")
	}
	if input.Scope != "all" && input.Scope != "ontology" && input.Scope != "knowledge" && input.Scope != "object" {
		return input, fmt.Errorf("--scope must be all, ontology, knowledge, or object")
	}
	if input.Scope == "object" {
		if input.ObjectRef == "" || input.AnchorState == "" {
			return input, fmt.Errorf("--scope object requires --object-ref and --anchor-state")
		}
	} else if input.ObjectRef != "" || input.AnchorState != "" {
		return input, fmt.Errorf("--object-ref and --anchor-state require --scope object")
	}
	return input, nil
}

func parseEvolutionPageOptions(args []string) (evolutionPageCLI, error) {
	input := evolutionPageCLI{}
	for index := 0; index < len(args); index++ {
		next, handled, err := parseEvolutionPageOption(args, index, &input)
		if err != nil {
			return input, err
		}
		if !handled {
			return input, fmt.Errorf("unknown Evolution pagination option %q", args[index])
		}
		index = next
	}
	return input, nil
}

func parseEvolutionPageOption(args []string, index int, input *evolutionPageCLI) (int, bool, error) {
	switch args[index] {
	case "--limit":
		if input.Limit != 0 {
			return index, true, fmt.Errorf("--limit may be provided only once")
		}
		value, next, err := nextCLIValue(args, index, "--limit")
		if err != nil {
			return index, true, err
		}
		input.Limit, err = parseEvolutionLimit(value)
		return next, true, err
	case "--cursor":
		value, next, err := nextUniqueCLIValue(args, index, "--cursor", input.Cursor)
		if err != nil {
			return index, true, err
		}
		input.Cursor = value
		return next, true, nil
	default:
		return index, false, nil
	}
}

func parseEvolutionLimit(raw string) (int, error) {
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > 1000 {
		return 0, fmt.Errorf("--limit must be an integer between 1 and 1000")
	}
	return value, nil
}

func evolutionObjectFilter(input evolutionScopeCLI) *kernel.EvolutionObjectFilter {
	if input.Scope != "object" {
		return nil
	}
	return &kernel.EvolutionObjectFilter{AnchorState: input.AnchorState, Ref: input.ObjectRef}
}

func parseEvolutionStateCreate(args []string) (kernel.StateCreateRequest, error) {
	request := kernel.StateCreateRequest{}
	data := evolutionDataCLI{}
	for index := 0; index < len(args); index++ {
		switch args[index] {
		case "--branch":
			value, next, err := nextUniqueCLIValue(args, index, "--branch", request.Branch)
			if err != nil {
				return request, err
			}
			request.Branch = value
			index = next
		case "--author":
			value, next, err := nextCLIValue(args, index, "--author")
			if err != nil || request.Author != nil {
				if err == nil {
					err = fmt.Errorf("--author may be provided only once")
				}
				return request, err
			}
			request.Author = &value
			index = next
		case "--message":
			value, next, err := nextCLIValue(args, index, "--message")
			if err != nil || request.Message != nil {
				if err == nil {
					err = fmt.Errorf("--message may be provided only once")
				}
				return request, err
			}
			request.Message = &value
			index = next
		default:
			next, handled, err := parseEvolutionDataOption(args, index, &data)
			if err != nil {
				return request, err
			}
			if !handled {
				return request, fmt.Errorf("unknown state create option %q", args[index])
			}
			index = next
		}
	}
	if request.Branch == "" {
		return request, fmt.Errorf("state create requires --branch")
	}
	if data.inlineSet && data.fileSet {
		return request, fmt.Errorf("--data and --data-file are mutually exclusive")
	}
	if data.inlineSet || data.fileSet {
		body, err := loadEvolutionJSONData(data, nil, true)
		if err != nil {
			return request, err
		}
		request.Data = body
	}
	return request, nil
}

func parseEvolutionStateSetData(args []string, stdin io.Reader, stdinIsTTY bool) (kernel.StateSetDataRequest, error) {
	request := kernel.StateSetDataRequest{}
	data := evolutionDataCLI{}
	for index := 0; index < len(args); index++ {
		arg := args[index]
		next, handled, err := parseEvolutionDataOption(args, index, &data)
		if err != nil {
			return request, err
		}
		if handled {
			index = next
			continue
		}
		if strings.HasPrefix(arg, "-") {
			return request, fmt.Errorf("unknown state set-data option %q", arg)
		}
		if request.State != "" {
			return request, fmt.Errorf("state set-data accepts exactly one StateRef")
		}
		request.State = arg
	}
	if request.State == "" {
		return request, fmt.Errorf("state set-data requires a StateRef")
	}
	if data.inlineSet && data.fileSet {
		return request, fmt.Errorf("--data and --data-file are mutually exclusive")
	}
	if !data.inlineSet && !data.fileSet && stdinIsTTY {
		return request, fmt.Errorf("state set-data requires --data, --data-file, or non-TTY stdin")
	}
	body, err := loadEvolutionJSONData(data, stdin, stdinIsTTY)
	if err != nil {
		return request, err
	}
	request.Data = body
	return request, nil
}

func parseEvolutionDataOption(args []string, index int, input *evolutionDataCLI) (int, bool, error) {
	switch args[index] {
	case "--data":
		if input.inlineSet {
			return index, true, fmt.Errorf("--data may be provided only once")
		}
		value, next, err := nextCLIValue(args, index, "--data")
		if err != nil {
			return index, true, err
		}
		input.Inline, input.inlineSet = value, true
		return next, true, nil
	case "--data-file":
		if input.fileSet {
			return index, true, fmt.Errorf("--data-file may be provided only once")
		}
		value, next, err := nextCLIValue(args, index, "--data-file")
		if err != nil {
			return index, true, err
		}
		input.File, input.fileSet = value, true
		return next, true, nil
	default:
		return index, false, nil
	}
}

func loadEvolutionJSONData(input evolutionDataCLI, stdin io.Reader, stdinIsTTY bool) (json.RawMessage, error) {
	var reader io.Reader
	switch {
	case input.inlineSet:
		reader = strings.NewReader(input.Inline)
	case input.fileSet:
		file, err := os.Open(input.File)
		if err != nil {
			return nil, &kernel.PublicError{Code: kernel.CodeIO, Message: "read --data-file failed"}
		}
		defer file.Close()
		reader = file
	default:
		if stdin == nil || stdinIsTTY {
			return nil, fmt.Errorf("JSON data is required")
		}
		reader = stdin
	}
	body, err := io.ReadAll(io.LimitReader(reader, maxEvolutionCLIInputBytes+1))
	if err != nil {
		return nil, &kernel.PublicError{Code: kernel.CodeIO, Message: "read JSON data failed"}
	}
	if len(body) > maxEvolutionCLIInputBytes {
		return nil, &kernel.PublicError{Code: kernel.CodeResource, Message: "JSON data exceeds resource limit"}
	}
	body = bytes.TrimSpace(body)
	if len(body) == 0 || !json.Valid(body) {
		return nil, &kernel.PublicError{Code: kernel.CodeParse, Message: "data must contain exactly one valid JSON value"}
	}
	return append(json.RawMessage(nil), body...), nil
}

func parseSingleNamedOption(args []string, name string) (string, error) {
	value := ""
	for index := 0; index < len(args); index++ {
		if args[index] != name {
			return "", fmt.Errorf("unknown option %q", args[index])
		}
		parsed, next, err := nextUniqueCLIValue(args, index, name, value)
		if err != nil {
			return "", err
		}
		value = parsed
		index = next
	}
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}

func extractEvolutionPretty(args []string) ([]string, bool, error) {
	filtered := make([]string, 0, len(args))
	pretty := false
	for _, arg := range args {
		if arg == "--pretty" {
			if pretty {
				return nil, false, fmt.Errorf("--pretty may be provided only once")
			}
			pretty = true
			continue
		}
		filtered = append(filtered, arg)
	}
	return filtered, pretty, nil
}

func evolutionUsageError(stderr io.Writer, message string) int {
	return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, message, 2)
}

func evolutionInputError(stderr io.Writer, err error) int {
	var public *kernel.PublicError
	if errors.As(err, &public) {
		return writePublicCLIError(stderr, public, 2)
	}
	return evolutionUsageError(stderr, err.Error())
}
