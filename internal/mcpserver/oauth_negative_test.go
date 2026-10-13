package mcpserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestOAuthIssuerAndClientMetadataValidation(t *testing.T) {
	for _, issuer := range []string{"", "foo", "http://example.com", "https://user@example.com",
		"https://example.com/path", "https://example.com?query=1", "https://example.com/#part", "ftp://example.com",
		"https://example.com:443@other.example"} {
		if _, err := newOAuthBroker(issuer, "/mcp", "token", nil); err == nil {
			t.Errorf("accepted issuer %q", issuer)
		}
	}
	for _, issuer := range []string{"https://example.com", "https://example.com/", "http://127.0.0.1:3333", "http://localhost:4000"} {
		if _, err := newOAuthBroker(issuer, "/mcp", "token", nil); err != nil {
			t.Errorf("rejected issuer %q: %v", issuer, err)
		}
	}
	for _, client := range []string{"https://chatgpt.com/oauth/client.json", "https://chatgpt.com/oauth/testing/client.json"} {
		if !validOAuthClientID(client) {
			t.Errorf("rejected trusted URL %q", client)
		}
	}
	for _, client := range []string{"http://chatgpt.com/oauth/client.json", "https://evil.example/oauth/client.json",
		"https://chatgpt.com/oauth/client.json?redirect=https://evil.example", "https://chatgpt.com/oauth/../client.json",
		"https://chatgpt.com/oauth/bad/index.json", "https://alice@chatgpt.com/oauth/client.json"} {
		if validOAuthClientID(client) {
			t.Errorf("trusted forged CIMD %q", client)
		}
	}
	for _, callback := range []string{"http://chatgpt.com/callback", "https://evil.example/", "https://chatgpt.com/#fragment",
		"https://alice@chatgpt.com/oauth/callback", ""} {
		if validOAuthRedirect(callback) {
			t.Errorf("trusted forged callback %q", callback)
		}
	}
}

func TestOAuthRejectsInvalidMetadataAndCapacity(t *testing.T) {
	f := newOAuthFixture(t)
	original := append([]byte(nil), f.metadata.body...)
	cases := []struct {
		body   []byte
		status int
	}{
		{[]byte("not-json"), 200}, {[]byte("{}"), 200},
		{[]byte(`{"client_id":"https://evil.example/oauth/client.json","redirect_uris":["https://chatgpt.com/ok"],"token_endpoint_auth_method":"none"}`), 200},
		{[]byte(`{"client_id":"https://chatgpt.com/oauth/client.json","redirect_uris":["https://evil.example/redirect"],"token_endpoint_auth_method":"none"}`), 200},
		{[]byte(`{"client_id":"https://chatgpt.com/oauth/client.json","redirect_uris":[],"token_endpoint_auth_method":"none"}`), 200},
		{[]byte(`{"client_id":"https://chatgpt.com/oauth/client.json","redirect_uris":["https://chatgpt.com/callback"],"token_endpoint_auth_method":"client_secret_post"}`), 200},
		{[]byte(strings.Repeat("x", maxClientDocumentBytes+1)), 200},
		{original, 301},
		{original, 503},
	}
	for index, test := range cases {
		f.metadata.body = test.body
		f.metadata.status = test.status
		f.broker.mu.Lock()
		f.broker.documents = make(map[string]cachedOAuthDocument)
		f.broker.mu.Unlock()
		_, res := f.begin(nil)
		if res.StatusCode == 200 {
			t.Errorf("untrusted metadata case %d accepted", index)
		}
		res.Body.Close()
	}
	f.metadata.body = original
	f.metadata.status = 0
	ticket, good := f.begin(nil)
	good.Body.Close()
	if ticket == "" {
		t.Fatal("valid client metadata was not accepted")
	}
	counter := f.metadata.requests
	_, cached := f.begin(nil)
	cached.Body.Close()
	if f.metadata.requests != counter {
		t.Fatal("valid trusted CIMD cache not reused")
	}
	f.broker.mu.Lock()
	f.broker.metadataRequests = 8
	f.broker.documents = map[string]cachedOAuthDocument{}
	f.broker.mu.Unlock()
	_, blocked := f.begin(nil)
	if blocked.StatusCode != 429 {
		t.Errorf("metadata concurrency budget: %d", blocked.StatusCode)
	}
	blocked.Body.Close()
	f.broker.mu.Lock()
	f.broker.metadataRequests = 0
	for i := 0; i < maxPendingOAuth; i++ {
		f.broker.codes[oauthHash(fmt.Sprint("synthetic-", i))] = oauthAuthorization{expires: time.Now().Add(time.Hour)}
	}
	f.broker.mu.Unlock()
	_, capped := f.begin(nil)
	if capped.StatusCode != 429 {
		t.Errorf("code authorization budget: %d", capped.StatusCode)
	}
	capped.Body.Close()
}

