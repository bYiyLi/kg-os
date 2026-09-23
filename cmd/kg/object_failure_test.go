package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestRunObjectAdapterFailureProfiles(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)

	var stdout, stderr strings.Builder
	if code := runObject(
		context.Background(),
		[]string{"read", "n:1"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 2 {
		t.Fatalf("Object read dispatch code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runObject(
		context.Background(),
		[]string{"patch", "--base-state", "branch/main", "--branch", "main", "--patch", "x"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 2 {
		t.Fatalf("Object patch dispatch code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runObjectRead(
		context.Background(),
		[]string{"n:1"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), "--at is required") {
		t.Fatalf("read preflight code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runObjectPatch(
		context.Background(),
		[]string{"--base-state", "branch/main", "--branch", "main", "--patch", "x"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), "--base-state must be commit/") {
		t.Fatalf("patch base preflight code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runObjectPatch(
		context.Background(),
		[]string{"--base-state", state, "--branch", "main"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 2 {
		t.Fatalf("patch missing body code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "{")
	}))
	stdout.Reset()
	stderr.Reset()
	if code := runObjectRead(
		context.Background(),
		[]string{"domain:A", "--at", state},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 3 || stdout.Len() != 0 ||
		!strings.Contains(stderr.String(), "invalid Object response") {
		t.Fatalf("invalid read response code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(kernel.ObjectReadResult{
			State: state,
			Results: []kernel.ObjectReadItem{{
				Kind:  kernel.KindDomain,
				Ref:   "domain:A",
				Value: json.RawMessage(`{"name":"","includes":[]}`),
			}},
		})
	}))
	stdout.Reset()
	stderr.Reset()
	if code := runObjectRead(
		context.Background(),
		[]string{"domain:A", "--at", state, "--body"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 3 || stdout.Len() != 0 {
		t.Fatalf("invalid body response code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = io.WriteString(w, `{"code":"STALE_BASE_STATE","message":"stale"}`)
	}))
	stdout.Reset()
	stderr.Reset()
	if code := runObjectPatch(
		context.Background(),
		[]string{"--base-state", state, "--branch", "main", "--patch", "x"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "STALE_BASE_STATE") {
		t.Fatalf("patch public error code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	configureFakeCLIDaemon(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "{")
	}))
	stdout.Reset()
	stderr.Reset()
	if code := runObjectPatch(
		context.Background(),
		[]string{"--base-state", state, "--branch", "main", "--patch", "x"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 3 || stdout.Len() != 0 ||
		!strings.Contains(stderr.String(), "invalid Patch response") {
		t.Fatalf("invalid patch response code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}
