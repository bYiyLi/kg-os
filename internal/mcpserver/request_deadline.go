package mcpserver

import (
	"net/http"
	"time"
)

// Bound network I/O as well as Kernel work. Cancelling a request context does
// not interrupt a peer that leaves its body unfinished or stops reading a reply.
// net/http resets these deadlines when the response finishes; clearing them in
// this handler would leave post-handler request-body draining unbounded again.
func boundMCPRequestIO(response http.ResponseWriter, deadline time.Time) {
	controller := http.NewResponseController(response)
	// A real net/http connection supports both deadlines, including through our
	// observability writer's Unwrap. In-memory test recorders have no network I/O.
	_ = controller.SetReadDeadline(deadline)
	_ = controller.SetWriteDeadline(deadline)
}
