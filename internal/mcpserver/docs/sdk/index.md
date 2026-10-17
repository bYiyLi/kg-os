# SDK Reference — MCP Sandbox

This is the exact 31-method JavaScript interface exposed by KG OS MCP. Use the separate `kgos_docs` Tool with `paths` to read references, then use `kgos_query` for reads or `kgos_mutate` for authorized writes. JavaScript code needs no import, new KGOSClient(), endpoint or token; return JSON-compatible results.

Read `sdk/types/index.md` for all 75 public method-dependent types and follow each type's related links for nested values. Read `cypher/index.md` for Cypher 25.

| Access | Method                      | Document                           |
| ------ | --------------------------- | ---------------------------------- |
| read   | `evolution.ancestry`        | `sdk/evolution/ancestry.md`        |
| write  | `evolution.branch.create`   | `sdk/evolution/branch/create.md`   |
| write  | `evolution.branch.delete`   | `sdk/evolution/branch/delete.md`   |
| read   | `evolution.branch.list`     | `sdk/evolution/branch/list.md`     |
| read   | `evolution.diff`            | `sdk/evolution/diff.md`            |
| read   | `evolution.get`             | `sdk/evolution/get.md`             |
| read   | `evolution.history`         | `sdk/evolution/history.md`         |
| write  | `evolution.merge.abort`     | `sdk/evolution/merge/abort.md`     |
| read   | `evolution.merge.conflicts` | `sdk/evolution/merge/conflicts.md` |
| write  | `evolution.merge.finalize`  | `sdk/evolution/merge/finalize.md`  |
| read   | `evolution.merge.get`       | `sdk/evolution/merge/get.md`       |
| read   | `evolution.merge.list`      | `sdk/evolution/merge/list.md`      |
| write  | `evolution.merge.resolve`   | `sdk/evolution/merge/resolve.md`   |
| write  | `evolution.merge.start`     | `sdk/evolution/merge/start.md`     |
| read   | `evolution.overview`        | `sdk/evolution/overview.md`        |
| write  | `evolution.state.clearData` | `sdk/evolution/state/clearData.md` |
| write  | `evolution.state.create`    | `sdk/evolution/state/create.md`    |
| write  | `evolution.state.setData`   | `sdk/evolution/state/setData.md`   |
| write  | `evolution.tag.create`      | `sdk/evolution/tag/create.md`      |
| write  | `evolution.tag.delete`      | `sdk/evolution/tag/delete.md`      |
| read   | `evolution.tag.list`        | `sdk/evolution/tag/list.md`        |
| write  | `evolution.tag.move`        | `sdk/evolution/tag/move.md`        |
| write  | `graph.execute`             | `sdk/graph/execute.md`             |
| read   | `graph.query`               | `sdk/graph/query.md`               |
| write  | `graph.streamExecute`       | `sdk/graph/streamExecute.md`       |
| read   | `graph.streamQuery`         | `sdk/graph/streamQuery.md`         |
| write  | `object.patch`              | `sdk/object/patch.md`              |
| read   | `object.read`               | `sdk/object/read.md`               |
| read   | `object.readText`           | `sdk/object/readText.md`           |
| write  | `ontology.patch`            | `sdk/ontology/patch.md`            |
| read   | `ontology.read`             | `sdk/ontology/read.md`             |
