# KG OS 开发计划

本目录把[设计文档集](../design.md)中已经确认的产品与技术设计拆成可连续执行、可验证的开发阶段。Design 定义系统行为与边界；Development 只定义实现依赖、交付单位、状态、验收和完成证据。本地安装与命令操作见[开发指南](../guide/development.md)。

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
| `done` | 实现、全部阶段验收、Review、文档同步及该阶段要求的远端门禁全部完成 |

状态只描述当前仓库的真实证据。配置存在不等于远端门禁通过；本地验证不等于 CI、发布或部署已经完成。

## 4. 当前基线

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

**Phase 14 Web 当前为 `deferred`。** 保留原阶段范围与计划；2026-10-13 已提前完善 App Shell 的独立布局组件、Design Tokens、响应式和纯前端开发 / 检查入口。2026-10-14 P14-00 Web 国际化（English / 简体中文、语言偏好、现有 Shell/认证及 MCP 授权弹窗双语化）**已在当前工作树实现并通过定向单元/浏览器测试**；真实内嵌交付与完整 A14/阶段验收未完成，原 P14-01–11 业务 Feature 保留。不作为 MCP 的前置依赖，详见[Phase 14](phases/14-web.md)与[Web 国际化设计](../design/web.md#国际化与语言偏好)。

**Phase 15 MCP & Private Plugin 已为 `done`。** 按 D91/D92 已实现独立 TypeScript MCP、四个 Tool、QuickJS/Worker 受控 SDK、Linux amd64 Docker-only、官方 Skill 源文件与 MCP-only 私人 Plugin 模板；Linux Dev 31/31 SDK 方法、持久化重启、真实 ChatGPT OAuth/四 Tool 已验收，提交 [`ea37ddf`](https://github.com/bYiyLi/kg-os/commit/ea37ddfca8c69bc701de0bb41d10d465f92c6b64) 的 [CI Run #65](https://github.com/bYiyLi/kg-os/actions/runs/38261156640) 为 **Ubuntu Validate + 六平台 Runtime 7/7 success**。Phase 15 的旧 MCP 验收保留为历史；新 `kgosd` 单进程 Go MCP 与私人 Skill 的真实客户端验收已作为 [Phase 16](phases/16-kgosd-unified-mcp.md) `done` 独立关闭。按 [D94](../design/decisions.md#d94-openclaw-docker-development-and-ci)，Mac 不跑 Docker，OpenClaw 开发测试，GitHub Actions CI 必须构建并测试 Docker。旧 Phase 关闭不受影响；GHCR 正式发布和生产部署另行授权。

**Phase 17 MCP Unified Auth & Web Authorization 按用户明确批准的验收例外关闭为 `done`（2026-10-14）。** [D95](../design/decisions.md#d95-unified-mcp-web-authorization) 规定 MCP 复用 Instance Token 作为唯一根身份、移除独立 MCP 管理员 Token，并使用现有 Web 登录状态和连接授权弹窗完成 ChatGPT OAuth；Go 仍负责 OAuth 协议与 Token 管理。**本 Phase 只负责 MCP 认证和与 Web 的最小对接，不开发 Web 登录/Session、页面架构或其它业务模块**；当前工作树已完成 Go Web Session 集成测试、MCP 浏览器 E2E 4/4、Web 53/53，以及隔离 Linux Docker 31/31 SDK Smoke。正式 Dockerfile 的 Linux amd64 Dev 构建与部署已通过（2026-10-14，最新主题镜像 `sha256:6c67e96e381f97fa1764fc5e994cd488498d018ae3b361d2d46da6f1e4c6f6c3`，只读自动验收及 HTTPS 主题资源检查通过）；用户报告新 ChatGPT OAuth 重新授权测试成功。**未执行推送后的 GitHub CI 及完整新版隔离 Docker 矩阵**：用户明确批准不等待这些门禁直接关闭本 Phase，未完成项作为例外保留，绝不记为 CI 通过。详见 [Phase 17](phases/17-mcp-web-authorization.md)。

**Phase 18 ChatGPT Embedded Web 按用户批准的远端 CI 验收例外关闭为 `done`（2026-10-14）。** [D96](../design/decisions.md#d96-chatgpt-mcp-apps-web) 的 Browser / MCP Apps 双入口、`global` + `thread` 元数据、Go app-only UI Tool/Resource 与 Bridge 只读 `overview` 已在本阶段源码中实现。Mac `pnpm validate`、Web Vitest **86/86**、Playwright **26/26**、OpenClaw Dev Docker 与隔离 **31/31 SDK Smoke** 均通过；用户提供两张真实 ChatGPT 双入口截图，确认刷新、主题、语言、分支筛选交互“正常”。**对应本次源码的 GitHub Actions / 六平台 CI 未运行，不记为通过**，用户明确同意不等待 CI 关闭本 Phase；详见 [Phase 18 关闭记录](phases/18-chatgpt-embedded-web.md#阶段关闭记录2026-10-14用户批准例外)。Phase 14 仍 `deferred`，业务 Feature 不转移到本阶段。

**Phase 19 KG OS Observability 已完成（`done`，2026-10-15）。** 依据 [D97](../design/decisions.md#d97-kgos-observability) 与 [Observability 设计](../design/observability.md)，JSON Logs、关键业务/安全事件、HTTP/MCP/Kernel Request ID、进程内 Metrics、受保护的诊断 API 和本地日志轮转已实现。Mac `pnpm validate`（覆盖率 90.0%）、隔离 Docker（31/31 SDK、重启持久化）、从 clean `0bc47ee` 正式部署的 Dev（诊断授权 200、匿名 401）均通过；最终修复提交 [`aef5dbc`](https://github.com/bYiyLi/kg-os/commit/aef5dbce6dd243172d48085950d7a96465e65c66) 的 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38693436299) 全绿。Phase 14 仍 `deferred`，Phase 16–18 既有记录不变；未执行正式 Release/生产部署。详见 [Phase 19 完成证据](phases/19-observability.md#完成条件与当前证据)。

**Phase 20 MCP Tool Prompt & SDK Help 当前为 `in_progress`（2026-10-15）。** 按 [D98](../design/decisions.md#d98-mcp-sdk-help-prompt-contract) 优化 Tool/参数/Server Instructions，并从现有 `@kgos/sdk` 公共方法和 TypeScript 类型生成无网络的 `help(name?)` 自描述目录，供 TS SDK 和 Go MCP Sandbox 同步使用。不增加 MCP 业务 Tool、HTTP API 或 Plugin/Skill 改动；实施和验收见 [Phase 20](phases/20-mcp-tool-help.md)。本阶段门禁不能沿用 Phase 19 结果。

**Phase 21 Docker-only Distribution & CI Simplification 当前为 `in_progress`（2026-10-15）。** [D99](../design/decisions.md#d99-linux-amd64-docker-only-distribution) 决定 KG OS 未来仅交付 Linux amd64 Docker：普通 CI 收敛为 Ubuntu Validate + 单镜像 Docker Smoke，Tag Release 不再发布 npm/六平台 Native 包。历史 v0.2.1/npm/Phase 08–13 的完成结果保留但不成为新的发布承诺；具体 Feature、Acceptance 与本轮证据见 [Phase 21](phases/21-docker-only-delivery.md)。Phase 20 原实现的远端 CI 失败是历史 Run 的事实，不可用尚未执行的 Phase 21 CI 结果取代。

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
| [14 Web](phases/14-web.md) | `deferred` | 单一 Web Phase：P14-00 本地双语资源、语言切换与现有 Shell/认证/MCP 授权界面国际化已实现并有定向测试证据；其余为连接与 `.kgos/web` 持久基础、独立查询帧、Knowledge / Ontology 编辑、版本演化及真实 Runtime / 打包 / 六平台验收。完整阶段验收尚未完成 | [Web 国际化](../design/web.md#国际化与语言偏好)、[Web owner](../design/web.md)、[统一材料入口](../design/web-materials.md)、现有 SDK / 业务 API 与 Phase 00–13 基线 |
| [15 MCP & Private Plugin](phases/15-mcp.md) | `done` | 旧独立 TypeScript MCP、四 Tool、QuickJS/Worker、Linux amd64 Docker-only、官方 Skill 文件与 MCP-only 私人 Plugin；Linux Dev、真实 ChatGPT、最终 Ubuntu Validate + 六平台 CI 7/7 全部通过，未发布 GHCR | [完成证据](phases/15-mcp.md#阶段完成记录2026-10-12)、[D91](../design/decisions.md#d91-mcp-docker-only-delivery)、[D92](../design/decisions.md#d92-mcp-dev-acceptance-and-release-ci) |
| [16 `kgosd` Unified MCP](phases/16-kgosd-unified-mcp.md) | `done` | 单进程 Go `kgosd` Web/API/MCP、QuickJS-NG/wazero、OAuth、私人 Plugin/Skill 已实现并部署 Dev；隔离 Docker 31/31 SDK、ChatGPT OAuth 重连及测试 Branch 写入回读、Codex 新会话主动加载 Skill、旧 Node MCP 源码清理已验收；实现提交 `813bff4` 的 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38353358947) 全绿，正式 GHCR/生产部署未执行 | [完成证据](phases/16-kgosd-unified-mcp.md#当前实现与验收证据)、[MCP owner](../design/mcp.md)、[D93](../design/decisions.md#d93-kgosd-unified-mcp)、[D94](../design/decisions.md#d94-openclaw-docker-development-and-ci) |
| [17 MCP Unified Auth & Web Authorization](phases/17-mcp-web-authorization.md) | `done`（用户批准例外） | MCP 复用 Instance 认证，Web 弹窗与 OAuth 已部署 Dev 并经用户真实 ChatGPT 重新授权；本地质量和正式 Dev Docker 构建通过；GitHub CI / 全新版隔离矩阵未运行，用户明确批准不阻塞本 Phase 关闭 | [D95](../design/decisions.md#d95-unified-mcp-web-authorization)、[MCP 认证目标](../design/mcp.md#统一-instance-认证与-web-内的-mcp-连接授权phase-17-目标)、Web owner 的已登录上下文与安全提交接口 |
| [18 ChatGPT Embedded Web](phases/18-chatgpt-embedded-web.md) | `done`（用户批准例外） | 双入口、Go UI Tool/Resource、Bridge 实读已实现；Mac `pnpm validate`、Web 86/86、Playwright 26/26、OpenClaw Dev / Docker 31/31 和用户实际 ChatGPT 双入口交互验收通过；GitHub CI / 六平台矩阵未运行，用户明确批准不阻塞阶段关闭 | [D96](../design/decisions.md#d96-chatgpt-mcp-apps-web)、[Web 内嵌适配](../design/web.md#chatgpt-内嵌-webmcp-apps)、[MCP UI 合同](../design/mcp.md#chatgpt-mcp-apps-ui-合同)、Phase 14/16/17 基线 |
| [19 KG OS Observability](phases/19-observability.md) | `done` | JSON Logs、Request ID、关键业务事件、Metrics/诊断 API；Mac 90.0% coverage、隔离 Docker 31/31 SDK、clean-source Dev 和 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38693436299) 完成验收；未发布正式镜像 | [D97](../design/decisions.md#d97-kgos-observability)、[Observability](../design/observability.md)、[Phase 19 完成证据](phases/19-observability.md#完成条件与当前证据) |
| [20 MCP Tool Prompt & SDK Help](phases/20-mcp-tool-help.md) | `in_progress` | 四 Tool 提示词/参数/安全注解、SDK 与 MCP 一致的按需 `help(name?)`、生成校验及回归；旧 8-job Run 中的 Windows 失败不构成新 Docker-only 的未来门禁 | [D98](../design/decisions.md#d98-mcp-sdk-help-prompt-contract)、[MCP SDK Help](../design/mcp.md#mcp-tool-help) |
| [21 Docker-only Distribution & CI Simplification](phases/21-docker-only-delivery.md) | `in_progress` | 全产品 Linux amd64 Docker-only、两 Job CI、单镜像 GHCR Release、删除 npm-only 发布链与多平台候选门禁 | [D99](../design/decisions.md#d99-linux-amd64-docker-only-distribution)、[Docker-only Client](../design/client.md#docker-only-交付) |

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
       Phase 14: Web [deferred]
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
       Phase 20: MCP Tool Prompt & SDK Help [in_progress; D98]
         (Tool metadata → SDK-generated Help → Go/WASM Bridge → Mac / isolated Docker / final CI)
       Phase 21: Docker-only Distribution & CI Simplification [in_progress; D99]
         (single Linux amd64 image → 2 CI jobs → Docker-only Tag Release)
```

Phase 02–13 均已完成，当前公开版本为 **v0.2.1**。Phase 13 实现提交 `01f0c99f650dd672f35bbe430e8c7b2f6b03ffe8` 的本地/fresh-source/packed/中英文 PTY 与 CI Run `36505717058` 均已通过；后续独立发布 revision `cd8307fb015f697d4db2958a2040b3cd5d32d2b8` 的 CI Run `36509929726` 全绿，`v0.2.1` tag 指向同一 revision。首次 Release Run `36510797281` 因 registry propagation timeout 在六个 Runtime 已发布后停止；Recovery Run `36514243605` 复用 verified `release-set`，最终完成八包 exact-version/`latest=0.2.1`、六平台 public-registry smoke 与 GitHub Release。Phase 12 的 `v0.2.0`、Phase 09 的 `v0.1.0`、Phase 11 的 `v0.1.1` 继续保留为历史发布基线。[Phase 14 Web](phases/14-web.md) 保持 `deferred`；[Phase 15 MCP](phases/15-mcp.md) 以 `ea37ddf` / CI 7/7 成功关闭为 `done`；[Phase 16 Go 原生 MCP](phases/16-kgosd-unified-mcp.md) 为 `done`，真实 ChatGPT OAuth/隔离写入及 Codex Skill 验收完成，最终实现提交 `813bff4` 的 [GitHub CI 8/8](https://github.com/bYiyLi/kg-os/actions/runs/38353358947) 全部成功；[Phase 17 MCP 统一认证](phases/17-mcp-web-authorization.md) 按用户批准例外关闭为 `done`，2026-10-14 的真实 ChatGPT 重新授权来自用户验收，不以 Phase 16 替代；本阶段未执行 GitHub CI / 全新版隔离矩阵，不得声称已通过。Docker 正式 Release/部署另行授权。

## 6. Phase 通用完成标准

每个 Phase 的具体 Acceptance 由对应文件维护。所有 Phase 共同要求：

1. Scope 内能力真实实现，不用 mock、空入口或示例结果代替核心行为。
2. Targeted tests、必要集成测试和阶段级验收全部通过。
3. 成功路径以及会改变 correctness、security、transaction、storage 或 recovery 的失败路径均有验证。
4. Phase review 完成，范围内 finding 已关闭；没有 unrelated refactor、临时样本、secret 或 generated junk。
5. 设计、开发计划、开发指南、README 和 vlog 按各自职责同步。
6. `git diff --check`、Markdown、本地链接和仓库要求的完整质量门禁通过。
7. Phase 文件要求的远端 CI / matrix 有实际成功结果；仅有 workflow 配置时保持 `in_progress`。

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
- [开发指南](../guide/development.md)
- [设计到实现的工程映射](../design/implementation.md)
