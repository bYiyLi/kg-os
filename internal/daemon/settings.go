package daemon

import (
	"context"
	"errors"
	"net/http"
	"runtime"
	"sync"
	"time"

	"github.com/bYiyLi/kg-os/internal/buildinfo"
	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type SettingsParameter struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Source string `json:"source"`
}

type SettingsProbeResult struct {
	OK         bool   `json:"ok"`
	Dimensions int    `json:"dimensions,omitempty"`
	Reason     string `json:"reason,omitempty"`
	HTTPStatus int    `json:"httpStatus,omitempty"`
}

// SettingsOptions projects only already-resolved, non-secret startup values.
// It never reads an arbitrary environment collection or grants restart access.
type SettingsOptions struct {
	MCPPath        string
	Parameters     []SettingsParameter
	Endpoint       func() (string, error)
	ProbeEmbedding func(context.Context) SettingsProbeResult
}

type settingsRuntime struct {
	Version    string              `json:"version"`
	Platform   string              `json:"platform"`
	Endpoint   string              `json:"endpoint"`
	MCPPath    string              `json:"mcpPath"`
	Parameters []SettingsParameter `json:"parameters"`
}

type settingsSnapshot struct {
	runtimeprofile.SettingsState
	Runtime      settingsRuntime `json:"runtime"`
	DatabasePath string          `json:"databasePath"`
}

type settingsService struct {
	store        *runtimeprofile.SettingsStore
	token        string
	databasePath string
	options      SettingsOptions
	probeMu      sync.Mutex
	probing      bool
}

func newSettingsService(rt *runtimehost.Runtime, options SettingsOptions) *settingsService {
	return &settingsService{store: runtimeprofile.NewSettingsStore(rt.Paths, rt.Config), token: rt.Credential.Token, databasePath: rt.Paths.Database, options: options}
}

func (s *settingsService) snapshot(state runtimeprofile.SettingsState) settingsSnapshot {
	endpoint := ""
	if s.options.Endpoint != nil {
		endpoint, _ = s.options.Endpoint()
	}
	parameters := append([]SettingsParameter{}, s.options.Parameters...)
	state.Effective = publicSettingsConfig(state.Effective)
	state.Saved = publicSettingsConfig(state.Saved)
	return settingsSnapshot{SettingsState: state, DatabasePath: s.databasePath, Runtime: settingsRuntime{
		Version: buildinfo.Version, Platform: runtime.GOOS + " " + runtime.GOARCH,
		Endpoint: endpoint, MCPPath: s.options.MCPPath, Parameters: parameters,
	}}
}

// Legacy manual configurations may contain URL userinfo. Only the HTTP
// projection removes it; the store retains the original startup configuration.
func publicSettingsConfig(config runtimeprofile.Config) runtimeprofile.Config {
	config.Embedding.BaseURL = runtimeprofile.RedactSettingsURL(config.Embedding.BaseURL)
	config.SQLite.Extensions = append([]runtimeprofile.ExtensionConfig{}, config.SQLite.Extensions...)
	for i := range config.SQLite.Extensions {
		config.SQLite.Extensions[i].Source = runtimeprofile.RedactSettingsURL(config.SQLite.Extensions[i].Source)
	}
	return config
}

func settingsError(w http.ResponseWriter, err error) {
	code, message := kernel.CodeIO, "Instance settings are unavailable"
	if errors.Is(err, runtimeprofile.ErrSettingsConflict) {
		code, message = kernel.CodeObjectConflict, "Instance configuration changed; reload before saving"
	} else if errors.Is(err, runtimeprofile.ErrSettingsInvalid) {
		code, message = kernel.CodeInvalidArgument, "Invalid or unsupported Instance configuration"
	}
	kernel.WriteJSONError(w, &kernel.PublicError{Code: code, Message: message})
}

func (s *settingsService) route(execute func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		webAuthHeaders(w)
		if !authenticate(w, r, s.token) {
			return
		}
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		if _, valid := validWebOrigin(r); !valid {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		// Existing connection middleware checks the supplied boot ID. Unlike the
		// generic SDK API, settings always require a guarded browser connection.
		if r.Header.Get(expectedDaemonBootHeader) == "" {
			kernel.WriteJSONError(w, &kernel.PublicError{Code: kernel.CodeWebConnectionChanged, Message: "web connection changed"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		execute(w, r)
	}
}

func (s *settingsService) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/web/settings/read", s.route(func(w http.ResponseWriter, r *http.Request) {
		var input struct{}
		if err := decodeJSONRequest(w, r, &input); err != nil {
			kernel.WriteJSONError(w, err)
			return
		}
		state, err := s.store.Read()
		if err != nil {
			settingsError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, s.snapshot(state))
	}))
	mux.HandleFunc("/api/v1/web/settings/update", s.route(func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Revision string `json:"revision"`
			runtimeprofile.SettingsPatch
		}
		if err := decodeJSONRequest(w, r, &input); err != nil {
			kernel.WriteJSONError(w, err)
			return
		}
		state, err := s.store.Update(input.Revision, input.SettingsPatch)
		if err != nil {
			settingsError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, s.snapshot(state))
	}))
	mux.HandleFunc("/api/v1/web/settings/embedding-key", s.route(func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Revision string `json:"revision"`
			APIKey   string `json:"apiKey"`
		}
		if err := decodeJSONRequest(w, r, &input); err != nil {
			kernel.WriteJSONError(w, err)
			return
		}
		state, err := s.store.UpdateEmbeddingKey(input.Revision, input.APIKey)
		if err != nil {
			settingsError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, s.snapshot(state))
	}))
	mux.HandleFunc("/api/v1/web/settings/test-embedding", s.route(s.testEmbedding))
}

func (s *settingsService) testEmbedding(w http.ResponseWriter, r *http.Request) {
	var input struct{}
	if err := decodeJSONRequest(w, r, &input); err != nil {
		kernel.WriteJSONError(w, err)
		return
	}
	if s.options.ProbeEmbedding == nil {
		kernel.WriteJSONError(w, &kernel.PublicError{Code: kernel.CodeUnsupportedOperation, Message: "Embedding connection testing is unavailable"})
		return
	}
	s.probeMu.Lock()
	if s.probing {
		s.probeMu.Unlock()
		w.Header().Set("Retry-After", "1")
		writeJSON(w, http.StatusTooManyRequests, SettingsProbeResult{Reason: "busy"})
		return
	}
	s.probing = true
	s.probeMu.Unlock()
	defer func() { s.probeMu.Lock(); s.probing = false; s.probeMu.Unlock() }()
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	result := s.options.ProbeEmbedding(ctx)
	status := http.StatusUnprocessableEntity
	if result.OK {
		status = http.StatusOK
	}
	writeJSON(w, status, result)
}
