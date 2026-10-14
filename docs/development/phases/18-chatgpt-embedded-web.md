# Phase 18：ChatGPT Embedded Web（MCP Apps 双入口）

## 目标与状态

**`done`（2026-10-14：按用户明确批准的 GitHub CI 验收例外关闭；本地、Dev Docker 及真实 ChatGPT 双入口验收已完成，远端 CI 未执行）。**

将已有 `packages/web` 的 React Shell 同时作为普通浏览器 Web 和 ChatGPT MCP App UI 使用：一个版本化 UI Resource、一个 app-only Tool，同时声明 `global`（Sidebar App）和 `thread`（Conversation Panel），复用现有 `kgosd`、OAuth 和四个业务 MCP Tool。首阶段只接通工作台 Shell 和一个真实只读 `evolution.overview()` 调用，不扩张 [Phase 14 Web](14-web.md) 原来仍 `deferred` 的查询、图谱、Ontology/Object 编辑、版本/草稿持久化等业务验收范围。

本阶段新增的是**运行宿主适配**，不是第二套 Web、第二种账号、独立 MCP Server 或第五种知识业务能力。提交/推送、Dev 部署、CI、发布与生产部署独立授权；本阶段已有真实 ChatGPT 客户端和 Dev Docker 验收，不能据此声称远端 CI、正式发布或生产部署已完成。

## Design Inputs 与当前基线

