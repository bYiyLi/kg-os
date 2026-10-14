package command

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
)

type DaemonSettings struct {
	Host    string
	Port    int
	TLSCert string
	TLSKey  string
	MCP     DaemonMCPSettings
}
type DaemonMCPSettings struct {
	Path                 string
	OAuthIssuer          string
	RequestTimeoutMS     int
	MaxConcurrency       int
	MaxRequestBytes      int
	ScriptTimeoutMS      int
	ScriptMemoryMB       int
	ScriptMaxCodeBytes   int
	ScriptMaxCalls       int
	ScriptMaxStreams     int
	ScriptMaxOutputBytes int
	PreviewMaxItems      int
	PreviewCacheEntries  int
	PreviewCacheTTLMS    int
}
type daemonField struct {
	env, def string
	min, max int
}

var daemonFields = map[string]daemonField{
	"root":                        {},
	"host":                        {env: "KGOSD_HOST", def: "127.0.0.1"},
	"port":                        {env: "KGOSD_PORT", def: "0", min: 0, max: 65535},
	"tls-cert":                    {env: "KGOSD_TLS_CERT"},
	"tls-key":                     {env: "KGOSD_TLS_KEY"},
	"mcp-path":                    {env: "KGOS_MCP_PATH", def: "/mcp"},
	"mcp-oauth-issuer":            {env: "KGOS_MCP_OAUTH_ISSUER"},
	"mcp-request-timeout-ms":      {env: "KGOS_MCP_REQUEST_TIMEOUT_MS", def: "30000", min: 100, max: 120000},
	"mcp-max-concurrency":         {env: "KGOS_MCP_MAX_CONCURRENCY", def: "16", min: 1, max: 1024},
	"mcp-max-request-bytes":       {env: "KGOS_MCP_MAX_REQUEST_BYTES", def: "1048576", min: 1024, max: 16777216},
	"mcp-script-timeout-ms":       {env: "KGOS_MCP_SCRIPT_TIMEOUT_MS", def: "15000", min: 100, max: 120000},
	"mcp-script-memory-mb":        {env: "KGOS_MCP_SCRIPT_MEMORY_MB", def: "64", min: 8, max: 512},
	"mcp-script-max-code-bytes":   {env: "KGOS_MCP_SCRIPT_MAX_CODE_BYTES", def: "65536", min: 1024, max: 1048576},
	"mcp-script-max-calls":        {env: "KGOS_MCP_SCRIPT_MAX_CALLS", def: "2048", min: 1, max: 65536},
	"mcp-script-max-streams":      {env: "KGOS_MCP_SCRIPT_MAX_STREAMS", def: "32", min: 1, max: 128},
	"mcp-script-max-output-bytes": {env: "KGOS_MCP_SCRIPT_MAX_OUTPUT_BYTES", def: "4194304", min: 1024, max: 16777216},
	"mcp-preview-max-items":       {env: "KGOS_MCP_PREVIEW_MAX_ITEMS", def: "50000", min: 1, max: 1000000},
	"mcp-preview-cache-entries":   {env: "KGOS_MCP_PREVIEW_CACHE_ENTRIES", def: "8", min: 1, max: 64},
	"mcp-preview-cache-ttl-ms":    {env: "KGOS_MCP_PREVIEW_CACHE_TTL_MS", def: "600000", min: 1000, max: 86400000},
}

