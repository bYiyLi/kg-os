package mcpserver

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"html"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func readOAuthForm(w http.ResponseWriter, r *http.Request) (url.Values, bool) {
	kind, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || kind != "application/x-www-form-urlencoded" || (params["charset"] != "" && !strings.EqualFold(params["charset"], "utf-8")) {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return nil, false
	}
	if len(params) > 1 {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return nil, false
	}
	if r.ContentLength > 8192 {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return nil, false
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 8193))
	if err != nil || len(raw) > 8192 {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return nil, false
	}
	form, err := url.ParseQuery(string(raw))
	if err != nil {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return nil, false
	}
	return form, true
}
func (o *oauthBroker) authorizationPage(w http.ResponseWriter, ticket string, invalid bool) {
	oauthHeaders(w)
	// Chromium's same-origin form POST supplies a usable Origin under
	// strict-origin, without leaking authorization query parameters.
	w.Header().Set("Referrer-Policy", "strict-origin")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	status := http.StatusOK
	text := ""
	if invalid {
		status = http.StatusUnauthorized
		text = "<p>Invalid administrator token.</p>"
	}
	w.WriteHeader(status)
	_, _ = io.WriteString(w, `<!doctype html><html lang="en"><meta charset="utf-8"><title>KG OS authorization</title>`+
		`<h1>Authorize ChatGPT to access KG OS</h1>`+
		`<p>This grants access to all four MCP tools, including writes.</p>`+
		`<p>This authorization page expires after five minutes. If it expires, restart authorization from ChatGPT.</p>`+
		text+`<form method="POST" action="/oauth/authorize">`+
		`<input type="hidden" name="ticket" value="`+html.EscapeString(ticket)+`">`+
		`<label>KG OS MCP administrator token <input name="token" type="password" autocomplete="off" required></label>`+
		`<button name="decision" value="approve">Authorize</button>`+
		`<button name="decision" value="deny" formnovalidate>Cancel</button></form></html>`)
}
func (o *oauthBroker) expiredPage(w http.ResponseWriter, r *http.Request) {
	if !strings.Contains(r.Header.Get("Accept"), "text/html") {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	oauthHeaders(w)
	w.Header().Set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusBadRequest)
	_, _ = io.WriteString(w, `<!doctype html><html lang="en"><meta charset="utf-8"><title>KG OS authorization expired</title>`+
		`<h1>Authorization request expired</h1><p>This authorization page is no longer valid. Return to ChatGPT and start the connection authorization again.</p></html>`)
}

