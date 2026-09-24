package lithograph

import (
	"errors"
	"fmt"
	"strings"

	sqlite3 "github.com/mattn/go-sqlite3"
)

type ErrorCategory string

const (
	CategoryParse                       ErrorCategory = "PARSE_ERROR"
	CategorySemantic                    ErrorCategory = "SEMANTIC_ERROR"
	CategoryType                        ErrorCategory = "TYPE_ERROR"
	CategorySchema                      ErrorCategory = "SCHEMA_ERROR"
	CategoryConstraint                  ErrorCategory = "CONSTRAINT_ERROR"
	CategoryNotInitialized              ErrorCategory = "NOT_INITIALIZED"
	CategoryInvalidArgument             ErrorCategory = "INVALID_ARGUMENT"
	CategoryGraphViewViolation          ErrorCategory = "GRAPH_VIEW_VIOLATION"
	CategoryVersionNotFound             ErrorCategory = "VERSION_NOT_FOUND"
	CategoryBranchNotFound              ErrorCategory = "BRANCH_NOT_FOUND"
	CategoryTagNotFound                 ErrorCategory = "TAG_NOT_FOUND"
	CategoryBranchHeadMoved             ErrorCategory = "BRANCH_HEAD_MOVED"
	CategoryMergeConflict               ErrorCategory = "MERGE_CONFLICT"
	CategoryMergeSessionNotFound        ErrorCategory = "MERGE_SESSION_NOT_FOUND"
	CategoryMergeSessionChanged         ErrorCategory = "MERGE_SESSION_CHANGED"
	CategoryTransactionBoundaryRequired ErrorCategory = "TRANSACTION_BOUNDARY_REQUIRED"
	CategoryReadOnlySnapshot            ErrorCategory = "READ_ONLY_SNAPSHOT"
	CategoryFormatTooNew                ErrorCategory = "FORMAT_TOO_NEW"
	CategoryBusy                        ErrorCategory = "BUSY"
	CategoryResource                    ErrorCategory = "RESOURCE_ERROR"
	CategoryInterrupted                 ErrorCategory = "INTERRUPTED"
	CategoryStorage                     ErrorCategory = "STORAGE_ERROR"
	CategoryIO                          ErrorCategory = "IO_ERROR"
	CategoryInternal                    ErrorCategory = "INTERNAL_ERROR"
)

var knownErrorCategories = map[ErrorCategory]struct{}{
	CategoryParse: {}, CategorySemantic: {}, CategoryType: {}, CategorySchema: {},
	CategoryConstraint: {}, CategoryNotInitialized: {}, CategoryInvalidArgument: {},
	CategoryGraphViewViolation: {}, CategoryVersionNotFound: {}, CategoryBranchNotFound: {},
	CategoryTagNotFound: {}, CategoryBranchHeadMoved: {}, CategoryMergeConflict: {},
	CategoryMergeSessionNotFound: {}, CategoryMergeSessionChanged: {},
	CategoryTransactionBoundaryRequired: {}, CategoryReadOnlySnapshot: {},
	CategoryFormatTooNew: {}, CategoryBusy: {}, CategoryResource: {},
	CategoryInterrupted: {}, CategoryStorage: {}, CategoryIO: {}, CategoryInternal: {},
}

type DatabaseError struct {
	Category   ErrorCategory
	Message    string
	SQLiteCode int
	cause      error
}

func (err *DatabaseError) Error() string {
	if err == nil {
		return "<nil>"
	}
	return fmt.Sprintf("LITHOGRAPH_%s: %s", err.Category, err.Message)
}

func (err *DatabaseError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.cause
}

func ErrorDetails(err error) (ErrorCategory, string, int, bool) {
	var databaseErr *DatabaseError
	if !errors.As(err, &databaseErr) {
		return "", "", 0, false
	}
	return databaseErr.Category, databaseErr.Message, databaseErr.SQLiteCode, true
}

func normalizeDatabaseError(err error) error {
	if err == nil {
		return nil
	}
	var existing *DatabaseError
	if errors.As(err, &existing) {
		return err
	}
	var sqliteErr sqlite3.Error
	if !errors.As(err, &sqliteErr) {
		return err
	}
	category, message, ok := parseDatabaseErrorMessage(err.Error())
	if !ok {
		return err
	}
	return &DatabaseError{
		Category:   category,
		Message:    message,
		SQLiteCode: int(sqliteErr.Code),
		cause:      err,
	}
}

func parseDatabaseErrorMessage(message string) (ErrorCategory, string, bool) {
	const prefix = "LITHOGRAPH_"
	if !strings.HasPrefix(message, prefix) {
		return "", "", false
	}
	separator := strings.Index(message, ": ")
	if separator <= len(prefix) {
		return "", "", false
	}
	category := ErrorCategory(message[len(prefix):separator])
	if _, ok := knownErrorCategories[category]; !ok {
		return "", "", false
	}
	return category, message[separator+2:], true
}
