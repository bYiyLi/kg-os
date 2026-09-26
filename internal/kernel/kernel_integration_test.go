//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/lithograph"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func TestPhase02BootstrapRejectsFreshLookingRootWithExtraBranch(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	head, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve bootstrapped main: %v", err)
	}
	parents := queryMetadataStringList(
		t,
		runtime.Database,
		"CALL lithograph.commit.get($state) YIELD parents RETURN parents",
		map[string]any{"state": head},
	)
	if len(parents) != 1 {
		_ = runtime.Close()
		t.Fatalf("bootstrap parents = %#v, want one Root parent", parents)
	}
	root := parents[0]
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CALL lithograph.branch.create('side', $from) YIELD name RETURN name",
		Params: map[string]any{"from": head},
	}); err != nil {
		_ = runtime.Close()
		t.Fatalf("create side branch: %v", err)
	}
	if got, err := runtime.Database.ResolveState(ctx, "branch/side"); err != nil || got != head {
		_ = runtime.Close()
		t.Fatalf("side branch = %q, err=%v, want %q", got, err, head)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CALL lithograph.reset($target) YIELD from, to RETURN from, to",
		Params: map[string]any{"target": root},
	}); err != nil {
		_ = runtime.Close()
		t.Fatalf("reset main to Root: %v", err)
	}
	if got, err := runtime.Database.ResolveState(ctx, "branch/main"); err != nil || got != root {
		_ = runtime.Close()
		t.Fatalf("main after reset = %q, err=%v, want %q", got, err, root)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close fixture runtime: %v", err)
	}

	reopened, err := openKernelIntegrationRuntime(ctx, home)
	if reopened != nil {
		_ = reopened.Close()
	}
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("reopen non-adoptable Root error = %v", err)
	}
	raw := openRawLithograph(t, home)
	defer raw.Close()
	if got, err := raw.ResolveState(ctx, "branch/main"); err != nil || got != root {
		t.Fatalf("failed bootstrap moved main: got=%q err=%v want=%q", got, err, root)
	}
	if got, err := raw.ResolveState(ctx, "branch/side"); err != nil || got != head {
		t.Fatalf("failed bootstrap changed side: got=%q err=%v want=%q", got, err, head)
	}
}

func TestPhase02ValidMainReopensWithExtraHistoryBranch(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	head, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve main: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CALL lithograph.branch.create('history', $from) YIELD name RETURN name",
		Params: map[string]any{"from": head},
	}); err != nil {
		_ = runtime.Close()
		t.Fatalf("create history branch: %v", err)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close runtime: %v", err)
	}
	reopened, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("reopen valid main with extra history: %v", err)
	}
	defer reopened.Close()
	if got, err := reopened.Database.ResolveState(ctx, "branch/main"); err != nil || got != head {
		t.Fatalf("reopened main = %q, err=%v, want %q", got, err, head)
	}
}

func TestPhase02DirectBindingDriftFailsReadAndReopen(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve base: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Person",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:person", person),
	})
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("create Person: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Person' DETACH DELETE d FINISH",
	}); err != nil {
		_ = runtime.Close()
		t.Fatalf("seed direct Binding drift: %v", err)
	}
	drifted, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve drifted state: %v", err)
	}
	if drifted == created.State {
		_ = runtime.Close()
		t.Fatal("direct drift did not advance main")
	}
	if _, err := runtime.Kernel.ReadOntology(ctx, kernel.OntologyReadRequest{At: drifted}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		_ = runtime.Close()
		t.Fatalf("drift read error = %v", err)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close drifted runtime: %v", err)
	}
	reopened, err := openKernelIntegrationRuntime(ctx, home)
	if reopened != nil {
		_ = reopened.Close()
	}
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("reopen drifted runtime error = %v", err)
	}
}

func TestPhase02ReservedGraphTypeEndpointDriftFailsReadAndReopen(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve base: %v", err)
	}
	specification := querySingleString(
		t,
		runtime,
		base,
		"SHOW CURRENT GRAPH TYPE YIELD specification RETURN specification AS value",
	)
	driftedSpecification := strings.Replace(
		specification,
		"(:`__kgos_domain`)-[:`__kgos_includes`",
		"(:`__kgos_definition_binding`)-[:`__kgos_includes`",
		1,
	)
	if driftedSpecification == specification {
		_ = runtime.Close()
		t.Fatalf("reserved Graph Type fixture did not find __kgos_includes source in %q", specification)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "ALTER CURRENT GRAPH TYPE SET " + driftedSpecification,
	}); err != nil {
		_ = runtime.Close()
		t.Fatalf("seed reserved Graph Type endpoint drift: %v", err)
	}
	drifted, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve drifted state: %v", err)
	}
	if _, err := runtime.Kernel.ReadOntology(ctx, kernel.OntologyReadRequest{At: drifted}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		_ = runtime.Close()
		t.Fatalf("reserved Graph Type drift read error = %v", err)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close drifted runtime: %v", err)
	}
	reopened, err := openKernelIntegrationRuntime(ctx, home)
	if reopened != nil {
		_ = reopened.Close()
	}
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("reopen reserved Graph Type drift error = %v", err)
	}
}

