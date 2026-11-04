package mcpserver

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"
)

type oauthSignedFixture struct {
	*oauthFixture
	signing *oauthAuthFixture
}

func newOAuthSignedFixture(t *testing.T) *oauthSignedFixture {
	t.Helper()
	f := newOAuthFixture(t)
	signed := newOAuthAuthFixture(t)
	signed.now = time.Now().UTC().Truncate(time.Second)
	f.broker.now = func() time.Time { return signed.now }
	f.broker.client = &http.Client{Transport: signed.transport}
	f.broker.clientAuth = signed.auth
	return &oauthSignedFixture{oauthFixture: f, signing: signed}
}

func (f *oauthSignedFixture) form(t *testing.T, endpoint, id string, input url.Values) url.Values {
	t.Helper()
	form := make(url.Values, len(input)+2)
	for key, values := range input {
		form[key] = append([]string(nil), values...)
	}
	form.Set("client_id", oauthTestClient)
	form.Set("client_assertion_type", oauthAssertionType)
	form.Set("client_assertion", f.signing.signed(t, f.signing.claims(id, f.server.URL+endpoint), "first"))
	return form
}

func (f *oauthSignedFixture) signedGrant(t *testing.T) map[string]any {
	t.Helper()
	ticket, response := f.begin(url.Values{"scope": {oauthScope + " offline_access"}})
	if response.StatusCode != http.StatusSeeOther {
		t.Fatalf("signed begin: %d", response.StatusCode)
	}
	response.Body.Close()
	response = f.approve(ticket, oauthTestAdmin, f.server.URL)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("signed approve: %d", response.StatusCode)
	}
	callback, err := url.Parse(parseOAuthJSON(t, response)["redirect_url"].(string))
	if err != nil {
		t.Fatal(err)
	}
	form := f.form(t, "/oauth/token", "code-exchange", url.Values{
		"grant_type": {"authorization_code"}, "resource": {f.server.URL}, "code": {callback.Query().Get("code")},
		"redirect_uri": {oauthTestRedirect}, "code_verifier": {oauthTestVerifier},
	})
	response = f.postForm("/oauth/token", form, "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("signed code exchange: %d %#v", response.StatusCode, parseOAuthJSON(t, response))
	}
	return parseOAuthJSON(t, response)
}

func (f *oauthSignedFixture) refreshForm(t *testing.T, refresh, id string) url.Values {
	return f.form(t, "/oauth/token", id, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "resource": {f.server.URL}})
}

func TestOAuthAuthenticatedRefreshRetriesReturnOnePairWithinBothWindows(t *testing.T) {
	f := newOAuthSignedFixture(t)
	grant := f.signedGrant(t)
	old := grant["refresh_token"].(string)
	form := f.refreshForm(t, old, "first-refresh")
	response := f.postForm("/oauth/token", form, "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("signed refresh: %d", response.StatusCode)
	}
	pair := parseOAuthJSON(t, response)
	f.signing.now = f.signing.now.Add(5 * time.Second)
	for index, retry := range []url.Values{form, f.refreshForm(t, old, "new-assertion-same-refresh")} {
		response = f.postForm("/oauth/token", retry, "")
		if response.StatusCode != http.StatusOK {
			t.Fatalf("retry %d: %d", index, response.StatusCode)
		}
		got := parseOAuthJSON(t, response)
		if got["access_token"] != pair["access_token"] || got["refresh_token"] != pair["refresh_token"] {
			t.Fatal("authenticated retry rotated a second time")
		}
	}
	f.signing.now = f.signing.now.Add(6 * time.Second)
	response = f.postForm("/oauth/token", form, "")
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("same assertion accepted after its retry window: %d", response.StatusCode)
	}
	response.Body.Close()
	response = f.postForm("/oauth/token", f.refreshForm(t, old, "fresh-assertion-in-pair-window"), "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("new assertion lost valid pair retry window: %d", response.StatusCode)
	}
	got := parseOAuthJSON(t, response)
	if got["refresh_token"] != pair["refresh_token"] {
		t.Fatal("pair window returned a different generation")
	}
	f.signing.now = f.signing.now.Add(20 * time.Second)
	response = f.postForm("/oauth/token", f.refreshForm(t, old, "after-pair-window"), "")
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("pair retry window did not expire: %d", response.StatusCode)
	}
	response.Body.Close()
}

