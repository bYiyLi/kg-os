# Phase 22：MCP 自描述文档与 Lithograph v0.3.1 对齐

<!-- cspell:words gpgv -->

## 目标与状态

**状态：`done`（2026-10-16）**。Lithograph v0.3.1 依赖升级、MCP `docs.read()`、TSDoc/TypeDoc 文档生成、KG OS Cypher 手册及旧 Help 清理已交付；源码提交 [`a84ce5e`](https://github.com/bYiyLi/kg-os/commit/a84ce5ef40f56e0f95fc115a8140200623faf88e) 已推送 `main`，该 SHA 的 [GitHub CI Run 38874967382](https://github.com/bYiyLi/kg-os/actions/runs/38874967382) **Validate + Unified Docker / Linux amd64 2/2 success**。本 Phase 交付一套**不依赖 Skill** 的 MCP 内建自描述资料：从 `tools/list` 发现入口、按需阅读 SDK/类型/Cypher/Guides、在现有 `kgos_read` / `kgos_run` 中正确执行，并将文档固定在同一个 `kgosd` Docker 版本。

本 Phase 还完成经用户明确授权的官方 Lithograph **v0.3.1** 升级，以保证 MCP Cypher 手册适配真实加载版本；不修改 Lithograph 仓库、不设计 Cypher 方言、不新增数据库或额外 MCP Tool。2026-10-16 用户另行授权**提交和推送至 Phase 22 `done`**，不包含 Dev/生产部署、Tag 或 Release。

## Design Inputs 与已有基线

- [D100](../../design/decisions.md#d100-mcp-self-describing-docs) 和 [MCP 文档合同](../../design/mcp.md#mcp-tool-help) 是虚拟文档入口、结构、安全及完整度的产品真源；[Client](../../design/client.md#kgossdk) 拥有方法/类型，业务约束分别由 [Ontology](../../design/ontology.md)、[Object](../../design/object.md)、[Graph](../../design/graph.md)、[Evolution](../../design/evolution.md) 拥有。
- [D101](../../design/decisions.md#d101-lithograph-v031-upgrade) 决定将官方底层依赖锁定到 v0.3.1；上游 Lithograph v0.3.1 的 [Cypher 手册](https://github.com/bYiyLi/Lithograph/blob/v0.3.1/docs/cypher/index.md)、[兼容 Profile](https://github.com/bYiyLi/Lithograph/blob/v0.3.1/docs/reference/cypher-compatibility.md) 和 [函数/Procedure Reference](https://github.com/bYiyLi/Lithograph/blob/v0.3.1/docs/reference/README.md) 只是**固定版本证据**，不在 KG OS 复制其设计真源。
- [Phase 20](20-mcp-tool-help.md) 已 `done`，其历史基线提供了 `help(name?)`、31 方法 Help、Go/WASM Bridge；本阶段已经替换并清理旧 Help，保留旧阶段完成证据。[D99](../../design/decisions.md#d99-linux-amd64-docker-only-distribution)/[Phase 21](21-docker-only-delivery.md) 约束唯一未来运行交付为 Linux amd64 Docker，现行 CI 为 Ubuntu Validate + 同源 Docker Smoke。
- Go MCP 直接调用 Kernel，不通过 TypeScript HTTP SDK 发起环回请求；Sandbox 只有四个业务 namespace 和经 Go Host 许可的 15 个 Read + 16 个 Write 方法。Go/JS/TypeScript 客户端的原业务合同、OAuth/UI、Preview/Ancestry 与数据持久化不属于本次重设计。

## Feature 顺序

| Feature | 实施范围 | Acceptance |
| --- | --- | --- |
| **P22-00 固定 Lithograph 版本** | 实际 v0.3.1 Release/SHA256 pin、Go 版本检查、本地扩展与 Provider、正式 Docker 替换历史 npm 包里的 Lithograph 二进制并重算 manifest；最小必要的当前版本设计说明同步 | A22-01 |
| **P22-01 SDK 类型与 TSDoc** | 按真实公共语义补足 StateRef、MergeChoice/Status/Resolution 等类型；对 31 个方法与递归依赖的 Request/Result/字段补 TSDoc、权限、错误、语义及可运行 JS 示例 | A22-02 |
| **P22-02 文档生成与虚拟读取** | TypeDoc + 必要 TS AST 映射、稳定 Markdown 路径清单、Go 构建期嵌入、Sandbox `docs.read(path)`、Tool Description 文档入口；完成迁移后删除原 `help()` 双端实现/JSON/专有元数据及过期测试 | A22-03 |
| **P22-03 KG OS Cypher 手册与 Guides** | 在 KG OS `docs/guide/mcp-cypher/` 编写当前 v0.3.1 的 MCP 专用 Cypher 25 手册、函数/Procedure/能力索引和实际 JS/Cypher 示例；编写常见 MCP 组合工作流 Guides | A22-04 |
| **P22-04 验证与 Review 收口** | 目录/类型/权限/版本/示例静态与真实 MCP 端到端校验，Mac 全量质量，隔离 Linux amd64 Docker 实装 v0.3.1，真实无 Skill 客户端，远程 CI 和最终 Review/diff | A22-05 |

P22-00 是 Cypher 示例执行前置；P22-01 是 SDK 文档准确生成的前置；P22-02 的目录与读取合同完成后才可验收 P22-03 的实际访问。各 Feature 可在不依赖的部分并行准备，但 Phase 关闭以完整联动验收为准。

## Acceptance

### A22-01 底层依赖版本与完整性

1. 核对真实 GitHub Release：正式版本 v0.3.1、正确 Linux amd64 SHA256 与本地开发机所需平台 SHA256；下载的主扩展和独立 Provider 均来自**同一 v0.3.1 archive**，`VERSION` 与 `lithograph_version()` 均准确。修改版本常量但最终镜像仍载入旧包，**失败**。
2. 本地 Lithograph Host/Runtime/Kernel/Graph/Ontology/Evolution 真实集成回归成功，包括 extension 加载顺序、Provider、Jieba、schema compiler/generated-name、历史 State、Full-text/Semantic、read/write、stream/transaction/cancel 等受影响能力。若 v0.3.1 与现有合同出现实际差异，先在相应 owner 修订最小必要设计，再修正实现；不能因新版本号直接假设向后兼容。
3. 正式 `Dockerfile.unified` 使用校验过 SHA256 的 v0.3.1 主扩展 + Provider 替换构建输入中的旧文件并更新所有受影响的 `manifest.json` hash；最终 Linux amd64 镜像运行时不依赖 Node/npm、不从网络临时下载扩展，实际装载版本为 v0.3.1。对该镜像执行独立临时 Volume 的初始化/重启/关键操作 Smoke，长期 Dev Instance 不得用于破坏性验证。

### A22-02 SDK 精确类型、字段与注释

1. Go Sandbox 方法 read/write allowlist 与 `client.ts` 可调用公共方法为 **15/16、31/31**，无漏项或新增可执行能力；每个方法及所有被引用的嵌套公开类型/字段有可解析文档注释，含必填/可选、Ref/枚举/条件依赖、结果与错误和副作用。TypeDoc/AST 真实解析 namespace 中现有箭头函数，不因发现失败而隐式省略方法。
2. Ref/State 与 Merge TS 类型仅表达 [Evolution](../../design/evolution.md) 已冻结规则，TypeScript 合法调用能通过类型检查、非法 Merge `choice/value` 组合有预期类型错误；HTTP 传输和 Go/Kernel 仍负责运行时真实参数校验。
3. 每个文档示例在 `kgos_read`（只读）或 `kgos_run`（必要写入）的 JS 函数体中可直接运行；没有 `new KGOSClient`、`import`、Token、未经授权的伪方法。每篇写方法文档明确权限和可能提交的副作用。

### A22-03 只读 `docs.read` 与旧 Help 清理

1. 真实 MCP Tool 描述无 Skill 前置，能找到 `return await docs.read("index.md")`。根目录可到达 SDK、Types、Cypher、Guides 的实际路径，方法目录中的 31 个方法和每个 Type 引用都能按路径读取完整 Markdown；相同输入返回相同构建快照字节。
2. 拒绝空、非法类型、额外参数、路径穿越、绝对路径、URL、大小写错误、未知路径，返回不泄漏宿主路径的 `INVALID_ARGUMENT`；资源上限返回 `RESOURCE_ERROR` 而非裁剪文档；文档只能从构建时静态清单读取，不可访问工作区、主机文件、网络、Instance Token 或数据库。两种 Tool 都可读取写方法文档，但只读执行权限不变。
3. 从 TypeScript/Go 去除旧 `help(name?)`、生成器/静态 JSON/专有元数据、Tool 提示以及相关过时导出/测试；保留其他 SDK 业务接口，不新增专用 Tool、HTTP Route、MCP Resource、持久化文档系统。新的生成 `--check` 能拒绝过期产物、31 方法差异、无注释字段、断链和跨版本混用；最终 Docker 中无运行时 Node/TypeDoc 依赖。

### A22-04 KG OS 自有 Cypher 25 手册

1. 文档是可由 `docs.read("cypher/index.md")` 自主导航的**KG OS MCP 使用手册**，而不是复制 Lithograph 的 SQL 手册。以实际 v0.3.1 的冻结 `CY25-2026.08` 为覆盖来源，建立可审查的能力/函数/Procedure 到文档页及示例的映射；基础、扩展/路径/组合、DDL、全文/向量/Semantic、Version Procedure、LOAD CSV、交易和错误均可检索。上游来源及固定版本有记录，无未验证的 Neo4j Server/外部 Procedure 承诺。
2. 示例明确区分 `graph.query({at,cypher,params?})` 与 `graph.execute({branch,cypher,params?,author?,message?})`，使用可执行 Cypher 文本，不允许把 `SELECT lithograph(...)` 误交给 JS Sandbox；State pin、只读与写入差别、Streaming terminal summary、Procedure 与事务子查询真实语义都符合当前 KG OS Graph 合同。
3. 具有执行效果的示例需附可复现的合成测试数据、预期结果/错误，在真实 KG OS→Lithograph v0.3.1 上自动测试；涉及 Provider/CSV/版本变更/合并在隔离环境验收。文档页面、目录索引、引用可通过清单校验，单页可在现有 Sandbox 输出预算内完整返回。今后改 Lithograph 版本必须同步更新手册和回归，不得静默落到上游最新版。

### A22-05 门禁、Review 与交付边界

1. Mac 开展受影响的 TS/Go 定向测试、类型与 TSDoc/TypeDoc 生成核验、文档 Markdown 链接/格式/拼写、`git diff --check`、`pnpm validate`；含 SDK/Cypher 代表性真实正反例、原有 31/31 Go MCP Bridge 与安全隔离回归。拒绝偷增运行期依赖和静态示例冒充真实执行。
2. OpenClaw Linux amd64 **独立 Docker 构建 + 临时 Volume** 验证最终镜像中 v0.3.1 Extension/Provider、无 Node、非 root、Web/API/OAuth/MCP 四工具+UI Tool、真实 `docs.read`、31/31 SDK、只读越权拒绝及重启持久化。无需 Skill 的客户端须通过真正的 MCP `tools/list` 找到并读取新文档，验证后再在隔离 Instance 执行若干按文档组合的调用；模型表现需要另有独立证据，不凭静态提示词假称自动成功。
3. 获得独立 Commit/Push 授权后，对**最终 SHA** 的两项 GitHub CI（Ubuntu Validate + Linux amd64 Docker）分别取得真实成功证据才允许 `done`；未获授权/未执行时保持 `in_progress`。Dev 部署、Tag、GHCR Release、生产部署另行授权，不能用本地/旧镜像/旧 CI 代替。
4. 对设计与实现交叉 Review：Cypher 语言真源与 KG OS 手册边界、Method allowlist 与文档一致性、旧 Help 全面清理、对外静态资料安全、版本制品与 Docker 字节一致、未知写入处理与流式副作用、旧 Phase20 完成记录保留。修复确认的问题后复验受影响范围，最终再次查看工作树和 diff；保护无关用户改动。

## 实施过程证据（历史记录）

- 2026-10-16 对 `origin/main` 对齐的 clean KG OS 主工作树检查：Phase 20/21 已 `done`，当前默认 `help()` 尚在，`docs.read()` 尚不存在；新文档合同和新计划已被用户授权写入。
- 由 GitHub Releases latest API 核实 Lithograph v0.3.1 正式发布；v0.3.1 语言 Profile 与既有 `CY25-2026.08` 一致。已更新 KG OS `scripts/lithograph-artifacts.mjs` 的六制品固定 SHA、Go Host exact extension version、依赖校验及 Dockerfile 的 v0.3.1 Linux amd64 两扩展替换方案；该源码变更**未提交、未部署**。
- 本机 `node scripts/prepare-lithograph.mjs` 校验并准备 v0.3.1 macOS arm64 官方 Release；`node scripts/test-lithograph.mjs` 对真实 Host、Runtime、Runtime Profile、Lithograph test、Kernel、Daemon、`kgosd` **7 包全部退出 0**。成功的 Docker 构建、同源容器运行/重启与 GitHub CI **尚未完成**；不能由本机测试推导 Docker 已更新。
- **隔离 Docker 首次尝试（2026-10-16）**：源码同步到 OpenClaw 独立 `/tmp/kgos-phase22-*` 目录，执行 `docker build --network=host --platform linux/amd64 -f Dockerfile.unified`；在取得 Node 基础镜像 metadata 时即因 Docker Hub blob `failed size validation` 失败，尚未进入 v0.3.1 主扩展/Provider 替换或镜像 Smoke。因此 **Docker 验收未通过**，不能声称版本已部署；临时测试源码已清理，不影响长期 Dev。后续需先解决受信任基础镜像获取问题，再在相同修改源上重新构建及验证。
- **设计与 v0.3.1 依赖升级的前置基线（2026-10-16）**：Phase 22 核心代码实现**之前**，针对早期升级改动的 `pnpm validate` exit 0；Markdown、拼写、Prettier 和相对链接目标检查亦通过。此旧成功结果**不替代**下述本阶段新增源码之后的测试结果。
- **Phase 22 核心实现与本地 Review（2026-10-16）**：TypeScript SDK/Go Sandbox 的旧 `help(name?)`、双份 Help JSON 和生成脚本已删除；`docs.read(path)` 在原 `kgos_read` / `kgos_run` 中读取内嵌只读 Markdown，非法路径明确拒绝，旧写权限不变。TSDoc + TypeDoc/TS AST 对照真实 Go 15 Read / 16 Write allowlist，生成 **31 个方法、75 个类型、132 页**（新增类型总索引与继承/嵌套类型跳转）。`pnpm generate:docs` + `pnpm check:docs`、类型/示例静态校验和内建断链检查通过。无 Skill 真实 MCP Tool List、文档读取、权限拒绝、旧 Help 不可用和资源预算测试通过。
- **Cypher 25 实证（2026-10-16）**：v0.3.1 `CY25-2026.08` 下真实 KG OS → Lithograph 集成，**25 段示例**经过隔离 Instance 执行或按预期确认缺少索引，`SHOW FUNCTIONS` 识别的 **169 个函数名称**和 `SHOW PROCEDURES` 的 **38 个 Procedure** 与固定库存一致；静态手册另记录 **172 条函数重载签名**。全文/向量/语义查询的缺少 Index 错误没有被当成真实查询成功。
- **质量门禁（2026-10-16）**：`pnpm typecheck`、`pnpm lint`、`pnpm check:docs`、`pnpm test:go:race`、`pnpm test:go:coverage`（**90.0%**）、`pnpm test:coverage`、`pnpm check:type-coverage`（**99.60%**）、`pnpm check:duplicates`、`pnpm check:unused`、`pnpm check:go:security`、`pnpm check:security`、`pnpm check:licenses`、`pnpm check:diff` 和 Playwright **26/26** 分项运行 exit 0。整条 `pnpm validate` 在本地执行时限内达到 Go Race/覆盖率阶段后**超时，未取得完整退出 0**；分项独立运行的实际结果不能包装为一次完整命令通过。测试 Fixture 曾含非法 `commit/test`，本轮仅修正合成数据为有效 Ref，同时增加错误 Ref 的失败用例。
- **追加全量验证与代码 Review（2026-10-16）**：对上一轮超时的同一 Phase 22 代码先重新执行 `pnpm validate` 并取得 **exit 0**。Review 又修正 TSDoc 中误导 AI 的错误消息/Object Value/一致性字段描述，补充继承与嵌套类型的 `docs.read` 引用链接、`sdk/types/index.md` 总索引及 Go 回归用例，生成 **31 方法、75 类型、132 页**。针对这些最终源码再次运行完整 `pnpm validate` **exit 0**；独立 `pnpm test:go`、`pnpm generate:docs`、`pnpm check:docs`、`pnpm typecheck`、Prettier 与 `git diff --check` 亦通过。后续仅调整开发状态文档，并单独通过 Markdown、拼写与格式检查。历史超时记录保留，但不再代表当前本地门禁状态。
- **隔离 Docker 阻塞（2026-10-16）**：使用 OpenClaw **独立** `/tmp/kgos-phase22-*` 构建上下文、固定代理及源镜像时，Docker Hub metadata 与阶段依赖下载先后出现网络错误；后续 `apt-get update` 对 Debian 归档返回 `At least one invalid signature was encountered`。同一容器手工下载的 InRelease 能通过 `gpgv` 签名校验，但 BuildKit 的相应构建层尚不能稳定通过。**没有降低签名校验或声称镜像成功**；未取得最终 v0.3.1 Linux amd64 装载/独立 Volume/restart 证据，CI/部署均未执行。
- **Linux 原生制品独立验证（2026-10-16）**：在 OpenClaw 的独立 `/tmp/kgos-phase22-*` 临时目录下载官方 `lithograph-linux-x64.tar.gz`，按 D101 固定的 `b4170e31…858a8d1d` SHA-256 全量校验通过；在 Linux 主机的**标准 SQLite 3.46.1** 中加载 `lithograph.so`，`lithograph_version()` 确认 `extension=0.3.1`、`cypherProfile=CY25-2026.08`。这只验证本地 Linux Native Release，不替代最终 `kgosd` Docker 运行验证。
- **Linux amd64 隔离构建与运行复验（2026-10-16）**：在 OpenClaw 直接从官方 Registry 拉取 Node 24.15.0 与 Debian bookworm-slim 基础镜像，绕过错误的镜像层缓存；仅清理 Docker **未使用、可重建的 BuildKit 缓存**，未清理镜像、Volume 或长期 Dev 数据。定位到该主机容器的 APT 默认受限用户验签异常：仅在隔离源码目录内生成**临时 Dockerfile 副本**，将 `apt-get update` 指定为 `APT::Sandbox::User=root`，仍保留 APT 签名验证、官方 Lithograph v0.3.1 Release SHA-256 与 Runtime manifest 完整性校验。该临时 Dockerfile 完整构建出 `kgos-phase22-review:isolated`（Linux amd64）；在独立 Volume/临时容器中执行 `KGOS_UNIFIED_DOCKER_SMOKE_IMAGE=kgos-phase22-review:isolated node scripts/mcp-unified-docker-smoke.mjs` **exit 0**：non-root、无 Node.js、单 `kgosd`、Web/API/MCP、内建 `docs.read`、**31/31 SDK**、容器重启持久化均通过。**仓库正式 `Dockerfile.unified` 未为环境差异修改**；本证据是隔离环境适配构建，不能代替正式原样 Dockerfile 的 GitHub CI。未提交、未推送、未部署；Phase 仍为 `in_progress`，等待正式 CI 最终验收。
- **验收标准**：P22-00–04 / A22-01–05 必须有实际实现、Review、隔离 Docker 与最终 CI 证据；以上条目保留实施过程中各次尝试的原始结果，最终判断以随后阶段关闭记录及其精确提交 SHA 为准。

## 阶段关闭记录（2026-10-16）

- **已提交、已推送**：实施源码 [`a84ce5ef40f56e0f95fc115a8140200623faf88e`](https://github.com/bYiyLi/kg-os/commit/a84ce5ef40f56e0f95fc115a8140200623faf88e) 已推送到 `origin/main`；提交前本地 `pnpm validate` exit 0，Git pre-commit `pnpm check:quick` 与 `git diff --check` 通过，最终 diff 未发现需修复的阶段相关问题。
- **A22-01 / A22-05 正式 CI**：[GitHub CI Run 38874967382](https://github.com/bYiyLi/kg-os/actions/runs/38874967382) 对该精确 SHA 执行原样 `Dockerfile.unified` 构建，并在临时 Volume 完成真正的单进程、非 root、无 Node.js、Web/API/MCP、内嵌文档、31/31 SDK 和重启持久化 Smoke；`Unified Docker / Linux amd64` Job **116887692120 success**。此前仅在 OpenClaw 复现的 APT 沙箱问题没有被写入正式 Dockerfile，也未在 GitHub CI 上复现。
- **A22-02 / A22-03 / A22-04 / A22-05 质量与 Review**：同一 CI Run 的 `Validate` Job **116887692656 success**，覆盖 `pnpm validate`、方法/类型及文档生成清单、Go Race/覆盖率、TypeScript 类型与测试、Playwright、真实 Lithograph v0.3.1 集成与文档 Cypher 示例。31 方法/75 类型/132 页文档、无 Skill MCP `tools/list` / `docs.read`、权限和路径拒绝、函数/Procedure 清单均已在本地及 CI 所检查的源码中得到验证。
- **交付边界**：Phase 22 的完成指代码、文档和必要验收完成，不代表新镜像已经部署 Dev、推送 GHCR、发布 Tag 或进入生产。关闭状态与路线图的文档提交是后续独立 Git SHA，其 CI 仍需按该 SHA 再次核对；不得用实施提交的结果冒充不同 SHA 的通过记录。
