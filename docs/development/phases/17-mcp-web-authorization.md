# Phase 17：MCP 统一 Instance 认证与 Web 连接授权

<!-- cspell:words mcpserver -->

## 目标与状态

**`done`（2026-10-14，用户明确批准以已部署 Dev 的功能与真实 ChatGPT 授权验收关闭；原 A17-05 尚缺 GitHub CI / 完整新版隔离矩阵，作为本次用户批准的关闭例外保留，未声称通过）。**

将已完成 Phase 16 的 Go MCP 认证，从「独立 MCP 管理员 Token + Go 手写 OAuth 表单」迁移为「**复用现有 Instance 认证 + Web 登录态中的显式连接授权**」。ChatGPT 发起 OAuth 时打开**现有 KG OS Web**：已登录直接出现连接授权弹窗，未登录先走 Web 自己的登录，随后继续授权；用户确认后自动返回 ChatGPT。OAuth Code、Access/Refresh Token 由 Go 在后台处理，用户不再接触 MCP 专有凭证。

本 Phase **仅交付 MCP 认证与其 Web 集成边界**；Web 登录状态、Session 创建/保存/恢复、通用认证弹窗、页面框架与主题由 Web/Runtime 的独立任务负责，不能为了完成本 Phase 复制一套。Web 对授权弹窗的渲染是跨模块集成前置/验收对象，不属于本 Phase 对通用 Web 登录能力的实现授权。

旧 [Phase 15](15-mcp.md) / [Phase 16](16-kgosd-unified-mcp.md) 的 `done` 与真实 ChatGPT 证据为**旧认证架构的历史事实**，不会因为新目标改写；本 Phase 不能引用它们证明新 Web OAuth 流程已成功。

## 设计输入与责任

