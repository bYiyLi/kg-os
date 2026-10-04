# Phase 14：Web

<!-- cspell:ignore EACCES EEXIST GHSA -->

## 目标与状态

`in_progress`。本阶段把已确认的 [Web 设计](../../design/web.md)接入现有 Runtime、SDK 与业务 API，交付可以真实浏览、查询、编辑和管理版本的内置 Web 工作区。

完成后的主流程：

```text
打开当前 Instance 的 daemon endpoint，显式连接
  → 选择并固定浏览 State
  → 查询并阅读独立结果帧 / 本体图谱
  → 显式编辑，预览并确认一次高层 Patch
  → 查看真实回执，按需刷新当前分支
  → 刷新 / 重开后重新认证，恢复已保存输入和工作位置
```

这是一个完整的交付与验收 Phase，内部按五组 Feature 实施。局部测试、组件画板或先后依赖不另建顶层 Phase。用户明确授权按本计划进行功能开发、审查修正与验收，并于本轮另行授权提交推送和六平台 CI 跟进；五组功能已实现，修复后的产品源码取得本地与六平台 native/package 证据，完整安全门禁仍未闭环，实际结果见[本轮实施记录](#本轮实施记录)。发布或部署不在本轮授权内。

## 设计输入

- [Web owner](../../design/web.md)：交互、帧生命周期、草稿、持久化与连接工程合同；实现核对以[当前能力与工程待办](../../design/web.md#当前能力与工程待办)及[动态验收边界](../../design/web.md#设计自查与后续动态验收边界)为入口。
- [统一功能材料与覆盖矩阵](../../design/web-materials.md)：Q1/Q2、E1/E2/E3、O1/O2、V1–V4、R1/R2 与 A1；状态表是条件成立时的组件表现，不是新页面。认可的白蓝风格和首版简化范围以 Web owner 为准。
- [一致评审样例](../../design/web-examples.md)：作为真实测试 fixture 的输入参考；通过正式 API 建立所需模型、数据和版本，符号 State、短 hash、示意 JSON 与计数不作为 wire 或固定返回值。
- [Object 公共调用合同](../../design/object.md#object-公共调用合同)：同 State batch read、canonical YAML、Git Extended Diff、strict base、alias 与 transition；[Ontology](../../design/ontology.md#公共可编辑格式)、[共享资源](../../design/ontology.md#共享资源与聚合编辑)和 [Domain](../../design/ontology.md#domain业务组织)约束模型聚合编辑。
- [Knowledge 数据访问](../../design/graph.md#knowledge-数据访问)及 [Graph 调用合同](../../design/graph.md#graph-公共调用合同)：真实 Property Graph、typed values、query/execute 与底层事务边界。
- [Evolution 调用合同](../../design/evolution.md#evolution-公共调用合同)：State、State Data、ref、ancestry/history/diff 和 Merge Session；不从图稿推导接口。
- [Client SDK](../../design/client.md#kgossdk)、[Runtime 内置 Web](../../design/runtime.md#web-hosting)、[Web operational 数据](../../design/runtime.md#web-operational-数据目录)、[公共错误](../../design/contracts.md#公共错误合同)及 [Web 错误映射](../../design/contracts.md#web-持久数据错误方案)：共享 transport、同源 loopback、认证、存储隔离与错误分类。
- [工程映射](../../design/implementation.md)、[共同完成条件](../README.md#6-phase-通用完成标准)和[开发指南](../../guide/development.md)：实现边界、仓库门禁与实际操作入口。本计划不复制产品规范或维护第二套命令指南。

## 开始实施前的前置依赖与缺口

2026-10-04 核对 `main@181628b45c1600476514dfc129a5053c6d394b9e` 与当前未提交 Web 设计工作树。Phase 00–13 已完成；其历史成功是前置基线，不是本阶段验收证据。

| 依赖 | 当前证据与本阶段处理 |
| --- | --- |
| Runtime / init / 认证 / 内嵌产物 | [Phase 12](12-first-run-cli-productization.md)、[Phase 13](13-init-wizard-credential-boundary.md)及现有 [Web 构建](../../../scripts/build.mjs)、[内嵌交付](../../../internal/webui/webui.go)已提供基础；继续使用一个 Instance 的 daemon endpoint |
| Ontology / Object / Graph | [Phase 02](02-ontology.md)、[04](04-object.md)、[05](05-graph.md)已提供业务合同与实现；本阶段接入现有 API，不新建模型/对象发现、preview 或提交状态接口 |
| Evolution Core / Merge | [Phase 06](06-evolution-core.md)、[07](07-evolution-merge.md)与 [SDK](../../../packages/sdk/src/client.ts)、[HTTP adapter](../../../internal/daemon/api.go)已有对应操作；新增的是前端工作流 |
| TypeScript / npm Runtime | [Phase 08](08-typescript-client-npm-runtime.md)及后续六平台基线可复用；Web 通过 SDK 访问，不能调用 CLI 子进程或本机文件 |
| Web 页面 | [当前 shell](../../../packages/web/src/shell.tsx)只有壳层，五组 Feature 均待实现 |
| Web 存储与受控接口 | [Runtime Paths](../../../internal/runtimeprofile/profile.go)、HTTP 与 SDK 尚无 `.kgos/web`、`web.data / web.cache`；P14-01/02 实现 owner 已确定的工程方案，包括维护用导出与缓存清理能力 |
| 连接与响应预算 | 当前有 SDK fetch 注入点与 AbortSignal，没有 daemon boot guard 或 Web 有界接收 adapter；由 P14-01/02 实现，不改变 CLI / 第三方默认合同 |
| 业务浏览器验收 | [现有 E2E](../../../tests/e2e/web-shell.spec.ts)仅验证真实 Runtime shell 与不存在的 readiness bypass；需扩展[现有 Runtime fixture](../../../scripts/serve-built-runtime.mjs)，不能把 shell 成功算作业务验收 |

未发现必须先追加产品决定的具体阻塞。字段编码、payload shape、内部 SQLite schema 与 SDK mapping 按已确认 owner 合同完成；实现中若出现两种会改变调用方可观察行为且现有真源不能裁决的答案，只暂停依赖该分歧的工作并报告。

## 范围与 Feature

每个 Feature 都包含自己的成功、异常、安全和恢复验证；最后一组负责贯通与交付，不把前面的保护行为延后到最终 Review。

| 内部实施组 | Feature | 交付物与主要落点 | 依赖 / 设计入口 | 验收 |
| --- | --- | --- | --- | --- |
| 1. 连接与 `.kgos/web` 持久基础 | P14-01 Daemon Web 数据 | Runtime Paths、独立普通 SQLite UI store、缓存、受控 API、共享错误映射与认证后的 boot guard；落在 Runtime/daemon adapter，隔离现有 Kernel | 当前 Runtime 基线；[Web 工作区数据](../../design/web.md#web-工作区数据)、[连接](../../design/web.md#连接认证与恢复) | [A14-01](#a14-01-daemon-存储与接口) |
| 1. 连接与 `.kgos/web` 持久基础 | P14-02 SDK 与连接适配 | SDK `web.data / web.cache` 和 Blob 下载；Web fetch 注入 guard、有界 JSON/NDJSON 接收、每请求取消；简短显式连接与 pinned 上下文 | P14-01；[SDK](../../design/client.md#kgossdk)、[响应预算](../../design/web.md#接收与显示预算)、[当前上下文](../../design/web.md#信息架构与当前上下文) | [A14-02](#a14-02-sdk连接与上下文) |
| 1. 连接与 `.kgos/web` 持久基础 | P14-03 记录保存与恢复基础 | workspace/editor/frame/query/draft 记录接入、自动保存、按记录 CAS、原位置恢复；收藏查询仅填入编辑器，维护能力不新增日常管理页 | P14-01/02；[记录生命周期](../../design/web.md#持久记录与可丢弃缓存)、[库绑定与恢复](../../design/web.md#库绑定格式与恢复)、[多窗口保存](../../design/web.md#受控-api-与多窗口保存) | [A14-03](#a14-03-自动保存与恢复) |
| 2. 查询与结果帧 | P14-04 查询生命周期 | 顶部编辑器、逐帧请求快照、查询/高级执行、重跑/折叠/关闭/全屏/取消、排队与预算；落在 Web 并复用 SDK parser | P14-02/03；[帧流](../../design/web.md#编辑器与结果帧流)、[State](../../design/web.md#state-固定与重跑)、[反馈](../../design/web.md#查询状态与反馈) | [A14-04](#a14-04-独立帧与执行) |
| 2. 查询与结果帧 | P14-05 图投影与检查器 | 真实 typed 图值投影、Graph/JSON、帧内检查器、有界邻居展开、局部布局和按需缓存恢复 | P14-04；[图投影](../../design/web.md#图投影与帧内检查器)、[高级执行](../../design/web.md#高级执行与无图写入结果) | [A14-05](#a14-05-图阅读与预算) |
| 3. Knowledge / 本体编辑 | P14-06 Knowledge 草稿与 Patch | 显式新建/编辑/删除、canonical base、无损表单与按需 YAML/Patch、预览确认、可靠保存后一次提交及真实回执 | P14-03/05；[显式编辑](../../design/web.md#显式编辑工作流)、[删除](../../design/web.md#节点关系与删除影响)、[保存与提交](../../design/web.md#保存与知识提交) | [A14-06](#a14-06-knowledge-草稿与提交) |
| 3. Knowledge / 本体编辑 | P14-07 Ontology 图与聚合编辑 | 全局/Domain/Definition 图、同 State 详情与分页、字段/约束/索引聚合编辑；复用 P14-06 的 Patch/提交路径，支持同请求 Ontology + Knowledge | P14-03/06；[本体图谱](../../design/web.md#本体图谱)及 Ontology/Object owner | [A14-07](#a14-07-本体图与模型变化) |
| 4. 版本演化 | P14-08 提交列表与覆盖 DAG | 紧凑列表、可见范围渲染、分页/局部搜索、真正纵向 parent DAG、版本选择与 ref 变化提示 | P14-02/03；[版本区域](../../design/web.md#版本区域)；旧帧保护与 P14-04/05 联验 | [A14-08](#a14-08-历史与覆盖-dag) |
| 4. 版本演化 | P14-09 State / History / Diff / ref | State 与 sidecar 详情/编辑、显式 State create、Branch/Tag 操作、业务 History、两 State 结构化 Diff；State Data 未发送输入接入草稿 | P14-03/05/08；[详情与差异](../../design/web.md#state-详情与两-state-差异)、[ref](../../design/web.md#branch-与-tag) | [A14-09](#a14-09-state差异与-ref) |
| 4. 版本演化 | P14-10 Merge 工作流 | Session start/list/get/conflicts/resolve/finalize/abort、冲突选择、精确 revision 与未发送方案恢复 | P14-03/09；[Merge](../../design/web.md#merge-session)、[恢复](../../design/web.md#持久记录与可丢弃缓存) | [A14-10](#a14-10-merge-session) |
| 5. 完整流程与交付验证 | P14-11 阶段贯通 | 真实 Runtime 浏览器 E2E、打包/平台回归、性能与响应式测量、最终 Review 和按职责文档同步 | P14-01–10；[动态验收](../../design/web.md#设计自查与后续动态验收边界)、[键盘与响应式](../../design/web.md#键盘与响应式) | [A14-11](#a14-11-端到端与交付)及[工程门禁](#工程验证门禁) |

### 非目标

本阶段不增加账号/角色、远程部署、自动读取或持久化 token、跨端口发现、新版本模型、独立 Index CRUD、全历史全文搜索、任意文件接口、Graph dry-run/affected IDs 或提交状态服务。Skill、产品发布、Git tag、npm publish 与部署不属于本阶段。

按[首版简化范围](../../design/web.md#信息架构与当前上下文)，不建设恢复中心、缓存/容量管理页、回执中心或常驻异常卡；导出/缓存清理等已定义维护 API 在 P14-01/02 实现和验收，浏览器导入、整库 reset 与未来补充入口不扩成首版工作流。

## 实现顺序与依赖

```text
1. P14-01 daemon store/API/boot guard
      → P14-02 SDK + Web fetch/connection/pinned context
      → P14-03 record autosave/CAS/restore
2. P14-04 frame lifecycle → P14-05 graph/inspector
3. P14-06 Knowledge draft/Patch → P14-07 Ontology aggregate
4. P14-08 list/DAG → P14-09 State/History/Diff/ref → P14-10 Merge
5. P14-11 real E2E/packaged/platform gates/final review
```

这是默认推进顺序，Feature 表给出实际依赖。P14-02 先提供基础 State 解析/切换与显式目标 Branch，保证查询和编辑不等待完整历史 UI；P14-08 再复用该上下文补齐版本列表/DAG。P14-03 提供各记录/subtype 的保存基础，帧、Object、State Data、Merge 各 Feature 再接入自己的恢复校验。UI 库只存操作数据，不能用记录保存替代真正 Kernel 提交。

各 Feature 取得针对性验收与局部 Review 后再接依赖它的功能；需要上下游的场景在两者具备时联验，并在 P14-11 取得完整阶段证据。组件的键盘、窄屏、错误反馈与预算随功能落实，最终阶段测量和回归。设计覆盖按材料 ID → Feature → Acceptance 追踪，不能按画板数量机械拆分交付单位。

## Acceptance

以下是本阶段必须取得的证据，实际结果集中记录在[本轮实施记录](#本轮实施记录)。验收引用 owner 的规则和工程初值；不另建第二份产品合同。

### A14-01 Daemon 存储与接口

1. 真实 daemon 经认证按需创建 `.kgos/web`；普通 SQLite/WAL、同步提交、私有权限、固定路径及同目录原子发布符合 owner。并发首次请求、I/O/空间失败和路径重定向不会发布半库、越界或泄露内容；Web 故障不阻断已有业务 API。
2. `info/list/read/save/delete/export` 与 `cache.write/read/clear` 经实际 HTTP/SDK 验证。记录 revision 无精度损失；list cursor 与分页快照绑定；save/delete 在同一 UI transaction 校验 CAS，确认不早于 commit。删除清空正文、保留墓碑，frame 删除使缓存 miss 并拒绝晚到写入。
3. UI 保存/删除/缓存不创建 Knowledge State、移动 Branch 或影响 Snapshot Diff/Merge。未完成/非法编辑文本可以保存；各预算、错误 envelope、不存在与 cache miss 不混用。
4. 缓存写入先有可靠保存的有效 frame 记录；完整 typed 结果原子发布，TTL/LRU、总量/单项限制与失败 miss 可验证。execute/部分/取消/截断结果不能被发布为完整只读缓存。
5. 首版建立 v1 格式，验证已有损坏、较新格式、databaseId 不符时保留原件和恢复边界；不虚构历史格式或强制建设无输入的迁移器，若实现明确升级则验证事务失败保留旧数据。不同 Workspace 隔离。压缩一致导出使用真实 driver 验证删除正文清理、无 WAL/secret 泄露、临时文件清理，备份失败不降级为普通原文件下载。
6. boot guard 在 Bearer 认证后、操作前执行；不同 boot 的读取和写入均被拒绝。`info` 在存储故障时仍能返回进程 guard；无 header 的既有 CLI/第三方合同保持可用。

### A14-02 SDK、连接与上下文

1. 新 namespace 复用 SDK 共享错误/协议解析，导出为 Web Platform Blob，无 Node-only 依赖。Web adapter 在 SDK 解码前按 owner 限制 JSON/NDJSON bytes/chunks，保留同一个 AbortSignal；下载流不进 JSON decoder。
2. 显式连接先取得 boot/store 诊断，再带 guard 访问业务 API。401 清除失效内存凭证；boot 变化停止旧连接所有服务器动作并保留输入；重启/复制目录复用端口与 token 的场景不误发操作。正常恢复须显式重新连接。
3. token 不进 URL、cookie、browser storage、记录、导出或日志；刷新需重新认证。UI store 不可用时仍可浏览 Kernel 数据，但依赖可靠草稿保存的提交不可绕过。
4. StateRef 成功解析后才切新上下文；失败保留可用旧视图，解析期间禁止依赖新上下文的执行。顶部、本体、帧和对象选择的迟到响应只能更新对应 generation；A→B 后 A 的详情不覆盖 B。
5. 通过现有 ref 接口观察跨 Web/CLI 指针变化，只提示手动刷新；Tag/Branch 移动或本页写入不静默切当前 commit，不修改旧帧。所选 ref 被删除时标明引用不存在，原 commit可读则保留只读上下文，不自动回 main；目标 Branch不存在时保留草稿并禁止提交。

### A14-03 自动保存与恢复

1. 各 kind 与 draft subtype 保存完整原输入及其所需 metadata，收藏查询只填编辑器。已保存内容重新认证后恢复原位置；未确认保存才提醒离开，关闭事件不被当作最后保存保证。
2. 一条记录最多一个 in-flight save；新输入仍 dirty，旧响应只确认发送时的版本。lost response 用 `lastMutationId` 和内容核对，不能仅靠 revision 增长宣称保存成功；quota/I/O 失败保留旧确认版本和本窗口输入。
3. 两窗口不同记录可各自成功；同记录竞争保留双方版本，真实 CAS 冲突才比较/另存副本，不自动覆盖。旧窗口不能复活 deleted ID；storeId 改变先停保存。外部保存不替换当前窗口 State、语句或视口。
4. 恢复不自动执行查询/写入，不把别的窗口的运行中记录改成终态。缓存 miss 保留帧 metadata，按原 State 另建帧须用户触发；原 State 不存在仍保留输入，不转成当前 State。
5. Object、Merge、State Data 恢复分别在 P14-06/10/09 重读其权威数据后启用动作；UI revision 不替代 Knowledge baseState、Session revision 或不存在的 sidecar CAS。

### A14-04 独立帧与执行

1. 每次运行/重跑冻结语句、params、模式、commit/Branch，另建独立帧；编辑器后续变化不改旧记录。主重跑按原 State，按当前 State 新跑有明确入口；折叠/关闭/全屏/Graph/JSON 不改变其他帧 ownership。
2. 新只读帧在请求前固定 commit，传给 query `at`；流中 rows 不等待 summary 才决定其 State。唯一 summary 与正常 EOF 后才标完成并核对 State；summary 后数据、terminal error、缺 summary/EOF、零行和断流分别验证，异常不伪装完整结果。
3. 折叠继续运行；取消使用原请求 signal；运行中关闭同时失效执行/详情/邻居 generation。已缓冲 row/summary 与晚到保存/缓存回调不会复活、完成或覆盖已取消/关闭帧。
4. 活跃流、队列、每帧/整页接收预算真实触发，等待任务可取消且上下文冻结。接收触顶主动 abort 并标部分；图显示受限与接收不完整可区分。
5. 高级执行显式 Branch、重新观察 head、无 strict base 或自动重试；scalar/无 rows 显示实际 JSON/summary/counters，不造新 State 或 affected IDs。取消/断连标写入待核对，不能承诺回滚；继续探索先在实际返回 State 新建只读帧。

### A14-05 图阅读与预算

1. 用真实 typed Node/Relationship/Path 及混合嵌套值验证 identity + 帧 State 去重、方向、自环/平行边、0 Label、缺端点详情与不一致 payload；普通业务 Map 不被猜成图实体。
2. 帧内概览只统计当前显示子图，完整 Ref/Labels/Type/端点/typed Property 可查；大整数、null/absence、Temporal/Point/Vector 等原编码不因 JSON/显示或表单入口丢失。高层不支持的原始值仍可阅读，编辑明确受 Object profile 限制。
3. 邻居用参数化有界 Cypher和同帧 State，计数/范围与原查询分开；迟到详情、展开失败、超限只影响本次操作。局部布局不自动 fit，不绕过帧/页面预算，原查询的完成记录和完整缓存不混入部分展开。
4. 测量大结果的有界投影、按片段 JSON、可见范围渲染与堆内存/交互性能；释放 rows 保留执行 metadata 和输入，重开按需读缓存，miss 不自动补跑。静态图和预算数字不能替代实际压力证据。

### A14-06 Knowledge 草稿与提交

1. 只有显式编辑/新建/删除进入草稿；历史/Tag/明确 commit 阅读只读，用户另选/建 Branch 并取符合 head 的 base 才可编辑。原帧始终保留原 State。
2. canonical base 来自同 State `readText`，Git Extended Diff 精确针对该正文；支持保留未编辑 typed value、无损编辑/null/absence、多个 target 和新节点/关系 alias。Node 0..N Labels、Relationship 单 Type与真实端点遵守 owner，无损能力不足的字段只读。
3. 验证改 Type/端点的直接 transition、新 alias 返回 Ref、显式删除关系、Node incident edge reject 及同 Patch 明确处理依赖；不得从局部图猜全库影响、自动 detach 或臆造派生 replacement mapping。
4. 预览是局部检查与已知影响，须确认具体变化/Branch/base；冻结内容和待核对标记可靠保存确认后，才发送一次同版 Patch。期间重复动作/修改受控；前置保存失败不发送，后置回执失败显示知识成功而 Web 记录未保存。
5. Branch 任意前进，包括无关对象变化，stale 仍拒绝；no-op 不创建 State。后端验证失败保留输入；响应丢失/取消先读 Branch、对象与历史核对，不盲目重试、自动 rebase 或猜 alias mapping。
6. 刷新恢复先重读原 base canonical bytes 和 Branch head；base 不存在/bytes 不符/stale 保留输入并禁止直接提交，只可明确对照新 base 手动重建。

### A14-07 本体图与模型变化

1. 全局/Domain 图直接表达 Definition、类型端点和组织关系；无 Domain、多父/cycle、域外端点、同名不同 kind、缺 title/description、未加载范围均可准确阅读。只做有界直接展开，Domain cursor 与 resolved State 配套，不冒充权限、namespace 或 Knowledge 边。
2. Node/Relationship Definition 详情以结构化 aggregate 读取并复用 Patch 提交；字段、Constraint、Index 内部编辑，组合字段顺序和共享 targets 完整保留。无独立 Index CRUD或 Markdown 解析保存。
3. Node/Relationship Definition 最后字段保护、nullable from/to、required/unique/key 与独立索引表达通过真实 API 验证；端点为 null 表示不限制类型，不造 Any Definition。Definition 声明字段不被显示为默认实例必填。
4. 用违规 Knowledge fixture 验证类型/required/unique/附加 Label/endpoint 收紧失败，保留草稿且不自动修复数据。共享 Index 删除从任一参与 aggregate 预览全部 targets并全局删除；修改 targets、复合规则、Range/Text/Point 的 local 边界分别验证。
5. identifying rename/Property renameFrom、title/description 修改、删除 Property/Definition 的依赖拒绝与同 Patch 处理、删除 Domain 不删成员均有证据。读取超限/invalid Snapshot 不能变成可保存的截断表单；原始 Graph 能力与高层一致性诊断分开。

### A14-08 历史与覆盖 DAG

1. 大历史、多泳道、fork/merge与未加载 parent 通过真实 ancestry验证：reverse-topological 顺序、完整已知 parent、继续加载标识、完整 State 键与去重均正确，不把轨道推断成 Branch 独占历史。
2. 列表/DAG只渲染可见范围及缓冲；首次请求使用解析后的 commit，翻页保留原 root 参数与 cursor，加载新 head 开新分页。覆盖直接用 Branch root 的接口回归：下一页不能改 root 为返回 commit仍沿用旧 cursor。文本搜索标明已加载范围；无匹配、跨过滤连接和直接 StateRef 定位不冒充全史搜索或造 parent。
3. 抽屉覆盖而不加宽列表/挤压画布；实际测量开关前后底层尺寸、图相机及选择不变，不自动 fit。运行中背景数据返回不引发缩放；关闭恢复列表锚点，选择连续且减少动态效果可用。
4. ancestry topology 与业务 history 分开；immutable 提交时间/摘要与 mutable ref/State Data 来源分开。切版本只影响新视图，旧帧仍按自身 State 查属性/邻居/模型。

### A14-09 State、差异与 ref

1. State immutable metadata/parents、mutable State Data 分组；absence/null 和 set/clear、未发送输入保存恢复可验证。恢复先重读 sidecar、显式比较；现有 API 无 sidecar CAS，UI 不保证避免后端覆盖。sidecar 不创建知识 State或进入 Snapshot Diff/Merge。
2. 显式 `state.create` 复用既有参数与返回值，空 Snapshot delta 可有真实新 State；观察 parent 不伪装 caller CAS。Branch list/create/delete、Tag list/create/move/delete 接真实接口，操作后重读核对；不添加 Branch move/rename、ref cursor 或 expected-head 参数。
3. History/Diff scope、root/before/after与合法 object anchor 通过分页验证；翻页保留原请求参数 tuple，换参数废弃 cursor。History按 public Change 保留条目，同 State多条变化不得按 State去重；`scope=all`的空变化 State保留 `change=null` entry。已加载变更过滤不冒充全量。删除从 before、新增从 after 读取详情；部分 Change不补造完整对象，两侧合法 batch read 和失败可区分。
4. 空 Diff、缺失一侧、invalid State、读取失败、rename continuity 与同名不同 identity分别验证；结构化 Diff 不被当可提交文本 Patch，只有真实 continuity才连同一对象。

### A14-10 Merge Session

1. 开始与重开显示实际 pinned States、token/revision/status；conflicts 按 opaque ID 分页，absence/null、同 path 多冲突与 relatedRefs 保真，不猜共同基底或合并冲突身份。
2. resolve/finalize/abort 带实际 `expectedRevision`；resolve 更新 revision 后废弃旧 cursor。`MERGE_SESSION_CHANGED` 重读，`BRANCH_HEAD_MOVED` 保留方案并显式重建，不重放未核对 choice。
3. 未解决冲突/一致性失败不令 Branch 前进；实际 `up_to_date/fast_forward/merged` 分别验收，只有 merged 两 parent。结果未知先核对，不重复 finalize；关闭保留 Session，明确放弃才 abort。
4. Merge subtype 未发送文本可靠保存；恢复先 get/conflicts 核对 Session/revision/conflictId，已完成/消失/变化时保留输入，不能自动 resolve/finalize或套到新 Session。

### A14-11 端到端与交付

1. 扩展现有 Playwright 真实 Runtime fixture，使用 fresh Workspace、真实 Lithograph 和已认证业务 API 构建数据/版本。至少贯通：连接→选 State→多帧查询→属性/邻居→Knowledge/模型编辑→预览确认→一次提交→保留旧帧→显式刷新→重新认证恢复；另贯通真实 Diff和有冲突 Merge。
2. 真实 daemon 验证 401、重启/换端口、store 故障、quota、stale、CAS竞争、cache miss和知识成功但 Web 回执失败；连接/协议故障可在 transport 边界注入，保留实际 Kernel 执行与结果核对。关键业务成功不能以 mock rows或截图替代。
3. 材料矩阵的 Q/E/O/V/R 功能与状态映射均取得对应证据；A1 随组件验收并最终联验。实际浏览器覆盖键盘主流程、图对象导航、focus trap/返回、Escape、减少动态效果、长文本、200% zoom与320 CSS px，测量对比与点击区，不以静态画板宣称达标。
4. 从构建后的同源内嵌产物和仓库外 packed Runtime 打开 Web 并做已认证操作；SDK新接口与现有 CLI/业务路径无回归，两个 Workspace独立 daemon/存储互不串用。源码 dev server成功不能替代打包交付。
5. 最终 Review 覆盖设计、源码/接口、恢复与安全边界、真实材料适用范围和证据；本轮范围的 task-affecting findings全部修正并复验，入口/owner/指南/状态按职责同步。

## 工程验证门禁

1. Feature 先运行针对性 TypeScript/Go测试与必要 daemon/SQLite/native集成；验证 CAS/并发、取消、失败原子性和恢复等实际风险，不为低影响样式编写镜像实现的测试。
2. 本地完整 `pnpm validate` 通过，沿用现有 Go格式/静态/race/coverage/security、TypeScript类型/lint/coverage/type coverage、依赖/重复/unused、build/exports、Playwright、native/package、license/audit及Markdown/diff门禁。当前仓库的 Go coverage基线90%、[TS coverage各维度90%](../../../config/test/vitest.config.ts)、[type coverage至少99%](../../../package.json)保持；历史达到100%不是另设阈值的依据，不通过排除业务代码降低覆盖要求。
3. 独立 fresh-source `pnpm run setup && pnpm validate`取得实际成功；不得依赖主工作树未纳入交付的文件、node_modules、cache或生成产物。具体执行按[开发指南](../../guide/development.md)，证据记录源码 revision/所应用 diff。
4. 仓库外 packed SDK/CLI/Runtime smoke覆盖内嵌 Web资产、连接、业务读取与 UI保存/恢复；真实本地浏览器覆盖关键写入和跨 Feature流程。
5. 既有 [CI](../../../.github/workflows/ci.yml)的 Validate与darwin/linux glibc/win32 arm64/x64六平台native/package矩阵必须在阶段交付 revision上实际成功。平台 smoke补充 Web store/API/guard及打包资产验证，覆盖POSIX权限和Windows私有访问控制、SQLite/WAL/导出与路径边界；浏览器业务 E2E使用既有Playwright runner，不把六平台native矩阵称为六浏览器验收。
6. 新增前端/存储依赖若确有必要，纳入现有license/audit/build gates；继续同daemon内置分发，不新增独立hosting、发布平台或质量系统。Review后重跑受影响检查，最终完整门禁只在仍有效的交付revision上记录成功。

远端结果缺失或未成功时阶段不能标为 `done`。执行CI所需的提交/推送以及任何发布动作另按当次授权处理；本次计划编写不执行这些动作。

## Review Checklist

- 逐项对照 Web owner与材料矩阵：Q1/Q2→P14-04/05，E1/E2→P14-06，E3→P14-04，O1/O2→P14-07，V1→P14-08，V2/V3→P14-09，V4→P14-10，R1→P14-01/02，R2→P14-03及各任务恢复，A1→各Feature与P14-11；独立状态表不能遗漏或变成常驻异常页。
- 业务API是否复用真实SDK/HTTP合同；新增store/cache/guard是否全部到达Runtime、adapter、SDK和Web，而非只画按钮或写类型。
- pinned commit、summary+EOF、request generation、AbortSignal和预算是否在所有相关请求与迟到回调上成立；execute rows不被承诺为一致快照。
- canonical bytes、Git Extended Diff、Branch/baseState、记录CAS与Session revision是否各守自身边界；是否存在自动重放、覆盖、虚假成功/回滚或未知alias猜测。
- 模型图是否区分Schema identifying name、element identity、业务键、Definition端点和Knowledge端点；sharedIndex全局删除、Domain组织与Schema收紧是否准确。
- 覆盖DAG、分页/局部过滤、Diff合法anchor、Branch/Tag实际能力和Merge完成结果是否与真实接口一致。
- UI故障是否隔离Kernel；原件、输入、凭证、私有权限和导出清理是否在平台验证中有证据；维护API是否被扩成首版管理中心。
- 实际测试范围、当前源码、运行环境和状态是否一致；旧Phase证据、静态材料检查或workflow配置是否被误写成本阶段成功。

记录finding的位置、依据、修正和复验。独立Review与作者自查均覆盖本阶段范围；全部已发现的task-affecting问题关闭后再审。无新证据或改动时不机械重复相同检查，也不声称系统绝对无缺陷。

## 完成条件

- P14-01–11真实实现，A14-01–11和工程门禁有对应实际成功证据；不得把未完范围移出本阶段或降低验收以标完成。
- 最终Review发现的问题闭环；设计/计划/指南/README/vlog按既有职责同步，阶段状态和实际产物一致。
- 本地、fresh-source、真实业务E2E、packed交付与规定六平台远端结果适用于最终交付revision；缺失证据保持`in_progress`或准确记录真实阻塞。
- Commit/push、版本发布与部署分别记录真实动作；它们不因本计划完成而自动执行，正式发布不是本阶段完成条件。

## 计划建立时的评审证据

建立计划时，本阶段产品实现未开始，P14-01–11及A14-01–11均待执行，页面仍为shell。此处保留当时的 `ready` 依据与计划评审，不作为当前实施状态；最新结果见[本轮实施记录](#本轮实施记录)。不能引用Phase13的运行成功替代本阶段证据。

本次只编写阶段计划与同步开发入口，未修改产品代码或图册，未运行产品测试、构建、fresh-source、packed或远端CI，未提交/推送。当前代码基线为`181628b45c1600476514dfc129a5053c6d394b9e`；设计输入使用当前未提交工作树的Web owner与相关引用。审核前后 Web owner、材料入口和资产来源记录 hash一致，Web owner SHA-256为`3a51ff3cb0e04070459e0f6a5a2fb553fc2f9aa99c04f97d8dc5432818fd2dab`；原有设计与资产改动保留。

本次计划 Review 记录（当前本地工作树，2026-10-04）：

| 核对项 | 修正与复核结果 |
| --- | --- |
| 版本分页与 History 条目 | A14-08/09补清保留原请求参数、换参数废弃cursor；History按public Change保留同State多条变化与empty-delta entry。对照真实Kernel和Evolution owner复核通过 |
| 缓存依赖与格式范围 | A14-01补清先可靠保存有效frame再写缓存；首版建立v1，不虚构无历史输入的迁移器。接口/Runtime独立Review通过 |
| 跨客户端删除所选ref | 独立Review发现验收缺口，A14-02补齐原commit只读保留、不自动回main与不存在Branch禁止提交；修正后复核闭环 |
| 最终计划Review | 作者复读及四路独立Review覆盖设计材料、真实接口、高层编辑、依赖、状态与门禁；本轮已发现问题闭环，再审未发现剩余待修正项。结论仅针对计划，不证明产品实现已通过 |

文档检查：

- `pnpm exec prettier --check docs/development/phases/14-web.md docs/development/README.md`通过。
- `pnpm exec markdownlint-cli2 --config config/quality/markdownlint-cli2.yaml docs/development/phases/14-web.md docs/development/README.md`通过；配置同时带入仓库既有Markdown范围。
- 两个修改文档的CSpell检查通过；本地路径/锚点检查通过，共173处；11个Feature与11组Acceptance映射完整，无模板占位符。
- `git diff --check`及新增未跟踪阶段文件的`git diff --no-index --check`通过。后者无空白诊断、返回1表示新文件差异，不是检查失败。

后续实际实施时，在本节追加各验收的场景/命令、环境、源码revision或所应用工作树diff、结果及报告位置；本次文档检查不得填作A14验收成功。

计划评审当时没有必须追加产品决定的阻塞；当时尚未执行的产品实施与运行验收不记作计划缺陷或已通过测试。

## 本轮实施记录

2026-10-04，在 `main@b46a94944298bdfd046053cba0de0f143372edfe` 的干净工作树上开始实施。20:44 UTC 用户另行授权本轮提交、推送与六平台 CI 跟进；已正常提交推送 `c2b9bed`，首轮远端结果与后续修复见下方记录。Phase 保持 `in_progress`。

五组产品实现已接通；源码及定向证据如下。最终门禁和 Acceptance 结果分别记录在后面的表格，不将实现完成替代阶段验收完成：

最终 Review 的具体问题已修正并复验：Diff/History Change、完整对象两侧与 Merge conflict side 保留合法 `1.0/-0.0` 原文；320px 图谱使用实际 SVG viewport，节点和文字不被一起压缩，本体只在首次范围加载时定位；最小 zoom 与显式 fit 的节点命中区保持至少 44px；单侧无冲突 Property 变化不再误拒绝可安全表达的 scalar Merge conflict。分别沿用 request/page identity、原相机与手动平移，以及 [Evolution logical slot](../../design/evolution.md#evolution) 的映射合同，没有追加产品模型。下面 396/49 项结果均来自这些修正后的源文件集合。

| Feature | 当前实现与定向证据 |
| --- | --- |
| P14-01 | [webstore](../../../internal/webstore/) 与 [daemon adapter](../../../internal/daemon/web.go)实现独立普通 SQLite、CAS/分页/墓碑、完整缓存、导出、预算、固定路径与认证后 boot guard。真实 daemon/native 测试与 Go 检查通过；追加参数原文测试后存储单包 coverage 91.6%。Windows ACL/reparse 有实现和测试，尚未在 Windows 执行 |
| P14-02 | [SDK](../../../packages/sdk/src/client.ts)、[连接](../../../packages/web/src/connection.ts)与[有界 transport](../../../packages/web/src/transport.ts)接入同源认证、boot guard、Blob 和原始 JSON；401/旧连接 generation/AbortSignal 回归通过 |
| P14-03 | [Records](../../../packages/web/src/records.ts)及各草稿按记录自动保存、CAS、lost-response 核对、比较/副本/删除与原位置恢复；collection 不自动执行，legacy frame 的原文缺失有兼容读取 |
| P14-04 | [Frame](../../../packages/web/src/frame.ts)和[执行器](../../../packages/web/src/frame-engine.ts)冻结语句、原始 params 与 State/Branch，维护独立四流队列、summary+EOF、取消/关闭与原文接收预算；可靠保存后才写完整只读缓存 |
| P14-05 | [图投影](../../../packages/web/src/projection.ts)、[GraphView](../../../packages/web/src/graph-view.tsx)与帧内检查器提供真实 typed 图、局部视口、同 State 详情/邻居和分段 JSON；raw row 的缓存/恢复/释放、320px resize、最小 zoom 的图形外真实点击与 44px 命中区均有回归 |
| P14-06 | [Object controller](../../../packages/web/src/edit-controller.ts)与[高层 Patch](../../../packages/web/src/edit-patch.ts)复用 canonical base、无损 YAML、预览、可靠保存、单次提交和真实回执；编辑范围 58 项定向测试通过，消失 State 恢复保留输入并禁止提交 |
| P14-07 | [Ontology 工作区](../../../packages/web/src/ontology-workspace.tsx)和[聚合 controller](../../../packages/web/src/ontology-controller.ts)提供模型图、字段/约束/共享 Index/Domain 编辑；真实收紧拒绝、共享资源与成员保留浏览器回归已纳入最终套件 |
| P14-08 | [版本列表与纵向 DAG](../../../packages/web/src/version-timeline.tsx)保留实际 parents、分页与局部过滤，抽屉覆盖图谱；节点选择、外部 ref 变化和删除原 ref 不静默切 State |
| P14-09 | State/History/Diff/ref 与 [State Data](../../../packages/web/src/version-state.ts)接入真实 Evolution；读取/比较/保存及 Change/完整对象两侧保留 Runtime 原始 JSON，Float 与 Integer 不合并。版本/合并范围最终 81 项定向测试通过 |
| P14-10 | [Merge controller](../../../packages/web/src/merge-controller.ts)执行实际 Session/revision 和冲突分页、resolve/finalize/abort；version 1 草稿、原文 conflict identity、lost start 与关闭重开迟到回执均有回归，不自动重放写入。Knowledge scalar conflict 的准确投影和反向映射在真实 native/HTTP/浏览器复验通过 |
| P14-11 | [真实 Runtime fixture](../../../tests/e2e/runtime-fixture.ts)由仓库外 Runtime tarball 建独立 Workspace；最终 49 项真实浏览器场景、本机 native 与 packed SDK/store smoke 通过，性能和键盘测量已取得。系统 Chrome 的 18 张主截图与 8 张长草稿补充截图已实际查看；安全门禁与六平台交付证据见下方未闭环项 |

持续 Review 修正了 typed 缓存校验、DB+WAL 合计预算、重复 JSON token 的参数指纹、原文数值保留、图对象鼠标选择与按钮 hover 对比、删除共享 Index 和 Domain ownership、canonical Patch EOF、empty Diff、Merge payload 格式以及迟到响应。已发现问题都追加了具体输入的回归，不把原始 UI 样本当作实际 Runtime 证据。

最终验收明确保留以下四项回归；裸大整数 transport 注入只证明序列化边界，不代表 Runtime 返回裸 unsafe integer：

| 回归 | 实际输入、修正与通过证据 |
| --- | --- |
| Empty Diff | 同 State 和显式 empty-delta State，在 all/ontology/knowledge scope 均返回 `items: []`；genesis parents、History parents 与空集合按合法数组编码。[native 回归](../../../internal/kernel/evolution_empty_integration_test.go)和[真实版本浏览器流程](../../../tests/e2e/evolution-workflow.spec.ts)通过，修正原 `null` 返回 |
| Merge 草稿格式 | 保存未发送 resolution 时携带 `version: 1`，重新认证恢复仍核对 Session/revision/conflictId。[controller 回归](../../../packages/web/src/merge-controller.test.ts)和[真实冲突 Merge 流程](../../../tests/e2e/evolution-workflow.spec.ts)通过，不将格式校验失败或 Session 已变化误报为可重放 |
| State Data 数值原文 | 真实 Runtime 输入相邻 `9007199254740992/9007199254740993`，响应各自使用 `Integer` tag；原始 Float `1.0/-0.0` 在读取、草稿恢复与比较中保留。外部将 `1.0` 改成 `1` 后显示变化并阻止未核对提交。[原文测试](../../../packages/web/src/version-json-source.test.ts)和[真实 HTTP/浏览器回归](../../../tests/e2e/evolution-workflow.spec.ts)通过 |
| 标准 Patch EOF | 接受标准 `\ No newline at end of file`，精确保留 YAML block scalar 的实际末尾换行；仅格式等价变化为 no-op，真正 String LF 变化创建 State。错误/重复 EOF 标记仍拒绝。[parser 回归](../../../internal/kernel/patch_eof_test.go)和[native Object Patch 回归](../../../internal/kernel/patch_eof_integration_test.go)通过 |

最终追加的 [Version 原文 E2E](../../../tests/e2e/version-values.spec.ts)使用真实 22 节点：Diff 分页 20+2、History 20+20 的 `1.0/-0.0 → 1/0` 变化，以及 Merge scalar `/properties/score` 分页 20+2 的 `base=1.0 / ours=1 / theirs=2.0` 均保持原文与请求身份。读两侧完整 Object、改参数后分页 anchor、重开 Session/revision 均核对真实 HTTP。原失败输入在 [native Merge 回归](../../../internal/kernel/evolution_merge_property_integration_test.go)验证 ours/theirs/custom、另一无冲突字段不被覆盖、Relationship 多属性及 RFC 6901 转义、stale revision/cursor 和两 parents；旧 aggregate 校验与非法候选拒绝仍保留。

[实际视口 E2E](../../../tests/e2e/viewport.spec.ts)验证 320px 的 nominal 144×56 节点和 13px 文字、resize 不改相机/选择/State、本体手动平移不被扩展或 resize 重置；zoom 0.1 的视觉图形约 14.7×5.9px、透明命中区为 44×44px，在图形外 17px 处真实点击后以原 State 读取 Object。显式三节点 fit 的命中区约 67.89×44px。最初新测试的 stroke 测量、accessible select locator 和包含内部图的无过滤 fixture 假设已纠正；最终实际输入限定准确 refs，未通过放宽目标、deadline 或重试掩盖失败。

### 本地 Acceptance 结果

下表原始本地“通过”限定于 darwin-arm64、后文所记录源码集合及对应测试范围；远端平台结果另见后续 CI 记录，完整阶段交付仍受工程门禁约束。既有 Kernel 合同测试在本轮完整 native 套件中重新执行，未以旧阶段的历史结果代替本轮证据。

| Acceptance | 实际证据与结果 |
| --- | --- |
| A14-01 | 本机通过。[store 测试](../../../internal/webstore/)覆盖并发初始化、私有路径、CAS/墓碑/分页、DB+WAL/quota、失败保留原件、完整 typed cache/TTL/LRU、紧凑导出；[真实 daemon 测试](../../../internal/daemon/web_integration_test.go)、[两个 Workspace/boot 隔离](../../../tests/e2e/runtime-boundaries.spec.ts)与[packed smoke](../../../scripts/packed-web-smoke.mjs)通过。Windows ACL/junction 测试需真实 runner |
| A14-02 | 本机通过。[SDK 回归](../../../packages/sdk/src/web.test.ts)、[连接](../../../packages/web/src/connection.test.ts)、[transport](../../../packages/web/src/transport.test.ts)、[导航](../../../tests/e2e/navigation.spec.ts)、[重启](../../../tests/e2e/restart-cache.spec.ts)和[真实 401](../../../tests/e2e/transport-recovery.spec.ts)覆盖 Blob/预算、同 signal/boot、凭证仅内存、failed/late State 与对象读取、旧帧及 ref 变化 |
| A14-03 | 本机通过。[Records](../../../packages/web/src/records.test.ts)、[Workspace](../../../packages/web/src/workspace.test.ts)、[真实两窗口 CAS](../../../tests/e2e/transport-recovery.spec.ts)、[重启/缓存缺失](../../../tests/e2e/restart-cache.spec.ts)覆盖单记录 in-flight、lost response 核对、局部对照/副本、原位置恢复及不自动执行；原 State 消失保留输入的 controller 回归通过 |
| A14-04 | 本机通过。[帧生命周期](../../../packages/web/src/frame.test.ts)、[原文](../../../packages/web/src/frame-source.test.ts)、[真实预算与队列](../../../tests/e2e/budgets.spec.ts)、[迟到数据取消/关闭](../../../tests/e2e/transport-recovery.spec.ts)及[高级执行](../../../tests/e2e/knowledge-workflow.spec.ts)覆盖冻结输入/State、summary+EOF、四个活跃流、第五个排队、取消和结果未知；不完整结果不存完整缓存 |
| A14-05 | 本机通过。[typed 投影](../../../packages/web/src/projection.test.ts)、[GraphView](../../../packages/web/src/graph-view.test.tsx)、[真实知识图流程](../../../tests/e2e/knowledge-workflow.spec.ts)覆盖 0 Label、自环/平行边/方向、同 State 属性与邻居、大整数及独立相机；[视口与命中](../../../tests/e2e/viewport.spec.ts)和[压力测试](../../../tests/e2e/budgets.spec.ts)取得真实尺寸/点击、投影/DOM/堆内存与交互数据，见下表 |
| A14-06 | 本机通过。[表单/YAML](../../../packages/web/src/edit-fields.test.tsx)、[controller](../../../packages/web/src/edit-controller.test.ts)、[真实单次 Patch](../../../tests/e2e/knowledge-workflow.spec.ts)、[stale/前置保存失败/响应丢失](../../../tests/e2e/edit-recovery.spec.ts)与[知识成功但 Web 回执失败](../../../tests/e2e/runtime-boundaries.spec.ts)通过；alias/Type/endpoint transition、incident/dependency reject 和同 Patch 处理另由本轮重跑的 Object native 套件验证 |
| A14-07 | 本机通过。[真实本体编辑/收紧拒绝](../../../tests/e2e/ontology-workflow.spec.ts)、[共享 Index/Domain 边界](../../../tests/e2e/ontology-boundaries.spec.ts)、[聚合与组织 controller](../../../packages/web/src/ontology-controller.test.ts)通过；native 套件覆盖 rename/required/unique/endpoint/依赖及同 Patch 处理。新增[成员边 identity](../../../internal/kernel/compiler_membership_integration_test.go)和[删除 Domain/Definition](../../../internal/kernel/patch_domain_delete_integration_test.go)回归通过，删除 Domain 保留成员、Knowledge 与历史 cycle |
| A14-08 | 本机通过。[真实大历史](../../../tests/e2e/navigation.spec.ts)加载 142 commits/8 页/2 泳道，root/cursor 固定、未加载 parent 与合并两 parent 保留；滚动前后各渲染 16 节点。抽屉开关前后实际图尺寸/viewBox/选择不变，导航不改变旧帧 |
| A14-09 | 本机通过。[版本 controller](../../../packages/web/src/version-core.test.ts)、[State Data](../../../packages/web/src/version-state.test.ts)、[原文](../../../packages/web/src/version-json-source.test.ts)、[真实 refs/State/History/Diff](../../../tests/e2e/evolution-workflow.spec.ts)及[Change/完整两侧原文](../../../tests/e2e/version-values.spec.ts)通过；包括 absence/null、空 delta、同 State 多 Change、合法两侧 anchor、空 Diff、数值类型改变和未发送输入恢复 |
| A14-10 | 本机通过。[Merge controller](../../../packages/web/src/merge-controller.test.ts)、[工作流](../../../packages/web/src/merge-workspace.test.ts)、[真实冲突 Merge](../../../tests/e2e/evolution-workflow.spec.ts)、[scalar 原文分页](../../../tests/e2e/version-values.spec.ts)与本轮 native Merge 套件通过：精确 revision、分页、changed/head moved、候选一致性拒绝、up-to-date/fast-forward/merged、两 parent、关闭保留与显式 abort、结果未知不重发 |
| A14-11 | 本地核心流程通过，阶段交付未全部通过。最终新构建主树与 fresh-source 均 49/49 真实 Runtime E2E、native/packed 通过，独立 Review 的具体功能问题已复验；对比度/目标尺寸、长文本、键盘/减少动态、窄屏与原生 200% 的行为、截图和长草稿滚动核对通过。修复产品源码 `c2a1791` 的六平台 native/package 已成功，完整 audit 仍失败 |

### 最终构建与测量证据

环境：Node 24.16.0、pnpm 10.34.5、Go 1.27.1、Rust 1.97.1、Lithograph v0.3.0；本机 darwin-arm64。没有跳过 hooks、降低 coverage/type/audit 门槛或排除业务代码。

| 检查 | 实际结果 / 报告 |
| --- | --- |
| 主工作树 `pnpm validate` | 实际 exit 1，唯一失败步骤 `check:security` 的两项 high；此前 install/dependency、Go 静态/race/coverage/security、TS type/lint/test、duplicate/unused/version/dedupe、build/exports、浏览器/native/packed/license 全部通过。日志 `/tmp/kgos-p14-validate-reviewed.log`；audit 后的 diff 未自动运行，最终另行执行 `pnpm check:diff` |
| 独立 fresh-source | 相同 baseline 独立 checkout，最终逐文件应用 189 项修改并核对 SHA-256；初次 setup 前没有复制主树 node_modules/cache/artifacts/dist，后续复用本目录自行生成的产物。最终 setup exit 0；validate 的 install 至 Go race 成功后执行服务连接中断，coverage 尚未完成，原 run 未记成功。从 coverage 按当前 `scripts/tasks.mjs` 顺序续跑，396 TS 测试、49/49 E2E、native/packed/license 均 exit 0；仅两项 high audit exit 1。日志 `/tmp/kgos-p14-fresh-setup-reviewed.log`、`/tmp/kgos-p14-fresh-validate-reviewed.log`、`/tmp/kgos-p14-fresh-resume-reviewed.log`，逐步退出证据 `/tmp/kgos-p14-fresh-resume-results.json`。176 项非文档/README 源文件集合 SHA-256 为 `96b43cbadbfaf6e8011ad22d8c78f63db6d81d3ec6c7b5e2fc6bc0191b45c253`；主树/独立目录一致，最终只同步文档并做定向检查 |
| 覆盖率与静态门禁 | 主树和 fresh-source Go 总 statements 90.4%；TS 48 files/396 tests，statements 97.10%、branches 93.05%、functions 97.10%、lines 98.43%；strict type coverage 99.84%；197 个生产文件分析发现 0 clones；govulncheck 未发现漏洞 |
| 最终真实 Runtime E2E | 主树与 fresh-source 均 49/49 通过、2 workers，分别 146.60s/145.39s；零重试、skip、flaky。所有业务 fixture 来自真实 packed Runtime/正式 API，不用 mock rows 替代关键成功；故障注入仅位于适用 transport/存储边界。主报告 `playwright-report/index.html`，提取证据 `/tmp/kgos-p14-validate-reviewed-measurements.json` 与 `/tmp/kgos-p14-fresh-reviewed-measurements.json` |
| native 与 packed | `pnpm test:native` 本机全部通过；`pnpm check:package` 仓库外安装/运行实际 SDK/CLI/Runtime，内嵌 Web、data CRUD/CAS/cache/export/guard、重启恢复与旧 boot 拒绝均通过；未发布 tarball |
| 大图/JSON 压力 | 主树实际 1500 行 → 1000 投影节点 → 20 个节点图元；完整接收 133.56ms、缩放交互 44.48ms，JS heap 增量 3,888,496 bytes；JSON 分页仅 20 行。数字为此 fixture/运行观测，非所有数据的容量保证 |
| 接收预算 | 真实大 scalar 流触发 8 MiB/帧与 32 MiB/页面，五帧分别接收 167/167/167/167/2 行；10000 行上限主动停止流并保留 metadata；超限不冒充完成 |
| 对比度与点击区 | 最终渲染六项 text/boundary 对比度依次 7.086/6.443/5.435/12.083/3.197/3.480，达到对应 4.5/3 阈值；被测 HTML 操作目标及最小 zoom/fit 的节点命中区宽高均至少 44px |
| 原生 Chrome 行为与视觉 | 系统 Chrome 154.0.8037.93、独立临时 profile：桌面 1280 CSS px、原生 200% outer 1280 / inner 640 / DPR 2、320 CSS px 均通过查询/草稿/本体/DAG/嵌套历史的键盘与布局断言。CSS zoom=1、visual viewport scale=1；无页面横向溢出，减少动态开启，local/session storage 与 cookies 为空；真实 API 确认返回知识页保存位置。18 张主截图逐张查看；另在 200%/320px 滚动到实际 Object/模型字段及查看 Patch 操作，8 张补充截图可读且目标在视口内。报告 `/tmp/kgos-p14-native-chrome-qa.json`、`/tmp/kgos-p14-native-chrome-scroll-qa.json` 与 `/tmp/kgos-p14-visual-review-reviewed.json`；旧 blank capture 不计通过，最终 200% 使用实际 Chrome surface capture，无 CSS clip |

### 最终 Review 与未闭环项

作者自查和独立 Review 对照 Web owner、真实材料、源码、正式 API、SQLite/原始 JSON 与实际 Knowledge graph data；没有再设计一套产品。修正后的功能问题已用明确输入复验，包括 Domain 成员 physical identity 在 Knowledge-only 两分支 Merge 中保持、删除组织不删业务成员、共享 Index 作用域、原文 typed 数值、保存/提交未知、旧请求 generation 和嵌套弹窗。

实际系统 Chrome 发现 Shift+Tab 可跳到 body，以及 React 嵌套 `cancel` 冒泡令两层同时关闭；[Modal](../../../packages/web/src/dialog.tsx)分别补充真实可见/非 inert 元素的焦点循环和阻止 cancel 冒泡。[11 项 Modal 回归](../../../packages/web/src/dialog.test.tsx)、[真实嵌套历史测试](../../../tests/e2e/accessibility.spec.ts)和系统 Chrome 行为复验通过。关闭的 details、visibility hidden、disabled/inert 与 SVG 的适用性有明确回归，不靠广泛 layout mock 掩盖浏览器行为。

初次 fresh-source 浏览器执行在 4 workers 且主工作树 Go race 并行时出现一次 fixture locator 10s 启动超时，未记通过；最终采用固定 2 workers、独立目录串行门禁，仍保留原启动截止与零本地重试。[生命周期工具](../../../scripts/p14-runtime-lifecycle.mjs)追加失败后停止并等待真实 child exit；初次 EEXIST 和坏 TOML 重启探针确认旧/失败进程均退出，报告 `/tmp/kgos-p14-startup-cleanup-probe.json`。这是测试基础设施修正，不把不确定启动当作业务成功。

当前已查明的完整门禁阻塞是 `braces@3.0.3` 的 [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。已发布最新 `braces@3.0.3` 和 `type-coverage/core@2.30.3` 仍保留受影响依赖；[上游深度保护 PR](https://github.com/micromatch/braces/pull/72)尚未合并或发布。当前保留固定 `type-coverage@2.30.1` 的 strict 99% 门禁，不能用普通 TypeScript strict 检查、旧版 TS 2/3/4 工具或未验证的新覆盖率算法代替。需获得可验证的上游修复/审计纠正，或另行完成等价类型覆盖工具替换；不忽略告警、不降低阈值，完整 validate 仍未通过。替换目前只作只读评估，等待用户批准，未修改计数算法或依赖。

基线 CI 的 Windows x64 packed smoke 在 Node 24.15.0 上返回 `0xC0000409`。对应官方 libuv 修复已进入 Node 24.16.0，开发固定版本已同步并验证本机官方 darwin-arm64 归档；原失败没有 native stack，归因仍是有证据的候选，不能代替 Windows 回归结果。安全审计的两项 moderate 已按公开 patched release 更新。

### 安全追查与工具替换

以下发生在上述完整主树/fresh-source 验证之后；原 396 tests / 49 E2E 和源集合 SHA 保留其实际范围，不将定向复测改写成另一次完整 validate。

- `http-cache-semantics` 的 [CVE-2026-93748](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)来自 `license-checker-rseidelsohn → @npmcli/arborist → make-fetch-happen` 等分支。官方 4.2.0/4.3.0 归档 diff 和隔离探针确认相关 max-stale 判断未改；[上游异议](https://github.com/github/advisory-database/issues/10139)也未令 advisory 撤回，因此没有用 4.3.0 的版本范围消失冒充已验证修复。实际原 CLI/Web 许可证扫描各一次加载模块、零 CachePolicy 构造/判断、零 HTTP/HTTPS/fetch；只表示这两次观测，不代表库的所有调用均不可达。
- [npm 许可证门禁](../../../scripts/check-npm-licenses.mjs)改用固定 pnpm 10.34.5 的全 workspace `--prod` 扫描，配合[原许可名单与 SPDX 判定](../../../scripts/npm-license-policy.mjs)。保留 private / `@kgos/` 排除，逐真实 manifest 核对身份、版本/path 对、声明许可和完整生产闭包；AND 要求每项许可获准，OR 可选获准分支，修正原字符串包含判断会放行 `MIT AND GPL` 的缺陷。23 项[回归](../../../scripts/npm-license-policy.test.mjs)覆盖 GPL/unknown/畸形结果、缺包、遗漏、workspace/optional/peer、private 子依赖及不同 peer 实例；真实缺 store index 退出 1 被传递。移除原工具后 `http-cache-semantics` 不再出现于 lockfile/实际依赖链，实际扫描仍为原五个外部生产包：MIT 3、ISC 1、BSD-3-Clause 1。
- [Markdown 薄入口](../../../scripts/check-markdown.mjs)改用 `markdownlint-cli@0.49.1`，规则引擎仍为 `markdownlint@0.41.1`。原 YAML 继续拥有 config/globs/ignores，wrapper 显式传入选择参数；当前 54 文件和真实违规 fixture 的规则/诊断与旧工具逐项一致，Markdown 的两条 braces 路径已移除。macOS/Windows 下未来 `*.MD` 会更严格纳入检查，不能宣称所有 glob 输入通用等价；动态调用的 CLI 在 Knip 登记为已使用依赖。
- 两项漏洞均不进入当前十个 workspace 的生产依赖；Runtime/API/SDK/Web/CLI 没有 braces 调用入口。`braces.expand` 的本机隔离反例长 9999、深 4998，42ms 退出 1 并产生递归 RangeError；固定 TS include/exclude 的 brace depth 为 0。此可达性范围不能代替安全门禁通过。剩余路径是 `type-coverage → type-coverage-core → fast-glob → micromatch → braces`。
- 新许可证 adapter 对缺失路径保持拒绝。当前五个外部生产包均跨平台且实际安装；未来引入不适用主机的第三方 optional 包时，须补充明确的平台/skipped 分类验证，不能静默忽略缺包。独立 Review 确认当前范围没有遗留替换缺陷。

原功能源码与构建未改变；工具替换只补受影响验证。最新真实 npm audit 仍退出 1，moderate/critical 为 0，high 从 2 降为 1；没有新增 audit 忽略规则、降低阈值或修改凭证/安全设置。调查证据位于 `/tmp/kgos-p14-http-cache-research/` 与 `/tmp/kgos-braces-security-investigation/`。

最终工具定向复验：主树 14 步中 13 步 exit 0，fresh-source 15 步中 14 步 exit 0；两者唯一失败均为原 high 阈值的 audit。包含 frozen install、依赖版本、Markdown、npm license、strict type coverage 99.84%、version/dedupe/unused/duplicate、定向 ESLint/Prettier/CSpell/diff；fresh 另执行 23 项许可证回归。逐步日志/hash/退出证据为 `/tmp/kgos-p14-security-repair-main-results.json` 与 `/tmp/kgos-p14-security-repair-fresh-results.json`。193 项修改逐文件同步，180 项非文档/README 源集合 SHA-256 为 `59f82929f4960c63e6a70fbaa3b98877f8362d640281b4e756ad5578320a6dd5`；160 项产品/E2E 文件与原完整验证集合逐 hash 相等。没有将原完整 validate 的失败改写为成功。

### 提交与首轮跨平台验收

实现提交 `c2b9bed99c47485f8d98d1ef82d14482345cf626` 已按正常 hooks 提交推送到 `main`，远端 SHA 核对一致，提交后工作区干净。pre-commit `check:quick` 实际通过，49 files / 419 tests；未跳过 hooks。完整实现与工具修复共 193 个文件，源码集合对应上一节的 `59f829…`。

[CI Run 37235334188](https://github.com/bYiyLi/kg-os/actions/runs/37235334188)已结束，精确 head 为该实现提交：

| Job | 实际结果 |
| --- | --- |
| [Validate](https://github.com/bYiyLi/kg-os/actions/runs/37235334188/job/111533185339) | 失败，仅剩 `braces` 一项 high audit；此前 Go/race/90.4% coverage/security、419 TS 测试、99.84% type coverage、49/49 真实 E2E、native、packed 与三类许可证检查均通过。audit 后的 diff 步骤未运行 |
| [darwin-arm64](https://github.com/bYiyLi/kg-os/actions/runs/37235334188/job/111533185584) | native / npm candidate pack 与仓库外 smoke 成功 |
| [darwin-x64](https://github.com/bYiyLi/kg-os/actions/runs/37235334188/job/111533185535) | native / npm candidate pack 与仓库外 smoke 成功 |
| [linux-arm64](https://github.com/bYiyLi/kg-os/actions/runs/37235334188/job/111533185503) | native / npm candidate pack 与仓库外 smoke 成功 |
| [linux-x64](https://github.com/bYiyLi/kg-os/actions/runs/37235334188/job/111533185487) | native / npm candidate pack 与仓库外 smoke 成功 |
| [win32-arm64](https://github.com/bYiyLi/kg-os/actions/runs/37235334188/job/111533185495) | native suite 的 `TestOriginalReplacementAndUnavailablePathsStopWrites` 返回 `IO_ERROR` 而非 `CONSISTENCY_ERROR`；pack 未运行 |
| [win32-x64](https://github.com/bYiyLi/kg-os/actions/runs/37235334188/job/111533185492) | 同一原文件替换回归失败；pack 未运行 |

Windows 根因已由真实失败日志和固定 Go 1.27.1 标准库核对：路径 `Lstat` 的文件 ID 在第一次 `SameFile` 才加载，立即替换路径会让原快照也读取替换文件。已有测试在 Windows 先关闭 SQLite，`Info` 的 closed DB 错误恰好掩盖身份漏检。修复[身份捕获](../../../internal/webstore/files.go)保留路径/reparse guard，改为短暂打开句柄后 `File.Stat()` 立即取得文件与目录身份；不扩大权限或改变公共错误规则。[新增回归](../../../internal/webstore/files_test.go)覆盖文件/目录、cold/warm 替换；[原失败回归](../../../internal/webstore/failure_test.go)在访问 SQLite 前直接检查 `prepare`，重复 Info/Save 并核对替换文件和归档原件未变。独立只读 Review 未发现新增阻塞。

修复后本机 Webstore 定向回归通过；主树 Go check/race/coverage、build、native、packed 六步与独立 fresh-source 的 Go check/build/native/packed 四步均实际 exit 0，新 Go coverage 为 90.3%，门槛仍为 90%。日志与逐步退出/hash 证据分别为 `/tmp/kgos-p14-windows-identity-main-results.json` 与 `/tmp/kgos-p14-windows-identity-fresh-results.json`。相对于最初设计基线，195 项修改逐文件同步，181 项非文档/README 源集合 SHA-256 为 `208075f5be846ed9765a3f7fdc3f7859b1aaba7880ac9e78d3de29aa77357f53`；上述旧完整验证与首轮 CI 保留其原 revision 范围。

### 修复提交与第二轮验收

修复提交 `c2a1791cc5bcfadb1cf96806157318e49caff732` 已正常 hooks 提交推送，8 个修复/证据文件，pre-commit 49 files / 419 tests 通过；远端 `main` SHA 一致，提交后工作区干净。源码集合为上述 `208075…`。

[CI Run 37237656778](https://github.com/bYiyLi/kg-os/actions/runs/37237656778)已结束，head 精确匹配修复提交：

| Job | 实际结果 |
| --- | --- |
| [Validate](https://github.com/bYiyLi/kg-os/actions/runs/37237656778/job/111539897684) | 失败，唯一失败仍为一项 high audit；此前 Go check/race/90.3% coverage/security、419 TS 测试、99.84% type coverage、49/49 真实 Runtime E2E、native/packed/license 均通过。audit 后的 diff 未自动执行，本地另行检查 |
| [darwin-arm64](https://github.com/bYiyLi/kg-os/actions/runs/37237656778/job/111539897927) | native、npm candidate pack、仓库外 smoke 成功 |
| [darwin-x64](https://github.com/bYiyLi/kg-os/actions/runs/37237656778/job/111539897970) | native、npm candidate pack、仓库外 smoke 成功 |
| [linux-arm64](https://github.com/bYiyLi/kg-os/actions/runs/37237656778/job/111539897894) | native、npm candidate pack、仓库外 smoke 成功 |
| [linux-x64](https://github.com/bYiyLi/kg-os/actions/runs/37237656778/job/111539897915) | native、npm candidate pack、仓库外 smoke 成功 |
| [win32-arm64](https://github.com/bYiyLi/kg-os/actions/runs/37237656778/job/111539897859) | native 包含 Webstore 回归成功，packed SDK CRUD/CAS/cache/export/guard、内嵌资产及 restart/previous-boot guard 成功 |
| [win32-x64](https://github.com/bYiyLi/kg-os/actions/runs/37237656778/job/111539897951) | 同上，native 与 packed smoke 成功；原文件替换失败关闭 |

当前两 Windows runner 使用 Node 24.16.0，packed smoke 均成功，旧 `0xC0000409` 在本次未复现；这提供实际回归结果，不将没有原生 stack 的历史失败唯一归因于 libuv。六平台 native/package 是 Runtime 分发验收，浏览器业务 E2E 仍由 Validate 的 Playwright runner 执行，不称为六浏览器验收。完整日志、步骤/平台结果与 head 保存在 `/tmp/kgos-p14-ci-37237656778-*`。

类型覆盖率等价替换的只读评估保留现有 CLI、async core 2.30.1、配置转换、计数算法、strict 与 99% 阈值，只拟替换文件枚举并从真实依赖图删除 fast-glob/micromatch/braces。当前枚举三种方式均得 88 个 roots，但裸 Node glob/TS 枚举会吞 EACCES 并丢失文件；`lintSync` 还缺少当前 strict 的 unused-ignore 扣分，均不能直接替代。候选需传播读取错误，并比较完整 root/source 集合、compiler options、全局/逐文件计数、每条 uncovered、比例及退出码，再以 fresh frozen install、冷模块加载、lock/list/audit 验证依赖移除。只读报告位于 `/tmp/kgos-type-coverage-replacement-review/review.md` 与 `review.json`；尚未实施，不能记成审计修复成功。

五组/11 个 Feature 的产品实现、本机功能验收、具体 Review 修正和当前产品源码六平台 native/package 验收已完成；P14-11 的完整安全门禁仍未通过，因此整个 Phase 14 保持 `in_progress`。提交推送已执行，发布或部署未执行。
