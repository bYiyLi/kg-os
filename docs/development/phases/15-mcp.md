# Phase 15：MCP & Private Plugin

<!-- cspell:words Streamable Asyncify openclaw Buildx -->

## 目标与状态

`in_progress`（2026-10-12，本地工作区已有未提交 MCP 实现工作，**尚未达到交付验收**）。本阶段在现有 KG OS Instance 和 `@kgos/sdk` 之上交付独立 MCP Server、四个 Tool、统一 JavaScript Sandbox、**完整可运行的 Linux amd64 Docker / OCI 镜像**，以及官方 Skill / 用户私人 Plugin 接入方式。按 [D91](../../design/decisions.md#d91-mcp-docker-only-delivery) 取消 MCP npm 与 Linux arm64 Docker 交付；按 [D92](../../design/decisions.md#d92-mcp-dev-acceptance-and-release-ci) 在 Linux Dev 完成发布前 Docker 集成验收，正式镜像由独立 Release CI 构建发布，不改变现有 CLI/SDK/Runtime npm 产品。**不依赖 [Phase 14 Web](14-web.md)**；Web 当前仍为 `deferred`。

完成后的主流程：

```text
用户的 KG OS Instance（由镜像内 kgosd 运行）
  → 用户部署 Linux amd64 Docker 镜像，挂载一个 Workspace Root
  → MCP 客户端通过受保护的 Streamable HTTP 连接
  → kgos_preview / state_ancestry 直接取得上下文
  → kgos_read / kgos_run 在 QuickJS Sandbox 组合 SDK
  → 官方 Skill 指导 AI；私人 Plugin 引用用户自己的 MCP Connection
```

本阶段以 [MCP 设计真源](../../design/mcp.md)、[D85–D90](../../design/decisions.md#d85-mcp-programmable-ai-client)、[D91](../../design/decisions.md#d91-mcp-docker-only-delivery) 与 [D92](../../design/decisions.md#d92-mcp-dev-acceptance-and-release-ci) 为合同；Development 只定义**实现顺序、验收证据与完成门槛**。QuickJS WASM + Node.js Worker 已被选为目标技术，其并发 Promise、流式桥接和隔离须按 P15-01 验证；未通过时不得跳过安全边界直接实现。

## 设计输入

- [MCP / Plugin 设计](../../design/mcp.md)：四个 Tool、SDK 方法权限、Sandbox、完整预览、历史 Markdown、远程认证和私人安装流程的唯一正文 owner；[Docker-only 部署与完整参数合同](../../design/mcp.md#部署交付与运行合同)同样归该 owner，本计划不得新增另一套 Tool/业务合同。
- [D85](../../design/decisions.md#d85-mcp-programmable-ai-client)、[D86](../../design/decisions.md#d86-preview-and-commit-message)、[D87](../../design/decisions.md#d87-ancestry-markdown-history)、[D88](../../design/decisions.md#d88-javascript-sandbox-sdk-execution)、[D89](../../design/decisions.md#d89-mcp-delivery-and-deployment)、[D90](../../design/decisions.md#d90-mcp-single-admin-oauth)、[D91](../../design/decisions.md#d91-mcp-docker-only-delivery)、[D92](../../design/decisions.md#d92-mcp-dev-acceptance-and-release-ci)：交付范围以 D91 为准，Dev / CI / Release 分工以 D92 为准，其余设计继续沿用。
- [Client SDK](../../design/client.md#kgossdk)及 [实际 SDK 方法](../../../packages/sdk/src/client.ts)：`ontology / object / graph / evolution` 的唯一 TypeScript HTTP 入口；[Object canonical YAML](../../design/object.md#object-value-与-representation)、[Ontology read](../../design/ontology.md#ontology-read-合同)、[Graph passthrough](../../design/graph.md#graph-公共调用合同)、[Evolution](../../design/evolution.md#evolution-公共调用合同)及[公共错误](../../design/contracts.md#公共错误合同)继续各自负责业务语义。
- [Runtime Workspace / Instance](../../design/runtime.md#workspace-root-与-instance-directory)、[本机认证](../../design/runtime.md#单-token-实例认证)、[active endpoint](../../design/runtime.md#http-bind-与-active-endpoint)及[Graph streaming](../../design/runtime.md#graph-http-streaming-framing)：MCP 只能通过 SDK 使用现有 daemon，不开放 `kgosd` 公网监听，也不另做 Runtime 身份或凭证真源。
- [Phase 00–13 已完成基线](../README.md#4-当前基线)、[共同完成条件](../README.md#6-phase-通用完成标准)、[仓库质量门禁](../../guide/development.md)及[当前六平台 CI](../../../.github/workflows/ci.yml)。私人 Plugin 以实现时实际客户端协议和工具验证为准，不把示例配置当成永远不变的外部标准。

## 当前实现与依赖核对

下表保留 2026-10-12 **首次编制计划时**核对 `main@4321a3be6ece7bf5b45ea3e7e03b6ff480a47d56` 的依赖基线，不代表实时实现进度。本轮同步部署合同所检查的本地工作区已出现未提交 MCP 源码；它们不构成已完成 Feature 或阶段验收证据。Phase 00–13 的历史完成证据仅是本阶段的依赖，不替代本阶段的任何验收。

| 已有能力或缺口 | 本阶段处理 |
| --- | --- |
| `packages/sdk/src/client.ts` 已提供 Ontology/Object/Graph/Evolution 读写方法及 Graph 增量迭代、AbortSignal | 全部复用；MCP 不创建第二套 SDK 或业务 API |
| 当前 Workspace Root、`.kgos`、`kgosd.lock` / `auth.json`、daemon loopback + Bearer 已有 Runtime / CLI 归属 | P15-02 建立固定 Instance 的 MCP 服务端连接，维持两个独立认证边界 |
| 现有 Ontology / Object canonical text、Commit、Branch、Ancestry 及公共错误已实现 | P15-05–07 只组合公开 SDK，生成只读 Markdown，不读数据库内部表 |
| 尚无 `packages/mcp/`、QuickJS Sandbox、四个 MCP Tool 或真实外部 MCP 连接验收 | P15-01–07 新建服务与工具；不得把设计稿或 SDK 单测当作 MCP 实现 |
| 尚无 `plugins/kgos/` 官方 Skill、私人 Plugin 模板和 AI 安装说明 | P15-08 完成模板与操作文档，使用用户真实 MCP Connection ID 验证 |
| Phase 14 Web 为 `deferred` | MCP 直接接现有 Instance；不实现 Web UI、`.kgos/web` 或 Web API |

阶段不存在必须先让用户重新决定的业务模型缺口。QuickJS 可行性、外部 MCP 授权与 Plugin 安装兼容性是**需要实际验证的工程门槛**，不能在计划中提前宣称已满足；如果验证证明确认的合同不能实现，应先在 MCP 设计 owner 记录具体分歧，再继续依赖它的实现。

## 范围与 Feature

| Feature | 交付物与主要落点 | 前置依赖 | Acceptance |
| --- | --- | --- | --- |
| **P15-01 Sandbox feasibility** | 在目标 Node.js 下验证 QuickJS WASM/Worker、异步 SDK Promise、并发、增量 AsyncIterator、可中断循环及脚本与宿主隔离；选出满足证据的最小实际依赖与集成方式，不引入正式备选抽象层 | 当前 Node / SDK 基线与 [Sandbox owner](../../design/mcp.md#sandbox-选型执行与资源边界) | [A15-01](#a15-01-sandbox-技术验证) |
| **P15-02 MCP Host 与认证** | `packages/mcp/` 独立 TypeScript 服务、`serve` / `doctor`、完整 CLI / 环境变量配置、可配监听与可选 TLS、Streamable HTTP、四个 Tool 注册、单 Workspace Root / Instance、daemon endpoint / Token 解析、静态 Bearer 与单管理员 ChatGPT OAuth | P15-01；[Runtime](../../design/runtime.md)、[部署合同](../../design/mcp.md#部署交付与运行合同) | [A15-02](#a15-02-服务与连接) |
| **P15-03 受控 SDK 桥接与只读工具** | 同进程宿主校验与 Worker 内四个顶层 namespace；SDK 只读许可集、JSON 参数/结果隔离，完成 `kgos_read` | P15-01/02；[SDK 能力边界](../../design/mcp.md#sdk-能力边界) | [A15-03](#a15-03-只读-sdk) |
| **P15-04 完整 SDK 与执行生命周期** | 同一 Sandbox 开放写方法完成 `kgos_run`；结果/错误、时间/内存/调用量/输出预算、取消、流式读写与未知写入状态 | P15-03；[写入/错误合同](../../design/mcp.md#写入错误与部分成功) | [A15-04](#a15-04-读写与执行安全) |
| **P15-05 Preview Snapshot 收集** | 全部 Branch / Head 固定、完整 Ontology / Domain / Definition 枚举、shared Index 与 schema 细节复用公共 SDK；大视图完整性诊断 | P15-02；[Preview 来源](../../design/mcp.md#版本绑定与内容来源) | [A15-05](#a15-05-preview-完整快照) |
| **P15-06 Preview Markdown 与行窗口** | `mermaid` + canonical `yaml` + 原始 Message 代码围栏、完整 Definition 索引、全局 Offset/Lines、进程内 viewRevision / 隔离缓存与行窗口 | P15-05；[排版规范](../../design/mcp.md#markdown-阅读呈现规范) | [A15-06](#a15-06-preview-排版与分页) |
| **P15-07 Ancestry Markdown** | `state_ancestry` 复用 SDK pinned root / cursor，按 Commit 分页生成局部真实 DAG、导航表和完整原始 Message | P15-02；[Ancestry owner](../../design/mcp.md#state_ancestrycommit-dag-markdown-历史) | [A15-07](#a15-07-ancestry-历史) |
| **P15-08 官方 Skill 与私人 Plugin** | `plugins/kgos/` 的官方 Skill、私人 Plugin 模板、面向 AI 的 `INSTALL.md` 与受保护 MCP 连接指导；验证用户自身注册连接及 Client 使用 | P15-02–07；[安装与责任](../../design/mcp.md#官方-skill-与私人-plugin) | [A15-08](#a15-08-skill-与私人-plugin) |
| **P15-09 集成交付与 Review** | Linux amd64 Dev Docker 实测、真实 daemon E2E、隔离容器 Smoke、内部构建中间物验证、最终普通 CI 的代码质量/现有 Runtime 回归、部署手册同步及 findings 闭环；正式镜像由 Release CI 另行构建发布 | P15-01–08 | [A15-09](#a15-09-端到端与交付)及[工程门禁](#工程验证门禁) |

### 非目标

不实现新 Kernel / Lithograph 能力、Web UI、Agent、独立知识缓存/索引/Commit 模型、第二套 Search/Cypher DSL、SDK 每方法对应的 MCP Tool、MCP Resources/Prompts、跨方法事务 / `dryRun` / 自动回滚 / 自动重试、单独 SDK Gateway 服务、**CLI / 环境变量以外的第二套配置系统**、任意宿主文件或 HTTP Tool，也不为 Cypher 增加解释或限制。

MCP Server 的唯一官方部署单元是 Linux amd64 Docker 镜像；私人 Plugin 仅引用用户已有 MCP Connection：**不**把 MCP Server 打入 Plugin 包，不集中托管用户 KG OS；不要求 Phase 14 Web 先完成。MCP npm 包发布、Linux arm64 镜像均**不在产品范围**；镜像正式发布、Git Tag、GitHub Release、公开 Plugin 上架或实际生产部署不属于本阶段完成动作，分别另行授权。

## 实施顺序与依赖

```text
P15-01 先证明 QuickJS Sandbox 可行与可隔离
    ↓
P15-02 建立真实 MCP Host、Instance 绑定和受保护连接
    ├── P15-03 只读方法桥接 → P15-04 读写 SDK + 执行生命周期
    ├── P15-05 全量 Preview 来源 → P15-06 Markdown / 行窗口
    └── P15-07 分页 Ancestry
                   ↓
P15-08 官方 Skill / 用户私人 Plugin（依赖四个 Tool 可用）
                   ↓
P15-09 Linux Dev 真实 E2E / 普通 CI / final review
```

P15-01 是**阻断依赖 Sandbox 的实施门禁**：不能以模拟 `Promise.all`、预读整条 Stream 或 `node:vm` 代替所选技术的实际证明。P15-05–07 可在 P15-03/04 的代码完善期间使用已完成的 MCP/SDK 基础并行推进，但各自必须有真实 SDK 回执与可解释测试，不使用 hardcoded fixture 冒充真实结果。真实 ChatGPT 连接可能需要用户在账号侧授权；先完成本地及标准 MCP Client 验收，人工接入仍是最终真实交付门槛。

## Acceptance

以下为最终必须取得的完整验收证据；部分已取得的 Linux amd64 Dev 验证记录在本文件的[当前实现与验收证据](#当前实现与验收证据)，但不足以认定各项完整通过。固定值、字段与边界以 [MCP owner](../../design/mcp.md)为准，不在开发计划里重新制定 API。

### A15-01 Sandbox 技术验证

1. 在真实 QuickJS WASM + Worker 中执行 `async / await`、`Promise.all()`、`for await...of`、`return`、错误抛出和 JSON 往返；至少一次通过宿主 Bridge 真正调用 SDK；不以 Node.js 直接 eval 或 mock async 循环代替。
2. 同时验证多个 pending SDK Promise 的交错、Graph 流式 `columns → row* → summary` 消费、背压和提早退出；无 terminal summary、terminal error、SDK 取消及异常均不得冒充完整成功，也不会留下未终止的后台迭代与无界缓冲。Asyncify 如无法满足并发不作为默认实现。
3. 验证无限循环/无界递归、堆/栈耗尽、未完成 Promise、Worker 中断、编译时与返回值超限均可终止且不阻塞 MCP 其它调用；验证无宿主 `process`、文件/网络、Token、任意模块导入或 Bridge 越权可达。
4. 先记录所选依赖版本与目标 Node 版本的**真实 smoke**，作为依赖其它 Sandbox Feature 的工程验证门槛；由 [A15-09](#a15-09-端到端与交付) 在最终 Linux amd64 Docker 镜像取得目标平台兼容性证据，不能把 Mac 单机可行性冒充 Linux amd64 交付完成。若验证不满足设计，保持依赖功能未完成并回到 MCP owner 做最小必要修订，不静默替换为弱隔离实现。

### A15-02 服务与连接

1. 从显式 Workspace Root 启动 MCP Server，按现有 Runtime 所属 locator、daemon lifecycle 与凭证规则连接准确的单一 Instance；错误 Root、缺失/失效 daemon、Token 变更及多实例并行不跨库、不连接错误 Instance、不泄露本地凭证。
2. 真实 MCP Client 能通过 Streamable HTTP 完成初始化、工具发现及调用，发现**恰好四个**约定 Tool；没有额外业务 CRUD Tool、Resources 或 Prompts。协议取消和服务退出会清理执行中的请求。
3. 客户端无认证、错误认证、会话失效或跨调用者缓存访问被拒绝。MCP 外部认证与本地 `kgosd` Bearer 独立，**用户自行选择**的受保护 HTTPS 地址 / Tunnel / 反向代理确实可用；不能把本机 daemon 裸露在公网，也不能只靠 Plugin 保存 Token 当作授权。
4. 服务端重启、多个 MCP 请求与客户端断连均不会让跨 Invocation 的授权、缓存或 Workspace 身份混用；日常日志/错误不包含 API Key、Bearer、Connection 密钥或私有宿主内部细节。
5. `kgos-mcp serve` / `doctor --json` / 分层 help / `--version` 均沿用 MCP owner 的 CLI > env > default 规则；`--root > KGOS_ROOT` 之外不能猜 Workspace。验证可选 host、`--port 0` 返回真实监听端口、固定端口冲突、非默认 path、`--token-env` / `--token-file`、`--tls-cert` / `--tls-key` 成对、超时/并发/请求体/脚本/Preview 预算、日志两种格式、无效/互斥值 fail closed，且任何结果不回显 Token。
6. `doctor` 不启动 daemon、不初始化 Instance 或执行远程网络配置；本地就绪和远程可用性分开报告。镜像内 `serve` 能复用或确保真实 `kgosd`，停止容器时清理该容器管理的内部 daemon，且动态内部 `kgosd` 端口从不作为公网监听选项。
7. ChatGPT OAuth 开启/禁用时分别验证默认 Bearer 兼容与 OAuth 受保护资源/授权服务器 metadata，`WWW-Authenticate` discovery、CIMD 的可信 ChatGPT 客户端 metadata 与精确回调校验、Authorization Code + PKCE S256、`resource` / issuer / Scope 绑定、管理员 Token 浏览器授权、Access Token 到真实四 Tool、Refresh Token 限时轮换及重启失效；错误 Token / Origin / Code / PKCE / Redirect / Client ID / Resource / 重放均不能取得权限。仅在 HTTPS（开发 loopback 例外）及已配置的外部 issuer 上启用，不把客户端认证兼容与公网可达混为一谈。

### A15-03 只读 SDK

1. 在真实 MCP `kgos_read` 中使用无前缀 `ontology/object/graph/evolution` 读取全部当前 SDK 只读方法；覆盖 Object `readText`、Graph query/streamQuery、Branch/Tag list、State/History/Diff 与 Merge read。方法参数与结果保留原 SDK 类型和公开错误类别。
2. 直接调用、动态属性名、原型/反射、嵌套方法或构造恶意 Bridge 消息均无法在 read Tool 调用任何写入方法、任意 HTTP、跨 Instance 或宿主对象；未知和新增 SDK 方法默认不可调用。
3. 同一次脚本把 `overview.state` 固定后组合多个 SDK read，验证数据来自同一 resolved Commit；不同请求不隐式共享 JS 状态、游标或 Token。静态类型隐藏方法而宿主实际上允许写入，不算验收。

### A15-04 读写与执行安全

1. `kgos_run` 使用同一 Sandbox 完整调用当前所有 SDK 写方法：Ontology/Object Patch、Graph Execute/StreamExecute、State/State Data、Branch/Tag 与 Merge Session，并可组合读写，输出 JSON-compatible `return`；只读与读写在 Tool 元数据上真实区分。
2. 正常返回、未 `return`、`undefined`、函数、`BigInt`、循环对象、超大/无穷数、过长结果、语法异常与 SDK 公共错误均严格区分成功和 `isError: true`。有界保留 public `code/message/details`，无敏感栈/Token；脚本自行 catch 并 return 按普通成功处理。
3. 多次写入第一步成功、第二步失败或后续只读失败时，真实数据库已完成步骤保持成功、Tool 返回错误，不造事务或回滚。验证 strict base / Branch CAS、Merge `expectedRevision` 仍由原 SDK/Kernel 执行，不重试写入或生成虚假 Commit。
4. 超时、内存/CPU/调用量/输出限制、断线及调用取消均有测试。已发送的 mutation、`streamExecute` 部分写入和丢失回执按真实结果保持可能完成/未知；必须可通过现有 State、Branch、Tag、Merge 数据核实，不能自动重放。
5. Cypher 保持原样透传，MCP 不重新建立语句 parser、网络/文件权限名单或专用引导入口；脚本自身的宿主访问隔离与 `kgosd` 运行权限明确分开。

### A15-05 Preview 完整快照

1. 有多个 Branch、不同 Head、多个 Branch 指向同一 Commit、无 Domain 与无定义等真实状态时，生成内容始终覆盖**全部** Branch / 对应 pinned Commit / 全部 Ontology；不通过选择分支或截取前 N 个结果冒充完整。
2. 真实 Ontology 的多 Domain 归属/循环、Domain 直接成员、未归类 Definition、相同名称不同 kind、Relationship nullable 端点、附加 Label、Property、Constraint、Index 与跨 Definition shared targets 全部覆盖，且数据来自同一 pinned State 的公共 SDK aggregate；不直接访问 SQLite 内部图。
3. SDK 分页/批次边界正确，Branch Head 在收集期间移动也不会使该 Branch 的 Metadata、Schema、Ontology 混版本；单个 Branch 解释失败、超大数据或 SDK error 时明确失败，不能忽略出错范围返回伪完整文档。

### A15-06 Preview 排版与分页

1. Markdown 外层目录与可跳读索引真实可定位，`mermaid` 只画真实 Definition 类型结构，`yaml` 使用 SDK canonical text 的相同内容；原始完整 Commit Message 在 `markdown` fenced block 中，不拆分正文，只有索引可从合规范 Message 提取简介首行。
2. 特殊名称、超长说明、反引号、Markdown 表格分隔符、图 Label 注入、包含嵌套 fenced block 的 Message 以及缺失/非规范 Message 均能稳定无损呈现；不会把用户数据当 Tool 指令或伪造模型结构。
3. 渲染完成后计算每个分支/Domain/Definition 的**全局 0-based** `Offset/Lines`；用多页窗口准确跳到章节与正文，完整窗口拼接可重建同一 LF 文件（最后终止换行不算额外空行），即使窗口切在 YAML / Mermaid / Message 围栏中间也不插行。
4. `offset` 默认 0、`limit` 默认 300 且合法范围 100..500；每个 `viewRevision` 固定 `totalLines` / 内容与 Head，按调用者及 Instance 隔离，命中缓存不重扫。过期/驱逐/重启返回 `VIEW_EXPIRED`，资源耗尽返回 `RESOURCE_ERROR`；从不把截断内容报作完整成功。

### A15-07 Ancestry 历史

1. `state_ancestry` 对 Branch/Tag/Commit Root 的首次解析固定真实 Commit，默认 20 个、合法 1..1000；继续分页使用 resolved root + opaque cursor，Branch 后续移动或游标错误不混合历史。
2. SDK reverse-topological 顺序、多父 merge、invalid/pre-KGOS Commit 与跨页 parent 均准确呈现；局部 `mermaid` 图不把未展开父 Commit 误作末端，不虚构完整 DAG、额外 Change 或全量条数。
3. 原始 author、parents、Unix microseconds 与完整 Message 进入 Markdown，包含非规范/缺失/超长 Message 与嵌套代码围栏均正确处理；无内容裁剪，单页过大明确 `RESOURCE_ERROR`。

### A15-08 Skill 与私人 Plugin

1. 官方 Skill 教 AI 优先使用 Preview 理解 Branch/完整 Ontology、按需 Ancestry，复杂操作使用四个无前缀顶层 SDK namespace；覆盖 State pin、Patch、Merge、流式/错误、不可重试写入、建议性 Commit Message；不把 Skill 误当强制客户端自动调用机制。
2. `plugins/kgos/` 模板 / `INSTALL.md` 明确区分用户本地 MCP Server、经保护的 HTTPS 入口、ChatGPT 手工注册 Connection、真实动态 App ID 与私人 Plugin 引用；不得写死本地路径、Token、私有 Connection ID，不将 MCP Server 打包进 Plugin，也不公开上架。
3. 真实标准 MCP Client 测试不依赖官方 Plugin；用户允许的 ChatGPT Web / Desktop 安装/调用测试验证 Tool discovery、Skill 的实际可见性、只读与读写区分和连接认证。客户端功能受账号与版本影响时以实际证据报告；没有真实验证不能把静态模板标记为完成。

### A15-09 端到端与交付

1. 真正启动 KG OS daemon + MCP Server，经过认证完成 `preview → ancestry → kgos_read → kgos_run → 再读确认`，含两 Branch、Commit 历史、完整 Ontology、真实图读取与版本写入；不以纯伪造 SDK/示意 Markdown 代替。
2. 重复验证并发/多客户端、Root/Token/HTTPS 错误、快照固定、分页重建、恶意脚本、异步 Bridge、流式背压/取消、部分提交与未知结果，以及服务端重启的恢复界限；每个 Feature 的边界不得只留到最终 Review。
3. `packages/mcp/`（private）与 `plugins/kgos/` 从**干净源码**能构建及使用；镜像内部可由临时 npm tarball 安装 MCP/SDK/CLI，但不发布、上传或要求用户 npm 安装 MCP。验证临时包的全部 JS/WASM/CLI 与镜像运行依赖，不依赖主树 `node_modules`、`.cache`、未跟踪文件或测试 Stub。新增依赖符合现有许可证、安全与打包门禁。
4. 实际 **Linux amd64 Docker / OCI 镜像**包含 Node.js、MCP、CLI / SDK、`kgosd` 和官方扩展。真实容器支持通过镜像内的 `kg init` 初始化及从 volume 读取已有 Workspace；不依赖宿主 daemon、host networking 或本机锁文件，容器重建数据不丢失。容器启动/关闭确实管理内部进程与信号，仅对外提供 MCP 监听端口；验证 amd64 镜像、非 root 运行、Secret / 证书只读挂载、固定/动态端口映射。
5. **在 Linux amd64 Dev** 使用本阶段最新源码完成真实 Docker build/runtime、`pnpm dev:mcp deploy/check` 的只读服务验收，以及隔离临时镜像/Volume 的 QuickJS WASM / Worker、四 Tool、全部 31 个真实 SDK 方法、写入、重启持久化和安全 Smoke；测试不得写入长期 Dev Instance。提交后本阶段完成标准所需的**最终 revision 普通 CI**（Ubuntu Validate + 既有 macOS/Linux/Windows arm64/x64 native/package matrix）实际成功；普通 CI **不构建/运行 MCP Docker 镜像**，也不进行 MCP npm 六平台专项测试。Release CI 只在另行授权发布时构建、核验并发布正式 Linux amd64 镜像，**不作为本 Phase 完成前置**。真实 ChatGPT 客户端验收与这些 CI/Dev 证据不能互相替代。
6. 完成最终代码与安全 Review、受影响问题修复/复验；按各自职责同步 MCP owner、Phase、**Linux amd64 Docker-only** 部署及验证/诊断的 `docs/guide/mcp.md`、README / vlog。用户自行提供的远程地址或通道必须能从目标客户端完成实际认证、工具发现与调用；不以本地监听或 workflow 配置代替远程可用证据。

## 工程验证门禁

1. 每个 Feature 先做相应真实 SDK / daemon / MCP targeted tests；Sandbox 的 escape/DoS、Bridge 权限、Token、异步迭代、取消和部分写入均要有负向测试。为已确认的协议选择最小依赖，不引入无实际用途的抽象、额外进程服务或兼容层。
2. 本地完整 `pnpm validate`（包括 TypeScript 类型/覆盖率/静态质量、Go 回归、真实 native Graph、Playwright、依赖/许可证/审计/打包与 Markdown/diff）成功，沿用现有 coverage / type coverage 门槛，不靠排除 MCP 业务代码规避覆盖。
3. 独立 fresh-source `pnpm run setup && pnpm validate` 成功，证据对应相同源码及明确差异；镜像干净构建时，SDK 依赖、JS/WASM、Worker 入口与 Runtime 资源必须全部随镜像可用，不依赖主工作树 `node_modules` 或本地偶然缓存。
4. 本地验证 MCP/SDK/CLI 的**镜像内部暂存包**安装可用；在 [Linux Dev](../../guide/dev-environment.md) 按既有管理入口部署并只读验收，再通过独立临时 Docker Volume/Instance 的完整 Linux amd64 镜像 Smoke 覆盖四 Tool、31 SDK 方法、可配地址/端口、两层 Token、TLS/代理入口及持久化；现有 CLI / Web shell、单实例 token、Graph/Cypher、Ontology、Merge 无回归。**写入测试不得操作长期 Dev Instance**；临时 Mac→远端 Docker 构建不作为验收捷径。
5. [普通 CI](../../../.github/workflows/ci.yml) 保留 Ubuntu `pnpm validate`、Dev 工具静态校验与现有六平台 CLI/SDK/Runtime native/package matrix，**不在 PR/main 上构建、运行或发布 MCP Docker 镜像**；提交后的最终 revision 取得真实成功的普通 CI 证据。只有正式 [Release CI](../../../.github/workflows/release.yml) 才构建、对拟发布镜像执行必要 Smoke 并推送 GHCR；其结果属于后续单独授权的镜像发布，不阻塞本 Phase `done`。无需假设配置完成等于实际运行完成；远端 commit/push 分别取得授权。
6. 客户端侧真实 ChatGPT Web/Desktop 连接与私人 Plugin 验证属于产品集成 Acceptance；遇到账户交互/授权依赖如实报告，不伪造证据，也不因外部操作暂时不可执行而降低其它验收。**正式发布、npm publish、公开上架与生产部署不在完成门槛。**

## Review Checklist

每轮结合真实代码、协议输出与设计真源逐项复核：

- 四个 Tool 是否足够且职责准确；是否混入已否决的独立 SDK 方法 Tool / Resources / Prompts。
- MCP 是否只绑定一个明确 Instance，外部认证、TLS / Tunnel、本地 daemon token是否仍是两个边界；日志、错误、Plugin 包是否泄露凭证。
- Docker 是否真为**唯一完整 MCP 部署单元**，没有要求 Docker Host 安装 `kgosd`、也没有对外发布 MCP npm 包；`serve` / `doctor` 参数与 env 是否完整一致，Token-file、动态端口、直接 TLS / 代理 TLS、Docker 生命周期及日志是否经过真实验收。
- QuickJS 与 Worker 是否真的可终止、隔离宿主能力；JS 反射/原型、异步回调、越权方法与 `Promise.all()` 是否绕过只读许可。
- SDK 是否仍为唯一业务真源，`ontology/object/graph/evolution` 无前缀、全方法、错误与 typed values 是否完整；未来新增方法是否默认拒绝而不是暗中提权。
- 无 `return`/非 JSON/超限是否以错误结束；`for await` 是否真正增量，取消与消费提早终止是否清理 Stream。
- 已提交写入与未知写入是否如实表述；是否存在隐式事务、回滚、自动重试或 MCP 自制 Cypher parser。
- Preview 是否覆盖全部 Branch/完整 Ontology、pinned State、真实共享 Index 与正确 Mermaid/YAML，索引/代码围栏/绝对行号是否支持无损重建。
- Ancestry 是否保留原始 Message、多父 DAG、稳定 cursor 和跨页父结点，不伪造全历史或自动总结。
- Skill/Plugin 是否可在真实 ChatGPT 客户端使用、不写死用户 Connection ID、不要求 Web / npm release。
- 是否先在独立 Linux Dev 完成真实 Docker/写入隔离验收；普通 CI 是否只跑代码质量与既有 native/package 矩阵、没有 MCP Docker 构建；Release CI 是否仅在授权发布时构建和推送 GHCR；三者证据与权限有无混淆。
- 文档/阶段状态是否有对应真实证据；是否把旧 Phase CI、空包装、单元模拟或未执行的平台测试误写成本次完成。

发现问题后先修复，再复验受影响的合同与回归。最终 Review 仅在已有证据和本阶段实际变更范围内声明没有剩余 task-affecting finding，不声称不存在任何未来问题。

## 当前实现与验收证据

> 本节按实际发生顺序保留先前验收和安全修复的记录。D91 之前的“缺少 Linux arm64 Docker、六平台 MCP npm”，以及 D92 之前的“普通 CI 必须构建 Docker”，均为**旧范围下的历史要求**，不再作为现行 Phase 15 阻塞项；新的完成门槛以本计划 A15-09、D92 和完成条件为准。记录过的失败不因范围变更而删除。

截至 2026-10-12：本地工作区已有开发中的 `packages/mcp/`、CLI 连接接入、Plugin/Guide 以及未提交修改。**仍未取得 P15-01–09 的完整 Acceptance、正式 Docker 公开交付或最终 revision 的远端 CI 验收证据**，不能据此宣称任一 Feature `done`。`@kgos/sdk` / `kgosd` 的已完成能力属于 Phase 00–13 前置基线。

**2026-10-12 Linux amd64 Dev Docker 实测（仅本平台，不替代 CI）：** Mac 经正式 Nexum 连接 `Yi Mac`，通过其 SSH 别名 `openclaw` 到 `10.168.155.123`，确认 Linux x86_64、Docker 29.2.1、Docker Compose v5.0.2、Buildx v0.31.1。参照现有 Nexum Dev 的 `src/data/config` 职责分离建立 `/data/apps/KgosDev`，把当前未提交的 KG OS 源码复制到 `src/KGOS`，用专用 `kgos-dev` Compose 构建镜像。由于该开发机 Docker Hub 解析受限，仅在 `config/compose.env` 中使用实际包含 **Node 24.15.0** 的镜像代理，Dockerfile 正式默认仍为相同版本的官方 Node tag。Build 在此 Linux 实机成功：独立镜像 `kgos-dev-mcp:local` 携带 MCP/SDK/CLI 与公开的匹配 Linux x64 native Runtime，无须宿主 `kgosd`。

**真实容器运行验收：** 首次 `docker compose run --rm --no-deps mcp init` 返回 `initialized`；长期运行的 `kgos-dev-mcp-1` 显示 `healthy`，仅将宿主 `127.0.0.1:3777` 映射到容器 `3777`。容器为非 root `node`（UID 1000），持久 Workspace 挂载可写，MCP 管理员 Secret 文件以模式 `0400` 在容器内只读挂载；容器进程列表确认内部启动**一个** `@kgos/runtime-linux-x64/kgosd`，没有宿主单独服务。未认证与错误 Bearer 请求均返回 HTTP **401**。实际 `@modelcontextprotocol/sdk` Streamable HTTP Client 经正确 Bearer 发现**恰好四个** Tool，并顺序完成 `kgos_preview`（包含 `main`）、`kgos_read` 读取当前 State、`state_ancestry`（本次 `count=2`）、`kgos_run` 创建隔离 Dev 测试 Branch `docker-dev-acceptance-20261012`、`kgos_read` 确认。执行 `docker compose restart mcp` 后再次读取，该 Branch 仍存在；后续检查容器状态 `healthy`、内部一个 daemon、对外只映射 loopback。真实命令及部署职责见 [远程开发环境](../../guide/dev-environment.md)。

此外，Dev 主机在源码镜像内安装冻结的 pnpm 依赖，使用相同 Node 24.15.0 镜像代理执行 `KGOS_MCP_DOCKER_BASE_IMAGE=… node scripts/mcp-docker-smoke.mjs`：**独立镜像 / 独立 Docker Volume / 初始化 / 四 Tool / 写入 / 重启 / 数据保持**脚本成功输出 `Docker MCP non-root Image / isolated KG OS / restart smoke passed`，并只清理自身临时镜像和 Volume；不重置运行中的 `kgos-dev`。Mac 另经 `ssh -L 127.0.0.1:3778:127.0.0.1:3777 openclaw` 临时转发，访问本机 `http://127.0.0.1:3778/mcp` 得到正确的 401，测试后停止临时 SSH 转发。Buildx 实测仅列 `linux/amd64` 及其 v2/v3 变体，不能据此宣称 arm64 已验证。

**跨机器认证复验：** Mac 在临时 SSH loopback 转发期间直接运行标准 MCP SDK Client，通过授权的 SSH 从 Dev 主机安全读取管理员 Token（不显示、记录或提交其值），以 Bearer 认证远端 MCP，并成功发现全部四个 Tool、执行 `kgos_read` 找到重启前持久化的测试 Branch；测试后关闭端口转发。

**最终 Docker Dev Review：** 构建上下文与源码同步显式排除 `.kgos` / 本地 Instance、Secret、Database、`native` 源码及依赖产物；使用当前文档与 `.dockerignore` 重新完成 Linux amd64 Compose build。执行 `docker compose up -d --no-build --force-recreate mcp` 后再次确认 `healthy`、`kgos-mcp doctor --json` 报告 `ready=true`（`config/instance/runtime/mcp` 均 ready、remote 仍 unverified），通过真实 MCP Client 再次确认四个 Tool 与已写 Branch 在新容器中保持，数据挂载未重置。

**长期 Dev 管理规范与实测（2026-10-12）：** 在 KG OS 仓库增加 `pnpm dev:mcp` 统一入口（本地源码同步、远端 Compose 备份/构建/镜像切换/只读验收、状态/日志/重启/手工镜像回退及独立备份），并由 [Dev Runbook](../../guide/dev-environment.md)维护操作流程。Linux 上真实执行 `setup`（原持久数据与管理员 Token 保留）、`check`（`doctor.ready=true`、四 Tool/Preview/State/Ancestry 只读验收）、`status`、`logs`、`backup`（Python SQLite online backup；备份 `quick_check=ok`、文件权限 `0600`）、`deploy`（自动备份、重新构建、强制重建容器、验收、写入部署历史）、`rollback`（恢复上一已运行镜像 ID、复验），最后再次 `deploy` 返回更新后的 Dev 镜像。部署历史记录本轮源 revision `f086f25b8d037dff80527f92201d9afde7408e63` 为 `dirty`，因为 Mac 本地还有未提交改动；实际工作树内容随源码镜像同步，不冒充公开发布。**自动故障回退分支尚未注入故障独立验证；手动回退已实测。** Linux CI 工作流仅增加脚本语法与 Compose 静态校验，实际远端 CI 仍待运行。

**Go 源码构建缺口关闭（同日后续 Review）：** 最初镜像虽使用当前 TypeScript 源码，但 `kgosd` 二进制仅来自已发布 v0.2.1 Runtime，导致后续 Kernel 修改不能进入 Dev。现已调整 Dockerfile：在 Linux amd64 上从当前 `cmd/` / `internal/` 编译 `kgosd`（官方 Go 1.27.2，下载归档 SHA-256 校验通过；CGO、SQLite FTS5）、编译当前 Web 并嵌入 daemon，继续携带已发布 Runtime 的 Lithograph/Provider/Jieba 固定版本扩展；只重新生成该 Runtime manifest 中的 `kgosd` 摘要，不绕过完整性校验。实际 Compose 完成构建、更新运行容器并通过只读验收；新 daemon SHA-256 为 `812380f3c04259f30115dfacb36b4239b0f07d7a26e2103d83b40efa08517a46`，不同于先前已发布二进制的 `eeb4974cb934a1e96c073ffa202514ca3c4dbfe9eef9cba07aca805c1964b379`，运行包 manifest 与新内容相同；`doctor.ready=true`，非 root `healthy`，实际 daemon loopback Web 首页返回 HTTP 200。使用新镜像重新执行隔离 Docker Volume `scripts/mcp-docker-smoke.mjs`，真实初始化、四 Tool、写入、重启与持久化全部通过。**没有在本阶段重新编译 native/jieba 或 Lithograph 扩展，原生扩展仍来自固定发布 Runtime。**

**Dev 宿主端口改为外部可访问（2026-10-12）：** 按用户新要求，Dev Compose 从先前的 `127.0.0.1:${KGOS_DEV_PORT:-3777}:3777` 改为 `0.0.0.0:${KGOS_DEV_PORT:-3777}:3777`，远端 `check` 现在验收 Docker 的 `0.0.0.0` 绑定，同时对 `127.0.0.1:<published-port>/mcp` 验证匿名 401。重新创建运行容器（不重置 Workspace、Token 或镜像），Linux Docker 显示 `healthy` 与 `0.0.0.0:3777->3777/tcp`，Mac **直接**访问 `http://10.168.155.123:3777/mcp` 无凭证、错误 Bearer 均返回 401；`pnpm dev:mcp check` 的 Instance/Runtime 与四 Tool 只读验收依然通过。仅确认网络和 Bearer 拒绝路径，**原始 HTTP 仍无 TLS，不声称公网 HTTPS 或 ChatGPT OAuth 可用**；实际长效凭证在不可信网络中必须经加密通道传输。

**ChatGPT OAuth 元数据发现修复与公网协议复验（2026-10-12）：** 实测 `https://kgos-dev.y2l.top/mcp` 原先只返回 `WWW-Authenticate: Bearer realm`，且两份 `/.well-known/` OAuth 元数据均为 404；已确认 Dev 容器缺少 `KGOS_MCP_OAUTH_ISSUER`。Dev Compose 现显式提供 `https://kgos-dev.y2l.top`（可由 `KGOS_DEV_OAUTH_ISSUER` 覆盖），并对容器设置 `NODE_USE_ENV_PROXY=1` + Dev 主机提供的出站代理、`NO_PROXY` 本地绕过，解决 Node.js 在容器内直接获取 `https://chatgpt.com/oauth/client.json` 超时的问题。MCP 增加 `/.well-known/oauth-protected-resource/mcp`（随自定义 MCP path 而变）资源发现入口、同时保留 root metadata；未授权 401 明确指向 path-aware HTTPS 地址。Linux 完整 Docker 重新构建、自动备份与部署成功，容器 `healthy`、`doctor` 与原四 Tool 只读验收通过；**公网 HTTPS** 实际检查 `/mcp` → 401（含 `resource_metadata` 和 `kgos:access`）、root/path-aware protected resource metadata → 200、authorization server metadata → 200，所有 issuer、Scope、PKCE S256 与 CIMD `none` 配置一致。容器用自身真实代理配置成功从 ChatGPT 返回的官方 CIMD 文档取得 200；使用该文档中的真实 `client_id` 与 `redirect_uri` 请求公网 `/oauth/authorize` 得到 200（受保护管理员 Token 表单和一次性 ticket）。**未替真实 ChatGPT 用户执行账号登录或最终 Tool 调用，不声称 ChatGPT Web/Desktop OAuth 完整验收通过。**

**浏览器授权失效体验修复（2026-10-12）：** 用户已到达 ChatGPT 对接的 KG OS 授权表单，但后续提交报告 `{"error":"invalid_request"}`。用真实公网 HTTPS 复现：新 Ticket 的授权页返回 200，错误管理员 Token 返回含错误提示的 401；缺失或失效的 Ticket 会返回完全相同的 400 `invalid_request`。由当前证据无法反推用户当次请求究竟是超过 5 分钟还是服务重启（Ticket 保存在进程内）；两者都会使此前签发的 Ticket 无效。已保留**5 分钟时限与 fail-closed 行为**，仅在原 HTML 页面增加时限提示，并对接受 `text/html` 的浏览器在 Ticket 失效时返回可操作的 400 HTML，指示用户回 ChatGPT 重新发起；非浏览器请求仍遵守现有 400 JSON `invalid_request`。新增时间前进的回归测试已通过，本轮 `pnpm dev:mcp deploy` 真实完成部署前备份、重建镜像、容器更新及 OAuth discovery/doctor/四 Tool 验收。公网复测新授权页 200 且含时限提示，失效 Ticket 的浏览器 POST 为 400 HTML 且有重新授权文字，API POST 仍为 400 JSON。**本修复不等于已经取得用户在 ChatGPT 中完成最终登录的真实证据。**

**真实浏览器 Origin / Referrer-Policy 缺口闭环（2026-10-12）：** 用户多次提交新授权页面仍收到相同 JSON，排除把此前 Ticket 过期的可复现性误当作根因。Mac 以真实 Chromium（Playwright）打开**公网 HTTPS** 的有效 OAuth 页面并点击 Authorize，使用测试用错误 Token：GET 200、表单 POST 实为 **403**，Chrome 发出 `Origin: null`，命中本服务器 `finishAuthorization` 的严格 Origin 检查，返回完全相同的 `{"error":"invalid_request"}`。对照试验只修改测试浏览器接收到的 HTML `Referrer-Policy`：`no-referrer` 导致 `Origin: null`；`same-origin`、`origin`、`strict-origin` 均恢复正确 Origin；其中 `strict-origin` 还确保同源 POST Referer 不包含 OAuth query。已仅在 OAuth **授权 HTML** 响应设置 `Referrer-Policy: strict-origin`，其余 OAuth 接口保持 `no-referrer`，未放宽 Origin、Token 或 Ticket 校验。增加 response-header 回归断言，9 个 OAuth 单测、ESLint、TypeScript 检查通过；经 `pnpm dev:mcp deploy` 实际备份、构建、切换后，容器 `healthy`、OAuth discovery/doctor/四 Tool 验收通过。**新镜像公网真实 Chromium**（无响应头模拟修改）GET 200 且 header 为 `strict-origin`，浏览器 POST `Origin: https://kgos-dev.y2l.top`，使用错误测试 Token 合理返回 **401 HTML** 而非此前 **403 JSON**，Referer 不包含 OAuth query。此证据验证浏览器授权表单与安全失败路径；用户自己的正确 Token / ChatGPT 最终 authorization-code exchange 尚未实测，不声称全部 OAuth 流程完成。

**额外公网浏览器拒绝流程复验（2026-10-12）：** 新镜像上真实 Chromium 再次 GET ChatGPT CIMD 驱动的授权页面（200），点击不需要管理员 Token 的 **Cancel**，浏览器携带正确 `Origin` 提交 POST 后获得 **302**；Location 指向 `https://chatgpt.com`，包含 `error=access_denied`、与初始页面一致的 `state` 和正确 `iss`。因此已进一步验证有效 Ticket 的同源浏览器提交和回调 URL 组装，不涉及管理员凭证或授权码签发。

**真实 ChatGPT 私人插件 OAuth + 写入验收（2026-10-12）：** 用户完成 `kgos-dev` 私人插件连接后，本会话**直接通过该实际 ChatGPT 插件**执行 `kgos_preview`、`kgos_read`、`state_ancestry`、`kgos_run` 四个真实 Tool；成功创建独立 `chatgpt-mcp-acceptance-20261012-1503` 测试 Branch、向其创建带 JSON Data/author/message 的 Commit `commit/b007fdb8b6d4d43ec3c288f08f604bb3c345b9a34cc9acc816e70be9220e9cba`、另一次只读回读验证 `consistency.status=valid`、`main` Head 不变。Ancestry 返回三代 Commit，Preview 固定 `viewRevision` 分两页读取并保留原作者与 Message；通过 `kgos_read` 尝试写 Branch 被 `PERMISSION_DENIED` 拒绝。**因此 ChatGPT OAuth 连接 + 四工具真实读写的基本端到端验收已通过**；不能推论真实 ChatGPT 的所有 31 个 SDK 方法/复杂图模型行为均已验证。

**SDK 测试矩阵扩充（2026-10-12）：** 以 [SDK 31-method 测试矩阵](../sdk-test-matrix.md)区分 MOCK、真实 Kernel 和实际 MCP。新增 `scripts/mcp-sdk-matrix.mjs`，接入既有 Repo-out npm 与 Linux Docker 隔离 Smoke，使真正的 Streamable HTTP MCP Client 经 QuickJS Worker / SDK / 实际 daemon / Lithograph 依次成功调用 SDK 全部 **15 Read + 16 Write 方法（31/31）**，并验证冲突 Merge resolve/finalize/abort、Graph Query/Execute 两种流、Ontology/Knowledge、Commit/Tag/Diff/History、View 固定分页、Ancestry、禁写及错误 State。Repo-out pack + 隔离真实 Instance 已通过。新增 `sdk-dispatch.test.ts` **动态枚举真实 SDK 方法并对照封闭 allowlist** 的回归断言，未来新增方法未进入 MCP 许可集会直接导致测试失败。

**真实回归缺陷闭环（2026-10-12）：** 31-method 测试扩充暴露两处仅凭模拟 SDK 路由检查无法发现的 Kernel 数据问题：**(1)** 空 Domain `includes: []` 在规划结果（`null`）与 staged snapshot（`[]`）间不一致，导致合法创建得到 `CONSISTENCY_ERROR`；`normalizeDomain` 现将 nil 成员集合归一成空数组。**(2)** `syncInternalGraph` 原先在任何 Patch（包括仅修改 Knowledge Node）都先删除全部 Domain includes 关系再重建，分支分叉时物理关系 identity 改变，导致实际冲突合并 candidate 中两个同 source/target 的 includes 关系（`BINDING_DUPLICATE`）。现按每一条 Domain membership 边执行最小增删，不再重建未变化的关系；即使 Domain 成员集合部分增删，未变关系的原生 identity 也持续保持。新增真正 Lithograph v0.3.0 回归文件 `internal/kernel/mcp_sdk_matrix_integration_test.go`、`internal/kernel/domain_membership_identity_integration_test.go`（原生边 identity 增删），以及 `internal/kernel/sdk_evolution_validation_integration_test.go`（SDK History/Diff 非法输入和固定 Cursor 分页）；**修复后定向测试通过、macOS arm64 全部 `pnpm test:native` 套件通过**；没有修改 Lithograph 的独立 Property Graph 语义。

**尚未覆盖：** 上述是 Linux **amd64** 实测，未在 Linux arm64 实机完成镜像 build/runtime；真实 ChatGPT 已完成 OAuth 注册并通过四个 MCP Tool 的真实读写；但**未通过真实 ChatGPT 逐项运行全部 31 个 SDK 方法**，也未取得 Linux arm64 双架构 Docker 和最终六平台 CI 的成功证据。Docker/OCI Registry 发布和生产部署未执行。Mac 工作树的 Docker/Compose/指南修改仍未提交、推送；不能把 Dev 容器健康和四 Tool smoke 冒充整个 Phase 15 `done`。

**全面测试与安全阻塞（2026-10-12）：** 最新 Mac 工作树本地 `pnpm validate` 顺序运行已通过 Go Race、Go statement coverage **90.0%**、Go security、Vitest **195/195**、TypeScript type coverage **99.44%**、Playwright、原生 Lithograph、npm/MCP repo-out 打包、License/格式/静态检查；最终**失败于 `pnpm check:security`**：开发工具链 `markdownlint-cli2 → micromatch → braces@3.0.3` 涉及 High Advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，2026-10-12 无已发布补丁，不可冒充 Validate 全绿。Docker Runtime 实测不包含 braces，生产依赖的 High audit 阈值通过；另外识别 `smol-toml@1.8.0` Moderate（可升级至 `>=1.9.0`）。新增 `internal/kernel/domain_membership_identity_integration_test.go` 验证成员关系逐条增删时保留未变边 identity，新增 `internal/kernel/sdk_evolution_validation_integration_test.go` 验证 Diff/History 错误输入及对象范围固定 Cursor 分页；Linux amd64 已用**最新代码**重新通过隔离 Docker 31/31 方法和重启持久化。未自动忽略漏洞、提交、推送或运行最终六平台 CI；Phase 15 继续 `in_progress`。

**后续安全依赖修复及最终回归（同日）：** 已将 `smol-toml@1.8.0` 升至 `1.9.1`（CLI 直接依赖与 pnpm 全局约束），`markdownlint-cli2@0.23.2` 升至 `0.23.3`，使 `js-yaml@5.4.1`、`markdown-it@15.0.1` 进入锁文件。重新冻结安装并实际运行**完整 `pnpm validate`**：Go Race/Go Security、Go 覆盖率 **90.0%**、Vitest **195 tests**、Type Coverage **99.44%**、Playwright、真实 Native、npm/MCP Repo-out（SDK 31/31）、三类 License 均通过。**全量依赖审计由 5 项降为 2 项**：唯一 High 为未有修复版的开发依赖 `braces@3.0.3` / GHSA-vfj7-8cjw-p6xm，唯一 Low 为 `katex@0.16.47` / GHSA-238p-pmpm-9mq7；后者修复需跨 `micromark-extension-math` 的 `^0.16` 兼容界限，未做未经验证的破坏性覆盖。Docker MCP 实际容器没有安装 braces 或 KaTeX；`pnpm audit --prod --audit-level high` 已确认 **0 项已知漏洞**，但长期 Dev 容器尚未换成更新后的源码镜像。**`pnpm validate` 最终依然退出非零，因为没有忽略未解决的 High Advisory。** 没有本轮 CI / commit / push / 公网发布证据，Phase 15 继续 `in_progress`。

**最终 Linux Docker 修复版复验（2026-10-12）：** 升级安全依赖并更新锁文件后，重新同步最新源码，在现有 Linux amd64 Docker 主机上再次执行**隔离** `scripts/mcp-docker-smoke.mjs`。当前代码镜像的真实 MCP Client / QuickJS / SDK / daemon / Lithograph 链路 **31/31 方法通过**，非 root 初始化、Docker Volume 复用、重启持久化全部通过；长期运行的 Dev Compose 容器未重建或切换。不会用此 amd64 成功代替 Linux arm64 或远端六平台 CI 证据。

**开发工具安全白名单授权（2026-10-12）：** 用户明确接受当前上游未修复的 Dev 依赖风险；root `package.json` 通过 pnpm 官方 `auditConfig.ignoreCves` **仅允许 `CVE-2026-93687`**。仍运行生产依赖和完整依赖的 `high` 等级审计，不禁用 audit、不忽略其它未修复漏洞；命中的 `katex` Low 不受本白名单影响。**反向验证：`pnpm audit --audit-level low` 仍因未列入白名单的 KaTeX 漏洞退出 1**，表明没有关闭其它漏洞的检测。受影响链限定为 `markdownlint-cli2 → micromatch → braces@3.0.3`；Docker 当前运行时不包含 `braces`。上游已有可行补丁时应撤销白名单；风险进入实际生产依赖时应重新评审。白名单不是漏洞修复，之前未豁免的原始审计失败仍保留为历史记录。

**白名单后完整工程复验（2026-10-12）：** Mac 当前工作树重新完整执行 `pnpm validate`，**退出码 0**。实际通过 `check:install/dependencies/go`、TypeScript typecheck/lint、Prettier/Markdown/CSpell/Secretlint、Go Race / Go security、Go statements **90.0%**、Vitest **195 tests / 26 files**、Type Coverage、jscpd 0 clones、版本/依赖一致性、Build、Playwright、Native、npm/MCP Repo-out、License 与最终 diff。安全阶段先对生产依赖执行 High 审计（无已知漏洞），然后对完整依赖执行 High 审计（2 项：Low KaTeX、High braces，其中**仅 High braces 对应的单个 CVE 已获用户批准忽略**），保留真实扫描与输出。此证据只证明 Mac 本地质量门禁；**没有**由此执行 commit/push，也不等价于六平台最终 CI 或 Linux arm64 Docker 成功。

**D91 当前交付范围变更（2026-10-12）：** 用户取消 Linux arm64 Docker 与 MCP npm 正式分发。已把 [MCP owner](../../design/mcp.md#部署交付与运行合同)与 [D91](../../design/decisions.md#d91-mcp-docker-only-delivery) 收敛为 Linux amd64 Docker-only；`@kgos/mcp` 标为 private，镜像内临时 tarball 继续作为构建输入；本阶段新 CI 只在 Linux x64 job 做 Docker build/runtime smoke，不再对六平台执行 MCP npm 包测试。原有 CLI/SDK/Runtime 六平台 npm CI 不变。本次代码/文档修改与新验证结果另行记录，**不能拿此前版本的本地或 Dev 验收替代最终 revision 的 CI**。

**D91 修改后的本机复验（2026-10-12，未提交工作树）：** `pnpm build` 退出 0；`pnpm check:mcp:staging` 退出 0，在仓库外通过私有临时包安装 MCP/SDK/CLI 并真实执行 daemon、QuickJS Worker、四 Tool 与 31/31 SDK 方法，证明 `@kgos/mcp` 设为 private **不阻断镜像内部打包**，不代表对外 npm 交付。随后完整 `pnpm validate` 退出 **0**，包含 Go Race/原生 Lithograph、Vitest **195/195**、Playwright、依赖/许可证/安全与 Docker 内部 staging；生产依赖 High 审计无已知漏洞，完整审计仍显示 Low 1 / High 1（仅此前批准的 `CVE-2026-93687` 被忽略，漏洞本身未修复）。Mac Docker Daemon 当前未运行，未取得**这次修改后** Linux amd64 镜像的新 build/runtime 证据；最终 revision 的 GitHub Actions CI 未运行。实际 Linux amd64 Dev 31-method 镜像验收属于此前代码状态，不能替代最终验收；Phase 仍为 `in_progress`。

**Release CI 改造（2026-10-12，本地配置，尚无远端运行证据）：** 沿用 [D91 发布补充](../../design/decisions.md#d91-mcp-docker-only-delivery)，现有 `.github/workflows/release.yml` 的 `v*` Tag 发布依旧先完成八个 CLI/SDK/Runtime npm 包与六平台 public registry smoke，随后新增 Linux amd64 MCP Docker job：从相同 Commit 构建带 source/revision/version label 的 GHCR `kgos-mcp:v<版本>` 镜像，用扩展后的 `scripts/mcp-docker-smoke.mjs` **直接测试待推送的同一镜像**（四 Tool、31/31 SDK、独立 Volume、重启持久化），通过后才使用 GitHub `GITHUB_TOKEN` 推送并重新拉取校验架构、revision 和 digest。GitHub Release 最终确认依赖 Docker job 成功并记录 digest。此改动**不会发布 MCP npm 包**；它为未来获授权的 `v*` Tag 发布定义条件，本轮不创建 Tag、不推送、不发布任何镜像。CI 未执行前 Phase 15 保持 `in_progress`。工作流 YAML、依赖 DAG、仅 Docker job 的 `packages:write` 权限和 Bash 语法已通过本地检查，`pnpm lint` 已通过。通过 Mac Docker CLI 连到 Linux amd64 Dev Docker Host 后，使用独立镜像名称做了一次**非部署**构建试验；在基础镜像的 pnpm 安装步骤因容器 DNS 无法解析 npm registry 而失败，未执行新镜像的运行 Smoke；失败的临时容器已清理，未修改长期运行的 Dev 服务、Workspace 或管理员凭证。这不是 GHCR 发布成功证据。

**D92 Dev / 普通 CI / Release 职责纠正（2026-10-12，当前范围）：** 用户确认先在 Linux Dev 通过完整 MCP 功能与隔离 Docker Smoke，再提交/推送并检查普通 CI；仅正式发布时让 Release CI 从 Release revision 构建、Smoke 和推送 GHCR 镜像。依据 [D92](../../design/decisions.md#d92-mcp-dev-acceptance-and-release-ci) 更新本计划，已从普通 CI Linux x64 matrix 移除 MCP Docker 构建步骤，同时保留 Ubuntu `pnpm validate` 和六平台 CLI/SDK/Runtime native/package 代码回归。Release CI 的现有 GHCR 发布 job 不变；Dev 的标准部署/只读检查及隔离 31-method Smoke 由 [Dev Runbook](../../guide/dev-environment.md#发布前完整-mcp-验收) 负责。上一段提到的临时跨机 Docker 构建错误是历史诊断，**不是当前规范要求的 Dev Acceptance 运行，也不能冒充 GitHub Release CI 故障**。本轮只是调整代码/设计/文档，尚未触发新的 Dev 部署、普通远端 CI 或正式镜像发布；实际验收证据继续累积后才可关闭 Phase。

## 完成条件

只有 P15-01–09 全部实现、A15-01–09 **按 D91/D92 收敛后的**真实 Dev 验收与[通用完成标准](../README.md#6-phase-通用完成标准)全部满足、相关设计/指南/README/vlog 同步、final review 无剩余本阶段 finding，并取得**Linux amd64 Dev 真实 Docker 功能/隔离集成验收、最终提交 revision 的普通 CI（Ubuntu Validate + 既有六平台 Runtime matrix）及要求的真实客户端证据**，Phase 15 才能标记为 `done`。**正式 Release CI 构建/发布镜像、Tag 和生产部署均不属于 Phase 完成条件**，需另行授权。

阶段状态 `in_progress` 仅表示本地实际开发正在进行；它**不表示** QuickJS 的全部安全隔离、Private Plugin / Skill、最终 Docker 交付或运行验收已成功。若必需的外部手动授权/客户端测试尚未完成，继续保持 `in_progress` 或有证据的 `blocked`；不得降级验收或伪造通过。镜像正式发布与部署是单独授权动作，不因 Phase 完成自动执行。
