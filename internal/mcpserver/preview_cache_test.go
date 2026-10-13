package mcpserver

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestViewDocKeepsUserDataAndResolvesOnlyNavigation(t *testing.T) {
	doc := newViewDoc()
	anchor := doc.reserve()
	doc.lines = append(doc.lines, "# Header", "")
	doc.addIndexLine(func() string { return "| Details | " + doc.offset(anchor) + " | " + doc.length(anchor) + " |" })
	doc.lines = append(doc.lines, "")
	if err := doc.begin(anchor); err != nil {
		t.Fatal(err)
	}
	raw := "A user-defined body with ~A1O~ and ~A1L~ as literal text"
	doc.lines = append(doc.lines, raw)
	if err := doc.end(anchor); err != nil {
		t.Fatal(err)
	}
	result, err := doc.finish()
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 5 || result[2] != "| Details | 4 | 1 |" || result[4] != raw {
		t.Fatalf("navigation/body mismatch: %#v", result)
	}
}

func TestViewDocKeepsUserMarkerInIndexedTitle(t *testing.T) {
	doc := newViewDoc()
	id := doc.reserve()
	title := "A title with ~A1O~ and ~A1L~ user text"
	doc.addIndexLine(func() string { return "| " + title + " | " + doc.offset(id) + " | " + doc.length(id) + " |" })
	if err := doc.begin(id); err != nil {
		t.Fatal(err)
	}
	doc.lines = append(doc.lines, "# detail")
	if err := doc.end(id); err != nil {
		t.Fatal(err)
	}
	lines, err := doc.finish()
	if err != nil || len(lines) != 2 || lines[0] != "| "+title+" | 1 | 1 |" {
		t.Fatalf("user-controlled index marker changed: %v %v", lines, err)
	}
}

func TestPreviewCacheExpiresPrunesAndSeparatesPrincipals(t *testing.T) {
	now := time.Now()
	server := &Server{}
	server.previewCache.entries = map[string]previewCacheEntry{
		"expired": {lines: []string{"old"}, expires: now.Add(-time.Second), principal: "admin"},
		"live":    {lines: []string{"current"}, expires: now.Add(time.Minute), principal: "admin"},
	}
	server.previewCache.order = []string{"expired", "live"}
	server.previewCache.prune(now)
	if len(server.previewCache.order) != 1 || server.previewCache.order[0] != "live" || len(server.previewCache.entries) != 1 {
		t.Fatalf("cache not pruned: entries=%d order=%v", len(server.previewCache.entries), server.previewCache.order)
	}
	for i := 0; i < 200; i++ {
		id := strconv.Itoa(i)
		server.previewCache.entries[id] = previewCacheEntry{expires: now.Add(-time.Second), principal: "admin"}
		server.previewCache.order = append(server.previewCache.order, id)
		server.previewCache.prune(now)
		if len(server.previewCache.order) != 1 {
			t.Fatal("expired order accumulated")
		}
	}
	for _, test := range []struct {
		principal, revision string
		expired             bool
	}{
		{"admin", "live", false}, {"attacker", "live", true}, {"admin", "expired", true},
	} {
		limit := 100
		result, err := server.preview(context.Background(), test.principal, PreviewInput{ViewRevision: test.revision, Limit: &limit})
		if test.expired {
			if err == nil || !strings.Contains(err.Error(), "VIEW_EXPIRED") {
				t.Fatalf("revision isolation failure: %#v %v", result, err)
			}
		} else if err != nil || result.Preview != "current\n" {
			t.Fatalf("valid revision failed: %#v %v", result, err)
		}
	}
}
