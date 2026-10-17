import assert from "node:assert/strict";

// Execute against an explicitly disposable Instance, never the persistent KG OS Dev workspace.
// This exercises the public MCP transport, QuickJS SDK bridge and real daemon/database together.
const expectedMethods = [
  "ontology.read",
  "ontology.patch",
  "object.read",
  "object.readText",
  "object.patch",
  "graph.query",
  "graph.execute",
  "graph.streamQuery",
  "graph.streamExecute",
  "evolution.overview",
  "evolution.get",
  "evolution.ancestry",
  "evolution.history",
  "evolution.diff",
  "evolution.state.create",
  "evolution.state.setData",
  "evolution.state.clearData",
  "evolution.branch.list",
  "evolution.branch.create",
  "evolution.branch.delete",
  "evolution.tag.list",
  "evolution.tag.create",
  "evolution.tag.move",
  "evolution.tag.delete",
  "evolution.merge.start",
  "evolution.merge.list",
  "evolution.merge.get",
  "evolution.merge.conflicts",
  "evolution.merge.resolve",
  "evolution.merge.finalize",
  "evolution.merge.abort"
];

function resultValue(response) {
  if (response.isError || response.content?.[0]?.type !== "text") {
    throw new Error("MCP real SDK matrix failed: " + JSON.stringify(response).slice(0, 900));
  }
  const parsed = JSON.parse(response.content[0].text);
  assert.ok(Object.hasOwn(parsed, "result"), "SDK method must return a JSON-compatible result");
  return parsed.result;
}

function createCalls(client) {
  const exercised = new Set();
  async function run(method, args, write = false) {
    const argumentText = args === undefined ? "" : JSON.stringify(args);
    const code = "return await " + method + "(" + argumentText + ");";
    const response = await client.callTool({
      name: write ? "kgos_mutate" : "kgos_query",
      arguments: { code }
    });
    const value = resultValue(response);
    exercised.add(method);
    return value;
  }
  async function stream(method, args, write = false) {
    const code =
      "const items=[]; for await (const event of " +
      method +
      "(" +
      JSON.stringify(args) +
      ")) { items.push(event); } return items;";
    const response = await client.callTool({
      name: write ? "kgos_mutate" : "kgos_query",
      arguments: { code }
    });
    const value = resultValue(response);
    exercised.add(method);
    return value;
  }
  return { run, stream, exercised };
}

function addPatch(alias, yaml) {
  const lines = yaml.trimEnd().split("\n");
  const header = [
    "diff --git a/" + alias + " b/" + alias,
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/" + alias,
    "@@ -0,0 +1," + lines.length + " @@"
  ];
  return [...header, ...lines.map((line) => "+" + line)].join("\n") + "\n";
}

function replacePatch(ref, from, to) {
  assert.notEqual(from, to);
  const original = from.trimEnd().split("\n");
  const updated = to.trimEnd().split("\n");
  return (
    [
      "diff --git a/" + ref + " b/" + ref,
      "--- a/" + ref,
      "+++ b/" + ref,
      "@@ -1," + original.length + " +1," + updated.length + " @@",
      ...original.map((line) => "-" + line),
      ...updated.map((line) => "+" + line)
    ].join("\n") + "\n"
  );
}

