# 工程映射与实现待办

本文件记录已确认设计的 **实现依赖、compiler/adapter 工作和验收**，不重新定义 [Ontology](ontology.md)、[Object](object.md)、[Graph](graph.md)、[Evolution](evolution.md) 或 [Runtime](runtime.md)。

## 剩余依赖与工程合同

Ontology 已确认渐进式读取与 Domain/Definition aggregate 编辑；不能因为仍需实现 compiler，就把它退回“模型尚未设计”或要求 AI 操作单独的 Property/Constraint/Index。逻辑字段和行为只在各 owner 文档维护。

| 已确认的合同 | 工程工作 |
| --- | --- |
| Ontology Overview → 可选 Domain → Definition，无 search；1..100 Ref batch read | 单次 State pin、输入顺序、per-Domain cursor、batch all-or-nothing、描述缺省提示与有界图预览 |
| Node/Relationship 聚合 Property、required/unique、Constraint/Index | 从公开 Graph Type/SHOW 与 semantic graph 反向构建逻辑值；编译到数据库，不建立 owner-only 公共 structure AST |
| Domain/Definition canonical YAML + 唯一 Object Patch | 标准 YAML/Git parser、exact apply、input-only renameFrom、语义差异、共享资源去重和冲突定位 |
| 单 State、strict base、无隐式数据损失 | Native explicit transaction 内 DDL/DML 顺序、即时约束、引用改写和 Knowledge migration |
| Binding / Graph View / reserved identifier | 空库 bootstrap、双向覆盖与内部数据隔离验证，不增加第二套结构存储 |
| OpenAI-compatible Embeddings + managed semantic vector | startup config/fingerprint、OpenAI-compatible `/embeddings` adapter、SemanticText param resolution、source framing、managed vector 隔离、mutation/merge refresh；不解析 Cypher |
| Evolution 统一历史与 Merge Session | Definition 内字段级历史；shared resource 单次 conflict 投影；固定 revision 的 candidate 检查 |
| CLI / SDK / Web 共享合同 | ontology batch Markdown、batch --edit YAML multi-document stream、ontology scoped patch、Object JSON、Graph NDJSON、HTTP metadata 与错误映射 |

### Ontology compiler / decoder

实现先从目标 State 的公开 Schema 与 metadata 得到完整源信息，再建立本次操作的 source mapping，区分字段自带规则、具名约束、derived backing index 和独立显式索引。该映射是 operation-local 工程数据，不是新的公共结构、不作为第二份 Schema 持久化。

反向读取必须保留真实的 index/constraint name、target、字段顺序、类型、端点语义及配置。相同公共值能通过多种底层 DDL 实现，不要求 AST/资源数量一一对应；但不能把另一种 coverage、复合约束或多目标索引简化成语义不同的 Boolean。

正向编译先比较公共逻辑变化，再保留未修改的来源与配置，计算必需的底层变动。一次 Node/Relationship Patch 可同时改变 Schema、Constraint、Index 和 Binding；shared resource 使用一个规范化变化计划。新建时源映射为空，按 ontology.md 的命名/默认规则选择最小合法计划。不能靠临时 UUID、公共 owner registry 或 raw Schema escape hatch 填补 mapping。

公开 type/required/from/to 能力由 Lithograph Schema/Constraint 实际执行，KG OS 做的是输入、依赖与编排校验，不实现另一套数据库运行时约束引擎。

### Mutation planning

执行链路复用 Object contract：parse → exact apply → 公共值 → explicit delta → shared-resource normalization → derived reference/migration → conflict/dependency check → tx_begin(expectedHead) → 标准 Cypher → tx_commit。

实现必须证明中间每条 statement 符合 Lithograph immediate semantics，不能只比较最终 Schema。对合法上层目标可采用同 transaction 内受控 drop/recreate 或先迁移再施加约束；语义保持要求仍由公共合同约束。新 alias result capture、顶层 Ref transition 与 Property Binding continuity 都在这一个边界内完成。Object/Ontology Patch 的 baseState 和 target Object delta 在取得 writer 前已经确定，因此 semantic source value / Index backfill 能从 immutable base + target logical delta 预先收集并调用 OpenAI-compatible embedding service，待 embedding 全部成功后再 `tx_begin(expectedHead=baseState)` 应用 public delta 与 managed values；Branch 已前进则丢弃预计算结果并返回 stale，不在 writer transaction 内重做网络请求。

### Adapter 与运行时

