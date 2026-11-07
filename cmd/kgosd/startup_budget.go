package main

import (
	"io"
	"sync"
)

// The detached CLI sends stdout and emergency stderr to the same private
// startup file descriptor. Both streams share one hard budget so a degraded
// diagnostic database cannot create an unbounded second log destination.
const maxStartupBytes = 64 << 10

type startupBudget struct {
	mu        sync.Mutex
	remaining int
}

type startupWriter struct {
	output io.Writer
	budget *startupBudget
}

func (w startupWriter) Write(p []byte) (int, error) {
	w.budget.mu.Lock()
	defer w.budget.mu.Unlock()
	if w.budget.remaining <= 0 {
		return len(p), nil
	}
	size := len(p)
	if size > w.budget.remaining {
		size = w.budget.remaining
	}
	n, err := w.output.Write(p[:size])
	w.budget.remaining -= n
	if err != nil {
		return n, err
	}
	// Dropping bytes is expected in the emergency-only channel. Never return
	// a short successful write that causes the caller to retry or fail.
	return len(p), nil
}

func limitStartupOutputs(stdout, stderr io.Writer) (io.Writer, io.Writer) {
	budget := &startupBudget{remaining: maxStartupBytes}
	return startupWriter{output: stdout, budget: budget}, startupWriter{output: stderr, budget: budget}
}
