# 本地开发 KG OS

本文说明当前 KG OS 工作树的安装、开发启动、调试、验证、构建和本地 npm 候选包流程。阶段状态与完成证据见[开发计划](../development/README.md)，产品与运行时合同以[设计入口](../design.md)为准。

## 当前工程边界

当前代码分层为：

```text
Go
├── cmd/kgosd
└── internal/
    ├── daemon / kernel
    ├── lithograph
    ├── runtime / runtimeprofile
    └── webui

TypeScript
├── packages/sdk                 # @kgos/sdk
├── packages/cli                 # @kgos/cli，唯一正式 kg CLI
└── packages/web                 # React + Vite

Native npm package metadata
├── packages/runtime-darwin-arm64
├── packages/runtime-darwin-x64
├── packages/runtime-linux-arm64
└── packages/runtime-linux-x64
```

正式 Client 层使用 TypeScript：`@kgos/cli -> @kgos/sdk -> HTTP -> kgosd`。Go 只拥有 daemon、Kernel、SQLite / Lithograph Host 与服务端编译/投影逻辑；仓库不再包含 Go `kg` CLI。

Instance 只由显式 `--root <path>` 定位。不存在默认 `KG_HOME`、`KG_TOKEN` 或固定本机 server port。每个 root 拥有自己的 `config.toml`、`auth.json`、`kgos.db`、`kgosd.lock`、cache/extensions/logs；active daemon 只监听 OS 分配的 loopback dynamic endpoint。

## 工具链

| 工具 | 固定版本或要求 |
| --- | --- |
| Go | `1.27.1`；仓库任务通过 `GOTOOLCHAIN=go1.27.1` 执行 |
| C compiler | CGO 必需；macOS 使用 Apple Clang，Linux runner 使用 GCC |
| Node.js | `24.15.0`，由 [`.node-version`](../../.node-version) 固定 |
| pnpm | `10.34.5`，由根 `packageManager` / `engines` 固定 |
| Rust | `1.97.1`，用于构建 `native/jieba/` 的official FTS5 tokenizer |
| SQLite driver | `github.com/mattn/go-sqlite3 v1.14.52`，bundled SQLite + CGO + `sqlite_fts5` |
| Lithograph | `v0.3.0` release artifacts，覆盖 macOS / Linux arm64/x64 |

先确认基础工具：

```sh
node --version
pnpm --version
rustc --version
cc --version
```

然后执行：

```sh
pnpm run setup
```

必须写成 `pnpm run setup`；裸 `pnpm setup` 是 pnpm 自己的命令。

setup 会安装 frozen-lockfile workspace、校验 Go/C/Rust toolchain、安装仓库 Go quality tools和 Playwright，并下载/校验当前平台的 Lithograph v0.3.0 fixture。Linux 缺 Chromium system libraries 时可额外运行：

```sh
pnpm exec playwright install --with-deps --only-shell chromium
```

## 开发启动

```sh
pnpm dev
```

当前 `pnpm dev`：

1. 执行当前平台完整 build；
2. 生成仓库内已忽略的 `.kgos-dev/config.toml`；
3. 从 `artifacts/npm/runtime-<target>/` 启动完整 packaged `kgosd --root <absolute-root>`；
4. 等待 `.kgos-dev/kgosd.lock` 发布 dynamic endpoint；
5. 启动 Vite `http://127.0.0.1:5173`，把 `/api` 代理到该 endpoint。

daemon 实际 endpoint 每次由 OS 分配，并打印到终端；不要假设固定端口。Ctrl-C/SIGTERM 会联动停止 daemon 与 Vite。

开发 server 运行时，可以直接用 workspace 编译后的 TypeScript CLI访问同一 active Instance：

```sh
node packages/cli/dist/bin.js \
  --root "$PWD/.kgos-dev" \
  evolution overview
```

这里业务命令会复用已经运行的 daemon。需要验证 Runtime package discovery、`doctor`、lazy-start 或首次初始化时，使用下一节的 packed npm candidate，而不是绕过 package topology。

## 验证首次本地使用

先生成当前平台 npm 候选包：

```sh
pnpm build
pnpm pack:release
ls artifacts/release/*.tgz
```

`pack:release` 会生成当前平台的：

- `@kgos/sdk` tarball；
- `@kgos/cli` tarball；
- 当前 `@kgos/runtime-<platform>-<arch>` tarball。

它同时在 workspace 外执行真实 `npm install --ignore-scripts` 和 CLI/Runtime smoke，不会发布 registry、创建 Git commit 或 push。

手工检查 candidate 时：

