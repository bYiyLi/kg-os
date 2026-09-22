# KG OS 设计

本文是 KG OS 设计文档集的**总入口与职责索引**。产品定义见 [README](../README.md)，协作与评审规则见 [AGENTS](../AGENTS.md)。

开发阶段、状态与验收见[开发计划](development/README.md)，实际安装、启动、检查和打包命令见[开发指南](guide/development.md)。

KG OS 不再把全部设计维护在一个超大文件中。`docs/design/` 下的职责文件共同构成当前设计真源；**每个主题只有一个正文 owner**，本索引不复制详细设计。跨文档引用应链接到 owner 文件，不在其它文件重新维护同一规则。

## 设计职责

| 文档 | 唯一职责 |
| --- | --- |
| [architecture.md](design/architecture.md) | 核心理念、目标架构、Lithograph / SQLite 边界、Knowledge Base 与 bootstrap |
| [ontology.md](design/ontology.md) | Ontology 渐进读取、Domain/Definition 编辑聚合与字段、Constraint/Index 表达、semantic graph 与 Binding |
| [object.md](design/object.md) | 公共 aggregate/Knowledge Ref、共享 YAML/JSON、list/Knowledge search/read/统一 Patch |
| [graph.md](design/graph.md) | Knowledge 数据模型、Graph query / execute、Cypher 与搜索边界 |
| [evolution.md](design/evolution.md) | State / State Data、Branch、Tag、History、Diff、Merge Session |
| [contracts.md](design/contracts.md) | 跨能力共享的公共错误合同 |
| [cli.md](design/cli.md) | `kg` AI-first CLI command tree、参数、stdin/file、JSON/raw body/streaming、错误与 exit code |
| [runtime.md](design/runtime.md) | Go `kgosd`、内置 Web 与 HTTP、`KG_HOME` 单 Knowledge Base profile、`auth.json`/Bearer authentication、Provider-owned Embedding cache mapping、SQLite Extension source resolver、Full-text / Semantic Index 默认配置与 api_key_env、single-instance lock、daemon lifecycle 与 Web hosting |
| [decisions.md](design/decisions.md) | D1–D66 的决定、依据、备选和取舍，以及被替换架构记录 |
| [implementation.md](design/implementation.md) | 已确认设计的实现约束、readiness、projection/compiler/adapter mapping 与集成验收；不得维护阶段状态或重新定义产品语义 |

## 从配置到调用

| 要解决的问题 | 正文位置 |
| --- | --- |
| kgosd 怎么配置扩展、模型和凭证 | [Runtime 配置示例](design/runtime.md#configtoml)、[Embedding 配置映射](design/runtime.md#embedding-配置与索引映射) |
| 使用方怎么定义模型和索引 | [Ontology 公共格式](design/ontology.md#公共可编辑格式)、[完整编辑示例](design/ontology.md#编辑示例) |
| 调用方怎么保存正文和查询 | [Graph 合同](design/graph.md#graph-公共调用合同)、[CLI query](design/cli.md#query)、[CLI execute](design/cli.md#execute) |
| 需要实现和验证什么 | [工程待办与验收](design/implementation.md) |
| 第一阶段怎么搭开发环境 | [开发路线](development/README.md)、[Phase 00 计划](development/phases/00-engineering-foundation.md)、[本地开发指南](guide/development.md) |

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | Ontology 渐进读取 / 聚合编辑、Object Patch、Knowledge / Graph、Evolution、单 profile / 单库 / 单 Token runtime；具体规则见上面的 owner 表 |
| 当前实现基线 | Phase 00 Engineering Foundation 与 Phase 01 Runtime & Lithograph Host Foundation 均已完成；当前已具备 Go 工程基线、`KG_HOME` / config / credential、SQLite Extension resolver、Go/Lithograph v0.3.0 host、SQL buffered / true streaming / cancellation、Provider readiness/cache mapping、explicit transaction、single-instance lock 与进程 shutdown。阶段状态与完成证据由[开发计划](development/README.md)及对应 Phase 文件维护 |
| 已确认调整 | [D59 Cypher 原样执行 / 读写连接](design/decisions.md#d59-cypher-passthrough)、[D61 首版单字段语义索引](design/decisions.md#d61-single-field-semantic)、[D62 Ontology 不创建无字段类型](design/decisions.md#d62-nonempty-definition-properties)、[D65 Go runtime](design/decisions.md#d65-go-runtime)、[D66 Lithograph v0.3.0 SQL-only / Provider-owned cache](design/decisions.md#d66-lithograph-v030-sql-only)；D63 仅保留单 daemon 内置 Web 的交付边界，D60 的透明缓存目标由 D66 重新分配 ownership |
| 检索范围与限制 | [首版只支持单字段，Cypher 联合检索可组合；托管向量的 filterProperties 与过滤范围内 top-k 限制](design/ontology.md#语义索引的首版范围)；不把既有底层限制概括成联合检索不可用 |
| 工程待办 | 在已完成 Runtime Host 基础上继续实现 Knowledge Base bootstrap、Ontology / Object projection/read、Object Patch compiler、Graph 公共 HTTP surface、API/control Bearer middleware 与 daemon control/client lifecycle、Evolution / Merge 及完整 CLI / SDK / Web；具体复用边界与验收见[工程映射](design/implementation.md) |
| Web 待细化 | [kgosd 内置交付、同源服务与共享 Kernel 已定，具体页面布局和交互尚未展开](design/runtime.md#web-交互设计状态)；不阻塞 Kernel、daemon、CLI 或 SDK 的实现 |

**已确认不等于已实现；未实现不等于未设计。** Lithograph 的 Phase / release 状态以 Lithograph 仓库为准，不在 KG OS 复制第二份完成状态。文档示例校验不能代替数据库、真实 loadable extension、SQL streaming 与 cancellation 集成测试。

## 阅读顺序

- 产品定义先读 [README](../README.md)，架构与存储边界读 [Architecture](design/architecture.md)。
- 按“配置 → 模型 → 调用”理解本次语义检索设计，使用上面的入口。
- 查询 / 写入的完整事务与错误边界分别读 [Object](design/object.md)、[Graph](design/graph.md)、[Evolution](design/evolution.md) 和 [公共合同](design/contracts.md)。
- 决策依据与被替换规则读 [Decisions](design/decisions.md)；历史条目的后续调整不与 owner 正文并行生效。
- 实现只能沿用对应 owner 已确认的规则；剩余 mapping / 验收由 [Implementation](design/implementation.md)记录。
- 开发顺序、阶段状态与完成证据读[开发计划](development/README.md)；安装和命令读[开发指南](guide/development.md)。
