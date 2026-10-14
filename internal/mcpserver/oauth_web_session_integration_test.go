package mcpserver_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/mcpserver"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

const consentClientID = "https://chatgpt.com/oauth/client.json"
const consentRedirectURI = "https://chatgpt.com/connector_platform_oauth_redirect"

type consentCIMDTransport struct{ body []byte }

func (t consentCIMDTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.String() != consentClientID || req.Method != http.MethodGet {
		return nil, fmt.Errorf("unexpected client metadata lookup")
	}
	return &http.Response{
		StatusCode: http.StatusOK, Request: req, Header: make(http.Header),
		ContentLength: int64(len(t.body)), Body: io.NopCloser(bytes.NewReader(t.body)),
	}, nil
}

// Real daemon Web login -> restored Session Bearer -> protected MCP OAuth
// decision. The Session is validated by the existing daemon middleware,
// not by a second OAuth login or administrator-token form.
func TestOAuthConsentReusesAuthenticatedWebSession(t *testing.T) {
	t.Parallel()
	const instanceToken = "phase17-isolated-instance-root-credential"
	doc, err := json.Marshal(map[string]any{
		"client_id": consentClientID, "redirect_uris": []string{consentRedirectURI},
		"token_endpoint_auth_methods_supported": []string{"none"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var handler http.Handler
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.ServeHTTP(w, r)
	}))
	defer server.Close()
	service, err := mcpserver.New(&kernel.Service{}, mcpserver.Options{
		Token: instanceToken, Path: "/mcp", OAuthIssuer: server.URL,
		OAuthClient: &http.Client{Transport: consentCIMDTransport{body: doc}},
	})
	if err != nil {
		t.Fatal(err)
	}
	runtime := &runtimehost.Runtime{
		Paths:      runtimeprofile.Paths{Root: t.TempDir()},
		Credential: runtimeprofile.Credential{Token: instanceToken},
		Kernel:     &kernel.Service{},
	}
	routes := []daemon.ExtraRoute{{Path: "/mcp", Handler: service.Handler()}}
	for path, endpoint := range service.OAuthRoutes() {
		routes = append(routes, daemon.ExtraRoute{Path: path, Handler: endpoint})
	}
	handler = daemon.NewHandler(runtime, http.NotFoundHandler(), routes...)
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	send := func(method, path string, data io.Reader, bearer, origin, boot string, cookie *http.Cookie) *http.Response {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+path, data)
		if err != nil {
			t.Fatal(err)
		}
		if bearer != "" {
			req.Header.Set("Authorization", "Bearer "+bearer)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if boot != "" {
			req.Header.Set("X-KGOS-Expected-Daemon-Boot", boot)
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if method == http.MethodPost && data != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return response
	}
	decode := func(response *http.Response) map[string]any {
		t.Helper()
		defer response.Body.Close()
		var value map[string]any
		if err := json.NewDecoder(response.Body).Decode(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	login := send(http.MethodPost, "/api/v1/web/auth/login", nil, instanceToken, server.URL, "", nil)
	if login.StatusCode != http.StatusOK || len(login.Cookies()) != 1 {
		t.Fatalf("Web login: %d", login.StatusCode)
	}
	cookie := login.Cookies()[0]
	access := decode(login)
	webToken, _ := access["accessToken"].(string)
	boot, _ := access["daemonBootId"].(string)
	if !strings.HasPrefix(webToken, "kgws_") || boot == "" || webToken == instanceToken {
		t.Fatal("Web login did not issue isolated session credentials")
	}
	restored := send(http.MethodPost, "/api/v1/web/auth/session", nil, "", server.URL, "", cookie)
	if restored.StatusCode != http.StatusOK {
		t.Fatalf("reusing a Web session in another tab failed: %d", restored.StatusCode)
	}
	access = decode(restored)
	webToken, _ = access["accessToken"].(string)
	boot, _ = access["daemonBootId"].(string)

	verifier := strings.Repeat("v", 43)
	challenge := sha256.Sum256([]byte(verifier))
	query := url.Values{
		"client_id": {consentClientID}, "redirect_uri": {consentRedirectURI},
		"state": {"expected-state"}, "response_type": {"code"},
		"code_challenge":        {base64.RawURLEncoding.EncodeToString(challenge[:])},
		"code_challenge_method": {"S256"}, "resource": {server.URL}, "scope": {"kgos:access"},
	}
	start := send(http.MethodGet, "/oauth/authorize?"+query.Encode(), nil, "", "", "", nil)
	if start.StatusCode != http.StatusSeeOther {
		t.Fatalf("OAuth did not redirect into the existing Web: %d", start.StatusCode)
	}
	target, err := url.Parse(start.Header.Get("Location"))
	start.Body.Close()
	if err != nil || target.Host != strings.TrimPrefix(server.URL, "http://") ||
		target.Path != "/" || target.Query().Get("mcp_authorization") == "" {
		t.Fatal("OAuth redirect escaped the current Web application")
	}
	requestID := target.Query().Get("mcp_authorization")
	detailsURL := "/oauth/request?request_id=" + url.QueryEscape(requestID)
	for _, item := range []struct {
		name, bearer, boot string
		cookie             *http.Cookie
		want               int
	}{
		{"cookie-alone", "", "", cookie, http.StatusUnauthorized},
		{"missing-boot", webToken, "", nil, http.StatusUnauthorized},
		{"stale-boot", webToken, "other-boot", nil, http.StatusConflict},
		{"wrong-bearer", "wrong", boot, nil, http.StatusUnauthorized},
		{"restored-session", webToken, boot, nil, http.StatusOK},
	} {
		t.Run(item.name, func(t *testing.T) {
			response := send(http.MethodGet, detailsURL, nil, item.bearer, "", item.boot, item.cookie)
			if response.StatusCode != item.want {
				t.Fatalf("details status: got %d expected %d", response.StatusCode, item.want)
			}
			response.Body.Close()
		})
	}

	decision := func(id, bearer, origin, expectedBoot, action string) *http.Response {
		body, _ := json.Marshal(map[string]string{"request_id": id, "decision": action})
		return send(http.MethodPost, "/oauth/decision", bytes.NewReader(body), bearer, origin, expectedBoot, nil)
	}
	for _, rejected := range []struct {
		name, bearer, origin, boot string
		want                       int
	}{
		{"missing-web-login", "", server.URL, boot, http.StatusUnauthorized},
		{"forged-origin", webToken, "https://evil.example", boot, http.StatusForbidden},
		{"stale-page", webToken, server.URL, "old-boot", http.StatusConflict},
	} {
		t.Run(rejected.name, func(t *testing.T) {
			response := decision(requestID, rejected.bearer, rejected.origin, rejected.boot, "approve")
			if response.StatusCode != rejected.want {
				t.Fatalf("approval status: got %d expected %d", response.StatusCode, rejected.want)
			}
			response.Body.Close()
		})
	}
	approved := decision(requestID, webToken, server.URL, boot, "approve")
	if approved.StatusCode != http.StatusOK {
		t.Fatalf("authenticated Web approval: %d", approved.StatusCode)
	}
	callback, err := url.Parse(decode(approved)["redirect_url"].(string))
	if err != nil || callback.Host != "chatgpt.com" ||
		callback.Query().Get("state") != "expected-state" || callback.Query().Get("code") == "" {
		t.Fatal("approved code did not return through the verified ChatGPT callback")
	}
	code := callback.Query().Get("code")
	replayed := decision(requestID, webToken, server.URL, boot, "approve")
	if replayed.StatusCode != http.StatusGone {
		t.Fatalf("approval request replay accepted: %d", replayed.StatusCode)
	}
	replayed.Body.Close()
	form := url.Values{
		"grant_type": {"authorization_code"}, "client_id": {consentClientID},
		"redirect_uri": {consentRedirectURI}, "code": {code},
		"code_verifier": {verifier}, "resource": {server.URL},
	}
	req, err := http.NewRequest(http.MethodPost, server.URL+"/oauth/token", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	exchanged, err := client.Do(req)
	if err != nil || exchanged.StatusCode != http.StatusOK {
		t.Fatalf("OAuth code exchange failed: %v / %v", err, exchanged)
	}
	grant := decode(exchanged)
	oauthToken, _ := grant["access_token"].(string)
	if oauthToken == "" || oauthToken == webToken || oauthToken == instanceToken {
		t.Fatal("OAuth access token has invalid identity")
	}
	mcpWebToken := send(http.MethodGet, "/mcp", nil, webToken, "", "", nil)
	if mcpWebToken.StatusCode != http.StatusUnauthorized {
		t.Fatalf("Web bearer directly accessed MCP: %d", mcpWebToken.StatusCode)
	}
	mcpWebToken.Body.Close()
	mcpOAuth := send(http.MethodGet, "/mcp", nil, oauthToken, "", "", nil)
	if mcpOAuth.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("OAuth token cannot authenticate MCP: %d", mcpOAuth.StatusCode)
	}
	mcpOAuth.Body.Close()
	apiOAuth := send(http.MethodPost, "/api/v1/web/data/info",
		strings.NewReader("{}"), oauthToken, "", "", nil)
	if apiOAuth.StatusCode != http.StatusUnauthorized {
		t.Fatalf("OAuth token accessed private API: %d", apiOAuth.StatusCode)
	}
	apiOAuth.Body.Close()

	second := send(http.MethodGet, "/oauth/authorize?"+query.Encode(), nil, "", "", "", nil)
	secondURL, err := url.Parse(second.Header.Get("Location"))
	second.Body.Close()
	if err != nil || secondURL.Query().Get("mcp_authorization") == "" {
		t.Fatal("cannot create a second pending authorization")
	}
	logout := send(http.MethodPost, "/api/v1/web/auth/logout", nil, "", server.URL, "", cookie)
	if logout.StatusCode != http.StatusNoContent {
		t.Fatalf("Web logout failed: %d", logout.StatusCode)
	}
	logout.Body.Close()
	afterLogout := decision(secondURL.Query().Get("mcp_authorization"), webToken, server.URL, boot, "approve")
	if afterLogout.StatusCode != http.StatusUnauthorized {
		t.Fatalf("logged-out browser could approve OAuth: %d", afterLogout.StatusCode)
	}
	afterLogout.Body.Close()
}