```sh
REPO="$PWD"
SMOKE="$(mktemp -d)"
cd "$SMOKE"
npm init -y >/dev/null
npm install --ignore-scripts "$REPO"/artifacts/release/*.tgz

ROOT="$SMOKE/instance"

# doctor 对不存在 root 只诊断，不创建 Instance。
npm exec --yes -- kg --root "$ROOT" doctor --json

npm exec --yes -- kg --root "$ROOT" init \
  --cache-path cache/openai-compatible.db \
  --cache-max-size-mb 4096 \
  --embedding-base-url https://example.invalid/v1 \
  --embedding-model local-fixture \
  --embedding-dimensions 3 \
  --embedding-similarity cosine \
  --embedding-api-key-env ""

# init 只创建完整 config 与 runtime-owned 目录。
# 第一个业务命令才创建 auth.json / kgos.db、启动 daemon 并 bootstrap。
npm exec --yes -- kg --root "$ROOT" evolution overview
npm exec --yes -- kg --root "$ROOT" ontology --at branch/main
```

省略 `--fulltext-analyzer` 时，新 Instance 的 `config.toml` 显式写入 `jieba`；如需英文或其它已安装FTS5 tokenizer，可在 `init` 时显式传 `--fulltext-analyzer unicode61` 等值。已有 Instance 不会被自动改写。

如果 `embedding.api_key_env` 配置为非空变量名，应在需要 Semantic Provider 的 daemon startup 前提供同名环境变量。KG OS 只持久化环境变量名称，不持久化 secret。

正式 registry 发布后，AI / CI 的设计入口为：

```text
npx --yes @kgos/cli@<version> --root <instance-root> <command>
```

当前 Phase 本地验收只生成/安装 tarball candidate，不冒充 npm registry 已发布。

## Runtime npm package

`pnpm build` 会生成当前平台 staging package：

```text
artifacts/npm/runtime-<platform>-<arch>/
├── package.json
├── LICENSE
├── kgosd
├── manifest.json
├── JIEBA-NOTICE.md
├── licenses/
│   ├── sqlite-simple-tokenizer-MIT.txt
│   └── jieba-rs-MIT.txt
└── extensions/
    ├── lithograph.<dylib|so>
    ├── lithograph-openai-compatible.<dylib|so>
    └── kgos-jieba.<dylib|so>
```

manifest 固定 package version/platform/arch 和七个受校验文件的 SHA-256。Runtime package不包含 native `kg`，也没有 preinstall/install/postinstall 下载脚本。

source workspace 下的四个 `packages/runtime-*` 只维护 npm metadata；native binary 是 build artifact，不提交 Git。

## 调试

[`.vscode/launch.json`](../../.vscode/launch.json)提供：

- `KG OS CLI (TypeScript)`：先执行 `pnpm build`，再启动编译后的 CLI；
- `KG OS Web`：连接 `pnpm dev` 的 Vite 5173 页面。

Go daemon 的生产启动依赖与 binary 同目录的 Runtime manifest/native artifacts，因此不要用临时 dlv binary冒充 packaged `kgosd`。Go 逻辑调试优先运行对应 package test；完整 daemon 行为使用 `pnpm test:native` 或 packed candidate。

## 检查与测试

| 命令 | 检查内容 |
| --- | --- |
| `pnpm check:go` | Go version、gofmt、module、vet、Staticcheck、快速 Go tests |
| `pnpm test:go` | Go unit/integration tests，CGO + `sqlite_fts5` |
| `pnpm test:go:race` | uncached Go race detector |
| `pnpm test:go:coverage` | Go total statement coverage，仓库门禁 `>= 90%` |
| `pnpm check:go:security` | pinned govulncheck |
| `pnpm typecheck` | SDK/CLI/Web/测试 strict TypeScript |
| `pnpm lint` | ESLint、Prettier、imports/workspace、Markdown、CSpell、Secretlint |
| `pnpm test` | SDK/CLI/Web Vitest |
| `pnpm test:coverage` | 现有 SDK/Web V8 coverage gate |
| `pnpm test:e2e` | build 后用 Playwright 验证内置 Web |
| `pnpm test:native` | 真实 Lithograph + Provider + Jieba、Runtime/Kernel/Daemon 集成 |
| `pnpm check:package` | workspace 外临时 npm tarball install + Runtime/CLI smoke |
| `pnpm check:quick` | Go quick gate + TS typecheck/lint/test；pre-commit入口 |
| `pnpm validate` | race、coverage、安全、build、E2E、native/package/license/audit/diff等完整门禁 |

`coverage/`、`playwright-report/`、`test-results/`、`artifacts/` 都是生成物，不提交 Git。

## Lithograph v0.3.0 fixture

[`scripts/lithograph-artifacts.mjs`](../../scripts/lithograph-artifacts.mjs) 固定 macOS/Linux arm64/x64 的 Lithograph v0.3.0 release artifact 与 SHA-256。[`scripts/prepare-lithograph.mjs`](../../scripts/prepare-lithograph.mjs) 校验 archive entry、`VERSION`、Lithograph 与 OpenAI-compatible Provider library，再缓存到 `.cache/lithograph/`。

`pnpm test:native` 使用 bundled SQLite，并由测试 Runtime显式加载 official Lithograph → official Provider；caller configured extensions仍走通用 resolver。native suite覆盖 bootstrap/reopen、Object/Ontology、Graph streaming/cancellation、Evolution/Merge、HTTP auth、dynamic daemon endpoint 与 shutdown。

## 构建

```sh
pnpm clean
pnpm build
```

build 顺序：

