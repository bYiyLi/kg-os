package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/BurntSushi/toml"
	"github.com/bYiyLi/kg-os/internal/buildinfo"
	"github.com/bYiyLi/kg-os/internal/command"
	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
	"github.com/bYiyLi/kg-os/internal/webui"
)

type setupController struct {
	mu        sync.RWMutex
	workers   sync.WaitGroup
	ctx       context.Context
	paths     runtimeprofile.Paths
	lock      *runtimeprofile.InstanceLock
	settings  command.DaemonSettings
	fallback  http.Handler
	status    string
	phase     string
	message   string
	completed bool
	autoStart bool
	token     string
	session   *daemon.SetupSession
	business  http.Handler
	runtime   *runtimehost.Runtime
	probing   bool
	probe     func(context.Context, embeddingProbeInput) embeddingProbeResult
}

type setupView struct {
	MCPPath              string `json:"mcpPath"`
	State                string `json:"state"`
	CredentialConfigured bool   `json:"credentialConfigured"`
	Phase                string `json:"phase,omitempty"`
	Message              string `json:"message,omitempty"`
}

func newSetupController(ctx context.Context, evaluation command.DaemonEvaluation) (_ *setupController, err error) {
	paths, err := runtimeprofile.ResolvePaths(evaluation.Root)
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(paths.Root, 0o700); err != nil {
		return nil, err
	}
	lock, err := runtimeprofile.AcquireLock(paths.Lock)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = lock.Close()
		}
	}()
	if err = lock.PublishStarting(os.Getpid(), buildinfo.Version); err != nil {
		return nil, err
	}
	if err = runtimeprofile.EnsureDirectories(paths); err != nil {
		return nil, err
	}
	fallback, err := webui.EmbeddedHandler()
	if err != nil {
		return nil, err
	}
	controller := &setupController{ctx: ctx, paths: paths, lock: lock, settings: evaluation.Settings,
		fallback: fallback, status: "setup_required"}
	completed, completeErr := runtimeprofile.InitializationComplete(paths)
	if completeErr != nil {
		controller.fail("Instance initialization receipt is invalid", true)
		return controller, nil
	}
	controller.completed = completed
	if credential, loadErr := runtimeprofile.LoadCredential(paths); loadErr == nil {
		controller.setToken(credential.Token)
	} else if !errors.Is(loadErr, os.ErrNotExist) {
		controller.fail("Instance administrator credential is invalid", completed)
		return controller, nil
	}
	if completed {
		if controller.token == "" {
			controller.fail("Initialized Instance is missing its administrator credential", true)
			return controller, nil
		}
		if info, statErr := os.Lstat(paths.Database); statErr != nil || !info.Mode().IsRegular() {
			controller.fail("Initialized Instance is missing its database", true)
			return controller, nil
		}
	}
	_, configErr := os.Lstat(paths.Config)
	if errors.Is(configErr, os.ErrNotExist) {
		_, dbErr := os.Lstat(paths.Database)
		if completed || dbErr == nil || !errors.Is(dbErr, os.ErrNotExist) {
			controller.fail("Instance configuration is missing; existing data must be repaired", true)
		}
	} else if configErr != nil {
		controller.fail("Cannot inspect Instance configuration", completed)
	} else {
		if _, loadErr := runtimeprofile.LoadConfig(paths); loadErr != nil {
			controller.fail("Instance configuration is invalid; check config.toml", completed)
			return controller, nil
		}
		controller.status = "initializing"
		controller.phase = "configuration"
		controller.autoStart = true
	}
	return controller, nil
}

func (c *setupController) fail(message string, unavailable bool) {
	c.status = "error"
	c.message = message
	c.phase = ""
	c.completed = c.completed || unavailable
}

func (c *setupController) setToken(token string) {
	c.token = token
	c.session = daemon.NewSetupSession(c.paths.Root, token)
}

func (c *setupController) publish(endpoint string) error {
	if err := c.lock.PublishRunning(os.Getpid(), endpoint, buildinfo.Version); err != nil {
		return err
	}
	if c.autoStart {
		c.workers.Add(1)
		go func() { defer c.workers.Done(); c.initialize() }()
	}
	return nil
}

func (c *setupController) Close() {
	c.workers.Wait()
	c.mu.Lock()
	rt := c.runtime
	c.mu.Unlock()
	if rt != nil {
		_ = rt.Close()
	}
	_ = c.lock.Close()
}

