package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestDetachedStartupHasOneBoundedOutputBudget(t *testing.T) {
	var stdout, stderr bytes.Buffer
	a, b := limitStartupOutputs(&stdout, &stderr)
	msg := strings.Repeat("X", maxStartupBytes)
	if n, err := a.Write([]byte(msg)); err != nil || n != len(msg) {
		t.Fatalf("unexpected first write: %d %v", n, err)
	}
	if n, err := b.Write([]byte(msg)); err != nil || n != len(msg) {
		t.Fatalf("unexpected bounded write: %d %v", n, err)
	}
	if stdout.Len()+stderr.Len() != maxStartupBytes || stderr.Len() != 0 {
		t.Fatalf("startup output escaped byte bound: stdout=%d stderr=%d", stdout.Len(), stderr.Len())
	}
}
