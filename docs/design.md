# KG OS 设计

本文是 KG OS 设计文档集的**总入口与职责索引**。产品定义见 [README](../README.md)，协作与评审规则见 [AGENTS](../AGENTS.md)。

开发阶段、状态与验收见[开发计划](development/README.md)，当前已实现版本的实际开发/验证命令见[开发指南](guide/development.md)。Phase 00–10 已完成；公开版本为 v0.1.1，八包、六平台 public-registry smoke 与 GitHub Release 已完成。Phase 11 的 Windows 首发认证收尾仍在进行，范围与证据见[Phase 11](development/phases/11-windows-runtime-acceptance.md)。official Jieba exact artifact选择与跨平台证据见[研究记录](research/jieba-tokenizer.md)。完成证据由开发计划与 Phase 文件维护。

KG OS 不再把全部设计维护在一个超大文件中。`docs/design/` 下的职责文件共同构成当前设计真源；**每个主题只有一个正文 owner**，本索引不复制详细设计。跨文档引用应链接到 owner 文件，不在其它文件重新维护同一规则。

## 设计职责

| 文档 | 唯一职责 |
| --- | --- |
| [architecture.md](design/architecture.md) | 核心理念、目标架构、Lithograph / SQLite 边界、Knowledge Base 与 bootstrap |
| [ontology.md](design/ontology.md) | Ontology 渐进读取、Domain/Definition 编辑聚合与字段、Constraint/Index 表达、semantic graph 与 Binding |
| [object.md](design/object.md) | 公共 aggregate/Knowledge Ref、共享 YAML/JSON、batch read 与统一 Patch |
| [graph.md](design/graph.md) | Knowledge 数据模型、Graph query / execute、Cypher 与搜索边界 |
| [evolution.md](design/evolution.md) | State / State Data、Branch、Tag、History、Diff、Merge Session |
| [contracts.md](design/contracts.md) | 跨能力共享的公共错误合同 |
| [client.md](design/client.md) | `@kgos/sdk`、`@kgos/cli`、npm/npx 分发、platform native Runtime package、Client version/package topology |
| [cli.md](design/cli.md) | AI-first CLI command tree、全局 `--root`、`doctor/init`、Runtime ensure、i18n、stdin/file、JSON/raw body/streaming、错误与 exit code |
| [runtime.md](design/runtime.md) | Go `kgosd`、Instance Root、内置 Web / HTTP、dynamic loopback endpoint、`auth.json` / `kgosd.lock`、native Runtime artifacts、Provider cache / SQLite Extension、daemon lifecycle |
| [decisions.md](design/decisions.md) | D1–D80 的决定、依据、备选和取舍，以及被替换架构记录 |
| [implementation.md](design/implementation.md) | 已确认设计的实现约束、readiness、projection/compiler/adapter mapping 与集成验收；不得维护阶段状态或重新定义产品语义 |

## 从配置到调用

