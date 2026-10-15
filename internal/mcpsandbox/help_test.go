package mcpsandbox

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestSDKHelpMethodsAndTypes(t *testing.T) {
	raw, err := SDKHelp(nil)
	if err != nil {
		t.Fatal(err)
	}
	var list []helpSummary
	if err := json.Unmarshal(raw, &list); err != nil {
		t.Fatal(err)
	}
	reads, writes := 0, 0
	for i, item := range list {
		if i > 0 && list[i-1].Name >= item.Name {
			t.Fatalf("Help index must be stable and sorted: %#v", list)
		}
		switch item.Access {
		case "read":
			reads++
			if !readMethods[item.Name] {
				t.Fatalf("Help marks unauthorized read: %s", item.Name)
			}
		case "write":
			writes++
			if !writeMethods[item.Name] {
				t.Fatalf("Help marks unauthorized write: %s", item.Name)
			}
		default:
			t.Fatalf("invalid Help access: %s", item.Access)
		}
	}
	if reads != 15 || writes != 16 {
		t.Fatalf("read/write inventory = %d/%d", reads, writes)
	}
	detail, err := SDKHelp([]json.RawMessage{json.RawMessage(`"evolution.merge.resolve"`)})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(detail), "interface MergeResolution") || !strings.Contains(string(detail), "expectedRevision") {
		t.Fatalf("missing nested public TypeScript contract: %s", detail)
	}
}

func TestSDKHelpRejectsInvalidCalls(t *testing.T) {
	for _, args := range [][]json.RawMessage{
		{json.RawMessage(`"unknown.method"`)},
		{json.RawMessage(`null`)},
		{json.RawMessage(`5`)},
		{json.RawMessage(`""`)},
		{json.RawMessage(`"evolution.overview"`), json.RawMessage(`"extra"`)},
	} {
		_, err := SDKHelp(args)
		var public *CallError
		if !errors.As(err, &public) || public.Code != "INVALID_ARGUMENT" {
			t.Fatalf("SDKHelp(%q) = %v", args, err)
		}
	}
}
