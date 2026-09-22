# 本地开发 KG OS

本文帮助 KG OS 开发者完成本地安装、开发启动、调试、检查、测试、构建和本地候选交付物验证。阶段顺序与完成状态见[开发计划](../development/README.md)，工程基线见 [Phase 00](../development/phases/00-engineering-foundation.md)，当前 Runtime / Lithograph Host 见 [Phase 01](../development/phases/01-runtime-lithograph-host.md)；产品与运行时边界仍以[设计入口](../design.md)为准。

## 当前边界

当前工程基线已经迁移为：

```text
Go
├── cmd/kgosd
├── internal/（Kernel / command / Web host 等服务端边界）
└── cmd/kg

TypeScript
├── packages/sdk
└── packages/web（React + Vite）
```

`kgosd`、Kernel 与 `kg` CLI 不再使用旧 TypeScript 实现。产品运行时不依赖 Node.js；Node/pnpm 只用于 SDK、Web 和仓库工程工具。

Phase 01 已把 `kgosd` 从工程壳层推进为真实本地 Runtime / Lithograph Host：启动时读取唯一 `KG_HOME` profile，解析 `config.toml` / `auth.json`、取得 single-instance lock、解析 SQLite extensions、打开 `kgos.db` 并验证 Lithograph v0.3.0 SQL capability。Knowledge Base bootstrap、Ontology / Object / Graph / Evolution 与正式业务 API 仍属于后续 Phase；当前 `/api/*` 与 `/control/*` 继续返回 404，不会用 mock readiness 冒充业务能力。

## 工程目录

```text
cmd/
├── kg/
└── kgosd/

internal/
├── buildinfo/
├── command/
├── daemon/
├── kernel/
├── lithograph/
├── lithographtest/
├── runtime/
├── runtimeprofile/
└── webui/

packages/
├── sdk/
└── web/
```

`internal/lithograph` 是正式 Lithograph SQL host / execution / explicit-transaction adapter，`internal/runtimeprofile` 负责 `KG_HOME`、config、credential、lock 与 extension resolver，`internal/runtime` 组合 profile 与 database host，`internal/daemon` 拥有 HTTP listener lifecycle。`internal/lithographtest` 只保留 bundled SQLite build-profile 测试，不是第二套数据库 adapter。

## 工具链

| 工具 | 固定版本或要求 |
| --- | --- |
| Go | `1.27.1`；仓库任务通过 `GOTOOLCHAIN=go1.27.1` 执行并核对实际版本 |
| C compiler | CGO 必需；macOS 使用 Apple Clang，Ubuntu CI 安装 GCC |
| Node.js | `24.15.0`，由 [`.node-version`](../../.node-version) 固定 |
| pnpm | `10.34.5`，由根 `packageManager` / `engines` 固定 |
| SQLite driver | `github.com/mattn/go-sqlite3 v1.14.52`，bundled SQLite + CGO + `sqlite_fts5` |
| Go quality tools | Staticcheck `2026.2.1` (`v0.8.1`)；govulncheck `v1.8.0`，都由 `go.mod` tool dependency 固定 |
| Lithograph fixture | `v0.3.0` release artifact；Phase 00 本地目标为 macOS arm64，CI 为 Ubuntu 24.04 x64 |

先确认 Node/pnpm，并确保本机有可用 C compiler：

```sh
node --version
pnpm --version
cc --version
```

Node 与 pnpm 必须分别为 `v24.15.0`、`10.34.5`。然后执行：

```sh
pnpm run setup
```

必须写成 `pnpm run setup`；裸 `pnpm setup` 是 pnpm 自己的内置命令，不会执行 KG OS 的 `package.json` setup script。

setup 会：

- frozen-lockfile 安装 npm workspace；
- 下载/选择并核对 Go `1.27.1`；
- 验证 C compiler、Go module、Staticcheck 与 govulncheck；
- 真实编译 `go-sqlite3` 的 `sqlite_fts5` profile，并确认没有 `OMIT_LOAD_EXTENSION`；
- 安装 Lefthook；
- 安装 Playwright Chromium headless shell；
- 下载、SHA-256 校验并缓存当前平台的 Lithograph v0.3.0 release fixture。

Linux 若缺 Chromium 系统库，可额外运行：

```sh
pnpm exec playwright install --with-deps --only-shell chromium
```

## 开发启动

```sh
pnpm dev
```

开发入口同时启动：

- Go Phase 01 runtime：`http://127.0.0.1:4765`
- Vite/React HMR：`http://127.0.0.1:5173`

浏览器开发时访问 `5173`。Vite 把 `/api` 与 `/control` 代理到 Go 进程；尚未进入后续业务 Phase 的接口当前返回 404。

`pnpm dev` 强制把 `KG_HOME` 指向仓库内已忽略的 `.kgos-dev/`，先用真实 Lithograph v0.3.0 fixture 生成 Phase 01 `config.toml`，再启动无额外兼容参数的 `kgosd`，因此不污染默认 `~/.kgosd`。Web 源码修改由 Vite HMR 处理；Go 源码修改后重新启动 `pnpm dev`。Ctrl-C/SIGTERM 会联动停止 Go 与 Vite 子进程，正常退出后不应保留 `4765` / `5173` listener。

Vite 只是开发工具，不改变产品边界：生产/本地正式交付仍只有一个 `kgosd`，Web 静态产物直接嵌入 Go binary。

## 调试

[`.vscode/launch.json`](../../.vscode/launch.json)提供：

- `KG OS daemon (Go)`：先运行 `KG OS: prepare runtime` 生成 `.kgos-dev/config.toml`，再以 `sqlite_fts5` build tag、无旧兼容参数启动 Phase 01 daemon；
- `KG OS CLI (Go)`：以 `--help` 启动 Go CLI；
- `KG OS Web`：打开 Vite `5173` 页面调试浏览器代码。

