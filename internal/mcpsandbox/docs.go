package mcpsandbox

import (
	"embed"
	"encoding/json"
	"io/fs"
	"strings"
)

//go:embed docs
var documentation embed.FS

// ReadDoc serves only generated, build-pinned Markdown bundled in kgosd.
// No user filesystem, database, network or authorization capability is exposed.
func ReadDoc(args []json.RawMessage) (json.RawMessage, error) {
	if len(args) != 1 {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "docs.read requires one Markdown path"}
	}
	var name string
	if err := json.Unmarshal(args[0], &name); err != nil ||
		!fs.ValidPath(name) || name == "." || !strings.HasSuffix(name, ".md") ||
		strings.ContainsAny(name, "\\:?#") {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "Invalid documentation path"}
	}
	for _, part := range strings.Split(name, "/") {
		if strings.HasPrefix(part, ".") {
			return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "Invalid documentation path"}
		}
	}
	content, err := documentation.ReadFile("docs/" + name)
	if err != nil {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "Unknown documentation path"}
	}
	return json.Marshal(string(content))
}