async function verifyOntology(calls, branch, state) {
  const domainPatch =
    addPatch(
      "new:domain:matrix",
      'name: "SdkMatrix"\nincludes:\n  - "new:node-definition:matrix"\n'
    ) +
    addPatch(
      "new:node-definition:matrix",
      'name: "SdkMatrixItem"\nproperties:\n  - name: "name"\n    type: "STRING"\nconstraints: []\n'
    );
  const model = await calls.run(
    "ontology.patch",
    { baseState: state, branch, patch: domainPatch },
    true
  );
  assert.match(model.state, /^commit\//);
  const ontology = await calls.run("ontology.read", {
    at: model.state,
    refs: ["domain:SdkMatrix"]
  });
  assert.equal(ontology.results.length, 1);
  assert.equal(ontology.results[0].ref, "domain:SdkMatrix");
  assert.equal(ontology.results[0].items.length, 1);
  return model.state;
}

async function verifyObjects(calls, branch, state) {
  const patch = addPatch(
    "new:knowledge-node:matrix-item",
    'labels:\n  - "SdkMatrix"\nproperties:\n  "name": "Before"\n'
  );
  const created = await calls.run("object.patch", { baseState: state, branch, patch }, true);
  assert.equal(created.created.length, 1);
  const ref = created.created[0].ref;
  assert.match(ref, /^n:/);
  const item = await calls.run("object.read", { at: created.state, refs: [ref] });
  assert.equal(item.results.length, 1);
  const text = await calls.run("object.readText", { at: created.state, refs: [ref] });
  assert.equal(text.results.length, 1);
  assert.ok(text.results[0].body.includes("Before"));
  return { seedState: created.state, ref, body: text.results[0].body };
}

async function verifyGraph(calls, branch) {
  const created = await calls.run(
    "graph.execute",
    { branch, cypher: "CREATE (:SdkMatrixGraph {value:7}) RETURN 7 AS value" },
    true
  );
  assert.match(created.state, /^commit\//);
  const query = await calls.run("graph.query", {
    at: created.state,
    cypher: "MATCH (n:SdkMatrixGraph) RETURN count(n) AS count"
  });
  assert.equal(query.rows.length, 1);
  assert.equal(query.rows[0][0], 1);
  const events = await calls.stream("graph.streamQuery", {
    at: created.state,
    cypher: "UNWIND [1,2] AS n RETURN n"
  });
  assert.deepEqual(
    events.map((event) => event.type),
    ["columns", "row", "row", "summary"]
  );
  assert.equal(events.at(-1).state, created.state);

  const written = await calls.stream(
    "graph.streamExecute",
    { branch, cypher: "CREATE (:SdkMatrixStream {value:11}) RETURN 11 AS value" },
    true
  );
  assert.deepEqual(
    written.map((event) => event.type),
    ["columns", "row", "summary"]
  );
  assert.match(written.at(-1).state, /^commit\//);
  return written.at(-1).state;
}

async function verifyEvolution(calls, branch, origin) {
  const overview = await calls.run("evolution.overview");
  assert.equal(overview.state, origin);
  const created = await calls.run("evolution.branch.create", { name: branch, from: origin }, true);
  assert.equal(created.name, branch);
  const listed = await calls.run("evolution.branch.list");
  assert.ok(listed.items.some((item) => item.name === branch));

  const marked = await calls.run(
    "evolution.state.create",
    { branch, data: { acceptance: "mcp-sdk-matrix" }, author: "SDK matrix", message: "State data" },
    true
  );
  const detail = await calls.run("evolution.get", { state: marked.state });
  assert.equal(detail.data.acceptance, "mcp-sdk-matrix");
  const updated = await calls.run(
    "evolution.state.setData",
    { state: marked.state, data: { acceptance: "updated" } },
    true
  );
  assert.equal(updated.data.acceptance, "updated");
  await calls.run("evolution.state.clearData", { state: marked.state }, true);
  const cleared = await calls.run("evolution.get", { state: marked.state });
  assert.equal(cleared.hasData, false);
  const ancestry = await calls.run("evolution.ancestry", { root: marked.state, limit: 10 });
  assert.ok(ancestry.items.length >= 2);
  return marked.state;
}

async function verifyHistoryAndTags(calls, branch, origin, latest) {
  const difference = await calls.run("evolution.diff", {
    before: origin,
    after: latest,
    scope: "all",
    limit: 50
  });
  assert.ok(Array.isArray(difference.items));
  const history = await calls.run("evolution.history", {
    root: latest,
    scope: "all",
    limit: 50
  });
  assert.ok(history.items.length > 0);

  const tagName = "sdk-matrix-tag";
  const tagged = await calls.run("evolution.tag.create", { name: tagName, target: latest }, true);
  assert.equal(tagged.name, tagName);
  const tags = await calls.run("evolution.tag.list");
  assert.ok(tags.items.some((item) => item.name === tagName));
  const moved = await calls.run("evolution.tag.move", { name: tagName, target: origin }, true);
  assert.equal(moved.name, tagName);
  const deleted = await calls.run("evolution.tag.delete", { name: tagName }, true);
  assert.equal(deleted.name, tagName);
  assert.ok((await calls.run("evolution.branch.list")).items.some((item) => item.name === branch));
}

async function verifyMerge(calls, branch, ref, body) {
  const branchHead = (await calls.run("evolution.branch.list")).items.find(
    (item) => item.name === branch
  )?.state;
  assert.ok(branchHead);
  const side = "sdk-matrix-side";
  await calls.run("evolution.branch.create", { name: side, from: branchHead }, true);
  assert.ok(body.includes("Before"));
  const oursPatch = replacePatch(ref, body, body.replace("Before", "Ours"));
  const theirsPatch = replacePatch(ref, body, body.replace("Before", "Theirs"));
  const ours = await calls.run(
    "object.patch",
    { branch, baseState: branchHead, patch: oursPatch },
    true
  );
  const theirs = await calls.run(
    "object.patch",
    { branch: side, baseState: branchHead, patch: theirsPatch },
    true
  );
  assert.notEqual(ours.state, theirs.state);
  const started = await calls.run(
    "evolution.merge.start",
    { branch, source: "branch/" + side },
    true
  );
  assert.equal(started.status, "conflicted");
  const listed = await calls.run("evolution.merge.list", { limit: 10 });
  assert.ok(listed.items.some((item) => item.session === started.session));
  const got = await calls.run("evolution.merge.get", { session: started.session });
  assert.equal(got.revision, started.revision);
  const conflicts = await calls.run("evolution.merge.conflicts", {
    session: started.session,
    limit: 20
  });
  assert.ok(conflicts.items.length >= 1);
  const resolved = await calls.run(
    "evolution.merge.resolve",
    {
      session: started.session,
      expectedRevision: started.revision,
      resolutions: conflicts.items.map((item) => ({ conflictId: item.conflictId, choice: "ours" }))
    },
    true
  );
  assert.equal(resolved.unresolved, 0);
  const merged = await calls.run(
    "evolution.merge.finalize",
    { session: started.session, expectedRevision: resolved.revision },
    true
  );
  assert.match(merged.state, /^commit\//);
  const result = await calls.run("object.read", { at: merged.state, refs: [ref] });
  assert.equal(result.results[0].value.properties.name, "Ours");
  const abandoned = await calls.run(
    "evolution.merge.start",
    {
      branch,
      source: "branch/" + side
    },
    true
  );
  const aborted = await calls.run(
    "evolution.merge.abort",
    { session: abandoned.session, expectedRevision: abandoned.revision },
    true
  );
  assert.equal(aborted.session, abandoned.session);
  await calls.run("evolution.branch.delete", { name: side }, true);
  return merged.state;
}

async function verifyPreviewAndHistory(client, branch, state) {
  const tool = async (name, args) => {
    const response = await client.callTool({ name, arguments: args });
    assert.notEqual(response.isError, true, "MCP " + name + " failed");
    return JSON.parse(response.content[0].text);
  };
  const first = await tool("kgos_ontology_overview", { offset: 0, limit: 100 });
  assert.ok(first.totalLines > 100, "The multi-Branch fixture must exercise Preview pagination");
  let received = first.lineCount;
  const pages = [first.preview];
  while (received < first.totalLines) {
    const next = await tool("kgos_ontology_overview", {
      offset: received,
      limit: 100,
      viewRevision: first.viewRevision
    });
    assert.equal(next.viewRevision, first.viewRevision);
    assert.equal(next.totalLines, first.totalLines);
    assert.ok(next.lineCount > 0);
    received += next.lineCount;
    pages.push(next.preview);
  }
  assert.equal(received, first.totalLines);
  assert.ok(pages.join("\n").includes("SdkMatrix"), "Preview must show the populated Ontology");
  assert.ok(pages.join("\n").includes(branch), "Preview must include the test Branch");
  const history = await tool("kgos_commit_ancestry", { root: "branch/" + branch, limit: 100 });
  assert.ok(history.count >= 3);
  assert.ok(history.markdown.includes(state));
}

async function verifyReadOnlyIsolation(client, mainState) {
  const forbidden = await client.callTool({
    name: "kgos_query",
    arguments: {
      code:
        'return await evolution.branch.create({name:"mcp-read-must-not-write",from:' +
        JSON.stringify(mainState) +
        "});"
    }
  });
  assert.equal(forbidden.isError, true);
  assert.equal(JSON.parse(forbidden.content[0].text).code, "PERMISSION_DENIED");
  const missing = await client.callTool({
    name: "kgos_query",
    arguments: {
      code: 'return await evolution.get({state:"commit/' + "0".repeat(64) + '"});'
    }
  });
  assert.equal(missing.isError, true);
  assert.equal(JSON.parse(missing.content[0].text).code, "STATE_NOT_FOUND");
}

export async function verifyMcpSdkMatrix(client) {
  const calls = createCalls(client);
  const base = (await calls.run("evolution.overview")).state;
  const branch = "sdk-matrix";
  await verifyEvolution(calls, branch, base);
  const { ref, body } = await verifyObjects(
    calls,
    branch,
    (await calls.run("evolution.branch.list")).items.find((item) => item.name === branch).state
  );
  const merged = await verifyMerge(calls, branch, ref, body);
  await verifyOntology(calls, branch, merged);
  await verifyGraph(calls, branch);
  await verifyHistoryAndTags(calls, branch, base, merged);
  assert.equal((await calls.run("evolution.overview")).state, base, "main must be unchanged");
  await verifyPreviewAndHistory(client, branch, merged);
  await verifyReadOnlyIsolation(client, base);
  assert.deepEqual(
    [...calls.exercised].sort(),
    [...expectedMethods].sort(),
    "The 31 public SDK methods must all pass against a real daemon through MCP"
  );
  process.stdout.write("MCP real daemon SDK method matrix: 31/31 succeeded\n");
}
