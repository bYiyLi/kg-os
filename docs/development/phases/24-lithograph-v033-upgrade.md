# Phase 24：Lithograph v0.3.3 依赖升级

## 目标与状态

**状态：`in_progress`（2026-10-19）**。将当前 KG OS 源码、本机测试扩展、Linux amd64 Docker 主扩展/Provider 与 MCP Cypher 手册从 v0.3.1 对齐至正式发行版 **v0.3.3**，按“升级 → 验证 → Review → 修复 → 复验”关闭范围内问题。用户已授权依赖升级和持续 Review/优化，并进一步明确授权提交、推送到 `main`、跟进并修复 CI，直到两个 Job 全部通过后关闭本阶段；保留原有 Plugin 改动。长期 Dev 部署、Tag/GHCR 与生产部署尚未授权，不在本次执行范围。

## Design Inputs 与前置依赖

- [D103](../../design/decisions.md#d103-lithograph-v033-upgrade)、[Graph](../../design/graph.md#graph)、[Runtime](../../design/runtime.md#lithograph-调用入口)约束同版制品、SQL-only、连接/取消、Provider cache 与公共执行边界；[D99](../../design/decisions.md#d99-linux-amd64-docker-only-distribution) / [D94](../../design/decisions.md#d94-openclaw-docker-development-and-ci)约束 Docker-only 与 Mac/OpenClaw/CI 分工。
- 上游固定版本 [v0.3.2 发布说明](https://github.com/bYiyLi/Lithograph/blob/v0.3.3/docs/releases/v0.3.2.md)、[v0.3.3 发布说明](https://github.com/bYiyLi/Lithograph/blob/v0.3.3/docs/releases/v0.3.3.md)、[Execution Options](https://github.com/bYiyLi/Lithograph/blob/v0.3.3/docs/reference/execution-options.md)、[Known Issues](https://github.com/bYiyLi/Lithograph/blob/v0.3.3/docs/reference/known-issues.md)是本次兼容与限制核对依据。
- [Phase 22](22-mcp-self-describing-docs.md) / [D101](../../design/decisions.md#d101-lithograph-v031-upgrade)的 v0.3.1 与 [Phase 23](23-mcp-tool-taxonomy-and-docs.md)的五 Tool / 批量文档完成证据继续保留，不能替代本阶段实际 v0.3.3 运行与最终 SHA 验收。

## Feature 与 Acceptance

| Feature | 实施范围 | Acceptance |
| --- | --- | --- |
| **P24-01 固定制品与版本** | Release/SHA256 pin、Go capability 版本、依赖检查、本机扩展与 Provider；Docker 替换旧 Runtime 输入的两扩展并重算 manifest | 本机和 Linux amd64 制品来自同版 archive，hash、`VERSION`、`lithograph_version()` 一致为 0.3.3；保留旧库后可读取、继续提交并重启，不新增存储迁移 |
| **P24-02 手册与兼容回归** | 当前 owner 版本说明、MCP 固定链接/生成物、真实函数/Procedure 库存与 Cypher 示例；Schema compiler、Ontology/Object/Graph/Evolution/MCP、stream/transaction/cancellation 回归 | `pnpm check:docs` 拒绝过期/跨版本产物；真实 169 个函数名、172 条签名、38 个 Procedure 对账；代表性新版本修复和现有公共合同通过实际扩展验证，新 SQL options 不误宣称已公开或默认启用 |
| **P24-03 质量、隔离 Docker 与 Review** | Mac `pnpm validate`，OpenClaw 原样 `Dockerfile.unified`、临时 Volume/容器，逐轮 diff/代码/文档 Review 和修复复验 | 最终工作树完整质量通过；Linux amd64 镜像真实装载 0.3.3、非 root/无 Node、Web/API/OAuth/MCP 五个 AI-facing Tool + app-only UI、31/31 SDK、读写隔离与重启持久化通过；无未关闭的范围内 finding |
| **P24-04 最终 CI 与阶段关闭** | 按本次明确 Commit/Push 授权取得最终 SHA 的 Ubuntu Validate + Linux amd64 Docker CI | 两个 Job 均取得该 SHA 的真实 success 后方可标记 `done`；未执行或未通过时保持 `in_progress`，Dev/Release/生产状态分别报告 |

P24-01 是真实兼容与镜像验收前置；手册静态同步可并行准备，运行示例与库存必须来自 0.3.3 正式制品。旧库升级测试与写入 Smoke 只使用隔离数据，不在长期 Dev 用户库执行。

## Review 与完成条件

核对所有版本来源与制品哈希、SQL envelope/错误映射、Graph read/write 与 State/Branch、取消后的 transaction/pool 清理、generated constraint identity、Provider/Jieba、MCP 内嵌手册和实际库存。上游修复不意味着新 KG OS 公共能力，也不证明每个运行环境已经升级。修复实际发现的问题后复验受影响范围，最终检查完整 task diff、新增文件、相对链接与 `git diff --check`，保留无关用户改动。

P24-01–04 的 Acceptance、完整质量、隔离 Docker、Review 与文档同步必须共同满足。仅版本常量/文字已改、本机成功或旧 Phase CI 通过，均不能关闭本阶段。

## 当前证据与剩余项

- 2026-10-19：已核对当前仓库与上游固定发布资料。v0.3.2 已修复 Provider cache 首次并发初始化，v0.3.3 保持 storage format 3、`CY25-2026.08` 和 Provider SPI V1；新增访问控制/执行内存选项没有进入现有公共 Graph 请求。
- 文档定向 Review：当前 owner、Client/Graph/Runtime、MCP 手册与固定链接、D103、路线和本 Phase 已同步；D101/Phase 22 的旧版本验收保留。Markdown 检查实际覆盖 93 篇、0 issues；本轮 19 篇文档 CSpell / Prettier 通过，633 个本地 Markdown 链接目标无缺失，`git diff --check` 通过；这些是静态文档结果，不代替运行/镜像验收。
- **制品与文档已对齐**：核对正式 Release `v0.3.3`（源码 `b259f8c6a341b775ef90baf0efd6d2fb11a83fb7`），六平台 archive SHA-256 与已发布 asset digest 6/6 一致；macOS arm64 正式主扩展与 Provider 已下载、校验并实际加载。对真实 `SHOW FUNCTIONS` / `SHOW PROCEDURES` 逐字段核对，169 个函数名、172 条签名、38 个 Procedure 与当前 snapshot 一致；`pnpm check:docs` 验证 31 方法、75 类型、133 篇内嵌页面。
- **真实旧库升级通过**：以旧 KG OS `c848c6ada20a25c5e21e02f776f05900b0fa54bd` / 正式 v0.3.1 建库，关闭后由当前工作树 Go 变更 / 正式 v0.3.3 打开。普通名称与中文/内含反引号名称两个隔离场景均覆盖 bootstrap、required/unique/from/to、Domain、两个 Knowledge Node、一条 Relationship、Branch/Tag；database baseline/ID、Overview、Ontology、Object、Graph、History、Branch、Tag、State、Diff 十类 JSON 结果保持一致，升级后 Patch、旧 Ref/State/Branch identity 和二次重开均通过。特殊名称的限定 MATCH 从旧版错误的零行恢复为正确的一行。本探针未覆盖旧库中的 Full-text/Semantic Index、Provider cache、Merge Session 或超大数据；当前相关能力仍由真实 native 全量测试验收。
- **回归及修复通过**：新增 ASCII/中文/内含反引号的静态 Label/Type、predicate、历史 Snapshot 与 reopen 测试；新增普通写与 explicit transaction 的在途嵌套表达式取消，核对无 row/success summary、未发布写入、Head 不变、事务关闭与连接可继续写。修正三个现有取消/关闭测试的十亿元素 `range`（超过当前 200 万上限），改用合法的 1000×1000 流；Kernel 额外检查取消错误，消除任意失败均算成功的假阳性。两个包完整 native `-race` 通过；最终取消/关闭测试在真实取消后限时一秒，`-race -count=10` 再验通过。
- **Mac 完整质量通过**：当前未提交工作树 `pnpm validate` 实际退出 0，包含 Go 静态检查/全仓 race/真实 native coverage（**90.1%**）/govulncheck、TypeScript 类型、224/224 Vitest、26/26 Playwright、文档生成、License、安全与 diff 门禁。本轮 Markdown、CSpell、Prettier、相对链接、生成一致性、依赖 pin 和新增文件检查通过；独立 Review 已核对完整任务 diff、Schema 自动命名公式和真实 catalog，未发现尚未关闭的源码 finding。最终新取消用例亦经 `-race -count=10` 与最终全仓 coverage 验证。
- **安全扫描的实际边界**：生产依赖 audit 无已知漏洞，Go 扫描无漏洞；全依赖按仓库既有 `high` 门槛通过，仍保留用户既有批准的开发依赖 `braces@3.0.3` / `CVE-2026-93687` 单项豁免。已独立复核 [当前 Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)与 npm latest，仍无上游补丁；未扩大白名单。另有 `markdownlint` 开发链的 `katex@0.16.47` [低风险告警](https://github.com/advisories/GHSA-238p-pmpm-9mq7)，不触发现有门槛。本次未改 package/Go 依赖或锁文件，不将既有开发依赖告警称为已修复。
- **OpenClaw 初次失败与恢复记录**：冻结安装实际使用 pnpm 10.34.5，原样 `Dockerfile.unified` 在基础镜像 metadata 阶段退出 1，尚未创建本轮镜像/Volume/容器。助手额外调用构建历史诊断后，dockerd 在 BuildKit `filterHistoryEvents` / `ListenBuildHistory` 路径 panic，systemd 自动重启并停止既有服务；这次诊断中断由本任务承担，不能作为源码通过证据，也不能误称为与本任务无关的外部故障。已停止构建历史查询；按事故前 Container ID/Image ID 启动原有服务恢复运行，没有部署新镜像或覆盖配置/数据库。9 个原容器均恢复 running，8 个定义健康检查的容器全部 healthy（Neo4j 完成暖机后转绿），认证服务未定义健康检查；原有 `pnpm dev:mcp check` 只读验收退出 0。随后默认构建复验因 Debian DNS/npm 下载超时退出 1；有界对照证明直接 DNS/公网连接失败，而主机既有代理可访问实际下载目标。系统 DNS、Docker daemon 和正式 Dockerfile 均未修改。构建/事故/复验日志保存在 OpenClaw 的 `/data/apps/KgosDev/reviews/lithograph-v033-20261019-{run,docker-incident,retry-run}.log`。
- **OpenClaw 最终隔离 Docker 通过**：桥接代理小探针 HTTP 200 后，仅为一次手工构建传入主机已有 proxy build args，原样 `Dockerfile.unified` SHA-256 为 `d03821658abc3a453c62927842e00bc44d202c266f89da5ac1e73342d106b540`，与 Mac 工作树一致。正式 v0.3.3 Linux x64 archive 的 SHA-256 / `VERSION` 验证通过；最终 image 为 `sha256:9bdf57558d578d6cd8af0b9c83c86a9bfc8a564c7f7be08bf0de993822c38d54`，`linux/amd64`、UID/GID `10001:10001`，最终 image Env 中 proxy 变量为零。随后通过正常 Docker client 与现有 `KGOS_UNIFIED_DOCKER_SMOKE_IMAGE` 入口运行原脚本，实际退出 0，原始输出为 `MCP real daemon SDK method matrix: 31/31 succeeded`，并确认非 root、无 Node、单 kgosd、Web/API/MCP 与 restart passed；脚本完整断言同时覆盖五 AI-facing Tool + app-only UI、文档批量/非法参数、OAuth discovery、认证拒绝/Instance 允许、query 读写隔离与重启持久化。构建期代理没有注入本轮运行容器。该结果是当前 dirty 工作树的 OpenClaw 证据，不代替最终新 SHA 的 GitHub CI。
- **收尾 Review 发现并修复 Smoke 清理缺陷**：原脚本在总成功输出后吞掉 stop/Volume/image 清理错误，本轮主体验收成功却遗留了一个新测试卷；已仅删除该卷，原 27 个卷未动。修复为 stop 后保留容器 ID 并有界确认 `--rm` 移除完成，顺序清理自有资源，主流程与清理错误统一保存并在清理后抛出，总成功输出放到全部清理之后；自建镜像仅存在时删除，外部提供镜像继续保留。最终脚本 SHA-256 `b3c46bb355f60909f4f72214411917624ae3e4dcdfe4bee5010ae4ecfa147809` 已在同一已验证镜像上再次完整通过 **31/31 SDK、restart and cleanup、exit 0**，Prettier/ESLint/CSpell、0 duplicates 与 diff 检查通过；独立分支 Review 确认原错误、清理错误、多错误及成功分支。负向实测仅拒绝本进程新建卷的删除：主体仍通过 31/31，原 Node 进程正确退出 1，没有最终成功输出；随后用真实 Docker 精确删除该卷。产品 Go/SDK/Web 与 Dockerfile 自完整 `pnpm validate` 和镜像构建后未再修改，故仅复验受此次脚本修改影响的检查与真实 Smoke。
- **最终资源与服务末检通过**：自有镜像 Tag/Image ID、测试容器、探针与私有故障注入目录均已清理；原有 27 个卷的精确名称集合完全不变。9 个长期容器的完整 Container ID 与 immutable Image ID 保持一致并全部 running，8 个已有健康检查全部 healthy，认证服务没有健康检查，容器 RestartCount 均为 0。原样构建、最终正向、负向和清理证据分别为 OpenClaw 源码目录外 `/data/apps/KgosDev/reviews/lithograph-v033-20261019-proxy-build.log`、`-final-cleanup-smoke.log`、`-cleanup-denial-smoke.log`、`-cleanup-denial-evidence.json`；`-final-acceptance-summary.json` 明确是原脚本断言与原始日志摘要，不是逐项原始 JSON。
- **交付已获授权，CI 待验收**：用户已明确要求提交并推送至 `main`，跟进 CI，必要时继续修复，直到两个 Job 全部通过并关闭本阶段，同时保留原有 Plugin 改动。当前准备提交已验证的升级内容，最终新 SHA 的 GitHub CI 尚未执行，P24-04 保持未完成；长期 Dev 部署、Tag、GHCR 与生产发布均未执行。
