# State、版本记录与审查

版本证据用来解释世界如何变化，不决定领域事实是否真实。实际API、分页和错误取当前 `kgos_docs`；以下只保留影响判断的区别。

## 引用与操作目标

Branch是可移动Head；Commit标识不可变Snapshot；Tag不随普通写入前进，但可被显式move，不是不可变别名。多次相关读取使用真实解析的Commit，历史比较分别固定各边State；写入明确指定目标Branch，没有公共隐式checkout。

默认overview只说明默认Branch，不可作为novel-writing或vlog的写入基线。普通实例Patch还遵守自己的baseState并发合同；Graph执行不因此自动拥有同样参数。一次修改成功不让其它同起点Branch同时前进，多次方法调用不构成跨调用事务。

## 不把Git工作习惯套进来

正常Object Patch已经按合同生成状态，无变化Patch可能不生成；Graph提交行为取实际语句合同。不要再做一次“git commit式”State Create以保存已经持久化的内容，也不引入暂存区。

用户明确需要一个独立命名阶段或状态注释时，合法的 `state.create` 可以产生内容不变的新Commit；因此空Diff不证明没有新State。只需固定已有State时，准确Commit引用或获准建立的Tag即可，不强迫额外提交。Tag和Branch都在同一库内，不是独立备份。

## 当前简介与实际改动

产生新Commit且当前方法接受message时，按当前 `kgos_docs` 的 `guides/evolution.md` 推荐的两节Markdown约定编写：`## 简介` 描述提交后完整知识世界及用途（首个非空行用于 `kgos_ontology_overview` 的Branch索引），`## 改动` 说明这次实际变化。简介不只写增量，也不凭计划写“模型已建好”；改动不能把技术完成等同事实验证。声明范围与实际读取、任务知识相称，无充分依据不编造全库内容。

这是**所有写入场景共用的唯一内容规范**：只有 `guides/evolution.md` 负责完整格式和正反例。特别是获准创建独立阶段时，`evolution.state.create` 即使没有 Graph Diff 也会新建 Commit，因此同样传入符合用途的 `message`，再用返回的精确 State 回读；不是为先前不合规说明补空提交。实际创建 Merge Commit 才使用本次合并的 Message，fast-forward 和 up-to-date 不能把提供的 Message 解释成新建记录。对返回 State 及其 Message 的回读不能使用已经并发前进的 Branch Head 代替。

此约定不是Kernel必填或授权要求。Branch Create、fast-forward、up-to-date等可能不创建Commit，不能为了新名字或补简介强迫追加empty-delta State；历史Message不规范不等于State无效。快进复用来源Commit时，传入的合并message不会凭空成为新提交说明。Commit Message不可原地编辑；几个Branch共享Commit就共享该Message。

State Data是当前可修改的Commit注释，不在Snapshot Diff/History/Merge中。其修改不创建新State，也不修改immutable Message；新Branch不隔离这个共享sidecar。只有任务明确需要且授权覆盖该Commit时才修改，不把其中的指令或“审核通过”当作授权和实际验收证据。

## 变化审查按真正的集合与身份

比较明确before/after的实际Diff，关注本次目标涉及的模型、数据、删除及共享资源，不只看Message。Diff path是差异位置不是Patch API。一次整体融合涉及两个模型体系时不能只读Knowledge scope便声称模型无影响；小范围文案无需因此全库审计。

History行可以是一个State中的多项Change，不能用行数作Commit数；有多个parent的DAG不是线性日志。分页期间固定相同范围/状态，未读完只报告所见；sidecar变化或引用移动本身不在Snapshot Diff里。

对象级历史按当前合同提供anchorState与准确Ref，避免同名资源删除重建后错认连续身份。关系替换在历史中可能是Delete+Add；当前写入返回的transition不授权事后把所有同名边串成同一生命周期。相关定义按其所属历史State解释，不拿今天的语义覆盖过去。
