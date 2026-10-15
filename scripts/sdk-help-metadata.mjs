// Only human guidance belongs here. Signatures and complete public types come
// from the TypeScript SDK, never from a separately maintained method schema.
export const methods = {
  "ontology.read": [
    "Read Ontology overview, domains, or definitions at a State.",
    'return await ontology.read({ at: "branch/main" });'
  ],
  "ontology.patch": [
    "Apply an Ontology-scoped Git Extended Diff to a Branch.",
    'return await ontology.patch({ branch: "<target-branch>", baseState: "<observed-base-state>", patch: "<git-extended-diff>" });'
  ],
  "object.read": [
    "Read public Ontology or Knowledge Objects by Ref at a State.",
    'return await object.read({ at: "branch/main", refs: ["node:Person"] });'
  ],
  "object.readText": [
    "Read canonical editable Object text by Ref at a State.",
    'return await object.readText({ at: "branch/main", refs: ["node:Person"] });'
  ],
  "object.patch": [
    "Atomically apply a Git Extended Diff spanning public Objects.",
    'return await object.patch({ branch: "<target-branch>", baseState: "<observed-base-state>", patch: "<git-extended-diff>" });'
  ],
  "graph.query": [
    "Execute a read-only Cypher query at a State.",
    'return await graph.query({ at: "branch/main", cypher: "MATCH (n) RETURN n LIMIT 10" });'
  ],
  "graph.execute": [
    "Execute Cypher on a writable Branch; its effect depends on the statement.",
    'return await graph.execute({ branch: "<target-branch>", cypher: "MATCH (n) RETURN count(n) AS count" });'
  ],
  "graph.streamQuery": [
    "Stream read-only Cypher columns, rows, and final summary.",
    'const rows = []; for await (const event of graph.streamQuery({ at: "branch/main", cypher: "MATCH (n) RETURN n LIMIT 10" })) { if (event.type === "row") rows.push(event.row); } return rows;'
  ],
  "graph.streamExecute": [
    "Stream Cypher execution on a writable Branch.",
    'const events = []; for await (const event of graph.streamExecute({ branch: "<target-branch>", cypher: "MATCH (n) RETURN count(n)" })) events.push(event); return events;'
  ],
  "evolution.overview": [
    "Resolve the default Branch and current State.",
    "return await evolution.overview();"
  ],
  "evolution.get": [
    "Inspect one State's metadata, consistency, and State Data.",
    'return await evolution.get({ state: "branch/main" });'
  ],
  "evolution.ancestry": [
    "Read a paginated ancestor DAG from a Branch or Commit.",
    'return await evolution.ancestry({ root: "branch/main", limit: 20 });'
  ],
  "evolution.history": [
    "Read public changes reachable from a State with scope filtering.",
    'return await evolution.history({ root: "branch/main", scope: "all", limit: 20 });'
  ],
  "evolution.diff": [
    "Compare public changes between two immutable States.",
    'return await evolution.diff({ before: "<base-state>", after: "<target-state>", scope: "all" });'
  ],
  "evolution.state.create": [
    "Create a new Commit/State on an existing Branch, even without graph changes.",
    'return await evolution.state.create({ branch: "<target-branch>", message: "Create a checkpoint" });'
  ],
  "evolution.state.setData": [
    "Replace the mutable JSON State Data on an existing State; no new Commit.",
    'return await evolution.state.setData({ state: "<target-state>", data: { note: "reviewed" } });'
  ],
  "evolution.state.clearData": [
    "Remove a State's mutable Data annotation; no new Commit.",
    'return await evolution.state.clearData({ state: "<target-state>" });'
  ],
  "evolution.branch.list": [
    "List Branch names and their current States.",
    "return await evolution.branch.list();"
  ],
  "evolution.branch.create": [
    "Create a Branch from a specified existing State.",
    'return await evolution.branch.create({ name: "<new-branch>", from: "<source-state>" });'
  ],
  "evolution.branch.delete": [
    "Delete a Branch reference, not its immutable Commit history.",
    'return await evolution.branch.delete({ name: "<target-branch>" });'
  ],
  "evolution.tag.list": [
    "List Tag names and their current States.",
    "return await evolution.tag.list();"
  ],
  "evolution.tag.create": [
    "Create a Tag pointing at a State.",
    'return await evolution.tag.create({ name: "<new-tag>", target: "<target-state>" });'
  ],
  "evolution.tag.move": [
    "Move an existing Tag to another State.",
    'return await evolution.tag.move({ name: "<existing-tag>", target: "<target-state>" });'
  ],
  "evolution.tag.delete": [
    "Remove a Tag reference without deleting the underlying Commit.",
    'return await evolution.tag.delete({ name: "<target-tag>" });'
  ],
  "evolution.merge.list": [
    "List Merge Sessions with optional pagination.",
    "return await evolution.merge.list({ limit: 20 });"
  ],
  "evolution.merge.get": [
    "Read the current status and revision of a Merge Session.",
    'return await evolution.merge.get({ session: "<session-id>" });'
  ],
  "evolution.merge.conflicts": [
    "Read paginated Merge conflicts and the current Session revision.",
    'return await evolution.merge.conflicts({ session: "<session-id>", limit: 20 });'
  ],
  "evolution.merge.start": [
    "Start a Merge Session for an existing target Branch and source State.",
    'return await evolution.merge.start({ branch: "<target-branch>", source: "<source-state>" });'
  ],
  "evolution.merge.resolve": [
    "Apply conflict resolutions using the observed Session revision.",
    'const s = await evolution.merge.get({ session: "<session-id>" }); return await evolution.merge.resolve({ session: s.session, expectedRevision: s.revision, resolutions: [{ conflictId: "<conflict-id>", choice: "ours" }] });'
  ],
  "evolution.merge.finalize": [
    "Finalize a Merge Session using its current revision; may fast-forward or create a Commit.",
    'const s = await evolution.merge.get({ session: "<session-id>" }); return await evolution.merge.finalize({ session: s.session, expectedRevision: s.revision });'
  ],
  "evolution.merge.abort": [
    "Abort an unfinished Merge Session at its current revision.",
    'const s = await evolution.merge.get({ session: "<session-id>" }); return await evolution.merge.abort({ session: s.session, expectedRevision: s.revision });'
  ]
};

