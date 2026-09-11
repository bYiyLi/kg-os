# KG OS

KG OS（Knowledge Graph Operating System）是**面向 AI 的可编程知识基础设施**，为 AI 提供一个长期、可编程、可操作的外部知识世界。

## 核心理念

> **一切皆可被定义。**

通过明确定义，让知识和关系能够被建模和操作。KG OS 不替调用方定义世界，而是提供定义和操作这个世界的基础设施。

## 核心边界

- **AI-first**：AI 是第一使用者，人主要负责查看、管理和纠正。
- **Graph-first**：知识以图结构组织；搜索、全文和向量能力属于访问与数据能力。
- **调用方定义 Model**：Kernel 不预定义领域节点、关系或知识语义。
- **Agent 在系统外部**：理解、提炼、分类、建模和决策由外部 Agent 与 Skill 完成。
- **KG OS 提供确定性基础设施**：负责存储、读取、图操作、查询、索引和管理。
- 面向 AI 提供 **CLI + Skill**，面向人提供 **Web**。

KG OS 独立于 Noven 或任何具体领域；领域语义由调用方表达。

## 当前状态

核心技术架构、Ontology / Knowledge 数据边界，以及 Object / Graph / Evolution 的产品语义和 transport-neutral 公共逻辑合同已经确认；剩余项主要是 Lithograph Schema projection 依赖、实现映射和各 adapter / Web 的工程设计，具体范围见[设计状态导航](docs/design.md#设计状态导航)。项目目前仍只有文档，没有业务实现；设计确认不代表功能已经实现或验证。

本 README 承载产品定义；`docs/design.md` 承载当前技术与数据设计，统一区分已确认设计、剩余依赖 / 工程合同与待实现工作。协作与评审规则集中在 `AGENTS.md`。其他文档只引用该设计真源，不重复维护一份技术选型或 Schema 规则。

## License

KG OS 采用双许可模式：

- **AGPL-3.0-only**：本仓库内容默认依据 [GNU Affero General Public License v3.0](LICENSE) 提供，除非具体文件或目录另有声明。AGPL 允许商业使用，但使用者必须遵守其许可义务，包括适用于通过网络向用户提供修改后软件的源码提供义务。
- **Commercial License**：无法或不希望按 AGPL 使用 KG OS 的组织，可以申请独立商业许可；商业条款仅通过单独书面协议授予，详见 [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)。

软件许可不自动授予对 **KG OS** 名称、Logo 或其它项目标识的商标权，也不得暗示未经授权的官方背书、合作或认可。

当前欢迎通过 GitHub Issues 提交 bug、设计反馈和其它讨论。为保留 AGPL + Commercial License 双许可能力，在 contributor licensing policy 正式建立前暂不接受外部代码或文档 Pull Request，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目资料

- [项目协作规范](AGENTS.md)：来源核对、设计评审、授权与验证规则。
- [背景](docs/background.md)：为什么会有 KG OS，以及方向如何形成。
- [设计](docs/design.md)：已确认规则、关键决策、剩余依赖与工程合同、工程实现待办。
- [行业与技术研究](docs/research/industry-landscape.md)：外部产品和技术调研记录。