func TestPhase02ConstraintAndIndexProfilesRoundTrip(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}

	account := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Account",
			Properties: []kernel.Property{
				{
					Name:    "location",
					Type:    "POINT",
					Indexes: []kernel.Index{{Name: "account_location", Type: "point"}},
				},
				{Name: "tenant", Type: "STRING", Required: true},
				{
					Name:    "username",
					Type:    "STRING",
					Indexes: []kernel.Index{{Name: "account_username_text", Type: "text"}},
				},
			},
			Constraints: []kernel.Constraint{
				{
					Name:       "account_tenant_username_unique",
					Type:       "unique",
					Properties: []string{"tenant", "username"},
				},
				{
					Type:       "unique",
					Properties: []string{"username", "location"},
				},
			},
			Indexes: []kernel.Index{{
				Name:       "account_tenant_location",
				Type:       "range",
				Properties: []string{"tenant", "location"},
			}},
		},
	}
	employee := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Employee",
			Properties: []kernel.Property{
				{Name: "name", Type: "STRING"},
				{Name: "team", Type: "STRING"},
			},
			Constraints: []kernel.Constraint{},
			Indexes: []kernel.Index{
				{
					Name:       "people_text",
					Type:       "fulltext",
					Targets:    []string{"new:node-definition:employee", "new:node-definition:manager"},
					Properties: []string{"name", "team"},
				},
				{
					Name:       "people_semantic",
					Type:       "vector",
					Targets:    []string{"new:node-definition:employee", "new:node-definition:manager"},
					Properties: []string{"name"},
				},
			},
		},
	}
	manager := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Manager",
			Properties: []kernel.Property{
				{Name: "name", Type: "STRING"},
				{Name: "team", Type: "STRING"},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	weird := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Weird",
			Properties: []kernel.Property{
				{Name: "display name", Type: "INTEGER | FLOAT", Required: true},
				{Name: "tick`name", Type: "LIST<STRING NOT NULL>"},
				{Name: "中文", Type: "STRING", Unique: true},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	accountRef := "new:node-definition:account"
	transfer := kernel.ObjectValue{
		Kind: kernel.KindRelationshipDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindRelationshipDefinition,
			Name: "TRANSFERRED",
			From: &accountRef,
			To:   &accountRef,
			Properties: []kernel.Property{
				{Name: "tenant", Type: "STRING"},
				{Name: "id", Type: "STRING"},
				{Name: "code", Type: "STRING"},
				{Name: "trace", Type: "STRING", Unique: true},
			},
			Constraints: []kernel.Constraint{
				{
					Name:       "transfer_tenant_id_key",
					Type:       "key",
					Properties: []string{"tenant", "id"},
				},
				{
					Type:       "key",
					Properties: []string{"tenant", "code"},
				},
			},
		},
	}
	patch := strings.Join([]string{
		addObjectPatch(t, "new:node-definition:manager", manager),
		addObjectPatch(t, "new:node-definition:account", account),
		addObjectPatch(t, "new:node-definition:employee", employee),
		addObjectPatch(t, "new:node-definition:weird", weird),
		addObjectPatch(t, "new:relationship-definition:transfer", transfer),
	}, "")
	result, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     patch,
	})
	if err != nil {
		t.Fatalf("create schema/index profile: %v\n%s", err, patch)
	}

	accountBody, err := runtime.Kernel.ReadObject(ctx, result.State, "node:Account")
	if err != nil {
		t.Fatalf("read Account: %v", err)
	}
	accountYAML := string(accountBody.YAML)
	for _, expected := range []string{
		"account_tenant_username_unique",
		"kgos_c_",
		"account_location",
		"account_username_text",
		"account_tenant_location",
	} {
		if !strings.Contains(accountYAML, expected) {
			t.Fatalf("Account YAML missing %q:\n%s", expected, accountYAML)
		}
	}
	for _, ref := range []string{"node:Employee", "node:Manager"} {
		body, readErr := runtime.Kernel.ReadObject(ctx, result.State, ref)
		if readErr != nil {
			t.Fatalf("read %s: %v", ref, readErr)
		}
		text := string(body.YAML)
		for _, expected := range []string{
			"people_text",
			"people_semantic",
			"node:Employee",
			"node:Manager",
		} {
			if !strings.Contains(text, expected) {
				t.Fatalf("%s YAML missing %q:\n%s", ref, expected, text)
			}
		}
	}
	if got := querySingleInt(t, runtime, result.State,
		"SHOW ALL INDEXES YIELD name WHERE name IN ['people_text','people_semantic','account_tenant_location','account_username_text','account_location'] RETURN count(name) AS value"); got != 5 {
		t.Fatalf("explicit index count = %d, want 5", got)
	}
	weirdBody, err := runtime.Kernel.ReadObject(ctx, result.State, "node:Weird")
	if err != nil {
		t.Fatalf("read Weird: %v", err)
	}
	weirdYAML := string(weirdBody.YAML)
	for _, expected := range []string{
		"name: \"display name\"",
		"type: \"INTEGER | FLOAT\"",
		"required: true",
		"name: \"tick`name\"",
		"type: \"LIST<STRING NOT NULL>\"",
		"name: \"中文\"",
		"unique: true",
	} {
		if !strings.Contains(weirdYAML, expected) {
			t.Fatalf("Weird YAML missing %q:\n%s", expected, weirdYAML)
		}
	}
	if strings.Contains(weirdYAML, "graph_constraint_") {
		t.Fatalf("Graph-Type generated Constraint leaked into Weird YAML:\n%s", weirdYAML)
	}
	transferBody, err := runtime.Kernel.ReadObject(ctx, result.State, "relationship:TRANSFERRED")
	if err != nil {
		t.Fatalf("read TRANSFERRED: %v", err)
	}
	transferYAML := string(transferBody.YAML)
	for _, expected := range []string{
		"from: \"node:Account\"",
		"to: \"node:Account\"",
		"transfer_tenant_id_key",
		"kgos_c_",
		"unique: true",
	} {
		if !strings.Contains(transferYAML, expected) {
			t.Fatalf("TRANSFERRED YAML missing %q:\n%s", expected, transferYAML)
		}
	}
	if strings.Contains(transferYAML, "graph_constraint_") {
		t.Fatalf("Graph-Type generated Relationship Constraint leaked:\n%s", transferYAML)
	}

	employeeBody, err := runtime.Kernel.ReadObject(ctx, result.State, "node:Employee")
	if err != nil {
		t.Fatalf("read Employee for Index update: %v", err)
	}
	employeeTarget, err := kernel.ParseObjectYAML(kernel.KindNodeDefinition, employeeBody.YAML)
	if err != nil {
		t.Fatalf("parse Employee canonical body: %v", err)
	}
	updatedIndexes := make([]kernel.Index, 0, len(employeeTarget.Definition.Indexes))
	for _, index := range employeeTarget.Definition.Indexes {
		switch index.Name {
		case "people_semantic":
			continue
		case "people_text":
			index.Properties = []string{"name"}
		}
		updatedIndexes = append(updatedIndexes, index)
	}
	employeeTarget.Definition.Indexes = updatedIndexes
	employeeTargetYAML, err := kernel.RenderObjectYAML(employeeTarget)
	if err != nil {
		t.Fatalf("render Employee Index update: %v", err)
	}
	updated, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: result.State,
		Branch:    "main",
		Patch: replaceObjectPatch(
			"node:Employee",
			string(employeeBody.YAML),
			string(employeeTargetYAML),
		),
	})
	if err != nil {
		t.Fatalf("update/delete shared Index definitions: %v", err)
	}
	for _, ref := range []string{"node:Employee", "node:Manager"} {
		body, readErr := runtime.Kernel.ReadObject(ctx, updated.State, ref)
		if readErr != nil {
			t.Fatalf("read %s after Index update: %v", ref, readErr)
		}
		text := string(body.YAML)
		if strings.Contains(text, "people_semantic") {
			t.Fatalf("%s retained deleted people_semantic:\n%s", ref, text)
		}
		if !strings.Contains(text, "people_text") ||
			!strings.Contains(text, "properties:\n      - \"name\"") ||
			strings.Contains(text, "- \"team\"") {
			t.Fatalf("%s shared Full-text update not reflected:\n%s", ref, text)
		}
	}
	if got := querySingleInt(
		t,
		runtime,
		updated.State,
		"SHOW ALL INDEXES YIELD name WHERE name IN ['people_text','people_semantic'] RETURN count(name) AS value",
	); got != 1 {
		t.Fatalf("shared search Index count after update/delete = %d, want 1", got)
	}
}

