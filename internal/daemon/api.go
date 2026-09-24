package daemon

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

const maxAPIRequestBytes = 16 << 20

func NewHandler(runtime *runtimehost.Runtime, fallback http.Handler) http.Handler {
	if fallback == nil {
		fallback = http.NotFoundHandler()
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/graph/query", func(response http.ResponseWriter, request *http.Request) {
		var input kernel.GraphQueryRequest
		mediaType, ok := prepareGraphRequest(
			response, request, runtime.Credential.Token, &input,
		)
		if !ok {
			return
		}
		if mediaType == "application/x-ndjson" {
			writeGraphStream(response, func(consume func(kernel.GraphStreamEvent) error) error {
				return runtime.Kernel.StreamGraphQuery(request.Context(), input, consume)
			})
			return
		}
		result, err := runtime.Kernel.QueryGraph(request.Context(), input)
		if err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, result)
	})
	mux.HandleFunc("/api/v1/graph/execute", func(response http.ResponseWriter, request *http.Request) {
		var input kernel.GraphExecuteRequest
		mediaType, ok := prepareGraphRequest(
			response, request, runtime.Credential.Token, &input,
		)
		if !ok {
			return
		}
		if mediaType == "application/x-ndjson" {
			writeGraphStream(response, func(consume func(kernel.GraphStreamEvent) error) error {
				return runtime.Kernel.StreamGraphExecute(request.Context(), input, consume)
			})
			return
		}
		result, err := runtime.Kernel.ExecuteGraph(request.Context(), input)
		if err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, result)
	})
	patchHandler := func(
		apply func(context.Context, kernel.PatchRequest) (kernel.PatchResult, error),
	) http.HandlerFunc {
		return func(response http.ResponseWriter, request *http.Request) {
			if !authenticate(response, request, runtime.Credential.Token) {
				return
			}
			if request.Method != http.MethodPost {
				writeMethodNotAllowed(response)
				return
			}
			var input kernel.PatchRequest
			if err := decodeJSONRequest(response, request, &input); err != nil {
				kernel.WriteJSONError(response, err)
				return
			}
			result, err := apply(request.Context(), input)
			if err != nil {
				kernel.WriteJSONError(response, err)
				return
			}
			writeJSON(response, http.StatusOK, result)
		}
	}
	mux.HandleFunc("/api/v1/object/read", func(response http.ResponseWriter, request *http.Request) {
		if !authenticate(response, request, runtime.Credential.Token) {
			return
		}
		if request.Method != http.MethodPost {
			writeMethodNotAllowed(response)
			return
		}
		var input kernel.ObjectReadRequest
		if err := decodeJSONRequest(response, request, &input); err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		result, err := runtime.Kernel.ReadObjects(request.Context(), input)
		if err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, result)
	})
	mux.HandleFunc("/api/v1/object/patch", patchHandler(runtime.Kernel.PatchObjects))
	mux.HandleFunc("/api/v1/ontology/read", func(response http.ResponseWriter, request *http.Request) {
		if !authenticate(response, request, runtime.Credential.Token) {
			return
		}
		if request.Method != http.MethodPost {
			writeMethodNotAllowed(response)
			return
		}
		var input kernel.OntologyReadRequest
		if err := decodeJSONRequest(response, request, &input); err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		result, err := runtime.Kernel.ReadOntology(request.Context(), input)
		if err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, result)
	})
	mux.HandleFunc("/api/v1/ontology/object", func(response http.ResponseWriter, request *http.Request) {
		if !authenticate(response, request, runtime.Credential.Token) {
			return
		}
		if request.Method != http.MethodPost {
			writeMethodNotAllowed(response)
			return
		}
		var input struct {
			At  string `json:"at"`
			Ref string `json:"ref"`
		}
		if err := decodeJSONRequest(response, request, &input); err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		body, err := runtime.Kernel.ReadObject(request.Context(), input.At, input.Ref)
		if err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		mediaType, err := requestedObjectMediaType(request.Header.Get("Accept"))
		if err != nil {
			writeJSONErrorStatus(response, http.StatusNotAcceptable, err)
			return
		}
		response.Header().Set("X-KGOS-State", body.State)
		response.Header().Set("X-KGOS-Ref", body.Ref)
		response.Header().Set("X-KGOS-Kind", string(body.Kind))
		response.Header().Set("X-Content-Type-Options", "nosniff")
		switch mediaType {
		case "application/yaml":
			response.Header().Set("Content-Type", "application/yaml; charset=utf-8")
			response.WriteHeader(http.StatusOK)
			_, _ = response.Write(body.YAML)
		default:
			response.Header().Set("Content-Type", "application/json; charset=utf-8")
			response.WriteHeader(http.StatusOK)
			_, _ = response.Write(body.JSON)
		}
	})
	mux.HandleFunc("/api/v1/ontology/patch", patchHandler(runtime.Kernel.PatchOntology))
	mux.HandleFunc("/api/v1/evolution/overview", postJSONHandler(
		runtime.Credential.Token,
		func(ctx context.Context, _ struct{}) (kernel.EvolutionOverviewResult, error) {
			return runtime.Kernel.EvolutionOverview(ctx)
		},
	))
	mux.HandleFunc("/api/v1/evolution/get", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionGet))
	mux.HandleFunc("/api/v1/evolution/ancestry", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionAncestry))
	mux.HandleFunc("/api/v1/evolution/history", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionHistory))
	mux.HandleFunc("/api/v1/evolution/diff", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionDiff))
	mux.HandleFunc("/api/v1/evolution/state/create", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionStateCreate))
	mux.HandleFunc("/api/v1/evolution/state/set-data", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionStateSetData))
	mux.HandleFunc("/api/v1/evolution/state/clear-data", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionStateClearData))
	mux.HandleFunc("/api/v1/evolution/branch/list", postJSONHandler(
		runtime.Credential.Token,
		func(ctx context.Context, _ struct{}) (kernel.EvolutionRefListResult, error) {
			return runtime.Kernel.EvolutionBranchList(ctx)
		},
	))
	mux.HandleFunc("/api/v1/evolution/branch/create", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionBranchCreate))
	mux.HandleFunc("/api/v1/evolution/branch/delete", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionBranchDelete))
	mux.HandleFunc("/api/v1/evolution/tag/list", postJSONHandler(
		runtime.Credential.Token,
		func(ctx context.Context, _ struct{}) (kernel.EvolutionRefListResult, error) {
			return runtime.Kernel.EvolutionTagList(ctx)
		},
	))
	mux.HandleFunc("/api/v1/evolution/tag/create", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionTagCreate))
	mux.HandleFunc("/api/v1/evolution/tag/move", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionTagMove))
	mux.HandleFunc("/api/v1/evolution/tag/delete", postJSONHandler(runtime.Credential.Token, runtime.Kernel.EvolutionTagDelete))
	mux.Handle("/", fallback)
	return mux
}

