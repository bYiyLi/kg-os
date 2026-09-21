# Phase 00：Engineering Foundation

**状态：`ready`**

## 1. 当前目标与范围

在进入 KG OS 业务实现前，建立当前架构需要的 **Go 服务端/Kernel/CLI + TypeScript SDK/Web** 工程基线，使 fresh checkout 能够安装依赖、开发启动、调试、检查、测试、构建，并用真实 Lithograph v0.3.0 release artifact 验证 SQLite loadable-extension 集成。

本 Phase 只建立工程环境和最小真实壳层，不实现 Knowledge Base bootstrap、认证业务 middleware、正式 daemon lifecycle、Ontology / Object / Graph / Evolution 或正式 Web 管理交互。`kg` / `kgosd` 只提供足以验证构建与运行边界的帮助、版本和工程 smoke；不得伪造业务成功状态。

当前语言边界：

```text
Go
├── kgosd
├── Kernel
├── SQLite / Lithograph host
└── kg CLI

TypeScript / npm
├── SDK
└── Web (React + Vite)
```

产品运行时不依赖 Node.js；Node/pnpm 只属于 SDK/Web 与 repository tooling。

## 2. Design Inputs

- [D65 Go runtime](../../design/decisions.md#d65-go-runtime)；
- [D66 Lithograph v0.3.0 SQL-only / Provider-owned cache](../../design/decisions.md#d66-lithograph-v030-sql-only)；
- [v1 运行时与技术分层](../../design/architecture.md#v1-运行时与技术分层)；
- [Web hosting](../../design/runtime.md#web-hosting)；
- [Go 运行时与数据库接入](../../design/implementation.md#go-运行时与数据库接入)。

产品和数据语义继续由 Design owner 维护。本 Phase 只固定当前工程基线、验证入口和真实底层集成。

## 3. 固定工程基线

- Go `1.27.1` 作为当前服务端 / CLI 工具链基线；仓库使用 `go.mod` 固定 minimum/toolchain 要求，CI 与 Phase 00 本地平台验收都必须实际报告 `go1.27.1`，不能把本机其它 Go 版本的成功结果当作当前基线证据。
- SQLite driver 使用 `github.com/mattn/go-sqlite3` bundled SQLite；Phase 实现时固定精确 module version 并提交 `go.sum`。必须启用 CGO 与 `sqlite_fts5` build tag，不使用 `libsqlite3` 系统 SQLite，也不得启用 `sqlite_omit_load_extension`。同一个 bundled native SQLite runtime负责 KG OS main connection 与 Lithograph loadable extension host。
- Node.js / pnpm 继续只为 SDK/Web 与 repository tooling 服务；现有 Node `24.15.0`、pnpm `10.34.5` 可作为迁移起点，Phase 完成时由实际 lock/tool config 冻结。
- Web 使用 React/Vite/TypeScript；生产构建产物进入 `kgosd` binary/交付物并由 Go `net/http` 同端口提供。开发 HMR 可以使用 Vite dev tooling 与代理，不把开发服务器当成产品第二服务。
- Lithograph integration baseline 为 **v0.3.0**、storage format `3`、Cypher profile `CY25-2026.08`、SQLite `3.45.0+`；只验证 SQL surface，不验证已删除的 application Native query ABI。
- 当前 Phase 00 的平台证据冻结为：本地 **macOS arm64** 与远端 **Ubuntu 24.04 x64** GitHub Actions；两边都必须 native CGO build并真实加载对应 Lithograph v0.3.0 artifact。其它 OS / arch 的正式支持矩阵留到 release Phase在真实目标确定后冻结，不把尚未承诺的平台变成当前 Phase blocker。

仓库当前仍存在上一版 TypeScript daemon / kernel / CLI 工程壳层及未提交的旧 Phase 01 代码。它们是迁移输入，不属于当前 Phase 00 完成证据；实现本 Phase 时才按最小范围删除/替换，不在本次文档任务中修改代码。

### 3.1 Go 开发工具

Go 工具链保持最小集合，不引入 `golangci-lint`、独立 task runner 或第二套 formatter。标准工具直接来自 Go `1.27.1`；额外 Go 工具使用 Go module 的 `tool` dependency 固定在 `go.mod` / `go.sum`，通过 `go tool` 执行，不要求开发者全局安装：

| 能力 | 工具与当前固定版本 | 规则 |
| --- | --- | --- |
| Format | `gofmt`（Go 1.27.1） | check 模式必须无待格式化文件；写入格式化只由显式 format 命令执行 |
| Core static analysis | `go vet`（Go 1.27.1） | 对全部 Go package 使用与产品相同的 `sqlite_fts5` build profile |
| Extended static analysis | Staticcheck `2026.2.1` / module `honnef.co/go/tools v0.8.1` | 作为唯一额外 Go linter；零 finding |
| Unit / integration test | `go test`（Go 1.27.1） | 正常测试与 CGO/FTS5 profile 一致；full validation 使用 `-count=1` 取得未复用 test cache 的当前证据；失败、panic、skip-as-success 都不能满足 gate |
| Data race | `go test -race`（Go 1.27.1） | full validation 使用 `-count=1` 必跑；pre-commit 不重复跑慢速 race gate |
| Coverage | `go test -count=1 -coverpkg=./... -covermode=atomic -coverprofile=coverage/go.out ./...` + `go tool cover` | 当前 Go production package 总 statement coverage **>= 90%**；不为 command wrapper 或难测代码预设豁免 |
| Vulnerability | `govulncheck` / `golang.org/x/vuln v1.8.0` | 固定 scanner 版本，但使用执行时当前 Go vulnerability database；扫描 production + test reachable code，真实 reachable vulnerability 失败 |

`staticcheck` 与 `govulncheck` 的工具版本进入 module graph；升级必须作为明确 dependency/toolchain 变更经过同一 validation，不使用 `@latest` 作为 CI 或开发命令。安全情报不是构建依赖：`govulncheck` 默认使用执行时可获得的当前 vulnerability database，CI 不固定旧数据库 snapshot 来换取伪可复现性；网络或数据库不可用时 security gate 失败，不静默跳过。

Go module 自身还必须通过：

- `go mod verify`；
- `go mod tidy` 后 `go.mod` / `go.sum` 无 diff；
- module dependency 与 tool dependency 都不得出现 floating branch / pseudo-latest policy；确需 pseudo-version 时必须来自明确不可替代的上游 revision；
- Go runtime dependency license 必须进入仓库现有 license gate，不能因为 npm license checker 看不到 Go module 就被跳过。

### 3.2 Go build profile 与统一命令

所有会编译或分析 KG OS Go production packages 的仓库命令统一使用：

```text
Go 1.27.1
CGO_ENABLED=1
build tag: sqlite_fts5
system libsqlite3: disabled
loadable extension: enabled
```

不得依赖开发者 shell 中的隐式 `GOFLAGS` 改变 correctness。仓库 task 必须显式传入当前 build tag / CGO profile；需要用户自定义的 cache、proxy、GOMODCACHE 等不属于产品合同。

仓库继续使用现有 pnpm task 作为**跨语言唯一根入口**，因为 SDK/Web 仍然属于 TypeScript workspace；不再增加 Makefile、Taskfile 或另一套顶层 runner。Phase 00 实现后至少提供并稳定以下入口：

| 根命令 | 目标 |
| --- | --- |
| `pnpm setup` | 检查/准备 Go 1.27.1 + C compiler、下载 Go/npm dependencies 与固定开发工具、准备浏览器和 Lithograph fixture；不全局安装 Go tool |
| `pnpm check:go` | gofmt check + module verify/tidy-clean + vet + Staticcheck + 快速 Go tests |
| `pnpm test:go` | 当前 Go unit/integration tests；完整验收以 uncached `-count=1` 运行 |
| `pnpm test:go:race` | uncached race detector |
| `pnpm test:go:coverage` | 生成 `coverage/go.out` 并强制 total statement >= 90% |
| `pnpm check:go:security` | pinned govulncheck |
| `pnpm check:quick` | Go quick gate + TypeScript/Web 现有快速 gate；作为 pre-commit 的唯一入口 |
| `pnpm validate` | Go + TypeScript/Web + docs + security + real Lithograph + build/package 的完整仓库 gate |

这些 root command 是 repository orchestration，不改变“产品 runtime 不依赖 Node.js”的边界。Go-only 子检查仍由标准 `go` / `go tool` 命令直接执行；不能通过 Node wrapper 重写测试、lint 或漏洞判断语义。

## 4. Feature 顺序

```text
00.1 Go + TypeScript workspace baseline
 -> 00.2 module and dependency boundaries
 -> 00.3 development host and debugging
 -> 00.4 quality gates
 -> 00.5 tests and real Lithograph smoke
 -> 00.6 build and local artifacts
 -> 00.7 hooks and CI
 -> 00.8 documentation and review closure
```

### Feature 00.1 工具链与 workspace

- 建立 Go module，形成 `cmd/kgosd`、`cmd/kg` 与 `internal/` 服务端边界；移除当前 TypeScript daemon / kernel / CLI 作为当前实现入口。
- 保留并收敛 TypeScript workspace 到 SDK / Web 及其真正需要的共享客户端代码；不为 Go / TS 共享源码引入 codegen/schema registry。
- 固定 Go、Node、pnpm 与前后端依赖版本；Go module、Go `tool` dependencies、npm lockfile 都必须可从 clean checkout 复现。
- 新 checkout setup 验证 CGO C compiler、Go tools、`sqlite_fts5` / loadable-extension build profile、Node/pnpm、Web 浏览器测试依赖与真实 Lithograph fixture。

### Feature 00.2 模块与编译边界

- Go Kernel 不依赖 HTTP handler 具体实现；SQLite / Lithograph 访问只存在 daemon / Kernel 内部，CLI / SDK / Web 不直接打开数据库。
- `kg` CLI 只通过 HTTP 消费 daemon公共合同；不因为同为 Go 而直接 import 数据库实现绕过 daemon。
- TypeScript SDK / Web 不导入服务端实现；跨语言 request/result/error semantics 通过 fixtures/integration验证。
- 不为尚不存在的第二数据库增加 StorageBackend/DriverRegistry 等抽象。

### Feature 00.3 开发宿主与调试

- 提供一个根开发入口同时启动 Go `kgosd` 开发进程和 Web HMR；Vite可以使用独立开发端口并代理 API，生产交付仍只有 `kgosd` 一个服务。
- 开发 profile 固定到仓库内忽略的 `.kgos-dev/`，不污染默认 `~/.kgosd`。
- 提供 Go daemon / CLI 与浏览器调试入口；退出开发命令后不遗留 daemon、Vite 或浏览器测试进程。

### Feature 00.4 质量门禁

- Go：`gofmt`、`go mod verify/tidy-clean`、`go vet`、pinned Staticcheck 2026.2.1、`go test`、`go test -race`、>=90% total statement coverage、pinned `govulncheck` v1.8.0；所有 applicable 命令使用同一 CGO + `sqlite_fts5` profile。
- Go gate 不引入 `golangci-lint`、`goimports`、gotestsum 或独立 coverage framework；只有出现当前标准工具无法解决的已验证问题时才新增工具。
- TypeScript/Web：strict typecheck、ESLint、Prettier、Markdownlint、CSpell、Secretlint 及实际需要的 workspace / dependency 检查。
- 跨语言：license、secret、whitespace/diff、重复依赖/生成物与 artifact hygiene 检查。
- 门禁通过受控负向样本证明能真实失败；负向样本随后删除。

### Feature 00.5 测试与真实 Lithograph smoke

- Go unit / integration覆盖最小 CLI/daemon、HTTP静态宿主与临时 profile；数据库部分只建立 **test-only real-load smoke helper**，不在 Phase 00实现正式 connection pool / Runtime database host。
- Playwright 覆盖构建后的 Web shell 与保留的未实现 API边界。
- test-only real-extension smoke使用 Go SQLite driver bundled SQLite真实加载 **Lithograph v0.3.0**，验证 SQLite version、FTS5、required explicit `entrypoint` ordered loading、`lithograph_version()`、`lithograph_init()`、`lithograph()`、`lithograph_rows()` event stream和 context cancellation路径；该 smoke不提供产品 Runtime adapter，正式 connection lifecycle由 Phase 01拥有。
- smoke不读取相邻 Lithograph 工作树、不使用真实 Provider credential、不污染默认 `KG_HOME`。

### Feature 00.6 构建与本地交付物

- 构建 Go `kgosd` / `kg` native executable 与 Web 静态产物；Web 产物进入 daemon交付物。
- 在 workspace 外的临时目录运行已构建 binary / Web smoke，证明不依赖源码路径或开发 server。
- 本地 release candidate 只生成可验证 artifact/manifest，不发布、不推送。

### Feature 00.7 Git hooks 与 CI

- pre-commit 只调用根 `pnpm check:quick`；该命令完整运行 `pnpm check:go` 与 TypeScript/Web 快速检查，不复制 lint/test 命令，也不在每次提交重复完整 race、coverage、govulncheck、Playwright 或 real-extension gate。
- GitHub Actions 在 Ubuntu 24.04 x64 fresh checkout显式安装/选择 Go 1.27.1 与 CGO C toolchain，运行完整 `pnpm validate`，其中必须包含 Go race、coverage、govulncheck、native CGO build并真实加载 Lithograph v0.3.0；与本地 macOS arm64完整 validate共同构成本 Phase 的平台证据。
- 不用 pure-Go cross compile替代上述真实 native runtime检查；Windows、Linux arm64、macOS x64等其它 target等到 release Phase有明确支持范围时再进入 release matrix。

### Feature 00.8 文档与 Review 收尾

- README / Design / Development / Guide 按职责同步真实实现状态。
- 开发指南只有在 Go 基线代码真实可运行后才替换当前 TypeScript 命令，不能提前发布不可执行步骤。
- 最终 review 检查旧 Node daemon / kernel / CLI、ffi / sqlite shim、旧 Lithograph fixture 与无关生成物是否已从当前工程基线清理。

## 5. Acceptance Matrix

| ID | 验收场景 | 判定 | 当前状态 |
| --- | --- | --- | --- |
| P0-01 | 固定工具链与 clean setup | Go 1.27.1、go.mod/go.sum + pinned tool dependencies、CGO bundled SQLite、`sqlite_fts5`、loadable-extension profile、Node/pnpm、lockfiles、真实 fixture在无缓存源码副本可复现；不要求全局 Go linter/security tool | 未验收 |
| P0-02 | 模块、类型与构建边界 | Go daemon / kernel / CLI 与 TS SDK / Web 依赖方向、build、真实版本入口通过 | 未验收 |
| P0-03 | 开发联调与调试 | Go daemon + Web HMR、`.kgos-dev`隔离、调试和退出清理通过 | 未验收 |
| P0-04 | 质量检查真实生效 | Go format/mod/vet/Staticcheck/test/race/>=90% statement coverage/govulncheck 与 TS/docs/security/diff 门禁全部通过；受控负向样本逐项证明 gate 能失败后删除 | 未验收 |
| P0-05 | 测试与真实扩展 | unit/HTTP/Web、Playwright、test-only SQLite>=3.45 + FTS5 + explicit-entrypoint Lithograph v0.3.0 SQL/rows/cancel smoke通过；不宣称正式 Runtime host | 未验收 |
| P0-06 | 构建与本地交付物 | native `kgosd`/`kg`、embedded Web和workspace 外 smoke/manifest通过 | 未验收 |
| P0-07 | Git hook 与平台 CI | forced pre-commit只走统一 quick gate；本地 macOS arm64与 Ubuntu 24.04 x64 GitHub Actions都用 Go 1.27.1 + native CGO runtime运行完整 validate并完成当前 Go基线验证 | 未验收 |
| P0-08 | 文档与最终 Review | 当前文档不再把历史 TypeScript/Native/cache 合同当作现行基线；final diff 无finding | 未验收 |

## 6. 验证执行计划

实现阶段从 targeted evidence 扩大到 Phase gate：

```text
targeted Go/TS unit tests
targeted Go + Lithograph v0.3.0 real-load/stream/cancel smoke
Go gofmt / mod verify+tidy-clean / vet / Staticcheck
Go tests / race / >=90% total statement coverage / govulncheck
TypeScript/Web typecheck / lint / Playwright
repository license / secret / dependency / diff checks
build + workspace-external artifact smoke
forced pre-commit
fresh-source full validation
local macOS arm64 + Ubuntu 24.04 x64 native CGO validation
git diff --check
```

统一根命令已经在本计划冻结为 `pnpm setup`、`pnpm check:go`、`pnpm test:go*`、`pnpm check:go:security`、`pnpm check:quick` 与 `pnpm validate`。本 Phase 实现这些命令并把**实际可执行步骤**写入开发指南；计划不假装当前工作树已经存在这些 Go command。

## 7. Phase Review

- 是否仍让产品 runtime 依赖 Node 或旧 TypeScript daemon / kernel / CLI；
- 是否为了“统一 lint”又引入 `golangci-lint`、全局 tool install、Makefile/Taskfile 等当前不需要的第二层工程抽象；
- Go analysis/test 是否全部使用产品相同的 CGO + `sqlite_fts5` build profile，还是默认 profile 绿、真实 profile 才失败；
- `go.mod` 是否固定 Staticcheck/govulncheck tool dependency，CI 是否仍存在 `@latest` 或本机隐式工具版本；
- coverage 是否真实以 `coverpkg=./...` 计算 production package 总 statement coverage并达到 90%，而不是通过预设 wrapper/path 豁免降低门槛；
- 是否为了 SQLite cancellation 保留不再需要的 DB worker process、`ffi-rs` SQLite host、C shim或自编第二套 SQLite runtime；
- Go driver 是否真实加载 v0.3.0并通过 context cancellation，而不是只证明 package可编译；
- macOS arm64 / Ubuntu 24.04 x64 native CGO build是否实际与对应 Lithograph artifact匹配；
- Web 生产交付是否仍为单 daemon，同开发 HMR 区分清楚；
- CLI / SDK / Web 是否越层访问 SQLite或复制 Kernel 语义；
- 当前质量 / coverage / CI 是否因语言迁移被弱化；
- 历史 TypeScript Phase 00 证据是否保留但没有被误用为当前完成证据。

## 8. 完成条件

P0-01 至 P0-08 全部取得当前 Go 基线的真实证据、Phase Review finding 闭环、文档同步且当前最终推送 SHA的 Ubuntu 24.04 x64 CI成功且本地 macOS arm64 native验证通过后，Phase 00 才能从 `ready/in_progress` 标记 `done`。本次仅设计/计划维护，不包含代码迁移、commit或push。

## 9. 历史 TypeScript Phase 00 基线（已被 D65 supersede）

2026-09-19 的 TypeScript / Node.js Phase 00 曾按当时 D63/D64 完整验收并标记 `done`。该事实保留，避免改写历史：

- 提交 `20d73cdb09947da03e3e222a318c2e61134a2879` 曾完成 Node/pnpm workspace、TypeScript package、Web shell、质量门禁、真实 Lithograph v0.1.1 smoke、构建/打包与 Ubuntu CI；GitHub Actions run `35454190185` 成功。
- 后续 `896e98c97d22edde358d2bb612a4cec641837d62` 更新 Actions runtime，CI run `35454838184` 成功。
- 这些证据只证明当时的 TypeScript 工程基线，不证明当前 D65 Go runtime、D66 Lithograph v0.3.0 SQL-only integration 或当前 Phase 00 acceptance。
- 当前代码仍以该历史工程壳层为已提交基底；新的 Phase 00 实现完成后，开发指南与构建/测试命令再切换到 Go 基线。