```text
SDK + CLI TypeScript
→ Web static assets
→ internal/webui/dist
→ Lithograph current-platform fixture
→ Go kgosd
→ current-platform npm Runtime package
```

主要输出：

```text
packages/sdk/dist/
packages/cli/dist/
packages/web/dist/
artifacts/build/kgosd
artifacts/npm/runtime-<target>/
```

## 本地候选交付物

```sh
pnpm pack:release
```

输出为 `artifacts/release/*.tgz`。脚本在 workspace 外重新安装 tarballs并验证：

- CLI/SDK/Runtime version topology；
- `init` 不创建 auth/db 或启动 daemon；
- `doctor` stopped readiness；
- 并发 lazy-start；
- 双 root 的独立 endpoint/token/database；
- wrong-endpoint + same-root token fail-closed；
- Ontology/Object/Graph/Evolution/Merge 主链路；
- daemon crash/restart 后 credential identity保持；
- Runtime package不包含 native `kg`，CLI package不夹带 native Runtime；
- Instance config不持久化 npm/node_modules package path。

## Git hooks 与 CI

`pnpm run setup` 安装 Lefthook，pre-commit 只运行：

```sh
pnpm check:quick
```

GitHub Actions 保留 Ubuntu 24.04 x64 的完整 `pnpm validate`，并增加四平台 native/package matrix：

- macOS arm64：`macos-15`
- macOS x64：`macos-15-intel`
- Linux glibc arm64：`ubuntu-24.04-arm`
- Linux glibc x64：`ubuntu-24.04`

四平台 job 真实执行 current-target build、`pnpm test:native` 与 `pnpm pack:release`，并上传 npm candidate。Phase 只有在要求的 pushed revision 对应远端 matrix真实成功后才能记为 `done`。

## MVP Release Closure

首个公开 Release baseline 固定为 `0.1.0`，正式 npm dist-tag 固定为 `latest`。版本仍由仓库既有 root/package、SDK public constant 与 Go build info 合同共同校验，不增加独立版本文件。

发布前先在 `main` 完成普通验证与 npm organization authority 检查：

```sh
pnpm validate
pnpm release:authority
```

`release:authority` 只检查当前 npm CLI identity 是否能够证明 `@kgos` user/org membership，不发布 package；没有本地 npm session 时可以由 npm Web 的 organization owner 证据完成发布前人工核对。

正式 Release 由 Git tag 触发。版本已准备并且目标 commit 已在 `main` 后，创建并 push 与 package version 完全一致的 tag：

```sh
git tag v0.1.0
git push origin v0.1.0
```

[`.github/workflows/release.yml`](../../.github/workflows/release.yml) 监听 `v*` tag push；普通 pull request 与 `main` push 不会 publish。`workflow_dispatch` 只接受一个**已经存在**的 release tag，用于恢复同一次 partial release，不产生新的 version。workflow preflight 要求 tag 名等于 `v<package-version>`、tag revision 属于 `origin/main` 历史且 source clean，然后按同一 revision 完成四平台 candidate、聚合与 native hash/integrity 校验、Runtime → SDK → CLI-last publish / partial recovery、六包 exact-version + `latest` registry verification、四平台 public-registry `npx` smoke，最后基于已有 tag 创建 GitHub Release。

publish job 具备 GitHub Actions OIDC `id-token: write`，长期认证使用 npm Trusted Publishing。六个 package 的 `repository.url` 都绑定当前 `bYiyLi/kg-os` GitHub repository。首次 `0.1.0` 发布时 package 尚不存在，无法先在 package settings 建立 Trusted Publisher，因此允许临时使用一个短期 granular token 作为 GitHub Actions secret `NPM_TOKEN`；token 只用于 bootstrap，不写入仓库、candidate、release notes 或 Instance。六包首次存在后，应逐包配置 GitHub Actions Trusted Publisher：

- GitHub owner：`bYiyLi`
- Repository：`kg-os`
- Workflow filename：`release.yml`
- Allowed action：允许 `npm publish`

配置完成后删除 repository secret `NPM_TOKEN`；后续 `v*` Release 使用 OIDC，无需长期 npm publish token。

只完成本地 candidate、workflow 配置、部分 npm publish 或单独 Git tag 都不等于公开 Release 完成；真实状态以 [Phase 09](../development/phases/09-mvp-release-closure.md) 的 registry/tag/Release 证据为准。

## 常见问题

- `pnpm install` engine mismatch：切换到 `.node-version` 指定的 Node。
- 缺 C compiler：安装当前平台 C toolchain；没有 pure-Go SQLite fallback。
- Playwright 缺浏览器/system library：重新执行 setup；Linux 需要时运行 `playwright install --with-deps`。
- Lithograph fixture hash失败：准备脚本会 fail closed，不回退相邻工作树或其它版本。
- npm Runtime optional package被 omit/缺失：CLI会在需要启动 daemon 时 fail closed，不联网偷偷下载 binary。
- 想清理生成物：运行 `pnpm clean`；依赖和 `.cache/lithograph/` 保留以避免重复下载。
