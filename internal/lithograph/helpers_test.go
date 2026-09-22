package lithograph

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestResultAndExecutionHelpers(t *testing.T) {
	result, err := decodeResult([]byte(`{"columns":["value"],"rows":[["ok"]],"summary":{}}`))
	if err != nil {
		t.Fatalf("decode valid result: %v", err)
	}
	if _, err := decodeResult([]byte("{")); err == nil {
		t.Fatal("invalid result JSON was accepted")
	}
	if index, ok := columnIndex(result.Columns, "value"); !ok || index != 0 {
		t.Fatalf("column index = %d, %v", index, ok)
	}
	if index, ok := columnIndex(result.Columns, "missing"); ok || index != -1 {
		t.Fatalf("missing column index = %d, %v", index, ok)
	}
	value, err := stringCell(result, 0, "value")
	if err != nil || value != "ok" {
		t.Fatalf("string cell = %q, %v", value, err)
	}
	if _, err := stringCell(result, 0, "missing"); err == nil {
		t.Fatal("missing column was accepted")
	}
	if _, err := stringCell(result, 2, "value"); err == nil {
		t.Fatal("missing row was accepted")
	}
	bad := Result{Columns: []string{"value"}, Rows: [][]json.RawMessage{{json.RawMessage("1")}}}
	if _, err := stringCell(bad, 0, "value"); err == nil {
		t.Fatal("non-string cell was accepted")
	}

	if got, err := marshalObject(nil); err != nil || got != "{}" {
		t.Fatalf("marshal nil = %q, %v", got, err)
	}
	if got, err := marshalObject(map[string]any{"value": 1}); err != nil || got != `{"value":1}` {
		t.Fatalf("marshal object = %q, %v", got, err)
	}
	if _, err := marshalObject([]int{1}); err == nil || !strings.Contains(err.Error(), "object") {
		t.Fatalf("marshal array error = %v", err)
	}
	if _, err := marshalObject(map[string]any{"bad": func() {}}); err == nil {
		t.Fatal("unsupported JSON value was accepted")
	}

	author := "author"
	message := "message"
	if got := executionOptions(nil, nil); len(got) != 0 {
		t.Fatalf("empty execution options = %#v", got)
	}
	got := executionOptions(&author, &message)
	if got["author"] != author || got["message"] != message {
		t.Fatalf("execution options = %#v", got)
	}
}

func TestCompatibilityAndHostValidationHelpers(t *testing.T) {
	databaseID := "db"
	format := expectedStorageFormat
	valid := versionInfo{
		Extension:     expectedExtension,
		DatabaseID:    &databaseID,
		CypherProfile: expectedCypherProfile,
	}
	valid.StorageFormat.Current = &format
	baseline, err := requireCompatibleVersion(valid)
	if err != nil || baseline.DatabaseID != databaseID {
		t.Fatalf("valid baseline = %#v, %v", baseline, err)
	}

	tests := []struct {
		name   string
		mutate func(*versionInfo)
	}{
		{name: "extension", mutate: func(v *versionInfo) { v.Extension = "0.0.0" }},
		{name: "profile", mutate: func(v *versionInfo) { v.CypherProfile = "other" }},
		{name: "database", mutate: func(v *versionInfo) { v.DatabaseID = nil }},
		{name: "format", mutate: func(v *versionInfo) { other := 2; v.StorageFormat.Current = &other }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := valid
			test.mutate(&candidate)
			if _, err := requireCompatibleVersion(candidate); err == nil {
				t.Fatal("incompatible version was accepted")
			}
		})
	}

	if _, err := Open(context.Background(), "/tmp/kgos-test.db", nil, "unicode61", runtimeSemanticFixture()); err == nil {
		t.Fatal("host accepted empty extension list")
	}
	if _, err := Open(
		context.Background(),
		"relative.db",
		[]runtimeprofile.ResolvedExtension{runtimeExtensionFixture()},
		"unicode61",
		runtimeSemanticFixture(),
	); err == nil {
		t.Fatal("host accepted relative database path")
	}
	if err := verifyAnalyzer(context.Background(), nil, ""); err == nil {
		t.Fatal("empty analyzer was accepted")
	}
}

func TestClosedHostAndTransactionRejectWork(t *testing.T) {
	closedHost := &Host{closed: true}
	if _, _, err := closedHost.operationContext(context.Background()); err == nil {
		t.Fatal("closed host created operation context")
	}
	if err := closedHost.registerTransaction(&Transaction{}); err == nil {
		t.Fatal("closed host registered transaction")
	}

	lifetime, cancel := context.WithCancel(context.Background())
	defer cancel()
	host := &Host{lifetime: lifetime, cancel: cancel, transactions: make(map[*Transaction]struct{})}
	transaction := &Transaction{host: host, closed: true}
	if _, err := transaction.Execute(context.Background(), "RETURN 1", nil, nil); err == nil {
		t.Fatal("closed transaction executed")
	}
	if err := transaction.Stream(context.Background(), "RETURN 1", nil, nil, func(Event) error { return nil }); err == nil {
		t.Fatal("closed transaction streamed")
	}
	if _, err := transaction.Commit(context.Background()); err == nil {
		t.Fatal("closed transaction committed")
	}
	if err := transaction.Abort(context.Background()); err == nil {
		t.Fatal("closed transaction aborted")
	}
}

func runtimeSemanticFixture() runtimeprofile.SemanticDefaults {
	return runtimeprofile.SemanticDefaults{
		Provider:      "openai-compatible",
		BaseURL:       "https://example.invalid/v1",
		Model:         "fixture",
		Dimensions:    3,
		Similarity:    "cosine",
		CacheMaxBytes: 1,
	}
}

func runtimeExtensionFixture() runtimeprofile.ResolvedExtension {
	return runtimeprofile.ResolvedExtension{Library: "/tmp/fixture", Entrypoint: "init"}
}
