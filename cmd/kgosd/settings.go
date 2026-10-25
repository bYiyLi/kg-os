package main

import (
	"context"
	"encoding/json"
	"os"
	"strconv"
	"strings"

	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func runtimeSettingsOptions(config runtimeprofile.Config, settings command.DaemonSettings, endpoint func() (string, error)) daemon.SettingsOptions {
	parameters := settingsParameters(settings)
	level := strings.ToUpper(os.Getenv("KGOS_LOG_LEVEL"))
	levelSource := "KGOS_LOG_LEVEL"
	if level == "" {
		level, levelSource = "INFO", "default"
	}
	parameters = append(parameters, daemon.SettingsParameter{Key: "log-level", Value: level, Source: levelSource})
	// Keep this process's effective credential fixed even after a file update.
	key := os.Getenv(config.Embedding.APIKeyEnv)
	return daemon.SettingsOptions{
		MCPPath: settings.MCP.Path, Parameters: parameters, Endpoint: endpoint,
		ProbeEmbedding: func(ctx context.Context) daemon.SettingsProbeResult {
			if config.Embedding.APIKeyEnv != "" && key == "" {
				return daemon.SettingsProbeResult{Reason: "credential_missing"}
			}
			var rawKey json.RawMessage = []byte("null")
			if key != "" {
				rawKey, _ = json.Marshal(key)
			}
			result := probeEmbeddingRemote(ctx, embeddingProbeInput{
				BaseURL: config.Embedding.BaseURL, Model: config.Embedding.Model,
				Dimensions: config.Embedding.Dimensions, Similarity: config.Embedding.Similarity, APIKey: rawKey,
			})
			return daemon.SettingsProbeResult{OK: result.OK, Dimensions: result.Dimensions, Reason: result.Reason, HTTPStatus: result.HTTPStatus}
		},
	}
}

func settingsParameters(settings command.DaemonSettings) []daemon.SettingsParameter {
	m := settings.MCP
	values := []struct{ key, value string }{
		{"host", settings.Host}, {"port", strconv.Itoa(settings.Port)},
		{"tls", strconv.FormatBool(settings.TLSCert != "")}, {"mcp-path", m.Path},
		{"mcp-request-timeout-ms", strconv.Itoa(m.RequestTimeoutMS)},
		{"mcp-max-concurrency", strconv.Itoa(m.MaxConcurrency)},
		{"mcp-max-request-bytes", strconv.Itoa(m.MaxRequestBytes)},
		{"mcp-script-timeout-ms", strconv.Itoa(m.ScriptTimeoutMS)},
		{"mcp-script-memory-mb", strconv.Itoa(m.ScriptMemoryMB)},
		{"mcp-script-max-code-bytes", strconv.Itoa(m.ScriptMaxCodeBytes)},
		{"mcp-script-max-calls", strconv.Itoa(m.ScriptMaxCalls)},
		{"mcp-script-max-streams", strconv.Itoa(m.ScriptMaxStreams)},
		{"mcp-script-max-output-bytes", strconv.Itoa(m.ScriptMaxOutputBytes)},
		{"mcp-preview-max-items", strconv.Itoa(m.PreviewMaxItems)},
		{"mcp-preview-cache-entries", strconv.Itoa(m.PreviewCacheEntries)},
		{"mcp-preview-cache-ttl-ms", strconv.Itoa(m.PreviewCacheTTLMS)},
	}
	parameters := make([]daemon.SettingsParameter, 0, len(values))
	for _, value := range values {
		key := value.key
		if key == "tls" {
			key = "tls-cert"
		}
		source := settings.Sources[key]
		if source == "" {
			source = "startup"
		}
		parameters = append(parameters, daemon.SettingsParameter{Key: value.key, Value: value.value, Source: source})
	}
	return parameters
}
