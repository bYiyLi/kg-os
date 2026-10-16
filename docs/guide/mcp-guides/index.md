# KG OS MCP — 使用指南

这里是无需 Skill 的可编程操作流程。精确 SDK 参数与返回类型请使用 `docs.read("sdk/index.md")`；Cypher 语法请使用 `docs.read("cypher/index.md")`。

| 任务 | 文档 |
| --- | --- |
| 连接发现、读取一致 State | `guides/reading.md` |
| 图数据与 Cypher 查询/修改 | `guides/graph.md` |
| Ontology / Object 的 canonical Patch | `guides/objects.md` |
| Commit、Branch、Tag、Merge Session | `guides/evolution.md` |
| 大结果、流式、出错与不确定提交 | `guides/errors.md` |

工具：`kgos_preview` 展示全部 Branch 的 pinned Ontology 视图；`state_ancestry` 展示分页 Commit DAG；`kgos_read` 只读 Sandbox；`kgos_run` 对明确获授权的目标执行读写 Sandbox。可先 `docs.read("index.md")` 再按需深入各页，**不要求安装 Skill**。
