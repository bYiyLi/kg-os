# Phase 00：Engineering Foundation

**状态：`done`**

## 1. 目标与范围

建立后续 KG OS 开发共享的 TypeScript / Node.js 工程基线，使新 checkout 能够安装、开发启动、调试、检查、测试、构建并验证本地交付物。

本 Phase 交付工程环境和最小真实壳层，不实现 Knowledge Base、认证、正式 daemon lifecycle、业务 API、SQLite / Lithograph adapter、Ontology / Object / Graph / Evolution 或正式 Web 交互。`kg` / `kgosd` 只提供帮助和版本入口；Web 壳层不得伪造业务成功状态。

## 2. Design Inputs

- [D63 TypeScript 与内置 Web](../../design/decisions.md#d63-typescript-integrated-web)；
- [D64 Phase 00 开发环境](../../design/decisions.md#d64-phase0-development-environment)；
- [运行架构](../../design/architecture.md#v1-运行时与技术分层)；
- [Web hosting](../../design/runtime.md#web-hosting)；
- [Lithograph 调用入口](../../design/runtime.md#lithograph-调用入口)。

产品与数据语义继续由各 Design owner 维护。本计划只安排 Phase 00 的实现与验收。

## 3. 依赖与固定基线

- Node.js `24.15.0`，由 `.node-version` 与 `engines.node` 固定；
- pnpm `10.34.5`，由根 `packageManager` 与 `engines.pnpm` 固定；
- ESM TypeScript workspace，内部依赖使用 `workspace:*`，仓库只维护一个 lockfile；
- Lithograph `v0.1.1` release artifact，按 macOS / Linux、arm64 / x64 固定 URL 与 SHA-256；
- Web 构建产物进入 `kgosd` package；开发时 Vite middleware 与 HMR WebSocket 使用同一个 HTTP server。

<a id="phase00-feature-order"></a>

## 4. Feature 顺序

```text
00.1 toolchain and workspace
 -> 00.2 module and compilation boundaries
 -> 00.3 development host and debugging
 -> 00.4 quality gates
 -> 00.5 tests and isolation
 -> 00.6 build and local artifacts
 -> 00.7 hooks and CI
 -> 00.8 documentation and review closure
```

### Feature 00.1 工具链与 workspace

- 固定 Node.js、pnpm、精确依赖版本与 lockfile；
- 建立 `contracts`、`kernel`、`daemon`、`sdk`、`cli`、`web` 六个职责 package；
- 配置 strict TypeScript、NodeNext / browser bundler 边界、EditorConfig、Git attributes 与忽略规则；
- `pnpm run setup` 在新 checkout 中完成 frozen install、Git hook、Chromium 与真实 Lithograph fixture 准备。

### Feature 00.2 模块与编译边界

- `contracts` 不依赖 Node.js、数据库或其它 KG OS package；
- `kernel -> contracts`、`daemon -> kernel/contracts`、`sdk -> contracts`，CLI / Web 不导入 server 或数据库代码；
- Node packages 生成 ESM JavaScript、声明和 source map；Web 使用 Vite 构建；
- Phase 00 CLI / daemon 对未实现业务参数明确失败，不提供空业务实现。

<a id="phase00-development-host"></a>

### Feature 00.3 开发宿主与调试

- `pnpm dev` 启动一个 HTTP server，同时承载 Vite 页面、HMR WebSocket 与未来 API origin；
- 开发入口在加载 daemon 代码前把 `KG_HOME` 固定为仓库内已忽略的 `.kgos-dev/`；
- Web 修改触发 HMR，daemon 开发入口修改触发 watcher 重启，退出后不遗留进程或端口；
- VS Code 提供 daemon、CLI 与浏览器调试入口，全部路径相对 workspace。

### Feature 00.4 质量门禁

统一根命令覆盖：

- TypeScript typecheck 与 type coverage；
- ESLint / SonarJS、Prettier、Markdownlint、CSpell 与 Secretlint；
- dependency-cruiser、Knip、Sherif、Syncpack、pnpm dedupe 与 jscpd；
- publint、Are the Types Wrong、license 检查和包含开发依赖的 high-level audit；
- tracked、staged 与 untracked 文件的 whitespace 检查。

门禁必须通过受控错误样本证明能够失败；样本随后删除，不进入源码。

### Feature 00.5 测试与隔离

- Vitest 覆盖 CLI、daemon command evaluator、HTTP 静态宿主、真实 Vite development host、Web renderer 与临时 `KG_HOME` helper；
- V8 statements、branches、functions、lines 门槛均为 90%，type coverage 门槛为 99%；
- Playwright 测试本次构建的 Web 与未实现 API 的 404 边界；
- Native smoke 通过 Node.js `node:sqlite` 加载真实 Lithograph，初始化临时数据库并执行参数化只读 Cypher；
- 测试不读取相邻 Lithograph 工作树、不使用真实 Provider credential、不污染默认 `KG_HOME`。

### Feature 00.6 构建与本地交付物

- build 先清理生成物，编译 Node packages，再构建 Web 并复制到 daemon 发布目录；
- exports / type 检查针对实际 package 产物运行；
- 五个 Node package 在 workspace 外的临时目录安装并执行 CLI、daemon 与 Web smoke；
- `pnpm pack:release` 只生成本地候选 tarball、许可证、README 与 SHA-256 manifest，不发布 package。

### Feature 00.7 Git hooks 与 CI

- Lefthook pre-commit 复用 `pnpm check:quick`；
- GitHub Actions 在 Ubuntu 24.04 空 checkout 中安装固定 Node.js、pnpm、Chromium 系统依赖和 Lithograph fixture，再运行完整 `pnpm validate`；
- 覆盖率、Playwright report 与失败 trace 作为 CI artifact 保留；
- workflow 文件存在不能替代远端 job 的实际结果。

### Feature 00.8 文档与 Review 收尾

- [开发计划](../README.md)维护 Phase 状态和统一完成标准；
- 本文件维护 Phase 00 范围、Feature、Acceptance、Review 与证据；
- [开发指南](../../guide/development.md)只维护可执行的本地开发步骤；
- Design 只保留产品行为、技术边界和设计到实现的映射；
- README、决定记录与 vlog 指向各自 owner，不复制第二份 Phase 状态。

## 5. Acceptance Matrix

| ID | 验收场景 | 判定 | 状态 |
| --- | --- | --- | --- |
| P0-01 | 固定工具链与新 checkout setup | 精确 Node/pnpm、frozen lockfile、setup 在无缓存源码副本中成功 | `done` |
| P0-02 | 模块、类型与构建边界 | typecheck、依赖方向、Node/Web 构建与真实版本入口通过 | `done` |
| P0-03 | 开发联调与调试 | 页面、Vite client、HMR、daemon restart、`.kgos-dev` 隔离和退出清理通过 | `done` |
| P0-04 | 质量检查真实生效 | 全部门禁通过；`any`、越层 import 与 whitespace 负向样本分别被拒绝 | `done` |
| P0-05 | 测试与真实扩展 | unit/HTTP/Web、Playwright、临时 profile 与 Lithograph real-load smoke 通过 | `done` |
| P0-06 | 构建与本地交付物 | exports/types、五包外部安装、CLI/daemon/Web smoke 与 SHA-256 核对通过 | `done` |
| P0-07 | Git hook 与远端 CI | forced pre-commit 通过；Linux GitHub Actions 必须有实际成功 job | `done` |
| P0-08 | 文档与最终 Review | Development / Guide / Design 职责分离，链接与状态一致，最终 diff 无已知 finding | `done` |

## 6. 验证执行计划

从 targeted 到完整 gate 扩大：

```text
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm test:e2e
pnpm test:native
pnpm pack:release
pnpm exec lefthook run pre-commit --force
pnpm validate
clean-copy: pnpm run setup && pnpm validate
git diff --check
```

`pnpm test:e2e` 单独执行时先重新构建；完整 `validate` 在自己的 build 后直接运行 Playwright，避免读取旧产物或重复 build。Native、browser、audit 或 package smoke 缺失时必须失败，不允许静默跳过。

## 7. Review

Phase Review 至少检查：

- 是否用壳层或 mock 冒充 Knowledge Base、认证、daemon lifecycle 或业务 API；
- Web 是否仍由同一个 daemon 交付，开发 HMR 是否意外变成第二个产品服务；
- 客户端是否越层导入 Kernel、daemon 或数据库代码；
- coverage / type coverage 是否通过扩大 ignore 或空测试达标；
- Native smoke 是否使用真实发布 artifact、固定 hash 与临时数据库；
- package 是否残留 `workspace:`、开发入口、源码路径或缺失 Web 资源；
- audit 是否覆盖开发工具链，secret scan 是否覆盖 `.npmrc`；
- clean checkout、退出清理、文档状态与最终 diff 是否真实一致。

## 8. 完成条件

P0-01 至 P0-08 全部为 `done`，Phase Review finding 闭环，开发计划、指南、README、Design 引用和 vlog 同步，并取得 GitHub Actions Linux job 的实际成功结果后，Phase 00 才能改为 `done`。

P0-01 至 P0-08 已全部闭合，Phase Review finding 已关闭，开发计划、指南、README、Design 引用和 vlog 已同步；提交 `20d73cd` 对应的 Ubuntu 24.04 GitHub Actions CI run `35454190185` 已成功完成，因此 Phase 00 满足本节全部完成条件并标记为 `done`。

## 9. 当前完成证据

- 本地基线：macOS arm64、Node.js `24.15.0`、pnpm `10.34.5`；
- 当前 workspace 与系统临时目录中的独立源码副本均完成 `setup + validate`；临时副本不复制原仓库 `.git`、`node_modules`、cache、dist、coverage、artifact 或报告，并在验证前初始化独立 Git baseline；
- Vitest：6 个 test file、27 个 test；statements `92.96%`、branches `91.57%`、functions `97.14%`、lines `92.91%`，type coverage `100%`；
- Playwright：2 个浏览器测试通过；
- Native：Lithograph `v0.1.1`、ABI 1、darwin-arm64 real-load smoke 通过；
- Packaging：五个 tarball 在 workspace 外安装运行，`pnpm pack:release` 生成的 9 个文件与 5 个 package SHA-256 已重新核对，验证后已清理本地产物；
- Review：静态 Web 宿主曾可经 Web root 内的 symlink 读取 root 外文件；已改为对 canonical path 再执行 root confinement，并加入回归测试；
- Review：生产静态宿主与开发宿主曾在 URL decode 前判断 `/api/*` / `/control/*`，percent-encoded path 可落入 SPA；已改为单次 decode 后再判断 reserved path，并在 unit 与 Playwright 中覆盖编码路径；两个 finding 的 targeted test、完整 `validate` 与独立源码副本验收均通过；
- Security：完整 high-level audit 无已知漏洞，Markdown 工具链使用已修复的 `smol-toml@1.8.0`；
- Linux CI fixture：Lithograph `v0.1.1` linux-x64 release artifact 已重新下载核对，SHA-256 与固定值 `dc73a730c2c8981761258753934b24673506d383b13c53ada332e3fef441c40c` 一致；
- Cleanup：临时数据库、profile、错误样本、clean-copy 目录和开发/浏览器进程均已清理；
- Remote：提交 `20d73cdb09947da03e3e222a318c2e61134a2879` 已推送到 `main`；GitHub Actions CI run `35454190185` 的 Ubuntu 24.04 `Validate` job（ID `105926467278`）完整通过，闭合 P0-07。后续 review 发现旧版 GitHub Actions runtime 的 Node.js 20 deprecation annotation，已在提交 `896e98c97d22edde358d2bb612a4cec641837d62` 将 checkout / setup-node / upload-artifact 升级到 v7、pnpm/action-setup 升级到 v6；CI run `35454838184` 的 `Validate` job（ID `105928176129`）完整通过，check annotations 为 0。
