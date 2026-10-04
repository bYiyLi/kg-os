package daemon

import (
	"context"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/webstore"
)

const expectedBootHeader = "X-KGOS-Expected-Daemon-Boot"
const codeConnectionChanged kernel.ErrorCode = "WEB_CONNECTION_CHANGED"

func webJSONHandler[Request any, Result any](token string, execute func(context.Context, Request) (Result, error)) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		if !authenticate(response, request, token) {
			return
		}
		if request.Method != http.MethodPost {
			writeMethodNotAllowed(response)
			return
		}
		var input Request
		if err := decodeJSONRequest(response, request, &input); err != nil {
			writeWebError(response, err)
			return
		}
		result, err := execute(request.Context(), input)
		if err != nil {
			writeWebError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, result)
	}
}

func writeWebError(response http.ResponseWriter, err error) {
	public := kernel.AsPublicError(err)
	status := kernel.HTTPStatus(public)
	switch public.Code {
	case webstore.CodeChanged, codeConnectionChanged:
		status = http.StatusConflict
	case webstore.CodeNotFound:
		status = http.StatusNotFound
	}
	writeJSONErrorStatus(response, status, public)
}

func registerWeb(mux *http.ServeMux, runtime *runtimehost.Runtime, bootID string) {
	store := runtime.Web
	if store == nil {
		// Tests and embedding callers can construct a Runtime without opening a
		// database. The authenticated info endpoint still reports its boot guard.
		store = webstore.New("", "")
	}
	token := runtime.Credential.Token
	mux.HandleFunc("/api/v1/web/data/info", webJSONHandler(token, func(ctx context.Context, _ struct{}) (any, error) {
		return struct {
			DaemonBootID string `json:"daemonBootId"`
			webstore.Info
		}{bootID, store.Info(ctx)}, nil
	}))
	mux.HandleFunc("/api/v1/web/data/list", webJSONHandler(token, store.List))
	mux.HandleFunc("/api/v1/web/data/read", webJSONHandler(token, store.Read))
	mux.HandleFunc("/api/v1/web/data/save", webJSONHandler(token, store.Save))
	mux.HandleFunc("/api/v1/web/data/delete", webJSONHandler(token, store.Delete))
	mux.HandleFunc("/api/v1/web/cache/write", webJSONHandler(token, store.CacheWrite))
	mux.HandleFunc("/api/v1/web/cache/read", webJSONHandler(token, store.CacheRead))
	mux.HandleFunc("/api/v1/web/cache/clear", webJSONHandler(token, store.CacheClear))
	mux.HandleFunc("/api/v1/web/data/export", func(response http.ResponseWriter, request *http.Request) {
		if !authenticate(response, request, token) {
			return
		}
		if request.Method != http.MethodPost {
			writeMethodNotAllowed(response)
			return
		}
		var input struct{}
		if err := decodeJSONRequest(response, request, &input); err != nil {
			writeWebError(response, err)
			return
		}
		exported, err := store.Export(request.Context())
		if err != nil {
			writeWebError(response, err)
			return
		}
		defer exported.Close()
		response.Header().Set("Content-Type", "application/vnd.sqlite3")
		response.Header().Set("Content-Disposition", `attachment; filename="kgos-web-ui.db"`)
		response.Header().Set("Content-Length", strconv.FormatInt(exported.Size, 10))
		response.Header().Set("X-Content-Type-Options", "nosniff")
		response.Header().Set("Cache-Control", "no-store")
		_, _ = io.Copy(response, exported)
	})
}

func guardDaemonBoot(runtime *runtimehost.Runtime, bootID string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if strings.HasPrefix(request.URL.Path, "/api/") {
			if !authenticate(response, request, runtime.Credential.Token) {
				return
			}
			values, provided := request.Header[http.CanonicalHeaderKey(expectedBootHeader)]
			if provided && (len(values) != 1 || values[0] != bootID) {
				writeWebError(response, &kernel.PublicError{Code: codeConnectionChanged, Message: "Daemon connection changed; explicitly reconnect"})
				return
			}
		}
		next.ServeHTTP(response, request)
	})
}
