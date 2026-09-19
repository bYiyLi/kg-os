# KG OS 设计

本文是 KG OS 设计文档集的**总入口与职责索引**。产品定义见 [README](../README.md)，协作与评审规则见 [AGENTS](../AGENTS.md)。

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
| [runtime.md](design/runtime.md) | `kgosd` HTTP、`KG_HOME` 单 Knowledge Base profile、`auth.json`/Bearer authentication、Lithograph Embedding cache policy、SQLite Extension source resolver、Full-text / Semantic Index 默认配置与 api_key_env、single-instance lock、daemon lifecycle 与 Web hosting |
| [decisions.md](design/decisions.md) | D1–D62 的决定、依据、备选和取舍，以及被替换架构记录 |
| [implementation.md](design/implementation.md) | 实现 readiness、projection/compiler/adapter mapping 与工程实现顺序；不得重新定义产品语义 |

## 从配置到调用

| 要解决的问题 | 正文位置 |
| --- | --- |
| kgosd 怎么配置扩展、模型和凭证 | [Runtime 配置示例](design/runtime.md#configtoml)、[Embedding 配置映射](design/runtime.md#embedding-配置与索引映射) |
| 使用方怎么定义模型和索引 | [Ontology 公共格式](design/ontology.md#公共可编辑格式)、[完整编辑示例](design/ontology.md#编辑示例) |
| 调用方怎么保存正文和查询 | [Graph 合同](design/graph.md#graph-公共调用合同)、[CLI query](design/cli.md#query)、[CLI execute](design/cli.md#execute) |
| 需要实现和验证什么 | [工程待办与验收](design/implementation.md) |

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | Ontology 渐进读取 / 聚合编辑、Object Patch、Knowledge / Graph、Evolution、单 profile / 单库 / 单 Token runtime；具体规则见上面的 owner 表 |
| 已确认调整 | [D59 Cypher 原样执行 / 读写连接](design/decisions.md#d59-cypher-passthrough)、[D60 内部自动填充缓存](design/decisions.md#d60-automatic-embedding-cache)、[D61 首版单字段语义索引](design/decisions.md#d61-single-field-semantic)、[D62 Ontology 不创建无字段类型](design/decisions.md#d62-nonempty-definition-properties)；D57 的托管职责 / api_key_env 与 D58 的可选顶层 indexes 保留 |
| 检索范围与限制 | [首版只支持单字段，Cypher 联合检索可组合；托管向量的 filterProperties 与过滤范围内 top-k 限制](design/ontology.md#语义索引的首版范围)；不把既有底层限制概括成联合检索不可用 |
| 工程待办 | [模型修改、批量 Patch、Merge 与 adapter 的实现和验证](design/implementation.md#剩余依赖与工程合同)；[只读连接、自动持久缓存、Native 上下文与真实 ABI 集成](design/implementation.md#managed-semantic-integration-readiness)；已有目标行为，无需重新确认核心设计 |
| Web 待细化 | [同源服务与共享 Kernel 已定，具体页面布局和交互尚未展开](design/runtime.md#web-交互设计状态)；不阻塞 Kernel、daemon、CLI 或 SDK 的实现 |
| 待实现 | KG OS 当前仍只有文档；[实现待办](design/implementation.md#工程实现待办)不是已发布能力 |

**已确认不等于已实现；未实现不等于未设计。** Lithograph 的 Phase / release 状态以 Lithograph 仓库为准，不在 KG OS 复制第二份完成状态。文档示例校验不能代替数据库与真实 ABI 测试。

## 阅读顺序

- 产品定义先读 [README](../README.md)，架构与存储边界读 [Architecture](design/architecture.md)。
- 按“配置 → 模型 → 调用”理解本次语义检索设计，使用上面的入口。
- 查询 / 写入的完整事务与错误边界分别读 [Object](design/object.md)、[Graph](design/graph.md)、[Evolution](design/evolution.md) 和 [公共合同](design/contracts.md)。
- 决策依据与被替换规则读 [Decisions](design/decisions.md)；历史条目的后续调整不与 owner 正文并行生效。
- 实现只能沿用对应 owner 已确认的规则；剩余 mapping / 验收由 [Implementation](design/implementation.md)记录。
