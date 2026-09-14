# KG OS 设计

本文是 KG OS 设计文档集的**总入口与职责索引**。产品定义见 [README](../README.md)，协作与评审规则见 [AGENTS](../AGENTS.md)。

KG OS 不再把全部设计维护在一个超大文件中。`docs/design/` 下的职责文件共同构成当前设计真源；**每个主题只有一个正文 owner**，本索引不复制详细设计。跨文档引用应链接到 owner 文件，不在其它文件重新维护同一规则。

## 设计职责

| 文档 | 唯一职责 |
| --- | --- |
| [architecture.md](design/architecture.md) | 核心理念、目标架构、Lithograph / SQLite 边界、Knowledge Base 与 bootstrap |
| [ontology.md](design/ontology.md) | Ontology、Definition、Domain、semantic graph、Binding Record / Schema Locator |
| [object.md](design/object.md) | Object Ref / Value、YAML / JSON representation、list/search/read/patch、Patch mutation semantics |
| [graph.md](design/graph.md) | Knowledge 数据模型、Graph query / execute、Cypher 与搜索边界 |
| [evolution.md](design/evolution.md) | State / State Data、Branch、Tag、History、Diff、Merge Session |
| [contracts.md](design/contracts.md) | 跨能力共享的公共错误合同 |
| [cli.md](design/cli.md) | `kg` AI-first CLI command tree、参数、stdin/file、JSON/raw body/streaming、错误与 exit code |
| [runtime.md](design/runtime.md) | `kgosd` configurable HTTP host/port、startup config、single-instance lock、daemon lifecycle、Web hosting、`~/.kgosd/` 配置/日志/数据目录 |
| [decisions.md](design/decisions.md) | D1–D45 的决定、依据、备选和取舍，以及被替换架构记录 |
| [implementation.md](design/implementation.md) | 实现 readiness、projection/compiler/adapter mapping 与工程实现顺序；不得重新定义产品语义 |

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | [架构](design/architecture.md)、[本地运行时](design/runtime.md)、[Ontology](design/ontology.md)、[Object](design/object.md)、[Knowledge / Graph](design/graph.md)、[Evolution](design/evolution.md)、[共享公共合同](design/contracts.md)、[`kg` CLI](design/cli.md)，以及这些规则对应的 [关键设计决定](design/decisions.md) |
| 工程剩余 | [工程映射与实现待办](design/implementation.md)；只包括 Lithograph readiness、Schema / `SHOW` → `structure` projection、Object Patch → Cypher statement planning、Merge conflict projection / candidate checker、HTTP route/lifecycle implementation、Knowledge Base target/layout，以及 CLI / SDK / Skill / Web adapter 实现 |
| 待实现 | [工程实现待办](design/implementation.md#工程实现待办)；实际实现依赖 Lithograph 对应公开能力已经可用 |

**已确认不等于已实现；未实现不等于未设计。** Lithograph 的当前实现状态只以 Lithograph 仓库为准，不在 KG OS 复制第二份 Phase 状态。

## 阅读顺序

- 要理解 KG OS 的整体边界，先读 [架构与 Knowledge Base](design/architecture.md)。
- 要理解 `kgosd` 如何在本机运行、Web/API endpoint 和 `~/.kgosd/`，读 [本地运行时](design/runtime.md)。
- 要理解知识模型和上层语义，读 [Ontology 与 Definition](design/ontology.md)。
- 要实现或评审公共能力，分别读 [Object](design/object.md)、[Knowledge 与 Graph](design/graph.md)、[Evolution](design/evolution.md) 与 [共享公共合同](design/contracts.md)。
- 要实现或使用 AI-facing command surface，读 [`kg` CLI](design/cli.md)；它只适配前述 logical contract。
- 要理解某项规则为什么这样设计，读 [关键设计决定](design/decisions.md)。
- 要推进实现，只在产品语义已经由 owner 文档确定后使用 [工程映射与实现待办](design/implementation.md)。
