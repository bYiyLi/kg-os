package main

import (
	"context"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/kernel"
)

func run(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdinIsTTY bool,
	stdout,
	stderr io.Writer,
) int {
	locale := detectLocale()
	if len(args) == 0 {
		_, _ = io.WriteString(stdout, rootHelp(locale))
		return 0
	}
	switch args[0] {
	case "object":
		return runObject(ctx, args[1:], stdin, stdinIsTTY, stdout, stderr)
	case "ontology":
		return runOntology(ctx, args[1:], stdin, stdinIsTTY, stdout, stderr)
	case "install":
		return runInstall(args[1:], stdin, stdinIsTTY && writerIsTerminal(stdout), stdout, stderr)
	case "doctor":
		return runDoctor(args[1:], writerIsTerminal(stdout), stdout, stderr)
	case "-h", "--help":
		_, _ = io.WriteString(stdout, rootHelp(locale))
		return 0
	}
	if hasHelp(args) {
		_, _ = io.WriteString(stdout, rootHelp(locale))
		return 0
	}
	if len(args) != 1 || (args[0] != "--version" && args[0] != "-V") {
		return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, unsupportedCommandMessage(locale), 2)
	}
	result := command.EvaluateKG(args)
	_, _ = io.WriteString(stdout, result.Stdout)
	_, _ = io.WriteString(stderr, result.Stderr)
	return result.ExitCode
}

func writerIsTerminal(writer io.Writer) bool {
	file, ok := writer.(*os.File)
	return ok && stdinIsTerminal(file)
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdin, stdinIsTerminal(os.Stdin), os.Stdout, os.Stderr))
}
