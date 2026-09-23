package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"unicode/utf8"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const maxGraphCLIInputBytes = 16 << 20

type graphCLI struct {
	At            string
	Branch        string
	Cypher        string
	CypherFile    string
	Params        string
	ParamsFile    string
	Author        *string
	Message       *string
	Pretty        bool
	Stream        bool
	atSet         bool
	branchSet     bool
	cypherSet     bool
	cypherFileSet bool
	paramsSet     bool
	paramsFileSet bool
}

func runGraph(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout,
	stderr io.Writer,
) int {
	if hasHelp(args) {
		_, _ = io.WriteString(stdout, graphHelp(detectLocale()))
		return 0
	}
	if len(args) == 0 {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "graph subcommand is required", 2)
	}
	command := args[0]
	if command != "query" && command != "execute" {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "unknown graph subcommand", 2)
	}
	input, err := parseGraphCLI(command, args[1:])
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, err.Error(), 2)
	}
	cypher, code := loadGraphCypher(input, stdin, stdinIsTTY, stderr)
	if code != 0 {
		return code
	}
	params, code := loadGraphParams(input, stderr)
	if code != 0 {
		return code
	}
	target, code := resolveCLITarget(ctx, stderr)
	if code != 0 {
		return code
	}
	if command == "query" {
		request := kernel.GraphQueryRequest{At: input.At, Cypher: cypher, Params: params}
		if input.Stream {
			return runGraphStream(ctx, target, "/api/v1/graph/query", request, false, stdout, stderr)
		}
		return runGraphQueryJSON(ctx, target, request, input.Pretty, stdout, stderr)
	}
	request := kernel.GraphExecuteRequest{
		Branch: input.Branch, Cypher: cypher, Params: params, Author: input.Author, Message: input.Message,
	}
	if input.Stream {
		return runGraphStream(ctx, target, "/api/v1/graph/execute", request, true, stdout, stderr)
	}
	return runGraphExecuteJSON(ctx, target, request, input.Pretty, stdout, stderr)
}

func parseGraphCLI(command string, args []string) (graphCLI, error) {
	input := graphCLI{}
	for index := 0; index < len(args); index++ {
		arg := args[index]
		switch arg {
		case "--at":
			if input.atSet {
				return input, fmt.Errorf("--at may be provided only once")
			}
			value, next, err := nextCLIValue(args, index, "--at")
			if err != nil {
				return input, err
			}
			input.At, input.atSet, index = value, true, next
		case "--branch":
			if input.branchSet {
				return input, fmt.Errorf("--branch may be provided only once")
			}
			value, next, err := nextCLIValue(args, index, "--branch")
			if err != nil {
				return input, err
			}
			input.Branch, input.branchSet, index = value, true, next
		case "--cypher":
			if input.cypherSet {
				return input, fmt.Errorf("--cypher may be provided only once")
			}
			value, next, err := nextCLIValue(args, index, "--cypher")
			if err != nil {
				return input, err
			}
			input.Cypher, input.cypherSet, index = value, true, next
		case "--cypher-file":
			if input.cypherFileSet {
				return input, fmt.Errorf("--cypher-file may be provided only once")
			}
			value, next, err := nextCLIValue(args, index, "--cypher-file")
			if err != nil {
				return input, err
			}
			input.CypherFile, input.cypherFileSet, index = value, true, next
		case "--params":
			if input.paramsSet {
				return input, fmt.Errorf("--params may be provided only once")
			}
			value, next, err := nextCLIValue(args, index, "--params")
			if err != nil {
				return input, err
			}
			input.Params, input.paramsSet, index = value, true, next
		case "--params-file":
			if input.paramsFileSet {
				return input, fmt.Errorf("--params-file may be provided only once")
			}
			value, next, err := nextCLIValue(args, index, "--params-file")
			if err != nil {
				return input, err
			}
			input.ParamsFile, input.paramsFileSet, index = value, true, next
		case "--author":
			value, next, err := nextCLIValue(args, index, "--author")
			if err != nil {
				return input, err
			}
			if input.Author != nil {
				return input, fmt.Errorf("--author may be provided only once")
			}
			input.Author, index = &value, next
		case "--message":
			value, next, err := nextCLIValue(args, index, "--message")
			if err != nil {
				return input, err
			}
			if input.Message != nil {
				return input, fmt.Errorf("--message may be provided only once")
			}
			input.Message, index = &value, next
		case "--pretty":
			if input.Pretty {
				return input, fmt.Errorf("--pretty may be provided only once")
			}
			input.Pretty = true
		case "--stream":
			if input.Stream {
				return input, fmt.Errorf("--stream may be provided only once")
			}
			input.Stream = true
		default:
			return input, fmt.Errorf("unknown graph %s option %q", command, arg)
		}
	}
	if input.cypherSet && input.cypherFileSet {
		return input, fmt.Errorf("--cypher and --cypher-file are mutually exclusive")
	}
	if input.paramsSet && input.paramsFileSet {
		return input, fmt.Errorf("--params and --params-file are mutually exclusive")
	}
	if input.Pretty && input.Stream {
		return input, fmt.Errorf("--pretty and --stream are mutually exclusive")
	}
	if command == "query" {
		if input.At == "" {
			return input, fmt.Errorf("--at is required")
		}
		if input.branchSet || input.Author != nil || input.Message != nil {
			return input, fmt.Errorf("graph query does not accept --branch, --author, or --message")
		}
	} else {
		if input.Branch == "" {
			return input, fmt.Errorf("--branch is required")
		}
		if input.atSet {
			return input, fmt.Errorf("graph execute does not accept --at")
		}
	}
	return input, nil
}

