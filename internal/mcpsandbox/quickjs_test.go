package mcpsandbox

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	qjs "github.com/aperturerobotics/go-quickjs-wasi-reactor"
)

func TestPinnedQuickJSNGWASMArtifact(t *testing.T) {
	// Upstream MIT licensed WASI Reactor, pinned in go.mod at v0.15.1.
	// Any WASM update requires a fresh feasibility and sandbox review.
	const expectedSHA256 = "718f30dac3b2b42f2ab18d622f8ca11139e193e40f941519165710e4a9b168a3"
	sum := sha256.Sum256(qjs.QuickJSWASM)
	if got := hex.EncodeToString(sum[:]); got != expectedSHA256 {
		t.Fatalf("QuickJS-NG WASI module changed: sha256=%s", got)
	}
	if len(qjs.QuickJSWASM) < 1<<20 {
		t.Fatalf("embedded WASI Reactor was unexpectedly small: %d bytes", len(qjs.QuickJSWASM))
	}
}

func TestLowLevelQuickJSStringAndException(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	g, err := newGuest(ctx, 1024)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close(context.Background())
	v, err := g.eval(ctx, `"hi " + (3 + 4)`)
	if err != nil {
		t.Fatal(err)
	}
	s, err := g.stringValue(ctx, v)
	g.freeValue(ctx, v)
	if err != nil || s != "hi 7" {
		t.Fatalf("result=%q err=%v", s, err)
	}
	_, err = g.eval(ctx, `throw new Error('expected')`)
	if err == nil || !strings.Contains(err.Error(), "expected") {
		t.Fatalf("exception=%v", err)
	}
}
func TestModuleImportsDisabled(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	g, err := newGuest(ctx, 1024)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close(context.Background())
	v, err := g.eval(ctx, `import('os').then(()=>globalThis.loaded=true,()=>globalThis.loaded=false)`)
	if err != nil {
		t.Fatal(err)
	}
	g.freeValue(ctx, v)
	if err := g.drainJobs(ctx); err != nil {
		t.Fatal(err)
	}
	v, err = g.eval(ctx, `String(globalThis.loaded)`)
	if err != nil {
		t.Fatal(err)
	}
	s, err := g.stringValue(ctx, v)
	g.freeValue(ctx, v)
	if err != nil || s != "false" {
		t.Fatalf("os module loaded? %q err=%v", s, err)
	}
}
