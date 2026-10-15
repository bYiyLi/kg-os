package mcpsandbox

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// The JS guest must never expose the Go/WASI host, and malformed guest calls
// must not leave the native/WASM runtime unable to serve later MCP requests.
func TestQuickJSGuestLowLevelInvalidExportsAndJSCalls(t *testing.T) {
	// WASM compilation and several guest calls run under the race detector in
	// CI. Bound this test independently of the production sandbox limits.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	g, err := newGuest(ctx, 1024)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close(context.Background())
	if _, err := g.call(ctx, "not_a_real_export"); err == nil || !strings.Contains(err.Error(), "missing export") {
		t.Errorf("WASM export allowlist bypass: %v", err)
	}
	if _, err := g.eval(ctx, "throw new TypeError('guest-only-syntax-error')"); err == nil {
		t.Fatal("guest exception not propagated")
	}
	driver, err := g.eval(ctx, "Object.freeze({answer:function(){return '42'},bad:function(){throw new Error('bad method call')},integer:17})")
	if err != nil {
		t.Fatal(err)
	}
	g.driver = driver
	result, err := g.method(ctx, "answer")
	if err != nil || result != "42" {
		t.Fatalf("JS method dispatch failed: %q %v", result, err)
	}
	if _, err := g.method(ctx, "bad"); err == nil || !strings.Contains(err.Error(), "bad method call") {
		t.Fatalf("JS method exceptions not isolated: %v", err)
	}
	if _, err := g.method(ctx, "missing"); err == nil {
		t.Fatal("undefined guest property was callable")
	}
	if _, err := g.method(ctx, "integer"); err == nil {
		t.Fatal("non-callable guest property was callable")
	}
	for _, text := range []string{"non-ASCII: 模型", strings.Repeat("a", 8192)} {
		value, err := g.jsString(ctx, text)
		if err != nil {
			t.Fatal(err)
		}
		actual, err := g.stringValue(ctx, value)
		g.freeValue(ctx, value)
		if err != nil || actual != text {
			t.Fatalf("JS string roundtrip changed at %d bytes: %v", len(text), err)
		}
	}
	g.free(ctx, 0)
}

func TestQuickJSGuestRejectsUnboundedMemoryAndStopsOnCancel(t *testing.T) {
	// Allocate fewer than the WASM module's minimum memory pages. The guest
	// constructor is responsible for closing partially initialized runtimes.
	started := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := newGuest(ctx, 1); err == nil {
		t.Fatal("QuickJS allowed a module larger than the prescribed memory limit")
	}
	if time.Since(started) > 2*time.Second {
		t.Error("invalid memory limit did not fail promptly")
	}

	ctx2, cancel2 := context.WithCancel(context.Background())
	cancel2()
	if guest, err := newGuest(ctx2, 1024); err == nil {
		_ = guest.Close(context.Background())
		t.Fatal("canceled context still instantiated native JS runtime")
	}
	good, err := newGuest(context.Background(), 1024)
	if err != nil {
		t.Fatal(err)
	}
	if err := good.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := good.Close(context.Background()); err != nil {
		t.Fatalf("WASM guest close is not idempotent: %v", err)
	}
}

func TestSandboxSafePublicCallErrorFormatting(t *testing.T) {
	public := &CallError{Code: "INVALID_ARGUMENT", Message: "invalid request"}
	if public.Error() != "INVALID_ARGUMENT: invalid request" {
		t.Fatalf("public error mismatch: %s", public)
	}
	script := &ScriptError{Code: "SCRIPT_ERROR", Message: "untrusted JS failure"}
	if script.Error() != "SCRIPT_ERROR: untrusted JS failure" {
		t.Fatal("script error changed")
	}
	if errors.Is(script, context.Canceled) {
		t.Fatal("script error unexpectedly wrapped cancellation")
	}
}
