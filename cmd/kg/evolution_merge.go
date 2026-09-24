package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

type mergeResolutionsCLI struct {
	Inline    string
	File      string
	inlineSet bool
	fileSet   bool
}

func runEvolutionMerge(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	pretty bool,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if len(args) == 0 {
		return evolutionUsageError(stderr, "merge command is required")
	}
	switch args[0] {
	case "start":
		request, err := parseEvolutionMergeStart(args[1:])
		if err != nil {
			return evolutionUsageError(stderr, err.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/merge/start", request, pretty, stdout, stderr)
	case "list":
		page, err := parseEvolutionPageOptions(args[1:])
		if err != nil {
			return evolutionUsageError(stderr, err.Error())
		}
		request := kernel.MergeListRequest{Limit: page.Limit, Cursor: page.Cursor}
		return runEvolutionRequest(ctx, "/api/v1/evolution/merge/list", request, pretty, stdout, stderr)
	case "get":
		if len(args) != 2 || strings.HasPrefix(args[1], "-") {
			return evolutionUsageError(stderr, "merge get requires exactly one session")
		}
		request := kernel.MergeGetRequest{Session: args[1]}
		return runEvolutionRequest(ctx, "/api/v1/evolution/merge/get", request, pretty, stdout, stderr)
	case "conflicts":
		request, err := parseEvolutionMergeConflicts(args[1:])
		if err != nil {
			return evolutionUsageError(stderr, err.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/merge/conflicts", request, pretty, stdout, stderr)
	case "resolve":
		request, err := parseEvolutionMergeResolve(args[1:], stdin, stdinIsTTY)
		if err != nil {
			return evolutionInputError(stderr, err)
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/merge/resolve", request, pretty, stdout, stderr)
	case "finalize":
		request, err := parseEvolutionMergeFinalize(args[1:])
		if err != nil {
			return evolutionUsageError(stderr, err.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/merge/finalize", request, pretty, stdout, stderr)
	case "abort":
		request, err := parseEvolutionMergeAbort(args[1:])
		if err != nil {
			return evolutionUsageError(stderr, err.Error())
		}
		return runEvolutionRequest(ctx, "/api/v1/evolution/merge/abort", request, pretty, stdout, stderr)
	default:
		return evolutionUsageError(stderr, fmt.Sprintf("unknown evolution merge command %q", args[0]))
	}
}

func parseEvolutionMergeStart(args []string) (kernel.MergeStartRequest, error) {
	request := kernel.MergeStartRequest{}
	for index := 0; index < len(args); index++ {
		switch args[index] {
		case "--branch":
			value, next, err := nextUniqueCLIValue(args, index, "--branch", request.Branch)
			if err != nil {
				return request, err
			}
			request.Branch = value
			index = next
		case "--source":
			value, next, err := nextUniqueCLIValue(args, index, "--source", request.Source)
			if err != nil {
				return request, err
			}
			request.Source = value
			index = next
		default:
			return request, fmt.Errorf("unknown merge start option %q", args[index])
		}
	}
	if request.Branch == "" || request.Source == "" {
		return request, fmt.Errorf("merge start requires --branch and --source")
	}
	return request, nil
}

func parseEvolutionMergeConflicts(args []string) (kernel.MergeConflictsRequest, error) {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return kernel.MergeConflictsRequest{}, fmt.Errorf("merge conflicts requires a session")
	}
	page, err := parseEvolutionPageOptions(args[1:])
	if err != nil {
		return kernel.MergeConflictsRequest{}, err
	}
	return kernel.MergeConflictsRequest{
		Session: args[0], Limit: page.Limit, Cursor: page.Cursor,
	}, nil
}

func parseEvolutionMergeResolve(
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
) (kernel.MergeResolveRequest, error) {
	request := kernel.MergeResolveRequest{}
	input := mergeResolutionsCLI{}
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return request, fmt.Errorf("merge resolve requires a session")
	}
	request.Session = args[0]
	for index := 1; index < len(args); index++ {
		switch args[index] {
		case "--expected-revision":
			next, err := parseMergeExpectedRevisionOption(
				args, index, &request.ExpectedRevision,
			)
			if err != nil {
				return request, err
			}
			index = next
		default:
			next, handled, err := parseMergeResolutionsOption(args, index, &input)
			if err != nil {
				return request, err
			}
			if !handled {
				return request, fmt.Errorf("unknown merge resolve option %q", args[index])
			}
			index = next
		}
	}
	if request.ExpectedRevision == 0 {
		return request, fmt.Errorf("merge resolve requires --expected-revision")
	}
	if input.inlineSet && input.fileSet {
		return request, fmt.Errorf("--resolutions and --resolutions-file are mutually exclusive")
	}
	if !input.inlineSet && !input.fileSet && stdinIsTTY {
		return request, fmt.Errorf("merge resolve requires --resolutions, --resolutions-file, or non-TTY stdin")
	}
	body, err := loadMergeResolutionsJSON(input, stdin, stdinIsTTY)
	if err != nil {
		return request, err
	}
	request.Resolutions, err = decodeMergeResolutions(body)
	if err != nil {
		return request, err
	}
	return request, nil
}

func parseEvolutionMergeFinalize(args []string) (kernel.MergeFinalizeRequest, error) {
	request := kernel.MergeFinalizeRequest{}
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return request, fmt.Errorf("merge finalize requires a session")
	}
	request.Session = args[0]
	for index := 1; index < len(args); index++ {
		switch args[index] {
		case "--expected-revision":
			next, err := parseMergeExpectedRevisionOption(
				args, index, &request.ExpectedRevision,
			)
			if err != nil {
				return request, err
			}
			index = next
		case "--author":
			next, err := parseOptionalCLITextOption(args, index, "--author", &request.Author)
			if err != nil {
				return request, err
			}
			index = next
		case "--message":
			next, err := parseOptionalCLITextOption(args, index, "--message", &request.Message)
			if err != nil {
				return request, err
			}
			index = next
		default:
			return request, fmt.Errorf("unknown merge finalize option %q", args[index])
		}
	}
	if request.ExpectedRevision == 0 {
		return request, fmt.Errorf("merge finalize requires --expected-revision")
	}
	return request, nil
}

func parseEvolutionMergeAbort(args []string) (kernel.MergeAbortRequest, error) {
	request := kernel.MergeAbortRequest{}
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return request, fmt.Errorf("merge abort requires a session")
	}
	request.Session = args[0]
	revision, err := parseSingleNamedOption(args[1:], "--expected-revision")
	if err != nil {
		return request, err
	}
	request.ExpectedRevision, err = parseMergeRevision(revision)
	return request, err
}

func parseMergeRevision(raw string) (int64, error) {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 1 {
		return 0, fmt.Errorf("--expected-revision must be a positive integer")
	}
	return value, nil
}

func parseMergeExpectedRevisionOption(
	args []string,
	index int,
	target *int64,
) (int, error) {
	if *target != 0 {
		return index, fmt.Errorf("--expected-revision may be provided only once")
	}
	value, next, err := nextCLIValue(args, index, "--expected-revision")
	if err != nil {
		return index, err
	}
	*target, err = parseMergeRevision(value)
	return next, err
}

func parseMergeResolutionsOption(
	args []string,
	index int,
	input *mergeResolutionsCLI,
) (int, bool, error) {
	switch args[index] {
	case "--resolutions":
		if input.inlineSet {
			return index, true, fmt.Errorf("--resolutions may be provided only once")
		}
		value, next, err := nextCLIValue(args, index, "--resolutions")
		if err != nil {
			return index, true, err
		}
		input.Inline, input.inlineSet = value, true
		return next, true, nil
	case "--resolutions-file":
		if input.fileSet {
			return index, true, fmt.Errorf("--resolutions-file may be provided only once")
		}
		value, next, err := nextCLIValue(args, index, "--resolutions-file")
		if err != nil {
			return index, true, err
		}
		input.File, input.fileSet = value, true
		return next, true, nil
	default:
		return index, false, nil
	}
}

func loadMergeResolutionsJSON(
	input mergeResolutionsCLI,
	stdin io.Reader,
	stdinIsTTY bool,
) (json.RawMessage, error) {
	var reader io.Reader
	switch {
	case input.inlineSet:
		reader = strings.NewReader(input.Inline)
	case input.fileSet:
		file, err := os.Open(input.File)
		if err != nil {
			return nil, &kernel.PublicError{
				Code: kernel.CodeIO, Message: "read --resolutions-file failed",
			}
		}
		defer file.Close()
		reader = file
	default:
		if stdin == nil || stdinIsTTY {
			return nil, fmt.Errorf("resolutions JSON is required")
		}
		reader = stdin
	}
	body, err := io.ReadAll(io.LimitReader(reader, maxEvolutionCLIInputBytes+1))
	if err != nil {
		return nil, &kernel.PublicError{
			Code: kernel.CodeIO, Message: "read resolutions JSON failed",
		}
	}
	if len(body) > maxEvolutionCLIInputBytes {
		return nil, &kernel.PublicError{
			Code: kernel.CodeResource, Message: "resolutions JSON exceeds resource limit",
		}
	}
	body = bytes.TrimSpace(body)
	if len(body) == 0 || !json.Valid(body) || body[0] != '[' {
		return nil, &kernel.PublicError{
			Code: kernel.CodeParse, Message: "resolutions must contain exactly one valid JSON array",
		}
	}
	return append(json.RawMessage(nil), body...), nil
}

func decodeMergeResolutions(body json.RawMessage) ([]kernel.MergeResolution, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var resolutions []kernel.MergeResolution
	if err := decoder.Decode(&resolutions); err != nil || resolutions == nil {
		return nil, &kernel.PublicError{
			Code: kernel.CodeParse, Message: "resolutions must be a JSON array with valid resolution objects",
		}
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, &kernel.PublicError{
			Code: kernel.CodeParse, Message: "resolutions must contain exactly one JSON array",
		}
	}
	return resolutions, nil
}
