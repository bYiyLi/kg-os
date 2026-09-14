# 架构决策记录

本文件记录 KG OS 架构决策的**决定、依据、备选、取舍与被替换基线**。具体运行行为仍由对应职责设计文件拥有；本文件不建立第二份操作合同。

## 本次架构替换

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

## 关键设计决定

### D1 Lithograph 是 KG OS 的数据库核心

- 决定：KG OS 的图、Schema、Search 与 versioned-state mechanism 统一依赖 Lithograph 公开能力。
- 依据：这些能力已经属于独立通用数据库 Lithograph 的产品边界，KG OS 不应复制实现。
- 备选：继续维护 KG OS 自建 Graph Engine。
- 取舍：KG OS 明显简化，但实现进度受 Lithograph 对应公共能力的实际可用性约束。

### D2 Ontology Structure 只有一个真源

- 决定：Lithograph Schema 是全部结构状态的唯一真源；KG OS 对外 Ontology Structure 是其中调用方 Schema resource 的业务投影，排除 KG OS-owned reserved internal Schema resources。KG OS 不保存第二套结构 Schema。
- 依据：避免结构重复、漂移和双重约束语义。
- 备选：Lithograph Schema + KG OS JSON Schema 并存。
- 取舍：KG OS 能表达的调用方结构能力以 Lithograph / Cypher 25 已支持范围为边界；KG OS 可以在同一 Schema 中维护自身 internal graph 必需的 reserved infrastructure definitions，但不能把这些定义提升为调用方 Ontology 语义，也不能自行添加 Lithograph 不支持的结构语义。

### D3 Ontology 上层语义作为普通图数据

- 决定：Definition / Property 的 `title` / `description` 由稳定的 KG OS internal Binding Record 承载；Domain / `INCLUDES` 直接组织这些 Binding Record；Binding Record 通过 Snapshot-scoped Schema Locator 指向同一 Snapshot 的 Lithograph Schema element。全部仍是 Lithograph 中的普通 versioned graph data。
- 依据：Cypher 25 Graph Type 当前没有通用 description annotation，也不负责 KG OS 业务组织；普通图数据可以在不修改 Lithograph 的前提下承载上层语义并自动版本化。
- 备选：给 Lithograph 增加 KG OS 专用 Schema annotation。
- 取舍：KG OS 需要维护 Binding Record 与 Schema Locator 的一致性，并通过 Lithograph Graph View 在普通 Knowledge 访问中隔离自身 internal graph；内部 graph 同时受完整 Lithograph Schema / Constraint 约束，因此需要同一 Schema 中的 reserved internal Schema resources。

### D4 Definition 是聚合视图，不是存储模型

- 决定：Definition 作为 Object 的一种业务化聚合视图，读取时合并 Lithograph Schema 与 semantic metadata，Object Patch 写入时分派到真实底层能力。
- 依据：AI / Web 不应该理解两套底层来源，但也不能为了接口方便复制结构真源。
- 备选：持久化完整 Definition JSON。
- 取舍：读取和修改需要聚合 / 编排，但消除了 Definition 与真实 Schema 漂移的问题。

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

### D8 Ontology 通过 Object 渐进自描述，不建立完整 Ontology 资源

- 决定：AI 通过 Object `list` / `search` / `read` 渐进取得由 Lithograph Schema、KG OS Schema semantics 与 Domain organization 组合的 Domain / Definition / Property Object projection。KG OS 不建立独立 `get ontology` API，也不把完整 Ontology JSON 定义成带新 Object Ref 的顶层公共资源；调用方或 Web 可以在同一 resolved State 内临时聚合多个 Object read result。
- 依据：AI 需要直接理解“模型是什么、字段是什么意思、模型如何组织”，但大型 Ontology 不应要求一次加载；同时建立完整 Ontology resource 会重新引入一套与 Object 重叠的读取与 mutation 入口。
- 备选：提供独立完整 Ontology aggregate API / Object；让 AI 分别读取 Lithograph Schema 与 KG OS internal metadata；持久化一份完整 Ontology JSON。
- 取舍：AI 需要按任务逐步发现和读取相关 Object；换取单一 Object 访问模型、按需上下文大小与没有第二份 Ontology wire resource。

### D9 公共能力收敛为 Object / Graph / Evolution

- 决定：KG OS 的 AI-facing 公共能力只建立三组核心心智模型：Object 负责明确对象的发现、稳定读取与统一 Patch；Graph 负责 Cypher 查询和集合级 mutation；Evolution 负责 State / Branch / Tag / History / Diff / Merge。Ontology 与 Knowledge 保持产品语义和数据边界，但不再各自复制完整 CRUD / History API。
- 依据：AI 需要的是“找到对象并维护”“查询关系和集合”“理解时间与版本”三类确定性能力；把 Definition、Domain、Knowledge Node / Relationship 分别建接口会增加身份转换和重复 CRUD，而没有新的底层 owner 或 lifecycle。
- 备选：保留 Ontology Read/Define/Organize/History 与 Knowledge get/list/expand/mutate/history 两套能力；或者所有任务都要求直接写 Cypher。
- 取舍：公共能力面更小且身份统一；KG OS 需要维护稳定 Object projection / Patch contract，并让 Graph 与 Object 的职责边界清楚。

