package daemon

import (
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
	mux.HandleFunc("/api/v1/ontology/patch", func(response http.ResponseWriter, request *http.Request) {
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
		result, err := runtime.Kernel.PatchOntology(request.Context(), input)
		if err != nil {
			kernel.WriteJSONError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, result)
	})
	mux.Handle("/", fallback)
	return mux
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
	type mediaRange struct {
		mediaType string
		quality   float64
		order     int
	}
	ranges := make([]mediaRange, 0)
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
		if mediaType != "application/json" &&
			mediaType != "application/yaml" &&
			mediaType != "application/*" &&
			mediaType != "*/*" {
			continue
		}
		ranges = append(ranges, mediaRange{mediaType: mediaType, quality: quality, order: order})
	}
	type candidate struct {
		mediaType string
		quality   float64
		order     int
	}
	resolve := func(representation string) candidate {
		bestSpecificity := -1
		best := candidate{mediaType: representation, quality: -1, order: int(^uint(0) >> 1)}
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
			if specificity < 0 || specificity < bestSpecificity {
				continue
			}
			if specificity > bestSpecificity ||
				mediaRange.quality > best.quality ||
				(mediaRange.quality == best.quality && mediaRange.order < best.order) {
				bestSpecificity = specificity
				best.quality = mediaRange.quality
				best.order = mediaRange.order
			}
		}
		return best
	}
	jsonCandidate := resolve("application/json")
	yamlCandidate := resolve("application/yaml")
	best := candidate{quality: -1}
	for _, candidate := range []candidate{jsonCandidate, yamlCandidate} {
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
