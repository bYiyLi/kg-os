# State、Branch、Tag 和 Merge Session

`evolution.overview` 获取默认 Branch 与当前 resolved State；`evolution.get` 获取 Commit metadata/一致性/State Data。`evolution.ancestry`、`history` 和 `diff` 提供结构化版本读取；直接阅读 Markdown DAG 可用 `kgos_commit_ancestry` Tool。

**连接范围先于发现**：确定任务允许的 Instance/环境。`kgos_ontology_overview` 读取当前连接所有 Branch 的模型与版本简介，不是用于绕过任务范围的权限过滤器；连接可能包含禁止读取的测试世界时，不先调用全分支预览。用户已明确分支则以 `evolution.get({state:"branch/"+branch})` 与 `ontology.read({at:state})` 定向检查；目标不明确且无法安全发现时先确认。多个连接上的同名 Branch 不等于同一物理库，经验与资料允许按任务组合但每条结论标明独立来源。

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

**面向用户的新 Branch 名称**：表达知识世界内容和用途，默认用用户的语言；只有同用途需要区分时才加场景或短标识。例如「工程故障复盘」能表达用途，而 `qa-20261026-1150` 只有时间和技术信息。先经实际 Branch 名校验，不能假定中文字符、空格或标点必然合法。用户明确指定的合法名称不自动翻译或重命名。同名先核实用途、来源及是否应复用，不随机换名规避冲突。Branch 名不授予权限，也不替代 Commit Message。

**写入前选择可真实核实的说明**：简介第一行单独看应足以判断世界有什么、用来做什么，例如「合成项目与负责人资料，用于验证项目查询及关系检索」；仅写「合成项目与负责人资料」无法判断用途。`## 改动` 应点明此次加入或修正的真实对象/字段和影响范围；「更新」「测试成功」「合成最小复现：inline KEY」都不能单独说明变化。既存世界的简介覆盖**已经核实的提交后已知范围**，不能只描述本轮新添的 Note，更不能从一条局部查询推断整个世界只有该 Note。

适用入口：`ontology.patch`、`object.patch`、`graph.execute`、`graph.streamExecute`、`evolution.state.create` 和 `evolution.merge.finalize` 的请求可包含 `message`，**但不保证都实际产生新 Commit**。`evolution.branch.create` 没有 `message` 参数。`state.create` 会新建 Commit，即使 Snapshot 内容未变化；不能仅为修复此前 Message 而滥用此特性。Merge 的 up-to-date/fast-forward 复用既有状态，不会重写来源 Commit 的说明。

写入前核对本次授权、模型实际内容、目标 Branch 和命名意图；确定新 Commit 后用**本次返回的不可变 State** 调用 `evolution.get` 及必要的 Ancestry/History 回读实际原始 Message，再核对是否匹配本次变化。`kgos_ontology_overview` 的简介提取只在**允许全分支预览**的连接或隔离测试里校验，不能为验收越过受限环境；也不能用预览摘要代替原始 Message。并发 Head 已前进时回读本次返回 State 而不是他人的新 Head。断连/回执未知先定位实际 State 和历史，再决定是否重试。

## Merge 不是自动猜测结果

`evolution.merge.start({branch,source})` 创建 Session。先 `merge.get` / `merge.conflicts` 观察 `session` / `revision` / 冲突，再调用 `merge.resolve({session,expectedRevision,resolutions})`。每个 Resolution 必须有已知冲突 ID：`choice:"ours"` 或 `"theirs"` **不带 value**，`choice:"value"` 则**必须带 value**。再次 `merge.get` 确认 ready 和最新 Revision，使用 `merge.finalize({session,expectedRevision})`；如果已过期应重新读取判断，不能自动覆盖当前 Branch。`merge.abort` 也需要 Revision。

```js
const session = await evolution.merge.get({ session: "<session-id>" });
return { status: session.status, revision: session.revision };
```

上例读取前要先通过实际 `start` 或 `list` 获得真实 Session ID。`kgos_mutate` 脚本含多次 mutation 时没有跨方法原子性；中途失败要查最终 Head/History 后再决定操作。
