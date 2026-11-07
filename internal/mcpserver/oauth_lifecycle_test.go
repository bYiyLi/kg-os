package mcpserver

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestOAuthScopeSurvivesRefreshWithoutGrantExpansion(t *testing.T) {
	f := newOAuthFixture(t)
	for _, scope := range []string{oauthScope, oauthScope + " offline_access"} {
		grant := f.grant(url.Values{"scope": {scope}})
		if grant["scope"] != scope {
			t.Fatalf("approved scope lost: %#v", grant)
		}
		refresh := grant["refresh_token"].(string)
		form := url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {refresh}}
		// Omitting resource and scope preserves the existing authorization.
		response := f.postForm("/oauth/token", form, "")
		if response.StatusCode != http.StatusOK {
			t.Fatalf("bound refresh without scope/resource failed: %d", response.StatusCode)
		}
		rotated := parseOAuthJSON(t, response)
		if rotated["scope"] != scope {
			t.Fatalf("refresh scope changed: %#v", rotated)
		}
		refresh = rotated["refresh_token"].(string)
		if scope == oauthScope {
			form.Set("refresh_token", refresh)
			form.Set("scope", oauthScope+" offline_access")
			response = f.postForm("/oauth/token", form, "")
			if response.StatusCode != http.StatusBadRequest {
				t.Fatalf("refresh expanded granted scope: %d", response.StatusCode)
			}
			response.Body.Close()
			form.Del("scope")
			response = f.postForm("/oauth/token", form, "")
			if response.StatusCode != http.StatusOK {
				t.Fatalf("invalid scope consumed valid refresh: %d", response.StatusCode)
			}
			response.Body.Close()
		}
	}
	for _, scope := range []string{"offline_access", "kgos:access arbitrary"} {
		_, response := f.begin(url.Values{"scope": {scope}})
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid scope accepted: %q: %d", scope, response.StatusCode)
		}
		response.Body.Close()
	}
}

func TestOAuthRevocationAcceptsConsumedRefreshAndIsFamilyScoped(t *testing.T) {
	f := newOAuthFixture(t)
	first, other := f.grant(nil), f.grant(nil)
	oldRefresh := first["refresh_token"].(string)
	response := f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {oldRefresh}}, "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("refresh: %d", response.StatusCode)
	}
	current := parseOAuthJSON(t, response)
	response = f.postForm("/oauth/revoke", url.Values{"client_id": {oauthTestClient}, "token": {oldRefresh}, "token_type_hint": {"refresh_token"}}, "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("revoke consumed refresh: %d", response.StatusCode)
	}
	response.Body.Close()
	if f.service.authorized("Bearer "+first["access_token"].(string)) || f.service.authorized("Bearer "+current["access_token"].(string)) {
		t.Fatal("revoked family retained access")
	}
	if !f.service.authorized("Bearer " + other["access_token"].(string)) {
		t.Fatal("revocation affected another grant family")
	}
	response = f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {current["refresh_token"].(string)}}, "")
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("revoked refresh rotated: %d", response.StatusCode)
	}
	response.Body.Close()
	for _, token := range []string{oldRefresh, strings.Repeat("q", 43)} {
		response = f.postForm("/oauth/revoke", url.Values{"client_id": {oauthTestClient}, "token": {token}}, "")
		if response.StatusCode != http.StatusOK {
			t.Fatalf("revocation leaked invalid/revoked credential status: %d", response.StatusCode)
		}
		response.Body.Close()
	}
}

func TestOAuthStoreFailurePreservesRootBearerAndDiscovery(t *testing.T) {
	f := newOAuthFixture(t)
	grant := f.grant(nil)
	if err := f.store.Close(); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"} {
		response := f.get(path)
		if response.StatusCode != http.StatusOK {
			t.Fatalf("store failure hid discovery: %s: %d", path, response.StatusCode)
		}
		response.Body.Close()
	}
	for _, item := range []struct {
		token     string
		status    int
		challenge bool
	}{
		{oauthTestAdmin, http.StatusMethodNotAllowed, false},
		{grant["access_token"].(string), http.StatusServiceUnavailable, false},
		{"", http.StatusUnauthorized, true},
	} {
		request, _ := http.NewRequest(http.MethodGet, f.server.URL+"/mcp", nil)
		if item.token != "" {
			request.Header.Set("Authorization", "Bearer "+item.token)
		}
		response, err := f.client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != item.status {
			t.Fatalf("store failure token class produced %d, want %d", response.StatusCode, item.status)
		}
		if got := response.Header.Get("WWW-Authenticate"); (got != "") != item.challenge {
			t.Fatalf("server failure mislabeled credential: status=%d challenge=%q", response.StatusCode, got)
		}
		response.Body.Close()
	}
	response := f.postForm("/oauth/token", url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {grant["refresh_token"].(string)}}, "")
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("database failure discarded refresh credential: %d", response.StatusCode)
	}
	if payload := parseOAuthJSON(t, response); payload["error"] != "server_error" {
		t.Fatalf("database failure mislabeled refresh credential: %#v", payload)
	}
	response = f.postForm("/oauth/revoke", url.Values{"client_id": {oauthTestClient}, "token": {grant["refresh_token"].(string)}}, "")
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("revocation store failure returned %d", response.StatusCode)
	}
	if payload := parseOAuthJSON(t, response); payload["error"] != "server_error" {
		t.Fatalf("database failure mislabeled revocation: %#v", payload)
	}
}

