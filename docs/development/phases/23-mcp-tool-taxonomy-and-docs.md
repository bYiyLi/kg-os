# Phase 23：MCP Tool 命名统一与批量文档入口

<!-- cspell:words mcpserver mcpsandbox -->

## 目标、现状与范围

**状态：`done`（2026-10-17）**。MCP 五个 AI-facing Tool、独立批量 `kgos_docs`、133 篇文档和 31 SDK 方法已通过 Mac、OpenClaw 原样 Dockerfile/31 SDK 隔离 Smoke、真实 ChatGPT 核心链路及最终实现 SHA 的 GitHub CI 两项验收；证据见文末阶段关闭记录。

遵循 [D102](../../design/decisions.md#d102-mcp-tool-taxonomy-and-batch-docs) 与 [MCP 当前目标合同](../../design/mcp.md#mcp-tool-help)，把 Phase 22 已验证的内建文档从 JavaScript `docs.read(path)` 迁移为独立 `kgos_docs` MCP Tool，支持**空输入获取 AI 任务目录、单篇与多篇批量读取**；将现有业务 Tool 精确更名为 `kgos_ontology_overview`、`kgos_query`、`kgos_mutate`、`kgos_commit_ancestry`，保留 app-only `kgos_workspace`。同时把 AI 自主验收发现的 Ontology 从零建模、canonical Git Extended Diff 使用说明补齐为可运行的内置 Guides。

**入场历史基线**：`main@96c2bc8` 在 `internal/mcpserver` 注册 `kgos_preview`、`state_ancestry`、`kgos_read`、`kgos_run`、`kgos_workspace`；`docs.read(path)` 经 `internal/mcpsandbox` 暴露，原文档共 **31 方法 / 75 类型 / 132 页**。Phase 22 的源码、CI 与 Dev 部署是已完成历史，不是 Phase 23 的实现/验收证据。

**Phase 23 初始实现（已提交推送 `main@9cec011`）**：新增独立 `kgos_docs` Go Handler，四个旧业务 Tool 精确更名，保留 `kgos_workspace`；移除 Sandbox `docs.read`，把生成的 **31 方法 / 75 类型 / 133 页**整体迁到 `internal/mcpserver/docs/` 的 `embed.FS`；同步 Web Bridge、SDK 矩阵、Skill/Plugin、Dev 检查与操作指南。保持 Phase 15 旧 Node MCP 回退验证器原样，防止误将不兼容新 Tool 名用于历史镜像。Go 协议测试与隔离数据库中七段指南示例已经通过；新版 Dev 已部署。正式 Tag、GHCR 和生产发布未执行。

**范围限制**：不变更 31 个业务 SDK 方法、Ontology/Knowledge/Graph/Evolution 产品语义、Lithograph/Cypher 25 profile、Kernel 事务、Instance/OAuth、Web UI Resource URI 或 MCP Apps 双入口。不新增独立 HTTP 文档路由、MCP 文档 Resource/Prompt、搜索工具、SDK 兼容别名、用户配置、数据库或运行时新依赖。本次 AI 验收的 Search 索引前置条件与外部执行安全层拦截的 Merge Abort 单独取证，不冒充本 Phase 文档/命名实现缺陷。

## Design Inputs 与前置条件

- [D102：Tool Taxonomy / Batch Docs](../../design/decisions.md#d102-mcp-tool-taxonomy-and-batch-docs)、[MCP Tool 与 Docs 接口](../../design/mcp.md#mcp-tool-help) 是新名称、输入/输出、安全和迁移的唯一真源；[D100](../../design/decisions.md#d100-mcp-self-describing-docs) 与 [Phase 22](22-mcp-self-describing-docs.md) 的方法/类型/Cypher 固定版本文档生成仍沿用，唯 `docs.read` 入口被 D102 替换。
- Ontology 新建数据格式只从 [Ontology 公共可编辑格式](../../design/ontology.md#公共可编辑格式) 取得；新增、替换、删除、批量 Patch 的合法文本与 CAS/错误从 [Object 合同](../../design/object.md#object-公共调用合同) 取得。Guide 是调用说明，不得引入独立本体/补丁方言或第二份字段真源。
- 检查 `internal/mcpserver` 的真实 Tool registration/dispatch/Schema、`internal/mcpsandbox` 的 Go/WASM Bridge、`scripts/generate-mcp-docs.mjs`、`packages/web` 的 MCP Apps Bridge、`plugins/kgos` 的 Skill/模板、Go/TS/Playwright 测试及 Docker Smoke 的旧名称引用；先形成精确替换清单，不通过字符串全局盲目替换历史证据。
- 开发按 [AGENTS](../../../AGENTS.md#开发ci-与-release-分工) 的 Mac 校验 → OpenClaw 隔离 Docker → GitHub Ubuntu Validate + Linux amd64 Docker 两个 Job；提交、推送、Dev 部署、Tag/GHCR 与生产发布是独立动作，待分别授权。

## Feature 与实现顺序

| Feature | 实施范围 | Acceptance |
| --- | --- | --- |
| **P23-00 工具清单迁移** | Go MCP 的四个旧公开 Tool 名精确映射到四个新名；新增 `kgos_docs`；保留 `kgos_workspace` 元数据与 URI；Tool Title/Description/Input Schema/注解、OAuth 授权文案、Web Bridge 和 Plugin/Skill 使用说明同步；不保留旧别名 | A23-01 |
| **P23-01 独立批量文档读取** | 复用 Phase 22 的静态 Go embedded document manifest，在 Go MCP Handler 实现 `paths?: string[]` 的空输入/单篇/批量、顺序/全部成功或全部失败、路径白名单与大小预算；从 QuickJS/Bridge 删除旧 `docs.read` 全局及提示/测试 | A23-02 |
| **P23-02 AI-first 文档导航与操作指南** | `index.md` + `guides/index.md` 任务→推荐批量路径；新增 `docs/guide/mcp-guides/ontology.md`，完善 `objects.md`；SDK/类型/Cypher Guide 跨页引用与 SDK 方法页相关 Guide 入口通过既有生成源维护，自动验证链接 | A23-03 |
| **P23-03 安全、兼容与实证回归** | Go Tool 注册/协议/Schema 及 6 Tool 实际可见性，批量资源与路径反例、脚本权限、UI Bridge、OAuth、Preview/Ancestry、文档全量生成；Ontology/Patch 新建/修改/错误示例的真实 Kernel→Lithograph v0.3.1 执行 | A23-01–04 |
| **P23-04 交付与 AI 自主验收** | Mac 完整 `pnpm validate`、OpenClaw 相同源码独立 Linux amd64 Docker/临时 Volume、真实无 Skill 的新 MCP 连接及任务导航，获授权提交推送后最终 SHA 的 GitHub CI 两 Job；最后 Review、diff、文档状态同步 | A23-04–05 |

## Acceptance

### A23-01 Tool 注册、命名、权限、迁移

1. 真实 MCP `tools/list` 的**五个 AI-facing Tool** 恰好是 `kgos_docs`、`kgos_ontology_overview`、`kgos_query`、`kgos_mutate`、`kgos_commit_ancestry`；加上 `_meta.ui.visibility=["app"]` 的 `kgos_workspace` 共六个已注册 Tool（在支持 app-only 可见性的宿主按该元数据提供 UI）。旧名 `kgos_preview` / `kgos_read` / `kgos_run` / `state_ancestry` 不再可调用，旧接口使用要得到正常的“未知 Tool”错误，不出现意外兼容别名。
2. `kgos_ontology_overview` 的 `offset/limit/viewRevision` 和固定完整 Ontology 行窗口；`kgos_commit_ancestry` 的 `root/limit/cursor` 与 immutable State/多父 DAG；两个脚本 Tool 的 `code`、`{result: JsonValue}`、SDK allowlist、流式、取消、部分写入及错误合同与 Phase 22 完全一致，15 Read / 16 Write 保持 **31/31**。
3. `kgos_docs`、Ontology Overview、Query、Commit Ancestry 的真实只读注解与权限相符，`kgos_mutate` 明示可写与可能破坏；Go 宿主而非文字/JS 冻结对象实施读写隔离。Web MCP Apps 的 UI Resource/Meta、调用宿主 Bridge 的 `kgos_query`、普通浏览器 Web/API 认证不回退；OAuth scope 仍有原有完整读写边界，不额外暗授权限。
4. Tool 的英文 Title/Description/Schema、Server Instructions、Web、Skill/Plugin、脚本、测试与静态指南不得在新镜像暗示旧 Tool 或 `docs.read` 仍可用。新会话真实 `tools/list` 与客户端工具发现/重连状态分别检查；客户端缓存旧定义不能算服务器已更新。

### A23-02 `kgos_docs` 批量与安全

1. `{}`、`{"paths":[]}`、`{"paths":["index.md"]}` 返回同一 `{"documents":[{"path":"index.md","content":"..."}]}` 结构与原文；单篇、两篇及 32 篇请求按原数组顺序、逐篇全文返回。无结果隐式省略、静默截断、跨请求文档版本混用；同一镜像相同路径结果确定。
2. 非数组/`null`/额外字段/单 `path`/重复路径/空项/非字符串/非法格式/绝对路径/URL/`..`/反斜杠/大小写不符/未知路径/超过 32 项均返回 `INVALID_ARGUMENT`；混合有效和无效路径时**不部分成功**。包含默认目录在内的任何请求只要超过 4 MiB UTF-8 序列化 JSON 响应预算即返回 `RESOURCE_ERROR`；可拆分的批次使用更小 `paths` 完整读取，报错不泄漏宿主路径、Secret 或 Stack。
3. 文档仅来自构建期静态白名单，Go Handler 在现有 MCP 认证/超时/取消/并发限额下只读返回；不访问磁盘、Instance 数据库/Token、环境变量或网络，不启动 WASM，**不新增 Docs SDK 方法或 HTTP Route**。不把文档中的示例文字当服务器执行指令。

### A23-03 AI 自描述文档与例子

1. 不用 Skill，只从 `kgos_docs({})` 可找到任务→数组路径的指南，包含 Ontology 从零创建、Object/Patch、Graph/Cypher、Search、Evolution/Merge、错误处理、31 SDK 方法和相关类型；每个推荐路径均存在、正确大小写、能整篇读取，指南与 SDK 方法/类型的关联双向可达。
2. `guides/ontology.md` 使用现有公开合法格式演示从**空 Ontology** 创建 Node、Relationship、Property、Constraint、Index，并独立读取实际保存的 Definition/约束；不得把 Graph `CREATE (:Project)` 冒充 Ontology Definition，也不暴露 KG OS internal Binding 给 AI 作为独立 CRUD。
3. `guides/objects.md` 具有真实可执行的 Git Extended Diff `new file mode`/`/dev/null`、canonical YAML 修改、删除、重命名、批量对象和 `PATCH_BASE_MISMATCH` / `STALE_BASE_STATE` 修复示例；全部使用实际 `branch` / pinned `baseState` 并明确一次补丁原子、跨 JS 多调用非原子。示例可在隔离 Instance 执行并由 Object/Ontology/Graph 独立回读验收。
4. `pnpm generate:docs`/`pnpm check:docs` 覆盖 Go allowlist 31/31、全部可达公开类型、全部嵌套字段、固定 v0.3.1 Cypher/Catalog、路径与关联指南、源示例到最终 embed 的一致性。不能手改生成 Markdown 或复制设计真源。

### A23-04 端到端与回归

1. Mac Go MCP/QuickJS、TypeScript/Playwright 定向验证并完整 `pnpm validate` exit 0；`pnpm check:docs`、Markdown/拼写/格式、`git diff --check` exit 0。Go 对新工具的正反例覆盖兼容、权限与输出资源边界，避免仅验证 JSON Schema 没有真正调用。
2. OpenClaw Linux amd64 以同一源码构建正式 `Dockerfile.unified`、独立临时 Volume/Instance 完成四业务链路 31/31、文档多文件、空目录、全部错误边界、Web/API/OAuth/UI Resource、non-root/无 Node runtime、持久化重启。长期 Dev 实例只做非破坏性健康核查；若获 Dev 部署授权再执行既有备份/构建/切换/只读验收并对独立镜像补做 Smoke。
3. 真正断开/刷新旧连接并在**全新 AI 会话**不安装 Skill，完全依靠五个 Tool 自主定位并批量读取 Ontology + Patch 文档，从零建立合法模型、创建/修改数据并读取验证；同样的任务失败如实记载 `FAIL/BLOCKED`，不以静态提示词或 Go 单测假冒真实自主成功。

### A23-05 Review、交付与完成

1. Review 显式交叉核对 D102、MCP owner、D100/Phase 22 历史、SDK 31 方法、Web MCP Apps Bridge、UI Resource、Go MCP 认证、生成器根目录与实际 Embedding、一致的 Tool 名字、路径错误与容量边界；清理过期工具文案、Skill/Plugin 提示和仅服务 `docs.read` 的代码，保留用户无关改动。修复找到的问题，重新验证受影响部分，检查最终 diff。
2. 按独立授权执行 Commit/Push 后，核实最终**精确 pushed SHA** 的 GitHub CI 两 Job（Ubuntu Validate + Linux amd64 Unified Docker）均 success 才能将 Phase 标记为 `done`。代码提交、CI、Dev 部署、正式 Tag/GHCR/生产部署是独立事实；没执行的不得写成已完成。

## 设计 Review 清单（进入开发前）

- 是否有人把 `kgos_query` 当 Cypher-only、`kgos_mutate` 当 write-only，或把 `kgos_docs` 当 JS Sandbox 内的方法？五个 AI-facing + 一个 app-only 是否在文档、测试、授权说明中一致？
- 是否让 `paths=[]` 退化为错误、让坏路径返回部分成功、把单页/总批次裁剪后冒充完整文档、或增加不必要的单路径重载/别名？
- 是否将 Ontology Schema/Binding、Knowledge Graph/Cypher、Object Patch 的职责混淆？是否要求 AI 自行维护内部 Binding，或把 Raw Vector 与 Managed Semantic 当成同一功能？
- 是否把既有 `docs.read`/Phase 22 实际成功记录误写成 D102 已实现，把 Dev 或旧 GitHub CI 当作新源码的验收，或以宿主缓存的 `tools/list` 替代真实服务端证据？

## 本轮证据与状态

- 2026-10-16：只读检查 `main@96c2bc8`，原四个 Tool、Go Sandbox `docs.read`、现有生成器/文档及 Web Bridge 仍属于 Phase 22 实现；没有发现本 Phase 新命名或独立 Docs Handler 已实现。
- 2026-10-16：新增 D102、MCP 设计目标和本 Phase 计划，确定实施顺序、权限与资源限制、AI 任务导航、Ontology/Patch 示例及多环境验收。设计 Review 已区分**五个 AI-facing + 一个 app-only UI**、`kgos_query` 并非 Cypher-only、旧 `docs.read`/Tool 名只作为实现现状与历史、`kgos_docs` 不能在 Sandbox 中调用；为 Phase 15 历史设计链接保留旧标题锚点，纠正 Phase 22/Dev 的过时状态描述。
- 2026-10-16：第一轮文档静态检查发现新计划中的两个代码路径名称未被拼写器收录，仅在本文件声明词汇后复验通过；Markdown/拼写/Prettier/MCP 文档生成检查及新增/关联文档的相对链接目标检查均已执行。每次 Review 修正后仍应以最终工作树重新确认 `git diff --check` 与受影响文档格式检查，记录实际退出码。**没有开始 Phase 23 代码、未提交、未推送、未部署、未跑新 SHA 的 CI。**
- 2026-10-17 本地代码实现：五个 AI-facing Tool 和 app-only UI Tool 经真实 Go MCP `tools/list` / `tools/call` 验证；旧名称均不可调用。新 `kgos_docs` 由 Go `embed.FS` 独立返回 JSON `documents`，覆盖空输入、单篇、两篇、32 篇、非法参数/路径/重复、原子失败、4 MiB 预算、取消和 deadline。旧 Sandbox `docs.read` 删除，15 Read / 16 Write 原 allowlist 不变；发现并修复 timeout 结果码与可观测性统计不一致的问题。已确认 UI Resource URI、app-only metadata、OAuth 认证和只读安全边界没有被本阶段设计重写。
- 2026-10-17 文档/Guide 验证：`pnpm generate:docs` 与 `pnpm check:docs` 已返回 **31 方法 / 75 类型 / 133 页**，Markdown、拼写、格式及 `git diff --check` 的本轮定向检查通过；23 个涉及修改的 Markdown 文件相对链接检查结果为零断链。使用 Mac 隔离 Instance 的真实 `kgos_mutate` / Lithograph v0.3.1 运行发布的七段 JavaScript 示例：空 Ontology 建模及索引、Domain Add、双 Object Update、无依赖 Delete、Definition Rename、`PATCH_BASE_MISMATCH` 恢复、`STALE_BASE_STATE` 恢复，**7/7 通过**，再经只读 Object 回读检查保留的 Property、KEY、Text Index 与 Relationship 端点。
- 2026-10-17 Review 纠正：历史 Node MCP 镜像的独立回退验收脚本应保留旧四 Tool 名，已恢复 `scripts/mcp-dev-accept.mjs`；新版只读 Dev 校验才验证五个新 Tool 和批量文档。Plugin Skill 已取消复制第二份 SDK 方法目录，仅引用当前版本自描述文档。曾观察到隔离样例同一次删除具有端点依赖的 Relationship Definition + Node Definition 时返回 `CONSISTENCY_ERROR`；未将其当作 Phase 23 新 Tool 缺陷，也未改写 Kernel，而将本阶段可执行 Delete 示例改为已验证的无依赖 Domain 删除。该关联删除情形尚不能凭本次证据声称已实现。
- 2026-10-17 Mac 最终门禁：在当前业务代码树完成最终 `pnpm validate`，**exit 0**，Go 静态分析/全模块测试/Race/coverage、TS、Web 与 Playwright 26/26、文档生成、Markdown/拼写/格式、安全/依赖/许可证/差异检查均通过；`git diff --check` 为 0。此结果不代替 Linux Docker、用户会话或 CI 验收。
- 2026-10-17 Linux 隔离实证：OpenClaw 的原样 `Dockerfile.unified` 构建因 npm/Go 工具链下载及网络速度问题未能完成，**不能声称正式 Dockerfile 原样构建成功**。为了完成代码级隔离测试，在独立临时源码目录创建仅复用已验证的 Node/pnpm 与 Go 1.27.2 本机缓存构建阶段的临时 Dockerfile；未修改仓库 `Dockerfile.unified`、Dev 配置/数据库/运行实例。使用此临时文件重编译当前 Go `kgosd` 与当前 Web/MCP UI，构建的 linux/amd64 镜像为 `sha256:a3daf38c8afe0e72068f0d097bf6220044c2ef8345d0c8c7b20c9afd1c19a67e`，运行时 UID/GID `10001:10001`。从 OpenClaw 宿主对该镜像执行正式 `scripts/mcp-unified-docker-smoke.mjs`：**exit 0、31/31 SDK 通过**，五个 AI-facing + 一个 app-only UI Tool、`kgos_docs` 空目录/批量 32 篇/非法请求、OAuth/授权隔离、Web/API/UI Resource、单进程、non-root、无 Node 及持久 Volume 重启均按脚本验收。它是等价工具链的**临时验证镜像**，不是原样 Dockerfile 或最终 pushed SHA 的 CI 结果。
- 2026-10-17 剩余阶段门禁：本阶段代码与可本地执行的 Review/测试已闭环；原样 `Dockerfile.unified` 的独立 Linux 构建、真实 ChatGPT **新无 Skill 会话的自主端到端使用**及最终 pushed SHA 的 GitHub CI 两 Job 尚无新证据；已获得并执行 Dev 部署；Commit、Push、正式发布仍未获授权。**状态保持 `in_progress`，禁止标记为 `done`**。Phase 22 的旧镜像与已过的 CI 不替代这些验收。

- 2026-10-17 Dev 交付验收：在 OpenClaw 对当前 `dirty` 工作树同步源码，执行既有 `preflight`、SQLite 在线一致性备份（私有目录 `20261016T171749Z-BIIiE009`）后，保留原运行镜像 `sha256:937176426e387d2c25f90077a668afc36fa300e869f2a2aa0cce4d2b5801ace7` 供回退，切换经独立隔离测试的 Linux amd64 镜像 `sha256:a3daf38c8afe0e72068f0d097bf6220044c2ef8345d0c8c7b20c9afd1c19a67e`。旧镜像没有删除，Workspace 未清空或重建。Dev 容器 `healthy`，现有只读 `scripts/mcp-dev-accept-unified.mjs` 的五个 AI-facing Tool、`kgos_docs` 目录/批量、app-only UI Resource、Instance Bearer、OAuth、Preview/State/Ancestry 均通过；公网 HTTPS 首页 200、未认证 MCP 401、OAuth metadata 200、非公开独立 UI 路由 404。对 **实际部署镜像**使用临时 Volume 重跑 `scripts/mcp-unified-docker-smoke.mjs`：**exit 0、31/31 SDK、重启持久化通过**。部署记录 UTC `2026-10-16T17:19:37Z`，源码标识 `96c2bc8` (`dirty`)；此次仅部署 Dev，未 Commit/Push、未修改当前生产或发布正式镜像。镜像仍基于同版本缓存构建阶段的临时 Dockerfile，而非原样 `Dockerfile.unified` 构建。

- 2026-10-17 用户提供的真实 ChatGPT 客户端验收报告（非本地工具调用日志）：无实际加载 Skill 的会话发现并调用五个新版 Tool、31/31 SDK 方法；独立测试 Branch `p23-chatgpt-20261017-0853-7d6c42` 及 Merge/Tag/State Data 场景有报告证据；默认 `main` Head 前后均为 `commit/818980aa5312c9cd993febabf29f72d91eeb98ac0909dcdf7ec150962edb7dda`。**客户端整体 FAIL**：P23-DOC-01（六段 Object 写示例和 Ontology 建模错误取默认 Branch）、P23-DOC-02（stale 恢复错误取默认 State）；同类缺陷不等于 SDK 功能失败，且该报告未证明绝对零先验会话、UI Resource 操作或原样 Docker CI。保留三个被报告的隔离测试 Branch，不自动删除。
- 2026-10-17 文档安全修复：`guides/ontology.md` 先检查命名冲突并显式创建独有 `kgos-guide-demo` 测试 Branch；`guides/objects.md` 六段写入及 stale 恢复均按显式目标解析 `evolution.get({state:"branch/"+branch})` 的 immutable Head；并修复 Graph/Cypher/Evolution/Error 指南、SDK 的两个 Patch TSDoc 示例与按 Commit 共享的 State Data 示例。MCP 目录根导航增加写入 Branch 安全说明，更新生成的 133 页文档。Mac `pnpm generate:docs && pnpm check:docs && pnpm check:markdown && pnpm check:spelling && git diff --check` **exit 0**；独立临时 Instance 的真实 MCP → QuickJS → Go → Lithograph 七段示例 **7/7 成功**，每一步额外验证测试 Branch 已推进、默认 Branch Head 与创建前完全相同（`TestDocumentedOntologyAndObjectLifecycle`，exit 0）。**不等于**修复后的真实 ChatGPT 复验、远端镜像更新或最终 SHA CI 通过。

- 2026-10-17 文档修复后的 Dev 交付：Mac 当前 Phase 23 `dirty` 工作树完成 **`pnpm validate` exit 0**（包括 Go Race/coverage、SDK/Web/Playwright、质量及安全门禁）；OpenClaw 使用上一轮同版本缓存构建阶段的临时 Dockerfile 构建 Linux amd64 镜像 `sha256:bd06c022043006d2fed05cbc2cb29499e2d316ed1ba8e095e3c4614b84602f2f`，**并非原样 `Dockerfile.unified`**。对该镜像使用独立临时 Volume 执行 `scripts/mcp-unified-docker-smoke.mjs` **exit 0、31/31 SDK、重启持久化通过**。受保护 SQLite 一致性备份 `/data/apps/KgosDev/data/backups/20261017T024119Z-mCiJdcYa` 创建成功。初次 Dev 试切换的定制断言错误地要求 MCP 成功结果显式含有 `isError:false`，实际协议允许省略此字段，**自动回退到旧健康镜像并通过只读检查**；修正验收脚本的断言后重新切换成功，镜像与已验证镜像 ID 一致。UTC 部署记录 `2026-10-17T02:46:41Z`；`kgos-dev-mcp-1` 为 `healthy`，OAuth/Web/API/五个 AI-facing Tool/app-only UI Resource 只读验收通过，直接经运行中的 `kgos_docs` 返回的 `guides/ontology.md`、`guides/objects.md`、`sdk/ontology/patch.md`、`sdk/object/patch.md` 已验证包含安全修复。实际 Dev `main` Head 在部署前后均为 `commit/818980aa5312c9cd993febabf29f72d91eeb98ac0909dcdf7ec150962edb7dda`，没有对长期 Workspace 做测试写入。未 Commit/Push，最终 GitHub CI 与修复后新 ChatGPT 客户端复验尚未执行，Phase 23 继续 `in_progress`。

- 2026-10-17 用户提供修复后第二次真实 ChatGPT 桌面客户端验收报告（用户报告，非独立协议抓包）：使用 `kgos-dev`，未读取 Skill/本地仓库，通过内嵌 `kgos_docs` 发现任务入口，实际调用五个新版 AI-facing Tool 和 **31/31 SDK**，在测试 Branch `p23-chatgpt-20261017-1050-b8e4a1` 及两个 Merge Branch 验证 Ontology 创建、Git Extended Diff Add/Update/Delete/Rename、Knowledge/Graph、读写 Stream、真实冲突 Merge、Tag/State Data 与 `PATCH_BASE_MISMATCH`/`STALE_BASE_STATE` 恢复；默认 `main` 的 Head 开始/结束均为 `commit/818980aa5312c9cd993febabf29f72d91eeb98ac0909dcdf7ec150962edb7dda`，**P23-DOC-01/02 没有再现**。客户端报告判为 `PARTIAL`：曾猜测不存在的 `cypher/writes.md`（收到 `INVALID_ARGUMENT` 后从目录找到 `cypher/mutations.md`）、尝试以普通 TEXT Index 执行 Full-text 得到符合类型约束的 `SEMANTIC_ERROR`，未执行额外 Provider/向量/4 MiB 重负载，未实际打开 app-only UI；这些未确认是 MCP/SDK 产品缺陷。4 MiB 资源预算、app-only UI Tool/Resource 及 Docker 隔离 31/31 另有真实 Go/CI 证据；保留测试 Branch/Tag，不在长期 Dev 自动清理。不能把客户端 `PARTIAL` 伪称所有客户端入口/功能均 PASS。
- 2026-10-17 完成 Phase 23 实现提交推送 `9cec011faf30ff5acb9c651ae150825e1e440328`（主树 `main`）。该精确 SHA 的 [GitHub CI Run #38996756140](https://github.com/bYiyLi/kg-os/actions/runs/38996756140) **Unified Docker / Linux amd64 success**：GitHub 原样 `Dockerfile.unified` 构建 + 临时 Volume Smoke；**Validate failed**：Ubuntu `go test -race` 中 `TestDocumentedOntologyAndObjectLifecycle` 的全部七段脚本共用 90 秒 Context，在慢速 Runner 第六/七段出现 `context deadline exceeded`，并非已证明 SDK 语义失败。回归修复只将该真实集成用例的**总超时预算**改为 300 秒，不删除单项验证、Branch 保护或原有 Go/WASM MCP 测试。在 Mac 重跑 `go test -race -tags=sqlite_fts5,lithograph_smoke -run '^TestDocumentedOntologyAndObjectLifecycle$' ./internal/mcpserver`，七段均成功，**71.86 秒**，仍保持有界取消；后续须以新精确 pushed SHA 的完整 CI 2/2 success 才能宣称 CI 门禁完成。
- 2026-10-17 OpenClaw 的独立原样 Dockerfile 门禁重试：将本地当前 Phase 23 源码（仅 CI 超时测试改动）同步到专用远端源码镜像，校验 `Dockerfile.unified` 与集成测试文件 SHA 一致；在 Linux amd64 使用仓库未修改的 `Dockerfile.unified`、原有镜像版本的已缓存官方 Node/Debian 基础镜像与 `--network=host` 构建临时镜像。构建执行到 Web builder 的 `pnpm install --frozen-lockfile --ignore-scripts` 后，向 `npm registry` 获取依赖时连续 `EAI_AGAIN` / `ERR_SOCKET_TIMEOUT`，约 211.5 秒后因 `smol-toml` tarball 下载超时退出 1。**此项 OpenClaw 原样构建仍 BLOCKED**；不是已证明产品或 Dockerfile 代码缺陷，未改变长期 Dev 容器/数据。GitHub CI 的原样 `Dockerfile.unified` 构建通过是另一个真实环境的证据，不将其伪写为 OpenClaw 原样构建成功。下一轮应在远端依赖网络恢复后按原样 Dockerfile 补验。

- 2026-10-17 **OpenClaw 原样 Dockerfile 门禁恢复并通过**：核对宿主已配置的出站代理可访问 npm tarball，改用标准 Docker `--build-arg HTTP_PROXY/HTTPS_PROXY/ALL_PROXY`（含小写变量）明确向构建阶段传递宿主代理，仍使用仓库**未改动的 `Dockerfile.unified`**，基础镜像采用已缓存的同版本 Node 24.15.0/Debian bookworm 镜像来源。Linux amd64 `docker build --network=host ... -f Dockerfile.unified` **exit 0**，产物 `sha256:3bf623b99854224934a6ac6c5d8101bf840c0a77d5e9aafc16a7234b2f372b46`，运行 UID/GID `10001:10001`。在**独立临时 Volume/Instance** 上对该正式 Dockerfile 产物执行 `scripts/mcp-unified-docker-smoke.mjs`，**exit 0，31/31 SDK、五个 AI-facing + app-only UI、Web/API/MCP/OAuth、单进程、非 root、无 Node 运行时、持久化重启全部通过**。先前 OpenClaw npm 网络 BLOCKED 已按本次新证据解除；它不替代最终新 SHA GitHub CI 验收，也未修改长期 Dev 容器或数据库。
- 2026-10-17 Mac 最终修复树 `pnpm validate` **exit 0**（Go Race/coverage、TS、Playwright、文档生成、格式、拼写与安全等门禁），且 `go test -race` 的七段实操隔离回归全部成功；单项 90→300 秒超时调整不会改变 MCP/SDK 产品合同。当前需将文档证据与修复提交推送，核查该精确 SHA 的 Ubuntu Validate + Unified Docker / Linux amd64 两 Job 均 success；随后复核最终 diff 与文档状态才能将 Phase 标记为 `done`。

## 阶段关闭记录（2026-10-17）

- **已实现、已提交、已推送**：主线实施提交 [`9cec011`](https://github.com/bYiyLi/kg-os/commit/9cec011faf30ff5acb9c651ae150825e1e440328)，Go Race 集成测试 90 秒整体预算的最小修复提交 [`cfa3917`](https://github.com/bYiyLi/kg-os/commit/cfa39173020523b127982f196fd54f7b64905f04)，均已推送 `origin/main`；原四工具不保留兼容别名，新五工具 + app-only `kgos_workspace` 按设计注册，`kgos_docs` 静态 Go embed 包含 31 SDK 方法、75 类型、133 篇文档。SDK 业务语义、Kernel/Lithograph、Web 认证与 UI Resource URI 不变。
- **Mac 全量与回归**：当前实现 `pnpm validate` **exit 0**，含 Go Race/coverage、TS/Web/Playwright、生成文档、格式、拼写、安全及质量检查；真实 MCP → QuickJS → Go → Lithograph 的七段文档示例全部通过，新增 Branch Head 守卫确认测试 Branch 推进而 `main` 不变；Go Race 定向测试七段全部通过，300 秒有界测试预算没有降低断言。提交前 `lefthook`、`git diff --check` 通过。
- **OpenClaw 原样 Linux amd64 Docker 验收**：宿主通过 Docker 标准代理构建参数解决外部 npm tarball 下载阻塞，使用仓库**未修改的 `Dockerfile.unified`** 构建成功（镜像 `sha256:3bf623b99854224934a6ac6c5d8101bf840c0a77d5e9aafc16a7234b2f372b46`），在独立临时 Volume 中执行 `scripts/mcp-unified-docker-smoke.mjs` **exit 0、31/31 SDK、OAuth/Web/API/MCP/UI Resource、non-root、Node-free、重启持久化通过**。开发 Dev 已部署较早的已验证修复镜像 `sha256:bd06c022043006d2fed05cbc2cb29499e2d316ed1ba8e095e3c4614b84602f2f`，保持 `healthy`，没有把原样隔离测试错误描述为新一次长期 Dev 部署。
- **真实客户端验收边界**：用户提供的修复后 ChatGPT 桌面 MCP 端到端报告，五 Tool/31 SDK 实际调用、Ontology → Knowledge → Patch → Graph → Evolution/Merge、权限与恢复均有证据，默认 `main` Head 未变；前次 P23-DOC-01/02 已修复且本轮未再现。用户报告的总体标签为 `PARTIAL`，主要因为一次未经目录确认的无效文档路径（后自行纠正）、未做破坏性 4 MiB 负载、外部 Provider / Search 条件、和 app-only UI 实际打开。这些不冒充客户端完整 PASS；4 MiB 服务端资源边界、UI Tool/Resource 则由独立 Go MCP/Docker 验证，不把非本阶段的外部 Provider 或 UI 主动交互要求新增为当前 Phase 的完成门槛。
- **GitHub CI 完成**：最终实现提交 **[`cfa39173020523b127982f196fd54f7b64905f04`](https://github.com/bYiyLi/kg-os/commit/cfa39173020523b127982f196fd54f7b64905f04)** 的 [CI Run #39001850377](https://github.com/bYiyLi/kg-os/actions/runs/39001850377) 已逐 Job 确认 **Ubuntu Validate success + Unified Docker / Linux amd64 success（2/2）**，其中 Docker Job 按原样 `Dockerfile.unified` 构建并完成完整隔离 Smoke。旧失败的 [CI Run #38996756140](https://github.com/bYiyLi/kg-os/actions/runs/38996756140) 保留为超时修复前历史，不当作本版本失败。正式 Tag、GHCR 发布及生产部署均未执行，亦不属于本次 Phase 关闭。
