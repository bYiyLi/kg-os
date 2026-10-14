package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestOAuthWebReferenceRejectsWrongClientAndMalformedIDs(t *testing.T) {
	f := newOAuthFixture(t)
	_, wrong := f.begin(url.Values{
		"redirect_uri": {"https://chatgpt.com/undeclared-but-valid"},
	})
	if wrong.StatusCode != http.StatusBadRequest {
		t.Fatalf("unregistered ChatGPT redirect accepted: %d", wrong.StatusCode)
	}
	wrong.Body.Close()

	ticket, start := f.begin(nil)
	start.Body.Close()
	for _, query := range []string{
		"request_id=short",
		"request_id=" + ticket + "&request_id=" + ticket,
		"request_id=%25",
	} {
		result := f.get("/oauth/request?" + query)
		// No URL reference is sufficient to access a pending grant.
		if result.StatusCode != http.StatusUnauthorized {
			t.Fatalf("anonymous lookup revealed a request: %d", result.StatusCode)
		}
		result.Body.Close()
		request, err := http.NewRequest(http.MethodGet, f.server.URL+"/oauth/request?"+query, nil)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Authorization", "Bearer "+oauthTestAdmin)
		authenticated, err := f.client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		if authenticated.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid request reference was accepted: %d", authenticated.StatusCode)
		}
		authenticated.Body.Close()
	}
	valid := f.getDetails(ticket, oauthTestAdmin)
	if valid.StatusCode != http.StatusOK {
		t.Fatalf("malformed references consumed the real request: %d", valid.StatusCode)
	}
	valid.Body.Close()
}

func TestOAuthConsentCodeCapacityNeverConsumesPendingApproval(t *testing.T) {
	f := newOAuthFixture(t)
	ticket, page := f.begin(nil)
	page.Body.Close()
	f.broker.mu.Lock()
	for i := range maxPendingOAuth {
		f.broker.codes[oauthHash(fmt.Sprintf("pending-code-%d", i))] = oauthAuthorization{
			expires: f.broker.now().Add(time.Hour),
		}
	}
	f.broker.mu.Unlock()
	blocked := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if blocked.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("OAuth code budget did not fail closed: %d", blocked.StatusCode)
	}
	blocked.Body.Close()

	f.broker.mu.Lock()
	clear(f.broker.codes)
	f.broker.mu.Unlock()
	approved := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if approved.StatusCode != http.StatusOK {
		t.Fatalf("backpressure consumed a pending authorization: %d", approved.StatusCode)
	}
	approved.Body.Close()
}

func TestOAuthTokenRejectsMalformedCodeAndRefreshSecrets(t *testing.T) {
	f := newOAuthFixture(t)
	badCode := f.exchange("short", oauthTestVerifier, oauthTestClient, f.server.URL)
	if badCode.StatusCode != http.StatusBadRequest {
		t.Fatalf("malformed code accepted: %d", badCode.StatusCode)
	}
	badCode.Body.Close()
	for _, token := range []string{"short", strings.Repeat("z", 43)} {
		badRefresh := f.postForm("/oauth/token", url.Values{
			"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
			"resource": {f.server.URL}, "refresh_token": {token},
		}, "")
		if badRefresh.StatusCode != http.StatusBadRequest {
			t.Fatalf("forged refresh token accepted: %d", badRefresh.StatusCode)
		}
		badRefresh.Body.Close()
	}
}

func TestOAuthCodeExchangeFailsClosedWhenAccessGrantCapacityIsFull(t *testing.T) {
	f := newOAuthFixture(t)
	codeRedirect := f.code()
	redirect, err := url.Parse(codeRedirect.Header.Get("Location"))
	codeRedirect.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	code := redirect.Query().Get("code")
	f.broker.mu.Lock()
	for i := range maxOAuthTokens {
		f.broker.access[oauthHash(fmt.Sprintf("capacity-access-%d", i))] = oauthGrant{
			clientID: oauthTestClient, issuer: f.broker.issuer, resource: f.broker.resource,
			scope: oauthScope, expires: f.broker.now().Add(time.Hour),
		}
	}
	f.broker.mu.Unlock()
	blocked := f.exchange(code, oauthTestVerifier, oauthTestClient, f.server.URL)
	if blocked.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("issued an OAuth grant past the token budget: %d", blocked.StatusCode)
	}
	blocked.Body.Close()
	replayed := f.exchange(code, oauthTestVerifier, oauthTestClient, f.server.URL)
	if replayed.StatusCode != http.StatusBadRequest {
		t.Fatalf("failed code exchange was replayable: %d", replayed.StatusCode)
	}
	replayed.Body.Close()
}

