package mcpserver

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
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

// OAuth delegates UI and login to the existing KG OS Web. A request ID alone
// can neither display a request nor grant permission without Web authentication.
func (o *oauthBroker) validWebBearer(header string) bool {
	if !strings.HasPrefix(header, "Bearer ") || len(header) > 4103 {
		return false
	}
	token := strings.TrimPrefix(header, "Bearer ")
	hash := sha256.Sum256([]byte(token))
	return token != "" && subtle.ConstantTimeCompare(hash[:], o.instanceDigest[:]) == 1
}

func (o *oauthBroker) authenticatedWeb(w http.ResponseWriter, r *http.Request) bool {
	// Reuse the current Web/Runtime Instance authentication contract. Future
	// cross-tab login-state handling belongs to the Web authentication owner.
	if !o.validWebBearer(r.Header.Get("Authorization")) {
		oauthFailure(w, http.StatusUnauthorized, "authentication_required")
		return false
	}
	return true
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
	oauthHeaders(w)
	w.Header().Set("Location", o.issuer+"/?mcp_authorization="+url.QueryEscape(ticket))
	w.WriteHeader(http.StatusSeeOther)
}

func (o *oauthBroker) authorizationDetails(w http.ResponseWriter, r *http.Request) {
	if !o.authenticatedWeb(w, r) {
		return
	}
	requestID := onlyOAuthValue(r.URL.Query(), "request_id")
	if !oauthSecretPattern.MatchString(requestID) {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return
	}
	o.mu.Lock()
	o.pruneLocked()
	pending, ok := o.tickets[oauthHash(requestID)]
	o.mu.Unlock()
	if !ok {
		oauthFailure(w, http.StatusGone, "invalid_request")
		return
	}
	oauthJSON(w, http.StatusOK, map[string]any{
		"client_id": pending.clientID, "client_name": "ChatGPT",
		"resource": pending.resource, "scope": oauthScope,
		"canWrite": true, "expires_at": pending.expires.UTC().Format(time.RFC3339),
	})
}

func (o *oauthBroker) authorizationRedirect(authorization oauthAuthorization, values url.Values) (string, error) {
	redirect, err := url.Parse(authorization.redirectURI)
	if err != nil {
		return "", err
	}
	params := redirect.Query()
	for key, group := range values {
		params.Set(key, group[0])
	}
	params.Set("state", authorization.state)
	params.Set("iss", o.issuer)
	redirect.RawQuery = params.Encode()
	return redirect.String(), nil
}

func (o *oauthBroker) finishAuthorization(w http.ResponseWriter, r *http.Request) {
	operation, decision := "oauth.authorization.decision", "rejected"
	defer func() { observability.Security(r.Context(), operation, decision) }()
	if r.Header.Get("Origin") != o.issuer {
		oauthFailure(w, http.StatusForbidden, "invalid_request")
		return
	}
	if !o.authenticatedWeb(w, r) {
		return
	}
	if r.Header.Get("Content-Type") != "application/json" || r.ContentLength > 1024 {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1025))
	if err != nil || len(body) > 1024 {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return
	}
	var input struct {
		RequestID string `json:"request_id"`
		Decision  string `json:"decision"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF ||
		!oauthSecretPattern.MatchString(input.RequestID) ||
		(input.Decision != "approve" && input.Decision != "deny") {
		oauthFailure(w, http.StatusBadRequest, "invalid_request")
		return
	}
	key := oauthHash(input.RequestID)
	o.mu.Lock()
	o.pruneLocked()
	pending, exists := o.tickets[key]
	if !exists {
		o.mu.Unlock()
		oauthFailure(w, http.StatusGone, "invalid_request")
		return
	}
	if input.Decision == "deny" {
		delete(o.tickets, key)
		o.mu.Unlock()
		target, err := o.authorizationRedirect(pending, url.Values{"error": {"access_denied"}})
		if err != nil {
			oauthFailure(w, 400, "invalid_request")
			return
		}
		operation, decision = "oauth.authorization.deny", "applied"
		oauthJSON(w, 200, map[string]string{"redirect_url": target})
		return
	}
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
	delete(o.tickets, key)
	pending.expires = o.now().Add(codeLifetime)
	o.codes[oauthHash(code)] = pending
	o.mu.Unlock()
	target, err := o.authorizationRedirect(pending, url.Values{"code": {code}})
	if err != nil {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	operation, decision = "oauth.authorization.approve", "applied"
	oauthJSON(w, 200, map[string]string{"redirect_url": target})
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
