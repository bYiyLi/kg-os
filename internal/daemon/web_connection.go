package daemon

import (
	"crypto/rand"
	"fmt"
	"net/http"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const expectedDaemonBootHeader = "X-KGOS-Expected-Daemon-Boot"

// webDataInfo is deliberately available even when the optional Web UI store
// is unavailable. Storage fields are added only once their store exists.
type webDataInfo struct {
	DaemonBootID  string `json:"daemonBootId"`
	StorageStatus string `json:"storageStatus"`
}

// Each daemon constructs one HTTP handler at startup. An ephemeral UUID must
// never be persisted, derived from a token, or reused across daemon restarts.
func newDaemonBootID() string {
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		panic(fmt.Errorf("generate daemon boot ID: %w", err))
	}
	id[6] = (id[6] & 0x0f) | 0x40
	id[8] = (id[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", id[:4], id[4:6], id[6:8], id[8:10], id[10:])
}

// The header is optional for existing CLI/SDK users. When provided, the
// expectation is verified after Bearer authentication and before dispatch,
// including browser OAuth request/decision and before any graph mutation.
func webConnectionGuard(next http.Handler, token, bootID string) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if strings.HasPrefix(request.URL.Path, "/api/v1/") ||
			request.URL.Path == "/oauth/request" || request.URL.Path == "/oauth/decision" {
			values := request.Header.Values(expectedDaemonBootHeader)
			if len(values) != 0 {
				if !authenticate(response, request, token) {
					return
				}
				if len(values) != 1 || values[0] != bootID {
					kernel.WriteJSONError(response, &kernel.PublicError{
						Code: kernel.CodeWebConnectionChanged, Message: "web connection changed",
					})
					return
				}
			}
		}
		next.ServeHTTP(response, request)
	})
}
