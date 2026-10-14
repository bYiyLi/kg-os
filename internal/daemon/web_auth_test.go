package daemon

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

const sessionTestOrigin = "http://127.0.0.1:6543"

func sessionTestHandler(root, token string) http.Handler {
	rt := &runtimehost.Runtime{Paths: runtimeprofile.Paths{Root: root}, Credential: runtimeprofile.Credential{Token: token}}
	return NewHandler(rt, http.NotFoundHandler(), ExtraRoute{
		Path: "/api/v1/web/session-probe",
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !authenticate(w, r, token) {
				return
			}
			w.WriteHeader(http.StatusNoContent)
		}),
	})
}

func sessionRequest(handler http.Handler, path, rootBearer, cookie, boot, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, sessionTestOrigin+path, nil)
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if rootBearer != "" {
		r.Header.Set("Authorization", "Bearer "+rootBearer)
	}
	if cookie != "" {
		r.Header.Set("Cookie", cookie)
	}
	if boot != "" {
		r.Header.Set(expectedDaemonBootHeader, boot)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func sessionResult(t *testing.T, w *httptest.ResponseRecorder) webAuthResponse {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("web auth status=%d body=%s", w.Code, w.Body.String())
	}
	var auth webAuthResponse
	if err := json.Unmarshal(w.Body.Bytes(), &auth); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(auth.AccessToken, "kgws_") || len(auth.DaemonBootID) != 36 {
		t.Fatalf("invalid web access response: %#v", auth)
	}
	return auth
}

func TestWebSessionLoginRestoreRestartLogoutAndCookieIsolation(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	handler := sessionTestHandler(root, "correct-secret")
	logged := sessionRequest(handler, "/api/v1/web/auth/login", "correct-secret", "", "", sessionTestOrigin)
	access := sessionResult(t, logged)
	if strings.Contains(logged.Body.String(), "correct-secret") {
		t.Fatal("root token leaked in response")
	}
	cookies := logged.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("missing cookie: %#v", cookies)
	}
	cookie := cookies[0]
	headerCookie := cookie.Name + "=" + cookie.Value
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Secure ||
		cookie.Path != "/api/v1/web/auth" || cookie.MaxAge < 86400 {
		t.Fatalf("unsafe cookie: %#v", cookie)
	}
	if !validWebSecret(cookie.Value) {
		t.Fatal("cookie lacks expected entropy")
	}
	data, err := os.ReadFile(filepath.Join(root, webSessionFile))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), cookie.Value) || strings.Contains(string(data), "correct-secret") {
		t.Fatal("Session store persisted a raw credential")
	}
	stat, err := os.Stat(filepath.Join(root, webSessionFile))
	if err != nil || (runtime.GOOS != "windows" && stat.Mode().Perm() != 0o600) {
		t.Fatalf("session file permissions: %v %v", stat, err)
	}
	for _, req := range []struct {
		name, bearer, cookie, boot string
		expected                   int
	}{
		{"web access", access.AccessToken, "", access.DaemonBootID, http.StatusNoContent},
		{"root access", "correct-secret", "", access.DaemonBootID, http.StatusNoContent},
		{"no bearer, with Cookie", "", headerCookie, access.DaemonBootID, http.StatusUnauthorized},
		{"web token without boot", access.AccessToken, "", "", http.StatusUnauthorized},
		{"wrong boot", access.AccessToken, "", newDaemonBootID(), http.StatusConflict},
	} {
		response := sessionRequest(handler, "/api/v1/web/session-probe", req.bearer, req.cookie, req.boot, sessionTestOrigin)
		if response.Code != req.expected {
			t.Errorf("%s: status %d expected %d (%s)", req.name, response.Code, req.expected, response.Body.String())
		}
	}
	next := sessionTestHandler(root, "correct-secret")
	restored := sessionResult(t, sessionRequest(next, "/api/v1/web/auth/session", "", headerCookie, "", sessionTestOrigin))
	if restored.DaemonBootID == access.DaemonBootID {
		t.Fatal("daemon boot did not rotate")
	}
	if restored.AccessToken == access.AccessToken {
		t.Fatal("web access bearer survived daemon restart")
	}
	if w := sessionRequest(next, "/api/v1/web/session-probe", access.AccessToken, "", access.DaemonBootID, sessionTestOrigin); w.Code != http.StatusUnauthorized {
		t.Fatalf("previous daemon web access still works: %d", w.Code)
	}
	if w := sessionRequest(next, "/api/v1/web/session-probe", restored.AccessToken, "", restored.DaemonBootID, sessionTestOrigin); w.Code != http.StatusNoContent {
		t.Fatalf("restored session could not use API: %d %s", w.Code, w.Body.String())
	}
	logout := sessionRequest(next, "/api/v1/web/auth/logout", "", headerCookie, "", sessionTestOrigin)
	if logout.Code != http.StatusNoContent || len(logout.Result().Cookies()) != 1 || logout.Result().Cookies()[0].MaxAge != -1 {
		t.Fatalf("logout failed: %d %v", logout.Code, logout.Result().Cookies())
	}
	if w := sessionRequest(next, "/api/v1/web/auth/session", "", headerCookie, "", sessionTestOrigin); w.Code != http.StatusUnauthorized {
		t.Fatalf("revoked cookie recovered: %d", w.Code)
	}
	if w := sessionRequest(next, "/api/v1/web/session-probe", restored.AccessToken, "", restored.DaemonBootID, sessionTestOrigin); w.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session kept access bearer: %d", w.Code)
	}
	if w := sessionRequest(next, "/api/v1/web/session-probe", "correct-secret", "", restored.DaemonBootID, sessionTestOrigin); w.Code != http.StatusNoContent {
		t.Fatalf("logout broke root API: %d", w.Code)
	}
}

