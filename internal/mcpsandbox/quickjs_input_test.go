package mcpsandbox

import (
	"bytes"
	"context"
	"testing"
	"time"
)

func TestQuickJSEvalAcceptsShortSourcesAfterDirtyAllocations(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	g, err := newGuest(ctx, 128)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close(context.Background())
	for _, sample := range []struct{ source, want string }{
		{"21 * 2", "42"},
		{"'模型'", "模型"},
		{"'ok'", "ok"},
		{"String(12345)", "12345"},
	} {
		for range 4 {
			// Reusing a dirty allocation must not let bytes after the source
			// reach the parser. JS_Eval requires input[input_len] == 0.
			dirty, err := g.alloc(ctx, bytes.Repeat([]byte{0xff}, len(sample.source)+1))
			if err != nil {
				t.Fatal(err)
			}
			g.free(ctx, dirty)
			value, err := g.eval(ctx, sample.source)
			if err != nil {
				t.Fatalf("valid source %q rejected: %v", sample.source, err)
			}
			actual, err := g.stringValue(ctx, value)
			g.freeValue(ctx, value)
			if err != nil || actual != sample.want {
				t.Fatalf("source %q returned %q, %v; want %q", sample.source, actual, err, sample.want)
			}
		}
	}
}
