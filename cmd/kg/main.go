package main

import (
	"io"
	"os"

	"github.com/bYiyLi/kg-os/internal/command"
)

func run(args []string, stdout, stderr io.Writer) int {
	result := command.EvaluateKG(args)
	_, _ = io.WriteString(stdout, result.Stdout)
	_, _ = io.WriteString(stderr, result.Stderr)
	return result.ExitCode
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}
