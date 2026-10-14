package mcpserver

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	oauthTestClient   = "https://chatgpt.com/oauth/client.json"
	oauthTestRedirect = "https://chatgpt.com/connector_platform_oauth_redirect"
	oauthTestAdmin    = "a-long-unrelated-administrator-secret"
	oauthTestVerifier = "vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv"
)

type oauthFakeTransport struct {
	body     []byte
	requests int
	status   int
}

type oauthBearerTransport struct {
	token string
	base  http.RoundTripper
}

func (b oauthBearerTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	copy := r.Clone(r.Context())
	copy.Header.Set("Authorization", "Bearer "+b.token)
	return b.base.RoundTrip(copy)
}

func (t *oauthFakeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.requests++
	if req.URL.String() != oauthTestClient || req.Method != "GET" {
		return &http.Response{StatusCode: 400, Body: io.NopCloser(strings.NewReader("bad request")), Header: make(http.Header), Request: req}, nil
	}
	status := t.status
	if status == 0 {
		status = 200
	}
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(string(t.body))), Header: make(http.Header), Request: req}, nil
}

type oauthFixture struct {
	t         *testing.T
	broker    *oauthBroker
	service   *Server
	server    *httptest.Server
	client    *http.Client
	metadata  *oauthFakeTransport
	challenge string
}

func newOAuthFixture(t *testing.T) *oauthFixture {
	t.Helper()
	doc := map[string]any{
		"client_id":                             oauthTestClient,
		"redirect_uris":                         []string{oauthTestRedirect},
		"token_endpoint_auth_methods_supported": []string{"none"},
	}
	body, _ := json.Marshal(doc)
	mock := &oauthFakeTransport{body: body}
	f := &oauthFixture{t: t, metadata: mock}
	var handler http.Handler
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { handler.ServeHTTP(w, r) }))
	t.Cleanup(f.server.Close)
	hash := sha256.Sum256([]byte(oauthTestVerifier))
	f.challenge = base64.RawURLEncoding.EncodeToString(hash[:])
	service, err := New(&kernel.Service{}, Options{
		Token: oauthTestAdmin, OAuthIssuer: f.server.URL,
		OAuthClient: &http.Client{Transport: mock}, Path: "/mcp",
	})
	if err != nil {
		t.Fatal(err)
	}
	f.service = service
	f.broker = service.oauth
	mux := http.NewServeMux()
	mux.Handle("/mcp", service.Handler())
	for path, h := range service.OAuthRoutes() {
		mux.Handle(path, h)
	}
	handler = mux
	f.client = &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return f
}