func TestWebSessionRejectsWrongTokenOriginAndRotation(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	handler := sessionTestHandler(root, "secret")
	if w := sessionRequest(handler, "/api/v1/web/auth/login", "wrong", "", "", sessionTestOrigin); w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong root was accepted: %d", w.Code)
	}
	if w := sessionRequest(handler, "/api/v1/web/auth/login", "secret", "", "", "https://evil.example"); w.Code != http.StatusForbidden {
		t.Fatalf("cross-origin login was accepted: %d", w.Code)
	}
	if w := sessionRequest(handler, "/api/v1/web/auth/login", "secret", "", "", ""); w.Code != http.StatusForbidden {
		t.Fatalf("login without Origin was accepted: %d", w.Code)
	}
	logged := sessionRequest(handler, "/api/v1/web/auth/login", "secret", "", "", sessionTestOrigin)
	cookie := logged.Result().Cookies()[0]
	value := cookie.Name + "=" + cookie.Value
	for _, path := range []string{"/api/v1/web/auth/session", "/api/v1/web/auth/logout"} {
		w := sessionRequest(handler, path, "", value, "", "https://evil.example")
		if w.Code != http.StatusForbidden {
			t.Fatalf("cross-origin %s allowed: %d", path, w.Code)
		}
	}
	if w := sessionRequest(handler, "/api/v1/web/auth/session", "", value, "", sessionTestOrigin); w.Code != http.StatusOK {
		t.Fatalf("CSRF attempt revoked session: %d", w.Code)
	}
	rotated := sessionTestHandler(root, "changed-token")
	if w := sessionRequest(rotated, "/api/v1/web/auth/session", "", value, "", sessionTestOrigin); w.Code != http.StatusUnauthorized {
		t.Fatalf("rotated Instance token accepted old cookie: %d", w.Code)
	}
}

