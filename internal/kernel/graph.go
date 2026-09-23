package kernel

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type GraphQueryRequest struct {
	At     string          `json:"at"`
	Cypher string          `json:"cypher"`
	Params json.RawMessage `json:"params,omitempty"`
}

type GraphExecuteRequest struct {
	Branch  string          `json:"branch"`
	Cypher  string          `json:"cypher"`
	Params  json.RawMessage `json:"params,omitempty"`
	Author  *string         `json:"author,omitempty"`
	Message *string         `json:"message,omitempty"`
}

type GraphQueryResult struct {
	State   string              `json:"state"`
	Columns []string            `json:"columns"`
	Rows    [][]json.RawMessage `json:"rows"`
}

type GraphExecuteResult struct {
	State    string              `json:"state"`
	Columns  []string            `json:"columns"`
	Rows     [][]json.RawMessage `json:"rows"`
	Counters json.RawMessage     `json:"counters"`
}

type GraphStreamEvent struct {
	Type     string             `json:"type"`
	Columns  *[]string          `json:"columns,omitempty"`
	Row      *[]json.RawMessage `json:"row,omitempty"`
	State    *string            `json:"state,omitempty"`
	Counters json.RawMessage    `json:"counters,omitempty"`
}

type graphSummary struct {
	Commit   string
	Counters json.RawMessage
}

type graphStreamProjector struct {
	columns     []string
	seenColumns bool
}

func (service *Service) QueryGraph(ctx context.Context, request GraphQueryRequest) (GraphQueryResult, error) {
	params, err := validateGraphQueryRequest(request)
	if err != nil {
		return GraphQueryResult{}, err
	}
	result, err := service.database.Query(ctx, lithograph.QueryRequest{
		At:     request.At,
		Cypher: request.Cypher,
		Params: params,
	})
	if err != nil {
		return GraphQueryResult{}, graphPublicError(err)
	}
	if err := validateGraphRows(result.Result); err != nil {
		return GraphQueryResult{}, err
	}
	summary, err := decodeGraphSummary(result.Result.Summary)
	if err != nil {
		return GraphQueryResult{}, err
	}
	if summary.Commit != result.State {
		return GraphQueryResult{}, publicError(
			CodeInternal,
			"Lithograph query summary state does not match the pinned State",
			nil,
		)
	}
	return GraphQueryResult{State: result.State, Columns: result.Result.Columns, Rows: result.Result.Rows}, nil
}

func (service *Service) ExecuteGraph(
	ctx context.Context,
	request GraphExecuteRequest,
) (GraphExecuteResult, error) {
	params, err := validateGraphExecuteRequest(request)
	if err != nil {
		return GraphExecuteResult{}, err
	}
	result, err := service.database.Execute(ctx, lithograph.ExecuteRequest{
		Branch:  request.Branch,
		Cypher:  request.Cypher,
		Params:  params,
		Author:  request.Author,
		Message: request.Message,
	})
	if err != nil {
		return GraphExecuteResult{}, graphPublicError(err)
	}
	if err := validateGraphRows(result); err != nil {
		return GraphExecuteResult{}, err
	}
	summary, err := decodeGraphSummary(result.Summary)
	if err != nil {
		return GraphExecuteResult{}, err
	}
	return GraphExecuteResult{
		State:    summary.Commit,
		Columns:  result.Columns,
		Rows:     result.Rows,
		Counters: summary.Counters,
	}, nil
}

func (service *Service) StreamGraphQuery(
	ctx context.Context,
	request GraphQueryRequest,
	consume func(GraphStreamEvent) error,
) error {
	if consume == nil {
		return publicError(CodeInvalidArgument, "Graph stream consumer is required", nil)
	}
	params, err := validateGraphQueryRequest(request)
	if err != nil {
		return err
	}
	projector := &graphStreamProjector{}
	var consumerErr error
	_, err = service.database.StreamQuery(
		ctx,
		lithograph.QueryRequest{At: request.At, Cypher: request.Cypher, Params: params},
		func(state string, event lithograph.Event) error {
			projected, projectErr := projector.projectQuery(state, event)
			if projectErr != nil {
				return projectErr
			}
			consumerErr = consume(projected)
			return consumerErr
		},
	)
	if err == nil || (consumerErr != nil && errors.Is(err, consumerErr)) {
		return err
	}
	return graphPublicError(err)
}

