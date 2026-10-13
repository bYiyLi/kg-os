# 本地开发 KG OS

本文说明当前 KG OS 工作树的安装、开发启动、调试、验证、构建和本地 npm 候选包流程。阶段状态与完成证据见[开发计划](../development/README.md)，产品与运行时合同以[设计入口](../design.md)为准。

这里的 `pnpm dev` 是 **Mac 本机 Web + daemon** 的临时开发模式；长期集成测试使用独立 Linux Docker 环境 `/data/apps/KgosDev`，按[远程开发环境指南](dev-environment.md)的 `pnpm dev:mcp` 部署、只读验收、备份与回退。两者的 Workspace 和运行生命周期互不共享。

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
├── packages/runtime-linux-x64
├── packages/runtime-win32-arm64
└── packages/runtime-win32-x64
```

正式 Client 层使用 TypeScript：`@kgos/cli -> @kgos/sdk -> HTTP -> kgosd`。Go 只拥有 daemon、Kernel、SQLite / Lithograph Host 与服务端编译/投影逻辑；仓库不再包含 Go `kg` CLI。

CLI 按 `--root <workspace-root>` > 非空 `KGOS_ROOT` > error 选择 Workspace；不存在默认 `KG_HOME`、cwd/父目录自动发现或固定本机 server port。每个 Workspace 的 KG OS Instance 固定在 `<root>/.kgos`，其中拥有自己的 `config.toml`、`auth.json`、`kgos.db`、`kgosd.lock`、`initialized.json` 与 cache/extensions/logs；active daemon 只监听 OS 分配的 loopback dynamic endpoint。

## 工具链

| 工具 | 固定版本或要求 |
| --- | --- |
| Go | `1.27.2`；仓库任务通过 `GOTOOLCHAIN=go1.27.2` 执行 |
| C compiler | CGO 必需；macOS 使用 Apple Clang，Linux / Windows runner 使用 GCC 或经 CI 验证的目标编译器 |
| Node.js | `24.15.0`，由 [`.node-version`](../../.node-version) 固定 |
| pnpm | `10.34.5`，由根 `packageManager` / `engines` 固定 |
| Rust | `1.97.1`，用于构建 `native/jieba/` 的official FTS5 tokenizer |
| SQLite driver | `github.com/mattn/go-sqlite3 v1.14.52`，bundled SQLite + CGO + `sqlite_fts5` |
| Lithograph | `v0.3.0` release artifacts，覆盖 macOS / Linux / Windows arm64/x64 |

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
2. 生成仓库内已忽略的 `.kgos-dev/.kgos/config.toml`；
3. 从 `artifacts/npm/runtime-<target>/` 启动完整 packaged `kgosd --root <absolute-root>`；
4. 等待 `.kgos-dev/.kgos/kgosd.lock` 发布 dynamic endpoint；
5. 使用 daemon 生成的 `auth.json` 完成一次 authenticated Evolution overview，并在成功后写入开发 Instance 的 `initialized.json` completion receipt；
6. 启动 Vite `http://127.0.0.1:5173`，把 `/api` 代理到该 endpoint。

daemon 实际 endpoint 每次由 OS 分配，并打印到终端；不要假设固定端口。Ctrl-C/SIGTERM 会联动停止 daemon 与 Vite。

开发 server 运行时，可以直接用 workspace 编译后的 TypeScript CLI访问同一 active Instance：

```sh
node packages/cli/dist/bin.js \
  --root "$PWD/.kgos-dev" \
  evolution overview
```

这里业务命令会复用已经运行的 daemon。需要验证 Runtime package discovery、`doctor`、已初始化 Instance 的 Runtime auto-start 或首次初始化时，使用下一节的 packed npm candidate，而不是绕过 package topology。

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
  --no-additional-extensions \
  --embedding-base-url https://example.invalid/v1 \
  --embedding-model local-fixture \
  --embedding-dimensions 3 \
  --embedding-similarity cosine \
  --embedding-api-key-env ""

