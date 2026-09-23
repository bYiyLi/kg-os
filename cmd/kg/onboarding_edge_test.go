package main

import (
	"bufio"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestLocalizedHelpAndHumanDoctorRendering(t *testing.T) {
	for _, test := range []struct {
		locale cliLocale
		want   string
	}{
		{locale: localeEnglish, want: "KG OS command-line client"},
		{locale: localeChinese, want: "KG OS 命令行客户端"},
	} {
		if !strings.Contains(rootHelp(test.locale), test.want) {
			t.Fatalf("root help for %s is not localized", test.locale)
		}
		if !strings.Contains(ontologyHelp(test.locale), "Ontology") {
			t.Fatalf("ontology help for %s is incomplete", test.locale)
		}
		if !strings.Contains(installHelp(test.locale), "kg install") {
			t.Fatalf("install help for %s is incomplete", test.locale)
		}
		if !strings.Contains(doctorHelp(test.locale), "kg doctor") {
			t.Fatalf("doctor help for %s is incomplete", test.locale)
		}
	}

	result := doctorResult{
		Ready: false,
		Checks: []doctorCheck{
			{ID: "profile", Status: "ok", Message: "profile"},
			{ID: "config", Status: "ok", Message: "config"},
			{ID: "distribution", Status: "error", Message: "distribution"},
			{ID: "extensions", Status: "info", Message: "extensions"},
			{ID: "embedding.environment", Status: "error", Message: "embedding"},
			{ID: "runtime", Status: "info", Message: "runtime", Details: map[string]any{"state": "stopped"}},
		},
	}
	var output strings.Builder
	writeDoctorHuman(&output, localeChinese, result)
	if !strings.Contains(output.String(), "KG OS 诊断") ||
		!strings.Contains(output.String(), "就绪: 否") ||
		!strings.Contains(output.String(), "kgosd 状态: stopped") {
		t.Fatalf("Chinese doctor output = %q", output.String())
	}
	output.Reset()
	result.Ready = true
	writeDoctorHuman(&output, localeEnglish, result)
	if !strings.Contains(output.String(), "KG OS doctor") || !strings.Contains(output.String(), "Ready: yes") {
		t.Fatalf("English doctor output = %q", output.String())
	}
}

func TestDetectLocalePriorityAndFallback(t *testing.T) {
	t.Setenv("LC_ALL", "")
	t.Setenv("LC_MESSAGES", "zh_TW.UTF-8")
	t.Setenv("LANG", "C")
	if locale := detectLocale(); locale != localeChinese {
		t.Fatalf("LC_MESSAGES locale = %q, want zh", locale)
	}

	t.Setenv("LC_ALL", "en_US.UTF-8")
	if locale := detectLocale(); locale != localeEnglish {
		t.Fatalf("LC_ALL locale = %q, want en", locale)
	}

	t.Setenv("LC_ALL", "")
	t.Setenv("LC_MESSAGES", "")
	t.Setenv("LANG", "unknown_LOCALE")
	if locale := detectLocale(); locale != localeEnglish {
		t.Fatalf("unknown locale = %q, want en", locale)
	}
	if text := doctorReadyText(localeChinese, true); text != "就绪: 是" {
		t.Fatalf("Chinese ready text = %q", text)
	}
	if text := unsupportedCommandMessage(localeEnglish); text != "command is not available in the current implementation" {
		t.Fatalf("English unsupported-command text = %q", text)
	}
}

func TestRootAndDiagnosticHelpValidation(t *testing.T) {
	t.Setenv("LC_ALL", "zh_CN.UTF-8")
	var stdout, stderr strings.Builder
	if code := run(context.Background(), nil, strings.NewReader(""), false, &stdout, &stderr); code != 0 {
		t.Fatalf("root help exit=%d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "KG OS 命令行客户端") {
		t.Fatalf("root help = %q", stdout.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runDoctor([]string{"--help"}, false, &stdout, &stderr); code != 0 ||
		!strings.Contains(stdout.String(), "kg doctor") {
		t.Fatalf("doctor help exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runDoctor([]string{"--json", "--json"}, false, &stdout, &stderr); code != 2 {
		t.Fatalf("duplicate --json exit=%d stderr=%q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := runDoctor([]string{"--unknown"}, false, &stdout, &stderr); code != 2 {
		t.Fatalf("unknown doctor option exit=%d stderr=%q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(),
		[]string{"definitely-not-a-command"},
		strings.NewReader(""),
		false,
		&stdout,
		&stderr,
	); code != 2 {
		t.Fatalf("unknown command exit=%d stderr=%q", code, stderr.String())
	}
	if stdout.Len() != 0 ||
		!strings.Contains(stderr.String(), "INVALID_ARGUMENT") ||
		!strings.Contains(stderr.String(), "当前命令不可用") {
		t.Fatalf("unknown command output stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	if writerIsTerminal(&stdout) {
		t.Fatal("strings.Builder unexpectedly reported as a terminal")
	}
	file, err := os.CreateTemp(t.TempDir(), "output")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	_ = writerIsTerminal(file)
}

func TestInstallParserAndWriteFailures(t *testing.T) {
	for _, args := range [][]string{
		{"--unknown", "value"},
		{"--server-host"},
		{"--server-host", "--server-port", "4765"},
		{"--server-host", "127.0.0.1", "--server-host", "127.0.0.2"},
	} {
		if _, err := parseInstallCLI(args); err == nil {
			t.Fatalf("parseInstallCLI(%q) succeeded", args)
		}
	}

	distribution := installTestDistribution(t)
	for _, test := range []struct {
		name string
		args []string
		want string
	}{
		{name: "port", args: fullInstallArgs("not-a-port", ""), want: "server.port"},
		{name: "cache", args: replaceInstallArg(fullInstallArgs("4765", ""), "--cache-max-size-mb", "x"), want: "cache.max_size_mb"},
		{name: "dimensions", args: replaceInstallArg(fullInstallArgs("4765", ""), "--embedding-dimensions", "x"), want: "embedding.dimensions"},
	} {
		t.Run(test.name, func(t *testing.T) {
			input, err := parseInstallCLI(test.args)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := input.config(distribution); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("config error = %v, want %q", err, test.want)
			}
		})
	}

	path := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(path, []byte("existing"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeConfigAtomic(path, []byte("replacement")); err == nil ||
		!strings.Contains(err.Error(), "appeared") {
		t.Fatalf("existing-target write error = %v", err)
	}
	missingParent := filepath.Join(t.TempDir(), "missing", "config.toml")
	if err := writeConfigAtomic(missingParent, []byte("config")); err == nil {
		t.Fatal("writeConfigAtomic accepted a missing parent directory")
	}
}

func TestEmbeddingAPIKeyPromptCanSelectExplicitNoAuth(t *testing.T) {
	var stdout strings.Builder
	value, err := readInstallPrompt(
		bufio.NewReader(strings.NewReader("\"\"\n")),
		&stdout,
		localeEnglish,
		"embedding.api_key_env",
		"OPENAI_API_KEY",
	)
	if err != nil {
		t.Fatalf("read prompt: %v", err)
	}
	if value != "" {
		t.Fatalf("explicit no-auth value = %q", value)
	}
	if !strings.Contains(stdout.String(), "enter \"\" for no auth") {
		t.Fatalf("prompt does not explain explicit no-auth input: %q", stdout.String())
	}
}

func TestRunInstallFailureSurfaces(t *testing.T) {
	originalDiscovery := discoverDistribution
	defer func() { discoverDistribution = originalDiscovery }()

	var stdout, stderr strings.Builder
	if code := runInstall([]string{"--help"}, strings.NewReader(""), false, &stdout, &stderr); code != 0 ||
		!strings.Contains(stdout.String(), "kg install") {
		t.Fatalf("install help code=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	home := t.TempDir()
	t.Setenv("KG_HOME", home)
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte("[server]\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stdout.Reset()
	stderr.Reset()
	if code := runInstall(nil, strings.NewReader(""), false, &stdout, &stderr); code != 2 ||
		!strings.Contains(stderr.String(), "missing required field") {
		t.Fatalf("invalid existing config code=%d stderr=%q", code, stderr.String())
	}

	if err := os.Remove(filepath.Join(home, "config.toml")); err != nil {
		t.Fatal(err)
	}
	discoverDistribution = func() (runtimeprofile.Distribution, error) {
		return runtimeprofile.Distribution{}, errors.New("fixture distribution failure")
	}
	stdout.Reset()
	stderr.Reset()
	if code := runInstall(fullInstallArgs("4765", ""), strings.NewReader(""), false, &stdout, &stderr); code != 2 ||
		!strings.Contains(stderr.String(), "validate KG OS distribution failed") {
		t.Fatalf("distribution failure code=%d stderr=%q", code, stderr.String())
	}

	distribution := installTestDistribution(t)
	discoverDistribution = func() (runtimeprofile.Distribution, error) {
		return distribution, nil
	}
	stdout.Reset()
	stderr.Reset()
	badHost := replaceInstallArg(fullInstallArgs("4765", ""), "--server-host", "localhost")
	if code := runInstall(badHost, strings.NewReader(""), false, &stdout, &stderr); code != 2 ||
		!strings.Contains(stderr.String(), "server.host") {
		t.Fatalf("invalid supplied value code=%d stderr=%q", code, stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runInstall(
		[]string{"--server-host", "localhost"},
		strings.NewReader(strings.Repeat("\n", 9)),
		true,
		&stdout,
		&stderr,
	); code != 2 || !strings.Contains(stderr.String(), "server.host") {
		t.Fatalf("invalid partial interactive value code=%d stderr=%q", code, stderr.String())
	}
	if stdout.Len() != 0 {
		t.Fatalf("invalid supplied value unexpectedly prompted: %q", stdout.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runInstall(nil, failingReader{}, true, &stdout, &stderr); code != 2 ||
		!strings.Contains(stderr.String(), "read installation input failed") {
		t.Fatalf("prompt read failure code=%d stderr=%q", code, stderr.String())
	}
}

func TestRunDispatchesOnboardingHelp(t *testing.T) {
	for _, args := range [][]string{
		{"install", "--help"},
		{"doctor", "--help"},
		{"unknown", "--help"},
	} {
		var stdout, stderr strings.Builder
		if code := run(
			context.Background(),
			args,
			strings.NewReader(""),
			false,
			&stdout,
			&stderr,
		); code != 0 {
			t.Fatalf("run(%q) code=%d stderr=%q", args, code, stderr.String())
		}
		if stdout.Len() == 0 {
			t.Fatalf("run(%q) returned empty help", args)
		}
	}
}

func TestRunDoctorHumanViewAndInstallArgumentError(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("KG_HOME", home)
	t.Setenv("LC_ALL", "C")
	var stdout, stderr strings.Builder
	if code := runInstall(
		fullInstallArgs("4765", ""),
		strings.NewReader(""),
		false,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("install code=%d stderr=%q", code, stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runDoctor(nil, true, &stdout, &stderr); code != 0 {
		t.Fatalf("human doctor code=%d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "KG OS doctor") ||
		!strings.Contains(stdout.String(), "Ready: yes") {
		t.Fatalf("human doctor output = %q", stdout.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := runInstall(
		[]string{"--server-port", "not-a-port", "--unknown", "x"},
		strings.NewReader(""),
		false,
		&stdout,
		&stderr,
	); code != 2 {
		t.Fatalf("invalid install args code=%d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), "INVALID_ARGUMENT") {
		t.Fatalf("invalid install args error = %q", stderr.String())
	}
}

func TestDoctorReportsInvalidConfigAndDistributionFailure(t *testing.T) {
	originalDiscovery := discoverDistribution
	defer func() { discoverDistribution = originalDiscovery }()
	discoverDistribution = func() (runtimeprofile.Distribution, error) {
		return runtimeprofile.Distribution{}, errors.New("fixture distribution failure")
	}
	home := t.TempDir()
	t.Setenv("KG_HOME", home)
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte("[server]\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := diagnose()
	if err != nil {
		t.Fatal(err)
	}
	if result.Ready {
		t.Fatal("invalid config/distribution reported ready")
	}
	configCheck := findDoctorCheck(result, "config")
	distributionCheck := findDoctorCheck(result, "distribution")
	if configCheck == nil || configCheck.Status != "error" ||
		distributionCheck == nil || distributionCheck.Status != "error" {
		t.Fatalf("doctor checks = %#v", result.Checks)
	}
}

func TestDoctorRuntimeStatesAndAvailableEmbeddingEnvironment(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("KG_HOME", home)
	t.Setenv("PHASE03_READY_KEY", "secret")
	var stdout, stderr strings.Builder
	if code := runInstall(
		fullInstallArgs("4765", "PHASE03_READY_KEY"),
		strings.NewReader(""),
		false,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("install code=%d stderr=%q", code, stderr.String())
	}
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()

	starting, err := diagnose()
	if err != nil {
		t.Fatal(err)
	}
	if !starting.Ready {
		t.Fatalf("starting runtime should remain ready: %#v", starting)
	}
	if check := findDoctorCheck(starting, "runtime"); check == nil ||
		check.Status != "info" || check.Details["state"] != "starting" {
		t.Fatalf("starting runtime check = %#v", check)
	}
	if check := findDoctorCheck(starting, "embedding.environment"); check == nil ||
		check.Status != "ok" || check.Blocking {
		t.Fatalf("embedding environment check = %#v", check)
	}

	listener, endpoint := listenTestEndpoint(t)
	if err := lock.PublishEndpoint(endpoint); err != nil {
		t.Fatal(err)
	}
	running, err := diagnose()
	if err != nil {
		t.Fatal(err)
	}
	if !running.Ready {
		t.Fatalf("running runtime should be ready: %#v", running)
	}
	if check := findDoctorCheck(running, "runtime"); check == nil ||
		check.Status != "ok" || check.Details["state"] != "running" {
		t.Fatalf("running runtime check = %#v", check)
	}

	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	unreachable, err := diagnose()
	if err != nil {
		t.Fatal(err)
	}
	if unreachable.Ready {
		t.Fatal("unreachable active endpoint reported ready")
	}
	if check := findDoctorCheck(unreachable, "runtime"); check == nil ||
		check.Status != "error" || !check.Blocking ||
		check.Details["state"] != "unavailable" {
		t.Fatalf("unreachable runtime check = %#v", check)
	}

	file, err := os.OpenFile(paths.Lock, os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString("{\"unexpected\":true}"); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	unavailable, err := diagnose()
	if err != nil {
		t.Fatal(err)
	}
	if unavailable.Ready {
		t.Fatal("unavailable active owner reported ready")
	}
	if check := findDoctorCheck(unavailable, "runtime"); check == nil ||
		check.Status != "error" || !check.Blocking ||
		check.Details["state"] != "unavailable" {
		t.Fatalf("unavailable runtime check = %#v", check)
	}
}

func TestDoctorUnreadableConfigIsBlocking(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	home := t.TempDir()
	t.Setenv("KG_HOME", home)
	if err := os.Mkdir(filepath.Join(home, "config.toml"), 0o700); err != nil {
		t.Fatal(err)
	}
	result, err := diagnose()
	if err != nil {
		t.Fatal(err)
	}
	if result.Ready {
		t.Fatal("unreadable config reported ready")
	}
	check := findDoctorCheck(result, "config")
	if check == nil || check.Status != "error" || !check.Blocking ||
		check.Message != "config.toml cannot be read" {
		t.Fatalf("config check = %#v", check)
	}
}

func TestInstallPartialInteractivePromptsOnlyMissingFields(t *testing.T) {
	distribution := installTestDistribution(t)
	restore := replaceDistributionDiscovery(distribution)
	defer restore()
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("KG_HOME", home)
	var stdout, stderr strings.Builder
	if code := runInstall(
		[]string{"--server-host", "127.0.0.1"},
		strings.NewReader(strings.Repeat("\n", 9)),
		true,
		&stdout,
		&stderr,
	); code != 0 {
		t.Fatalf("partial interactive install code=%d stderr=%q", code, stderr.String())
	}
	if strings.Contains(stdout.String(), "server.host (") ||
		strings.Contains(stdout.String(), "server.host（") {
		t.Fatalf("provided server.host was prompted again: %q", stdout.String())
	}
	if strings.Count(stdout.String(), initializationWarning(detectLocale())) != 1 {
		t.Fatalf("initialization warning count/output = %q", stdout.String())
	}
	paths, _ := runtimeprofile.ResolvePaths(home)
	body, err := os.ReadFile(paths.Config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtimeprofile.ParseConfig(paths, body); err != nil {
		t.Fatalf("installed partial-interactive config is invalid: %v", err)
	}
}

func TestInstallRejectsProfilePathThatIsNotADirectory(t *testing.T) {
	profile := filepath.Join(t.TempDir(), "profile-file")
	if err := os.WriteFile(profile, []byte("not a directory"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KG_HOME", profile)
	var stdout, stderr strings.Builder
	if code := runInstall(
		fullInstallArgs("4765", ""),
		strings.NewReader(""),
		false,
		&stdout,
		&stderr,
	); code != 2 {
		t.Fatalf("profile-file install code=%d stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), "IO_ERROR") {
		t.Fatalf("profile-file error = %q", stderr.String())
	}
}

func TestDoctorExtensionReadinessBranches(t *testing.T) {
	home := t.TempDir()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	local := filepath.Join(t.TempDir(), "extension.so")
	if err := os.WriteFile(local, []byte("extension"), 0o600); err != nil {
		t.Fatal(err)
	}
	hash, err := runtimeprofile.LocalFileSHA256(local)
	if err != nil {
		t.Fatal(err)
	}
	config := runtimeprofile.Config{
		SQLite: runtimeprofile.SQLiteConfig{Extensions: []runtimeprofile.ExtensionConfig{{
			Source: local, SHA256: hash, Entrypoint: "sqlite3_fixture_init",
		}}},
	}
	if check := diagnoseExtensions(paths, config); check.Status != "ok" || check.Blocking {
		t.Fatalf("local ready check = %#v", check)
	}

	config.SQLite.Extensions[0].SHA256 = strings.Repeat("0", 64)
	if check := diagnoseExtensions(paths, config); check.Status != "error" || !check.Blocking {
		t.Fatalf("hash mismatch check = %#v", check)
	}
	config.SQLite.Extensions[0] = runtimeprofile.ExtensionConfig{
		Source: filepath.Join(home, "missing"), Entrypoint: "sqlite3_fixture_init",
	}
	if check := diagnoseExtensions(paths, config); check.Status != "error" || !check.Blocking {
		t.Fatalf("missing local check = %#v", check)
	}

	remoteHash := strings.Repeat("1", 64)
	config.SQLite.Extensions[0] = runtimeprofile.ExtensionConfig{
		Source:     "https://example.invalid/extension.so",
		SHA256:     remoteHash,
		Entrypoint: "sqlite3_fixture_init",
	}
	if check := diagnoseExtensions(paths, config); check.Status != "info" || check.Blocking {
		t.Fatalf("deferred remote check = %#v", check)
	}
	cacheManifest := filepath.Join(paths.ExtensionsDir, remoteHash, "manifest.json")
	if err := os.MkdirAll(filepath.Dir(cacheManifest), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheManifest, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if check := diagnoseExtensions(paths, config); check.Status != "info" || check.Blocking {
		t.Fatalf("corrupt cached remote check = %#v", check)
	}
	config.SQLite.Extensions[0].Entrypoint = ""
	if check := diagnoseExtensions(paths, config); check.Status != "error" || !check.Blocking {
		t.Fatalf("invalid remote config check = %#v", check)
	}
	if _, err := runtimeprofile.LocalFileSHA256(filepath.Join(home, "missing-extension")); err == nil {
		t.Fatal("localFileSHA256 accepted a missing file")
	}
}

func TestLocalFileSHA256Failures(t *testing.T) {
	if _, err := runtimeprofile.LocalFileSHA256(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("missing file hash unexpectedly succeeded")
	}
	if _, err := runtimeprofile.LocalFileSHA256(t.TempDir()); err == nil {
		t.Fatal("directory hash unexpectedly succeeded")
	}
}

func TestEnsureRuntimeFailureBranches(t *testing.T) {
	home := t.TempDir()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	originalDiscovery := discoverDistribution
	originalSpawn := spawnDaemon
	originalTimeout := runtimeStartupTimeout
	defer func() {
		discoverDistribution = originalDiscovery
		spawnDaemon = originalSpawn
		runtimeStartupTimeout = originalTimeout
	}()

	discoverDistribution = func() (runtimeprofile.Distribution, error) {
		return runtimeprofile.Distribution{}, errors.New("missing distribution")
	}
	if _, err := ensureRuntime(context.Background(), paths); err == nil ||
		!strings.Contains(err.Error(), "locate kgosd distribution") {
		t.Fatalf("missing distribution error = %v", err)
	}

	discoverDistribution = func() (runtimeprofile.Distribution, error) {
		return runtimeprofile.Distribution{Daemon: "fake"}, nil
	}
	spawnDaemon = func(string, string) (*spawnedDaemon, error) {
		return nil, errors.New("spawn failed")
	}
	if _, err := ensureRuntime(context.Background(), paths); err == nil ||
		!strings.Contains(err.Error(), "start kgosd") {
		t.Fatalf("spawn error = %v", err)
	}

	spawnDaemon = func(string, string) (*spawnedDaemon, error) {
		done := make(chan error, 1)
		diagnostic := &startupDiagnostic{}
		_, _ = diagnostic.Write([]byte("kgosd: config.toml is invalid\n"))
		done <- errors.New("child failed")
		close(done)
		return &spawnedDaemon{done: done, diagnostic: diagnostic}, nil
	}
	if _, err := ensureRuntime(context.Background(), paths); err == nil ||
		!strings.Contains(err.Error(), "child failed") ||
		!strings.Contains(err.Error(), "config.toml is invalid") {
		t.Fatalf("child exit error = %v", err)
	}

	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := ensureRuntime(ctx, paths); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel error = %v", err)
	}

	runtimeStartupTimeout = 10 * time.Millisecond
	if _, err := ensureRuntime(context.Background(), paths); err == nil ||
		!strings.Contains(err.Error(), "timed out") {
		t.Fatalf("timeout error = %v", err)
	}
}

func TestEnsureRuntimeUnavailableOwner(t *testing.T) {
	home := t.TempDir()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatal(err)
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	file, err := os.OpenFile(paths.Lock, os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString("{\"unexpected\":true}"); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := ensureRuntime(context.Background(), paths); err == nil ||
		!strings.Contains(err.Error(), "decode active kgosd.lock") {
		t.Fatalf("unavailable owner error = %v", err)
	}
}

func TestStartDaemonRejectsMissingExecutableAndReplacesKGHome(t *testing.T) {
	home := t.TempDir()
	if _, err := startDaemon(filepath.Join(t.TempDir(), "missing"), home); err == nil {
		t.Fatal("startDaemon accepted missing executable")
	}
	environment := environmentWithKGHome(
		[]string{"A=1", "KG_HOME=/old", "B=2"},
		home,
	)
	if strings.Join(environment, "\n") != "A=1\nB=2\nKG_HOME="+home {
		t.Fatalf("environment = %#v", environment)
	}
}

func TestStartupDiagnosticIsBounded(t *testing.T) {
	diagnostic := &startupDiagnostic{}
	body := strings.Repeat("x", daemonStartupDiagnosticLimit+32)
	written, err := diagnostic.Write([]byte(body))
	if err != nil || written != len(body) {
		t.Fatalf("diagnostic write=%d err=%v", written, err)
	}
	message := diagnostic.String()
	if !strings.HasSuffix(message, "[truncated]") ||
		len(message) > daemonStartupDiagnosticLimit+len(" [truncated]") {
		t.Fatalf("bounded diagnostic length=%d", len(message))
	}
}

func replaceInstallArg(args []string, name, value string) []string {
	copyArgs := append([]string(nil), args...)
	for index := 0; index+1 < len(copyArgs); index++ {
		if copyArgs[index] == name {
			copyArgs[index+1] = value
			return copyArgs
		}
	}
	return copyArgs
}
