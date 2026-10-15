package lithograph

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestDatabaseDiagnosticsNeverExposeRawErrorsOrCypher(t *testing.T) {
	var lines bytes.Buffer
	observer, err := observability.New(&lines, "DEBUG")
	if err != nil {
		t.Fatal(err)
	}
	ctx, id, err := observability.WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	observeDatabaseOperation(ctx, "execute", time.Now().Add(-3*time.Millisecond), nil)
	observeDatabaseOperation(ctx, "stream", time.Now(), errors.New("private Cypher and secret credentials"))
	observeDatabaseOperation(ctx, "commit", time.Now(), context.Canceled)
	observeDatabaseOperation(ctx, "commit", time.Now(), context.DeadlineExceeded)
	output := lines.String()
	if strings.Count(output, "\"event\":\"lithograph.operation.finished\"") != 4 ||
		strings.Count(output, id) != 4 || !strings.Contains(output, "deadline_exceeded") ||
		!strings.Contains(output, "database_error") || !strings.Contains(output, "cancelled") {
		t.Fatalf("missing safe database diagnostics: %s", output)
	}
	if strings.Contains(output, "private Cypher") || strings.Contains(output, "secret credentials") {
		t.Fatal("database diagnostic output exposed raw error content")
	}
}