func TestOAuthInvalidTokenChallengeDiffersFromMissingCredential(t *testing.T) {
	f := newOAuthFixture(t)
	for _, token := range []string{"", strings.Repeat("q", 43)} {
		request, _ := http.NewRequest(http.MethodGet, f.server.URL+"/mcp", nil)
		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
		response, err := f.client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("credential failure returned %d", response.StatusCode)
		}
		challenge := response.Header.Get("WWW-Authenticate")
		if strings.Contains(challenge, "invalid_token") != (token != "") {
			t.Fatalf("incorrect refresh signal: %q", challenge)
		}
		response.Body.Close()
	}
}

func TestOAuthSQLiteBusyPreservesRefreshAndRecoversAccess(t *testing.T) {
	f := newOAuthFixture(t)
	grant := f.grant(nil)
	access, refresh := grant["access_token"].(string), grant["refresh_token"].(string)
	db, locked := lockOAuthDatabase(t, f.storePath, "immediate")
	if !f.service.authorized("Bearer " + access) {
		t.Fatal("reserved write lock invalidated existing access")
	}
	form := url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {refresh}}
	response := f.postForm("/oauth/token", form, "")
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("SQLite busy misclassified: %d", response.StatusCode)
	}
	if body := parseOAuthJSON(t, response); body["error"] != "server_error" {
		t.Fatalf("SQLite busy discarded credential: %#v", body)
	}
	if err := locked.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if !f.service.authorized("Bearer " + access) {
		t.Fatal("failed rotation consumed existing access")
	}
	response = f.postForm("/oauth/token", form, "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("busy transaction consumed original refresh: %d", response.StatusCode)
	}
	current := parseOAuthJSON(t, response)
	if current["refresh_token"] == refresh {
		t.Fatal("recovered refresh did not rotate")
	}
	db, locked = lockOAuthDatabase(t, f.storePath, "exclusive")
	request, _ := http.NewRequest(http.MethodGet, f.server.URL+"/mcp", nil)
	request.Header.Set("Authorization", "Bearer "+access)
	response, err := f.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusServiceUnavailable || response.Header.Get("WWW-Authenticate") != "" {
		t.Fatalf("SQLite read failure misreported credential: status=%d challenge=%q", response.StatusCode, response.Header.Get("WWW-Authenticate"))
	}
	response.Body.Close()
	if err := locked.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	response, err = f.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("original access did not recover after SQLite busy: %d", response.StatusCode)
	}
	response.Body.Close()
}

