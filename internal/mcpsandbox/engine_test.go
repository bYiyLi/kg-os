package mcpsandbox

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestExecuteTwoConcurrentGoCallsAndStream(t *testing.T) {
	var lock sync.Mutex
	running := 0
	maxRunning := 0
	dispatch := func(ctx context.Context, method string, args []json.RawMessage) (json.RawMessage, error) {
		lock.Lock()
		running++
		if running > maxRunning {
			maxRunning = running
		}
		lock.Unlock()
		defer func() { lock.Lock(); running--; lock.Unlock() }()
		time.Sleep(50 * time.Millisecond)
		return json.RawMessage(`{"items":[7]}`), nil
	}
	stream := func(ctx context.Context, method string, req json.RawMessage, emit func(json.RawMessage) error) error {
		for _, event := range []string{`{"type":"columns","columns":["n"]}`, `{"type":"row","row":[1]}`, `{"type":"summary","state":"abc"}`} {
			if err := emit(json.RawMessage(event)); err != nil {
				return err
			}
		}
		return nil
	}
	code := `const [a,b]=await Promise.all([ontology.read({refs:['node:A']}),graph.query({cypher:'RETURN 1'})]);const rows=[];for await(const x of graph.streamQuery({cypher:'RETURN 1'})){rows.push(x)};return {a,b,rows}`
	output, err := Execute(context.Background(), code, true, dispatch, stream)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Rows []struct {
			Type string `json:"type"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(output, &result); err != nil {
		t.Fatal(err)
	}
	if maxRunning < 2 || len(result.Rows) != 3 || result.Rows[2].Type != "summary" {
		t.Fatalf("concurrency=%d result=%s", maxRunning, output)
	}
	t.Logf("true simultaneous Go calls, pull stream: max=%d result=%s", maxRunning, output)
}
func TestReadOnlyRejectsForgedWrite(t *testing.T) {
	used := false
	dispatch := func(_ context.Context, _ string, _ []json.RawMessage) (json.RawMessage, error) {
		used = true
		return json.RawMessage(`null`), nil
	}
	stream := func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error { return nil }
	out, err := Execute(context.Background(), `try{await ontology.patch({branch:'main'})}catch(e){return {code:e.code}}`, true, dispatch, stream)
	if err != nil || used || !strings.Contains(string(out), `PERMISSION_DENIED`) {
		t.Fatalf("used=%v out=%s err=%v", used, out, err)
	}
}
