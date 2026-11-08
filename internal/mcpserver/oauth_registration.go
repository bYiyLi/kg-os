package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/mcpoauth"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
)

const maxOAuthRegistrationBytes = 64 << 10

func validDCRClientID(id string) bool {
	return len(id) == len("kg_mcp_")+43 && strings.HasPrefix(id, "kg_mcp_") &&
		oauthSecretPattern.MatchString(strings.TrimPrefix(id, "kg_mcp_"))
}

func (o *oauthBroker) registeredClient(ctx context.Context, id string) (oauthClientDocument, error) {
	if !validDCRClientID(id) {
		return oauthClientDocument{}, errOAuthInvalidClient
	}
	if err := o.available(); err != nil {
		return oauthClientDocument{}, errOAuthClientUnavailable
	}
	value, err := o.store.GetClient(ctx, id)
	if errors.Is(err, mcpoauth.ErrClientNotFound) {
		return oauthClientDocument{}, errOAuthInvalidClient
	}
	if err != nil {
		return oauthClientDocument{}, errOAuthClientUnavailable
	}
	return oauthClientDocument{
		ClientID: value.ID, ClientName: value.Name, RedirectURIs: value.RedirectURIs,
		ClientURI: value.URI, AuthenticationMethod: "none", Kind: "dcr",
	}, nil
}

func oauthOnlyAllowed(values []string, allowed ...string) bool {
	set := make(map[string]bool, len(allowed))
	for _, value := range allowed {
		set[value] = true
	}
	for _, value := range values {
		if !set[value] {
			return false
		}
	}
	return true
}

// The rate limiter is instance-local, small and explicitly not an identity
// oracle. Never trust user-supplied proxy headers as a remote address.
func (o *oauthBroker) allowRegistration(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	if host == "" {
		host = "unknown"
	}
	now := o.now()
	o.mu.Lock()
	defer o.mu.Unlock()
	for key, stamps := range o.registrationTimes {
		kept := stamps[:0]
		for _, at := range stamps {
			if at.Add(time.Minute).After(now) {
				kept = append(kept, at)
			}
		}
		if len(kept) == 0 {
			delete(o.registrationTimes, key)
		} else {
			o.registrationTimes[key] = kept
		}
	}
	// The backend sees the reverse proxy's socket address, not the original
	// caller's identity. Never trust arbitrary Forwarded/X-Forwarded-For here.
	// When the immediate peer is private/loopback, apply the instance-wide
	// 60/minute limit and let the *trusted ingress* enforce source limits.
	// Public direct peers can be safely limited to 10/minute per socket IP.
	source, parsed := netip.ParseAddr(host)
	publicPeer := parsed == nil && oauthPublicIP(source)
	key := "ip:" + host
	if len(o.registrationTimes["all"]) >= 60 ||
		(publicPeer && len(o.registrationTimes[key]) >= 10) ||
		(publicPeer && len(o.registrationTimes) >= 1024 && len(o.registrationTimes[key]) == 0) {
		return false
	}
	o.registrationTimes["all"] = append(o.registrationTimes["all"], now)
	if publicPeer {
		o.registrationTimes[key] = append(o.registrationTimes[key], now)
	}
	return true
}

// Registration identifies a public client, but cannot create a Grant or Token.
func (o *oauthBroker) registerClient(w http.ResponseWriter, r *http.Request) {
	if !o.allowRegistration(r.RemoteAddr) {
		oauthFailure(w, http.StatusTooManyRequests, "temporarily_unavailable")
		return
	}
	if r.ContentLength > maxOAuthRegistrationBytes {
		oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
		return
	}
	if kind, _, err := mimeOAuthJSON(r.Header.Get("Content-Type")); err != nil || kind != "application/json" {
		oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
		return
	}
	body, readErr := io.ReadAll(io.LimitReader(r.Body, maxOAuthRegistrationBytes+1))
	if readErr != nil || len(body) > maxOAuthRegistrationBytes {
		oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
		return
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var meta oauthex.ClientRegistrationMetadata
	if err := decoder.Decode(&meta); err != nil {
		oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
		return
	}
	meta.ClientName = strings.TrimSpace(meta.ClientName)
	if len(meta.ClientName) == 0 || len(meta.ClientName) > 255 || len(meta.ClientURI) > 2048 ||
		len(meta.RedirectURIs) == 0 || len(meta.RedirectURIs) > 20 ||
		(meta.ApplicationType != "" && meta.ApplicationType != "web" && meta.ApplicationType != "native") ||
		(meta.TokenEndpointAuthMethod != "" && meta.TokenEndpointAuthMethod != "none") ||
		!oauthOnlyAllowed(meta.GrantTypes, "authorization_code", "refresh_token") ||
		!oauthOnlyAllowed(meta.ResponseTypes, "code") {
		oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
		return
	}
	if meta.Scope != "" {
		scope, ok := normalizeOAuthScope(meta.Scope)
		if !ok {
			oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
			return
		}
		meta.Scope = scope
	}
	if meta.ClientURI != "" && !validOAuthClientURI(meta.ClientURI) {
		oauthFailure(w, http.StatusBadRequest, "invalid_client_metadata")
		return
	}
	seen := make(map[string]bool, len(meta.RedirectURIs))
	for _, redirect := range meta.RedirectURIs {
		if !validOAuthRedirect(redirect) || seen[redirect] {
			oauthFailure(w, http.StatusBadRequest, "invalid_redirect_uri")
			return
		}
		seen[redirect] = true
	}
	secret, err := randomOAuthSecret()
	if err != nil {
		oauthFailure(w, http.StatusServiceUnavailable, "server_error")
		return
	}
	id := "kg_mcp_" + secret
	if err := o.store.CreateClient(r.Context(), mcpoauth.RegisteredClient{
		ID: id, Name: meta.ClientName, URI: meta.ClientURI,
		RedirectURIs: meta.RedirectURIs, CreatedAt: o.now(),
	}); err != nil {
		if errors.Is(err, mcpoauth.ErrLimit) {
			oauthFailure(w, http.StatusTooManyRequests, "temporarily_unavailable")
		} else {
			oauthFailure(w, http.StatusServiceUnavailable, "server_error")
		}
		return
	}
	meta.TokenEndpointAuthMethod = "none"
	if len(meta.GrantTypes) == 0 {
		meta.GrantTypes = []string{"authorization_code", "refresh_token"}
	}
	if len(meta.ResponseTypes) == 0 {
		meta.ResponseTypes = []string{"code"}
	}
	oauthJSON(w, http.StatusCreated, struct {
		*oauthex.ClientRegistrationMetadata
		ClientID string `json:"client_id"`
	}{ClientRegistrationMetadata: &meta, ClientID: id})
}

func validOAuthClientURI(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" ||
		parsed.User != nil || parsed.Fragment != "" || parsed.Opaque != "" || len(raw) > 2048 {
		return false
	}
	return true
}

func mimeOAuthJSON(value string) (string, map[string]string, error) {
	return mime.ParseMediaType(value)
}
