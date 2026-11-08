package mcpserver

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestOAuthProxyCONNECTRetainsTargetAndBasicAuthentication(t *testing.T) {
	headers := make(chan string, 1)
	targets := make(chan string, 1)
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodConnect {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		targets <- request.Host
		headers <- request.Header.Get("Proxy-Authorization")
		downstream, buffered, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		defer downstream.Close()
		if _, err := buffered.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
			t.Error(err)
			return
		}
		if err := buffered.Flush(); err != nil {
			t.Error(err)
			return
		}
		payload := make([]byte, 4)
		if _, err := io.ReadFull(buffered.Reader, payload); err != nil {
			return
		}
		_, _ = buffered.Write(payload)
		_ = buffered.Flush()
	}))
	defer proxy.Close()
	p, err := url.Parse(proxy.URL)
	if err != nil {
		t.Fatal(err)
	}
	p.User = url.UserPassword("client", "proxy-secret")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, err := oauthDialProxyTunnel(ctx, p, "1.1.1.1:443", nil)
	if err != nil {
		t.Fatalf("valid proxy CONNECT rejected: %v", err)
	}
	defer conn.Close()
	if _, err := conn.Write([]byte("ping")); err != nil {
		t.Fatal(err)
	}
	echo := make([]byte, 4)
	if _, err := io.ReadFull(conn, echo); err != nil || string(echo) != "ping" {
		t.Fatalf("CONNECT lost buffered tunnel bytes: %q %v", echo, err)
	}
	if target := <-targets; target != "1.1.1.1:443" {
		t.Fatalf("proxy could resolve a different destination: %s", target)
	}
	encoded := base64.StdEncoding.EncodeToString([]byte("client:proxy-secret"))
	if got := <-headers; got != "Basic "+encoded {
		t.Fatalf("proxy authentication was malformed: %q", got)
	}
}

func TestOAuthOutboundRejectsUnsupportedRequestsBeforeConnecting(t *testing.T) {
	for _, tc := range []struct {
		name, method, target string
	}{
		{"HTTP metadata", "GET", "http://client.example/metadata.json"},
		{"writes not allowed", "POST", "https://client.example/metadata.json"},
		{"userinfo", "GET", "https://user@client.example/metadata.json"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request, err := http.NewRequest(tc.method, tc.target, nil)
			if err != nil {
				t.Fatal(err)
			}
			_, err = (oauthSafeTransport{}).RoundTrip(request)
			if !errors.Is(err, errOAuthUnsafeDestination) {
				t.Fatalf("untrusted outbound request accepted: %v", err)
			}
		})
	}
	request, err := http.NewRequest(http.MethodGet, "https://client.example/metadata.json", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name      string
		transport oauthSafeTransport
	}{
		{"failed DNS", oauthSafeTransport{
			lookup: func(context.Context, string, string) ([]netip.Addr, error) {
				return nil, errors.New("offline")
			}}},
		{"empty DNS", oauthSafeTransport{
			lookup: func(context.Context, string, string) ([]netip.Addr, error) {
				return []netip.Addr{}, nil
			}}},
		{"invalid proxy configuration", oauthSafeTransport{
			lookup: func(context.Context, string, string) ([]netip.Addr, error) {
				return []netip.Addr{netip.MustParseAddr("1.1.1.1")}, nil
			}, proxyFor: func(*http.Request) (*url.URL, error) {
				return nil, errors.New("unusable proxy")
			}}},
		{"unsupported proxy protocol", oauthSafeTransport{
			lookup: func(context.Context, string, string) ([]netip.Addr, error) {
				return []netip.Addr{netip.MustParseAddr("1.1.1.1")}, nil
			}, proxyFor: func(*http.Request) (*url.URL, error) {
				return &url.URL{Scheme: "ftp", Host: "proxy.example"}, nil
			}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tc.transport.RoundTrip(request)
			if err == nil {
				t.Fatalf("invalid metadata outbound policy accepted: %v", err)
			}
		})
	}
}