func loadGraphCypher(input graphCLI, stdin io.Reader, stdinIsTTY bool, stderr io.Writer) (string, int) {
	if input.cypherSet {
		return validateGraphCypher([]byte(input.Cypher), "Cypher", stderr)
	}
	if input.cypherFileSet {
		file, err := os.Open(input.CypherFile)
		if err != nil {
			return "", writeLocalCLIError(stderr, kernel.CodeIO, "read --cypher-file failed", 2)
		}
		defer file.Close()
		return readGraphCypher(file, "Cypher file", stderr)
	}
	if stdinIsTTY {
		return "", writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "Cypher input is required", 2)
	}
	return readGraphCypher(stdin, "Cypher stdin", stderr)
}

func readGraphCypher(reader io.Reader, source string, stderr io.Writer) (string, int) {
	body, err := io.ReadAll(io.LimitReader(reader, maxGraphCLIInputBytes+1))
	if err != nil {
		return "", writeLocalCLIError(stderr, kernel.CodeIO, "read "+source+" failed", 2)
	}
	if len(body) > maxGraphCLIInputBytes {
		return "", writeLocalCLIError(stderr, kernel.CodeResource, source+" exceeds resource limit", 2)
	}
	return validateGraphCypher(body, source, stderr)
}

func validateGraphCypher(body []byte, source string, stderr io.Writer) (string, int) {
	if len(body) == 0 {
		return "", writeLocalCLIError(stderr, kernel.CodeInvalidArgument, source+" is empty", 2)
	}
	if !utf8.Valid(body) {
		return "", writeLocalCLIError(stderr, kernel.CodeParse, source+" is not valid UTF-8 text", 2)
	}
	return string(body), 0
}

