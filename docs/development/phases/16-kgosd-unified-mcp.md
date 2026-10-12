# Phase 16：`kgosd` 原生 MCP、JavaScript Sandbox 与私人 Plugin

## 目标与状态

`ready`（2026-10-12，D93 新架构独立开发计划，尚未开发）。**本 Phase 现行目标**：在一个 Go `kgosd` 进程和一个 HTTP listener 内直接提供 Web、HTTP API 与 MCP，使用 Go Kernel 操作和 QuickJS-NG + wazero 沙箱保留四个 Tool 与既有 JS 调用合同；交付 Linux amd64 单进程 Docker 镜像、官方 Skill、用户私人 Plugin。Phase 14 Web 业务 UI 继续 `deferred`，不作为 MCP 前置。

此前 [Phase 15](15-mcp.md) 的**独立 TypeScript MCP、Node Worker、通过 `@kgos/sdk` 访问容器内 daemon 的实现**已在旧版提交 `ea37ddf` 中实现、在 Linux Dev 和真实 ChatGPT 中验证并通过最终普通 CI，真实 ChatGPT OAuth + 四 Tool 和隔离 Docker 31/31 方法也已获得历史证据，但该目标架构被 [D93](../../design/decisions.md#d93-kgosd-unified-mcp) 取代。**Go 原生 MCP / WASM Bridge 尚未实现、可行性和新镜像未验证；本 Phase 不得用 Phase 15 的通过记录标 `done`。** 已提交的旧实现保持可用，直至新实现完成行为差分与安全验收，再清理旧代码。

目标主流程：

```text
初始化一个 Workspace / Instance
  → 运行唯一的 kgosd（Web + API + MCP 同端口）
  → AI 经 HTTPS/OAuth 连接 /mcp
  → kgos_preview / state_ancestry 直接 Go 阅读
  → kgos_read / kgos_run 在 QuickJS-NG WASM 内通过 Go Bridge 调用 Kernel
  → 官方 Skill 引导 / 私人 Plugin 连接
```

本计划按 [MCP owner](../../design/mcp.md)、[Runtime](../../design/runtime.md#统一-http--mcp-hostingphase-16-目标) 与 [D93](../../design/decisions.md#d93-kgosd-unified-mcp) 执行；D91 的 Linux amd64 Docker-only 与 D92 的 Dev / CI / Release 职责仍适用。**当前只设计迁移，不视为实际实施、测试或远端验收。**

## 设计输入

- [MCP owner](../../design/mcp.md)：四 Tool、JavaScript 命名空间与返回、Go/WASM Sandbox、完整 Preview/Ancestry Markdown、外部 MCP Bearer/OAuth 与单 Instance 安全；**本计划不重定义业务 API / Wire**。
- [Runtime owner](../../design/runtime.md#统一-http--mcp-hostingphase-16-目标)：一个 `kgosd`、一个 HTTP listener、本机动态端口兼容、显式远程/TLS、Web/API/MCP 路由及 Instance Token。
- [D93](../../design/decisions.md#d93-kgosd-unified-mcp) 取代 D85/D88/D89/D91 的旧双进程/Node Worker/SDK 回环/镜像命名；[D90](../../design/decisions.md#d90-mcp-single-admin-oauth) 的 OAuth 行为、[D86](../../design/decisions.md#d86-preview-and-commit-message) / [D87](../../design/decisions.md#d87-ancestry-markdown-history) 的 Markdown 合同保留；[D92](../../design/decisions.md#d92-mcp-dev-acceptance-and-release-ci) 的 Dev、普通 CI、Release 分工保留。
- [Kernel](../../../internal/kernel/)、[daemon API](../../../internal/daemon/api.go)、[go entry](../../../cmd/kgosd/main.go)、[Go Runtime](../../../internal/runtime/)、[SDK](../../../packages/sdk/src/client.ts)：唯一真实业务来源；Go MCP adapter 要与 SDK 参数、typed values、错误和流式合同同构，但**不再通过 SDK HTTP 访问自身**。
- [旧 MCP 实现](../../../packages/mcp/src/server.ts)、[旧 Worker](../../../packages/mcp/src/sandbox-engine.ts)、[方法矩阵](../sdk-test-matrix.md)和[Phase 15 历史验收](15-mcp.md#当前实现与验收证据)：仅作迁移对照。旧产品使用指南仍描述运行中的 TypeScript Dev 实现，不代表新架构已实现。

## 当前实现与依赖核对

| 项目 | 2026-10-12 核对事实 / 目标缺口 |
| --- | --- |
| 已发布基础 | Phase 00–13 `done`；Go `kgosd` / Kernel / SQLite Host / HTTP API / Web 静态 Shell 已实现，现有 TypeScript SDK/CLI 与平台 Runtime 仍在现行代码中 |
| 当前 Web | `packages/web/src/app/app.tsx` 是 Shell；Phase 14 `deferred`，本 Phase 不建设任何 Web 业务页面 |
| 现行独立 MCP | 已提交的 `packages/mcp/`、`Dockerfile.mcp`、`scripts/mcp-*` / `plugins/kgos/`；Linux amd64 Dev 和真实 ChatGPT 的四 Tool / OAuth、31/31 方法曾按**旧架构**运行成功 |
| Go MCP / OAuth | `internal/daemon` / `cmd/kgosd` 尚无 Go MCP Handler、外部 OAuth broker 或统一可配置远程 listener；MCP Go SDK 的确切版本 / protocol client 兼容需在实现时验证 |
| Go/WASM JS | `go.mod` 尚无 wazero / QuickJS Go 依赖；实际 QuickJS-NG WASI reactor、Promise、stream、强制终止和宿主隔离均未在 `kgosd` 验证 |
| Docker / CI | 目前镜像基于 Node.js + MCP / daemon 双进程；Dev runbook 与 Release workflow 仍运行旧模型，**不能**当新统一镜像验收；正式 GHCR 镜像没有发布证据 |

设计的边界已明确；技术可行性是 P16-01 的**阻断门槛**，不是任意修改公共 Tool/Script 合同的授权。如果发现必需 Go/WASM 约束无法实现，先在 MCP owner 记录具体失败与最小设计修订，再推进依赖项。

## 范围与 Feature

| Feature | 实际交付物与最小改动边界 | 依赖 | Acceptance |
| --- | --- | --- | --- |
| **P16-01 Go/WASM 可行性验证** | 在 Go/wazero 运行 QuickJS-NG WASI reactor，真实 async/Promise.all/增量迭代、权限限制、取消、DoS、资源预算与目标平台；固定依赖/WASM 构建链之前先证实可用 | 现有 Kernel、旧沙箱行为、MCP owner | [A16-01](#a16-01-gowasm-可行性) |
| **P16-02 统一 Runtime / HTTP listener** | 扩展 `kgosd` network/TLS 显式配置，在同一 daemon handler 挂载 Web/API/MCP；不改变默认 loopback/Instance Root/lock/credential 语义 | P16-01 技术门槛，Runtime owner | [A16-02](#a16-02-统一-daemon-与端口) |
| **P16-03 Go MCP 协议与 OAuth** | 官方 MCP Go SDK Streamable HTTP、四 Tool 注册、外部静态 Bearer、单管理员 CIMD/PKCE/OAuth、独立于 Instance Token 的 API 保护；不引入外部授权服务 | P16-02、MCP owner | [A16-03](#a16-03-go-mcp-与外部认证) |
| **P16-04 Go Bridge / JavaScript Read+Run** | Go 宿主方法表直接调用 Kernel，15 Read + 16 Write；每 Invocation 独立 WASM、Go 异步 Promise scheduler、Graph Stream 拉取、限额/取消、严格 JSON 与写入未知语义 | P16-01/03、Kernel & Graph 合同 | [A16-04](#a16-04-受控桥接及-31-方法) |
| **P16-05 Go Preview** | 直接 Go 公共操作生成全部 Branch/pinned Ontology、canonical YAML、Mermaid、原始 Message，视图缓存与绝对行窗口 | P16-03、Ontology/Object | [A16-05](#a16-05-完整-preview) |
| **P16-06 Go Ancestry** | 直接 Go 公共操作生成固定 root Commit DAG、分页 Cursor、原始完整 Message Markdown | P16-03、Evolution | [A16-06](#a16-06-ancestry) |
| **P16-07 单进程 Linux amd64 Docker** | 构建 Go `kgosd` + Web + WASM + native 扩展，不依赖 Node.js 运行时；一个容器/进程/端口、持久化重启、非 root / TLS / Signal；先 Linux Dev 实测 | P16-02–06 | [A16-07](#a16-07-统一-docker) |
| **P16-08 Skill / 私人 Plugin** | 更新官方 AI 安装说明与 Skill，用户注册 `kgosd /mcp` Connection，真实 ChatGPT OAuth + 四 Tool / 写入/重启验证 | P16-03–07 | [A16-08](#a16-08-私人-plugin) |
| **P16-09 移除旧实现 / 最终 Review** | 通过 parity 后清理 `packages/mcp`、Node Worker、旧命令/镜像/脚本与无效引用；更新 Dev/CI/Release/指南、完整质量门禁与真实最终 Revision 证据 | P16-01–08 | [A16-09](#a16-09-迁移收尾与工程门禁) |

### 非目标

不增加 Kernel / Lithograph 领域功能、独立 HTTP Gateway、额外 MCP Worker 服务进程、账号/角色、自动 Agent、跨 SDK 方法的事务、Cypher 安全解析器、第二套公共 API、MCP npm 包、Linux arm64 Docker 或 Web Phase 14 业务页面。不为“架构统一”顺带重写 TypeScript SDK/CLI 或改变已发布历史。旧 Node.js 实现只有在新实现完成同等能力、安全与 Dev 验收后才能删除。

## 实施顺序与依赖

```text
P16-01 Go + QuickJS-NG/WASI + wazero 最小技术实验（先过安全门槛）
       ↓
P16-02 kgosd single HTTP handler/listener + Runtime 安全边界
       ↓
P16-03 Go MCP SDK / Bearer / ChatGPT OAuth
       ├── P16-04 Go Bridge + JS 31/31 + streaming
       ├── P16-05 Go Preview
       └── P16-06 Go Ancestry
                    ↓
P16-07 Linux amd64 单进程 Docker / 隔离 Dev 验收
       ↓
P16-08 实际 ChatGPT / Skill / 私人 Plugin
       ↓
P16-09 旧实现清理、回归、最终 CI / Review
```

P16-01 可先在独立试验路径验证，不把未验证依赖提前引入正式产品。P16-03–06 在共享 Kernel/协议边界稳定后可以并行，但未取得任一 Acceptance 不得只因另一组通过而宣称它完成。先有新实现的真实 parity，再删旧代码；旧长期 Dev Instance 不做破坏性测试。

## Acceptance

### A16-01 Go/WASM 可行性

1. 固定目标 Go/wazero/QuickJS-NG reactor 的来源、版本、WASM SHA-256、构建和许可证证据，在实际 Go 环境创建/销毁 Guest，能够执行正常 JS、`async/await`、`Promise.all`（至少两个**真正同时在途**的宿主 Go 调用）、`return`/异常/JSON 往返。只用 mock scheduler、先执行完再填 Promise 或直接在 Node.js 执行不算通过。
2. 使用真实 Kernel 的 Graph Query stream，通过 `for await...of` 逐条拉取 `columns → row* → summary`，验证无 summary、terminal error、提前 `break`/`return`、并发 Promise、背压、取消与 socket 断开时资源及时清理；禁止全量预读数组。
3. 使用无限循环、深递归、无界分配、挂起 Promise、恶意属性反射、任意方法/文件/网络/环境访问试探，证明 wazero context 取消 / module close、memory pages 和宿主方法白名单可以强制终止且不会阻断别的 daemon 请求；WASM trap 不导致 daemon 崩溃。负向测试覆盖跨 Invocation 隔离和主机 Secret 不可达。
4. **Go/WASM 尚未经上述真实验证**，不将仅存在的 Reactor API / Go 示例判为通过。失败需先修订所属设计，不允许静默退回 Node Worker 或削弱隔离。

### A16-02 统一 daemon 与端口

1. `kgosd --root` 的默认 `127.0.0.1:0`、single-instance OS lock、`kgosd.lock`、`auth.json`、CLI Runtime auto-start 不回归；显式 host/port/TLS 使用同一真实 listener 并发布实际 endpoint。多 Instance 独立，Tool 无 Root 切换能力。
2. 同一 endpoint 验证 Web 静态资源、原 `/api/v1/*` 与 `/mcp` / 发现 / OAuth 路由；MCP 未配置 Secret 时不开放工具而普通 API/Web 仍可用；显式启用但 Secret 无效 fail closed；自定义 path 与保留路径冲突被拒绝。
3. 远程网络配置不使 OAuth Token 获得原 API 权限，API 仍只接受 Instance Bearer。外部端口显式暴露时验证 HTTPS / 安全代理和跨路由认证，避免因三者同端口而意外允许匿名数据读写。

### A16-03 Go MCP 与外部认证

1. 真实标准 MCP Client 经 Streamable HTTP 发现**恰好四个 Tool**，无额外业务 CRUD Tool / Resources / Prompts；协商与取消按实际使用的 MCP Go SDK revision 验证，不能仅凭 API 文档声明客户端兼容。
2. 静态管理员 Token 来源、缺失/错误/轮换、并发与权限校验；MCP OAuth Access Token 不被 `/api/v1/*` 接受，原 Instance Token 不自动成为 MCP 外部 Token；多客户端 principal 的 Preview / 脚本结果不能串用。
3. ChatGPT CIMD 可信 URL / callback 匹配、protected resource / auth server metadata、`WWW-Authenticate`、Scope / resource / issuer 绑定、PKCE S256、Origin / Ticket、一次性 Code、Refresh 轮换、重启失效和日志脱敏在**Go HTTP 实现**中全部负向/正向测试；授权 HTML 保留实际 Chromium 验证过的 `strict-origin`，不回归 `Origin: null` 的已发现错误。
4. 不把 Node.js 旧版实际 OAuth 成功冒充 Go 新版成功；至少一次经真实 ChatGPT HTTPS/OAuth 的 Tool 调用在 A16-08 完成。

### A16-04 受控桥接及 31 方法

1. 以 [31-method 矩阵](../sdk-test-matrix.md)逐项验收 **15 Read + 16 Write**，通过真实 MCP → Go Bridge → Kernel → Lithograph 调用，不走 SDK HTTP 回环。结果字段、typed Graph Value、StateRef、canonical YAML、流事件、错误 code/details 与现有 SDK 对照；无有意兼容别名。
2. `kgos_read` 不可通过动态方法名、原型/反射、流调用或伪造宿主消息触发任何写入；`kgos_run` 允许已定义写方法，SDK 方法新增时默认不可用并由许可矩阵提示缺口。
3. 验证 JS `Promise.all`、`for await...of`、提早退出、资源预算、取消、失联与无 `return`/非法 JSON/超限错误；同一 Guest VM 不能被并行 Goroutine 重入，MCP 高并发不泄漏 WASM / Go 资源。
4. 先写成功后异常、Graph 部分执行、Patch strict base、Merge expectedRevision、取消/超时后未知提交都须通过真实 State/Branch/History/Tag/Merge 查询核实。不能把整段 JS Invocation 包成事务或安全自动重试。

### A16-05 完整 Preview

1. 全部分支和各自 pinned Head、完整 Ontology/Domain/Definition/Property/Constraint/Index/shared targets、无 Domain、不同 kind 同名、分支移动/重复 Head 均准确取自同一个 Kernel 的公共业务操作；无任何底层 SQL 表直读或裁剪。
2. Mermaid/YAML/原始完整 Message 安全编码，嵌套反引号、表格/图注入与 LF 换行确定性；最终渲染后绝对 `Offset/Lines`、`viewRevision`、`offset/limit` 拼接、过期、缓存按 principal + Instance 隔离；错误时不假报完整视图。

### A16-06 Ancestry

1. 按指定 root/limit/cursor 读出真实 parent DAG、多父/跨页及固定 root，默认 20/最大 1000 的分页，游标稳定，不能伪造全历史结果。
2. 原始 Commit Message 完整 Markdown 代码围栏、Author/UTC microseconds、缺省与嵌套围栏安全保留；失败/资源不足明确错误，不截断冒充完整结果。

### A16-07 统一 Docker

1. Linux amd64 **干净构建**的实际容器为**一个 `kgosd` 主服务进程与一个 HTTP listener**；`/mcp`、`/api/v1/*`、`/` 在同一端口正常工作，镜像不需要 Node.js Runtime、宿主 daemon、宿主网络或容器启动下载/编译。WASM/native/Web 产物来源、版本、license 与摘要可复核。
2. 隔离临时 Workspace/Volume 做显式初始化、31/31、四 Tool、Web/API 回归、重启/持久化、非 root 权限、SIGTERM、错误凭证、TLS / 代理终止、端口/路径冲突与安全网络验收。不能拿运行中的旧长期 Dev Instance 执行破坏性测试，也不能把旧双进程 Docker Smoke 当新证据。

### A16-08 私人 Plugin

1. 根据实际用户注册的 MCP Connection ID 私有安装官方 Skill/Plugin，不嵌入 Token、Workspace Root 或服务端可执行文件；Web/Desktop 真正发现并调用四 Tool。
2. 用真实 ChatGPT HTTPS OAuth 验证 Preview 分页、Ancestry、JS 只读禁写、在隔离测试 Branch 上真实提交/回读和授权重新连接；旧版 ChatGPT 连接成功不算本版本的实际接入验证。

### A16-09 迁移收尾与工程门禁

1. 新架构所有 A16-01–08 成功后，清理旧 `packages/mcp` / Node Worker / `kgos-mcp` 专用 CLI、双进程 Docker/Compose/旧测试脚本与过时依赖；不得删除当前仍被其他交付物需要的 TypeScript SDK / CLI / Web 和无关用户修改。
2. 更新 Runtime/MCP/Client/Architecture 设计引用、Dev/安装指南、Docker/CI/Release / README / 依赖审计，让构建与运行入口只有**新**单进程路径；已发布历史保留为历史，不把未执行的 Release 写成成功。
3. 本地全量 `pnpm validate` 与必要 Go targeted/race/security、TypeScript/Web/CLI/Kernel/Lithograph 回归通过；Linux amd64 **新镜像**的隔离 Dev 功能全验收；最终提交 revision 的普通 CI Ubuntu Validate 与既有 Runtime 平台矩阵通过。普通 CI **不构建 Docker**，正式 Release CI 才构建、最小 Smoke 并推送 GHCR，且不作为本 Phase `done` 的前置条件。真实 ChatGPT、final diff/review 无剩余 task-affecting finding；严格区分设计、实现、验收、commit、push、发布与部署。

## 工程验证门禁

- 技术顺序：P16-01 先取得 Go/WASM PoC 的真实输出，再引入正式 Go 依赖 / WASM 产物 / API surface；按 Feature 的目标与失败路径做 targeted tests，必要时增量扩展到业务回归。不要为了“兼容旧模块”增加第二套 Go/TS SDK Gateway。
- 对照原则：保留旧 TS MCP 的四 Tool 与 31/31 SDK 矩阵作为**输入与预期**，执行者必须是新 Go MCP；两版输出对照发现真实语义分歧后按 owner 修复，不盲目 copy 旧 bug。
- 验收责任：Mac 源码、定向测试、完整 `pnpm validate`；Linux amd64 Dev 负责干净镜像、隔离读写、非 root、重启、真实 Client。普通 CI 继续质量与现有 Runtime 平台矩阵，不构建新 Docker；获独立授权的 `v*` Release CI 才构建/验收**精确发布镜像**并推送 GHCR。现有 [Dev Runbook](../../guide/dev-environment.md) 是**旧实现操作入口**，新部署脚本修好前不可把它的 success 当作新架构验收。
- 证据原则：测试必须记录源码 revision + dirty/clean、WASM/native artifact version/hash、镜像 ID/digest、实际 Host/Port、工具与权限行为、执行时间、失败日志（脱敏）。长期 Dev 只做安全只读检查；任何写入通过隔离临时 Docker Volume 完成。
- 安全和回归：负向覆盖 Token/OAuth/跨路径/跨 Instance、WASI 宿主权限、Go Bridge allowlist、资源关闭/竞态、流断连、未确认写入；不得将防护由真实行为降级成文档声明。

## Review Checklist

- 单一 `kgosd` 进程/端口是否真实提供 Web + API + MCP？是否仍有偷偷运行的 Node MCP 服务、SDK HTTP 回环、重复 Root/Token owner？
- 默认 loopback/active lock/Instance 认证是否保持；显式远程 listener 是否同时暴露 Web/API/MCP，TLS 和不同认证是否完整生效？
- Go 官方 MCP SDK 的 Tool、Protocol/OAuth metadata 与具体 ChatGPT 客户端实际协商是否匹配？不可把 Go SDK Bearer middleware 当成完整 OAuth 授权服务器。
- QuickJS/WASM 是否确实实现 Promise 并发、stream pull/backpressure、强制终止和宿主隔离？是否开放 WASI env/fs/net 或可重入使用同一 Module？WASM limits 是否只限制线性内存却遗漏宿主预算？
- 15/16 方法与原公开 SDK 逻辑严格一致，`kgos_read` 越权不可行，`kgos_run` 真实提交/错误/unknown mutation 不新增隐式事务？
- Preview 是否全部 Branch/完整 Ontology/固定 Snapshot/原始 Message 与精确绝对行？Ancestry 是否多父、Cursor 和原始完整 Commit Message？
- Docker 是否不依赖 Node.js 运行时、宿主 `kgosd` 或双进程脚本？镜像的 Web/API/MCP 是否在一个端口且 Volume/非 root/TLS/SIGTERM 真实可用？
- 是否保留旧代码/历史证据直到新 Go 真实 parity 后再移除？是否未污染 Phase 14 与 Lithograph 责任？
- 新版 Dev 全功能与真实 ChatGPT 是否都复验，普通 CI 和正式 Release 是否各自授权且不互相冒充？文档与 Phase 状态有无伪造完成？

发现影响当前 Acceptance 的问题先修复，再复验受影响依赖、检查最终 diff；只对已检查范围声明 Review 无剩余 task-affecting finding，不承诺不存在未来缺陷。

## 当前实现与验收证据

Phase 16 当前为 `ready`，Go MCP / QuickJS-NG / wazero、统一 listener 和单进程镜像均尚未实现或验收。先执行 P16-01 的真实 Go/WASM 可行性测试，再进入依赖实现。

旧版独立 TypeScript MCP 已作为 [Phase 15](15-mcp.md) 完成并提交 `ea37ddfca8c69bc701de0bb41d10d465f92c6b64`，其 [CI Run #65](https://github.com/bYiyLi/kg-os/actions/runs/38261156640) 为 7/7 success；Linux amd64 Dev 的 31/31 SDK 方法、重启持久化和真实 ChatGPT 四 Tool/OAuth 证据仅用于本 Phase 迁移对照，**不构成新 Go 目标架构的验收结果**。旧版 Skill 文件已提供，但私人 Plugin 中 Skill 是否激活需在 P16-08 单独核实。

## 完成条件

只有新 P16-01–09 的 A16-01–09 全部真实通过、Go MCP / WASM Bridge / 单进程镜像按 [D93](../../design/decisions.md#d93-kgosd-unified-mcp) 实现、Linux amd64 Dev 隔离镜像与真实 ChatGPT 客户端验收成功、最终提交 revision 的普通 CI 与最终 Review/文档同步完成，才能将 Phase 16 标记为 `done`。正式 Release / GHCR 发布和生产部署分别授权，不作为本 Phase 的提前完成条件。
