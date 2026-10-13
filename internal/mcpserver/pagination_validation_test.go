package mcpserver

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestOptionalPaginationLimitDistinguishesOmittedFromZero(t *testing.T) {
	server := &Server{}
	now := time.Now()
	server.previewCache.entries = map[string]previewCacheEntry{
		"revision": {lines: []string{"line 0", "line 1"}, expires: now.Add(time.Minute), principal: "principal"},
	}
	server.previewCache.order = []string{"revision"}
	omitted, err := server.preview(context.Background(), "principal", PreviewInput{ViewRevision: "revision"})
	if err != nil || omitted.LineCount != 2 {
		t.Fatalf("omitted limit must select default 300: %#v %v", omitted, err)
	}
	for _, n := range []int{-1, 0, 1, 99, 501, 10000} {
		_, err := server.preview(context.Background(), "principal", PreviewInput{ViewRevision: "revision", Limit: &n})
		if err == nil || !strings.Contains(err.Error(), "INVALID_ARGUMENT") {
			t.Errorf("accepted invalid explicit preview limit %d", n)
		}
	}
	for _, n := range []int{100, 300, 500} {
		result, err := server.preview(context.Background(), "principal", PreviewInput{ViewRevision: "revision", Limit: &n})
		if err != nil || result.LineCount != 2 {
			t.Errorf("rejected explicit valid preview limit %d: %v", n, err)
		}
	}
	n := 100
	for _, offset := range []int{-1, 3} {
		_, err := server.preview(context.Background(), "principal", PreviewInput{
			Offset: offset, Limit: &n, ViewRevision: "revision",
		})
		if err == nil {
			t.Errorf("accepted invalid offset %d", offset)
		}
	}
	if end, err := server.preview(context.Background(), "principal", PreviewInput{
		Offset: 2, Limit: &n, ViewRevision: "revision",
	}); err != nil || end.LineCount != 0 {
		t.Fatalf("offset==totalLines must return empty window: %#v %v", end, err)
	}
}

func TestAncestryRejectsExplicitInvalidLimit(t *testing.T) {
	for _, n := range []int{-1, 0, 1001} {
		_, err := StateAncestry(context.Background(), nil, AncestryInput{Root: "commit/unused", Limit: &n})
		if err == nil || !strings.Contains(err.Error(), "INVALID_ARGUMENT") {
			t.Errorf("invalid explicit ancestry limit accepted: %d %v", n, err)
		}
	}
}
