package daemon

import (
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

type webAuthResponse struct {
	AccessToken  string `json:"accessToken"`
	DaemonBootID string `json:"daemonBootId"`
}

func validWebOrigin(r *http.Request) (secure bool, valid bool) {
	origin := r.Header.Get("Origin")
	if origin == "" || len(r.Header.Values("Origin")) != 1 {
		return false, false
	}
	u, err := url.Parse(origin)
	if err != nil || u.User != nil || u.Opaque != "" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Host != r.Host {
		return false, false
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
		return false, false
	}
	if u.Scheme == "https" {
		return true, true
	}
	if u.Scheme != "http" || r.TLS != nil {
		return false, false
	}
	name := u.Hostname()
	if name != "localhost" && !strings.EqualFold(name, "localhost") && (net.ParseIP(name) == nil || !net.ParseIP(name).IsLoopback()) {
		return false, false
	}
	return false, true
}

func webAuthHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}

func setWebSessionCookie(w http.ResponseWriter, name, cookie string, secure bool, now time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: cookie, Path: "/api/v1/web/auth",
		MaxAge: int(webSessionLifetime.Seconds()), Expires: now.Add(webSessionLifetime),
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode,
	})
}
func clearWebSessionCookie(w http.ResponseWriter, name string, secure bool) {
	http.SetCookie(w, &http.Cookie{Name: name, Path: "/api/v1/web/auth",
		MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode})
}

func webCookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func webAuthError(w http.ResponseWriter, err error) {
	if errors.Is(err, os.ErrPermission) {
		kernel.WriteJSONError(w, &kernel.PublicError{Code: kernel.CodeAuthenticationFailed, Message: "authentication failed"})
		return
	}
	kernel.WriteJSONError(w, &kernel.PublicError{Code: kernel.CodeIO, Message: "Web session storage unavailable"})
}

func (s *webSessionStore) routes(mux *http.ServeMux, token, bootID string) {
	mux.HandleFunc("/api/v1/web/auth/login", func(w http.ResponseWriter, r *http.Request) {
		webAuthHeaders(w)
		secure, valid := validWebOrigin(r)
		if !valid {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		if !authenticate(w, r, token) {
			return
		}
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		cookie, access, err := s.login()
		if err != nil {
			webAuthError(w, err)
			return
		}
		setWebSessionCookie(w, s.cookieName, cookie, secure, s.now())
		writeJSON(w, http.StatusOK, webAuthResponse{AccessToken: access, DaemonBootID: bootID})
	})
	mux.HandleFunc("/api/v1/web/auth/session", func(w http.ResponseWriter, r *http.Request) {
		webAuthHeaders(w)
		secure, valid := validWebOrigin(r)
		if !valid {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		cookie := webCookieValue(r, s.cookieName)
		access, err := s.restore(cookie)
		if err != nil {
			if errors.Is(err, os.ErrPermission) {
				clearWebSessionCookie(w, s.cookieName, secure)
			}
			webAuthError(w, err)
			return
		}
		setWebSessionCookie(w, s.cookieName, cookie, secure, s.now())
		writeJSON(w, http.StatusOK, webAuthResponse{AccessToken: access, DaemonBootID: bootID})
	})
	mux.HandleFunc("/api/v1/web/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		webAuthHeaders(w)
		secure, valid := validWebOrigin(r)
		if !valid {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		if err := s.logout(webCookieValue(r, s.cookieName)); err != nil {
			webAuthError(w, err)
			return
		}
		clearWebSessionCookie(w, s.cookieName, secure)
		w.WriteHeader(http.StatusNoContent)
	})
}

// Ordinary API and MCP Token flows keep their existing Bearer validation.
// Only an independently verified temporary Web Bearer is internally mapped to
// the existing Instance credential, never a Cookie nor an OAuth Access Token.
func (s *webSessionStore) webBearer(next http.Handler, rootToken string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		webOperation := (strings.HasPrefix(path, "/api/v1/") &&
			!strings.HasPrefix(path, "/api/v1/web/auth/")) ||
			path == "/oauth/request" || path == "/oauth/decision"
		if webOperation {
			fields := strings.Fields(r.Header.Get("Authorization"))
			if len(fields) == 2 && strings.EqualFold(fields[0], "Bearer") &&
				strings.HasPrefix(fields[1], "kgws_") {
				if r.Header.Get(expectedDaemonBootHeader) == "" || !s.allows(fields[1]) {
					kernel.WriteJSONError(w, &kernel.PublicError{Code: kernel.CodeAuthenticationFailed, Message: "authentication failed"})
					return
				}
				if r.Method != http.MethodGet {
					if _, valid := validWebOrigin(r); !valid {
						http.Error(w, "origin not allowed", http.StatusForbidden)
						return
					}
				}
				copyRequest := r.Clone(r.Context())
				copyRequest.Header.Set("Authorization", "Bearer "+rootToken)
				next.ServeHTTP(w, copyRequest)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
