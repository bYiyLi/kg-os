//go:build lithograph_smoke

package main

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestPhase16GoOnlyInitializationReceiptAndResume(t *testing.T) {
	prepareKGOSDTestRuntimePackage(t)
	root := t.TempDir()
	writeKGOSDIntegrationConfig(t, root)
	for iteration := 0; iteration < 2; iteration++ {
		var out, stderr bytes.Buffer
		code := run(context.Background(), []string{"init", "--root", root}, &out, &stderr)
		if code != 0 {
			t.Fatalf("Go init attempt %d failed: %s", iteration, stderr.String())
		}
		paths, err := runtimeprofile.ResolvePaths(root)
		if err != nil {
			t.Fatal(err)
		}
		complete, err := runtimeprofile.InitializationComplete(paths)
		if err != nil || !complete {
			t.Fatalf("init receipt attempt %d: %v %v", iteration, complete, err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan int, 1)
	var stderr bytes.Buffer
	go func() { done <- run(ctx, []string{"--root", root}, nil, &stderr) }()
	waitForKGOSDLocator(t, root, done, &stderr)
	cancel()
	select {
	case code := <-done:
		if code != 0 {
			t.Fatalf("restart after init failed: %s", stderr.String())
		}
	case <-time.After(10 * time.Second):
		t.Fatal("daemon did not stop")
	}
}

func TestPhase16GoInitDoesNotPublishReceiptOnFailure(t *testing.T) {
	prepareKGOSDTestRuntimePackage(t)
	root := t.TempDir()
	var out, stderr bytes.Buffer
	if code := run(context.Background(), []string{"init", "--root", root}, &out, &stderr); code == 0 {
		t.Fatal("init succeeded without complete explicit config.toml")
	}
	paths, err := runtimeprofile.ResolvePaths(root)
	if err != nil {
		t.Fatal(err)
	}
	completed, err := runtimeprofile.InitializationComplete(paths)
	if err != nil || completed {
		t.Fatalf("failed init published receipt: %t %v", completed, err)
	}
}
