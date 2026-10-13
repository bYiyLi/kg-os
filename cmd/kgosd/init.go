package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

// initializeRuntime reuses the exact daemon startup/lock/HTTP authentication
// path, without introducing a second Node CLI or Knowledge Base bootstrap.
// The one-shot server closes before the initialization receipt is published.
func initializeRuntime(ctx context.Context, rt *runtimehost.Runtime) error {
	complete, err := runtimeprofile.InitializationComplete(rt.Paths)
	if err != nil {
		return err
	}
	initCtx, cancel := context.WithCancel(ctx)
	serverDone := make(chan error, 1)
	finished := false
	go func() {
		serverDone <- daemon.Serve(initCtx, rt, daemon.NewHandler(rt, http.NotFoundHandler()), nil)
	}()
	defer func() {
		cancel()
		if !finished {
			<-serverDone
		}
	}()
	timeout := time.NewTimer(15 * time.Second)
	defer timeout.Stop()
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	var endpoint string
	for endpoint == "" {
		if active, lookupErr := rt.Endpoint(); lookupErr == nil && strings.HasPrefix(active, "http://127.0.0.1:") {
			endpoint = active
			break
		}
		select {
		case startupErr := <-serverDone:
			finished = true
			return fmt.Errorf("initialization server stopped early: %w", startupErr)
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout.C:
			return errors.New("initialization daemon readiness timed out")
		case <-ticker.C:
		}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/api/v1/evolution/overview", strings.NewReader("{}"))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+rt.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("authenticated daemon initialization readiness: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("authenticated daemon initialization readiness returned HTTP %d", response.StatusCode)
	}
	var overview kernel.EvolutionOverviewResult
	decoder := json.NewDecoder(io.LimitReader(response.Body, 1<<20))
	if err := decoder.Decode(&overview); err != nil {
		return fmt.Errorf("decode daemon initialization readiness: %w", err)
	}
	if overview.State == "" || overview.DefaultBranch == "" {
		return errors.New("daemon readiness returned incomplete Knowledge Base overview")
	}
	cancel()
	if err := <-serverDone; err != nil {
		finished = true
		return fmt.Errorf("stop initialization daemon: %w", err)
	}
	finished = true
	// The authenticated HTTP listener and Kernel were usable.
	if complete {
		return nil
	}
	return runtimeprofile.PublishInitializationReceipt(rt.Paths)
}
