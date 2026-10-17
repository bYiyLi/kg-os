# KG OS MCP — 任务指南

**先读**：`index.md` 是 AI 任务总目录，`sdk/index.md` 提供 31 个方法，`sdk/types/index.md` 提供相关类型。无需 Skill：直接调用**独立** `kgos_docs`，传入下面某行的 `paths` 数组，一次获取多篇完整 Markdown；不要在 JavaScript 函数体里调用 `kgos_docs`。

| 要完成的任务                                                          | 传给 `kgos_docs` 的 `paths`                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 从空 Ontology 建模（Node、Relationship、Property、Constraint、Index） | `["guides/ontology.md","guides/objects.md","sdk/ontology/patch.md","sdk/types/PatchRequest.md"]` |
| 发现现有模型、批量读取并固定 State                                    | `["guides/reading.md","sdk/ontology/read.md","sdk/evolution/overview.md"]`                       |
| Knowledge/Object 创建、修改、删除、重命名                             | `["guides/objects.md","sdk/object/readText.md","sdk/object/patch.md"]`                           |
| Graph / Cypher 25 查询或修改                                          | `["guides/graph.md","cypher/index.md","sdk/graph/query.md","sdk/graph/execute.md"]`              |
| Full-text / Managed Semantic 搜索                                     | `["cypher/search.md","cypher/procedures-reference.md","sdk/graph/query.md"]`                     |
| Commit、Branch、Tag、Merge Session                                    | `["guides/evolution.md","sdk/evolution/merge/start.md","sdk/evolution/merge/resolve.md"]`        |
| 资源预算、流、错误与未知写入结果                                      | `["guides/errors.md","sdk/graph/streamQuery.md","sdk/graph/streamExecute.md"]`                   |

`kgos_ontology_overview` 展示全部 Branch 的 pinned Ontology Markdown；`kgos_commit_ancestry` 分页展示 Commit DAG；`kgos_query` 允许所有只读 JavaScript SDK 方法（**不限于 Cypher**），`kgos_mutate` 执行获明确授权的读写 SDK 方法。两种 JavaScript Tool 没有 `docs.read` 全局对象。

**任何写入先选目标**：`evolution.overview()` 仅给出默认 Branch/State，不是“当前测试分支”。测试时先按 `guides/ontology.md` 创建独立 Branch，后续始终明确 `branch` 名称，并用 `evolution.get({state:"branch/"+branch}).state` 获取其真实 Head 作为 Patch `baseState`。不要从默认 Branch 借用 baseState，也不要在网络失败后重复创建 Branch。

**接着读**：按上表选择文档，再按相应方法页链接读取确切请求/返回类型。所有相关读取复用一个 immutable State；多个 JavaScript SDK 调用不是原子事务，未知写入结果先核查再决定是否重试。
