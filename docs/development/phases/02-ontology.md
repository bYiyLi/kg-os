# Phase 02：Ontology

**状态：`in_progress`**

## 1. 目标与范围

在 Phase 01 已完成的 Go Runtime / Lithograph Host foundation 上，交付 KG OS 第一组完整业务能力：把空 Lithograph Root bootstrap 成第一个 **KG OS-valid State**，实现 Ontology 的内部 semantic graph / Binding / Schema Locator、正反向 compiler / decoder、canonical editable representation、Ontology-scoped Object Patch，以及正式的 authenticated HTTP + `kg ontology` / `kg ontology patch` 使用入口。

本 Phase 完成后，调用方可以完整定义和维护自己的数据模型：

- Domain；
- Node Definition；
- Relationship Definition；
- Property；
- `required` / `unique` / named Constraint；
- Range / Text / Point / Full-text / Managed Semantic Index；
- create / update / rename / delete；
- Ontology Overview / Domain / Definition 渐进读取；
- 单 Ref / batch `--edit` canonical YAML；
- 多 aggregate 原子 Patch。

本 Phase **不开放普通 Knowledge 数据 CRUD**。它不实现公共 `kg object list/search/read/patch`、Graph query/execute、Evolution、SDK/Web/Skill 业务交互或完整 `kg daemon start/status/stop/restart`。Phase 02 的“完整 Ontology”指 Kernel + authenticated HTTP + AI-facing `kg ontology` CLI 已能完整读取和维护 Ontology 逻辑模型，不表示所有 client surface 都已交付。Ontology compiler 为保持结构正确性而执行的 mandatory Knowledge data rewrite / dependency validation 属于模型 mutation 的完整性维护，不等于开放通用 Knowledge mutation surface。

## 2. Design Inputs