func (service *Service) StreamGraphExecute(
	ctx context.Context,
	request GraphExecuteRequest,
	consume func(GraphStreamEvent) error,
) error {
	if consume == nil {
		return publicError(CodeInvalidArgument, "Graph stream consumer is required", nil)
	}
	params, err := validateGraphExecuteRequest(request)
	if err != nil {
		return err
	}
	projector := &graphStreamProjector{}
	var consumerErr error
	err = service.database.StreamExecute(
		ctx,
		lithograph.ExecuteRequest{
			Branch:  request.Branch,
			Cypher:  request.Cypher,
			Params:  params,
			Author:  request.Author,
			Message: request.Message,
		},
		func(event lithograph.Event) error {
			projected, projectErr := projector.projectExecute(event)
			if projectErr != nil {
				return projectErr
			}
			consumerErr = consume(projected)
			return consumerErr
		},
	)
	if err == nil || (consumerErr != nil && errors.Is(err, consumerErr)) {
		return err
	}
	return graphPublicError(err)
}

func graphPublicError(err error) *PublicError {
	if err == nil {
		return nil
	}
	var public *PublicError
	if errors.As(err, &public) {
		return public
	}
	message := err.Error()
	switch lithographCategory(message) {
	case "BRANCH_HEAD_MOVED":
		return publicError(CodeBranchHeadMoved, safeDatabaseMessage(message), err)
	case "MERGE_CONFLICT":
		return publicError(CodeMergeConflict, safeDatabaseMessage(message), err)
	case "MERGE_SESSION_NOT_FOUND":
		return publicError(CodeMergeSessionNotFound, safeDatabaseMessage(message), err)
	case "MERGE_SESSION_CHANGED":
		return publicError(CodeMergeSessionChanged, safeDatabaseMessage(message), err)
	default:
		return AsPublicError(err)
	}
}

func validateGraphQueryRequest(request GraphQueryRequest) (json.RawMessage, error) {
	if request.At == "" {
		return nil, publicError(CodeInvalidArgument, "Graph query at is required", nil)
	}
	if request.Cypher == "" {
		return nil, publicError(CodeInvalidArgument, "Graph query Cypher is required", nil)
	}
	if !utf8.ValidString(request.Cypher) {
		return nil, publicError(CodeParse, "Graph query Cypher must be valid UTF-8", nil)
	}
	return validateGraphParams(request.Params)
}

func validateGraphExecuteRequest(request GraphExecuteRequest) (json.RawMessage, error) {
	if request.Branch == "" {
		return nil, publicError(CodeInvalidArgument, "Graph execute branch is required", nil)
	}
	if request.Cypher == "" {
		return nil, publicError(CodeInvalidArgument, "Graph execute Cypher is required", nil)
	}
	if !utf8.ValidString(request.Cypher) {
		return nil, publicError(CodeParse, "Graph execute Cypher must be valid UTF-8", nil)
	}
	return validateGraphParams(request.Params)
}

func validateGraphParams(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || !json.Valid(trimmed) || trimmed[0] != '{' {
		return nil, publicError(CodeInvalidArgument, "Graph params must be a JSON object", nil)
	}
	return append(json.RawMessage(nil), trimmed...), nil
}

func validateGraphRows(result lithograph.Result) error {
	for index, row := range result.Rows {
		if len(row) != len(result.Columns) {
			return publicError(
				CodeInternal,
				fmt.Sprintf("Lithograph Graph row %d does not match its columns", index),
				nil,
			)
		}
	}
	return nil
}

