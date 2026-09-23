# Phase 05：Graph Query & Execute

**状态：`in_progress`**

## 1. 目标与范围

在 Phase 01 已完成真实 Lithograph v0.3.0 SQL execution / streaming / cancellation host、Phase 02–04 已完成 Knowledge Base、认证、Runtime onboarding 与 Object surface 之后，Phase 05 把现有底层执行能力正式开放为 KG OS 公共 Graph 能力。

本 Phase 完成后，CLI 只新增两个 canonical Graph 命令：

```text
kg graph query
kg graph execute
```

本 Phase 交付：

- Graph `query`：显式 StateRef、只读 connection、operation-start State pin、完整 JSON result；
- Graph `execute`：显式 Branch、独占 read-write connection、每次 operation 重新 checkout、完整 JSON result；
- authenticated daemon Graph HTTP adapter；
- `lithograph_rows()` 到 HTTP NDJSON 的真正增量 streaming；
- pre-event error、terminal stream error、incomplete transport 与 CLI exit/stderr 映射；
- `kg graph query` / `kg graph execute` 的 inline/file/stdin Cypher、JSON params 与 `--stream`；
- Full-text、Managed Semantic、Raw Vector、Schema/SHOW、Version Procedure、`LOAD CSV` 与 transaction subquery 的公共 Graph passthrough 验收；
- request / daemon shutdown cancellation、client disconnect 与 pull-based backpressure 的 public end-to-end 验收。

本 Phase **不增加 Search DSL 或额外 Graph 命令**。Full-text 与 Semantic Search 继续通过 `kg graph query` 执行 Lithograph Cypher / procedure；不增加 `kg graph search/fulltext/semantic/traverse`，也不恢复 `object list/search`。

## 2. Design Inputs

