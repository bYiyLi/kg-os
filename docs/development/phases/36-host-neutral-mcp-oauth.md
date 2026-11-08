# Phase 36：通用 MCP OAuth 客户端发现与安全授权

<!-- cspell:words mcpserver mcpoauth mcpauth -->

**状态：`in_progress`（2026-11-07；Go/Web 代码和专项验收已有证据，完整 `pnpm validate`、Linux amd64 隔离 Docker、公开 CI 与真实 Muse/ChatGPT 仍未全部通过；未发布）。**

## 目标与范围

让 ChatGPT、Muse 及其他实现标准 MCP OAuth 的 Host/Client，无需 KG OS 为每个 Host 增加域名白名单即可完成 Discovery → Client Identity → 现有 Web 显式同意 → Token → MCP 调用。解决当前 `chatgpt.com` 专属 CIMD/redirect 校验导致的第三方授权失败。

设计真源为 [MCP 通用 OAuth](../../design/mcp.md#host-neutral-mcp-oauth)，[Web 连接授权交互](../../design/web.md#连接认证与恢复) 和 [Runtime OAuth 存储](../../design/runtime.md#持久-mcp-oauth-授权) 仅拥有各自的展示、文件生命周期边界；[D127](../../design/decisions.md#d127-host-neutral-mcp-oauth) 定向替换 D95/D124 的 ChatGPT 限制及旧 Scope/Access 生命周期。仍保留 [D95](../../design/decisions.md#d95-unified-mcp-web-authorization)、[D124](../../design/decisions.md#d124-mcp-resilience) 的单 Instance、Web Session、OAuth 凭证隔离、独立存储、Refresh 30 天轮换和撤销/故障恢复；**新 Scope、Access/Code 有效期以 Nexum 基线为目标**。

**非目标**：不实施细粒度知识权限、多用户/Agent Grant、OIDC 登录重构、连接管理页面、通用 API Token、Lithograph/Kernel 变更、MCP Tool 变更、独立授权服务或新的配置系统。Nexum 的 Agent 授权、套餐/配额与独立多用户模型不得移植。

## 前置条件与协同

- Phase 17 已有 Go OAuth + Web 授权弹窗，Phase 34 已有 `.kgos/mcp-oauth.db`、Refresh/撤销、签名客户端和故障分类，均作为本阶段回归基线；历史人工验收保留未覆盖的真实续期场景，不视为自动通过。
- **完整协议对齐而非只补 DCR**：以 Nexum 实际外部 MCP OAuth 请求/响应格式、Discovery、CIMD/DCR、Scope、Code/PKCE、Access/Refresh、Bearer 401/503、异常恢复与真实 Host 行为作为基线；只有用户登录与业务授权映射分别属于 Nexum 或 KG OS 自己。不增加 Host 专属配置，也不以 KG OS 原有 `kgos:access` / 24 小时 Token 作为新发行参数。
- 独立于 Phase 35 SQLite 运行观测工作台，可并行推进；MCP 协议/客户端解析由 `internal/mcpserver` 负责，DCR 持久化由 `internal/mcpoauth` 负责，Web 仅适配既有弹窗与经服务端验证的展示字段；不编辑 Phase 35 的设计、文件或诊断库。
- 参考 [Nexum MCP OAuth 设计（固定 Commit）](https://github.com/bYiyLi/Nexum/blob/c78d60f55f4c8478c4333f2505493ee103a05820/docs/design/mcp-oauth-grants.md) 与其 `internal/mcpauth/{handler,client,outbound}.go` 实际源码（2026-11-07 本地核读），以及 [MCP 2026-07-28 Client Registration](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/client-registration.mdx)；Nexum 是实现证据，不是 KG OS 的依赖或自动验收。
- 实现开始前重新核对活跃工作树、`mcp.md`、D127 和本阶段计划，保留其它同学的未提交改动；本轮用户已明确授权 Phase 36 实现及 Review，不代表独立授权 Git Commit/Push、Release、生产部署或修改其它项目的持久数据。

## Feature 与验收

| Feature | 交付范围 | 可观察的验收 |
| --- | --- | --- |
| P36-01 发现与身份解析 | 保留 PRM/AS Discovery；AS metadata 增加真实 `registration_endpoint`，CIMD 优先，DCR 兼容；`client_id` 路由按 URL 型 CIMD / 已注册不透明 ID 区分 | 无 Bearer 得到 401 + resource metadata；两个 discovery endpoint 声明与真实路由一致；元数据仅公开只读；非法/未知 Client 失败且不生成待授权请求 |
| P36-02 通用 CIMD 出站与身份 | 取消 ChatGPT 专属域名限制；严格 HTTPS 元数据身份和 redirect 精确匹配；不按 DNS/IP 类型拦截元数据及 JWKS 访问，保留超时/容量/不跟随重定向与有界缓存 | ChatGPT、其他 HTTPS CIMD 和代理 Fake-IP DNS 能进入身份校验；非法 Client ID、回调不匹配、HTTP 降级、重定向、超时和超大响应仍被拒绝；实际错误分类准确 |
| P36-03 DCR 与 SQLite | `POST /oauth/register` RFC 7591 公共客户端，`none`/PKCE，HTTPS 或合法本机回调，注册元数据和不可猜测 ID 持久化在现有 OAuth SQLite，受限额保护 | 201 返回标准注册字段但不返回 `client_secret`；重启后相同 ID 可授权/刷新；兼容可选 `application_type=web/native` 且不要求提供，无类型声明的合法 Loopback 成功，非法/滥用请求 400/429/503 |
| P36-04 现有 Web 授权与 Token 接合 | 复用 `/?mcp_authorization=<request_id>`、`GET /oauth/request`、`POST /oauth/decision`；使用服务端已解析的 Client 名称/来源/回调主机显示，不再硬编码 ChatGPT | 已登录/未登录均正常弹出，完整读写与本机回调风险清晰；Approve/Deny/过期/重复/伪造/CSRF 场景正确，外部 Client 无法取得 Instance Token 或普通 API 权限 |
| P36-05 新 Scope/生命周期、旧连接迁移和跨客户端 | `mcp` / `mcp offline_access`、Code 5 分钟、Access 15 分钟硬过期/`expires_in=840`、Refresh 滚动 30 天，沿用 `private_key_jwt`、根凭证/issuer/resource 绑定与撤销；旧 `kgos:access` Access 按原过期，旧 Refresh 需标准重授权 | 新旧 Scope 的 Token/Refresh 不互相升级或扩权，已签发 Access 不被延长；真实 ChatGPT/Muse DCR/CIMD 连接、自动提前刷新、一次性重新授权、MCP Tool/重连/撤销有各自证据，不以模拟测试代替真实客户端 |

## 实施顺序

1. **现状锁定**：检查当前 schema v1、`oauthBroker`、`oauthClientAuthenticator`、Web 认证契约、现存安全/负例测试和同事未提交改动；记录受影响公共路径及升级前既有 Family。无有效证据不得改写当前实现状态。
2. **CIMD 出站与身份**：验证通用 CIMD ID/redirect、HTTPS 和 TLS 校验，元数据/JWKS 读取不做目的 IP/保留网段过滤；为 Fake-IP、无重定向、超时和错误分类建立回归，保留已实现的公开客户端身份校验。
3. **DCR 最小持久化**：在 `mcpoauth.Store` 内以事务从 schema v1 升级到 v2，添加唯一必要的 DCR Client 表/查询/容量限制，保留旧 Family/Code/Token 和绑定。注册/读取不复用用户 Knowledge 图数据库；失败 fail closed，不删库重建。新增 `/oauth/register`，metadata 只在真实路由实现后宣告。
4. **浏览器与 Token 接合**：认证请求解析保存可信 Client 展示快照/回调信息；旧 Web 弹窗显示验证过的域名与权限、Loopback 警示；token/refresh/revoke 对 DCR `none` 与 CIMD `none/private_key_jwt` 采取现有方法绑定及缓存规则。改为 Nexum 一致的新 Scope、Code/Access/Refresh 有效期，针对旧 Scope 的 Refresh 要求显式重新授权，不另建一份 Grant 模型。
5. **兼容性与发布准备**：运行定向 Go/race/安全测试与 Web 单测/E2E，检查其它同学的并行改动；Mac 完整 `pnpm validate`、OpenClaw Linux amd64 隔离 Docker/重启/31 SDK、公开 CI、真实 ChatGPT 和 Muse 分别取证。**验收包括旧 Family 持久化、24 小时旧 Access 原到期、新 Access 15 分钟实际硬过期/14 分钟提示、旧 Refresh 重新授权及新 Refresh 连续轮换**；真实 Host 对 `invalid_grant` 不能恢复时据实调整迁移策略。若实测揭示客户端协议差异，先回读当前真源并最小修订，不增加 Host 特例。

## 对抗性验收矩阵

| 场景 | 期望 |
| --- | --- |
| 合法公开 HTTPS CIMD + HTTPS 回调、合法 CIMD + `localhost`/`127.0.0.1`/`[::1]` 本机回调 | 经完整浏览器登录与显式同意签发；回调主机可见，本机回调显示警示 |
| DCR 没有 `application_type` 的合法 Loopback HTTP（含 `127.0.0.2`）或 HTTPS | 只签发公共 Client ID；实际注册地址精确匹配后才可申请授权；未获同意时没有 Access Token，不因缺少可选类型字段拒绝 |
| `client_id` 与远程 JSON 不匹配、未注册的非 URL ID、重定向 URI 不属于声明列表 | 直接拒绝，不能借此创建 OAuth ticket、callback 或 Token |
| metadata/JWKS 解析到私网、保留网段、代理 Fake-IP，及 HTTPS 代理；HTTP 降级、重定向、无效证书、伪造 Client | 允许前者进入 HTTPS 证书及身份校验，不因 IP 类型拦截；后者仍拒绝；明确错误/暂时错误按事实分类 |
| DCR 非法 scheme/userinfo/fragment、通配回调、secret auth、超限请求、泛滥注册 | 拒绝；无授权副作用；容量/速率告警不暴露私有值 |
| 未登录、CSRF、伪造授权请求 ID、重复提交、拒绝授权、Code/PKCE 错误、未验证回调 | 不发有效 Token，不开放重定向，不泄露凭证 |
| 老 SQLite v1 → v2、升级前 ChatGPT Family、重启、并发注册、事务失败、损坏数据库、schema 不兼容、根凭证/issuer 轮换 | 旧 Access 在原到期前可验证、旧 Refresh 不自动升为新 `mcp` Scope；新授权签发 15 分钟 Access，旧 DCR Client ID 不能跨 issuer/根凭证继续生效；失败返回 503，不清空库，明确回退限制 |
| 旧 Scope 的 `invalid_grant`、新 `mcp` Scope 的 14 分钟刷新、15 分钟硬过期、连续 30 天 Refresh rotation | 老 Host 能按标准路径重新授权，新 Host 实际在到期前刷新；无无声扩权/延长旧 Token/强制重复登录 |
| DCR/CIMD Refresh 重放、私钥签名异常、临时 JWKS 不可用、Revoke 与 Refresh 并发 | D124 生命周期与公私客户端不同重试语义保持，撤销不复活 Family |
| Bearer 与 OAuth Token 分离；`/api/v1/*`、`/mcp`、未初始化与异常 Origin | 既有身份、权限、Boot Guard、401/403/503 边界不退化 |

## 完成标准与证据边界

- P36-01–05 的功能/安全测试、原有 ChatGPT OAuth 和 MCP Tool 回归与完整阶段 Review 均无剩余影响验收的问题；新增链接、文档/示例、Web 双语文案和 SDK/部署说明依据实际接口同步。
- Mac 完整质量门禁、OpenClaw 隔离 Docker 与真实升级持久化检查通过；当前源 revision 对应的公开 CI Docker Job 和真实 ChatGPT/Muse 连接均分别提供可定位证据。真实客户端不可用时标为缺证据，不将 Phase 声称为全部完成。
- Review 至少检查协议字段、数据迁移/回退、放弃 SSRF IP 过滤的风险/回调威胁、错误分类、端到端用户体验、跨版本兼容、其他同学并行 diff 与最终测试证据；修复后重跑受影响检查。
- Git Commit、Push、Tag、Release 和部署分别另行授权及报告；代码编写、定向测试与设计 Review 不自动构成完整 Phase 完成。

## 当前实现和验收证据（2026-11-07，持续更新）

**已写入、未提交**：Go `internal/mcpserver` 的通用 CIMD/Safe Fetch、DCR 和 OAuth Token/旧 Scope 过渡，`internal/mcpoauth` 的 v1→v2 事务迁移及 DCR 注册，现有 Web 授权弹窗、双语文案、跨端测试与正式 Docker OAuth Smoke 的 DCR 测试夹具。涉及的独立 Runtime 观测、Phase 35 和其它同学的未提交改动仍归其原有工作流；本阶段不声明它们已完成。

| 验收项 | 当前结果 | 具体证据与范围 |
| --- | --- | --- |
| Go 功能/回归 | **PASS（本地工作树）** | `go test ./internal/mcpoauth ./internal/mcpserver -count=1`，完整两个包通过；追加 DCR 注册/授权/刷新/撤销、v1→v2、旧 Token、DNS/SSRF、客户端方法防降级测试 |
| Go 竞态 | **PASS（本地工作树）** | `go test -race ./internal/mcpoauth ./internal/mcpserver -count=1`，无竞态报告 |
| Phase 36 Go 静态检查 | **PASS（本地工作树）** | `go tool staticcheck -tags=sqlite_fts5 ./internal/mcpoauth ./internal/mcpserver`，未报告问题 |
| Web 授权单测 | **PASS（本地工作树）** | `vitest run packages/web/src/features/mcp/connection-authorization-dialog.test.tsx`：27/27 |
| 浏览器 E2E | **PASS（本地构建）** | `playwright test tests/e2e/mcp-authorization.spec.ts tests/e2e/web-i18n.spec.ts`：11/11；Web Session、同意/拒绝、过期、主题/中英和移动端导航 |
| MCP Tool 结果合同 | **PASS** | `pnpm test:mcp-contract`：4/4 |
| Mac 本地构建 | **PASS** | `pnpm build` 完成 Web/MCP Apps、Go `kgosd` 和原生依赖；Vite 大包提示是非阻塞构建警告 |
| 全仓 TypeScript 与 Go 安全检查 | **PASS** | `pnpm typecheck` 各工作区构建通过；`pnpm check:go:security` 返回 `No vulnerabilities found` |
| 全仓 `pnpm validate` / Lint | **未通过，仍需最终重跑** | 最新独立 `pnpm lint` 已通过 ESLint、Prettier、Imports、Repo、Markdown，停在 CSpell：并行的 `scripts/check-go-licenses.mjs` 与 `tests/e2e/observability-workbench.spec.ts` 含尚未加入词典的标识。Phase 36 所有定向 ESLint/Prettier 已通过；不能将独立检查冒充完整 `validate` |
| 全仓 Go 静态检查与语句覆盖率 | **覆盖率 PASS，静态检查仍待 Phase 35 收敛** | 2026-11-07 重新执行 `pnpm test:go:coverage`，完整 Go 测试与覆盖率门禁退出码 **0**，Go 全仓语句覆盖率 **90.1% ≥ 90%**。补充 6 个独立回归测试文件：观测查询/游标/指标/故障与边界、Web Session 持久化/容量、OAuth 公共注册/代理/Scope/数据库故障。未改 `-coverpkg=./...`、测试阈值或生产代码。最新 `pnpm check:go` 另因 Phase 35 `internal/observability/store.go:511` 未使用 `safeString` 报错，不冒充全仓静态检查已通过 |
| 全仓 TypeScript 分支覆盖率 | **PASS（最新合并工作树）** | `pnpm test:coverage` 退出码 0，最新总分支覆盖率 **90.14% ≥ 90%**；合并工作树随 Phase 35 并行修改可能变化，最终发布前仍须复验 |
| OpenClaw Linux amd64 Docker | **受宿主环境阻塞，未通过** | 共享 Docker 根目录 `/docker` 已满；在 `/data` 另建完全独立的 Docker/containerd 后，镜像源 403/元数据校验失败。只读迁入缓存基础镜像后，最小 Debian 容器也未能在限定时间内启动，未进入正式镜像/31 SDK Smoke。**临时 Docker、containerd、源码和私有数据目录均已清理**，回读确认共享 `kgos-dev-mcp-1` 与 Nexum Dev 容器仍在运行、`/data` 可用空间恢复 |
| 真实 ChatGPT/Muse Host | **未验证** | 未执行当前新版本在两个真实 Host 中的 Discovery、登录/同意、Tool、刷新、重连与撤销，不以 Go/E2E/Docker 模拟代替 |
| 对应源公开 CI | **未执行** | 尚未提交推送；没有与当前未提交代码精确对应的公开 CI Job，不能报告通过 |

**当前关闭判断：不得标记 `done`**。必须完成上表剩余验收、核对最终 Review 和最新并行 Git diff；失败不可通过删验收条款、缩小范围、清理 OAuth 数据库或冒充历史验收解决。

### P36 四组代码 Review 修复（2026-11-07，本地未提交）

1. **MCP Resource/Audience**：新 Discovery、授权、交换与存储使用 `<issuer><实际 MCP Path>`（默认 `/mcp`，支持现有 `--mcp-path`）；保持 issuer 与回调 `iss` 不变。旧 OAuth 存储只事务迁移其元数据绑定，**不修改**旧 Family/Token audience/Scope/expiry；已签发的旧 Access 可在原过期前继续调用 MCP，旧 Code/Refresh 仍不允许静默升级。补充跨 v1/v2、原资源 Access、新资源持久化及自定义 Path 回归。
2. **Web Client 身份风险**：CIMD 与 DCR 均醒目标为**自声明名称**；Client ID 和与注册资料精确匹配的回调主机更醒目，避免误称已证明域名所有权。所有外部 Client 均使用中性显示图标，不冒充 ChatGPT/OpenAI 视觉标识。新增冒充 ChatGPT 名称的 CIMD 展示单测，名称本身不代表 KG OS 或 Host 品牌认证。
3. **HTTPS 代理 TLS**：安全 Fetch 在公网 IP 校验后仅 CONNECT 已验证 IP；HTTP/HTTPS 代理各使用受控隧道，HTTPS **代理证书**按代理自身域名校验，隧道内**目标证书**按原客户端域名校验。补 HTTPS 代理证书通过/失败、固定 CONNECT 与私网 DNS 拒绝测试。
4. **回调及注册防滥用**：拒绝 URL 解析器原本允许的通配/无效 DNS 回调主机；公网直连按真实 TCP 来源 10/min，全实例 60/min。loopback/私网代理的共享来源不再被误施加同一个 10/min 限额；客户端 `Forwarded` / `X-Forwarded-For` 不受信任，真实来源的逐用户限流由可信反向代理维护。补通配回调、共享代理/global、直接公网来源限额的回归。

**本轮验证边界**：四组 Go 相关包及 `cmd/kgosd` 的功能、`-race` 与 staticcheck，以及 Web 授权 27/27、定向 ESLint/TypeScript/文档检查均已复验。完整 Mac 构建通过，基于构建产物的浏览器 E2E 11/11 通过，TypeScript 覆盖率门禁达到 90.14%；**Go 全仓覆盖率、全仓 staticcheck、CSpell 与完整 `validate` 仍未全通过**，各问题按所属并行工作流记录。真实 ChatGPT/Muse、正式发布、远程 Docker/CI 留待另行授权与实际验证，不以模拟结果冒充通过。P36 仍为 `in_progress`。

### 2026-11-08 出站安全范围调整（D128）

按用户明确决定，MCP OAuth CIMD/JWKS 出站不再进行公网 IP、私网/保留网段或代理 Fake-IP 的 SSRF 目的地址过滤。原 P36-02 公网 IP/DNS rebinding 阻断要求及本阶段历史 Review 中的同类安全结论，不再作为当前实现验收条件；HTTPS/TLS、禁止重定向、客户端身份/redirect、JWKS 签名、大小/时间/并发限制仍需回归。旧版本测试记录仅代表原版本，不能当作新策略已发布或真实 Host 已验收。