func (f *oauthFixture) get(path string) *http.Response {
	f.t.Helper()
	resp, err := f.client.Get(f.server.URL + path)
	if err != nil {
		f.t.Fatal(err)
	}
	return resp
}
func (f *oauthFixture) postForm(path string, form url.Values, origin string) *http.Response {
	f.t.Helper()
	request, err := http.NewRequest(http.MethodPost, f.server.URL+path, strings.NewReader(form.Encode()))
	if err != nil {
		f.t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	resp, err := f.client.Do(request)
	if err != nil {
		f.t.Fatal(err)
	}
	return resp
}
func parseOAuthJSON(t *testing.T, r *http.Response) map[string]any {
	t.Helper()
	defer r.Body.Close()
	var data map[string]any
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		t.Fatal(err)
	}
	return data
}
func (f *oauthFixture) begin(modify url.Values) (string, *http.Response) {
	f.t.Helper()
	values := url.Values{
		"client_id": {oauthTestClient}, "redirect_uri": {oauthTestRedirect},
		"state": {"opaque-state"}, "response_type": {"code"},
		"code_challenge": {f.challenge}, "code_challenge_method": {"S256"},
		"resource": {f.server.URL}, "scope": {oauthScope},
	}
	for key, entries := range modify {
		values[key] = entries
	}
	result := f.get("/oauth/authorize?" + values.Encode())
	if result.StatusCode != http.StatusSeeOther {
		return "", result
	}
	destination, err := url.Parse(result.Header.Get("Location"))
	if err != nil || destination.Path != "/" || destination.Host != "" && destination.Host != strings.TrimPrefix(f.server.URL, "http://") {
		f.t.Fatalf("authorization did not redirect to Web: %v %s", err, result.Header.Get("Location"))
	}
	return destination.Query().Get("mcp_authorization"), result
}
func (f *oauthFixture) postDecision(requestID, credential, origin, decision string) *http.Response {
	f.t.Helper()
	value, _ := json.Marshal(map[string]string{"request_id": requestID, "decision": decision})
	request, err := http.NewRequest(http.MethodPost, f.server.URL+"/oauth/decision", strings.NewReader(string(value)))
	if err != nil {
		f.t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	if credential != "" {
		request.Header.Set("Authorization", "Bearer "+credential)
	}
	result, err := f.client.Do(request)
	if err != nil {
		f.t.Fatal(err)
	}
	return result
}
func (f *oauthFixture) getDetails(requestID, credential string) *http.Response {
	f.t.Helper()
	request, _ := http.NewRequest(http.MethodGet, f.server.URL+"/oauth/request?request_id="+url.QueryEscape(requestID), nil)
	if credential != "" {
		request.Header.Set("Authorization", "Bearer "+credential)
	}
	response, err := f.client.Do(request)
	if err != nil {
		f.t.Fatal(err)
	}
	return response
}
func (f *oauthFixture) approve(requestID, credential, origin string) *http.Response {
	return f.postDecision(requestID, credential, origin, "approve")
}
func (f *oauthFixture) code() *http.Response {
	f.t.Helper()
	requestID, response := f.begin(nil)
	if response.StatusCode != 303 || requestID == "" {
		f.t.Fatalf("begin: %d / %q", response.StatusCode, requestID)
	}
	response.Body.Close()
	result := f.approve(requestID, oauthTestAdmin, f.server.URL)
	if result.StatusCode != 200 {
		f.t.Fatalf("approve: %d", result.StatusCode)
	}
	redirect := parseOAuthJSON(f.t, result)["redirect_url"].(string)
	return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{redirect}},
		Body: io.NopCloser(strings.NewReader(""))}
}
func (f *oauthFixture) exchange(code, verifier, clientID, resource string) *http.Response {
	f.t.Helper()
	return f.postForm("/oauth/token", url.Values{
		"grant_type": {"authorization_code"}, "client_id": {clientID},
		"redirect_uri": {oauthTestRedirect}, "code": {code},
		"code_verifier": {verifier}, "resource": {resource},
	}, "")
}