### D10 Object Patch 使用 canonical YAML + Git Extended Diff

- 决定：Object `read` 的 editable representation 是稳定 canonical YAML；Object `patch` 接收基于该 YAML 生成的普通 two-way Git Extended Diff（`git diff -p`）Patch，并覆盖 Add / Update / Delete / Rename / Restructure。KG OS 不自定义 Patch section / hunk / pathname-quoting grammar；多 Object 使用多个 `diff --git` entry，新增 / 删除 / rename 复用 Git 标准 extended headers 与 `/dev/null` 语义。一个请求可以修改多个明确 Object；已有对象使用 owner-backed Object Ref，新增对象只使用 request-local alias。Patch 对 `baseState` canonical YAML 精确应用，不 fuzzy match；Add/Update/Delete/Rename 不做隐式 upsert / no-op。KG OS 不使用 JSON Patch、JSON Merge Patch 或 `op/path/value` mutation DSL 作为公共 Object mutation 模型。系统分配的 identity 不能由调用方直接重写，但业务结构变化可以导致底层 replacement / migration，并通过 Ref transition / Evolution diff 暴露结果。
- 依据：AI 天然擅长读取稳定文本并生成文件式局部 Patch；Git Extended Diff 已经提供成熟、广泛实现的修改、新增、删除、rename、多目标和 pathname quoting 文本语法，没有当前需求要求 KG OS 再发明一套 Patch grammar。同一 Object mutation 模型可以维护 Definition、Domain、Property、Knowledge Node / Relationship，避免 `mutate`、Ontology CRUD、Domain CRUD 等重复写接口。Lithograph 已经把标准 Cypher 25 定义为正常 graph / Schema / Index mutation language，并提供 explicit transaction 作为多 query 单 Commit boundary；KG OS 只负责把业务 Object target change 编译到这条底层路径，不再发明数据库 mutation engine，也不把 Lithograph Structural Patch 扩成第二套 CRUD API。
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

- 决定：Object / Graph Read 直接使用 State / Branch / Tag reference；Branch / Tag 在 operation 开始时解析并 pin 到 immutable State，不再建立独立 `State Context` 抽象。Object Patch / Graph Execute 显式指定目标 Branch，不暴露 checkout；任何创建新 State 的 KG OS 操作成功后都返回最终 State identity，多步编排不要求调用方理解内部 Commit 数量。
- 依据：Git-style ref 已足以表达“读取哪个 Snapshot / 推进哪个 Branch”，无需再增加一层状态对象；同时 AI 与并发调用不应依赖 connection-local 隐式状态。
- 备选：建立独立 State Context request object；依赖 Lithograph checkout；或仅返回业务 mutation result 不返回 State。
- 取舍：公共模型更小；State / Branch / Tag 的 canonical StateRef 已由 D35 冻结，CLI / SDK / HTTP 只需要做 adapter mapping，不再创建第二套状态身份或引用格式。

### D14 Object Ref 直接复用 owner identity 或名称定位

- 决定：KG OS 不建立全局 Resource ID / UUID 体系，也不把原生 identity 包装成第二种 Object 地址。Knowledge element 的 Object Ref 直接使用 Lithograph `n:<id>` / `r:<id>`；Graph Type / standalone Constraint / Index 直接使用 Lithograph public schema locator / identity；Definition 使用 kind + 当前 Schema identifying name；Property 使用 owner Definition Ref + property name；Domain 使用当前 name。State / Branch / Tag 保持独立 Evolution reference。Definition / Property / Domain 的跨 rename 连续性由 KG OS internal graph identity 维护，不作为 v1 public identity。
- 依据：这些资源已经有足够的确定性定位信息；额外 UUID 会建立第二套身份映射，却没有当前使用场景需要调用方跨 rename 持有 opaque public identifier。
- 备选：为 Definition、Property、Domain 统一生成稳定 public UUID；直接暴露 Binding Record / Domain Node 的 Lithograph element identity。
- 取舍：rename 后公共名称引用会变化，历史读取必须结合目标 State；Evolution History / Diff 仍可依靠内部稳定 identity 识别连续性。若未来出现真实的跨 rename opaque-reference 需求，再通过新的设计修订评估稳定 public ID。

### D15 Definition / Property 删除不隐式级联 Knowledge

