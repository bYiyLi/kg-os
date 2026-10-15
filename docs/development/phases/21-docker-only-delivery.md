# Phase 21：Docker-only Distribution & CI Simplification

## 状态和目标

`done`（2026-10-15）。已按照 [D99](../../design/decisions.md#d99-linux-amd64-docker-only-distribution)，将未来 KG OS 正式交付收敛到 **Linux amd64 单镜像**，删除不再使用的六平台 Native/npm 发布与重复门禁，保留 Web/API/MCP/Graph/Evolution 的真实行为验收。

## 范围与责任

- **在范围内**：CI workflow、Release workflow、根包质量任务、仅为 npm 候选/registry release 服务的代码、Docker 构建时的历史 native 输入版本解耦，以及设计/开发/使用入口同步。
- **不在范围内**：重写 KG OS Kernel/SDK/Web、Lithograph 数据模型、改变现有 Instance 的持久化格式、自动删除已发布 npm 包、更新老 Tag、正式 GHCR 发布或生产部署。现有 TypeScript CLI 可保留为内部开发代码，不再作为新版本 npm 交付。
- **开发环境**：Mac 可继续执行本机 Go/TS 测试，不在 Mac 跑 Docker；OpenClaw Linux amd64 继续作为 Dev 与隔离 Docker 验证机；GitHub Actions 单独对提交 SHA 运行质量与 Docker 验收。

## 实现项

| ID | 工作 | 验收 |
| --- | --- | --- |
| P21-01 | 冻结唯一 Linux amd64 Docker / GHCR 当前合同，更新历史 npm 分发与各文档的现行/历史关系 | A21-01 |
| P21-02 | PR/main 改为 Ubuntu Validate + Linux amd64 Docker 两个 Job，移除 6 平台 Runner/Native/pack matrix | A21-02 |
| P21-03 | Tag Release 改为 Docker build → same-image smoke → GHCR push/digest verify → GitHub Release，无 npm OIDC / Registry 发布 | A21-03 |
| P21-04 | 清理仅供 npm Release 的脚本、测试和依赖，移除 npm candidate/exports 与冗余 native 门禁；镜像 native artifact 版本与 Docker Tag 解耦 | A21-04 |
| P21-05 | 对源码、文档、构建和安全边界反复 Review/修正，并跑真实相关验证 | A21-05 |

## Acceptance

### A21-01 合同与文档

README、Client、Runtime、MCP、CLI、设计索引、AGENTS、开发路线/指南准确区分：**当前新交付只是一份 Linux amd64 镜像**；历史 v0.2.1 npm 发布已经完成，不当作将来仍支持的渠道；SDK/Web/MCP 代码仍持续维护。不用开发计划覆盖或重新定义设计 owner。

### A21-02 CI

`.github/workflows/ci.yml` 对 PR/main 只有两个执行 Job，均在 Ubuntu/Linux amd64；Validate 覆盖 Go 质量/竞态/覆盖率、安全、类型、Web/SDK 测试、E2E，Docker Job 用**本次源码**真正构建 Linux amd64 统一镜像并对临时 Instance/Volume 执行 31/31 SDK 和认证/重启 Smoke。普通 CI 不推送镜像。

### A21-03 Release

`release.yml` 只对已有、版本匹配、main 可达的 Tag 构建一份 Linux amd64 镜像；对将推送的同一镜像执行实际 Smoke，再用具备必要最小权限的凭据推送 GHCR，验证发布 digest/platform/revision 后创建或确认 GitHub Release。正式发布流程不再引用任何 npm Candidate、Registry 发布或 six-platform job。

### A21-04 代码清理

无执行路径引用已删除的 npm-only 发布脚本；`pnpm install --frozen-lockfile`、`pnpm check:quick`、核心 `pnpm validate` 与 SDK Help 31/31 仍能运行；本地 Dev 与 Docker 运行时行为不因删除 npm 发布入口而改变。构建时固定原生扩展版本不与未来 Docker tag/项目 version 错误耦合。构建输出与凭证不进入提交。

### A21-05 Review 与证据

重新读取设计及实际代码，核对工作区更改、`git diff --check`、Markdown/Spelling/YAML/Workflow 静态合同；执行受影响的 Go/TS/JS 定向与质量测试；能使用 OpenClaw 时用独立临时镜像/Volume 做 Linux Docker Smoke，不触碰长期 Dev。未 Push 的新 CI 与新 Release 工作流**不得声称远端已通过或镜像已正式发布**。保留 Phase 20 既有 Dev/CI 的历史失败事实，新的两 Job 门禁只有在实际触发并成功后才有成功证据。

## 证据与完成条件

- **进入时**：`main@6ca1716`，当前有尚未提交的 `docs/development/phases/20-mcp-tool-help.md` 内容；本轮保留该原有修改。上一版 CI Run 38715878540 的 Windows x64 npm Smoke、Windows arm64 工具链失败说明六平台分发维护成本，但不等于新 Docker-only CI 已验证。
- **本轮设计与代码**：D99 明确全产品 Linux amd64 Docker-only；CI 仅 `validate`、`docker-unified` 两个 Ubuntu Job；Release 仅构建、隔离测试、推送验证一份 Docker 镜像与 GitHub Release，不再有六平台 npm/Trusted Publishing 链。停止八个历史 npm workspace package 的新 Publish（`private: true`），保留 SDK、内部 CLI/Web 和本地测试装配源码；删除 `scripts/release*`、`scripts/pack-release.mjs`、`scripts/check-package-exports.mjs` 等仅服务旧分发的脚本和对应七个 Vitest 用例。删除与 npm candidates/platforms 有关的额外质量门禁，保留 Go race/coverage、TS/Web/MCP 单测、Playwright、安全/License、SDK Help/JSON Schema 等产品门禁。
- **运行版本边界 Review**：`Dockerfile.unified` 把历史扩展包输入 `NATIVE_RUNTIME_VERSION=0.2.1` 与镜像当前源码版本分离；镜像 manifest 在验证历史包来源及更新 Go daemon SHA-256 后，从根 `package.json` 写入**当前 KG OS 版本**，以满足 `internal/runtime/runtime.go` 严格的 `pkg.Version == buildinfo.Version` 启动校验；避免未来 Docker tag 与旧 npm 输入版本错误绑定。此处没有引入新 Native 构建系统或额外下载服务。
- **本地定向验证**：`pnpm install --frozen-lockfile --ignore-scripts` 退出码 0；`pnpm check:quick` 退出码 0（Vitest **224/224**），相较原 231 仅删除 7 个 npm-only Release 测试；GitHub CI/Release YAML 经 Python YAML parser 验证只有 **2 / 1 Job**，源码中不再有已删除 npm 发布脚本的活动调用；Markdown Prettier、`git diff --check` 已用于代码/文档静态 Review。
- **Linux amd64 实测**：在 OpenClaw 仅用临时源码镜像和孤立测试环境完成真实 `Dockerfile.unified` 镜像构建 `kgos-phase21-ci:qa`（`sha256:304bd5b643ad0b730c871e30c56690dddd5b05759d801bbb1c32c7824cf1ad5d`，`linux/amd64`、默认 UID `10001`）。由于 OpenClaw 出站网络约束，**只在构建阶段**复用受控基础镜像代理和 Host/Proxy；运行中的镜像不依赖代理。对本次镜像执行 `node scripts/mcp-unified-docker-smoke.mjs`，**exit 0：31/31 SDK、MCP Help、Web/API/MCP、认证隔离、非 root、无 Node 与重启持久化通过**。隔离 QA 镜像和临时源码已清理，未部署长期 Dev/生产、未触碰 Dev Instance。
- **Review 修正与实际完成验证**：原始完整 `pnpm validate` 发现清理发布专用脚本后 `scripts/process.mjs` 留有未使用的 `waitForProcessExit`，已删除；后续完整验证的 Go race 在共享 Mac 负载下偶发命中旧测试的 10 秒 Locator 截止时间，已将 `cmd/kgosd/main_integration_test.go` 的**测试等待预算**改为有界 30 秒（不改 daemon 启动 SLA 或取消语义），独立 `pnpm test:go:race` 与完整门禁中再次验证通过。Review 恢复不应随 npm 发行一起删除的 TypeScript `check:type-coverage` 强制门禁。所有改动属于源码质量/文档/测试基础，不修改产品业务能力。
- **Mac 最终门禁（2026-10-15）**：当前工作区执行完整 `pnpm validate` **exit 0**：Go race 通过、Go 总语句覆盖率 **90.0%**、govulncheck、SDK Help 31/31、Vitest **224/224**、TypeScript 类型覆盖率 **99.73%**、Playwright **26/26**、Knip 未使用代码检查、零重复代码、格式、License 与依赖审计、`check:diff` 均通过。生产依赖审计没有已知漏洞；全部开发依赖仍报告 **2 项告警**，按照仓库原有阈值与特定豁免规则退出码 0，不能声称零风险。
- **Workflow / 文档静态复验**：CI YAML 解析后为两个 `ubuntu-24.04` Job；Release YAML 为一个 Docker Job，所有 GitHub Actions 内联 Bash 经 `bash -n` 解析成功，构建→Smoke→Push→Digest→Release 顺序正确，严格使用已有 v* Tag、当前版本、main 祖先与精确 SHA，不使用 npm Publish 或六平台任务。修改过的 Markdown 相对路径有效、Markdownlint **0 issue**、CSpell **0 issue**、Prettier 通过、`git diff --check` 通过。静态 workflow Review 不等于远程 GitHub Actions 已实际运行。
- **首轮新 CI 和修正（2026-10-15）**：Docker-only 改造以 [`d9f4376`](https://github.com/bYiyLi/kg-os/commit/d9f4376333756b0f24d1219412d8364b48eee4f7) 推送到 `main`。新两 Job [Run 38732217540](https://github.com/bYiyLi/kg-os/actions/runs/38732217540) 的 Linux amd64 Docker（真实隔离 Smoke）为 **success**；Ubuntu Validate 在 `go test -race` 的 `TestQuickJSGuestLowLevelInvalidExportsAndJSCalls` 中出现 `module closed with context deadline exceeded`，旧 8 秒测试上下文在 Linux CI 负载下实际耗时约 8.58 秒，因此 **Validate=failed，不能算作通过**。已将该测试（仅测试上下文，不是运行时沙箱预算）改为有界 30 秒，与相邻 QuickJS 测试的运行预算一致；本机对该测试执行 `go test -race -count=3` **exit 0**。最终阶段关闭仍要求修正提交后的 GitHub Ubuntu Validate + Docker 两 Job 实际通过。
- **最终 CI 修复与关闭证据（2026-10-15）**：`d9f4376` 的首轮 CI Run 38732217540 为 failure，失败在 Linux Go race 的 QuickJS 边界测试 `8s` 上下文预算（耗时约 8.58s），而 Docker Job 已 success。保持实际生产 Sandbox 超时和权限完全不变，仅将测试上下文改为 `30s`；定向 `go test -race -count=3` exit 0，修复提交 [`32b7584`](https://github.com/bYiyLi/kg-os/commit/32b75841c72745b5504518bc63f7e12f50871915) 已推送 `origin/main`。对应 [CI Run 38734363706](https://github.com/bYiyLi/kg-os/actions/runs/38734363706) **Validate = success；Unified Docker / Linux amd64 = success；整轮 2/2 success**，Docker Job 包含从当前提交构建同一镜像、独立 Volume 的 Web/API/MCP/31/31 SDK/权限与重启持久化 Smoke。不能将旧失败 Run 写成成功。
- **完成结论**：P21-01–05 / A21-01–05 已完成：设计与开发计划同步、清理旧 npm/六平台交付链、Linux amd64 Docker 构建与隔离测试、Mac 完整 `pnpm validate`、两 Job GitHub CI 和多轮 Review 均有实际证据。**新 Tag Release workflow 已被 GitHub 识别为 active，且静态合同检查通过，但没有触发实际 GHCR 发布**；GHCR 正式 Release、Tag、生产部署为后续独立授权动作，不冒称已完成。
