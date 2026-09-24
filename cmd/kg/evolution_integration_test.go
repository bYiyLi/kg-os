//go:build lithograph_smoke

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/daemon"
	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestPhase06EvolutionCLIRealDaemonE2E(t *testing.T) {
	home := t.TempDir()
	port := freeOntologyCLIPort(t)
	writeOntologyCLIConfig(t, home, port)
	runtime, err := runtimehost.Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	serverCtx, cancelServer := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- daemon.Serve(
			serverCtx,
			runtime,
			daemon.NewHandler(runtime, http.NotFoundHandler()),
			io.Discard,
		)
	}()
	waitForOntologyCLIEndpoint(t, runtime)
	t.Setenv("KG_HOME", home)
	t.Setenv("KG_TOKEN", runtime.Credential.Token)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if code := run(
		context.Background(), []string{"evolution", "overview", "--pretty"},
		strings.NewReader(""), true, &stdout, &stderr,
	); code != 0 {
		t.Fatalf("overview exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var overview kernel.EvolutionOverviewResult
	if err := json.Unmarshal(stdout.Bytes(), &overview); err != nil || overview.DefaultBranch != "main" || !strings.HasPrefix(overview.State, "commit/") {
		t.Fatalf("overview = %#v err=%v stdout=%q", overview, err, stdout.String())
	}
	if stderr.Len() != 0 || !strings.Contains(stdout.String(), "\n  \"defaultBranch\"") {
		t.Fatalf("pretty overview stdout=%q stderr=%q", stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(),
		[]string{"evolution", "state", "create", "--branch", "main", "--data", "null", "--author", "phase06-cli"},
		strings.NewReader("ignored"), false, &stdout, &stderr,
	); code != 0 {
		t.Fatalf("state create exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var created kernel.StateCreateResult
	if err := json.Unmarshal(stdout.Bytes(), &created); err != nil || created.State == overview.State {
		t.Fatalf("state create = %#v err=%v", created, err)
	}

	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(), []string{"evolution", "get", created.State},
		strings.NewReader(""), true, &stdout, &stderr,
	); code != 0 {
		t.Fatalf("get exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var detail kernel.EvolutionGetResult
	if err := json.Unmarshal(stdout.Bytes(), &detail); err != nil || !detail.HasData || string(detail.Data) != "null" ||
		detail.Author == nil || *detail.Author != "phase06-cli" {
		t.Fatalf("get = %#v err=%v", detail, err)
	}

	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(), []string{"evolution", "state", "set-data", "branch/main"},
		strings.NewReader(`{"stage":"review"}`), false, &stdout, &stderr,
	); code != 0 {
		t.Fatalf("set-data stdin exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var setData kernel.StateSetDataResult
	if err := json.Unmarshal(stdout.Bytes(), &setData); err != nil || setData.State != created.State || !strings.Contains(string(setData.Data), "review") {
		t.Fatalf("set-data = %#v err=%v", setData, err)
	}

	for _, command := range [][]string{
		{"evolution", "branch", "create", "side", "--from", created.State},
		{"evolution", "tag", "create", "release", "--target", created.State},
	} {
		stdout.Reset()
		stderr.Reset()
		if code := run(context.Background(), command, strings.NewReader(""), true, &stdout, &stderr); code != 0 {
			t.Fatalf("%v exit=%d stdout=%q stderr=%q", command, code, stdout.String(), stderr.String())
		}
	}

	for _, command := range [][]string{
		{"evolution", "branch", "list"},
		{"evolution", "tag", "list"},
		{"evolution", "ancestry", "branch/main", "--limit", "1"},
		{"evolution", "diff", "--before", overview.State, "--after", created.State, "--scope", "all", "--limit", "1"},
	} {
		stdout.Reset()
		stderr.Reset()
		if code := run(context.Background(), command, strings.NewReader(""), true, &stdout, &stderr); code != 0 {
			t.Fatalf("%v exit=%d stdout=%q stderr=%q", command, code, stdout.String(), stderr.String())
		}
	}

	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(), []string{"evolution", "tag", "move", "release", "--target", overview.State},
		strings.NewReader(""), true, &stdout, &stderr,
	); code != 0 {
		t.Fatalf("tag move exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(), []string{"evolution", "state", "clear-data", created.State},
		strings.NewReader(""), true, &stdout, &stderr,
	); code != 0 {
		t.Fatalf("clear-data exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(), []string{"evolution", "history", "branch/main", "--scope", "all", "--limit", "1"},
		strings.NewReader(""), true, &stdout, &stderr,
	); code != 0 {
		t.Fatalf("history exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	var history kernel.EvolutionHistoryResult
	if err := json.Unmarshal(stdout.Bytes(), &history); err != nil || history.Root != created.State || len(history.Items) != 1 {
		t.Fatalf("history = %#v err=%v", history, err)
	}

	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(), []string{"evolution", "merge", "start"},
		strings.NewReader(""), true, &stdout, &stderr,
	); code != 2 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeInvalidArgument)) {
		t.Fatalf("merge exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	for _, command := range [][]string{
		{"evolution", "tag", "delete", "release"},
		{"evolution", "branch", "delete", "side"},
	} {
		stdout.Reset()
		stderr.Reset()
		if code := run(context.Background(), command, strings.NewReader(""), true, &stdout, &stderr); code != 0 {
			t.Fatalf("%v exit=%d stdout=%q stderr=%q", command, code, stdout.String(), stderr.String())
		}
	}

	t.Setenv("KG_TOKEN", "wrong-token")
	stdout.Reset()
	stderr.Reset()
	if code := run(
		context.Background(), []string{"evolution", "get", created.State},
		strings.NewReader(""), true, &stdout, &stderr,
	); code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), string(kernel.CodeAuthenticationFailed)) ||
		strings.Contains(stderr.String(), "wrong-token") {
		t.Fatalf("wrong-token exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}

	cancelServer()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("stop daemon: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("daemon did not stop")
	}
}

func TestPhase07EvolutionMergeCLIRealDaemonE2E(t *testing.T) {
	home := t.TempDir()
	port := freeOntologyCLIPort(t)
	writeOntologyCLIConfig(t, home, port)
	runtime, err := runtimehost.Open(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	serverCtx, cancelServer := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- daemon.Serve(
			serverCtx,
			runtime,
			daemon.NewHandler(runtime, http.NotFoundHandler()),
			io.Discard,
		)
	}()
	waitForOntologyCLIEndpoint(t, runtime)
	t.Setenv("KG_HOME", home)
	t.Setenv("KG_TOKEN", runtime.Credential.Token)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	runCommand := func(args []string, stdin string, stdinIsTTY bool) []byte {
		t.Helper()
		stdout.Reset()
		stderr.Reset()
		if code := run(
			context.Background(),
			args,
			strings.NewReader(stdin),
			stdinIsTTY,
			&stdout,
			&stderr,
		); code != 0 {
			t.Fatalf("%v exit=%d stdout=%q stderr=%q", args, code, stdout.String(), stderr.String())
		}
		if stderr.Len() != 0 {
			t.Fatalf("%v stderr=%q", args, stderr.String())
		}
		return append([]byte(nil), stdout.Bytes()...)
	}

	runCommand([]string{
		"graph", "execute", "--branch", "main",
		"--cypher", "CREATE (:Item {name:'Base'}) FINISH",
	}, "", true)
	runCommand([]string{
		"evolution", "branch", "create", "side", "--from", "branch/main",
	}, "", true)
	runCommand([]string{
		"graph", "execute", "--branch", "main",
		"--cypher", "MATCH (n:Item) SET n.name='Ours' FINISH",
	}, "", true)
	runCommand([]string{
		"graph", "execute", "--branch", "side",
		"--cypher", "MATCH (n:Item) SET n.name='Theirs' FINISH",
	}, "", true)

	startBody := runCommand([]string{
		"evolution", "merge", "start", "--branch", "main", "--source", "branch/side",
	}, "", true)
	var session kernel.MergeSession
	if err := json.Unmarshal(startBody, &session); err != nil ||
		session.Status != "conflicted" || session.Unresolved != 1 || session.Revision < 1 {
		t.Fatalf("merge start = %#v err=%v body=%q", session, err, startBody)
	}

	listBody := runCommand([]string{
		"evolution", "merge", "list", "--limit", "1", "--pretty",
	}, "", true)
	if !strings.Contains(string(listBody), session.Session) ||
		!strings.Contains(string(listBody), "\n  \"items\"") {
		t.Fatalf("merge list = %q", listBody)
	}
	getBody := runCommand([]string{
		"evolution", "merge", "get", session.Session,
	}, "", true)
	var recovered kernel.MergeSession
	if err := json.Unmarshal(getBody, &recovered); err != nil ||
		recovered.Session != session.Session || recovered.Revision != session.Revision {
		t.Fatalf("merge get = %#v err=%v", recovered, err)
	}

	conflictBody := runCommand([]string{
		"evolution", "merge", "conflicts", session.Session, "--limit", "1",
	}, "", true)
	var page kernel.MergeConflictsResult
	if err := json.Unmarshal(conflictBody, &page); err != nil ||
		page.Revision != session.Revision || len(page.Items) != 1 ||
		page.Items[0].Path != "/properties" {
		t.Fatalf("merge conflicts = %#v err=%v body=%q", page, err, conflictBody)
	}
	resolutions, err := json.Marshal([]kernel.MergeResolution{{
		ConflictID: page.Items[0].ConflictID, Choice: "ours",
	}})
	if err != nil {
		t.Fatalf("marshal merge resolution: %v", err)
	}
	resolveBody := runCommand([]string{
		"evolution", "merge", "resolve", session.Session,
		"--expected-revision", strconv.FormatInt(page.Revision, 10),
	}, string(resolutions), false)
	var resolved kernel.MergeSession
	if err := json.Unmarshal(resolveBody, &resolved); err != nil ||
		resolved.Status != "ready" || resolved.Unresolved != 0 ||
		resolved.Revision <= page.Revision {
		t.Fatalf("merge resolve = %#v err=%v", resolved, err)
	}

	finalizeBody := runCommand([]string{
		"evolution", "merge", "finalize", session.Session,
		"--expected-revision", strconv.FormatInt(resolved.Revision, 10),
		"--author", "phase07-cli", "--message", "resolve conflict",
	}, "", true)
	var finalized kernel.MergeFinalizeResult
	if err := json.Unmarshal(finalizeBody, &finalized); err != nil ||
		finalized.Status != "merged" || finalized.State == "" {
		t.Fatalf("merge finalize = %#v err=%v", finalized, err)
	}
	queryBody := runCommand([]string{
		"graph", "query", "--at", "branch/main",
		"--cypher", "MATCH (n:Item) RETURN n.name AS name",
	}, "", true)
	if !strings.Contains(string(queryBody), "\"Ours\"") {
		t.Fatalf("merged query = %q", queryBody)
	}

	abortStartBody := runCommand([]string{
		"evolution", "merge", "start", "--branch", "main", "--source", "branch/side",
	}, "", true)
	var abortable kernel.MergeSession
	if err := json.Unmarshal(abortStartBody, &abortable); err != nil ||
		abortable.Status != "up_to_date" {
		t.Fatalf("abortable merge = %#v err=%v", abortable, err)
	}
	abortBody := runCommand([]string{
		"evolution", "merge", "abort", abortable.Session,
		"--expected-revision", strconv.FormatInt(abortable.Revision, 10),
	}, "", true)
	var aborted kernel.MergeAbortResult
	if err := json.Unmarshal(abortBody, &aborted); err != nil ||
		aborted.Session != abortable.Session {
		t.Fatalf("merge abort = %#v err=%v", aborted, err)
	}

	cancelServer()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("stop daemon: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("daemon did not stop")
	}
}
