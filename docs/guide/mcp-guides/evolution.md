# State、Branch、Tag 和 Merge Session

`evolution.overview` 获取默认 Branch 与当前 resolved State；`evolution.get` 获取 Commit metadata/一致性/State Data。`evolution.ancestry`、`history` 和 `diff` 提供结构化版本读取；直接阅读 Markdown DAG 可用 `kgos_commit_ancestry` Tool。

**目标 Branch 的 Head**：`evolution.overview().state` 只解析默认 Branch。读取或修改其它 Branch 时，先明确目标名称，再调用 `evolution.get({state:"branch/"+branch})` 取得返回的 `state`（immutable Commit）；也可从 `evolution.branch.list().items` 中按精确 `name` 查找同一 State。写入请求的 `branch` 字段是**不带 `branch/` 前缀**的名称，不能把 `overview().defaultBranch` 当作隔离测试目标。修改失败或未知结果后，仍应重新解析**该目标 Branch** 的 Head。

StateRef 格式是 `commit/<64-lowercase-hex>`、`branch/<name>` 或 `tag/<name>`。`branch.create({name,from})` 的 `from` 必须提供 **StateRef**（如 `branch/main`），不是裸 Branch 名字；`branch.list` 和 `tag.list` 返回当前引用。`evolution.state.create` 即使没有图差异也会创建 Commit；`state.setData/clearData` 修改的是不进入 immutable graph snapshot 的可变 State Data。**State Data 按 Commit 而非 Branch 存储**：仅创建新 Branch 并不会隔离来源 Commit 的 Data；如需测试 State Data 写入，先在测试 Branch `state.create` 一个独有 Commit，再仅对该 Commit 设置或清理 Data，不触碰与默认 Branch 共享的来源 Commit。

## Merge 不是自动猜测结果

`evolution.merge.start({branch,source})` 创建 Session。先 `merge.get` / `merge.conflicts` 观察 `session` / `revision` / 冲突，再调用 `merge.resolve({session,expectedRevision,resolutions})`。每个 Resolution 必须有已知冲突 ID：`choice:"ours"` 或 `"theirs"` **不带 value**，`choice:"value"` 则**必须带 value**。再次 `merge.get` 确认 ready 和最新 Revision，使用 `merge.finalize({session,expectedRevision})`；如果已过期应重新读取判断，不能自动覆盖当前 Branch。`merge.abort` 也需要 Revision。

```js
const session=await evolution.merge.get({session:"<session-id>"});
return {status:session.status,revision:session.revision};
```

上例读取前要先通过实际 `start` 或 `list` 获得真实 Session ID。`kgos_mutate` 脚本含多次 mutation 时没有跨方法原子性；中途失败要查最终 Head/History 后再决定操作。
