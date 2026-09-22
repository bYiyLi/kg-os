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
- 面向 AI 提供 **CLI + Skill**，面向人提供 **Web**。

KG OS 独立于 Noven 或任何具体领域；领域语义由调用方表达。

## 使用模型

通过 **Ontology 全局概览 → 可选 Domain → Definition 详情**理解模型；已知 Ref 可以直接读取，也可以 batch 读取同一 State 下的一组模型。`--edit` 取得 canonical YAML，`kg ontology patch` 提交局部变化；跨 Ontology + Knowledge 的原子修改使用同一个 Object Patch。

Node / Relationship Definition 一起表达字段、约束和索引。单字段索引放在字段下，复合或跨 Definition 共享索引放在模型顶层；没有顶层索引时省略 `indexes`。Knowledge 保持 Property Graph。Graph 原样执行 Lithograph Cypher，`query` / `execute` 分别选择只读 / 读写连接，KG OS 不审查语句内容；Evolution 提供 State、Branch、History、Diff、Merge 的专用交互。

托管语义检索由 Lithograph 执行。KG OS 把全局 embedding / Provider cache 默认配置和 Ontology 的文本字段声明编译成 Semantic Index；调用方传普通查询字符串。KG OS 不生成内部向量 Property，不在保存或合并正文时调用模型，也不实现 text→Vector cache。OpenAI-compatible Provider 可以按 versioned `providerConfig.cache` 使用独立 SQLite cache database；默认路径位于 `$KG_HOME/cache/`，与 `kgos.db` 隔离。配置只支持可选 `api_key_env`，实际凭证不进入索引历史。

KG OS 的 `kgosd`、Kernel 与 `kg` CLI 使用 Go；SDK 与浏览器 Web 使用 TypeScript。**`kgosd` 自带 Web**：页面与 API 随同一个 daemon 交付、启动并使用同一端口，不需要单独部署 Web 服务；具体边界见 [运行架构](docs/design/architecture.md#v1-运行时与技术分层)和 [Web hosting](docs/design/runtime.md#web-hosting)。

一个 `KG_HOME`（默认 `~/.kgosd`）对应一个 `kgosd` 和根目录 `kgos.db`；所有 daemon API/control request 使用 Bearer authentication，CLI 从 `KG_TOKEN` 取得 credential。

配置、模型与调用示例，以及设计职责索引，统一从 [设计入口](docs/design.md)进入。本文只维护产品定义，具体配置、数据和接口规则由各 owner 文档维护。

## 当前状态

**KG OS 已切换到 Go 服务端/Kernel/CLI + TypeScript SDK/Web，并对齐 Lithograph v0.3.0 SQL-only integration；业务能力仍未实现。** 当前工作树已经建立新的 Go Phase 00 工程基线并清理旧 TypeScript daemon/kernel/CLI、`ffi-rs` SQLite host 与旧 v0.2.x runtime 尝试；Go/TypeScript/Web、本地 macOS arm64 的真实 Lithograph v0.3.0 smoke、质量门禁和 native artifact 已取得本地证据。

**Phase 00 已完成。** Go Engineering Foundation 实现提交 `b4046d3a9a9e8941e74ef0af93e47818b4e94dee` 已推送到 `main`，本地 macOS arm64 全量验收与 Ubuntu 24.04 x64 GitHub Actions run `35672012795` 均成功，Phase Review 与历史旧代码清理也已闭环。实际可执行的安装、Go/Web 开发、测试、构建与本地打包步骤见[开发指南](docs/guide/development.md)，完整验收证据与历史基线见[阶段计划](docs/development/phases/00-engineering-foundation.md)。

首版语义索引只支持单字段；Cypher 原样执行、`lithograph_rows()` true streaming、SQL-only execution 与 Provider-owned cache 的设计已记录。模型修改、批量 Patch、Merge 与新的 Go/Lithograph 接入仍需实现和验证；Web 具体页面交互尚未细化，不阻塞核心实现。检索范围、工程待办与 Web 设计状态见 [设计状态导航](docs/design.md#设计状态导航)，不把已确认决定继续列为待确认。

相关当前决定见 [D59 Cypher 原样执行](docs/design/decisions.md#d59-cypher-passthrough)、[D61 首版单字段语义索引](docs/design/decisions.md#d61-single-field-semantic)、[D65 Go runtime](docs/design/decisions.md#d65-go-runtime)和 [D66 Lithograph v0.3.0 SQL-only / Provider-owned cache](docs/design/decisions.md#d66-lithograph-v030-sql-only)。协作规则只在 [AGENTS.md](AGENTS.md) 维护。

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
- [开发计划](docs/development/README.md)：开发路线、阶段状态、共同完成条件与阶段入口。
- [Phase 00 计划](docs/development/phases/00-engineering-foundation.md)：工程基础的范围、Feature、验收项、Review 和证据。
- [开发指南](docs/guide/development.md)：安装、启动、调试、检查、测试、构建和本地打包。
- [行业与技术研究](docs/research/industry-landscape.md)：外部产品和技术调研记录。
