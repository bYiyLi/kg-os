# KG OS 行业与技术研究

本文整理 2026-09-06 前围绕 KG OS 调研的行业产品与技术结论。重点不是比较“哪个记忆产品最好”，而是拆解各产品真正的数据模型、索引模型、检索路径和 Agent 边界。

外部产品会快速变化。本文中的产品事实应以列出的官方来源为准，未来做设计决策前需要重新核对版本。

本文是研究记录，不作为 KG OS 的产品定义或设计真源；当前产品定义见仓库根目录 `README.md`。

下文概念图与研究建议反映调研时的认识，不是当前架构或开发任务清单；当前设计与后续工作以 [design.md](../design.md) 为准。

## 1. 行业技术的共同底座

目前主流 AI Memory / Knowledge / Context 产品在物理技术层高度收敛到几类能力。

### 1.1 Lexical Retrieval

常见技术：

- FTS；
- 倒排索引；
- BM25。

它适合名字、术语、ID、精确短语和明确出现过的文本。

### 1.2 Semantic Retrieval

常见技术：

- Embedding；
- Vector index；
- cosine similarity / ANN。

它主要解决“知道意思但不知道准确叫法”的候选发现。

### 1.3 Structural Navigation

常见结构：

- Graph；
- Tree / Hierarchy；
- Page Link Graph；
- Entity / Fact Graph；
- Symbol / Call Graph。

结构化导航适合 Agent 已经找到一个知识位置之后继续向邻居、父子节点、子图或来源下钻。

### 1.4 Fusion / Ranking

常见技术：

- RRF；
- Cross Encoder；
- MMR；
- graph distance；
- metadata / temporal filtering。

Hybrid Search 本质上是查询策略，不是知识数据模型。

### 1.5 Progressive Representation

另一个明显趋势是：同一信息会有多个粒度，而不是只有“原文 chunk”。例如：

```text
Raw Source
  ↓
Atomic Fact
  ↓
Summary / Scenario
  ↓
Higher-level Knowledge
```

或者：

```text
Document
  ↓
Page
  ↓
Section
  ↓
Raw Content
```

这是解决 Context 污染和 token 成本的关键能力之一。

## 2. 一个关键区分：Graph 到底是什么

不同产品都可能宣传 Knowledge Graph，但 Graph 在架构中的地位完全不同。

### Graph 作为 Truth Model

例如 Graphiti：

```text
Episode
Entity Node
Fact Edge
```

Entity 和 Fact 本身就是长期知识数据。BM25 和 Vector 只是帮助进入这张图的索引。

### Graph 作为 Retrieval Signal

另一些系统的真数据仍然是 Memory / Document，Graph 只用于扩展候选、关联实体或 rerank。

这种系统里 Graph 并不是“知识世界本身”，而是检索层的一条信号。

因此 KG OS 未来评价一个外部方案时，首先要问：

> **什么是真数据，什么只是派生索引？**

## 3. Hindsight

### 3.1 定位

Hindsight 是 Vectorize 开发的 Agent Memory 系统。它通过 `retain`、`recall`、`reflect` 等能力把原始输入转成结构化长期记忆，并在其上提供 Knowledge Base 和 Mental Model。

官方资料：

