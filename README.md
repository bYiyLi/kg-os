# KG OS

KG OS（Knowledge Graph Operating System）是**面向 AI 的可编程知识基础设施**，为 AI 提供一个长期、可编程、可操作的外部知识世界。

## 核心理念

> **一切皆可被定义。**

通过明确定义，让知识和关系能够被建模和操作。KG OS 不替调用方定义世界，而是提供定义和操作这个世界的基础设施。

## 核心边界

- **AI-first**：AI 是第一使用者，人主要负责查看、管理和纠正。
- **Graph-first**：知识以图结构组织；搜索、全文和托管语义检索属于访问与数据能力。
- **调用方定义 Model**：Kernel 不预定义领域节点、关系或知识语义。
- **Agent 在系统外部**：理解、提炼、分类、建模和决策由外部 Agent 与 Skill 完成。
- **KG OS 提供确定性基础设施**：负责存储、读取、图操作、查询、索引和管理；Embedding Provider 是运行时基础依赖，不是 Agent。
- 面向 AI 提供 **CLI + Skill**，面向人提供 **Web**。

KG OS 独立于 Noven 或任何具体领域；领域语义由调用方表达。

## 使用模型

先通过 **Ontology 全局概览 → 可选 Domain → Definition 详情**理解模型；每个入口给出名称、业务说明与准确的下一步引用，不依赖 Ontology search。需要同时理解一组相关模型时，可以一次 batch 读取多个 Domain / Definition，并保证它们来自同一个 State。

需要修改时，`--edit` 可以一次取得一个或多个 Domain / Definition：单个返回 canonical YAML，多个返回标准 YAML multi-document stream；再用 `kg ontology patch` 提交局部变化。它只是统一 **Object Patch** 的 Ontology 专用入口；跨 Ontology + Knowledge 的原子修改仍可使用通用 Object Patch。一个 Node / Relationship Definition 一起表达 Property、约束和索引；KG OS 负责拆解为底层数据库操作，而不是要求 AI 分别编辑它们。索引的真实名字与作用范围直接可见，AI 可以继续用 Cypher 查询。

Knowledge 仍然是 Property Graph，查询和批量写入使用 Graph Cypher；State、Branch、History、Diff、Merge 使用 Evolution。不把知识库包装为虚拟文件系统。全文索引直接声明在业务字段上；语义向量索引只声明“哪些业务字段需要语义检索”。v1 的全局 embedding service 只支持 OpenAI-compatible Embeddings API，通过 `~/.kgosd/config.toml` 配置 `base_url / model / dimensions`，认证可用 `api_key` 或 `api_key_env`。查询时仍写原始 Lithograph `SEARCH`，只把对应参数标记为 `{"$semantic":"..."}`；KG OS 只预处理参数，不解析 Cypher。Vector 是 KG OS 托管 semantic search 的内部实现，不是 caller-owned Ontology / Knowledge Property 类型，也不进入公共 Object/Graph 结果。详细规则见 [Ontology 设计](docs/design/ontology.md)、[Graph](docs/design/graph.md) 与 [Runtime](docs/design/runtime.md)。

## 当前状态

KG OS 已确认上述 Ontology 交互与聚合编辑方向，以及 Object / Graph / Evolution 共享逻辑合同、Rust `kgosd` + TypeScript/npm client 架构、本地 HTTP runtime、显式 daemon lifecycle 与 Knowledge Base 全局 OpenAI-compatible Embeddings 配置。结构与版本数据库职责仍由独立的 Lithograph 承担，KG OS 保存自己的业务说明与组织语义并提供 compiler / decoder。

**项目目前仍只有文档，没有业务实现。** 命令是设计合同，不是已发布功能。剩余实现包括 Ontology reader、aggregate decoder/compiler、原子 Patch planning、Merge conflict projection、HTTP/runtime、CLI/Skill/SDK/Web；Knowledge Base target/layout 仍是独立待设计事项。范围与验收见 [设计状态导航](docs/design.md#设计状态导航) 和 [工程实现待办](docs/design/implementation.md)。

本 README 负责产品定义；`docs/design.md` 是导航，`docs/design/` 按职责维护唯一真源；协作规范在 `AGENTS.md`。2026-09-15 的 Ontology 基线修正见 [D46](docs/design/decisions.md#d46-ontology-交互基线修正2026-09-15)，batch read/edit 与 `kg ontology patch` 见 [D47](docs/design/decisions.md#d47-ontology-读取编辑支持-batch写入提供-scoped-patch2026-09-15)，全局 embedding 与托管语义向量见 [D48](docs/design/decisions.md#d48-embedding-provider-是-knowledge-base-基础配置语义向量由-kg-os-托管2026-09-15)，v1 不公开 caller-owned Vector 的边界见 [D49](docs/design/decisions.md#d49-kg-os-v1-不公开-caller-owned-vector-数据类型2026-09-16)，OpenAI-compatible provider/config 合同见 [D50](docs/design/decisions.md#d50-kg-os-v1-只支持-openai-compatible-embeddings-api2026-09-16)。

## License

KG OS 采用双许可模式：

- **AGPL-3.0-only**：本仓库内容默认依据 [GNU Affero General Public License v3.0](LICENSE) 提供，除非具体文件或目录另有声明。AGPL 允许商业使用，但使用者必须遵守其许可义务，包括适用于通过网络向用户提供修改后软件的源码提供义务。
- **Commercial License**：无法或不希望按 AGPL 使用 KG OS 的组织，可以申请独立商业许可；商业条款仅通过单独书面协议授予，详见 [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)。

软件许可不自动授予对 **KG OS** 名称、Logo 或其它项目标识的商标权，也不得暗示未经授权的官方背书、合作或认可。

当前欢迎通过 GitHub Issues 提交 bug、设计反馈和其它讨论。为保留 AGPL + Commercial License 双许可能力，在 contributor licensing policy 正式建立前暂不接受外部代码或文档 Pull Request，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目资料

- [项目协作规范](AGENTS.md)：来源核对、设计评审、授权与验证规则。
- [背景](docs/background.md)：为什么会有 KG OS，以及方向如何形成。
- [设计](docs/design.md)：设计总入口与职责导航；详细规则按职责位于 `docs/design/`。
- [行业与技术研究](docs/research/industry-landscape.md)：外部产品和技术调研记录。
