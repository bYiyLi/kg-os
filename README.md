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
- **KG OS 提供确定性基础设施**：负责存储、读取、图操作、查询、索引和管理；SQLite Extension、Full-text analyzer 与 OpenAI-compatible Embeddings 都是运行时基础依赖，不是领域 Model 或 Agent。
- 面向 AI 提供 **MCP + Skill**，面向人提供 **Web**；历史 CLI 源码保留作内部开发与迁移参考，当前唯一发行形式为 Docker。

KG OS 独立于 Noven 或任何具体领域；领域语义由调用方表达。

## 使用模型

通过 **Ontology 全局概览 → 可选 Domain → Definition 详情**理解模型；已知 Ref 可以直接读取，也可以 batch 读取同一 State 下的一组模型。通过现有 API/MCP 取得 canonical YAML 并提交局部 Patch；跨 Ontology + Knowledge 的原子修改使用同一个 Object Patch。历史 `kg` CLI 语法由 [CLI 设计](docs/design/cli.md)保留。

Node / Relationship Definition 一起表达字段、约束和索引。单字段索引放在字段下，复合索引放在模型顶层；当前只有 Full-text / Managed Semantic 支持跨 Definition 共享 `targets`，Range / Text / Point 保持 Definition-local。没有顶层索引时省略 `indexes`。Knowledge 保持 Property Graph。Graph 原样执行 Lithograph Cypher，`query` / `execute` 分别选择只读 / 读写连接，KG OS 不审查语句内容；Evolution 提供 State、Branch、History、Diff、Merge 的专用交互。

托管语义检索由 Lithograph 执行。KG OS 把全局 embedding / Provider cache 配置和 Ontology 的文本字段声明编译成 Semantic Index；调用方传普通查询字符串。KG OS 不生成内部向量 Property，不在保存或合并正文时调用模型，也不实现 text→Vector cache。OpenAI-compatible Provider 可以按 versioned `providerConfig.cache` 使用独立 SQLite cache database，与 `kgos.db` 隔离。Embedding credential 只通过显式 `api_key_env` 字段引用环境变量，实际凭证不进入索引历史。

