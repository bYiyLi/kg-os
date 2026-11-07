package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
	"github.com/bYiyLi/kg-os/internal/mcpserver"
	"github.com/bYiyLi/kg-os/internal/observability"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
	"github.com/bYiyLi/kg-os/internal/webui"
)

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	evaluation := command.EvaluateKGOSD(args)
	if evaluation.Mode == command.DaemonModeResult {
		_, _ = io.WriteString(stdout, evaluation.Result.Stdout)
		_, _ = io.WriteString(stderr, evaluation.Result.Stderr)
		return evaluation.Result.ExitCode
	}
	if os.Getenv("KGOS_INTERNAL_LOG_TO_FILE") == "1" {
		// The CLI uses a shared O_TRUNC startup file descriptor. Keep all
		// early/emergency output bounded without creating a second log store.
		stdout, stderr = limitStartupOutputs(stdout, stderr)
	}
	// The diagnostic SQLite is the sole regular log persistence. stderr is
	// reserved for bounded emergency messages, never a second full JSONL copy.
	observer, err := observability.New(io.Discard, os.Getenv("KGOS_LOG_LEVEL"))
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "kgosd: invalid KGOS_LOG_LEVEL")
		return 1
	}
	if paths, pathErr := runtimeprofile.ResolvePaths(evaluation.Root); pathErr == nil {
		if store, storeErr := observability.OpenStore(paths.LogsDir, stderr); storeErr == nil {
			observer.AttachStore(store)
		} else {
			_, _ = fmt.Fprintf(stderr,
				"kgosd: diagnostic storage unavailable (cause_class=%s); continuing without persistent logs\n",
				observability.StorageCause(storeErr))
		}
	} else {
		_, _ = fmt.Fprintln(stderr, "kgosd: diagnostic path unavailable")
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := observer.Close(shutdownCtx); err != nil {
			_, _ = fmt.Fprintf(stderr,
				"kgosd: diagnostic shutdown incomplete (cause_class=%s)\n",
				observability.StorageCause(err))
		}
	}()
	ctx = observability.WithObserver(ctx, observer)
	observer.Log(ctx, slog.LevelInfo, "runtime", "runtime.starting")
	if evaluation.Mode != command.DaemonModeInit {
		if err := serveFirstRun(ctx, evaluation, stdout, observer); err != nil {
			reportRuntimeFailure(ctx, observer, stderr, "runtime.serve.failed", "http_serve", err)
			return 1
		}
		observer.Log(ctx, slog.LevelInfo, "runtime", "runtime.stopped")
		return 0
	}
	runtime, err := runtimehost.Open(ctx, evaluation.Root, nil)
	if err != nil {
		reportRuntimeFailure(ctx, observer, stderr, "runtime.open.failed", "runtime_open", err)
		return 1
	}
	defer func() {
		if err := runtime.Close(); err != nil {
			reportRuntimeFailure(ctx, observer, stderr, "runtime.close.failed", "runtime_close", err)
		}
	}()
	if evaluation.Mode == command.DaemonModeInit {
		if err := initializeRuntime(ctx, runtime); err != nil {
			reportRuntimeFailure(ctx, observer, stderr, "runtime.init.failed", "runtime_init", err)
			return 1
		}
		_, _ = fmt.Fprintf(stdout, "KG OS initialized: %s\n", evaluation.Root)
		observer.Log(ctx, slog.LevelInfo, "runtime", "runtime.initialized")
		return 0
	}
	return 0
}

// Startup failures must remain diagnosable if the diagnostic database itself
// is unavailable. Both outputs are fixed, credential-free classifications.
func reportRuntimeFailure(ctx context.Context, observer *observability.Observer, stderr io.Writer, event, stage string, err error) {
	cause := observability.StorageCause(err)
	if cause == "storage_error" {
		cause = "runtime_failure"
	}
	observer.Log(ctx, slog.LevelError, "runtime", event,
		slog.String("stage", stage), slog.String("cause_class", cause))
	_, _ = fmt.Fprintf(stderr, "kgosd: runtime failure (stage=%s, cause_class=%s)\n", stage, cause)
}

// readyHandler is shared by the normal listener and the process-local
// authenticated readiness probe. It has no separate listener or Instance lock.
func readyHandler(runtime *runtimehost.Runtime, settings command.DaemonSettings, endpoint func() (string, error)) (http.Handler, error) {
	mcpSettings := settings.MCP
	issuer := ""
	if runtime.Config.Server != nil {
		issuer = runtime.Config.Server.PublicOrigin
	}
	handler, err := webui.EmbeddedHandler()
	if err != nil {
		return nil, err
	}
	var extra []daemon.ExtraRoute
	mcpService, err := mcpserver.New(runtime.Kernel, mcpserver.Options{
		Token: runtime.Credential.Token, Path: mcpSettings.Path, OAuthIssuer: issuer,
		OAuthStore: runtime.OAuthStore, OAuthStoreError: runtime.OAuthStoreError,
		MaxConcurrency:  mcpSettings.MaxConcurrency,
		RequestTimeout:  time.Duration(mcpSettings.RequestTimeoutMS) * time.Millisecond,
		MaxRequestBytes: int64(mcpSettings.MaxRequestBytes),
		Sandbox: mcpsandbox.Limits{
			Timeout:        time.Duration(mcpSettings.ScriptTimeoutMS) * time.Millisecond,
			MemoryMiB:      uint32(mcpSettings.ScriptMemoryMB),
			MaxCodeBytes:   mcpSettings.ScriptMaxCodeBytes,
			MaxCalls:       mcpSettings.ScriptMaxCalls,
			MaxStreams:     mcpSettings.ScriptMaxStreams,
			MaxOutputBytes: mcpSettings.ScriptMaxOutputBytes,
		},
		PreviewMaxItems:     mcpSettings.PreviewMaxItems,
		PreviewCacheEntries: mcpSettings.PreviewCacheEntries,
		PreviewCacheTTL:     time.Duration(mcpSettings.PreviewCacheTTLMS) * time.Millisecond,
	})
	if err != nil {
		return nil, err
	}
	extra = append(extra, daemon.ExtraRoute{Path: mcpSettings.Path, Handler: mcpService.Handler()})
	for path, route := range mcpService.OAuthRoutes() {
		extra = append(extra, daemon.ExtraRoute{Path: path, Handler: route})
	}
	return daemon.NewHandlerWithSettings(runtime, handler, runtimeSettingsOptions(runtime.Config, settings, endpoint), extra...), nil
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}