func postJSONHandler[Request any, Result any](
	token string,
	execute func(context.Context, Request) (Result, error),
) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if !authenticate(response, request, token) {
			return
		}
		if request.Method != http.MethodPost {
			writeMethodNotAllowed(response)
			return
		}
		var input Request
		if err := decodeJSONRequest(response, request, &input); err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		result, err := execute(request.Context(), input)
		if err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, result)
	}
}

func prepareGraphRequest(
	response http.ResponseWriter,
	request *http.Request,
	token string,
	target any,
) (string, bool) {
	if !authenticate(response, request, token) {
		return "", false
	}
	if request.Method != http.MethodPost {
		writeMethodNotAllowed(response)
		return "", false
	}
	if err := decodeJSONRequest(response, request, target); err != nil {
		kernel.WriteJSONError(response, err)
		return "", false
	}
	mediaType, err := requestedGraphMediaType(request.Header.Get("Accept"))
	if err != nil {
		writeJSONErrorStatus(response, http.StatusNotAcceptable, err)
		return "", false
	}
	return mediaType, true
}

type acceptMediaRange struct {
	mediaType string
	quality   float64
	order     int
}

type acceptCandidate struct {
	mediaType   string
	quality     float64
	order       int
	specificity int
}

func parseAcceptRanges(accept string) []acceptMediaRange {
	ranges := make([]acceptMediaRange, 0)
	for order, rawRange := range strings.Split(accept, ",") {
		rawRange = strings.TrimSpace(rawRange)
		if rawRange == "" {
			continue
		}
		mediaType, params, err := mime.ParseMediaType(rawRange)
		if err != nil {
			continue
		}
		quality := 1.0
		if rawQ, ok := params["q"]; ok {
			parsed, parseErr := strconv.ParseFloat(rawQ, 64)
			if parseErr != nil || parsed < 0 || parsed > 1 {
				continue
			}
			quality = parsed
		}
		ranges = append(ranges, acceptMediaRange{
			mediaType: mediaType,
			quality:   quality,
			order:     order,
		})
	}
	return ranges
}

