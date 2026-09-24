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

Node / Relationship Definition 一起表达字段、约束和索引。单字段索引放在字段下，复合索引放在模型顶层；当前只有 Full-text / Managed Semantic 支持跨 Definition 共享 `targets`，Range / Text / Point 保持 Definition-local。没有顶层索引时省略 `indexes`。Knowledge 保持 Property Graph。Graph 原样执行 Lithograph Cypher，`query` / `execute` 分别选择只读 / 读写连接，KG OS 不审查语句内容；Evolution 提供 State、Branch、History、Diff、Merge 的专用交互。

托管语义检索由 Lithograph 执行。KG OS 把全局 embedding / Provider cache 配置和 Ontology 的文本字段声明编译成 Semantic Index；调用方传普通查询字符串。KG OS 不生成内部向量 Property，不在保存或合并正文时调用模型，也不实现 text→Vector cache。OpenAI-compatible Provider 可以按 versioned `providerConfig.cache` 使用独立 SQLite cache database，与 `kgos.db` 隔离。Embedding credential 只通过显式 `api_key_env` 字段引用环境变量，实际凭证不进入索引历史。

KG OS 的 `kgosd`、Kernel 与 `kg` CLI 使用 Go；SDK 与浏览器 Web 使用 TypeScript。**`kgosd` 自带 Web**：页面与 API 随同一个 daemon 交付、启动并使用同一端口，不需要单独部署 Web 服务；具体边界见 [运行架构](docs/design/architecture.md#v1-运行时与技术分层)和 [Web hosting](docs/design/runtime.md#web-hosting)。

一个 `KG_HOME`（默认 `~/.kgosd`）对应一个 `kgosd` 和根目录 `kgos.db`；所有 daemon API request 使用 Bearer authentication。本机 CLI 显式 `KG_TOKEN` 优先，否则使用当前 profile 的 `auth.json`。首次安装通过 `kg doctor` + `kg install` 完成，业务命令自动确保本地 Runtime 可用。

配置、模型与调用示例，以及设计职责索引，统一从 [设计入口](docs/design.md)进入。本文只维护产品定义，具体配置、数据和接口规则由各 owner 文档维护。

## 当前状态

**KG OS 已切换到 Go 服务端/Kernel/CLI + TypeScript SDK/Web，并对齐 Lithograph v0.3.0 SQL-only integration；Phase 00–07 均已完成。** 当前 `main` 已实现 Ontology、General Object Read & Patch、Graph Query & Execute、Evolution Core 与 Evolution Merge Session；Merge 直接复用 Lithograph v0.3.0 durable Session / revision CAS / candidate read / finalize，不建立第二套 Merge workspace。

**Phase 00 已完成。** Go Engineering Foundation 实现提交 `b4046d3a9a9e8941e74ef0af93e47818b4e94dee` 已推送到 `main`，本地 macOS arm64 全量验收与 Ubuntu 24.04 x64 GitHub Actions run `35672012795` 均成功，Phase Review 与历史旧代码清理也已闭环。实际可执行的安装、Go/Web 开发、测试、构建与本地打包步骤见[开发指南](docs/guide/development.md)，完整验收证据与历史基线见[阶段计划](docs/development/phases/00-engineering-foundation.md)。

**Phase 01 已完成。** Runtime & Lithograph Host 实现提交 `f7f679e0601c7ecd16f5409f58c9c3483796948f` 已推送到 `main`，本地完整 validation / fresh-source validation 与 Ubuntu 24.04 x64 GitHub Actions run `35687991251` 均成功；P1-01–P1-10 和 Phase Review 已闭环。

**Phase 02 Ontology 当前为 `done`。** Knowledge Base bootstrap、KG OS Internal Graph / Binding、Ontology read/edit/Patch、Schema/Constraint/Index compiler、authenticated HTTP 与正式 `kg ontology` CLI均已实现；P2-01–P2-12 全部取得真实验收证据。实现提交 `8e776043337bcda24a271f84af1c04fc0da515cc` 已推送到 `main`，主工作树完整 `pnpm validate`、独立 fresh-source setup + full validation、forced pre-commit、final diff/review 与真实 Lithograph v0.3.0 native suite均已通过，Ubuntu 24.04 x64 GitHub Actions run `35804756510` / Validate job `107002937680` 成功。Knowledge Object、Graph 与 Evolution Core 后续已分别在 Phase 04 / 05 / 06 完成；SDK/Web/Skill仍在后续。

**Phase 03 Installation & Runtime Onboarding 当前为 `done`。** `kg doctor -> kg install -> kg ontology ...` 首次流程、正式 package artifact discovery/integrity、完整显式配置、中英文交互、本机 credential fallback 与并发安全的 Runtime auto-start 已实现并完成本地/远端验收。实现提交 `c15a6c062ea457c7a72c90a59f46b77b4ae5c053` 已推送到 `main`；最终主工作树 validation、独立 fresh-source、真实 PTY、真实 Lithograph 首次/并发 auto-start 与 Ubuntu 24.04 x64 GitHub Actions run `35834430037` / Validate job `107094383436` 均成功。

**Phase 04 General Object Read & Patch 当前为 `done`。** 通用 Object surface 只保留 batch `read` 与 batch `patch`：一次 read 接受 1..100 个明确 Ref并固定同一 State；CLI支持 positional text、refs file与stdin；一个 Git Extended Diff可原子修改多个 Ontology / Knowledge Object，并支持 inline patch、patch file与stdin。实现提交 `d1b4d8ccd792d009496596141520e0a930ae9ef3` 已推送到 `main`；主树和独立 fresh-source `pnpm validate` 均通过，Go statement coverage **90.2%**、jscpd 0 clones，Ubuntu 24.04 x64 GitHub Actions run `35870467442` / Validate job `107212896176` 成功。

**Phase 05 Graph Query & Execute 当前为 `done`。** `kg graph query` / `kg graph execute`、authenticated Graph HTTP、non-stream JSON、真正增量 NDJSON、Full-text / Semantic / Lithograph JSON passthrough、Runtime auto-start、client disconnect / daemon shutdown / transaction partial-durability 等实现与 Review 已闭环。实现提交 `324fa67358ca6c2cbdc558ac8df6f60bf64bfaf7` 已推送到 `main`；主工作树与独立 fresh-source `pnpm validate` 均通过，Go statement coverage 为 **90.0%**、jscpd 为 0 clones，Ubuntu 24.04 x64 GitHub Actions run `35893218908` / Validate job `107290569875` 成功；完整证据见[阶段计划](docs/development/phases/05-graph.md)。

**Phase 06 Evolution Core 当前为 `done`。** State / State Data、Branch / Tag、Overview / Get / Ancestry、History / Diff、authenticated HTTP 与正式 `kg evolution` Core CLI 已完成实现与 Review。实现提交 `2c2f4cb914a45b7a09d719a88008f0b5dc854df9` 已推送到 `main`；主工作树完整 `pnpm validate` 与独立 fresh-source `pnpm run setup && pnpm validate` 均通过，Go statement coverage **90.0%**、jscpd 0 clones，真实 bundled Lithograph v0.3.0、daemon 与 CLI E2E 均成功；Ubuntu 24.04 x64 GitHub Actions run `35951315990` / Validate job `107480271083` 成功。Merge Session 明确不属于本阶段。完整范围和 Acceptance 见[阶段计划](docs/development/phases/06-evolution-core.md)。

**Phase 07 Evolution Merge Session 当前为 `done`。** `merge start/list/get/conflicts/resolve/finalize/abort`、公共 conflict 双向投影、exact-revision candidate consistency validation、authenticated HTTP 与正式 `kg evolution merge` CLI 已完成实现与多轮 Review hardening。实现提交 `bd31b748359f85ae95cca919c7deffb62f3c7a0c` 已推送到 `main`；主工作树完整 `pnpm validate` 与独立 fresh Git checkout 的 `pnpm run setup && pnpm validate` 均通过，Go statement coverage **90.1%**、race、govulncheck、Playwright、真实 Lithograph v0.3.0 native suite、package/license/audit/diff gates 全绿。Review 已闭环 aggregate Property path、Definition rename continuity、shared Index 单侧展示 Ref、末页 conflict cursor、CLI resolutions strict JSON 与 explicit null/absence JSON contract 等边界；Ubuntu 24.04 x64 GitHub Actions run `35982570257` / Validate job `107577711342` 成功。完整范围和 Acceptance 见[阶段计划](docs/development/phases/07-evolution-merge.md)。

首版语义索引只支持单字段；Go/Lithograph Runtime Host 的基础接入已经进入 Phase 01 完成基线。检索范围、工程待办与 Web 设计状态见 [设计状态导航](docs/design.md#设计状态导航)，不把已确认决定继续列为待确认。

相关当前决定见 [D59 Cypher 原样执行](docs/design/decisions.md#d59-cypher-passthrough)、[D61 首版单字段语义索引](docs/design/decisions.md#d61-single-field-semantic)、[D65 Go runtime](docs/design/decisions.md#d65-go-runtime)、[D66 Lithograph v0.3.0 SQL-only / Provider-owned cache](docs/design/decisions.md#d66-lithograph-v030-sql-only)、[D67 Ontology Index profile](docs/design/decisions.md#d67-ontology-index-profile)、[D68 reserved Ontology Schema](docs/design/decisions.md#d68-reserved-ontology-schema)、[D69 Ontology Constraint profile](docs/design/decisions.md#d69-ontology-constraint-profile)、[D70 bootstrap orphan-history boundary](docs/design/decisions.md#d70-bootstrap-orphan-history)、[D71 generated Constraint identity](docs/design/decisions.md#d71-lithograph-generated-constraint-identity)、[D72 Local install / Runtime onboarding](docs/design/decisions.md#d72-local-install-runtime-onboarding)、[D73 Object batch read / patch surface](docs/design/decisions.md#d73-object-read-patch-surface) 与 [D74 Evolution state.create writer boundary](docs/design/decisions.md#d74-evolution-state-create-writer-boundary)。协作规则只在 [AGENTS.md](AGENTS.md) 维护。

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
- [Phase 01 计划](docs/development/phases/01-runtime-lithograph-host.md)：本地 Runtime / Lithograph Host 的范围、Feature、验收与当前状态。
- [Phase 02 计划](docs/development/phases/02-ontology.md)：Knowledge Base bootstrap 与完整 Ontology 能力的范围、Feature、验收和 Review。
- [Phase 03 计划](docs/development/phases/03-installation-runtime-onboarding.md)：doctor / install、完整配置、i18n、本机认证与 Runtime auto-start 的范围和验收。
- [Phase 04 计划](docs/development/phases/04-object.md)：通用 Object batch read、Knowledge Node/Relationship 与 batch Patch 的范围和验收。
- [Phase 05 计划](docs/development/phases/05-graph.md)：Graph query/execute、authenticated HTTP、NDJSON streaming、Full-text / Semantic公共路径与 transport/cancellation 验收。
- [Phase 06 计划](docs/development/phases/06-evolution-core.md)：Evolution Core 的 State / State Data、Branch / Tag、History / Diff、HTTP 与 CLI 范围和验收。
- [Phase 07 计划](docs/development/phases/07-evolution-merge.md)：Evolution Merge Session 的冲突投影、渐进 resolution、candidate validation、finalize/abort、HTTP 与 CLI 范围和验收。
- [开发指南](docs/guide/development.md)：安装、启动、调试、检查、测试、构建和本地打包。
- [行业与技术研究](docs/research/industry-landscape.md)：外部产品和技术调研记录。
