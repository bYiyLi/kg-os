# SDK Reference — MCP Sandbox

This is the exact 31-method JavaScript interface exposed by KG OS MCP. No import, new KGOSClient(), endpoint or token is required. Use `kgos_read` for reads and `kgos_run` for authorized writes. Return JSON-compatible results.

Read `sdk/types/index.md` for all 75 public method-dependent types and follow each type's related links for nested values. Read `cypher/index.md` for Cypher 25.

| Access | Method                      | Document                                        |
| ------ | --------------------------- | ----------------------------------------------- |
| read   | `evolution.ancestry`        | `docs.read('sdk/evolution/ancestry.md')`        |
| write  | `evolution.branch.create`   | `docs.read('sdk/evolution/branch/create.md')`   |
| write  | `evolution.branch.delete`   | `docs.read('sdk/evolution/branch/delete.md')`   |
| read   | `evolution.branch.list`     | `docs.read('sdk/evolution/branch/list.md')`     |
| read   | `evolution.diff`            | `docs.read('sdk/evolution/diff.md')`            |
| read   | `evolution.get`             | `docs.read('sdk/evolution/get.md')`             |
| read   | `evolution.history`         | `docs.read('sdk/evolution/history.md')`         |
| write  | `evolution.merge.abort`     | `docs.read('sdk/evolution/merge/abort.md')`     |
| read   | `evolution.merge.conflicts` | `docs.read('sdk/evolution/merge/conflicts.md')` |
| write  | `evolution.merge.finalize`  | `docs.read('sdk/evolution/merge/finalize.md')`  |
| read   | `evolution.merge.get`       | `docs.read('sdk/evolution/merge/get.md')`       |
| read   | `evolution.merge.list`      | `docs.read('sdk/evolution/merge/list.md')`      |
| write  | `evolution.merge.resolve`   | `docs.read('sdk/evolution/merge/resolve.md')`   |
| write  | `evolution.merge.start`     | `docs.read('sdk/evolution/merge/start.md')`     |
| read   | `evolution.overview`        | `docs.read('sdk/evolution/overview.md')`        |
| write  | `evolution.state.clearData` | `docs.read('sdk/evolution/state/clearData.md')` |
| write  | `evolution.state.create`    | `docs.read('sdk/evolution/state/create.md')`    |
| write  | `evolution.state.setData`   | `docs.read('sdk/evolution/state/setData.md')`   |
| write  | `evolution.tag.create`      | `docs.read('sdk/evolution/tag/create.md')`      |
| write  | `evolution.tag.delete`      | `docs.read('sdk/evolution/tag/delete.md')`      |
| read   | `evolution.tag.list`        | `docs.read('sdk/evolution/tag/list.md')`        |
| write  | `evolution.tag.move`        | `docs.read('sdk/evolution/tag/move.md')`        |
| write  | `graph.execute`             | `docs.read('sdk/graph/execute.md')`             |
| read   | `graph.query`               | `docs.read('sdk/graph/query.md')`               |
| write  | `graph.streamExecute`       | `docs.read('sdk/graph/streamExecute.md')`       |
| read   | `graph.streamQuery`         | `docs.read('sdk/graph/streamQuery.md')`         |
| write  | `object.patch`              | `docs.read('sdk/object/patch.md')`              |
| read   | `object.read`               | `docs.read('sdk/object/read.md')`               |
| read   | `object.readText`           | `docs.read('sdk/object/readText.md')`           |
| write  | `ontology.patch`            | `docs.read('sdk/ontology/patch.md')`            |
| read   | `ontology.read`             | `docs.read('sdk/ontology/read.md')`             |
