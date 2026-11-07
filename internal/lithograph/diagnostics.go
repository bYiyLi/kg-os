package lithograph

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
)

// Only a fixed stage and coarse error classification cross the database
// boundary. A raw Lithograph error, Cypher, options or parameters may contain
// caller knowledge data and must never be written to diagnostic logs.
func observeDatabaseOperation(ctx context.Context, stage string, started time.Time, err error) {
	if observability.FromContext(ctx) == nil {
		return
	}
	level := slog.LevelDebug
	fields := []slog.Attr{
		slog.String("stage", stage),
		slog.Int64("duration_ms", time.Since(started).Milliseconds()),
	}
	if err != nil {
		level = slog.LevelWarn
		reason := observability.StorageCause(err)
		if reason == "storage_error" {
			reason = "database_error"
		}
		switch {
		case errors.Is(err, context.Canceled):
			reason = "cancelled"
		case errors.Is(err, context.DeadlineExceeded):
			reason = "deadline_exceeded"
		}
		if category, _, _, ok := ErrorDetails(err); ok {
			// ErrorCategory is fixed and public. DatabaseError.Message is not.
			fields = append(fields, slog.String("error_code", string(category)))
			if reason == "database_error" {
				reason = "lithograph_error"
			}
		}
		fields = append(fields, slog.String("cause_class", reason))
	}
	observability.Log(ctx, level, "lithograph_host", "lithograph.operation.finished", fields...)
}
