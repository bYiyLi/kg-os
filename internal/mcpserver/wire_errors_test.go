package mcpserver

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

type failingRequestBody struct{}

func (failingRequestBody) Read([]byte) (int, error) { return 0, errors.New("simulated short read") }
func (failingRequestBody) Close() error             { return nil }

func TestOAuthFormRejectsUntrustedEncodingsAndIOFailures(t *testing.T) {
	cases := []struct {
		contentType, body string
		want              int
	}{
		{"application/x-www-form-urlencoded; charset=UTF-8", "client_id=valid", http.StatusOK},
		{"application/x-www-form-urlencoded", "client_id=valid&client_id=second", http.StatusOK},
		{"text/plain", "client_id=valid", http.StatusBadRequest},
		{"application/x-www-form-urlencoded; charset=latin-1", "client_id=valid", http.StatusBadRequest},
		{"application/x-www-form-urlencoded; charset=UTF-8; extra=value", "client_id=valid", http.StatusBadRequest},
		{"application/x-www-form-urlencoded", "client_id=%xy", http.StatusBadRequest},
		{"application/x-www-form-urlencoded", strings.Repeat("x", 8193), http.StatusBadRequest},
	}
	for _, entry := range cases {
		r := httptest.NewRequest("POST", "/oauth/token", strings.NewReader(entry.body))
		r.Header.Set("Content-Type", entry.contentType)
		w := httptest.NewRecorder()
		form, ok := readOAuthForm(w, r)
		if entry.want == 200 {
			if !ok || form == nil {
				t.Errorf("valid form rejected: %q", entry.contentType)
			}
		} else if ok || w.Code != entry.want {
			t.Errorf("invalid form %q accepted: ok=%t status=%d", entry.contentType, ok, w.Code)
		}
	}
	r := httptest.NewRequest("POST", "/oauth/token", nil)
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.Body = failingRequestBody{}
	w := httptest.NewRecorder()
	if _, ok := readOAuthForm(w, r); ok || w.Code != http.StatusBadRequest {
		t.Fatalf("failed request body read bypassed parser: %d", w.Code)
	}
}

func TestMarkdownRenderingRejectsOversizedAndPreservesCode(t *testing.T) {
	value, err := completeMarkdown([]string{"# Main", "", "- unchanged", "", ""})
	if err != nil || value != "# Main\n\n- unchanged\n" {
		t.Fatalf("Markdown terminator/empty line mismatch: %q %v", value, err)
	}
	if _, err := completeMarkdown([]string{strings.Repeat("x", maxMarkdownBytes)}); err == nil {
		t.Fatal("32MiB render budget was not enforced")
	}
	var message []string
	commitMessage(&message, nil)
	if len(message) != 1 || !strings.Contains(message[0], "Message") {
		t.Fatal("missing Message must be explicit")
	}
	raw := "\r\nFirst\rLine\n"
	message = nil
	commitMessage(&message, &raw)
	if len(message) < 3 || message[0] != "```markdown" {
		t.Fatalf("Commit Message fence is malformed: %#v", message)
	}
	doc := newViewDoc()
	doc.addIndexLine(func() string { return "| index | 0 |" })
	if _, err := doc.finish(); err == nil || !strings.Contains(err.Error(), "trimmed navigation") {
		t.Fatalf("trimmed dangling navigation silently accepted: %v", err)
	}
}

func TestPreviewRendererPropagatesMalformedRelationshipErrors(t *testing.T) {
	invalid := branchSnapshot{
		name: "bad-ontology", head: "commit/pinned",
		commit: kernel.EvolutionGetResult{State: "commit/pinned"},
		definitions: []previewDefinition{{
			summary: kernel.Summary{Kind: kernel.KindRelationshipDefinition, Ref: "relationship:invalid", Name: "invalid"},
			value:   []byte("invalid-json"),
		}},
	}
	doc := newViewDoc()
	id := doc.reserve()
	if err := renderBranch(doc, invalid, id); err == nil || !strings.Contains(err.Error(), "RESOURCE_ERROR") {
		t.Fatalf("inconsistent pinned Ontology Relationship silently rendered: %v", err)
	}
}