func decodeGraphSummary(raw json.RawMessage) (graphSummary, error) {
	var payload struct {
		Commit   json.RawMessage `json:"commit"`
		Counters json.RawMessage `json:"counters"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &payload) != nil {
		return graphSummary{}, publicError(CodeInternal, "Lithograph Graph summary is malformed", nil)
	}
	var commit string
	if len(payload.Commit) == 0 || json.Unmarshal(payload.Commit, &commit) != nil || !isCanonicalCommitRef(commit) {
		return graphSummary{}, publicError(CodeInternal, "Lithograph Graph summary has an invalid commit", nil)
	}
	counters := bytes.TrimSpace(payload.Counters)
	if len(counters) == 0 || !json.Valid(counters) || counters[0] != '{' {
		return graphSummary{}, publicError(CodeInternal, "Lithograph Graph summary has invalid counters", nil)
	}
	return graphSummary{Commit: commit, Counters: append(json.RawMessage(nil), counters...)}, nil
}

func isCanonicalCommitRef(value string) bool {
	if !strings.HasPrefix(value, "commit/") || len(value) != len("commit/")+64 {
		return false
	}
	for _, character := range strings.TrimPrefix(value, "commit/") {
		if !strings.ContainsRune("0123456789abcdef", character) {
			return false
		}
	}
	return true
}

func (projector *graphStreamProjector) projectQuery(
	state string,
	event lithograph.Event,
) (GraphStreamEvent, error) {
	if event.Type != "summary" {
		return projector.projectData(event)
	}
	if !projector.seenColumns {
		return GraphStreamEvent{}, publicError(CodeInternal, "Lithograph Graph stream summary preceded columns", nil)
	}
	summary, err := decodeGraphSummary(event.Data)
	if err != nil {
		return GraphStreamEvent{}, err
	}
	if summary.Commit != state {
		return GraphStreamEvent{}, publicError(
			CodeInternal,
			"Lithograph query stream summary state does not match the pinned State",
			nil,
		)
	}
	return GraphStreamEvent{Type: "summary", State: &state}, nil
}

func (projector *graphStreamProjector) projectExecute(event lithograph.Event) (GraphStreamEvent, error) {
	if event.Type != "summary" {
		return projector.projectData(event)
	}
	if !projector.seenColumns {
		return GraphStreamEvent{}, publicError(CodeInternal, "Lithograph Graph stream summary preceded columns", nil)
	}
	summary, err := decodeGraphSummary(event.Data)
	if err != nil {
		return GraphStreamEvent{}, err
	}
	return GraphStreamEvent{
		Type:     "summary",
		State:    &summary.Commit,
		Counters: summary.Counters,
	}, nil
}

func (projector *graphStreamProjector) projectData(event lithograph.Event) (GraphStreamEvent, error) {
	switch event.Type {
	case "columns":
		if projector.seenColumns {
			return GraphStreamEvent{}, publicError(CodeInternal, "Lithograph Graph stream repeated columns", nil)
		}
		var columns []string
		if err := json.Unmarshal(event.Data, &columns); err != nil || columns == nil {
			return GraphStreamEvent{}, publicError(CodeInternal, "Lithograph Graph stream columns are malformed", err)
		}
		projector.columns = append([]string(nil), columns...)
		projector.seenColumns = true
		return GraphStreamEvent{Type: "columns", Columns: &columns}, nil
	case "row":
		if !projector.seenColumns {
			return GraphStreamEvent{}, publicError(CodeInternal, "Lithograph Graph stream row preceded columns", nil)
		}
		var row []json.RawMessage
		if err := json.Unmarshal(event.Data, &row); err != nil || row == nil {
			return GraphStreamEvent{}, publicError(CodeInternal, "Lithograph Graph stream row is malformed", err)
		}
		if len(row) != len(projector.columns) {
			return GraphStreamEvent{}, publicError(CodeInternal, "Lithograph Graph stream row does not match columns", nil)
		}
		return GraphStreamEvent{Type: "row", Row: &row}, nil
	default:
		return GraphStreamEvent{}, publicError(
			CodeInternal,
			fmt.Sprintf("Lithograph Graph stream emitted unknown event %q", event.Type),
			nil,
		)
	}
}