func TestPhase02SearchHiddenConfigSurvivesRuntimeDefaultChanges(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	document := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Document",
			Properties: []kernel.Property{
				{
					Name: "content",
					Type: "STRING",
					Indexes: []kernel.Index{
						{Name: "document_text", Type: "fulltext"},
						{Name: "document_semantic", Type: "vector"},
					},
				},
				{Name: "title", Type: "STRING"},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:document", document),
	})
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("create search indexes: %v", err)
	}
	before := queryIndexOptions(t, runtime, created.State, "document_text", "document_semantic")
	body, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Document")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("read Document: %v", err)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close runtime: %v", err)
	}

	configPath := filepath.Join(home, "config.toml")
	configBody, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	changedConfig := strings.Replace(string(configBody), "analyzer = \"unicode61\"", "analyzer = \"porter\"", 1)
	changedConfig = strings.Replace(changedConfig, "model = \"phase02-fixture\"", "model = \"phase02-fixture-v2\"", 1)
	changedConfig = strings.Replace(changedConfig, "dimensions = 3", "dimensions = 4", 1)
	if changedConfig == string(configBody) {
		t.Fatal("runtime default fixture did not change")
	}
	if err := os.WriteFile(configPath, []byte(changedConfig), 0o600); err != nil {
		t.Fatalf("rewrite config: %v", err)
	}

	reopened, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("reopen with changed defaults: %v", err)
	}
	defer reopened.Close()
	reopenedBody, err := reopened.Kernel.ReadObject(ctx, created.State, "node:Document")
	if err != nil {
		t.Fatalf("read historical Document with changed defaults: %v", err)
	}
	if string(reopenedBody.YAML) != string(body.YAML) {
		t.Fatalf("public Object changed after runtime defaults changed:\nold:\n%s\nnew:\n%s", body.YAML, reopenedBody.YAML)
	}
	updatedYAML := strings.Replace(
		string(reopenedBody.YAML),
		"name: \"Document\"\n",
		"name: \"Document\"\ndescription: \"updated without touching search indexes\"\n",
		1,
	)
	updated, err := reopened.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Document", string(reopenedBody.YAML), updatedYAML),
	})
	if err != nil {
		t.Fatalf("unrelated update after runtime defaults changed: %v", err)
	}
	after := queryIndexOptions(t, reopened, updated.State, "document_text", "document_semantic")
	if len(before) != len(after) {
		t.Fatalf("index options count changed: before=%#v after=%#v", before, after)
	}
	for name, oldOptions := range before {
		if after[name] != oldOptions {
			t.Fatalf("hidden options for %s changed:\nold=%s\nnew=%s", name, oldOptions, after[name])
		}
	}
}

func TestPhase02RenameMaintainsKnowledgeAndBindingIdentity(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Person",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:person", person),
	})
	if err != nil {
		t.Fatalf("create Person: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Person {name:'Alice'}) FINISH",
	}); err != nil {
		t.Fatalf("seed Person data: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	if seeded == created.State {
		t.Fatal("seeding Knowledge did not advance main")
	}
	if count := querySingleInt(t, runtime, seeded, "MATCH (n:Person) RETURN count(n) AS value"); count != 1 {
		t.Fatalf("seeded Person count = %d", count)
	}
	if got := querySingleString(t, runtime, seeded, "MATCH (n:Person) RETURN n.name AS value"); got != "Alice" {
		t.Fatalf("seeded Person name = %q", got)
	}
	propertyBindingBefore := querySingleString(
		t,
		runtime,
		seeded,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Person' AND p.__kgos_name='name' RETURN elementId(p) AS value",
	)

	body, err := runtime.Kernel.ReadObject(ctx, seeded, "node:Person")
	if err != nil {
		t.Fatalf("read Person body: %v", err)
	}
	targetYAML := strings.Replace(
		string(body.YAML),
		"  - name: \"name\"\n    type: \"STRING\"",
		"  - name: \"displayName\"\n    type: \"STRING\"\n    renameFrom: \"name\"",
		1,
	)
	propertyRename, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Person", string(body.YAML), targetYAML),
	})
	if err != nil {
		t.Fatalf("rename Property: %v", err)
	}
	if got := querySingleString(
		t,
		runtime,
		propertyRename.State,
		"MATCH (n:Person) RETURN n.displayName AS value",
	); got != "Alice" {
		t.Fatalf("renamed property value = %q", got)
	}
	if !querySingleNull(
		t,
		runtime,
		propertyRename.State,
		"MATCH (n:Person) RETURN n.name AS value",
	) {
		t.Fatal("old property remains after rename")
	}
	propertyBindingAfter := querySingleString(
		t,
		runtime,
		propertyRename.State,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Person' AND p.__kgos_name='displayName' RETURN elementId(p) AS value",
	)
	if propertyBindingAfter != propertyBindingBefore {
		t.Fatalf("Property Binding identity changed: %q -> %q", propertyBindingBefore, propertyBindingAfter)
	}

	definitionBindingBefore := querySingleString(
		t,
		runtime,
		propertyRename.State,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_kind='node' AND d.__kgos_name='Person' "+
			"RETURN elementId(d) AS value",
	)
	body, err = runtime.Kernel.ReadObject(ctx, propertyRename.State, "node:Person")
	if err != nil {
		t.Fatalf("read Person before Definition rename: %v", err)
	}
	renamedBody := strings.Replace(string(body.YAML), "name: \"Person\"", "name: \"Human\"", 1)
	definitionRename, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: propertyRename.State,
		Branch:    "main",
		Patch: renameObjectPatch(
			"node:Person",
			"node:Human",
			string(body.YAML),
			renamedBody,
		),
	})
	if err != nil {
		t.Fatalf("rename Definition: %v", err)
	}
	if got := querySingleString(
		t,
		runtime,
		definitionRename.State,
		"MATCH (n:Human) RETURN n.displayName AS value",
	); got != "Alice" {
		t.Fatalf("renamed Definition data = %q", got)
	}
	if count := querySingleInt(
		t,
		runtime,
		definitionRename.State,
		"MATCH (n:Person) RETURN count(n) AS value",
	); count != 0 {
		t.Fatalf("old Person label still matches %d nodes", count)
	}
	definitionBindingAfter := querySingleString(
		t,
		runtime,
		definitionRename.State,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_kind='node' AND d.__kgos_name='Human' "+
			"RETURN elementId(d) AS value",
	)
	if definitionBindingAfter != definitionBindingBefore {
		t.Fatalf("Definition Binding identity changed: %q -> %q", definitionBindingBefore, definitionBindingAfter)
	}
}