- [D96](../../design/decisions.md#d96-chatgpt-mcp-apps-web)；[Web 内嵌适配](../../design/web.md#chatgpt-内嵌-webmcp-apps) 拥有 UI 与复用边界；[MCP UI 合同](../../design/mcp.md#chatgpt-mcp-apps-ui-合同) 拥有 Tool / Resource、OAuth 与 Bridge；[Runtime Web hosting](../../design/runtime.md#web-hosting) 拥有同进程静态交付。
- [外部研究](../../research/chatgpt-mcp-apps.md) 引用 OpenAI Plugin Extensions / MCP Apps / UI Reference；Host 支持能力按实际可用客户端复核，不能根据协议猜测平台已经开放。
- 已有 [Phase 16](16-kgosd-unified-mcp.md) `done` 的 Go `kgosd` + 四 Tool / WASM、[Phase 17](17-mcp-web-authorization.md) `done`（用户批准 CI 例外）的统一 Instance + OAuth/Web 授权，不重复实现登录、OAuth 签发或 JavaScript sandbox。
- 当前 [Web app](../../../packages/web/src/app/app.tsx)、[布局与样式](../../../packages/web/src/app/layout/)、[Go MCP](../../../internal/mcpserver/server.go)、[已嵌入的 Web Handler](../../../internal/webui/webui.go) 和 [构建脚本](../../../scripts/build.mjs) 作为实现落点；`go.mod` 已使用 `github.com/modelcontextprotocol/go-sdk v1.8.0`，具备 `AddResource` 与元数据结构。

## Feature 与依赖顺序

| Feature | 本阶段最小交付 | 依赖 | 验收 |
| --- | --- | --- | --- |
| **P18-01 共用 Web Shell** | 在 `packages/web` 新增 `mcp-main.tsx` 入口；抽取共享布局/主题/i18n；普通 `main.tsx` 登录/授权保持现状；MCP 入口不运行 Web Session、Cookie 与根 Token 登录逻辑 | 现有 Web Shell | A18-01 |
| **P18-02 Go MCP UI Resource / Entrypoints** | 注册一个 `ui://kgos/workspace/v1` Resource 和 `kgos_workspace` app-only Tool；`text/html;profile=mcp-app`；`global` + `thread`；唯一 Go Server / `/mcp` OAuth，原四工具完整保留 | P18-01 的实际 bundle 形态 | A18-02 |
| **P18-03 宿主 Bridge 与只读证明** | UI Bridge 初始化/错误处理；通过现有 `kgos_read` 读取真实 `evolution.overview()`；展示可信只读状态；两语言/双主题/窄屏；失效/撤销时阻断操作 | P18-01/02 | A18-03 |
| **P18-04 一体化构建、安全及客户端交付验收** | 一次构建普通 Web + 自包含 MCP App HTML，嵌入现有 Go/OCI；真实 Go/MCP 协议测试、浏览器组件测试与实际支持双入口的 ChatGPT 宿主验收，最终 Review/CI | P18-01–03 | A18-04 |

实现顺序：先保留浏览器端行为并抽出共用 Shell → 注册 Go Resource / Tool 元数据 → UI Bridge 实读 → 构建与真实客户端联验。对 UI 使用现有 React/TypeScript 及必要的标准 MCP Apps Bridge 实现；先核对现有工具链，确有必要才引入新的前端依赖。Go 继续用现有 MCP SDK；不添加仅用于模仿 OpenAI TypeScript 示例的 Node 服务器。

## Acceptance

### A18-01 双入口源码与普通 Web 不回归

1. React 组件、主题、翻译资源、布局只有一份；普通 `main.tsx` 的 HttpOnly Web Session 自动恢复、强制 Token 登录、MCP OAuth 同意弹窗、注销、boot guard 均不受影响；MCP App 内不显示这些浏览器登录组件，也不读取 Cookie/Token/原站 Local Storage。
2. iframe 与普通 Web 分别可渲染相同的共享 Shell，适应 320px、窄侧栏、正常桌面视口；English/简体中文与双主题在两种宿主下实际可用。当前静态版本示意明确标识或被真实数据取代，不能冒充服务器版本信息。
3. 不新建第二前端包、业务 Service/Repository、Kernel/Lithograph 改动或重复 Domain/Graph/Object 组件。`app / features / core / shared` 既有依赖方向不回退，测试覆盖两种根入口。

### A18-02 MCP UI 资源与 Tool 协议

1. 真实 Go MCP `tools/list` 包含四个原业务工具及 `kgos_workspace`；后者支持 `{}`、准确只读注解、合规 Title/Icon、`_meta.ui.visibility=["app"]`、`_meta.ui.resourceUri` 和 `_meta["openai/ui"].entrypoints=[{"type":"global"},{"type":"thread"}]`。四个业务工具的 Schema、输出、错误和模型可见性不变；不引入其它业务 Tool。
2. `resources/list`/`resources/read` 返回匹配 URI、MIME、内嵌 JS/CSS 和最小 CSP metadata；不存在相对路径依赖外部 Vite / Web origin 或默认外部 CDN。资源 URI / Resource 引用一致，资源变更不会静默共用不兼容缓存。
3. 未携带有效 Bearer 的 `/mcp` 访问仍 401；错误 OAuth Audience、撤销/过期 Token、跨 Instance、未授权 `resources/read` / `tools/call` 不返回私有业务数据。OAuth Token 不能访问 `/api/v1/*`；服务端不因为 UI 的存在而启用匿名 Kernel 路由。
4. 标准 MCP Client 在不显示 UI 的情况下仍能使用四个原业务 Tool；不实现为兼容客户端而套原 Web iframe 或增加独立 MCP/HTTP Listener。

### A18-03 Bridge 真实数据、权限与生命周期

1. 首次加载完成 MCP Apps `ui/initialize` / initialized 握手，正确处理 Tool 初次结果和后续通知；通过 `tools/call` 调用已存在的 `kgos_read` 读取真实 `evolution.overview()`，结果与同 Instance 直接授权 API/MCP 查询一致，不 mock State/Branch。
2. UI 不存 Instance Token、Web Bearer、OAuth Access/Refresh、Code，禁用敏感值 URL/日志；不能从 iframe 调用普通 API 充当 Web Session。语言/主题切换不触发多余知识操作或丢失 UI 焦点。只读请求异常、断连、宿主撤销授权、进程重启必须明确失败，不展示过期内容为当前真实状态。
3. `global` 与每个 `thread` 的临时 UI 实例状态相互独立；来自外部 Agent/CLI 的 Branch 前进只在用户明确刷新后反映，不自动替换已固定 State；本阶段不擅自实现自动协作同步或写入工作流。

### A18-04 真实交付与阶段门禁

1. Mac 上运行受影响的 Go/TypeScript 定向单测、React 浏览器 E2E 与真实 Go MCP 协议资源/认证测试，`pnpm validate`、最终 diff 和 Review 通过；独立 fresh-source 构建不依赖 `node_modules` 以外的未追踪构建缓存、开发服务或本机 secret。
2. OpenClaw Linux amd64 使用按 D94 构建的新单进程 Docker 镜像及隔离 Instance/Volume，验证 `/` 普通 Web、`/mcp` 四业务 Tool + UI Tool、受保护 Resource、认证/刷新/重启；容器运行时不需要 Node.js、单独 Web server 或额外 Port。长期 Dev 的实际部署另行授权。
3. 在**实际声明支持两个 Entrypoint 的 ChatGPT Desktop 或 ChatGPT Work 环境**分别打开 Sidebar App 和 Conversation Panel，验收同一 UI Resource、真实 OAuth 授权、`overview` 回读、刷新、主题/语言、权限失效和两个实例的独立状态。只有协议结构/本地 iframe 模拟结果不能替代真实宿主；宿主尚未开放时明确记录外部能力限制，Phase 不得标 `done`。
4. 在一个不支持 UI Entrypoints 的标准 MCP Client 继续验收四 Tool；客户端对 `thread` 使用内容标签而非固定左右分屏属于宿主行为，不记为 KG OS UI 缺陷。
5. 对应 revision 的 GitHub Actions Ubuntu Validate、既有 native/package matrix 和 Linux amd64 Docker 构建/Smoke 实际成功；定向 Review 关闭影响本阶段范围的 findings，并同步拥有者设计、Phase 状态和操作指南。无真实 CI 证据不能按默认门禁标 `done`。

## 非目标与 Review 重点

- **不**实现 P14-01–11 业务功能、`.kgos/web` UI SQLite、Graph Query/编辑器、Knowledge Patch、Ontology、Commit DAG、Merge 等；它们继续归 Phase 14，届时基于真实 Feature 增补 MCP 内嵌适配。
- **不**增加通用 HTTP→MCP 方法转换器、另一套用户认证、Token bridge、Scope/权限角色系统、跨窗实时同步、ChatGPT 模型上下文自动投递、File Extension、公开 Plugin Directory 发布或生产部署。
- Review 应重点检查：单 Web 源码/双启动环境、app-only UI Tool 与四业务 Tool 区分、Go Resource 认证、OAuth/HTTP API 隔离、MCP Apps 初始化/CSP、静态资源缓存、Host 支持范围、实际非 root Docker 打包和 Phase 14 边界。

## 当前进展

- **已确认设计**：D96、Web/MCP/Runtime owner 的共用界面与宿主通信/认证责任。
- **已实现（本阶段交付源码）**：P18-01 共享 React Shell / 双入口；P18-02 Go `kgos_workspace` Tool 与 `ui://kgos/workspace/v1` Resource；P18-03 MCP Apps Bridge 经既有 `kgos_read` 读取 `evolution.overview()`，具备语言、主题与失败降级；正式构建产出自包含内嵌 HTML。
- **本地已验证（macOS arm64）**：`pnpm validate` 整体通过，涵盖 Go Race / statement coverage **90.0%**、go vulnerability scan、TS typecheck / lint / coverage、正式构建、Web Vitest **86/86**、Playwright **26/26**、native/package/license/audit/diff。为避免错测旧 Runtime，Web E2E 使用自动先构建的 `pnpm test:e2e`，见 [开发指南](../../guide/development.md#检查与测试)。
- **Dev 已部署并验证（2026-10-14）**：当前 `main@8e7bf56` 的 `dirty` 工作树由 `pnpm dev:mcp deploy` 同步，在 OpenClaw 构建并切换 Linux amd64 单进程 Docker 镜像 `sha256:60fcac91fb95532ba40aead7757d076113c6c8bd300957d9c3eee9757ca87193`。部署前完成受保护 SQLite 一致性备份；`kgos-dev-mcp-1` 为 `healthy`。自动 `dev:mcp check` 通过 Instance Bearer、OAuth discovery、四业务 Tool + `kgos_workspace`、`resources/list/read` 的自包含 UI/CSP、Preview / State / Ancestry 及匿名 Web Resource 隔离。公网 HTTPS `/` 为 200、`/mcp` 匿名 401、OAuth metadata 为 200、`/mcp-app.html` 为 404。使用**同一已部署镜像**在独立临时 Volume 运行 `scripts/mcp-unified-docker-smoke.mjs`，真实 **31/31 SDK 方法**、重启持久化、非 root / 无 Node.js 运行时通过，不对长期 Dev 数据写入；具体备份/部署记录由 [Dev Runbook](../../guide/dev-environment.md) 持有。
- **真实 ChatGPT 已验收（2026-10-14，用户反馈）**：用户在 ChatGPT 中提供两张实际 UI 截图，分别显示从左侧应用入口打开的 **KG OS Workspace（`global` / Sidebar App）**和会话中的 **KG OS Workspace 面板（`thread` / Conversation Panel）**；两处均加载工作区 Shell，显示来自服务端的默认分支 `main` 与完整 Commit Ref。左侧扁平 Commit 历史仍明确标注为 Mock 数据，不作为真实版本历史。用户随后确认刷新、明暗主题、中英文切换、分支筛选交互均“正常”。这是用户完成的双入口与可见交互验收；不等同于逐项验证授权撤销、断线异常或不同 UI 实例的全部生命周期边界。
- **未执行 / 不冒充通过**：Dev 部署使用 `dirty` 源码快照，与之后的 Git 提交相互独立；未运行对应源码的 GitHub Actions Ubuntu Validate、六平台 native/package matrix、远端 Docker CI；独立 fresh-source 验收也未提供单独证据。正式发布与生产部署未执行。

## 阶段关闭记录（2026-10-14，用户批准例外）

用户在确认上述真实 ChatGPT 交互正常后，明确要求“**不用等 github ci 直接为 done 就行**”。据此将 Phase 18 状态关闭为 **`done`（用户批准的远端 CI 验收例外）**。上文 A18-01–04 的原始验收标准**保持不变**；未运行的 GitHub CI / 六平台矩阵及没有单独验收记录的场景均不标记为 passed，也不将本次豁免推广为其它 Phase、后续提交/推送或发布的通用规则。本次关闭只更新文档状态，不自动授权 Commit、Push、GHCR 发布或生产部署。Phase 14 的业务 Web Feature 继续由 Phase 14 负责。
