package webui

import (
	"embed"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var embedded embed.FS

type Shell struct {
	files fs.FS
}

func EmbeddedHandler() (http.Handler, error) {
	files, err := fs.Sub(embedded, "dist")
	if err != nil {
		return nil, fmt.Errorf("open embedded Web assets: %w", err)
	}
	return NewHandler(files), nil
}

func NewHandler(files fs.FS) http.Handler {
	return &Shell{files: files}
}

func (shell *Shell) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		response.Header().Set("Allow", "GET, HEAD")
		writeText(response, http.StatusMethodNotAllowed, "Method Not Allowed\n")
		return
	}

	name, ok := requestedAsset(request.URL.Path)
	if !ok || isReserved(request.URL.Path) {
		writeText(response, http.StatusNotFound, "Not Found\n")
		return
	}

	body, selected, err := shell.readAsset(name)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			writeText(response, http.StatusNotFound, "Not Found\n")
			return
		}
		writeText(response, http.StatusInternalServerError, "Internal Server Error\n")
		return
	}

	contentType := mime.TypeByExtension(path.Ext(selected))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("Content-Type", contentType)
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.WriteHeader(http.StatusOK)
	if request.Method == http.MethodGet {
		_, _ = response.Write(body)
	}
}

func (shell *Shell) readAsset(name string) ([]byte, string, error) {
	body, err := fs.ReadFile(shell.files, name)
	if err == nil {
		return body, name, nil
	}
	if !errors.Is(err, fs.ErrNotExist) || path.Ext(name) != "" {
		return nil, "", err
	}
	body, err = fs.ReadFile(shell.files, "index.html")
	return body, "index.html", err
}

func requestedAsset(requestPath string) (string, bool) {
	if requestPath == "/" {
		return "index.html", true
	}
	cleaned := path.Clean("/" + requestPath)
	name := strings.TrimPrefix(cleaned, "/")
	if !fs.ValidPath(name) || hasHiddenSegment(name) {
		return "", false
	}
	return name, true
}

func hasHiddenSegment(name string) bool {
	for _, part := range strings.Split(name, "/") {
		if strings.HasPrefix(part, ".") {
			return true
		}
	}
	return false
}

func isReserved(requestPath string) bool {
	cleaned := path.Clean("/" + requestPath)
	return cleaned == "/api" ||
		strings.HasPrefix(cleaned, "/api/") ||
		cleaned == "/control" ||
		strings.HasPrefix(cleaned, "/control/")
}

func writeText(response http.ResponseWriter, status int, text string) {
	response.Header().Set("Content-Type", "text/plain; charset=utf-8")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.WriteHeader(status)
	_, _ = io.WriteString(response, text)
}