func TestPhase02NodeRenameMaintainsDomainAndRelationshipEndpoint(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	domain := kernel.ObjectValue{
		Kind: kernel.KindDomain,
		Domain: &kernel.Domain{
			Name: "Content",
			Includes: []string{
				"new:node-definition:person",
				"new:node-definition:document",
				"new:relationship-definition:authored",
			},
		},
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Person",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	document := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Document",
			Properties:  []kernel.Property{{Name: "title", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	from := "new:node-definition:person"
	to := "new:node-definition:document"
	authored := kernel.ObjectValue{
		Kind: kernel.KindRelationshipDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindRelationshipDefinition,
			Name:        "AUTHORED",
			From:        &from,
			To:          &to,
			Properties:  []kernel.Property{{Name: "since", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: strings.Join([]string{
			addObjectPatch(t, "new:domain:content", domain),
			addObjectPatch(t, "new:node-definition:person", person),
			addObjectPatch(t, "new:node-definition:document", document),
			addObjectPatch(t, "new:relationship-definition:authored", authored),
		}, ""),
	})
	if err != nil {
		t.Fatalf("create rename fixture: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (p:Person {name:'Alice'}), (d:Document {title:'Doc'}), (p)-[:AUTHORED {since:'2025'}]->(d) FINISH",
	}); err != nil {
		t.Fatalf("seed rename fixture data: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	if seeded == created.State {
		t.Fatal("seeding rename fixture did not advance main")
	}
	personBody, err := runtime.Kernel.ReadObject(ctx, seeded, "node:Person")
	if err != nil {
		t.Fatalf("read Person: %v", err)
	}
	humanBody := strings.Replace(string(personBody.YAML), "name: \"Person\"", "name: \"Human\"", 1)
	renamed, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     renameObjectPatch("node:Person", "node:Human", string(personBody.YAML), humanBody),
	})
	if err != nil {
		t.Fatalf("rename Person to Human: %v", err)
	}
	if got := querySingleInt(t, runtime, renamed.State, "MATCH (n:Human) RETURN count(n) AS value"); got != 1 {
		t.Fatalf("Human count = %d, want 1", got)
	}
	if got := querySingleInt(t, runtime, renamed.State, "MATCH (n:Person) RETURN count(n) AS value"); got != 0 {
		t.Fatalf("Person count after rename = %d", got)
	}
	if got := querySingleString(
		t,
		runtime,
		renamed.State,
		"MATCH (h:Human)-[r:AUTHORED]->(d:Document) RETURN h.name AS value",
	); got != "Alice" {
		t.Fatalf("relationship source after node rename = %q", got)
	}
	domainBody, err := runtime.Kernel.ReadObject(ctx, renamed.State, "domain:Content")
	if err != nil {
		t.Fatalf("read Domain after rename: %v", err)
	}
	if strings.Contains(string(domainBody.YAML), "node:Person") ||
		!strings.Contains(string(domainBody.YAML), "node:Human") {
		t.Fatalf("Domain refs after rename:\n%s", domainBody.YAML)
	}
	relBody, err := runtime.Kernel.ReadObject(ctx, renamed.State, "relationship:AUTHORED")
	if err != nil {
		t.Fatalf("read Relationship after endpoint rename: %v", err)
	}
	if strings.Contains(string(relBody.YAML), "node:Person") ||
		!strings.Contains(string(relBody.YAML), "node:Human") {
		t.Fatalf("Relationship endpoint after rename:\n%s", relBody.YAML)
	}
}

func TestPhase02RelationshipTypeRenamePreservesKnowledgeAndBinding(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Person",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	document := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Document",
			Properties:  []kernel.Property{{Name: "title", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	from := "new:node-definition:person"
	to := "new:node-definition:document"
	authored := kernel.ObjectValue{
		Kind: kernel.KindRelationshipDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindRelationshipDefinition,
			Name:        "AUTHORED",
			From:        &from,
			To:          &to,
			Properties:  []kernel.Property{{Name: "since", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: strings.Join([]string{
			addObjectPatch(t, "new:node-definition:person", person),
			addObjectPatch(t, "new:node-definition:document", document),
			addObjectPatch(t, "new:relationship-definition:authored", authored),
		}, ""),
	}); err != nil {
		t.Fatalf("create relationship rename fixture: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (p:Person {name:'Alice'}), (d:Document {title:'Doc'}), (p)-[:AUTHORED {since:'2025'}]->(d) FINISH",
	}); err != nil {
		t.Fatalf("seed relationship rename fixture: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	bindingBefore := querySingleString(
		t,
		runtime,
		seeded,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_kind='relationship' AND d.__kgos_name='AUTHORED' RETURN elementId(d) AS value",
	)
	body, err := runtime.Kernel.ReadObject(ctx, seeded, "relationship:AUTHORED")
	if err != nil {
		t.Fatalf("read AUTHORED: %v", err)
	}
	target := strings.Replace(string(body.YAML), "name: \"AUTHORED\"", "name: \"WROTE\"", 1)
	renamed, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     renameObjectPatch("relationship:AUTHORED", "relationship:WROTE", string(body.YAML), target),
	})
	if err != nil {
		t.Fatalf("rename relationship type: %v", err)
	}
	if got := querySingleInt(t, runtime, renamed.State, "MATCH ()-[r:AUTHORED]->() RETURN count(r) AS value"); got != 0 {
		t.Fatalf("old relationship count = %d", got)
	}
	if got := querySingleInt(t, runtime, renamed.State, "MATCH ()-[r:WROTE]->() RETURN count(r) AS value"); got != 1 {
		t.Fatalf("new relationship count = %d, want 1", got)
	}
	if got := querySingleString(
		t,
		runtime,
		renamed.State,
		"MATCH (p:Person)-[r:WROTE]->(d:Document) RETURN r.since AS value",
	); got != "2025" {
		t.Fatalf("relationship property after type rename = %q", got)
	}
	bindingAfter := querySingleString(
		t,
		runtime,
		renamed.State,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_kind='relationship' AND d.__kgos_name='WROTE' RETURN elementId(d) AS value",
	)
	if bindingAfter != bindingBefore {
		t.Fatalf("Relationship Definition Binding changed: %q -> %q", bindingBefore, bindingAfter)
	}
}

func TestPhase02PropertyRenameSwapPreservesValuesAndBindings(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	pair := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Pair",
			Properties: []kernel.Property{
				{Name: "a", Type: "STRING"},
				{Name: "b", Type: "STRING"},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:pair", pair),
	})
	if err != nil {
		t.Fatalf("create Pair: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Pair {a:'A', b:'B'}) FINISH",
	}); err != nil {
		t.Fatalf("seed Pair: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	if seeded == created.State {
		t.Fatal("seeding Pair did not advance main")
	}
	oldA := querySingleString(
		t,
		runtime,
		seeded,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Pair' AND p.__kgos_name='a' RETURN elementId(p) AS value",
	)
	oldB := querySingleString(
		t,
		runtime,
		seeded,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Pair' AND p.__kgos_name='b' RETURN elementId(p) AS value",
	)
	body, err := runtime.Kernel.ReadObject(ctx, seeded, "node:Pair")
	if err != nil {
		t.Fatalf("read Pair: %v", err)
	}
	target := strings.Replace(
		string(body.YAML),
		"  - name: \"a\"\n    type: \"STRING\"",
		"  - name: \"a\"\n    type: \"STRING\"\n    renameFrom: \"b\"",
		1,
	)
	target = strings.Replace(
		target,
		"  - name: \"b\"\n    type: \"STRING\"",
		"  - name: \"b\"\n    type: \"STRING\"\n    renameFrom: \"a\"",
		1,
	)
	swapped, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Pair", string(body.YAML), target),
	})
	if err != nil {
		t.Fatalf("swap Pair properties: %v\n%s", err, target)
	}
	if got := querySingleString(t, runtime, swapped.State, "MATCH (n:Pair) RETURN n.a AS value"); got != "B" {
		t.Fatalf("Pair.a after swap = %q, want B", got)
	}
	if got := querySingleString(t, runtime, swapped.State, "MATCH (n:Pair) RETURN n.b AS value"); got != "A" {
		t.Fatalf("Pair.b after swap = %q, want A", got)
	}
	newA := querySingleString(
		t,
		runtime,
		swapped.State,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Pair' AND p.__kgos_name='a' RETURN elementId(p) AS value",
	)
	newB := querySingleString(
		t,
		runtime,
		swapped.State,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='Pair' AND p.__kgos_name='b' RETURN elementId(p) AS value",
	)
	if newA != oldB || newB != oldA {
		t.Fatalf("Binding identities did not follow sources: oldA=%q oldB=%q newA=%q newB=%q", oldA, oldB, newA, newB)
	}
	canonical, err := runtime.Kernel.ReadObject(ctx, swapped.State, "node:Pair")
	if err != nil {
		t.Fatalf("read swapped Pair: %v", err)
	}
	if strings.Contains(string(canonical.YAML), "renameFrom") {
		t.Fatalf("input-only renameFrom leaked into canonical body:\n%s", canonical.YAML)
	}
}

func TestPhase02PropertyRenameRejectsOverlappingDefinitionDataLoss(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	left := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Left",
			Properties:  []kernel.Property{{Name: "x", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	right := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Right",
			Properties:  []kernel.Property{{Name: "x", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: addObjectPatch(t, "new:node-definition:left", left) +
			addObjectPatch(t, "new:node-definition:right", right),
	}); err != nil {
		t.Fatalf("create overlap definitions: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Left:Right {x:'shared'}) FINISH",
	}); err != nil {
		t.Fatalf("seed overlap node: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve overlap state: %v", err)
	}
	body, err := runtime.Kernel.ReadObject(ctx, seeded, "node:Left")
	if err != nil {
		t.Fatalf("read Left: %v", err)
	}
	target := strings.Replace(
		string(body.YAML),
		"  - name: \"x\"\n    type: \"STRING\"",
		"  - name: \"y\"\n    type: \"STRING\"\n    renameFrom: \"x\"",
		1,
	)
	_, err = runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Left", string(body.YAML), target),
	})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectConflict {
		t.Fatalf("overlap rename error = %v", err)
	}
	assertMainState(t, runtime, seeded)
	if got := querySingleString(t, runtime, seeded, "MATCH (n:Left:Right) RETURN n.x AS value"); got != "shared" {
		t.Fatalf("overlap x changed after rejected rename = %q", got)
	}
}

func TestPhase02RelationshipRenamePreservesKnowledgeAndBinding(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Person",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	document := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Document",
			Properties:  []kernel.Property{{Name: "id", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	from := "new:node-definition:person"
	to := "new:node-definition:document"
	authored := kernel.ObjectValue{
		Kind: kernel.KindRelationshipDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindRelationshipDefinition,
			Name:        "AUTHORED",
			From:        &from,
			To:          &to,
			Properties:  []kernel.Property{{Name: "role", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	patch := addObjectPatch(t, "new:node-definition:person", person) +
		addObjectPatch(t, "new:node-definition:document", document) +
		addObjectPatch(t, "new:relationship-definition:authored", authored)
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: patch,
	})
	if err != nil {
		t.Fatalf("create relationship model: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (p:Person {name:'Alice'}), (d:Document {id:'D1'}), (p)-[:AUTHORED {role:'author'}]->(d) FINISH",
	}); err != nil {
		t.Fatalf("seed relationship Knowledge: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	if seeded == created.State {
		t.Fatal("seeding relationship Knowledge did not advance main")
	}
	bindingBefore := querySingleString(
		t, runtime, seeded,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_kind='relationship' AND d.__kgos_name='AUTHORED' RETURN elementId(d) AS value",
	)
	propertyBindingBefore := querySingleString(
		t, runtime, seeded,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_kind='relationship' AND d.__kgos_name='AUTHORED' AND p.__kgos_name='role' "+
			"RETURN elementId(p) AS value",
	)
	body, err := runtime.Kernel.ReadObject(ctx, seeded, "relationship:AUTHORED")
	if err != nil {
		t.Fatalf("read AUTHORED: %v", err)
	}
	propertyRenamedBody := strings.Replace(
		string(body.YAML),
		"  - name: \"role\"\n    type: \"STRING\"",
		"  - name: \"kind\"\n    type: \"STRING\"\n    renameFrom: \"role\"",
		1,
	)
	propertyRenamed, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch: replaceObjectPatch(
			"relationship:AUTHORED",
			string(body.YAML),
			propertyRenamedBody,
		),
	})
	if err != nil {
		t.Fatalf("rename Relationship Property: %v", err)
	}
	if got := querySingleString(
		t, runtime, propertyRenamed.State,
		"MATCH (:Person)-[r:AUTHORED]->(:Document) RETURN r.kind AS value",
	); got != "author" {
		t.Fatalf("renamed Relationship Property value = %q", got)
	}
	if !querySingleNull(
		t, runtime, propertyRenamed.State,
		"MATCH (:Person)-[r:AUTHORED]->(:Document) RETURN r.role AS value",
	) {
		t.Fatal("old Relationship Property remains after rename")
	}
	propertyBindingAfter := querySingleString(
		t, runtime, propertyRenamed.State,
		"MATCH (p:__kgos_property_binding)-[:__kgos_property_of]->(d:__kgos_definition_binding) "+
			"WHERE d.__kgos_kind='relationship' AND d.__kgos_name='AUTHORED' AND p.__kgos_name='kind' "+
			"RETURN elementId(p) AS value",
	)
	if propertyBindingAfter != propertyBindingBefore {
		t.Fatalf(
			"Relationship Property Binding identity changed: %q -> %q",
			propertyBindingBefore,
			propertyBindingAfter,
		)
	}
	body, err = runtime.Kernel.ReadObject(ctx, propertyRenamed.State, "relationship:AUTHORED")
	if err != nil {
		t.Fatalf("read AUTHORED after Property rename: %v", err)
	}
	renamedBody := strings.Replace(string(body.YAML), "name: \"AUTHORED\"", "name: \"WROTE\"", 1)
	renamed, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: propertyRenamed.State,
		Branch:    "main",
		Patch: renameObjectPatch(
			"relationship:AUTHORED",
			"relationship:WROTE",
			string(body.YAML),
			renamedBody,
		),
	})
	if err != nil {
		t.Fatalf("rename Relationship Definition: %v", err)
	}
	if got := querySingleInt(t, runtime, renamed.State, "MATCH ()-[r:AUTHORED]->() RETURN count(r) AS value"); got != 0 {
		t.Fatalf("old AUTHORED relationship count = %d", got)
	}
	if got := querySingleInt(t, runtime, renamed.State, "MATCH (:Person)-[r:WROTE]->(:Document) RETURN count(r) AS value"); got != 1 {
		t.Fatalf("WROTE relationship count = %d", got)
	}
	if got := querySingleString(t, runtime, renamed.State, "MATCH (:Person)-[r:WROTE]->(:Document) RETURN r.kind AS value"); got != "author" {
		t.Fatalf("WROTE kind = %q", got)
	}
	bindingAfter := querySingleString(
		t, runtime, renamed.State,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_kind='relationship' AND d.__kgos_name='WROTE' RETURN elementId(d) AS value",
	)
	if bindingAfter != bindingBefore {
		t.Fatalf("Relationship Definition Binding identity changed: %q -> %q", bindingBefore, bindingAfter)
	}
}

func TestPhase02DeleteWithKnowledgeFailsWithoutAdvancingBranch(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Person",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:person", person),
	}); err != nil {
		t.Fatalf("create Person: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Person {name:'Alice'}) FINISH",
	}); err != nil {
		t.Fatalf("seed Person: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	if count := querySingleInt(t, runtime, seeded, "MATCH (n:Person) RETURN count(n) AS value"); count != 1 {
		t.Fatalf("seeded Person count = %d", count)
	}
	body, err := runtime.Kernel.ReadObject(ctx, seeded, "node:Person")
	if err != nil {
		t.Fatalf("read Person: %v", err)
	}
	_, err = runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     deleteObjectPatch("node:Person", string(body.YAML)),
	})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectConflict {
		t.Fatalf("delete error = %v", err)
	}
	after, resolveErr := runtime.Database.ResolveState(ctx, "branch/main")
	if resolveErr != nil {
		t.Fatalf("resolve after failed delete: %v", resolveErr)
	}
	if after != seeded {
		t.Fatalf("failed delete moved branch: before=%q after=%q", seeded, after)
	}
}