| 要解决的问题 | 正文位置 |
| --- | --- |
| npm / npx 怎么分发 CLI 与 native Runtime | [Client npm package topology](design/client.md#npm-package-topology)、[Native Runtime package](design/runtime.md#native-runtime-package) |
| 第一次怎么定位并初始化 KG OS Instance | [CLI Global root](design/cli.md#global-root)、[Doctor](design/cli.md#doctor)、[Init](design/cli.md#init)、[Instance Root](design/runtime.md#instance-root) |
| kgosd 怎么配置扩展、模型和凭证 | [Runtime config](design/runtime.md#configtoml)、[Embedding 配置映射](design/runtime.md#embedding-配置与索引映射) |
| 使用方怎么定义模型和索引 | [Ontology 公共格式](design/ontology.md#公共可编辑格式)、[完整编辑示例](design/ontology.md#编辑示例) |
| 调用方怎么保存正文和查询 | [Graph 合同](design/graph.md#graph-公共调用合同)、[CLI query](design/cli.md#query)、[CLI execute](design/cli.md#execute) |
| 需要实现和验证什么 | [工程待办与验收](design/implementation.md) |
| 第一阶段怎么搭开发环境 | [开发路线](development/README.md)、[Phase 00 计划](development/phases/00-engineering-foundation.md)、[本地开发指南](guide/development.md) |

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | Ontology 渐进读取 / 聚合编辑、Object batch read / Patch、Knowledge / Graph、Evolution；Client 统一 TypeScript，Runtime / Kernel 保留 Go；npm/npx 分发；显式 Instance Root、单库、单 Token、每 root 最多一个 daemon；具体规则见上面的 owner 表 |
| 当前实现基线 | Phase 00–10 已完成；当前公开版本为 v0.1.1，包含真实 `@kgos/sdk` + TypeScript `@kgos/cli`、显式 `--root`、per-root dynamic `kgosd`、六平台 native Runtime packages、八包 npm 与 GitHub Release。Phase 11 首发认证收尾状态与完整完成证据由[开发计划](development/README.md)及[Phase 11](development/phases/11-windows-runtime-acceptance.md)维护 |
| 已确认调整 | [D59 Cypher passthrough](design/decisions.md#d59-cypher-passthrough)、[D65 Go runtime](design/decisions.md#d65-go-runtime)、[D66 Lithograph v0.3.0 SQL-only](design/decisions.md#d66-lithograph-v030-sql-only)、[D67–D74](design/decisions.md)、[D75 TypeScript Client](design/decisions.md#d75-typescript-client)、[D76 npm distribution](design/decisions.md#d76-npm-distribution)、[D77 explicit Instance Root](design/decisions.md#d77-explicit-instance-root)、[D78 operation-scoped Branch](design/decisions.md#d78-operation-scoped-branch)、[D79 stale daemon recovery](design/decisions.md#d79-stale-daemon-recovery)、[D80 official Jieba](design/decisions.md#d80-official-jieba)。D78–D80在不增加新业务能力的前提下收紧Runtime connection/recovery与默认Full-text行为 |
| 检索范围与限制 | [首版 Semantic 只支持单字段且不公开 filterProperties，Cypher 联合检索可组合；post-YIELD 过滤不等价于过滤范围内 top-k](design/ontology.md#语义索引的首版范围)；不把既有底层限制概括成联合检索不可用 |
| 工程待办 | [Phase 09 MVP Release Closure](development/phases/09-mvp-release-closure.md) 与 [Phase 10 Runtime & CLI Hardening](development/phases/10-runtime-cli-hardening.md) 均为 `done`。Web页面/Skill继续留在后续独立阶段。具体阶段顺序见[开发计划](development/README.md)，复用边界见[工程映射](design/implementation.md) |
| Web 待细化 | [kgosd 内置交付、同源服务与共享 Kernel 已定，具体页面布局和交互尚未展开](design/runtime.md#web-交互设计状态)；不阻塞 Kernel、daemon、CLI 或 SDK 的实现 |

**已确认不等于已实现；未实现不等于未设计。** Lithograph 的 Phase / release 状态以 Lithograph 仓库为准，不在 KG OS 复制第二份完成状态。文档示例校验不能代替数据库、真实 loadable extension、SQL streaming 与 cancellation 集成测试。

## 阅读顺序

- 产品定义先读 [README](../README.md)，架构与存储边界读 [Architecture](design/architecture.md)。
- 按“配置 → 模型 → 调用”理解本次语义检索设计，使用上面的入口。
- 查询 / 写入的完整事务与错误边界分别读 [Object](design/object.md)、[Graph](design/graph.md)、[Evolution](design/evolution.md) 和 [公共合同](design/contracts.md)。
- 决策依据与被替换规则读 [Decisions](design/decisions.md)；历史条目的后续调整不与 owner 正文并行生效。
- 实现只能沿用对应 owner 已确认的规则；剩余 mapping / 验收由 [Implementation](design/implementation.md)记录。
- 开发顺序、阶段状态与完成证据读[开发计划](development/README.md)；安装和命令读[开发指南](guide/development.md)。
