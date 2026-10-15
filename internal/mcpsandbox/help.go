package mcpsandbox

import (
	_ "embed"
	"encoding/json"
	"errors"
	"sync"
)

//go:embed sdk-help-catalog.json
var embeddedHelp []byte

type helpSummary struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Access      string `json:"access"`
}

var (
	loadHelp      sync.Once
	helpByName    map[string]json.RawMessage
	helpIndex     []helpSummary
	helpLoadError error
)

// SDKHelp returns static public SDK documentation, without accessing an Instance.
func SDKHelp(args []json.RawMessage) (json.RawMessage, error) {
	if len(args) > 1 {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "help accepts at most one method name"}
	}
	loadHelp.Do(func() {
		var catalog struct {
			Methods []json.RawMessage `json:"methods"`
		}
		if err := json.Unmarshal(embeddedHelp, &catalog); err != nil {
			helpLoadError = err
			return
		}
		helpByName = make(map[string]json.RawMessage, len(catalog.Methods))
		for _, raw := range catalog.Methods {
			var summary helpSummary
			if err := json.Unmarshal(raw, &summary); err != nil {
				helpLoadError = err
				return
			}
			if summary.Name == "" || summary.Description == "" || (summary.Access != "read" && summary.Access != "write") {
				helpLoadError = errors.New("invalid SDK Help catalog")
				return
			}
			helpIndex = append(helpIndex, summary)
			helpByName[summary.Name] = raw
		}
	})
	if helpLoadError != nil {
		return nil, errors.New("SDK Help catalog unavailable")
	}
	if len(args) == 0 {
		return json.Marshal(helpIndex)
	}
	var name string
	if err := json.Unmarshal(args[0], &name); err != nil || name == "" {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "help requires a non-empty method name"}
	}
	detail, ok := helpByName[name]
	if !ok {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "unknown SDK method; use help() to list methods"}
	}
	return detail, nil
}
