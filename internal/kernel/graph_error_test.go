package kernel

import (
	"net/http"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestGraphDatabaseErrorProjectionPreservesGraphCategories(t *testing.T) {
	for _, test := range []struct {
		category lithograph.ErrorCategory
		message  string
		code     ErrorCode
		status   int
	}{
		{
			category: lithograph.CategoryBranchHeadMoved,
			message:  "branch head moved",
			code:     CodeBranchHeadMoved,
			status:   http.StatusConflict,
		},
		{
			category: lithograph.CategoryMergeConflict,
			message:  "merge conflict",
			code:     CodeMergeConflict,
			status:   http.StatusConflict,
		},
		{
			category: lithograph.CategoryMergeSessionNotFound,
			message:  "missing session",
			code:     CodeMergeSessionNotFound,
			status:   http.StatusNotFound,
		},
		{
			category: lithograph.CategoryMergeSessionChanged,
			message:  "changed session",
			code:     CodeMergeSessionChanged,
			status:   http.StatusConflict,
		},
	} {
		t.Run(string(test.code), func(t *testing.T) {
			projected := graphPublicError(&lithograph.DatabaseError{Category: test.category, Message: test.message, SQLiteCode: 1})
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
	shared := graphPublicError(&lithograph.DatabaseError{Category: lithograph.CategoryVersionNotFound, Message: "missing", SQLiteCode: 1})
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
