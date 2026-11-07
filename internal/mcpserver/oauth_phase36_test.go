package mcpserver

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/mcpoauth"
)

func phase36Registration(t *testing.T, f *oauthFixture, input any) *http.Response {
	t.Helper()
	raw, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, f.server.URL+"/oauth/register", strings.NewReader(string(raw)))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := f.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func phase36Client() map[string]any {
	return map[string]any{
		"client_name":                "Muse Desktop",
		"redirect_uris":              []string{"http://127.0.0.1:17777/callback"},
		"token_endpoint_auth_method": "none",
		"grant_types":                []string{"authorization_code", "refresh_token"},
		"response_types":             []string{"code"},
		"scope":                      "mcp offline_access",
	}
}

func TestPhase36DCRRegistrationBrowserApprovalAndRefreshAfterRestart(t *testing.T) {
	f := newOAuthFixture(t)
	metadata := parseOAuthJSON(t, f.get("/.well-known/oauth-authorization-server"))
	if metadata["registration_endpoint"] != f.server.URL+"/oauth/register" ||
		metadata["client_id_metadata_document_supported"] != true {
		t.Fatalf("DCR/CIMD not discoverable: %#v", metadata)
	}
	response := phase36Registration(t, f, phase36Client())
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("DCR registration status: %d, body: %#v", response.StatusCode, parseOAuthJSON(t, response))
	}
	registration := parseOAuthJSON(t, response)
	id, ok := registration["client_id"].(string)
	if !ok || !validDCRClientID(id) || registration["client_secret"] != nil {
		t.Fatalf("DCR did not issue public identity: %#v", registration)
	}
	if registration["token_endpoint_auth_method"] != "none" {
		t.Fatalf("public client auth method: %#v", registration)
	}
	callback := "http://127.0.0.1:17777/callback"
	ticket, start := f.begin(url.Values{
		"client_id": {id}, "redirect_uri": {callback}, "scope": {"mcp offline_access"},
	})
	if start.StatusCode != http.StatusSeeOther || ticket == "" {
		t.Fatalf("DCR authorization rejected: %d", start.StatusCode)
	}
	start.Body.Close()
	details := parseOAuthJSON(t, f.getDetails(ticket, oauthTestAdmin))
	if details["client_name"] != "Muse Desktop" || details["client_kind"] != "dcr" ||
		details["redirect_host"] != "127.0.0.1:17777" || details["loopback"] != true ||
		details["canWrite"] != true {
		t.Fatalf("untrusted/incorrect Web consent projection: %#v", details)
	}
	decision := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if decision.StatusCode != http.StatusOK {
		t.Fatalf("DCR approval status: %d", decision.StatusCode)
	}
	authorized := parseOAuthJSON(t, decision)
	redirect, err := url.Parse(authorized["redirect_url"].(string))
	if err != nil || redirect.Scheme != "http" || redirect.Host != "127.0.0.1:17777" ||
		redirect.Path != "/callback" || redirect.Query().Get("state") != "opaque-state" ||
		redirect.Query().Get("iss") != f.server.URL {
		t.Fatalf("OAuth callback did not preserve trusted loopback: %v", authorized)
	}
	code := redirect.Query().Get("code")
	token := f.postForm("/oauth/token", url.Values{
		"grant_type": {"authorization_code"}, "client_id": {id},
		"redirect_uri": {callback}, "code": {code},
		"code_verifier": {oauthTestVerifier}, "resource": {f.server.URL + "/mcp"},
	}, "")
	if token.StatusCode != http.StatusOK {
		t.Fatalf("DCR code exchange: %d", token.StatusCode)
	}
	issued := parseOAuthJSON(t, token)
	if issued["scope"] != "mcp offline_access" || issued["expires_in"] != float64(840) ||
		!f.service.authorized("Bearer "+issued["access_token"].(string)) {
		t.Fatalf("DCR token failed: %#v", issued)
	}
	if err := f.store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := mcpoauth.Open(f.storePath, fmt.Sprintf("%x", oauthHash(oauthTestAdmin)), f.server.URL, f.server.URL+"/mcp")
	if err != nil {
		t.Fatal(err)
	}
	f.store, f.broker.store = reopened, reopened
	stored, err := reopened.GetClient(context.Background(), id)
	if err != nil || stored.Name != "Muse Desktop" || stored.RedirectURIs[0] != callback {
		t.Fatalf("DCR identity not persisted across restart: %+v %v", stored, err)
	}
	rotated := f.postForm("/oauth/token", url.Values{
		"grant_type": {"refresh_token"}, "client_id": {id},
		"refresh_token": {issued["refresh_token"].(string)},
	}, "")
	if rotated.StatusCode != http.StatusOK {
		t.Fatalf("DCR refresh after restart: %d", rotated.StatusCode)
	}
	renewed := parseOAuthJSON(t, rotated)
	if renewed["scope"] != issued["scope"] || renewed["expires_in"] != float64(840) {
		t.Fatalf("DCR refresh scope/ttl changed: %#v", renewed)
	}
	revoke := f.postForm("/oauth/revoke", url.Values{
		"client_id": {id}, "token": {renewed["refresh_token"].(string)},
	}, "")
	if revoke.StatusCode != http.StatusOK {
		t.Fatalf("DCR revoke failed: %d", revoke.StatusCode)
	}
	revoke.Body.Close()
	if f.service.authorized("Bearer " + renewed["access_token"].(string)) {
		t.Fatal("revoked DCR family retained MCP access")
	}
}

