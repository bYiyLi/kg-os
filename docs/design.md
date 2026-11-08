# KG OS 设计

本文是 KG OS 设计文档集的**总入口与职责索引**。产品定义见 [README](../README.md)，协作与评审规则见 [AGENTS](../AGENTS.md)。

按任务只读取下表所属主题。阶段状态与完成证据见[开发计划](development/README.md)及对应 Phase；安装与命令见[开发指南](guide/development.md)。当前发行/部署状态必须核对实际来源，不能由历史版本、设计目标或源码版本推定。

`docs/design/` 各职责文件共同构成设计真源；每个主题只维护一份正文。本索引不复制阶段日志或详细设计。历史 npm/六平台交付见 [Phase 13](development/phases/13-init-wizard-credential-boundary.md)，现行 Docker-only 合同见 [D99](design/decisions.md#d99-linux-amd64-docker-only-distribution)。

## 设计职责

| 文档 | 唯一职责 |
| --- | --- |
| [architecture.md](design/architecture.md) | 核心理念、目标架构、Lithograph / SQLite 边界、Knowledge Base 与 bootstrap |
| [ontology.md](design/ontology.md) | Ontology 渐进读取、Domain/Definition 编辑聚合与字段、Constraint/Index 表达、semantic graph 与 Binding |
| [object.md](design/object.md) | 公共 aggregate/Knowledge Ref、共享 YAML/JSON、batch read 与统一 Patch |
| [graph.md](design/graph.md) | Knowledge 数据模型、Graph query / execute、Cypher 与搜索边界 |
| [evolution.md](design/evolution.md) | State / State Data、Branch、Tag、History、Diff、Merge Session |
| [mcp.md](design/mcp.md) | `kgosd` Go 原生 MCP、五个 AI-facing Tool / `kgos_docs`、Cypher 手册、Plugin/Skill、统一 Instance 授权、[D127 通用 OAuth 客户端身份](design/mcp.md#host-neutral-mcp-oauth)及 ChatGPT UI、[当前八个官方 Skill](design/mcp.md#kgos-official-skills)（本体设计/落地/审核、知识整理/审核/检索、VLog、Doctor，源码整合未发行）及旧通用 Skill 源码退役/私人安装迁移边界，以及 VLog 合同；Phase 22 `docs.read` 为历史接口 |
| [contracts.md](design/contracts.md) | 跨能力共享的公共错误合同、D105 首次初始化错误，以及 Web 持久数据错误方案 |
| [client.md](design/client.md) | `@kgos/sdk`、`@kgos/cli`、当前 Docker-only 交付、[D108 私有源码与公开 kg-releases 生成/CI](design/decisions.md#d108-private-source-public-releases)、TypeScript SDK、内部 CLI 与历史 npm 分发边界 |
| [cli.md](design/cli.md) | AI-first CLI command tree、`--root` / `KGOS_ROOT`、分层 help、`doctor/init` setup、Runtime ensure、i18n、stdin/file、JSON/raw body/streaming、错误与 exit code |
| [runtime.md](design/runtime.md) | Go `kgosd`、Workspace Root / `.kgos` Instance、Web/API/MCP 统一监听与 [D105 Web-first 初始化门禁](design/runtime.md#web-first-run-bootstrap)、`auth.json` / `initialized.json`、native Runtime artifacts、Provider cache / SQLite Extension、daemon lifecycle |
| [observability.md](design/observability.md) | `kgosd` 结构化事件、Access/业务/安全日志、OpenTelemetry Go Trace 与 Request/Operation/Span 关联、进程内与历史指标、D126 独立 SQLite 诊断存储、应急输出及受保护查询 |
| [web.md](design/web.md) | 面向人的图谱优先界面、Branch / 领域树导航与居中历史 DAG 弹窗、[单画布知识搜索与局部探索](design/web.md#知识图谱画布与搜索)、[运行观测工作台](design/web.md#运行观测工作台d126phase-35-目标)、本体视图、草稿与连接交互、[D110 四步 Token-first 初始化页面](design/web.md#web-first-run-setup)、前端国际化与语言偏好、持久 UI / 可丢弃缓存及受控 API 方案；[功能材料与覆盖矩阵](design/web-materials.md)管理视觉材料，[一致样例](design/web-examples.md)只作非规范评审输入 |
| [decisions.md](design/decisions.md) | D1–D127 的决定、依据、备选和取舍，以及被替换架构记录 |
| [implementation.md](design/implementation.md) | 已确认设计的实现约束、readiness、projection/compiler/adapter mapping 与集成验收；不得维护阶段状态或重新定义产品语义 |

当前知识使用合同：[每轮强制检索及授权后变更](design/mcp.md#global-ai-guidance-and-daily-responsibility)、[D113 强制读取](design/decisions.md#d113-mandatory-knowledge-behavior)、[D119 先推荐后授权](design/decisions.md#d119-recommend-first-authorized-mutation)；此前 [D111](design/decisions.md#d111-task-scoped-knowledge-loading) / [D112](design/decisions.md#d112-global-ai-guidance-and-daily-responsibility) 的按任务选择读取与简单问候豁免已被替代，环境范围与其他有效边界保留。模型扩展与真实客户端验收见 [Phase 32](development/phases/32-knowledge-use-readiness.md)。源码修改、安装与发布分别取证。

MCP 健壮性与长期授权按 [D124](design/decisions.md#d124-mcp-resilience) 和 [MCP 统一结果/恢复合同](design/mcp.md#mcp-对外健壮性合同)实施，验收归 [Phase 34](development/phases/34-mcp-resilience.md)。

**MCP OAuth 新目标**：通用 Client ID/回调、CIMD、DCR 由 [D127](design/decisions.md#d127-host-neutral-mcp-oauth) 和 [MCP Host-neutral OAuth 合同](design/mcp.md#host-neutral-mcp-oauth)定义，出站 IP/SSRF 过滤以 [D128](design/decisions.md#d128-oauth-metadata-no-ssrf-ip-filter) 的修订为准；开发与真实 Muse/ChatGPT 验收见 [Phase 36](development/phases/36-host-neutral-mcp-oauth.md)。当前仍为设计/计划，不能视为已实现或已发布。

## 从配置到调用

| 要解决的问题 | 正文位置 |
| --- | --- |
| 当前 Docker 怎么发布和运行 | [Client Docker-only](design/client.md#docker-only-交付)、[MCP 部署](design/mcp.md#docker-only-交付)、[D99](design/decisions.md#d99-linux-amd64-docker-only-distribution) |
| 旧 v0.2.1 npm 如何定位 | [历史 npm 分发](design/client.md#npm-package-topology)、[历史 CLI](design/cli.md) |
| 第一次怎么定位并初始化 KG OS Instance | [CLI Global root](design/cli.md#global-root)、[Doctor](design/cli.md#doctor)、[Init](design/cli.md#init)、[Workspace Root / Instance](design/runtime.md#instance-root) |
| 未配置也启动 Web / 手工 TOML 自动初始化 / Token-first Setup 鉴权 | [D110](design/decisions.md#d110-token-first-setup)、[D105](design/decisions.md#d105-web-first-run-and-runtime-bootstrap)、[Runtime 状态/路由](design/runtime.md#web-first-run-bootstrap)、[Web 四步](design/web.md#web-first-run-setup)、[Setup 错误](design/contracts.md#初始化门禁与-setup-错误)、[Phase 26](development/phases/26-web-first-run-bootstrap.md) |
| kgosd 怎么配置扩展、模型和凭证 | [Runtime config](design/runtime.md#configtoml)、[Embedding 配置映射](design/runtime.md#embedding-配置与索引映射) |
| 使用方怎么定义模型和索引 | [Ontology 公共格式](design/ontology.md#公共可编辑格式)、[完整编辑示例](design/ontology.md#编辑示例) |
| 调用方怎么保存正文和查询 | [Graph 合同](design/graph.md#graph-公共调用合同)、[CLI query](design/cli.md#query)、[CLI execute](design/cli.md#execute) |
| AI 如何通过 MCP / 私人 Plugin 预览知识库及执行受控 SDK | [MCP / Plugin 设计](design/mcp.md) |
| Muse 等标准 MCP 客户端如何完成通用 OAuth | [D127](design/decisions.md#d127-host-neutral-mcp-oauth)、[CIMD/DCR 安全授权](design/mcp.md#host-neutral-mcp-oauth)、[Phase 36](development/phases/36-host-neutral-mcp-oauth.md) |
| AI 日常知识管理使用哪份全局指令 | [Global AI Guidance 唯一正文](../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md)及[职责与版本边界](design/mcp.md#global-ai-guidance-and-daily-responsibility)；发行版按同包基线，读取对照不等于宿主已加载 |
| AI 如何诊断 KG OS 版本、系统级引导、MCP/State、Skills、Knowledge、维护与本体来源/适配 | [Doctor D0–D6 设计](design/mcp.md#kgos-doctor-v1)、[D118 原基线](design/decisions.md#d118-kgos-doctor-six-checks)、[D122 原文导航/适配](design/decisions.md#d122-remote-foundation-navigation)、[Phase 25](development/phases/25-kgos-doctor.md)；D120 独立模型库发现为历史 |
| AI 如何选择本体、知识、VLog 的专业职责 | [八个 Skill 的边界与精确资源](design/mcp.md#kgos-standards-skill-suite)；原 D115/D117 统一规范布局仅作历史，当前设计、落地、审核和检索职责分开；不因源码整合宣称发布或安装完成 |
| 当前官方 Skill 清单与旧 Skill 退役、私人安装如何迁移 | [八 Skill 源码清单及发行边界](design/mcp.md#kgos-official-skills)；原三个 `*-standards` 源码退役，v0.3.5 七 Skill 及后续四 Skill 按历史冻结包保留，已有私人安装不会自动变化 |
| MCP 内的 AI 怎样获取 SDK 入参、出参、Cypher 25 语法及使用示例 | [MCP Tool / 批量文档目标](design/mcp.md#mcp-tool-help)、[D102](design/decisions.md#d102-mcp-tool-taxonomy-and-batch-docs)、[Phase 23](development/phases/23-mcp-tool-taxonomy-and-docs.md)；已实现的 `docs.read` 历史基线见 [D100](design/decisions.md#d100-mcp-self-describing-docs) / [Phase 22](development/phases/22-mcp-self-describing-docs.md)，更早 Help 见 [Phase 20](development/phases/20-mcp-tool-help.md) |
| KG OS 当前锁定哪个 Lithograph 版本，以及如何同步 MCP 手册 | 现用 v0.3.4 的 [Graph View / Domain 范围](design/graph.md#read-only-graph-view-与-domain-范围lithograph-v034)、[Phase 33](development/phases/33-domain-scoped-search.md)；历史 v0.3.3 升级见 [D103](design/decisions.md#d103-lithograph-v033-upgrade) / [Phase 24](development/phases/24-lithograph-v033-upgrade.md)，更早 v0.3.1 见 [D101](design/decisions.md#d101-lithograph-v031-upgrade) |
| 人怎样浏览图谱、查询、编辑和管理版本 | [Web 设计](design/web.md)、[功能画板与覆盖](design/web-materials.md)、[一致评审样例](design/web-examples.md)；内置同源交付见 [Runtime](design/runtime.md#web-hosting) |
| Web 中英文如何识别、切换与管理文案 | [Web 国际化与语言偏好](design/web.md#国际化与语言偏好)、[Phase 14 P14-00](development/phases/14-web.md#a14-00-国际化基础与双语界面)；CLI locale 为独立合同，见 [CLI 国际化](design/cli.md#国际化) |
| 需要实现和验证什么 | [工程待办与验收](design/implementation.md) |
| Web 如何同时运行于浏览器和 ChatGPT | [Web 双入口](design/web.md#chatgpt-内嵌-webmcp-apps)、[MCP Apps UI 合同](design/mcp.md#chatgpt-mcp-apps-ui-合同)、[D96](design/decisions.md#d96-chatgpt-mcp-apps-web)、[Phase 18](development/phases/18-chatgpt-embedded-web.md) |
| KG OS 如何记录关键业务结果、追踪请求及查看运行指标 | [Observability](design/observability.md)、[D97 历史基线](design/decisions.md#d97-kgos-observability)、[D126 SQLite/观测工作台](design/decisions.md#d126-sqlite-observability-workbench)、[Phase 19 历史验收](development/phases/19-observability.md)、[Phase 35 新计划](development/phases/35-observability-workbench.md) |
| 第一阶段怎么搭开发环境 | [开发路线](development/README.md)、[Phase 00 计划](development/phases/00-engineering-foundation.md)、[本地开发指南](guide/development.md) |

## 设计状态导航

| 要核实的状态 | 读取位置 |
| --- | --- |
| 主题是否已设计、当前行为与边界 | 上表对应 owner；[Decisions](design/decisions.md)解释决定及替换关系 |
| 哪个阶段可继续、尚缺什么验收 | [开发路线](development/README.md)及对应 Phase 的 Feature/Acceptance/证据 |
| 已确认设计还需哪些工程映射 | [Implementation](design/implementation.md)与对应 owner 一起检查 |
| 当前发行或实际部署 | 实际 Release/Tag、CI 与部署结果；不能把历史 Phase 发布记录称为最新 |
| Lithograph 的实现或发行 | Lithograph 自身仓库与产物，不在 KG OS 复制完成状态 |

**已确认不等于已实现；未实现不等于未设计。** 文档示例校验不替代引擎、真实扩展、Streaming 或 cancellation 测试。

## 阅读顺序

- 产品定义先读 [README](../README.md)，架构与存储边界读 [Architecture](design/architecture.md)。
- 按“配置 → 模型 → 调用”理解本次语义检索设计，使用上面的入口。
- 查询 / 写入的完整事务与错误边界分别读 [Object](design/object.md)、[Graph](design/graph.md)、[Evolution](design/evolution.md) 和 [公共合同](design/contracts.md)。
- 面向 ChatGPT / 通用 MCP Client 的受控 JavaScript、完整 Ontology 预览和私人 Plugin / Skill 方案读 [MCP](design/mcp.md)。
- 日志、业务事件、跨层请求关联、运行指标及新 SQLite 诊断库读 [Observability](design/observability.md)，已完成历史实现见 [Phase 19](development/phases/19-observability.md)，新目标实施/验收读 [Phase 35](development/phases/35-observability-workbench.md)。
- 人的图形阅读、查询结果帧、版本导航与前端编辑读 [Web](design/web.md)；按功能浏览 [Web 材料与覆盖矩阵](design/web-materials.md)，一致样例见 [Web 样例](design/web-examples.md)。
- 决策依据与被替换规则读 [Decisions](design/decisions.md)；历史条目的后续调整不与 owner 正文并行生效。
- 实现只能沿用对应 owner 已确认的规则；剩余 mapping / 验收由 [Implementation](design/implementation.md)记录。
- 开发顺序、阶段状态与完成证据读[开发计划](development/README.md)；安装和命令读[开发指南](guide/development.md)。
