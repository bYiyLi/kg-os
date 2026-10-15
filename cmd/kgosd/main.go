package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
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
	logOutput := stderr
	var logFile io.Closer
	if evaluation.Mode != command.DaemonModeInit && os.Getenv("KGOS_INTERNAL_LOG_TO_FILE") == "1" {
		paths, pathErr := runtimeprofile.ResolvePaths(evaluation.Root)
		if pathErr != nil {
			_, _ = fmt.Fprintln(stderr, "kgosd: invalid log directory")
			return 1
		}
		file, openErr := observability.NewRotatingWriter(paths.LogsDir, observability.DefaultLogBytes, observability.DefaultLogFiles)
		if openErr != nil {
			_, _ = fmt.Fprintln(stderr, "kgosd: cannot open private diagnostic log")
			// A damaged diagnostic destination must not block the database.
			// Detached stdout/stderr still goes to the bounded startup log.
			logOutput = io.Discard
		} else {
			logOutput, logFile = file, file
			defer logFile.Close()
		}
	}
	observer, err := observability.New(logOutput, os.Getenv("KGOS_LOG_LEVEL"))
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "kgosd: invalid KGOS_LOG_LEVEL")
		return 1
	}
	ctx = observability.WithObserver(ctx, observer)
	observer.Log(ctx, slog.LevelInfo, "runtime", "runtime.starting")
	runtime, err := runtimehost.Open(ctx, evaluation.Root, nil)
	if err != nil {
		observer.Log(ctx, slog.LevelError, "runtime", "runtime.open.failed", slog.String("stage", "runtime_open"))
		return 1
	}
	defer func() {
		if err := runtime.Close(); err != nil {
			observer.Log(ctx, slog.LevelError, "runtime", "runtime.close.failed")
		}
	}()
	if evaluation.Mode == command.DaemonModeInit {
		if err := initializeRuntime(ctx, runtime); err != nil {
			observer.Log(ctx, slog.LevelError, "runtime", "runtime.init.failed")
			return 1
		}
		_, _ = fmt.Fprintf(stdout, "KG OS initialized: %s\n", evaluation.Root)
		observer.Log(ctx, slog.LevelInfo, "runtime", "runtime.initialized")
		return 0
	}
	handler, err := webui.EmbeddedHandler()
	if err != nil {
		observer.Log(ctx, slog.LevelError, "runtime", "runtime.web_assets.failed")
		return 1
	}
	var extra []daemon.ExtraRoute
	mcpSettings := evaluation.Settings.MCP
	mcpService, err := mcpserver.New(runtime.Kernel, mcpserver.Options{
		Token: runtime.Credential.Token, Path: mcpSettings.Path, OAuthIssuer: mcpSettings.OAuthIssuer,
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
		observer.Log(ctx, slog.LevelError, "runtime", "runtime.mcp_configuration.failed")
		return 1
	}
	extra = append(extra, daemon.ExtraRoute{Path: mcpSettings.Path, Handler: mcpService.Handler()})
	for path, route := range mcpService.OAuthRoutes() {
		extra = append(extra, daemon.ExtraRoute{Path: path, Handler: route})
	}
	if err := daemon.ServeWithOptions(ctx, runtime, observability.HTTPMiddleware(observer, daemon.NewHandler(runtime, handler, extra...), mcpSettings.Path), stdout, daemon.ListenOptions{
		Host: evaluation.Settings.Host, Port: evaluation.Settings.Port,
		TLSCert: evaluation.Settings.TLSCert, TLSKey: evaluation.Settings.TLSKey,
	}); err != nil {
		observer.Log(ctx, slog.LevelError, "runtime", "runtime.serve.failed")
		return 1
	}
	observer.Log(ctx, slog.LevelInfo, "runtime", "runtime.stopped")
	return 0
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}