Ontology batch read 在 daemon/kernel 层先解析一次 State，再读取全部 refs；adapter 不能通过循环读取 `branch/...` 模拟 batch，否则 Branch 移动会产生跨 State 结果。Batch `--edit` 要先取得并验证全部 Object bodies，再一次性写 stdout；任一失败不得留下半个 stream。单个 body 继续使用 Object canonical renderer，multi-document marker/comment 由 CLI framing 层添加。`ontology patch` 与 `object patch` 只有一套 request/result/compiler，前者只做 kind scope validation。不得让 CLI、Web、SDK 对缺失字段、删除、rename、shared resource、baseState 产生不同解释。Knowledge 保持直接 Cypher，不文件化。

**`kgosd` runtime implementation**：v1 已确认 IPv4 HTTP、server + mandatory embedding startup config、`kgosd.lock` single-instance/current-endpoint、foreground daemon、显式 lifecycle、same-origin Web/API 与 no-auth。Embedding 只实现一个 OpenAI-compatible adapter：校验 `base_url/model/dimensions/similarity`、`api_key xor api_key_env`、环境变量解析，构造 `POST {base_url}/embeddings`、可选 Bearer auth、单/批量 `input`，校验 `data[].index/embedding` 与 finite exact dimension，并映射 timeout/network/status/JSON/shape 错误。还需 embedding-space fingerprint bootstrap/open check，以及 Graph params 中 top-level `SemanticText` → Lithograph Vector 的 adapter resolution。该步骤不能引入 provider registry 或第二套 Cypher parser/AST/rewrite。Knowledge Base 在 `data/` 下的具体 target/layout 仍是独立 gap。

### Managed semantic-vector readiness

2026-09-15/16 对当前 Lithograph 仓库只读核对后，产品语义已经明确，但实现存在四个必须先解决的真实 integration gap：

1. 当前 `GraphViewSelector` 只支持 Label include/exclude，没有 Property-level visibility。把 managed vector 作为 reserved Property 放到业务 Node/Relationship 后，仅在 KG OS response 层删除字段并不正确，因为 `keys(n)`、`properties(n)`、map projection、dynamic property access 等 Cypher 语义仍会观察到它。实现必须获得通用的 property-level Graph View / reserved-property isolation，或提供经过等价语义证明的底层机制；不能靠字符串黑名单或结果后处理冒充隔离。
2. 当前 Lithograph execution summary 提供 counters，但没有公开的 staged changed-element/property set。任意 `graph execute` 可能动态修改 semantic source fields，也可能通过 Node Label / element create-delete 改变 semantic Index target membership；并且 Lithograph Graph Type 是 open semantics，即使 Ontology 不声明 Vector，Cypher 仍可能给未声明 caller Property 写入 Vector或 reserved `__kgos_` Property/Label。KG OS 若不能精确检查 transaction-local changed element/property/identifier，就既无法高效刷新 managed vector，也无法在不解析 Cypher 的前提下执行 caller-owned Vector 与 reserved-identifier 不变量。需要通用 staged change-set introspection 或等价公开能力；不能退化为每次写入全图扫描、字符串分析 Cypher，也不能提交 stale/illegal State 后用第二个隐藏 Commit 修补。
3. 当前 Merge Session candidate validation 是只读的。semantic source 在 merge resolution 后可能需要重算 managed vector；最终 merged State 不能保留 ours/theirs 的旧 embedding。需要能在同一 candidate/revision/finalize boundary 安全刷新 derived managed data，或等价的通用 lower-layer mechanism；不能把 provider 生成的内部冲突暴露给用户。
4. Lithograph explicit transaction 从 `tx_begin` 起持有 single-writer ownership，且其当前设计明确要求 transaction 保持短小、不能在其中等待长时间网络交互。动态 `graph execute` 的最终 semantic source changes 又只有执行后才能知道，因此“`tx_execute` 后在 writer transaction 内调用远端 Embedding Provider”不是可接受实现。需要通用 candidate/preparation boundary 或等价能力，在不长期占用 writer 的情况下取得确定 final changes、完成外部 embedding，再以同一 expected base 原子提交；不能通过执行两次非确定 Cypher、先提交 source 再补隐藏 Commit或无限延长 writer transaction 绕过。

这些是 **Lithograph/KG OS integration readiness**，不是把 embedding model/provider 重新暴露进 Ontology 的理由。本次不修改 Lithograph 设计或代码；后续若选择增加下层能力，必须先在 Lithograph 自己的设计真源中以通用数据库需求表达，不能写成 KG OS 私有语义。

上述 runtime 工作不随 Ontology 调整重做；Knowledge Base target/layout 是保留的独立产品设计事项，其余已能由当前逻辑合同裁决的 mapping 自行完成，不逐字段重新要求用户设计。

