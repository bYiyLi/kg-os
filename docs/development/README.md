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

**Phase 09 MVP Release Closure 当前为 `blocked`。** 首个公开 MVP baseline 已冻结为 `0.1.0` + `latest`；`v*` tag-trigger / existing-tag recovery、candidate provenance/aggregation、partial publish recovery、OIDC-ready publish、registry verification、四平台 clean `npx` smoke 与 GitHub Release dependency chain 已实现。`@kgos` organization、owner authority、短期 bootstrap secret 与 `v0.1.0` tag 已真实就绪；六个 `0.1.0` package 已全部公开并可由 public registry 解析，`latest` 均指向 `0.1.0`。当前正在关闭 npm 首发的区域传播竞态并完成 publish verification；post-publish 四平台 matrix、Trusted Publisher 配置与 GitHub Release 尚未完成。完整范围与 Acceptance 见[Phase 09](phases/09-mvp-release-closure.md)。

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
| [09 MVP Release Closure](phases/09-mvp-release-closure.md) | `blocked` | `0.1.0` / `latest` 六包 public publish 已完成；四平台 registry npx、Trusted Publisher 与 GitHub Release等待最终 closure | [Client版本关系](../design/client.md#版本关系)、[发布与验证边界](../design/client.md#发布与验证边界)、[Phase 08](phases/08-typescript-client-npm-runtime.md) |

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
  -> later Web / Skill phases
```

Phase 02–08 均已完成；Phase 08 的本地实现、迁移清理、主工作树完整 validation、独立 fresh-source、final review 与实际 pushed revision 的跨平台远端 matrix 均已有真实成功证据。Phase 09 当前为 `blocked`：`0.1.0` / `latest`、tag-triggered Release tooling、`@kgos` owner authority、bootstrap secret、`v0.1.0` tag push 与六包 public publish 已取得真实证据；当前剩余工作是关闭 npm registry 区域传播竞态、完成四平台 post-publish matrix、Trusted Publisher 配置与 GitHub Release。Web / Skill 不属于 Phase 09。

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
- [开发指南](../guide/development.md)
- [设计到实现的工程映射](../design/implementation.md)
