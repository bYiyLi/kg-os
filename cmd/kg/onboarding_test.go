package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestInstallNonInteractiveRequiresCompleteConfiguration(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("KG_HOME", home)
	var stdout, stderr strings.Builder
	code := runInstall(
		[]string{"--server-host", "127.0.0.1"},
		strings.NewReader(""),
		false,
		&stdout,
		&stderr,
	)
	if code != 2 {
		t.Fatalf("code=%d stderr=%q", code, stderr.String())
	}
	var public map[string]any
	if err := json.Unmarshal([]byte(stderr.String()), &public); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if public["code"] != "INSTALL_CONFIGURATION_INCOMPLETE" {
		t.Fatalf("code = %v", public["code"])
	}
	details := public["details"].(map[string]any)
	missingAny := details["missing"].([]any)
	if len(missingAny) != 9 {
		t.Fatalf("missing = %#v", missingAny)
	}
	missing := make([]string, len(missingAny))
	for index := range missingAny {
		missing[index] = missingAny[index].(string)
	}
	for index := 1; index < len(missing); index++ {
		if missing[index-1] > missing[index] {
			t.Fatalf("missing keys are not sorted: %#v", missing)
		}
	}
	if _, err := os.Stat(home); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("incomplete install created KG_HOME: %v", err)
	}
}