func serveFirstRun(ctx context.Context, evaluation command.DaemonEvaluation, output io.Writer, observer *observability.Observer) error {
	controller, err := newSetupController(ctx, evaluation)
	if err != nil {
		return err
	}
	defer controller.Close()
	return daemon.ServeWithPublisher(ctx, controller.publish,
		observability.HTTPMiddleware(observer, controller, evaluation.Settings.MCP.Path),
		output, daemon.ListenOptions{Host: evaluation.Settings.Host, Port: evaluation.Settings.Port,
			TLSCert: evaluation.Settings.TLSCert, TLSKey: evaluation.Settings.TLSKey})
}

func (c *setupController) state() setupView {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return setupView{State: c.status, CredentialConfigured: c.token != "", MCPPath: c.settings.MCP.Path, Phase: c.phase, Message: c.message}
}

func (c *setupController) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	path := r.URL.Path
	if path == "/api/v1/setup/status" {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		writeSetupJSON(w, http.StatusOK, c.state())
		return
	}
	c.mu.RLock()
	state, unavailable, session, business := c.status, c.completed, c.session, c.business
	c.mu.RUnlock()
	if path == "/api/v1/setup/claim" || path == "/api/v1/setup/rotate-token" || path == "/api/v1/setup/initialize" || path == "/api/v1/setup/validate-embedding" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if state == "ready" {
			setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Instance has already been initialized")
			return
		}
		if path == "/api/v1/setup/validate-embedding" {
			c.validateEmbedding(w, r)
			return
		}
		if path == "/api/v1/setup/claim" {
			c.claim(w, r)
			return
		}
		if path == "/api/v1/setup/rotate-token" {
			c.rotateToken(w, r)
			return
		}
		if session == nil {
			setupFailure(w, http.StatusUnauthorized, kernel.CodeAuthenticationFailed, "authentication failed")
			return
		}
		session.Authorize(w, r, http.HandlerFunc(c.acceptInitialization))
		return
	}
	if state == "ready" {
		if path == "/setup" && r.Method == http.MethodGet {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		business.ServeHTTP(w, r)
		return
	}
	if strings.HasPrefix(path, "/api/v1/web/auth/") && session != nil {
		// Hold the state read lock through a pre-ready Session write. Without
		// it, a login crossing the ready transition could race with the new
		// Handler's independently loaded persistent Session store.
		c.mu.RLock()
		if c.status == "ready" {
			readyBusiness := c.business
			c.mu.RUnlock()
			readyBusiness.ServeHTTP(w, r)
			return
		}
		defer c.mu.RUnlock()
		c.session.ServeAuth(w, r)
		return
	}
	mcpPath := c.settings.MCP.Path
	if strings.HasPrefix(path, "/api/") || path == mcpPath || strings.HasPrefix(path, mcpPath+"/") ||
		strings.HasPrefix(path, "/oauth/") || strings.HasPrefix(path, "/.well-known/") {
		code, message := kernel.CodeInstanceNotInitialized, "KG OS is not initialized"
		if unavailable {
			code, message = kernel.CodeInstanceUnavailable, "KG OS Instance is unavailable"
		}
		setupFailure(w, http.StatusServiceUnavailable, code, message)
		return
	}
	if r.Method == http.MethodGet && isSetupNavigation(path) {
		if path != "/setup" {
			http.Redirect(w, r, "/setup", http.StatusFound)
			return
		}
	}
	c.fallback.ServeHTTP(w, r)
}

func isSetupNavigation(path string) bool {
	if path == "/setup" || path == "/" {
		return true
	}
	// Real Vite/static assets have extensions or the /assets prefix.
	return !strings.HasPrefix(path, "/assets/") && !strings.Contains(filepath.Base(path), ".")
}

func setupFailure(w http.ResponseWriter, status int, code kernel.ErrorCode, message string) {
	w.Header().Set("Cache-Control", "no-store")
	daemon.SetupError(w, status, code, message)
}

func writeSetupJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (c *setupController) claim(w http.ResponseWriter, r *http.Request) {
	if !validSetupOrigin(r) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.status != "setup_required" || c.token != "" {
		setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Administrator credential is already configured")
		return
	}
	credential, err := runtimeprofile.ClaimCredential(c.paths)
	if err != nil {
		if errors.Is(err, runtimeprofile.ErrCredentialAlreadyExists) {
			setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Administrator credential already exists")
			return
		}
		setupFailure(w, http.StatusInternalServerError, kernel.CodeIO, "Cannot create Instance credential")
		return
	}
	c.setToken(credential.Token)
	writeSetupJSON(w, http.StatusCreated, struct {
		Token string `json:"token"`
	}{Token: credential.Token})
}