func loadGraphParams(input graphCLI, stderr io.Writer) (json.RawMessage, int) {
	if !input.paramsSet && !input.paramsFileSet {
		return nil, 0
	}
	var body []byte
	if input.paramsSet {
		body = []byte(input.Params)
	} else {
		file, err := os.Open(input.ParamsFile)
		if err != nil {
			return nil, writeLocalCLIError(stderr, kernel.CodeIO, "read --params-file failed", 2)
		}
		defer file.Close()
		body, err = io.ReadAll(io.LimitReader(file, maxGraphCLIInputBytes+1))
		if err != nil {
			return nil, writeLocalCLIError(stderr, kernel.CodeIO, "read --params-file failed", 2)
		}
		if len(body) > maxGraphCLIInputBytes {
			return nil, writeLocalCLIError(stderr, kernel.CodeResource, "params file exceeds resource limit", 2)
		}
	}
	if !utf8.Valid(body) || !json.Valid(body) {
		return nil, writeLocalCLIError(stderr, kernel.CodeParse, "params must be valid UTF-8 JSON", 2)
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return nil, writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "params must be a JSON object", 2)
	}
	return append(json.RawMessage(nil), trimmed...), 0
}

func runGraphQueryJSON(
	ctx context.Context,
	target cliTarget,
	request kernel.GraphQueryRequest,
	pretty bool,
	stdout,
	stderr io.Writer,
) int {
	body, _, publicErr, transportErr := doAPIRequest(
		ctx, target.Endpoint, target.Token, "/api/v1/graph/query", "application/json", request,
	)
	if transportErr != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	if publicErr != nil {
		return writePublicCLIError(stderr, publicErr, 1)
	}
	var result kernel.GraphQueryResult
	if err := json.Unmarshal(body, &result); err != nil || !validGraphQueryResult(result) {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Graph query response", 3)
	}
	encoded, err := marshalCLIJSON(result, pretty)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "encode Graph query response failed", 3)
	}
	if _, err := stdout.Write(encoded); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "write stdout failed", 3)
	}
	return 0
}

func runGraphExecuteJSON(
	ctx context.Context,
	target cliTarget,
	request kernel.GraphExecuteRequest,
	pretty bool,
	stdout,
	stderr io.Writer,
) int {
	body, _, publicErr, transportErr := doAPIRequest(
		ctx, target.Endpoint, target.Token, "/api/v1/graph/execute", "application/json", request,
	)
	if transportErr != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	if publicErr != nil {
		return writePublicCLIError(stderr, publicErr, 1)
	}
	var result kernel.GraphExecuteResult
	if err := json.Unmarshal(body, &result); err != nil || !validGraphExecuteResult(result) {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Graph execute response", 3)
	}
	encoded, err := marshalCLIJSON(result, pretty)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "encode Graph execute response failed", 3)
	}
	if _, err := stdout.Write(encoded); err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "write stdout failed", 3)
	}
	return 0
}

func validGraphQueryResult(result kernel.GraphQueryResult) bool {
	if !isResolvedState(result.State) || result.Columns == nil || result.Rows == nil {
		return false
	}
	for _, row := range result.Rows {
		if len(row) != len(result.Columns) {
			return false
		}
	}
	return true
}

func validGraphExecuteResult(result kernel.GraphExecuteResult) bool {
	if !validGraphQueryResult(kernel.GraphQueryResult{
		State: result.State, Columns: result.Columns, Rows: result.Rows,
	}) {
		return false
	}
	counters := bytes.TrimSpace(result.Counters)
	return len(counters) != 0 && json.Valid(counters) && counters[0] == '{'
}

func runGraphStream(
	ctx context.Context,
	target cliTarget,
	path string,
	input any,
	execute bool,
	stdout,
	stderr io.Writer,
) int {
	payload, err := json.Marshal(input)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "encode Graph request failed", 3)
	}
	request, err := http.NewRequestWithContext(
		ctx, http.MethodPost, target.Endpoint+path, bytes.NewReader(payload),
	)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "create Graph request failed", 3)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/x-ndjson")
	request.Header.Set("Authorization", "Bearer "+target.Token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return graphHTTPError(response, stderr)
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/x-ndjson" {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Graph stream content type", 3)
	}
	return consumeGraphStream(response.Body, execute, stdout, stderr)
}