- 决定：Definition / Property delete 必须对整个 Object Patch 的目标 Snapshot 做 dependency 校验。若目标状态仍有依赖则 reject；KG OS 不自动删除、迁移或保留 orphan Knowledge，也不在 v1 提供 `force` / `cascade` / `preserve_orphan` 模式。调用方可以在同一个 Object Patch 中**显式**迁移 / 删除依赖 Knowledge 后再删除结构，只要最终 Snapshot 合法。成功删除同时清理对应 Binding Record；删除 Definition 时同时清理其 Property Binding Records 与 Domain `INCLUDES` membership。历史 State 不受影响。
- 依据：Schema 生命周期操作不应隐式触发大规模业务数据丢失或替调用方做迁移决策；同时 Object Patch 应能原子表达调用方已经明确给出的完整迁移计划，不强迫拆成多个请求。
- 备选：删除 Definition 时级联删除相关 Knowledge；允许删除结构后保留无法由当前 Ontology 解释的 orphan Knowledge；提供 `force` 参数让单个操作选择行为。
- 取舍：调用方必须显式声明依赖 Knowledge 的迁移或删除，不能只要求“强制删结构”；这些变化可以放在同一个 Object Patch 中原子完成。换取的是无隐式数据损失、没有 orphan 状态，也无需维护多套删除模式。

### D16 Object Patch 使用 strict base State

- 决定：Object Patch 必须基于调用方实际读取到的 immutable `baseState`，并显式指定目标 Branch；执行开始时目标 Branch head 必须仍等于 `baseState`，执行期间目标 Branch 再次移动也必须按 Lithograph branch-head compare 失败。KG OS 不把旧文本 Patch 自动套用到新 State，不自动 rebase / merge。
- 依据：textual Patch 的语义来自调用方看到的 canonical YAML；在不同 Snapshot 上“尽量应用”会把文件 Patch 模型变成隐式 merge，并产生难以预测的 AI 写入结果。Lithograph 已提供 Branch head compare 与 `BRANCH_HEAD_MOVED` 底层并发保护。
- 备选：即使 Branch 已前进，只要 Lithograph raw patch 的 before condition 仍满足就继续应用；自动 three-way merge / rebase。
- 取舍：并发写发生后调用方需要重新读取最新 Object 并重新生成 Patch；换取明确、可重复的 mutation base 和更简单的冲突语义。

### D17 Definition rename 执行语义保持的 Knowledge migration

- 决定：Definition / Property rename 不是只修改 Schema 名称与 Binding Locator；KG OS 必须同步更新依赖的 Schema / Constraint / Index references，并完成保持已有 Knowledge 业务含义所必需的数据迁移。Node identifying Label rename 迁移受影响 Node 的 Label；Property rename 只作用于 owner Definition 按 Lithograph Schema coverage 覆盖的 element，不全图修改同名 key，并且不得静默覆盖已有新 key value；如果同一 physical property 同时承载其它 Definition 的语义且无法无损局部迁移则失败。Relationship Type rename 在底层不能原地修改时重建受影响 Relationship 并产生新的 element identity。任何不能安全得到合法目标 Snapshot 的 rename 整体失败。这个语义保持 migration 是显式 rename 的组成部分，不属于 D15 禁止的“Delete 隐式级联数据删除”。
- 依据：Definition 是当前 Knowledge 的模型解释；只 rename Schema 而留下旧 Label / Type / Property key 会使同一成功操作产生结构与数据脱节的 State，这与 Object Patch“描述目标 Object 变化并由 KG OS 编排底层实现”的合同冲突。
- 备选：rename 只改 Definition，要求调用方另行显式迁移全部 Knowledge；禁止 rename，只允许 create + migrate + delete。
- 取舍：rename 可能是高成本批量操作，Relationship Type rename 还会改变大量 Relationship Ref。只有调用方直接寻址修改的 Object 承诺 Ref transition；Definition-level 批量 Relationship replacement 不承诺可永久恢复的一对一 oldRef→newRef 映射，调用方通过新 State 的 Graph 重新发现对象，并通过 bounded Evolution diff/history 审计集合变化。

### D18 Object 删除不隐式 DETACH Knowledge Node

- 决定：Object Patch 删除 Knowledge Relationship 只删除该 Relationship；删除仍存在 incident Relationship 的 Knowledge Node 时 reject，除非同一 Object Patch 已显式删除或重构这些 Relationship。Object Patch 不把 Node delete 自动提升为 `DETACH DELETE`。
- 依据：Object Patch 的价值之一是让 AI 明确表达目标对象变化；静默 DETACH 会因为一个 Node delete 隐式删除其它有独立 identity 的 Relationship Object，违背无隐式数据损失和明确 Object mutation 原则。
- 备选：所有 Node delete 默认 DETACH；为 Node delete 增加 cascade flag。
- 取舍：删除连接度高的 Node 需要调用方明确处理 incident Relationship；需要大规模条件删除时仍可用 Graph `execute` 明确表达 Cypher `DETACH DELETE` 等集合 mutation。

