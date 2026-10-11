# Phase 15：MCP & Private Plugin

<!-- cspell:words Streamable Asyncify -->

## 目标与状态

`ready`（2026-10-12，**仅开发计划已具备**，尚未实现）。本阶段在现有 KG OS Instance 和 `@kgos/sdk` 之上交付独立 MCP Server、四个 Tool、统一 JavaScript Sandbox，以及官方 Skill / 用户私人 Plugin 接入方式。**不依赖 [Phase 14 Web](14-web.md)**；Web 当前仍为 `deferred`。

完成后的主流程：

```text
用户的 KG OS Instance（现有 kgosd）
  → 用户部署独立 @kgos/mcp，绑定一个 Workspace Root
  → MCP 客户端通过受保护的 Streamable HTTP 连接
  → kgos_preview / state_ancestry 直接取得上下文
  → kgos_read / kgos_run 在 QuickJS Sandbox 组合 SDK
  → 官方 Skill 指导 AI；私人 Plugin 引用用户自己的 MCP Connection
```

本阶段以 [MCP 设计真源](../../design/mcp.md)和 [D85–D88](../../design/decisions.md#d85-mcp-programmable-ai-client)为合同；Development 只定义**实现顺序、验收证据与完成门槛**。QuickJS WASM + Node.js Worker 已被选为目标技术，但并发 Promise、流式桥接和隔离尚未取得真实证据，必须先做 P15-01 验证；未通过时不得跳过安全边界直接实现。

## 设计输入

- [MCP / Plugin 设计](../../design/mcp.md)：四个 Tool、SDK 方法权限、Sandbox、完整预览、历史 Markdown、远程认证和私人安装流程的唯一正文 owner；本计划不得新增另一套 Tool/业务合同。
- [D85](../../design/decisions.md#d85-mcp-programmable-ai-client)、[D86](../../design/decisions.md#d86-preview-and-commit-message)、[D87](../../design/decisions.md#d87-ancestry-markdown-history)、[D88](../../design/decisions.md#d88-javascript-sandbox-sdk-execution)：已确认的关键取舍。
- [Client SDK](../../design/client.md#kgossdk)及 [实际 SDK 方法](../../../packages/sdk/src/client.ts)：`ontology / object / graph / evolution` 的唯一 TypeScript HTTP 入口；[Object canonical YAML](../../design/object.md#object-value-与-representation)、[Ontology read](../../design/ontology.md#ontology-read-合同)、[Graph passthrough](../../design/graph.md#graph-公共调用合同)、[Evolution](../../design/evolution.md#evolution-公共调用合同)及[公共错误](../../design/contracts.md#公共错误合同)继续各自负责业务语义。
- [Runtime Workspace / Instance](../../design/runtime.md#workspace-root-与-instance-directory)、[本机认证](../../design/runtime.md#单-token-实例认证)、[active endpoint](../../design/runtime.md#http-bind-与-active-endpoint)及[Graph streaming](../../design/runtime.md#graph-http-streaming-framing)：MCP 只能通过 SDK 使用现有 daemon，不开放 `kgosd` 公网监听，也不另做 Runtime 身份或凭证真源。
- [Phase 00–13 已完成基线](../README.md#4-当前基线)、[共同完成条件](../README.md#6-phase-通用完成标准)、[仓库质量门禁](../../guide/development.md)及[当前六平台 CI](../../../.github/workflows/ci.yml)。私人 Plugin 以实现时实际客户端协议和工具验证为准，不把示例配置当成永远不变的外部标准。

## 当前实现与依赖核对

2026-10-12 只读核对本地 `main@4321a3be6ece7bf5b45ea3e7e03b6ff480a47d56` 及当前**尚未提交的 MCP 设计工作树**。Phase 00–13 的历史完成证据仅是本阶段的依赖，不替代本阶段的任何验收。

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
| **P15-02 MCP Host 与认证** | `packages/mcp/` 独立 TypeScript 服务、Streamable HTTP `/mcp`、四个 Tool 注册、单 Workspace Root / Instance、daemon endpoint / Token 解析、MCP 对外认证与安全部署入口 | P15-01；[Runtime](../../design/runtime.md) | [A15-02](#a15-02-服务与连接) |
| **P15-03 受控 SDK 桥接与只读工具** | 同进程宿主校验与 Worker 内四个顶层 namespace；SDK 只读许可集、JSON 参数/结果隔离，完成 `kgos_read` | P15-01/02；[SDK 能力边界](../../design/mcp.md#sdk-能力边界) | [A15-03](#a15-03-只读-sdk) |
| **P15-04 完整 SDK 与执行生命周期** | 同一 Sandbox 开放写方法完成 `kgos_run`；结果/错误、时间/内存/调用量/输出预算、取消、流式读写与未知写入状态 | P15-03；[写入/错误合同](../../design/mcp.md#写入错误与部分成功) | [A15-04](#a15-04-读写与执行安全) |
| **P15-05 Preview Snapshot 收集** | 全部 Branch / Head 固定、完整 Ontology / Domain / Definition 枚举、shared Index 与 schema 细节复用公共 SDK；大视图完整性诊断 | P15-02；[Preview 来源](../../design/mcp.md#版本绑定与内容来源) | [A15-05](#a15-05-preview-完整快照) |
| **P15-06 Preview Markdown 与行窗口** | `mermaid` + canonical `yaml` + 原始 Message 代码围栏、完整 Definition 索引、全局 Offset/Lines、进程内 viewRevision / 隔离缓存与行窗口 | P15-05；[排版规范](../../design/mcp.md#markdown-阅读呈现规范) | [A15-06](#a15-06-preview-排版与分页) |
| **P15-07 Ancestry Markdown** | `state_ancestry` 复用 SDK pinned root / cursor，按 Commit 分页生成局部真实 DAG、导航表和完整原始 Message | P15-02；[Ancestry owner](../../design/mcp.md#state_ancestrycommit-dag-markdown-历史) | [A15-07](#a15-07-ancestry-历史) |
| **P15-08 官方 Skill 与私人 Plugin** | `plugins/kgos/` 的官方 Skill、私人 Plugin 模板、面向 AI 的 `INSTALL.md` 与受保护 MCP 连接指导；验证用户自身注册连接及 Client 使用 | P15-02–07；[安装与责任](../../design/mcp.md#官方-skill-与私人-plugin) | [A15-08](#a15-08-skill-与私人-plugin) |
| **P15-09 集成交付与 Review** | 真实 daemon E2E、repo-out packaged 测试、六平台 CI、文档同步及本 Phase findings 闭环 | P15-01–08 | [A15-09](#a15-09-端到端与交付)及[工程门禁](#工程验证门禁) |

### 非目标

不实现新 Kernel / Lithograph 能力、Web UI、Agent、独立知识缓存/索引/Commit 模型、第二套 Search/Cypher DSL、SDK 每方法对应的 MCP Tool、MCP Resources/Prompts、跨方法事务 / `dryRun` / 自动回滚 / 自动重试、单独 SDK Gateway 服务、额外用户配置系统、任意宿主文件或 HTTP Tool，也不为 Cypher 增加解释或限制。

MCP Server 与私人 Plugin 是两个部署单元：**不**把 MCP Server 打入 Plugin 包，不集中托管用户 KG OS；不要求 Phase 14 Web 先完成。npm 正式发布、Git Tag、GitHub Release、公开 Plugin 上架或实际生产部署不属于本阶段完成动作，分别另行授权。

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
P15-09 真实 E2E / packed / 六平台 CI / final review
```

P15-01 是**阻断依赖 Sandbox 的实施门禁**：不能以模拟 `Promise.all`、预读整条 Stream 或 `node:vm` 代替所选技术的实际证明。P15-05–07 可在 P15-03/04 的代码完善期间使用已完成的 MCP/SDK 基础并行推进，但各自必须有真实 SDK 回执与可解释测试，不使用 hardcoded fixture 冒充真实结果。真实 ChatGPT 连接可能需要用户在账号侧授权；先完成本地及标准 MCP Client 验收，人工接入仍是最终真实交付门槛。

## Acceptance

以下全部是**未来实际实现后**必须取得的证据，当前均未执行。固定值、字段与边界以 [MCP owner](../../design/mcp.md)为准，不在开发计划里重新制定 API。

### A15-01 Sandbox 技术验证

1. 在真实 QuickJS WASM + Worker 中执行 `async / await`、`Promise.all()`、`for await...of`、`return`、错误抛出和 JSON 往返；至少一次通过宿主 Bridge 真正调用 SDK；不以 Node.js 直接 eval 或 mock async 循环代替。
2. 同时验证多个 pending SDK Promise 的交错、Graph 流式 `columns → row* → summary` 消费、背压和提早退出；无 terminal summary、terminal error、SDK 取消及异常均不得冒充完整成功，也不会留下未终止的后台迭代与无界缓冲。Asyncify 如无法满足并发不作为默认实现。
3. 验证无限循环/无界递归、堆/栈耗尽、未完成 Promise、Worker 中断、编译时与返回值超限均可终止且不阻塞 MCP 其它调用；验证无宿主 `process`、文件/网络、Token、任意模块导入或 Bridge 越权可达。
4. 先记录所选依赖版本及当前 Node 版本的**本机真实 smoke**，作为依赖其它 Sandbox Feature 的工程验证门槛；macOS/Linux/Windows arm64/x64 的完整兼容性证据由 [A15-09](#a15-09-端到端与交付) 的最终六平台 CI 取得，不能把单机可行性冒充跨平台完成。若验证不满足设计，保持依赖功能未完成并回到 MCP owner 做最小必要修订，不静默替换为弱隔离实现。

### A15-02 服务与连接

1. 从显式 Workspace Root 启动 MCP Server，按现有 Runtime 所属 locator、daemon lifecycle 与凭证规则连接准确的单一 Instance；错误 Root、缺失/失效 daemon、Token 变更及多实例并行不跨库、不连接错误 Instance、不泄露本地凭证。
2. 真实 MCP Client 能通过 Streamable HTTP 完成初始化、工具发现及调用，发现**恰好四个**约定 Tool；没有额外业务 CRUD Tool、Resources 或 Prompts。协议取消和服务退出会清理执行中的请求。
3. 客户端无认证、错误认证、会话失效或跨调用者缓存访问被拒绝。MCP 外部认证与本地 `kgosd` Bearer 独立，HTTPS / Secure Tunnel 对外入口真实生效；不能把本机 daemon 裸露在公网，也不能只靠 Plugin 保存 Token 当作授权。
4. 服务端重启、多个 MCP 请求与客户端断连均不会让跨 Invocation 的授权、缓存或 Workspace 身份混用；日常日志/错误不包含 API Key、Bearer、Connection 密钥或私有宿主内部细节。

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
3. `packages/mcp/` 与 `plugins/kgos/` 从**干净源码**能构建及使用；在仓库外以实际打包产物运行 MCP 与现有 SDK/Runtime，不能依赖主树 `node_modules`、`.cache`、未跟踪文件或测试 Stub。新增依赖符合现有许可证、安全与打包门禁。
4. 真实 macOS/Linux/Windows arm64/x64 六平台 CI 运行时验证 QuickJS WASM / Worker 启动、MCP Host、四 Tool 的最小真实 SDK smoke；本阶段的 Validate + 六平台 matrix 对应最终 revision **实际成功**。实际 ChatGPT Web/Desktop 接入结果与平台 CI 是不同证据，不能互相替代。
5. 完成最终代码与安全 Review、受影响问题修复/复验；设计 owner、开发计划、实际使用指南、README / vlog 按各自职责同步。不以通过质量检查或 workflow 配置代替实现结果。

## 工程验证门禁

1. 每个 Feature 先做相应真实 SDK / daemon / MCP targeted tests；Sandbox 的 escape/DoS、Bridge 权限、Token、异步迭代、取消和部分写入均要有负向测试。为已确认的协议选择最小依赖，不引入无实际用途的抽象、额外进程服务或兼容层。
2. 本地完整 `pnpm validate`（包括 TypeScript 类型/覆盖率/静态质量、Go 回归、真实 native Graph、Playwright、依赖/许可证/审计/打包与 Markdown/diff）成功，沿用现有 coverage / type coverage 门槛，不靠排除 MCP 业务代码规避覆盖。
3. 独立 fresh-source `pnpm run setup && pnpm validate` 成功，证据对应相同源码及明确差异；干净构建、SDK exports / package 内容、WASM 产物来源和 Worker 入口必须随包可用，不使用未跟踪/本机下载缓存偶然成功。
4. 仓库外运行打包的 MCP + SDK + 实际 `kgosd`，完成四工具与受保护接入 smoke；现有 CLI / Web shell、单实例 token、Graph/Cypher、Ontology、Merge 无回归。
5. 更新[现有 CI](../../../.github/workflows/ci.yml)的适当测试入口，确保 Ubuntu Validate + macOS/Linux/Windows arm64/x64 六平台 native/package 工作流对 MCP 新交付覆盖并**实际通过**；无需假设 CI 配置完成等于运行完成。远端所需的 commit/push 分别取得授权。
6. 客户端侧真实 ChatGPT Web/Desktop 连接与私人 Plugin 验证属于产品集成 Acceptance；遇到账户交互/授权依赖如实报告，不伪造证据，也不因外部操作暂时不可执行而降低其它验收。**正式发布、npm publish、公开上架与生产部署不在完成门槛。**

## Review Checklist

每轮结合真实代码、协议输出与设计真源逐项复核：

- 四个 Tool 是否足够且职责准确；是否混入已否决的独立 SDK 方法 Tool / Resources / Prompts。
- MCP 是否只绑定一个明确 Instance，外部认证、TLS / Tunnel、本地 daemon token是否仍是两个边界；日志、错误、Plugin 包是否泄露凭证。
- QuickJS 与 Worker 是否真的可终止、隔离宿主能力；JS 反射/原型、异步回调、越权方法与 `Promise.all()` 是否绕过只读许可。
- SDK 是否仍为唯一业务真源，`ontology/object/graph/evolution` 无前缀、全方法、错误与 typed values 是否完整；未来新增方法是否默认拒绝而不是暗中提权。
- 无 `return`/非 JSON/超限是否以错误结束；`for await` 是否真正增量，取消与消费提早终止是否清理 Stream。
- 已提交写入与未知写入是否如实表述；是否存在隐式事务、回滚、自动重试或 MCP 自制 Cypher parser。
- Preview 是否覆盖全部 Branch/完整 Ontology、pinned State、真实共享 Index 与正确 Mermaid/YAML，索引/代码围栏/绝对行号是否支持无损重建。
- Ancestry 是否保留原始 Message、多父 DAG、稳定 cursor 和跨页父结点，不伪造全历史或自动总结。
- Skill/Plugin 是否可在真实 ChatGPT 客户端使用、不写死用户 Connection ID、不要求 Web / npm release。
- 文档/阶段状态是否有对应真实证据；是否把旧 Phase CI、空包装、单元模拟或未执行的平台测试误写成本次完成。

发现问题后先修复，再复验受影响的合同与回归。最终 Review 仅在已有证据和本阶段实际变更范围内声明没有剩余 task-affecting finding，不声称不存在任何未来问题。

## 当前实现与验收证据

截至 2026-10-12：本阶段 **P15-01–09 均未实现，A15-01–09 均未取得运行验收证据**；MCP 源码、Sandbox 和私人 Plugin 尚不存在。`@kgos/sdk` / `kgosd` 的已完成能力属于 Phase 00–13 前置基线。MCP 的 D85–D88 设计当前仍处于本地未提交工作树，不以未跟踪设计文件代替已交付产品。

本次动作仅新增 Phase 15 开发计划并更新开发路线，审查与格式/链接/diff 检查仅验证**文档正确性**。未开发代码、运行服务、远程验收、提交、推送、发布或部署。实施时须基于当时最新仓库重新核对这些事实。

## 完成条件

只有 P15-01–09 全部实现、A15-01–09 真实验收与[通用完成标准](../README.md#6-phase-通用完成标准)全部满足、相关设计/指南/README/vlog 同步、final review 无剩余本阶段 finding，且**最终交付 revision 的远端 Validate + 六平台 CI 和要求的真实客户端验证取得成功证据**，Phase 15 才能标记为 `done`。

阶段状态 `ready` 仅表示当前设计、依赖、Feature 和 Acceptance 已可以指导开始实现；它**不表示** QuickJS 的安全隔离、ChatGPT 远程连接、Plugin 或运行验收已成功。若必需的外部手动授权/客户端测试尚未完成，保持 `in_progress` 或有证据的 `blocked`；不得降级验收或伪造通过。正式发布与部署是单独授权动作，不因 Phase 完成自动执行。
