package daemon

import (
	"net/http"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

// SetupSession reuses the existing root-token login, persistent Cookie and
// short-lived Web Bearer even while the Knowledge Base is not yet open.
type SetupSession struct {
	store  *webSessionStore
	root   string
	bootID string
	auth   http.Handler
}

func NewSetupSession(instanceRoot, token string) *SetupSession {
	store := newWebSessionStore(instanceRoot, token)
	mux := http.NewServeMux()
	bootID := newDaemonBootID()
	store.routes(mux, token, bootID)
	return &SetupSession{store: store, root: token, bootID: bootID, auth: mux}
}

func (s *SetupSession) ServeAuth(w http.ResponseWriter, r *http.Request) {
	s.auth.ServeHTTP(w, r)
}

func (s *SetupSession) Authorize(w http.ResponseWriter, r *http.Request, next http.Handler) {
	if _, ok := validWebOrigin(r); !ok {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return
	}
	s.store.webBearer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authenticate(w, r, s.root) {
			return
		}
		next.ServeHTTP(w, r)
	}), s.root).ServeHTTP(w, r)
}

func SetupError(w http.ResponseWriter, status int, code kernel.ErrorCode, message string) {
	writeJSONErrorStatus(w, status, &kernel.PublicError{Code: code, Message: message})
}

// ValidSetupOrigin exposes the exact existing Web Origin validation to setup.
func ValidSetupOrigin(r *http.Request) bool { _, ok := validWebOrigin(r); return ok }