func TestPhase36DCRInputBoundsAndRateLimit(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(map[string]any)
	}{
		{"secret", func(m map[string]any) { m["token_endpoint_auth_method"] = "client_secret_basic" }},
		{"invalid application type", func(m map[string]any) { m["application_type"] = "invalid" }},
		{"private callback", func(m map[string]any) { m["redirect_uris"] = []string{"http://10.0.0.3:9000/cb"} }},
		{"userinfo callback", func(m map[string]any) { m["redirect_uris"] = []string{"https://user@client.example/cb"} }},
		{"fragment callback", func(m map[string]any) { m["redirect_uris"] = []string{"https://client.example/cb#fragment"} }},
		{"wildcard callback", func(m map[string]any) { m["redirect_uris"] = []string{"https://*.example.com/callback"} }},
		{"duplicate callback", func(m map[string]any) {
			m["redirect_uris"] = []string{"https://client.example/cb", "https://client.example/cb"}
		}},
		{"legacy scope", func(m map[string]any) { m["scope"] = "kgos:access" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newOAuthFixture(t)
			input := phase36Client()
			tc.change(input)
			response := phase36Registration(t, f, input)
			if response.StatusCode != http.StatusBadRequest {
				t.Fatalf("invalid DCR metadata accepted: %d", response.StatusCode)
			}
			response.Body.Close()
		})
	}
	f := newOAuthFixture(t)
	for index := range 11 {
		response := phase36Registration(t, f, phase36Client())
		if response.StatusCode != http.StatusCreated {
			t.Fatalf("DCR permitted registration %d failed: %d", index, response.StatusCode)
		}
		response.Body.Close()
	}
	direct := newOAuthFixture(t)
	for index := range 10 {
		if !direct.broker.allowRegistration("8.8.8.8:443") {
			t.Fatalf("direct public peer blocked early at %d", index)
		}
	}
	if direct.broker.allowRegistration("8.8.8.8:8443") || !direct.broker.allowRegistration("1.1.1.1:443") {
		t.Fatal("direct public-source registration limit ignored")
	}
	shared := newOAuthFixture(t)
	for index := range 60 {
		if !shared.broker.allowRegistration("127.0.0.1:3777") {
			t.Fatalf("reverse proxy unexpectedly hit per-source limit at %d", index)
		}
	}
	if shared.broker.allowRegistration("127.0.0.1:3777") {
		t.Fatal("shared reverse proxy bypassed the global 60/minute cap")
	}
	native := newOAuthFixture(t)
	app := phase36Client()
	app["application_type"] = "native"
	accepted := phase36Registration(t, native, app)
	if accepted.StatusCode != http.StatusCreated {
		t.Fatalf("optional native application type rejected: %d", accepted.StatusCode)
	}
	accepted.Body.Close()
}