func resolveAcceptCandidate(ranges []acceptMediaRange, representation string) acceptCandidate {
	best := acceptCandidate{
		mediaType:   representation,
		quality:     -1,
		order:       int(^uint(0) >> 1),
		specificity: -1,
	}
	for _, mediaRange := range ranges {
		specificity := -1
		switch {
		case mediaRange.mediaType == representation:
			specificity = 2
		case mediaRange.mediaType == "application/*":
			specificity = 1
		case mediaRange.mediaType == "*/*":
			specificity = 0
		}
		if specificity < 0 || specificity < best.specificity {
			continue
		}
		if specificity > best.specificity ||
			mediaRange.quality > best.quality ||
			(mediaRange.quality == best.quality && mediaRange.order < best.order) {
			best.specificity = specificity
			best.quality = mediaRange.quality
			best.order = mediaRange.order
		}
	}
	return best
}

func requestedGraphMediaType(accept string) (string, error) {
	if strings.TrimSpace(accept) == "" {
		return "application/json", nil
	}
	ranges := parseAcceptRanges(accept)
	jsonCandidate := resolveAcceptCandidate(ranges, "application/json")
	streamCandidate := resolveAcceptCandidate(ranges, "application/x-ndjson")
	if jsonCandidate.quality <= 0 && streamCandidate.quality <= 0 {
		return "", &kernel.PublicError{
			Code:    kernel.CodeInvalidArgument,
			Message: "Accept must allow application/json or application/x-ndjson",
		}
	}
	if streamCandidate.quality > jsonCandidate.quality {
		return "application/x-ndjson", nil
	}
	return "application/json", nil
}

type graphStreamWriteError struct {
	err error
}

func (err *graphStreamWriteError) Error() string { return err.err.Error() }
func (err *graphStreamWriteError) Unwrap() error { return err.err }

type graphHTTPStream struct {
	response   http.ResponseWriter
	controller *http.ResponseController
	started    bool
	terminal   bool
}

func writeGraphStream(
	response http.ResponseWriter,
	stream func(func(kernel.GraphStreamEvent) error) error,
) {
	_, ok := response.(http.Flusher)
	if !ok {
		kernel.WriteJSONError(response, &kernel.PublicError{
			Code:    kernel.CodeInternal,
			Message: "HTTP streaming is unavailable",
		})
		return
	}
	output := &graphHTTPStream{
		response:   response,
		controller: http.NewResponseController(response),
	}
	err := stream(output.writeEvent)
	if err == nil {
		if !output.terminal {
			public := &kernel.PublicError{
				Code:    kernel.CodeInternal,
				Message: "Graph stream ended without a terminal event",
			}
			if !output.started {
				kernel.WriteJSONError(response, public)
				return
			}
			_ = output.writeError(public)
		}
		return
	}
	var writeErr *graphStreamWriteError
	if errors.As(err, &writeErr) {
		return
	}
	if !output.started {
		kernel.WriteJSONError(response, err)
		return
	}
	if !output.terminal {
		_ = output.writeError(kernel.AsPublicError(err))
	}
}

func (stream *graphHTTPStream) writeEvent(event kernel.GraphStreamEvent) error {
	if stream.terminal {
		return &graphStreamWriteError{err: errors.New("graph stream emitted data after terminal event")}
	}
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if event.Type == "summary" {
		stream.terminal = true
	}
	return stream.writeLine(body)
}

