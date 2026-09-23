package kernel

import (
	"errors"
	"net/http"
	"testing"
)

func TestGraphDatabaseErrorProjectionPreservesGraphCategories(t *testing.T) {
	for _, test := range []struct {
		message string
		code    ErrorCode
		status  int
	}{
		{
			message: "execute: LITHOGRAPH_BRANCH_HEAD_MOVED: branch head moved",
			code:    CodeBranchHeadMoved,
			status:  http.StatusConflict,
		},
		{
			message: "execute: LITHOGRAPH_MERGE_CONFLICT: merge conflict",
			code:    CodeMergeConflict,
			status:  http.StatusConflict,
		},
		{
			message: "execute: LITHOGRAPH_MERGE_SESSION_NOT_FOUND: missing session",
			code:    CodeMergeSessionNotFound,
			status:  http.StatusNotFound,
		},
		{
			message: "execute: LITHOGRAPH_MERGE_SESSION_CHANGED: changed session",
			code:    CodeMergeSessionChanged,
			status:  http.StatusConflict,
		},
	} {
		t.Run(string(test.code), func(t *testing.T) {
			projected := graphPublicError(errors.New(test.message))
			if projected.Code != test.code {
				t.Fatalf("code = %s, want %s", projected.Code, test.code)
			}
			if status := HTTPStatus(projected); status != test.status {
				t.Fatalf("HTTP status = %d, want %d", status, test.status)
			}
		})
	}
}

func TestGraphDatabaseErrorProjectionKeepsSharedMappingsAndPublicErrors(t *testing.T) {
	shared := graphPublicError(errors.New("execute: LITHOGRAPH_VERSION_NOT_FOUND: missing"))
	if shared.Code != CodeStateNotFound {
		t.Fatalf("shared code = %s", shared.Code)
	}
	original := &PublicError{Code: CodeInvalidArgument, Message: "already public"}
	if got := graphPublicError(original); got != original {
		t.Fatalf("public error was replaced: %#v", got)
	}
	if graphPublicError(nil) != nil {
		t.Fatal("nil graph error was not preserved")
	}
}
