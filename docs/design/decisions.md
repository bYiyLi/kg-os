# 架构决策记录

本文件记录 KG OS 架构决策的**决定、依据、备选、取舍与被替换基线**。具体运行行为仍由对应职责设计文件拥有；本文件不建立第二份操作合同。

2026-09-19 的最新调整见 [D59 Cypher 原样执行](#d59-cypher-passthrough) 与 [D60 自动填充 embedding 缓存](#d60-automatic-embedding-cache)。[D57](#d57-managed-semantic) / [D58](#d58-optional-indexes) 及更早条目保留当时的决策依据；被后续决定调整的部分在对应条目下标明，不与当前 owner 文档并行生效。

## 底层架构替换背景

当前仓库尚无 KG OS 业务实现，因此本次是设计基线替换，不存在已经发布的 KG OS 数据格式需要兼容迁移。

旧基线：

```text
CLI / SDK / Web / Skill (TypeScript / npm)
→ kgosd (Rust local daemon)
→ 自定义 Ontology Schema / JSON Schema / unique / cardinality
→ 自建 Graph Engine（GraphQLite fork）+ FTS5 / sqlite-vec
→ SQLite
```

新基线：

```text
CLI / SDK / Web / Skill (TypeScript / npm)
→ kgosd (Rust local daemon)
→ Object / Graph / Evolution + Ontology / Knowledge semantics
→ Lithograph public capabilities
→ SQLite
```

本次替换不改变 KG OS 的产品核心：AI-first、Graph-first、调用方定义领域模型、Agent 在 Kernel 外部，以及“一切皆可被定义”。它也不改变早期已经确认的 `kgosd` 本地 daemon 与 Rust / TypeScript 上下层分工。改变的是底层责任归属：通用数据库能力回归 Lithograph，KG OS 聚焦知识库语义、编排与交互。

本次 Ontology 交互基线修正见 D46；以下决定为修正后的当前结论，不将早期讨论中的提案自动视为已确认行为。

## 关键设计决定

### D1 Lithograph 是 KG OS 的数据库核心

- 决定：KG OS 的图、Schema、Search 与 versioned-state mechanism 统一依赖 Lithograph 公开能力。
- 依据：这些能力已经属于独立通用数据库 Lithograph 的产品边界，KG OS 不应复制实现。
- 备选：继续维护 KG OS 自建 Graph Engine。
- 取舍：KG OS 明显简化，但实现进度受 Lithograph 对应公共能力的实际可用性约束。

### D2 Ontology Structure 只有一个持久真源

- 决定：Lithograph Schema 保存结构事实；KG OS 提供自己的 Domain / Definition 逻辑 aggregate 和正反向 compiler，不保存第二份可独立写入的 Schema。
- 依据：唯一持久真源与统一公共编辑模型可以同时成立；数据库 resource 拆分不是调用方工作流。
- 备选：照搬底层 Schema resource API，或并行持久化一份完整 KG OS Schema。
- 取舍：KG OS 承担类型/required/unique/from/to/Constraint/Index 到公开数据库能力的映射，实际约束执行仍由 Lithograph 完成。

### D3 Ontology 上层语义作为普通图数据

> 后续调整：[D59](#d59-cypher-passthrough) 将 Knowledge Graph View 隔离限定于 Object / Ontology 高层能力；公共 Graph 不注入该过滤。

- 决定：Definition / Property 的 `title` / `description` 由稳定的 KG OS internal Binding Record 承载；Domain / `INCLUDES` 直接组织这些 Binding Record；Binding Record 通过 Snapshot-scoped Schema Locator 指向同一 Snapshot 的 Lithograph Schema element。全部仍是 Lithograph 中的普通 versioned graph data。
- 依据：Cypher 25 Graph Type 当前没有通用 description annotation，也不负责 KG OS 业务组织；普通图数据可以在不修改 Lithograph 的前提下承载上层语义并自动版本化。
- 备选：给 Lithograph 增加 KG OS 专用 Schema annotation。
- 取舍：KG OS 需要维护 Binding Record 与 Schema Locator 的一致性，并通过 Lithograph Graph View 在普通 Knowledge 访问中隔离自身 internal graph；内部 graph 同时受完整 Lithograph Schema / Constraint 约束，因此需要同一 Schema 中的 reserved internal Schema resources。

### D4 Definition 是读取与 mutation aggregate

- 决定：Node / Relationship Definition 一并呈现和编辑属性、说明、约束与索引，复用统一 Object Patch 编排所有底层变化。
- 依据：AI 应修改一个完整局部模型，而不是分别拼接数据库资源操作。
- 备选：只做读取聚合，写入仍要求逐 Property/Constraint/Index 操作。
- 取舍：compiler 需要共享资源归并和依赖分析；不增加第二份 Definition 存储。

### D5 Evolution 只映射 Lithograph 的统一状态历史

- 决定：Ontology、semantic metadata 与 Knowledge 共用同一个 Lithograph Commit DAG；KG OS 把 Commit 解释为 State，把 Branch / Tag / Commit Data 分别解释为演进路径、状态标签与 State Data，但不建立第二套 State storage、identity 或 history。
- 依据：Schema 与普通 graph data 已经进入 Lithograph canonical history，且 Lithograph 已提供 Commit Data / Tag 等通用 state sidecar/ref 能力。
- 备选：KG OS 单独维护 State、Tag、annotation 或 Ontology version。
- 取舍：状态身份与数据库 history 统一；KG OS 需要提供业务化 Evolution view，并严格区分 immutable State Snapshot 与 mutable State Data / refs。

### D6 SQLite 是 Host，不是 KG OS 数据接口

- 决定：KG OS 只为 Lithograph 使用 SQLite connection / extension loading / transaction boundary，不直接维护知识业务表。
- 依据：避免绕过 Lithograph 的 Schema、版本和数据完整性合同。
- 备选：KG OS 在同一 SQLite database 中直接维护并查询业务表。
- 取舍：所有持久化知识能力必须能通过 Lithograph 公共接口完成。

### D7 Domain 是弱约束的业务组织图

- 决定：Domain 通过 `includes → Domain | Definition` 组织 Ontology，不要求 tree / DAG，不产生 namespace、Schema scope、权限或数据隔离。
- 依据：Domain 的当前需求是帮助 AI / 人按业务语境浏览和理解模型，而不是重新定义模型结构；Lithograph 已经承担真实图和 Schema 约束。
- 备选：建立强层级 Domain tree、独立 Domain Schema 或 Domain-local namespace。
- 取舍：调用方可以表达多父级、跨领域和 cycle；KG OS 的递归读取必须 graph-safe，但不替调用方判断业务组织是否合理。

### D8 Ontology 通过全局地图与明确引用渐进加载

- 决定：Ontology read 提供全局 Overview、可选 Domain 展开与 Definition 详情；每个导航项有语义说明和准确 Ref。Ontology 不提供 search，也不通过 Object search 绕过。
- 依据：来源是已知、可导航的模型，不需要用巨型 Markdown 的文本检索替代模型组织。
- 备选：旧 Object list/search 拼资源方案，或全库可编辑文档/虚拟文件系统。
- 取舍：Overview 只读；详情可取得 canonical YAML 后用共享 Patch 编辑。无 Domain 时直接导航 Definition，大结果保持有界与显式 continuation。

### D9 共享 Object / Graph / Evolution 与 Ontology 读取体验

- 决定：Object 维护业务 aggregate；Graph 负责直接 Cypher；Evolution 负责统一历史。Ontology 提供聚焦模型理解的 read surface，编辑复用 Object read/patch，不复制 CRUD。
- 依据：统一的是数据修改合同，不是要求所有读取任务只能使用同一种低层资源列表。
- 备选：为每类数据库资源建 API，或用统一文件抽象隐藏所有图数据。
- 取舍：新增的 Ontology 阅读入口不增加独立 mutation、identity 或版本引擎。

### D10 Object Patch 使用 canonical YAML + Git Extended Diff

- 决定：Object `read` 的 editable representation 是稳定 canonical YAML；Object `patch` 接收基于该 YAML 生成的普通 two-way Git Extended Diff（`git diff -p`）Patch，并覆盖 Add / Update / Delete / Rename / Restructure。KG OS 不自定义 Patch section / hunk / pathname-quoting grammar；多 Object 使用多个 `diff --git` entry，新增 / 删除 / rename 复用 Git 标准 extended headers 与 `/dev/null` 语义。一个请求可以修改多个明确 Object；已有对象使用 owner-backed Object Ref，新增对象只使用 request-local alias。Patch 对 `baseState` canonical YAML 精确应用，不 fuzzy match；Add/Update/Delete/Rename 不做隐式 upsert / no-op。KG OS 不使用 JSON Patch、JSON Merge Patch 或 `op/path/value` mutation DSL 作为公共 Object mutation 模型。系统分配的 identity 不能由调用方直接重写，但业务结构变化可以导致底层 replacement / data rewrite，并通过 Ref transition / Evolution diff 暴露结果。
- 依据：AI 天然擅长读取稳定文本并生成文件式局部 Patch；Git Extended Diff 已经提供成熟、广泛实现的修改、新增、删除、rename、多目标和 pathname quoting 文本语法，没有当前需求要求 KG OS 再发明一套 Patch grammar。同一 Object mutation 模型可以维护 Definition（含 Property/Constraint/Index）、Domain、Knowledge Node / Relationship，避免 `mutate`、Ontology CRUD、Domain CRUD 等重复写接口。Lithograph 已经把标准 Cypher 25 定义为正常 graph / Schema / Index mutation language，并提供 explicit transaction 作为多 query 单 Commit boundary；KG OS 只负责把业务 Object target change 编译到这条底层路径，不再发明数据库 mutation engine，也不把 Lithograph Structural Patch 扩成第二套 CRUD API。
- 备选：自定义 KG OS textual Patch framing；使用 RFC JSON Patch / Merge Patch；使用 operation-oriented JSON mutation DSL；Object Patch 只做 Update 而 Create/Delete/Rename 使用独立 API。
- 取舍：KG OS 必须维护 canonical YAML renderer、标准 YAML parser，并解析 / 应用本文冻结的 Git Extended Diff profile，再把业务 target change 编译成 Lithograph 实际 graph / Schema / Index mutation；Object Ref / alias target 与 logical Patch request/result 已由 D36/D37 冻结，剩余复杂度集中在 logical slot 到 Lithograph public mutation 的实现映射。Git blob hash、file mode、filesystem / index 行为不会成为 KG OS 业务语义，unsupported Git patch form 也不会因为 Git 支持就自动进入 KG OS v1。

### D11 Binding Record 提供语义连续性，Schema Locator 只负责定位

- 决定：KG OS 不要求 Lithograph 提供永久 `SchemaElementId`。每个调用方可见 Definition / Property 在 KG OS-valid State 中都恰好有一个稳定内部 Binding Record，即使没有任何 `title` / `description`；Binding Record 保存 Snapshot-scoped Schema Locator，Locator 只在目标 Commit 的 Schema 中确定性定位 element type / Property。调用方可见 Schema element 与 Binding Record 之间必须保持双向一一覆盖，reserved internal Schema element 例外。
- 依据：KG OS 当前需要的是 metadata、Domain membership 与显式 rename/history 的连续性，而不是把 Lithograph Schema 自身改造成带永久对象 ID 的另一种模型。Binding Record 已经能承担 KG OS 的连续性需求；结构事实仍由 Lithograph Schema 唯一拥有。
- 备选：仅以名称字符串同时承担跨版本连续 identity；要求 Lithograph 新增跨版本永久 Schema element identity；在 KG OS 再建立一份独立结构 Schema。
- 取舍：KG OS 为没有自然语言语义的 Definition / Property 也维护一个轻量 Binding Record；换取稳定 rename/history continuity 与确定性 Domain target。通过 KG OS 执行的 create / rename / delete 必须原子得到合法目标 Snapshot并维持双向一一覆盖；绕过 KG OS 的直接 Schema 修改可能产生 consistency error，KG OS 不做无依据自动修复。

### D12 Evolution 不镜像 Lithograph Version Procedure

- 决定：KG OS 当前 Evolution 只提供 `overview/get/ancestry/history/diff`、State create/data、Branch lifecycle、Tag lifecycle 与 merge；不因为 Lithograph 有 patch/rebase/squash/reset/revert/gc/checkout 就全部复制为 KG OS 公共能力。
- 依据：KG OS 的产品职责是知识世界的状态演进，不是通用数据库版本控制客户端；直接复制底层接口会扩大公共合同并泄露 internal semantic graph / connection-local 机制。
- 备选：一比一包装 Lithograph Version Procedure。
- 取舍：KG OS 公共能力更小、更稳定；高级数据库版本操作仍可由 Lithograph 提供，未来出现真实 KG OS use case 时再按业务语义提升。

### D13 State 引用显式且所有状态写入返回最终 State

> 后续调整：[D59](#d59-cypher-passthrough) 保留请求的 State / 默认 Branch 上下文；语句内部显式 target、checkout 与 procedure 执行按底层合同，不由 KG OS 解析限制。

- 决定：Ontology / Object / Graph Read 直接使用 State / Branch / Tag reference；Branch / Tag 在 operation 开始时解析并 pin 到 immutable State，不再建立独立 `State Context` 抽象。Object Patch / Graph Execute 显式指定目标 Branch，不暴露 checkout；任何创建新 State 的 KG OS 操作成功后都返回最终 State identity，多步编排不要求调用方理解内部 Commit 数量。
- 依据：Git-style ref 已足以表达“读取哪个 Snapshot / 推进哪个 Branch”，无需再增加一层状态对象；同时 AI 与并发调用不应依赖 connection-local 隐式状态。
- 备选：建立独立 State Context request object；依赖 Lithograph checkout；或仅返回业务 mutation result 不返回 State。
- 取舍：公共模型更小；State / Branch / Tag 的 canonical StateRef 已由 D35 冻结，CLI / SDK / HTTP 只需要做 adapter mapping，不再创建第二套状态身份或引用格式。

### D14 Object Ref 定位业务 aggregate 或原生 Knowledge

- 决定：公共 Object Ref 只包括 node:/relationship:/domain: 与 Lithograph 原生 n:/r:。Property、Constraint、Index 在 Definition 内定位，不作为独立 CRUD Object。
- 依据：调用方需要精确引用，但不需要学习全部底层 Schema resource 地址。
- 备选：继续提供 graph-type:/property:/constraint:/index: 顶层对象，或引入新 UUID。
- 取舍：顶层 rename 改 Ref；内嵌内容在 Definition 的字段位置报告。连续性仍由内部 Binding/原生 element identity 提供。

### D15 Definition / Property 删除不隐式级联 Knowledge

- 决定：Definition / Property delete 必须对整个 Object Patch 的目标 Snapshot 做 dependency 校验。若目标状态仍有依赖则 reject；KG OS 不自动删除、改写或保留 orphan Knowledge，也不在 v1 提供 `force` / `cascade` / `preserve_orphan` 模式。调用方可以在同一个 Object Patch 中**显式**改写 / 删除依赖 Knowledge 后再删除结构，只要最终 Snapshot 合法。成功删除同时清理对应 Binding Record；删除 Definition 时同时清理其 Property Binding Records 与 Domain `INCLUDES` membership。历史 State 不受影响。
- 依据：Schema 生命周期操作不应隐式触发大规模业务数据丢失或替调用方做数据改写决策；同时 Object Patch 应能原子表达调用方已经明确给出的完整目标变化，不强迫拆成多个请求。
- 备选：删除 Definition 时级联删除相关 Knowledge；允许删除结构后保留无法由当前 Ontology 解释的 orphan Knowledge；提供 `force` 参数让单个操作选择行为。
- 取舍：调用方必须显式声明依赖 Knowledge 的改写或删除，不能只要求“强制删结构”；这些变化可以放在同一个 Object Patch 中原子完成。换取的是无隐式数据损失、没有 orphan 状态，也无需维护多套删除模式。

### D16 Object Patch 使用 strict base State

- 决定：Object Patch 必须基于调用方实际读取到的 immutable `baseState`，并显式指定目标 Branch；执行开始时目标 Branch head 必须仍等于 `baseState`，执行期间目标 Branch 再次移动也必须按 Lithograph branch-head compare 失败。KG OS 不把旧文本 Patch 自动套用到新 State，不自动 rebase / merge。
- 依据：textual Patch 的语义来自调用方看到的 canonical YAML；在不同 Snapshot 上“尽量应用”会把文件 Patch 模型变成隐式 merge，并产生难以预测的 AI 写入结果。Lithograph 已提供 Branch head compare 与 `BRANCH_HEAD_MOVED` 底层并发保护。
- 备选：即使 Branch 已前进，只要 Lithograph raw patch 的 before condition 仍满足就继续应用；自动 three-way merge / rebase。
- 取舍：并发写发生后调用方需要重新读取最新 Object 并重新生成 Patch；换取明确、可重复的 mutation base 和更简单的冲突语义。

### D17 Definition rename 执行语义保持的 Knowledge data rewrite

- 决定：Definition / Property rename 不是只修改 Schema 名称与 Binding Locator；KG OS 必须同步更新依赖的 Schema / Constraint / Index references，并完成保持已有 Knowledge 业务含义所必需的**同次 mutation 内数据改写**。Node identifying Label rename 改写受影响 Node 的 Label；Property rename 只作用于 owner Definition 按 Lithograph Schema coverage 覆盖的 element，不全图修改同名 key，并且不得静默覆盖已有新 key value；如果同一 physical property 同时承载其它 Definition 的语义且无法无损局部改写则失败。Relationship Type rename 在底层不能原地修改时重建受影响 Relationship 并产生新的 element identity。任何不能安全得到合法目标 Snapshot 的 rename 整体失败。这个 semantic-preserving data rewrite 是显式 rename 的组成部分，不是独立 migration job，也不属于 D15 禁止的“Delete 隐式级联数据删除”。
- 依据：Definition 是当前 Knowledge 的模型解释；只 rename Schema 而留下旧 Label / Type / Property key 会使同一成功操作产生结构与数据脱节的 State，这与 Object Patch“描述目标 Object 变化并由 KG OS 编排底层实现”的合同冲突。
- 备选：rename 只改 Definition，要求调用方另行逐项改写全部 Knowledge；禁止 rename，只允许 create + manual rewrite + delete。
- 取舍：rename 可能是高成本批量操作，Relationship Type rename 还会改变大量 Relationship Ref。只有调用方直接寻址修改的 Object 承诺 Ref transition；Definition-level 批量 Relationship replacement 不承诺可永久恢复的一对一 oldRef→newRef 映射，调用方通过新 State 的 Graph 重新发现对象，并通过 bounded Evolution diff/history 审计集合变化。

### D18 Object 删除不隐式 DETACH Knowledge Node

- 决定：Object Patch 删除 Knowledge Relationship 只删除该 Relationship；删除仍存在 incident Relationship 的 Knowledge Node 时 reject，除非同一 Object Patch 已显式删除或重构这些 Relationship。Object Patch 不把 Node delete 自动提升为 `DETACH DELETE`。
- 依据：Object Patch 的价值之一是让 AI 明确表达目标对象变化；静默 DETACH 会因为一个 Node delete 隐式删除其它有独立 identity 的 Relationship Object，违背无隐式数据损失和明确 Object mutation 原则。
- 备选：所有 Node delete 默认 DETACH；为 Node delete 增加 cascade flag。
- 取舍：删除连接度高的 Node 需要调用方明确处理 incident Relationship；需要大规模条件删除时仍可用 Graph `execute` 明确表达 Cypher `DETACH DELETE` 等集合 mutation。

### D19 Object History 使用 aggregate anchor State 与 Ref

- 决定：History / Diff 按 anchor State + 公共 aggregate Ref 定位；Property/Constraint/Index 的变化在 Definition 内呈现。不能用同名字符串猜测跨 drop/create 生命周期。
- 依据：聚合编辑后，历史也应在相同业务模型里解释变化，而不是让 AI 重新认识底层对象。
- 备选：把底层 Schema 每个资源的历史都暴露为独立对象。
- 取舍：公共 Ref+path 与底层 continuity 分开，shared Index 只归并展示一次，仍保留真实资源名和完整作用范围。

### D20 Knowledge replacement 不建立持久 Ref alias

- 决定：当直接 Knowledge Relationship Object Patch 因 type / endpoint 变化必须 replacement 时，成功结果可以返回旧 Ref → 新 Ref transition，帮助调用方继续本次工作；KG OS 不把该 transition 持久化为第二套 Knowledge identity / alias，也不让后续对象级 History 自动跨两个 `r:<id>` 合并生命周期。
- 依据：Lithograph Relationship identity 独立且 type / endpoint 变化通过新 Relationship 表达；持久保存 replacement continuity 会重新建立 KG OS 自己的 Knowledge identity mapping，与“直接复用 Lithograph element identity”冲突。
- 备选：为所有 replacement Relationship 建立 KG OS stable knowledge ID；把 Ref transition 永久记录进 semantic graph。
- 取舍：持有旧 `r:<id>` 的调用方必须使用当次 mutation result 更新引用，Definition-level 批量 replacement 后则重新 Graph query；换取不引入第二套持久身份和历史真源。

### D21 重叠聚合按显式 logical delta 归一化

- 决定：同一共享资源出现在多个 Definition 中可以正常读写；相同 slot 相同显式目标合并一次，不同目标或删除/修改竞争整体冲突。未修改的副本只是上下文。
- 依据：展示聚合不是存储复制；按读取重叠直接拒绝会把内部复杂度再次推给 AI。
- 备选：旧 parent/child 或多视图一律拒绝，或按 entry 顺序覆盖。
- 取舍：compiler 必须先辨识资源与真正变化再执行；冲突定位到聚合字段，不要求调用方切换底层 API。

### D22 无有效 Object delta 不创建新 State

- 决定：Object Patch 在解析、归一化并比较 target Object set 后，如果没有产生任何 Ontology / Knowledge Snapshot change，则不执行 Lithograph mutation，不创建 Commit，成功结果的最终 State 仍是 `baseState`。需要内容不变但创建新 State 的调用方必须显式使用 Evolution `state.create`。
- 依据：Object Patch 表达对象状态变化，而 KG OS 已经有专门的 `state.create` 表达业务上的 empty-delta State；让普通 Patch 因无效编辑产生空 Commit 会混淆两种意图并污染历史。
- 备选：所有 syntactically valid Object Patch 都创建 Commit，即使 effective delta 为空，完全继承 Lithograph mutating-query write-intent 语义。
- 取舍：Object Patch 的 write-intent 不单独记录空状态；需要这种历史事件时调用方多一步显式 `state.create`，换取更可预测的 Object mutation history。

### D23 Object Patch 内已有对象引用统一按 base State 解析

- 决定：Object Patch 中所有指向 baseState 已存在 Object 的引用，无论出现在 entry target 还是另一个 Object 的内容中，都使用并解析 baseState Object Ref。若同一 Patch rename 该 Object，KG OS 依靠已解析的逻辑对象连续性把引用带到目标 Snapshot；同一 Patch 不使用 rename 后尚未产生的新 Ref 重新定位它。本次新建 Object 则使用 request-local alias。
- 依据：strict base-State textual Patch 来自调用方实际看到的 base canonical YAML；要求 AI 在同一 Patch 中混用“现在的 Ref”和“未来的 Ref”会增加不可验证的引用时序，并使结果依赖 entry 顺序。
- 备选：允许 old/new Ref 混用并由 KG OS 猜测；要求 rename section 先执行后其它 section 才能使用新 Ref。
- 取舍：同一 Patch 中引用正在 rename 的已有 Object 时继续写旧 Ref，看起来不是最终展示值；换取所有引用都能在执行前确定解析，target Ref 只作为结果产生。

### D24 公共聚合边界不等于底层 ownership

- 决定：Domain 编辑自身组织；Knowledge 编辑自身图数据；Definition 可以统一编辑其属性、约束、索引与解释，即使底层由多个资源承载。
- 依据：一条逻辑需求可能合理地涉及多个底层 owner，KG OS 的价值就是确定性编排。
- 备选：旧 owner-only 规则禁止 Definition 内编辑 standalone resource。
- 取舍：读取摘要与 editable body 仍明确分离；无关对象内容不成为隐式写目标，shared resource 服从 D21。

### D25 Ontology 不镜像数据库资源目录

- 决定：Ontology 一级编辑入口为 Domain、Node Definition、Relationship Definition；图类型组织和底层 Schema resource 管理由 compiler 承担。当前 profile 之外的数据库管理能力不自动成为 KG OS 公共 API。
- 依据：完整覆盖用户模型需求不等于一比一包装所有数据库管理能力。
- 备选：旧规则要求所有 versioned Schema resource 都有独立公共 Object。
- 取舍：必须在现有聚合中表达已承诺的类型/关系/复合约束/多目标索引；不能借 profile 或 ownership 把常见操作退给调用方。

### D26 公共目标变化由 compiler 实现而非原地操作限制

- 决定：Patch 定义 KG OS 目标语义；compiler 可使用公开 DDL/DML staged replacement 实现逻辑更新。系统分配 Knowledge identity 不可任意改写，既有无隐式数据损失边界保留。
- 依据：底层缺少一个原地 ALTER/rename 不意味着 AI 要手工编排资源。
- 备选：把原生操作的一对一限制当作公共编辑模型。
- 取舍：不能实现合法无损目标时清晰报错；不能为模拟操作绕过约束或删除未授权数据。

### D27 Graph Type 是 compiler 管理的结构组织

> 后续调整：[D59](#d59-cypher-passthrough) 允许 Graph 执行底层 Schema / Graph Type Cypher；本条只限定 Ontology / Object 的聚合表达，不禁止直接 DDL。

- 决定：KG OS 从公共 Definition 集合合成需要的 Graph Type mutation，并保持未修改的结构和 reserved internal Schema。Graph Type 不成为另一个可全量编辑 Definition 的公共 Object。
- 依据：避免再次产生整图与局部 Definition 两套写入模型。
- 备选：完整透传 Graph Type AST，或要求 AI 先编辑独立 Graph Type。
- 取舍：真正图级管理能力需要实际使用需求再进入 KG OS 设计，不以底层存在为依据扩充 API。

### D28 Constraint 与 Index 纳入 Definition 编辑

- 决定：单字段规则放在 Property 附近，多字段规则放在 Definition；多 Definition 索引展示完整 targets，可从任一参与聚合修改。真实索引名称对 AI 可见，底层独立资源由 compiler 管理。
- 依据：用户需要一次读写完整局部模型；standalone 是底层组织，不是强制公共 CRUD。
- 备选：旧规则只允许 Constraint Object / Index Object 修改，或把 Index 隐藏为抽象 Search Boolean。
- 取舍：KG OS 负责确定命名、来源归并、作用范围、冲突与必要 rebuild/maintenance，不新增 Index UUID/owner registry。

### D29 聚合变化可以派生引用维护

- 决定：Definition / Property rename 由 compiler 同步更新 Domain、关系端点、约束与索引的引用，并保留未请求的配置与真实 Index name。
- 依据：调用方已表达完整逻辑目标，不应为保持同一引用重复编辑所有关联资源。
- 备选：所有引用者要求逐个 Patch，或 rename 顺带重置其它配置。
- 取舍：显式 delta 与派生变化不一致时整体冲突，支持同一 Patch 的多对象组合。

### D30 Evolution merge 必须保持 KG OS-valid Snapshot

- 决定：KG OS whole-Knowledge-Base merge 不以“Lithograph 没有 raw slot conflict”作为唯一成功条件；target/source 在 `merge.start` 前先解析并通过 KG OS consistency check，再用 Lithograph `expectedHead` CAS 保证 Session 实际 pin 的 target 不发生 check-then-use 漂移；候选 merge result 还必须满足 KG OS 的 Binding coverage、internal graph / Schema isolation 等 consistency invariants。KG OS 在 Lithograph Merge Session 的**固定 revision**上完成 candidate validation，再把同一 revision 交给 `merge.finalize`；Lithograph finalize 同时检查 session revision 与 target Branch pinned head，因此 validation 后 resolution 或 target head 任一变化都会拒绝提交。fast-forward source/candidate 无效时同样不得移动目标 Branch。
- 依据：Ontology semantics 与 Lithograph Schema 是同一 State 的两个组成部分，底层按独立 logical slots 合并后仍可能组合成 KG OS 无法解释的状态；公共 Evolution 不能主动生成一个随后 Object read 就报 consistency error 的 State。
- 备选：完全透传 Lithograph merge，只在后续 Object read 时发现 KG OS inconsistency；让 Lithograph 调用 KG OS callback；在 merge 后自动猜测并修复 Binding；先提交 invalid Merge Commit 再自动 revert。
- 取舍：KG OS merge 比 raw Lithograph merge 多一层业务一致性验证和一次 candidate read；换取不把 KG OS 语义写入 Lithograph、没有长 writer transaction，并保证所有通过 KG OS finalize 的 State 满足当前 KG OS 设计不变量。

### D31 Invalid Lithograph Snapshot 只允许 Evolution 诊断，不继续演进

> 后续调整：[D59](#d59-cypher-passthrough) 取消 Graph 对 KG OS-invalid Snapshot 的执行限制；本条仍约束 Object / Ontology 和高层 Evolution，不禁止直接 Cypher 诊断或修改。

- 决定：绕过 KG OS 产生且不满足 Binding / internal Schema 等 invariants 的 Lithograph Commit 保留在底层历史中；KG OS Evolution topology / metadata read 可以标记并诊断它，但 Object / Graph data capability、business History/Diff 和所有会创建新 State、推进 Branch 或创建 / 移动 Tag 到目标 Snapshot 的 KG OS mutation 都拒绝使用 invalid base / target。History 在 invalid / pre-KGOS ancestry boundary 终止，不跨边界猜 continuity。Commit Data set/clear 与 Branch/Tag delete 只修改 sidecar/ref cleanup，可以作用于 invalid State。KG OS v1 不自动修复这种 Snapshot。
- 依据：底层 immutable history 不能被 KG OS 静默改写；但允许正常公共写继续基于 invalid state 会让 inconsistency 扩散到更多 Commit / refs，并使“KG OS public write 产生可读 State”不再成立。
- 备选：所有能力一律完全拒绝看 invalid Commit；允许 Graph 继续查询/写普通 Knowledge；自动重建 Binding 或跳过异常 internal metadata。
- 取舍：Evolution 仍能提供排障所需 topology / metadata，但业务数据访问需要先回到一个 KG OS-valid State 或由外部底层维护显式修复；换取不会通过 KG OS API 传播坏状态。

### D32 Textual Patch 只把 base→patched 差异视为显式 target change

- 决定：Update / Rename / Restructure entry 应用 textual Patch 后，KG OS 将 patched YAML 解析得到的 Object Value 与 base canonical YAML 对应的 Object Value 比较，只把实际变化的 logical slots 作为调用方显式 target delta；Rename entry 的 old/new target 另外提供顶层 identifying locator 的显式 rename delta。未改变字段是 Patch context，不具有“锁定旧值”的 PUT 语义。Mandatory rename-derived rewrite、locator rewrite 和当前操作所需 consistency change 可以更新这些 untouched slots；若派生变化与显式 delta 同时写同一 slot 且目标不同则 conflict。
- 依据：文件 Patch 天然表达局部编辑。若把 patch 后整份文本当成 full replacement，任何 Definition rename 都会与同时修改相关 Knowledge Object 的无关字段产生伪冲突，因为它们的 base 文本仍显示旧 label / type / property ref。
- 备选：Object Patch 等价完整 PUT；要求 AI 在每个受影响 Object entry 中手工同步所有派生字段；按 entry 顺序最后写入者获胜。
- 取舍：compiler 必须执行 canonical parse + logical diff，而不能只 parse final text；换取真正的 Git Extended Diff 局部修改语义、可组合多 Object mutation 和确定的冲突检测。

### D33 KG OS v1 只 bootstrap 空 Lithograph Knowledge Base

> 后续调整：[D59](#d59-cypher-passthrough) 允许启动完成后的 Graph 直接访问底层 Snapshot，不再把 pre-KGOS / invalid 历史一律限定为 Evolution 诊断；空库 bootstrap 与不自动 adoption 的规则不变。

- 决定：KG OS v1 只在 Lithograph empty Root State 上 bootstrap 自己需要的 reserved internal Schema resources 与 semantic graph 初始状态；bootstrap 必须在一个 Lithograph explicit transaction 中以 Root Commit 为 `expectedHead` 完成，并只产生一个新的 KG OS-valid Commit。KG OS 从该 State 开放公共业务能力；不自动 adoption 已经存在调用方 graph / Schema history 的任意 Lithograph database。正常 v1 bootstrap 不产生 durable intermediate invalid Commit，pre-KGOS Root 只按 D31 诊断可见。
- 依据：Definition / Property Binding coverage 与 reserved internal Schema 是 KG OS-valid State 的硬不变量；自动接管已有数据库必须决定如何为既有 Schema 生成 Binding、如何解释已有业务语义和历史连续性，这不是启动时可以确定性猜测的事情。
- 备选：首次打开时自动为所有已有 Schema element 创建 Binding；允许没有 Binding 的 Schema 逐步懒迁移；直接把现有 database 一律视为有效 KG OS State。
- 取舍：已有 Lithograph 数据库不能在 v1 被无配置直接“挂载”为 KG OS，需要未来显式 migration / import 设计；bootstrap 会短暂持有 Lithograph explicit transaction 的 single-writer reservation，但换取所有公开 KG OS State 从第一个 Commit 起满足当前一致性不变量。

### D34 Object 使用单一 logical value、canonical YAML 与 JSON representation

- 决定：每个 Object 在目标 State 中只有一份逻辑 Object Value。v1 对外支持 `application/yaml` 与 `application/json` 两种 serialization；YAML 是唯一 canonical editable representation 和 Object Patch base，JSON 是同一 Object Value 的等价结构化 representation。KG OS 不定义自己的 YAML 方言：标准 YAML 输入只要能无歧义解析并映射到合法 Object Value 即可接受，后续读取再由 KG OS renderer 规范化为 canonical YAML。HTTP adapter 使用标准 `Accept` / `Content-Type` 做 representation negotiation，不增加 `representation.mode/format` 之类业务字段；SDK 中的 structured Object 只是 JSON / Object Value 的语言内解析结果，不是第三种 wire format。
- 依据：YAML 对自然语言长文本和 AI 局部编辑更友好，Git Extended Diff 需要唯一稳定文本基线；JSON 则是程序、SDK 与 Web 的成熟结构化交换格式。把二者都映射到同一 Object Value 可以同时满足 AI-first 编辑与普通 API 消费，而不建立两套对象模型或要求 Patch 携带 serializer selector。
- 备选：只提供 JSON；让 YAML / JSON 都成为 Patch base；自定义 `representation` request object；定义 KG OS-specific YAML subset / dialect。
- 取舍：KG OS 需要 deterministic canonical YAML renderer，并同时维护 JSON serializer；调用方以非 canonical 标准 YAML 表达同一值时可以写入，但下一次 `read` 会被规范化。HTTP 的具体 route、metadata envelope / header、CLI command 与 SDK method 仍属于 transport contract，不由本决定冻结。

### D35 公共 StateRef 直接复用 Lithograph Version Descriptor

- 决定：KG OS v1 的 StateRef 直接使用 `commit/<64-hex>`、`branch/<name>`、`tag/<name>`；所有 resolved State 一律返回 `commit/<64-hex>`。KG OS 不再设计 `state/...`、裸 Commit ID 或第二套 ref alias。
- 依据：Lithograph 已经冻结无歧义 version descriptor、Branch/Tag resolution 与 pinned Snapshot 语义；再包装只会增加转换而没有新的产品语义。
- 备选：新增 `state/<id>`；只返回裸 Commit ID；为 Branch / Tag 分别建立 KG OS JSON reference object。
- 取舍：KG OS wire 直接暴露 Lithograph 的版本 descriptor 形态，但仍只暴露 KG OS 允许的 Evolution 能力，不因此提升全部 Lithograph Version Procedure。

### D36 公共 Ref 使用 canonical typed string

- 决定：公共业务 aggregate 使用 node:/relationship:/domain:，Knowledge 使用 n:/r:；名称 component 采用 RFC 3986 percent-encoding。new:<kind>:<alias> 只在本次 Patch 中引用新建顶层对象。
- 依据：精准定位不需要为每个 Property/Constraint/Index 增加独立 API 或新的永久身份。
- 备选：裸名猜 kind，或全局 UUID / 文件路径 identity。
- 取舍：Property rename 使用 Definition 内显式输入，不扩充顶层 Ref；字段位置仅用于诊断和 Diff。

### D37 公共 capability 先冻结 transport-neutral logical wire

- 决定：Object / Graph / Evolution 先冻结本文 request/result/error logical shape；HTTP route、CLI command、SDK method 与具体 metadata carrier 只做 adapter mapping，不得改变字段语义或创建 adapter-specific capability。
- 依据：当前产品明确需要 CLI + Skill、SDK/Web 消费，但尚无要求把某一种 transport 变成 Kernel 产品语义；先冻结一个逻辑合同可以避免为 HTTP、CLI、SDK 维护三套接口定义。
- 备选：现在直接冻结 REST path / HTTP header；CLI 与 SDK 各自独立设计；等实现时再临时决定所有 wire shape。
- 取舍：后续 adapter 仍需各自 reference/usage 文档，但它们只能映射已确认逻辑合同，不能重新决定 StateRef、ObjectRef、pagination、typed value 或错误语义。

### D38 `__kgos_` 是 v1 reserved internal persistence namespace

> 后续调整：[D59](#d59-cypher-passthrough) 保留内部持久化名称和 Object / Ontology reserved 检查，但 Graph 不按该 prefix 拦截输入、输出或写入。

- 决定：KG OS-owned internal graph / Schema identifiers 统一保留 exact UTF-8 prefix `__kgos_`，并使用本文冻结的 marker / Binding / Domain / Relationship / Property key 编码。调用方公共 mutation 不能创建或修改该 namespace；命中时返回 `RESERVED_IDENTIFIER`。这些名字是持久化格式的一部分，未来改名必须显式 migration。
- 依据：internal Ontology semantic graph 与调用方 Knowledge 共存在同一 Lithograph graph / Schema，需要一个确定、可在 mutation 前拒绝冲突且可由 `graphView` 隔离的持久化 namespace；如果只写“实现时任选内部名”，不同版本会无法稳定解释历史 State。
- 备选：每次启动随机前缀；仅依赖隐藏 element ID；把 internal semantics 放 SQLite side table；把具体名字长期留给实现自行选择。
- 取舍：调用方不能使用 `__kgos_` 开头的 Schema / graph identifier；换取 internal history、Graph View isolation、Schema bootstrap 与 migration 有稳定编码，同时不建立第二套数据库或绕过 Lithograph。

### D39 Object Patch 使用 Lithograph explicit transaction 作为单一 State boundary

- 决定：所有存在有效 target delta 的 Object Patch 都在一个 Lithograph public explicit transaction 中执行。KG OS 在 `tx_begin` 传入 target Branch 与 `expectedHead = baseState`，随后只执行标准 Cypher 25 graph / Schema / Constraint / Index mutation；成功 `tx_commit` 恰好产生一个 Lithograph Commit / KG OS State。任何 query / callback / validation / commit failure 都由 Lithograph fail-closed auto-abort，不留下 intermediate Commit；`BRANCH_HEAD_MOVED` / expected-head mismatch 映射为 `STALE_BASE_STATE`。无有效 target delta 的 Patch 在 strict base check 通过后直接返回 `baseState`，不启动 mutation transaction、不创建 State。
- 依据：KG OS 的一次 Object Patch 是一个上层 logical mutation unit，Definition / Property 的 Structure、Binding semantic graph、必要 Knowledge data rewrite 与 index maintenance 必须在同一个 public State 中共同成立。Lithograph explicit transaction 已把多个标准 Cypher execution 定义为一个 Commit boundary，并在 writer ownership 下提供 `expectedHead` CAS，因此 KG OS 不再需要 raw Structural Patch、caller-owned SQLite transaction 或 hidden intermediate State 来实现这一不变量。
- 备选：继续让每个底层 query 各自形成 Commit；用 caller-owned SQLite transaction 只做 durability atomicity；让 KG OS 构造 Lithograph Structural Patch 作为第二套 mutation API；事后 squash/rewrite intermediate history；建立 KG OS 自己的 transaction/version layer。
- 取舍：Object Patch compiler 必须在进入 explicit transaction 前完成尽可能多的 parse / logical planning / conflict validation，并保持 transaction 短小，因为 Lithograph v1 transaction 持有 single-writer reservation；换取一个成功 Object Patch 与一个 KG OS State 一一对应、strict base 无竞态、History 始终可解释，并继续以 Cypher 25 作为唯一正常底层 mutation language。

### D40 Object mutation 保持单一 Patch surface，新增对象只增加最小 request-local alias 语义

- 决定：KG OS v1 不增加独立 `save` / `create` / `update` / `replace` / `upsert` 核心 mutation capability；Object `patch` 继续统一表达 Add / Update / Delete / Rename / Restructure。所有新增 Object entry 一律使用 `new:<kind>:<alias-component>` 作为 request-local target，同一个 token 可以出现在本 Patch 内其它 Object Ref slot 中；成功后通过 `created` 映射到最终 owner-backed Object Ref，alias 随请求结束失效。`new:...` 明确是 KG OS application semantic，不冒充 Git / YAML 标准，也不是持久 Object identity。
- 依据：`save` 并不能消除“同一请求中新建 Object 尚无最终 Ref、但需要互相引用”的问题，反而必须重新定义 create-vs-update、full replacement、缺失字段、upsert、batch 与并发基线，形成第二套 mutation contract。Git Extended Diff 已经成熟表达新增、修改、删除、rename 与多 target Patch；YAML 1.2 已经表达 Object Value；两者唯一没有定义的是 KG OS 业务 Object 在最终 Ref 产生前如何被同一 Patch 其它 entry 引用，因此保留一个受限 request-local alias 是当前最小必要自定义语义。
- 备选：增加 `save(Object)` 并按 Ref 是否存在决定 create/update；分别建立 create/update/delete API；采用完整 JSON:API Atomic Operations 等另一套 mutation protocol；对 name-backed Object 预测未来 Ref、只为系统分配 identity 的 Object 使用 alias。
- 取舍：公共合同保留一个 KG OS-specific `new:<kind>:<alias>` token，需要 parser / validator / error mapping 明确支持；换取只有一个 Object mutation mental model、所有新增 Object 使用同一定位规则、multi-Object cross-reference 不依赖执行顺序或未来 Ref 猜测，也不引入第二套 CRUD / save / upsert surface。标准覆盖的 Patch/YAML/path escaping 部分仍全部交给 Git、YAML 1.2 与 RFC 3986。

### D41 Evolution Merge 使用 Lithograph Merge Session 渐进解决冲突

- 决定：KG OS v1 的 whole-Knowledge-Base Merge 使用 Lithograph public Merge Session，而不是一次性 `merge(source,resolutions)`。公共 Evolution 暴露 `merge.start/list/get/conflicts/resolve/finalize/abort`：list 用于发现/恢复未完成 Session，conflict 分页读取，resolution 可以跨多次请求逐步提交；resolve/finalize/abort 都使用 expected revision 保护并发 mutation。Session token 只是未完成 merge 的 operational identity，不是 StateRef/ObjectRef。公开 `conflictId` 直接复用 Lithograph opaque conflict identity，KG OS 只负责 conflict slot/value 的业务投影与反向 value mapping，不维护第二套 conflict identity。KG OS 不建立第二套 merge workspace、conflict persistence 或 merge engine。
- 依据：实际 Knowledge Base merge 可能产生远超一次 AI context / API response 能承载的 conflict；要求一次提交全部 resolution 会把可恢复的冲突解决变成全量重算。Lithograph Session 已固定 `ours/theirs`、持久保存 resolution、提供 revision CAS 和 candidate read，因此 KG OS 可以只负责把底层 conflict 投影成 Object/Knowledge 语义并在 finalize 前做业务 consistency validation。
- 备选：一次性 merge + 全量 conflict/resolution；KG OS 自己持久化 conflict session；让 AI 每次重新执行 raw merge 并重传已解决 conflict；通过 Object Patch 直接编辑 merge candidate。
- 取舍：Evolution Merge 从单次 request 变成显式多步 lifecycle，调用方需要保存 `session + revision` 并在结束时 finalize/abort；换取 bounded pagination、断点恢复、AI/人工渐进解决大量冲突、无 intermediate State，以及 KG OS-valid candidate 的原子 finalize 保证。

### D42 KG OS v1 使用 `kgosd` 本地 daemon 与 Rust / TypeScript 分层

- 决定：KG OS v1 采用本地 daemon 形态，`kgosd` 作为统一访问入口并承载 KG OS Kernel。`kgosd`、Kernel、Lithograph host/client、projection/compiler 与 consistency validation 使用 Rust；SDK、CLI、Web 与 Skill / 生态集成使用 TypeScript / npm。上层 client 不直接打开 SQLite 或绕过 `kgosd` 访问 Lithograph。本决定确认 process boundary；具体本地 transport 后续由 D44 冻结。
- 依据：这套分层在 2026-09-08 的已确认技术架构中已经成立；2026-09-10 引入 Lithograph 时，旧 Graph Engine / FTS5 / sqlite-vec 数据库职责被整体替换，但没有后续 decision 否定 daemon 形态或 Rust / TypeScript 分工。恢复这部分可以重新明确 process ownership、数据库访问边界和上层交付生态，同时与 D1/D6/D37 完全兼容。
- 备选：让每个 CLI / SDK / Web client 直接加载 Lithograph 并打开 Knowledge Base；把全部上层产品面改为 Rust；把 KG OS v1 改为必须部署的远程 server。
- 取舍：KG OS 需要维护一个本地服务进程以及 client ↔ daemon transport / lifecycle；换取单一数据库 owner、稳定的 Kernel 边界、各上层 adapter 行为一致，以及 TypeScript/npm 生态可以在不绑定 SQLite/Lithograph ABI 的情况下独立演进。

### D43 kg CLI 提供渐进 Ontology read、batch edit 与 scoped Patch

- 决定：`kg ontology` 输出只读 Markdown 概览/详情并支持多 Ref batch read；`--edit` 同样支持多 Ref，单 Ref输出 canonical YAML，多 Ref输出由相同 canonical bodies 组成的标准 YAML multi-document stream。普通 Ontology 修改使用 `kg ontology patch`，该命令只收窄 target kind，底层继续复用 Object Patch。通用 `kg object patch` 保留给 Knowledge 或 Ontology + Knowledge 原子修改。其余 Object/Graph/Evolution 命令、显式状态、JSON/streaming 和非交互行为保持。
- 依据：让 AI 沿明确来源读取，必要时拿到可被程序精确解析的编辑基线，而非搜索文件或组合低层 CRUD。
- 备选：旧 CLI 只允许 Object list/search/read，或增加每类资源的独立修改命令。
- 取舍：Ontology 是明确的文本输出例外；batch read/edit 需要统一 State 与整体失败规则。Multi-document framing 增加少量 CLI presentation 规则，但不改变任一 Object body，也不建立文件目录或 wrapper schema。`ontology patch` 增加一个职责更清晰的 CLI spelling，但不复制 Patch engine / concurrency / transaction。CLI 参数与完整输出合同由 cli.md 拥有。

### D44 `kgosd` 使用可配置 HTTP bind 与 `~/.kgosd/` 本地运行目录

- 决定：KG OS v1 的 `kg` / SDK / Web 统一通过 `kgosd` 的 IPv4 HTTP 访问 Kernel；`~/.kgosd/config.toml` 同时支持 `server.host` 与 `server.port`，默认分别为 `127.0.0.1` 与 `4765`。`server.host` 是 IPv4 bind address，可以显式配置 LAN address 或 `0.0.0.0`；端口占用时启动失败，不自动切换随机端口。`kgosd` 同时提供 Web 与 API，使 Browser 使用同 origin。daemon home 固定为 `~/.kgosd/`，职责分为 `config.toml`、`kgosd.lock`、`logs/` 与 `data/`。v1 不定义 token、API key、登录或其它 authentication / authorization。
- 依据：默认 loopback 满足本机使用；`host` 配置允许用户明确选择其它 bind address，而不需要新增第二套 daemon/runtime 模式。Web 是正式 Human-facing interface，需要稳定的 configured origin；CLI/SDK/Web 共用 HTTP 可以避免 Unix socket、Named Pipe、gRPC 与 Web transport 多套实现。一个明确 daemon home 让配置、当前运行状态、日志和持久 runtime data 有统一可发现位置。用户明确选择 v1 不引入 token/auth。
- 备选：每次启动随机端口 + runtime descriptor；CLI 使用 Unix Domain Socket、Web 另走 HTTP；gRPC；把配置/运行状态分散到各平台 config/data/run 目录；本地 token authentication。
- 取舍：固定默认端口可能与其它本地程序冲突，因此支持显式端口配置并在冲突时 fail-fast；显式配置非 loopback host 会把同一个**无认证** Web/API 暴露到对应网络，v1 不因此自动增加认证、TLS 或权限隔离。`0.0.0.0` 是 bind wildcard，不作为 CLI connect host；本机 CLI 对该配置使用 `127.0.0.1`。`kgosd.lock` 增加一个极小的 runtime primitive，但避免 PID file / daemon descriptor 与 config endpoint 漂移。`data/` 的 Knowledge Base 布局和一个 daemon 管理一个还是多个 Knowledge Base 仍需后续设计。
- 后续替换：D54 将固定 `~/.kgosd/` 收敛为可通过 `KG_HOME` 选择的单 profile/单 Knowledge Base target，并关闭 `data/` layout gap；D55 用 persistent single-token authentication 取代本条的 no-auth 决定。D44 其余 HTTP bind、固定端口失败与 same-origin Web/API 规则继续有效。

### D45 `kgosd` lifecycle 使用 startup-only config、OS file lock 与显式 CLI 控制

- 决定：`kgosd` 是 foreground server，不 self-daemonize。每个 `~/.kgosd/` profile 通过 `kgosd.lock` 的 OS-level exclusive lock 保证单实例，并在 active lock 文件中只发布当前本机可连接 endpoint，不保存 PID/version/startedAt。`config.toml` 只在 daemon 启动时读取；运行中修改不 hot reload、不改变 effective config、也不触发自动退出。`kg daemon start/status/stop/restart` 是 v1 明确的 lifecycle commands：start 负责 background spawn 并等待 ready，status 使用 lock ownership + HTTP control 判断真实状态，stop 通过当前 active endpoint graceful shutdown，restart 显式 stop 后重新启动并应用最新 config。普通业务命令从 active lock 解析当前 endpoint，daemon 不存在时失败，绝不隐式 auto-start。
- 依据：只依赖 `config.toml` 无法在运行中配置已改变后找到旧 daemon；保存完整 `daemon.json` 又复制 endpoint、PID 和可过期状态。OS file lock 天然随进程死亡释放，可以把“实例是否 active”交给 OS，同时只保存解决当前定位问题所需的 endpoint。startup-only config 避免为 host/port 引入 listener hot-reload、partial config write、bind rollback 与隐式 shutdown 复杂度；显式 restart 让配置生效边界可观察。
- 备选：`run/daemon.json` + PID；运行中 watch/reload `config.toml`；配置变化自动退出；普通业务命令自动拉起 daemon；通过 PID signal 作为主要 stop channel；为不同平台分别使用 Unix socket / Named Pipe lifecycle channel。
- 取舍：v1 没有 PID-based `--force` stop；如果 lock owner 仍存在但 HTTP control channel 已不可用，CLI 只能报告 unavailable，由用户或外部 supervisor 终止异常进程。`kgosd.lock` 文件在 crash 后可以残留，但没有 active OS lock 时它不表示 running，下一次 owner 会覆盖 stale content。OS service auto-start/registration、background detach 的平台细节与 exact control route 仍是工程实现问题，不改变 lifecycle semantics。

### D46 Ontology 交互基线修正（2026-09-15）

- 决定：保留 Lithograph + KG OS semantic graph 的持久化架构，改为全局/Domain/Definition 渐进读取与 Domain/Definition aggregate 编辑。具体合同以 ontology.md、object.md、cli.md 为准。
- 授权依据：用户明确要求 KG OS 把底层不方便 AI 使用的能力统一起来，再要求整体整理、修正历史问题并写入设计。底层的独立 ownership 不能成为要求 AI 逐个操作资源的理由。
- 被替换：D8/D21/D24/D25/D27/D28 原有 Object-fragment discovery、禁止聚合编辑 standalone resource 和全部底层资源顶层暴露规则；D14/D19/D36/D43 及相关解释同步调整。本文件已就地更新当前决定；旧原文保留在 Git 历史，不再作为并行有效规范。
- 未采纳的讨论：虚拟文件/操作系统磁盘、巨大可编辑 Markdown、Ontology search、隐藏真实 Index 名、把 description 一律改成数据库必填、强制 Domain tree/DAG，均不是本次设计结论。
- 最小工程补充：对共享资源做显式 delta 归并；Property rename 使用 input-only renameFrom；匿名具名资源确定性命名。这些只解决当前实际歧义，不建立新插件、DSL 语法、公共资源类型或持久化 Schema 副本。
- 取舍：编译与反向读取的复杂度由 KG OS 承担。此处更新设计，不宣称 CLI/compiler 已实现；本次不改变 Knowledge Cypher、Evolution transaction/history、runtime、licensing 或 Lithograph 产品合同。

### D47 Ontology 读取/编辑支持 batch，写入提供 scoped patch（2026-09-15）

- 决定：Ontology read / `--edit` 一次可以请求 1..100 个 typed Ref；所有目标共享一次解析出的 immutable State，结果保持请求顺序，任一目标失败则整个 batch 失败。多 Ref `--edit` 使用标准 YAML 1.2 multi-document stream，每个 document body 与单 Ref canonical YAML 相同。普通 Ontology write 使用 `kg ontology patch`，其逻辑语义完全复用 Object Patch，只限制为 Domain / Definition aggregate。
- 授权依据：用户明确确认 `kg ontology patch` 使职责更单一，要求读取支持批量，并随后确认批量 `--edit` 采用标准 YAML multi-document stream。
- 约束：Overview 仍用零 Ref且不可 edit；batch 中每个 Domain 可以返回自己的 continuation cursor，cursor continuation 用对应单 Ref + resolved State 单独继续。`--edit` 不接受 pagination；stream framing 的 state/ref comment 不进入 Object Value 或 Patch hunk。跨 Ontology + Knowledge 的原子显式修改继续使用通用 Object Patch。
- 取舍：AI 可以一次加载或编辑一组相关 Definition，减少调用次数且不会混入不同 Branch head；采用 YAML 标准 document stream 而不是自动拆文件或自定义 wrapper，保持单对象 canonical YAML 与 multi-object Git Patch 一一对应。

### D48 Embedding Provider 是 kgosd 全局运行配置，语义向量由 KG OS 托管（2026-09-15）

> 后续调整：向量生成、参数转换、内部 Property 与写入/合并刷新已由 [D57](#d57-managed-semantic) 替换；全局默认配置与简化 Ontology 的方向延续。

- 决定：`~/.kgosd/config.toml` 必须配置一个 daemon-global embedding service/model/dimension；没有合法配置就不开放 Knowledge Base。Ontology 的 `type: vector` 不再要求调用方定义 embedding Property/model/dimension，而是声明一个或多个 String source fields 需要语义检索。KG OS 使用全局 service 生成 managed vector materialization；查询时调用方继续写原始 Lithograph Cypher `SEARCH`，仅把对应 Graph parameter 写成 `{"$semantic":"..."}`，KG OS 在 adapter 层把该 parameter 转成 Vector 后将**原始 Cypher**交给 Lithograph。v1 的具体 service protocol/config 由 D50 冻结。
- 授权依据：用户明确提出向量模型不应成为外部使用者负担，应由全局 TOML 统一配置，Ontology/调用方不重复声明；D53 进一步确认这份配置只属于 daemon runtime，不保存进 Knowledge Base。
- 边界：Embedding service 是确定性基础设施依赖，不是 Agent；credential 和 service/model config 都不作为 Knowledge Base State metadata 持久化。KG OS 不为此解析/改写 Cypher，也不提供 `graph embed` / `graph search`。`SemanticText` 只是一种 Graph params input marker，不是 Cypher 类型或持久数据；Vector 的公共暴露边界由 D49 统一冻结。SemanticText、semantic Index backfill 与 managed-vector refresh 都直接使用当前 daemon 的 `[embedding]`。修改配置后 restart 不比较历史向量来源、不产生 fingerprint mismatch，也不触发自动迁移；operator 负责保持同一 Knowledge Base 的 embedding semantic config 稳定。Full-text 不依赖 embedding service。
- 取舍：KG OS 必须承担参数预处理、向量生成、source→embedding 一致性、reserved managed data 隔离和 merge/mutation refresh；换取调用方只表达“哪些内容需要语义检索”，不重复管理 model、dimension、内部 vector Property 或 query-vector 生成，同时保持 Lithograph 是唯一 Cypher parser/planner/executor。Vector 的额外 public-profile 收窄与 staged-state 成本见 D49。

### D49 KG OS v1 不公开 caller-owned Vector 数据类型（2026-09-16）

> 后续调整：本条 reserved embedding Property、SemanticText 与 mandatory refresh 由 [D57](#d57-managed-semantic) 替换。[D59](#d59-cypher-passthrough) 进一步取消 Graph 的 Vector / identifier 输入、输出和 commit 前检查；Vector 简化模型限制只保留在 Ontology / Object 及相关高层一致性合同中。

- 决定：KG OS v1 的 caller-owned Ontology / Knowledge / Graph public value profile 排除 Vector。`VECTOR<...>` 不能作为 Property `type` 或 type constraint `valueType`，Object/Knowledge 不能保存 caller-owned Vector value，Graph 不接受 raw Vector parameter，也不返回 Vector result；`type: vector` 只作为 Index type 表示 KG OS 托管 semantic index。Vector 仍由 Lithograph 完整支持，并仅在 KG OS reserved managed materialization 与 SemanticText 解析后的内部 query parameter 中使用。
- 授权依据：用户明确指出 Ontology 中不需要 `VECTOR<FLOAT32>(...)` 这类业务字段，并要求重新整理、优化和深度 review；此前已经确认向量模型与 query vector 不应成为外部使用者负担。
- 一致性边界：Lithograph Graph Type 是 open semantics，仅从 Ontology 禁止 Vector 不能阻止 `graph execute` 向未声明 Property 写 Vector。KG OS 因此不解析 Cypher，而要求 Graph mutation 在 durable commit 前基于确定 candidate / staged changes 完成 caller-owned Vector 与 `__kgos_` reserved-identifier validation，并在 semantic source 变化时把 managed refresh 纳入同一个最终 State；失败整体不产生 Commit。普通 staged validation 可以使用 Lithograph explicit transaction，但 Lithograph 当前合同禁止在持有 single-writer 时等待长时间网络 I/O，因此动态 semantic-source mutation 还依赖能在 writer 外完成 embedding、再以同一 expected base 原子提交的通用 candidate/preparation 能力；在该 readiness 关闭前不能用长网络 transaction 或第二隐藏 Commit降级实现。绕过 KG OS 直接产生 caller-owned Vector 的 Lithograph Snapshot 属于 KG OS-invalid State，按 D31 只允许 Evolution 诊断；Merge candidate 同样必须通过该不变量。
- 备选：继续把 Vector 当普通业务 Property；只在 Ontology 隐藏但允许 Graph 写入；为了拦截 Vector 另做一套 KG OS Cypher parser/rewrite；提交后再用隐藏 Commit 清理/补向量。前两项会形成公共模型旁路，后两项分别重复 Lithograph 查询层或破坏单-State 一致性，因此不采用。
- 取舍：KG OS 的 public value profile 成为 Lithograph value system 的有意子集，并要求 Graph write 具备 staged change inspection；换取外部使用者完全不管理 Vector 数据模型，同时保持 Lithograph 作为通用数据库的 Vector 能力不被 KG OS 产品边界反向限制。未来只有出现明确 caller-owned Vector 业务需求时，才单独扩展 KG OS public profile。

### D50 KG OS v1 只支持 OpenAI-compatible Embeddings API（2026-09-16）

> 后续调整：OpenAI-compatible 协议选择延续；HTTP 执行 owner、wire 映射与认证配置由 [D57](#d57-managed-semantic) 调整，当前只保留 api_key_env，不再支持内联 api_key。

- 决定：v1 不提供 `provider` 配置、provider registry 或插件系统，唯一远端 embedding protocol 是 OpenAI-compatible Embeddings 子集。`[embedding]` 必填 `base_url / model / dimensions`，`similarity` 缺省 `cosine`；认证可用 `api_key` 或 `api_key_env`，二者互斥，也允许都不配置表示无认证。`api_key_env` 在启动时解析为非空环境变量；任一方式得到 credential 后使用 `Authorization: Bearer <credential>`。
- Wire 子集：KG OS 向 `${base_url}/embeddings` 发送 JSON `model + input`；`input` 支持 String / Array<String> 以便内部批量生成。v1 不发送 `dimensions/user/encoding_format` 或 provider-specific options。响应使用 `data[].index + data[].embedding`，每个 embedding 必须是 finite numeric array 且长度严格等于配置 `dimensions`；其它 OpenAI response 字段不是 correctness source。
- 授权依据：用户明确要求 v1 先只支持 `openai-compatible`，随后确认写入设计，并要求同时支持 `api_key_env` 与直接 `api_key` 配置。
- Secret / State：inline `api_key` 是支持的本地 secret 配置，`api_key_env` 是推荐的减少 secret 落盘方式；secret 不回显、不进入 State/Commit Data。KG OS 也不把 `base_url/model/dimensions/similarity` 复制或摘要成 State fingerprint/generation；它们只作为当前 daemon 的 runtime config 使用。
- 取舍：用户必须显式知道 model 的实际 output dimension，因为 KG OS 在无远端 health/probe 的启动设计下不能可靠自动发现；换取 config 可离线验证、底层 Index dimension 在首次远端调用前就确定，并避免为了未来假设中的其它 Provider 提前增加 provider 抽象。

### D51 SQLite Extension 统一由 startup source resolver 装配（2026-09-17）

- 决定：`~/.kgosd/config.toml` 使用 ordered `[[sqlite.extensions]]` 作为 **唯一 SQLite loadable-extension 配置入口**。Lithograph 自身、第三方 FTS5 tokenizer 与其它 SQLite extension 都使用同一机制；KG OS 不再把 Lithograph shared library 内嵌进 binary、写死安装路径，也不为“全文插件 / 向量插件 / Lithograph 插件”建立多套 loader。每个 entry 只表达 artifact source 与 SQLite load 参数，不声明业务 `kind/capability`；全部加载完成后由 `kgosd` 单独验证 KG OS 必需的 Lithograph public capability。
- Source contract：`source` 是 absolute local file path 或 absolute HTTPS URL。Remote source 必须配置 artifact SHA-256；local source 可选配置 expected SHA-256，但 resolver 总会计算实际 content hash。Direct `.so/.dylib/.dll` 直接形成 load artifact；`.tar.gz/.zip` 必须用精确 relative `library` 指出 archive 内要加载的 shared library。`entrypoint` optional，省略时使用 SQLite 标准 resolution。数组顺序就是每个 connection 的加载顺序，所有 entry 都是 required；v1 不增加自动发现、plugin registry、可选插件、任意 download headers 或 package dependency solver。
- Resolution / cache：所有 source 在 daemon startup 先解析为 `~/.kgosd/extensions/<sha256>/` 下的 immutable local artifact；remote 可以跟随有界 HTTPS redirect，但不能降级 HTTP。Archive extraction fail-closed 拒绝 absolute/traversal/symlink/hardlink/special entry，并受下载/解压资源上限约束。有效 content-addressed cache 可以离线复用，cache 删除只触发下次重新 resolve，不改变 Knowledge Base State。`latest` URL 可以使用，但 SHA-256 pin 阻止静默升级；正式可复现部署优先 version URL + hash。
- Connection / capability / security：每个新 SQLite connection 都加载启动时解析好的**同一批 artifacts**，不能因为 source/cache 后续变化让 connection pool 混用 native binary。Extension loading 只在 host C API 初始化窗口开启，加载完成立即关闭；Graph/Cypher 不获得 SQL `load_extension()` 权限。`kgosd` 需要 Lithograph Native ABI，但不通过配置 `kind` 指定它：daemon 从同一批 resolved libraries 自动发现并绑定**恰好一个**完整 Lithograph ABI 1 symbol family；实际 Native 调用仍要求该 library 已在目标 `sqlite3*` connection 上走 SQLite extension-load path 完成注册。Configured extension 是与 `kgosd` 同 OS authority 运行的 native code，配置文件属于 operator trust boundary；业务 API、Ontology 或 Agent 输入不能动态增加 extension。
- 授权依据：用户明确提出插件不应只服务 Full-text，应在统一配置区声明 KG OS 要加载的 SQLite plugins，并要求 Lithograph 自身也通过同一方式加载；随后确认 local path 与 HTTPS Release artifact 都作为 source 支持。
- 备选：把 Lithograph 静态/内嵌进 KG OS；只允许本地路径；按 Full-text/Vector 等功能建立专用插件区；由 analyzer/plugin 名自动下载最新 binary。前两项削弱 Lithograph 独立 SQLite-extension 边界或远程部署便利性，后两项会复制 loader、引入 registry/package-manager/自动执行不受 pin 的 native code，因此不采用。
- 取舍：运行配置变成平台相关，并且首次 remote resolve 需要网络；native extension 仍由 operator 信任，KG OS 不 sandbox。换取所有 SQLite 能力通过一个最小、可复现、可缓存、每-connection 一致的装配机制接入，同时保留 Lithograph 作为独立数据库产品。

### D52 Full-text analyzer 是 kgosd 全局运行配置，Ontology 不暴露分词实现（2026-09-17）

- 决定：KG OS v1 的 Ontology Full-text Index 只声明真实 `name/targets/properties` 与 `type: fulltext`；不提供 per-index `analyzer/options/eventually_consistent/tokenizer plugin` 字段。Daemon startup config 的 `[fulltext].analyzer` 决定 KG OS **新建或因业务定义变化重建** Full-text IndexDefinition 时写入的 `fulltext.analyzer`，省略整段默认 `unicode61`；`fulltext.eventually_consistent` 固定为 false。Analyzer 是完整 FTS5 tokenizer specification string，但第三方 tokenizer implementation 由 D51 的 `sqlite.extensions` 在每个 SQLite connection 上提供，KG OS 不根据 analyzer 名称查找/安装插件，也不因配置变化覆盖已有 IndexDefinition。
- State contract：analyzer 不进入公共 Ontology，也不另存 fulltext-space fingerprint/generation。Lithograph Full-text IndexDefinition 自己正常保存创建时的 analyzer，这是数据库执行所需的 versioned Schema 内容，不是 KG OS runtime config 的第二份副本。已有 Index 不因 restart/config change 自动改写；KG OS 新建或因业务 targets/properties 变化重建 Index 时使用当前 `[fulltext].analyzer`。因此同一 Knowledge Base 的不同历史 State，甚至同一 State 的不同 Full-text Index，都可能来自不同 runtime analyzer；这种差异本身不是 KG OS consistency violation。
- Runtime / history：每个 connection 在 extensions 加载后、进入可用池前 probe 当前 `[fulltext].analyzer`，用于保证当前 daemon 能创建/重建新的 managed Full-text Index。历史 query 使用目标 State 的实际 versioned IndexDefinition analyzer；如果当前 connection 没有注册那个旧 tokenizer，只让该次 Full-text 操作返回 `FULLTEXT_ANALYZER_UNAVAILABLE`，daemon 与普通历史 read 继续可用。Remote extension hash 可以固定插件 binary，但 KG OS 无法仅靠 analyzer name 检测第三方插件外部词典/资源被原地替换；这是 operator/runtime reproducibility responsibility。
- Query boundary：KG OS 官方 Full-text 查询不提供 analyzer selector，省略 Lithograph query-time override，从目标 IndexDefinition 取得默认 analyzer。因为 Graph 保留原始 Cypher passthrough，KG OS 不新增 parser/rewrite 去拦截调用方显式写下的 Lithograph `{analyzer: ...}` 低层 query override；这种显式 escape hatch 只影响本次 Lithograph query、不修改 State，也不属于 KG OS managed Full-text 简化接口，AI-facing CLI/Skill/文档不得把它作为常规用法生成。
- 授权依据：用户明确要求 Full-text 像向量一样把底层策略放到全局配置，上层/AI 只表达需要全文检索，不理解 Ontology 中的 tokenizer 配置；随后进一步要求插件加载独立为通用 SQLite Extension runtime 配置。
- 备选：每个 Ontology Full-text Index 暴露 analyzer/options；把 analyzer 与 extension path 绑在同一 Full-text 插件配置；由 KG OS 内置 Jieba/其它分词实现。它们都会把 SQLite/FTS5 运行细节重新推给 AI、复制通用 extension loader，或让 Kernel 变成具体分词实现 owner，因此不采用。
- 取舍：KG OS 不承担 analyzer 配置版本管理或迁移，所以 operator 修改 runtime config 后不会统一已有历史定义；换取 Ontology 与查询心智模型显著简化，也避免为了低频配置升级引入全库重写机制。真实 analyzer 仍由 Lithograph versioned IndexDefinition 保留。

### D53 Full-text / Embedding 只使用当前 runtime config，v1 不做配置迁移（2026-09-17）

> 后续调整：Full-text 与不做自动配置迁移的决定延续；Embedding 现在由实际 versioned IndexDefinition 保存 provider/config，历史 query 不使用当前 runtime 默认值，见 [D57](#d57-managed-semantic)。

- 决定：`[fulltext]` 与 `[embedding]` 只属于 `kgosd` startup runtime config。KG OS 不把它们复制、摘要或冻结到 Knowledge Base，不保存 search-space fingerprint/generation，也不在打开已有库时比较“这个 State/Index/Vector 是由哪套 config 生成的”。配置修改后 restart 正常启动并直接使用新值，不返回 config-space mismatch。
- Full-text：已有 Lithograph Full-text IndexDefinition 保留它创建时 versioned analyzer；当前 `[fulltext].analyzer` 只影响以后由 KG OS 新建或因业务定义变化而重建的 Full-text Index。KG OS 不因为 runtime analyzer 改变批量重建历史 Index。
- Embedding：SemanticText query vector、semantic Index backfill 与 managed-vector refresh 都使用当前 `[embedding]`。已有 Lithograph Vector IndexDefinition 保留创建时的 actual dimension/similarity，只有新建或因业务定义变化重建的 semantic Index 取当前配置；已有 managed vectors 也不因为 endpoint/model/dimensions/similarity 改变而自动重算。v1 不检测新旧向量是否属于兼容空间。真正发生 query/index dimension、Schema 或 provider 错误时按现有错误合同失败，但 daemon 本身不因历史配置未知而拒绝启动。
- Ownership：配置语义稳定性属于 operator responsibility。正常使用预期是在项目初始化阶段选好 analyzer / embedding service 并长期保持稳定；如果 operator 主动修改，KG OS 不承诺已有搜索结果与新配置语义兼容，也不提供自动 migration/rebuild/cutover。
- 授权依据：用户先明确希望采用简单实现、不为后续 Full-text / Vector 配置升级建立迁移系统，随后进一步确认已有 Knowledge Base 与新配置不一致也“照常启动”，最后明确配置无需初始化或保存到 Knowledge Base，运行时直接使用配置文件。
- 被替换方案：此前讨论过“把配置身份写入 State 并阻止 mismatch”、以及“创建新库后重放完整 Commit DAG 的可恢复全历史迁移”。两者都为当前不存在的配置升级需求引入显著状态机、历史重写和运维复杂度，因此不采用。
- 取舍：v1 无法防止 operator 把已有 managed vectors 与新的 query embedding 配到不同语义空间，也不会统一历史 Full-text analyzer；这是刻意接受的简化。换取 runtime、State、Evolution 与 daemon lifecycle 都不需要配置版本管理。

### D54 `KG_HOME` 是单 runtime profile 与单 Knowledge Base target（2026-09-17）

> 后续调整：单 profile、单 daemon、单 kgos.db 的决定延续；目录中的独立 cache.db 已随 [D57](#d57-managed-semantic) 的缓存责任转移取消。

- 决定：KG OS v1 使用环境变量 `KG_HOME` 选择完整 runtime profile；未设置时默认当前 OS 用户 home 下的 `~/.kgosd`。一个 effective `KG_HOME` 同时最多一个 active `kgosd`，并固定只承载 `$KG_HOME/kgos.db` 这一个 Knowledge Base；**不增加 `data/` 中间目录**。profile 根目录同时拥有 `config.toml`、`auth.json`、`kgosd.lock`、`kgos.db`、`cache.db`，以及 `extensions/`、`logs/`；其中 `cache.db` 的 derived cache 语义由 D56 负责。`KG_HOME` 不写入 `config.toml`，因为它负责定位整个 profile。v1 不建立 Knowledge Base name/registry/selector，不提供 `base list/use`、`--base` 或单-daemon多库切换。
- 授权依据：用户明确决定“`kgosd` 就打开一个库”，并要求默认 home 为 `~/.kgosd`、同时允许通过 `KG_HOME` 指定其它 profile。
- 生命周期：`$KG_HOME/kgos.db` 不存在时，daemon 按既有 Lithograph init + KG OS bootstrap 创建第一个 KG OS-valid State；存在时直接按当前 public capability/consistency contract 打开。切换 Knowledge Base 等价于启动另一个 `KG_HOME` profile，不在运行中 daemon 内切换 target。
- 被替换：D44 中“daemon home 固定 `~/.kgosd`”与“`data/` layout / 单库还是多库待设计”的部分。其它文档或旧决定中出现 `~/.kgosd/...` 时，若没有特指历史方案，现行语义均为 `$KG_HOME/...`，默认 profile 才实际落在 `~/.kgosd`。
- 取舍：同一进程不能同时服务多个 Knowledge Base，跨库聚合/切换需要多个独立 profile/process；换取 target identity、文件布局、lock、config、credential 与数据 ownership 全部天然一致，不引入额外 registry、selector、命名冲突和跨库 lifecycle。

### D55 `auth.json` + `KG_TOKEN` 提供持久单 Token 实例认证（2026-09-17）

- 决定：每个 `KG_HOME` 有且只有一个 server credential，保存在 `$KG_HOME/auth.json` 的 `token` 字段。首次 daemon startup 缺文件时用 CSPRNG 生成至少 256 bit entropy 的 opaque token并原子写入；后续 restart 复用，不自动 rotate。已有 `auth.json` malformed/unreadable/empty 时 fail closed。v1 不提供 user/password、role/scope、refresh token、OAuth、多 token registry 或 rotation API。
- Client contract：所有 `kgosd` data/control HTTP request 使用 `Authorization: Bearer <token>`。CLI 只从 `KG_TOKEN` 环境变量取得 credential，不读 `auth.json`、不提供 `--token`；SDK 由调用方显式提供 token；Web 也必须取得相同 token 后访问 API，不存在 credential-free data/control 旁路。`kgosd` 自身 startup，以及当前 profile **没有 active daemon 时**首次/后续 `kg daemon start` 的本地 process spawn，不是 HTTP request，因此可以先创建 server credential；该 local start 以 child 成功取得 lock 并在完成 startup validation + HTTP bind 后发布 endpoint 作为 ready signal，不调用 credential-free health API。一旦 active daemon 存在，`daemon start/status/stop/restart` 的 control HTTP 与其它客户端调用一样必须认证。后续客户端由 operator 把该 secret 放入 `KG_TOKEN` 或其它 SDK/Web 输入。
- Failure / secret boundary：missing/malformed/wrong Bearer 都映射为统一 `AUTHENTICATION_FAILED`，HTTP 为 401，不通过错误差异泄露 token validity。`auth.json` 是 runtime secret，不进入 Knowledge Base/State/Commit Data/lock/log/error；POSIX 创建权限固定 `0600`，其它平台使用等价 current-user-private ACL。CLI 缺/空 `KG_TOKEN` 在 dispatch 前用同一 code 本地失败；token 值不得出现在参数、URL、stdout/stderr 或日志。
- Network boundary：认证不等于加密。默认 `127.0.0.1` 继续是 v1 推荐部署；显式 non-loopback bind 仍允许，但因为 v1 不内置 TLS，在不可信网络上传输 Bearer token 不安全，由 operator 承担。TLS、多用户授权与远程 identity 属于未来独立设计。
- 授权依据：用户先提出 `auth.json` 在启动时生成 token、后续操作都必须持有该 token，随后明确 CLI 同样使用 token 并通过环境变量传递，最终确认采用 `KG_TOKEN` + Bearer 方案。
- 被替换：D44 的 “v1 不定义 token/authentication/authorization” 与 `runtime.md` 原 “本地模式不做认证”。保持 D44 的 HTTP/same-origin 结构，不新增第二 transport 或账号系统。
- 取舍：本机调用增加一个 credential 配置步骤，首次初始化后 operator 需要把 `auth.json` 中的 secret 提供给客户端；换取 CLI/SDK/Web 与本机/LAN caller 共享一个一致的认证边界，并避免因为 CLI 与 daemon 同机而获得隐藏旁路。

### D56 `cache.db` 是默认开启、4 GiB 上限的 Embedding result cache（2026-09-17）

> 后续调整：本条独立 cache.db、LRU、文件收缩与 KG OS cache key 已由 [D57](#d57-managed-semantic) 替换；默认开启与 4 GiB 配置偏好保留，映射为 Lithograph payload 预算。

- 决定：KG OS v1 在 `$KG_HOME/cache.db` 使用独立标准 SQLite 保存 **embedding result cache**。`[cache]` 只提供 `enabled` 与 `max_size_mb`：省略整段等价 `enabled = true`、`max_size_mb = 4096`，即默认开启、默认 4 GiB。cache path 不可配置；`[cache]` 不控制 D51 的 `extensions/` artifact cache。
- Identity：每个最终 provider input 独立缓存。key 由固定 cache/protocol format version、canonical embedding `base_url`、`model`、`dimensions`、KG OS input-framing version 与 exact provider input bytes 共同决定并 SHA-256；credential 不参与，`similarity` 因不改变 embedding 输出也不参与。缓存不持久化原始业务文本，Provider success 只有经过 finite/exact-dimension validation 才能写入；negative result 不缓存。
- Eviction：cache 启用时在 daemon startup 与新写入后检查容量；超过 `max_size_mb` 时按 least-recently-used 顺序清理最久未使用 entry，直到实际 SQLite 文件经 page reclamation 回到上限内，因此降低 max 后 restart 也会收缩旧 cache。hit 与新写入都会更新最近使用顺序。单个 entry 自身超过上限时正常返回 embedding 但不缓存。v1 不增加 TTL、第二种 eviction strategy、compression 或 path 配置。
- Correctness boundary：`cache.db` 是纯 derived runtime data，不属于 Knowledge Base、State、Commit Data、Search Index truth 或配置 migration。文件不存在就创建；entry 损坏、cache schema/version 不兼容或整个 cache 损坏都允许丢弃后重新生成；cache read/write/eviction failure 必须退化为 miss/bypass，而不是让本来可以通过 Provider 完成的业务操作失败。删除 `cache.db` 不得改变任何权威 State、Commit 或公共合同；需要的 embedding 只是在当前 runtime config 下重新请求 Provider。若同一外部 Provider 在相同 config/input 下自身改变输出，仍属于 D53 已接受的 provider/runtime stability 边界，不由 cache 承诺修正。
- Runtime：`enabled=false` 时完全绕过 cache，但不主动删除已有文件；修改 enable/max 后 restart 生效。embedding config 变化自然产生不同 cache namespace，不扫描/迁移旧 cache，也不触发 Knowledge Base migration。Object/Ontology Patch 即使后来因 stale base 未提交，已经成功产生的 input→embedding cache entry 仍可保留供 retry 使用。
- 授权依据：用户明确要求向量处理增加专用 `cache.db`，随后要求在 runtime config 中提供 cache 配置，最终确认默认开启、默认最大 4 GiB、超过后清理旧数据，并确认 `kgos.db` 与 `cache.db` 都直接位于 `KG_HOME` 根目录、不保留 `data/` 层级。
- 取舍：每次 cache hit 需要维护 LRU metadata，达到上限时需要 SQLite page reclamation；换取 SemanticText、Backfill、refresh、retry 与 Merge 等重复 embedding 输入可以避免重复远端 I/O、成本与延迟，同时不污染 Knowledge Base 历史。


<a id="d57-managed-semantic"></a>

### D57 托管语义检索交给 Lithograph（2026-09-19）

> 后续调整：[D59](#d59-cypher-passthrough) 取消 Graph 的语句 / Vector / identifier 限制与相应 guard 待办；[D60](#d60-automatic-embedding-cache) 以正常查询自动持久填充替换本条 query miss 仅进内存、rebuild 填充与预热入口待定的旧规则；[D61](#d61-single-field-semantic) 确认首版只支持单字段。联合检索可组合及托管接口的具体限制以 [Ontology 当前范围](ontology.md#语义索引的首版范围)为准，下列历史“待定”文字不再作为首版设计确认清单。其余职责与配置决定继续有效。

- 决定：KG OS 保留 `type: vector` 的简化本体声明，编译为 Lithograph Managed Semantic Index。向量生成、缓存和检索由 Lithograph / OpenAI-compatible Provider extension 承担；KG OS 不实现 Embeddings HTTP client、reserved 向量 Property、source framing 或写入/合并后的向量刷新。
- 配置与调用：`[embedding]` 作为新建 / 必须重建索引的默认值，完整 provider/config/dimensions/similarity 保存到 Lithograph versioned IndexDefinition；已有索引与历史查询使用自身配置。调用方使用 `db.index.semantic.queryNodes/queryRelationships`，参数是普通 String，移除 `SemanticText` / `$semantic` 转换，不增加 Search DSL。
- 凭证：用户最终选择只保留可选 `api_key_env`，省略表示无认证；不再接受内联 `api_key`。数据库只保存环境变量名称，secret 留在 kgosd 进程环境，不新增 secret registry 或转接机制。
- 写入与缓存：保存 source、创建索引、merge 不以远端 embedding 成功为提交条件；新增 / 改变索引仍做本地 Provider/config validation。取消独立 `cache.db`，保留 `[cache]` 默认开启与 4096 MiB，映射到 Lithograph 内部 cache 的 payload 预算。缓存算法与持久化边界跟随底层公开合同：FIFO、query miss 仅进 connection-local cache，source 持久填充使用独立 rebuild，不保证数据库文件即时缩小。
- 依据：用户确认职责转移，要求以配置、Ontology YAML、调用代码表达优化方案，并授权写入 / 整理设计；随后明确选择 `api_key_env` 简化凭证。底层依据是 Lithograph Phase 13 的 Managed Semantic / Provider / cache 公开合同，当前 KG OS 仍只有文档。
- 被替换：D48 的 KG OS 自行生成向量与 `SEARCH + SemanticText`；D49 的内部向量 Property / refresh 路径；D50 的 KG OS HTTP adapter 与内联凭证；D53 的 Embedding 查询始终使用当前 runtime 配置；D54/D56 的独立缓存文件和其具体实现。D49 的 caller-owned Vector 限制、D51 loader、D52 Full-text 与 D54/D55 单库认证边界继续有效。
- 取舍与未决：冷查询可能发生 Provider I/O；历史结果还依赖外部模型语义稳定。多字段语义索引、`filterProperties` 不能直接映射 Phase 13，留在 Ontology owner 待定；KG OS 预热入口留在 Runtime owner 待定。Native query guard、staged public-profile validation 与真实 ABI 集成需要工程验证，不因本决定宣称已经实现。
- 当前合同：[Runtime](runtime.md#embedding-配置与索引映射)、[Ontology](ontology.md#托管语义索引)、[Graph](graph.md#graph-公共调用合同)、[Object](object.md#object-公共调用合同)、[Evolution](evolution.md)、[集成验收](implementation.md#managed-semantic-integration-readiness)。

<a id="d58-optional-indexes"></a>

### D58 顶层 indexes 可选，保留复合与共享索引（2026-09-19）

> 后续调整：[D62](#d62-nonempty-definition-properties) 要求 Node / Relationship Definition 的 `properties` 非空；本条末尾对 properties 空集合的旧说明不再适用。`indexes` 可选与空集合规范化的决定继续有效。

- 决定：只作用于当前 Definition 单个字段的索引放在 Property 内；多字段索引与跨 Definition 共享索引保留在 Definition 顶层。顶层 `indexes` 缺省与 `[]` 逻辑等价，canonical YAML / JSON 为空时省略，非空时完整输出。
- 依据：用户提出把索引统一放到字段层；核对已有多字段 Full-text、复合 Range 与共享索引后，用户确认“单字段放字段下、多字段/共享留顶层、空数组省略”的方案并要求写入设计。
- 取舍：减少普通单字段模型的空字段噪声，同时不删除已有多字段能力，也不把一个组合索引拆成多个不等价的索引。只规范化空集合不产生 Schema delta；删除非空声明仍按原共享资源 / Patch 语义执行。
- 当前合同：[Ontology 公共格式与索引组织](ontology.md#公共可编辑格式)、[Object representation](object.md#object-value-与-representation)。`properties/constraints` 的空集合输出规则不变。

<a id="d59-cypher-passthrough"></a>

### D59 Cypher 原样执行，KG OS 只区分读写连接（2026-09-19）

- 决定：Graph `query` 使用只读连接，`execute` 使用读写连接；Cypher 原样交给 Lithograph。KG OS 不解析、重写、按关键字判定语句，不实现 procedure 黑白名单。只读入口中的写操作由底层拒绝，不自动升级到写连接。
- 依据：用户明确决定“任何 Cypher 都不限制”，语句内部交给 Lithograph，随后授权修正设计文件并记录 vlog。
- 直接影响：取消 Graph 的 `LOAD CSV` / Schema / Version Procedure 限制、固定 Knowledge Graph View，以及 Graph Vector / `__kgos_` identifier 的输入、结果和提交前检查。参数与结果采用完整 Lithograph JSON；底层的语法、事务、约束和只读规则继续生效。请求上下文不能通过无条件附加不兼容 Native options 变相限制 procedure。
- 高层边界：Object / Ontology / Evolution 的聚合模型、Patch 和一致性校验继续有效，但不再约束原始 Graph Cypher。直接变更可能得到无法按高层模型解释的 Snapshot；高层接口据实报错，Graph 可继续执行，不自动修复 Binding。文件 / 网络能力继承宿主权限；此决定不开放 raw SQL 或动态配置 native extension。
- 备选：在 KG OS 按 statement / procedure / value 增加拦截，或要求底层增加专门的 KG OS 允许列表；均不采用。KG OS 只保留读写连接职责，不复制数据库解析与执行规则。
- 取舍：普通 Cypher、procedure 与 transaction subquery 按底层各自提交语义执行，不再承诺所有 Graph 写入都经过 KG OS profile 校验或恰好产生一个 Commit。只读连接与内部缓存的衔接、Native 上下文映射尚需集成验证，不能以文本改动宣称完成。
- 当前合同：[Graph](graph.md#graph)、[执行连接](runtime.md#cypher-执行连接)、[高层内部边界](ontology.md#semantic-graph-的内部边界)、[错误](contracts.md#公共错误合同)、[集成验收](implementation.md#managed-semantic-integration-readiness)。

<a id="d60-automatic-embedding-cache"></a>

### D60 正常查询自动填充 embedding 缓存（2026-09-19）

- 决定：source 与 query text 都先查缓存；miss 调 Embedding API，成功并通过结果校验后自动持久保存。调用方不需要预热；rebuild 是底层维护能力，不是普通查询前置步骤。
- 依据：用户明确缓存是为减少 API 调用成本而增加的内部逻辑，确认应由 Lithograph 优化，并要求生成独立任务提示词。本次文档同步同时清除与该决定冲突的旧“仅 rebuild 持久填充 / KG OS 预热入口待定”文字。
- 责任：沿用 Lithograph 的内部表、缓存身份、容量与 FIFO。KG OS 保留 `[cache]` 和 4 GiB 默认预算，不新增缓存数据库、后台预热任务或缓存实现。缓存不进入 State / Commit / Branch；Provider 等待不占 writer，持久发布由底层短事务完成。
- 备选：要求业务调用方显式预热或用 rebuild 获得跨连接复用；不采用，因为缓存应透明降低调用成本。启用与否、淘汰、Provider 失败和真实只读数据库下的行为继续区分，不把缓存当作业务数据真源。
- 当前缺口：已核对的 Lithograph 工作树会在物理只读连接上跳过 persistent publish。D59 的只读查询和本条自动持久缓存必须在底层接入中同时满足；具体机制尚未验证，本次不擅自改为可写查询连接、不宣称实现完成。
- 当前合同：[Runtime 缓存](runtime.md#embedding-result-cache)、[连接与缓存衔接](runtime.md#cypher-执行连接)、[工程验收](implementation.md#managed-semantic-integration-readiness)。

<a id="d61-single-field-semantic"></a>

### D61 首版语义索引只支持单字段（2026-09-19）

- 决定：首版 Semantic Index 只接受一个 `STRING` source Property；多字段文本拼接不在首版实现范围。多个 Definition 共享同名单字段的能力保留。
- 依据：用户已明确回复“先支持单字段吧”；本次按用户要求把已有决定补齐到设计文档，移除尚需确认是否保留拼接的旧表述。
- 备选：首版提供 `title + content` 等有序拼接，或由 KG OS 生成隐藏拼接字段；本次不采用。
- 取舍：首版不能把多个字段合成一次语义检索输入，换取与 Lithograph 单 source 接口直接对应；不影响多字段 Full-text、复合 Range、共享索引或已有 Cypher 联合检索，也不承诺后续拼接方案。
- 当前合同：[首版范围与联合检索](ontology.md#语义索引的首版范围)、[工程验收](implementation.md#ontology-专项验收)。

<a id="d62-nonempty-definition-properties"></a>

### D62 Ontology 不创建无字段类型（2026-09-19）

- 决定：Node / Relationship Definition 都至少声明一个 Property；创建或修改后仍存在的 Definition 不允许 `properties: []`，不自动添加占位字段。
- 依据：用户针对空模型创建问题明确决定“那我们就不可以创建无字段的类型”。这项决定替换此前先建立空 Person、以后再加字段的示例。
- 备选：保留无字段模型并要求 Lithograph 补充相应能力；不采用，不据此增加底层扩展任务。
- 取舍：调用方创建类型时就需要明确至少一个业务字段；字段仍可为 optional，不因此增加必填、唯一、业务 ID 或实例属性非空要求。至少一个字段属于 KG OS 高层 Definition profile，公共 Graph 继续按 D59 原样执行 Cypher。
- 当前合同：[Ontology 公共格式](ontology.md#公共可编辑格式)、[编辑示例](ontology.md#编辑示例)、[工程验收](implementation.md#ontology-专项验收)。