func TestOAuthDecisionGuardsMalformedCallbackAndBrokenRequestBody(t *testing.T) {
	f := newOAuthFixture(t)
	if _, err := f.broker.authorizationRedirect(oauthAuthorization{redirectURI: "%"}, url.Values{
		"error": {"access_denied"},
	}); err == nil {
		t.Fatal("malformed callback accepted")
	}
	for _, action := range []string{"approve", "deny"} {
		ticket, page := f.begin(nil)
		page.Body.Close()
		key := oauthHash(ticket)
		f.broker.mu.Lock()
		pending := f.broker.tickets[key]
		pending.redirectURI = "%"
		f.broker.tickets[key] = pending
		f.broker.mu.Unlock()
		response := f.postDecision(ticket, oauthTestAdmin, f.server.URL, action)
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid stored callback %q authorized: %d", action, response.StatusCode)
		}
		response.Body.Close()
	}

	invalid := httptest.NewRequest(http.MethodPost, "/oauth/decision", nil)
	invalid.Header.Set("Content-Type", "application/json")
	invalid.Header.Set("Origin", f.server.URL)
	invalid.Header.Set("Authorization", "Bearer "+oauthTestAdmin)
	invalid.Body = failingRequestBody{}
	recorder := httptest.NewRecorder()
	f.broker.finishAuthorization(recorder, invalid)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("broken OAuth request body was accepted: %d", recorder.Code)
	}
}

type inaccessibleCIMDTransport struct{}

func (inaccessibleCIMDTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("simulated metadata network failure")
}

func TestOAuthUnexpectedRequestAndMetadataTransportFailure(t *testing.T) {
	f := newOAuthFixture(t)
	unknown := httptest.NewRecorder()
	f.broker.serveHTTP(unknown, httptest.NewRequest(http.MethodGet, "/oauth/unknown", nil))
	if unknown.Code != http.StatusNotFound {
		t.Fatalf("unrecognized OAuth route accepted: %d", unknown.Code)
	}
	if _, err := f.broker.redirectsFor(context.Background(), "https://evil.example/client.json"); err == nil {
		t.Fatal("arbitrary client ID metadata URL accepted")
	}
	f.broker.client = &http.Client{Transport: inaccessibleCIMDTransport{}}
	_, failed := f.begin(nil)
	if failed.StatusCode != http.StatusBadRequest {
		t.Fatalf("unavailable CIMD did not fail closed: %d", failed.StatusCode)
	}
	failed.Body.Close()
}

func TestInstanceMCPRejectsEmptyCredentialAndConcurrentCapacity(t *testing.T) {
	server, err := New(&kernel.Service{}, Options{
		Token: "isolated-instance-bearer", Path: "/mcp", MaxConcurrency: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if server.authorized("Bearer ") {
		t.Fatal("empty Instance Bearer was accepted")
	}
	server.semaphore <- struct{}{}
	request := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	request.Header.Set("Authorization", "Bearer isolated-instance-bearer")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	<-server.semaphore
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("MCP concurrency limit was not enforced: %d", response.Code)
	}
}

func TestEmptyMCPToolScriptCannotExecute(t *testing.T) {
	f := newOAuthFixture(t)
	client := mcp.NewClient(&mcp.Implementation{Name: "phase17-empty-script", Version: "1"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint: f.server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: oauthBearerTransport{token: oauthTestAdmin, base: http.DefaultTransport}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	for _, name := range []string{"kgos_read", "kgos_run"} {
		result, err := session.CallTool(ctx, &mcp.CallToolParams{
			Name: name, Arguments: map[string]any{"code": ""},
		})
		if err != nil {
			t.Fatalf("%s request failed: %v", name, err)
		}
		if !result.IsError {
			t.Fatalf("%s accepted an empty JavaScript program", name)
		}
	}
}

func TestOAuthRejectsNoncanonicalIssuerAndMetadataRedirect(t *testing.T) {
	if _, err := newOAuthBroker("HTTPS://kgos.example.com", "/mcp", "root", nil); err == nil {
		t.Fatal("noncanonical issuer was silently normalized")
	}
	f := newOAuthFixture(t)
	// Follow attempts must never leave the fixed ChatGPT CIMD origin.
	redirect := httptest.NewRecorder()
	redirect.Header().Set("Location", "https://malicious.example/oauth/client.json")
	redirect.WriteHeader(http.StatusFound)
	transport := &oauthCIMDRedirectTransport{response: redirect.Result()}
	f.broker.client = &http.Client{Transport: transport,
		CheckRedirect: f.broker.client.CheckRedirect}
	req, err := http.NewRequest(http.MethodGet, oauthTestClient, nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := f.broker.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer result.Body.Close()
	if result.StatusCode != http.StatusFound || transport.requests != 1 {
		t.Fatal("OAuth CIMD client followed a redirect to an arbitrary origin")
	}
}

type oauthCIMDRedirectTransport struct {
	response *http.Response
	requests int
}

func (t *oauthCIMDRedirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.requests++
	copy := *t.response
	copy.Request = req
	copy.Body = http.NoBody
	return &copy, nil
}
