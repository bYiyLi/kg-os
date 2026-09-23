package kernel

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type ErrorCode string

const (
	CodeObjectNotFound       ErrorCode = "OBJECT_NOT_FOUND"
	CodeObjectConflict       ErrorCode = "OBJECT_CONFLICT"
	CodePatchBaseMismatch    ErrorCode = "PATCH_BASE_MISMATCH"
	CodeStaleBaseState       ErrorCode = "STALE_BASE_STATE"
	CodeConsistency          ErrorCode = "CONSISTENCY_ERROR"
	CodeUnsupportedOperation ErrorCode = "UNSUPPORTED_OPERATION"
	CodeStateNotFound        ErrorCode = "STATE_NOT_FOUND"
	CodeReservedIdentifier   ErrorCode = "RESERVED_IDENTIFIER"
	CodeAuthenticationFailed ErrorCode = "AUTHENTICATION_FAILED"
	CodeInvalidArgument      ErrorCode = "INVALID_ARGUMENT"
	CodeParse                ErrorCode = "PARSE_ERROR"
	CodeSemantic             ErrorCode = "SEMANTIC_ERROR"
	CodeType                 ErrorCode = "TYPE_ERROR"
	CodeSchema               ErrorCode = "SCHEMA_ERROR"
	CodeConstraint           ErrorCode = "CONSTRAINT_ERROR"
	CodeBranchNotFound       ErrorCode = "BRANCH_NOT_FOUND"
	CodeTagNotFound          ErrorCode = "TAG_NOT_FOUND"
	CodeBranchHeadMoved      ErrorCode = "BRANCH_HEAD_MOVED"
	CodeMergeConflict        ErrorCode = "MERGE_CONFLICT"
	CodeMergeSessionNotFound ErrorCode = "MERGE_SESSION_NOT_FOUND"
	CodeMergeSessionChanged  ErrorCode = "MERGE_SESSION_CHANGED"
	CodeReadOnlySnapshot     ErrorCode = "READ_ONLY_SNAPSHOT"
	CodeResource             ErrorCode = "RESOURCE_ERROR"
	CodeIO                   ErrorCode = "IO_ERROR"
	CodeInternal             ErrorCode = "INTERNAL_ERROR"
)

type PublicError struct {
	Code    ErrorCode      `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
	Cause   error          `json:"-"`
}

func (err *PublicError) Error() string {
	if err == nil {
		return "<nil>"
	}
	return string(err.Code) + ": " + err.Message
}

func (err *PublicError) Unwrap() error { return err.Cause }

func publicError(code ErrorCode, message string, cause error) *PublicError {
	return &PublicError{Code: code, Message: message, Cause: cause}
}

func errorWithDetails(code ErrorCode, message string, details map[string]any) *PublicError {
	return &PublicError{Code: code, Message: message, Details: details}
}

func AsPublicError(err error) *PublicError {
	if err == nil {
		return nil
	}
	var public *PublicError
	if errors.As(err, &public) {
		return public
	}
	message := err.Error()
	category := lithographCategory(message)
	switch category {
	case "VERSION_NOT_FOUND":
		return publicError(CodeStateNotFound, "state was not found", err)
	case "BRANCH_HEAD_MOVED":
		return publicError(CodeStaleBaseState, "target branch head no longer matches baseState", err)
	case "INVALID_ARGUMENT":
		return publicError(CodeInvalidArgument, safeDatabaseMessage(message), err)
	case "PARSE_ERROR":
		return publicError(CodeParse, safeDatabaseMessage(message), err)
	case "SEMANTIC_ERROR":
		return publicError(CodeSemantic, safeDatabaseMessage(message), err)
	case "TYPE_ERROR":
		return publicError(CodeType, safeDatabaseMessage(message), err)
	case "SCHEMA_ERROR":
		return publicError(CodeSchema, safeDatabaseMessage(message), err)
	case "CONSTRAINT_ERROR":
		return publicError(CodeConstraint, safeDatabaseMessage(message), err)
	case "RESOURCE_ERROR":
		return publicError(CodeResource, safeDatabaseMessage(message), err)
	case "IO_ERROR":
		return publicError(CodeIO, safeDatabaseMessage(message), err)
	case "BRANCH_NOT_FOUND":
		return publicError(CodeBranchNotFound, safeDatabaseMessage(message), err)
	case "TAG_NOT_FOUND":
		return publicError(CodeTagNotFound, safeDatabaseMessage(message), err)
	case "READ_ONLY_SNAPSHOT":
		return publicError(CodeReadOnlySnapshot, safeDatabaseMessage(message), err)
	default:
		return publicError(CodeInternal, "internal KG OS error", err)
	}
}

func lithographCategory(message string) string {
	index := strings.Index(message, "LITHOGRAPH_")
	if index < 0 {
		return ""
	}
	rest := message[index+len("LITHOGRAPH_"):]
	end := strings.IndexByte(rest, ':')
	if end < 0 {
		return ""
	}
	return rest[:end]
}

func safeDatabaseMessage(message string) string {
	index := strings.Index(message, "LITHOGRAPH_")
	if index < 0 {
		return "database operation failed"
	}
	rest := message[index:]
	if colon := strings.Index(rest, ": "); colon >= 0 {
		return rest[colon+2:]
	}
	return "database operation failed"
}

func HTTPStatus(err error) int {
	public := AsPublicError(err)
	switch public.Code {
	case CodeAuthenticationFailed:
		return http.StatusUnauthorized
	case CodeObjectNotFound, CodeStateNotFound, CodeBranchNotFound, CodeTagNotFound,
		CodeMergeSessionNotFound:
		return http.StatusNotFound
	case CodeObjectConflict, CodePatchBaseMismatch, CodeStaleBaseState, CodeConstraint,
		CodeBranchHeadMoved, CodeMergeConflict, CodeMergeSessionChanged:
		return http.StatusConflict
	case CodeInvalidArgument, CodeParse, CodeSemantic, CodeType, CodeReservedIdentifier,
		CodeUnsupportedOperation, CodeSchema, CodeReadOnlySnapshot:
		return http.StatusBadRequest
	case CodeResource:
		return http.StatusRequestEntityTooLarge
	default:
		return http.StatusInternalServerError
	}
}

func WriteJSONError(response http.ResponseWriter, err error) {
	public := AsPublicError(err)
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.WriteHeader(HTTPStatus(public))
	if encodeErr := json.NewEncoder(response).Encode(public); encodeErr != nil {
		_, _ = fmt.Fprint(response, "")
	}
}
