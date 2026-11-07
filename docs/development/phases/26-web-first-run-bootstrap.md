# Phase 26：Web-first 初始化与无配置 Runtime 启动

## 2026-11-06 人工验收结项

**状态：`done`（用户明确表示手动验收通过，带保留项结项）。** 这是用户批准的阶段管理结项；以下原始 `in_progress`、失败、未执行记录反映当时实际情况，不代表所有原定验收已自动通过。本次只更新计划，未修改代码。

- **已交付**：Token-first 初始化、Runtime Bootstrap 与浏览器流程已有测试和用户使用反馈。
- **未实现或未完整交付**：未确认主链路缺代码；原计划并发、损坏和恢复异常组合是否全部实现尚无完整依据。
- **未取得独立验收证据**：最终版本针对全新 Docker Volume 的 A26-01–07 全量场景及错误恢复缺独立逐项报告。

保留项不会因为 `done` 自动消失；后续工作另行定义范围与验收。

## 历史目标、基线与阶段边界（2026-10-20）

**状态：`in_progress`（2026-10-20，本地开发和验收进行中；未提交、未推送、未部署，最终 CI 尚未执行）。** 在**一个现有 KG OS Docker / `kgosd` 进程**中，支持缺少 `config.toml` 的受限 Web 启动、D110 四步 Token-first 初始化、预先手工配置后的启动自动初始化，并共用现有 Kernel/Lithograph Bootstrap 与 `initialized.json` 就绪证明。未初始化时所有普通业务 API/MCP 在认证前报告未就绪；完成后恢复现有正常认证和业务能力。保留用户认可的全屏高保真布局，采用 Token-first 四步内容。

**实现前代码基线（历史对照）**：`internal/runtime/runtime.go:OpenWithOfficialExtensions` 在 HTTP listener 建立前先 `LoadConfig`，缺 TOML 就失败；`cmd/kgosd/main.go` 同样先打开完整 Runtime；`cmd/kgosd/init.go` 当前独立执行初始化 readiness/receipt；`internal/runtimeprofile/initialized.go` 提供版本化 receipt；`internal/runtimeprofile/auth.go` 已有单 Token 原子生成；`internal/daemon/web_auth.go` 已有 Web Session 与 Origin 保护；`packages/web/src/features/setup/`、`?preview=setup` 是**尚未提交的纯 UI 演示**（原四步内容），不具备本阶段的后端初始化。既有 [Phase 25 Doctor](25-kgos-doctor.md) 属于独立 `planned` 工作，不混合任务或覆盖其未提交文档。