// Called after SetupSession.Authorize when accepting initialization.
// Recheck the current credential under the controller lock: an old in-flight
// Session must not mutate a rotated Instance.
func (c *setupController) currentRootAuthorized(r *http.Request) bool {
	parts := strings.Fields(r.Header.Get("Authorization"))
	return c.token != "" && len(parts) == 2 &&
		strings.EqualFold(parts[0], "Bearer") &&
		subtle.ConstantTimeCompare([]byte(parts[1]), []byte(c.token)) == 1
}

func (c *setupController) rotateToken(w http.ResponseWriter, r *http.Request) {
	if !validSetupOrigin(r) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	_, statErr := os.Lstat(c.paths.Config)
	if c.status != "setup_required" || c.completed || c.token == "" || !errors.Is(statErr, os.ErrNotExist) {
		setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Administrator Token can only be regenerated before configuration is saved")
		return
	}
	credential, err := runtimeprofile.RotateCredential(c.paths, c.token)
	if err != nil {
		if errors.Is(err, runtimeprofile.ErrCredentialChanged) || errors.Is(err, os.ErrNotExist) {
			setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Instance credential has changed")
			return
		}
		setupFailure(w, http.StatusInternalServerError, kernel.CodeIO, "Cannot regenerate Instance credential")
		return
	}
	// A new SetupSession invalidates all previous Cookie sessions and Web Access
	// Bearers because they are bound to the previous Root Token.
	c.setToken(credential.Token)
	writeSetupJSON(w, http.StatusCreated, struct {
		Token string `json:"token"`
	}{Token: credential.Token})
}

func validSetupOrigin(r *http.Request) bool {
	// Reuse the existing Host, Origin, and Sec-Fetch-Site security boundary.
	return daemon.ValidSetupOrigin(r)
}

type setupEmbeddingInput struct {
	BaseURL    string `json:"base_url"`
	Model      string `json:"model"`
	Dimensions int    `json:"dimensions"`
	Similarity string `json:"similarity"`
}
type setupCacheInput struct {
	Path      string `json:"path"`
	MaxSizeMB int64  `json:"max_size_mb"`
}
type setupConfigInput struct {
	Server    *runtimeprofile.ServerConfig `json:"server"`
	Embedding setupEmbeddingInput          `json:"embedding"`
	Cache     setupCacheInput              `json:"cache"`
	FullText  struct {
		Analyzer string `json:"analyzer"`
	} `json:"fulltext"`
	SQLite struct {
		Extensions []runtimeprofile.ExtensionConfig `json:"extensions"`
	} `json:"sqlite"`
}
type setupInitializeRequest struct {
	Config *setupConfigInput `json:"config"`
	APIKey json.RawMessage   `json:"apiKey"`
}

func (c *setupController) acceptInitialization(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input setupInitializeRequest
	if err := decoder.Decode(&input); err != nil {
		setupFailure(w, http.StatusBadRequest, kernel.CodeInvalidArgument, "Invalid initialization configuration")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		setupFailure(w, http.StatusBadRequest, kernel.CodeInvalidArgument, "Unexpected initialization request data")
		return
	}
	c.mu.Lock()
	if !c.currentRootAuthorized(r) {
		c.mu.Unlock()
		setupFailure(w, http.StatusUnauthorized, kernel.CodeAuthenticationFailed, "authentication failed")
		return
	}
	if c.status == "ready" || c.status == "initializing" || c.completed {
		c.mu.Unlock()
		setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Instance initialization is not available")
		return
	}
	_, statErr := os.Lstat(c.paths.Config)
	existing := statErr == nil
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		c.mu.Unlock()
		setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Cannot inspect Instance configuration")
		return
	}
	if existing {
		if input.Config != nil || input.APIKey != nil {
			c.mu.Unlock()
			setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Existing configuration cannot be overwritten")
			return
		}
		if _, err := runtimeprofile.LoadConfig(c.paths); err != nil {
			c.mu.Unlock()
			setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Correct the existing Instance configuration before retrying")
			return
		}
	} else {
		if err := c.publishWebConfig(input); err != nil {
			c.mu.Unlock()
			setupFailure(w, http.StatusBadRequest, kernel.CodeInvalidArgument, err.Error())
			return
		}
	}
	c.status, c.phase, c.message = "initializing", "configuration", ""
	c.workers.Add(1)
	c.mu.Unlock()
	go func() { defer c.workers.Done(); c.initialize() }()
	writeSetupJSON(w, http.StatusAccepted, map[string]string{"state": "initializing"})
}

