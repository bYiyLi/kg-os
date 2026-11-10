# KG OS 开发计划

## 2026-11-06 批量人工验收结项

用户明确确认 Phase 14、25、26、27、28、29、30、32、33、34 人工验收通过，阶段管理状态均为 `done`。未实现、未完整交付与未独立验收的内容在各 Phase 顶部保留；本次结项不表示原完整 Acceptance 或自动门禁已经全部通过。下文较早的 `in_progress` 及失败记录保留当时历史事实。

> 2026-11-05：当前官方 Skill 源码调整为八项专业职责、单一 Plugin 和统一发行版本，见 [Phase 28](phases/28-official-skill-roster.md) 与 [D125](../design/decisions.md#d125-unified-eight-skill-plugin)。该整合不代表既有阶段的真实客户端或正式发行验收已完成。

本目录把[设计文档集](../design.md)中已经确认的产品与技术设计拆成可连续执行、可验证的开发阶段。Design 定义系统行为与边界；Development 只定义实现依赖、交付单位、状态、验收和完成证据。本地安装与命令操作见[开发指南](../guide/development.md)。

先按目标进入：[路线与阶段入口](#5-路线总览)、[通用完成标准](#6-phase-通用完成标准)、[状态定义](#3-状态模型)。实现任务读取相关 Phase，不为单项改动加载全部历史；第 4 节和旧发布叙述是带日期的基线记录，不替代当前代码、Release 或部署核验。

## 1. 文档职责

| 内容 | 唯一位置 |
| --- | --- |
| 产品行为、结构、接口、数据与运行时决定 | [`docs/design/`](../design.md) |
| 阶段顺序、Feature、状态、Acceptance、Review 与完成证据 | 本目录及 [`phases/`](phases/) |
| 安装、启动、调试、检查、测试和打包步骤 | [开发指南](../guide/development.md) |
| 实际开发过程记录 | [`docs/vlog/`](../vlog/) |

阶段计划引用 Design Inputs，不复制或改写产品合同。设计尚未确定时，Development 只能记录准确 gap，不能用实现计划替代设计决定。

## 2. 开发执行模型

```text
Design baseline
     ↓
Phase plan
     ↓
Feature dependency order
     ↓
Implementation
     ↓
Targeted validation
     ↓
Phase acceptance
     ↓
Review findings closure
     ↓
Documentation and status sync
```

Feature 是实现单元，Phase 是默认交付与验收单元。Feature 完成、代码已经存在或某一条测试通过，都不能单独替代 Phase acceptance。

## 3. 状态模型

| 状态 | 含义 |
| --- | --- |
| `planned` | 目标已进入路线，但 Design Inputs、依赖或 Acceptance 尚未全部满足 |
| `ready` | Design Inputs、前置依赖、Feature 顺序和 Acceptance 已齐全，可以开始实现 |
| `deferred` | 原本可实施，但根据当前优先级决定暂缓；保留设计与计划，恢复前重新核对现状 |
| `in_progress` | 正在实现、验证、Review 或关闭阶段验收缺口 |
| `blocked` | 存在当前仓库、设计真源或已授权能力无法解决的真实阻塞 |
| `done` | 通常表示实现、验收、Review 及远端门禁完成；用户明确批准人工结项时也可标为 `done`，但必须列出未实现与未验收的例外，不能冒充自动验收成功 |

状态只描述当前仓库的真实证据。配置存在不等于远端门禁通过；本地验证不等于 CI、发布或部署已经完成。

## 4. 当前基线

以下是保留的历史实施记录，当前状态以本页人工结项声明、路线表及各 Phase 顶部为准。

**当前 Phase 00 为 `done`。** D65/D66 定义的 Go `kgosd` / Kernel / `kg` CLI + TypeScript SDK/Web 工程基线已经完成；Go 1.27.1、`go.mod` tool dependencies、gofmt/vet/Staticcheck/test/race/90% coverage/govulncheck、统一 `pnpm check:quick` / `pnpm validate`、真实 Lithograph v0.3.0 smoke、native artifact、独立 fresh-source setup/validate 与本地 Phase Review 均已取得证据。实现提交 `b4046d3a9a9e8941e74ef0af93e47818b4e94dee` 已推送到 `main`，Ubuntu 24.04 x64 GitHub Actions run `35672012795` 成功。

2026-09-19 的 TypeScript / Node.js Phase 00 曾真实完成：本地 gates 与提交 `20d73cd` 对应的 Ubuntu 24.04 GitHub Actions run `35454190185` 成功。该证据完整保留在 [Phase 00](phases/00-engineering-foundation.md) 的历史章节，但只证明被 D65 supersede 的旧工程基线。

**Phase 01 当前为 `done`。** `KG_HOME` / config / credential、extension resolver、Go bundled SQLite + Lithograph v0.3.0 host、query/execute context、`lithograph_rows()` true streaming/context cancellation、Provider readiness/cache mapping、SQL explicit transaction、single-instance lock 与 shutdown lifecycle均已实现并完成本地/远端验收。实现提交 `f7f679e0601c7ecd16f5409f58c9c3483796948f` 已推送到 `main`，Ubuntu 24.04 x64 GitHub Actions run `35687991251` / Validate job `106618819461` 成功。业务 API / Knowledge Base bootstrap 仍不属于本 Phase。

旧 Phase 01 TypeScript / `ffi-rs` / 自制 SQLite runtime / v0.2.x 实现尝试已经从当前工程基线清理；原 Phase 00 重复 Lithograph execution smoke也已在 Phase 01实现时删除，`internal/lithographtest`只保留 bundled SQLite build-profile测试。正式 bundled SQLite connection lifecycle、Runtime host与transaction adapter已经进入当前 `main` 基线；业务数据库语义与Knowledge Base bootstrap仍由后续 Phase拥有。

Phase 01 的 credential 范围仍只是 `auth.json` 生成/读取与 runtime secret ownership；Phase 02 已在其上完成 Ontology data routes 的统一 Bearer authentication、Knowledge Base bootstrap 与正式 `kg ontology` client surface。D72 的 `doctor/install + KG_HOME/KG_TOKEN` 模型曾由 Phase 03 完成并进入 `main`，因此相关完成证据仍是当前实现事实；2026-09-24 已由 [D75](../design/decisions.md#d75-typescript-client)、[D76](../design/decisions.md#d76-npm-distribution)、[D77](../design/decisions.md#d77-explicit-instance-root) 决定在 Phase 08 迁移为 TypeScript SDK/CLI + npm/npx + explicit `--root`。这项新设计不回写或取消 Phase 03 的历史完成证据。

**Phase 02 当前为 `done`。** Knowledge Base bootstrap、internal semantic graph / Binding、Ontology read/edit、Ontology-scoped Object Patch、Schema/Constraint/Index compiler、authenticated HTTP 与正式 `kg ontology` CLI均已实现并完成本地/远端验收。实现提交 `8e776043337bcda24a271f84af1c04fc0da515cc` 已推送到 `main`；主工作树完整 `pnpm validate`、独立 fresh-source setup + full validation、forced pre-commit、final diff/review与真实 Lithograph v0.3.0 native suite均成功，Ubuntu 24.04 x64 GitHub Actions run `35804756510` / Validate job `107002937680` 成功。Knowledge Object、Graph 与 Evolution Core 后续已分别在 Phase 04 / 05 / 06 完成；SDK/Web/Skill仍在后续。

**Phase 03 当前为 `done`。** `kg doctor` 只读诊断、`kg install` 完整显式配置、中英文 human-facing CLI、`KG_TOKEN -> auth.json` 本机 credential resolution、package artifact discovery/integrity，以及业务命令在 daemon stopped 时自动拉起 `kgosd` 均已实现并完成本地/远端验收。实现提交 `c15a6c062ea457c7a72c90a59f46b77b4ae5c053` 已推送到 `main`；macOS arm64 主工作树 full validation、独立 fresh-source、真实 packaged PTY en/zh install、真实 Lithograph v0.3.0 首次/并发 auto-start、Phase Review，以及 Ubuntu 24.04 x64 GitHub Actions run `35834430037` / Validate job `107094383436` 均成功。

**Phase 04 当前为 `done`。** 五类 Object batch read、Knowledge Node/Relationship公共投影、通用 batch Object Patch、mixed Ontology+Knowledge transaction、authenticated daemon adapter 与正式 `kg object read/patch` 已实现并完成本地/远端验收。主工作树完整 `pnpm validate` 与独立 fresh-source `pnpm run setup && pnpm validate` 均通过，Go statement coverage 为 **90.2%**、jscpd 为 0 clones，Phase Review 无剩余 task-affecting finding；`object list/search` 仍按 D73 不存在。实现提交 `d1b4d8ccd792d009496596141520e0a930ae9ef3` 已推送到 `main`，Ubuntu 24.04 x64 GitHub Actions run `35870467442` / Validate job `107212896176` 成功。

**Phase 05 当前为 `done`。** `kg graph query/execute`、authenticated JSON/NDJSON HTTP、State pin / fresh Branch checkout、Lithograph JSON passthrough、Full-text / Semantic / Raw Vector public path、CLI Runtime auto-start，以及 cancellation / disconnect / partial-durability hardening 已完成并通过 Review。主工作树完整 `pnpm validate` 与独立 fresh-source `pnpm run setup && pnpm validate` 均成功，Go statement coverage **90.0%**、jscpd 0 clones；实现提交 `324fa67358ca6c2cbdc558ac8df6f60bf64bfaf7` 已推送到 `main`，Ubuntu 24.04 x64 GitHub Actions run `35893218908` / Validate job `107290569875` 成功。

**Phase 06 当前为 `done`。** Overview / Get / Ancestry、State / State Data、Branch / Tag、History / Diff、authenticated HTTP 与正式 `kg evolution` Core CLI 已完成；Review 已闭环 cursor pinning/frontier、typed Lithograph error category、invalid consistency issue、shared resource/continuity 与 `state.create` parent-CAS/writer boundary。实现提交 `2c2f4cb914a45b7a09d719a88008f0b5dc854df9` 已推送到 `main`；主工作树完整 `pnpm validate` 与独立 fresh-source `pnpm run setup && pnpm validate` 均成功，Go statement coverage **90.0%**、jscpd 0 clones、race/govulncheck/Playwright/native/package/license/audit/diff gates 全部通过，Ubuntu 24.04 x64 GitHub Actions run `35951315990` / Validate job `107480271083` 成功。

**Phase 07 Evolution Merge Session 当前为 `done`。** Merge Session 的产品合同、CLI surface、公共错误与 invalid State 边界继续由 Evolution / CLI / Contracts / D41 冻结；public conflict projection / resolution reverse mapping、exact-revision candidate consistency validation、authenticated HTTP 与正式 `kg evolution merge` 七个命令已完成。实现提交 `bd31b748359f85ae95cca919c7deffb62f3c7a0c` 已推送到 `main`；主工作树完整 `pnpm validate` 与独立 fresh Git checkout 的 `pnpm run setup && pnpm validate` 均成功，Go statement coverage **90.1%**、race/govulncheck/Playwright/native/package/license/audit/diff gates 全部通过；final diff/review 无剩余 task-affecting finding。Review 已闭环 public aggregate path、rename continuity、shared resource display ref、conflict pagination cursor、strict CLI resolution input 与 explicit null/absence serialization 等边界；Ubuntu 24.04 x64 GitHub Actions run `35982570257` / Validate job `107577711342` 成功。

**Phase 08 TypeScript Client & npm Runtime Distribution 当前为 `done`。** 公共 `@kgos/sdk`、TypeScript `@kgos/cli`、显式 `--root`、`init/doctor`、per-root dynamic daemon、platform npm Runtime package builder / candidate smoke 已实现，并在 parity 通过后删除 Go `kg`。实现提交 `aaf249a1f4862887e1fd16bfc44f47cebd6fb5e6` 已推送到 `main`；主工作树完整 `pnpm validate` 与独立 fresh-source `pnpm run setup && pnpm validate` 均成功，Go statement coverage **90.0%**、TypeScript statements/lines/functions **100%**、jscpd **0 clones**，race/govulncheck/Playwright/native/package/license/audit/diff gates 全绿，final review 无剩余 task-affecting finding。GitHub Actions run `36103842748` 的 Validate job `107971924426` 与四个平台 native/package jobs（macOS x64 `107971924614`、Linux arm64 `107971924657`、macOS arm64 `107971924688`、Linux x64 `107971924773`）全部成功。完整范围与 Acceptance 见[Phase 08](phases/08-typescript-client-npm-runtime.md)。

**Phase 09 MVP Release Closure 当前为 `done`。** Release Run `36219384704` 为 `success`，验收时六个 `0.1.0` package 与 `latest` 已重新验证，四平台 public-registry `npx` smoke全部成功，GitHub Release `KG OS v0.1.0` 已发布。六包 Trusted Publisher 均绑定 `bYiyLi/kg-os` / `release.yml` 并启用直接 `npm publish`，publishing access 已收紧为必须 2FA、禁止 bypass token；临时 GitHub `NPM_TOKEN` secret 与 npm `kgos-v0.1.0-bootstrap` token均已删除。长期 OIDC publish workflow closure 提交 `26fd22f26967ee429ec982c37e5871e7dbc12f5b` 已推送到 `main`，GitHub Actions CI Run `36226930183` 的 Validate 与四个平台 Native Runtime jobs 全部成功。完整范围与 Acceptance 见[Phase 09](phases/09-mvp-release-closure.md)。

**Phase 10 Runtime & CLI Hardening 当前为 `done`。** pooled write connection清理、official Jieba与默认值、CLI help/pretty、Provider错误诊断和packed回归已完成。实现提交 `f138d41c15ba16578e76829af452458a2321be7e` 已推送到 `main`；macOS arm64主工作树完整`pnpm validate`、独立fresh-source`pnpm run setup && pnpm validate`、repo外packed真实外部Provider验收及 GitHub Actions CI run `36256273631` 的 Validate与四平台native/package jobs均通过。本阶段未发布新的public版本。逐项证据见[Phase 10](phases/10-runtime-cli-hardening.md)。

**Phase 11 Windows Runtime CI 验收与六平台发布当前为 `done`。** Windows x64/arm64 native DLL、npm Runtime package、CLI 启动与 packed smoke 已在真实 runner 验收；发布源码 `1509eaf` 的 Validate 与六平台 native/package CI 全绿。`v0.1.1` 的八包、六平台 public-registry `npx` smoke 与 GitHub Release 已成功；两个 Windows package 的 Trusted Publisher、严格 publishing access 与短期首发凭据清理已完成，长期工作流已移除 bootstrap token 路径，收尾代码的六平台 CI Run `36289992799` 全绿。详见[Phase 11](phases/11-windows-runtime-acceptance.md)。

**Phase 12 First-Run & CLI Productization 当前为 `done`，并已作为 v0.2.0 正式发布。** Workspace Root→`.kgos`、`--root > KGOS_ROOT`、完整 init/readiness/recovery、additional extension setup、doctor 与分层 help 已完成实现与多轮 review；本地/fresh-source/packed/PTY/dev 与阶段六平台 CI 均通过。后续独立发布授权将版本提升至 `0.2.0`；发布 revision `ac5eda19cc6d7cc849f8036419143c80c1b6427d` 的 CI Run `36407257662` 全绿，Release Run `36410721397` 成功完成六平台 candidates、八包纯 OIDC npm publish、exact-version/`latest` verification、六平台 public-registry `npx` smoke 与 GitHub Release。完整工作与 Acceptance 见[Phase 12](phases/12-first-run-cli-productization.md)。

**Phase 13 Init Wizard UX & Embedding Credential Boundary 当前为 `done`，并已随后作为 v0.2.1 正式发布。** D84 已实现：credential env-value 从 init / 普通 CLI / `kgosd` startup 前置条件移到实际 Semantic Provider operation，doctor 改为 current-CLI-process non-blocking 诊断，TTY wizard 改为清晰 defaults、custom-extension 语义与字段级 retry。主工作树完整 `pnpm validate`、独立 fresh-source `setup && validate`、packed no-key smoke 与 macOS arm64 中英文 repo-out TTY first-run 均通过；实现提交 `01f0c99f650dd672f35bbe430e8c7b2f6b03ffe8` 与 CI Run `36505717058` 已闭环。后续独立 release revision `cd8307fb015f697d4db2958a2040b3cd5d32d2b8` 的 CI Run `36509929726` 全绿，Recovery Release Run `36514243605` 完成八包 `0.2.1` / `latest`、六平台 public-registry smoke 与 GitHub Release。详见[Phase 13](phases/13-init-wizard-credential-boundary.md)。

**历史记录：Phase 14 Web 当时为 `in_progress`（2026-10-28：领域树与 Branch 历史弹窗已有本地交付证据；本轮另推进 [Q3 单画布搜索与真实图谱浏览](phases/14-web.md#单画布搜索与图谱浏览增量2026-10-28)，其余业务链继续暂缓）。** 保留单一 Web Phase 与原 P14-01–11 范围；[V7 领域树与历史弹窗增量](phases/14-web.md#领域树与-branch-历史弹窗2026-10-28)已完成真实 Branch → Domain → 子 Domain、行末历史图标、居中真实 DAG 弹窗及双入口只读适配。[最终验收](phases/14-web.md#领域树增量实施与验收证据)记录 dirty 工作树 891 项输入指纹一致、完整 `pnpm validate` exit 0（540.87 秒）、506 项前端测试、58 项浏览器用例、真实临时 Runtime 与 12 层/320/375px 实测通过；两轮失败及修复仍保留。[V6 导航](phases/14-web.md#平铺世界与设置入口收敛2026-10-25)和[五分类设置](phases/14-web.md#五分类设置增量2026-10-25)保留各自历史证据，不替代本轮结果。本轮右侧改为顶部简单搜索与单画布局部探索，替代旧查询编辑器/结果帧流；用户已确认关键词＋全文＋向量三路混合检索，本次只读增量已完成本地实现、完整门禁与真实浏览器验收，见 [Q3 本地证据](phases/14-web.md#单画布增量本地实施与验收证据)；完整 P14-04/05 仍未完成。本体图/编辑与 Web 持久化未完成，不以导航或画布局部增量关闭整个阶段；本轮未提交、推送、部署或执行远程 CI/真实 ChatGPT 宿主验收，不作为 MCP 前置依赖。详见[Phase 14](phases/14-web.md)与[Web owner](../design/web.md#版本区域)。

[图谱直接操作体验增量](phases/14-web.md#图谱直接操作体验增量2026-10-28)已完成本地实现与验收：Q3 布局上的双击展开/收起、节点拖动固定、画布平移、缩放/触屏、右键菜单、搜索种子连边与有界动态布局已通过本轮回归和实际交互验收；Vitest 793 项、完整 Playwright 69 项通过，其中图谱真实 Runtime 专项为 9 项。首轮 Q3 证据独立保留，整个 Phase 14 仍为 `in_progress`，本轮未提交、推送或部署。

[历史切换体验优化](phases/14-web.md#历史切换体验优化2026-10-28)亦已完成本地实现与验收：显式切换反馈、持续版本摘要、阅读位置与并发保护通过定向及组合验收，并在 922 项固定输入的完整门禁中通过；该局部完成不改变 Phase 14 的 `in_progress` 状态。

**Phase 15 MCP & Private Plugin 已为 `done`。** 按 D91/D92 已实现独立 TypeScript MCP、四个 Tool、QuickJS/Worker 受控 SDK、Linux amd64 Docker-only、官方 Skill 源文件与 MCP-only 私人 Plugin 模板；Linux Dev 31/31 SDK 方法、持久化重启、真实 ChatGPT OAuth/四 Tool 已验收，提交 [`ea37ddf`](https://github.com/bYiyLi/kg-os/commit/ea37ddfca8c69bc701de0bb41d10d465f92c6b64) 的 [CI Run #65](https://github.com/bYiyLi/kg-os/actions/runs/38261156640) 为 **Ubuntu Validate + 六平台 Runtime 7/7 success**。Phase 15 的旧 MCP 验收保留为历史；新 `kgosd` 单进程 Go MCP 与私人 Skill 的真实客户端验收已作为 [Phase 16](phases/16-kgosd-unified-mcp.md) `done` 独立关闭。按 [D94](../design/decisions.md#d94-openclaw-docker-development-and-ci)，Mac 不跑 Docker，OpenClaw 开发测试，GitHub Actions CI 必须构建并测试 Docker。旧 Phase 关闭不受影响；GHCR 正式发布和生产部署另行授权。

**Phase 17 MCP Unified Auth & Web Authorization 按用户明确批准的验收例外关闭为 `done`（2026-10-14）。** [D95](../design/decisions.md#d95-unified-mcp-web-authorization) 规定 MCP 复用 Instance Token 作为唯一根身份、移除独立 MCP 管理员 Token，并使用现有 Web 登录状态和连接授权弹窗完成 ChatGPT OAuth；Go 仍负责 OAuth 协议与 Token 管理。**本 Phase 只负责 MCP 认证和与 Web 的最小对接，不开发 Web 登录/Session、页面架构或其它业务模块**；当前工作树已完成 Go Web Session 集成测试、MCP 浏览器 E2E 4/4、Web 53/53，以及隔离 Linux Docker 31/31 SDK Smoke。正式 Dockerfile 的 Linux amd64 Dev 构建与部署已通过（2026-10-14，最新主题镜像 `sha256:6c67e96e381f97fa1764fc5e994cd488498d018ae3b361d2d46da6f1e4c6f6c3`，只读自动验收及 HTTPS 主题资源检查通过）；用户报告新 ChatGPT OAuth 重新授权测试成功。**未执行推送后的 GitHub CI 及完整新版隔离 Docker 矩阵**：用户明确批准不等待这些门禁直接关闭本 Phase，未完成项作为例外保留，绝不记为 CI 通过。详见 [Phase 17](phases/17-mcp-web-authorization.md)。

**Phase 18 ChatGPT Embedded Web 按用户批准的远端 CI 验收例外关闭为 `done`（2026-10-14）。** [D96](../design/decisions.md#d96-chatgpt-mcp-apps-web) 的 Browser / MCP Apps 双入口、`global` + `thread` 元数据、Go app-only UI Tool/Resource 与 Bridge 只读 `overview` 已在本阶段源码中实现。Mac `pnpm validate`、Web Vitest **86/86**、Playwright **26/26**、OpenClaw Dev Docker 与隔离 **31/31 SDK Smoke** 均通过；用户提供两张真实 ChatGPT 双入口截图，确认刷新、主题、语言、分支筛选交互“正常”。**对应本次源码的 GitHub Actions / 六平台 CI 未运行，不记为通过**，用户明确同意不等待 CI 关闭本 Phase；详见 [Phase 18 关闭记录](phases/18-chatgpt-embedded-web.md#阶段关闭记录2026-10-14用户批准例外)。Phase 14 仍 `deferred`，业务 Feature 不转移到本阶段。

**Phase 19 KG OS Observability 已完成（`done`，2026-10-15）。** 依据 [D97](../design/decisions.md#d97-kgos-observability) 与 [Observability 设计](../design/observability.md)，JSON Logs、关键业务/安全事件、HTTP/MCP/Kernel Request ID、进程内 Metrics、受保护的诊断 API 和本地日志轮转已实现。Mac `pnpm validate`（覆盖率 90.0%）、隔离 Docker（31/31 SDK、重启持久化）、从 clean `0bc47ee` 正式部署的 Dev（诊断授权 200、匿名 401）均通过；最终修复提交 [`aef5dbc`](https://github.com/bYiyLi/kg-os/commit/aef5dbce6dd243172d48085950d7a96465e65c66) 的 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38693436299) 全绿。Phase 14 仍 `deferred`，Phase 16–18 既有记录不变；未执行正式 Release/生产部署。详见 [Phase 19 完成证据](phases/19-observability.md#完成条件与当前证据)。

**Phase 20 MCP Tool Prompt & SDK Help 已为 `done`（2026-10-15）。** [D98](../design/decisions.md#d98-mcp-sdk-help-prompt-contract) 的 Tool/参数/Server Instructions、31 个 SDK 方法的按需 `help(name?)`、TS SDK / Go MCP Sandbox 共享类型均已实现；Mac/隔离 Linux Docker/真实 Dev MCP 查询通过，现行两 Job [GitHub CI Run 38734363706](https://github.com/bYiyLi/kg-os/actions/runs/38734363706) **2/2 success**。旧六平台 npm CI 失败保持原始记录，由 D99 取代其将来发行门禁，不冒称旧 Run 通过。完整证据见 [Phase 20](phases/20-mcp-tool-help.md)。

**Phase 21 Docker-only Distribution & CI Simplification 已为 `done`（2026-10-15）。** [D99](../design/decisions.md#d99-linux-amd64-docker-only-distribution) 将未来官方交付收敛为 Linux amd64 Docker；普通 CI 只保留 Ubuntu Validate + 单镜像 Docker Smoke，Tag Release 不再发布 npm/六平台 Native。Mac `pnpm validate`、OpenClaw 隔离 31/31 SDK、最终提交 [`32b7584`](https://github.com/bYiyLi/kg-os/commit/32b75841c72745b5504518bc63f7e12f50871915) 的 [GitHub CI 2/2](https://github.com/bYiyLi/kg-os/actions/runs/38734363706) 均通过。新 Tag Release 尚未正式执行，正式 GHCR 发布与生产部署独立授权。验收见 [Phase 21](phases/21-docker-only-delivery.md)。

**Phase 22 MCP Self-Describing Docs & Lithograph v0.3.1 已为 `done`（2026-10-16）。** [D100](../design/decisions.md#d100-mcp-self-describing-docs) 的 MCP `docs.read()`、31 方法/75 类型/132 页文档、KG OS Cypher 25 手册与旧 Help 清理，以及 [D101](../design/decisions.md#d101-lithograph-v031-upgrade) 的 v0.3.1 主扩展/Provider 对齐均已实现。Mac `pnpm validate`、无 Skill 的真实 MCP 文档/权限调用、v0.3.1 Cypher 示例、OpenClaw 隔离 Docker 31/31 SDK 和重启持久化通过；实施提交 [`a84ce5e`](https://github.com/bYiyLi/kg-os/commit/a84ce5ef40f56e0f95fc115a8140200623faf88e) 的 [CI Run 38874967382](https://github.com/bYiyLi/kg-os/actions/runs/38874967382)、最终关闭提交 [`96c2bc8`](https://github.com/bYiyLi/kg-os/commit/96c2bc81abfda19aaf957fa1bdb904ef3010e2fb) 的 [CI Run 38877016123](https://github.com/bYiyLi/kg-os/actions/runs/38877016123) 均为 **Ubuntu Validate + 原样 Linux amd64 Docker 2/2 success**。该最终提交已通过 `pnpm dev:mcp deploy` 部署至 Dev，镜像 `sha256:937176426e387d2c25f90077a668afc36fa300e869f2a2aa0cce4d2b5801ace7`，部署后只读 MCP 文档、隔离 31/31 SDK 及健康检查通过；**未执行 Tag、GHCR Release 或生产部署**。详见 [Phase 22 关闭记录](phases/22-mcp-self-describing-docs.md#阶段关闭记录2026-10-16)。

**Phase 23 MCP Tool Taxonomy & Batch Docs 已为 `done`（2026-10-17）。** [D102](../design/decisions.md#d102-mcp-tool-taxonomy-and-batch-docs) 五个 AI-facing Tool + app-only `kgos_workspace`、独立批量 `kgos_docs` 与 31 方法/75 类型/133 篇内嵌文档均已实现；隔离 Branch/State 文档缺陷已修复。Mac 完整 `pnpm validate`、OpenClaw 原样 `Dockerfile.unified` 构建与隔离 31/31 SDK/持久化 Smoke 均成功，用户提交的无 Skill ChatGPT 客户端核心验收确认五 Tool/31 SDK（报告总体 `PARTIAL`，未覆盖 UI 主动交互/外部 Provider 等非本阶段门禁）。实施提交 `9cec011` 与修复提交 [`cfa3917`](https://github.com/bYiyLi/kg-os/commit/cfa39173020523b127982f196fd54f7b64905f04) 已推送；最终实现 SHA 的 [GitHub CI Run #39001850377](https://github.com/bYiyLi/kg-os/actions/runs/39001850377) 两 Job **2/2 success**。Dev 已部署并通过验收，正式 Tag/GHCR/生产发布未执行。详见 [Phase 23 阶段关闭记录](phases/23-mcp-tool-taxonomy-and-docs.md#阶段关闭记录2026-10-17)。

**Phase 24 Lithograph v0.3.3 Upgrade 已为 `done`（2026-10-19）。** 按 [D103](../design/decisions.md#d103-lithograph-v033-upgrade)已对齐主扩展/Provider、本机与 Docker 版本校验、MCP Cypher 手册和固定上游链接；真实旧库兼容、Mac 完整质量与 OpenClaw 隔离镜像 31/31 SDK、重启及清理验收通过，Review 发现的取消测试假阳性与 Smoke 清理错误已修复并复验。实施提交 [`bbcd091`](https://github.com/bYiyLi/kg-os/commit/bbcd0915af1d996c674781e6d1b853b4d36b2891) 已推送到 `main`，确切 SHA 的 [CI Run 39149281181](https://github.com/bYiyLi/kg-os/actions/runs/39149281181) 两个 Job **2/2 success**；原有 Plugin 改动未纳入提交。新增上游 execution options 没有进入现有 Graph 请求，长期 Dev、新 Tag/GHCR 与生产部署未执行。详见 [Phase 24 关闭记录](phases/24-lithograph-v033-upgrade.md#阶段关闭记录2026-10-19)。

**历史记录：Phase 25 KG OS Doctor v1 当时为 `in_progress`。** 初版 `kgos-doctor` v1.0.0 与 Global AI Guidance v1 的证据见 [Phase 25 源码交付记录](phases/25-kgos-doctor.md#doctor-skill-v1-evidence)；后续 Doctor v1.2.0 / 唯一 Global AI Guidance 正文及知识持续可用责任衔接由 [Phase 32](phases/32-knowledge-use-readiness.md#guidance-v3-responsibility-optimization)记录。D1–D5 保持只读诊断，不新增模型、API 或 Scheduler；私人 Plugin 安装、真实宿主激活及完整阶段门禁尚未完成，不提前标记 `done`。

**历史记录：Phase 26 Web-first Token-first 初始化与 Runtime Bootstrap 当时为 `in_progress`（2026-10-25）。** 本地未提交工作树已实现受限 Web、完整 TOML 自动初始化、先于鉴权的业务门禁、四步 Token-first Web/认证/私有 Key 与真实数据库 Bootstrap/receipt，并取消已认证向量测试的目的 IP 类型限制。D110 Mac 完整 `pnpm validate` 已通过：Web 定向 Vitest **345/345**、完整 Playwright **56/56**、Go 全包/Race/覆盖率（≥90%）及其余本地质量门禁；后续一次小范围 Session 恢复导航修正按定向验证单独记录。历史 Linux Docker 31/31 SDK 与先前工作树相关，**未对 D110 最终代码重新执行 Docker/Dev 验收**。Commit、Push 与最终 pushed SHA 的公开 CI 两 Job 尚未执行，**不能标记 `done`**。见 [D110](../design/decisions.md#d110-token-first-setup)、[Runtime](../design/runtime.md#web-first-run-bootstrap) 和 [Phase 26 D110 验收](phases/26-web-first-run-bootstrap.md#d110-实施与-mac-验收记录2026-10-25)。

**历史记录：Phase 27 当时为 `in_progress`（D122，2026-11-02）**。当前推进五套基础本体固定原文导航、渐进读取与独立适配、本体身份及 Knowledge 内容质量规范、旧模型库退出；本增量采用结果 Review 和确定性分发检查，交 draft PR，不运行案例/模型评测。此前 Ontology 统一本体建模与知识世界选择，包含 KG OS 方法论、三组实测案例和确认模板；Knowledge 统一检索写入维护，VLog Skill 提供可选事件中心图本体与 Cypher。当前本地实施与验收材料见 [Phase 27](phases/27-knowledge-standards-skills.md)、[D117](../design/decisions.md#d117-ontology-methodology-and-skill-renaming)；真实客户端、最终远端 CI 仍待验收，历史测试记录保留。

**历史记录：Phase 28 当时为 `in_progress`（D115，2026-10-27）**。待发布源码目标四 Skill（三规范 + Doctor），已发布的 v0.3.5 七 Skill 私人 Plugin/安装手册保持不变；新候选的真实客户端、发布验收未完成。见 [Phase 28](phases/28-official-skill-roster.md)。

**历史记录：Phase 34 MCP 对外健壮性与 OAuth 生命周期为 `in_progress`。** 按用户批准的新合同实施统一结果、异常兜底、持久授权、滚动刷新与签名重试；范围、验收及真实证据见 [Phase 34](phases/34-mcp-resilience.md)，缺失门禁不以局部成功替代。

## 5. 路线总览

| Phase | 状态 | 交付结果 | 主要输入 |
| --- | --- | --- | --- |
| [00 Engineering Foundation](phases/00-engineering-foundation.md) | `done` | Go 1.27.1 daemon/kernel/CLI + TypeScript SDK/Web workspace、pinned Go quality tools、bundled CGO/SQLite+FTS5 baseline、90% coverage/race/security gates、真实 v0.3.0 smoke、macOS arm64 + Ubuntu 24.04 x64 native证据 | [D65](../design/decisions.md#d65-go-runtime)、[D66](../design/decisions.md#d66-lithograph-v030-sql-only) |
| [01 Runtime & Lithograph Host Foundation](phases/01-runtime-lithograph-host.md) | `done` | `KG_HOME`、config/credential、extension resolver、Go read/write SQLite host、v0.3.0 SQL execution/stream/cancel、explicit tx、runtime ownership | [Runtime](../design/runtime.md)、[Go 数据库接入](../design/implementation.md#go-运行时与数据库接入) |
| [02 Ontology](phases/02-ontology.md) | `done` | KG OS bootstrap、internal semantic graph / Binding、Ontology read/edit/Patch、Schema/Constraint/Index compiler、authenticated HTTP + `kg ontology` | [Ontology](../design/ontology.md)、[Object Patch](../design/object.md#object-公共调用合同)、[Bootstrap](../design/architecture.md#knowledge-base-bootstrap) |
| [03 Installation & Runtime Onboarding](phases/03-installation-runtime-onboarding.md) | `done` | `kg doctor`、`kg install`、完整显式 config、en/zh、人机双路径 installer、本机 credential fallback、业务命令 Runtime auto-start | [D72](../design/decisions.md#d72-local-install-runtime-onboarding)、[CLI](../design/cli.md)、[Runtime](../design/runtime.md) |
| [04 General Object Read & Patch](phases/04-object.md) | `done` | 五类 Object batch read、Knowledge Node/Relationship投影、通用 batch Patch、CLI text/file/stdin 输入；本地/fresh-source/Ubuntu CI验收完成 | [D73](../design/decisions.md#d73-object-read-patch-surface)、[Object](../design/object.md)、[CLI](../design/cli.md) |
| [05 Graph Query & Execute](phases/05-graph.md) | `done` | `kg graph query/execute`、authenticated HTTP、JSON/NDJSON、Full-text / Semantic / Lithograph JSON passthrough、cancellation与transport hardening；本地/fresh-source/Ubuntu CI验收完成 | [Graph](../design/graph.md)、[Graph CLI](../design/cli.md#graph-cli)、[Streaming](../design/runtime.md#graph-http-streaming-framing) |
| [06 Evolution Core](phases/06-evolution-core.md) | `done` | State / State Data、Branch / Tag、Overview / Get / Ancestry、History / Diff、authenticated HTTP 与 `kg evolution` Core CLI；本地/fresh-source/Ubuntu CI 验收完成，不含 Merge | [Evolution](../design/evolution.md)、[Evolution CLI](../design/cli.md#evolution-cli)、[公共错误合同](../design/contracts.md#公共错误合同) |
| [07 Evolution Merge Session](phases/07-evolution-merge.md) | `done` | Merge Session adapter、public conflict projection、渐进 resolution、exact-revision candidate consistency、finalize/abort、authenticated HTTP 与 `kg evolution merge` CLI；本地/fresh-source/Ubuntu CI 验收完成 | [Evolution Merge](../design/evolution.md#evolution-公共调用合同)、[Merge CLI](../design/cli.md#merge-session)、[D41](../design/decisions.md#d41-evolution-merge-使用-lithograph-merge-session-渐进解决冲突) |
| [08 TypeScript Client & npm Runtime Distribution](phases/08-typescript-client-npm-runtime.md) | `done` | 真实 `@kgos/sdk`、TypeScript `@kgos/cli`、explicit `--root`、`init`、per-root daemon/dynamic endpoint、platform npm native Runtime package、Go CLI parity迁移与清理；本地/fresh-source/final review与 macOS arm64/x64 + Linux glibc arm64/x64 CI matrix均完成 | [Client](../design/client.md)、[CLI](../design/cli.md)、[Runtime](../design/runtime.md)、[D75](../design/decisions.md#d75-typescript-client)、[D76](../design/decisions.md#d76-npm-distribution)、[D77](../design/decisions.md#d77-explicit-instance-root) |
| [09 MVP Release Closure](phases/09-mvp-release-closure.md) | `done` | `v0.1.0` 六包、四平台 registry npx、GitHub Release、六包 Trusted Publisher/credential cleanup与长期 OIDC closure均完成 | [Client版本关系](../design/client.md#版本关系)、[发布与验证边界](../design/client.md#发布与验证边界)、[Phase 08](phases/08-typescript-client-npm-runtime.md) |
| [10 Runtime & CLI Hardening](phases/10-runtime-cli-hardening.md) | `done` | 本地与fresh-source完整验证、repo外packed真实Provider、macOS arm64/x64 + Linux glibc arm64/x64 CI native/package matrix全部通过 | [D78](../design/decisions.md#d78-operation-scoped-branch)、[D79](../design/decisions.md#d79-stale-daemon-recovery)、[D80](../design/decisions.md#d80-official-jieba)、[Runtime](../design/runtime.md)、[CLI](../design/cli.md) |
| [11 Windows Runtime CI 验收与六平台发布](phases/11-windows-runtime-acceptance.md) | `done` | 六平台 CI、`0.1.1` 八包、六平台 registry smoke、GitHub Release、Windows Trusted Publisher 与 credential cleanup 均完成 | [Client](../design/client.md#npm-package-topology)、[Runtime](../design/runtime.md#native-runtime-package) |
| [12 First-Run & CLI Productization](phases/12-first-run-cli-productization.md) | `done` | Workspace Root / `.kgos`、`KGOS_ROOT`、complete init/readiness/recovery、extension setup、responsibility-scoped high-density help、fresh-user acceptance；本地/fresh-source/六平台 CI 验收与 v0.2.0 八包/六平台正式发布完成 | [D81](../design/decisions.md#d81-workspace-root)、[D82](../design/decisions.md#d82-init-readiness)、[D83](../design/decisions.md#d83-cli-progressive-disclosure) |
| [13 Init Wizard UX & Embedding Credential Boundary](phases/13-init-wizard-credential-boundary.md) | `done` | clear defaults/custom-extension prompts、TTY field retry、operation-time Embedding credential、doctor non-blocking diagnostic；main/fresh-source/packed/TTY + six-platform CI acceptance complete，后续 v0.2.1 八包/六平台正式发布完成 | [D84](../design/decisions.md#d84-late-bound-embedding-credential)、[CLI](../design/cli.md#init)、[Runtime Embedding](../design/runtime.md#embedding-配置与索引映射) |
| [14 Web](phases/14-web.md) | `done`（人工验收） | 混合检索、图谱探索与版本导航已交付；Knowledge/本体编辑、完整 DAG/Diff/Merge 与 Web 持久化仍未完整实现；用户人工验收结项。 | [Web 国际化](../design/web.md#国际化与语言偏好)、[Web owner](../design/web.md)、[统一材料入口](../design/web-materials.md)、现有 SDK / 业务 API 与 Phase 00–13 基线 |
| [15 MCP & Private Plugin](phases/15-mcp.md) | `done` | 旧独立 TypeScript MCP、四 Tool、QuickJS/Worker、Linux amd64 Docker-only、官方 Skill 文件与 MCP-only 私人 Plugin；Linux Dev、真实 ChatGPT、最终 Ubuntu Validate + 六平台 CI 7/7 全部通过，未发布 GHCR | [完成证据](phases/15-mcp.md#阶段完成记录2026-10-12)、[D91](../design/decisions.md#d91-mcp-docker-only-delivery)、[D92](../design/decisions.md#d92-mcp-dev-acceptance-and-release-ci) |
| [16 `kgosd` Unified MCP](phases/16-kgosd-unified-mcp.md) | `done` | 单进程 Go `kgosd` Web/API/MCP、QuickJS-NG/wazero、OAuth、私人 Plugin/Skill 已实现并部署 Dev；隔离 Docker 31/31 SDK、ChatGPT OAuth 重连及测试 Branch 写入回读、Codex 新会话主动加载 Skill、旧 Node MCP 源码清理已验收；实现提交 `813bff4` 的 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38353358947) 全绿，正式 GHCR/生产部署未执行 | [完成证据](phases/16-kgosd-unified-mcp.md#当前实现与验收证据)、[MCP owner](../design/mcp.md)、[D93](../design/decisions.md#d93-kgosd-unified-mcp)、[D94](../design/decisions.md#d94-openclaw-docker-development-and-ci) |
| [17 MCP Unified Auth & Web Authorization](phases/17-mcp-web-authorization.md) | `done`（用户批准例外） | MCP 复用 Instance 认证，Web 弹窗与 OAuth 已部署 Dev 并经用户真实 ChatGPT 重新授权；本地质量和正式 Dev Docker 构建通过；GitHub CI / 全新版隔离矩阵未运行，用户明确批准不阻塞本 Phase 关闭 | [D95](../design/decisions.md#d95-unified-mcp-web-authorization)、[MCP 认证目标](../design/mcp.md#统一-instance-认证与-web-内的-mcp-连接授权phase-17-目标)、Web owner 的已登录上下文与安全提交接口 |
| [18 ChatGPT Embedded Web](phases/18-chatgpt-embedded-web.md) | `done`（用户批准例外） | 双入口、Go UI Tool/Resource、Bridge 实读已实现；Mac `pnpm validate`、Web 86/86、Playwright 26/26、OpenClaw Dev / Docker 31/31 和用户实际 ChatGPT 双入口交互验收通过；GitHub CI / 六平台矩阵未运行，用户明确批准不阻塞阶段关闭 | [D96](../design/decisions.md#d96-chatgpt-mcp-apps-web)、[Web 内嵌适配](../design/web.md#chatgpt-内嵌-webmcp-apps)、[MCP UI 合同](../design/mcp.md#chatgpt-mcp-apps-ui-合同)、Phase 14/16/17 基线 |
| [19 KG OS Observability](phases/19-observability.md) | `done` | JSON Logs、Request ID、关键业务事件、Metrics/诊断 API；Mac 90.0% coverage、隔离 Docker 31/31 SDK、clean-source Dev 和 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38693436299) 完成验收；未发布正式镜像 | [D97](../design/decisions.md#d97-kgos-observability)、[Observability](../design/observability.md)、[Phase 19 完成证据](phases/19-observability.md#完成条件与当前证据) |
| [20 MCP Tool Prompt & SDK Help](phases/20-mcp-tool-help.md) | `done` | 四 Tool 提示词、31/31 SDK Help、Dev 真实插件调用、隔离 Docker、[CI 2/2](https://github.com/bYiyLi/kg-os/actions/runs/38734363706) | [D98](../design/decisions.md#d98-mcp-sdk-help-prompt-contract)、[MCP SDK Help](../design/mcp.md#mcp-tool-help) |
| [21 Docker-only Distribution & CI Simplification](phases/21-docker-only-delivery.md) | `done` | 全产品 Linux amd64 Docker-only、两 Job CI 2/2、单镜像 Release workflow、npm-only 交付链清理；GHCR 正式发行独立授权 | [D99](../design/decisions.md#d99-linux-amd64-docker-only-distribution)、[Docker-only Client](../design/client.md#docker-only-交付) |
| [22 MCP Self-Describing Docs & Lithograph v0.3.1](phases/22-mcp-self-describing-docs.md) | `done` | v0.3.1 主扩展与 Provider 版本对齐；MCP `docs.read()` + 31 方法/75 类型/132 页源码生成文档 + KG OS Cypher 25 手册和组合 Guides；隔离 Docker/Ubuntu Validate [CI 2/2](https://github.com/bYiyLi/kg-os/actions/runs/38874967382) 验收完成 | [D100](../design/decisions.md#d100-mcp-self-describing-docs)、[D101](../design/decisions.md#d101-lithograph-v031-upgrade)、[MCP](../design/mcp.md#mcp-tool-help) |
| [23 MCP Tool Taxonomy & Batch Docs](phases/23-mcp-tool-taxonomy-and-docs.md) | `done` | 五个 AI Tool + app-only UI、批量 Docs/133 篇指南、31 SDK；Mac 全量、OpenClaw 原样 Docker/31 SDK、客户端核心、最终 SHA [CI 2/2](https://github.com/bYiyLi/kg-os/actions/runs/39001850377) 通过；客户端非本阶段范围保留实测限制 | [D102](../design/decisions.md#d102-mcp-tool-taxonomy-and-batch-docs)、[MCP](../design/mcp.md#mcp-tool-help) |
| [24 Lithograph v0.3.3 Upgrade](phases/24-lithograph-v033-upgrade.md) | `done` | v0.3.3 制品/手册、真实旧库兼容、Mac 完整质量、OpenClaw 隔离镜像 31/31 SDK 与重启/清理，以及最终实施 SHA [CI 2/2](https://github.com/bYiyLi/kg-os/actions/runs/39149281181) 均通过；未部署/发布 | [D103](../design/decisions.md#d103-lithograph-v033-upgrade)、[Graph](../design/graph.md#graph)、[Runtime](../design/runtime.md#lithograph-调用入口) |
| [25 KG OS Doctor v1](phases/25-kgos-doctor.md) | `done`（人工验收） | Doctor 已可用；Plugin 版本自动读取未实现，真实宿主 D0–D6 完整验收缺独立报告；用户人工验收结项。 | [D118](../design/decisions.md#d118-kgos-doctor-six-checks)、[D120](../design/decisions.md#d120-doctor-official-ontology-review)、[MCP Doctor](../design/mcp.md#kgos-doctor-v1) |
| [26 Web-first Setup & Runtime Bootstrap](phases/26-web-first-run-bootstrap.md) | `done`（人工验收） | Token-first Setup 已实现；空实例 Docker/并发与异常恢复的完整 A26 矩阵仍未独立核对；用户人工验收结项。 | [D105](../design/decisions.md#d105-web-first-run-and-runtime-bootstrap)、[Runtime](../design/runtime.md#web-first-run-bootstrap)、[Web](../design/web.md#web-first-run-setup)、[Setup 错误](../design/contracts.md#初始化门禁与-setup-错误) |
| [27 KG OS Knowledge Standards Skills](phases/27-knowledge-standards-skills.md) | `done`（人工验收） | 知识规范已归入八项专业 Skill；真实客户端自动选择及跨连接行为尚无完整独立验收；用户人工验收结项。 | [D117](../design/decisions.md#d117-ontology-methodology-and-skill-renaming)、[MCP规范体系](../design/mcp.md#kgos-standards-skill-suite) |
| [28 Official Skills & Legacy kgos Retirement](phases/28-official-skill-roster.md) | `done`（人工验收） | v0.3.17 单一八 Skill Plugin 已发行；旧私人 Plugin 迁移与完整行为验收未逐项核对；用户人工验收结项。 | [D125](../design/decisions.md#d125-unified-eight-skill-plugin)、[八 Skill 清单](../design/mcp.md#kgos-official-skills) |
| [29 Web shadcn/ui Migration](phases/29-web-shadcn-ui.md) | `done`（人工验收） | shadcn/ui 与 Lucide 迁移已交付；历史依赖审计与间歇 Toast 断言仍缺单项销案；用户人工验收结项。 | [Web UI 体系](../design/web.md#通用-ui-组件体系) |
| [30 Private Source & Public Releases](phases/30-private-source-public-releases.md) | `done`（人工验收） | v0.3.17 候选 CI/正式 Release 已成功；GitHub 外部协作者权限配置仍缺验证；用户人工验收结项。 | [Phase 30](phases/30-private-source-public-releases.md) |
| [31 Public Product Website](phases/31-public-product-website.md) | `done` | 官网既有验收记录，与产品正式发行独立 | [Phase 31](phases/31-public-product-website.md) |
| [32 知识使用就绪性与场景回归](phases/32-knowledge-use-readiness.md) | `done`（人工验收） | 知识使用引导已交付；跨连接真实使用和恢复全矩阵未独立验收；用户人工验收结项。 | [D111](../design/decisions.md#d111-task-scoped-knowledge-loading)、[D112](../design/decisions.md#d112-global-ai-guidance-and-daily-responsibility)、[MCP 日常职责](../design/mcp.md#global-ai-guidance-and-daily-responsibility)、既有 Ontology/Graph/Evolution 合同 |
| [33 Domain 范围检索与 AI SDK](phases/33-domain-scoped-search.md) | `done`（人工验收） | Domain Scope 正式生产查询实测成功；历史图谱 Playwright 间歇失败尚缺独立归因；用户人工验收结项。 | [Graph Scope](../design/graph.md#read-only-graph-view-与-domain-范围lithograph-v034)、[Web Domain 搜索](../design/web.md#domain-选择与-graph-view-的-ui-范围) |
| [34 MCP Resilience & OAuth Lifecycle](phases/34-mcp-resilience.md) | `done`（人工验收） | MCP/OAuth 已发行；真实宿主自然 24 小时刷新和生产签名续期未独立完整验收；用户人工验收结项。 | [Phase 34](phases/34-mcp-resilience.md) |
| [35 SQLite 运行观测与诊断工作台](phases/35-observability-workbench.md) | `in_progress`（主要代码已落地；最终 CI 待完成） | 已实现 OTel Go Trace + 有界 SQLite/优先队列、资源趋势、保护 API/SDK 与 OBS1 Web；全量浏览器验收 83/83 通过，隔离 1 GiB Docker 完成损坏、权限、磁盘满、锁冲突、SIGKILL、软容量场景；正式 Dockerfile 与最终 revision 公开 CI 尚缺，不标 `done` | [D126](../design/decisions.md#d126-sqlite-observability-workbench)、[Observability](../design/observability.md)、[Web 工作台](../design/web.md#运行观测工作台d126phase-35-目标)、[Phase 35](phases/35-observability-workbench.md) |
| [36 通用 MCP OAuth 客户端兼容](phases/36-host-neutral-mcp-oauth.md) | `in_progress`（Go/Web 代码及专项测试通过，完整验收待完成） | 已实现并局部验证通用 CIMD、安全 DCR/SSRF、SQLite v1→v2、Web 授权与新 Scope/Token；仍需全仓 Validate、隔离 Docker/公开 CI 及真实 Muse/ChatGPT 验收；与 Phase 35 并行 | [D127](../design/decisions.md#d127-host-neutral-mcp-oauth)、[MCP Host-neutral OAuth](../design/mcp.md#host-neutral-mcp-oauth)、[Phase 17](phases/17-mcp-web-authorization.md)、[Phase 34](phases/34-mcp-resilience.md) |
| [37 Ontology Binding 增量编译](phases/37-incremental-binding-compiler.md) | `in_progress`（本地与 OpenClaw Linux 验收通过；用户已授权保留 Public 源仓库并推送/发行 v0.3.20，远端候选 CI 与正式 Release 待验收） | 纯 Knowledge Patch 0 次 Binding 写入、17/19/20 次 Lithograph 执行；505 Binding、1 GiB/no-swap 两轮各 671 请求，峰值 359–376 MiB、0 OOM、0 意外失败；8 路独立 Branch 吞吐 7.17–7.34 writes/s；同 Branch 8 路竞争 1 提交 + 7 stale；Go Race、31/31 MCP Smoke；Mac `pnpm validate` exit 0（Go 90.1%、Web branch 90.31%、Playwright 85/85） | [Implementation 增量编译](../design/implementation.md#增量-binding-编译与纯-knowledge-patch)、[Phase 37](phases/37-incremental-binding-compiler.md) |
| [38 Relationship 写入与可恢复诊断](phases/38-relationship-write-diagnostics.md) | `in_progress`（Lithograph v0.3.5 正式制品与 Mac/Linux 隔离验收通过，最终 Git SHA 公开 CI 尚缺） | 两段 MATCH 单 Patch 原子事务、Tool/Operation/Span 安全诊断；v0.3.5 NodeIdSeek 旧/新查询均 6 dbHits；正式 Dockerfile、31/31 SDK Smoke、Source/Claim 505 Binding + 752/1502/2002 Node 1 GiB/no-swap 并发及 SIGKILL 通过、无 OOM；Commit 前已过期 context、连接失效与**真实 Commit SQL 的 SQLite IO ERROR**、Constraint 及中途取消均有回读回滚测试。测试专用无 Observer 镜像的 Off/On/Off 同机性能对照完成，未观察到确定性 P95 恶化；8 Branch锁争用已实测为SQLite BUSY 5秒耗尽，write busy等待保持15秒、read保留5秒；新增只在事务开始前短片段250 ms和Context取消的安全BUSY等待，避免已取消请求被SQLite忙处理器拖住（不重放任何Mutation/Commit）；原4条write连接和8条read连接不变；新版Mac定向Race连续3轮及Linux 1GiB/无Swap的两轮505 Binding/2002 Node最大压力与31/31 SDK验收均通过，取消请求及时生效；还需最终精确 Git SHA 公开 CI，极端 Commit SQL 内部超时/介质损坏未单独复现 | [Object Relationship](../design/object.md#knowledge-relationship-的内部创建与查询成本)、[Observability](../design/observability.md#patch-stage-diagnostics)、[Phase 38](phases/38-relationship-write-diagnostics.md) |

独立改进阶段：[Phase 32：知识使用就绪性与场景回归](phases/32-knowledge-use-readiness.md)（`done`，2026-11-06 用户人工验收结项，保留缺项）。模型扩展、初始化指导、名称/Message 引导、检索与登录主题已取得源码或隔离验证证据；跨环境客户端与整体验收仍待继续，且与Phase 25/27/28原有验收分开。

当前实现依赖顺序：

```text
Go Engineering Foundation
  -> runtime / explicit Instance Root / extension loading / Lithograph SQL adapter
  -> Phase 02: Knowledge Base bootstrap + complete Ontology
       (reserved schema / semantic graph / Binding / read / edit / Patch / compiler)
  -> Phase 03: Installation & Runtime Onboarding
       (doctor / install / complete config / i18n / local credential / auto-start)
  -> Phase 04: General Object Read & Patch
       (batch read / Knowledge Node+Relationship / batch patch)
  -> Phase 05: Graph Query & Execute
       (query / execute / HTTP / NDJSON / Full-text / Semantic)
  -> Phase 06: Evolution Core
       (State / State Data / Branch / Tag / Ancestry / History / Diff)
  -> Phase 07: Evolution Merge Session
       (start / list / get / conflicts / resolve / candidate validation / finalize / abort)
  -> Phase 08: TypeScript Client & npm Runtime Distribution
       (@kgos/sdk / @kgos/cli / --root / init / per-instance kgosd / npm native runtime)
  -> Phase 09: MVP Release Closure
       (release version / npm publish / registry npx matrix / Git tag / GitHub Release)
  -> Phase 10: Runtime & CLI Hardening
       (connection state isolation / stale daemon recovery / official Jieba / CLI UX / diagnostics)
  -> Phase 11: Windows Runtime CI acceptance and six-platform release
       (win32 x64/arm64 native packages / real runner load / packed smoke / registry)
  -> Phase 12: First-Run & CLI Productization
       (Workspace Root / .kgos / KGOS_ROOT / complete init / help / fresh-user acceptance)
  -> Phase 13: Init Wizard UX & Embedding Credential Boundary
       (clear prompts / TTY retry / operation-time embedding credential / doctor non-blocking diagnostic)
  -> 后续独立安排的范围：
       Phase 14: Web [done; 2026-11-06 人工验收结项，保留缺项]
         (i18n foundation / connection / .kgos/web / independent frames / aggregate editing / versions / real acceptance)
       Phase 15: MCP & Private Plugin [done; old TypeScript MCP / Plugin]
       Phase 16: kgosd Unified MCP [done; D93/D94]
         (Go/WASM feasibility → unified listener → Go MCP/OAuth → four Tools → Docker → Plugin → parity & cleanup)
       Phase 17: MCP Unified Auth & Web Authorization [done; user-approved CI exception; D95]
         (Instance credential reuse → OAuth Web handoff → authenticated consent API → real ChatGPT acceptance)
       Phase 18: ChatGPT Embedded Web [done; user-approved CI exception; D96]
         (shared React shell → MCP Apps Go resource / global+thread → Bridge overview → real host + Docker / CI)
       Phase 19: KG OS Observability [done; D97; Mac / Dev / 8-job CI]
         (slog / rotation → request correlation → confirmed business events → metrics / diagnostics → acceptance)
       Phase 20: MCP Tool Prompt & SDK Help [done; D98; Dev + 2-job CI]
         (Tool metadata → SDK-generated Help → Go/WASM Bridge → Mac / isolated Docker / final CI)
       Phase 21: Docker-only Distribution & CI Simplification [done; D99; 2-job CI]
         (single Linux amd64 image → 2 CI jobs → Docker-only Tag Release)
       Phase 22: MCP Self-Describing Docs & Lithograph v0.3.1 [done; D100/D101]
         (v0.3.1 native/Docker baseline → SDK TypeDoc/TSDoc → docs.read →
          KG OS Cypher manual/Guides → isolated Docker + no-Skill MCP/CI)
       Phase 23: MCP Tool Taxonomy & Batch Docs [done; D102]
         (five AI-facing Tool names → independent batch kgos_docs →
          AI task navigation/Ontology/Patch guides → real MCP/AI + Docker CI)
       Phase 24: Lithograph v0.3.3 Upgrade [done; D103]
         (same-version artifacts/manual → compatibility + cancellation →
          Mac quality + OpenClaw isolated Docker → final SHA CI)
       Phase 25: KG OS Doctor v1 [done; 2026-11-06 人工验收结项，保留缺项]
         (official guidance context → MCP/Knowledge Bases → Skill environment →
          content/spec → external maintenance tasks/VLog → real-client acceptance)
       Phase 26: Web-first Token-first Setup & Runtime Bootstrap [done; 2026-11-06 人工验收结项，保留缺项]
         (limited HTTP before config → init-first auth gate → Instance Token/Web wizard →
          shared Kernel bootstrap/receipt → real Docker/browser/API/MCP acceptance)
       Phase 27: KG OS Knowledge Standards Skills [done; 2026-11-06 人工验收结项，保留缺项]
         (preserve earlier standards evidence → current professional responsibilities →
          source review and remaining client acceptance)
       Phase 28: Official Eight Skills & Legacy Skills Retirement [done; 2026-11-06 人工验收结项，保留缺项]
         (eight bounded responsibilities → one Plugin and shared release version →
          source/resource/distribution checks → real client validation)
       Phase 29: Web shadcn/ui Migration [done; 2026-11-06 人工验收结项，保留缺项]
       Phase 30: Private Source & Generated Public kg-releases [done; 2026-11-06 人工验收结项，保留缺项]
         (private source → allowlisted public generation/sync → source-pinned public CI →
          public Docker Release → remote verification → retire legacy private CI)
       Phase 31: Public Product Website [done]
       Phase 32: Knowledge Use Readiness [done; 2026-11-06 人工验收结项，保留缺项]
       Phase 33: Domain Scope Search [done; 2026-11-06 人工验收结项，保留缺项]
       Phase 34: MCP/OAuth Resilience [done; 2026-11-06 人工验收结项，保留缺项]
       Phase 35: SQLite Observability Workbench [in_progress; code implemented, final acceptance pending]
         (slog/Request IDs → bounded SQLite/WAL diagnostic store → OTel Go Trace SDK/Exporter →
          time-series and runtime events → protected read-only API/SDK → Web request-tree/logs → Docker/CI review)
       Phase 36: Host-neutral MCP OAuth [in progress; local implementation/tests, pending full acceptance]
         (Phase 17 Web approval + Phase 34 OAuth store → CIMD safe fetch + DCR registration →
          existing Web consent + token lifecycle regression → real Muse/ChatGPT + CI review)
         (independent of and may run concurrently with Phase 35)
       Phase 38: Relationship 写入与可恢复诊断 [in_progress; Lithograph v0.3.5 正式制品联测通过，公开 CI/故障矩阵待完成]
         (端点查询优化 → Tool/Operation/Span 关联 → OOM/失效注入 → Lithograph 新版联测)
```

**历史发布与阶段基线（非当前状态）**：Phase 02–13 均已完成，历史 npm 最后版本为 **v0.2.1**；Phase 30 当次正式 Linux amd64 Docker 发布基线为 **v0.3.1**（见 [Phase 30](phases/30-private-source-public-releases.md)）。Phase 13 实现提交 `01f0c99f650dd672f35bbe430e8c7b2f6b03ffe8` 的本地/fresh-source/packed/中英文 PTY 与 CI Run `36505717058` 均已通过；后续独立发布 revision `cd8307fb015f697d4db2958a2040b3cd5d32d2b8` 的 CI Run `36509929726` 全绿，`v0.2.1` tag 指向同一 revision。首次 Release Run `36510797281` 因 registry propagation timeout 在六个 Runtime 已发布后停止；Recovery Run `36514243605` 复用 verified `release-set`，最终完成八包 exact-version/`latest=0.2.1`、六平台 public-registry smoke 与 GitHub Release。Phase 12 的 `v0.2.0`、Phase 09 的 `v0.1.0`、Phase 11 的 `v0.1.1` 继续保留为历史发布基线。[Phase 14 Web](phases/14-web.md) 当前推进知识世界与版本导航增量（`in_progress`），其余业务链继续暂缓；[Phase 15 MCP](phases/15-mcp.md) 以 `ea37ddf` / CI 7/7 成功关闭为 `done`；[Phase 16 Go 原生 MCP](phases/16-kgosd-unified-mcp.md) 为 `done`，真实 ChatGPT OAuth/隔离写入及 Codex Skill 验收完成，最终实现提交 `813bff4` 的 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38353358947) 全部成功；[Phase 17 MCP 统一认证](phases/17-mcp-web-authorization.md) 按用户批准例外关闭为 `done`，2026-10-14 的真实 ChatGPT 重新授权来自用户验收，不以 Phase 16 替代；本阶段未执行 GitHub CI / 全新版隔离矩阵，不得声称已通过。Docker 正式 Release/部署另行授权。

## 6. Phase 通用完成标准

每个 Phase 的具体 Acceptance 由对应文件维护。所有 Phase 共同要求：

1. Scope 内能力真实实现，不用 mock、空入口或示例结果代替核心行为。
2. Targeted tests、必要集成测试和阶段级验收全部通过。
3. 成功路径以及会改变 correctness、security、transaction、storage 或 recovery 的失败路径均有验证。
4. Phase review 完成，范围内 finding 已关闭；没有 unrelated refactor、临时样本、secret 或 generated junk。
5. 设计、开发计划、开发指南、README 和 vlog 按各自职责同步。
6. `git diff --check`、Markdown、本地链接和仓库要求的完整质量门禁通过。
7. Phase 文件要求的远端 CI / matrix 有实际成功结果；仅有 workflow 配置时保持 `in_progress`。

2026-11-06 用户人工结项属于例外，不改变默认工程验收标准，也不将未执行项目记为通过。

Commit、push、发布和部署是独立动作。只有实际执行并取得证据后，才能记录对应状态。

## 7. Development Artifacts

- [Phase 00：Engineering Foundation](phases/00-engineering-foundation.md)
- [Phase 01：Runtime & Lithograph Host Foundation](phases/01-runtime-lithograph-host.md)
- [Phase 02：Ontology](phases/02-ontology.md)
- [Phase 03：Installation & Runtime Onboarding](phases/03-installation-runtime-onboarding.md)
- [Phase 04：General Object Read & Patch](phases/04-object.md)
- [Phase 05：Graph Query & Execute](phases/05-graph.md)
- [Phase 06：Evolution Core](phases/06-evolution-core.md)
- [Phase 07：Evolution Merge Session](phases/07-evolution-merge.md)
- [Phase 08：TypeScript Client & npm Runtime Distribution](phases/08-typescript-client-npm-runtime.md)
- [Phase 09：MVP Release Closure](phases/09-mvp-release-closure.md)
- [Phase 10：Runtime & CLI Hardening](phases/10-runtime-cli-hardening.md)
- [Phase 11：Windows Runtime CI 验收与六平台发布](phases/11-windows-runtime-acceptance.md)
- [Phase 12：First-Run & CLI Productization](phases/12-first-run-cli-productization.md)
- [Phase 13：Init Wizard UX & Embedding Credential Boundary](phases/13-init-wizard-credential-boundary.md)
- [Phase 14：Web](phases/14-web.md)
- [Phase 15：MCP & Private Plugin](phases/15-mcp.md)
- [Phase 16：`kgosd` Unified MCP](phases/16-kgosd-unified-mcp.md)
- [Phase 17：MCP Unified Auth & Web Authorization](phases/17-mcp-web-authorization.md)
- [Phase 18：ChatGPT Embedded Web](phases/18-chatgpt-embedded-web.md)
- [Phase 19：KG OS Observability](phases/19-observability.md)
- [Phase 20：MCP Tool Prompt & SDK Help](phases/20-mcp-tool-help.md)
- [Phase 21：Docker-only Distribution & CI Simplification](phases/21-docker-only-delivery.md)
- [Phase 22：MCP 自描述文档与 Lithograph v0.3.1 对齐](phases/22-mcp-self-describing-docs.md)
- [Phase 23：MCP Tool 命名统一与批量文档入口](phases/23-mcp-tool-taxonomy-and-docs.md)
- [Phase 24：Lithograph v0.3.3 依赖升级](phases/24-lithograph-v033-upgrade.md)
- [Phase 25：KG OS Doctor v1 使用环境诊断](phases/25-kgos-doctor.md)
- [Phase 26：Web-first Token-first 初始化与 Runtime Bootstrap](phases/26-web-first-run-bootstrap.md)
- [Phase 27：官方知识规范 Skill 体系](phases/27-knowledge-standards-skills.md)
- [Phase 28：官方 Skill 清单收敛与通用 Skill 退役](phases/28-official-skill-roster.md)
- [Phase 29：Web shadcn/ui 迁移](phases/29-web-shadcn-ui.md)
- [Phase 30：私有代码真源与自动生成的公开 kg-releases](phases/30-private-source-public-releases.md)
- [Phase 31：KG OS 公开产品官网与 GitHub Pages](phases/31-public-product-website.md)
- [Phase 32：知识使用就绪性与场景回归](phases/32-knowledge-use-readiness.md)
- [Phase 33：Domain 范围检索与 AI SDK](phases/33-domain-scoped-search.md)
- [Phase 34：MCP 对外健壮性与 OAuth 生命周期](phases/34-mcp-resilience.md)
- [Phase 35：SQLite 运行观测与请求诊断工作台](phases/35-observability-workbench.md)
- [Phase 36：通用 MCP OAuth 客户端发现与安全授权](phases/36-host-neutral-mcp-oauth.md)
- [Phase 37：Ontology Binding 增量编译与 Knowledge Patch 写入优化](phases/37-incremental-binding-compiler.md)
- [Phase 38：Knowledge Relationship 写入与可恢复故障诊断](phases/38-relationship-write-diagnostics.md)
- [开发指南](../guide/development.md)
- [设计到实现的工程映射](../design/implementation.md)
