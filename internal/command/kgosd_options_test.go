package command

import (
	"strconv"
	"testing"
)

const testDaemonRoot = "/tmp/kgos-options-test"

func optionLookup(env map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) { value, ok := env[key]; return value, ok }
}

func TestDaemonOptionDefaultsAndCompleteOverride(t *testing.T) {
	settings, root, err := parseDaemonSettings([]string{"--root", testDaemonRoot}, optionLookup(nil))
	if err != nil {
		t.Fatal(err)
	}
	if root != testDaemonRoot || settings.Host != "127.0.0.1" || settings.Port != 0 ||
		settings.MCP.Path != "/mcp" {
		t.Fatalf("defaults %#v", settings)
	}
	env := map[string]string{
		"KGOSD_HOST": "127.0.0.2", "KGOSD_PORT": "4488",
		"KGOS_MCP_OAUTH_ISSUER":     "https://example.com",
		"KGOS_MCP_SCRIPT_MAX_CALLS": "503",
	}
	settings, _, err = parseDaemonSettings([]string{
		"--root", testDaemonRoot, "--host", "0.0.0.0", "--port", "4777",
		"--mcp-path", "/kgos-mcp", "--mcp-request-timeout-ms", "4300",
		"--mcp-max-concurrency", "8", "--mcp-max-request-bytes", "65536",
		"--mcp-script-timeout-ms", "2000", "--mcp-script-memory-mb", "96",
		"--mcp-script-max-code-bytes", "8192", "--mcp-script-max-calls", "17",
		"--mcp-script-max-streams", "9", "--mcp-script-max-output-bytes", "8192",
		"--mcp-preview-max-items", "42", "--mcp-preview-cache-entries", "3",
		"--mcp-preview-cache-ttl-ms", "3000",
	}, optionLookup(env))
	if err != nil {
		t.Fatal(err)
	}
	m := settings.MCP
	if settings.Host != "0.0.0.0" || settings.Port != 4777 ||
		m.Path != "/kgos-mcp" || m.OAuthIssuer != "https://example.com" ||
		m.RequestTimeoutMS != 4300 || m.MaxConcurrency != 8 || m.MaxRequestBytes != 65536 ||
		m.ScriptTimeoutMS != 2000 || m.ScriptMemoryMB != 96 || m.ScriptMaxCodeBytes != 8192 ||
		m.ScriptMaxCalls != 17 || m.ScriptMaxStreams != 9 || m.ScriptMaxOutputBytes != 8192 ||
		m.PreviewMaxItems != 42 || m.PreviewCacheEntries != 3 || m.PreviewCacheTTLMS != 3000 {
		t.Fatalf("option override failed: %#v", settings)
	}
}

func TestDaemonOptionIntegerBoundsAndEnvironmentValidation(t *testing.T) {
	env := map[string]string{}
	for name, field := range daemonFields {
		if name == "root" || field.max <= field.min {
			continue
		}
		t.Run(name, func(t *testing.T) {
			for _, bad := range []string{"NaN", strconv.Itoa(field.min - 1), strconv.Itoa(field.max + 1)} {
				args := []string{"--root", testDaemonRoot, "--" + name, bad}
				_, _, err := parseDaemonSettings(args, optionLookup(env))
				if err == nil {
					t.Fatalf("accepted invalid %s=%q", name, bad)
				}
			}
			for _, valid := range []int{field.min, field.max} {
				args := []string{"--root", testDaemonRoot, "--" + name, strconv.Itoa(valid)}
				if _, _, err := parseDaemonSettings(args, optionLookup(env)); err != nil {
					t.Fatalf("rejected %s=%d: %v", name, valid, err)
				}
			}
			if field.env != "" {
				badEnv := map[string]string{field.env: "NaN"}
				if _, _, err := parseDaemonSettings([]string{"--root", testDaemonRoot}, optionLookup(badEnv)); err == nil {
					t.Fatalf("accepted invalid env %s", field.env)
				}
			}
		})
	}
}

func TestDaemonOptionRejectsMalformedAndConflictingInput(t *testing.T) {
	env := map[string]string{}
	cases := [][]string{
		nil, {"relative-root"}, {"--bogus", "value", "--root", testDaemonRoot},
		{"--root"}, {"--root", ""}, {"--root", testDaemonRoot, "stray"},
		{"--root", testDaemonRoot, "--host"}, {"--root", testDaemonRoot, "--port", "--mcp-path"},
		{"--root", testDaemonRoot, "--host", "127.0.0.1", "--host", "127.0.0.1"},
		{"--root", testDaemonRoot, "--host", "broken/path"},
		{"--root", testDaemonRoot, "--host", " example "},
		{"--root", testDaemonRoot, "--host", "abc:def:ghi"},
		{"--root", testDaemonRoot, "--tls-cert", "cert.pem"},
		{"--root", testDaemonRoot, "--tls-key", "key.pem"},
		{"--root", testDaemonRoot, "--mcp-path", "/"},
		{"--root", testDaemonRoot, "--mcp-path", "/api/secret"},
		{"--root", testDaemonRoot, "--mcp-path", "/api"},
		{"--root", testDaemonRoot, "--mcp-path", "/oauth/token"},
		{"--root", testDaemonRoot, "--mcp-path", "/oauth"},
		{"--root", testDaemonRoot, "--mcp-path", "/.well-known"},
		{"--root", testDaemonRoot, "--mcp-path", "/mcp/{unclosed"},
		{"--root", testDaemonRoot, "--mcp-path", "/.well-known/oauth-authorization-server"},
		{"--root", testDaemonRoot, "--mcp-path", "/mcp#evil"},
		{"--root", testDaemonRoot, "--mcp-token-env", "1BAD"},
		{"--root", testDaemonRoot, "--mcp-token-env", "MCP_SECRET", "--mcp-token-file", "/missing"},
		{"--root", testDaemonRoot, "--mcp-token-file", "/missing"},
		{"--root", testDaemonRoot, "--mcp-oauth-issuer", "http://remote.example"},
		{"--root", testDaemonRoot, "--mcp-oauth-issuer", "https://remote.example/callback"},
		{"--root", testDaemonRoot, "--mcp-oauth-issuer", "https://user@remote.example"},
	}
	for index, args := range cases {
		if _, _, err := parseDaemonSettings(args, optionLookup(env)); err == nil {
			t.Errorf("invalid case %d accepted: %#v", index, args)
		}
	}
	for _, key := range []string{"KGOS_MCP_TOKEN", "KGOS_MCP_TOKEN_ENV", "KGOS_MCP_TOKEN_FILE"} {
		if _, _, err := parseDaemonSettings([]string{"--root", testDaemonRoot}, optionLookup(map[string]string{key: "not-allowed"})); err == nil {
			t.Errorf("legacy MCP credential setting %s was not rejected", key)
		}
	}
	if _, _, err := parseDaemonSettings([]string{"--root", testDaemonRoot}, optionLookup(map[string]string{"KGOS_MCP_OAUTH_ISSUER": "https://example.com"})); err != nil {
		t.Fatalf("OAuth issuer unnecessarily requires second token: %v", err)
	}
}