func TestPhase36MetadataSSRFProtection(t *testing.T) {
	for _, invalid := range []string{
		"https://127.0.0.1/meta", "https://[::1]/meta", "https://10.0.0.5/meta",
		"http://client.example/meta", "https://localhost/meta", "https://client.example/a/../meta",
		"https://client.example/meta?secret=1", "https://user@client.example/meta",
	} {
		if validOAuthClientID(invalid) {
			t.Errorf("unsafe metadata URL accepted: %q", invalid)
		}
	}
	if !validOAuthClientID("https://muse.example.org/oauth/client.json") {
		t.Fatal("public CIMD metadata URI rejected")
	}
	for _, address := range []string{
		"127.0.0.1", "::1", "10.0.0.1", "169.254.169.254",
		"192.0.2.1", "100.64.0.2", "198.18.0.1", "2001:db8::1",
	} {
		if oauthPublicIP(netip.MustParseAddr(address)) {
			t.Errorf("untrusted outbound address accepted: %s", address)
		}
	}
	for _, address := range []string{"1.1.1.1", "2606:4700:4700::1111"} {
		if !oauthPublicIP(netip.MustParseAddr(address)) {
			t.Errorf("public outbound address blocked: %s", address)
		}
	}
	_, err := secureOAuthClient().Get("https://127.0.0.1:1/internal")
	if err == nil {
		t.Fatal("metadata HTTP client could reach loopback")
	}
	for _, bad := range []string{"https://*.example.com/callback", "https://foo..example.com/callback", "https://-foo.example/callback"} {
		if validOAuthRedirect(bad) {
			t.Errorf("malformed HTTPS callback hostname accepted: %q", bad)
		}
	}
}

