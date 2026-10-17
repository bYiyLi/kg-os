# KG OS 设计

本文是 KG OS 设计文档集的**总入口与职责索引**。产品定义见 [README](../README.md)，协作与评审规则见 [AGENTS](../AGENTS.md)。

开发阶段、状态与验收见[开发计划](development/README.md)，当前已实现版本的实际开发/验证命令见[开发指南](guide/development.md)。Phase 00–13 已完成；当前公开版本为 **v0.2.1**，在 v0.2.0 基线上正式交付 Phase 13 的 D84 late-bound Embedding credential、init wizard 与 doctor credential 诊断调整。v0.2.1 的仓库实现、六平台 CI 与正式发布证据见[Phase 13](development/phases/13-init-wizard-credential-boundary.md)；v0.2.0 的 Phase 12 发布基线继续由[Phase 12](development/phases/12-first-run-cli-productization.md)维护。v0.1.1 的 Windows 首发与认证收尾继续由[Phase 11](development/phases/11-windows-runtime-acceptance.md)维护为历史证据。official Jieba exact artifact选择与跨平台证据见[研究记录](research/jieba-tokenizer.md)。完成证据由开发计划与 Phase 文件维护。

**未来官方交付只包含 Linux amd64 Docker 镜像**。v0.2.1 已发行的 npm/六平台产物属于历史事实，不再新增正式版本。详见 [D99](design/decisions.md#d99-linux-amd64-docker-only-distribution) 与 [Phase 21](development/phases/21-docker-only-delivery.md)。

KG OS 不再把全部设计维护在一个超大文件中。`docs/design/` 下的职责文件共同构成当前设计真源；**每个主题只有一个正文 owner**，本索引不复制详细设计。跨文档引用应链接到 owner 文件，不在其它文件重新维护同一规则。

## 设计职责

| 文档 | 唯一职责 |
| --- | --- |
| [architecture.md](design/architecture.md) | 核心理念、目标架构、Lithograph / SQLite 边界、Knowledge Base 与 bootstrap |
| [ontology.md](design/ontology.md) | Ontology 渐进读取、Domain/Definition 编辑聚合与字段、Constraint/Index 表达、semantic graph 与 Binding |
| [object.md](design/object.md) | 公共 aggregate/Knowledge Ref、共享 YAML/JSON、batch read 与统一 Patch |
| [graph.md](design/graph.md) | Knowledge 数据模型、Graph query / execute、Cypher 与搜索边界 |
| [evolution.md](design/evolution.md) | State / State Data、Branch、Tag、History、Diff、Merge Session |
| [mcp.md](design/mcp.md) | `kgosd` 原生 Go MCP、Go/WASM JavaScript Sandbox、D102 独立批量 `kgos_docs` 与五个 AI-facing Tool 目标合同、KG OS 自有 MCP Cypher 手册、私人 Plugin / Skill、ChatGPT UI Tool/Resource、外部认证与 Markdown 视图（Phase 22 `docs.read` 为当前实现基线） |
| [contracts.md](design/contracts.md) | 跨能力共享的公共错误合同，以及 Web 持久数据错误方案 |
| [client.md](design/client.md) | `@kgos/sdk`、`@kgos/cli`、当前 Docker-only 交付、TypeScript SDK、内部 CLI 与历史 npm 分发边界 |
| [cli.md](design/cli.md) | AI-first CLI command tree、`--root` / `KGOS_ROOT`、分层 help、`doctor/init` setup、Runtime ensure、i18n、stdin/file、JSON/raw body/streaming、错误与 exit code |
| [runtime.md](design/runtime.md) | Go `kgosd`、Workspace Root / `.kgos` Instance、Web/API/MCP 统一监听目标、dynamic loopback endpoint、`auth.json` / `kgosd.lock`、native Runtime artifacts、Provider cache / SQLite Extension、daemon lifecycle |
| [observability.md](design/observability.md) | `kgosd` 结构化日志、Access Logs、关键业务/安全事件、Request ID、进程内 Metrics、日志轮转与受保护的只读诊断 |
| [web.md](design/web.md) | 面向人的图谱优先界面、版本列表 / 覆盖式 DAG、独立查询结果帧、本体视图、草稿与连接交互、前端国际化与语言偏好、持久 UI / 可丢弃缓存及受控 API 方案；[功能材料与覆盖矩阵](design/web-materials.md)管理视觉材料，[一致样例](design/web-examples.md)只作非规范评审输入 |
| [decisions.md](design/decisions.md) | D1–D102 的决定、依据、备选和取舍，以及被替换架构记录 |
| [implementation.md](design/implementation.md) | 已确认设计的实现约束、readiness、projection/compiler/adapter mapping 与集成验收；不得维护阶段状态或重新定义产品语义 |

## 从配置到调用

| 要解决的问题 | 正文位置 |
| --- | --- |
| 当前 Docker 怎么发布和运行 | [Client Docker-only](design/client.md#docker-only-交付)、[MCP 部署](design/mcp.md#docker-only-交付)、[D99](design/decisions.md#d99-linux-amd64-docker-only-distribution) |
| 旧 v0.2.1 npm 如何定位 | [历史 npm 分发](design/client.md#npm-package-topology)、[历史 CLI](design/cli.md) |
| 第一次怎么定位并初始化 KG OS Instance | [CLI Global root](design/cli.md#global-root)、[Doctor](design/cli.md#doctor)、[Init](design/cli.md#init)、[Workspace Root / Instance](design/runtime.md#instance-root) |
| kgosd 怎么配置扩展、模型和凭证 | [Runtime config](design/runtime.md#configtoml)、[Embedding 配置映射](design/runtime.md#embedding-配置与索引映射) |
| 使用方怎么定义模型和索引 | [Ontology 公共格式](design/ontology.md#公共可编辑格式)、[完整编辑示例](design/ontology.md#编辑示例) |
| 调用方怎么保存正文和查询 | [Graph 合同](design/graph.md#graph-公共调用合同)、[CLI query](design/cli.md#query)、[CLI execute](design/cli.md#execute) |
| AI 如何通过 MCP / 私人 Plugin 预览知识库及执行受控 SDK | [MCP / Plugin 设计](design/mcp.md) |
| MCP 内的 AI 怎样获取 SDK 入参、出参、Cypher 25 语法及使用示例 | [MCP Tool / 批量文档目标](design/mcp.md#mcp-tool-help)、[D102](design/decisions.md#d102-mcp-tool-taxonomy-and-batch-docs)、[Phase 23](development/phases/23-mcp-tool-taxonomy-and-docs.md)；已实现的 `docs.read` 历史基线见 [D100](design/decisions.md#d100-mcp-self-describing-docs) / [Phase 22](development/phases/22-mcp-self-describing-docs.md)，更早 Help 见 [Phase 20](development/phases/20-mcp-tool-help.md) |
| KG OS 当前锁定哪个 Lithograph 版本，以及如何同步 MCP 手册 | [D101 v0.3.1 依赖升级](design/decisions.md#d101-lithograph-v031-upgrade)、[Graph](design/graph.md#graph)、[Phase 22](development/phases/22-mcp-self-describing-docs.md) |
| 人怎样浏览图谱、查询、编辑和管理版本 | [Web 设计](design/web.md)、[功能画板与覆盖](design/web-materials.md)、[一致评审样例](design/web-examples.md)；内置同源交付见 [Runtime](design/runtime.md#web-hosting) |
| Web 中英文如何识别、切换与管理文案 | [Web 国际化与语言偏好](design/web.md#国际化与语言偏好)、[Phase 14 P14-00](development/phases/14-web.md#a14-00-国际化基础与双语界面)；CLI locale 为独立合同，见 [CLI 国际化](design/cli.md#国际化) |
| 需要实现和验证什么 | [工程待办与验收](design/implementation.md) |
| Web 如何同时运行于浏览器和 ChatGPT | [Web 双入口](design/web.md#chatgpt-内嵌-webmcp-apps)、[MCP Apps UI 合同](design/mcp.md#chatgpt-mcp-apps-ui-合同)、[D96](design/decisions.md#d96-chatgpt-mcp-apps-web)、[Phase 18](development/phases/18-chatgpt-embedded-web.md) |
| KG OS 如何记录关键业务结果、追踪请求及查看运行指标 | [Observability](design/observability.md)、[D97](design/decisions.md#d97-kgos-observability)、[Phase 19](development/phases/19-observability.md) |
| 第一阶段怎么搭开发环境 | [开发路线](development/README.md)、[Phase 00 计划](development/phases/00-engineering-foundation.md)、[本地开发指南](guide/development.md) |

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | Ontology 渐进读取 / 聚合编辑、Object batch read / Patch、Knowledge / Graph、Evolution；Client 统一 TypeScript，Runtime / Kernel 保留 Go；未来只发布 Linux amd64 Docker（D99）；Workspace Root→`.kgos` 单 Instance、`--root > KGOS_ROOT`、完整 ready 的 `init`、单库/单 Token/每 Instance 最多一个 daemon，以及职责分层的高信息密度 CLI；具体规则见上面的 owner 表 |
| 当前实现基线 | Phase 00–13 已完成；当前公开版本 v0.2.1 已包含 D84 的 late-bound Embedding credential 与新版 init wizard/doctor 行为，并历史上继续包含 Phase 12 的真实 `@kgos/sdk` + TypeScript `@kgos/cli`、Workspace Root→`.kgos`、`--root > KGOS_ROOT`、complete init/readiness/recovery、per-instance dynamic `kgosd`、六平台 native Runtime packages、八包 npm 与 GitHub Release；这些是历史发布事实，之后仅发布 Docker。当前发布状态由[开发计划](development/README.md)与[Phase 13](development/phases/13-init-wizard-credential-boundary.md)维护；v0.2.0 历史基线见[Phase 12](development/phases/12-first-run-cli-productization.md) |
| 已确认调整 | [D59 Cypher passthrough](design/decisions.md#d59-cypher-passthrough)、[D65 Go runtime](design/decisions.md#d65-go-runtime)、[D66 Lithograph v0.3.0 SQL-only](design/decisions.md#d66-lithograph-v030-sql-only)、[D67–D74](design/decisions.md)、[D75 TypeScript Client](design/decisions.md#d75-typescript-client)、[D76 npm distribution](design/decisions.md#d76-npm-distribution)、[D77 explicit Instance Root](design/decisions.md#d77-explicit-instance-root)、[D78 operation-scoped Branch](design/decisions.md#d78-operation-scoped-branch)、[D79 stale daemon recovery](design/decisions.md#d79-stale-daemon-recovery)、[D80 official Jieba](design/decisions.md#d80-official-jieba)。D78–D80在不增加新业务能力的前提下收紧 Runtime connection/recovery 与默认 Full-text 行为；[D81](design/decisions.md#d81-workspace-root)、[D82](design/decisions.md#d82-init-readiness)、[D83](design/decisions.md#d83-cli-progressive-disclosure)进一步重做 Workspace/Instance、first-run readiness 与 CLI 信息设计；[D84](design/decisions.md#d84-late-bound-embedding-credential) 的 Embedding credential operation-time 解析与 init wizard 输入恢复边界已由 Phase 13 实现并验收 |
| 检索范围与限制 | [首版 Semantic 只支持单字段且不公开 filterProperties，Cypher 联合检索可组合；post-YIELD 过滤不等价于过滤范围内 top-k](design/ontology.md#语义索引的首版范围)；不把既有底层限制概括成联合检索不可用 |
| 工程待办 | Phase 00–13 已完成，Phase 14 Web `deferred`。[Phase 15](development/phases/15-mcp.md) 独立 TypeScript MCP / Private Plugin 基础连接已凭 Linux Dev、真实 ChatGPT 与 [CI Run #65](https://github.com/bYiyLi/kg-os/actions/runs/38261156640) 7/7 成功关闭为 `done`。原生 Go MCP、WASM Bridge 与统一单进程 Docker 归 [Phase 16](development/phases/16-kgosd-unified-mcp.md) `done` / D93–D94；长期 Dev 已切换为 Go `kgosd`，31/31 SDK、四 Tool 与隔离持久化通过，旧 TypeScript MCP / Node Worker 源码已清理。最终 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38353358947)、ChatGPT OAuth 重新授权/隔离写入回读与 Codex 私人 Skill 主动加载已通过。**[Phase 17 MCP/Web 统一认证](development/phases/17-mcp-web-authorization.md) 按用户批准例外关闭为 `done`：新版 Dev 主题/认证正式 Docker 部署、本地 `pnpm validate` 及用户 ChatGPT 重新授权成功；GitHub CI / 全新版隔离矩阵未执行，未宣称通过。** 正式 GHCR 发布与生产部署另行授权。 |
| MCP 设计 | [统一 Go MCP / Plugin 架构](design/mcp.md#部署与责任划分)、[Docker-only 交付与完整配置](design/mcp.md#部署交付与运行合同)、[统一 Instance / Web OAuth](design/mcp.md#统一-instance-认证与-web-内的-mcp-连接授权phase-17-目标)（[D95](design/decisions.md#d95-unified-mcp-web-authorization)）、[D102 五个 AI Tool + 批量 Docs](design/mcp.md#mcp-tool-help)、[Go/WASM Sandbox](design/mcp.md#javascript-sdk-执行)、[Ontology Overview](design/mcp.md#kgos_ontology_overview虚拟-markdown-文件)、[Commit Ancestry](design/mcp.md#kgos_commit_ancestrycommit-dag-markdown-历史)；[Phase 23](development/phases/23-mcp-tool-taxonomy-and-docs.md) 已由真实 MCP、隔离 Docker 和最终 CI 验收为 `done`，原四 Tool 仅属于旧版本历史。原生 MCP 架构见 [D93](design/decisions.md#d93-kgosd-unified-mcp)，Mac / OpenClaw / Docker CI 分工见 [D94](design/decisions.md#d94-openclaw-docker-development-and-ci) |
| Web 设计 | [图谱优先、覆盖式版本 DAG、独立查询结果帧与帧内检查器方向已认可](design/web.md#依据与状态)；原 State 重跑、Branch 前进仅提示刷新及 `.kgos` 下恢复 Web 数据已确认，首版按[本轮简化范围](design/web.md#信息架构与当前上下文)收敛；[国际化与语言偏好](design/web.md#国际化与语言偏好)的 English / 简体中文基础已在当前 Web 组件中实现、完成定向测试，Phase 14 P14-00 仍待正式打包与阶段验收；[当前接口与工程待办](design/web.md#当前能力与工程待办)区分已有能力和本轮持久化方案。其余业务页面仍为壳层，不代表动态业务验收完成；内置交付见 [Runtime](design/runtime.md#web-交互设计状态) |
| ChatGPT 内嵌 Web | [D96](design/decisions.md#d96-chatgpt-mcp-apps-web) 的单 Web 双入口与 MCP Apps 认证/资源合同已由 [Phase 18](development/phases/18-chatgpt-embedded-web.md) 实现并在 OpenClaw Dev 及用户真实 ChatGPT 两个入口验收；Phase 18 按用户批准的远端 CI 例外标记 `done`，对应 GitHub CI / 六平台矩阵未运行，不代表已通过。Phase 14 的业务页面仍然 `deferred`。 |
| 可观测性 | [D97](design/decisions.md#d97-kgos-observability) 与 [Observability 设计](design/observability.md) 拥有日志、关键业务事件、追踪与指标合同；[Phase 19](development/phases/19-observability.md) 已 `done`，Mac 全量质量、隔离 Docker、clean-source 长期 Dev 与 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38693436299) 均通过。 |

**已确认不等于已实现；未实现不等于未设计。** Lithograph 的 Phase / release 状态以 Lithograph 仓库为准，不在 KG OS 复制第二份完成状态。文档示例校验不能代替数据库、真实 loadable extension、SQL streaming 与 cancellation 集成测试。

## 阅读顺序

- 产品定义先读 [README](../README.md)，架构与存储边界读 [Architecture](design/architecture.md)。
- 按“配置 → 模型 → 调用”理解本次语义检索设计，使用上面的入口。
- 查询 / 写入的完整事务与错误边界分别读 [Object](design/object.md)、[Graph](design/graph.md)、[Evolution](design/evolution.md) 和 [公共合同](design/contracts.md)。
- 面向 ChatGPT / 通用 MCP Client 的受控 JavaScript、完整 Ontology 预览和私人 Plugin / Skill 方案读 [MCP](design/mcp.md)。
- 日志、业务事件、跨层请求关联及运行指标读 [Observability](design/observability.md)，具体实施与验收读 [Phase 19](development/phases/19-observability.md)。
- 人的图形阅读、查询结果帧、版本导航与前端编辑读 [Web](design/web.md)；按功能浏览 [Web 材料与覆盖矩阵](design/web-materials.md)，一致样例见 [Web 样例](design/web-examples.md)。
- 决策依据与被替换规则读 [Decisions](design/decisions.md)；历史条目的后续调整不与 owner 正文并行生效。
- 实现只能沿用对应 owner 已确认的规则；剩余 mapping / 验收由 [Implementation](design/implementation.md)记录。
- 开发顺序、阶段状态与完成证据读[开发计划](development/README.md)；安装和命令读[开发指南](guide/development.md)。