### D19 Object History 使用 anchor State + Object Ref

- 决定：对象级 Evolution `history` / `diff` 一律以 anchor State + Object Ref 定位起始对象，不能把裸 name / locator 当成跨版本永久 identity。解析后只使用 owner 已有 continuity evidence：Definition / Property / Domain 使用 internal Binding / Domain identity，Knowledge 使用 Lithograph element identity，Graph Type / Constraint / Index 使用 Lithograph public Schema history / identity 实际提供的连续性；没有稳定证据时不猜测同名 drop+create 为同一对象。Relationship replacement 产生的新 `r:<id>` 是新持久身份，history 不跨 mutation-result Ref transition 自动拼接。
- 依据：名称型 Ref 与某些 Schema locator 都可能被删除后重新使用；缺少 anchor State 或擅自按字符串连接历史都会把两个独立生命周期错误合并。
- 备选：把所有名称永久保留不可复用；向公共 API 暴露 / 新建统一 stable UUID；仅按字符串和相邻 diff 猜测连续性。
- 取舍：对象级历史调用需要同时提供一个 State，某些底层没有 stable Schema identity 的资源在 drop+create 之间不会自动获得 continuity；换取没有第二套公开 UUID，且历史解释只建立在可证明的 owner identity 上。

### D20 Knowledge replacement 不建立持久 Ref alias

- 决定：当直接 Knowledge Relationship Object Patch 因 type / endpoint 变化必须 replacement 时，成功结果可以返回旧 Ref → 新 Ref transition，帮助调用方继续本次工作；KG OS 不把该 transition 持久化为第二套 Knowledge identity / alias，也不让后续对象级 History 自动跨两个 `r:<id>` 合并生命周期。
- 依据：Lithograph Relationship identity 独立且 type / endpoint 变化通过新 Relationship 表达；持久保存 replacement continuity 会重新建立 KG OS 自己的 Knowledge identity mapping，与“直接复用 Lithograph element identity”冲突。
- 备选：为所有 replacement Relationship 建立 KG OS stable knowledge ID；把 Ref transition 永久记录进 semantic graph。
- 取舍：持有旧 `r:<id>` 的调用方必须使用当次 mutation result 更新引用，Definition-level 批量 replacement 后则重新 Graph query；换取不引入第二套持久身份和历史真源。

### D21 重叠 Object projection 不允许同 Patch 双重修改

- 决定：为减少 AI 上下文，Property 可以作为 Definition 的可寻址 child Object，同时 Definition read 可以包含 Property 的完整业务化投影。两者是同一底层 logical state 的不同读取粒度。一个 Object Patch 可以通过父 Definition 或 child Property 修改该 Property，但不能同时通过两个 section 修改同一底层 slot；KG OS 必须在执行前检测并拒绝 overlapping target change。
- 依据：允许 focused child Object 可以避免为了修改一个字段读取大型 Definition；允许 Definition 聚合读取又能保持模型理解完整。若不定义 overlap 规则，同一 Patch 的结果会依赖 entry 顺序，形成隐藏的第二套 mutation precedence。
- 备选：Definition 永远不展示完整 Property；Property 永远不能独立 Object；规定 parent 或 child 固定覆盖另一方。
- 取舍：调用方需要避免在一个 Patch 重复表达同一 Property change；换取读取粒度灵活、底层仍单一真源且 mutation 结果与 entry 顺序无关。

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

### D24 Object representation 只投影 owner state

- 决定：Object Value 以及它的 YAML / JSON representation 只包含该 Object owner 的可编辑状态与跨 Object Ref，不内联其它独立 Object 的可变内容。Knowledge Node / Relationship 不复制 Definition semantics，Relationship 不复制 endpoint Node content，Domain 不复制成员内容。Definition 为整体模型理解可以包含 child Property projection，这是唯一当前确认的重叠 owner/child view，并服从 D21。
- 依据：canonical YAML 同时是 textual Patch 的编辑基线；若把其它 Object 的可变字段内联，AI 会看到同一底层状态出现在多个不相关 Patch target 中，从而重新产生重复 ownership 和冲突写入口；JSON representation 也必须与同一 Object Value 保持相同 ownership 边界。
- 备选：所有 Object read 都尽可能展开关联对象；把展开字段标记 read-only；只在 Patch 时忽略外部字段变化。
- 取舍：AI 需要额外 `read` 才能获得关联对象的详细语义；换取每个 Object Value 的 ownership 明确、canonical YAML token 可控且 Patch 不会跨对象误写。

### D25 全部 versioned Ontology Structure 通过 Object 暴露