func parseDaemonSettings(args []string, lookup func(string) (string, bool)) (DaemonSettings, string, error) {
	for _, key := range []string{"KGOS_MCP_TOKEN", "KGOS_MCP_TOKEN_ENV", "KGOS_MCP_TOKEN_FILE"} {
		if _, present := lookup(key); present {
			return DaemonSettings{}, "", fmt.Errorf("obsolete MCP credential setting %s: use the Instance credential", key)
		}
	}
	fields := make(map[string]string)
	for i := 0; i < len(args); i++ {
		name := args[i]
		if !strings.HasPrefix(name, "--") {
			return DaemonSettings{}, "", fmt.Errorf("unexpected argument %q", name)
		}
		key := strings.TrimPrefix(name, "--")
		if _, ok := daemonFields[key]; !ok {
			return DaemonSettings{}, "", fmt.Errorf("unknown option %q", name)
		}
		if _, dup := fields[key]; dup {
			return DaemonSettings{}, "", fmt.Errorf("repeated option %q", name)
		}
		if i+1 >= len(args) || args[i+1] == "" || strings.HasPrefix(args[i+1], "--") {
			return DaemonSettings{}, "", fmt.Errorf("missing or empty value for %s", name)
		}
		fields[key] = args[i+1]
		i++
	}
	root := fields["root"]
	if root == "" {
		return DaemonSettings{}, "", errors.New("--root <absolute-workspace-root> is required")
	}
	value := func(key string) (string, error) {
		if v, ok := fields[key]; ok {
			return v, nil
		}
		def := daemonFields[key]
		if v, ok := lookup(def.env); ok {
			if v == "" {
				return "", fmt.Errorf("empty environment value for %s", def.env)
			}
			return v, nil
		}
		return def.def, nil
	}
	optional := func(key string) (string, error) {
		if v, ok := fields[key]; ok {
			return v, nil
		}
		if v, ok := lookup(daemonFields[key].env); ok {
			return v, nil
		}
		return "", nil
	}
	num := func(key string) (int, error) {
		text, err := value(key)
		if err != nil {
			return 0, err
		}
		n, err := strconv.Atoi(text)
		if err != nil || n < daemonFields[key].min || n > daemonFields[key].max {
			return 0, fmt.Errorf("invalid integer range for --%s", key)
		}
		return n, nil
	}
	var settings DaemonSettings
	var err error
	if settings.Host, err = value("host"); err != nil {
		return DaemonSettings{}, "", err
	}
	if strings.TrimSpace(settings.Host) != settings.Host || strings.ContainsAny(settings.Host, "/\t\r\n") || settings.Host == "" {
		return DaemonSettings{}, "", errors.New("invalid listen host")
	}
	if net.ParseIP(settings.Host) == nil && strings.Contains(settings.Host, ":") {
		return DaemonSettings{}, "", errors.New("invalid listen host")
	}
	if settings.Port, err = num("port"); err != nil {
		return DaemonSettings{}, "", err
	}
	if settings.TLSCert, err = optional("tls-cert"); err != nil {
		return DaemonSettings{}, "", err
	}
	if settings.TLSKey, err = optional("tls-key"); err != nil {
		return DaemonSettings{}, "", err
	}
	if (settings.TLSCert == "") != (settings.TLSKey == "") {
		return DaemonSettings{}, "", errors.New("--tls-cert and --tls-key must be paired")
	}
	m := &settings.MCP
	if m.Path, err = value("mcp-path"); err != nil {
		return DaemonSettings{}, "", err
	}
	if !strings.HasPrefix(m.Path, "/") || m.Path == "/" || strings.ContainsAny(m.Path, "?#{}\\\r\n") || m.Path == "/api" || strings.HasPrefix(m.Path, "/api/") || m.Path == "/oauth" || strings.HasPrefix(m.Path, "/oauth/") || m.Path == "/.well-known" || strings.HasPrefix(m.Path, "/.well-known/") {
		return DaemonSettings{}, "", errors.New("invalid MCP path")
	}
	if m.OAuthIssuer, err = optional("mcp-oauth-issuer"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.RequestTimeoutMS, err = num("mcp-request-timeout-ms"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.MaxConcurrency, err = num("mcp-max-concurrency"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.MaxRequestBytes, err = num("mcp-max-request-bytes"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.ScriptTimeoutMS, err = num("mcp-script-timeout-ms"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.ScriptMemoryMB, err = num("mcp-script-memory-mb"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.ScriptMaxCodeBytes, err = num("mcp-script-max-code-bytes"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.ScriptMaxCalls, err = num("mcp-script-max-calls"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.ScriptMaxStreams, err = num("mcp-script-max-streams"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.ScriptMaxOutputBytes, err = num("mcp-script-max-output-bytes"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.PreviewMaxItems, err = num("mcp-preview-max-items"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.PreviewCacheEntries, err = num("mcp-preview-cache-entries"); err != nil {
		return DaemonSettings{}, "", err
	}
	if m.PreviewCacheTTLMS, err = num("mcp-preview-cache-ttl-ms"); err != nil {
		return DaemonSettings{}, "", err
	}

	if m.OAuthIssuer != "" {
		if err := validOAuthIssuerOrigin(m.OAuthIssuer); err != nil {
			return DaemonSettings{}, "", err
		}
	}
	return settings, root, nil
}
func validOAuthIssuerOrigin(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" || !(u.Scheme == "https" || u.Scheme == "http") {
		return errors.New("invalid MCP OAuth issuer origin")
	}
	if u.Scheme == "http" {
		host := u.Hostname()
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			return errors.New("MCP OAuth issuer requires HTTPS")
		}
	}
	return nil
}
