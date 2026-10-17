---
name: kgos
description: Use when the user asks to inspect, model, query, revise, compare, or merge data in their own KG OS knowledge graph via its MCP connection.
---

# KG OS — knowledge graph client

KG OS 是确定性的知识图基础设施，不是 Agent。你负责理解任务、决定读取范围、生成查询及判断修改；KG OS 负责执行已有公共合同。不将你自己的推测写成真实模型或已提交状态。

## 阅读上下文

1. 新会话先调用独立 MCP Tool `kgos_docs({})` 获取任务目录，再用 `paths: ["guides/ontology.md","guides/objects.md"]` 批量阅读文档。文档 Tool 不能在 JavaScript 中调用。不清楚当前模型时调用 `kgos_ontology_overview`。预览包括全部 Branch 的 Head Commit、Message 与各 State 的完整 Ontology。默认返回首 300 行。
2. 返回的 `viewRevision` 用于继续读取同一不可变视图；使用 `offset`、`limit` 读取缺失片段。目录中的 `Offset` / `Lines` 是**完整视图的绝对零基行号**，不是当前页的相对行号。不要只看首页就断言模型不含某个 Definition。过期后重新取新视图。
3. 如果关心过去的修改，调用 `kgos_commit_ancestry`，指定 Branch/Commit Ref，按 `cursor` 继续。Commit DAG 是局部页；不把未展开的父 Commit 当作不存在。Message 在代码围栏中保留原文，而不是结构化摘要。
4. 复杂读取使用 `kgos_query`：在 JavaScript 中先读 `evolution.overview()`，再将同一个 `state` 作为各读取的 `at`，避免移动 Branch 的多次读取混成一个快照。

## 可编程操作

五个 AI-facing MCP Tool：`kgos_docs`、`kgos_ontology_overview`、`kgos_commit_ancestry`、`kgos_query`、`kgos_mutate`；还有 app-only `kgos_workspace`。复杂业务操作放在一个 Tool 的 JavaScript **函数体** 中，而不是增加每个 SDK 方法的 MCP Tool。

JavaScript 环境提供四个无前缀全局对象：`ontology`、`object`、`graph`、`evolution`。所有 **31 个方法的准确签名、请求/返回类型和限制**都以当前连接的 `kgos_docs` 中 `sdk/index.md`、`sdk/types/index.md` 及任务 Guide 为准；不要依赖 Skill 保存第二份可能过期的方法清单。

`kgos_query` 仅允许 SDK 只读方法。修改必须使用 `kgos_mutate`；它也支持读取。两者采用同一 QuickJS Sandbox，没有 `docs.read` 全局方法；文档只通过 `kgos_docs` 阅读。不能访问 Node.js `process`、文件、任意网络或宿主 Token。必须显式 `return` 一个 JSON 可表示的值；`undefined`、`BigInt`、函数、循环对象都不合法。支持 `async/await`、`Promise.all`、`for await...of`。

例：读取固定版本：

```js
const { state } = await evolution.overview();
const model = await ontology.read({ at: state });
const graphData = await graph.query({
  at: state,
  cypher: "MATCH (n) RETURN count(n) AS total"
});
return { state, model, graphData };
```

例：增量消费并避免全量物化：

```js
const { state } = await evolution.overview();
const selected = [];
for await (const event of graph.streamQuery({
  at: state,
  cypher: "MATCH (n) RETURN elementId(n) AS id LIMIT 10"
})) {
  if (event.type === "row") selected.push(event.row[0]);
  if (selected.length >= 10) break;
}
return { state, selected };
```

## 修改、失败与版本

- 对 Ontology/Object 修改，先读取准确 State 和 canonical YAML，再构造局部 Git Extended Diff。一次 Patch 可原子修改多个 Object；不要假定多个独立 SDK mutation 会组成跨方法事务。
- Graph Cypher 原样传给现有 KG OS/Lithograph；不要替用户发明 Cypher 扩展或假装预先校验过查询。
- Commit `message` 建议使用 Markdown：`## 简介` 写摘要，`## 改动` 写准确差异，必要时后接上下文段落。它是建议，不是强制校验；不拆成多个 Message 字段。
- `kgos_mutate` 脚本执行多次写入时，先前成功的操作可能已经持久化。后续脚本报错、调用中断、超时、Stream 部分消费或回执丢失时，不得自动重试 mutation；先用 `evolution`/目标 Branch/Tag/Merge 查询真实状态，必要时人工确认。
- Branch State 与 Merge `expectedRevision` 的并发控制由现有 SDK/Kernel 管理，冲突时重新读取后再决定怎么操作，不臆造自动 rebase/merge。
- 报错 `code/message/details` 可用于理解错误，但不要在对用户的报告中泄露密钥。脚本主动捕获并 `return` 的错误是你自己的成功返回，不代表底层操作成功。

不要宣称 Plugin 安装后会自动调用 Skill；按照当前 ChatGPT 客户端的实际使用条件判断是否激活。
