//go:build lithograph_smoke

package kernel_test

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

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

// Terminate a real KG OS writer process after the SQL transaction has staged
// endpoints and relationships, not after a completed request. Recovery must
// expose either the whole Commit or the original State, never a partial graph.
func TestPhase38SIGKILLDuringStagedRelationshipPatch(t *testing.T) {
	const edges = 300
	root := os.Getenv("KGOS_PHASE38_LIVE_KILL_ROOT")
	if os.Getenv("KGOS_PHASE38_LIVE_KILL_CHILD") == "1" {
		if root == "" {
			t.Fatal("missing isolated test root")
		}
		rt, err := openKernelIntegrationRuntime(context.Background(), root)
		if err != nil {
			t.Fatal(err)
		}
		defer rt.Close()
		store, err := observability.OpenStore(filepath.Join(root, ".kgos", "logs"), io.Discard)
		if err != nil {
			t.Fatal(err)
		}
		observer, err := observability.New(io.Discard, "ERROR")
		if err != nil {
			t.Fatal(err)
		}
		observer.AttachStore(store)
		defer func() { _ = observer.Close(context.Background()) }()
		ctx, requestID, err := observability.WithRequest(context.Background(), observer)
		if err != nil {
			t.Fatal(err)
		}
		ctx = observability.WithSurface(ctx, "mcp")
		ctx = observability.WithTool(ctx, "kgos_mutate")
		observer.ToolStarted(ctx, "kgos_mutate")
		base, err := rt.Database.ResolveState(ctx, "branch/main")
		if err != nil {
			t.Fatal(err)
		}
		var patch strings.Builder
		patch.WriteString(addRawObjectPatch("new:knowledge-node:source", "labels:\n  - \"Phase38Source\"\nproperties:\n  \"id\": \"live-source\"\n"))
		patch.WriteString(addRawObjectPatch("new:knowledge-node:claim", "labels:\n  - \"Phase38Claim\"\nproperties:\n  \"id\": \"live-claim\"\n"))
		for i := 0; i < edges; i++ {
			patch.WriteString(addRawObjectPatch(
				fmt.Sprintf("new:knowledge-relationship:edge-%03d", i),
				"type: \"PHASE38_EVIDENCES\"\nstart: \"new:knowledge-node:source\"\nend: \"new:knowledge-node:claim\"\nproperties: {}\n",
			))
		}
		result := make(chan error, 1)
		go func() {
			_, patchErr := rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{
				BaseState: base, Branch: "main", Patch: patch.String(),
			})
			result <- patchErr
		}()
		deadline := time.Now().Add(20 * time.Second)
		for time.Now().Before(deadline) {
			select {
			case err := <-result:
				t.Fatalf("Patch finished before read_back stage could be persisted: %v", err)
			default:
			}
			logs, err := store.ListLogs(context.Background(), observability.LogListInput{Limit: 100})
			if err != nil {
				t.Fatal(err)
			}
			for _, event := range logs.Items {
				if event.Event == "business.operation.stage" && event.Fields["stage"] == "read_back" {
					fmt.Println("READY", requestID)
					_ = os.Stdout.Sync()
					// Only the parent may terminate this child. No clean
					// transaction abort, Observer.Close, or final Tool event.
					time.Sleep(30 * time.Second)
					return
				}
			}
			time.Sleep(5 * time.Millisecond)
		}
		t.Fatal("did not persist read_back stage before deadline")
	}

	if runtime.GOOS == "windows" {
		t.Skip("requires POSIX SIGKILL")
	}
	root = t.TempDir()
	writeKernelIntegrationConfig(t, root)
	initial, err := openKernelIntegrationRuntime(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	base, err := initial.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	if err := initial.Close(); err != nil {
		t.Fatal(err)
	}
	parent, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()
	cmd := exec.CommandContext(parent, os.Args[0], "-test.run=^TestPhase38SIGKILLDuringStagedRelationshipPatch$")
	cmd.Env = append(os.Environ(),
		"KGOS_PHASE38_LIVE_KILL_CHILD=1", "KGOS_PHASE38_LIVE_KILL_ROOT="+root,
	)
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
		t.Fatalf("child did not reach durable staged read_back: line=%q err=%v stderr=%s", line, err, stderr.String())
	}
	requestID := strings.TrimSpace(strings.TrimPrefix(line, "READY "))
	if err := cmd.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	_ = cmd.Wait()

	reopened, err := openKernelIntegrationRuntime(context.Background(), root)
	if err != nil {
		t.Fatalf("reopen after in-flight SIGKILL: %v", err)
	}
	defer reopened.Close()
	state, err := reopened.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	nodes := querySingleInt(t, reopened, state, "MATCH (n:Phase38Source) RETURN count(n) AS count") +
		querySingleInt(t, reopened, state, "MATCH (n:Phase38Claim) RETURN count(n) AS count")
	relations := querySingleInt(t, reopened, state,
		"MATCH ()-[r:PHASE38_EVIDENCES]->() RETURN count(r) AS count")
	if state == base {
		if nodes != 0 || relations != 0 {
			t.Fatalf("SIGKILL leaked staged graph without Commit: nodes=%d relationships=%d", nodes, relations)
		}
		t.Log("SIGKILL before durable Commit: original Head retained, staged nodes and relationships absent")
	} else if nodes != 2 || relations != edges {
		t.Fatalf("SIGKILL produced partial Commit: state=%s nodes=%d relationships=%d", state, nodes, relations)
	} else {
		t.Log("SIGKILL raced with a whole Commit: all nodes and relationships persisted atomically")
	}
	store, err := observability.OpenStore(filepath.Join(root, ".kgos", "logs"), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if closeErr := store.Close(ctx); closeErr != nil {
			t.Errorf("close recovered diagnostic store: %v", closeErr)
		}
	}()
	detail, err := store.Get(context.Background(), observability.RequestGetInput{RequestID: requestID})
	if err != nil {
		t.Fatal(err)
	}
	if detail.Request.Tool != "kgos_mutate" || detail.Request.Outcome != "incomplete" {
		t.Fatalf("lost Tool identity or invented result after SIGKILL: %+v", detail.Request)
	}
	found := false
	for _, stage := range detail.LastStages {
		found = found || stage.Stage == "read_back" || stage.Stage == "commit"
	}
	if !found {
		t.Fatalf("no persisted in-flight stage after SIGKILL: %+v", detail.LastStages)
	}
	t.Logf("recovered incomplete Tool=%s; stages=%+v", detail.Request.Tool, detail.LastStages)
	// The same persistent Instance must remain usable for a new writer.
	head, err := reopened.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{
		BaseState: state, Branch: "main",
		Patch: addRawObjectPatch("new:knowledge-node:recovered", "labels:\n  - \"Phase38Recovered\"\nproperties: {}\n"),
	})
	if err != nil || head.State == state {
		t.Fatalf("writer not recovered after SIGKILL: %+v %v", head, err)
	}
}