- [Hindsight README](https://github.com/vectorize-io/hindsight/blob/main/README.md)
- [Retain](https://docs.hindsight.vectorize.io/retain/)
- [Recall vs Reflect](https://hindsight.vectorize.io/blog/2026/07/24/recall-vs-reflect)
- [Knowledge Base MCP Tools](https://hindsight.vectorize.io/blog/2026/08/26/knowledge-base-mcp-tools)

### 3.2 核心对象

当前公开设计包含：

- World Facts；
- Experience Facts；
- Observations；
- Mental Models；
- Knowledge Pages。

`retain` 会在基础设施内部调用模型进行抽取、分类、实体归一和索引构建，因此 Hindsight 不是“只存调用方已经建模好的数据”的 dumb infra。

### 3.3 检索核心：TEMPR

Hindsight 的 recall 会并行运行四路检索：

```text
Semantic
Keyword / BM25
Graph
Temporal
      ↓
     RRF
      ↓
Cross Encoder
      ↓
Results
```

官方实现文档把这套多策略检索称为 TEMPR。

来源：

- [Developer index / TEMPR](https://github.com/vectorize-io/hindsight/blob/main/skills/hindsight-docs/references/developer/index.md)
- [Configuration](https://github.com/vectorize-io/hindsight/blob/main/skills/hindsight-docs/references/developer/configuration.md)

这说明 Hindsight 的技术核心更接近：

> **Memory Units + 多维关联 + 多路检索 + Consolidation**

而不是纯 Graph-first 数据系统。

### 3.4 Knowledge Base Tree

2026 年 Hindsight 把 Knowledge Base 正式暴露为 MCP surface，提供：

- `get_knowledge_base_tree`；
- `search_knowledge_base`；
- `get_knowledge_page`；
- 创建、更新、删除 folder/page 的操作。

它刻意不通过 MCP 暴露整个 Knowledge Base 的一次性 export，因为整库 Markdown 不适合直接进入 Agent context。

这非常符合 KG OS 的“渐进式读取”问题意识。

但要注意：Hindsight 的 Tree/Page 位于 Memory 之上，更像一个 materialized human-readable knowledge view，而不是底层 Memory 的唯一数据结构。

### 3.5 对 KG OS 的价值

最值得借鉴：

- Agent-facing 的 tree/page 渐进式接口；
- 明确区分 retrieve 和 reason；
- 多路检索融合；
- 限制整库一次性进入 Context。

不适合直接照搬：

- 基础设施内部自动理解和提炼输入；
- `reflect` 这类内置 agentic reasoning；
- 把 Memory 类型和认知层级固定成产品内置语义。

## 4. Graphiti / Zep

### 4.1 定位

Graphiti 是 Zep 的开源 temporal knowledge graph 框架；Zep 是基于 Context Graph 提供的商业产品与托管平台。

官方资料：

- [Graphiti Welcome](https://help.getzep.com/graphiti/getting-started/welcome)
- [How Graph Creation Works](https://help.getzep.com/how-graph-creation-works)
- [Adding Episodes](https://help.getzep.com/graphiti/core-concepts/adding-episodes)
- [Graphiti MCP Server](https://help.getzep.com/graphiti/getting-started/mcp-server)
- [2026-08-11 Graph Navigation](https://help.getzep.com/changelog/2026/8/11)

### 4.2 核心数据模型

Graphiti 的核心非常明确：

```text
Episode
= 原始输入 / 原始证据

Entity Node
= 实体

Fact Edge
= 实体之间的事实或关系
```

Episode 自己也是图节点。摄取时识别出的 Entity 会通过 `MENTIONS` 等关系与 Episode 连接，因此来源追溯是数据模型的一部分。

### 4.3 Temporal 是模型的一部分

Graphiti 的重要差异是时间不只是 `updated_at`。

它区分知识进入系统的时间和事实在现实中成立的时间，并允许旧 Fact 失效而不必物理删除历史。

这使它特别适合表达：

- 用户偏好发生变化；
- 组织关系发生变化；
- 某条经验被后来的认识取代；
- 需要回答“当时是什么状态”。

### 4.4 Graph-first + Search as Entry

Graphiti 本质上是 Graph-first：Graph 是真数据。

但 Agent 不一定知道入口 Node，因此仍然需要：

- semantic search；
- keyword / hybrid search；
- graph-based retrieval。

Zep 在 2026-08 新增了直接 graph navigation endpoint，包括：

- neighbors；
- bounded multi-hop subgraph；
- episodes；
- incoming / outgoing / both traversal。

这与 KG OS 的一个核心直觉一致：

> 搜索负责找到入口，Graph 负责继续探索。

### 4.5 对 KG OS 的价值

最值得借鉴：

- Source / Episode 是一等对象；
- Node / Edge 作为真实知识模型；
- provenance；
- temporal evolution；
- 已知节点后的 neighbors/subgraph 导航。

不适合直接照搬：

- Episode 摄取后由内部 LLM 自动抽实体、关系和时间；
- 固定采用 Entity + Fact triple 作为所有领域的统一知识世界。

KG OS 当前更倾向让调用方自己定义 Model，而不是把 Graphiti 的 ontology 作为内核语义。

## 5. TencentDB Agent Memory

### 5.1 定位

TencentDB Agent Memory 2.0 把 Agent 的长期资产分成多类，而不是只做聊天 Memory。

官方 2.0 公开的四类资产：

- Chat Memory；
- Skill；
- Wiki；
- CodeGraph。

来源：

- [CHANGELOG](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/feat/server_team/CHANGELOG.md)
- [Releases](https://github.com/TencentCloud/TencentDB-Agent-Memory/releases)
- [MemoryProxy](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/feat/server_team/MemoryProxy/README.md)

### 5.2 最重要的思想：不同知识类型用不同表示

TencentDB Agent Memory 没有强迫所有数据进入同一个万能 Graph。

它大致采用：

```text
Conversation
→ 分层 Memory

Document
→ Wiki / Page / Link Graph

Code
→ Symbol / Call Graph

Procedure
→ Skill Asset
```

这给 KG OS 一个很重要的启发：

> 真正需要统一的可能是访问与扩展模型，而不是把所有领域对象统一成一个固定 `KnowledgeNode`。

### 5.3 L0-L3 Progressive Memory

TencentDB 的 Chat Memory 会逐层形成：

```text
L0 原始记录
  ↓
L1 事实 / Atom
  ↓
L2 场景 / Agent Profile
  ↓
L3 长期 / Team / Global
```

具体层级名称会随产品版本和模块不同有所变化，但核心思路是：先给 Agent 粗粒度、高价值背景，需要细节时再向 L1/L0 下钻。

MemoryProxy 当前文档也明确区分 L0-L3 的注入和按需 recall 路径。

### 5.4 Wiki / CodeGraph

Wiki 表达结构化页面与链接图；CodeGraph 表达文件、符号、调用和影响路径。

这两种模型说明：

- 文档知识适合 Page Graph；
- 代码天然适合 Symbol Graph；
- 不需要为了“统一”把它们压扁成同一种 chunk store。

### 5.5 Agent 边界

TencentDB Agent Memory 的 MemoryCore 不等于一个 Agent Runtime，但整个系统仍然大量使用 LLM 做自动提炼、Wiki 生成、Skill 提取和 Memory consolidation。

因此它比 Hindsight 更像“长期资产基础设施平台”，但仍然比 KG OS 当前边界更主动。

### 5.6 对 KG OS 的价值

最值得借鉴：

- heterogeneous knowledge representation；
- progressive disclosure；
- 不整库注入 Agent context；
- 不同长期资产拥有不同结构；
- Agent 与资产基础设施分层。

不适合直接照搬：

- 系统内部自动做 L0→L3 提炼；
- 内建 Skill extraction / Wiki generation 等 LLM 行为；
- 当前团队、ACL、Proxy 等完整平台能力对 KG OS v1 明显过重。

## 6. 三个产品放在一起看

| 维度 | Hindsight | Graphiti / Zep | TencentDB Agent Memory |
| --- | --- | --- | --- |
| 核心定位 | Agent Memory Intelligence | Temporal Context Graph | Agent Long-term Asset Platform |
| 真数据核心 | Facts / Memories / Observations | Episode / Entity / Fact Edge | 多种 Asset，各自不同模型 |
| Graph 地位 | 重要检索/关联结构 | **核心 Truth Model** | 按资产类型决定 |
| FTS/BM25 | 核心 recall lane | 入口与 hybrid search | Memory/Wiki 等按需使用 |
| Vector | 核心 recall lane | 入口与 hybrid search | 可选/按资产使用 |
| Progressive | Mental Model / KB Page | Graph → source / episode | **L0-L3 + Wiki/CodeGraph** |
| 内部 LLM | 很多 | 摄取建图时使用 | 很多 |
| 是否托管完整 Agent | reflect 有 agentic reasoning | 不托管 Agent loop | Core 不托管 Agent，但有 Proxy/AI processing |
| KG OS 最值得学 | Agent-facing progressive API | 数据模型、provenance、temporal | heterogeneous asset + progressive architecture |

## 7. 对 KG OS 的研究启发

以下用于帮助提出设计问题，不自动构成 KG OS 的已确认设计。

### 7.1 底层检索技术不是主要差异

Graph、BM25、Vector、Hybrid/Rerank 都已有大量成熟实现。

KG OS 不应靠“也支持向量检索”来定义产品。

### 7.2 真正差异是 Modeling

行业差异主要来自：

- 什么对象是一等数据；
- Graph 是真模型还是派生索引；
- 一个对象如何关联来源；
- 历史是否可追溯；
- 数据是否存在多个粒度；
- Agent 如何渐进探索；
- 不同领域是否允许不同模型。

### 7.3 调研时形成的产品边界理解

当时用以下概念图对比 KG OS 与上述产品；它不是最终组件架构：

```text
External Agent
  │
  ├── 理解输入
  ├── 提炼内容
  ├── 选择 Model
  ├── 决定关系
  └── 决定修改
       │
       ▼
KG OS Infrastructure
  │
  ├── Graph
  ├── Model
  ├── Data Capability
  ├── Query
  ├── Extension
  └── Storage
```

也就是说，KG OS 不争夺“理解知识”的权力，而是为外部 Agent 提供一个可编程、可导航、可扩展的数据世界。

## 8. 其它已经调研过的方向

讨论过程中还接触过以下产品或类别：

- Mem0；
- Supermemory；
- Neo4j Agent Memory；
- Cognee；
- MemOS；
- Redis Agent Memory / Iris；
- Weaviate Engram；
- AWS AgentCore Memory；
- Google Memory Bank；
- QMD；
- PageIndex；
- Microsoft GraphRAG。

这些产品提供了 Memory CRUD、知识演化、Graph-native API、Memory OS、多层摘要或 reasoning-based retrieval 等不同参考，但目前没有形成比 Hindsight、Graphiti/Zep、TencentDB Agent Memory 更直接影响 KG OS 核心边界的结论。

如果后续某个具体设计问题涉及这些产品，应重新做针对性检索，而不是仅凭本次会话中的旧结论继续设计。

## 9. 按需研究线索

以下仅为研究线索，不构成开发顺序或扩展机制的实现要求。先核对当前设计真源，只有具体问题仍未解决时才按需研究，不因本节再次开启已确认的设计：

- 设计 `Model` 时，对比 property graph schema、ontology、typed graph 等方案；
- 设计 Field Capability 时，对比搜索/索引系统如何声明字段能力；
- 设计 Extension 时，对比数据库 extension、plugin runtime、capability registry；
- 设计 progressive navigation 时，对比 Hindsight KB、Zep neighbors/subgraph、PageIndex；
- 设计 provenance/temporal 时，再深入 Graphiti。

这样外部研究才能直接服务于产品设计，而不是把 KG OS 变成现有 Memory 产品的拼装。