func TestOAuthAuthorizationPageAndInvalidForms(t *testing.T) {
	f := newOAuthFixture(t)
	for _, path := range []string{"/oauth/token", "/oauth/authorize", "/.well-known/oauth-protected-resource",
		"/.well-known/oauth-authorization-server"} {
		switch path {
		case "/oauth/token":
			res := f.get(path)
			if res.StatusCode != 405 {
				t.Errorf("token GET accepted %d", res.StatusCode)
			}
			res.Body.Close()
		case "/oauth/authorize":
			req, _ := http.NewRequest("PUT", f.server.URL+path, nil)
			res, err := f.client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			if res.StatusCode != 405 {
				t.Errorf("authorize PUT accepted %d", res.StatusCode)
			}
			res.Body.Close()
		default:
			res := f.postForm(path, url.Values{"arbitrary": {"data"}}, "")
			if res.StatusCode != 405 {
				t.Errorf("metadata POST accepted %d", res.StatusCode)
			}
			res.Body.Close()
		}
	}
	ticket, page := f.begin(nil)
	if page.StatusCode != 200 || page.Header.Get("Referrer-Policy") != "strict-origin" ||
		!strings.Contains(page.Header.Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatalf("unsafe authorization page headers: %d", page.StatusCode)
	}
	page.Body.Close()
	for _, bad := range []struct {
		contentType, body string
		origin            string
		status            int
	}{
		{"text/plain", "ticket=" + ticket, f.server.URL, 400},
		{"application/x-www-form-urlencoded", "ticket=" + ticket, "https://evil.example", 403},
		{"application/x-www-form-urlencoded", "ticket=" + ticket, "", 403},
		{"application/x-www-form-urlencoded", strings.Repeat("x", 8193), f.server.URL, 400},
		{"application/x-www-form-urlencoded", "ticket=" + ticket + "&decision=approve&decision=deny", f.server.URL, 400},
		{"application/x-www-form-urlencoded", "ticket=not-a-ticket&decision=approve", f.server.URL, 400},
		{"application/x-www-form-urlencoded", "ticket=" + ticket + "&decision=maybe", f.server.URL, 400},
	} {
		req, _ := http.NewRequest("POST", f.server.URL+"/oauth/authorize", strings.NewReader(bad.body))
		req.Header.Set("Content-Type", bad.contentType)
		if bad.origin != "" {
			req.Header.Set("Origin", bad.origin)
		}
		res, err := f.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != bad.status {
			t.Errorf("bad form %s %q: %d", bad.contentType, bad.body[:min(len(bad.body), 30)], res.StatusCode)
		}
		res.Body.Close()
	}
	denied := f.postForm("/oauth/authorize", url.Values{"ticket": {ticket}, "decision": {"deny"}}, f.server.URL)
	if denied.StatusCode != 302 || !strings.Contains(denied.Header.Get("Location"), "access_denied") {
		t.Fatalf("authorization denial not redirected: %d", denied.StatusCode)
	}
	denied.Body.Close()
	reuse := f.approve(ticket, oauthTestAdmin, f.server.URL)
	if reuse.StatusCode != 400 {
		t.Fatalf("denied ticket replay: %d", reuse.StatusCode)
	}
	reuse.Body.Close()
	expiredTicket, page := f.begin(nil)
	page.Body.Close()
	now := time.Now()
	f.broker.now = func() time.Time { return now.Add(ticketLifetime + time.Second) }
	req, _ := http.NewRequest("POST", f.server.URL+"/oauth/authorize",
		strings.NewReader(url.Values{"ticket": {expiredTicket}, "decision": {"approve"}, "token": {oauthTestAdmin}}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "text/html")
	req.Header.Set("Origin", f.server.URL)
	res, err := f.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 400 || !strings.Contains(string(data), "Return to ChatGPT") {
		t.Fatal("browser expired ticket error not explained")
	}
}

func TestOAuthRejectsForgedTokenGrantsAndRotation(t *testing.T) {
	f := newOAuthFixture(t)
	created := f.code()
	redirect, _ := url.Parse(created.Header.Get("Location"))
	created.Body.Close()
	code := redirect.Query().Get("code")
	valid := url.Values{"grant_type": {"authorization_code"}, "client_id": {oauthTestClient},
		"resource": {f.server.URL}, "code": {code}, "redirect_uri": {oauthTestRedirect}, "code_verifier": {oauthTestVerifier}}
	for _, variant := range []url.Values{
		{"client_secret": {"unauthorized"}},
		{"resource": {"https://another.example"}},
		{"client_id": {"https://evil.example/oauth/client.json"}},
		{"grant_type": {"password"}},
		{"code_verifier": {"short"}},
		{"redirect_uri": {"https://chatgpt.com/not-declared"}},
	} {
		form := url.Values{}
		for k, v := range valid {
			form[k] = append([]string(nil), v...)
		}
		for k, v := range variant {
			form[k] = v
		}
		if onlyOAuthValue(form, "code") != code {
			t.Fatal("code modified")
		}
		res := f.postForm("/oauth/token", form, "")
		if res.StatusCode == 200 {
			t.Errorf("accepted invalid OAuth Token grant: %v", variant)
		}
		res.Body.Close()
		// Wrong client/redirect/verifier consumes the one-time code by design.
		// Obtain a new one before testing each further malformed request.
		created = f.code()
		redirect, _ = url.Parse(created.Header.Get("Location"))
		created.Body.Close()
		code = redirect.Query().Get("code")
		valid.Set("code", code)
	}
	request, _ := http.NewRequest("POST", f.server.URL+"/oauth/token", strings.NewReader(valid.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Authorization", "Basic not-allowed")
	res, err := f.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 401 {
		t.Fatalf("token client authentication accepted: %d", res.StatusCode)
	}
	res.Body.Close()
	granted := f.postForm("/oauth/token", valid, "")
	if granted.StatusCode != 200 {
		t.Fatalf("valid Token grant rejected: %d", granted.StatusCode)
	}
	grant := parseOAuthJSON(t, granted)
	refresh := grant["refresh_token"].(string)
	used := map[string]bool{}
	for i := 0; i < 4; i++ {
		if used[refresh] {
			t.Fatal("repeated refresh issued")
		}
		used[refresh] = true
		response := f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
			"resource": {f.server.URL}, "refresh_token": {refresh}}, "")
		if response.StatusCode != 200 {
			t.Fatalf("rotate %d: %d", i, response.StatusCode)
		}
		next := parseOAuthJSON(t, response)
		refresh = next["refresh_token"].(string)
	}
	old := f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
		"resource": {f.server.URL}, "refresh_token": {grant["refresh_token"].(string)}}, "")
	if old.StatusCode != 400 {
		t.Fatalf("old rotated token replay: %d", old.StatusCode)
	}
	old.Body.Close()
	now := time.Now().Add(refreshLifetime + time.Hour)
	f.broker.now = func() time.Time { return now }
	expired := f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient},
		"resource": {f.server.URL}, "refresh_token": {refresh}}, "")
	if expired.StatusCode != 400 {
		t.Fatalf("expired refresh accepted: %d", expired.StatusCode)
	}
	expired.Body.Close()
}

