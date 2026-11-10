package daemon

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/bYiyLi/kg-os/internal/buildinfo"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

// Historical diagnostic queries use the existing Instance/Web authentication
// middleware, never MCP OAuth authorization or raw-file access.
func mountObservability(mux *http.ServeMux, token string) {
	mux.HandleFunc("/api/v1/system/observability/overview", postJSONHandler(
		token,
		func(ctx context.Context, input observability.Window) (observability.OverviewResult, error) {
			observer := observability.FromContext(ctx)
			if observer == nil || observer.Store() == nil {
				return observability.OverviewResult{Availability: "unavailable"}, nil
			}
			result, err := observer.Store().Overview(ctx, input, observer.Snapshot())
			result.Version = buildinfo.Version
			return result, diagnosticQueryError(ctx, "observability.overview", err)
		},
	))
	mux.HandleFunc("/api/v1/system/observability/requests/list", postJSONHandler(
		token,
		func(ctx context.Context, input observability.RequestListInput) (observability.RequestListResult, error) {
			observer := observability.FromContext(ctx)
			if observer == nil || observer.Store() == nil {
				return observability.RequestListResult{Availability: "unavailable"}, nil
			}
			result, err := observer.Store().List(ctx, input)
			return result, diagnosticQueryError(ctx, "observability.requests.list", err)
		},
	))
	mux.HandleFunc("/api/v1/system/observability/requests/get", postJSONHandler(
		token,
		func(ctx context.Context, input observability.RequestGetInput) (observability.RequestGetResult, error) {
			observer := observability.FromContext(ctx)
			if observer == nil || observer.Store() == nil {
				return observability.RequestGetResult{Availability: "unavailable"}, nil
			}
			result, err := observer.Store().Get(ctx, input)
			return result, diagnosticQueryError(ctx, "observability.requests.get", err)
		},
	))
	mux.HandleFunc("/api/v1/system/observability/logs/list", postJSONHandler(
		token,
		func(ctx context.Context, input observability.LogListInput) (observability.LogListResult, error) {
			observer := observability.FromContext(ctx)
			if observer == nil || observer.Store() == nil {
				return observability.LogListResult{Availability: "unavailable"}, nil
			}
			result, err := observer.Store().ListLogs(ctx, input)
			return result, diagnosticQueryError(ctx, "observability.logs.list", err)
		},
	))
}

func diagnosticQueryError(ctx context.Context, operation string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, observability.ErrInvalidQuery) {
		return &kernel.PublicError{Code: kernel.CodeInvalidArgument, Message: "invalid observability query"}
	}
	// Polling has no ordinary access log. Log server-side failures only, using
	// fixed operation and cause classes rather than private request contents.
	if !errors.Is(err, context.Canceled) {
		observability.Log(ctx, slog.LevelError, "observability", "observability.query.failed",
			slog.String("operation", operation),
			slog.String("cause_class", observability.StorageCause(err)))
	}
	return &kernel.PublicError{Code: kernel.CodeInternal, Message: "observability temporarily unavailable"}
}
