package kernel

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestGraphParamsPreserveRawJSONAndRejectNonObjects(t *testing.T) {
	large := json.RawMessage(`{"integer":9223372036854775807,"decimal":1.234567890123456789}`)
	got, err := validateGraphParams(large)
	if err != nil {
		t.Fatalf("validate raw params: %v", err)
	}
	if string(got) != string(large) {
		t.Fatalf("raw params = %s, want %s", got, large)
	}
	if got, err := validateGraphParams(nil); err != nil || got != nil {
		t.Fatalf("nil params = %s err=%v", got, err)
	}
	for _, raw := range []json.RawMessage{
		json.RawMessage(`null`),
		json.RawMessage(`[]`),
		json.RawMessage(`"x"`),
		json.RawMessage(`{`),
		json.RawMessage(`   `),
	} {
		if _, err := validateGraphParams(raw); err == nil ||
			AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("params %q error = %v", raw, err)
		}
	}
}

func TestGraphSummaryProjectionAndValidation(t *testing.T) {
	state := "commit/" + strings.Repeat("a", 64)
	counters := `{"nodesCreated":1,"propertiesSet":2}`
	summary, err := decodeGraphSummary(json.RawMessage(
		`{"commit":"` + state + `","counters":` + counters + `,"ignored":"value"}`,
	))
	if err != nil {
		t.Fatalf("decode Graph summary: %v", err)
	}
	if summary.Commit != state || string(summary.Counters) != counters {
		t.Fatalf("summary = %#v", summary)
	}
	for _, raw := range []string{
		`{}`,
		`{"commit":null,"counters":{}}`,
		`{"commit":"commit/bad","counters":{}}`,
		`{"commit":"` + state + `"}`,
		`{"commit":"` + state + `","counters":[]}`,
		`not-json`,
	} {
		if _, err := decodeGraphSummary(json.RawMessage(raw)); err == nil ||
			AsPublicError(err).Code != CodeInternal {
			t.Fatalf("summary %q error = %v", raw, err)
		}
	}
}

func TestGraphStreamProjectorQueryAndExecute(t *testing.T) {
	state := "commit/" + strings.Repeat("b", 64)
	summary := json.RawMessage(`{"commit":"` + state + `","counters":{"rows":1}}`)
	query := &graphStreamProjector{}
	columns, err := query.projectQuery(state, lithograph.Event{
		Type: "columns", Data: json.RawMessage(`["value"]`),
	})
	if err != nil || columns.Columns == nil || len(*columns.Columns) != 1 {
		t.Fatalf("columns = %#v err=%v", columns, err)
	}
	row, err := query.projectQuery(state, lithograph.Event{
		Type: "row", Data: json.RawMessage(`[9223372036854775807]`),
	})
	if err != nil || row.Row == nil || string((*row.Row)[0]) != "9223372036854775807" {
		t.Fatalf("row = %#v err=%v", row, err)
	}
	terminal, err := query.projectQuery(state, lithograph.Event{Type: "summary", Data: summary})
	if err != nil || terminal.State == nil || *terminal.State != state || len(terminal.Counters) != 0 {
		t.Fatalf("query terminal = %#v err=%v", terminal, err)
	}

	execute := &graphStreamProjector{}
	if _, err := execute.projectExecute(lithograph.Event{
		Type: "columns", Data: json.RawMessage(`["value"]`),
	}); err != nil {
		t.Fatal(err)
	}
	terminal, err = execute.projectExecute(lithograph.Event{Type: "summary", Data: summary})
	if err != nil || terminal.State == nil || *terminal.State != state ||
		string(terminal.Counters) != `{"rows":1}` {
		t.Fatalf("execute terminal = %#v err=%v", terminal, err)
	}
}

func TestGraphStreamProjectorRejectsMalformedSequences(t *testing.T) {
	state := "commit/" + strings.Repeat("c", 64)
	other := "commit/" + strings.Repeat("d", 64)
	summary := func(commit string) json.RawMessage {
		return json.RawMessage(`{"commit":"` + commit + `","counters":{}}`)
	}
	for _, test := range []struct {
		name string
		run  func() error
	}{
		{
			name: "row before columns",
			run: func() error {
				_, err := (&graphStreamProjector{}).projectQuery(
					state, lithograph.Event{Type: "row", Data: json.RawMessage(`[1]`)},
				)
				return err
			},
		},
		{
			name: "summary before columns",
			run: func() error {
				_, err := (&graphStreamProjector{}).projectQuery(
					state, lithograph.Event{Type: "summary", Data: summary(state)},
				)
				return err
			},
		},
		{
			name: "query state mismatch",
			run: func() error {
				projector := &graphStreamProjector{}
				_, _ = projector.projectQuery(
					state, lithograph.Event{Type: "columns", Data: json.RawMessage(`[]`)},
				)
				_, err := projector.projectQuery(
					state, lithograph.Event{Type: "summary", Data: summary(other)},
				)
				return err
			},
		},
		{
			name: "repeated columns",
			run: func() error {
				projector := &graphStreamProjector{}
				_, _ = projector.projectData(lithograph.Event{Type: "columns", Data: json.RawMessage(`[]`)})
				_, err := projector.projectData(lithograph.Event{Type: "columns", Data: json.RawMessage(`[]`)})
				return err
			},
		},
		{
			name: "row width",
			run: func() error {
				projector := &graphStreamProjector{}
				_, _ = projector.projectData(lithograph.Event{Type: "columns", Data: json.RawMessage(`["a"]`)})
				_, err := projector.projectData(lithograph.Event{Type: "row", Data: json.RawMessage(`[]`)})
				return err
			},
		},
		{
			name: "unknown event",
			run: func() error {
				_, err := (&graphStreamProjector{}).projectData(lithograph.Event{Type: "progress", Data: json.RawMessage(`{}`)})
				return err
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := test.run(); err == nil || AsPublicError(err).Code != CodeInternal {
				t.Fatalf("error = %v", err)
			}
		})
	}
}

func TestGraphRequestValidation(t *testing.T) {
	if _, err := validateGraphQueryRequest(GraphQueryRequest{}); err == nil {
		t.Fatal("empty query accepted")
	}
	if _, err := validateGraphExecuteRequest(GraphExecuteRequest{}); err == nil {
		t.Fatal("empty execute accepted")
	}
	badUTF8 := string([]byte{0xff})
	if _, err := validateGraphQueryRequest(GraphQueryRequest{At: "branch/main", Cypher: badUTF8}); err == nil ||
		AsPublicError(err).Code != CodeParse {
		t.Fatalf("invalid query UTF-8 error = %v", err)
	}
	if _, err := validateGraphExecuteRequest(GraphExecuteRequest{Branch: "main", Cypher: badUTF8}); err == nil ||
		AsPublicError(err).Code != CodeParse {
		t.Fatalf("invalid execute UTF-8 error = %v", err)
	}
}

func TestValidateGraphRows(t *testing.T) {
	if err := validateGraphRows(lithograph.Result{
		Columns: []string{"a"},
		Rows:    [][]json.RawMessage{{json.RawMessage("1")}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := validateGraphRows(lithograph.Result{
		Columns: []string{"a"},
		Rows:    [][]json.RawMessage{{}},
	}); err == nil || AsPublicError(err).Code != CodeInternal {
		t.Fatalf("row mismatch error = %v", err)
	}
}
