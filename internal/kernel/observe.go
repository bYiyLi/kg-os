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
	recordBusinessResultWithRejectionEvidence(ctx, operation, success, state, count, started, err, false)
}

// The Patch executor knows whether the explicit transaction boundary was
// reached. Other operations default to unknown unless their existing error
// contract proves rejection. No error code alone proves a transaction rolled
// back after writes may have started.
func recordBusinessResultWithRejectionEvidence(
	ctx context.Context,
	operation, success, state string,
	count int,
	started time.Time,
	err error,
	preWriteRejected bool,
) {
	if observability.FromContext(ctx) == nil {
		return
	}
	outcome := success
	code := ""
	if err != nil {
		code = string(AsPublicError(err).Code)
		// Preflight failures and confirmed stale-head rejection have no
		// durable graph mutation. Every other failure stays unknown.
		outcome = observability.ErrorOutcome(err, preWriteRejected || code == string(CodeStaleBaseState))
		state = ""
		count = 0
	}
	observability.Business(ctx, observability.BusinessResult{
		Operation: operation, Outcome: outcome, ErrorCode: code,
		State: state, Count: count, Duration: time.Since(started),
	})
}
