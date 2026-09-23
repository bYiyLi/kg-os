package main

import (
	"context"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/bYiyLi/kg-os/internal/command"
)

func run(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout,
	stderr io.Writer,
) int {
	if len(args) != 0 && args[0] == "ontology" {
		return runOntology(ctx, args[1:], stdin, stdinIsTTY, stdout, stderr)
	}
	result := command.EvaluateKG(args)
	_, _ = io.WriteString(stdout, result.Stdout)
	_, _ = io.WriteString(stderr, result.Stderr)
	return result.ExitCode
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdin, stdinIsTerminal(os.Stdin), os.Stdout, os.Stderr))
}