func (o *oauthBroker) beginAuthorization(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	clientID := onlyOAuthValue(query, "client_id")
	redirect := onlyOAuthValue(query, "redirect_uri")
	state := onlyOAuthValue(query, "state")
	challenge := onlyOAuthValue(query, "code_challenge")
	if !validOAuthClientID(clientID) || !validOAuthRedirect(redirect) ||
		!oauthVisiblePattern.MatchString(state) || !oauthSecretPattern.MatchString(challenge) ||
		onlyOAuthValue(query, "response_type") != "code" ||
		onlyOAuthValue(query, "code_challenge_method") != "S256" ||
		onlyOAuthValue(query, "resource") != o.resource ||
		(query.Has("scope") && onlyOAuthValue(query, "scope") != oauthScope) {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	redirects, err := o.redirectsFor(r.Context(), clientID)
	if err != nil {
		if err.Error() == "temporarily_unavailable" {
			oauthFailure(w, 429, "temporarily_unavailable")
		} else {
			oauthFailure(w, 400, "invalid_client")
		}
		return
	}
	allowed := false
	for _, candidate := range redirects {
		if candidate == redirect {
			allowed = true
			break
		}
	}
	if !allowed {
		oauthFailure(w, 400, "invalid_client")
		return
	}
	ticket, err := randomOAuthSecret()
	if err != nil {
		oauthFailure(w, 503, "temporarily_unavailable")
		return
	}
	o.mu.Lock()
	o.pruneLocked()
	if len(o.tickets) >= maxPendingOAuth || len(o.codes) >= maxPendingOAuth {
		o.mu.Unlock()
		oauthFailure(w, 429, "temporarily_unavailable")
		return
	}
	o.tickets[oauthHash(ticket)] = oauthAuthorization{
		clientID: clientID, redirectURI: redirect, resource: o.resource, state: state,
		challenge: challenge, expires: o.now().Add(ticketLifetime),
	}
	o.mu.Unlock()
	o.authorizationPage(w, ticket, false)
}

func (o *oauthBroker) redirectAuthorization(w http.ResponseWriter, authorization oauthAuthorization, values url.Values) {
	redirect, err := url.Parse(authorization.redirectURI)
	if err != nil {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	params := redirect.Query()
	for key, group := range values {
		params.Set(key, group[0])
	}
	params.Set("state", authorization.state)
	params.Set("iss", o.issuer)
	redirect.RawQuery = params.Encode()
	oauthHeaders(w)
	w.Header().Set("Location", redirect.String())
	w.WriteHeader(http.StatusFound)
}
func (o *oauthBroker) finishAuthorization(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != o.issuer {
		oauthFailure(w, http.StatusForbidden, "invalid_request")
		return
	}
	form, ok := readOAuthForm(w, r)
	if !ok {
		return
	}
	ticket := onlyOAuthValue(form, "ticket")
	decision := onlyOAuthValue(form, "decision")
	if !oauthSecretPattern.MatchString(ticket) || (decision != "approve" && decision != "deny") {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	key := oauthHash(ticket)
	o.mu.Lock()
	o.pruneLocked()
	pending, exists := o.tickets[key]
	if !exists {
		o.mu.Unlock()
		o.expiredPage(w, r)
		return
	}
	if decision == "deny" {
		delete(o.tickets, key)
		o.mu.Unlock()
		o.redirectAuthorization(w, pending, url.Values{"error": {"access_denied"}})
		return
	}
	supplied := onlyOAuthValue(form, "token")
	candidate := oauthHash(supplied)
	good := supplied != "" && len(supplied) <= 4096 && subtle.ConstantTimeCompare(candidate[:], o.adminDigest[:]) == 1
	if !good {
		pending.failures++
		if pending.failures >= 5 {
			delete(o.tickets, key)
			o.mu.Unlock()
			oauthFailure(w, 429, "access_denied")
			return
		}
		o.tickets[key] = pending
		o.mu.Unlock()
		o.authorizationPage(w, ticket, true)
		return
	}
	delete(o.tickets, key)
	if len(o.codes) >= maxPendingOAuth {
		o.mu.Unlock()
		oauthFailure(w, 503, "temporarily_unavailable")
		return
	}
	code, err := randomOAuthSecret()
	if err != nil {
		o.mu.Unlock()
		oauthFailure(w, 503, "temporarily_unavailable")
		return
	}
	pending.expires = o.now().Add(codeLifetime)
	o.codes[oauthHash(code)] = pending
	o.mu.Unlock()
	o.redirectAuthorization(w, pending, url.Values{"code": {code}})
}

func (o *oauthBroker) issueGrantLocked(grant oauthGrant) (map[string]any, error) {
	o.pruneLocked()
	if len(o.access) >= maxOAuthTokens || len(o.refresh) >= maxOAuthTokens {
		return nil, fmt.Errorf("temporarily_unavailable")
	}
	access, err := randomOAuthSecret()
	if err != nil {
		return nil, err
	}
	refresh, err := randomOAuthSecret()
	if err != nil {
		return nil, err
	}
	accessGrant := grant
	accessGrant.expires = o.now().Add(accessLifetime)
	refreshGrant := grant
	refreshGrant.expires = o.now().Add(refreshLifetime)
	o.access[oauthHash(access)] = accessGrant
	o.refresh[oauthHash(refresh)] = refreshGrant
	return map[string]any{
		"access_token": access, "token_type": "Bearer", "expires_in": int(accessLifetime / time.Second),
		"refresh_token": refresh, "scope": oauthScope,
	}, nil
}
func (o *oauthBroker) issueToken(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "" {
		oauthFailure(w, 401, "invalid_client")
		return
	}
	form, ok := readOAuthForm(w, r)
	if !ok {
		return
	}
	grantType := onlyOAuthValue(form, "grant_type")
	clientID := onlyOAuthValue(form, "client_id")
	resource := onlyOAuthValue(form, "resource")
	if !validOAuthClientID(clientID) || resource != o.resource || form.Has("client_secret") || form.Has("client_assertion") {
		oauthFailure(w, 400, "invalid_client")
		return
	}
	if grantType != "authorization_code" && grantType != "refresh_token" {
		oauthFailure(w, 400, "unsupported_grant_type")
		return
	}
	o.mu.Lock()
	o.pruneLocked()
	grant := oauthGrant{clientID: clientID, issuer: o.issuer, resource: o.resource, scope: oauthScope}
	if grantType == "authorization_code" {
		code := onlyOAuthValue(form, "code")
		redirect := onlyOAuthValue(form, "redirect_uri")
		verifier := onlyOAuthValue(form, "code_verifier")
		if !oauthSecretPattern.MatchString(code) {
			o.mu.Unlock()
			oauthFailure(w, 400, "invalid_grant")
			return
		}
		key := oauthHash(code)
		pending, exists := o.codes[key]
		delete(o.codes, key)
		if !exists || pending.clientID != clientID || pending.resource != resource || pending.redirectURI != redirect ||
			!oauthVerifierPattern.MatchString(verifier) {
			o.mu.Unlock()
			oauthFailure(w, 400, "invalid_grant")
			return
		}
		hash := sha256.Sum256([]byte(verifier))
		expected := base64.RawURLEncoding.EncodeToString(hash[:])
		if subtle.ConstantTimeCompare([]byte(expected), []byte(pending.challenge)) != 1 {
			o.mu.Unlock()
			oauthFailure(w, 400, "invalid_grant")
			return
		}
	} else {
		token := onlyOAuthValue(form, "refresh_token")
		if !oauthSecretPattern.MatchString(token) {
			o.mu.Unlock()
			oauthFailure(w, 400, "invalid_grant")
			return
		}
		key := oauthHash(token)
		previous, exists := o.refresh[key]
		delete(o.refresh, key)
		if !exists || previous.clientID != clientID || previous.issuer != o.issuer || previous.resource != resource || previous.scope != oauthScope {
			o.mu.Unlock()
			oauthFailure(w, 400, "invalid_grant")
			return
		}
		grant = previous
	}
	result, err := o.issueGrantLocked(grant)
	o.mu.Unlock()
	if err != nil {
		oauthFailure(w, 503, "temporarily_unavailable")
		return
	}
	oauthJSON(w, 200, result)
}