- 决定：Lithograph versioned Schema state 中调用方可见的 current Graph Type、element Definition / Property、standalone Constraint 与 Index definition 都必须有 KG OS Object projection；KG OS 不为 Constraint / Index 另建 Schema API，也不把它们强行归属到某个 Definition。Graph Type / Constraint / Index Object Ref 直接使用 Lithograph 公开 schema locator / identity，不创建 Binding Record 或 KG OS UUID。Current Graph Type Object 只拥有 graph-level state，element Definition / Property lifecycle 由 child Object 独立拥有，Graph Type projection 不复制第二份可编辑 child schema。
- 依据：Lithograph 设计明确 Graph Type、standalone constraints、index definitions 共同构成 versioned Schema state；如果只让 Definition Object 可写，standalone / multi-target schema resource 将没有公共维护入口，Object / Graph / Evolution 就不再覆盖完整 KG OS 能力面。
- 备选：把所有 Constraint / Index 强制嵌入某个 Definition；新增独立 Schema API；允许 Graph `execute` 任意 Schema DDL。
- 取舍：Object kind 增加少量底层 schema resource 类型，但仍保持一个统一 Object surface；这些对象没有 KG OS 自然语言 semantic metadata，避免为尚无需求的 Schema annotation 增加 Binding 模型。调用方 Schema Object 仍受 reserved internal namespace / target 隔离，不能借 Constraint / Index 指向内部资源。若 Lithograph 暂未提供某类资源的无歧义公共 locator / mutation surface，该 Object kind 的实现被依赖阻塞，而不是由 KG OS 自建 identity 层绕过。

### D26 Object Patch 统一变化模型不覆盖 owner lifecycle

- 决定：Add / Update / Delete / Rename / Restructure 是公共 Patch 的变化分类，但某个 Object kind 是否允许某类变化、以及底层如何表达，继续服从该 Object owner 的已确认合同。KG OS 只为本文已明确的上层语义（例如 Definition / Property / Domain rename）做编排，不把通用 Patch vocabulary 解释成所有资源都有 rename/upsert/cascade 能力。
- 依据：统一交互模型的目的是减少 AI mutation surface，不是建立第二套数据库语义；否则 Constraint、Index、Graph Type、Knowledge element 会因为统一名词获得 Lithograph 并不存在的行为。
- 备选：为每个 Object kind 建独立 CRUD API；让通用 Patch 自动用 delete + create 模拟所有不支持的操作。
- 取舍：调用方需要理解目标 Object kind 的合法业务变化；换取底层语义忠实、无隐式 destructive emulation，同时继续只有一个 Patch 入口。

### D27 Graph Type projection 不复制 child Definition mutation ownership

- 决定：Current Graph Type Object 只暴露 graph-level state 和必要的 child Ref / summary；Definition / Property 的可编辑结构不在 Graph Type Object Value / canonical YAML 中重复出现，也不能通过 Graph Type Patch 间接修改。若 Lithograph 底层 DDL 需要 whole Graph Type replacement，KG OS compiler 从所有 target schema Objects 合成底层完整 Graph Type。
- 依据：Object 是 AI-facing ownership projection，不要求一比一复制底层 AST nesting。若 Graph Type 和 Definition 同时拥有完整 element definition，可编辑状态会再次出现两套公共 mutation target，违背 owner-only representation。
- 备选：Graph Type canonical YAML 完整内联并可编辑所有 element definitions，再用 D21 overlap reject 重叠；取消 Definition Object，只编辑整个 Graph Type。
- 取舍：Graph Type Object 不一定能原样显示底层完整 DDL AST；换取 Definition 级小上下文修改、唯一 mutation ownership 和大型 Schema 下更低 token 成本。

### D28 Standalone Constraint / Index 只有一个公共 mutation owner

- 决定：Graph Type / element definition 内生的 property type、key、existence 等结构由 Definition / Property Object 拥有；Lithograph standalone Constraint definition 与 Index definition 分别只由 Constraint Object、Index Object 拥有。其它 Object 可以引用或摘要显示这些资源，但不能内联第二份可编辑定义。被引用 Definition / Property rename 时，为保持同一逻辑 target 而产生的 locator rewrite 是 referential maintenance，不转移 Constraint / Index 的 mutation ownership，也不能修改其余配置。
- 依据：Lithograph 自身区分 Graph Type、standalone constraints 与 index definitions；KG OS 若把 standalone resource 同时嵌入 Definition 可写文本，会造成底层一个 logical slot 对应多个公共 owner。
- 备选：所有 Constraint / Index 都强制归属单个 Definition；Definition 与 standalone Object 都允许编辑并用 overlap detection 解决。
- 取舍：AI 修改 standalone schema resource 时需要读取对应 Constraint / Index Object；换取 mutation ownership 唯一，并支持跨 Definition / multi-target index 等不能自然归属单个 Definition 的能力。

### D29 Rename 可以派生跨 Object locator rewrite，但不转移 ownership