func TestOAuthBoundedTokenStorageAndResourceMetadata(t *testing.T) {
	f := newOAuthFixture(t)
	for _, path := range []string{"/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp",
		"/.well-known/oauth-authorization-server"} {
		res := f.get(path)
		if res.StatusCode != 200 {
			t.Fatalf("%s: %d", path, res.StatusCode)
		}
		if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("Referrer-Policy") != "no-referrer" {
			t.Fatalf("%s unsafe metadata cache/referrer policy", path)
		}
		if !json.Valid(func() []byte { body, _ := io.ReadAll(res.Body); return body }()) {
			t.Fatal("bad JSON metadata")
		}
		res.Body.Close()
	}
	f.broker.mu.Lock()
	until := time.Now().Add(time.Hour)
	for i := 0; i < maxOAuthTokens; i++ {
		key := oauthHash(strconv.Itoa(i))
		grant := oauthGrant{clientID: oauthTestClient, issuer: f.broker.issuer, resource: f.broker.resource,
			scope: oauthScope, expires: until}
		f.broker.access[key] = grant
		f.broker.refresh[key] = grant
	}
	_, err := f.broker.issueGrantLocked(oauthGrant{clientID: oauthTestClient, issuer: f.broker.issuer,
		resource: f.broker.resource, scope: oauthScope})
	f.broker.mu.Unlock()
	if err == nil {
		t.Fatal("issued more than bounded token storage")
	}
}