func TestOAuthDCRRegistrationRejectsMalformedPayloadAndGlobalFlood(t *testing.T) {
	for _, tc := range []struct {
		name, mime, body string
	}{
		{"wrong media type", "text/plain", `{"client_name":"ignored"}`},
		{"bad JSON", "application/json", "{"},
		{"unknown field", "application/json", `{"client_name":"app","redirect_uris":["https://client.example/cb"],"client_secret":"not-allowed"}`},
		{"trailing JSON", "application/json", `{"client_name":"app","redirect_uris":["https://client.example/cb"]}{}`},
		{"missing name", "application/json", `{"redirect_uris":["https://client.example/cb"]}`},
		{"missing redirect", "application/json", `{"client_name":"app"}`},
		{"bad client URI", "application/json", `{"client_name":"app","redirect_uris":["https://client.example/cb"],"client_uri":"http://10.0.0.1/site"}`},
		{"unsupported grant", "application/json", `{"client_name":"app","redirect_uris":["https://client.example/cb"],"grant_types":["client_credentials"]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newOAuthFixture(t)
			request, err := http.NewRequest(http.MethodPost, f.server.URL+"/oauth/register", strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			request.Header.Set("Content-Type", tc.mime)
			result, err := f.client.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			if result.StatusCode != http.StatusBadRequest {
				t.Fatalf("malformed registration accepted: %d", result.StatusCode)
			}
			result.Body.Close()
		})
	}
	f := newOAuthFixture(t)
	for i := 0; i < 60; i++ {
		if !f.broker.allowRegistration("127.0.0.1:3000") {
			t.Fatalf("registration budget exhausted early: %d", i)
		}
	}
	request, err := http.NewRequest(http.MethodPost, f.server.URL+"/oauth/register", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := f.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("anonymous registration flood was accepted: %d", response.StatusCode)
	}
	response.Body.Close()
}

func TestOAuthDCRUnknownIdentityAndExpiredRateEntries(t *testing.T) {
	f := newOAuthFixture(t)
	now := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)
	f.broker.now = func() time.Time { return now }
	f.broker.registrationTimes["ip:1.1.1.1"] = []time.Time{now.Add(-2 * time.Minute)}
	f.broker.registrationTimes["all"] = []time.Time{now.Add(-2 * time.Minute)}
	if !f.broker.allowRegistration("1.1.1.1:8443") || len(f.broker.registrationTimes["ip:1.1.1.1"]) != 1 {
		t.Fatal("expired registration attempts were not forgotten")
	}
	if _, err := f.broker.registeredClient(context.Background(), "not-a-client"); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("arbitrary unregistered ID accepted: %v", err)
	}
	id := "kg_mcp_" + strings.Repeat("a", 43)
	if _, err := f.broker.registeredClient(context.Background(), id); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("unregistered opaque ID accepted: %v", err)
	}
	unavailable := &oauthBroker{}
	if _, err := unavailable.registeredClient(context.Background(), id); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("unavailable registry did not fail closed: %v", err)
	}
}

func TestOAuthTokenAndRevocationRejectBadClientScopeAndResource(t *testing.T) {
	f := newOAuthFixture(t)
	issued := f.grant(nil)
	refresh := issued["refresh_token"].(string)
	for _, tc := range []struct {
		name, route string
		form        url.Values
		wantStatus  int
		wantError   string
	}{
		{"bad client ID", "/oauth/token", url.Values{
			"grant_type": {"refresh_token"}, "client_id": {"invalid"}, "refresh_token": {refresh},
		}, http.StatusUnauthorized, "invalid_client"},
		{"duplicate client ID", "/oauth/token", url.Values{
			"grant_type": {"refresh_token"}, "client_id": {oauthTestClient, oauthTestClient},
			"refresh_token": {refresh},
		}, http.StatusBadRequest, "invalid_request"},
		{"invalid refresh scope", "/oauth/token", url.Values{
			"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
			"refresh_token": {refresh}, "scope": {"kgos:access"},
		}, http.StatusBadRequest, "invalid_scope"},
		{"revoke wrong resource", "/oauth/revoke", url.Values{
			"client_id": {oauthTestClient}, "token": {refresh}, "resource": {f.server.URL},
		}, http.StatusBadRequest, "invalid_target"},
		{"revoke without token", "/oauth/revoke", url.Values{
			"client_id": {oauthTestClient},
		}, http.StatusBadRequest, "invalid_request"},
		{"revoke bad client ID", "/oauth/revoke", url.Values{
			"client_id": {"unknown"}, "token": {refresh},
		}, http.StatusUnauthorized, "invalid_client"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := f.postForm(tc.route, tc.form, "")
			if result.StatusCode != tc.wantStatus {
				t.Fatalf("unexpected OAuth status: %d", result.StatusCode)
			}
			payload := parseOAuthJSON(t, result)
			if payload["error"] != tc.wantError {
				t.Fatalf("invalid OAuth response: %+v", payload)
			}
		})
	}
	valid := f.postForm("/oauth/token", url.Values{
		"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
		"refresh_token": {refresh}, "resource": {f.server.URL + "/mcp"},
	}, "")
	if valid.StatusCode != http.StatusOK {
		t.Fatalf("invalid requests consumed a valid Refresh: %d", valid.StatusCode)
	}
	valid.Body.Close()
}

func TestOAuthCodeExchangeRejectsScopeOverridingWithoutConsumingCode(t *testing.T) {
	f := newOAuthFixture(t)
	callback := f.code()
	parsed, err := url.Parse(callback.Header.Get("Location"))
	callback.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	code := parsed.Query().Get("code")
	response := f.postForm("/oauth/token", url.Values{
		"grant_type": {"authorization_code"}, "client_id": {oauthTestClient},
		"code": {code}, "code_verifier": {oauthTestVerifier},
		"redirect_uri": {oauthTestRedirect}, "resource": {f.server.URL + "/mcp"},
		"scope": {"mcp offline_access"},
	}, "")
	if response.StatusCode != http.StatusBadRequest ||
		parseOAuthJSON(t, response)["error"] != "invalid_request" {
		t.Fatal("token endpoint accepted a new Scope that bypassed consent")
	}
	exchanged := f.exchange(code, oauthTestVerifier, oauthTestClient, f.server.URL+"/mcp")
	if exchanged.StatusCode != http.StatusOK {
		t.Fatalf("invalid Scope request consumed an otherwise valid code: %d", exchanged.StatusCode)
	}
	exchanged.Body.Close()
}

func TestOAuthAuthorizationWithoutRedirectPathKeepsRootCallback(t *testing.T) {
	f := newOAuthFixture(t)
	metadata := map[string]any{
		"client_id": oauthTestClient, "client_name": "Test desktop",
		"redirect_uris":              []string{"https://chatgpt.com"},
		"token_endpoint_auth_method": "none",
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		t.Fatal(err)
	}
	f.metadata.body = raw
	f.resetClientAuth()
	ticket, result := f.begin(url.Values{"redirect_uri": {"https://chatgpt.com"}})
	if result.StatusCode != http.StatusSeeOther || ticket == "" {
		t.Fatalf("registered HTTPS origin callback rejected: %d", result.StatusCode)
	}
	result.Body.Close()
	details := parseOAuthJSON(t, f.getDetails(ticket, oauthTestAdmin))
	if details["redirect_path"] != "/" {
		t.Fatalf("empty callback path was not normalized for Web display: %#v", details)
	}
}

func TestOAuthRegistrationMinimalMetadataDefaultsAndOversizeRejection(t *testing.T) {
	f := newOAuthFixture(t)
	minimum := `{"client_name":"Small desktop app","redirect_uris":["https://client.example/callback"]}`
	request, err := http.NewRequest(http.MethodPost, f.server.URL+"/oauth/register", strings.NewReader(minimum))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := f.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("optional DCR grant/response types became mandatory: %d", response.StatusCode)
	}
	client := parseOAuthJSON(t, response)
	grants, ok := client["grant_types"].([]any)
	if !ok || len(grants) != 2 {
		t.Fatalf("valid minimal client did not receive standard grant types: %+v", client)
	}
	responseTypes, ok := client["response_types"].([]any)
	if !ok || len(responseTypes) != 1 || responseTypes[0] != "code" {
		t.Fatalf("minimal client did not receive code-only response: %+v", client)
	}
	for _, size := range []int{maxOAuthRegistrationBytes + 1, maxOAuthRegistrationBytes * 2} {
		request, err := http.NewRequest(http.MethodPost, f.server.URL+"/oauth/register",
			strings.NewReader(strings.Repeat("x", size)))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		if size == maxOAuthRegistrationBytes*2 {
			// Unknown streaming body length must still be rejected by the
			// bounded reader even when Content-Length is not supplied.
			request.ContentLength = -1
			request.TransferEncoding = []string{"chunked"}
		}
		response, err := f.client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("oversized registration escaped body budget: %d", response.StatusCode)
		}
		response.Body.Close()
	}
}

func TestOAuthDCRFailsClosedOnUnavailableCredentialStore(t *testing.T) {
	f := newOAuthFixture(t)
	if err := f.store.Close(); err != nil {
		t.Fatal(err)
	}
	metadata := `{"client_name":"Desktop","redirect_uris":["https://client.example/callback"]}`
	req, err := http.NewRequest(http.MethodPost, f.server.URL+"/oauth/register", strings.NewReader(metadata))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	result, err := f.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if result.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("store outage was misrepresented as successful DCR registration: %d", result.StatusCode)
	}
	result.Body.Close()
	id := "kg_mcp_" + strings.Repeat("a", 43)
	if _, err := f.broker.registeredClient(context.Background(), id); !errors.Is(err, errOAuthClientUnavailable) {
		t.Fatalf("unavailable stored Client became trusted: %v", err)
	}
}
