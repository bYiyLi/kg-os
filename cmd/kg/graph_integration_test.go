//go:build lithograph_smoke

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestPhase05GraphCLIRealRuntimeAutoStartE2E(t *testing.T) {
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
	var stdout, stderr bytes.Buffer
	if code := runInstall(
		fullInstallArgs(strconv.Itoa(port), ""),
		strings.NewReader(""),
		false,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("install code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runGraph(
		context.Background(),
		[]string{"query", "--at", "branch/main", "--cypher", "RETURN 9223372036854775807 AS value"},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("auto-start query code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var queried kernel.GraphQueryResult
	if err := json.Unmarshal(stdout.Bytes(), &queried); err != nil {
		t.Fatalf("decode query stdout: %v (%q)", err, stdout.String())
	}
	if !isResolvedState(queried.State) || len(queried.Rows) != 1 ||
		string(queried.Rows[0][0]) != "{\"$type\":\"Integer\",\"value\":\"9223372036854775807\"}" ||
		stderr.Len() != 0 {
		t.Fatalf("query result=%#v stderr=%q", queried, stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runGraph(
		context.Background(),
		[]string{
			"execute", "--branch", "main",
			"--cypher", "CREATE (:Phase05CLI {name:$name}) RETURN $name",
			"--params", "{\"name\":\"Alice\"}",
		},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("execute code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var executed kernel.GraphExecuteResult
	if err := json.Unmarshal(stdout.Bytes(), &executed); err != nil {
		t.Fatalf("decode execute stdout: %v (%q)", err, stdout.String())
	}
	if !isResolvedState(executed.State) || executed.State == queried.State ||
		len(executed.Counters) == 0 || stderr.Len() != 0 {
		t.Fatalf("execute result=%#v stderr=%q", executed, stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runGraph(
		context.Background(),
		[]string{
			"query", "--at", "branch/main",
			"--cypher", "MATCH (n:Phase05CLI) RETURN n.name AS name",
			"--stream",
		},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("stream query code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if stderr.Len() != 0 ||
		!strings.Contains(stdout.String(), "\"type\":\"columns\"") ||
		!strings.Contains(stdout.String(), "\"type\":\"row\"") ||
		!strings.Contains(stdout.String(), "\"Alice\"") ||
		!strings.Contains(stdout.String(), "\"type\":\"summary\"") {
		t.Fatalf("stream query stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runGraph(
		context.Background(),
		[]string{
			"execute", "--branch", "main",
			"--cypher", "CREATE (:Phase05CLI {name:'Bob'}) RETURN 'Bob' AS name",
			"--stream",
		},
		strings.NewReader(""),
		true,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("stream execute code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if stderr.Len() != 0 ||
		!strings.Contains(stdout.String(), "\"type\":\"row\"") ||
		!strings.Contains(stdout.String(), "\"Bob\"") ||
		!strings.Contains(stdout.String(), "\"counters\":") {
		t.Fatalf("stream execute stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}
