# SDK 31 个方法：真实验收矩阵

<!-- cspell:words mcpserver mcpsandbox -->

本页是 **KG OS SDK / MCP 的工程测试证据**，不是新的 API 或产品合同。公共 HTTP 客户端方法以 [`packages/sdk/src/client.ts`](../../packages/sdk/src/client.ts) 为准；正式 Go MCP 的封闭权限表在 [`internal/mcpsandbox/engine.go`](../../internal/mcpsandbox/engine.go)，SDK → Kernel 适配在 [`internal/mcpserver/dispatch.go`](../../internal/mcpserver/dispatch.go)；当前验收以 [Phase 16](phases/16-kgosd-unified-mcp.md) 为准。2026-10-12 的旧 TypeScript MCP 测试细节作为 Phase 15 历史证据留在本页，不再是当前源码入口。

## 1. 验收层级

| 层级 | 入口 | 实际验证 | 不能据此声称 |
| --- | --- | --- | --- |
| SDK HTTP 单元测试 | `packages/sdk/src/index.test.ts` | 请求构造、Bearer、Typed JSON、公共错误、Graph 增量流/取消 | 真实数据库中的方法行为 |
| MCP 方法库存和权限 | `internal/mcpsandbox/engine.go`、`internal/mcpserver/sdk_matrix_integration_test.go`、`internal/mcpsandbox/bridge_boundary_test.go` | 封闭 **15 Read + 16 Write** 表、Read 禁写/未知方法拒绝、真实 Go Bridge 与原生数据库 | 每个用户的真实知识模型均兼容 |
| MCP + 真实 daemon | `internal/mcpserver/sdk_matrix_integration_test.go` + `scripts/mcp-sdk-matrix.mjs` | 标准 MCP Client → **Go MCP → QuickJS-NG WASM → Kernel → Lithograph**；31/31 方法写入/合并/读回 | ChatGPT 对全部 31 方法的 UI 操作 |
| Linux amd64 Dev Docker | 在 [Dev](../guide/dev-environment.md#发布前完整-mcp-验收) 执行 `scripts/mcp-unified-docker-smoke.mjs` | 单进程非 root、Node-free 镜像，独立 Volume 初始化、OAuth 发现、四 Tool、31/31、重启/持久化 | 其他架构、最终 GitHub CI 或正式 GHCR 镜像已发布 |
| Go Kernel 原生回归 | `pnpm test:native` | 真实 Lithograph v0.3.0，Ontology、Knowledge、Graph、Evolution，合并一致性和错误分支 | ChatGPT、npm、Docker 的直接验收 |
| 完整工程与阶段验收 | `pnpm validate` + Linux Dev 实测 + 最终 revision 的普通 CI | Mac 本地质量、独立 Dev Docker/客户端、最终 GitHub Ubuntu Validate/六平台 Runtime **与 Docker 构建/31-method Smoke**；GHCR 推送属另行授权的 Release | 未运行的 CI 或未发布的镜像被算作成功 |

## 2. 公开方法逐项覆盖

下表的“实际场景”由 `scripts/mcp-sdk-matrix.mjs` 的标准 MCP Client 或 `internal/mcpserver/sdk_matrix_integration_test.go` 在真实 Go MCP 中执行；方法集合同时受 Go Bridge 的 allowlist 约束。未来公共方法增删必须同步更新矩阵并重新通过真实 Go / Docker 验收，不能静默漏测。

| 方法 | 权限 | 真实 MCP / daemon 验收 |
| --- | --- | --- |
| `ontology.read` | Read | 已创建 Domain 的成员与 Ref |
| `ontology.patch` | Write | Definition + Domain 成对创建 |
| `object.read` | Read | 读取 Knowledge Node 与 Merge 结果 |
| `object.readText` | Read | 获取 canonical YAML，为后续 Patch 提供基线 |
| `object.patch` | Write | 新建 Knowledge Node、双分支冲突修改 |
| `graph.query` | Read | 在固定 Commit 查询节点计数 |
| `graph.execute` | Write | 写入 Property Graph Node 后读取 |
| `graph.streamQuery` | Read | `columns → row → row → summary` |
| `graph.streamExecute` | Write | `columns → row → summary`，返回新 Commit |
| `evolution.overview` | Read | 默认 Branch、main State 不变 |
| `evolution.get` | Read | State Data 创建/清除后读回 |
| `evolution.ancestry` | Read | 多代 Commit 顺序 |
| `evolution.history` | Read | `scope=all` 的真实 State History |
| `evolution.diff` | Read | 两个固定 Commit 之间的 Diff |
| `evolution.state.create` | Write | 创建 Commit 和 JSON Data |
| `evolution.state.setData` | Write | 更新同一 Commit 的附属 JSON Data |
| `evolution.state.clearData` | Write | 清除附属 Data 并确认 `hasData=false` |
| `evolution.branch.list` | Read | 创建/更新后的完整 Branch 列表 |
| `evolution.branch.create` | Write | 从 main Head 建独立测试 Branch |
| `evolution.branch.delete` | Write | 删除临时 side Branch |
| `evolution.tag.list` | Read | Tag 创建后可见 |
| `evolution.tag.create` | Write | 创建指向固定 Commit 的 Tag |
| `evolution.tag.move` | Write | 移动 Tag 到另一个 Commit |
| `evolution.tag.delete` | Write | 删除临时 Tag |
| `evolution.merge.start` | Write | 冲突 Merge Session 和待终止 Session |
| `evolution.merge.list` | Read | 查询真实 Session 集合 |
| `evolution.merge.get` | Read | 读取 Session 及 Revision |
| `evolution.merge.conflicts` | Read | 获取真实双分支 Knowledge Property 冲突 |
| `evolution.merge.resolve` | Write | 按明确的 `ours` resolution 完成冲突 |
| `evolution.merge.finalize` | Write | 固定 Revision 生成有效合并 Commit 并回读 |
| `evolution.merge.abort` | Write | 中止另一真实 Session |

此外，**四个 MCP Tool** 中 `kgos_preview` 以固定 `viewRevision` 逐页读取并拼接验证全部行数，`state_ancestry` 验证 Commit DAG；`kgos_read` 禁止写入并返回 `PERMISSION_DENIED`；错误 State 返回 `STATE_NOT_FOUND`。这些不是 SDK 的额外方法，不进入 31 个方法的计数。

## 3. 隔离和非成功路径

- 当前 Docker Smoke 使用独立临时 Volume/容器/镜像；真实 Go 集成测试使用 `t.TempDir()` 的隔离 Runtime。测试**不指向**长期 Dev 的 `/data/apps/KgosDev/data/workspace`，不触及现有 `main`。
- 原生 Go 回归使用 `t.TempDir()`：空 Domain、Domain/Definition 已存在情况下的 Knowledge 冲突 Merge。这两个场景曾在真实执行中得到 `CONSISTENCY_ERROR`，必须验证对应 Kernel 修复。不能仅用调整 Smoke 的调用顺序代替修复。
- HTTP/SDK 负面测试覆盖错误凭证、错误 Envelope、流缺失 Summary、Summary 后额外数据、取消及异常；MCP Sandbox 另有错误输出、越权、超时、恶意脚本、并发和桥接负面测试。
- 本矩阵 **不等于** 对任意 Schema/Index/Constraint、百万级图、全部 Cypher 25、复杂多父 Merge 或真实用户 Token 生命周期的穷举。每类边界的正式 Acceptance 仍须按对应 Phase/设计逐项验证。

## 4. 验证证据与待补项

> 以下按时间记录此前验证；旧 npm Repo-out 用途现已收敛为**镜像内部包暂存**，旧 Linux arm64 Docker / MCP npm 六平台要求已被 [D91](../design/decisions.md#d91-mcp-docker-only-delivery) 取消。此处的历史限制不代替 [Phase 15](phases/15-mcp.md) 最新验收门槛。

**CVE 单项风险接受（2026-10-12，用户授权）：** 将 `CVE-2026-93687` 加入 root `package.json` 的 `pnpm.auditConfig.ignoreCves`；`check:security` 保持 `high` 阈值，并分别审计生产依赖和完整依赖树。该例外仅覆盖此 CVE，不覆盖 KaTeX 的 Low 风险或未来其他 High/Critical 漏洞。事实依据：其当前受影响路径只有 Dev 的 `markdownlint-cli2 → micromatch → braces@3.0.3`，此前 Docker Runtime 检查未安装 `braces`。上游修复版可用，或依赖树出现新的生产暴露时，重新审核并撤销例外。此风险接受不证明底层漏洞已修复。

**白名单后实测结果：** 完整 `pnpm validate` 成功退出 **0**；Go statements **90.0%**、Vitest **195/195**、Go Race/安全工具、TS typecheck/type-coverage、Playwright/Native、完整 npm/MCP 31/31 Repo-out、License/格式/依赖检查均通过。安全审计仍显示 Low 1 / High 1（其中仅批准的 CVE 忽略），生产依赖 High 审计返回 `No known vulnerabilities found`。本次未运行远端六平台 CI 或 Linux arm64，不以本地通过替代正式 Phase 15 完成条件。

**最终 Linux Docker 隔离复验（2026-10-12）：** 在将 `smol-toml` 和 `markdownlint-cli2` 升级并更新锁文件后，执行 `pnpm dev:mcp setup` 同步最新源码快照到独立 Dev `src/KGOS`，再使用 `KGOS_MCP_DOCKER_BASE_IMAGE=docker.y2l.top/node:24.15.0-bookworm-slim node scripts/mcp-docker-smoke.mjs`，真实重建 Docker 镜像，`31/31` 方法和持久化重启再次通过。**仅使用独立临时 Volume，没有切换长期 Dev 的运行镜像/管理员 Token/数据库**。

**同日安全依赖升级后的最终复验：** `smol-toml` 从 `1.8.0` 升到 `1.9.1`，直接 CLI 依赖、全局覆盖与 frozen lockfile 已同步；`markdownlint-cli2` 从 `0.23.2` 升到 `0.23.3`，带入安全版本 `js-yaml@5.4.1` 与 `markdown-it@15.0.1`，无需新增全局覆盖。NPM Audit 从初次 **5 项（1 High / 3 Moderate / 1 Low）** 降至 **2 项（1 High / 1 Low）**，`pnpm audit --prod --audit-level high` 为 **0 项漏洞**。剩余 `braces@3.0.3` High（GHSA-vfj7-8cjw-p6xm，**上游无 patched release**）与 `katex@0.16.47` Low（GHSA-238p-pmpm-9mq7；上游修复需跨越调用方 `^0.16` 约束），均来自 Markdown Dev 工具链；当前 Docker 容器核查两者均未安装。**升级后完整 `pnpm validate` 再次执行**：其余所有门禁（Go Race + Go 90.0%、TS 195 tests、Playwright、Native、MCP 31/31 Repo-out、Build、License 等）均通过，只有 `check:security` 因未补丁的 High 失败；项目全绿条件仍未满足。不得把生产漏洞为 0 等同于生产镜像已经更新：**本轮尚未重新部署长期 Dev**。

**完整质量门禁复验（2026-10-12）：** Mac `pnpm validate` 已通过 Go Race / Go coverage **90.0%** / Go security、Vitest **195 tests / 26 files**、type coverage **99.44%**、Playwright、真实 Lithograph Native、npm/MCP Repo-out、构建及许可证等检查。但**最终于 `pnpm check:security` 失败**：npm audit 共 5 项，其中唯一 High 为 `braces@3.0.3` 的 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)（CVE-2026-93687），来自开发工具依赖，目前上游无修复版本。已核查当前 Docker Runtime 未安装 braces，`pnpm audit --prod --audit-level high` 退出 0；生产依赖仍存在 `smol-toml@1.8.0` Moderate（patched `>=1.9.0`）。不自动降低安全审计阈值或添加忽略规则。Linux amd64 使用本轮**最新 Kernel 修复源码**重新通过 Docker 31/31 SDK 方法和容器重启持久化。

2026-10-12 本地 Mac (darwin-arm64)：Repo-out SDK 31/31 真实方法矩阵通过；`packages/sdk/src/index.test.ts` 既有 22 个测试、`sdk-dispatch.test.ts` 新增清单一致性断言和权限回归。空 Domain、Ontology + Knowledge 冲突 Merge 已能在原生 Lithograph v0.3.0 复现，发现原因分别为 `nil` / `[]` 规划表示不一致，以及每次 Knowledge Patch 都重建**不变的 Domain 成员关系**造成双分支边重复；已在 KG OS Kernel 层修正，不将通用 Property Graph Relationship 去重语义错误地归属 Lithograph。

**补充验收（2026-10-12）：** Linux **amd64** 上，以隔离 Docker Volume 完成了 **31/31 SDK 方法真实运行**与镜像重启持久化测试（随后用包含逐边身份保持修复的最新源码再次通过）；仓库外 npm 同样完成 **31/31**。后续增补的 `internal/kernel/domain_membership_identity_integration_test.go` 将 Domain 包含关系的**增加/删除及共同边 elementId 不变**纳入原生回归；`internal/kernel/sdk_evolution_validation_integration_test.go` 对 History/Diff 的非法输入、Cursor 绑定和 Object Anchor 分页做真实数据库验证。Kernel 同步改为**逐条增删变更的成员关系，保留所有未变关系的原生 identity**，覆盖已发现的分支 Merge 重复关系缺陷，而非简单地重建整个 Domain set。上述新增定向测试均通过；需对最终代码重新运行全量门禁。

**尚待真实验证**：全量安全审计解除 High 阻塞后的 `pnpm validate` 全绿、独立 fresh-source、Linux arm64 Docker、六平台最终 CI、真实 ChatGPT 端所有 SDK 组合能力。目前用户已通过 ChatGPT Plugin 真实验证四个 MCP Tool、独立 Branch 写入/Commit/回读与只读权限拒绝，但它与仓库外 31-method 测试是**不同验收层级**。

## 5. D91/D92 当前验收状态（2026-10-12）

| 验收内容 | 最新证据与状态 |
| --- | --- |
| MCP 内部构建中间物 | `pnpm build` 与 `pnpm check:mcp:staging` 均退出 0；仓库外真实四 Tool、31/31 SDK 方法通过，**不意味着公开 npm 包存在** |
| Mac 全量本地门禁 | `pnpm validate` 退出 0，包括 Go Race、真实 native、Vitest 195/195、Playwright、许可与 audit；仅已有单项开发工具 CVE 白名单生效 |
| Linux amd64 Docker | 先前独立 Dev Smoke 已通过；本次 Docker-only 修改后的镜像尚未重新构建运行 |
| ChatGPT OAuth / Tool | 用户的真实私人 Connection 已验证 OAuth 与四 Tool 读写；不等于所有 31 个 SDK 方法由 ChatGPT 逐一测试或私人 Skill 激活 |
| 普通 CI | 最终 revision 的 Ubuntu Validate + 原有六平台 Runtime jobs 尚未运行；普通 CI 不再构建 MCP Docker |
| 正式 Release | 仅在获准的 `v*` Tag 上构建、对正式镜像 Smoke、推送 GHCR 并核对 digest；尚未触发，且不作为 Phase 15 `done` 前置 |

**当前不再需要** Linux arm64 Docker 或 MCP npm 六平台验收，也不需要普通 CI 的 Docker 镜像构建；D92 要求 Linux Dev 的真实 Docker 通过、普通 CI 代码与现有 Runtime 回归通过后方可结束阶段。Release CI 属独立发布动作。Phase 15 继续 `in_progress`。
