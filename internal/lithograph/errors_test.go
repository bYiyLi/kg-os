package lithograph

import (
	"errors"
	"fmt"
	"testing"
)

func TestParseDatabaseErrorMessageRequiresExactPublicPrefix(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		message  string
		category ErrorCategory
		detail   string
		ok       bool
	}{
		{"LITHOGRAPH_TYPE_ERROR: bad type", CategoryType, "bad type", true},
		{"LITHOGRAPH_BRANCH_HEAD_MOVED: changed", CategoryBranchHeadMoved, "changed", true},
		{"wrapper LITHOGRAPH_TYPE_ERROR: bad type", "", "", false},
		{"LITHOGRAPH_TYPE_ERROR", "", "", false},
		{"LITHOGRAPH_UNKNOWN: nope", "", "", false},
		{"TYPE_ERROR: nope", "", "", false},
	} {
		category, detail, ok := parseDatabaseErrorMessage(test.message)
		if category != test.category || detail != test.detail || ok != test.ok {
			t.Fatalf("parse %q = (%q,%q,%v), want (%q,%q,%v)",
				test.message, category, detail, ok, test.category, test.detail, test.ok)
		}
	}
}

func TestDatabaseErrorDetailsSurviveWrapping(t *testing.T) {
	t.Parallel()
	source := &DatabaseError{Category: CategoryVersionNotFound, Message: "missing", SQLiteCode: 1}
	wrapped := fmt.Errorf("resolve State: %w", source)
	category, message, code, ok := ErrorDetails(wrapped)
	if !ok || category != CategoryVersionNotFound || message != "missing" || code != 1 {
		t.Fatalf("details = (%q,%q,%d,%v)", category, message, code, ok)
	}
}

func TestDatabaseErrorNormalizationBoundaries(t *testing.T) {
	t.Parallel()
	var nilError *DatabaseError
	if nilError.Error() != "<nil>" || nilError.Unwrap() != nil {
		t.Fatal("nil DatabaseError methods are inconsistent")
	}
	if normalizeDatabaseError(nil) != nil {
		t.Fatal("nil database error was changed")
	}
	existing := &DatabaseError{Category: CategoryIO, Message: "io", SQLiteCode: 10}
	if got := normalizeDatabaseError(existing); got != existing {
		t.Fatalf("typed database error was replaced: %#v", got)
	}
	plain := errors.New("LITHOGRAPH_TYPE_ERROR: text alone is not typed")
	if got := normalizeDatabaseError(plain); got != plain {
		t.Fatalf("non-SQLite error was trusted as database category: %#v", got)
	}
	if category, message, code, ok := ErrorDetails(plain); ok || category != "" || message != "" || code != 0 {
		t.Fatalf("plain error details = (%q,%q,%d,%v)", category, message, code, ok)
	}
}