# init 成功即表示 .kgos/config.toml、official/additional extensions、
# auth.json、kgos.db、bootstrap、authenticated readiness 与 active daemon 全部完成。
npm exec --yes -- kg --root "$ROOT" doctor --json
npm exec --yes -- kg --root "$ROOT" evolution overview
npm exec --yes -- kg --root "$ROOT" ontology --at branch/main
```

省略 `--fulltext-analyzer` 时，新 Instance 的 `config.toml` 显式写入 `jieba`；如需英文或其它已安装FTS5 tokenizer，可在 `init` 时显式传 `--fulltext-analyzer unicode61` 等值。已有 Instance 不会被自动改写。

如果 `embedding.api_key_env` 配置为非空变量名，`init`、普通 CLI 命令与 daemon startup 都不要求当前环境已经存在同名变量；只有实际执行需要 OpenAI-compatible Provider 的 Semantic operation 时，Provider 才从该 daemon 进程环境读取 credential。KG OS 只持久化环境变量名称，不持久化 secret。可用 `kg doctor --json` 查看**本次 CLI invocation** 是否能看到该变量；该诊断是 non-blocking，也不代表已经运行中的 daemon 继承了相同环境。

正式 registry 发布后，AI / CI 的设计入口为：

```text
npx --yes @kgos/cli@<version> --root <workspace-root> <command>

# 或在 shell / CI 中固定 Workspace：
KGOS_ROOT=<workspace-root> npx --yes @kgos/cli@<version> <command>
```

当前 Phase 本地验收只生成/安装 tarball candidate，不冒充 npm registry 已发布。

## Runtime npm package

`pnpm build` 会生成当前平台 staging package：

```text
artifacts/npm/runtime-<platform>-<arch>/
├── package.json
├── LICENSE
├── kgosd（Windows 为 kgosd.exe）
├── manifest.json
├── JIEBA-NOTICE.md
├── licenses/
│   ├── sqlite-simple-tokenizer-MIT.txt
│   └── jieba-rs-MIT.txt
└── extensions/
    ├── lithograph.<dylib|so|dll>
    ├── lithograph-openai-compatible.<dylib|so|dll>
    └── kgos-jieba.<dylib|so|dll>
```

manifest 固定 package version/platform/arch 和七个受校验文件的 SHA-256。Runtime package不包含 native `kg`，也没有 preinstall/install/postinstall 下载脚本。

source workspace 下的六个 `packages/runtime-*` 只维护 npm metadata；native binary 是 build artifact，不提交 Git。

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

**安全审计例外（2026-10-12）：** `pnpm.auditConfig.ignoreCves` 仅列入 `CVE-2026-93687`（[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)）；该告警来自开发工具 `markdownlint-cli2 → micromatch → braces@3.0.3`，上游尚无修复版，当前生产 MCP 镜像不包含 `braces`。`pnpm check:security` 先审计生产依赖，再审计全部依赖，均保留 `high` 阈值；其它 CVE 不在白名单中。上游发布已验证的修复版本时应升级依赖并移除此条例外；若受影响依赖进入生产包，应重新评审而非默认接受。不要使用 `--ignore-unfixable` 或放宽整体安全级别。

## Lithograph v0.3.0 fixture

[`scripts/lithograph-artifacts.mjs`](../../scripts/lithograph-artifacts.mjs) 固定 macOS/Linux/Windows arm64/x64 的 Lithograph v0.3.0 release artifact 与 SHA-256。[`scripts/prepare-lithograph.mjs`](../../scripts/prepare-lithograph.mjs) 校验 archive entry、`VERSION`、Lithograph 与 OpenAI-compatible Provider library，再缓存到 `.cache/lithograph/`。

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
artifacts/build/kgosd（Windows 为 kgosd.exe）
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

GitHub Actions 保留 Ubuntu 24.04 x64 的完整 `pnpm validate`，并运行六平台 native/package matrix：

- macOS arm64：`macos-15`
- macOS x64：`macos-15-intel`
- Linux glibc arm64：`ubuntu-24.04-arm`
- Linux glibc x64：`ubuntu-24.04`
- Windows arm64：`windows-11-vs2026-arm`
- Windows x64：`windows-2025`

各平台 job 真实执行 current-target build、`pnpm test:native` 与 `pnpm pack:release`，并上传 npm candidate。按 [D94](../design/decisions.md#d94-openclaw-docker-development-and-ci)，**Mac 本地不跑 Docker**，开发阶段的镜像构建、隔离写入/持久化测试只在 [OpenClaw](dev-environment.md) 执行；**GitHub Actions PR/main CI 另有独立的 `Unified Docker / Linux amd64` job**，使用当前 revision 构建单进程镜像并运行初始化、Web/API/MCP 四 Tool、31/31 SDK、认证、重启持久化的隔离容器测试。普通 CI 不推送 GHCR。Phase 只有在自己要求的本地质量、OpenClaw Dev、最终 pushed revision 的 Ubuntu Validate / Runtime matrix / Docker CI 与真实客户端验收均完成后才能标为 `done`；正式 Release 不作为默认前置。

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
KGOS_VERSION="$(node -p 'require("./package.json").version')"
git tag "v${KGOS_VERSION}"
git push origin "v${KGOS_VERSION}"
```