KG OS 的 `kgosd`、Kernel、Lithograph Host 和原生 MCP 使用 Go；浏览器 Web 与共享 HTTP `@kgos/sdk` 使用 TypeScript，历史 CLI 只保留内部开发用途。**单一 `kgosd` 进程提供 Web、HTTP API 和 MCP**，通过 QuickJS-NG/wazero 执行受控 SDK 脚本。服务、认证、SDK 和兼容性现状以 [架构](docs/design/architecture.md#v1-运行时与技术分层)、[Runtime](docs/design/runtime.md) 与 [MCP](docs/design/mcp.md) 为准；已退役的 Node MCP、旧四 Tool 和历史 npm 发布只保留对应阶段证据。

配置、模型与调用示例，以及设计职责索引，统一从 [设计入口](docs/design.md)进入。本文只维护产品定义，具体配置、数据和接口规则由各 owner 文档维护。

## 当前状态

**当前实现**：KG OS 已采用 Go `kgosd` 单进程承载 Web、API 和五个 AI-facing MCP Tool（另有 app-only 工作区 Tool），并通过 `kgos_docs` 为 AI 提供 SDK/Cypher/操作指南。底层 Ontology、Knowledge/Graph、Evolution、认证和原生扩展能力的实现及验收，按[开发计划](docs/development/README.md)和各 Phase 文件核实。

**当前交付**：新版本只面向 Linux amd64 Docker。当前源码的官方 Plugin 包含四个 Skill：Ontology 统一本体建模与知识世界选择（内含方法论、有条件案例及基础本体原件），Knowledge 统一检索、写入和维护，另有 VLog、Doctor；先前 v0.3.5 的七 Skill 结构保留在其历史发布中。用户的私人 Plugin 不随源码更新自动升级。私有 `kg-os` 维护源码，公开 [`kg-releases`](https://github.com/bYiyLi/kg-releases) 按发布版本分发运行时、Plugin、对应官方 Skill 和唯一安装手册；是否已经正式发行取决于实际 Release、许可门禁及 CI 结果。

当前源码的 Ontology Skill 随包提供 BFO、UFO、DOLCE、SUMO、GFO 的固定原始资料、实际收录范围及独立 KG OS 适配，由用户选择理论或自定义模型；子集不冒称完整理论。来源、许可及未覆盖部分见 [资料入口](plugins/kgos/skills/kgos-ontology-standards/references/foundations.md)。不再以独立官方业务模型仓库作为发现/同步入口；源码改造不修改现有模型或账户 Plugin。

**历史版本**：最后一组 npm / 六平台原生发行版本为 `v0.2.1`；相关提交、CI、发布及恢复证据由 [Phase 00–13 历史验收](docs/development/README.md)和对应阶段文件保存，不在产品 README 复制第二套阶段日志。新镜像的进度不能从历史 npm Release 推断。

首版语义索引只支持单字段；Go/Lithograph Runtime Host 的基础接入已经进入 Phase 01 完成基线。检索范围、Client迁移、工程待办与 Web 设计状态见 [设计状态导航](docs/design.md#设计状态导航)，不把已确认决定继续列为待确认。

当前有效设计、历次决定与替换关系均由 [设计职责导航](docs/design.md) 和 [Decisions 真源](docs/design/decisions.md)维护；协作规则仅在 [AGENTS.md](AGENTS.md)维护。

## 开发环境

源码真源在 Mac `/Users/yi/Code/KGOS`；Linux Docker 集成 Dev 环境经 `ssh openclaw` 连接，部署在 `/data/apps/KgosDev`。日常使用 `pnpm dev:mcp deploy`、`pnpm dev:mcp check` 和 `pnpm dev:mcp status`，并按 [远程开发环境](docs/guide/dev-environment.md) 的备份、回退与数据保护规则执行。Dev 运行成功不等于正式 GHCR/Plugin 已发布。

## License

KG OS 采用双许可模式：

- **AGPL-3.0-only**：本仓库内容默认依据 [GNU Affero General Public License v3.0](LICENSE) 提供，除非具体文件或目录另有声明。AGPL 允许商业使用，但使用者必须遵守其许可义务，包括适用于通过网络向用户提供修改后软件的源码提供义务。
- **Commercial License**：无法或不希望按 AGPL 使用 KG OS 的组织，可以申请独立商业许可；商业条款仅通过单独书面协议授予，详见 [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)。

软件许可不自动授予对 **KG OS** 名称、Logo 或其它项目标识的商标权，也不得暗示未经授权的官方背书、合作或认可。

随包本体原件及完整文本转换保留各自第三方许可，不由 KG OS 商业许可替代，详见 [第三方声明](plugins/kgos/skills/kgos-ontology-standards/references/third-party-notices.md)。

当前欢迎通过 GitHub Issues 提交 bug、设计反馈和其它讨论。为保留 AGPL + Commercial License 双许可能力，在 contributor licensing policy 正式建立前暂不接受外部代码或文档 Pull Request，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目资料

- [项目协作规范](AGENTS.md)：来源核对、设计评审、授权与验证规则。
- [背景](docs/background.md)：为什么会有 KG OS，以及方向如何形成。
- [设计](docs/design.md)：设计总入口与职责导航；详细规则按职责位于 `docs/design/`。
- [开发计划](docs/development/README.md)：开发路线、阶段状态、共同完成条件与阶段入口。
- [开发指南](docs/guide/development.md)：安装、启动、调试、检查、测试、构建和本地打包。
- [远程 Dev 环境](docs/guide/dev-environment.md)：固定 Linux Docker 开发部署、`dev:mcp` 管理命令、备份与回退边界。
- [行业与技术研究](docs/research/industry-landscape.md)：外部产品和技术调研记录。
