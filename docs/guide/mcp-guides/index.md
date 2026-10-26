# KG OS MCP — 任务指南

路径已知时直接用独立 `kgos_docs` 的 `paths` 读取所需文档；未知时从本目录或 `index.md` 选择。已读且连接/版本适用则复用，不为每次调用重读目录或全部 SDK。文档读取不是 JavaScript 方法，也不依赖 Skill。

| 要完成的任务 | 最小阅读入口；再按缺口补方法/类型 |
| --- | --- |
| 从空 Ontology 建模 | `["guides/ontology.md","guides/objects.md","sdk/ontology/patch.md","sdk/types/PatchRequest.md"]` |
| 定向读取模型并固定 State | `["guides/reading.md","sdk/evolution/get.md","sdk/ontology/read.md"]` |
| 读取已有 Knowledge/Object | `["guides/reading.md","sdk/object/readText.md"]` |
| 创建、修改、删除或重命名 Object | `["guides/objects.md","sdk/object/patch.md","guides/errors.md"]` |
| Graph / Cypher 查询 | `["guides/graph.md","cypher/index.md","sdk/graph/query.md"]` |
| Graph 写入 | `["guides/graph.md","sdk/graph/execute.md","guides/errors.md"]` |
| Full-text / Managed Semantic 搜索 | `["cypher/search.md","cypher/procedures-reference.md","sdk/graph/query.md"]` |
| 读取版本、Branch、Tag 或历史 | `["guides/evolution.md"]`，再选实际读取方法；无需 Merge 方法 |
| 执行获准 Merge | `["guides/evolution.md","sdk/evolution/merge/start.md","sdk/evolution/merge/resolve.md","guides/errors.md"]` |
| 资源错误或未知写入结果 | `["guides/errors.md"]`，再选实际目标的核查方法 |
| 流式读取/写入 | `guides/errors.md` 与实际使用的 `sdk/graph/streamQuery.md` 或 `sdk/graph/streamExecute.md` |

先确定获准的连接、环境和知识世界；全分支范围受限时按 `guides/reading.md` 定向读取，不使用全量预览后过滤。

`kgos_ontology_overview` 展示全部 Branch 的 pinned Ontology Markdown；`kgos_commit_ancestry` 分页展示 Commit DAG；`kgos_query` 允许所有只读 JavaScript SDK 方法（**不限于 Cypher**），`kgos_mutate` 执行获明确授权的读写 SDK 方法。两种 JavaScript Tool 没有 `docs.read` 全局对象。

**脚本形式**：`kgos_query` / `kgos_mutate` 的 `code` 是 async JavaScript **函数体**，不是模块；直接使用 `ontology`、`object`、`graph`、`evolution` 四个无前缀 SDK 对象。无需安装客户端或导入包，不能访问 Node.js `process`、本地文件、任意网络或凭证。须显式 `return` JSON 可表示的结果；不要返回 `undefined`、`BigInt`、函数或循环引用。支持 `async/await`、`Promise.all` 和 `for await...of`；流式结果与失败恢复详见 `guides/errors.md`。

**任何写入先选目标**：`evolution.overview()` 仅给出默认 Branch/State，不是“当前测试分支”。运行建模教学示例时，先在相应授权内按 `guides/ontology.md` 创建独立 Branch，后续始终明确 `branch` 名称，并用 `evolution.get({state:"branch/"+branch}).state` 获取其真实 Head 作为 Patch `baseState`。不要从默认 Branch 借用 baseState，也不要在网络失败后重复创建 Branch。

按上表的当前任务选择文档；签名或嵌套值不明确时，沿方法页读取确切请求/返回类型。写入前必须掌握授权、实际目标、事务与未知结果边界；已经掌握的同版合同不重复加载。所有相关读取复用一个 immutable State；多个 JavaScript SDK 调用不是原子事务，未知写入结果先核查再决定是否重试。