func TestPhase02PropertyDeleteDataSafety(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Person",
			Properties: []kernel.Property{
				{Name: "keep", Type: "STRING"},
				{Name: "used", Type: "STRING"},
				{Name: "unused", Type: "STRING"},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:person", person),
	}); err != nil {
		t.Fatalf("create Person: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Person {keep:'K', used:'U'}) FINISH",
	}); err != nil {
		t.Fatalf("seed Person: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	body, err := runtime.Kernel.ReadObject(ctx, seeded, "node:Person")
	if err != nil {
		t.Fatalf("read Person: %v", err)
	}
	value, err := kernel.ParseObjectYAML(kernel.KindNodeDefinition, body.YAML)
	if err != nil {
		t.Fatalf("parse Person: %v", err)
	}
	byName := map[string]kernel.Property{}
	for _, property := range value.Definition.Properties {
		byName[property.Name] = property
	}

	usedRemoved := *value.Definition
	usedRemoved.Properties = []kernel.Property{byName["keep"], byName["unused"]}
	usedYAML, err := kernel.RenderObjectYAML(kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition, Definition: &usedRemoved,
	})
	if err != nil {
		t.Fatalf("render used-delete target: %v", err)
	}
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Person", string(body.YAML), string(usedYAML)),
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectConflict {
		t.Fatalf("used Property delete error = %v", err)
	}
	assertMainState(t, runtime, seeded)

	unusedRemoved := *value.Definition
	unusedRemoved.Properties = []kernel.Property{byName["keep"], byName["used"]}
	unusedYAML, err := kernel.RenderObjectYAML(kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition, Definition: &unusedRemoved,
	})
	if err != nil {
		t.Fatalf("render unused-delete target: %v", err)
	}
	updated, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Person", string(body.YAML), string(unusedYAML)),
	})
	if err != nil {
		t.Fatalf("delete unused Property: %v", err)
	}
	canonical, err := runtime.Kernel.ReadObject(ctx, updated.State, "node:Person")
	if err != nil {
		t.Fatalf("read Person after unused Property delete: %v", err)
	}
	if strings.Contains(string(canonical.YAML), "name: \"unused\"") ||
		!strings.Contains(string(canonical.YAML), "name: \"used\"") {
		t.Fatalf("unexpected Person body after Property delete:\n%s", canonical.YAML)
	}
}

