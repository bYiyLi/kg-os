package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

var runtimeStartupTimeout = 15 * time.Second

var discoverDistribution = runtimeprofile.DiscoverDistribution

const daemonStartupDiagnosticLimit = 16 << 10

type spawnedDaemon struct {
	done       <-chan error
	diagnostic *startupDiagnostic
}

var spawnDaemon = startDaemon

type startupDiagnostic struct {
	buffer    bytes.Buffer
	truncated bool
}

func (diagnostic *startupDiagnostic) Write(body []byte) (int, error) {
	written := len(body)
	remaining := daemonStartupDiagnosticLimit - diagnostic.buffer.Len()
	if remaining <= 0 {
		diagnostic.truncated = diagnostic.truncated || written != 0
		return written, nil
	}
	if len(body) > remaining {
		body = body[:remaining]
		diagnostic.truncated = true
	}
	_, _ = diagnostic.buffer.Write(body)
	return written, nil
}

func (diagnostic *startupDiagnostic) String() string {
	if diagnostic == nil {
		return ""
	}
	message := strings.TrimSpace(diagnostic.buffer.String())
	if message != "" && diagnostic.truncated {
		message += " [truncated]"
	}
	return message
}

func ensureRuntime(ctx context.Context, paths runtimeprofile.Paths) (string, error) {
	deadline := time.NewTimer(runtimeStartupTimeout)
	defer deadline.Stop()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	var child *spawnedDaemon
	spawnAttempted := false
	for {
		status := runtimeprofile.InspectDaemon(paths.Lock)
		switch status.State {
		case runtimeprofile.DaemonRunning:
			return strings.TrimRight(status.Endpoint, "/"), nil
		case runtimeprofile.DaemonUnavailable:
			if status.Err != nil {
				return "", status.Err
			}
			return "", fmt.Errorf("active kgosd owner is unavailable")
		case runtimeprofile.DaemonStopped:
			if spawnAttempted {
				if child == nil {
					return "", fmt.Errorf("kgosd exited before publishing its endpoint")
				}
				select {
				case err := <-child.done:
					return "", daemonStartupExitError(child, err)
				default:
				}
			} else {
				distribution, err := discoverDistribution()
				if err != nil {
					return "", fmt.Errorf("locate kgosd distribution: %w", err)
				}
				child, err = spawnDaemon(distribution.Daemon, paths.Home)
				if err != nil {
					return "", fmt.Errorf("start kgosd: %w", err)
				}
				spawnAttempted = true
			}
		case runtimeprofile.DaemonStarting:
			// Another caller or the child started above owns the lock and has
			// not published the ready endpoint yet.
		}

		if child != nil {
			select {
			case err := <-child.done:
				status = runtimeprofile.InspectDaemon(paths.Lock)
				if status.State != runtimeprofile.DaemonStarting &&
					status.State != runtimeprofile.DaemonRunning {
					return "", daemonStartupExitError(child, err)
				}
				child = nil
			default:
			}
		}

		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-deadline.C:
			return "", fmt.Errorf("kgosd startup timed out")
		case <-ticker.C:
		}
	}
}

func startDaemon(executable, home string) (*spawnedDaemon, error) {
	command := exec.Command(executable)
	command.Env = environmentWithKGHome(os.Environ(), home)
	diagnostic := &startupDiagnostic{}
	command.Stderr = diagnostic
	configureDetached(command)
	if err := command.Start(); err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() {
		done <- command.Wait()
		close(done)
	}()
	return &spawnedDaemon{done: done, diagnostic: diagnostic}, nil
}

func daemonStartupExitError(child *spawnedDaemon, err error) error {
	message := "kgosd exited before readiness"
	if err != nil {
		message += ": " + err.Error()
	}
	if diagnostic := child.diagnostic.String(); diagnostic != "" {
		message += ": " + diagnostic
	}
	return fmt.Errorf("%s", message)
}

func environmentWithKGHome(environment []string, home string) []string {
	result := make([]string, 0, len(environment)+1)
	for _, entry := range environment {
		if strings.HasPrefix(entry, "KG_HOME=") {
			continue
		}
		result = append(result, entry)
	}
	return append(result, "KG_HOME="+home)
}