VS Code 推荐安装 Go、ESLint、Prettier 与 CSpell 扩展。

## 检查与测试

| 命令 | 检查内容 |
| --- | --- |
| `pnpm check:go` | Go 1.27.1、gofmt check、`go mod verify/tidy -diff`、vet、Staticcheck、快速 Go tests |
| `pnpm test:go` | Go unit/integration tests，`CGO_ENABLED=1` + `sqlite_fts5` |
| `pnpm test:go:race` | uncached Go race detector |
| `pnpm test:go:coverage` | `coverpkg=./...` 的 Go total statement coverage，强制 `>= 90%` |
| `pnpm check:go:security` | pinned govulncheck，包含 production + test reachable code |
| `pnpm typecheck` | SDK/Web/测试配置的 strict TypeScript typecheck |
| `pnpm lint` | ESLint、Prettier、模块边界、workspace、Markdown、CSpell、Secretlint |
| `pnpm test` | SDK/Web Vitest |
| `pnpm test:coverage` | TypeScript/Web V8 coverage |
| `pnpm test:e2e` | 重建后用 Playwright 验证内嵌 Web 与未实现 API 边界 |
| `pnpm test:native` | Go bundled SQLite 真实加载 Lithograph v0.3.0 + Provider，验证 FTS5、SQL execution、`lithograph_rows()` 与 cancellation |
| `pnpm check:quick` | Go quick gate + TS typecheck/lint/test；也是 pre-commit 唯一入口 |
| `pnpm validate` | race、coverage、security、build、Playwright、真实 Lithograph、artifact、license、audit、diff 等完整仓库 gate |

`coverage/`、`playwright-report/`、`test-results/` 与 `artifacts/` 都是生成物，不提交 Git。

Secret scan 由 `scripts/check-secrets.mjs` 先确认 Secretlint 配置可读，再执行扫描；配置缺失不能静默通过。npm production license gate 实际扫描 Web workspace 的 React/ReactDOM 依赖；Go runtime/test-native license gate固定审查 `BurntSushi/toml`（MIT）、`go-sqlite3`（MIT）与 `golang.org/x/sys`（BSD-3-Clause）及其 pinned version。

## Lithograph v0.3.0 fixture

[`scripts/lithograph-artifacts.mjs`](../../scripts/lithograph-artifacts.mjs)固定 macOS/Linux arm64/x64 的 Lithograph `v0.3.0` release URL 与 SHA-256。准备脚本校验 archive 路径、`VERSION`、主扩展和 `lithograph-openai-compatible` Provider extension，并缓存到 `.cache/lithograph/`；测试不读取相邻 Lithograph 工作树。

`pnpm test:native` 使用 `go-sqlite3` bundled SQLite，按显式 entrypoint 依次加载：

```text
sqlite3_lithograph_init
sqlite3_lithographopenaicompatible_init
```

native suite 真实覆盖 SQLite >= 3.45、FTS5、Lithograph `0.3.0` / `CY25-2026.08` / storage format 3、`lithograph_validate(query)`、`lithograph()`、`lithograph_rows()`、query/execute context、Semantic Provider readiness/cache、explicit transaction、context cancellation、early-close rollback、shutdown cleanup 与 reopen。它与普通 unit/failure-path tests共同组成 Phase 01 的本地数据库集成证据；最终 Phase 状态仍以 Phase Acceptance 和要求的远端 CI 为准。

## 构建与本地候选交付物

```sh
pnpm clean
pnpm build
```

构建顺序是 SDK/Web → Vite static assets → `internal/webui/dist` → Go native binary。输出：

```text
artifacts/build/kgosd
artifacts/build/kg
```

Web 资源已经嵌入 `kgosd`；构建后 Playwright 直接用该 native binary 提供页面，不依赖源码目录中的开发 server。

生成本地候选交付物：

```sh
pnpm pack:release
```

结果写入 `artifacts/release/`，包含当前平台 `kgosd`、`kg`、SHA-256 manifest 与许可证/README。脚本还会把二进制复制到 workspace 外临时目录运行版本与 embedded-Web smoke。它只生成本地候选物，不发布、不提交、不推送。

## Git hooks 与 CI

`pnpm run setup` 安装 [Lefthook](../../lefthook.yml)。pre-commit 只运行：

```sh
pnpm check:quick
```

[GitHub Actions](../../.github/workflows/ci.yml)使用 Ubuntu 24.04 x64，安装 Node `24.15.0`、pnpm `10.34.5`、Go `1.27.1`、GCC 和 Chromium system dependencies，然后运行完整 `pnpm validate`。Phase 00 只有在最终推送 revision 的远端 CI 也成功后才能标记 `done`。

## 常见问题

- `pnpm install` 报 engine mismatch：切换到 `.node-version` 指定的 Node `24.15.0`。
- Go 本机版本不是 1.27.1：仓库任务使用 `GOTOOLCHAIN=go1.27.1` 获取/选择固定工具链；网络不可用且本地没有该 toolchain 时 setup 会失败。
- 缺 C compiler：先安装平台对应的 C toolchain；Phase 00 不提供 pure-Go SQLite fallback。
- Playwright 找不到浏览器或 Linux system library：重新执行 setup；Linux 需要时运行上面的 `--with-deps` 安装命令。
- Lithograph fixture 校验失败：准备脚本会拒绝不匹配 artifact，不会回退相邻工作树或其它版本。
- 想清理生成物：运行 `pnpm clean`；依赖与 `.cache/lithograph/` 保留，避免无意义重复下载。