func TestPhase02ModelTighteningWithExistingKnowledgeFailsClosed(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "Person",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:person", person),
	}); err != nil {
		t.Fatalf("create Person: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Person) FINISH",
	}); err != nil {
		t.Fatalf("seed Person without name: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded state: %v", err)
	}
	body, err := runtime.Kernel.ReadObject(ctx, seeded, "node:Person")
	if err != nil {
		t.Fatalf("read Person: %v", err)
	}
	requiredBody := strings.Replace(
		string(body.YAML),
		"  - name: \"name\"\n    type: \"STRING\"",
		"  - name: \"name\"\n    type: \"STRING\"\n    required: true",
		1,
	)
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Person", string(body.YAML), requiredBody),
	}); err == nil || kernel.AsPublicError(err).Code == kernel.CodeInternal {
		t.Fatalf("required tightening error = %v", err)
	}
	assertMainState(t, runtime, seeded)

	labelBody := strings.Replace(
		string(body.YAML),
		"name: \"Person\"\n",
		"name: \"Person\"\nlabels:\n  - \"Active\"\n",
		1,
	)
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: seeded,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Person", string(body.YAML), labelBody),
	}); err == nil || kernel.AsPublicError(err).Code == kernel.CodeInternal {
		t.Fatalf("label tightening error = %v", err)
	}
	assertMainState(t, runtime, seeded)
}

func assertMainState(t *testing.T, runtime *runtimehost.Runtime, want string) {
	t.Helper()
	state, err := runtime.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatalf("resolve main: %v", err)
	}
	if state != want {
		t.Fatalf("main = %q, want %q", state, want)
	}
}

