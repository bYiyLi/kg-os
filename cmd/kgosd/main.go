package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/webui"
)

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	evaluation := command.EvaluateKGOSD(args)
	if evaluation.Mode == command.DaemonModeResult {
		_, _ = io.WriteString(stdout, evaluation.Result.Stdout)
		_, _ = io.WriteString(stderr, evaluation.Result.Stderr)
		return evaluation.Result.ExitCode
	}
	if err := webui.ServePhase0(ctx, evaluation.Host, evaluation.Port, stdout); err != nil {
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
