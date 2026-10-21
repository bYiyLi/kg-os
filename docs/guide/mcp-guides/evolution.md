# State、Branch、Tag 和 Merge Session

`evolution.overview` 获取默认 Branch 与当前 resolved State；`evolution.get` 获取 Commit metadata/一致性/State Data。`evolution.ancestry`、`history` 和 `diff` 提供结构化版本读取；直接阅读 Markdown DAG 可用 `kgos_commit_ancestry` Tool。

**目标 Branch 的 Head**：`evolution.overview().state` 只解析默认 Branch。读取或修改其它 Branch 时，先明确目标名称，再调用 `evolution.get({state:"branch/"+branch})` 取得返回的 `state`（immutable Commit）；也可从 `evolution.branch.list().items` 中按精确 `name` 查找同一 State。写入请求的 `branch` 字段是**不带 `branch/` 前缀**的名称，不能把 `overview().defaultBranch` 当作隔离测试目标。修改失败或未知结果后，仍应重新解析**该目标 Branch** 的 Head。

StateRef 格式是 `commit/<64-lowercase-hex>`、`branch/<name>` 或 `tag/<name>`。`branch.create({name,from})` 的 `from` 必须提供 **StateRef**（如 `branch/main`），不是裸 Branch 名字；`branch.list` 和 `tag.list` 返回当前引用。`evolution.state.create` 即使没有图差异也会创建 Commit；`state.setData/clearData` 修改的是不进入 immutable graph snapshot 的可变 State Data。**State Data 按 Commit 而非 Branch 存储**：仅创建新 Branch 并不会隔离来源 Commit 的 Data；如需测试 State Data 写入，先在测试 Branch `state.create` 一个独有 Commit，再仅对该 Commit 设置或清理 Data，不触碰与默认 Branch 共享的来源 Commit。

## Commit Message：完整简介与本次改动

当已授权的操作可能产生新 Commit、且当前 SDK 方法接受 `message` 时，官方 AI 推荐使用以下 Markdown 约定。Message 属于**不可变 Commit**，不是 Branch 专属描述，也不是另一份知识数据：

```markdown
## 简介

这个 Commit 完成后的知识世界是什么、包含哪些已确认的知识、主要用于什么。

## 改动

- 本次实际新增、修正或删除的知识或模型。
- 如有必要，说明本次变化的已知范围与未决部分。
```

- **`## 简介` 描述提交后的完整知识世界，而非本次增量**；新 Commit 应根据已知的实际模型和知识维护这一描述，不根据计划、未读取的内容或未经验证的效果臆造全库事实。首个非空行应能概括知识世界及用途，方便 AI 发现相关知识。
- **`## 改动` 只描述本次实际变化**，区分已执行的修改、尚未验证的效果与未解决的问题；提交成功或 Commit Message 自述不等于业务质量验证通过。
- `kgos_ontology_overview` 的 Branch 索引仅从独立且按顺序出现的准确标题 `## 简介`、`## 改动` 之间提取**首个非空原文行**；Branch 详情仍展示**完整原始 Message**。不符合约定的历史或新 Message 会显示“无规范简介”，但并不因此成为无效 Commit。
- 这是**AI 写入建议而非 Kernel 的必填或格式校验**。`message` 仍可省略；Branch Create、fast-forward、up-to-date、无变化 Patch 等可能不产生新 Commit，不能为补全简介额外强制创建 Commit。多个 Branch 可共享同一 Commit 及 Message，已有 Commit 的 Message 也不能原地修改。

## Merge 不是自动猜测结果

`evolution.merge.start({branch,source})` 创建 Session。先 `merge.get` / `merge.conflicts` 观察 `session` / `revision` / 冲突，再调用 `merge.resolve({session,expectedRevision,resolutions})`。每个 Resolution 必须有已知冲突 ID：`choice:"ours"` 或 `"theirs"` **不带 value**，`choice:"value"` 则**必须带 value**。再次 `merge.get` 确认 ready 和最新 Revision，使用 `merge.finalize({session,expectedRevision})`；如果已过期应重新读取判断，不能自动覆盖当前 Branch。`merge.abort` 也需要 Revision。

```js
const session=await evolution.merge.get({session:"<session-id>"});
return {status:session.status,revision:session.revision};
```

上例读取前要先通过实际 `start` 或 `list` 获得真实 Session ID。`kgos_mutate` 脚本含多次 mutation 时没有跨方法原子性；中途失败要查最终 Head/History 后再决定操作。
