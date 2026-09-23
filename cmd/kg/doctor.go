package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type doctorCheck struct {
	ID       string         `json:"id"`
	Status   string         `json:"status"`
	Blocking bool           `json:"blocking"`
	Message  string         `json:"message,omitempty"`
	Details  map[string]any `json:"details,omitempty"`
}

type doctorResult struct {
	Ready  bool          `json:"ready"`
	Checks []doctorCheck `json:"checks"`
}

func runDoctor(args []string, human bool, stdout, stderr io.Writer) int {
	locale := detectLocale()
	jsonOutput := false
	for _, arg := range args {
		switch arg {
		case "-h", "--help":
			_, _ = io.WriteString(stdout, doctorHelp(locale))
			return 0
		case "--json":
			if jsonOutput {
				return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, "--json may be provided only once", 2)
			}
			jsonOutput = true
		default:
			return writeLocalCLIError(stderr, kernel.CodeInvalidArgument, fmt.Sprintf("unknown doctor option %q", arg), 2)
		}
	}
	result, err := diagnose()
	if err != nil {
		return writeLocalCLIError(stderr, kernel.CodeIO, "doctor failed: "+err.Error(), 2)
	}
	if jsonOutput || !human {
		body, err := json.Marshal(result)
		if err != nil {
			return writeLocalCLIError(stderr, kernel.CodeIO, "encode doctor result failed", 2)
		}
		_, _ = stdout.Write(append(body, '\n'))
		return 0
	}
	writeDoctorHuman(stdout, locale, result)
	return 0
}

func diagnose() (doctorResult, error) {
	paths, err := runtimeprofile.ResolvePaths(os.Getenv("KG_HOME"))
	if err != nil {
		return doctorResult{}, err
	}
	checks := []doctorCheck{{
		ID:       "profile",
		Status:   "ok",
		Blocking: false,
		Message:  "effective KG_HOME resolved",
		Details:  map[string]any{"home": paths.Home},
	}}

	var config *runtimeprofile.Config
	body, err := os.ReadFile(paths.Config)
	switch {
	case err == nil:
		parsed, parseErr := runtimeprofile.ParseConfig(paths, body)
		if parseErr != nil {
			checks = append(checks, doctorCheck{
				ID: "config", Status: "error", Blocking: true, Message: parseErr.Error(),
			})
		} else {
			config = &parsed
			checks = append(checks, doctorCheck{
				ID: "config", Status: "ok", Blocking: false, Message: "config.toml is complete and valid",
			})
		}
	case os.IsNotExist(err):
		missing := make([]string, 0, len(installFields()))
		for _, field := range installFields() {
			missing = append(missing, field.key)
		}
		checks = append(checks, doctorCheck{
			ID:       "config",
			Status:   "error",
			Blocking: true,
			Message:  "config.toml is missing",
			Details:  map[string]any{"missing": missing},
		})
	default:
		checks = append(checks, doctorCheck{
			ID: "config", Status: "error", Blocking: true, Message: "config.toml cannot be read",
		})
	}

	if _, err := discoverDistribution(); err != nil {
		checks = append(checks, doctorCheck{
			ID: "distribution", Status: "error", Blocking: true, Message: err.Error(),
		})
	} else {
		checks = append(checks, doctorCheck{
			ID: "distribution", Status: "ok", Blocking: false, Message: "distribution artifacts passed integrity checks",
		})
	}

	if config != nil {
		checks = append(checks, diagnoseExtensions(paths, *config))
		if config.Embedding.APIKeyEnv == "" {
			checks = append(checks, doctorCheck{
				ID: "embedding.environment", Status: "ok", Blocking: false, Message: "embedding endpoint is configured without authentication",
			})
		} else if value, ok := os.LookupEnv(config.Embedding.APIKeyEnv); !ok || value == "" {
			checks = append(checks, doctorCheck{
				ID:       "embedding.environment",
				Status:   "error",
				Blocking: true,
				Message:  "required embedding credential environment variable is missing or empty",
				Details:  map[string]any{"name": config.Embedding.APIKeyEnv},
			})
		} else {
			checks = append(checks, doctorCheck{
				ID:       "embedding.environment",
				Status:   "ok",
				Blocking: false,
				Message:  "required embedding credential environment variable is available",
				Details:  map[string]any{"name": config.Embedding.APIKeyEnv},
			})
		}
	}

	runtimeStatus := runtimeprofile.InspectDaemon(paths.Lock)
	runtimeCheck := doctorCheck{
		ID:       "runtime",
		Blocking: false,
		Details:  map[string]any{"state": string(runtimeStatus.State)},
	}
	switch runtimeStatus.State {
	case runtimeprofile.DaemonStopped:
		runtimeCheck.Status = "info"
		runtimeCheck.Message = "kgosd is stopped; business commands will start it automatically"
	case runtimeprofile.DaemonStarting:
		runtimeCheck.Status = "info"
		runtimeCheck.Message = "kgosd is starting"
	case runtimeprofile.DaemonRunning:
		runtimeCheck.Status = "ok"
		runtimeCheck.Message = "kgosd is running"
	case runtimeprofile.DaemonUnavailable:
		runtimeCheck.Status = "error"
		runtimeCheck.Blocking = true
		runtimeCheck.Message = "active kgosd owner is unavailable"
	}
	checks = append(checks, runtimeCheck)

	ready := true
	for _, check := range checks {
		if check.Blocking && check.Status == "error" {
			ready = false
			break
		}
	}
	return doctorResult{Ready: ready, Checks: checks}, nil
}

