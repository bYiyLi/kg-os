package kernel

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/bYiyLi/kg-os/internal/lithograph"
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

var errInternalKnowledgeObject = errors.New("internal KG OS Knowledge object")

type PublicError struct {
	Code    ErrorCode      `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
	Cause   error          `json:"-"`
}

type consistencyDiagnostic struct {
	issue string
	err   error
}

func (err *consistencyDiagnostic) Error() string { return err.err.Error() }
func (err *consistencyDiagnostic) Unwrap() error { return err.err }

func markConsistencyIssue(issue string, err error) error {
	if err == nil {
		return nil
	}
	return &consistencyDiagnostic{issue: issue, err: err}
}

func markedConsistencyIssue(err error) (string, bool) {
	var diagnostic *consistencyDiagnostic
	if errors.As(err, &diagnostic) && diagnostic.issue != "" {
		return diagnostic.issue, true
	}
	return "", false
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
	category, message, _, ok := lithograph.ErrorDetails(err)
	if !ok {
		return publicError(CodeInternal, "internal KG OS error", err)
	}
	switch category {
	case lithograph.CategoryVersionNotFound:
		return publicError(CodeStateNotFound, "state was not found", err)
	case lithograph.CategoryBranchHeadMoved:
		return publicError(CodeStaleBaseState, "target branch head no longer matches baseState", err)
	case lithograph.CategoryInvalidArgument:
		return publicError(CodeInvalidArgument, message, err)
	case lithograph.CategoryParse:
		return publicError(CodeParse, message, err)
	case lithograph.CategorySemantic:
		return publicError(CodeSemantic, message, err)
	case lithograph.CategoryType:
		return publicError(CodeType, message, err)
	case lithograph.CategorySchema:
		return publicError(CodeSchema, message, err)
	case lithograph.CategoryConstraint:
		return publicError(CodeConstraint, message, err)
	case lithograph.CategoryResource:
		return publicError(CodeResource, message, err)
	case lithograph.CategoryIO:
		return publicError(CodeIO, message, err)
	case lithograph.CategoryBranchNotFound:
		return publicError(CodeBranchNotFound, message, err)
	case lithograph.CategoryTagNotFound:
		return publicError(CodeTagNotFound, message, err)
	case lithograph.CategoryReadOnlySnapshot:
		return publicError(CodeReadOnlySnapshot, message, err)
	default:
		return publicError(CodeInternal, "internal KG OS error", err)
	}
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