func TestOAuthFailureDiagnosticsUseStaticCategoriesWithoutCredentials(t *testing.T) {
	f := newOAuthFixture(t)
	grant := f.grant(nil)
	var output bytes.Buffer
	observer, err := observability.New(&output, "DEBUG")
	if err != nil {
		t.Fatal(err)
	}
	const privateDriverMessage = "driver-secret-private-diagnostic"
	const privateRefresh = "refresh-secret-private-value"
	const privateAssertion = "assertion-secret-private-value"
	f.broker.storeErr = errors.New(privateDriverMessage)
	for _, path := range []string{"/oauth/token", "/oauth/revoke"} {
		ctx, _, err := observability.WithRequest(context.Background(), observer)
		if err != nil {
			t.Fatal(err)
		}
		form := url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {privateRefresh}, "token": {privateRefresh}, "client_assertion": {privateAssertion}}
		request := httptest.NewRequest(http.MethodPost, f.server.URL+path, strings.NewReader(form.Encode())).WithContext(ctx)
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		response := httptest.NewRecorder()
		f.broker.serveHTTP(response, request)
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("store unavailable returned %d", response.Code)
		}
		var body map[string]any
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body["error"] != "server_error" {
			t.Fatalf("backend failure lost OAuth error class: %#v", body)
		}
	}
	f.broker.storeErr = nil
	for attempt := 0; attempt < 2; attempt++ {
		ctx, _, err := observability.WithRequest(context.Background(), observer)
		if err != nil {
			t.Fatal(err)
		}
		form := url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {grant["refresh_token"].(string)}}
		request := httptest.NewRequest(http.MethodPost, f.server.URL+"/oauth/token", strings.NewReader(form.Encode())).WithContext(ctx)
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		response := httptest.NewRecorder()
		f.broker.serveHTTP(response, request)
		want := http.StatusOK
		if attempt == 1 {
			want = http.StatusBadRequest
		}
		if response.Code != want {
			t.Fatalf("replay diagnostic setup returned %d, want %d", response.Code, want)
		}
	}
	if err := f.store.Close(); err != nil {
		t.Fatal(err)
	}
	ctx, _, err := observability.WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	form := url.Values{"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "refresh_token": {grant["refresh_token"].(string)}}
	request := httptest.NewRequest(http.MethodPost, f.server.URL+"/oauth/token", strings.NewReader(form.Encode())).WithContext(ctx)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	f.broker.serveHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("opened backend failure returned %d", response.Code)
	}
	raw := output.String()
	for _, secret := range []string{privateDriverMessage, privateRefresh, privateAssertion, oauthTestAdmin, oauthTestVerifier, grant["access_token"].(string), grant["refresh_token"].(string)} {
		if strings.Contains(raw, secret) {
			t.Fatal("OAuth failure diagnostics leaked a credential or raw driver error")
		}
	}
	count := 0
	causes := map[string]int{}
	for _, line := range strings.Split(strings.TrimSpace(raw), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatal(err)
		}
		if record["event"] != "oauth.request.failed" {
			continue
		}
		count++
		if cause, ok := record["cause_class"].(string); ok {
			causes[cause]++
		}
		if record["cause_class"] == "" || record["cause_class"] == nil || record["error_code"] == "" || record["error_code"] == nil || record["request_id"] == nil {
			t.Fatalf("failure diagnosis lacks safe classification/request correlation: %#v", record)
		}
		if record["error"] != nil || record["details"] != nil {
			t.Fatalf("failure log includes unrestricted error payload: %#v", record)
		}
	}
	if count != 4 || causes["store_unavailable"] != 2 || causes["backend"] != 1 || causes["replay"] != 1 {
		t.Fatalf("missing safely classified OAuth failures: %q", raw)
	}
}

func lockOAuthDatabase(t *testing.T, path, mode string) (*sql.DB, *sql.Tx) {
	t.Helper()
	uri := url.URL{Scheme: "file", Path: path}
	options := uri.Query()
	options.Set("_txlock", mode)
	options.Set("_busy_timeout", "1000")
	uri.RawQuery = options.Encode()
	db, err := sql.Open("sqlite3", uri.String())
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })
	return db, tx
}

func TestOAuthAccessLifetimeIs15MinutesForIssuanceAndRefresh(t *testing.T) {
	f := newOAuthFixture(t)
	issued := time.Date(2026, time.November, 4, 0, 0, 0, 123, time.UTC)
	f.broker.now = func() time.Time { return issued }
	grant := f.grant(nil)
	if grant["expires_in"] != float64(840) {
		t.Fatalf("authorization-code response did not preserve one-minute refresh margin: %#v", grant)
	}
	checkLifetime := func(token string, created time.Time) {
		t.Helper()
		for _, elapsed := range []time.Duration{time.Minute + time.Second, 15*time.Minute - time.Nanosecond, 15 * time.Minute} {
			at := created.Add(elapsed)
			f.broker.now = func() time.Time { return at }
			request, err := http.NewRequest(http.MethodGet, f.server.URL+"/mcp", nil)
			if err != nil {
				t.Fatal(err)
			}
			request.Header.Set("Authorization", "Bearer "+token)
			response, err := f.client.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			challenge := response.Header.Get("WWW-Authenticate")
			response.Body.Close()
			want := http.StatusMethodNotAllowed
			if elapsed == 15*time.Minute {
				want = http.StatusUnauthorized
			}
			if response.StatusCode != want {
				t.Fatalf("access acceptance at %v: got %d, want %d", elapsed, response.StatusCode, want)
			}
			if (want == http.StatusUnauthorized) != strings.Contains(challenge, "invalid_token") {
				t.Fatalf("access expiry recovery signal at %v: %q", elapsed, challenge)
			}
		}
	}
	checkLifetime(grant["access_token"].(string), issued)
	renewedAt := issued.Add(15 * time.Minute)
	f.broker.now = func() time.Time { return renewedAt }
	response := f.postForm("/oauth/token", url.Values{
		"grant_type": {"refresh_token"}, "client_id": {oauthTestClient}, "resource": {f.server.URL + "/mcp"},
		"refresh_token": {grant["refresh_token"].(string)},
	}, "")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("refresh after access expiry: %d", response.StatusCode)
	}
	renewed := parseOAuthJSON(t, response)
	if renewed["expires_in"] != float64(840) {
		t.Fatalf("refresh response did not preserve one-minute refresh margin: %#v", renewed)
	}
	checkLifetime(renewed["access_token"].(string), renewedAt)
}
