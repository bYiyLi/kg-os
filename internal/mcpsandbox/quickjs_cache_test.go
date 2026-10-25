package mcpsandbox

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/tetratelabs/wazero"
)

func TestQuickJSCacheConcurrentGuestIsolationAndMemoryLimits(t *testing.T) {
	// This watchdog bounds the test, without changing Execute's 15 s budget.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	type guestResult struct {
		guest *guest
		pages uint32
		err   error
	}
	const count = 2
	created := make(chan guestResult, count)
	for _, pages := range []uint32{128, 256} {
		go func() {
			g, err := newGuest(ctx, pages)
			created <- guestResult{guest: g, pages: pages, err: err}
		}()
	}
	guests := make([]guestResult, 0, count)
	for range count {
		item := <-created
		if item.err != nil {
			t.Errorf("create guest with %d pages: %v", item.pages, item.err)
			continue
		}
		t.Cleanup(func() { _ = item.guest.Close(context.Background()) })
		guests = append(guests, item)
		value, err := item.guest.eval(ctx, fmt.Sprintf("globalThis.cacheMarker = 'guest-%d'", item.pages))
		if err != nil {
			t.Errorf("set independent global: %v", err)
			continue
		}
		item.guest.freeValue(ctx, value)
	}
	if len(guests) != count {
		t.FailNow()
	}
	// Both guests remain alive and execute concurrently after setting distinct
	// globals. A reused instance/context would return the other guest's value.
	checked := make(chan error, count)
	for _, item := range guests {
		go func() {
			value, err := item.guest.eval(ctx, "String(globalThis.cacheMarker)")
			if err != nil {
				checked <- err
				return
			}
			actual, err := item.guest.stringValue(ctx, value)
			item.guest.freeValue(ctx, value)
			if err != nil || actual != fmt.Sprintf("guest-%d", item.pages) {
				checked <- fmt.Errorf("global leaked between guests: %q, %v", actual, err)
				return
			}
			memory := item.guest.mod.Memory()
			// Max's boolean describes whether WASM encoded a maximum, not
			// whether the runtime's configured cap is enforced by Grow.
			maximum, _ := memory.Definition().Max()
			if maximum != item.pages {
				checked <- fmt.Errorf("cached code changed memory limit: max=%d want=%d", maximum, item.pages)
				return
			}
			current, _ := memory.Grow(0)
			if current > item.pages {
				checked <- fmt.Errorf("guest already exceeded memory limit: %d > %d", current, item.pages)
				return
			}
			if _, ok := memory.Grow(item.pages - current + 1); ok {
				checked <- fmt.Errorf("guest grew past its %d page limit", item.pages)
				return
			}
			checked <- nil
		}()
	}
	for range count {
		if err := <-checked; err != nil {
			t.Error(err)
		}
	}
}

func TestQuickJSCacheGuestCancellationAndRecovery(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	guestCtx, stopGuest := context.WithCancel(ctx)
	defer stopGuest()
	cancelled, err := newGuest(guestCtx, 128)
	if err != nil {
		t.Fatal(err)
	}
	defer cancelled.Close(context.Background())
	survivor, err := newGuest(ctx, 256)
	if err != nil {
		t.Fatal(err)
	}
	defer survivor.Close(context.Background())
	started := make(chan struct{})
	finished := make(chan error, 1)
	go func() {
		close(started)
		_, err := cancelled.eval(guestCtx, "while (true) {}")
		finished <- err
	}()
	<-started
	stopGuest()
	select {
	case err := <-finished:
		if err == nil {
			t.Fatal("cancelled guest completed an infinite loop")
		}
	case <-ctx.Done():
		t.Fatal("guest ignored cancellation")
	}
	if err := cancelled.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	// The shared cache must not turn one guest's cancellation/Close into a
	// shutdown of a different live runtime or a bypass of later memory checks.
	value, err := survivor.eval(ctx, "'still isolated'")
	if err != nil {
		t.Fatalf("closing another guest affected this runtime: %v", err)
	}
	actual, err := survivor.stringValue(ctx, value)
	survivor.freeValue(ctx, value)
	if err != nil || actual != "still isolated" {
		t.Fatalf("surviving guest returned %q, %v", actual, err)
	}
	if g, err := newGuest(ctx, 1); err == nil {
		_ = g.Close(context.Background())
		t.Fatal("warm compilation cache bypassed an insufficient memory limit")
	}
	stoppedCtx, stop := context.WithCancel(ctx)
	stop()
	if g, err := newGuest(stoppedCtx, 128); err == nil {
		_ = g.Close(context.Background())
		t.Fatal("warm compilation cache bypassed cancellation")
	}
	recovered, err := newGuest(ctx, 128)
	if err != nil {
		t.Fatalf("failed guest poisoned later compilation: %v", err)
	}
	defer recovered.Close(context.Background())
	if value, err := recovered.eval(ctx, "21 * 2"); err != nil {
		t.Fatalf("recovered guest cannot execute: %v", err)
	} else {
		recovered.freeValue(ctx, value)
	}
}

func TestQuickJSCompileSlotCancellation(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rt := wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfig().WithCompilationCache(quickJSCompilationCache).WithCloseOnContextDone(true).WithMemoryLimitPages(128))
	defer rt.Close(context.Background())
	quickJSCompileSlot <- struct{}{}
	held := true
	defer func() {
		if held {
			<-quickJSCompileSlot
		}
	}()
	waitCtx, cancelWait := context.WithCancel(ctx)
	defer cancelWait()
	started := make(chan struct{})
	finished := make(chan error, 1)
	go func() {
		close(started)
		compiled, pinned, err := compileQuickJS(waitCtx, rt)
		if compiled != nil && !pinned {
			_ = compiled.Close(context.Background())
		}
		finished <- err
	}()
	<-started
	cancelWait()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("compilation wait ignored cancellation: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("cancelled compilation wait did not return while slot was held")
	}
	<-quickJSCompileSlot
	held = false
	// No duration threshold: successful execution after releasing the slot
	// proves the canceled waiter did not consume it or poison initialization.
	g, err := newGuest(ctx, 128)
	if err != nil {
		t.Fatalf("compile slot unusable after canceled wait: %v", err)
	}
	defer g.Close(context.Background())
}
