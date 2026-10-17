# 从空 Ontology 创建 Node、Relationship、Property、Constraint、Index

**先读**：使用独立 `kgos_docs` 一次读取 `["guides/objects.md","sdk/ontology/patch.md","sdk/types/PatchRequest.md","sdk/ontology/read.md"]`。字段、约束与索引以 KG OS 的公共 Ontology 模型为准，不把 Cypher 的 Knowledge Node `CREATE` 当成 Definition 创建。

下例只适用于**用户明确授权的、尚无同名 Definition 的隔离测试 Branch**，**不在 `main` 或其它已有业务 Branch 上运行**。先选择一个未使用的测试 Branch 名称（下方 `kgos-guide-demo` 仅是示例，使用时换成唯一名称），从已观测的默认 Branch Commit **创建新 Branch**，再通过 `evolution.get({state:"branch/<name>"})` 取得这个新 Branch 的 immutable `baseState`；`evolution.overview()` 仅用于获得创建时的来源 Commit，绝不能把其 `defaultBranch` 当作测试写入目标。所有后续 `guides/objects.md` 示例必须使用**同一个测试 Branch 名称**。在 `kgos_mutate` 的 `code` 中执行；演示一个 Node 的必需 Property、KEY Constraint 和 Text Index，以及另一个 Node、具有类型化端点与 Property 的 Relationship。Property、Constraint、Index 都是各自 Definition 的内嵌结构，**不是独立 Object**。

```js
const branch="kgos-guide-demo"; // 先换成唯一、已获授权的测试 Branch 名称
const {state:sourceState}=await evolution.overview(); // 仅作为创建来源，不写默认 Branch
const branches=await evolution.branch.list();
if(branches.items.some(item=>item.name===branch)){
  throw new Error("Test Branch exists; inspect it or choose another unique name");
}
await evolution.branch.create({name:branch,from:sourceState});
const {state:baseState}=await evolution.get({state:`branch/${branch}`});
const definitions=[
  ["new:node-definition:project", `name: "Project"
properties:
  - name: "id"
    type: "STRING"
  - name: "title"
    type: "STRING"
    indexes:
      - name: "project_title_text"
        type: "text"
constraints:
  - type: "key"
    properties:
      - "id"
`],
  ["new:node-definition:note", `name: "Note"
properties:
  - name: "text"
    type: "STRING"
constraints: []
`],
  ["new:relationship-definition:has_note", `name: "HAS_NOTE"
from: "new:node-definition:project"
to: "new:node-definition:note"
properties:
  - name: "since"
    type: "DATE"
constraints: []
`]
];
const patch=definitions.map(([target,yaml])=>{
  const lines=yaml.trimEnd().split("\n");
  return [
    `diff --git a/${target} b/${target}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${target}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map(line=>"+"+line),
    ""
  ].join("\n");
}).join("");
const applied=await ontology.patch({
  baseState,branch,patch,message:"Create Project, Note and HAS_NOTE models"
});
const saved=await ontology.read({
  at:applied.state,refs:["node:Project","node:Note","relationship:HAS_NOTE"]
});
return {branch,sourceState,baseState,state:applied.state,created:applied.created,definitions:saved.results};
```

Branch 创建与 `ontology.patch` 是**两次独立写入**：如果创建后脚本失败或断线，先用 `evolution.branch.list()` 检查 Branch 和 Head，不能直接重新运行创建步骤。该脚本在**一次** `ontology.patch` 中提交三个 Definition：`new:<kind>:<alias>` 是本请求的临时定位符，Relationship `from/to` 在同一 Patch 中指向新 Node 的 alias；服务端负责解析，`created` 返回实际 Ref。一个 Patch 是原子的，但后续 `ontology.read` 是独立读取；若读回失败不能据此认定先前 Patch 回滚。非新建场景必须先读 `object.readText` 的 canonical YAML，生成精确 hunks；不能对已存在的 Definition 再用 Add 语义。

**独立校验已保存的模型**：在 `kgos_query` 中对刚才返回的**具体 `applied.state`** 执行以下模板，替换其中的 StateRef，不把 `branch/main` 当成不可变校验对象：

```js
const at="<applied.state: commit/64-hex>";
const models=await object.read({at,refs:["node:Project","node:Note","relationship:HAS_NOTE"]});
return {state:models.state,definitions:models.results};
```

检查 Node/Relationship Definition 的 `properties` 非空；`Project` 的顶层 `key` 约束覆盖 `id`，`title` 的内嵌 `text` 索引名为 `project_title_text`。这两者不是彼此的 Range backing Index。不要将本例的 `Project`、`Note` 当作任何已有实例的数据。创建实际 Knowledge 数据另用 `object.patch` 或经明确授权的 `graph.execute`。

**接着读**：`guides/objects.md`（更改、重命名、删除与批量 Patch）、`guides/reading.md`（固定 State）、`sdk/object/readText.md`、`cypher/schema.md`。遇到 stale/mismatch 参见 `guides/errors.md`。