func TestWebSessionRejectsBrokenStorageAndSetsHTTPSCookie(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, webSessionFile), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := sessionTestHandler(root, "secret")
	w := sessionRequest(handler, "/api/v1/web/auth/login", "secret", "", "", sessionTestOrigin)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("corrupt store recreated silently: %d", w.Code)
	}
	saved, err := os.ReadFile(filepath.Join(root, webSessionFile))
	if err != nil || string(saved) != "{" {
		t.Fatal("broken session store was overwritten")
	}
	newRoot := t.TempDir()
	httpsHandler := sessionTestHandler(newRoot, "secret")
	r := httptest.NewRequest(http.MethodPost, "https://kgos.example/api/v1/web/auth/login", nil)
	r.TLS = &tls.ConnectionState{}
	r.Header.Set("Origin", "https://kgos.example")
	r.Header.Set("Authorization", "Bearer secret")
	response := httptest.NewRecorder()
	httpsHandler.ServeHTTP(response, r)
	if response.Code != http.StatusOK {
		t.Fatalf("HTTPS login failed: %d %s", response.Code, response.Body.String())
	}
	if cookies := response.Result().Cookies(); len(cookies) != 1 || !cookies[0].Secure || !cookies[0].HttpOnly {
		t.Fatalf("HTTPS session cookie not secure: %v", cookies)
	}
}

func TestWebSessionCookieIsInstanceScopedAcrossPortsAndClones(t *testing.T) {
	t.Parallel()
	firstRoot := t.TempDir()
	secondRoot := t.TempDir()
	firstHandler := sessionTestHandler(firstRoot, "same-root-token")
	firstResponse := sessionRequest(firstHandler, "/api/v1/web/auth/login", "same-root-token", "", "", sessionTestOrigin)
	first := firstResponse.Result().Cookies()[0]
	secondHandler := sessionTestHandler(secondRoot, "same-root-token")
	secondResponse := sessionRequest(secondHandler, "/api/v1/web/auth/login", "same-root-token", "", "", sessionTestOrigin)
	second := secondResponse.Result().Cookies()[0]
	if first.Name == second.Name || first.Name == "" {
		t.Fatalf("workspace sessions shared a cookie name: %q", first.Name)
	}
	if !strings.HasPrefix(first.Name, "kgos_ws_") {
		t.Fatalf("unexpected instance cookie namespace: %q", first.Name)
	}
	// Even when a second Instance receives a copied Web session store and
	// shares the root credential, the first Instance's Cookie is not trusted.
	data, err := os.ReadFile(filepath.Join(firstRoot, webSessionFile))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(secondRoot, webSessionFile), data, 0o600); err != nil {
		t.Fatal(err)
	}
	clone := sessionTestHandler(secondRoot, "same-root-token")
	firstCookie := first.Name + "=" + first.Value
	if response := sessionRequest(clone, "/api/v1/web/auth/session", "", firstCookie, "", sessionTestOrigin); response.Code != http.StatusUnauthorized {
		t.Fatalf("clone accepted another workspace's cookie: %d", response.Code)
	}
	if response := sessionRequest(firstHandler, "/api/v1/web/auth/session", "", firstCookie, "", sessionTestOrigin); response.Code != http.StatusOK {
		t.Fatalf("original workspace could not resume: %d", response.Code)
	}
}

func TestWebSessionIdleExpiryAndRenewal(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	store := newWebSessionStore(root, "persistent-root-token")
	now := time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return now }
	cookie, access, err := store.login()
	if err != nil {
		t.Fatal(err)
	}
	if !store.allows(access) {
		t.Fatal("new session access bearer was not accepted")
	}
	now = now.Add(20 * 24 * time.Hour)
	if _, err = store.restore(cookie); err != nil {
		t.Fatalf("valid session could not renew: %v", err)
	}
	now = now.Add(20 * 24 * time.Hour)
	// First expiration passed but the session was renewed on Day 20.
	if _, err = store.restore(cookie); err != nil {
		t.Fatalf("renewal did not extend session: %v", err)
	}
	now = now.Add(webSessionLifetime + time.Second)
	if store.allows(access) {
		t.Fatal("expired session still accepts old Web access")
	}
	if _, err = store.restore(cookie); !errors.Is(err, os.ErrPermission) {
		t.Fatalf("expired session resumed: %v", err)
	}
}