- 决定：当一个 Object 的 canonical state 保存对另一个 Object 的 Ref / schema locator 时，被引用 Object 的 rename 可以让 KG OS 自动重写该 locator，以保持原有逻辑引用。派生 rewrite 只覆盖“仍指向同一逻辑对象”所必需的 locator slot；其它字段仍只能由该 Object 自己的显式 Patch 修改。显式 change 与派生 rewrite 若落到同一 logical slot 且目标不同则整体冲突。
- 依据：Definition / Property rename 会改变 public/schema locator；若 Constraint / Index / Domain 等引用者完全不更新，就会形成悬空引用。但把整个引用者当成 rename 操作的隐式可写对象又会破坏 owner-only contract。
- 备选：要求调用方在 rename Patch 中显式更新所有引用者；允许 rename 任意修改关联 Object；把 Ref 设计成永久 UUID 避免 locator 变化。
- 取舍：KG OS compiler 需要做引用依赖分析和 deterministic locator rewrite；换取 rename 仍是一个语义完整操作，同时不引入永久公共 UUID 或跨 owner 隐式业务变更。

### D30 Evolution merge 必须保持 KG OS-valid Snapshot

- 决定：KG OS whole-Knowledge-Base merge 不以“Lithograph 没有 raw slot conflict”作为唯一成功条件；target/source 在 `merge.start` 前先解析并通过 KG OS consistency check，再用 Lithograph `expectedHead` CAS 保证 Session 实际 pin 的 target 不发生 check-then-use 漂移；候选 merge result 还必须满足 KG OS 的 Binding coverage、internal graph / Schema isolation 等 consistency invariants。KG OS 在 Lithograph Merge Session 的**固定 revision**上完成 candidate validation，再把同一 revision 交给 `merge.finalize`；Lithograph finalize 同时检查 session revision 与 target Branch pinned head，因此 validation 后 resolution 或 target head 任一变化都会拒绝提交。fast-forward source/candidate 无效时同样不得移动目标 Branch。
- 依据：Ontology semantics 与 Lithograph Schema 是同一 State 的两个组成部分，底层按独立 logical slots 合并后仍可能组合成 KG OS 无法解释的状态；公共 Evolution 不能主动生成一个随后 Object read 就报 consistency error 的 State。
- 备选：完全透传 Lithograph merge，只在后续 Object read 时发现 KG OS inconsistency；让 Lithograph 调用 KG OS callback；在 merge 后自动猜测并修复 Binding；先提交 invalid Merge Commit 再自动 revert。
- 取舍：KG OS merge 比 raw Lithograph merge 多一层业务一致性验证和一次 candidate read；换取不把 KG OS 语义写入 Lithograph、没有长 writer transaction，并保证所有通过 KG OS finalize 的 State 满足当前 KG OS 设计不变量。

### D31 Invalid Lithograph Snapshot 只允许 Evolution 诊断，不继续演进

- 决定：绕过 KG OS 产生且不满足 Binding / internal Schema 等 invariants 的 Lithograph Commit 保留在底层历史中；KG OS Evolution topology / metadata read 可以标记并诊断它，但 Object / Graph data capability、business History/Diff 和所有会创建新 State、推进 Branch 或创建 / 移动 Tag 到目标 Snapshot 的 KG OS mutation 都拒绝使用 invalid base / target。History 在 invalid / pre-KGOS ancestry boundary 终止，不跨边界猜 continuity。Commit Data set/clear 与 Branch/Tag delete 只修改 sidecar/ref cleanup，可以作用于 invalid State。KG OS v1 不自动修复这种 Snapshot。
- 依据：底层 immutable history 不能被 KG OS 静默改写；但允许正常公共写继续基于 invalid state 会让 inconsistency 扩散到更多 Commit / refs，并使“KG OS public write 产生可读 State”不再成立。
- 备选：所有能力一律完全拒绝看 invalid Commit；允许 Graph 继续查询/写普通 Knowledge；自动重建 Binding 或跳过异常 internal metadata。
- 取舍：Evolution 仍能提供排障所需 topology / metadata，但业务数据访问需要先回到一个 KG OS-valid State 或由外部底层维护显式修复；换取不会通过 KG OS API 传播坏状态。

### D32 Textual Patch 只把 base→patched 差异视为显式 target change