func TestPhase02OntologyCreateReadAndReopen(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve bootstrap state: %v", err)
	}
	assertCommitMetadata(t, runtime, base, nil, nil)
	empty, err := runtime.Kernel.ReadOntology(ctx, kernel.OntologyReadRequest{At: base})
	if err != nil {
		t.Fatalf("read empty Ontology: %v", err)
	}
	if empty.State != base || len(empty.Results) != 1 || empty.Results[0].Total != 0 {
		t.Fatalf("empty Ontology = %#v", empty)
	}

	domain := kernel.ObjectValue{
		Kind: kernel.KindDomain,
		Domain: &kernel.Domain{
			Name: "Content",
			Includes: []string{
				"new:node-definition:document",
				"new:node-definition:person",
				"new:relationship-definition:authored",
			},
		},
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Person",
			Properties: []kernel.Property{
				{Name: "name", Type: "STRING", Required: true, Unique: true},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	document := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition,
			Name: "Document",
			Properties: []kernel.Property{
				{
					Name: "content",
					Type: "STRING",
					Indexes: []kernel.Index{
						{Name: "document_text", Type: "fulltext"},
						{Name: "document_semantic", Type: "vector"},
					},
				},
				{Name: "id", Type: "STRING", Required: true, Unique: true},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	from := "new:node-definition:person"
	to := "new:node-definition:document"
	authored := kernel.ObjectValue{
		Kind: kernel.KindRelationshipDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindRelationshipDefinition,
			Name: "AUTHORED",
			From: &from,
			To:   &to,
			Properties: []kernel.Property{
				{Name: "since", Type: "DATE"},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	patch := strings.Join([]string{
		addObjectPatch(t, "new:relationship-definition:authored", authored),
		addObjectPatch(t, "new:domain:content", domain),
		addObjectPatch(t, "new:node-definition:document", document),
		addObjectPatch(t, "new:node-definition:person", person),
	}, "")
	author := "phase02-test"
	message := "create ontology"
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     patch,
		Author:    &author,
		Message:   &message,
	})
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("create Ontology: %v\n%s", err, patch)
	}
	if created.State == base || len(created.Created) != 4 {
		_ = runtime.Close()
		t.Fatalf("create result = %#v", created)
	}
	assertCommitMetadata(t, runtime, created.State, &author, &message)
	read, err := runtime.Kernel.ReadOntology(ctx, kernel.OntologyReadRequest{
		At:   created.State,
		Refs: []string{"domain:Content", "node:Document", "relationship:AUTHORED"},
	})
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("read created Ontology: %v", err)
	}
	if len(read.Results) != 3 || read.Results[0].Total != 3 {
		_ = runtime.Close()
		t.Fatalf("read result = %#v", read)
	}
	pageOne, err := runtime.Kernel.ReadOntology(ctx, kernel.OntologyReadRequest{
		At:    created.State,
		Refs:  []string{"domain:Content"},
		Limit: 1,
	})
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("read Domain first page: %v", err)
	}
	if len(pageOne.Results) != 1 ||
		pageOne.Results[0].Total != 3 ||
		len(pageOne.Results[0].Items) != 1 ||
		pageOne.Results[0].Cursor == "" {
		_ = runtime.Close()
		t.Fatalf("Domain first page = %#v", pageOne)
	}
	pageTwo, err := runtime.Kernel.ReadOntology(ctx, kernel.OntologyReadRequest{
		At:     created.State,
		Refs:   []string{"domain:Content"},
		Limit:  1,
		Cursor: pageOne.Results[0].Cursor,
	})
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("read Domain second page: %v", err)
	}
	if len(pageTwo.Results) != 1 ||
		len(pageTwo.Results[0].Items) != 1 ||
		pageTwo.Results[0].Items[0].Ref == pageOne.Results[0].Items[0].Ref {
		_ = runtime.Close()
		t.Fatalf("Domain second page = %#v", pageTwo)
	}
	body, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Document")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("read canonical Document body: %v", err)
	}
	if !strings.Contains(string(body.YAML), "document_text") ||
		!strings.Contains(string(body.YAML), "document_semantic") {
		_ = runtime.Close()
		t.Fatalf("Document YAML = %s", body.YAML)
	}
	personBody, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Person")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("read canonical Person body: %v", err)
	}
	if !strings.Contains(string(personBody.YAML), "required: true") ||
		!strings.Contains(string(personBody.YAML), "unique: true") ||
		strings.Contains(string(personBody.YAML), "graph_constraint_") {
		_ = runtime.Close()
		t.Fatalf("Person boolean Constraint round-trip = %s", personBody.YAML)
	}
	ignoredAuthor := "must-not-create-a-commit"
	ignoredMessage := "no-op metadata"
	noOp, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Document", string(body.YAML), string(body.YAML)),
		Author:    &ignoredAuthor,
		Message:   &ignoredMessage,
	})
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("no-op Patch: %v", err)
	}
	if noOp.State != created.State {
		_ = runtime.Close()
		t.Fatalf("no-op state = %q, want %q", noOp.State, created.State)
	}
	headAfterNoOp, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve after no-op: %v", err)
	}
	if headAfterNoOp != created.State {
		_ = runtime.Close()
		t.Fatalf("no-op moved main to %q, want %q", headAfterNoOp, created.State)
	}
	assertCommitMetadata(t, runtime, created.State, &author, &message)
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     patch,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
		_ = runtime.Close()
		t.Fatalf("stale Patch error = %v", err)
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := runtime.Kernel.PatchOntology(canceled, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Document", string(body.YAML), string(body.YAML)),
	}); err == nil {
		_ = runtime.Close()
		t.Fatal("canceled Ontology Patch unexpectedly succeeded")
	}
	headAfterCancel, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		_ = runtime.Close()
		t.Fatalf("resolve after canceled Patch: %v", err)
	}
	if headAfterCancel != created.State {
		_ = runtime.Close()
		t.Fatalf("canceled Patch moved main to %q, want %q", headAfterCancel, created.State)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close runtime: %v", err)
	}

	reopened, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("reopen runtime: %v", err)
	}
	defer reopened.Close()
	reopenedState, err := reopened.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve reopened main: %v", err)
	}
	if reopenedState != created.State {
		t.Fatalf("reopened state = %q, want %q", reopenedState, created.State)
	}
	if _, err := reopened.Kernel.ReadObject(ctx, reopenedState, "node:Document"); err != nil {
		t.Fatalf("read after reopen: %v", err)
	}
}

