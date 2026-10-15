package kernel

import (
	"context"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
)

// recordBusinessResult is deliberately called by the Kernel operation owner
// after the function has reached its real outcome. It never examines user
// input, Cypher, Patch text, authors, messages, or private database data.
func recordBusinessResult(ctx context.Context, operation, success, state string, count int, started time.Time, err error) {
	if observability.FromContext(ctx) == nil {
		return
	}
	outcome := success
	code := ""
	if err != nil {
		code = string(AsPublicError(err).Code)
		// A stale base is rejected before a write transaction is started.
		// For all other errors, preserve the possibility of a prior side effect.
		outcome = observability.ErrorOutcome(err, code == string(CodeStaleBaseState))
		state = ""
		count = 0
	}
	observability.Business(ctx, observability.BusinessResult{
		Operation: operation, Outcome: outcome, ErrorCode: code,
		State: state, Count: count, Duration: time.Since(started),
	})
}