export const methodNotes = {
  "ontology.patch": [
    "Use the observed baseState and canonical editable Object text to construct the patch."
  ],
  "object.patch": [
    "Use the observed baseState and canonical editable Object text to construct the patch."
  ],
  "graph.execute": [
    "Cypher is passed through unchanged. Calling execute does not guarantee that a new Commit is created."
  ],
  "graph.streamExecute": [
    "Rows or columns alone do not confirm success; inspect the terminal summary or error."
  ],
  "evolution.history": [
    "scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref."
  ],
  "evolution.diff": [
    "scope is all, ontology, knowledge, or object. For object scope, supply an object filter with anchorState and ref."
  ],
  "evolution.state.create": ["Creates a Commit even when the graph snapshot does not change."],
  "evolution.state.setData": [
    "State Data is a mutable annotation, not part of the versioned Knowledge/Ontology graph."
  ],
  "evolution.state.clearData": [
    "State Data is a mutable annotation, not part of the versioned Knowledge/Ontology graph."
  ],
  "evolution.merge.resolve": [
    "Use the current Merge Session revision, and choose resolutions based on the observed conflicts; 'ours' is only an illustrative choice."
  ],
  "evolution.merge.finalize": [
    "Use the observed Merge Session revision. The Session may be stale after other changes."
  ],
  "evolution.merge.abort": [
    "Use the observed Merge Session revision. Aborting a Session does not undo previous commits."
  ]
};
