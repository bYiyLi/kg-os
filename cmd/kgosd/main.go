package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/mcpsandbox"
	"github.com/bYiyLi/kg-os/internal/mcpserver"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/webui"
)

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	evaluation := command.EvaluateKGOSD(args)
	if evaluation.Mode == command.DaemonModeResult {
		_, _ = io.WriteString(stdout, evaluation.Result.Stdout)
		_, _ = io.WriteString(stderr, evaluation.Result.Stderr)
		return evaluation.Result.ExitCode
	}
	runtime, err := runtimehost.Open(ctx, evaluation.Root, nil)
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "kgosd: %v\n", err)
		return 1
	}
	defer func() {
		if err := runtime.Close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "kgosd: %v\n", err)
		}
	}()
	if evaluation.Mode == command.DaemonModeInit {
		if err := initializeRuntime(ctx, runtime); err != nil {
			_, _ = fmt.Fprintf(stderr, "kgosd init: %v\n", err)
			return 1
		}
		_, _ = fmt.Fprintf(stdout, "KG OS initialized: %s\n", evaluation.Root)
		return 0
	}
	handler, err := webui.EmbeddedHandler()
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "kgosd: %v\n", err)
		return 1
	}
	var extra []daemon.ExtraRoute
	mcpSettings := evaluation.Settings.MCP
	if mcpSettings.Enabled {
		instanceHash, mcpHash := sha256.Sum256([]byte(runtime.Credential.Token)), sha256.Sum256([]byte(mcpSettings.Token))
		if subtle.ConstantTimeCompare(instanceHash[:], mcpHash[:]) == 1 {
			_, _ = io.WriteString(stderr, "kgosd: MCP token must differ from Instance token\n")
			return 1
		}
		mcpService, err := mcpserver.New(runtime.Kernel, mcpserver.Options{
			Token: mcpSettings.Token, Path: mcpSettings.Path, OAuthIssuer: mcpSettings.OAuthIssuer,
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
			_, _ = fmt.Fprintf(stderr, "kgosd: MCP configuration: %v\n", err)
			return 1
		}
		extra = append(extra, daemon.ExtraRoute{Path: mcpSettings.Path, Handler: mcpService.Handler()})
		for path, route := range mcpService.OAuthRoutes() {
			extra = append(extra, daemon.ExtraRoute{Path: path, Handler: route})
		}
	} else {
		extra = append(extra, daemon.ExtraRoute{Path: mcpSettings.Path, Handler: http.NotFoundHandler()})
	}
	if err := daemon.ServeWithOptions(ctx, runtime, daemon.NewHandler(runtime, handler, extra...), stdout, daemon.ListenOptions{
		Host: evaluation.Settings.Host, Port: evaluation.Settings.Port,
		TLSCert: evaluation.Settings.TLSCert, TLSKey: evaluation.Settings.TLSKey,
	}); err != nil {
		_, _ = fmt.Fprintf(stderr, "kgosd: %v\n", err)
		return 1
	}
	return 0
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}