func TestInstallFullyParameterizedAndIdempotent(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("KG_HOME", home)

	var stdout, stderr strings.Builder
	if code := runInstall(fullInstallArgs("4765", ""), failingReader{}, false, &stdout, &stderr); code != 0 {
		t.Fatalf("install code=%d stderr=%q", code, stderr.String())
	}
	var result installResult
	if err := json.Unmarshal([]byte(stdout.String()), &result); err != nil {
		t.Fatalf("decode install result: %v", err)
	}
	if result.Status != "installed" || result.Home != home {
		t.Fatalf("result = %#v", result)
	}
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(paths.Config)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	text := string(body)
	for _, key := range []string{
		"host", "port", "path", "max_size_mb", "analyzer",
		"base_url", "model", "dimensions", "similarity", "api_key_env",
	} {
		if !strings.Contains(text, key+" =") {
			t.Fatalf("config missing explicit key %q:\n%s", key, text)
		}
	}
	if strings.Contains(text, "enabled =") {
		t.Fatalf("config exposed cache.enabled:\n%s", text)
	}
	config, err := runtimeprofile.ParseConfig(paths, body)
	if err != nil {
		t.Fatalf("parse installed config: %v", err)
	}
	if len(config.SQLite.Extensions) != 2 ||
		config.SQLite.Extensions[0].Source != distribution.Lithograph ||
		config.SQLite.Extensions[1].Source != distribution.Provider {
		t.Fatalf("installed extensions = %#v", config.SQLite.Extensions)
	}
	if _, err := os.Stat(paths.Auth); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("install created auth.json: %v", err)
	}
	if _, err := os.Stat(paths.Database); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("install created kgos.db: %v", err)
	}

	stdout.Reset()
	stderr.Reset()
	if code := runInstall(nil, strings.NewReader(""), false, &stdout, &stderr); code != 0 {
		t.Fatalf("idempotent install code=%d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "\"status\":\"already_installed\"") {
		t.Fatalf("idempotent output = %q", stdout.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runInstall([]string{"--server-port", "5000"}, strings.NewReader(""), false, &stdout, &stderr); code != 2 {
		t.Fatalf("existing config with flags code=%d stderr=%q", code, stderr.String())
	}
}

func TestInstallInteractiveLocaleAndInitializationWarning(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	for _, test := range []struct {
		name    string
		locale  string
		warning string
	}{
		{name: "english", locale: "C", warning: "The following settings must not be changed after initialization."},
		{name: "chinese", locale: "zh_CN.UTF-8", warning: "以下配置初始化后禁止修改。"},
	} {
		t.Run(test.name, func(t *testing.T) {
			home := filepath.Join(t.TempDir(), "home")
			t.Setenv("KG_HOME", home)
			t.Setenv("LC_ALL", test.locale)
			var stdout, stderr strings.Builder
			if code := runInstall(nil, strings.NewReader(strings.Repeat("\n", 10)), true, &stdout, &stderr); code != 0 {
				t.Fatalf("install code=%d stderr=%q", code, stderr.String())
			}
			if strings.Count(stdout.String(), test.warning) != 1 {
				t.Fatalf("warning count/output = %d %q", strings.Count(stdout.String(), test.warning), stdout.String())
			}
			paths, _ := runtimeprofile.ResolvePaths(home)
			body, err := os.ReadFile(paths.Config)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(body), "api_key_env = \"OPENAI_API_KEY\"") {
				t.Fatalf("interactive recommendation not explicit:\n%s", body)
			}
		})
	}
}

func TestDoctorFreshProfileHasNoSideEffectsAndStoppedIsNonBlocking(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	parent := t.TempDir()
	home := filepath.Join(parent, "home")
	t.Setenv("KG_HOME", home)

	var stdout, stderr strings.Builder
	if code := runDoctor([]string{"--json"}, false, &stdout, &stderr); code != 0 {
		t.Fatalf("fresh doctor code=%d stderr=%q", code, stderr.String())
	}
	var fresh doctorResult
	if err := json.Unmarshal([]byte(stdout.String()), &fresh); err != nil {
		t.Fatal(err)
	}
	if fresh.Ready {
		t.Fatal("fresh uninstalled profile reported ready")
	}
	if _, err := os.Stat(home); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("doctor created KG_HOME: %v", err)
	}

	stdout.Reset()
	stderr.Reset()
	if code := runInstall(fullInstallArgs("4765", ""), strings.NewReader(""), false, &stdout, &stderr); code != 0 {
		t.Fatalf("install code=%d stderr=%q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runDoctor([]string{"--json"}, false, &stdout, &stderr); code != 0 {
		t.Fatalf("installed doctor code=%d stderr=%q", code, stderr.String())
	}
	var installed doctorResult
	if err := json.Unmarshal([]byte(stdout.String()), &installed); err != nil {
		t.Fatal(err)
	}
	if !installed.Ready {
		t.Fatalf("installed stopped profile not ready: %#v", installed)
	}
	check := findDoctorCheck(installed, "runtime")
	if check == nil || check.Status != "info" || check.Blocking || check.Details["state"] != "stopped" {
		t.Fatalf("runtime check = %#v", check)
	}
}

func TestDoctorReportsMissingEmbeddingEnvironment(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("KG_HOME", home)
	t.Setenv("MISSING_PHASE03_KEY", "")
	var stdout, stderr strings.Builder
	if code := runInstall(fullInstallArgs("4765", "MISSING_PHASE03_KEY"), strings.NewReader(""), false, &stdout, &stderr); code != 0 {
		t.Fatalf("install code=%d stderr=%q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runDoctor([]string{"--json"}, false, &stdout, &stderr); code != 0 {
		t.Fatalf("doctor code=%d stderr=%q", code, stderr.String())
	}
	var result doctorResult
	if err := json.Unmarshal([]byte(stdout.String()), &result); err != nil {
		t.Fatal(err)
	}
	check := findDoctorCheck(result, "embedding.environment")
	if result.Ready || check == nil || check.Status != "error" || !check.Blocking {
		t.Fatalf("embedding check = %#v ready=%v", check, result.Ready)
	}
}

func TestResolveCLITargetCredentialPrecedence(t *testing.T) {
	home := t.TempDir()
	t.Setenv("KG_HOME", home)
	t.Setenv("KG_TOKEN", "")
	paths, _ := runtimeprofile.ResolvePaths(home)
	if err := runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	credential, err := runtimeprofile.LoadOrCreateCredential(paths)
	if err != nil {
		t.Fatal(err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	listener, endpoint := listenTestEndpoint(t)
	defer listener.Close()
	if err := lock.PublishEndpoint(endpoint); err != nil {
		t.Fatal(err)
	}
	var stderr strings.Builder
	target, code := resolveCLITarget(context.Background(), &stderr)
	if code != 0 || target.Token != credential.Token {
		t.Fatalf("local credential target=%#v code=%d stderr=%q", target, code, stderr.String())
	}

	t.Setenv("KG_TOKEN", "explicit-token")
	stderr.Reset()
	target, code = resolveCLITarget(context.Background(), &stderr)
	if code != 0 || target.Token != "explicit-token" {
		t.Fatalf("explicit credential target=%#v code=%d stderr=%q", target, code, stderr.String())
	}
}

func TestEnsureRuntimeConcurrentSingleOwner(t *testing.T) {
	home := t.TempDir()
	paths, _ := runtimeprofile.ResolvePaths(home)
	listener, expectedEndpoint := listenTestEndpoint(t)
	defer listener.Close()
	restoreDistribution := replaceDistributionDiscovery(runtimeprofile.Distribution{Daemon: "fake-kgosd"})
	defer restoreDistribution()
	originalSpawn := spawnDaemon
	defer func() { spawnDaemon = originalSpawn }()

	releaseOwner := make(chan struct{})
	var winners atomic.Int32
	var spawnCalls atomic.Int32
	spawnDaemon = func(_ string, childHome string) (*spawnedDaemon, error) {
		spawnCalls.Add(1)
		done := make(chan error, 1)
		go func() {
			childPaths, _ := runtimeprofile.ResolvePaths(childHome)
			lock, err := runtimeprofile.AcquireLock(childPaths.Lock)
			if err != nil {
				done <- err
				close(done)
				return
			}
			winners.Add(1)
			if err := lock.PublishEndpoint(expectedEndpoint); err != nil {
				_ = lock.Close()
				done <- err
				close(done)
				return
			}
			<-releaseOwner
			_ = lock.Close()
			done <- nil
			close(done)
		}()
		return &spawnedDaemon{done: done}, nil
	}

	const callers = 8
	var wg sync.WaitGroup
	results := make(chan error, callers)
	for index := 0; index < callers; index++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			endpoint, err := ensureRuntime(context.Background(), paths)
			if err == nil && endpoint != expectedEndpoint {
				err = errors.New("unexpected endpoint " + endpoint)
			}
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	close(releaseOwner)
	for err := range results {
		if err != nil {
			t.Fatalf("ensure runtime: %v", err)
		}
	}
	if winners.Load() != 1 {
		t.Fatalf("active daemon winners = %d, spawn calls = %d", winners.Load(), spawnCalls.Load())
	}
}

func TestEnsureRuntimeWaitsForStartingOwner(t *testing.T) {
	home := t.TempDir()
	paths, _ := runtimeprofile.ResolvePaths(home)
	listener, expectedEndpoint := listenTestEndpoint(t)
	defer listener.Close()
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	originalSpawn := spawnDaemon
	spawnDaemon = func(string, string) (*spawnedDaemon, error) {
		return nil, errors.New("must not spawn while owner is starting")
	}
	defer func() { spawnDaemon = originalSpawn }()
	go func() {
		time.Sleep(50 * time.Millisecond)
		_ = lock.PublishEndpoint(expectedEndpoint)
	}()
	endpoint, err := ensureRuntime(context.Background(), paths)
	if err != nil || endpoint != expectedEndpoint {
		t.Fatalf("endpoint=%q want=%q err=%v", endpoint, expectedEndpoint, err)
	}
}

func fullInstallArgs(port, apiKeyEnv string) []string {
	return []string{
		"--server-host", "127.0.0.1",
		"--server-port", port,
		"--cache-path", "cache/openai-compatible.db",
		"--cache-max-size-mb", "4096",
		"--fulltext-analyzer", "unicode61",
		"--embedding-base-url", "https://example.invalid/v1",
		"--embedding-model", "phase03-test",
		"--embedding-dimensions", "3",
		"--embedding-similarity", "cosine",
		"--embedding-api-key-env", apiKeyEnv,
	}
}

func installTestDistribution(t *testing.T) runtimeprofile.Distribution {
	t.Helper()
	root := t.TempDir()
	mainLibrary := filepath.Join(root, "lithograph.fixture")
	providerLibrary := filepath.Join(root, "provider.fixture")
	if err := os.WriteFile(mainLibrary, []byte("main-extension"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(providerLibrary, []byte("provider-extension"), 0o600); err != nil {
		t.Fatal(err)
	}
	mainHash, _ := runtimeprofile.LocalFileSHA256(mainLibrary)
	providerHash, _ := runtimeprofile.LocalFileSHA256(providerLibrary)
	return runtimeprofile.Distribution{
		Root:             root,
		Daemon:           filepath.Join(root, "kgosd"),
		Lithograph:       mainLibrary,
		LithographSHA256: mainHash,
		Provider:         providerLibrary,
		ProviderSHA256:   providerHash,
	}
}

func replaceDistributionDiscovery(distribution runtimeprofile.Distribution) func() {
	original := discoverDistribution
	discoverDistribution = func() (runtimeprofile.Distribution, error) {
		return distribution, nil
	}
	return func() { discoverDistribution = original }
}

func findDoctorCheck(result doctorResult, id string) *doctorCheck {
	for index := range result.Checks {
		if result.Checks[index].ID == id {
			return &result.Checks[index]
		}
	}
	return nil
}

func listenTestEndpoint(t *testing.T) (net.Listener, string) {
	t.Helper()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen test endpoint: %v", err)
	}
	return listener, fmt.Sprintf("http://%s", listener.Addr())
}