func TestOAuthSignedRetryNeverReturnsSupersededGenerationOrSurvivesRevocation(t *testing.T) {
	f := newOAuthSignedFixture(t)
	grant := f.signedGrant(t)
	original := grant["refresh_token"].(string)
	response := f.postForm("/oauth/token", f.refreshForm(t, original, "advance-one"), "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("first rotation: %d", response.StatusCode)
	}
	first := parseOAuthJSON(t, response)
	// A none request must not downgrade or consume the signed family.
	response = f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {first["refresh_token"].(string)}}, "")
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("signed family downgraded: %d", response.StatusCode)
	}
	response.Body.Close()
	response = f.postForm("/oauth/token", f.refreshForm(t, first["refresh_token"].(string), "advance-two"), "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("second rotation: %d", response.StatusCode)
	}
	second := parseOAuthJSON(t, response)
	for _, assertionID := range []string{"retry-superseded-first", "retry-superseded-second"} {
		response = f.postForm("/oauth/token", f.refreshForm(t, original, assertionID), "")
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("retry returned superseded pair: %d", response.StatusCode)
		}
		response.Body.Close()
	}
	if !f.service.authorized("Bearer " + second["access_token"].(string)) {
		t.Fatal("stale cache attempt revoked the advanced family")
	}
	// Public authentication cannot revoke a family established by signed auth.
	response = f.postForm("/oauth/revoke", url.Values{"client_id": {oauthTestClient}, "token": {second["refresh_token"].(string)}}, "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("public revocation revealed signed family: %d", response.StatusCode)
	}
	response.Body.Close()
	if !f.service.authorized("Bearer " + second["access_token"].(string)) {
		t.Fatal("public revoke downgraded the signed client binding")
	}
	response = f.postForm("/oauth/revoke", f.form(t, "/oauth/revoke", "signed-revocation", url.Values{"token": {first["refresh_token"].(string)}}), "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("signed revoke: %d", response.StatusCode)
	}
	response.Body.Close()
	response = f.postForm("/oauth/token", f.refreshForm(t, first["refresh_token"].(string), "retry-after-revoke"), "")
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("retry cache bypassed revocation: %d", response.StatusCode)
	}
	response.Body.Close()
	if f.service.authorized("Bearer " + second["access_token"].(string)) {
		t.Fatal("revoked signed family retained access")
	}
}

func TestOAuthConcurrentAuthenticatedRefreshesShareOneGeneration(t *testing.T) {
	f := newOAuthSignedFixture(t)
	grant := f.signedGrant(t)
	old := grant["refresh_token"].(string)
	forms := []url.Values{f.refreshForm(t, old, "parallel-one"), f.refreshForm(t, old, "parallel-two")}
	type answer struct {
		status int
		pair   map[string]any
		err    error
	}
	start := make(chan struct{})
	results := make(chan answer, len(forms))
	for _, form := range forms {
		go func(form url.Values) {
			<-start
			response, err := f.client.PostForm(f.server.URL+"/oauth/token", form)
			if err != nil {
				results <- answer{err: err}
				return
			}
			defer response.Body.Close()
			var pair map[string]any
			err = json.NewDecoder(response.Body).Decode(&pair)
			results <- answer{status: response.StatusCode, pair: pair, err: err}
		}(form)
	}
	close(start)
	first, second := <-results, <-results
	for _, got := range []answer{first, second} {
		if got.err != nil || got.status != http.StatusOK {
			t.Fatalf("concurrent refresh failed: status=%d error=%v", got.status, got.err)
		}
	}
	if first.pair["access_token"] != second.pair["access_token"] || first.pair["refresh_token"] != second.pair["refresh_token"] {
		t.Fatal("parallel signed requests issued competing token generations")
	}
	if !f.service.authorized("Bearer " + first.pair["access_token"].(string)) {
		t.Fatal("parallel retry invalidated its newly issued family")
	}
}

func TestOAuthSignedRefreshRetrySurvivesTransientSQLiteBusy(t *testing.T) {
	f := newOAuthSignedFixture(t)
	grant := f.signedGrant(t)
	original := grant["refresh_token"].(string)
	response := f.postForm("/oauth/token", f.refreshForm(t, original, "before-reply-loss"), "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("initial signed rotation: %d", response.StatusCode)
	}
	pair := parseOAuthJSON(t, response)
	// The server committed R1 -> R2, but the client did not receive that reply.
	// A temporary lookup failure during its retry must not discard the only
	// short-lived record that can recover the same committed token pair.
	db, locked := lockOAuthDatabase(t, f.storePath, "exclusive")
	response = f.postForm("/oauth/token", f.refreshForm(t, original, "retry-during-busy"), "")
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("busy retry misclassified: %d", response.StatusCode)
	}
	if body := parseOAuthJSON(t, response); body["error"] != "server_error" {
		t.Fatalf("busy retry mislabeled credential: %#v", body)
	}
	if err := locked.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	response = f.postForm("/oauth/token", f.refreshForm(t, original, "retry-after-busy"), "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("transient lookup failure destroyed refresh recovery: %d", response.StatusCode)
	}
	recovered := parseOAuthJSON(t, response)
	if recovered["access_token"] != pair["access_token"] || recovered["refresh_token"] != pair["refresh_token"] {
		t.Fatal("recovery issued a different token generation")
	}
	if !f.service.authorized("Bearer " + pair["access_token"].(string)) {
		t.Fatal("recoverable retry revoked the committed family")
	}
}
