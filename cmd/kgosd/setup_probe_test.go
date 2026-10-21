package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func probeSample(base, apiKey string, dimensions int) embeddingProbeInput {
	var key json.RawMessage
	if apiKey == "" {
		key = json.RawMessage("null")
	} else {
		encoded, _ := json.Marshal(apiKey)
		key = encoded
	}
	return embeddingProbeInput{BaseURL: base, Model: "sample-model", Dimensions: dimensions,
		Similarity: "cosine", APIKey: key}
}

func TestEmbeddingProbeMakesActualFloatEmbeddingRequest(t *testing.T) {
	const secret = "test-private-provider-key"
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != http.MethodPost || r.URL.Path != "/v1/embeddings" {
			t.Errorf("wrong provider endpoint: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer "+secret {
			t.Error("missing provider credential")
		}
		var payload struct {
			Model      string   `json:"model"`
			Input      []string `json:"input"`
			Format     string   `json:"encoding_format"`
			Dimensions *int     `json:"dimensions"`
		}
		if json.NewDecoder(r.Body).Decode(&payload) != nil || payload.Model != "sample-model" ||
			len(payload.Input) != 1 || payload.Format != "float" || payload.Dimensions != nil {
			t.Errorf("provider request shape is incompatible: %#v", payload)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"embedding":[0.25,0.5,0.75],"index":0}]}`))
	}))
	defer srv.Close()
	req := probeSample(srv.URL+"/v1", secret, 3)
	result := probeEmbeddingWithClient(context.Background(), req, srv.Client())
	if !result.OK || result.Dimensions != 3 || calls.Load() != 1 {
		t.Fatalf("expected real 3-dimension response: %#v", result)
	}
	serialized, _ := json.Marshal(result)
	if strings.Contains(string(serialized), secret) {
		t.Fatal("embedding credential leaked in the public response")
	}
	req.Dimensions = 4
	result = probeEmbeddingWithClient(context.Background(), req, srv.Client())
	if result.Reason != "dimensions_mismatch" || result.Dimensions != 3 {
		t.Fatalf("dimension mismatch accepted: %#v", result)
	}
}

func TestEmbeddingProbeNoCredentialAndUpstreamFailures(t *testing.T) {
	for _, tc := range []struct {
		name   string
		code   int
		body   string
		reason string
	}{
		{"invalid authorization", 401, `{"error":{"message":"provider might echo user input"}}`, "authentication_failed"},
		{"forbidden", 403, "forbidden", "authentication_failed"},
		{"bad model", 404, "missing", "endpoint_or_model_not_found"},
		{"rate limit", 429, "slow down", "rate_limited"},
		{"provider error", 400, "invalid input", "provider_error"},
		{"server failure", 503, "internal exception", "provider_unavailable"},
		{"invalid json", 200, "not json", "invalid_response"},
		{"missing vector", 200, `{"data":[]}`, "invalid_response"},
		{"malformed vector", 200, `{"data":[{"embedding":["not a number"]}]}`, "invalid_response"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "" {
					t.Error("empty API key unexpectedly attached an Authorization header")
				}
				w.WriteHeader(tc.code)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			result := probeEmbeddingWithClient(context.Background(), probeSample(srv.URL, "", 3), srv.Client())
			if result.OK || result.Reason != tc.reason {
				t.Fatalf("unexpected result: %#v", result)
			}
			public, _ := json.Marshal(result)
			if strings.Contains(string(public), tc.body) {
				t.Fatal("upstream error body leaked to Setup response")
			}
		})
	}
}

func TestEmbeddingProbeRejectsRedirects(t *testing.T) {
	var followed atomic.Bool
	dest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		followed.Store(true)
		w.WriteHeader(http.StatusOK)
	}))
	defer dest.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, dest.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()
	client := source.Client()
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	got := probeEmbeddingWithClient(context.Background(), probeSample(source.URL, "", 3), client)
	if got.Reason != "redirect_not_allowed" || followed.Load() {
		t.Fatalf("provider redirected to another endpoint: %#v", got)
	}
}

func TestEmbeddingProbeIPPolicy(t *testing.T) {
	for _, address := range []string{
		"127.0.0.1", "169.254.169.254",
		"100.64.10.10", "198.18.0.4", "192.0.2.10", "203.0.113.2", "0.0.0.0",
		"::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::",
	} {
		if allowedProbeIP(netip.MustParseAddr(address)) {
			t.Errorf("non-public IP permitted: %s", address)
		}
	}
	for _, address := range []string{"1.1.1.1", "8.8.8.8", "2606:4700:4700::1111",
		"10.168.155.234", "192.168.1.7", "172.16.0.1", "fc00::1"} {
		if !allowedProbeIP(netip.MustParseAddr(address)) {
			t.Errorf("public IP blocked: %s", address)
		}
	}
}

func TestUnauthenticatedProbeCannotDialLoopback(t *testing.T) {
	var reached atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		reached.Store(true)
	}))
	defer srv.Close()
	result := probeEmbeddingWithClient(context.Background(), probeSample(srv.URL, "", 3), newEmbeddingProbeClient())
	if result.Reason != "address_not_allowed" || reached.Load() {
		t.Fatalf("unauthenticated probe accessed the loopback network: %#v", result)
	}
	conn, err := dialAllowedProbe(context.Background(), "tcp", net.JoinHostPort("127.0.0.1", "80"))
	if err == nil || conn != nil {
		t.Fatal("direct loopback dial was not denied")
	}
}

func TestSetupEmbeddingValidationStatusAndNoPersistence(t *testing.T) {
	c := newTestSetup(t)
	const credential = "never-echo-this-provider-key"
	input := probeSample("https://provider.example/v1", credential, 3)
	body, _ := json.Marshal(input)
	c.probe = func(_ context.Context, actual embeddingProbeInput) embeddingProbeResult {
		if string(actual.APIKey) != fmt.Sprintf("%q", credential) || actual.Model != "sample-model" {
			t.Errorf("probe lost credential or model")
		}
		return embeddingProbeResult{OK: true, Dimensions: 3}
	}
	valid := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
	if valid.Code != http.StatusOK || !strings.Contains(valid.Body.String(), `"ok":true`) {
		t.Fatalf("valid provider response HTTP %d: %s", valid.Code, valid.Body.String())
	}
	if strings.Contains(valid.Body.String(), credential) {
		t.Fatal("the provider key leaked from the test endpoint")
	}
	for _, filename := range []string{c.paths.Config, c.paths.Auth, c.paths.Database} {
		if _, err := os.Stat(filename); !os.IsNotExist(err) {
			t.Fatalf("validation created a persistent Instance file: %s", filename)
		}
	}
	for _, payload := range []string{`{}`, `{"base_url":"http://127.0.0.1","model":"a","dimensions":0,"similarity":"cosine","apiKey":null}`, string(body) + "garbage"} {
		bad := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", payload)
		if bad.Code != http.StatusBadRequest {
			t.Fatalf("bad probe input HTTP %d: %s", bad.Code, bad.Body.String())
		}
	}
	c.probe = func(context.Context, embeddingProbeInput) embeddingProbeResult {
		return probeFailure("authentication_failed")
	}
	failed := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
	if failed.Code != http.StatusUnprocessableEntity || !strings.Contains(failed.Body.String(), "authentication_failed") {
		t.Fatalf("failed remote probe was treated as successful: %d: %s", failed.Code, failed.Body.String())
	}
	c.mu.Lock()
	c.status = "ready"
	c.business = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	c.mu.Unlock()
	ready := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
	if ready.Code != http.StatusConflict {
		t.Fatalf("ready Instance can still be probed: HTTP %d", ready.Code)
	}
}

func TestDefaultSetupProbeRejectsPrivateDestinationWithoutPersisting(t *testing.T) {
	c := newTestSetup(t)
	raw, _ := json.Marshal(probeSample("http://127.0.0.1:9999/v1", "", 3))
	response := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(raw))
	if response.Code != http.StatusUnprocessableEntity ||
		!strings.Contains(response.Body.String(), "address_not_allowed") {
		t.Fatalf("unsafe validation HTTP %d: %s", response.Code, response.Body.String())
	}
	if _, err := os.Stat(c.paths.Config); !os.IsNotExist(err) {
		t.Fatal("remote validation unexpectedly published config")
	}
}

func TestEmbeddingProbeSerializesConcurrentUnauthenticatedCalls(t *testing.T) {
	c := newTestSetup(t)
	entered := make(chan struct{})
	release := make(chan struct{})
	c.probe = func(_ context.Context, _ embeddingProbeInput) embeddingProbeResult {
		close(entered)
		<-release
		return embeddingProbeResult{OK: true, Dimensions: 3}
	}
	body, _ := json.Marshal(probeSample("https://provider.example/v1", "", 3))
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		done <- setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
	}()
	<-entered
	busy := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
	if busy.Code != http.StatusTooManyRequests || !strings.Contains(busy.Body.String(), "busy") {
		t.Fatalf("concurrent probe should be rejected: %d %s", busy.Code, busy.Body.String())
	}
	close(release)
	if result := <-done; result.Code != http.StatusOK {
		t.Fatalf("original validation failed: %d %s", result.Code, result.Body.String())
	}
}

func TestSetupEmbeddingProbeRequiresSameOriginAndExplicitCredentialMode(t *testing.T) {
	c := newTestSetup(t)
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:4173/api/v1/setup/validate-embedding", strings.NewReader("{}"))
	req.Header.Set("Origin", "https://untrusted.example")
	rec := httptest.NewRecorder()
	c.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("cross-origin validation was permitted: %d", rec.Code)
	}
	for _, raw := range []string{
		"{}",
		`{"base_url":"https://example.com/v1","model":"m","dimensions":3,"similarity":"cosine"}`,
		`{"base_url":"https://example.com/v1","model":"m","dimensions":3,"similarity":"cosine","apiKey":9}`,
		`{"base_url":"https://example.com/v1","model":"m","dimensions":3,"similarity":"cosine","apiKey":null,"unexpected":1}`,
	} {
		rec := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", raw)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("invalid payload accepted: %d %s", rec.Code, rec.Body.String())
		}
	}
}

func TestEmbeddingProbeAllowsRevalidationAfterAdministratorClaim(t *testing.T) {
	for _, tc := range []struct {
		name    string
		prepare func(*testing.T, *setupController)
	}{
		{
			name: "claimed through setup API",
			prepare: func(t *testing.T, c *setupController) {
				t.Helper()
				result := setupTestRequest(c, http.MethodPost, "/api/v1/setup/claim", "", "")
				if result.Code != http.StatusCreated {
					t.Fatalf("claim failed: HTTP %d", result.Code)
				}
			},
		},
		{
			name: "existing credential loaded on daemon startup",
			prepare: func(t *testing.T, c *setupController) {
				t.Helper()
				credential, err := runtimeprofile.ClaimCredential(c.paths)
				if err != nil {
					t.Fatal(err)
				}
				c.setToken(credential.Token)
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := newTestSetup(t)
			var calls atomic.Int32
			c.probe = func(context.Context, embeddingProbeInput) embeddingProbeResult {
				calls.Add(1)
				return embeddingProbeResult{OK: true, Dimensions: 3}
			}
			tc.prepare(t, c)
			body, err := json.Marshal(probeSample("https://provider.example/v1", "", 3))
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 2; i++ {
				result := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
				if result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"ok":true`) {
					t.Fatalf("claimed Instance could not revalidate: HTTP %d %s", result.Code, result.Body.String())
				}
			}
			if calls.Load() != 2 {
				t.Fatalf("expected two probe calls, got %d", calls.Load())
			}
			if credential, err := runtimeprofile.LoadCredential(c.paths); err != nil || credential.Token != c.token {
				t.Fatal("revalidation replaced the existing administrator credential")
			}
			if _, err := os.Stat(c.paths.Config); !os.IsNotExist(err) {
				t.Fatalf("revalidation created a configuration file: %v", err)
			}
		})
	}
}

