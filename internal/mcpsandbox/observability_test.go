package mcpsandbox

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestSandboxMetricsCountActualBudgetLimits(t *testing.T) {
	var output bytes.Buffer
	observer, err := observability.New(&output, "")
	if err != nil {
		t.Fatal(err)
	}
	ctx, _, err := observability.WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	_, err = ExecuteWithLimits(ctx, `return "sensitive script content"`, true, nil, nil, Limits{MaxCodeBytes: 8})
	if err == nil || !strings.HasPrefix(err.Error(), "RESOURCE_ERROR:") {
		t.Fatalf("expected real sandbox code limit failure: %v", err)
	}
	if got := observer.Snapshot().Sandbox.ResourceLimitsTotal; got != 1 {
		t.Fatalf("real sandbox budget limit count=%d want=1", got)
	}
	if strings.Contains(output.String(), "sensitive script content") ||
		!strings.Contains(output.String(), "\"event\":\"sandbox.resource.limit\"") {
		t.Fatal("missing safe sandbox budget event or script text leaked")
	}
}
