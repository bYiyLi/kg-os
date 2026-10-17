# Object / Ontology — canonical Git Extended Diff

**先读**：用独立 `kgos_docs` 批量读取 `["guides/ontology.md","sdk/object/readText.md","sdk/object/patch.md","sdk/types/PatchRequest.md"]`。下方 JavaScript **只作为 `kgos_query` / `kgos_mutate` 的 `code` 函数体**，文档读取不属于 JavaScript 全局方法。

唯一公共修改入口是 `ontology.patch`（Ontology 专用）或 `object.patch`（五类公共对象）。两者的 `patch` 都是严格匹配 canonical YAML 的 **Git Extended Diff**，不是 JSON Merge Patch。**先明确选择已授权的目标 Branch**（下面的 `kgos-guide-demo` 必须是通过 `guides/ontology.md` 创建并确认归自己所有的隔离测试 Branch，实际使用时替换成自己创建的唯一名称）；通过 `evolution.get({state:"branch/<name>"})` 读取**该 Branch** 的当前 immutable State，再对同一 State 调用 `object.readText({at:baseState,refs:[...]})`。不能用 `evolution.overview()` 的默认 Branch / State 来代替测试 Branch；`branch` 是不带前缀的名字，`baseState` 必须是已观测的 `commit/<64-hex>`。

## Add：新 Object 使用 request-local alias

例如在**尚无同名 Domain** 的隔离 Branch 添加一个 Domain。传给 `object.patch` 的原始 `patch` 是：

```diff
diff --git a/new:domain:research b/new:domain:research
new file mode 100644
--- /dev/null
+++ b/new:domain:research
@@ -0,0 +1,2 @@
+name: "Research"
+includes: []
```

`new:domain:research` 只在这次请求有效；成功后从 `created` 读取正式 `domain:Research` Ref。用 `kgos_mutate` 执行：

```js
const branch = "kgos-guide-demo"; // 使用在 guides/ontology.md 中创建的同一隔离 Branch
const { state: baseState } = await evolution.get({ state: "branch/" + branch });
const patch =
  "diff --git a/new:domain:research b/new:domain:research\n" +
  "new file mode 100644\n--- /dev/null\n+++ b/new:domain:research\n" +
  '@@ -0,0 +1,2 @@\n+name: "Research"\n+includes: []\n';
return await object.patch({ branch, baseState, patch, message: "Create Research domain" });
```

新 Node / Relationship 的 Add 写法相同，字段、端点、约束、索引和跨新 Object alias 的完整可执行示例见 `guides/ontology.md`。不要用预测的未来永久 Ref 作为 Add target。

## Update：同一 State 的多个 Object 一次原子修改

下例接续 `guides/ontology.md` 的**隔离模型**，在同一次 `object.patch` 中给 `Project` 和 `Note` 增加描述；先读实际 canonical body，再构造 exact unified hunks，而不是猜缩进、字段顺序或当前 Commit。只有已确认存在的对象才能按此例修改。每段代码都必须使用**同一个已创建的测试 Branch**，并在本次写入前重新读取它的 Head。

```js
const branch = "kgos-guide-demo"; // 使用在 guides/ontology.md 中创建的同一隔离 Branch
const { state: baseState } = await evolution.get({ state: "branch/" + branch });
const refs = ["node:Project", "node:Note"];
const selected = await object.readText({ at: baseState, refs });
const patch = selected.results
  .map(({ ref, body }) => {
    const name = ref === "node:Project" ? "Project" : "Note";
    const next = body.replace(
      `name: "${name}"\n`,
      `name: "${name}"\ndescription: "Demo model for batch updates."\n`
    );
    if (next === body) throw new Error("Canonical YAML did not match the selected ref");
    const oldLines = body.trimEnd().split("\n");
    const newLines = next.trimEnd().split("\n");
    return [
      `diff --git a/${ref} b/${ref}`,
      `--- a/${ref}`,
      `+++ b/${ref}`,
      `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
      ...oldLines.map((line) => "-" + line),
      ...newLines.map((line) => "+" + line),
      ""
    ].join("\n");
  })
  .join("");