- **唯一认证方案真源**：[MCP：统一 Instance 认证与 Web 连接授权](../../design/mcp.md#统一-instance-认证与-web-内的-mcp-连接授权phase-17-目标)、[D95](../../design/decisions.md#d95-unified-mcp-web-authorization)。本计划只安排实现和验收，不重定义 OAuth wire、Web 登录机制或业务权限。
- **已有根认证 owner**：[Runtime 单 Token 实例认证](../../design/runtime.md#单-token-实例认证) 的 `.kgos/auth.json`；HTTP API 的凭证生命周期、Kernel 和 SDK 语义不改。
- **Web 认证依赖**：[Web 连接/认证设计](../../design/web.md#连接认证与恢复) 及其当前独立开发的登录状态。MCP 只需要可在 OAuth 打开的同源 Web 中被验证的**既有登录上下文**，及该上下文提供的安全写入/CSRF 能力；具体 Session 形态不由本 Phase 决定。**在实际接入前须检查 Web owner 已落地的合同与实现**，不能靠历史聊天认为可用。
- **已实现 MCP 基线**：[`internal/mcpserver/`](../../../internal/mcpserver/)、[`cmd/kgosd/main.go`](../../../cmd/kgosd/main.go)、[`internal/command/kgosd_options.go`](../../../internal/command/kgosd_options.go)、[`internal/daemon/api.go`](../../../internal/daemon/api.go)；四 Tool、15/16 SDK 许可集、Go/WASM sandbox 和统一进程部署保持不变。
- **工程验证**：[D94 Mac / OpenClaw / GitHub CI 分工](../../design/decisions.md#d94-openclaw-docker-development-and-ci)、[KG OS 开发规范](../../../AGENTS.md#开发ci-与-release-分工)。不在 Mac 运行 Docker。

### 本 Phase 不负责

- 不设计/实现 Web 通用登录状态、Cookie/Session 方案、跨标签同步、认证表单、路由框架、主题或主工作区。
- 不新建账户、角色、细粒度 Scope、外部 IdP、身份数据库、OAuth 持久 Token Store、连接管理设置页或新第三方 MCP Client 类型。
- 不修改 Kernel、Lithograph、业务 API/SDK、四个 MCP Tool、JavaScript Bridge 或 Graph/Version 语义；不做发布、生产部署或历史兼容层。

## 依赖与实施顺序

| Feature | MCP 侧交付与最小范围 | 前置 | 验收 |
| --- | --- | --- | --- |
| **P17-01 统一根凭证** | `kgosd` MCP 复用现有 Runtime Instance credential，去掉 MCP 专用 Token 解析/必填门禁、CLI/ENV/Compose Secret 引用与安全日志；`/mcp` 在有效 Instance 上可供可信本地 Bearer 使用，未授权一律拒绝 | Runtime 单 Token 已实现；核对当前配置与 Dev 影响 | A17-01 |
| **P17-02 OAuth 到 Web 的入口** | 沿用 CIMD、PKCE、issuer/resource/scope 的既有 Go 验证；`GET /oauth/authorize` 校验、生成有界一次性授权请求并跳转到 `/?mcp_authorization=<request_id>`，删除服务端 HTML/Token 表单 | P17-01；Web 同源静态应用可打开 | A17-02 |
| **P17-03 Web 授权决策接口** | 仅在 MCP Go 层实现 `GET /oauth/request` 与 `POST /oauth/decision`；接入 Web owner 提供的**已登录校验与写入保护**；输出经校验的客户端/资源/读写权限数据和安全回调 URL；批准/拒绝各自完成 OAuth 结果 | P17-02；**Web 已登录上下文与防 CSRF 接口实际可用** | A17-03 |
| **P17-04 OAuth 凭证与越权保护** | 保留 Code/Access/Refresh 的 PKCE、Audience、TTL、一用即销与轮换；区分 Web Session、Instance Bearer、MCP OAuth Bearer；实现失败/断线/重启/跨 Instance、重复决策安全处理 | P17-01–03 | A17-04 |
| **P17-05 真实端到端与清理** | 与 Web owner 的授权弹窗对接、更新**仅涉及 MCP 认证**的部署说明、Plugin 安装流程、Dev/CI Smoke 与回归测试；删除旧 HTML 和 Token 测试/配置，检查全部差异 | P17-01–04 + Web 授权弹窗已接入 | A17-05 |

**可并行范围**：P17-01、P17-02 的 Go 后端准备可在 Web Session 未完成时进行定向开发测试；P17-03/05 的真实对接不得把 mock 登录或手工传第二个管理员 Token 冒充已集成。只依赖 Web 的「已登录状态、认证成功回调、同源受保护提交」三个对接能力，**不等待 Web 全部业务页面或整个 Phase 14 结束**。

## Acceptance

### A17-01 单认证真源

- 有效 Instance 的 `auth.json` Credential 能访问受信任 `/mcp`，错误 Instance Bearer、空 Token、失效凭证不能调用 Tool；没有独立 MCP Token 也能正常启动 Web/API/MCP。
- 不再读取或要求 `KGOS_MCP_TOKEN`、`KGOS_MCP_TOKEN_ENV`、`KGOS_MCP_TOKEN_FILE`、`--mcp-token-env`、`--mcp-token-file`；显式旧配置有清晰拒绝而非退回第二份凭证。`/api/v1/*` 仍只遵循原有 Runtime 认证合同。
- ChatGPT 必须通过 OAuth 获取**仅限 MCP 使用**的凭证；不把直接 Instance Bearer 传给 ChatGPT、Plugin、Web URL 或授权结果。

### A17-02 标准授权入口与 Web 跳转

- `GET /oauth/authorize` 验证真实 ChatGPT CIMD、Redirect URI、State、PKCE S256、Scope、Resource 与 Issuer 后，生成高熵、限时请求并 `303` 跳入**同一 KG OS Web**；响应不包含新服务端 HTML 认证表单、第二个 Login UI 或原始 Token。
- 请求不合法、回调不可信、重定向链/客户端元信息异常时不可创建待批准请求；仅凭 request ID 不能签发 Code。
- `/.well-known/*`、`/oauth/token`、`/mcp` 保留正确 discovery/challenge、标准错误和协议兼容性；公开 HTTPS/反向代理须真实转发**同源 Web `/`、静态资源、Web 登录接口**及全部 OAuth 路由，不能只暴露 MCP/OAuth API。

### A17-03 复用 Web 登录并明确同意

- **已登录**：ChatGPT 新发的 OAuth 请求在现有 Web 工作区上覆盖**连接授权弹窗**，直接展示校验后的客户端、Instance 和完整读写权限；无第二次 Token 输入。
- **未登录**：先走 Web owner 的原有认证；成功后继续**同一待授权请求**，不会再次索取 MCP 管理员 Token，也不会自动授权。超时/失败时保留明确错误并要求从 ChatGPT 重新连接。
- **批准**：经过服务端验证已登录上下文和 CSRF/Origin/同源条件、一次性请求校验后，才签发 Code 并跳转已校验 ChatGPT 回调；**拒绝**：返回 `access_denied` 且不发 Token。登录、查看详情、刷新/重试均不得自动等于批准。
- 模拟无登录、过期/撤销登录、跨 Instance、泄漏请求 ID、CSRF/跨源、重放/重复点击时不得授权。不能靠前端显示正确来替代 Go 侧验证。

### A17-04 Token 生命周期与隔离

- Code 限时单用，PKCE/code_verifier、Client/redirect/resource/Scope 严格对应；Access 仅授权 MCP 四 Tool，Refresh 限时一次性轮换；按设计 TTL 验证过期和重启失效。
- OAuth Access/Refresh Token 不可调用普通 API，Web 登录状态/Cookie 不可直接作为 `/mcp` Credential；错误 Instance Token、错误 client/audience、无权限或过期返回拒绝。
- Web 退出登录不得被误认为撤销已经批准的 OAuth Grant；Web 会话终止后不能再批准新连接，已有 Grant 继续按自身 TTL/轮换与 daemon 重启规则处理。
- 日志、错误、授权详情、Web URL、Plugin 包不泄漏 Instance Token、OAuth Token、Code、State 或敏感回调参数（授权回调中的 Code/State/iss 为标准例外）；数量与大小限制、并发与竞争验证通过。

### A17-05 联调、回归与交付

- Mac：Go 定向单测/集成测试、Web 与授权联动 E2E、必要 race/security、`pnpm validate` 与最终 diff/review 通过，且保留其它开发会话未提交的改动。
- OpenClaw Linux amd64：基于新源码干净 Docker 镜像、隔离 Instance/Volume 完成 Web 登录态→弹窗→授权、OAuth→四 Tool 真实读写、跨路径认证隔离、重启/回退、无旧 MCP Secret 等测试；不向长期 Dev 原有 Branch 写入。
- GitHub Actions：当前 revision 的 Ubuntu Validate、既有平台矩阵及 Linux amd64 Docker 构建/Smoke 真实成功；**真实 ChatGPT 客户端**在 HTTPS 上分别验证已登录、未登录、拒绝、重新连接与写入隔离（仅明确授权的测试 Branch）。模拟器不替代真实客户端。
- 只同步本次 MCP 认证牵涉的 `docs/design/mcp.md`、[D95](../../design/decisions.md#d95-unified-mcp-web-authorization)、本 Phase、MCP 使用指南/私人 Plugin 接入说明和必要配置/测试脚本；Web Login owner 自行维护它的设计与实现。不存在遗留生效的第二份管理员 Token 或独立授权 HTML。

**2026-10-14 用户批准的关闭例外（保留原始验收标准）**：用户确认在新 Dev 上重新完成 ChatGPT OAuth 授权，功能测试没有问题，并明确要求直接把 Phase 17 标记为 `done`、接受此前报告的未完成工程门禁。此前 A17-05 对 GitHub Actions、全部新版本隔离 Docker 读写矩阵及真实客户端各个分支的要求**原文保留**；未实际完成的 CI / 全矩阵不记为 passed，仅对本次 Phase 关闭予以豁免。后续提交/推送、发布门禁、完整 CI 与安全回归仍应按仓库规范单独验收，不能以本条作为 CI 成功证据。

## Review Checklist

- **职责**：是否只更改 MCP 认证与最小 Web 对接，未实现或覆盖其它会话维护的 Web Session / 通用认证？是否将 OAuth 跳转页面错误地当成独立 App？
- **主体**：统一根凭证是否只从当前 Instance 取得？直接 Bearer 是否只由可信调用方持有？是否可能把 Instance Token 交给 ChatGPT，或把 OAuth Token 授权成普通 API Token？
- **同意**：未登录→登录→弹窗、已登录→弹窗、拒绝、过期、刷新、并发双击是否均符合「登录不等于自动批准」？服务端是否检查当前登录和 CSRF，而不是相信前端？
- **协议**：CIMD/redirect 白名单、issuer/resource、Scope、PKCE、Code/Refresh rotation、Audience、`WWW-Authenticate`、真实 HTTPS 与 ChatGPT callback 是否匹配？
- **失效**：错误的请求 ID、失效 Web Session、重启、跨 Instance 或回调参数篡改是否全部 fail closed？是否出现 Token URL/日志/前端存储泄露？
- **发布与验收**：旧 P15/P16 证据是否被当成新 Phase 通过？Mac、OpenClaw、CI、真实 ChatGPT 是否各有独立证据？是否擅自提交、推送、发布或部署？

出现与 Web 已确认认证实现无法对接的差异时，**先查 Web owner 当前真源与代码，再在 MCP 的最小接口上适配**；不得另建认证 Session 或暗改 Web 登录规则。Review 发现与 Acceptance 相关的问题，修复并重验受影响的步骤后再检查最终 diff。

## 当前进展与完成条件

- **已确认设计**：统一 Instance 认证、复用 Web 登录状态、显式 MCP 连接授权、Go 负责 OAuth Token 管理，见 [MCP](../../design/mcp.md#统一-instance-认证与-web-内的-mcp-连接授权phase-17-目标) 与 [D95](../../design/decisions.md#d95-unified-mcp-web-authorization)。
- **已修改（未提交工作树）**：`kgosd` MCP 现在复用 Runtime Instance Token；Go `/oauth/authorize` 跳转现有 Web，`/oauth/request` 和 `/oauth/decision` 校验 Instance Bearer、Origin、一次性请求和授权结果；Go 手写 HTML 与第二管理员 Token 逻辑已清理。`packages/web/src/features/mcp/` 已新增以用户提供的高保真为依据的授权弹窗、读写权限说明和批准/拒绝交互；只消费 Web 的现有认证连接，没有设计新 Session。
- **已验证（本地）**：Mac 上全部 Go `-race`（含 `lithograph_smoke`）通过；Web 完整 `check` 共 53/53 项测试通过；MCP 浏览器 E2E 4/4 通过（已登录、未登录、明确拒绝、过期退出）。Go 真实 Handler + Web Session 集成测试验证跨标签恢复、CSRF/Boot Guard、一次性授权、OAuth Code 交换、普通 API 隔离及退出登录后禁止新授权；已清理阻断 Instance Token 的旧 Phase 16 测试。完整 `pnpm validate` 已通过（Go 覆盖率 90.0%、Go Race、Web 测试、浏览器 E2E 22/22、Go 漏洞/依赖/许可证/打包检查）；随后 MCP Dev 旧镜像回退验收脚本仅完成本地语法与 Lint 验证，未实际回退长期 Dev。
- **已验证（隔离 Linux Docker）**：OpenClaw 独立临时源码、镜像和 Volume 中，使用当时 Phase 17 代码编译的 Linux amd64 `kgosd` 与已验证运行时组件组合，完成 31/31 SDK、四 Tool、非 root / 无 Node、重启持久化 Smoke；**不是后续 Web Session 全部修改的正式干净构建**。早期 `Dockerfile.unified` 构建尝试曾因镜像元数据和 npm 下载问题失败；随后正式 Dev 构建已成功（见下），但仍没有针对最新提交的独立 GitHub CI 证据。
- **已部署 Dev（2026-10-14）**：Mac 当前 `dirty` 工作树经既有 `pnpm dev:mcp deploy` 完成源码同步、SQLite 在线备份、正式 `Dockerfile.unified` Linux amd64 镜像构建、Compose 镜像切换和自动只读验证；`pnpm dev:mcp check` 与 `status` 再次通过。运行镜像 `sha256:81216e09a1f64ac8ed67db3b30ea4e31c400a209135eaf339eccf7018c2e8951`，数据备份 `/data/apps/KgosDev/data/backups/20261014T070920Z-qwRPyKkr`。公网 HTTPS `/`、授权服务器与受保护资源 metadata 为 200；无认证的 `/mcp` 与 `/oauth/request` 为 401。长期 Dev 数据未清空、无生产部署；**此条记录描述当次自动验收状态**，后续用户实际重新完成 ChatGPT 授权（见下），推送后 CI 仍未运行。Git Commit / Push / Tag / Release 均未执行。
- **真实客户端用户验收（2026-10-14）**：用户报告已在新版 Dev 中重新完成 ChatGPT OAuth 授权，测试没有问题。这属于用户手工验收证据，不能延伸声称已经执行了全部独立回调分支、写入隔离或远端 CI。主题适配后的正式 `Dockerfile.unified` Dev 镜像已部署，镜像 ID `sha256:6c67e96e381f97fa1764fc5e994cd488498d018ae3b361d2d46da6f1e4c6f6c3`；只读 `pnpm dev:mcp check`、Web 主题 CSS 公网交付及 HTTPS OAuth 元数据验证通过。该镜像为 `dirty` 工作树部署，未提交推送。
- **Web 集成依赖**：Web owner 已在当前工作树实现 HttpOnly Cookie Session、跨标签恢复与短期 Web Bearer，MCP 仅通过其已认证请求通道连接，没有另建 Session。Go 联调使用真实 Web Session Store，浏览器 E2E 使用 HTTP mock，**不能代替真实 ChatGPT OAuth 回调和公网部署验收**。
- **外部依赖**：Web owner 的已登录上下文/CSRF 安全操作能力及连接授权弹窗接入；这是 P17-03/P17-05 的实质前置，不是要求 MCP 团队去实现 Web 登录。
- **用户验收与状态**：用户于 2026-10-14 明确确认新版 Dev 的 ChatGPT 重新授权成功，并要求以该功能验收直接关闭 Phase 17。状态已标记 `done`，但这是**明确记录 CI / 完整新版隔离矩阵尚未通过的用户批准例外**，并非原始 A17-05 全部完成。此次文档关闭不涉及 Commit/Push/Tag/GHCR/生产部署；这些操作与后续远端质量门禁仍分别授权。