[`release.yml`](../../.github/workflows/release.yml) 监听 `v*` tag push；普通 pull request 与 `main` push 不会 publish。`workflow_dispatch` 要求一个**已经存在**的 release tag，不产生新的 version。workflow preflight 要求 tag 名等于 `v<package-version>`、tag revision 属于 `origin/main` 历史且 source clean。首次运行要完成六平台 candidate、聚合与 native hash/integrity 校验，然后按 Runtime → SDK → CLI 顺序发布、验证八包 exact-version 与 `latest`、运行六平台 public-registry `npx` smoke，再发布下述 MCP Docker 镜像，**全部成功后**创建 GitHub Release。

**正式 Release 的前提是已经完成对应源码的开发/Dev 验收、代码 Review 和获授权的提交推送**。Release CI 负责从确定 Tag revision 构建、核验并发布正式产物；不在普通 PR/main CI 或临时 Mac→Dev Docker 调用里提前构建正式镜像，也不使用 Release CI 替代 Linux Dev 的完整功能验收。两种验收分别留存证据。

### MCP Docker 镜像发布

KG OS 统一服务**只交付 Linux amd64 Docker 镜像**，不提供独立 MCP npm 包或 arm64 镜像；现有 CLI / SDK / Runtime 八个 npm 包继续沿用上述 Release 流程。Docker 使用同一 `v<package-version>` Release Tag，新的单进程镜像地址为 `ghcr.io/byiyli/kgos:v<version>`（owner 由工作流转换成小写）。**这个地址是待正式发布的目标，不代表当前版本已经存在**。

- 在六平台 public-registry smoke 成功后，Release 的 `docker-mcp` job 从**同一 commit**构建 `linux/amd64`，为镜像标注 source、version、revision。镜像构建需要的 Linux x64 native 扩展从已发布 Runtime npm 包取得；仓库内部临时 npm tarball 只是镜像构建材料，不作为用户安装入口。
- Docker Smoke 在远程 CI 的 Linux runner 对**同一待发布镜像**创建临时 Volume，使用 `scripts/mcp-unified-docker-smoke.mjs` 验证容器 `init`、四 Tool、31/31 SDK、认证隔离、写入及持久化重启；失败阻止 GHCR 发布。**Mac 不运行这个脚本**，OpenClaw 开发测试也可独立运行它。
- 成功后使用 GitHub Actions 自动签发的 `GITHUB_TOKEN`（仅 Docker job 启用 `packages:write`）推送 GHCR，再重新拉取检验平台、源 revision 和 digest。GitHub Release 记录带版本的镜像和 digest 引用；**CI 成功不能替代已授权的生产部署**。
- GHCR 新 package 可能默认是 **private**。若要让外部用户无需登录就能拉取，首次发布后在 GitHub Packages 中核对该 package 与本仓库的关联、配置 Public visibility，并从未登录的客户端真实拉取验证。私有镜像则需消费者自己的授权；无需向 CI 添加 Docker Hub Token 或长期 PAT。该权限动作与镜像发布分开验收。
- 打包完成或 workflow 文件存在**不等于已发布**。普通 `main` / Pull Request **远程 CI 会构建并测试 Docker 镜像，但不推送 GHCR，也没有 `packages:write`**；Release CI 构建正式镜像、验收并推送 GHCR。正式发布前仍须完成 OpenClaw 开发验收，并另行授权提交、推送、确认版本及发布 tag；本地 Mac 不需要 Docker。