func graphHTTPError(response *http.Response, stderr io.Writer) int {
	body, err := io.ReadAll(io.LimitReader(response.Body, maxGraphCLIInputBytes+1))
	if err != nil || len(body) > maxGraphCLIInputBytes {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon transport failed", 3)
	}
	var public kernel.PublicError
	if err := json.Unmarshal(body, &public); err != nil || public.Code == "" {
		return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned a malformed error response", 3)
	}
	return writePublicCLIError(stderr, &public, 1)
}

func consumeGraphStream(body io.Reader, execute bool, stdout, stderr io.Writer) int {
	reader := bufio.NewReader(body)
	seenColumns := false
	columnCount := 0
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			if len(line) != 0 {
				return writeLocalCLIError(stderr, kernel.CodeIO, "Graph stream ended with an incomplete event", 3)
			}
			if err == io.EOF {
				return writeLocalCLIError(stderr, kernel.CodeIO, "Graph stream ended without a terminal event", 3)
			}
			return writeLocalCLIError(stderr, kernel.CodeIO, "Graph stream transport failed", 3)
		}
		raw := bytes.TrimSuffix(line, []byte{'\n'})
		var envelope struct {
			Type string `json:"type"`
		}
		if len(raw) == 0 || json.Unmarshal(raw, &envelope) != nil {
			return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned a malformed Graph stream event", 3)
		}
		switch envelope.Type {
		case "columns":
			var event struct {
				Type    string   `json:"type"`
				Columns []string `json:"columns"`
			}
			if seenColumns || json.Unmarshal(raw, &event) != nil || event.Columns == nil {
				return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned invalid Graph stream columns", 3)
			}
			seenColumns = true
			columnCount = len(event.Columns)
			if _, err := stdout.Write(line); err != nil {
				return writeLocalCLIError(stderr, kernel.CodeIO, "write stdout failed", 3)
			}
		case "row":
			if !seenColumns {
				return writeLocalCLIError(stderr, kernel.CodeIO, "Graph stream row preceded columns", 3)
			}
			var event struct {
				Type string            `json:"type"`
				Row  []json.RawMessage `json:"row"`
			}
			if json.Unmarshal(raw, &event) != nil || event.Row == nil || len(event.Row) != columnCount {
				return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Graph stream row", 3)
			}
			if _, err := stdout.Write(line); err != nil {
				return writeLocalCLIError(stderr, kernel.CodeIO, "write stdout failed", 3)
			}
		case "summary":
			if !seenColumns || !validGraphStreamSummary(raw, execute) {
				return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Graph stream summary", 3)
			}
			extra, tailErr := reader.ReadBytes('\n')
			if len(extra) != 0 || tailErr != io.EOF {
				return writeLocalCLIError(stderr, kernel.CodeIO, "Graph stream emitted data after terminal summary", 3)
			}
			if _, err := stdout.Write(line); err != nil {
				return writeLocalCLIError(stderr, kernel.CodeIO, "write stdout failed", 3)
			}
			return 0
		case "error":
			if !seenColumns {
				return writeLocalCLIError(stderr, kernel.CodeIO, "Graph stream error preceded columns", 3)
			}
			var event struct {
				Type  string             `json:"type"`
				Error kernel.PublicError `json:"error"`
			}
			if json.Unmarshal(raw, &event) != nil || event.Error.Code == "" {
				return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an invalid Graph stream error", 3)
			}
			return writePublicCLIError(stderr, &event.Error, 1)
		default:
			return writeLocalCLIError(stderr, kernel.CodeIO, "daemon returned an unknown Graph stream event", 3)
		}
	}
}

func validGraphStreamSummary(raw []byte, execute bool) bool {
	var event struct {
		Type     string          `json:"type"`
		State    string          `json:"state"`
		Counters json.RawMessage `json:"counters"`
	}
	if json.Unmarshal(raw, &event) != nil || event.Type != "summary" || !isResolvedState(event.State) {
		return false
	}
	if !execute {
		return len(event.Counters) == 0
	}
	counters := bytes.TrimSpace(event.Counters)
	return len(counters) != 0 && json.Valid(counters) && counters[0] == '{'
}
