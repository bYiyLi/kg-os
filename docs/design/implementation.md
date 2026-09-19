# 工程映射与实现待办

本文件记录已确认设计的 **实现依赖、compiler/adapter 工作和验收**，不重新定义 [Ontology](ontology.md)、[Object](object.md)、[Graph](graph.md)、[Evolution](evolution.md) 或 [Runtime](runtime.md)。

## 剩余依赖与工程合同

Ontology 已确认渐进式读取与 Domain/Definition aggregate 编辑；不能因为仍需实现 compiler，就把它退回“模型尚未设计”或要求 AI 操作单独的 Property/Constraint/Index。逻辑字段和行为只在各 owner 文档维护。

[模型修改](ontology.md#patch-到真实变化)、[批量 Object Patch](object.md#object-公共调用合同)与 [Merge Session](evolution.md#evolution-公共调用合同)的产品规则已经确定，剩余工作是 compiler、底层事务与冲突映射的实现和验证。[只读连接与自动缓存](#managed-semantic-integration-readiness)同样已有目标行为，尚缺底层接入证据。这些工程待办不表示需要重新确认对应核心设计；Web 页面细化单独见 [Runtime](runtime.md#web-交互设计状态)。

| 已确认的合同 | 工程工作 |
| --- | --- |
| Ontology Overview → 可选 Domain → Definition，无 search；1..100 Ref batch read | 单次 State pin、输入顺序、per-Domain cursor、batch all-or-nothing、描述缺省提示与有界图预览 |
| Node/Relationship 聚合 Property、required/unique、Constraint/Index | 从公开 Graph Type/SHOW 与 semantic graph 反向构建逻辑值；编译到数据库，不建立 owner-only 公共 structure AST |
| Domain/Definition canonical YAML + 唯一 Object Patch | 标准 YAML/Git parser、exact apply、input-only renameFrom、语义差异、共享资源去重和冲突定位 |
| 单 State、strict base、无隐式数据损失 | Native explicit transaction 内 DDL/DML 顺序、即时约束、引用改写、Knowledge data rewrite 与 index maintenance |
| Binding / Object Graph View / reserved identifier | 空库 bootstrap、Object / Ontology 的双向覆盖与内部数据投影校验；不作为公共 Graph Cypher 的执行条件 |
| 通用 SQLite Extension startup runtime | local/HTTPS source resolve、SHA-256 pin、safe archive extract、content-addressed cache、ordered per-connection load、Lithograph capability validation；不按插件用途建 loader |
| 全局 Full-text analyzer + 简化 Ontology | `type: fulltext` 只编译业务 targets/properties；新建/业务重建时写当前 `[fulltext].analyzer` + `eventually_consistent=false`，已有 versioned analyzer 保留，connection probe 当前 analyzer；不做 config migration |
| Lithograph Managed Semantic + 简化 Ontology | Provider extension 装配、默认配置到 versioned IndexDefinition 的映射、String query、读写连接选择与 cache policy；不实现 embedding HTTP client、向量 Property 或写入/合并刷新 |
| Evolution 统一历史与 Merge Session | Definition 内字段级历史；shared resource 单次 conflict 投影；固定 revision 的 candidate 检查 |
| CLI / SDK / Web 共享合同 | `KG_HOME` target discovery、Bearer authentication / `AUTHENTICATION_FAILED` mapping、ontology batch Markdown、batch --edit YAML multi-document stream、ontology scoped patch、Object JSON、Graph NDJSON、HTTP metadata 与错误映射 |

### Ontology compiler / decoder

实现先从目标 State 的公开 Schema 与 metadata 得到完整源信息，再建立本次操作的 source mapping，区分字段自带规则、具名约束、derived backing index 和独立显式索引。该映射是 operation-local 工程数据，不是新的公共结构、不作为第二份 Schema 持久化。

反向读取必须保留真实的 index/constraint name、target、字段顺序、类型、端点语义及配置。相同公共值能通过多种底层 DDL 实现，不要求 AST/资源数量一一对应；但不能把另一种 coverage、复合约束或多目标索引简化成语义不同的 Boolean。

正向编译先比较公共逻辑变化，再保留未修改的来源与配置，计算必需的底层变动。一次 Node/Relationship Patch 可同时改变 Schema、Constraint、Index 和 Binding；shared resource 使用一个规范化变化计划。新建时源映射为空，按 ontology.md 的命名/默认规则选择最小合法计划。不能靠临时 UUID、公共 owner registry 或 raw Schema escape hatch 填补 mapping。

公开 type/required/from/to 能力由 Lithograph Schema/Constraint 实际执行，KG OS 做的是输入、依赖与编排校验，不实现另一套数据库运行时约束引擎。

### Mutation planning

执行链路复用 Object contract：parse → exact apply → 公共值 → explicit delta → shared-resource normalization → derived reference / maintenance → conflict/dependency check → tx_begin(expectedHead) → 标准 Cypher → tx_commit。

实现必须证明中间每条 statement 符合 Lithograph immediate semantics，不能只比较最终 Schema。对合法上层目标可采用同 transaction 内受控 drop/recreate 或先改写受影响数据再施加约束；语义保持要求仍由公共合同约束。新 alias result capture、顶层 Ref transition 与 Property Binding continuity 都在这一个边界内完成。Semantic source 写入不做 embedding；Semantic definition 新建 / 改变只执行本地 Provider/config validation，因此 Patch 不再需要在 writer 外预计算向量再回填内部 Property。

### Adapter 与运行时

Ontology batch read 在 daemon/kernel 层先解析一次 State，再读取全部 refs；adapter 不能通过循环读取 `branch/...` 模拟 batch，否则 Branch 移动会产生跨 State 结果。Batch `--edit` 要先取得并验证全部 Object bodies，再一次性写 stdout；任一失败不得留下半个 stream。单个 body 继续使用 Object canonical renderer，multi-document marker/comment 由 CLI framing 层添加。`ontology patch` 与 `object patch` 只有一套 request/result/compiler，前者只做 kind scope validation。不得让 CLI、Web、SDK 对缺失字段、删除、rename、shared resource、baseState 产生不同解释。Knowledge 保持直接 Cypher，不文件化。

**`kgosd` runtime implementation**：v1 已确认 IPv4 HTTP、`KG_HOME` profile、根目录 `kgos.db` 单库、persistent `auth.json` 与客户端 `KG_TOKEN` Bearer authentication、显式 daemon lifecycle、same-origin Web/API。SQLite host 按统一 resolver 装配 Lithograph、OpenAI-compatible Provider 和其它扩展；由 Runtime owner 定义 Full-text / Embedding 默认值及 Lithograph 内部 cache policy。

SQLite Extension resolver 先把全部 configured source 固定为 daemon-local immutable artifacts：local/HTTPS input、remote mandatory SHA-256、HTTPS-only redirect、direct library/archive 分支、`library` exact member、safe extraction 与 content-addressed cache 都必须在 database connection 进入可用生命周期前完成。每个新 connection 按 config order 加载同一批 resolved artifacts，extension loading 只在 host C API initialization window 开启；任一 load 失败拒绝该 connection。配置本身不标记 `kind=lithograph`。Daemon 从同一批 resolved libraries 自动发现完整 Lithograph ABI 1 export family，必须恰好一个 provider；只做 platform dynamic-loader symbol binding，实际 Native API 调用仍以前置的 target-connection SQLite extension registration 为条件。实现不能把下载放到 connection checkout 热路径、不能让不同 connection 因 source 更新加载不同 binary、不能实例化第二套 private SQLite，也不能通过业务 SQL/Cypher 暴露任意 extension loading。

Full-text runtime 在 extension load 后对当前 `[fulltext].analyzer` 做 connection-local FTS5 probe。Ontology compiler 对新建或业务定义变化后必须重建的 KG OS-managed `type: fulltext` 生成当前 analyzer 与 `eventually_consistent=false`；已有 IndexDefinition 未被本次业务 Patch 触碰时保留其实际 versioned analyzer。Decoder 有意不把 analyzer 暴露到公共 Ontology，因此不同 analyzer 不构成 public-profile mismatch；其它无法安全解释的未公开 Full-text 配置仍按 consistency boundary 拒绝。实现不维护 fulltext fingerprint/generation，也不因为 runtime config 改变迁移已有 State。

Embedding compiler 校验当前 `[embedding]`，按 [Runtime 映射](runtime.md#embedding-配置与索引映射)生成 `provider: openai-compatible`、versioned providerConfig 与 index dimensions/similarity。只接受 `api_key_env`，将变量名而非 secret 写入配置；明确 `send_dimensions=false` 与 `encoding_format=float`。Schema 创建使用 `db.index.semantic.createNodeIndex/createRelationshipIndex`，Graph 检索使用普通 String + `queryNodes/queryRelationships`。KG OS 不实现 HTTP、batching、source framing、`SemanticText` 预处理或第二套 Cypher parser。

`[cache]` 继续缺省 `enabled=true,max_size_mb=4096`；启动时通过公开 `cache.configure` 设置 Lithograph operational policy。source / query embedding 都由正常查询自动查缓存、miss 调 Provider、成功后发布持久缓存，详见 [Runtime](runtime.md#embedding-result-cache)。不新增独立 cache.db 或预热入口；物理只读连接无法发布缓存的现状必须在底层接入中解决，不能把内存命中算作持久复用。

修改 `[fulltext]` / `[embedding]` 后 restart 只改变以后新建 / 必须重建索引的默认值。已有索引保留真实配置，历史查询使用目标 Snapshot 的 IndexDefinition；实现不得用当前默认值覆盖未编辑的底层配置，不批量迁移历史或增加 `migrating` daemon 状态。

### Managed Semantic integration readiness

采用 Phase 13 后，旧方案中的 managed Property 隔离、mutation/merge 向量刷新、writer 外预计算向量再提交，不再是 KG OS 的实现前置条件。embedding 不属于图属性或 Commit，纯业务写入不访问模型服务。

本轮已确认 Graph 不审查 Cypher 内容；旧的 procedure 白名单、Graph caller-owned Vector / reserved identifier 提交前检查不再是实现前置条件。仍须完成以下工程验证，不能把文档决定当作接入已完成：

1. **读写连接执行**：Graph `query` 选择只读连接，`execute` 选择读写连接；以真实 Native 执行证明底层拒绝只读入口中的写操作，正常执行允许的读取。`LOAD CSV` / Semantic I/O 不能因误用 `lithograph_rows()` 而被拦截；KG OS 不解析 Cypher、不实现 procedure 黑白名单、不把失败写入重试到写连接。
2. **只读查询与持久缓存**：当前 Lithograph 工作树在可写 `main` 上已有普通查询 publish 路径，但物理只读时跳过它。按 [Runtime](runtime.md#cypher-执行连接)同时满足只读执行与内部自动缓存；具体机制仍需底层公开合同和集成证据，不在 KG OS 增加缓存层或改成用户预热。缓存充足且未淘汰时，以 Provider 调用次数证明跨连接 / 重启复用，同时证明业务 graph/schema/history/ref 未被查询修改。
3. **原样 Cypher 与请求上下文**：公共 Graph 不附加排除内部节点的 `graphView`，完整传递 Lithograph JSON 值。验证 `at` / 默认 Branch / `author` / `message` 与 Schema / Version Procedure 的公开参数合同；不能无条件把 Native `branch` option 附加到不接受它的 procedure，也不能按 procedure 名维护 KG OS 特例表。使用底层公开连接或 execution 上下文机制；现有公开能力不足时记录准确缺口，不另写解析器。连接 checkout 不得在请求间泄漏，事务 / 部分提交结果不得伪装为统一单 Commit。
4. **真实扩展与版本配置集成**：在各实际 sqlite3 connection 上加载同一批 Lithograph 与 Provider，通过 Native ABI 验证 create/query、历史配置保留、取消、错误 / 值映射及上述连接与缓存行为。只有 ABI symbol 或文档声明不能证明集成通过。

Ontology 首版只实现单字段语义索引，联合检索沿用 Lithograph；`filterProperties` 与过滤范围内 top-k 的实际边界见 [owner 范围](ontology.md#语义索引的首版范围)。不增加未确认的底层过滤接口；缓存自动填充已经确认，不再列为需要用户设计的预热入口。

`KG_HOME`、单库、认证和通用 extension loader 的已确认边界保持；Object / Ontology / Evolution 的高层一致性校验保留，不能把它们重新挂到 Graph 透传路径。

## 工程实现待办

实现前检查 Lithograph 实际文件与测试，不复制它的 Phase 状态为 KG OS 真源。当前 KG OS 仍只有文档，以下都是待实现工作。

1. 建立 kgosd runtime/SQLite host：实现 `KG_HOME`、`auth.json`、Bearer middleware、根目录 `kgos.db`、统一 extension resolver/per-connection loading、Lithograph Native / Managed Semantic 能力验证与 cache policy 配置；再完成 empty-database bootstrap。
2. 实现 ontology.md 的 semantic graph、Binding coverage、Schema Locator 与 Object / Ontology Graph View；高层 Object / Ontology 输入保留 reserved identifier 校验，公共 Graph 不复用该限制。
3. 实现五种公共 Object Ref、aggregate decoder 与 Knowledge 原生 Object value；canonical YAML / JSON 省略空的顶层 `indexes`，保留非空复合 / 共享索引。
4. 实现 Ontology read 的全局/Domain/Definition 展开与 1..100 Ref batch，同一次请求只 pin 一个 resolved State；实现 Object read/list，Object search 限定 Knowledge，不为 Ontology 加旁路搜索。
5. 实现共享 Object Patch compiler，覆盖聚合内字段/规则/索引、多 aggregate 原子修改、alias、显式 rename、no-op、冲突、rollback；不实现单独 Schema resource CRUD。
6. 实现 Graph query/execute：选择只读 / 读写连接，原样传递 Cypher 与 Lithograph JSON 值；不设 procedure、Vector 或 reserved identifier 检查。完成上述连接、上下文与缓存集成验收后再报告可用。
7. 实现 Evolution read/state/ref/history/diff/merge，内部 schema slot 转为 aggregate 字段，固定 candidate revision 检查一致性后 finalize。
8. 按 CLI / Runtime 文档实现 TypeScript/npm client、Ontology batch Markdown / batch-edit YAML stream / scoped patch、YAML/JSON/NDJSON 输出和 daemon 生命周期，再提供 Skill/SDK/Web 使用文档。

Web 还需细化页面布局、导航与具体操作交互，状态由 [Runtime](runtime.md#web-交互设计状态)记录。这是前端工作，不是上面 Kernel、daemon、CLI 或 SDK 开工的前置条件；当前文档不把尚未细化的页面标为已设计完成。

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
| 标准 YAML 无损往返 | 使用标准库，以原始逻辑值验证 parse(render(value)) 相等；覆盖行首/行内/行尾空格、普通多行、空字符串、纯空白/换行、CR/LF、转义字符与 Unicode，并验证相同值输出确定；YAML 格式缩进不作为 String 内容比较 |
| 顶层 indexes 可选 | 缺省与 [] 逻辑等价且 canonical 均省略；空数组规范化不产生 Commit；非空复合/共享索引不丢失 |
| 多 Ref batch --edit | 输出是合法 YAML 1.2 multi-document stream；每个 document body 与单独 canonical YAML 逐字一致，顺序与请求一致；state/ref framing 不进入 Object Value / Git hunk；任一目标失败时 stdout 为空 |
| ontology patch scope | 多 Definition/Domain Patch 与 object patch 得到相同 Ontology 结果；出现 Knowledge target 时在执行前整体拒绝；不建立第二 transaction/compiler |
| Document 新建及全文/语义索引 | aggregate 只声明业务 source fields；不出现 caller-managed embedding Property/model/dimension，真实 fulltext/semantic Index name 均可查询 |
| SQLite extension local source | absolute direct library 可解析到 content-addressed cache；启动期间 source 被替换后，本进程后续 connection 仍加载启动时固定的同一 artifact |
| KG_HOME default / override | 未设置 `KG_HOME` 时使用 `~/.kgosd`；设置两个不同 absolute profile 时 config/auth/lock/cache/extensions/log/kgos.db 全部隔离，每个 profile 只打开自己的根目录 `kgos.db`，没有 `data/` 中间目录和单-daemon多库 selector |
| Embedding cache defaults | 省略 [cache] 等价 enabled=true + max_size_mb=4096；启动通过公开 procedure 映射为 4 GiB payload 预算，不意外使用底层 1 GiB 默认值 |
| Embedding cache eviction/recovery | 使用 Lithograph FIFO / derived-cache recovery；disabled 不读写持久 cache；普通 query/source miss 成功后自动发布；失败不缓存、不留下半写 entry；不承诺数据库文件立即缩小 |
| 只读 query 与缓存 | 真实 Native 查询拒绝业务写入，同时验证内部自动缓存及跨连接 / 重启复用；现有物理只读跳过 publish 的行为不能算作该组合验收通过 |
| Auth first startup / restart | 新 profile 缺 `auth.json` 时安全随机生成并原子写入；restart token 保持不变；malformed/unreadable auth file fail closed，不静默 rotate；secret 不进入日志/错误/State |
| Daemon HTTP authentication | API/control 缺失、malformed、错误 Bearer token 都得到 `401 + AUTHENTICATION_FAILED`；正确 token 才能读取/修改业务数据或控制 daemon；Web 不存在 credential-free data API |
| CLI credential boundary | CLI 只从 `KG_TOKEN` 取得 token，不读取 `auth.json`、不接受 `--token`；缺失/空 token pre-dispatch exit 2，错误 token 由 daemon 拒绝并 exit 1；两者稳定 code 都是 `AUTHENTICATION_FAILED` |
| SQLite extension remote source | HTTPS artifact 必须 SHA-256 pin；GitHub redirect 可解析；cache 命中可离线 restart；download/hash mismatch/unsafe archive/missing library/entrypoint failure 都 fail closed |
| SQLite extension archive 安全 | absolute/`..`/symlink/hardlink/special entry 与越界 library 拒绝；资源超限中止且不发布半成品 cache |
| SQLite extension connection lifecycle | 每个实际 SQLite connection 按同一顺序加载全部 configured extensions，随后关闭任意 load 权限；任一 connection 缺插件不能进入 pool |
| Lithograph 统一加载与 ABI binding | 配置不声明 plugin kind；同一批 resolved libraries 中恰好一个暴露完整 Lithograph ABI 1 family，并且在每个 target sqlite3* 上实际 extension-load 注册后 Native smoke 可调用；零个/多个/partial provider 都拒绝开放 Knowledge Base |
| Full-text config 缺省/显式 | 无 `[fulltext]` 等价 `unicode61`；显式完整 FTS5 specification 原样编译到所有 managed Full-text definitions；Ontology 不出现 analyzer/plugin/options |
| Full-text analyzer runtime probe | extension load 后每个 connection 验证当前 analyzer；未知 tokenizer/无效参数/缺运行资源返回 FULLTEXT_ANALYZER_UNAVAILABLE，不伪装为空结果 |
| Full-text State profile | analyzer 不在 public Ontology；已有 Index 保留 actual versioned analyzer，新建/业务重建使用当前 runtime analyzer；不同 analyzer 本身不被 decoder 误报为 consistency failure，无法安全解释的其它 hidden config 仍拒绝 |
| Runtime analyzer change | 修改 `[fulltext].analyzer` 后 restart 正常 `running`，不扫描/迁移历史；已有 IndexDefinition 不变，之后新建/重建使用新 analyzer；旧 tokenizer 当前未加载时只让对应历史 Full-text query 返回 FULLTEXT_ANALYZER_UNAVAILABLE |
| Runtime embedding change | 修改默认配置后 restart；已有索引和历史 query 保持原 provider/config，新建 / 必须重建的索引才使用新配置 |
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
| 单字段 Range / Full-text 索引改为复合 / 多字段索引 | 按资源名识别延续并保留有序 properties；必须重建时遵守所属索引的默认配置规则 |
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

2026-09-19 本轮只读核对 Lithograph 工作树（HEAD `598829c`，含本轮未修改的未提交变更）：`docs/design/interfaces.md` 的 Native、Graph View、procedure context 与 external I/O；`docs/design/vector.md` 的普通 query/source 自动缓存和物理只读跳过 publish；`crates/lithograph-core/src/query/managed_semantic.rs` 的 `publish_query_embeddings`。本次只是当前文件与实现路径核对，没有运行 Lithograph / KG OS Native 集成测试，不证明这些底层改动已经交付或上述只读缓存组合可用。

公开语言参考（2026-09-15 核对；Lithograph 冻结 profile 而非未来网页变化决定实际支持范围）：[Constraints](https://neo4j.com/docs/cypher-manual/current/schema/constraints/)、[Full-text indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/full-text-indexes/)、[Vector indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/)。研究证据不覆盖 ontology.md 的上层产品决定。

实现、验证、提交和推送分别按真实执行结果报告；文档完成不代表 KG OS compiler 或依赖库集成已经通过验收。