func diagnoseExtensions(paths runtimeprofile.Paths, config runtimeprofile.Config) doctorCheck {
	remoteDeferred := false
	for _, extension := range config.SQLite.Extensions {
		if strings.HasPrefix(extension.Source, "https://") {
			cached, err := runtimeprofile.CachedExtensionReady(paths, extension)
			if err != nil {
				return doctorCheck{
					ID:       "extensions",
					Status:   "error",
					Blocking: true,
					Message:  "configured remote extension is invalid",
				}
			}
			if cached {
				continue
			}
			// A remote artifact can be downloaded by the Runtime. Doctor does
			// not probe the network or populate the resolver cache.
			remoteDeferred = true
			continue
		}
		info, err := os.Stat(extension.Source)
		if err != nil || !info.Mode().IsRegular() {
			return doctorCheck{
				ID:       "extensions",
				Status:   "error",
				Blocking: true,
				Message:  "configured local extension source is unavailable",
			}
		}
		if extension.SHA256 != "" {
			actual, err := runtimeprofile.LocalFileSHA256(extension.Source)
			if err != nil || actual != extension.SHA256 {
				return doctorCheck{
					ID:       "extensions",
					Status:   "error",
					Blocking: true,
					Message:  "configured local extension failed SHA-256 verification",
				}
			}
		}
	}
	if remoteDeferred {
		return doctorCheck{
			ID:       "extensions",
			Status:   "info",
			Blocking: false,
			Message:  "remote extension resolution is deferred to Runtime startup",
		}
	}
	return doctorCheck{
		ID: "extensions", Status: "ok", Blocking: false, Message: "configured extension sources are locally ready",
	}
}

func writeDoctorHuman(stdout io.Writer, locale cliLocale, result doctorResult) {
	_, _ = fmt.Fprintln(stdout, doctorTitle(locale))
	for _, check := range result.Checks {
		status := strings.ToUpper(check.Status)
		message := check.Message
		if locale == localeChinese {
			switch check.ID {
			case "profile":
				message = "已解析当前 KG_HOME"
			case "config":
				if check.Status == "ok" {
					message = "config.toml 完整且合法"
				} else {
					message = "config.toml 缺失或无效"
				}
			case "distribution":
				if check.Status == "ok" {
					message = "安装制品完整性检查通过"
				} else {
					message = "安装制品不可用"
				}
			case "extensions":
				if check.Status == "ok" {
					message = "SQLite 扩展可用"
				} else {
					message = "SQLite 扩展不可用"
				}
			case "embedding.environment":
				if check.Status == "ok" {
					message = "Embedding 环境配置可用"
				} else {
					message = "Embedding 所需环境变量缺失"
				}
			case "runtime":
				state, _ := check.Details["state"].(string)
				message = "kgosd 状态: " + state
			}
		}
		_, _ = fmt.Fprintf(stdout, "[%s] %s: %s\n", status, check.ID, message)
	}
	_, _ = fmt.Fprintln(stdout, doctorReadyText(locale, result.Ready))
}