func TestEmbeddingProbeDeniedOnceInstanceLeavesConfigurationStage(t *testing.T) {
	for _, scenario := range []struct {
		name    string
		prepare func(*testing.T, *setupController)
	}{
		{
			name: "unrecognized administrator credential appeared on disk",
			prepare: func(t *testing.T, c *setupController) {
				t.Helper()
				if _, err := runtimeprofile.ClaimCredential(c.paths); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "claimed administrator credential was replaced on disk",
			prepare: func(t *testing.T, c *setupController) {
				t.Helper()
				result := setupTestRequest(c, http.MethodPost, "/api/v1/setup/claim", "", "")
				if result.Code != http.StatusCreated {
					t.Fatalf("claim failed: HTTP %d", result.Code)
				}
				if err := os.Remove(c.paths.Auth); err != nil {
					t.Fatal(err)
				}
				if _, err := runtimeprofile.ClaimCredential(c.paths); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "operator published configuration while listener is running",
			prepare: func(t *testing.T, c *setupController) {
				t.Helper()
				if err := os.WriteFile(c.paths.Config, []byte("operator-owned configuration"), 0o600); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "configuration path exists but is not a file",
			prepare: func(t *testing.T, c *setupController) {
				t.Helper()
				if err := os.Mkdir(c.paths.Config, 0o700); err != nil {
					t.Fatal(err)
				}
			},
		},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			c := newTestSetup(t)
			var calls atomic.Int32
			c.probe = func(context.Context, embeddingProbeInput) embeddingProbeResult {
				calls.Add(1)
				return embeddingProbeResult{OK: true, Dimensions: 3}
			}
			scenario.prepare(t, c)
			if status := c.state().State; status != "setup_required" {
				t.Fatalf("expected stale setup_required state, got %q", status)
			}
			body, err := json.Marshal(probeSample("https://provider.example/v1", "", 3))
			if err != nil {
				t.Fatal(err)
			}
			result := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
			if result.Code != http.StatusConflict || !strings.Contains(result.Body.String(), "SETUP_CONFLICT") {
				t.Fatalf("configured instance allowed validation: HTTP %d %s", result.Code, result.Body.String())
			}
			if calls.Load() != 0 {
				t.Fatal("configured Instance performed an outgoing Embedding request")
			}
		})
	}
}

func TestEmbeddingProbeDeniedDuringInitialization(t *testing.T) {
	c := newTestSetup(t)
	var calls atomic.Int32
	c.probe = func(context.Context, embeddingProbeInput) embeddingProbeResult {
		calls.Add(1)
		return embeddingProbeResult{OK: true, Dimensions: 3}
	}
	c.status = "initializing"
	body, err := json.Marshal(probeSample("https://provider.example/v1", "", 3))
	if err != nil {
		t.Fatal(err)
	}
	result := setupTestRequest(c, http.MethodPost, "/api/v1/setup/validate-embedding", "", string(body))
	if result.Code != http.StatusConflict || calls.Load() != 0 {
		t.Fatalf("probe escaped initializing gate: HTTP %d, calls %d", result.Code, calls.Load())
	}
}
