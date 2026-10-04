//go:build lithograph_smoke

package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/webstore"
)

func TestPhase14RealDaemonWebPersistenceCacheAndKernelIsolation(t *testing.T) {
	runtime := openDaemonRuntime(t)
	defer runtime.Close()
	if _, err := os.Stat(runtime.Paths.WebDir); !os.IsNotExist(err) {
		t.Fatalf("Runtime readiness created Web storage: %v", err)
	}
	handler := NewHandler(runtime, nil)
	server := httptest.NewServer(handler)
	defer server.Close()
	call := func(path string, input any, boot string) (int, []byte, http.Header) {
		t.Helper()
		body, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		request, err := http.NewRequest(http.MethodPost, server.URL+path, bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
		if boot != "" {
			request.Header.Set(expectedBootHeader, boot)
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		encoded, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		return response.StatusCode, encoded, response.Header
	}
	_, err := runtime.Kernel.ExecuteGraph(context.Background(), kernel.GraphExecuteRequest{Branch: "main", Cypher: "CREATE (a:Phase14A {name:'a', `$type`:'business'})-[r:PHASE14_LINK]->(b:Phase14B {name:'b'})"})
	if err != nil {
		t.Fatal(err)
	}
	before, err := runtime.Kernel.EvolutionOverview(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	status, body, _ := call("/api/v1/web/data/info", struct{}{}, "")
	var info struct {
		DaemonBootID string `json:"daemonBootId"`
		webstore.Info
	}
	if err := json.Unmarshal(body, &info); err != nil || status != 200 || info.DatabaseID != runtime.Database.Baseline().DatabaseID || info.StorageStatus != "ready" {
		t.Fatalf("real info: %d %s %v", status, body, err)
	}
	params := json.RawMessage(`{"map":{"$type":"Map","entries":{"$type":"business","key":"v"}},"nan":{"$type":"Float","value":"NaN"},"infinity":{"$type":"Float","value":"Infinity"},"negativeInfinity":{"$type":"Float","value":"-Infinity"},"largeIntegralFloat":9007199254740992.0,"negativeZero":-0.0}`)
	cypher := "MATCH p=(a:Phase14A)-[r:PHASE14_LINK]->(b:Phase14B) RETURN " +
		"9223372036854775807 AS value, a AS node, r AS relationship, p AS path, $map AS map, " +
		"date('2026-09-16') AS date, localtime('12:30:00.123456789') AS localtime, " +
		"time('12:30:00+08:00') AS time, localdatetime('2026-09-16T12:30:00') AS localdatetime, " +
		"datetime('2026-09-16T12:30:00Z') AS zoned, duration('P1DT2H') AS duration, " +
		"point({x:1.0,y:2.0}) AS point, uuid('550e8400-e29b-41d4-a716-446655440000') AS uuid, " +
		"vector([1.0,0.0],2,FLOAT64) AS vector, $nan AS nan, $infinity AS infinity, " +
		"$negativeInfinity AS negativeInfinity, 1e100 AS largefloat, " +
		"$largeIntegralFloat AS largeIntegralFloat, $negativeZero AS negativeZero"
	status, body, _ = call("/api/v1/graph/query", kernel.GraphQueryRequest{At: before.State, Cypher: cypher, Params: params}, info.DaemonBootID)
	var queried kernel.GraphQueryResult
	if err := json.Unmarshal(body, &queried); err != nil || status != 200 || queried.State != before.State || len(queried.Rows) != 1 {
		t.Fatalf("real query: %d %s %v", status, body, err)
	}
	expectedTags := []string{"Integer", "Node", "Relationship", "Path", "Map", "Date", "LocalTime", "Time", "LocalDateTime", "ZonedDateTime", "Duration", "Point", "UUID", "Vector", "Float", "Float", "Float"}
	if len(queried.Columns) != len(expectedTags)+3 {
		t.Fatalf("real typed fixture columns: %v", queried.Columns)
	}
	for index, tag := range expectedTags {
		var value struct {
			Type string `json:"$type"`
		}
		if err := json.Unmarshal(queried.Rows[0][index], &value); err != nil || value.Type != tag {
			t.Fatalf("expected real %s: %s %v", tag, queried.Rows[0][index], err)
		}
	}
	var node struct {
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(queried.Rows[0][1], &node); err != nil || string(node.Properties["$type"]) != `"business"` {
		t.Fatalf("Node business $type property changed: %s %v", queried.Rows[0][1], err)
	}
	if string(queried.Rows[0][len(expectedTags)+1]) != "9007199254740992.0" || string(queried.Rows[0][len(expectedTags)+2]) != "-0.0" {
		t.Fatalf("native Float encoding fixture lost type/sign: %s %s", queried.Rows[0][len(expectedTags)+1], queried.Rows[0][len(expectedTags)+2])
	}
	frameData, _ := json.Marshal(map[string]any{"version": 1, "mode": "query", "statement": cypher, "params": params, "status": "complete", "closed": false, "readState": queried.State, "resultState": queried.State})
	key := webstore.ReadRequest{StoreID: info.StoreID, Kind: "frame", ID: webstore.NewID()}
	status, body, _ = call("/api/v1/web/data/save", webstore.SaveRequest{ReadRequest: key, MutationID: webstore.NewID(), Data: frameData}, info.DaemonBootID)
	var saved webstore.Record
	if err := json.Unmarshal(body, &saved); err != nil || status != 200 || saved.Revision != "1" {
		t.Fatalf("real save: %d %s %v", status, body, err)
	}
	cache := webstore.CacheWriteRequest{CacheRequest: webstore.CacheRequest{StoreID: info.StoreID, FrameID: key.ID}, FrameRevision: saved.Revision, Result: webstore.CacheResult{State: queried.State, Columns: queried.Columns, Rows: queried.Rows, ValueEncoding: "lithograph-json-v1"}}
	status, body, _ = call("/api/v1/web/cache/write", cache, info.DaemonBootID)
	if status != 200 || strings.TrimSpace(string(body)) != `{"stored":true}` {
		t.Fatalf("real cache: %d %s", status, body)
	}
	status, body, _ = call("/api/v1/web/cache/read", cache.CacheRequest, info.DaemonBootID)
	var read webstore.CacheReadResult
	if err := json.Unmarshal(body, &read); err != nil || status != 200 || !read.Hit || len(read.Result.Rows) != 1 || len(read.Result.Rows[0]) != len(queried.Rows[0]) {
		t.Fatalf("real cache restored typed results: %d %s %v", status, body, err)
	}
	for index, value := range queried.Rows[0] {
		if !bytes.Equal(read.Result.Rows[0][index], value) {
			t.Fatalf("real typed value bytes changed: %s -> %s", value, read.Result.Rows[0][index])
		}
	}
	status, body, headers := call("/api/v1/web/data/export", struct{}{}, info.DaemonBootID)
	if status != 200 || headers.Get("Content-Type") != "application/vnd.sqlite3" || !bytes.HasPrefix(body, []byte("SQLite format 3")) || bytes.Contains(body, []byte(runtime.Credential.Token)) {
		t.Fatalf("real export: %d", status)
	}
	status, body, _ = call("/api/v1/web/data/delete", webstore.DeleteRequest{ReadRequest: key, ExpectedRevision: &saved.Revision, MutationID: webstore.NewID()}, info.DaemonBootID)
	if status != 200 {
		t.Fatalf("real delete: %d %s", status, body)
	}
	status, body, _ = call("/api/v1/web/cache/write", cache, info.DaemonBootID)
	if status != 409 {
		t.Fatalf("late cache write resurrected deleted frame: %d %s", status, body)
	}
	status, body, _ = call("/api/v1/web/cache/read", cache.CacheRequest, info.DaemonBootID)
	if status != 200 || strings.TrimSpace(string(body)) != `{"hit":false}` {
		t.Fatalf("deleted cache: %d %s", status, body)
	}
	after, err := runtime.Kernel.EvolutionOverview(context.Background())
	if err != nil || after.State != before.State {
		t.Fatalf("Web changed Knowledge State: %+v %v", after, err)
	}
	if files, err := filepath.Glob(filepath.Join(runtime.Paths.WebDir, ".ui-export-*")); err != nil || len(files) != 0 {
		t.Fatalf("real export leaked temporaries: %v %v", files, err)
	}
	status, body, _ = call("/api/v1/graph/execute", kernel.GraphExecuteRequest{Branch: "main", Cypher: "CREATE (:ShouldNotExecute)"}, "previous-process")
	if status != 409 {
		t.Fatalf("boot guard did not block actual Kernel operation: %d %s", status, body)
	}
	final, err := runtime.Kernel.EvolutionOverview(context.Background())
	if err != nil || final.State != before.State {
		t.Fatalf("guarded write reached Kernel: %+v %v", final, err)
	}

	if err := runtime.Web.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(runtime.Paths.WebDatabase, []byte("corrupt Web database"), 0o600); err != nil {
		t.Fatal(err)
	}
	runtime.Web = webstore.New(runtime.Paths.WebDir, runtime.Database.Baseline().DatabaseID)
	faultHandler := NewHandler(runtime, nil)
	response := webRequest(t, faultHandler, "/api/v1/web/data/info", struct{}{}, runtime.Credential.Token, "")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"storageStatus":"unavailable"`) || !strings.Contains(response.Body.String(), `"daemonBootId"`) {
		t.Fatalf("fault info: %d %s", response.Code, response.Body.String())
	}
	response = webRequest(t, faultHandler, "/api/v1/graph/query", kernel.GraphQueryRequest{At: before.State, Cypher: "RETURN 1 AS value"}, runtime.Credential.Token, "")
	if response.Code != 200 {
		t.Fatalf("UI failure blocked real Graph: %d %s", response.Code, response.Body.String())
	}
}