## 工程实现待办

实现前检查 Lithograph 实际文件与测试，不复制它的 Phase 状态为 KG OS 真源。当前 KG OS 仍只有文档，以下都是待实现工作。

1. 建立 kgosd + Lithograph public host，完成 empty-database bootstrap、Native transaction 与结构化错误；不直接访问底层表。
2. 实现 ontology.md 的 semantic graph、Binding coverage、Schema Locator 与 Graph View；正常 Knowledge/Schema 输入都不能写 reserved identifier。
3. 实现五种公共 Object Ref、Domain/Definition aggregate decoder 和 Knowledge 原生 Object value；稳定 canonical YAML / equivalent JSON。
4. 实现 Ontology read 的全局/Domain/Definition 展开与 1..100 Ref batch，同一次请求只 pin 一个 resolved State；实现 Object read/list，Object search 限定 Knowledge，不为 Ontology 加旁路搜索。
5. 实现共享 Object Patch compiler，覆盖聚合内字段/规则/索引、多 aggregate 原子修改、alias、显式 rename、no-op、冲突、rollback；不实现单独 Schema resource CRUD。
6. 实现 Graph query/execute 与 SemanticText parameter adapter；Cypher 原样交给 Lithograph。Graph public params/results 拒绝 raw Vector；execute 的普通 caller-profile/reserved-id validation 需要 staged change inspection，semantic-source mutation 还依赖不持有长 writer lock 的 candidate/preparation 能力。相关 readiness 未关闭前不能声称 Graph execute 的 semantic-source mutation 已实现，不接受 stale-vector、caller-vector、reserved-id 或长网络 writer-transaction 降级。
7. 实现 Evolution read/state/ref/history/diff/merge，内部 schema slot 转为 aggregate 字段，固定 candidate revision 检查一致性后 finalize。
8. 按 CLI / Runtime 文档实现 TypeScript/npm client、Ontology batch Markdown / batch-edit YAML stream / scoped patch、YAML/JSON/NDJSON 输出和 daemon 生命周期，再提供 Skill/SDK/Web 使用文档。

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
| 多 Ref batch --edit | 输出是合法 YAML 1.2 multi-document stream；每个 document body 与单独 canonical YAML 逐字一致，顺序与请求一致；state/ref framing 不进入 Object Value / Git hunk；任一目标失败时 stdout 为空 |
| ontology patch scope | 多 Definition/Domain Patch 与 object patch 得到相同 Ontology 结果；出现 Knowledge target 时在执行前整体拒绝；不建立第二 transaction/compiler |
| Document 新建及全文/语义索引 | aggregate 只声明业务 source fields；不出现 caller-managed embedding Property/model/dimension，真实 fulltext/semantic Index name 均可查询 |
| 同请求新建 Node/Relationship/Domain | alias 跨 entry 解析，与文本顺序无关，最终 from/to/includes 为正式 Ref |
| required / unique / 复合 KEY | 单字段和联合规则不混淆，类型/空值/冲突遵守对应数据库语义 |
| caller-owned Vector Property/type constraint | `VECTOR<...>` Property、包含 Vector 的 type/valueType 或 caller Knowledge Vector value 均拒绝；只允许 reserved managed semantic materialization |
| Embedding config 缺失/非法 | Knowledge Base 不开放；错误分类为 EMBEDDING_CONFIG_ERROR，不偷偷使用默认模型 |
| Provider 暂时不可用 | 普通独立 read/fulltext 可继续；SemanticText resolution 或需要 semantic refresh 的 mutation 返回 EMBEDDING_PROVIDER_ERROR 且不产生不一致 State |
| embedding-space fingerprint | bootstrap/current head 与 config 一致；带 SemanticText 的旧空间查询与所有新 Snapshot write 明确拒绝 mismatch 并要求 migration；不带 SemanticText 的普通历史 Graph/Full-text read 仍可读取旧 State |
| 单/多字段 semantic vector | source framing 稳定；dimension/similarity 来自全局 config；managed Vector Property 不进入 Ontology/Object/Graph/History public view |
| SemanticText + SEARCH | `{"$semantic":"text"}` 只作为顶层 Graph param value；KG OS 转成 Vector 后保持 Cypher bytes 不变交给 Lithograph，AI 不需要 provider/model/dimension/query Vector |
| raw Vector param/result | caller `$type:"Vector"` parameter 与任何 Vector result（含 `RETURN $semanticParam`）拒绝；SemanticText 内部生成的 query Vector 不进入 public result |
| managed-vector query result | `RETURN n`、`properties(n)`、`keys(n)`、projection/dynamic access 都看不到内部 materialization；普通业务结果与 score 正常返回 |
| Graph execute 写入 Vector | 即使写入 undeclared/open-Graph-Type Property，也在 staged state validation 中 commit 前拒绝；不需要解析/改写 Cypher |
| Graph execute 写 reserved identifier | 动态 `SET` / Label mutation 即使绕过 Ontology，也在 commit 前按 staged changed identifier 拒绝 `__kgos_` caller write |
| Graph execute semantic target/source mutation | final target membership + source changes 可确定、embedding 在不长期持有 Lithograph writer 的边界外完成，最终仍只有一个 State；Branch/base 变化、Provider 失败或 candidate mismatch 均不产生 Commit |
| hybrid fulltext + semantic | 同一文本可分别作为普通 String 与 SemanticText 两个参数；KG OS 不靠 query 解析猜测哪个参数要 embedding |
| semantic-source mutation | Object Patch/Graph execute 修改 source 后，同一最终 State 的 managed vector 同步；Provider/refresh 失败整体 rollback |
| semantic-source merge | public source resolution 后 managed vector 按 candidate 重算；不出现用户可见 vector conflict，不用第二个 post-merge Commit 修补 |
| semantic Index backfill | create/delete/targets/source list/order/rename/type 变化对 baseState 全部受影响 Knowledge 同一 State backfill/recompute/remove；不出现“索引先提交、向量稍后补” |
| 多字段/多目标 Full-text | 保留完整覆盖范围，不拆成不等价的多个索引 |
| shared Index 从任一 Definition 编辑 | 相同 delta 合并一次；不改另一份上下文也成功；矛盾目标整体失败 |
| shared targets 减少、整条删除 | 范围变更与全局删除有明确不同结果，不误删正文/向量 |
| 单字段索引改成复合索引 | 按资源名识别延续，保留未修改配置及有序 properties |
| 只改 description | 只有 semantic delta，不触发 Schema/Index rebuild |
| 无变化与纯排版变化 | strict base check 后返回原 State，不建空 Commit |
| 顶层 rename 与 Property renameFrom | 真实 Knowledge、Binding、端点/Index/Constraint 引用共同更新，不靠相似度 |
| 删除字段或 Definition，仍有数据/共享依赖 | 无隐式数据损失；可在同一 Patch 明确处理依赖，否则诊断聚合位置 |
| 目标合法但中间 DDL/DML 有约束 | planner 找到合法原子序列；任何失败不产生中间 durable State |
| stale base、重复字段、未知字段、无效 type/索引 | 分类正确并拒绝整个请求，不 fuzzy apply、不忽略输入 |
| rename 后/历史 Snapshot 再读取 | Schema、semantics 与索引来自同一历史 State，不用当前数据解释历史 |
| 多 Label 与作用范围重叠 | 不能局部改名时覆盖另一模型或其它 key；同一数据所有生效约束都保留 |
| shared resource History / Merge | 以 Definition+path 表达，同一 native conflictId 不因多处展示重复解决 |
| reserved/internal targets 与 raw 旧 Ref | 不泄露/误写内部资源，不因旧接口形成旁路 |
| read → no-op → read；edit → compile → read | 公共逻辑 round-trip，保留未编辑的图数据、名称、选项与作用范围 |

