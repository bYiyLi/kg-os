//go:build lithograph_smoke

package main

import (
	"context"
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestAutoStartReportsRealDaemonStartupFailure(t *testing.T) {
	daemonBinary := os.Getenv("KGOS_KGOSD_BINARY")
	if daemonBinary == "" {
		t.Skip("kgosd fixture environment is not available")
	}
	originalDiscovery := discoverDistribution
	originalSpawn := spawnDaemon
	defer func() {
		discoverDistribution = originalDiscovery
		spawnDaemon = originalSpawn
	}()
	discoverDistribution = func() (runtimeprofile.Distribution, error) {
		return runtimeprofile.Distribution{Daemon: daemonBinary}, nil
	}
	spawnDaemon = startDaemon

	home := t.TempDir()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(paths.Config, []byte("[server]\nport = 0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := ensureRuntime(context.Background(), paths); err == nil ||
		!strings.Contains(err.Error(), "config.toml missing required field server.host") {
		t.Fatalf("startup failure diagnostic = %v", err)
	}
	if _, err := runtimeprofile.ReadActiveEndpoint(paths.Lock); !errors.Is(err, runtimeprofile.ErrNoActiveDaemon) {
		t.Fatalf("failed auto-start left an active daemon: %v", err)
	}
}

func TestFreshInstalledProfileAutoStartsRealRuntime(t *testing.T) {
	mainLibrary := os.Getenv("KGOS_LITHOGRAPH_LIBRARY")
	providerLibrary := os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY")
	if mainLibrary == "" || providerLibrary == "" {
		t.Skip("native Lithograph fixture environment is not available")
	}
	daemonBinary := os.Getenv("KGOS_KGOSD_BINARY")
	if daemonBinary == "" {
		t.Fatal("KGOS_KGOSD_BINARY is required")
	}
	mainHash, err := runtimeprofile.LocalFileSHA256(mainLibrary)
	if err != nil {
		t.Fatal(err)
	}
	providerHash, err := runtimeprofile.LocalFileSHA256(providerLibrary)
	if err != nil {
		t.Fatal(err)
	}
	distribution := runtimeprofile.Distribution{
		Daemon:           daemonBinary,
		Lithograph:       mainLibrary,
		LithographSHA256: mainHash,
		Provider:         providerLibrary,
		ProviderSHA256:   providerHash,
	}
	restoreDistribution := replaceDistributionDiscovery(distribution)
	defer restoreDistribution()

	originalSpawn := spawnDaemon
	defer func() { spawnDaemon = originalSpawn }()
	var daemonMu sync.Mutex
	var daemons []*exec.Cmd
	spawnDaemon = func(executable, home string) (*spawnedDaemon, error) {
		command := exec.Command(executable)
		command.Env = environmentWithKGHome(os.Environ(), home)
		configureDetached(command)
		if err := command.Start(); err != nil {
			return nil, err
		}
		daemonMu.Lock()
		daemons = append(daemons, command)
		daemonMu.Unlock()
		done := make(chan error, 1)
		go func() {
			done <- command.Wait()
			close(done)
		}()
		return &spawnedDaemon{done: done}, nil
	}
	defer func() {
		daemonMu.Lock()
		defer daemonMu.Unlock()
		for _, daemon := range daemons {
			if daemon != nil && daemon.Process != nil {
				_ = daemon.Process.Signal(os.Interrupt)
			}
		}
	}()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	_ = listener.Close()

	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("KG_HOME", home)
	t.Setenv("KG_TOKEN", "")
	var stdout, stderr strings.Builder
	if code := runInstall(fullInstallArgs(strconv.Itoa(port), ""), strings.NewReader(""), false, &stdout, &stderr); code != 0 {
		t.Fatalf("install code=%d stderr=%q", code, stderr.String())
	}

	type commandResult struct {
		code   int
		stdout string
		stderr string
	}
	results := make(chan commandResult, 2)
	var callers sync.WaitGroup
	for range 2 {
		callers.Add(1)
		go func() {
			defer callers.Done()
			var callerStdout, callerStderr strings.Builder
			code := runOntology(
				context.Background(),
				[]string{"--at", "branch/main"},
				strings.NewReader(""),
				true,
				&callerStdout,
				&callerStderr,
			)
			results <- commandResult{
				code:   code,
				stdout: callerStdout.String(),
				stderr: callerStderr.String(),
			}
		}()
	}
	callers.Wait()
	close(results)
	for result := range results {
		if result.code != 0 {
			t.Fatalf("concurrent ontology code=%d stderr=%q", result.code, result.stderr)
		}
		if result.stdout == "" {
			t.Fatal("concurrent ontology returned empty output")
		}
	}
	paths, _ := runtimeprofile.ResolvePaths(home)
	if _, err := os.Stat(paths.Auth); err != nil {
		t.Fatalf("auto-start did not create auth.json: %v", err)
	}
	if _, err := os.Stat(paths.Database); err != nil {
		t.Fatalf("auto-start did not create kgos.db: %v", err)
	}
	if _, err := runtimeprofile.ReadActiveEndpoint(paths.Lock); err != nil {
		t.Fatalf("auto-start did not publish endpoint: %v", err)
	}

	t.Setenv("KG_TOKEN", "definitely-wrong")
	stdout.Reset()
	stderr.Reset()
	if code := runOntology(
		context.Background(),
		[]string{"--at", "branch/main"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 1 {
		t.Fatalf("wrong explicit token code=%d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), "AUTHENTICATION_FAILED") {
		t.Fatalf("wrong explicit token error=%q", stderr.String())
	}
}