func TestPhase36LegacyAccessRetainsExpiryAndRefreshRequiresConsent(t *testing.T) {
	f := newOAuthFixture(t)
	base := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)
	f.broker.now = func() time.Time { return base }
	code, err := randomOAuthSecret()
	if err != nil {
		t.Fatal(err)
	}
	family, err := randomOAuthSecret()
	if err != nil {
		t.Fatal(err)
	}
	challenge := sha256.Sum256([]byte(oauthTestVerifier))
	encodedChallenge := base64.RawURLEncoding.EncodeToString(challenge[:])
	if err := f.store.PutCode(context.Background(), mcpoauth.Code{
		Hash: oauthHashString(code),
		Binding: mcpoauth.Binding{
			FamilyID: family, ClientID: oauthTestClient, Issuer: f.server.URL,
			Resource: f.server.URL + "/mcp", Scope: legacyOAuthScope + " offline_access",
		},
		RedirectURI: oauthTestRedirect, Challenge: encodedChallenge,
		ExpiresAt: base.Add(5 * time.Minute),
	}, base); err != nil {
		t.Fatal(err)
	}
	blocked := f.postForm("/oauth/token", url.Values{
		"grant_type": {"authorization_code"}, "client_id": {oauthTestClient},
		"code": {code}, "code_verifier": {oauthTestVerifier},
		"redirect_uri": {oauthTestRedirect}, "resource": {f.server.URL + "/mcp"},
	}, "")
	if blocked.StatusCode != http.StatusBadRequest ||
		parseOAuthJSON(t, blocked)["error"] != "invalid_grant" {
		t.Fatal("outstanding pre-upgrade Code was allowed to mint a new legacy-Scope Token")
	}
	// Seed one pre-upgrade family directly through the lower-level store
	// interface to verify grandfathered Access independently of HTTP issuance.
	access, err := randomOAuthSecret()
	if err != nil {
		t.Fatal(err)
	}
	refresh, err := randomOAuthSecret()
	if err != nil {
		t.Fatal(err)
	}
	oldTokens := mcpoauth.Tokens{
		AccessHash: oauthHashString(access), RefreshHash: oauthHashString(refresh),
		AccessExpiresAt:  base.Add(24 * time.Hour),
		RefreshExpiresAt: base.Add(30 * 24 * time.Hour), AuthMethod: "none",
	}
	issued, err := f.store.ExchangeCode(context.Background(), oauthHashString(code),
		oauthTestClient, oauthTestRedirect, f.server.URL+"/mcp", encodedChallenge, oldTokens, base)
	if err != nil || issued.Scope != legacyOAuthScope+" offline_access" {
		t.Fatalf("pre-migration grant fixture: %+v %v", issued, err)
	}
	if !f.service.authorized("Bearer " + access) {
		t.Fatal("legacy Access was invalidated before its original expiry")
	}
	response := f.postForm("/oauth/token", url.Values{
		"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
		"refresh_token": {refresh}, "resource": {f.server.URL + "/mcp"},
	}, "")
	if response.StatusCode != http.StatusBadRequest ||
		parseOAuthJSON(t, response)["error"] != "invalid_grant" {
		t.Fatal("legacy Refresh was silently converted to a new Scope")
	}
	if !f.service.authorized("Bearer " + access) {
		t.Fatal("failed legacy Refresh unexpectedly revoked valid Access")
	}
	f.broker.now = func() time.Time { return base.Add(24 * time.Hour) }
	if f.service.authorized("Bearer " + access) {
		t.Fatal("expired legacy Access was accepted")
	}
}

func TestPhase36ProxyPinsValidatedIPBeforeCONNECT(t *testing.T) {
	destinations := make(chan string, 2)
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodConnect {
			destinations <- r.Host
		}
		w.WriteHeader(http.StatusForbidden)
	}))
	defer proxy.Close()
	proxyURL, err := url.Parse(proxy.URL)
	if err != nil {
		t.Fatal(err)
	}
	transport := oauthSafeTransport{
		lookup: func(_ context.Context, network, host string) ([]netip.Addr, error) {
			if network != "ip" || host != "muse.example.org" {
				t.Errorf("unexpected DNS query: %s %s", network, host)
			}
			return []netip.Addr{netip.MustParseAddr("1.1.1.1")}, nil
		},
		proxyFor: func(*http.Request) (*url.URL, error) { return proxyURL, nil },
	}
	request, err := http.NewRequest(http.MethodGet, "https://muse.example.org/oauth/client.json", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := transport.RoundTrip(request)
	if response != nil {
		response.Body.Close()
	}
	if err == nil && response != nil && response.StatusCode != http.StatusForbidden {
		t.Fatalf("unexpected proxy response: %d", response.StatusCode)
	}
	select {
	case destination := <-destinations:
		if destination != "1.1.1.1:443" {
			t.Fatalf("proxy re-resolved client hostname: %s", destination)
		}
	default:
		t.Fatal("no pinned-IP CONNECT request")
	}
	transport.lookup = func(context.Context, string, string) ([]netip.Addr, error) {
		return []netip.Addr{netip.MustParseAddr("1.1.1.1"), netip.MustParseAddr("127.0.0.1")}, nil
	}
	response, err = transport.RoundTrip(request)
	if response != nil {
		response.Body.Close()
	}
	if err == nil {
		t.Fatal("private DNS answer accepted")
	}
	select {
	case destination := <-destinations:
		t.Fatalf("invalid DNS answer made proxy request: %s", destination)
	default:
	}
}

