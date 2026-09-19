# 本地开发 KG OS

本文帮助 KG OS 开发者完成本地安装、开发启动、调试、检查、测试、构建和打包。阶段顺序与完成状态见[开发计划](../development/README.md)，Phase 00 的范围和验收见[阶段计划](../development/phases/00-engineering-foundation.md)；设计到实现的映射见[工程映射](../design/implementation.md)。

## 当前边界

Phase 00 提供 TypeScript workspace、`kg` / `kgosd` 可执行入口、同源 Web 开发壳层、质量检查、测试、CI 和本地打包验证。当前可执行入口只支持帮助和版本；Web 只证明浏览器资源与 HTTP 宿主可运行。Knowledge Base、认证、daemon 正式生命周期、业务 API 和数据库 adapter 尚未实现。

未实现的 `/api/*` 与 `/control/*` 请求返回 404。开发壳层不读取或创建默认 `KG_HOME`，不会把尚未接入的业务能力伪装成成功。

## 工程目录

仓库根目录只保留包管理、Git、Node.js、TypeScript 基线以及 ESLint / Prettier / Lefthook 这类生态约定较强的入口文件。专项工具配置统一放到 `config/`：

```text
config/
├── quality/
│   ├── cspell.json
│   ├── dependency-cruiser.cjs
│   ├── knip.json
│   ├── markdownlint-cli2.yaml
│   └── secretlint.json
└── test/
    ├── playwright.config.ts
    ├── tsconfig.test.json
    ├── tsconfig.type-coverage.json
    └── vitest.config.ts
```

`package.json` 中的统一命令显式指定这些配置路径，开发者仍只需要运行 `pnpm lint`、`pnpm test`、`pnpm test:e2e`、`pnpm validate` 等根命令，不需要记住具体配置文件位置。

## 工具链

| 工具 | 固定版本或要求 |
| --- | --- |
| Node.js | `24.15.0`，由 [`.node-version`](../../.node-version) 固定 |
| pnpm | `10.34.5`，由根 `packageManager` 和 `engines` 固定 |
| Git | 用于 hooks、diff 检查和 CI checkout |
| `tar` | 用于校验并解压固定的 Lithograph 测试 artifact |
| 平台 | Phase 00 本地验证覆盖 macOS；CI 配置为 Ubuntu 24.04。Lithograph fixture 支持 macOS / Linux 的 arm64 与 x64 |

进入仓库后先确认版本：

```sh
node --version
pnpm --version
```

版本必须分别输出 `v24.15.0` 与 `10.34.5`。然后运行：

```sh
pnpm run setup
```

`setup` 使用 lockfile 安装依赖，安装 Lefthook、Chromium headless shell，并下载和校验当前平台的 Lithograph fixture。它不安装全局 npm package，也不修改默认 KG OS profile。Linux 主机若缺少 Chromium 系统库，先执行：

```sh
pnpm exec playwright install --with-deps --only-shell chromium
```

## 开发启动

```sh
pnpm dev
```

默认页面是 `http://127.0.0.1:4765`。需要其它端口时设置 `KGOS_DEV_PORT`；设为 `0` 可让操作系统分配临时端口。

开发命令固定把 `KG_HOME` 指向仓库内已忽略的 `.kgos-dev/`，不会读取调用命令前已有的 `KG_HOME`。开发宿主在一个 HTTP server 中挂载 Vite middleware：页面、未来的 API 路由和 HMR WebSocket 使用同一端口。修改 `packages/web/src/` 会刷新浏览器；修改 `packages/daemon/src/dev.ts` 会重启开发宿主。按 Ctrl-C 结束后，watcher、HTTP server 和 WebSocket 一起停止。

## 调试

[`.vscode/launch.json`](../../.vscode/launch.json)提供两个调试入口：

- `KG OS development host`：启动 daemon 开发宿主，可在 TypeScript 服务端源码断点。
- `KG OS CLI`：以 `--help` 启动 CLI；可在配置中替换参数。

Web 构建和服务端编译都生成 source map。VS Code workspace 同时固定 ESLint、Prettier 和仓库 TypeScript SDK。

## 检查与测试