## 参考证据

2026-09-15/16 只读核对 Lithograph 仓库：`docs/design.md` §9.2 与 §11；Phase 08 Full-text/Vector tests 已证明 Node/Relationship semantic index、filter/score/history/cache rebuild。进一步检查 `query/options.rs` 确认 Graph View 当前只有 label include/exclude；`docs/design.md` §11.1 明确 Graph Type 为 open semantics；execution public summary/current tests 未发现 staged changed-element/property set；§9.2 明确 explicit transaction 从 begin 起持有 single-writer 且不得等待长时间网络交互，并确认 mutating auto-commit 与 explicit transaction 都保留 write-intent / empty-delta Commit 语义；Merge Session candidate 仍按 KG OS 现有设计只读校验。这些是上面 readiness finding 的直接证据；本次没有修改 Lithograph。

公开语言参考（2026-09-15 核对；Lithograph 冻结 profile 而非未来网页变化决定实际支持范围）：[Constraints](https://neo4j.com/docs/cypher-manual/current/schema/constraints/)、[Full-text indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/)、[Vector indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/)。研究证据不覆盖 ontology.md 的上层产品决定。

实现、验证、提交和推送分别按真实执行结果报告；文档完成不代表 KG OS compiler 或依赖库集成已经通过验收。