func TestGoOAuthAuthorizationAndRefresh(t *testing.T) {
	fixture := newOAuthFixture(t)
	metadata := fixture.get("/.well-known/oauth-protected-resource/mcp")
	if metadata.StatusCode != 200 {
		t.Fatalf("metadata: %d", metadata.StatusCode)
	}
	resource := parseOAuthJSON(t, metadata)
	if resource["resource"] != fixture.server.URL {
		t.Fatalf("resource: %#v", resource)
	}
	root := parseOAuthJSON(t, fixture.get("/.well-known/oauth-protected-resource"))
	if root["resource"] != resource["resource"] {
		t.Fatalf("metadata mismatch")
	}
	config := parseOAuthJSON(t, fixture.get("/.well-known/oauth-authorization-server"))
	if config["issuer"] != fixture.server.URL || config["client_id_metadata_document_supported"] != true {
		t.Fatalf("metadata: %#v", config)
	}
	denied := fixture.get("/mcp")
	if denied.StatusCode != 401 || !strings.Contains(denied.Header.Get("WWW-Authenticate"), fixture.broker.resourceMetadataURL()) {
		t.Fatalf("OAuth challenge: %d %s", denied.StatusCode, denied.Header.Get("WWW-Authenticate"))
	}
	denied.Body.Close()
	codeResponse := fixture.code()
	if codeResponse.StatusCode != 302 {
		t.Fatalf("authorize: %d", codeResponse.StatusCode)
	}
	destination, err := url.Parse(codeResponse.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if destination.Host != "chatgpt.com" || destination.Query().Get("state") != "opaque-state" || destination.Query().Get("iss") != fixture.server.URL {
		t.Fatalf("unsafe authorization redirect: %s", destination.String())
	}
	codeResponse.Body.Close()
	code := destination.Query().Get("code")
	result := fixture.exchange(code, oauthTestVerifier, oauthTestClient, fixture.server.URL)
	if result.StatusCode != 200 {
		t.Fatalf("exchange: %d %#v", result.StatusCode, parseOAuthJSON(t, result))
	}
	grant := parseOAuthJSON(t, result)
	token := grant["access_token"].(string)
	refresh := grant["refresh_token"].(string)
	if !fixture.service.authorized("Bearer " + token) {
		t.Fatal("access token rejected")
	}
	replay := fixture.exchange(code, oauthTestVerifier, oauthTestClient, fixture.server.URL)
	if replay.StatusCode != 400 {
		t.Fatalf("code reused: %d", replay.StatusCode)
	}
	replay.Body.Close()
	rotate := func(refresh string) *http.Response {
		return fixture.postForm("/oauth/token", url.Values{
			"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
			"resource": {fixture.server.URL}, "refresh_token": {refresh},
		}, "")
	}
	response := rotate(refresh)
	if response.StatusCode != 200 {
		t.Fatalf("refresh: %d", response.StatusCode)
	}
	newGrant := parseOAuthJSON(t, response)
	if newGrant["refresh_token"] == refresh || !fixture.service.authorized("Bearer "+newGrant["access_token"].(string)) {
		t.Fatal("refresh did not rotate")
	}
	reused := rotate(refresh)
	if reused.StatusCode != 400 {
		t.Fatalf("refresh reused: %d", reused.StatusCode)
	}
	reused.Body.Close()
	// OAuth sees four business tools and the app-only UI entrypoint.
	client := mcp.NewClient(&mcp.Implementation{Name: "oauth-integration-test", Version: "1"}, nil)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint: fixture.server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: oauthBearerTransport{token: token, base: http.DefaultTransport}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(context.Background(), nil)
	if err != nil || len(tools.Tools) != 5 {
		t.Fatalf("OAuth tool discovery: %#v %v", tools, err)
	}
	names := make(map[string]bool)
	for _, tool := range tools.Tools {
		names[tool.Name] = true
	}
	for _, name := range []string{"kgos_preview", "state_ancestry", "kgos_read", "kgos_run", "kgos_workspace"} {
		if !names[name] {
			t.Fatalf("missing authenticated tool: %s", name)
		}
	}
	t.Logf("OAuth authorization, 4 business tools + UI, refresh rotation and replay protection verified")
}

func TestGoOAuthRejectsUntrustedAndWrongGrants(t *testing.T) {
	f := newOAuthFixture(t)
	bad := []url.Values{
		{"client_id": {"https://evil.example/oauth/client.json"}},
		{"client_id": {"https://chatgpt.com/evil/client.json"}},
		{"redirect_uri": {"https://evil.example/callback"}},
		{"response_type": {"token"}},
		{"code_challenge_method": {"plain"}},
		{"code_challenge": {"short"}},
		{"resource": {"https://other.example"}},
		{"scope": {"kgos:admin"}},
		{"client_id": {oauthTestClient, oauthTestClient}},
	}
	for _, variant := range bad {
		_, res := f.begin(variant)
		if res.StatusCode != 400 {
			t.Fatalf("unexpected authorization response: %d %#v", res.StatusCode, variant)
		}
		res.Body.Close()
	}
	ticket, res := f.begin(nil)
	if res.StatusCode != 303 {
		t.Fatalf("valid authorization rejected")
	}
	res.Body.Close()
	denied := f.approve(ticket, oauthTestAdmin, "https://evil.example")
	if denied.StatusCode != 403 {
		t.Fatalf("forged Origin accepted: %d", denied.StatusCode)
	}
	denied.Body.Close()
	deniedNoAuth := f.approve(ticket, "", f.server.URL)
	if deniedNoAuth.StatusCode != 401 {
		t.Fatalf("unauthenticated approval accepted: %d", deniedNoAuth.StatusCode)
	}
	deniedNoAuth.Body.Close()
	deniedWrongAuth := f.approve(ticket, "wrong", f.server.URL)
	if deniedWrongAuth.StatusCode != 401 {
		t.Fatalf("wrong credential accepted: %d", deniedWrongAuth.StatusCode)
	}
	deniedWrongAuth.Body.Close()
	approved := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if approved.StatusCode != 200 {
		t.Fatalf("valid Instance login rejected: %d", approved.StatusCode)
	}
	approved.Body.Close()
	consumed := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if consumed.StatusCode != 410 {
		t.Fatalf("replay succeeded: %d", consumed.StatusCode)
	}
	consumed.Body.Close()
	codeRedirect := f.code()
	target, _ := url.Parse(codeRedirect.Header.Get("Location"))
	codeRedirect.Body.Close()
	code := target.Query().Get("code")
	wrong := f.exchange(code, "x"+oauthTestVerifier[1:], oauthTestClient, f.server.URL)
	if wrong.StatusCode != 400 {
		t.Fatalf("wrong verifier accepted: %d", wrong.StatusCode)
	}
	wrong.Body.Close()
	replay := f.exchange(code, oauthTestVerifier, oauthTestClient, f.server.URL)
	if replay.StatusCode != 400 {
		t.Fatalf("bad verifier did not consume code: %d", replay.StatusCode)
	}
	replay.Body.Close()
	// Incorrect client metadata must not be trusted; unknown callback is rejected.
	f.metadata.body = []byte(`{"client_id":"https://attacker.example","redirect_uris":["https://chatgpt.com/callback"],"token_endpoint_auth_methods_supported":["none"]}`)
	f.broker.mu.Lock()
	f.broker.documents = make(map[string]cachedOAuthDocument)
	f.broker.mu.Unlock()
	_, untrusted := f.begin(nil)
	if untrusted.StatusCode != 400 {
		t.Fatalf("spoofed CIMD accepted: %d", untrusted.StatusCode)
	}
	untrusted.Body.Close()
}

func TestGoOAuthExpiryAndRestart(t *testing.T) {
	f := newOAuthFixture(t)
	base := time.Now()
	f.broker.now = func() time.Time { return base }
	ticket, page := f.begin(nil)
	page.Body.Close()
	f.broker.now = func() time.Time { return base.Add(ticketLifetime + time.Millisecond) }
	expired := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if expired.StatusCode != 410 {
		t.Fatalf("expired ticket accepted: %d", expired.StatusCode)
	}
	expired.Body.Close()
	f.broker.now = func() time.Time { return base }
	grantRedirect := f.code()
	location, _ := url.Parse(grantRedirect.Header.Get("Location"))
	grantRedirect.Body.Close()
	response := f.exchange(location.Query().Get("code"), oauthTestVerifier, oauthTestClient, f.server.URL)
	if response.StatusCode != 200 {
		t.Fatalf("grant: %d", response.StatusCode)
	}
	result := parseOAuthJSON(t, response)
	access := result["access_token"].(string)
	refresh := result["refresh_token"].(string)
	f.broker.now = func() time.Time { return base.Add(accessLifetime + time.Second) }
	if f.service.authorized("Bearer " + access) {
		t.Fatal("expired access token accepted")
	}
	rotated := f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "resource": {f.server.URL}, "refresh_token": {refresh}}, "")
	if rotated.StatusCode != 200 {
		t.Fatalf("refresh expired too early: %d", rotated.StatusCode)
	}
	rotated.Body.Close()
	f.broker.now = func() time.Time { return base.Add(refreshLifetime + time.Second) }
	old := f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "resource": {f.server.URL}, "refresh_token": {refresh}}, "")
	if old.StatusCode != 400 {
		t.Fatalf("old refresh accepted: %d", old.StatusCode)
	}
	old.Body.Close()
	restarted, err := newOAuthBroker(f.server.URL, "/mcp", oauthTestAdmin, &http.Client{Transport: f.metadata})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := restarted.principal(access); ok {
		t.Fatal("pre-restart access token accepted")
	}
}
