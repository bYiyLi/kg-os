package main

// cspell:ignore Alives

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

const (
	probeTimeout       = 10 * time.Second
	probeMaxResponse   = 256 * 1024
	probeMaxRequest    = 16 * 1024
	probeMaxCredential = 8192
)

var errProbeBlocked = errors.New("embedding probe destination is not permitted")

type embeddingProbeInput struct {
	BaseURL    string          `json:"base_url"`
	Model      string          `json:"model"`
	Dimensions int             `json:"dimensions"`
	Similarity string          `json:"similarity"`
	APIKey     json.RawMessage `json:"apiKey"`
}

type embeddingProbeResult struct {
	OK         bool   `json:"ok"`
	Dimensions int    `json:"dimensions,omitempty"`
	Reason     string `json:"reason,omitempty"`
	HTTPStatus int    `json:"httpStatus,omitempty"`
}

func probeFailure(reason string) embeddingProbeResult {
	return embeddingProbeResult{Reason: reason}
}

func (input embeddingProbeInput) validate() (string, error) {
	if len(input.BaseURL) > 2048 || len(input.Model) > 256 ||
		strings.TrimSpace(input.Model) == "" || strings.ContainsAny(input.Model, "\r\n\x00") ||
		input.Dimensions < 1 || input.Dimensions > 4096 ||
		(input.Similarity != "cosine" && input.Similarity != "euclidean") {
		return "", errors.New("invalid embedding configuration")
	}
	parsed, err := url.Parse(input.BaseURL)
	if err != nil || parsed.User != nil || parsed.Opaque != "" || parsed.Hostname() == "" ||
		(parsed.Scheme != "http" && parsed.Scheme != "https") ||
		parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" {
		return "", errors.New("invalid embedding URL")
	}
	if port := parsed.Port(); port != "" {
		parsedPort, parseErr := strconv.Atoi(port)
		if parseErr != nil || parsedPort < 1 || parsedPort > 65535 {
			return "", errors.New("invalid embedding port")
		}
	}
	if len(input.APIKey) == 0 {
		return "", errors.New("credential mode must be explicit")
	}
	if string(input.APIKey) == "null" {
		return "", nil
	}
	var key string
	if err = json.Unmarshal(input.APIKey, &key); err != nil ||
		len(key) == 0 || len(key) > probeMaxCredential || strings.ContainsAny(key, "\r\n\x00") {
		return "", errors.New("invalid embedding credential")
	}
	return key, nil
}

// Permit ordinary private embedding endpoints while excluding loopback,
// link-local/metadata and special-purpose address ranges.
var probeExcludedNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("2001::/32"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"),
}

func allowedProbeIP(address netip.Addr) bool {
	if !address.IsValid() {
		return false
	}
	ip := address.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return false
	}
	for _, prefix := range probeExcludedNetworks {
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

func dialAllowedProbe(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, errProbeBlocked
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, errProbeBlocked
	}
	// Reject mixed allowed/reserved answers, and re-resolve on the actual dial
	// rather than checking one IP then letting the HTTP stack dial another.
	for _, ip := range ips {
		if !allowedProbeIP(ip) {
			return nil, errProbeBlocked
		}
	}
	dialer := net.Dialer{Timeout: 3 * time.Second}
	var lastErr error
	for _, ip := range ips {
		conn, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if dialErr == nil {
			return conn, nil
		}
		lastErr = dialErr
	}
	return nil, lastErr
}

func newEmbeddingProbeClient() *http.Client {
	return &http.Client{
		Timeout: probeTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Transport: &http.Transport{
			Proxy:                 nil,
			DialContext:           dialAllowedProbe,
			DisableKeepAlives:     true,
			TLSHandshakeTimeout:   3 * time.Second,
			ResponseHeaderTimeout: 5 * time.Second,
		},
	}
}

func probeEmbeddingRemote(ctx context.Context, input embeddingProbeInput) embeddingProbeResult {
	client := newEmbeddingProbeClient()
	defer client.CloseIdleConnections()
	return probeEmbeddingWithClient(ctx, input, client)
}