- 决定：Update / Rename / Restructure entry 应用 textual Patch 后，KG OS 将 patched YAML 解析得到的 Object Value 与 base canonical YAML 对应的 Object Value 比较，只把实际变化的 logical slots 作为调用方显式 target delta；Rename entry 的 old/new target 另外提供顶层 identifying locator 的显式 rename delta。未改变字段是 Patch context，不具有“锁定旧值”的 PUT 语义。Mandatory rename migration、locator rewrite 和当前操作所需 consistency change 可以更新这些 untouched slots；若派生变化与显式 delta 同时写同一 slot 且目标不同则 conflict。
- 依据：文件 Patch 天然表达局部编辑。若把 patch 后整份文本当成 full replacement，任何 Definition rename 都会与同时修改相关 Knowledge Object 的无关字段产生伪冲突，因为它们的 base 文本仍显示旧 label / type / property ref。
- 备选：Object Patch 等价完整 PUT；要求 AI 在每个受影响 Object entry 中手工同步所有派生字段；按 entry 顺序最后写入者获胜。
- 取舍：compiler 必须执行 canonical parse + logical diff，而不能只 parse final text；换取真正的 Git Extended Diff 局部修改语义、可组合多 Object migration 和确定的冲突检测。

### D33 KG OS v1 只 bootstrap 空 Lithograph Knowledge Base

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

### D36 Object Ref 使用 canonical typed string，不建立 Resource ID 层

- 决定：Definition / Property / Domain 使用 `node:`、`relationship:`、`property:...#...`、`domain:` typed string；Knowledge 继续原样 `n:` / `r:`；Schema resource 使用 `graph-type:` / `constraint:` / `index:` + Lithograph public locator。component 使用 RFC 3986 percent-encoding；新增 Patch target 使用 `new:<kind>:<alias>`。`new:...` 是 request-local Patch target / reference token，不属于 ObjectRef grammar，不能在 Patch 请求之外持久保存、查询、历史定位或跨请求复用。
- 依据：Object Patch Git target、Domain `includes`、History filter 和 CLI/SDK 都需要紧凑可复制地址；typed string 可以在不建立持久 UUID 映射的前提下提供无歧义 kind/locator serialization，并复用标准 component escaping。
- 备选：每种 Object 使用不同 request shape；统一生成 KG OS UUID；把 JSON reference object 直接编码进 Git pathname。
- 取舍：名称型 Object rename 会改变 Ref，保持 D14/D19 已确认语义；Schema resource 仍依赖 Lithograph 提供 canonical public locator，KG OS 不填补底层缺口。

### D37 公共 capability 先冻结 transport-neutral logical wire

- 决定：Object / Graph / Evolution 先冻结本文 request/result/error logical shape；HTTP route、CLI command、SDK method 与具体 metadata carrier 只做 adapter mapping，不得改变字段语义或创建 adapter-specific capability。
- 依据：当前产品明确需要 CLI + Skill、SDK/Web 消费，但尚无要求把某一种 transport 变成 Kernel 产品语义；先冻结一个逻辑合同可以避免为 HTTP、CLI、SDK 维护三套接口定义。
- 备选：现在直接冻结 REST path / HTTP header；CLI 与 SDK 各自独立设计；等实现时再临时决定所有 wire shape。
- 取舍：后续 adapter 仍需各自 reference/usage 文档，但它们只能映射已确认逻辑合同，不能重新决定 StateRef、ObjectRef、pagination、typed value 或错误语义。

### D38 `__kgos_` 是 v1 reserved internal persistence namespace

- 决定：KG OS-owned internal graph / Schema identifiers 统一保留 exact UTF-8 prefix `__kgos_`，并使用本文冻结的 marker / Binding / Domain / Relationship / Property key 编码。调用方公共 mutation 不能创建或修改该 namespace；命中时返回 `RESERVED_IDENTIFIER`。这些名字是持久化格式的一部分，未来改名必须显式 migration。
- 依据：internal Ontology semantic graph 与调用方 Knowledge 共存在同一 Lithograph graph / Schema，需要一个确定、可在 mutation 前拒绝冲突且可由 `graphView` 隔离的持久化 namespace；如果只写“实现时任选内部名”，不同版本会无法稳定解释历史 State。
- 备选：每次启动随机前缀；仅依赖隐藏 element ID；把 internal semantics 放 SQLite side table；把具体名字长期留给实现自行选择。
- 取舍：调用方不能使用 `__kgos_` 开头的 Schema / graph identifier；换取 internal history、Graph View isolation、Schema bootstrap 与 migration 有稳定编码，同时不建立第二套数据库或绕过 Lithograph。

### D39 Object Patch 使用 Lithograph explicit transaction 作为单一 State boundary

- 决定：所有存在有效 target delta 的 Object Patch 都在一个 Lithograph public explicit transaction 中执行。KG OS 在 `tx_begin` 传入 target Branch 与 `expectedHead = baseState`，随后只执行标准 Cypher 25 graph / Schema / Constraint / Index mutation；成功 `tx_commit` 恰好产生一个 Lithograph Commit / KG OS State。任何 query / callback / validation / commit failure 都由 Lithograph fail-closed auto-abort，不留下 intermediate Commit；`BRANCH_HEAD_MOVED` / expected-head mismatch 映射为 `STALE_BASE_STATE`。无有效 target delta 的 Patch 在 strict base check 通过后直接返回 `baseState`，不启动 mutation transaction、不创建 State。
- 依据：KG OS 的一次 Object Patch 是一个上层 logical mutation unit，Definition / Property 的 Structure、Binding semantic graph 与必要 Knowledge migration 必须在同一个 public State 中共同成立。Lithograph explicit transaction 已把多个标准 Cypher execution 定义为一个 Commit boundary，并在 writer ownership 下提供 `expectedHead` CAS，因此 KG OS 不再需要 raw Structural Patch、caller-owned SQLite transaction 或 hidden intermediate State 来实现这一不变量。
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