**设计真源**：[D110](../../design/decisions.md#d110-token-first-setup)、[D105](../../design/decisions.md#d105-web-first-run-and-runtime-bootstrap)、[Runtime 首次启动、受限路由与认证](../../design/runtime.md#web-first-run-bootstrap)、[Web Token-first 四步与路由](../../design/web.md#web-first-run-setup)、[Setup 错误](../../design/contracts.md#初始化门禁与-setup-错误)、[CLI Init](../../design/cli.md#init)。历史 [D82 / Phase 12](12-first-run-cli-productization.md) 的“完成才算 ready”、[D84 / Phase 13](13-init-wizard-credential-boundary.md) 的 operation-time Key、[Phase 17](17-mcp-web-authorization.md) 的 Web Session、[Phase 16](16-kgosd-unified-mcp.md) 的单进程都必须保留。修改源码前复查当前仓库和最新配置合同，不能把历史验收误报为本阶段成功。

**排除**：不新增账号/密码/角色、部署证明或管理员认领一次性口令；不建设通用 Secret Manager、配置热重载、实例数据重置/迁移 UI、多库发现、第二个进程/端口、额外数据库、Agent/Scheduler、Lithograph 业务语义、MCP Tool 或新的 npm 发行物。界面测试不使用真实生产实例或覆盖用户凭证。配置改动不包含现有业务模型、31 SDK 方法和 SQL Graph 行为改写。

## 依赖、实施顺序与交付物

| Feature | 工作与责任边界 | 验收 |
| --- | --- | --- |
| **P26-01 状态/受限启动** | Go Runtime 将 HTTP/Web 最小宿主与完整 Kernel 打开分开；在一个 Instance lock/listener 下识别无配置、无 receipt、存在合法/非法 config、已完成/损坏数据库；完整 config 自动执行共享初始化。主业务请求的初始化状态门禁位于鉴权之前 | A26-01、A26-02 |
| **P26-02 Setup API/受限认证** | `setup/status`、`setup/rotate-token`、`setup/validate-embedding`、`setup/initialize` 接口的严格状态转移、同源输入、重复/并发保护；复用现有 `auth.json` Token 生成、Web Session 登录/恢复与权限保护；无新账号或 claim code | A26-02、A26-03 |
| **P26-03 配置、Web Secret 与统一初始化** | Web 第二/第三步输入映射完整 `config.toml`，默认 Jieba/cache/无自定义扩展；独立 0600 API Key 文件/固定 `api_key_env` 和 no-auth 分支；同一初始化器用于 daemon 自动初始化、Web 与显式 Go/CLI init；已发布合法 config 仅通过已认证 `{}` resume，不覆写；使用正式业务 Handler **进程内 authenticated readiness** 打破外部 503 门禁与完成验收的循环依赖；原子写 config、真实 readiness 后发布 receipt、再开放外部业务；启动中的 daemon 不嵌套启动第二个 daemon | A26-03、A26-04 |
| **P26-04 Web 四步交互与状态路由** | 正式替换原 `?preview=setup` 演示入口（不留生产绕行）；Token → 对外 Origin → 向量 → 初始化进度；i18n、主题、预填/输入校验、成功/失败/已有配置/恢复/认证过期态；先读 setup 状态再恢复普通 Session；静态资源、首页与 setup 双向跳转；桌面/窄屏底部进度和按钮位置稳定 | A26-01、A26-05 |
| **P26-05 兼容/异常与隔离验收** | 完整配置直接启动、真正的 fresh Docker Volume、双页竞争、初始化中 crash/restart、旧合法库重启/缺文件、缺 Key、配置/权限/Remote Provider 故障、失联返回、OAuth/MCP/静态资源/业务状态恢复；不删除用户数据 | A26-01–07 |
| **P26-06 Review 与交付** | Mac 定向与 `pnpm validate`，OpenClaw 隔离 Linux amd64 正式 Dockerfile/临时 Volume，按授权提交/推送后最终 SHA 的 GitHub 两 Job CI，最终 diff 与文档/代码一致性 Review；更新操作指南仅在真实实现后 | A26-06、A26-07 |

先做 P26-01/02 的受限 HTTP 生命周期及状态门禁，再完成 P26-03 的共享初始化，最后将 P26-04 UI 接到真实状态/认证。不得为完成前端演示反向造一个与当前 Kernel 不一致的假 Bootstrap；实现时若发现已冻结配置/凭证合同无法通过现有 SQLite/Provider 验证，先复查 owner 文档与已有测试，补最小设计并写回真源，再继续受影响部分。

## Acceptance（全部必须以实际实现证据验收）

### A26-01 启动和 Web 导航

1. 新建独立临时 Workspace，**无 `config.toml`、`auth.json`、`initialized.json` 与 `kgos.db`**：正式 Docker 中 `kgosd` 仍可启动受限 listener；`GET /api/v1/setup/status` 返回 `setup_required`，HTML 首页及其它页面到 `/setup`，真实 JS/CSS 等静态资源可正常打开；不会生成空 Knowledge Base，不会错误触发登录弹窗。
2. 完整合法配置但无 receipt：直接 `kgosd --root`，自动使用现有 Runtime 扩展/Schema/DB/Bootstrap/readiness 并发布 receipt，最终工作区和认证可用；重复启动、停止再启动数据/Branch/Token/版本均保留。手动 TOML 的所有必填配置缺失/非法时**不补猜默认**，返回明确诊断。
3. 完整已初始化实例直接访问 `/setup` 服务器及浏览器都自动回首页，不出现可用的重新初始化 API；刷新 Web Session 仍按当前合同恢复。HTML 页面可 302/307，机器 API/MCP 不允许重定向到 setup 页面。

### A26-02 初始化先于鉴权、MCP/OAuth 和身份

1. 对未 ready 实例，以**不带 Bearer 与带错误 Bearer**分别访问真实 Graph/Object/Ontology/Evolution API、MCP Tool 调用/Resource/OAuth：先返回符合接口内容类型的 `503 INSTANCE_NOT_INITIALIZED`，不出现优先级颠倒的 401/302、不执行 Kernel/MCP；`GET setup/status` 仅无 Token 时匿名只读；Token 已存在必须认证。原先已有 receipt 但真实 Runtime 文件缺失/坏库的异常不得发引导新建，使用 `INSTANCE_UNAVAILABLE`。
2. 未认领且没有 `auth.json` 时两浏览器并发首次 `rotate-token`：只允许一个原子成功并以 `201` **仅一次**返回 Token；其它未认证请求 `401 AUTHENTICATION_FAILED`，原 Token 不被覆盖或匿名再次读出。`GET setup/status` 的 `credentialConfigured` 只能反映有效凭证是否已存在；初始化提交返回 `202 initializing` 不能冒充最终成功。无额外 setup password/claim token，Origin/Host/HTTP method 与返回头保持既有 Web 安全边界；提示未初始化公开监听存在抢先认领风险，但不引入用户已否决的额外验证。
3. root Token 存在时 Session/login/logout 在受限模式沿用原规则，未 ready 的业务 API 即使拿到 Web Bearer 也必须 503；没有合法凭证尝试 `setup/initialize` 必须 401，认证后的并发提交只允许一个初始化；ready 后所有 setup 写入返回 409，普通 API 恢复真实 401/正常授权行为，MCP OAuth 与 Tool 清单不回归。

### A26-03 配置、私有凭证和边界

1. Web 第二、第三步输入仅为未提交草稿（前后页可返回），第四步才能提交完整显式配置；生成的 TOML 满足 Go / CLI 同一解析器：`cache` 路径和 4096 MiB、`fulltext.analyzer=jieba`、合法 `embedding`、空 third-party extensions。非法 URL、模型、维度非 1..4096、`dot` 算法、未知字段及非法 FTS5/extension 均按真实配置校验拒绝，不留下半配置。现有手工 TOML 可使用全套自定义值。
2. Web API Key 保存于独立 Instance-private 0600 文件，**先持久化私有 Key，再原子发布完整配置**；针对崩溃后孤立 Key 文件、config 已有但 Key 缺失两个顺序边界定向测试，不能把任何残留当 ready；TOML/IndexDefinition/错误、日志、MCP/SDK、浏览器存储或普通 HTTP 响应均不得出现明文（仅用户输入及必要的传输时刻持有）。下次重启时固定 `KGOS_WEB_EMBEDDING_API_KEY` 能被现有 Provider 按需解析；文件缺失、非法权限或同名环境变量冲突安全失败；手工 `api_key_env` 依旧从 daemon 环境读取，不依赖该文件。无认证 endpoint `api_key_env=""` 不存 Key。远端 Provider 不可达不虚构“连接成功”，也不将其当作普通数据库/Graph readiness 的必需前置。
3. 现存 `auth.json` 格式、单 Token、Session Cookie/boot guard 及现有业务认证均不改；没有 root Token/Session 的第四步拒绝，初始化失败不得把已创建的 Token 清空或重新生成。Web/CLI/MCP 不能通过接受配置的 Setup 路由替代普通有鉴权业务写入。

### A26-04 Bootstrap、并发和中断恢复

1. Web 初始化/daemon config-first/显式 init 三条真实路径使用同一 Runtime/Lithograph Host、官方及 caller extensions、Database/KG OS Bootstrap、authenticated overview/readiness。初始化中从**进程内、复用正式业务 Handler**执行 authenticated readiness，不能因外部 503 门禁而死锁，亦不能创建对网络开放的临时绕过路由；外部业务 503 持续到验证通过、原格式 `{"version":1}` receipt 原子发布，随后在**同一端口、同一个 daemon、同一个锁**切换 ready。成功后原 Web Session 可无须再次输入根 Token 即恢复使用；在受限模式取得的临时 Web Bearer/Boot Guard 如需更新，必须通过现有 Session Cookie 安全恢复。测试必须用真实落盘的新 DB 与版本化 Graph State，不仅模拟 API。
2. 初始化请求超时/断连、daemon SIGTERM、错误远端 extension SHA/路径、DB/权限错误、重复点击与双浏览器竞态：单 flight、冲突/进度一致、持久文件未被覆写、失败 status 准确。**已有合法 config、无 receipt** 可用原 Bearer/Web Session 提交空对象 `{}` 恢复，不得附新 config/Key，不重复创建管理员 Token；损坏/非法 config 必须先由用户修文件并重启，不能通过 Web 新配置覆盖。不因网络请求超时自动重复持久写。
3. config 在 Web 初始化提交前由其他进程建立时返回冲突并保留手工文件；遗留 `kgos.db`、`auth.json` 或 `initialized.json` 不匹配、旧布局或损坏的 Instance 必须 fail closed，禁止自动擦除后制造空库。“重新开始”只丢弃未提交草稿，不能自动删除已经持久化的 config/Token/Knowledge；用户可通过现有受控文件/备份流程恢复。

### A26-05 真实浏览器可用性、可访问性和文案

1. English/简体中文、深浅主题和 320px–1920px 范围：四步 Token-first、外部地址、向量字段、初始化进度和错误/完成态均可真实使用；左侧紧凑步骤栏、中间表单、底部步骤信息与前/后按钮位置不随步骤内容/滚动跳动；内容超长只在表单滚动，移动端不遮挡按钮。不把未连接按钮显示为绿色成功。
2. 完成 Token 创建时可复制并明确提示只展示一次；已有 Token / Web Session 可以恢复第一步认证而不匿名读 secret，带 Key 的错误文案不泄漏密钥；初始化成功直接去主页，已 ready 输入 `/setup` 无法重新初始化。普通业务登录只在 ready 后出现。
3. 浏览器真实 API 状态接口、初始化终态及新进程重启的 ready 恢复均经 Playwright 验证，所有初始化接口禁用缓存和页面本地 Key 持久化；临时 `?preview=setup` 不能构成生产绕行。
4. 第三步 API Key 输入留空即为 no-auth，移除重复解释和独立开关；仅当前草稿通过一次真实 Embeddings 请求且返回维度一致时，`验证配置` 才转为 `下一步`。任何 URL/Key/模型/维度/算法修改立即清除成功结果；401、404、429、超时、非法 JSON、实际维度不符均须保留在第二步，提示有界真实失败原因。已认证验证接口允许任意合法 HTTP(S) 目标地址（包括私网、本机和 Fake-IP），未经认证绝不拨号、不得跟随重定向或使用环境代理，不持久化任何凭证；隔离 HTTP fixture 与真实浏览器调用分别证明网络请求形状和 UI 状态门禁。

### A26-06 Mac / Linux Docker / CI 与旧功能回归

1. Mac 执行受影响 Go/TS/Playwright/配置静态和恢复测试、生成文档/Markdown 门禁以及完整 `pnpm validate`（含真实 go-sqlite3/Lithograph Provider、MCP/UI），独立于 Docker。修改后检查实际所有状态和最终 diff；保留现有 Plugin、Doctor 与用户未提交工作。
2. OpenClaw **独立临时** Linux amd64 Docker Volume 使用仓库现有正式 Dockerfile：无配置启动 → Web/API/MCP gate → 四步初始化 → 真实 SDK/业务/知识/分支读写 → 认证刷新/重启 → 配置文件直接启动；覆盖损坏/错误路径。只读核验长期 Dev；未经部署授权不切换它，不在 Mac 跑 Docker。
3. 获独立 Commit/Push 授权后，在确切最终 pushed SHA 的 GitHub Ubuntu Validate + Linux amd64 Docker **两个 Job** 均实测 success 后才允许阶段关闭；最终 CI、Dev 部署、正式 Tag/GHCR 和生产部署各自独立记录，绝不使用此前 Phase 成功当新改动验收。

### A26-07 Review 与完成定义

持续 Review 并修复实际发现的问题：初始化状态是否先于鉴权、业务 503 是否保持机器可读、Root Token 与 Embedding API Key 是否完全独立、人工 TOML 是否完整且不覆盖、receipt 是否只在 authenticated readiness 发布、同进程切换是否双锁/双监听、Setup API 是否在 ready 后完全关闭、所有原有 API/MCP/OAuth/Session/Go CLI 路径是否保留行为。每次修复只重验受影响门禁，最终与 Runtime/Web/Contracts/CLI/MCP 设计、代码和 E2E 实际一致；提交物不含 secret、临时 DB、构建产物或额外依赖。只有 A26-01–07 的本阶段真实证据和必要交付条件满足才改为 `done`。

## 设计 Review 清单（开发前）

- **状态闭环**：config 缺失、完整、非法；receipt 缺失、有效、损坏；Token/DB 部分存在；自动初始化失败/重试，在表中是否每种都有明确状态？不能用 `config.toml` existence 覆盖 receipt 的意义。
- **身份闭环**：先于鉴权的只是普通业务初始化路由门禁，不意味着 Session 和 Setup finalization 可以匿名；第一步只有一次根 Token 创建可匿名，没有新增一次性证明的部署风险在 D105 明确。
- **技术闭环**：单 Go 进程初始化不能调用原有第二个 daemon 或争抢自己持有的 lock，HTTP listener 上早期 setup API 不能提前构造 Kernel；自动/manual/Web 全走相同 readiness 与 receipt；进程内 authenticated readiness 必须可执行且不得借外部 503 门禁开放匿名旁路；远端 Embedding 测试不作为本地就绪的硬依赖。
- **文件闭环**：Web Key 文件与 `auth.json` 互不复用，Web 写完整 config 而非变更旧格式，人工 TOML 不依赖新 secret，现场已有库不被初始化覆盖；旧 Phase 12/13/16/17 成功仍是历史证据。
- **用户体验闭环**：没有重新出现独立“检索存储”“额外扩展”步骤；首页 / setup 导航互斥、普通 API 不 302；暗/亮、中英文、窄屏/footer 与表单保持已确认视觉基线。

## 2026-10-25 D110 Token-first Setup 增量设计与开发计划

**输入与状态**：本增量与现有 Phase 26 同属一次 Web-first 初始化功能，不新增独立 Phase。依据 [D110](../../design/decisions.md#d110-token-first-setup) 和 [Runtime](../../design/runtime.md#web-first-run-bootstrap)、[Web](../../design/web.md#web-first-run-setup) 覆盖下述旧 A26-02/03/05 中匿名 claim/rotate/validate 与五步顺序的预期；后面的 2026-10-20/21 记录是**当时实现的历史证据**，不是本次新行为验收。阶段仍为 `in_progress`，Commit/Push/Dev 部署/最终 CI 各自需要单独授权。

| Feature | 最小交付 | Acceptance |
| --- | --- | --- |
| P26-D110-01 Token-first 身份状态 | 后端 `rotate-token` 首次无 Token/无 config/合法 Origin 才可匿名原子创建；之后状态、轮换、验证、初始化使用现有 Instance/Web Bearer+Boot Guard；移除匿名 `claim`，保护已有 `auth.json`、同源和并发、旧凭证/Session 失效 | A26-D110-01 |
| P26-D110-02 自由 Embedding 出口 | 删除预检与设置页共用探测器的 IP/网络类型拦截，仍限制 URL 语法、HTTP 重定向、环境代理、单次并发、10s 超时、请求响应大小和密钥回显/落盘 | A26-D110-02 |
| P26-D110-03 Web 四步 | 第一屏直接生成/恢复 Token，已认领但无有效 Session 时输入旧凭证登录（不得匿名重新生成），登录后进入 Origin、向量、初始化。Status 遇 401 后通过服务器 HTML 路由决定 UI 外壳，登录后再读取真实状态；预览和中英/深浅主题保持可用 | A26-D110-03 |
| P26-D110-04 完整闭环 | 更新中英文可编辑安装模板，旧版归档保持不变；Go/TS/E2E 否定用例、原有配置/Session/重启回归、Mac 质量和最终 diff；Docker/远程 CI 按独立范围/授权交付 | A26-D110-04 |

**A26-D110-01**：并发首次 `rotate-token` 仅一个 201、其余未认证 401，不生成第二个 Token；重复匿名、旧 Root/Cookie/Web Access 401；已认证轮换 201 且仅一次回显，保留旧 Auth 文件权限/格式；`claim` 不再是合法匿名入口；认证后的非法状态/已发布 config/ready 409，不改磁盘。Token 已存在时 `status`、`validate-embedding` 均要求认证；测试未经认证不会触达模拟目标或修改配置，普通业务仍 503；手工 TOML 自动初始化、ready 旧实例导航和旧库完整性不回归。

**A26-D110-02**：在无外部秘密的隔离测试中，回环 IPv4/IPv6、普通私网、Fake-IP、特殊保留目标地址允许真实 HTTP 请求（或网络拨号尝试）且不会返回 `address_not_allowed`；无效 URL、重定向、超时、超大响应/并发、认证失败和维度不匹配仍拒绝，Key 不进入响应/日志/配置。正常受认证 settings 测试遵守同一地址规则。

**A26-D110-03**：四步顺序、首次自动登录、已认领 Session 恢复或手动登录、复制/重试/轮换、旧 Token 失效、刷新和已有配置 resume 通过 Web 单元与真实浏览器场景；无 Token 不能推进对外地址/向量测试；向量当前草稿变更使旧验证失效；登录态不保存根 Token 在浏览器持久存储。已 ready 时 `/setup` 服务器直接跳转首页，初始化中的状态轮询要求 Session。

**A26-D110-04**：Go 定向及 race，Web typecheck/lint/Vitest、Playwright 实际浏览器路径、Mac `pnpm validate` 和文档一致性、diff --check 均有当前工作树证据；完整 Linux Docker 隔离构建/31 SDK、最终 pushed SHA 的两 Job CI/Dev 环境验证分别明确执行状态。当前任务只授权设计、开发、必要本地验证，不含 Commit/Push/部署；Phase 26 尚有其它历史阶段验收范围，不得据本增量通过擅标为 done。

### D110 实施与 Mac 验收记录（2026-10-25）

- **代码**：当前 Mac `main@fc819d4` 未提交工作树实现一次匿名 `rotate-token` 原子创建、已认领状态下全部 Setup API 鉴权及旧凭证/Session 失效；`claim` 不再作为 Setup 入口；已认证的 Embedding Setup/Settings 连接测试不再按目的 IP 类型拒绝，仍有同源、请求超时、大小/并发与禁止重定向保护。Web 使用四步 Token-first 向导，允许已有 Token 登录、Cookie Session 恢复与进度/就绪导航；删除旧欢迎页组件、孤立样式及对应文案。
- **Review 修复**：内存凭证尚未刷新但 `auth.json` 已由其它进程创建时，匿名状态/重新认领拒绝；并发首次认领仅一个成功。config-first 的集成测试与 E2E 启动器改用现有 Token 读 `setup/status`。完成真实 Bootstrap 后保留原 Setup Session 直到浏览器读取 `ready`，避免前端被意外踢出；Session 恢复已就绪时导航回主页。定向 Go、Web 与浏览器回归覆盖这些边界。
- **本地验收**：Mac 完整 `pnpm validate` **退出码 0**：Go 全包、`-race`、覆盖率门禁（≥90%）、安全检查通过，TypeScript 类型/Lint/格式、Markdown/CSpell/Secrets、依赖许可、重复代码与未使用代码检查通过；Web 定向 **345/345** Vitest 与完整 Playwright **56/56** 通过。依赖审计通过 High 以上阈值，保留 **3 Low / 5 Moderate** 非阻断告警。完整验收后对 Session 已 ready 恢复导航补了一处局部修正，按相关 Web 检查单独复验；该增量不自动等同于再次运行全部质量门禁。
- **未执行**：未对该 D110 工作树做新的 Linux amd64 隔离 Docker/31 SDK 验收，也未对真实 Dev Instance 做变更；未 Commit、Push、Tag、发布或运行最终 pushed SHA 的公开仓库两 Job CI。因此仅确认**本地实施与测试完成**，Phase 26 仍为 `in_progress`，不得借用历史 Docker/CI 结果关闭阶段。

## 实施进展与本地验证（2026-10-20）

**阶段状态：`in_progress`。** 该记录来自 Mac 上 `main@d62dc0c` 的未提交工作树与 OpenClaw 独立临时测试容器；**不是已提交/已推送版本的 CI 或 Dev/生产部署**，Phase 25/27/28 与 Plugin 的既有用户改动均未触碰。

- **P26-01/02 已实现**：`cmd/kgosd/setup.go`、`internal/runtime/runtime.go`、`internal/daemon/setup_session.go` 实现单进程/单 Instance Lock、无配置受限 HTTP、状态查询、初始化先于业务鉴权、503、原有 Web Session/根 Token 认证、D110 首次匿名 rotate-token、重复/跨域/竞态保护；已支持手工完整 TOML 自动 Bootstrap 与现有数据库恢复，旧实例异常 fail closed。
- **P26-03 已实现**：完成设置后通过同一 Lithograph/Kernel Runtime 与进程内 authenticated overview 证明真实就绪，只在成功后发布原版 `initialized.json` 并开放业务；Web API Key 0600 私有落盘和专用环境变量映射，TOML/Token no-replace 写入，手工 `api_key_env` 独立保留。
- **P26-04 已实现**：React 欢迎→向量→Instance 认证→真实初始化四步，与 `setup/status|claim|initialize`、原 Web Session 相连；中英、深浅色、手机/桌面布局保持左侧步骤与 Footer 按钮位置稳定；非法旧实例不暴露重新认领入口。
- **此前 Mac 质量基线（早于后续 Embedding 验证及其它并行改动）**：完整 `pnpm validate` **退出码 0**；Web Check **146/146**、全仓 Vitest **248/248**、完整 Playwright **33/33**（其中 Setup 真实数据库 E2E **7/7**，验证 Session 登录失败后使用原 Token 重试）；Go `-race` 通过、整体覆盖率 **90.1%**；TypeScript 覆盖率依次为语句 **95.40%**、分支 **90.57%**、函数 **96.95%**、行 **97.39%**，均满足 ≥90%。以上为真实历史证据，**不得用于宣称最新工作树的完整验证通过**。
- **隔离 Linux amd64 Docker 证据**：OpenClaw 先在独立源码目录 `/tmp/kgos-phase26-source.RBbVwYta` 完成正式 `Dockerfile.unified` 构建与全套 Smoke；增加前端认证失败恢复修复后，再从最新本地工作树复制至 `/tmp/kgos-phase26-ui-review.63C4FfXb`，原样重新构建临时镜像 `kgos-phase26-ui-review:local`。最新镜像的独立 Volume **无 TOML → 503 → 首次 Claim → 真实数据库 Bootstrap/readiness/receipt → ready → 重启持久化** 复验通过；同一镜像的 MCP 全功能 Smoke **31/31 SDK**、单 `kgosd`、non-root、Node-free、OAuth/资源、重启与隔离 Volume 清理均通过。未切换或修改长期 Dev 服务、配置与知识数据。
- **本轮 Review**：清理旧“端口可达=业务 ready”的测试假设；修复 Web Session 在 ready 切换时的竞争；更改 auth.json 创建为原子不覆盖，禁止外部提前创建凭证后被 Claim 再次回显；加强非法 TOML/缺少 DB/缺少凭证/私有 Key 与自定义 MCP Path 的 fail-closed 路径。前端测试还发现“管理员 Token 已创建、但首次 Web Session 登录失败后无重试入口”，已改为保留 Token 并提供登录重试，不重新认领；Unit + 真实 Playwright 均复验通过。补齐 Setup API、四步交互、入口状态优先于鉴权的测试，未排除代码或降低质量阈值。
- **Embedding 验证旧门禁（2026-10-20，已于 2026-10-21 调整）**：新增真实 Embedding 验证后，服务端只在 `setup_required`、尚未认领管理员 Token 且磁盘上**不存在** `config.toml` / `auth.json` 时允许发出请求。已认领 Token、运行期间手工出现配置/凭证、初始化中、已完成或错误状态均返回 `409 SETUP_CONFLICT`，不会触发新的外部访问；文件状态不可读取时 fail closed。新增“状态仍为 setup_required，但配置/凭证已出现”的回归测试，定向 Go `-race` 通过；Markdown、CSpell 和 diff 检查通过。已有未认证公网出口限制、单请求并发控制和 10 秒超时保留。**最新全仓 `pnpm validate` 未通过**：Go race 阶段的独立 `TestVLogSkillResourceContract` 在解析尚未提交的 VLog Skill YAML 元数据时报错；未修改无关 Skill 文件。这一失败与本阶段局部验证结果分开记录，最新完整本地门禁、最终 SHA CI 仍须重新验收。
- **内网向量服务兼容调整（后续增量）**：将上述“仅公网可路由”限制放宽为允许普通 IPv4 私网及 IPv6 ULA；例如预填域名解析到 `10.168.155.234` 时不再被地址策略拒绝。本机回环、链路本地、元数据和其它特殊保留段仍不可用。保持原有四步顺序、阶段门禁、同源、固定请求、禁代理/重定向、单请求并发、10 秒超时和响应体上限；Go 定向和竞态测试、Web 单元测试以及文档检查已通过。本地独立测试实例的重建验证与 Docker/CI 仍按实际结果单独记录。
- **第三步访问令牌文案与交互优化（2026-10-21）**：依 [Web 四步设计](../../design/web.md#web-first-run-setup) 把标题调整为「保护您的 KG OS 实例」，生成前解释管理员凭证用途、生成即生效、单次展示及自动认证；生成后切换为「访问令牌已创建」、只读显隐/复制、保存提示、成功/失败复制 Toast；Web Session 成功显示可继续初始化，失败保留本页令牌和登录重试，已有 Token 继续使用原凭证而不重新生成。第三步「下一步」只在获得 Web Access 后启用；不增加保存勾选、新认证模型或后端写入。中英翻译同步完成。
- **本轮验收**：`pnpm --filter @kgos/web check`（TypeScript/ESLint/Prettier、16 文件 / **156** 项 Vitest）通过；`pnpm test:e2e` 真实重新构建 Browser/MCP/Go + **39/39** Playwright 通过，覆盖实际管理员 Token 一次性 Claim、真实剪贴板复制成功提示、失败登录重试、初始化及 Session 恢复。另在运行中的本地 `5184` Web 使用仅对隔离浏览器生效的 HTTP fixture 复核 1440/375/320px 的生成前后双语页面和按钮门禁，均无 JS 异常或横向溢出；未对供用户验收的新 Instance 发起实际 Claim/初始化。已记录源代码与设计变更；最新完整 `pnpm validate`、Docker/远端 CI 仍未因本次 UI 验收而视为通过，Phase 26 维持 `in_progress`。
- **仍待交付验收和独立授权**：当前工作树相关 Go 定向/竞态与前端 E2E 已验收；最新完整 `pnpm validate` 及变更后的 Linux Docker 隔离测试、最终 diff 还未作为同一完整版本闭环。尚未获 **Commit / Push** 授权，故不存在最终 pushed SHA 的 GitHub Ubuntu Validate + Linux amd64 Docker **两个 Job** 结果。长期 Dev、镜像发行和生产部署是独立动作，尚未执行。Phase 26 保持 `in_progress`，不得标记 `done`。

### 2026-10-21 管理员 Token 认领后的向量验证恢复

- **已确认并修复**：此前 `setup/validate-embedding` 将 `auth.json` 已存在也视为拒绝理由，导致第三步认领 Token 后返回第二步无法重新验证。本次按 Runtime/Web 设计调整为：仅 `setup_required` 且尚无 `config.toml` 时允许受限同源验证，已由当前 daemon 认领或启动时加载的有效管理员 Token 不阻断；配置落盘、初始化中、ready、异常凭证/文件状态仍 fail closed。保持原网络目标限制、禁重定向/代理、单请求、10 秒超时与响应大小/字段校验，不改变 Token/Key 存储、Session、第四步提交或就绪判定。
- **前端修复**：`setup-api.ts` 把该接口的 `409 SETUP_CONFLICT` 转为稳定的 `setup_unavailable` 验证结果，Toast 以中英文准确提示刷新并检查初始化状态，不再误报为网络失败。既有成功/Provider 失败、Abort、参数变更失效逻辑不变。
- **已验证**：Go `go test -race -tags sqlite_fts5 ./cmd/kgosd -run 'TestEmbeddingProbe|TestSetupEmbedding'` 通过；Web TypeScript/ESLint/Prettier、16 文件 / **157** 项 Vitest 通过。正式 Browser/MCP/Go 全量 `pnpm build` 成功，完整 Playwright 重新执行 **39/39** 通过；E2E 在真实 daemon 认领 Token 后，使用受拦截的本机回环地址确认返回受限向量验证结果（422，非 409），再返回第二步修改模型并完成重新验证、Session 登录、实际数据库 Bootstrap 与同库重启。测试环境独立，未向用户的 `5184` Instance 提交初始化或替换管理员凭证。
- **范围与未验证**：本轮只更改向量 Setup 门禁、前端错误映射、相应测试与设计真源；未执行新的 Linux Docker、远端 CI、Commit、Push 或发布。前述历史 `setup/validate-embedding` “必须未认领管理员 Token”规则已由本条设计更新取代。Phase 26 仍为 `in_progress`。

### 2026-10-21 第三步管理员 Token 重新生成与统一引导

- **第三步文案深化**：在保留「保护您的 KG OS 实例」和生成前后正文一致的前提下，增加独立副标题及两段高信息密度说明，交代管理员凭证的权限与客户端用途、如何安全保管、生成即生效、Web 只在本次生成时展示、可通过本地 `.kgos/auth.json` 找回，以及轮换使旧 Token / Session 失效。操作提示明确自动尝试登录和建议使用密码管理器。同步 English/简体中文，现有 Claim/Rotate/Session 与数据写入合同不变。
- **用户确认的 UI 调整**：第三步「保护您的 KG OS 实例」标题、两段用途说明与安全提示，无论 Token 是否已生成、Session 是否恢复，都保持同一套布局与文案；未认领时按钮显示「生成访问令牌」，认领后且已登录时显示「重新生成访问令牌」。新令牌本次展示、显隐/复制与保存提示仍可用，已认领但尚未登录的浏览器须先输入旧 Token 登录，不匿名重新生成。
- **受控凭证轮换**：增加 `POST /api/v1/setup/rotate-token`。继续只允许无配置时匿名首次 `claim`，轮换需当前管理员 Root Bearer 或 Web Access Bearer / Boot Guard 通过现有同源鉴权。后端持有原 Instance Lock 与 Setup Controller Mutex，检查 `setup_required`、`config.toml` 尚未发布及当前磁盘凭证一致，通过 0600 临时文件原子替换现有 `auth.json`，成功后只返回一次新 Root Token 并切换 Setup Session。旧 Root Token、Web Session Cookie 和临时 Web Bearer 不再有权限，Web 丢弃旧 Access 并用新 Token 重新登录；初始化中、已配置、已完成及异常文件拒绝轮换。旧匿名 `claim` 的一次性/不覆盖合同保留。
- **本轮真实验收**：Go `-race` 定向测试覆盖首次创建、已认证轮换、旧 Root/Session 失效、旧凭证不再可用于初始化、已发布配置拒绝写入、Private `auth.json` 与模式 0600；Web TypeScript、ESLint、Prettier 和 16 文件 / **161** 项 Vitest 通过，新增生成前后文案一致、原令牌只读展示/复制、已恢复 Session 轮换、失败重认证用例。重新执行 `pnpm test:e2e` 完成浏览器/MCP/Go 正式构建及 **39/39** Playwright，通过真实首次生成 → 登录失败重试 → 重生成 → 旧 Token 拒绝 → 真实数据库初始化和重启持久化；均使用隔离测试 Instance，未重置或旋转用户当前本地数据。
- **尚未交付**：本轮没有运行新的 Linux Docker/远程 CI，也未 Commit、Push 或部署；Phase 26 仍是 `in_progress`，历史“未初始化时不可匿名轮换”的保护保留，之前没有重新生成入口的 UI 状态由本节新设计取代。

### 2026-10-21 初始化期间无需旧 Token 即可重新生成

- **用户更新的正式合同**：只要实例仍在 `setup_required` 且首次 `config.toml` 尚未发布，第三步不再要求已有管理员 Token 或 Web Session。原先的「已有实例访问令牌」输入 / 登录分支移除：首次为「生成访问令牌」，此前已生成则直接显示「重新生成访问令牌」。生成前后统一的标题、两段介绍及提示仍保持一致；轮换成功后保留新令牌的一次性展示与复制，自动尝试建立 Web Session，第四步仍必须具备有效 Web Access。
- **后端变更**：`POST setup/rotate-token` 由已认证轮换改为同源匿名轮换；服务端仍通过 Controller 锁、`setup_required`、未完成且无配置、当前磁盘凭证一致性及 0600 原子替换执行，不修改已有初始化数据。旧 Token / Cookie / Web Bearer 被替换后失效，配置发布、初始化中、ready 或凭证异常时拒绝。失去轮换 HTTP 响应时不把旧 Session / 明文显示为有效；已取得新令牌但自动登录失败时必须保留新令牌供复制或重试。
- **安全取舍**：未完成首次配置前，任何可通过同源安全边界访问 Setup API 的人均可将已生成的管理员 Token 替换并取得新 Token；不得将未初始化服务开放给不可信网络。保留原 Origin / Sec-Fetch-Site、文件权限以及初始化完成后禁止轮换的门禁，不新增人工验证流程。此前本阶段记载的“必须有当前管理员认证才可轮换”和“失效 Session 需输入已有 Token”均被本项取代。
- **本轮已验证**：`go test -race -tags sqlite_fts5 ./internal/runtimeprofile ./cmd/kgosd -count=1` 通过，覆盖匿名轮换的状态边界、同源拒绝、旧凭证 / Web Session 失效及已发布配置保护；`pnpm --filter @kgos/web check` 的 TypeScript、ESLint、Prettier 与 16 文件 / **162** 项 Vitest 通过。`pnpm test:e2e` 重新构建 Browser/MCP/Go 后，完整 Playwright 使用隔离真实 Instance 最终复跑 **39/39** 通过：首次登录失败后无需旧令牌或 Session 直接重新生成、自动建立新 Session、旧凭证失效，再完成真实数据库初始化和重启恢复。测试不访问或轮换用户的 `5184` 实例令牌。未执行新的 Linux Docker / 远端 CI、Commit / Push / 部署；Phase 26 继续 `in_progress`。

### 2026-10-21 新增五步初始化的 Public Origin

- **第五步配置确认 UI 增量（本轮预览）**：保持五步导航与固定 Footer、原有 `POST setup/initialize` 门禁及恢复流程，标题更新为「确认配置，开始初始化」，按「服务访问 / 语义检索」两张与第三步同源的卡片突出用户配置，再把 API 凭证状态、Jieba、4 GiB 缓存列为基础设置；MCP 地址由真实 Origin + 当前 MCP Path 派生，保留本机地址的 ChatGPT 云端限制提示。仅当前会话 Embedding 真正验证成功才展示验证成功标识，不输出密钥原文。初始化中或失败时不展示浏览器重载后可能过期的默认草稿，仅展示后端返回的真实阶段或失败原因及既有恢复说明；完成态仍以 Ready 导航为准。深浅主题与窄屏滚动遵守既有 Token/固定 Footer，不新增业务接口或私有状态。
- **安全设计预览**：已有 Dev 实例可能已经 ready，新增仅 `import.meta.env.DEV` 下的 `?preview=setup&step=initialize` 直接查看第五步示例，不触发真实 Claim、Token Rotation 或初始化，生产构建没有此绕行。预览值来自表单默认值（并非已保存配置），未实际验证时不展示绿色验证标识；提交仍受原 previewOnly 保护。
- **本轮实际验收**：`pnpm --filter @kgos/web check` 的 TypeScript、ESLint、Prettier 与 **184/184** Web 单元测试通过；`pnpm test:e2e` 用重新构建的 Go/MCP/Web 隔离实例通过 **42/42** Playwright，覆盖实际向量验证、第五步提交、知识库 Bootstrap 和重启。实机 Chromium 开发预览在 1365px 中文亮色、1080px 英文暗色、375px 中文亮色与 320px 英文暗色均无横向溢出/JS 异常，Footer 未越界且预览没有 POST。变更范围拼写、格式及 diff 检查通过；本次未执行 OpenClaw Docker、远端 CI、Commit、Push 或部署。
- **第 2 步文案与视觉一致性优化**：对外地址页沿用第三步向量配置的标题、副标题、双段介绍及 `setup-vector-card` 卡片边框、底色、圆角与内边距；移除额外套层重边框，保留地址编辑、MCP 地址派生和本机访问限制提示。中英文文案明确「统一入口、浏览器地址预填、域名/反向代理、外部可达的 HTTPS 地址」，不把输入格式校验误说成网络已通。
- **步骤快速双击保护**：保持已确认的底部按钮位置及「未验证→验证配置、验证成功→下一步」切换规则不变，不把验证入口迁移到内容区。屏蔽同一鼠标双击手势中 `detail > 1` 的第二次 Submit，避免第 2 步点击「下一步」后，第二次点击误触发新第 3 步的验证。真实 Chromium 双击与单元测试覆盖未发出任何 Embedding 验证请求、无失败 Toast；用户后续主动单击「验证配置」依旧执行原真实验证。
- **本轮复验**：`pnpm --filter @kgos/web check` TypeScript、ESLint、Prettier 以及 **181/181** 项 Vitest 通过；最新构建产物的完整 Playwright **41/42** 项通过，本功能相关的初始化测试 **9/9** 单独复跑通过，且独立 1098px English、375/320px 中文浏览器快双击均未执行向量验证、无错误通知及横向溢出。唯一全量失败来自不在本次改动范围内的 MCP 授权/登录界面测试，其另一独立主题颜色用例单独复跑通过；不将该全量门禁标记为成功，也不修改无关授权模块。格式、拼写和 diff 定向检查通过；Docker/远端 CI 与 Commit/Push/部署仍未执行。
- **确认方案**：新增第 2 步「配置对外访问地址」。只输入一个必填的 `public_origin`，默认使用本次浏览器 `location.origin`，用户可以修改；输入框严格要求 HTTPS Origin，本机 loopback HTTP 仅供本地开发，拒绝路径、账户、Query、Fragment。向导只展示 `public_origin + MCP Path` 派生 URL，不自建 Tunnel/TLS/公网入口，明确提示 localhost 无法供 ChatGPT 云端使用；独立编辑 Origin 不使已验证的向量参数失效。其他步骤顺延，最终配置确认展示填写的对外 Origin。
- **配置归属**：`config.toml` 新增 `[server].public_origin`；新的 Web Setup 提交必须完整显式填写，与 Cache、SQLite、Full-text、Embedding 同一次原子发布。Instance 加载 Runtime 时一起读取，`readyHandler` 传给同一 MCP OAuth 服务作为 Issuer，OAuth Resource 与 MCP Path 按既有协议组合。不存在另一个对外 URL 配置或启动参数覆盖；原 `--mcp-oauth-issuer` 和 `KGOS_MCP_OAUTH_ISSUER` 明确拒绝，部署者必须先迁入 `[server]` 再删除旧值。已初始化的旧版合法 TOML 不含 `[server]` 仍可启动、Bearer MCP 仍有效，但 OAuth 需补字段并重启方可启用。此字段为可修改的运行配置，不自动热加载。
- **验收边界**：Go 配置兼容/Origin 校验、旧参数拒绝、OAuth 元数据；Web 中英文和移动端输入校验/默认值/MCP URL、五步导航；独立浏览器真实 Init → OAuth Discovery/Resource → 同库重启恢复。验收结果以本轮实际命令为准；不重置用户的 5184 实例，不 Commit/Push/部署，Phase 26 持续 `in_progress`。
- **本轮实际通过（2026-10-21）**：正式 `pnpm test:e2e` 重新构建当前 Go/MCP/Web 后，Playwright **42/42** 通过，包含五步首次初始化、明文 Key 隔离、`config.toml` 写入、OAuth Issuer 与 Resource 元数据来自同一 Public Origin，以及重启后从相同文件恢复；Go `-race` 覆盖 Runtime 配置解析/旧 TOML 兼容、旧启动参数拒绝、Setup 和 Token 边界通过；Web `pnpm --filter @kgos/web check` **179/179** 通过；CLI `config.ts` 增量 TypeScript、ESLint 与 6/6 配置测试通过，保证新 `[server]` 不被旧 CLI/Doctor 拒绝。真实的 `5184` 设计实例在新后端上经隔离 Chromium 验收 1440px English、375/320px 中文的预填、编辑、禁用错误地址、派生 MCP URL、无横向溢出及无 JS 异常；未发起任何用户实例的 Claim、Rotate 或初始化。
- **独立未闭合门禁**：本轮 `pnpm validate` 通过 Go 全包检查/TS Typecheck/文档生成，但在 repo 全量 ESLint 被未纳入本次功能的 `tests/e2e/web-shell.spec.ts` 超长文件阻断；本次新增 E2E 文件的长度/语句数问题已经通过拆分专用测试 helper 解决。Markdownlint 全仓被现有 Phase 25 文档的 MD012 空行问题阻断；相关本轮变更文件的格式、拼写与 `git diff --check` 均通过。OpenClaw 独立 Linux Docker、最终 GitHub CI、Commit/Push/正式部署仍未执行，Phase 26 保持 `in_progress`，不得把本地 E2E 等同于交付关闭。

## 计划创建时的实际证据

- 2026-10-20：只读检查 `main@d62dc0c`。`cmd/kgosd/main.go` 先 `runtime.Open` 再挂 Web/MCP，`internal/runtime/runtime.go` 必须 `LoadConfig`，`cmd/kgosd/init.go` 使用独立已认证 readiness，`internal/runtimeprofile/initialized.go` 的 receipt 格式稳定；旧正式 Web 启动仍先恢复 Session，`features/setup` 只有未提交纯 UI 预览。
- 本轮仅写设计与 Phase 26 计划、执行文档 review/链接/格式检查；**未实现任何 P26 Feature，未调用真实 Setup API、未验证无配置启动，未提交、未推送、未部署**。Phase 25 与已有 Plugin/Web 用户改动保留原位。