- [Graph 原样执行与公共调用合同](../../design/graph.md#graph)；
- [Graph CLI](../../design/cli.md#graph-cli)；
- [Graph HTTP streaming framing](../../design/runtime.md#graph-http-streaming-framing)；
- [公共错误合同](../../design/contracts.md#公共错误合同)；
- [Managed Semantic integration readiness](../../design/implementation.md#managed-semantic-integration-readiness)；
- [D59 Cypher 原样执行 / 读写连接](../../design/decisions.md#d59-cypher-passthrough)；
- [D66 Lithograph v0.3.0 SQL-only / Provider-owned cache](../../design/decisions.md#d66-lithograph-v030-sql-only)；
- [Phase 01 Runtime & Lithograph Host](01-runtime-lithograph-host.md)；
- [Phase 03 Installation & Runtime Onboarding](03-installation-runtime-onboarding.md)；
- [Phase 04 General Object Read & Patch](04-object.md)。

本计划只拆分实现、验证与 Review；不重新定义 Cypher、Lithograph JSON、State/Branch identity、Full-text / Semantic 语义、transaction boundary 或 Object / Evolution 职责。

## 3. 依赖与当前基线

### 3.1 前置依赖

- Phase 00–04 均为 `done`；
- Phase 01 已有 `Host.Query / Execute / StreamQuery / StreamExecute`、read/write connection、StateRef resolve、Branch checkout、`lithograph()`、`lithograph_rows()`、真实 context cancellation 与 Provider-owned cache integration；
- Phase 02 已有 Knowledge Base bootstrap、公共 Bearer authentication 与 daemon error envelope；
- Phase 03 已有 business-command Runtime ensure、`KG_TOKEN -> auth.json` credential resolution 与正式 package/runtime 路径；
- Phase 04 已证明 Knowledge Node / Relationship 与 Ontology/Object 高层能力可以继续独立于 Graph passthrough，不需要为 Graph 增加另一套 Object discovery API；
- Lithograph v0.3.0 的 scalar/rows summary 固定提供真实 terminal `commit` 与 `counters`；KG OS 只做公共 Graph projection，不能猜测或伪造 State / durability。

Design Inputs、依赖顺序与 Acceptance 已齐全；当前没有需要用户重新确认的 Graph 产品语义。05.1–05.8 已完成当前工作树实现、本地/ fresh-source 验收与 Review，但最终 pushed SHA 的 Ubuntu Validate 尚未执行，因此 Phase 状态为 `in_progress`。

### 3.2 Lithograph baseline

继续使用当前冻结的 Lithograph v0.3.0、storage format 3、`CY25-2026.08` 与 SQLite 3.45.0+ SQL-only integration。

本 Phase 不修改 Lithograph 仓库，也不新增：

- application-facing Native query ABI；
- raw SQL / SQLite internal table 公共入口；
- Cypher parser、AST、rewrite 或 procedure allowlist；
- KG OS 自己的 Full-text / vector / top-k 执行器；
- Embedding HTTP client、query Vector 生成或第二套 cache；
- Graph 专用 transaction/version layer。

## 4. Phase 边界

### 4.1 本 Phase 拥有

```text
Graph public request/result mapping
  -> query / execute Kernel surface
  -> authenticated non-stream HTTP
  -> authenticated NDJSON streaming HTTP
  -> kg graph query / execute
  -> Full-text / Semantic / Lithograph JSON passthrough
  -> cancellation / transport / transaction hardening
  -> integration / review closure
```

### 4.2 明确不属于本 Phase

- `object list` / `object search`；
- `kg graph search` / `fulltext` / `semantic` / `traverse` 等第二套命令；
- Search DSL、Traversal DSL、GraphQL 或其它查询语言；
- Cypher 语句内容审查、关键字判定、AST parsing/rewrite；
- Graph request 上的 Object/Ontology reserved identifier、Vector 或 Binding candidate validation；
- arbitrary Cypher 的 hidden retry、hidden repair Commit 或统一 all-or-nothing 包装；
- Evolution / State / History / Diff / Merge 公共 surface；
- TypeScript SDK、Web 业务页面、Skill；
- 新 dependency、协议或数据库抽象，除非实现中出现当前真实且无法由现有基线解决的约束。

## 5. Feature 顺序

```text
05.1 Graph public result / summary mapping
 -> 05.2 Query / Execute Kernel surface
 -> 05.3 Non-streaming authenticated HTTP
 -> 05.4 NDJSON streaming HTTP
 -> 05.5 kg graph query / execute CLI
 -> 05.6 Full-text / Semantic / value passthrough E2E
 -> 05.7 Cancellation / transport / transaction hardening
 -> 05.8 Integration hardening / review closure
```

### Feature 05.1 Graph Public Result / Summary Mapping

- 定义服务端内部 Graph request/result projection，逻辑字段严格沿用 Graph owner 文档，不建立第二套 query model。
- `query` public result固定为 `{state,columns,rows}`；`execute` 固定为 `{state,columns,rows,counters}`。
- `columns/rows` 原样保留 Lithograph JSON v1 value encoding，包括 Node、Relationship、Path、Temporal、Point、UUID、Raw Vector 与 tagged Map。
- non-streaming `query.state` 必须等于本 operation 已 pin 的 immutable resolved Commit，并与底层 success summary一致；不返回调用方原始 Branch/Tag 字符串冒充 resolved State。
- non-streaming `execute.state/counters` 从 Lithograph success summary 的真实 `commit/counters` 投影；缺失、非法或自相矛盾的 terminal metadata不得伪装成功。
- KG OS 不把底层 `queryType/metrics/profile` 扩成第二套公共 Graph result；只投影已确认 logical contract要求的字段。

### Feature 05.2 Query / Execute Kernel Surface

- `query`要求非空 `at/cypher`，复用 Phase 01 read adapter，在 operation开始时解析 StateRef并 pin一个 `commit/...`；原始 Cypher统一以该 immutable Snapshot执行。
- `execute`要求非空 `branch/cypher`，复用 Phase 01 write adapter；每次 operation使用独占 write connection并在用户 Cypher 前重新 checkout目标 Branch。
- `execute`不接受 `baseState`，不继承 Object Patch strict-base、candidate validation或“一个请求恰好一个Commit”语义。
- `params`只接受 JSON Map并按 Lithograph JSON v1传递；不识别 `$semantic`、不裁剪 Raw Vector、不修改 Cypher bytes。
- 用户 Cypher内部显式改变 checkout / target时按 Lithograph合同执行；下一次 Graph operation必须重新建立自己的 State/Branch context，不能依赖 pool残留状态。
- `query`中写语句由底层只读 execution拒绝；KG OS不得自动切换到 `execute`。

### Feature 05.3 Non-streaming Authenticated HTTP

- 固定使用 `POST /api/v1/graph/query` 与 `POST /api/v1/graph/execute`；request `Content-Type` 为 `application/json`。
- response transport由 `Accept`选择：缺省或选择 `application/json` 时使用non-stream JSON；选择 `application/x-ndjson` 时进入同一logical operation的streaming path；无法协商到这两种类型时返回 `406` public error。若两者都可接受，按标准quality值选择，quality相同或未区分时优先JSON，避免普通HTTP client意外进入stream。
- 两个入口都复用现有 Bearer middleware、request body limit、public error envelope、context lifecycle 与 method validation。
- request一次解码完整 logical input并只调用一次 Kernel operation；不得由 daemon/CLI拆成多个 query。
- success使用 `application/json`返回公共 Graph result；底层 raw summary只用于验证/投影，不直接泄露成额外 wire contract。
- parse/type/state/branch、Lithograph数据库错误与 runtime extension/provider错误沿用公共错误合同；不得按 message substring重新分类。

### Feature 05.4 NDJSON Streaming HTTP

- 同一 Graph endpoint 在 `Accept: application/x-ndjson` 时必须直接消费 Phase 01 `StreamQuery / StreamExecute`；CLI `--stream`只负责选择该 media type，不新增第二条stream route或logical request字段。
- success Content-Type固定为 `application/x-ndjson; charset=utf-8`。
- Lithograph `columns -> row* -> summary`逐个映射为公共 NDJSON event；query terminal summary只输出 `state`，execute terminal summary输出真实 `state/counters`。
- 第一个 Lithograph event完成 adapter encoding前不得提交2xx；此前失败返回普通non-2xx JSON error。
- 一旦已输出 `columns` 或 `row`，后续 daemon/database failure尽力发送唯一 terminal `error` event；`summary`与`error`互斥。
- 每个 event必须完成 encode -> write -> flush 后才允许从 SQLite拉取下一 event；不得引入无界 goroutine/channel预读。
- client disconnect、write failure或request cancel必须关闭 rows并传播 `context.Context`，使底层 interrupt/cursor cleanup真实发生。

### Feature 05.5 `kg graph query` / `kg graph execute`

- root command tree新增且只新增 `graph query` / `graph execute`。
- Cypher正文支持三种互斥来源：`--cypher`、`--cypher-file`、未提供前两者且stdin非TTY时的implicit stdin；stdin为TTY且无显式正文时直接usage error。
- params只支持互斥 `--params <json-map>` / `--params-file <path>`；不占用stdin，不接受JSON非object。
- `query --at <StateRef>`必填；`execute --branch <branch>`必填；execute可选 `--author/--message`。
- 默认stdout为一个compact JSON document；`--pretty`只改空白。
- `--stream`与`--pretty`互斥；stream stdout只保留成功路径 `columns/row/summary` NDJSON。
- non-stream请求固定发送 `Accept: application/json`，`--stream`固定发送 `Accept: application/x-ndjson`；两种模式复用同一 query/execute endpoint和request JSON。
- daemon terminal `error` event转换为stderr public error并exit 1，保留已输出partial stdout；没有 `summary/error` 的断流转换为本地 `IO_ERROR`并exit 3。
- CLI继续复用 Phase 03 Runtime ensure与credential resolution，不增加 `--endpoint/--host/--token`。

### Feature 05.6 Full-text / Semantic / Value Passthrough E2E

- 通过真实公共 Graph query验证结构化 MATCH/WHERE/path traversal、Schema `SHOW` 与其它正常只读Cypher。
- 通过真实 Ontology-managed Full-text Index执行 Lithograph Full-text procedure；目标 State使用实际versioned analyzer，不生成KG OS search API。
- 使用现有 OpenAI-compatible Provider extension + 本地 test HTTP provider执行真实 Semantic query；query参数为普通 String，cache只写独立 provider-owned SQLite database。
- 验证 Semantic cache跨read connection / daemon reopen复用不改变 graph/schema/history/ref；历史 State使用自己的versioned IndexDefinition/providerConfig。
- 验证 Raw Vector parameter/result、Node/Relationship/Path与其它 Lithograph JSON tagged value不被Graph层裁剪。
- 用代表性 `LOAD CSV` / Version Procedure / Schema operation证明不存在语句白名单；只读/读写合法性仍由所选connection与Lithograph决定。

### Feature 05.7 Cancellation / Transport / Transaction Hardening

- 覆盖普通长query、Semantic Provider等待、side-effecting stream、`CALL ... IN TRANSACTIONS` 与 daemon shutdown期间的request cancellation。
- stream consumer提前关闭、client disconnect或socket/write failure时，daemon不得后台继续drain execution；未finalize的普通write按Lithograph rollback语义处理。
- 已经由 transaction subquery durable的成功batch不能因后续stream/error/transport失败被报告成整体rollback。
- Lithograph已经finalize-success但summary result-delivery失败的场景不得被KG OS描述成“确定无副作用”，CLI/daemon不得自动重放未知结果的write。
- Semantic Provider failure/cancellation不能转换成partial top-k success；Provider 正在阻塞的单次 HTTP system call 按其 versioned `timeout_ms` 与 cancellation checkpoint 合同结束，KG OS 不覆盖 timeout。Full-text analyzer unavailable不能转换成空结果；raw Graph 保留 Lithograph 实际公开 category，不按错误文案重分类。
- public Graph passthrough即使产生高层invalid Snapshot也不自动修复；后续 Object/Ontology/Evolution按各自 consistency合同报告。

### Feature 05.8 Integration Hardening / Review Closure

- 用真实 bundled SQLite + Lithograph v0.3.0 + provider extension验证Kernel、daemon、CLI完整Graph链路，不以mock executor替代核心E2E。
- 保持 Phase 00–04的Ontology/Object/onboarding/runtime验收通过。
- 检查生产代码没有 Cypher parser/rewrite、Search DSL、procedure allowlist、Graph-specific Vector/reserved filter、hidden retry或第二套database host。
- 检查 streaming路径没有无界buffer、完整结果materialization或background completion。
- 完成Phase Review、文档状态同步、full validation、fresh-source validation与要求的远端CI。

## 6. Acceptance Matrix

| ID | 场景 | 必须证明的结果 |
| --- | --- | --- |
| A | Query Snapshot | Branch/Tag/Commit StateRef在operation开始时只解析并pin一次；结果返回exact `commit/...`，并保持同一Snapshot |
| B | Execute Branch | 每次execute显式Branch + 独占write connection + fresh checkout；无`baseState`、无遗留connection context |
| C | Non-stream result/value | query/execute JSON shape正确；state/counters来自真实summary；Lithograph JSON tagged value与Raw Vector无损透传 |
| D | HTTP/auth/error | 固定POST query/execute endpoint与JSON/NDJSON Accept协商；统一Bearer认证、request/error mapping与context lifecycle；失败不产生伪成功result |
| E | Streaming framing/backpressure | `columns -> row* -> summary`；逐event flush后再pull；pre-event error与terminal error边界正确，无完整结果buffer |
| F | CLI contract | query/execute参数、Cypher inline/file/stdin、params inline/file、pretty/stream互斥、stdout/stderr/exit行为符合CLI设计 |
| G | Cancellation/transport | client disconnect、request cancel、daemon shutdown真实中断底层execution；incomplete stream不误报成功或确定rollback |
| H | Full-text / Semantic | 真实Full-text与Semantic都只经`graph query`工作；Semantic普通String、Provider cache隔离与历史Index配置保持正确 |
| I | Passthrough / transaction semantics | SHOW、Raw Vector、LOAD CSV、Version/Schema与transaction subquery无KG OS语句白名单；部分durability不被改写 |
| J | Regression / delivery | Phase 00–04能力无退化；无Search DSL/第二host/额外Graph命令；本地/fresh-source/远端CI全部取得证据 |

## 7. 关键失败路径

必须显式覆盖：

1. `query.at` / `execute.branch`缺失、非法或不存在；
2. Cypher为空、非法UTF-8、inline/file/stdin来源冲突，params不是JSON object或两个params来源同时出现；
3. read-only `query`收到写Cypher，由Lithograph拒绝且KG OS不改走write connection；
4. Branch/Tag在query开始后移动，当前operation仍保持已pin State；
5. execute的用户Cypher改变checkout后，下一operation仍重新checkout其显式Branch；
6. Lithograph success envelope / summary缺失、malformed、query state不一致或execute commit/counters无法解释；
7. stream在第一个event前失败，与已经输出columns/row后的失败分别使用non-2xx JSON和terminal NDJSON error；
8. client在partial rows后断开，daemon停止pull并取消底层execution；
9. ordinary write stream在summary前失败/取消，与post-finalize summary delivery failure的durability语义不混淆；
10. `CALL ... IN TRANSACTIONS`已有durable batch后发生later failure，不声称整个execute已rollback；
11. Semantic Provider timeout/failure/cancel，不能返回缺候选的成功top-k；取消通过 SQLite interrupt 传播，在 Provider callback checkpoint 生效，阻塞中的单次 HTTP system call 仍由 IndexDefinition 保存的 `timeout_ms` 上界约束；provider cache允许按自身合同保留；
12. Full-text历史Index analyzer当前不可用时，保留 Lithograph 实际公开错误 category并失败，不按 message 猜成 KG OS code，也不返回空结果；
13. Raw Vector、reserved-looking identifier或高层invalid Binding状态通过Graph合法执行时，KG OS不附加Object profile拒绝；
14. non-streaming大结果超过底层/transport资源边界时失败，不自动切stream或静默截断。

## 8. 验证计划

### Targeted

- Graph request validation、State/Branch context与summary projection；
- Lithograph JSON params/result round-trip，含tagged Map、large Integer、Temporal、Point、UUID、Raw Vector；
- non-stream result state/counters与malformed summary处理；
- HTTP固定route/method、JSON request、Accept negotiation、auth/content-type/error mapping；
- NDJSON encoder、event ordering、terminal error、flush/backpressure与disconnect；
- CLI Cypher/params source exclusivity、JSON object validation、pretty/stream互斥与exit contract。

### Integration

- 真实Lithograph v0.3.0：historical query pin、read-only write rejection、execute fresh Branch checkout与read/write结果；
- daemon HTTP + Bearer：non-stream query/execute与public error；
- HTTP streaming：零行、多个row、write stream、terminal success/error、disconnect/cancellation；
- CLI真实Runtime auto-start + credential fallback + query/execute normal/stream路径；
- Ontology-managed Full-text真实query；
- OpenAI-compatible Provider extension +本地HTTP fixture的真实Semantic query、cache miss/hit、reopen、historical State与 cancellation checkpoint；
- Raw Vector、SHOW、Version/Schema、LOAD CSV与transaction subquery代表性passthrough；
- ordinary write与`IN TRANSACTIONS`在cancel/result-delivery failure下的真实durability观察。

### Repository gates

- `pnpm check:quick`；
- 与改动直接相关的Go targeted tests；
- `pnpm validate`；
- 独立fresh-source `pnpm run setup && pnpm validate`；
- `git diff --check`；
- Markdown / local links / spelling按仓库现有门禁；
- Ubuntu 24.04 x64 GitHub Actions Validate取得真实成功结果后才允许 `done`。

## 9. Review 重点

Phase Review至少检查：

1. Graph public surface是否只有`query/execute`，没有search/fulltext/semantic/traverse快捷命令或Object list/search复活；
2. `query`是否只选read connection并pin State，`execute`是否每次独占write connection并重新checkout；
3. 是否完全没有Cypher parser、AST、rewrite、关键词读写判断或procedure allowlist；
4. public result是否只投影设计字段，State/counters是否来自真实resolved context与Lithograph summary，没有猜测；
5. Graph params/results是否保持Lithograph JSON v1，Raw Vector/reserved identifier是否没有被Object profile误拦截；
6. streaming是否真接`lithograph_rows()`，逐event write/flush再pull，没有无界buffer或先物化完整结果；
7. pre-event error、terminal error、incomplete transport与CLI stderr/exit是否严格区分；
8. cancellation/disconnect是否真实到达SQLite interrupt/cursor cleanup，不以kill进程或后台drain代替；
9. ordinary write、post-finalize delivery failure与transaction-subquery partial durability是否没有被KG OS改写；
10. Full-text/Semantic是否只是Graph public path验收，没有新增KG OS search/vector/cache实现；
11. Phase 00–04共享auth/runtime/error/CLI primitive是否复用，没有引入第二套HTTP client、database host或无当前需求的新dependency。

Review发现问题后修复并重跑受影响验证；没有新改动或新finding时停止重复验证。

## 10. 完成条件

Phase 05只有同时满足以下条件才能进入 `done`：

1. 05.1–05.8全部真实实现；
2. A–J Acceptance全部取得当前工作树/提交的真实证据；
3. `kg graph query` / `kg graph execute` 的non-stream与stream完整链路均在真实Lithograph上闭环；
4. Full-text / Semantic / Raw Vector与代表性Lithograph passthrough取得public E2E证据；
5. cancellation、client disconnect、terminal stream failure与transaction partial-durability边界均有真实验证；
6. Phase Review findings全部关闭；
7. README、Design、Development、Guide/vlog在实际实现需要时按各自职责同步；
8. full local validation、fresh-source validation与Phase要求的远端CI真实通过；
9. 没有secret、database fixture、provider cache、build artifact、临时Cypher/params文件或unrelated改动进入提交。

## 11. 当前状态

2026-09-24：05.1–05.8 已在当前工作树完成本地实现、真实 Lithograph v0.3.0 public E2E 与持续 Review。原 A–J Acceptance 保持不变；本次只依据实际证据更新进度，不因实现结果削弱验收。

| Acceptance | 当前证据 | 状态 |
| --- | --- | --- |
| A Query Snapshot | 真实 Lithograph integration 覆盖 Branch/Commit historical query、operation-start resolved State、query summary与pin State一致；只读入口写语句由Lithograph拒绝 | 本地通过 |
| B Execute Branch | 每次 execute 使用 write connection + fresh Branch checkout；测试覆盖用户 Cypher 改 checkout 后下一 operation重新建立目标 context，且公开合同没有 `baseState` | 本地通过 |
| C Non-stream result/value | query/execute JSON shape、真实 summary state/counters、Large Integer、tagged Map、Date、Point、UUID、Node/Relationship/Path与Raw Vector均有真实E2E | 本地通过 |
| D HTTP/auth/error | 固定 POST query/execute、Bearer、JSON/NDJSON Accept、406/pre-event public error、Graph-specific `BRANCH_HEAD_MOVED/MERGE_*` category 与 malformed response均有测试 | 本地通过 |
| E Streaming framing/backpressure | `lithograph_rows()` 真实 `columns -> row* -> summary`；逐event write+flush后再pull；terminal error、write failure、incomplete transport与零列状态机均有自动/真实数据库证据 | 本地通过 |
| F CLI contract | inline/file/stdin Cypher、inline/file params、pretty/stream互斥、stdout/stderr/exit、真实 packaged Runtime auto-start 下 query/execute normal/stream均有E2E | 本地通过 |
| G Cancellation/transport | request-context cancel、真实 client disconnect、daemon shutdown、普通 write rollback、post-finalize summary delivery failure与transport incomplete均有真实E2E | 本地通过 |
| H Full-text / Semantic | Full-text query、不可用query-time analyzer保留Lithograph `SEMANTIC_ERROR`且不返回空成功；Semantic String query、Provider cache miss/hit、historical IndexDefinition、reopen与cancellation checkpoint均有真实E2E | 本地通过 |
| I Passthrough / transaction | SHOW、Version Procedure、LOAD CSV、Raw Vector、reserved-looking identifier、Schema/transaction subquery均经raw Graph执行；已有durable batch不被伪装整体rollback | 本地通过 |
| J Regression / delivery | Phase 00–04 regression gates保持通过；生产源码无Search DSL/Cypher parser/rewrite/procedure allowlist/第二host。主树与独立fresh-source完整 `pnpm validate` 均成功，Go coverage **90.0%**、jscpd 0 clones；最终 pushed SHA Ubuntu Validate尚未运行 | 本地通过 / 远端待验收 |

### Phase Review

本轮持续执行 review → 修复 → re-review，并关闭以下 task-affecting finding：

- Graph params最初若复用 `map[string]any` 会使大JSON整数经过 `float64` 失真；现公共Graph request以raw JSON Map贯穿daemon/kernel到Lithograph，真实Large Integer/Raw Vector测试证明无损。
- NDJSON projector最初以nil slice判断是否已见 `columns`，合法零列结果可能绕过重复columns检测；现使用独立状态位维护stream protocol。
- Graph错误若直接复用Object Patch映射，会把Lithograph `BRANCH_HEAD_MOVED`错误改写成 `STALE_BASE_STATE`；现Graph保留数据库 `BRANCH_HEAD_MOVED/MERGE_*`公开category，Patch语义不受影响。
- 对照Lithograph v0.3.0真源确认OpenAI-compatible Provider cancellation只在callback checkpoint观察；阻塞中的单次HTTP system call由versioned `timeout_ms`限定。KG OS设计/验收已同步，不增加第二HTTP client或伪造异步抢占。
- 对照Lithograph Full-text实现确认历史/query-time analyzer不可用没有专用数据库category；raw Graph保持Lithograph实际 `SEMANTIC_ERROR/SCHEMA_ERROR`，不解析Cypher/message猜成KG OS code，也不伪装为空结果。
- jscpd发现Graph query/execute handler与Accept解析存在重复；仅提取请求准备及content-negotiation最小helper，最终duplicate gate为 **0 clones**。
- Go total statement coverage一度降到89.8%；通过增加Graph输入/响应/stream协议真实失败边界测试恢复并稳定为 **90.0%**，未降低仓库阈值。
- 最终生产源码扫描确认只有 `graph query/execute`，没有Search DSL、Graph快捷search/fulltext/semantic/traverse、Cypher parser/rewrite、procedure allowlist、Object list/search复活、新dependency或第二套database host。

主工作树完整 `pnpm validate` 已通过；独立 `/tmp` fresh-source clone从 `HEAD + 当前tracked diff + untracked Phase 05 source` 重建，在不复用主树 `node_modules` / build artifact的条件下执行 `pnpm run setup && pnpm validate` 同样通过。两套验证均覆盖race、真实Lithograph v0.3.0 native suite、Go statement coverage **90.0%**、govulncheck、TS/V8与type coverage 100%、jscpd 0 clones、unused/version/dedupe、build、Playwright、package、licenses、npm audit与diff gate。

`git diff --check` 通过；当前版本状态没有secret、database/provider cache、extension cache、build artifact或临时Cypher/params文件。当前 reviewed local scope 没有剩余 task-affecting implementation finding。

### 剩余条件

- Phase完成条件要求**最终 pushed SHA**的 Ubuntu 24.04 x64 GitHub Actions Validate真实成功。该远端门禁尚未取得成功证据；Phase保持 `in_progress`，不能标记 `done`。