func (stream *graphHTTPStream) writeError(public *kernel.PublicError) error {
	if stream.terminal {
		return nil
	}
	body, err := json.Marshal(struct {
		Type  string              `json:"type"`
		Error *kernel.PublicError `json:"error"`
	}{Type: "error", Error: public})
	if err != nil {
		return err
	}
	stream.terminal = true
	return stream.writeLine(body)
}

func (stream *graphHTTPStream) writeLine(body []byte) error {
	line := append(bytes.Clone(body), '\n')
	if !stream.started {
		stream.response.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
		stream.response.Header().Set("X-Content-Type-Options", "nosniff")
		stream.response.WriteHeader(http.StatusOK)
		stream.started = true
	}
	written, err := stream.response.Write(line)
	if err != nil {
		return &graphStreamWriteError{err: err}
	}
	if written != len(line) {
		return &graphStreamWriteError{err: io.ErrShortWrite}
	}
	if err := stream.controller.Flush(); err != nil {
		return &graphStreamWriteError{err: err}
	}
	return nil
}

func authenticate(response http.ResponseWriter, request *http.Request, expected string) bool {
	header := request.Header.Get("Authorization")
	provided := ""
	fields := strings.Fields(header)
	if len(fields) == 2 && strings.EqualFold(fields[0], "Bearer") {
		provided = fields[1]
	}
	validShape := provided != "" && !strings.ContainsAny(provided, " \t\r\n")
	providedDigest := sha256.Sum256([]byte(provided))
	expectedDigest := sha256.Sum256([]byte(expected))
	validToken := subtle.ConstantTimeCompare(providedDigest[:], expectedDigest[:]) == 1
	if validShape && validToken {
		return true
	}
	response.Header().Set("WWW-Authenticate", "Bearer")
	kernel.WriteJSONError(response, &kernel.PublicError{
		Code:    kernel.CodeAuthenticationFailed,
		Message: "authentication failed",
	})
	return false
}

func decodeJSONRequest(response http.ResponseWriter, request *http.Request, target any) error {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return &kernel.PublicError{
			Code:    kernel.CodeInvalidArgument,
			Message: "Content-Type must be application/json",
		}
	}
	request.Body = http.MaxBytesReader(response, request.Body, maxAPIRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return &kernel.PublicError{Code: kernel.CodeResource, Message: "request body exceeds resource limit"}
		}
		return &kernel.PublicError{Code: kernel.CodeParse, Message: "invalid JSON request body"}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return &kernel.PublicError{Code: kernel.CodeParse, Message: "request body must contain exactly one JSON value"}
	}
	return nil
}

func requestedObjectMediaType(accept string) (string, error) {
	if strings.TrimSpace(accept) == "" {
		return "application/json", nil
	}
	ranges := parseAcceptRanges(accept)
	jsonCandidate := resolveAcceptCandidate(ranges, "application/json")
	yamlCandidate := resolveAcceptCandidate(ranges, "application/yaml")
	best := acceptCandidate{quality: -1}
	for _, candidate := range []acceptCandidate{jsonCandidate, yamlCandidate} {
		if candidate.quality <= 0 {
			continue
		}
		if candidate.quality > best.quality ||
			(candidate.quality == best.quality && candidate.order < best.order) {
			best = candidate
		}
	}
	if best.mediaType != "" {
		return best.mediaType, nil
	}
	return "", &kernel.PublicError{
		Code:    kernel.CodeInvalidArgument,
		Message: "Accept must allow application/json or application/yaml",
	}
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}

func writeJSONErrorStatus(response http.ResponseWriter, status int, err error) {
	public := kernel.AsPublicError(err)
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(public)
}

func writeMethodNotAllowed(response http.ResponseWriter) {
	response.Header().Set("Allow", http.MethodPost)
	writeJSONErrorStatus(response, http.StatusMethodNotAllowed, &kernel.PublicError{
		Code:    kernel.CodeInvalidArgument,
		Message: "method is not supported for this endpoint",
	})
}