| 命令 | 检查内容 |
| --- | --- |
| `pnpm typecheck` | Node package、Web、测试与配置的 TypeScript 类型 |
| `pnpm lint` | ESLint、格式、模块边界、workspace 规则、Markdown、拼写和 secret scan |
| `pnpm test` | Vitest 单元与 HTTP 宿主测试 |
| `pnpm test:coverage` | 四项 V8 覆盖率，门槛均为 90% |
| `pnpm test:e2e` | 先重新构建，再测试 Web、静态资源和未实现 API，避免复用旧产物 |
| `pnpm test:native` | 真实 Lithograph extension 的加载、初始化和只读 Cypher smoke |
| `pnpm check:quick` | typecheck、lint 和快速测试；也是 pre-commit 内容 |
| `pnpm validate` | frozen install、全部质量检查、测试、构建、包检查、许可证、audit 和 diff 检查 |

覆盖率输出到 `coverage/`，Playwright HTML 报告输出到 `playwright-report/`，失败 trace 输出到 `test-results/`。这些目录不会提交到 Git。

V8 覆盖率纳入 packages 中可复用的 TypeScript 源码。测试文件、生成的 `dist` 以及只负责把参数交给已覆盖模块的 `bin.ts`、`dev.ts`、Web `main.ts` 薄入口按具体路径排除；CLI 进程入口与浏览器入口分别由构建后 smoke 和 Playwright 继续验证。

`pnpm validate` 在自己的 build 步骤后直接运行 Playwright，避免重复构建；单独运行 `pnpm test:e2e` 时则会先构建。secret scan 同时覆盖 `.npmrc`，防止 registry credential 被写进仓库。浏览器、Native fixture、audit 或 package smoke 缺失不会被当作跳过成功，任何一步失败都会让总命令失败。

## Lithograph fixture

[`scripts/lithograph-artifacts.mjs`](../../scripts/lithograph-artifacts.mjs)固定 Lithograph `v0.1.1` 的 release URL、平台 artifact 和 SHA-256。准备脚本只接受校验和匹配且路径安全的 archive，并把结果放入 `.cache/lithograph/`。测试不读取相邻的 Lithograph 工作树。

`pnpm test:native` 使用 Node.js `node:sqlite` 加载真实 extension，在临时 SQLite 文件中执行 `lithograph_version()`、`lithograph_init()` 和参数化 `RETURN 1 AS value`，随后关闭连接并删除数据库。这个 smoke 不代表正式 SQLite driver、SQL `tx_*`、streaming、只读连接或 embedding cache 已完成。

## 构建与本地交付物

```sh
pnpm clean
pnpm build
```

`build` 编译 Node packages，构建 Web，并把静态资源复制到 `packages/daemon/dist/web/`。可以直接核对 Phase 00 入口：

```sh
node packages/cli/dist/bin.js --help
node packages/daemon/dist/bin.js --version
node scripts/serve-built-web.mjs --port 4173
```

生成并验证本地候选交付物：

```sh
pnpm pack:release
```

结果写入 `artifacts/phase0/`。脚本在 workspace 外的临时目录安装 tarball，运行 CLI / daemon 版本入口并启动已安装的 Web 壳层；它不发布 package、不提交或推送代码。

## Git hooks 与 CI

`pnpm run setup` 安装 [Lefthook](../../lefthook.yml)。pre-commit 运行 `pnpm check:quick`。

[GitHub Actions](../../.github/workflows/ci.yml)在 Ubuntu 24.04 空 checkout 中安装固定的 Node.js、pnpm、Chromium 系统依赖和浏览器，然后运行 `pnpm validate`；无论成功或失败都会尝试上传覆盖率和 Playwright 报告。workflow 文件已经建立，远端 job 只有在代码提交并推送后才会产生可核对结果。

## 常见问题

- 安装时报 engine mismatch：切换到 `.node-version` 指定的 Node.js，并使用 `packageManager` 指定的 pnpm。
- Playwright 找不到浏览器：重新运行 `pnpm exec playwright install --only-shell chromium`；Linux 缺系统库时使用上面的 `--with-deps` 命令。
- Native fixture 不支持当前平台：`test:native` 会列出支持的 macOS / Linux 架构并失败，不会静默跳过。
- 想清理生成结果：运行 `pnpm clean`。依赖和 `.cache/lithograph/` 保留，避免每次重新下载；缓存校验失败时准备脚本会自动重新获取。
