package observability

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// This test uses a real SIGKILL, not Store.Close or a simulated panic.
// Its child confirms SQLite has durably committed the early facts before
// the parent terminates it; the test never asserts durability before flush.
func TestPhase38SIGKILLKeepsEarlyFacts(t *testing.T) {
	if os.Getenv("KGOS_PHASE38_KILL_CHILD") == "1" {
		dir := os.Getenv("KGOS_PHASE38_KILL_DIR")
		store, err := OpenStore(dir, io.Discard)
		if err != nil {
			t.Fatal(err)
		}
		observer, err := New(io.Discard, "ERROR")
		if err != nil {
			t.Fatal(err)
		}
		observer.AttachStore(store)
		ctx, requestID, err := WithRequest(context.Background(), observer)
		if err != nil {
			t.Fatal(err)
		}
		WithSurface(ctx, "mcp")
		ctx, root := StartSpan(ctx, "http.mcp")
		store.RequestStart(requestRecord{Time: time.Now(), RunID: observer.runID, RequestID: requestID,
			TraceID: root.SpanContext().TraceID().String(), Route: "mcp", Surface: "mcp", Method: "POST"})
		ctx = WithTool(ctx, "kgos_mutate")
		ctx, _ = StartSpan(ctx, "mcp.tool")
		observer.ToolStarted(ctx, "kgos_mutate")
		ctx, _ = StartOperation(ctx, "kernel.object.patch")
		BusinessStarted(ctx, "object.patch")
		BusinessStage(ctx, "pre_schema", "", -1, -1)
		_, _ = StartSpan(WithQueryFamily(ctx, "knowledge.relationship.create"), "lithograph.execute")
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			got, err := store.Get(context.Background(), RequestGetInput{RequestID: requestID})
			if err == nil && got.Request.Tool == "kgos_mutate" && len(got.LastStages) == 1 {
				for _, span := range got.Spans {
					if span.Name == "lithograph.execute" && span.DBCallSeq == 1 {
						fmt.Println("READY", requestID)
						_ = os.Stdout.Sync()
						// The parent kills this process; no normal flush or End.
						time.Sleep(30 * time.Second)
						return
					}
				}
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Fatal("early evidence was not persisted within child deadline")
	}
	if runtime.GOOS == "windows" {
		t.Skip("requires POSIX process termination semantics")
	}
	dir := filepath.Join(t.TempDir(), ".kgos", "logs")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestPhase38SIGKILLKeepsEarlyFacts$")
	cmd.Env = append(os.Environ(), "KGOS_PHASE38_KILL_CHILD=1", "KGOS_PHASE38_KILL_DIR="+dir)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	line, err := bufio.NewReader(stdout).ReadString('\n')
	if err != nil || !strings.HasPrefix(line, "READY req_") {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		t.Fatalf("child did not persist early evidence: line=%q err=%v stderr=%s", line, err, stderr.String())
	}
	requestID := strings.TrimSpace(strings.TrimPrefix(line, "READY "))
	if err := cmd.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	_ = cmd.Wait()
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	got, err := reopened.Get(context.Background(), RequestGetInput{RequestID: requestID})
	if err != nil {
		t.Fatal(err)
	}
	if got.Request.Tool != "kgos_mutate" || got.Request.Outcome != "incomplete" ||
		got.Request.FinishedAt != "" || len(got.LastStages) != 1 ||
		got.LastStages[0].Stage != "pre_schema" {
		t.Fatalf("SIGKILL recovery invented result or lost evidence: %+v", got)
	}
	if len(got.Spans) == 0 {
		t.Fatal("SIGKILL lost all execution spans")
	}
}
