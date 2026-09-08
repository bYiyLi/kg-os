# KG OS 背景

本文只记录 **KG OS 为什么出现，以及方向如何形成**。当前产品定义见仓库根目录 `README.md`，当前技术与数据设计见 [design.md](design.md)；本文不作为 requirements 或 design 真源。

## 起点

KG OS 最初来自 Noven 的小说创作需求：AI 需要长期复用创作理论、经验、案例和参考资料。

继续讨论后发现，同样的问题也存在于软件开发、产品、运营等领域，因此目标从“给 Noven 做知识库”转向“给不同 AI 和不同领域提供通用知识基础设施”。

## 从 Human-first 到 AI-first

早期考察了 Obsidian、AFFiNE、SiYuan、TriliumNext、Tana、Logseq、Joplin 等人类知识管理产品。

它们的问题不在能力不足，而在主要工作流仍围绕人展开：人创建、分类、链接、整理和维护结构，AI 只是附加能力。

KG OS 因此转向 AI-first：AI 是第一使用者，人主要负责查看、管理和纠正。

## 从 Search-first 到 Graph-first

普通 RAG 往往把知识访问简化为：

```text
query → BM25 / Vector → top-k chunks → context
```

这种方式适合召回，但不足以表达“已经找到一个知识位置后，下一步如何继续探索”。

因此搜索更适合作为入口；Agent 还需要沿结构和关系渐进式探索、按需读取更具体的数据。

Tree 不需要成为独立 Kernel。Tree 可以视为带 Root 和主导航关系的受约束 Graph，因此底层方向统一为 Graph-first。

## 从固定知识对象到调用方 Model

小说知识、软件知识、代码结构和 Agent Memory 并不天然属于同一种对象。

因此没有继续固定 `KnowledgeNode`、`Experience`、`Document` 等领域对象，而是让调用方定义自己的 Model，KG OS 只提供基础设施能力。

## 从内置智能到外部 Agent

理解、提炼、分类、建模、判断关系和决定修改都属于认知决策。

这些职责最终被放在 KG OS 外部，由 Agent 与 Skill 完成；KG OS 本身提供确定性的存储、图操作、查询、索引和管理能力。

这也是 KG OS 与许多 Agent Memory 产品的重要边界差异。

## 早期已放弃的方向

- 把人类知识管理 App 作为 KG OS 本体。
- 把 Markdown-first 作为系统前提。
- 把 QMD / Vector Search 当成整个知识系统。
- 用固定 `KnowledgeNode` 统一所有领域知识。
- 在 KG OS 内部运行 Maintainer / Navigator Agent。

早期曾后置数据库选型、GraphRAG 和复杂 hybrid rerank，并非永久否定。后续已确认的选型与剩余设计范围以 [design.md](design.md) 为准，不沿用这里的早期阶段判断。

## 相关资料

- 当前产品定义：`README.md`
- 行业与技术研究：`docs/research/industry-landscape.md`
- 当前阶段与下一步：`HANDOFF.md`