const applied = await object.patch({ branch, baseState, patch, message: "Document demo models" });
const saved = await object.read({ at: applied.state, refs });
return { before: baseState, after: applied.state, objects: saved.results };
```

单次 Patch all-or-nothing（Ontology / Knowledge 混合也可用同一个 `object.patch`）；**多次 SDK mutation、或 `object.patch` 后的独立 read 并非跨方法事务**。先前写入成功后发生断线/脚本错误，不得把整段脚本当成已回滚。

## Delete：明确删除目标并保持依赖一致

Delete entry 使用 `deleted file mode 100644`、`--- a/<ref>`、`+++ /dev/null` 与删除原 canonical body 的 `-...` hunk。下例删除前面 Add 创建的**空且无引用的 Research Domain**，不会隐式级联到其它 Definition 或 Knowledge；需要删除有关联对象时，必须先核查依赖，按其公共合同显式删除或迁移依赖，不能假定系统自动清除。

```js
const branch = "kgos-guide-demo"; // 使用在 guides/ontology.md 中创建的同一隔离 Branch
const { state: baseState } = await evolution.get({ state: "branch/" + branch });
const refs = ["domain:Research"];
const selected = await object.readText({ at: baseState, refs });
const patch = selected.results
  .map(({ ref, body }) => {
    const lines = body.trimEnd().split("\n");
    return [
      `diff --git a/${ref} b/${ref}`,
      "deleted file mode 100644",
      `--- a/${ref}`,
      "+++ /dev/null",
      `@@ -1,${lines.length} +0,0 @@`,
      ...lines.map((line) => "-" + line),
      ""
    ].join("\n");
  })
  .join("");
return await object.patch({ branch, baseState, patch, message: "Remove unused Research domain" });
```

不允许删除有 incident Relationship 的 Knowledge Node 后由服务器静默 `DETACH DELETE`；必须显式处理关联对象。**当前示例没有演示带依赖的 Schema 删除**；这种操作必须在真实隔离测试确认依赖和能力后才能写入指南。不存在的目标返回错误，不是删除成功。

## Rename：保留已有 Object 连续性

顶层 Definition / Domain rename 需要标准 `rename from` / `rename to`，不是只修改 body 的 `name`。以下在**目标新名称未占用**的隔离模型中将 `node:Project` 改名为 `node:Product`，并返回 Ref transition：

```js
const branch = "kgos-guide-demo"; // 使用在 guides/ontology.md 中创建的同一隔离 Branch
const { state: baseState } = await evolution.get({ state: "branch/" + branch });
const oldRef = "node:Project",
  newRef = "node:Product";
const selected = await object.readText({ at: baseState, refs: [oldRef] });
const oldBody = selected.results[0].body;
const newBody = oldBody.replace('name: "Project"\n', 'name: "Product"\n');
if (newBody === oldBody) throw new Error("Unexpected canonical Definition name");
const previous = oldBody.trimEnd().split("\n"),
  next = newBody.trimEnd().split("\n");
