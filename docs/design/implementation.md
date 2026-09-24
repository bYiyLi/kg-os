# 工程映射与实现约束

本文件记录已确认设计的实现约束、readiness、compiler / adapter mapping 与集成验收，不维护开发阶段顺序、状态或执行证据。开发阶段与状态见[开发计划](../development/README.md)，本地操作步骤见[开发指南](../guide/development.md)。产品合同仍由 [Ontology](ontology.md)、[Object](object.md)、[Graph](graph.md)、[Evolution](evolution.md) 和 [Runtime](runtime.md)维护。

## 剩余依赖与工程合同

Ontology 已确认渐进式读取与 Domain/Definition aggregate 编辑；不能因为仍需实现 compiler，就把它退回“模型尚未设计”或要求 AI 操作单独的 Property/Constraint/Index。逻辑字段和行为只在各 owner 文档维护。

[模型修改](ontology.md#patch-到真实变化)、[批量 Object Patch](object.md#object-公共调用合同)与 [Merge Session](evolution.md#evolution-公共调用合同)的产品规则已经确定，剩余工作是 compiler、业务 projection、冲突映射与公共 surface 的实现和验证。Phase 01 已为[只读 / 读写 connection、Provider-owned cache mapping、SQL streaming、cancellation 与 explicit transaction](#managed-semantic-integration-readiness)建立真实 Go adapter 和 native integration 基线；后续业务实现必须复用这些 primitive，而不是再建立第二套数据库 host。这些工程待办不表示需要重新确认对应核心设计；Web 页面细化单独见 [Runtime](runtime.md#web-交互设计状态)。

| 已确认的合同 | 工程工作 |
| --- | --- |
| Ontology Overview → 可选 Domain → Definition，无 search；1..100 Ref batch read | 单次 State pin、输入顺序、per-Domain cursor、batch all-or-nothing、描述缺省提示与有界图预览 |
| Node/Relationship 聚合 Property、required/unique、Constraint/Index | 从公开 Graph Type/SHOW 与 semantic graph 反向构建逻辑值；存在性/类型由 Property `required/type` 表达，standalone Constraint 只保留可真实命名 round-trip 的 `unique/key`；编译到数据库，不建立 owner-only 公共 structure AST |
| Domain/Definition canonical YAML + 唯一 Object Patch | 标准 YAML/Git parser、exact apply、input-only renameFrom、语义差异、共享资源去重和冲突定位 |
| 单 State、strict base、无隐式数据损失 | 复用已验收的 SQL explicit-transaction adapter；实现并验证 DDL/DML 顺序、即时约束、引用改写、Knowledge data rewrite 与 index maintenance |
| Binding / Object Graph View / reserved identifier | 空库 bootstrap、Object / Ontology 的双向覆盖与内部数据投影校验；不作为公共 Graph Cypher 的执行条件 |
| D68 reserved Ontology Schema | bootstrap 精确创建三类 internal Node Graph Type 与两类 internal Relationship Type；三类 Node imply `__kgos_internal`；`property_of` 精确 Property Binding → Definition Binding，`includes` 底层 Domain → `__kgos_internal` 并由 consistency 收紧 target union；不额外创建 sentinel、standalone internal UNIQUE/KEY 或 Index；Graph Type 自动派生 Constraint/backing资源按公开 origin/classification归属 internal Schema，不按名称前缀误投影成调用方资源 |
| Internal closed profile | consistency scan以 Schema introspection + `__kgos_internal` marker集合 + incident Relationships 为边界，拒绝 unclassified/multi-class marker Node、internal endpoint上的非法/cross-boundary Relationship、额外 internal payload、Property Binding owner edge缺失/重复、重复 Domain membership edge，以及任何未由 D68 Graph Type派生的 internal-target standalone Constraint/Index；不全图扫描 marker subgraph之外的普通 Knowledge寻找 reserved-looking Label/Type/Property，也不能靠 decoder过滤隐藏 internal 多余状态 |
| 通用 SQLite Extension startup runtime | Phase 01 已完成 resolver、content-addressed cache、ordered per-connection load 与 Lithograph capability validation；后续 bootstrap / 业务代码直接复用，不按插件用途重建 loader |
| 初始化 Full-text analyzer + 简化 Ontology | `type: fulltext` 只编译业务 targets/properties；`kg install` 必须显式取得 `[fulltext].analyzer` 并提示初始化后禁止修改；新建/业务重建时写当前 analyzer + `eventually_consistent=false`，已有 versioned analyzer 保留；不做 config fingerprint / migration |
| Lithograph Managed Semantic + 简化 Ontology | Phase 01 已完成 Provider extension 装配、startup readiness与连接基线；`kg install` 必须显式取得完整 `[embedding]` 与始终启用的 `[cache].path/max_size_mb`，后续 Ontology compiler 生成 versioned IndexDefinition / providerConfig，Graph 公共 surface 直接使用 String query；不实现 embedding HTTP client、Provider cache内部逻辑、向量 Property或写入/合并刷新 |
| Evolution 统一历史与 Merge Session | Definition 内字段级历史；shared resource 单次 conflict 投影；固定 revision 的 candidate 检查 |
| CLI / SDK / Web 共享合同 | `KG_HOME` target discovery、Bearer authentication / `AUTHENTICATION_FAILED` mapping、本机 CLI `KG_TOKEN -> auth.json` credential resolution、`doctor/install`、业务 Runtime ensure、ontology batch Markdown、batch --edit YAML multi-document stream、ontology scoped patch、Object batch read / patch、Graph NDJSON、HTTP metadata 与错误映射 |

### Ontology compiler / decoder

实现先从目标 State 的公开 Schema 与 metadata 得到完整源信息，再建立本次操作的 source mapping，区分字段自带规则、具名约束、derived backing index 和独立显式索引。该映射是 operation-local 工程数据，不是新的公共结构、不作为第二份 Schema 持久化。

反向读取必须保留真实的 index/constraint name、target、字段顺序、类型、端点语义及配置。相同公共值能通过多种底层 DDL 实现，不要求 AST/资源数量一一对应；但不能把另一种 coverage、复合约束或多目标索引简化成语义不同的 Boolean。

Lithograph v0.3.0 的 identifying Graph Type 上，Property type / required 是 origin-dependent Constraint；独立 `not_null/type` Constraint不能合法指向同一 identifying Label / Relationship Type，因此 KG OS 不创建只为保存名称的 shadow metadata。Standalone public Constraint 只编译 `unique/key`。Graph-Type-origin 与 standalone `UNIQUE/KEY` 在 v0.3.0 `SHOW CONSTRAINTS` 中都属于 `undesignated`，AS GRAPH virtual constraints 也混合两类来源；decoder 因此按 [D71](decisions.md#d71-lithograph-generated-constraint-identity) 复现 frozen exact automatic-name mapping，而不以 `graph_constraint_*` 前缀猜 source。单 Property Graph-Type UNIQUE 折回 `Property.unique=true`；当前 KG OS compiler 不生成 Graph-Type KEY / composite UNIQUE。`unique/key` 同时拥有 backing Range Index；若公共目标又声明同 Definition + 同有序 properties 的独立 Range Index，planner 在 transaction 前返回 `OBJECT_CONFLICT`，不依赖 DDL 执行顺序解决资源冲突。

正向编译先比较公共逻辑变化，再保留未修改的来源与配置，计算必需的底层变动。一次 Node/Relationship Patch 可同时改变 Schema、Constraint、Index 和 Binding；shared resource 使用一个规范化变化计划。新建时源映射为空，按 ontology.md 的命名/默认规则选择最小合法计划。不能靠临时 UUID、公共 owner registry 或 raw Schema escape hatch 填补 mapping。

公开 type/required/from/to 能力由 Lithograph Schema/Constraint 实际执行，KG OS 做的是输入、依赖与编排校验，不实现另一套数据库运行时约束引擎。

### Mutation planning

执行链路复用 Object contract：parse → exact apply → 公共值 → explicit delta → shared-resource normalization → derived reference / maintenance → conflict/dependency check → SQL `lithograph_tx_begin(options_json)`（其中 `branch=targetBranch`、`expectedHead=baseState`）→ 同一 connection 上用普通 `lithograph()` / 必要时 `lithograph_rows()` 执行标准 Cypher → SQL `lithograph_tx_commit()`。active transaction 内普通 execution 自动加入同一 staged state，不存在 `lithograph_tx_execute()`。具体参数与 connection 边界见 [Runtime 调用入口](runtime.md#lithograph-调用入口)。

实现必须证明中间每条 statement 符合 Lithograph immediate semantics，不能只比较最终 Schema。对合法上层目标可采用同 transaction 内受控 drop/recreate 或先改写受影响数据再施加约束；语义保持要求仍由公共合同约束。新 alias result capture、顶层 Ref transition 与 Property Binding continuity 都在这一个边界内完成。Semantic source 写入不做 embedding；Semantic definition 新建 / 改变只执行本地 Provider/config validation，因此 Patch 不再需要在 writer 外预计算向量再回填内部 Property。

### Adapter 与运行时

Ontology batch read 与通用 Object batch read 都必须在 daemon/kernel 层先解析一次 State，再读取全部 refs；adapter 不能通过循环读取 `branch/...` 模拟 batch，否则 Branch 移动会产生跨 State 结果。Object read 1..100 Ref、重复 Ref拒绝、输入顺序、all-or-nothing与响应资源上限在共享 read primitive执行；CLI positional/file/stdin 只负责形成同一个 refs 数组。Batch editable output 要先取得并验证全部 Object Value，再用共享 canonical renderer一次性写 stdout；任一失败不得留下半个 stream。multi-document marker/comment 只属于 CLI framing。`ontology patch` 与 `object patch` 只有一套 request/result/compiler，前者只做 kind scope validation。不得让 CLI、Web、SDK 对缺失字段、删除、rename、shared resource、baseState 产生不同解释。Knowledge discovery / 条件查询保持 Graph Cypher，不通过 Object list/search建立第二条发现路径。

Phase 04 的通用 HTTP adapter mapping 固定为：

```text
POST /api/v1/object/read
  request  = { at, refs[] }
  response = ObjectReadResult

POST /api/v1/object/patch
  request  = PatchRequest
  response = PatchResult
```

两个 route 都使用现有 Bearer authentication、JSON request limit、public error envelope 与 request `context.Context`。read route一次把完整 `refs[]` 交给 Kernel；CLI 的 YAML / raw JSON body presentation在客户端使用同仓库共享 Object renderer处理 daemon 返回的 Object Value，不得为每个 Ref重新请求 daemon。现有 Ontology read/edit/patch surface 继续保持 Phase 02 已验收行为；实现可以让它们复用新的共享 read / patch primitive，但本 Phase 不以新增通用 Object route 为理由删除或改变既有 Ontology route / CLI 行为。

共享 Object Patch 的实现可以先交付 Ontology-scoped adapter，再在后续能力中开放 Knowledge Object adapter；这不允许建立第二套 parser、logical delta、transaction 或 concurrency semantics。Ontology-scoped 实现仍必须支持模型变化必需的 derived Knowledge maintenance，例如 Definition / Property rename 对已有 Label / Property / Relationship Type 的安全 rewrite，以及新增 Constraint 前对已有数据的真实验证；但它不因此开放调用方任意 Knowledge CRUD。

**`kgosd` runtime implementation**：`kgosd`、Kernel 与 `kg` CLI 使用 Go，SDK / Web 使用 TypeScript。Web 构建产物随 daemon 交付，由同一进程与端口提供页面和 API。v1 已确认 IPv4 HTTP、`KG_HOME` profile、根目录 `kgos.db` 单库、persistent `auth.json` 与 Bearer authentication；普通用户不管理 daemon，Go CLI 负责 `doctor/install` 与业务 Runtime ensure。SQLite host 使用 `database/sql` + `go-sqlite3`，按统一 resolver 装配 Lithograph、OpenAI-compatible Provider 和其它扩展。

SQLite Extension resolver 先把全部 configured source 固定为 daemon-local immutable artifacts：local/HTTPS input、remote mandatory SHA-256、HTTPS-only redirect、direct library/archive 分支、`library` exact member、required explicit `entrypoint`、safe extraction 与 content-addressed cache 都必须在 database connection 进入可用生命周期前完成。Go host 注册 process-private `go-sqlite3` driver / connection hook；每个物理 connection 按 config order逐项调用接受显式 `(library, entrypoint)` 的 public extension loader，不能使用 driver 的 filename-derived bulk extension列表打乱混合 entrypoint语义。extension loading只在 connection initialization window开启；任一 load失败拒绝该 connection。配置本身不标记 `kind=lithograph`。按 [Runtime](runtime.md#sqlite-extension-source-resolver)验证目标 connection 的 Lithograph v0.3.0 public SQL与 Provider registration capability。实现不能把下载放到 connection checkout热路径、不能让不同 connection因 source更新加载不同 binary、不能实例化第二套 private SQLite，也不能通过业务 SQL/Cypher暴露任意 extension loading；不再绑定 application-facing Native query ABI或要求 driver暴露 `sqlite3*`。

Full-text runtime 在 extension load 后对当前 `[fulltext].analyzer` 做 connection-local FTS5 probe。Ontology compiler 对新建或业务定义变化后必须重建的 KG OS-managed `type: fulltext` 生成当前 analyzer 与 `eventually_consistent=false`；已有 IndexDefinition 未被本次业务 Patch 触碰时保留其实际 versioned analyzer。Decoder 有意不把 analyzer 暴露到公共 Ontology。安装层把 analyzer 标为初始化后禁止修改；实现不维护 fulltext fingerprint/generation、不比较历史配置，也不因为当前文件变化迁移已有 State。

Embedding compiler校验当前 `[embedding]`，按 [Runtime 映射](runtime.md#embedding-配置与索引映射)生成 `provider: openai-compatible`、versioned providerConfig与 index dimensions/similarity。只接受 `api_key_env`，将变量名而非 secret写入配置；明确 `send_dimensions=false`与 `encoding_format=float`。Schema创建使用 `db.index.semantic.createNodeIndex/createRelationshipIndex`，Graph检索使用普通 String + `queryNodes/queryRelationships`。daemon startup对当前显式配置使用同一 create语义在独占 write connection里做 staged create + `tx_abort` probe，只触发 Provider local `validate`，不发 embedding request且不得留下 Commit/Schema。KG OS不实现 HTTP、batching、source framing、`SemanticText`预处理或第二套 Cypher parser。

`[cache].path/max_size_mb` 必须显式配置，cache 始终启用；compiler 固定写入 `providerConfig.cache.enabled=true`，并与完整 `[embedding]` 一起编译进新建 / 必须重建 Semantic Index 的 OpenAI-compatible `providerConfig`。Provider 自己维护独立 SQLite cache；KG OS 不读写 cache schema，也不提供预热入口。真实只读 `kgos.db` query + Provider cache 的跨连接 / 重启复用必须通过集成测试证明。

`[fulltext]` / `[embedding]` 在安装时明确标为初始化后禁止修改。实现只读取当前 startup config，不保存初始化副本、不检测文件变化、不阻止人工修改、不批量迁移历史或增加 `migrating` daemon 状态；已有索引仍保留真实 versioned 配置，历史查询使用目标 Snapshot 的 IndexDefinition。

### Go 运行时与数据库接入

语言与交付边界已由 [Architecture](architecture.md#v1-运行时与技术分层)及 [Runtime](runtime.md#web-hosting)确定；以下是工程工作，不要求重新确认 Go / TypeScript 分工或 Web 是否独立部署：

Phase 01 已实现并验收数据库/runtime foundation；Phase 02 已在其上完成 Knowledge Base bootstrap、公共 Bearer middleware 与 Ontology HTTP/CLI；Phase 03 已完成 installer / doctor / i18n / 本机 credential fallback 与业务命令 auto-start；Phase 04 已完成通用 Object batch read / patch；Phase 05 已完成 Graph public HTTP / NDJSON framing / client-disconnect 与正式 `kg graph query/execute`；Phase 06 已完成 Evolution Core 的 State/ref、History/Diff、HTTP 与正式 `kg evolution` Core CLI，并通过 public E2E 与远端验收。Merge 与完整 SDK/Web 业务 surface仍属于后续能力。

1. **Go SQLite driver / adapter**：使用 `database/sql` + `github.com/mattn/go-sqlite3` bundled SQLite；固定 CGO build启用 `sqlite_fts5`，不使用 `libsqlite3`，不启用 `sqlite_omit_load_extension`。运行时仍实际验证 SQLite >= 3.45、FTS5、ordered explicit-entrypoint extension loading、只读 / 读写 connection、参数 / 错误映射与连接清理。每个物理 connection按 startup-resolved artifact set加载同一批 extensions；不绑定 Native query ABI、不暴露 `sqlite3*`、不建立第二套 SQLite runtime。
2. **SQL execution 与 explicit transaction**：普通完整结果使用 `lithograph()`，streaming 使用 `lithograph_rows()`；Object Patch 等多 execution 单 Commit 使用 `lithograph_tx_begin -> lithograph()/lithograph_rows()* -> commit/abort`。验证 expectedHead、staged visibility、single Commit、empty delta、失败自动 abort 与 connection exclusive ownership，不复制 Lithograph transaction state machine。
3. **执行、streaming 与 cancellation**：Graph streaming必须逐 event消费 `lithograph_rows()`，每个 event完成 NDJSON write + flush后才能拉取下一行，不能用无界 goroutine/channel预读或先收集完整结果。第一个 event准备完成前不得提前提交 2xx；pre-event failure使用普通 non-2xx JSON error，开始后 daemon failure使用 terminal `error` event，transport断开导致 terminal event不可达时由 client按 incomplete transport处理。HTTP request / daemon shutdown的 `context.Context`要通过 driver真实触发 SQLite interrupt，验证普通长查询、Semantic Provider wait、write stream、`IN TRANSACTIONS`、early close、client disconnect与 result-delivery failure的底层语义；不能用进程 kill / IPC代替正常 query cancellation。Semantic Provider wait 的验收服从 Lithograph/OpenAI-compatible Provider 已冻结合同：取消在 Provider callback checkpoint 生效，但正在阻塞的单次 HTTP system call 只由 versioned `timeout_ms` 限定，KG OS 不覆盖 timeout 或建立额外抢占线程。
4. **内置 Web**：Web 使用 React/Vite/TypeScript 构建，产物进入 `kgosd` 交付物并由 Go `net/http` 同端口提供；验证页面、静态资源和已认证 API 使用同一 configured origin，停止 daemon 后不存在独立 Web 服务。开发 HMR 的具体宿主方式属于 Phase 00 工程实现，不改变单 daemon 产品边界。

Go 与 TypeScript client 不共享服务端源码。公共 request/result/error contract 通过既有设计和跨语言 integration/fixture 验证保持一致；当前没有需求建立 OpenAPI/codegen/schema-registry 作为新的真源。

### Managed Semantic integration readiness

采用 Phase 13 后，旧方案中的 managed Property 隔离、mutation/merge 向量刷新、writer 外预计算向量再提交，不再是 KG OS 的实现前置条件。embedding 不属于图属性或 Commit，纯业务写入不访问模型服务。

本轮已确认 Graph 不审查 Cypher 内容；旧的 procedure 白名单、Graph caller-owned Vector / reserved identifier 提交前检查不再是实现前置条件。Phase 01 已用真实 Go driver + Lithograph v0.3.0 release artifact 验证 read/write connection、StateRef pin / Branch checkout、Provider staged readiness、Provider-owned cache mapping、`lithograph_rows()` true streaming、`context.Context` cancellation 与 explicit transaction；这些不再是缺失的 Go adapter。

公共 Graph surface 必须持续端到端保持以下不变量；Phase 05 已在完成基线建立 public E2E 证据，后续修改不能用 Phase 01 的 host-level 证据替代公共 request/response 合同：

1. **公共读写入口与认证**：Graph `query` / `execute` 通过已验收 adapter 建立 StateRef pin / Branch checkout，公共 HTTP route 统一执行 Bearer authentication，不增加 raw SQL、procedure 白名单或自动换 connection 重试。
2. **原样 Cypher 与值/错误映射**：公共 Graph 不附加排除内部节点的 `graphView`，完整传递 Lithograph JSON value、底层 error 与调用方显式 execution options；用户 Cypher 改变 checkout 后，下一 operation 必须重新建立自身 context。
3. **HTTP streaming 与 transport failure**：把底层 `columns -> row* -> summary` 映射为 NDJSON，逐 event write + flush 后再拉取下一行；验证 pre-event failure、terminal `error`、client disconnect、socket/write failure、incomplete stream 与 request-context cancellation，不把 transport failure 或 transaction-subquery partial durability伪装成全量 rollback。
4. **Semantic public path**：通过只读 Graph request 执行真实 Semantic query，证明 Provider cache 只写独立 cache database、跨 connection / restart 复用不改变 graph/schema/history/ref，并保持历史 IndexDefinition 的 provider/config。

Ontology 首版只实现单字段语义索引，联合检索沿用 Lithograph；公共 Index 不暴露 `filterProperties`，post-YIELD 过滤与过滤范围内 top-k 的实际边界见 [owner 范围](ontology.md#语义索引的首版范围)。不增加底层不存在的过滤接口；缓存自动填充已经确认，不再列为需要用户设计的预热入口。

`KG_HOME`、单库、认证和通用 extension loader 的已确认边界保持；Object / Ontology / Evolution 的高层一致性校验保留，不能把它们重新挂到 Graph 透传路径。

## 实现范围映射

实现前检查 Lithograph 实际文件与测试，不复制它的 Phase 状态为 KG OS 真源。当前可复用基线来自已完成的 Phase 00–06；实际阶段状态仍由[开发计划](../development/README.md)维护。以下内容只映射已确认设计产生的业务范围以及后续必须复用的基础 primitive，不在本文件维护阶段顺序或完成证据。

- **Runtime / SQLite host**：Phase 01 已实现 `KG_HOME`、`auth.json` credential lifecycle、根目录 `kgos.db`、统一 extension resolver / per-connection loading、Lithograph v0.3.0 SQL execution/transaction、read/write connection、streaming/cancellation、Managed Semantic Provider readiness、lock 与 shutdown；Phase 02 已完成 empty-database bootstrap 与 authenticated Ontology routes；Phase 03 已完成 install / doctor /完整显式 config / credential fallback / business-command Runtime ensure 与 distribution artifact discovery；Phase 04 Object routes继续复用同一 `net/http` server、认证、Runtime ensure 与 explicit transaction。阶段状态与远端门禁仍由开发计划维护。
- **Ontology storage mapping**：实现 semantic graph、Binding coverage、Schema Locator 与 Object / Ontology Graph View；高层 Object / Ontology 输入保留 reserved identifier 校验，公共 Graph 不复用该限制。
- **Reserved Ontology Schema**：按 D68 建立最小 Graph Type profile；Graph Type 负责 internal Node marker、字段 type/required 与基础 endpoint legality，KG OS consistency validation 负责 kind 枚举、name uniqueness、Binding coverage 和 `includes` 的 Domain-or-Definition target，不增加第二套 Schema/constraint engine。
- **Object representation**：实现五种公共 Object Ref、aggregate decoder 与 Knowledge 原生 Object value；canonical YAML / JSON 省略空的顶层 `indexes`，保留非空复合 / 共享索引。
- **Read paths**：Ontology read 的全局 / Domain / Definition 展开与 1..100 Ref batch已进入 Phase 02；Phase 04 通用 Object read已复用同一模型，实现1..100明确 Ref、一次 resolved State pin、输入顺序和all-or-nothing，覆盖 Domain / Definition / Knowledge Node / Knowledge Relationship。Object不提供 list/search；Knowledge发现交给 Graph。
- **Mutation compiler**：Phase 02 已实现 Ontology-scoped共享 Object Patch compiler；Phase 04 已在同一 parser / logical delta / explicit transaction上开放 Knowledge Node / Relationship create/update/delete/restructure、request-local alias、Ref transition 与 Ontology+Knowledge多 Object原子 Patch，没有第二套 CRUD 或单独 Schema resource API。
- **Graph execution**：复用 Phase 01 已有 query / execute adapter，已完成公共 Graph HTTP contract、Bearer middleware、NDJSON framing、transport cancellation 及 client integration，并通过 public end-to-end 验收；继续原样传递 Cypher 与 Lithograph JSON 值，不设 procedure、Vector 或 reserved identifier 检查。
- **Evolution Core**：Phase 06 实现 overview/get/ancestry、State / State Data、Branch / Tag、History / Diff；复用 Lithograph Version Procedure 与现有 Object/Snapshot decoder，把底层 graph/schema slot 投影成公共 aggregate Change，不建立第二套版本存储、History index 或 State identity。普通 Version/ref operation继续使用各自 autocommit lifecycle；`state.create` 按 [D74](decisions.md#d74-evolution-state-create-writer-boundary) 仅为一个 `commit.create([data])` 建立短 caller-owned SQLite writer boundary，在同一 write connection 上锁定并复核已校验 parent、执行唯一 Version Procedure、核对 parent并提交/失败回滚。它不组合多个 Commit、不承载 Object/Graph mutation，也不引入 hidden checkout。
- **Merge**：后续独立阶段实现 Merge Session 的 public conflict projection、渐进 resolution、固定 candidate revision 一致性检查与 finalize；不并入 Phase 06。
- **Client surfaces**：Go `kg` 已具备 doctor / install / Runtime ensure、Ontology、Phase 04 Object read/patch、Phase 05 Graph query/execute 与 Phase 06 Evolution Core。TypeScript SDK / Web继续消费同一 HTTP contract；Web 页面构建产物继续由同一 `kgosd` 交付，后续提供 Skill / SDK / Web 使用文档。

Web 还需细化页面布局、导航与具体操作交互，状态由 [Runtime](runtime.md#web-交互设计状态)记录。页面细化是同一产品的前端工作，不产生单独部署的 Web 服务，也不是上面 Kernel、daemon、CLI 或 SDK 开工的前置条件；当前文档不把尚未细化的页面标为已设计完成。

## Ontology 专项验收

下表是**后续实现需要运行的验收场景**，不是本次已通过的运行测试。设计文档的文本/示例校验另记开发日志。

| 场景 | 必须证明的结果 |
| --- | --- |
| 无 Domain；多个 Domain；多父级；cycle | 每个 Definition 从全局可达，单次响应有界，不递归爆炸、不强制建 Domain |
| 说明缺失、同名不同 kind | 明确缺省提示、typed Ref 消歧，不猜业务语义，不自动添加 search |
| Root/Domain 大集合 | total/cursor 与 State 一致，无静默截断；Overview 不可写 |
| 多 Ref batch read | 1..100 个 Domain/Definition 只解析一次 State，按请求顺序返回；重复/缺失/invalid ref 或整体资源超限时不返回 partial success |
| batch Domain pagination | limit 对各 Domain 独立生效，各自 cursor 可用同一 resolved State + 单 Ref 继续；多 Ref 请求不能提交单个 cursor |
| Definition 普通 read 与 --edit | 阅读有真实查询信息；编辑正文与 Object read canonical YAML 相同 |
| Definition 至少一个字段 | Node / Relationship Definition 的空 properties，或删除最后一个字段后仍保留类型的 Patch，在编译前返回 INVALID_ARGUMENT；不自动补字段，不把声明字段等同于实例必填，不把该检查施加到公共 Graph |
| 标准 YAML 无损往返 | 使用标准兼容的 YAML 1.2 parser / renderer，以原始逻辑值验证 parse(render(value)) 相等；覆盖 duplicate key拒绝、anchors/aliases有界展开、行首/行内/行尾空格、普通多行、空字符串、纯空白/换行、CR/LF、转义字符与 Unicode，并验证相同值输出确定；YAML 格式缩进不作为 String 内容比较 |
| 顶层 indexes 可选 | 缺省与 [] 逻辑等价且 canonical 均省略；空数组规范化不产生 Commit；非空复合/共享索引不丢失 |
| set-like collection | `labels/includes/targets` 重复项在 logical parse/validation阶段拒绝；canonical按 UTF-8 bytes 排序；不得静默去重导致底层/公共值漂移 |
| 多 Ref batch --edit | 输出是合法 YAML 1.2 multi-document stream；每个 document body 与单独 canonical YAML 逐字一致，顺序与请求一致；state/ref framing 不进入 Object Value / Git hunk；任一目标失败时 stdout 为空 |
| ontology patch scope | 多 Definition/Domain Patch 与 object patch 得到相同 Ontology 结果；出现 Knowledge target 时在执行前整体拒绝；不建立第二 transaction/compiler |
| Document 新建及全文/语义索引 | aggregate 只声明业务 source fields；不出现 caller-managed embedding Property/model/dimension，真实 fulltext/semantic Index name 均可查询 |
| SQLite extension local source | absolute direct library 可解析到 content-addressed cache；启动期间 source 被替换后，本进程后续 connection 仍加载启动时固定的同一 artifact |
| KG_HOME default / override | 未设置 `KG_HOME` 时使用 `~/.kgosd`；设置两个不同 absolute profile 时 config/auth/lock/cache/extensions/log/kgos.db 全部隔离，每个 profile 只打开自己的根目录 `kgos.db`，没有 `data/` 中间目录和单-daemon多库 selector |
| Embedding cache explicit config | `[cache].path/max_size_mb` 都必须显式存在，compiler 固定写入 enabled=true；relative path解析到 `KG_HOME` 后进入 versioned providerConfig，不存在 disable/skip 或缺失字段默认 |
| Embedding cache eviction/recovery | 使用 OpenAI-compatible Provider 自己的独立 SQLite cache/FIFO/recovery；普通 query/source miss 由 Provider透明命中/填充；KG OS/Lithograph main 不拥有 cache table，删除 cache只影响后续外部调用成本 |
| 只读 query 与缓存 | 真实 Go adapter 使用物理只读 `kgos.db` 拒绝业务写入，同时 Semantic read 可由 Provider写独立 cache；验证跨 connection / restart复用且 Lithograph main graph/schema/history/ref不变 |
| Auth first startup / restart | 新 profile 缺 `auth.json` 时安全随机生成并原子写入；restart token 保持不变；malformed/unreadable auth file fail closed，不静默 rotate；secret 不进入日志/错误/State |
| Daemon HTTP authentication | API 缺失、malformed、错误 Bearer token 都得到 `401 + AUTHENTICATION_FAILED`；正确 token 才能读取/修改业务数据；Web 不存在 credential-free data API |
| CLI credential boundary | 非空 `KG_TOKEN` 优先，否则读取当前 `KG_HOME/auth.json`；显式错误 token 不 fallback；两者都不可用时 pre-dispatch exit 2，daemon拒绝时 exit 1；不接受 `--token`，稳定 code 为 `AUTHENTICATION_FAILED` |
| SQLite extension remote source | HTTPS artifact 必须 SHA-256 pin；GitHub redirect 可解析；cache 命中可离线 restart；download/hash mismatch/unsafe archive/missing library/entrypoint failure 都 fail closed |
| SQLite extension archive 安全 | absolute/`..`/symlink/hardlink/special entry 与越界 library 拒绝；资源超限中止且不发布半成品 cache |
| SQLite extension connection lifecycle | 每个实际 SQLite connection 按同一顺序加载全部 configured extensions，随后关闭任意 load 权限；任一 connection 缺插件不能进入 pool |
| Lithograph 统一加载与 capability | 配置不声明 plugin kind；每个实际 connection 的 Lithograph v0.3.0 public SQL、Managed Semantic 与 Provider registration capability均验证通过；不要求 application Native query symbols或`sqlite3*` handle，缺失/不兼容时拒绝开放 Knowledge Base |
| SQL explicit transaction | Go在同一 connection调用 `tx_begin -> lithograph()/lithograph_rows()* -> tx_commit/abort`；多次 mutation只生成一个最终 Commit，expectedHead/失败/abort/关闭未提交连接不残留变更，不存在`tx_execute`或外层 SQLite BEGIN/COMMIT |
| Go runtime 与内置 Web | 一个 Go `kgosd` 启动完成后，同一 configured origin 可访问 Web页面、资源和已认证API；无需独立Web服务；`context.Context`取消、streaming与graceful shutdown不破坏底层事务合同 |
| Full-text config 完整显式 | `[fulltext].analyzer` 必须显式存在；完整 FTS5 specification 原样编译到所有 managed Full-text definitions；Ontology 不出现 analyzer/plugin/options |
| Full-text analyzer runtime probe | extension load 后每个 connection 验证当前 analyzer；未知 tokenizer/无效参数/缺运行资源返回 FULLTEXT_ANALYZER_UNAVAILABLE，不伪装为空结果 |
| Full-text State profile | analyzer 不在 public Ontology；已有 Index 保留 actual versioned analyzer，新建/业务重建使用当前 runtime analyzer；不同 analyzer 本身不被 decoder 误报为 consistency failure，无法安全解释的其它 hidden config 仍拒绝 |
| Initialization config notice | install交互流程进入 `[fulltext]` / `[embedding]` 前只提示一次“初始化后禁止修改”的本地化短文案；Runtime/doctor 不保存旧值、不做修改检测或历史比较 |
| Full-text query-time override 边界 | 官方 KG OS query 不生成 analyzer override；调用方手写 Lithograph override 时由 Lithograph 直接执行且只影响本次 query，不被 KG OS 误当为全局 config/State mutation |
| 同请求新建 Node/Relationship/Domain | alias 跨 entry 解析，与文本顺序无关，最终 from/to/includes 为正式 Ref |
| required / unique / 复合 KEY | 单字段和联合规则不混淆，类型/空值/冲突遵守对应数据库语义 |
| Object / Ontology caller-owned Vector | 高层 Object / Ontology profile 仍拒绝 Vector；Graph 直接执行不受该 profile 限制，后续高层读取按一致性合同处理 |
| Embedding config 缺失/非法 | 缺失或非法配置拒绝开放业务能力；api_key 字段拒绝，api_key_env 只存变量名，实际 secret 不进入 Schema/SHOW/history/log |
| Provider 暂时不可用 | Provider extension 缺失时 semantic 操作失败；扩展已加载而远端不可用时，只影响实际需要计算 embedding 的检索；普通 read/source write 继续工作 |
| Semantic source mapping | 首版单字段 exact UTF-8 source 直接映射 Managed Semantic；共享索引的每个 target 使用同名 source；明确拒绝多字段拼接声明，不静默截断、拆索引或恢复隐藏向量 Property |
| String + Semantic query | 用普通 String 调用 semantic query；不识别 $semantic marker，不预处理参数，不改变 Cypher bytes |
| raw Vector param/result | Graph 完整传递底层 Vector parameter/result（含嵌套值和 streaming），不新增 KG OS 类型；Semantic 内部 embedding 不自动成为图属性 |
| Semantic query result | RETURN n、properties/keys、projection/dynamic access 都无 embedding 属性；正常返回业务值与 score |
| Graph execute 写入 Vector | 合法值按 Lithograph Schema / Constraint 执行，不附加 KG OS staged public-profile validation |
| Graph execute 写 reserved identifier | 不因 `__kgos_` prefix 拦截原始 Cypher；Object / Ontology Patch 仍拒绝该 namespace，直接变更造成的高层 inconsistency 不自动修复 |
| Graph execute semantic target/source mutation | 普通 source mutation 不调用 Provider、不附加 KG OS profile 检查或修复 Commit；提交 / rollback 按所执行 Cypher 的底层事务语义 |
| Graph LOAD CSV / SHOW / Version Procedure | 不加语句清单或固定 Knowledge graphView；只读入口拒绝写入，读写入口按底层合同执行；上下文选项不额外阻断合法 procedure |
| Graph invalid high-level Snapshot | 缺失 Binding 或不符合 Object profile 不阻止 Graph 查询 / 执行；高层 Ontology / Object / Evolution 仍按各自合同报错 |
| Graph transaction subquery / streaming failure | 保留底层事务和已提交批次语义；缺失 final summary 不声称整条语句没有副作用，不自动重放未知结果的写入 |
| hybrid fulltext + semantic | 两者可以复用同一 String 参数；遵守底层组合语义，post-YIELD WHERE 不冒充过滤范围内 top-k |
| semantic-source mutation | Object Patch/Graph execute 保存 source 不依赖远端模型；后续 query 使用目标 Snapshot 的文本 |
| semantic-source merge | 合并业务 source 与索引定义，无 embedding slot/conflict/refresh；新增或改变定义只需本地 Provider validation |
| Semantic create / cache rebuild | 创建索引不遍历正文、不发 embedding 请求；新增/变更 definition 与其它 Patch 原子提交；独立 cache rebuild 不进入 Commit |
| 多字段/多目标 Full-text | 保留完整覆盖范围，不拆成不等价的多个索引 |
| shared Index 从任一 Definition 编辑 | 相同 delta 合并一次；不改另一份上下文也成功；矛盾目标整体失败 |
| shared targets 减少、整条删除 | 范围变更与全局删除有明确区别，不删除正文；Semantic DROP 不误删其它索引/历史可复用的共享 cache |
| 单字段 Range / Full-text 索引改为复合 / 多字段索引 | 按资源名识别延续并保留有序 properties；必须重建时使用所属索引当前显式初始化配置 |
| 只改 description | 只有 semantic delta，不触发 Schema/Index rebuild |
| 无变化与纯排版变化 | strict base check 后返回原 State，不建空 Commit |
| 顶层 rename 与 Property renameFrom | 真实 Knowledge、Binding、端点/Index/Constraint 引用共同更新，不靠相似度 |
| 删除字段或 Definition，仍有数据/共享依赖 | 无隐式数据损失；可在同一 Patch 明确处理依赖，否则诊断聚合位置 |
| 目标合法但中间 DDL/DML 有约束 | planner 找到合法原子序列；任何失败不产生中间 durable State |
| stale base、重复字段、未知字段、无效 type/索引 | 分类正确并拒绝整个请求，不 fuzzy apply、不忽略输入 |
| rename 后/历史 Snapshot 再读取 | Schema、semantics 与索引来自同一历史 State，不用当前数据解释历史 |
| 多 Label 与作用范围重叠 | 不能局部改名时覆盖另一模型或其它 key；同一数据所有生效约束都保留 |
| shared resource History / Merge | 以 Definition+path 表达，同一 native conflictId 不因多处展示重复解决 |
| Object reserved/internal targets 与旧 Object Ref | Object 不暴露或误写内部资源；该投影边界不应用于 Graph Cypher |
| read → no-op → read；edit → compile → read | 公共逻辑 round-trip，保留未编辑的图数据、名称、选项与作用范围 |

## 参考证据

2026-09-21 重新核对 Lithograph 当前 `main` / v0.3.0：application-facing execution 已收敛为 `lithograph()` / `lithograph_rows()` / `lithograph_validate(query)` 与 SQL explicit-transaction lifecycle，Native query ABI和Core text→Vector cache已删除；OpenAI-compatible Provider cache使用独立 SQLite database。Lithograph Phase 15 / v0.3.0已有自身发布证据，但这只证明底层产品已交付；KG OS Go adapter 是否完成由对应 Phase 的真实验收证据决定，不能由底层发布状态推导。

公开语言参考（2026-09-15 核对；Lithograph 冻结 profile 而非未来网页变化决定实际支持范围）：[Constraints](https://neo4j.com/docs/cypher-manual/current/schema/constraints/)、[Full-text indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/)、[Vector indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/)。研究证据不覆盖 ontology.md 的上层产品决定。

实现、验证、提交和推送分别按真实执行结果报告；文档完成不代表 KG OS compiler 或依赖库集成已经通过验收。