### D43 `kg` CLI 直接映射 Kernel contract，并采用 AI-first JSON / non-interactive 语义

- 决定：v1 CLI executable 固定为 `kg`，产品名称保持 **KG OS**，daemon 名称保持 `kgosd`；canonical command tree 直接映射 `object / graph / evolution`。普通成功结果默认输出单一 JSON document；Object raw body 和 Graph NDJSON streaming 是两个显式例外。CLI 不维护 hidden current Branch / State、auto-pagination、interactive confirm/editor/pager、第二套 CRUD/History command、raw Lithograph/SQLite pass-through 或 command alias。Cypher / Patch / resolution 等 required body 统一支持 inline、file、non-TTY stdin；业务 error 继续使用公共 JSON envelope，exit code 只做粗粒度 execution layer 分类。
- 依据：AI 是第一使用者，需要确定、可组合、可机器解析、无隐藏交互状态的命令；`kg` 作为高频 binary 比完整产品名更短，同时 CLI、产品和 daemon 的名称职责仍然清楚。把 logical contract 一一映射到 CLI 能避免 CLI 自己重新发明资源、默认 Branch、mutation semantics 或 error model。JSON-first 比维护 human table + machine mode 两套默认结果更稳定；pure canonical YAML 仍通过 `object read --body` 服务 AI / 人类编辑。
- 备选：human table/text 默认并要求 AI 每次加 `--json`；把 Branch/Tag/Merge 等拍平成顶层快捷命令；CLI 维护 current Branch / checkout；为 create/update/delete 建专用快捷写命令；提供 generic `request` / raw Lithograph escape hatch；大结果默认 auto-page 到 EOF。
- 取舍：普通人类终端默认看到 JSON，而不是专门 table UI；AI 需要显式追 cursor，Object textual Patch 的最安全流程可能需要先取得 resolved State、再按该 Commit 读取 canonical YAML。换取一个 command spelling、一个业务 contract、bounded context、可重复并发语义和无交互自动化。daemon endpoint / home 由 D44 冻结；Knowledge Base target 仍需独立设计，但不能反向改变 CLI 业务命令。

### D44 `kgosd` 使用可配置 HTTP bind 与 `~/.kgosd/` 本地运行目录

- 决定：KG OS v1 的 `kg` / SDK / Web 统一通过 `kgosd` 的 IPv4 HTTP 访问 Kernel；`~/.kgosd/config.toml` 同时支持 `server.host` 与 `server.port`，默认分别为 `127.0.0.1` 与 `4765`。`server.host` 是 IPv4 bind address，可以显式配置 LAN address 或 `0.0.0.0`；端口占用时启动失败，不自动切换随机端口。`kgosd` 同时提供 Web 与 API，使 Browser 使用同 origin。daemon home 固定为 `~/.kgosd/`，职责分为 `config.toml`、`run/daemon.json`、`logs/` 与 `data/`。v1 不定义 token、API key、登录或其它 authentication / authorization；`run/` 不保存 authentication secret。
- 依据：默认 loopback 满足本机使用；`host` 配置允许用户明确选择其它 bind address，而不需要新增第二套 daemon/runtime 模式。Web 是正式 Human-facing interface，需要稳定的 configured origin；CLI/SDK/Web 共用 HTTP 可以避免 Unix socket、Named Pipe、gRPC 与 Web transport 多套实现。一个明确 daemon home 让配置、当前运行状态、日志和持久 runtime data 有统一可发现位置。用户明确选择 v1 不引入 token/auth。
- 备选：每次启动随机端口 + runtime descriptor；CLI 使用 Unix Domain Socket、Web 另走 HTTP；gRPC；把配置/运行状态分散到各平台 config/data/run 目录；本地 token authentication。
- 取舍：固定默认端口可能与其它本地程序冲突，因此支持显式端口配置并在冲突时 fail-fast；显式配置非 loopback host 会把同一个**无认证** Web/API 暴露到对应网络，v1 不因此自动增加认证、TLS 或权限隔离。`0.0.0.0` 是 bind wildcard，不作为 CLI connect host；本机 CLI 对该配置使用 `127.0.0.1`。`data/` 的 Knowledge Base 布局、一个 daemon 管理一个还是多个 Knowledge Base、以及 operator process lifecycle 仍需后续设计，不能从本决定自动推导。
