package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestRuntimeSettingsProjectsActualValuesWithoutTLSPaths(t *testing.T) {
	t.Setenv("KGOS_LOG_LEVEL", "debug")
	settings := command.DaemonSettings{
		Host: "0.0.0.0", Port: 9988, TLSCert: "/private/cert.pem", TLSKey: "/private/secret-key.pem",
		MCP:     command.DaemonMCPSettings{Path: "/custom", MaxConcurrency: 9, RequestTimeoutMS: 2345, ScriptMemoryMB: 73},
		Sources: map[string]string{"host": "--host", "port": "KGOSD_PORT", "tls-cert": "--tls-cert", "mcp-max-concurrency": "--mcp-max-concurrency"},
	}
	options := runtimeSettingsOptions(runtimeprofile.Config{}, settings, nil)
	if options.MCPPath != "/custom" {
		t.Fatal("MCP path did not use resolved configuration")
	}
	values := make(map[string]string)
	for _, parameter := range options.Parameters {
		values[parameter.Key] = parameter.Value
		if parameter.Key == "host" && parameter.Source != "--host" {
			t.Fatal("host source was replaced")
		}
		if parameter.Key == "port" && parameter.Source != "KGOSD_PORT" {
			t.Fatal("port source was replaced")
		}
	}
	if values["port"] != "9988" || values["tls"] != "true" || values["mcp-max-concurrency"] != "9" || values["mcp-request-timeout-ms"] != "2345" || values["mcp-script-memory-mb"] != "73" || values["log-level"] != "DEBUG" {
		t.Fatalf("invented settings values: %#v", values)
	}
	body, err := json.Marshal(options.Parameters)
	if err != nil || strings.Contains(string(body), "/private/") || strings.Contains(string(body), "secret-key") {
		t.Fatal("runtime settings exposed TLS paths")
	}
}

func TestRuntimeSettingsProbeKeepsProcessCredentialSnapshot(t *testing.T) {
	t.Setenv("KGOS_TEST_MISSING_EMBEDDING_KEY", "")
	config := runtimeprofile.Config{Embedding: runtimeprofile.EmbeddingConfig{APIKeyEnv: "KGOS_TEST_MISSING_EMBEDDING_KEY"}}
	options := runtimeSettingsOptions(config, command.DaemonSettings{}, nil)
	t.Setenv("KGOS_TEST_MISSING_EMBEDDING_KEY", "later-value")
	result := options.ProbeEmbedding(context.Background())
	if result.OK || result.Reason != "credential_missing" {
		t.Fatalf("probe used a different process credential: %+v", result)
	}
}

func TestRuntimeSettingsDefaultLogLevelAndUnrecordedStartupSources(t *testing.T) {
	t.Setenv("KGOS_LOG_LEVEL", "")
	options := runtimeSettingsOptions(runtimeprofile.Config{}, command.DaemonSettings{Host: "127.0.0.2"}, nil)
	foundLog, foundHost := false, false
	for _, parameter := range options.Parameters {
		switch parameter.Key {
		case "log-level":
			foundLog = parameter.Value == "INFO" && parameter.Source == "default"
		case "host":
			foundHost = parameter.Value == "127.0.0.2" && parameter.Source == "startup"
		}
	}
	if !foundLog || !foundHost {
		t.Fatal("runtime fallback values or provenance were not preserved")
	}
}

func TestRuntimeSettingsNoAuthProbeRejectsInvalidConfiguration(t *testing.T) {
	options := runtimeSettingsOptions(runtimeprofile.Config{}, command.DaemonSettings{}, nil)
	result := options.ProbeEmbedding(context.Background())
	if result.OK || result.Reason != "invalid_fields" {
		t.Fatalf("no-auth probe bypassed configuration validation: %+v", result)
	}
}

func TestRuntimeSettingsProbeAllowsLocalEndpoint(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"embedding":[0.1,0.2,0.3]}]}`))
	}))
	defer server.Close()
	t.Setenv("KGOS_TEST_SETTINGS_PROBE_KEY", "private-settings-probe-value")
	for _, credentialEnv := range []string{"", "KGOS_TEST_SETTINGS_PROBE_KEY"} {
		config := runtimeprofile.Config{Embedding: runtimeprofile.EmbeddingConfig{
			BaseURL: server.URL + "/v1", Model: "test-model", Dimensions: 3,
			Similarity: "cosine", APIKeyEnv: credentialEnv,
		}}
		options := runtimeSettingsOptions(config, command.DaemonSettings{}, nil)
		result := options.ProbeEmbedding(context.Background())
		if !result.OK || result.Dimensions != 3 {
			t.Fatalf("settings probe could not reach local Embedding endpoint: %+v", result)
		}
		body, err := json.Marshal(result)
		if err != nil || strings.Contains(string(body), "private-settings-probe-value") {
			t.Fatal("settings probe exposed its credential")
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("expected two requests, got %d", calls.Load())
	}
}