func (c *setupController) publishWebConfig(input setupInitializeRequest) error {
	if input.Config == nil || input.APIKey == nil || input.Config.Server == nil {
		return errors.New("complete configuration and credential mode are required")
	}
	if len(input.Config.SQLite.Extensions) != 0 {
		return errors.New("additional extensions must be configured through config.toml")
	}
	var key string
	if string(input.APIKey) != "null" {
		if err := json.Unmarshal(input.APIKey, &key); err != nil || key == "" || len(key) > 8192 {
			return errors.New("invalid embedding credential")
		}
	}
	config := runtimeprofile.Config{
		Server:   input.Config.Server,
		Cache:    runtimeprofile.CacheConfig{Path: input.Config.Cache.Path, MaxSizeMB: input.Config.Cache.MaxSizeMB},
		FullText: runtimeprofile.FullTextConfig{Analyzer: input.Config.FullText.Analyzer},
		Embedding: runtimeprofile.EmbeddingConfig{BaseURL: input.Config.Embedding.BaseURL,
			Model: input.Config.Embedding.Model, Dimensions: input.Config.Embedding.Dimensions,
			Similarity: input.Config.Embedding.Similarity},
	}
	if key != "" {
		config.Embedding.APIKeyEnv = runtimeprofile.WebEmbeddingKeyEnv
	}
	// A completely explicit TOML is validated by the same Runtime parser used
	// for operator-provided files. No missing field is silently defaulted.
	body, err := toml.Marshal(config)
	if err != nil {
		return errors.New("cannot encode Instance configuration")
	}
	if _, err = runtimeprofile.ParseConfig(c.paths, body); err != nil {
		return errors.New("invalid Instance configuration")
	}
	if key != "" {
		if err = runtimeprofile.WriteWebEmbeddingKey(c.paths, key); err != nil {
			return errors.New("cannot save embedding credential")
		}
	}
	return runtimeprofile.PublishConfig(c.paths, body)
}

func (c *setupController) initialize() {
	c.mu.Lock()
	c.phase = "extensions"
	c.mu.Unlock()
	rt, err := runtimehost.OpenWithHeldLock(c.ctx, c.paths.WorkspaceRoot, c.lock, nil)
	if err != nil {
		runtimeprofile.ReleaseWebEmbeddingKey(c.paths)
		c.initializationFailed()
		return
	}
	if c.ctx.Err() != nil {
		_ = rt.Close()
		return
	}
	c.mu.Lock()
	c.phase = "readiness"
	c.mu.Unlock()
	handler, err := readyHandler(rt, c.settings.MCP)
	if err == nil {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/evolution/overview", strings.NewReader("{}"))
		request.Header.Set("Authorization", "Bearer "+rt.Credential.Token)
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request.WithContext(c.ctx))
		if recorder.Code != http.StatusOK {
			err = errors.New("internal authenticated readiness failed")
		} else {
			var overview kernel.EvolutionOverviewResult
			if decodeErr := json.Unmarshal(recorder.Body.Bytes(), &overview); decodeErr != nil ||
				overview.State == "" || overview.DefaultBranch == "" {
				err = errors.New("incomplete Knowledge Base readiness")
			}
		}
	}
	if err == nil && c.ctx.Err() == nil {
		err = runtimeprofile.PublishInitializationReceipt(c.paths)
	}
	if err != nil || c.ctx.Err() != nil {
		_ = rt.Close()
		if c.ctx.Err() == nil {
			c.initializationFailed()
		}
		return
	}
	c.mu.Lock()
	c.runtime = rt
	c.business = handler
	c.setToken(rt.Credential.Token)
	c.completed = true
	c.status, c.phase, c.message = "ready", "", ""
	c.mu.Unlock()
	observability.Log(c.ctx, slog.LevelInfo, "runtime", "runtime.initialized")
}

func (c *setupController) initializationFailed() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.status, c.phase = "error", ""
	c.message = "Initialization failed. Check the server logs and retry with the existing configuration."
}