func addObjectPatch(t *testing.T, target string, value kernel.ObjectValue) string {
	t.Helper()
	body, err := kernel.RenderObjectYAML(value)
	if err != nil {
		t.Fatalf("render %s: %v", target, err)
	}
	lines := strings.Split(strings.TrimSuffix(string(body), "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", target, target)
	patch.WriteString("new file mode 100644\n")
	patch.WriteString("--- /dev/null\n")
	fmt.Fprintf(&patch, "+++ b/%s\n", target)
	fmt.Fprintf(&patch, "@@ -0,0 +1,%d @@\n", len(lines))
	for _, line := range lines {
		patch.WriteString("+")
		patch.WriteString(line)
		patch.WriteByte('\n')
	}
	return patch.String()
}

func replaceObjectPatch(target, oldBody, newBody string) string {
	oldLines := strings.Split(strings.TrimSuffix(oldBody, "\n"), "\n")
	newLines := strings.Split(strings.TrimSuffix(newBody, "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", target, target)
	fmt.Fprintf(&patch, "--- a/%s\n+++ b/%s\n", target, target)
	fmt.Fprintf(&patch, "@@ -1,%d +1,%d @@\n", len(oldLines), len(newLines))
	for _, line := range oldLines {
		patch.WriteString("-")
		patch.WriteString(line)
		patch.WriteByte('\n')
	}
	for _, line := range newLines {
		patch.WriteString("+")
		patch.WriteString(line)
		patch.WriteByte('\n')
	}
	return patch.String()
}

func renameObjectPatch(oldRef, newRef, oldBody, newBody string) string {
	oldLines := strings.Split(strings.TrimSuffix(oldBody, "\n"), "\n")
	newLines := strings.Split(strings.TrimSuffix(newBody, "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", oldRef, newRef)
	fmt.Fprintf(&patch, "rename from %s\nrename to %s\n", oldRef, newRef)
	fmt.Fprintf(&patch, "--- a/%s\n+++ b/%s\n", oldRef, newRef)
	fmt.Fprintf(&patch, "@@ -1,%d +1,%d @@\n", len(oldLines), len(newLines))
	for _, line := range oldLines {
		patch.WriteString("-")
		patch.WriteString(line)
		patch.WriteByte('\n')
	}
	for _, line := range newLines {
		patch.WriteString("+")
		patch.WriteString(line)
		patch.WriteByte('\n')
	}
	return patch.String()
}

func deleteObjectPatch(ref, body string) string {
	lines := strings.Split(strings.TrimSuffix(body, "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", ref, ref)
	patch.WriteString("deleted file mode 100644\n")
	fmt.Fprintf(&patch, "--- a/%s\n+++ /dev/null\n", ref)
	fmt.Fprintf(&patch, "@@ -1,%d +0,0 @@\n", len(lines))
	for _, line := range lines {
		patch.WriteString("-")
		patch.WriteString(line)
		patch.WriteByte('\n')
	}
	return patch.String()
}

func querySingleString(t *testing.T, runtime *runtimehost.Runtime, state, cypher string) string {
	t.Helper()
	result, err := runtime.Database.Query(
		context.Background(),
		lithograph.QueryRequest{At: state, Cypher: cypher},
	)
	if err != nil {
		t.Fatalf("query %q: %v", cypher, err)
	}
	if len(result.Result.Rows) != 1 || len(result.Result.Rows[0]) != 1 {
		t.Fatalf("query %q rows = %#v", cypher, result.Result.Rows)
	}
	var value string
	if err := json.Unmarshal(result.Result.Rows[0][0], &value); err != nil {
		t.Fatalf("decode string result for %q: %v (%s)", cypher, err, result.Result.Rows[0][0])
	}
	return value
}

func querySingleNull(t *testing.T, runtime *runtimehost.Runtime, state, cypher string) bool {
	t.Helper()
	result, err := runtime.Database.Query(
		context.Background(),
		lithograph.QueryRequest{At: state, Cypher: cypher},
	)
	if err != nil {
		t.Fatalf("query %q: %v", cypher, err)
	}
	if len(result.Result.Rows) != 1 || len(result.Result.Rows[0]) != 1 {
		t.Fatalf("query %q rows = %#v", cypher, result.Result.Rows)
	}
	return string(result.Result.Rows[0][0]) == "null"
}

func querySingleInt(t *testing.T, runtime *runtimehost.Runtime, state, cypher string) int64 {
	t.Helper()
	result, err := runtime.Database.Query(
		context.Background(),
		lithograph.QueryRequest{At: state, Cypher: cypher},
	)
	if err != nil {
		t.Fatalf("query %q: %v", cypher, err)
	}
	if len(result.Result.Rows) != 1 || len(result.Result.Rows[0]) != 1 {
		t.Fatalf("query %q rows = %#v", cypher, result.Result.Rows)
	}
	var value int64
	if err := json.Unmarshal(result.Result.Rows[0][0], &value); err != nil {
		t.Fatalf("decode integer result for %q: %v", cypher, err)
	}
	return value
}

func assertCommitMetadata(
	t *testing.T,
	runtime *runtimehost.Runtime,
	state string,
	wantAuthor *string,
	wantMessage *string,
) {
	t.Helper()
	result, err := runtime.Database.QueryMetadata(
		context.Background(),
		"CALL lithograph.commit.get($state) YIELD author, message RETURN author, message",
		map[string]any{"state": state},
	)
	if err != nil {
		t.Fatalf("read commit metadata for %s: %v", state, err)
	}
	if len(result.Rows) != 1 {
		t.Fatalf("commit metadata rows = %d", len(result.Rows))
	}
	column := func(name string) json.RawMessage {
		for index, columnName := range result.Columns {
			if columnName == name {
				return result.Rows[0][index]
			}
		}
		t.Fatalf("commit metadata missing %s", name)
		return nil
	}
	check := func(name string, raw json.RawMessage, want *string) {
		if want == nil {
			if string(raw) != "null" {
				t.Fatalf("%s = %s, want null", name, raw)
			}
			return
		}
		var got string
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("decode %s: %v (%s)", name, err, raw)
		}
		if got != *want {
			t.Fatalf("%s = %q, want %q", name, got, *want)
		}
	}
	check("author", column("author"), wantAuthor)
	check("message", column("message"), wantMessage)
}

func queryMetadataStringList(
	t *testing.T,
	database *lithograph.Host,
	cypher string,
	params map[string]any,
) []string {
	t.Helper()
	result, err := database.QueryMetadata(context.Background(), cypher, params)
	if err != nil {
		t.Fatalf("metadata query %q: %v", cypher, err)
	}
	if len(result.Rows) != 1 || len(result.Rows[0]) != 1 {
		t.Fatalf("metadata query %q rows = %#v", cypher, result.Rows)
	}
	var values []string
	if err := json.Unmarshal(result.Rows[0][0], &values); err != nil {
		t.Fatalf("decode metadata string list for %q: %v (%s)", cypher, err, result.Rows[0][0])
	}
	return values
}

func openRawLithograph(t *testing.T, home string) *lithograph.Host {
	t.Helper()
	ctx := context.Background()
	paths, err := runtimeprofile.ResolvePaths(home)
	if err != nil {
		t.Fatalf("resolve raw Lithograph paths: %v", err)
	}
	config, err := runtimeprofile.LoadConfig(paths, nil)
	if err != nil {
		t.Fatalf("load raw Lithograph config: %v", err)
	}
	configs := append(
		kernelIntegrationOfficialExtensions(),
		config.SQLite.Extensions...,
	)
	extensions, err := runtimeprofile.ResolveExtensions(
		ctx,
		paths,
		configs,
		nil,
	)
	if err != nil {
		t.Fatalf("resolve raw Lithograph extensions: %v", err)
	}
	host, err := lithograph.Open(
		ctx,
		paths.Database,
		extensions,
		config.FullText.Analyzer,
		config.SemanticDefaults(),
	)
	if err != nil {
		t.Fatalf("open raw Lithograph: %v", err)
	}
	return host
}

func queryIndexOptions(
	t *testing.T,
	runtime *runtimehost.Runtime,
	state string,
	names ...string,
) map[string]string {
	t.Helper()
	result, err := runtime.Database.Query(context.Background(), lithograph.QueryRequest{
		At:     state,
		Cypher: "SHOW ALL INDEXES YIELD name, options RETURN name, options",
	})
	if err != nil {
		t.Fatalf("read Index options: %v", err)
	}
	nameColumn := -1
	optionsColumn := -1
	for index, column := range result.Result.Columns {
		switch column {
		case "name":
			nameColumn = index
		case "options":
			optionsColumn = index
		}
	}
	if nameColumn < 0 || optionsColumn < 0 {
		t.Fatalf("Index options result columns = %#v", result.Result.Columns)
	}
	wanted := map[string]struct{}{}
	for _, name := range names {
		wanted[name] = struct{}{}
	}
	output := map[string]string{}
	for _, row := range result.Result.Rows {
		if nameColumn >= len(row) || optionsColumn >= len(row) {
			t.Fatalf("Index options row is truncated: %#v", row)
		}
		var name string
		if err := json.Unmarshal(row[nameColumn], &name); err != nil {
			t.Fatalf("decode Index name: %v", err)
		}
		if _, ok := wanted[name]; !ok {
			continue
		}
		var options any
		if err := json.Unmarshal(row[optionsColumn], &options); err != nil {
			t.Fatalf("decode Index %s options: %v", name, err)
		}
		canonical, err := json.Marshal(options)
		if err != nil {
			t.Fatalf("canonicalize Index %s options: %v", name, err)
		}
		output[name] = string(canonical)
	}
	if len(output) != len(wanted) {
		t.Fatalf("Index options missing: got=%#v want=%#v", output, names)
	}
	return output
}

func writeKernelIntegrationConfig(t *testing.T, root string) {
	t.Helper()
	body := "[cache]\npath = \"cache/openai-compatible.db\"\nmax_size_mb = 16\n\n" +
		"[fulltext]\nanalyzer = \"unicode61\"\n\n" +
		"[embedding]\nbase_url = \"https://example.invalid/v1\"\n" +
		"model = \"phase02-fixture\"\ndimensions = 3\nsimilarity = \"cosine\"\napi_key_env = \"\"\n"
	if err := os.WriteFile(filepath.Join(root, "config.toml"), []byte(body), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
}

func openKernelIntegrationRuntime(ctx context.Context, root string) (*runtimehost.Runtime, error) {
	return runtimehost.OpenWithOfficialExtensions(
		ctx,
		root,
		kernelIntegrationOfficialExtensions(),
		nil,
	)
}

func kernelIntegrationOfficialExtensions() []runtimeprofile.ExtensionConfig {
	mainLibrary, _ := filepath.Abs(os.Getenv("KGOS_LITHOGRAPH_LIBRARY"))
	providerLibrary, _ := filepath.Abs(os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY"))
	jiebaLibrary, _ := filepath.Abs(os.Getenv("KGOS_JIEBA_LIBRARY"))
	return []runtimeprofile.ExtensionConfig{
		{Source: mainLibrary, Entrypoint: runtimeprofile.LithographEntrypoint},
		{Source: providerLibrary, Entrypoint: runtimeprofile.ProviderEntrypoint},
		{Source: jiebaLibrary, Entrypoint: runtimeprofile.JiebaEntrypoint},
	}
}
