# KG OS 开发指南

本指南只描述**当前仓库实际可运行的开发命令**。KG OS 现在只将 Linux amd64 Docker 镜像作为官方未来交付产物；历史的 `@kgos/cli`、`@kgos/sdk`、六平台 Runtime npm 发布已停止新增版本，但部分源码仍用于本机开发。正式产品与发行合同见 [D99](../design/decisions.md#d99-linux-amd64-docker-only-distribution)、[Client](../design/client.md#docker-only-交付)；路线和验收见 [Phase 21](../development/phases/21-docker-only-delivery.md)。

## 环境与仓库

源码真源在 Mac `/Users/yi/Code/KGOS`。Mac 做 Go / TypeScript / Web 本机开发和检查，**不运行 Docker**；通过 `ssh openclaw` 到 Linux amd64 的 OpenClaw 进行镜像构建和隔离测试。长期 Dev 与备份、认证和回退统一使用 [Dev 管理入口](dev-environment.md) `pnpm dev:mcp`。不要直接改写长期 Dev 的数据库、Token 或 Workspace。

| 工具 | 冻结版本 / 作用 |
| --- | --- |
| Node.js | 24.15.0，TypeScript/Web 构建与测试工具，不包含在运行镜像 |
| pnpm | 10.34.5，源码依赖与质量命令 |
| Go | 1.27.2，`kgosd` / Kernel / MCP / SQLite driver |
| Rust | 1.97.1，本机 official Jieba 原生扩展测试 |
| CGO / C compiler | 本机 `kgosd` 和 SQLite 扩展编译 |

```sh
cd /Users/yi/Code/KGOS
pnpm run setup
pnpm check:quick
```

`setup` 检查固定工具链、安装冻结依赖和 Git hook，并准备本机真实原生测试环境。配置/认证文件不得入库。

## 日常 Web 与 Go 调试

```sh
pnpm dev
```

`pnpm dev` 复用原有**内部开发**流程：编译当前 Go daemon、从当前本机支持的历史 native package manifest 装配测试用扩展，启动临时 `.kgos-dev` Instance，再启动 Vite 开发页面 `http://127.0.0.1:5173`。它不是另一种官方运行产物；不支持本机 Docker 就不在 Mac 运行 Docker。

只调前端可执行 `pnpm --filter @kgos/web dev`（127.0.0.1:5174）；构建与测试时：

```sh
pnpm build
pnpm test:e2e
```

`build` 目前仍会为本机开发生成 `artifacts/npm/runtime-<target>` 内部目录，供 Web Playwright 的 `kgosd` 测试启动器使用；这个目录**不能视为将来发行的 npm package**，也不做 Registry Smoke。现存 CLI 源码可通过 `pnpm exec` / Node 本机执行，用于回归，但其 npm 分发不再是未来 CI 的验收要求。

## 代码质量与正确性

| 命令 | 验证内容 |
| --- | --- |
| `pnpm check:quick` | Go 单测/静态检查、TS 类型、Lint、Vitest；pre-commit |
| `pnpm validate` | Go race、真实 Lithograph/Kernel coverage（>=90%）、govulncheck、TS/Web tests、Playwright、SDK Help 同步、依赖/License/安全和 diff |
| `pnpm test:go` | Go Unit / Integration、SQLite FTS5 |
| `pnpm test:go:race` | 带 race 的真实 native Kernel / MCP 集成 |
| `pnpm test:go:coverage` | 真实 Lithograph 路径与整个 Go 项目覆盖率 |
| `pnpm test:native` | **按需**本机 Lithograph / Provider / Jieba 回归（已由 Go race/coverage 的集成路径覆盖，不是额外发行门禁） |
| `pnpm test:coverage` | SDK/Web V8 覆盖率 |
| `pnpm test:e2e` | 重建并执行真实浏览器 E2E |
| `pnpm test:docker:unified` | **仅在 Linux amd64 OpenClaw/CI 执行**，隔离真实镜像与持久化数据测试 |
| `pnpm check:help` | 校验 31 个 MCP SDK Help 合同与生成物 |

`pnpm validate` 不调用 Mac Docker，也不再打包 npm release tarball、检查旧多平台 native npm 候选或执行 registry 验证；**不能因此取消 Go/Web/MCP 读写权限、真实 State 与隔离容器测试**。Web 或 MCP UI 修改后优先 `pnpm test:e2e`；直接调用 Playwright 时，确认已从当前源码 `pnpm build` 过，不应读取陈旧页面。

安全扫描保留全项目生产和开发依赖审计。历史 `CVE-2026-93687` 的固定审计豁免需要按现有 `pnpm.auditConfig.ignoreCves` 独立复核，新漏洞不能借此整体忽略。

## Linux amd64 Docker 开发及 CI

```sh
pnpm dev:mcp status  # Mac 查询长期 Dev
pnpm dev:mcp check   # 只读核对长期 Dev
```

Dev 部署必须获得单独授权；已授权后使用 `pnpm dev:mcp deploy`，它会在 OpenClaw 自动备份、构建、切换并验证，不能对长期用户 Instance 做写入 Smoke。

需要测试一次真正的 Docker 镜像时，在 OpenClaw 的**独立临时源码目录**用当前 `Dockerfile.unified` 构建 Linux amd64 镜像，然后以环境变量 `KGOS_UNIFIED_DOCKER_SMOKE_IMAGE` 指向**该新镜像**执行 `pnpm test:docker:unified`。它创建、清理独立 Volume，验收单 `kgosd`、非 root/无 Node、Web/API/MCP、四业务工具与 UI、OAuth/认证、31/31 SDK、读写权限、重启持久化。普通 GitHub PR/main CI 只包含 Ubuntu Validate 和 Linux amd64 Docker 两个 Job；源码本地通过不能替代实际 Docker CI。

## 正式 Release 边界

唯一官方新发行物是 `ghcr.io/<owner 小写>/kgos:v<version>` 的 **Linux amd64 Docker**；镜像内容及首次初始化操作见 [MCP 运行指南](mcp.md)。只有明确授权创建或使用已存在的 `v<version>` Git Tag 后，`.github/workflows/release.yml` 才会按该 exact revision 构建、隔离 Smoke、推送并验证 GHCR 镜像与 digest，最后创建/确认 GitHub Release。它不再执行 npm Trusted Publishing、六平台 candidate/registry smoke。

本地检查、Git Commit/Push、OpenClaw Dev、CI、GHCR Release、生产部署是独立动作；只有实际完成的动作才能报告成功。历史 v0.1.x–v0.2.1 npm 发布证据仍在各自 Phase 08–13 文档中。
