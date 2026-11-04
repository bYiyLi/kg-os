package mcpserver

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/mcpoauth"
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
	if len(header) > 4103 {
		return false
	}
	fields := strings.Fields(header)
	if len(fields) != 2 || !strings.EqualFold(fields[0], "Bearer") {
		return false
	}
	token := fields[1]
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
	scope, validScope := normalizeOAuthScope(onlyOAuthValue(query, "scope"))
	if !validOAuthClientID(clientID) || !validOAuthRedirect(redirect) ||
		!oauthVisiblePattern.MatchString(state) || !oauthSecretPattern.MatchString(challenge) ||
		onlyOAuthValue(query, "response_type") != "code" ||
		onlyOAuthValue(query, "code_challenge_method") != "S256" ||
		onlyOAuthValue(query, "resource") != o.resource ||
		!validScope || (query.Has("scope") && len(query["scope"]) != 1) {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	redirects, err := o.redirectsFor(r.Context(), clientID)
	if err != nil {
		if errors.Is(err, errOAuthClientUnavailable) {
			oauthFailure(w, 503, "temporarily_unavailable")
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
	if len(o.tickets) >= maxPendingOAuth {
		o.mu.Unlock()
		oauthFailure(w, 429, "temporarily_unavailable")
		return
	}
	o.tickets[oauthHash(ticket)] = oauthAuthorization{
		clientID: clientID, redirectURI: redirect, resource: o.resource, state: state,
		challenge: challenge, scope: scope, expires: o.now().Add(ticketLifetime),
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
		"resource": pending.resource, "scope": pending.scope,
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
	code, err := randomOAuthSecret()
	if err != nil {
		o.mu.Unlock()
		oauthFailure(w, 503, "temporarily_unavailable")
		return
	}
	family, err := randomOAuthSecret()
	if err != nil {
		o.mu.Unlock()
		oauthFailure(w, 503, "temporarily_unavailable")
		return
	}
	err = o.store.PutCode(r.Context(), mcpoauth.Code{
		Hash:        oauthHashString(code),
		Binding:     mcpoauth.Binding{FamilyID: family, ClientID: pending.clientID, Issuer: o.issuer, Resource: pending.resource, Scope: pending.scope},
		RedirectURI: pending.redirectURI, Challenge: pending.challenge, ExpiresAt: o.now().Add(codeLifetime),
	}, o.now())
	if err != nil {
		o.mu.Unlock()
		oauthFailure(w, 503, "temporarily_unavailable")
		return
	}
	delete(o.tickets, key)
	o.mu.Unlock()
	target, err := o.authorizationRedirect(pending, url.Values{"code": {code}})
	if err != nil {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	operation, decision = "oauth.authorization.approve", "applied"
	oauthJSON(w, 200, map[string]string{"redirect_url": target})
}

func (o *oauthBroker) newPair(method string) (oauthTokenPair, mcpoauth.Tokens, error) {
	access, err := randomOAuthSecret()
	if err != nil {
		return oauthTokenPair{}, mcpoauth.Tokens{}, err
	}
	refresh, err := randomOAuthSecret()
	if err != nil {
		return oauthTokenPair{}, mcpoauth.Tokens{}, err
	}
	now := o.now()
	return oauthTokenPair{AccessToken: access, RefreshToken: refresh},
		mcpoauth.Tokens{AccessHash: oauthHashString(access), RefreshHash: oauthHashString(refresh),
			AccessExpiresAt: now.Add(accessLifetime), RefreshExpiresAt: now.Add(refreshLifetime), AuthMethod: method}, nil
}

func (o *oauthBroker) authenticateClient(w http.ResponseWriter, r *http.Request, form url.Values, endpoint string) (string, bool) {
	for _, values := range form {
		if len(values) != 1 {
			oauthFailure(w, 400, "invalid_request")
			return "", false
		}
	}
	if !validOAuthClientID(onlyOAuthValue(form, "client_id")) {
		oauthFailure(w, 401, "invalid_client")
		return "", false
	}
	method, err := o.clientAuth.Authenticate(r.Context(), onlyOAuthValue(form, "client_id"), endpoint, form, r.Header.Get("Authorization"))
	if err != nil {
		if errors.Is(err, errOAuthClientUnavailable) {
			oauthServerFailure(w, r, "client_verification_unavailable")
		} else {
			oauthDiagnostic(r, "invalid_client", "client_authentication")
			oauthFailure(w, 401, "invalid_client")
		}
		return "", false
	}
	return method, true
}

func (o *oauthBroker) tokenFailure(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, mcpoauth.ErrInvalidGrant) || errors.Is(err, mcpoauth.ErrInvalidToken) {
		oauthDiagnostic(r, "invalid_grant", mcpoauth.Cause(err))
		oauthFailure(w, 400, "invalid_grant")
	} else {
		oauthServerFailure(w, r, mcpoauth.Cause(err))
	}
}

func (o *oauthBroker) issueToken(w http.ResponseWriter, r *http.Request) {
	form, ok := readOAuthForm(w, r)
	if !ok {
		return
	}
	grantType := onlyOAuthValue(form, "grant_type")
	if grantType != "authorization_code" && grantType != "refresh_token" {
		oauthFailure(w, 400, "unsupported_grant_type")
		return
	}
	resource := onlyOAuthValue(form, "resource")
	if (grantType == "authorization_code" && resource != o.resource) || (resource != "" && resource != o.resource) {
		oauthFailure(w, 400, "invalid_target")
		return
	}
	method, ok := o.authenticateClient(w, r, form, o.issuer+"/oauth/token")
	if !ok {
		return
	}
	clientID := onlyOAuthValue(form, "client_id")
	o.tokenMu.Lock()
	defer o.tokenMu.Unlock()
	now := o.now()
	for key, entry := range o.retries {
		if !entry.expires.After(now) {
			delete(o.retries, key)
		}
	}
	if grantType == "authorization_code" {
		code, verifier := onlyOAuthValue(form, "code"), onlyOAuthValue(form, "code_verifier")
		if !oauthSecretPattern.MatchString(code) || !oauthVerifierPattern.MatchString(verifier) {
			oauthFailure(w, 400, "invalid_grant")
			return
		}
		if form.Has("scope") {
			oauthFailure(w, 400, "invalid_request")
			return
		}
		pair, tokens, err := o.newPair(method)
		if err != nil {
			oauthServerFailure(w, r, "entropy")
			return
		}
		sum := sha256.Sum256([]byte(verifier))
		binding, err := o.store.ExchangeCode(r.Context(), oauthHashString(code), clientID, onlyOAuthValue(form, "redirect_uri"),
			resource, base64.RawURLEncoding.EncodeToString(sum[:]), tokens, now)
		if err != nil {
			o.tokenFailure(w, r, err)
			return
		}
		pair.Scope = binding.Scope
		oauthJSON(w, 200, pair.response())
		return
	}
	refresh := onlyOAuthValue(form, "refresh_token")
	if !oauthSecretPattern.MatchString(refresh) {
		oauthFailure(w, 400, "invalid_grant")
		return
	}
	requestedScope := onlyOAuthValue(form, "scope")
	if requestedScope != "" {
		normalized, valid := normalizeOAuthScope(requestedScope)
		if !valid {
			oauthFailure(w, 400, "invalid_scope")
			return
		}
		requestedScope = normalized
	}
	key := oauthHash(refresh)
	if method == "private_key_jwt" {
		if previous, found := o.retries[key]; found {
			if previous.clientID != clientID || (resource != "" && resource != previous.resource) || previous.requestedScope != requestedScope {
				oauthDiagnostic(r, "invalid_grant", "retry_binding")
				oauthFailure(w, 400, "invalid_grant")
				return
			}
			binding, err := o.store.CurrentRefresh(r.Context(), oauthHashString(previous.pair.RefreshToken), clientID, resource, now)
			if err != nil {
				// Retain the signed retry marker until its original expiry. A
				// transient backend failure must not turn the next retry into
				// a strict replay that revokes the successfully rotated family.
				o.tokenFailure(w, r, err)
				return
			}
			if binding.FamilyID != previous.binding.FamilyID || binding.Generation != previous.binding.Generation || binding.AuthMethod != method {
				oauthDiagnostic(r, "invalid_grant", "retry_generation")
				oauthFailure(w, 400, "invalid_grant")
				return
			}
			oauthJSON(w, 200, previous.pair.response())
			return
		}
		if len(o.retries) >= maxOAuthRefreshRetries {
			oauthServerFailure(w, r, "retry_budget")
			return
		}
	}
	// A valid current token exposes its granted scope before mutation. For an
	// invalid/consumed token Rotate remains authoritative, including replay revoke.
	current, currentErr := o.store.CurrentRefresh(r.Context(), oauthHashString(refresh), clientID, resource, now)
	if currentErr != nil && !errors.Is(currentErr, mcpoauth.ErrInvalidGrant) {
		o.tokenFailure(w, r, currentErr)
		return
	}
	if currentErr == nil && requestedScope != "" && requestedScope != current.Scope {
		oauthFailure(w, 400, "invalid_scope")
		return
	}
	pair, tokens, err := o.newPair(method)
	if err != nil {
		oauthServerFailure(w, r, "entropy")
		return
	}
	binding, err := o.store.Rotate(r.Context(), oauthHashString(refresh), clientID, resource, tokens, now)
	if err != nil {
		o.tokenFailure(w, r, err)
		return
	}
	pair.Scope = binding.Scope
	if method == "private_key_jwt" {
		o.retries[key] = oauthRefreshRetry{clientID: clientID, resource: binding.Resource, requestedScope: requestedScope,
			pair: pair, binding: binding, expires: now.Add(oauthRefreshRetryLifetime)}
	}
	oauthJSON(w, 200, pair.response())
}

func (o *oauthBroker) revokeToken(w http.ResponseWriter, r *http.Request) {
	form, ok := readOAuthForm(w, r)
	if !ok {
		return
	}
	if resource := onlyOAuthValue(form, "resource"); resource != "" && resource != o.resource {
		oauthFailure(w, 400, "invalid_target")
		return
	}
	method, ok := o.authenticateClient(w, r, form, o.issuer+"/oauth/revoke")
	if !ok {
		return
	}
	token := onlyOAuthValue(form, "token")
	if token == "" {
		oauthFailure(w, 400, "invalid_request")
		return
	}
	o.tokenMu.Lock()
	defer o.tokenMu.Unlock()
	family, err := o.store.Revoke(r.Context(), oauthHashString(token), onlyOAuthValue(form, "client_id"), method, o.now())
	if err != nil {
		oauthServerFailure(w, r, mcpoauth.Cause(err))
		return
	}
	if family != "" {
		for key, entry := range o.retries {
			if entry.binding.FamilyID == family {
				delete(o.retries, key)
			}
		}
	}
	oauthHeaders(w)
	w.WriteHeader(http.StatusOK)
}