const patch = [
  `diff --git a/${oldRef} b/${newRef}`,
  `rename from ${oldRef}`,
  `rename to ${newRef}`,
  `--- a/${oldRef}`,
  `+++ b/${newRef}`,
  `@@ -1,${previous.length} +1,${next.length} @@`,
  ...previous.map((line) => "-" + line),
  ...next.map((line) => "+" + line),
  ""
].join("\n");
return await object.patch({ branch, baseState, patch, message: "Rename Project to Product" });
```

Property rename 不是顶层 Object Rename：在对应 Definition 的 Property 修改里使用 input-only `renameFrom`。若同一个 Patch 有其它已有 Object 指向被 rename 的 Definition，仍使用 **baseState 中的旧 Ref**，依赖维护由 KG OS 完成；只有本 Patch 新建对象才使用 `new:<kind>:<alias>`。

## 错误处理：精确 base，不做模糊补丁或自动重试

- `PATCH_BASE_MISMATCH`：Patch hunk 与**已观测 State 的 canonical YAML** 不完全一致。重新在那个 immutable State 使用 `object.readText` 读取目标的完整 body，重新产生 exact hunks（包括最终换行），不要用 fuzzy `git apply` 规则、盲目修改 hunk offset 或重试相同文本。
- `STALE_BASE_STATE`：目标 Branch Head 已经离开 `baseState`。**重新解析最新目标 Branch，再读取新 State 下的所有受影响 Object，检查并重新生成补丁**；不要把基于旧 State 的 Patch 直接重放，也不自动 rebase/merge。
- `OBJECT_CONFLICT` / `OBJECT_NOT_FOUND`：确认名称、Ref 和依赖冲突后重新决定编辑；Add 不是 Upsert，删除不存在的目标不是 no-op。超出当前模型能力时保留 `UNSUPPORTED_OPERATION` 等具体错误。

以下两段脚本只用于**已完成上文示例的隔离 Branch**；故意制造一次失败，再独立读取并修复。对真实用户知识库不能为了测试故意推进 Branch 或尝试有破坏性的错误补丁。

### PATCH_BASE_MISMATCH：重新读取 canonical body 并构造精确 hunks

```js
const branch = "kgos-guide-demo"; // 使用在 guides/ontology.md 中创建的同一隔离 Branch
const { state: baseState } = await evolution.get({ state: "branch/" + branch });
const ref = "node:Product";
const wrong = `diff --git a/${ref} b/${ref}\n--- a/${ref}\n+++ b/${ref}\n@@ -1,1 +1,1 @@\n-name: "NotTheBase"\n+name: "Product"\n`;
let failure;
try {
  await object.patch({ branch, baseState, patch: wrong });
} catch (error) {
  failure = error.code;
}
if (failure !== "PATCH_BASE_MISMATCH") throw new Error("Expected exact-base mismatch");
const body = (await object.readText({ at: baseState, refs: [ref] })).results[0].body;
const before = 'description: "Demo model for batch updates."';
const after = 'description: "Recovered from mismatched patch."';
const corrected = body.replace(before, after);
if (corrected === body) throw new Error("Canonical source differs; inspect before editing");
const oldLines = body.trimEnd().split("\n"),
  newLines = corrected.trimEnd().split("\n");
const patch = [
  `diff --git a/${ref} b/${ref}`,
  `--- a/${ref}`,
  `+++ b/${ref}`,
  `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
  ...oldLines.map((line) => "-" + line),
  ...newLines.map((line) => "+" + line),
  ""
].join("\n");
const applied = await object.patch({
  branch,
  baseState,
  patch,
  message: "Recover exact canonical Patch"
});
return { rejected: failure, state: applied.state };
```

### STALE_BASE_STATE：重新 pin Branch Head，再重建 Patch

```js
const branch = "kgos-guide-demo"; // 使用在 guides/ontology.md 中创建的同一隔离 Branch
const { state: oldState } = await evolution.get({ state: "branch/" + branch });
const ref = "node:Product";
const makePatch = (body) => {
  const before = 'description: "Recovered from mismatched patch."';
  const updated = body.replace(before, 'description: "Recovered from stale State."');
  if (updated === body) throw new Error("Expected canonical description not found");
  const oldLines = body.trimEnd().split("\n"),
    newLines = updated.trimEnd().split("\n");
  return [
    `diff --git a/${ref} b/${ref}`,
    `--- a/${ref}`,
    `+++ b/${ref}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => "-" + line),
    ...newLines.map((line) => "+" + line),
    ""
  ].join("\n");
};
const previous = (await object.readText({ at: oldState, refs: [ref] })).results[0].body;
const stalePatch = makePatch(previous);
await evolution.state.create({ branch, message: "Advance isolated test Branch" });
let failure;
try {
  await object.patch({ branch, baseState: oldState, patch: stalePatch });
} catch (error) {
  failure = error.code;
}
if (failure !== "STALE_BASE_STATE") throw new Error("Expected stale Branch rejection");
const { state: latestState } = await evolution.get({ state: "branch/" + branch });
const latest = (await object.readText({ at: latestState, refs: [ref] })).results[0].body;
const applied = await object.patch({
  branch,
  baseState: latestState,
  patch: makePatch(latest),
  message: "Recover after Branch advanced"
});
return { rejected: failure, previous: oldState, state: applied.state };
```

**接着读**：`guides/reading.md`（State 一致性）、`guides/errors.md`（超时/取消/未知写入结果）、`guides/evolution.md`（分支与合并）、`sdk/types/PatchResult.md`（别名与 Ref transition）。