func probeEmbeddingWithClient(ctx context.Context, input embeddingProbeInput, client *http.Client) embeddingProbeResult {
	key, err := input.validate()
	if err != nil {
		return probeFailure("invalid_fields")
	}
	base, _ := url.Parse(input.BaseURL)
	base.Path = strings.TrimRight(base.Path, "/") + "/embeddings"
	base.RawPath = ""
	body, _ := json.Marshal(struct {
		Model          string   `json:"model"`
		Input          []string `json:"input"`
		EncodingFormat string   `json:"encoding_format"`
	}{Model: input.Model, Input: []string{"KG OS embedding connection test"}, EncodingFormat: "float"})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base.String(), bytes.NewReader(body))
	if err != nil {
		return probeFailure("invalid_fields")
	}
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	res, err := client.Do(req)
	if err != nil {
		if errors.Is(err, errProbeBlocked) {
			return probeFailure("address_not_allowed")
		}
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return probeFailure("timeout")
		}
		return probeFailure("connection_failed")
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 && res.StatusCode < 400 {
		return probeFailure("redirect_not_allowed")
	}
	if res.StatusCode != http.StatusOK {
		result := probeFailure("provider_error")
		result.HTTPStatus = res.StatusCode
		switch res.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			result.Reason = "authentication_failed"
		case http.StatusNotFound:
			result.Reason = "endpoint_or_model_not_found"
		case http.StatusTooManyRequests:
			result.Reason = "rate_limited"
		default:
			if res.StatusCode >= 500 {
				result.Reason = "provider_unavailable"
			}
		}
		return result
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, probeMaxResponse+1))
	if err != nil || len(data) > probeMaxResponse {
		return probeFailure("invalid_response")
	}
	var output struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &output) != nil || len(output.Data) != 1 || len(output.Data[0].Embedding) == 0 {
		return probeFailure("invalid_response")
	}
	actual := len(output.Data[0].Embedding)
	if actual != input.Dimensions {
		return embeddingProbeResult{Reason: "dimensions_mismatch", Dimensions: actual}
	}
	for _, n := range output.Data[0].Embedding {
		if math.IsInf(n, 0) || math.IsNaN(n) {
			return probeFailure("invalid_response")
		}
	}
	return embeddingProbeResult{OK: true, Dimensions: actual}
}

// Caller holds c.mu. Claiming the administrator Token must not prevent
// revalidation while the Instance still awaits its initial configuration.
// Fail closed when a config appears, or the credential on disk diverges.
func (c *setupController) canProbeEmbeddingLocked() bool {
	if c.status != "setup_required" || c.completed {
		return false
	}
	_, configErr := os.Lstat(c.paths.Config)
	if !errors.Is(configErr, os.ErrNotExist) {
		return false
	}
	credential, credentialErr := runtimeprofile.LoadCredential(c.paths)
	if c.token == "" {
		return errors.Is(credentialErr, os.ErrNotExist)
	}
	return credentialErr == nil && credential.Token == c.token
}

func (c *setupController) validateEmbedding(w http.ResponseWriter, r *http.Request) {
	if !validSetupOrigin(r) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, probeMaxRequest)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input embeddingProbeInput
	if decoder.Decode(&input) != nil {
		writeSetupJSON(w, http.StatusBadRequest, probeFailure("invalid_fields"))
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeSetupJSON(w, http.StatusBadRequest, probeFailure("invalid_fields"))
		return
	}
	if _, err := input.validate(); err != nil {
		writeSetupJSON(w, http.StatusBadRequest, probeFailure("invalid_fields"))
		return
	}
	c.mu.Lock()
	if !c.canProbeEmbeddingLocked() {
		c.mu.Unlock()
		setupFailure(w, http.StatusConflict, kernel.CodeSetupConflict, "Embedding validation is only available before Instance configuration")
		return
	}
	if c.probing {
		c.mu.Unlock()
		w.Header().Set("Retry-After", "1")
		writeSetupJSON(w, http.StatusTooManyRequests, probeFailure("busy"))
		return
	}
	c.probing = true
	probe := c.probe
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		c.probing = false
		c.mu.Unlock()
	}()
	if probe == nil {
		probe = probeEmbeddingRemote
	}
	ctx, cancel := context.WithTimeout(r.Context(), probeTimeout)
	defer cancel()
	result := probe(ctx, input)
	status := http.StatusUnprocessableEntity
	if result.OK {
		status = http.StatusOK
	}
	writeSetupJSON(w, status, result)
}