- [Knowledge Base bootstrap](../../design/architecture.md#knowledge-base-bootstrap)；
- [Ontology 使用模型与 read 合同](../../design/ontology.md#使用模型)；
- [Ontology 公共可编辑格式](../../design/ontology.md#公共可编辑格式)；
- [Semantic graph 内部边界](../../design/ontology.md#semantic-graph-的内部边界)；
- [Binding Record 与 Schema Locator](../../design/ontology.md#binding-record-与-schema-locator)；
- [共享资源与聚合编辑](../../design/ontology.md#共享资源与聚合编辑)；
- [Patch 到真实变化](../../design/ontology.md#patch-到真实变化)；
- [Object canonical serialization / Patch](../../design/object.md#object-公共调用合同)；
- [公共错误合同](../../design/contracts.md#公共错误合同)；
- [Ontology CLI](../../design/cli.md#ontology-cli)；
- [单 Token 实例认证](../../design/runtime.md#单-token-实例认证)；
- [Ontology compiler / decoder](../../design/implementation.md#ontology-compiler--decoder)。
- [D67 Ontology Index profile](../../design/decisions.md#d67-ontology-index-profile)。
- [D68 reserved Ontology Schema](../../design/decisions.md#d68-reserved-ontology-schema)。
- [D69 Ontology Constraint profile](../../design/decisions.md#d69-ontology-constraint-profile)。
- [D70 Bootstrap orphan-history boundary](../../design/decisions.md#d70-bootstrap-orphan-history)。
- [D71 Graph Type generated Constraint identity](../../design/decisions.md#d71-lithograph-generated-constraint-identity)。

本计划只拆分实现与验收，不重新定义这些产品合同。

## 3. 依赖与当前基线

### 3.1 前置依赖

- [Phase 00](00-engineering-foundation.md) 已 `done`；
- [Phase 01](01-runtime-lithograph-host.md) 已 `done`；
- Go `database/sql` + bundled SQLite、Lithograph v0.3.0 extension loading、read/write connection、StateRef pin、Branch checkout、true streaming/cancellation、Provider readiness/cache mapping、explicit transaction、single-instance lock 与 process shutdown 已有真实本地/CI证据；
- TypeScript SDK/Web workspace存在，但不属于本 Phase 业务交付。

因此在进入实现前，Design Inputs、前置工程依赖、Feature 顺序与 Acceptance 已齐全并满足 `ready` 条件；当前 Phase 已进入 `in_progress` 并完成本地实现与验收收口。

### 3.2 Lithograph integration baseline

Phase 02 继续使用 Phase 01 已冻结的 Lithograph v0.3.0 / storage format 3 / `CY25-2026.08` / SQLite 3.45.0+ SQL-only integration，不新增 Native ABI 或第二套数据库 runtime。

本 Phase 必须复用：

- `ALTER CURRENT GRAPH TYPE ...` / `SHOW CURRENT GRAPH TYPE`；
- Cypher 25 Constraint / Index DDL 与 `SHOW CONSTRAINTS` / `SHOW INDEXES`；
- Full-text Index 的 versioned configuration；
- `db.index.semantic.createNodeIndex/createRelationshipIndex`；
- `lithograph_tx_begin(options_json)`，其中 Ontology mutation 使用 `branch=targetBranch` 与 `expectedHead=baseState` → 普通 `lithograph()` / 必要时 `lithograph_rows()` → commit/abort；
- `options.at` 与 `graphView` 的既有读取能力。

不得通过 SQLite internal table、私有 C ABI、raw storage write 或 KG OS 第二份 Schema 绕过 Lithograph public contract。

## 4. Phase 边界

### 4.1 本 Phase拥有

```text
Knowledge Base bootstrap
  -> reserved internal Schema
  -> internal semantic graph / Binding
  -> KG OS-valid State validation
  -> Ontology decoder / read
  -> canonical YAML / JSON Object Value
  -> Git Extended Diff exact apply
  -> Ontology logical delta / compiler
  -> Schema / Constraint / Index / Binding mutation
  -> rename / delete / dependency / data-safety planning
  -> authenticated Ontology HTTP adapter
  -> kg ontology / kg ontology patch
```

### 4.2 明确不属于本 Phase

- Knowledge Node / Relationship 的公共 create/read/update/delete；
- 通用 `kg object ...` surface；
- Graph `query/execute` HTTP/CLI；
- Evolution / Merge；
- SDK / Web Ontology UI；
- Skill / SDK 使用封装与对应 client 文档；
- `kg daemon start/status/stop/restart`；
- 已有非空 Lithograph database 的自动 adoption / migration；
- caller-owned Vector Property / raw Vector Index profile；
- 多字段 Semantic Index；
- 新的数据库 abstraction、storage backend、schema registry 或 codegen 真源。

## 5. Feature 顺序

```text
02.1 KG OS bootstrap / State validity
 -> 02.2 Internal semantic graph / Binding
 -> 02.3 Ontology decoder / read
 -> 02.4 Canonical serialization / editable read
 -> 02.5 Object Patch parser / logical delta
 -> 02.6 Schema / Constraint compiler
 -> 02.7 Index compiler
 -> 02.8 Rename / delete / data-safety planning
 -> 02.9 Authenticated HTTP + kg ontology CLI
 -> 02.10 Integration hardening / review closure
```

### Feature 02.1 Knowledge Base Bootstrap 与 State Validity

- 在 Phase 01 Lithograph initialization 完成后，由 Kernel 先解析 `branch/main` head：若当前 head 已满足 KG OS-valid consistency invariants，按已有 Knowledge Base打开，不要求全 DAG / 全 refs 都有效；否则只有 fresh Root baseline才允许 bootstrap。fresh baseline要求 `main` 指向 Root、没有额外 Branch/Tag且 Root graph/schema为空；按 D70 不读取内部表证明无 ref orphan Commit，也不把 orphan history自动变成 KG OS State。
- fresh Root 使用一个 Lithograph explicit transaction，以 Root 为 `expectedHead` 建立当前 KG OS 必需的 reserved internal Schema resources；成功只产生一个新的 Commit。
- 空 Ontology 不创建 sentinel/version marker、默认 Domain 或 Binding Node；没有调用方模型时 internal semantic graph保持为空，KG OS-validity由 reserved internal Schema + consistency contract判定。
- bootstrap 任一 statement / validation / commit 失败整体 abort；不能留下 partial Binding、partial Schema 或 intermediate Commit。
- bootstrap transaction不传 author/message或State Data；首个 KG OS-valid Commit 的 author/message必须为 null，不从OS用户/主机/daemon版本派生。
- restart/reopen 已 bootstrap database 只验证，不重复初始化、不产生新 Commit。
- Kernel validation 必须在 daemon endpoint publication 前完成；失败 startup 不发布 active endpoint。

### Feature 02.2 Internal Semantic Graph、Binding 与 Consistency

- 实现当前冻结的 reserved namespace：`__kgos_internal`、`__kgos_domain`、`__kgos_definition_binding`、`__kgos_property_binding`、`__kgos_includes`、`__kgos_property_of` 及对应 metadata fields。
- bootstrap精确实现 D68 reserved Graph Type：Definition Binding / Property Binding / Domain三类 Node都 imply `__kgos_internal`，按 owner冻结的 STRING / NOT NULL字段；`property_of`约束 Property Binding → Definition Binding，`includes`约束 Domain → `__kgos_internal`，两类 Relationship endpoint都使用 non-identifying Label constraint。
- v1不额外创建 standalone internal UNIQUE/KEY Constraint、Index或sentinel；`__kgos_kind=node|relationship`、name uniqueness、Binding coverage和 `includes` target union由 consistency validation承担。
- Lithograph由 Graph Type自动生成的 dependent Constraint/backing resource通过公开 owner/origin/classification识别为 reserved Schema组成部分，即使其数据库生成名称不以 `__kgos_` 开头；decoder不得把它们输出成调用方 Constraint。
- consistency validation把 reserved Schema + internal marker subgraph当 closed profile：marker Node必须恰好属于三类之一且没有额外Label/Property；任何连到 internal Node 的 Relationship都必须是两种合法 internal edge、双端internal且无Property；Property Binding必须恰好一个 owner edge，Domain membership不能有重复平行 edge；D68之外任何 internal-target standalone Constraint/Index或 internal subgraph中的未知/错位 payload整体 `CONSISTENCY_ERROR`。
- startup / Ontology read只需扫描公开 Schema、`__kgos_internal` marker集合及其 incident Relationships；不得为寻找 marker subgraph之外普通 Knowledge element上的 reserved-looking Label/Type/Property做全 Knowledge graph scan。后续 Object操作在 addressed Object/candidate上继续执行 reserved identifier边界。
- 实现 Definition / Property Binding 与 Snapshot-scoped Schema Locator 的正反向解析。
- 验证每个调用方可见 Definition / Property 恰好有一个 Binding，Binding locator 也必须解析回正确 Schema element；reserved internal Schema 是明确例外。
- Domain 多父级 / cycle保持合法；Domain membership 不成为 namespace、权限或 Schema scope。
- Ontology/Object 输入命中 `__kgos_` reserved namespace 时在编译前拒绝，不依赖写后过滤。

### Feature 02.3 Ontology Decoder 与 Progressive Read

- 从同一 resolved State 的公开 Lithograph Schema + internal semantic graph反向构建 Domain / Node Definition / Relationship Definition aggregate。
- 完整保留真实 Label/Type、Property type/order、关系 from/to、required/unique、named Constraint、Index name/targets/properties/config来源。
- 实现 Overview → Domain → Definition 渐进读取；无 Domain 时 Definition仍从 Overview可达。
- 支持 `1..100` batch Ref，一次解析 `at` 并固定同一 Commit；外层保持请求顺序。
- Overview / Domain pagination遵守 limit/cursor合同，Domain只展开直接成员；Definition不分页截断。
- consistency-invalid Snapshot明确返回 `CONSISTENCY_ERROR`，不猜测 Binding、不静默补建或隐藏无法解释的 Schema。
- historical Ontology read始终从目标 State 的 Schema/Binding/IndexDefinition解码；修改当前 `[fulltext]` / `[embedding]` 默认值后不得把历史 analyzer/providerConfig替换成当前配置，历史 hidden config本身也不得因为当前 Provider/tokenizer不可用于查询而阻塞纯 Ontology read。

### Feature 02.4 Canonical Object Serialization 与 Editable Read

- 实现 Domain / Node Definition / Relationship Definition 的 canonical YAML 1.2 renderer 与 equivalent JSON Object Value。
- Go 标准库没有 YAML parser；如果当前 workspace 没有可满足合同的实现，允许为这一真实需求引入一个专用、维护中的 YAML 1.2 依赖，并纳入 Go license / govulncheck / dependency gate。不得为了 YAML 顺带引入通用配置框架。
- 固定字段顺序、2-space indentation、LF、动态 key / set-like collection排序、无 anchors/aliases/custom tags，并覆盖多行/空白/Unicode等 String round-trip。
- 输入 parser必须拒绝 duplicate mapping key；anchors / aliases 可以按 Object 合同解析，但展开必须有界、无循环并最终归一成普通 value tree。
- Definition `properties` 必须非空；`constraints` / Domain `includes`即使为空仍输出；空顶层 `indexes`规范化为省略。
- `labels/includes/targets` 作为 set-like collection必须拒绝重复 logical member并按 UTF-8 bytes canonical排序；不能静默去重。
- 单 Ref `--edit` 只输出 canonical YAML body；batch `--edit` 输出标准 YAML multi-document stream，framing comment不进入 Object Value / Patch base。
- standard YAML输入只按逻辑值校验，不要求调用方复刻 renderer空白风格；成功后再次读取规范化。

### Feature 02.5 Git Extended Diff Parser、Exact Apply 与 Ontology Logical Delta

- 实现 Object Patch v1允许的 ordinary two-way Git Extended Diff profile：Add / Update / Delete / Rename / Restructure、多 entry、Git pathname quoting。
- Patch只需要冻结 profile的 parser / exact application，不引入完整 Git repository、index、worktree或filesystem mutation stack；若新增第三方 diff parser依赖，必须证明它直接减少当前 parser风险并通过同一 license/security gate。
- 已有对象 target使用 canonical Ontology Ref；新增对象使用 `new:<kind>:<alias>`；`kg ontology patch` 只允许 Domain / Node Definition / Relationship Definition kind。
- 从空 Ontology 开始必须支持一个 Patch 同时 Add Domain、Node Definition、Relationship Definition，并让 Domain `includes`、Relationship `from/to`、共享 Index `targets` 等 Ref-typed slot引用同请求的新 alias；alias resolution基于整份声明图，与 entry文本顺序无关，合法 Domain cycle不因 alias图有环被误判为不可解析。
- Update/Delete/Rename必须基于 `baseState` canonical YAML exact apply；禁止 fuzzy hunk / offset apply。
- parser/apply后比较 base/target Object Value，只把真实变化 slots作为显式 delta；未改字段保持 context语义。
- 顶层 rename使用 Git Rename entry；Property rename使用 input-only `renameFrom`。
- strict `baseState` / target Branch head检查；stale返回 `STALE_BASE_STATE`，patch text mismatch返回 `PATCH_BASE_MISMATCH`。
- logical no-op在 strict head校验后返回原 State，不创建 transaction / Commit。
- 有效写入的 `author/message` 必须进入同一 `tx_begin` metadata并最终出现在唯一新 Commit；新增 alias的 `created` mapping与顶层 rename/replacement的 `transitions` 按 Object合同稳定排序返回。no-op即使携带 metadata也不额外创建 State。

### Feature 02.6 Schema / Constraint Compiler

- 把 Node / Relationship Definition 编译到 Lithograph versioned Graph Type / Constraint；不持久化第二份 KG OS Schema。
- 支持 Node identifying Label +附加 `labels`、Property type profile、`required`、`unique`、named/anonymous `unique | key` Constraint、关系 `from/to`（含 `null` 无端点限制）。存在性/type 只通过 Property `required/type` 表达；standalone `not_null/type` 按 D69 在编译前拒绝，不建立 shadow Schema。
- Node / Relationship Definition 都必须至少一个 Property；空定义在写入前返回 `INVALID_ARGUMENT`。
- anonymous standalone Constraint按当前 deterministic naming规则创建；已有 explicit name/config读取和未修改保留。
- compiler/decoder按当前 Schema来源区分 Graph Type field rule、standalone Constraint、Constraint-owned backing index与显式资源：Graph Type dependent type/required rule折回 Property字段；v0.3.0 Graph-Type-origin单字段 UNIQUE按 D71 exact generated-name mapping折回 `unique:true`；simple/explicit Constraint保留其真实声明来源。不能按 `graph_constraint_*` 前缀猜 source，也不能把 dependent rule重复输出为公共 `constraints`。
- UNIQUE/KEY等 Constraint-owned backing Index不得重复输出为公共 Index，也不能在修改/删除相邻显式 Index时误删；显式 standalone Constraint/Index的真实 name/config必须保留。
- 显式 Range Index 若与某条有效 UNIQUE/KEY（含 Property `unique:true`）拥有同 Definition + 同有序 properties，在 transaction 前返回 `OBJECT_CONFLICT`；Constraint / Index Schema name冲突同样前置诊断，不能依赖 DDL顺序或隐藏别名。
- 任何 immediate constraint / type / endpoint failure导致整个 explicit transaction rollback。

### Feature 02.7 Index Compiler

- 实现 `range | text | point | fulltext | vector` 公共 Index profile；公共 Index Value只有 `name/type/targets?/properties?`，不实现 `options` / `filterProperties` bag。
- Property-local单字段与 Definition-level复合/共享声明保持既有组织规则；共享资源按真实 Index name +完整 targets归并，只执行一次底层变化。
- Range支持一个或多个有序 Property；Text / Point恰好一个 Property；三者只作用于当前 Definition，不接受跨 Definition `targets`，也没有公开 per-index配置。
- Full-text / Managed Semantic允许同 kind 多 Definition共享 targets；Full-text允许多字段，Semantic继续只允许单个 `STRING` source Property。
- Full-text新建/必须重建时写当前 daemon analyzer与 `eventually_consistent=false`；已有未修改 index保留其 versioned analyzer，decoder不把 analyzer暴露为公共 Ontology field。
- `type: vector` 编译为 Lithograph Managed Semantic Index；只支持当前已确认的单 `STRING` source Property，不创建 embedding Property、不请求远端模型。
- Semantic新建/必须重建时按 Runtime合同把当前 `[embedding]` + `[cache]` 编译为 `provider=openai-compatible`、dimensions/similarity/providerConfig；`api_key_env` 只持久化变量名，不能把解析出的 secret写进 IndexDefinition/State/error；enabled cache path进入历史前必须已经解析为当前 `KG_HOME` 下的稳定 absolute path与max_bytes。
- 新建/改变 Semantic definition只做 Provider local validation；Provider cache、HNSW/materialization与 State mutation保持分离。
- unsupported hidden config、多字段 Semantic、非法 target/source/options不得被静默降级或截断。

### Feature 02.8 Rename / Delete / Dependency / Data Safety Planning

- Definition / Property rename保持 Binding identity连续，更新 Domain、Relationship endpoint、Constraint / Index引用和 Schema Locator。
- 若底层没有原生 rename，可在同一 explicit transaction中使用 staged replacement；需要时对已有 Knowledge Label / Property / Relationship Type执行 mandatory data rewrite。
- Property rewrite只作用于对应 Definition覆盖的数据；多 Definition overlap必须检查全部有效语义，不允许全图同名字段粗暴替换。
- 删除 Definition / Property不隐式删除 Knowledge。`kg ontology patch` 不能携带 Knowledge target，因此如果删除需要调用方显式删除/重构 Knowledge，本 Phase 的 Ontology-scoped入口必须拒绝；未来通用 Object Patch 才能在同一请求中显式处理两类 target。
- rename等由 Ontology目标本身必然派生的 Knowledge maintenance仍由 compiler自动完成；测试通过底层 fixture构造已有数据，证明 mandatory rewrite正确执行，而需要调用方额外选择的数据删除/重构则fail closed。
- Node Definition `labels` 增删、Relationship `from/to`、required/type/unique等模型约束变化不自动改写已有业务数据；已有 fixture不满足目标规则时 Ontology-scoped Patch必须拒绝，不能把“让数据符合模型”猜成隐式迁移。
- mixed shared-resource显式变化与derived maintenance冲突时整体 `OBJECT_CONFLICT`，不按 entry顺序“最后写入者获胜”。

### Feature 02.9 Authenticated HTTP 与 `kg ontology` CLI

- 在现有 `kgosd` single origin上接入 Ontology logical read、canonical Object body读取与 Ontology-scoped shared Patch adapter；`--edit` 仍只是 CLI输出选择，不创建 edit session或第二套 logical mutation API。HTTP route/method属于 adapter mapping，但不得改变已冻结 request/result/error语义。
- canonical Object body沿用 Object合同的 `Accept: application/yaml | application/json` / response `Content-Type`；唯一 canonical YAML renderer位于 Kernel/server侧。CLI `--edit` 取得服务器生成的 canonical body后只做单/多 Ref framing与all-or-nothing stdout，不从JSON重新实现第二套YAML renderer。
- 所有新增 data API统一执行 Bearer authentication，missing/malformed/wrong token均为 `AUTHENTICATION_FAILED` / HTTP 401，并使用 constant-time token comparison。
- 实现客户端 active endpoint discovery：从当前 `KG_HOME` 的 active lock owner取得 endpoint；不从修改后的 `config.toml` 猜运行中地址。
- `kg ontology [refs...] --at ...`、batch read、pagination、`--edit`、`kg ontology patch` 完整遵守 CLI 文档的 stdout/stderr/exit/input-source合同；`--edit --at` 只接受 resolved `commit/...`，Patch 的 `--base-state`同样必须是 immutable resolved State。
- CLI只从 `KG_TOKEN` 获取 credential，不读取 `auth.json`、不输出 token。
- 本 Phase只实现 Ontology 所需 transport/client shared primitive；不因此开放 Object/Graph/Evolution/daemon control命令。

### Feature 02.10 Integration Hardening 与 Review Closure

使用 disposable `KG_HOME` +真实 Lithograph v0.3.0 artifacts组合验收：

- first startup bootstrap → restart/reopen；
- empty / invalid / partial / non-adoptable database；
- Overview / Domain / Definition / batch / pagination / edit；
- Add / Update / Delete / Rename / Restructure / no-op / stale base；
- Graph Type / Constraint / Range / Full-text / Managed Semantic；
- shared resource / data rewrite / dependency conflict；
- auth / HTTP / CLI；
- cancellation / shutdown期间 active Ontology Patch cleanup；
- Phase 00/01完整质量门禁无回归。

## 6. Acceptance Matrix

| ID | 验收场景 | 判定 | 当前状态 |
| --- | --- | --- | --- |
| P2-01 | KG OS Bootstrap / Reopen | KG OS-valid `main` 可在存在其它/invalid历史 refs 时正常 reopen；非 valid `main` 只有 fresh Root baseline才可一次 explicit transaction产生首个 KG OS-valid State；bootstrap author/message为null且无State Data；已有 history不被误收编；空 Ontology无 sentinel/default Domain/Binding；失败零 partial Commit；restart不重复 bootstrap | 本地已验收；P2-12 待收口 |
| P2-02 | Internal Graph / Binding | D68 reserved Graph Type及其 dependent Schema来源精确匹配且不泄露为公共 Constraint；无额外 internal Index/standalone uniqueness resource；closed-profile校验拒绝 internal多余payload、internal↔Knowledge跨界边、internal-target Schema与重复边；Domain/Definition/Property Binding、唯一 owner edge、Schema Locator与双向 coverage一致；`includes`不接受 Property Binding target；startup/Ontology validation不全图扫描普通 Knowledge reserved-looking identifier | 本地已验收；P2-12 待收口 |
| P2-03 | Ontology Read | 空 Overview、Overview / Domain / Definition、无 Domain、多父级/cycle、同名不同 kind、description缺省提示、1..100 batch、State pin、pagination、历史 State hidden config保真且不受当前 runtime默认值重解释，以及错误边界符合设计 | 本地已验收；P2-12 待收口 |
| P2-04 | Canonical Serialization | Domain/Definition YAML/JSON round-trip、deterministic render、set-like重复拒绝/排序、batch edit all-or-nothing framing、空集合与String边界通过 | 本地已验收；P2-12 待收口 |
| P2-05 | Patch / Concurrency | Git Extended Diff Add/Update/Delete/Rename/Restructure、多 entry、canonical typed Ref percent-encoding + Git pathname quoting、从空 Ontology一次创建互相引用的 Domain/Node/Relationship/共享Index、order-independent alias与合法cycle、exact apply、strict base、no-op、author/message、created/transitions及result ordering通过 | 本地已验收；P2-12 待收口 |
| P2-06 | Schema / Constraint | Node identifying/additional labels、Relationship/Property、type/required/unique/from/to（含 null）、named/anonymous `unique/key` composite Constraint正反向 round-trip；standalone `not_null/type` 前置拒绝；Graph Type dependent rule不重复暴露，显式来源/name保留，failure整体rollback | 本地已验收；P2-12 待收口 |
| P2-07 | Index | Constraint-owned backing Index不冒充显式 Index；等价 explicit Range + UNIQUE/KEY backing 与跨 resource name冲突前置拒绝；composite Range、single-property Text/Point、multi-field/shared Full-text、single-field/shared Semantic的create/update/delete/读取回验通过；Full-text runtime analyzer与Semantic embedding/cache mapping按新建/重建边界写入并保留历史 hidden config，api_key secret不进State；Standard Index跨 Definition targets及公共 options/filterProperties被拒绝 | 本地已验收；P2-12 待收口 |
| P2-08 | Rename / Delete / Data Safety | Binding continuity、rename mandatory Knowledge rewrite、共享依赖；labels/from-to/required/type/unique及delete在需要调用方显式 Knowledge处理时拒绝；不自动增删Label/填值/迁边/删数据，无隐式数据损失与冲突诊断通过 | 本地已验收；P2-12 待收口 |
| P2-09 | Consistency Boundary | missing/duplicate/dangling Binding、unsupported Schema/config、direct low-level drift均不被高层伪装成合法 Ontology | 本地已验收；P2-12 待收口 |
| P2-10 | HTTP / Authentication | Ontology data routes使用统一 logical contract与Bearer auth；canonical body content negotiation复用唯一server renderer；401/错误映射/secret hygiene/取消通过 | 本地已验收；P2-12 待收口 |
| P2-11 | CLI Ontology | `kg ontology` / `--edit` / `patch` 的endpoint discovery、KG_TOKEN、resolved-State规则、stdout/stderr/exit、stdin/file与真实daemon E2E通过；CLI不重渲染canonical YAML | 本地已验收；P2-12 待收口 |
| P2-12 | Quality / CI / Review | 本地完整validation/fresh-source、Phase Review、final diff、最终 pushed SHA的Ubuntu 24.04 x64 native CI全部成功 | 本地已验收；仅最终 pushed SHA 的 Ubuntu 24.04 x64 native CI 待执行 |

## 7. 关键失败路径

- Bootstrap / reopen：valid `main` + invalid历史不应误阻塞；invalid `main` + 额外 Branch/Tag/history不得自动 bootstrap；existing non-KGOS database、partial reserved Schema、Root expectedHead mismatch、transaction failure、restart重复初始化。
- Binding / decoder：missing/duplicate/dangling Binding、wrong kind locator、reserved resource被误当调用方 Definition、unsupported raw Vector/public profile。
- Read：invalid/duplicate Ref、batch >100、cursor scope/state mismatch、Definition超资源上限、Branch移动导致跨 State拼接。
- Serialization/Patch：invalid YAML、unknown field、ambiguous target、Git path quoting错误、unsupported patch form、hunk mismatch、rename/header/body不一致、duplicate alias。
- Compiler：空 Definition、非法 type/endpoint、standalone `not_null/type`、duplicate rule、Constraint/Index name collision、等价 Range 与 UNIQUE/KEY backing冲突、shared resource冲突、immediate constraint failure。
- Search definitions：未知 Full-text analyzer、Semantic Provider/config invalid、multi-field Semantic、公共 `options/filterProperties`、Standard Index跨 Definition targets、已有 hidden config无法安全 round-trip。
- Data safety：rename目标已有值冲突、数据不满足新 required/unique/type/endpoint规则、删除仍有数据或共享依赖；Ontology-scoped入口不得借机开放任意 Knowledge mutation，不得填默认值、cascade delete或留下中间 durable State。
- Concurrency：stale base、tx begin失败、任一 staged execution/cancel/error必须fail closed；所有失败路径验证 target Branch head / Commit count无本次 partial变化，不自动rebase/merge/retry未知write。
- HTTP/CLI：missing/wrong token、active lock无 endpoint、stale lock、daemon unavailable、transport failure、stdout partial leakage、secret回显。

## 8. 验证计划

```text
targeted bootstrap / consistency unit + native integration
targeted decoder / canonical serialization
targeted Git patch parse / exact apply / logical delta
targeted Graph Type / Constraint / Index compiler
targeted Full-text / Semantic real-extension integration
targeted rename / delete / seeded Knowledge data-safety
targeted HTTP auth / logical adapter
targeted kg ontology CLI E2E
        ↓
pnpm check:quick
pnpm validate
fresh-source setup + full validation
forced pre-commit
git diff --check
final Phase review
Ubuntu 24.04 x64 GitHub Actions on final pushed SHA
```

真实数据库场景必须使用 disposable `KG_HOME` 与当前 Lithograph v0.3.0 release artifact；不能用 mock Schema/Binding store替代 Phase acceptance。

## 9. Review 重点

- 是否把 KG OS Ontology误实现为第二份持久 Schema，而不是 Lithograph Schema + internal semantic graph；
- 是否把 Property / Constraint / Index重新升级为要求调用方逐个CRUD的顶层资源；
- 是否误把 Domain当 namespace、Schema scope、权限或强 tree；
- bootstrap是否只接受 fresh Root baseline或已有效 KG OS database，并严格一个 explicit transaction；
- Binding coverage / Schema Locator 是否双向、Snapshot-scoped且保持 rename continuity；
- decoder是否保留真实 Schema/Constraint/Index来源与配置，还是用当前 runtime/default覆盖历史；
- canonical YAML 与 logical Object Value是否稳定 round-trip；
- Patch是否 exact、strict-base、logical-delta，而不是 fuzzy apply或full PUT；
- compiler是否复用 Lithograph public Cypher/Schema/transaction，不读写内部SQLite table；
- Full-text / Semantic是否继续使用当前隐藏配置和Provider-owned cache边界，不恢复旧managed vector Property；
- Index profile是否严格遵守 D67：Range/Text/Point本地 target且无公共 options，只有 Full-text/Semantic可多 target，公共 shape不出现 filterProperties；
- rename/delete是否保持无隐式数据损失，是否错误扩大成公共 Knowledge CRUD；
- authenticated HTTP / CLI是否只实现 Ontology所需最小 surface，没有顺手实现Graph/Evolution/SDK/Web/Skill/daemon control；
- 是否为了后续 Phase提前增加 generic repository、storage backend、schema registry、codegen或新依赖抽象。

## 10. 完成条件

Phase 02 只有在以下条件全部满足后才能标记 `done`：

1. P2-01–P2-12 全部取得真实证据；
2. Scope 内 Ontology 能力可通过正式 `kgosd` + `kg ontology` 使用，不依赖 test-only入口；
3. 所有 public Ontology mutation都保持 single-State / all-or-nothing / strict-base合同；
4. Bootstrap、Binding、Schema、Constraint、Index、Full-text、Semantic、rename/delete与有数据失败路径都有真实 Lithograph integration验证；
5. Phase Review finding闭环，设计/README/开发计划/开发指南/vlog按职责同步；
6. 本地完整 validation、fresh-source、forced pre-commit与final diff通过；
7. 最终推送 SHA的 Ubuntu 24.04 x64 native CGO CI成功。

Commit、push、发布和部署仍是独立动作；计划写入本身不代表任何实现或验收已经发生。

## 11. 当前状态

2026-09-22 Phase 02 已进入 `in_progress`。当前未提交工作树已实现 bootstrap / KG OS-valid State validation、reserved internal graph / Binding、Ontology decoder/read、canonical YAML/JSON、Git exact Patch、Schema/Constraint/Index compiler、rename/delete data-safety、authenticated HTTP 与 `kg ontology` CLI，并已通过真实 Lithograph v0.3.0 macOS arm64 native vertical-slice：create/read/reopen、strict stale base/no-op metadata、Binding continuity + Knowledge rename rewrite、delete fail-closed、Constraint/Index profile、direct Binding drift、真实 daemon + CLI auth/transport。

实现 review 期间用真实 Lithograph v0.3.0 发现并按 D69 修正两个原计划的不可表示映射：identifying Graph Type 上不能稳定承载 named standalone `not_null/type`，以及 UNIQUE/KEY backing Range 不能与等价独立 Range共存。对应公共输入现在必须在 KG OS transaction 前明确拒绝，而不是建立第二份 Schema/name metadata 或依赖底层 DDL失败。

2026-09-23 本地实现与 Review 已收口：P2-01–P2-11 全部取得本地真实验收证据；主工作树完整 `pnpm validate` 通过，Go race / govulncheck / 90% coverage gate通过，最终 Go statement coverage为 90.1%；TypeScript/V8 coverage与type coverage均为100%；jscpd zero-duplicate、Playwright、真实 Lithograph v0.3.0 native suite、package/license/audit/diff gates全部通过。独立 fresh-source从空 `node_modules` / cache / artifact执行 `pnpm run setup` 与完整 `pnpm validate` 通过；forced Lefthook pre-commit与 `git diff --check` 通过。Review期间清理了旧空 `internal/kernel/kernel.go` 占位、不可达 Patch result marshal错误分支与两处重复生产代码，并补齐 CLI adapter / decoder / canonicalization边界测试；当前范围没有剩余本地 finding。

P2-12 仍要求**最终 pushed SHA**的 Ubuntu 24.04 x64 native CGO CI成功。本次用户尚未授权 commit/push，因此该远端证据未执行，Phase 02继续保持 `in_progress`，不能标记为 `done`。
