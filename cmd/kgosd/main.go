package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/daemon"
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
	runtime, err := runtimehost.Open(ctx, os.Getenv("KG_HOME"), nil)
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "kgosd: %v\n", err)
		return 1
	}
	defer func() {
		if err := runtime.Close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "kgosd: %v\n", err)
		}
	}()
	handler, err := webui.EmbeddedHandler()
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "kgosd: %v\n", err)
		return 1
	}
	if err := daemon.Serve(ctx, runtime, daemon.NewHandler(runtime, handler), stdout); err != nil {
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