func TestPhase36InvalidOutboundDestinationIsNotTransientClientFailure(t *testing.T) {
	client := &http.Client{Transport: oauthSafeTransport{
		lookup: func(context.Context, string, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
		},
	}}
	if _, err := fetchOAuthJSON(context.Background(), client, "https://client.example.com/oauth/client.json", 4096); !errors.Is(err, errOAuthInvalidClient) {
		t.Fatalf("SSRF destination was reported as a recoverable fetch outage: %v", err)
	}
}

func TestPhase36ClientMethodMetadataCannotDowngradeSigning(t *testing.T) {
	client := oauthClientDocument{
		AuthenticationMethod:  "none",
		AuthenticationMethods: []string{"private_key_jwt"},
	}
	if client.allows("none") || !client.allows("private_key_jwt") {
		t.Fatal("conflicting CIMD method declarations unexpectedly enabled unauthenticated token exchange")
	}
}

func TestPhase36OAuthStateIsOptionalButDuplicatedValuesAreRejected(t *testing.T) {
	f := newOAuthFixture(t)
	ticket, result := f.begin(url.Values{"state": nil})
	if result.StatusCode != http.StatusSeeOther || ticket == "" {
		t.Fatalf("optional OAuth state was rejected: %d", result.StatusCode)
	}
	result.Body.Close()
	approved := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if approved.StatusCode != http.StatusOK {
		t.Fatalf("OAuth approval without state failed: %d", approved.StatusCode)
	}
	target, err := url.Parse(parseOAuthJSON(t, approved)["redirect_url"].(string))
	if err != nil || target.Query().Has("state") ||
		target.Query().Get("code") == "" || target.Query().Get("iss") != f.server.URL {
		t.Fatalf("optional state was invented or authorization lost issuer/code: %v", target)
	}
	_, duplicate := f.begin(url.Values{"state": {"s1", "s2"}})
	if duplicate.StatusCode != http.StatusBadRequest {
		t.Fatalf("ambiguous OAuth state was accepted: %d", duplicate.StatusCode)
	}
	duplicate.Body.Close()
}

func TestPhase36HTTPSProxyVerifiesSeparateCertificateAndPinnedCONNECT(t *testing.T) {
	targets := make(chan string, 2)
	proxy := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodConnect {
			targets <- request.Host
		}
		w.WriteHeader(http.StatusForbidden)
	}))
	defer proxy.Close()
	proxyURL, err := url.Parse(proxy.URL)
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	roots.AddCert(proxy.Certificate())
	transport := oauthSafeTransport{
		lookup: func(_ context.Context, network, host string) ([]netip.Addr, error) {
			if network != "ip" || host != "muse.example.org" {
				t.Fatalf("unexpected OAuth client hostname: %s %s", network, host)
			}
			return []netip.Addr{netip.MustParseAddr("1.1.1.1")}, nil
		},
		proxyFor:     func(*http.Request) (*url.URL, error) { return proxyURL, nil },
		proxyTLSRoot: roots,
	}
	request, err := http.NewRequest(http.MethodGet, "https://muse.example.org/oauth/client.json", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := transport.RoundTrip(request)
	if response != nil {
		response.Body.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "proxy rejected CONNECT") {
		t.Fatalf("HTTPS proxy TLS was not validated independently: %v", err)
	}
	select {
	case target := <-targets:
		if target != "1.1.1.1:443" {
			t.Fatalf("HTTPS CONNECT used unverified hostname: %s", target)
		}
	default:
		t.Fatal("HTTPS proxy never received a pinned-IP CONNECT")
	}
	transport.proxyTLSRoot = x509.NewCertPool()
	response, err = transport.RoundTrip(request)
	if response != nil {
		response.Body.Close()
	}
	if err == nil || strings.Contains(err.Error(), "proxy rejected CONNECT") {
		t.Fatalf("untrusted HTTPS proxy certificate was not rejected: %v", err)
	}
	select {
	case target := <-targets:
		t.Fatalf("untrusted HTTPS proxy received CONNECT: %s", target)
	default:
	}
}