若某次 Release 已经发布部分 package，恢复时传入该次**已结束**且聚合成功的 run ID，复用它的 `release-set`。恢复工作流会核对来源 workflow、tag revision、version 与每个 tarball 的完整性，再继续缺失的 package。native 构建产物在不同 run 间可能有不同哈希，部分发布后不能用重新构建的候选替代已发布产物。

```sh
gh workflow run release.yml --ref main -f tag="v${KGOS_VERSION}" -f reuse_release_run="<run-id>"
```

publish job 具备 GitHub Actions OIDC `id-token: write`，长期认证使用 npm Trusted Publishing。当前八个 package 的 `repository.url` 都绑定 `bYiyLi/kg-os` GitHub repository。首次 `0.1.0` 的原六包与 `0.1.1` 的两个 Windows 包在 package settings 尚不可用时，都曾使用短期 granular token 完成首发；`0.1.1` 首发期间，GitHub Actions secret `NPM_TOKEN` 只向尚不存在的 Windows package 的 publish 子进程提供凭据。当前 workflow 与发布脚本已移除该路径，不再读取 bootstrap secret。新 package 首发后，应分别配置 GitHub Actions Trusted Publisher：

- GitHub owner：`bYiyLi`
- Repository：`kg-os`
- Workflow filename：`release.yml`
- Allowed action：允许 `npm publish`

全部配置完成并核对后，删除 repository secret `NPM_TOKEN`，撤销 npm 上的短期 bootstrap token；后续 `v*` Release 使用 OIDC，无需长期 npm publish token。`0.1.1` 的两项清理已完成；`v0.2.0` Release Run `36410721397` 已真实证明八个 package 都能通过当前无 token、`id-token: write` 的 Trusted Publishing 路径发布。`v0.2.1` 首次 Release Run `36510797281` 在六个 Runtime 已发布后遇到 registry propagation timeout；Recovery Run `36514243605` 按上面的 `reuse_release_run` 合同复用 verified `release-set`，跳过 candidate 重建并成功完成剩余 SDK / CLI、八包 registry verification、六平台 smoke 与 GitHub Release，验证了部分发布恢复路径。

只完成本地 candidate、workflow 配置、部分 npm publish 或单独 Git tag 都不等于公开 Release 完成；`0.1.0` 真实状态以 [Phase 09](../development/phases/09-mvp-release-closure.md)、`0.1.1` 以 [Phase 11](../development/phases/11-windows-runtime-acceptance.md)、`0.2.0` 以 [Phase 12](../development/phases/12-first-run-cli-productization.md)、`0.2.1` 以 [Phase 13](../development/phases/13-init-wizard-credential-boundary.md) 的 registry/tag/Release 证据为准。

## 常见问题

- `pnpm install` engine mismatch：切换到 `.node-version` 指定的 Node。
- 缺 C compiler：安装当前平台 C toolchain；没有 pure-Go SQLite fallback。
- Playwright 缺浏览器/system library：重新执行 setup；Linux 需要时运行 `playwright install --with-deps`。
- Lithograph fixture hash失败：准备脚本会 fail closed，不回退相邻工作树或其它版本。
- npm Runtime optional package被 omit/缺失：CLI会在需要启动 daemon 时 fail closed，不联网偷偷下载 binary。
- 想清理生成物：运行 `pnpm clean`；依赖和 `.cache/lithograph/` 保留以避免重复下载。