func TestPhase36CanonicalMCPResourceRejectsLegacyAudienceForNewGrants(t *testing.T) {
	f := newOAuthFixture(t)
	protected := parseOAuthJSON(t, f.get("/.well-known/oauth-protected-resource/mcp"))
	if protected["resource"] != f.server.URL+"/mcp" {
		t.Fatalf("MCP protected resource advertised wrong audience: %#v", protected)
	}
	as := parseOAuthJSON(t, f.get("/.well-known/oauth-authorization-server"))
	if as["issuer"] != f.server.URL {
		t.Fatalf("authorization server issuer changed: %#v", as)
	}
	_, old := f.begin(url.Values{"resource": {f.server.URL}})
	if old.StatusCode != http.StatusBadRequest {
		t.Fatalf("new authorization accepted old audience: %d", old.StatusCode)
	}
	old.Body.Close()
	ticket, modern := f.begin(nil)
	if modern.StatusCode != http.StatusSeeOther || ticket == "" {
		t.Fatalf("new MCP resource was rejected: %d", modern.StatusCode)
	}
	modern.Body.Close()
}

func TestPhase36MCPBearerSurvivesOriginalAudienceStoreMigration(t *testing.T) {
	f := newOAuthFixture(t)
	base := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)
	f.broker.now = func() time.Time { return base }
	if err := f.store.Close(); err != nil {
		t.Fatal(err)
	}
	oldStore, err := mcpoauth.Open(f.storePath, fmt.Sprintf("%x", oauthHash(oauthTestAdmin)), f.server.URL, f.server.URL)
	if err != nil {
		t.Fatal(err)
	}
	f.store, f.broker.store = oldStore, oldStore
	code, err := randomOAuthSecret()
	if err != nil {
		t.Fatal(err)
	}
	access, err := randomOAuthSecret()
	if err != nil {
		t.Fatal(err)
	}
	refresh, err := randomOAuthSecret()
	if err != nil {
		t.Fatal(err)
	}
	challenge := sha256.Sum256([]byte(oauthTestVerifier))
	encoded := base64.RawURLEncoding.EncodeToString(challenge[:])
	if err := oldStore.PutCode(context.Background(), mcpoauth.Code{
		Hash: oauthHashString(code),
		Binding: mcpoauth.Binding{FamilyID: "phase36-historic-family", ClientID: oauthTestClient,
			Issuer: f.server.URL, Resource: f.server.URL, Scope: legacyOAuthScope},
		RedirectURI: oauthTestRedirect, Challenge: encoded, ExpiresAt: base.Add(5 * time.Minute),
	}, base); err != nil {
		t.Fatal(err)
	}
	_, err = oldStore.ExchangeCode(context.Background(), oauthHashString(code),
		oauthTestClient, oauthTestRedirect, f.server.URL, encoded,
		mcpoauth.Tokens{AccessHash: oauthHashString(access), RefreshHash: oauthHashString(refresh),
			AccessExpiresAt: base.Add(24 * time.Hour), RefreshExpiresAt: base.Add(30 * 24 * time.Hour), AuthMethod: "none"}, base)
	if err != nil {
		t.Fatal(err)
	}
	if err := oldStore.Close(); err != nil {
		t.Fatal(err)
	}
	newStore, err := mcpoauth.Open(f.storePath, fmt.Sprintf("%x", oauthHash(oauthTestAdmin)), f.server.URL, f.server.URL+"/mcp")
	if err != nil {
		t.Fatal(err)
	}
	f.store, f.broker.store = newStore, newStore
	if !f.service.authorized("Bearer " + access) {
		t.Fatal("old resource audience access was lost on migration")
	}
	f.broker.now = func() time.Time { return base.Add(24 * time.Hour) }
	if f.service.authorized("Bearer " + access) {
		t.Fatal("legacy Access expiry was extended")
	}
}
