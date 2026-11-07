# Phase 33：Domain 范围检索与 AI SDK 接入

## 2026-11-06 人工验收结项

**状态：`done`（用户明确表示手动验收通过，带保留项结项）。** 这是用户批准的阶段管理结项；以下原始 `in_progress`、失败、未执行记录反映当时实际情况，不代表所有原定验收已自动通过。本次只更新计划，未修改代码。

- **已交付**：Domain 查询在 Web/SDK/MCP 已交付且生产实际查询成功。
- **未实现或未完整交付**：未确认核心 Scope 查询缺代码，但不能断言所有历史图谱交互波动已修复。
- **未取得独立验收证据**：v0.3.11 记录的两项间歇性 Playwright 失败尚缺对应的根因/完整销案材料。

保留项不会因为 `done` 自动消失；后续工作另行定义范围与验收。

**历史实施状态（2026-10-30）：in_progress**（实施与验证中；远端公开 CI、正式发布及生产部署不属于本次授权）

## 目标与边界

在当前 KG OS 统一 Graph 公共合同内交付按 Domain 及 Graph View 范围读取 Knowledge，打通 Web/HTTP SDK/MCP JavaScript SDK 与 Lithograph v0.3.4。Domain 只组织 Definition，不能当成权限、实例归属或业务分区；不修改 Lithograph 仓库，不建立新的 Search API 或 MCP Tool，不修改 Graph 写入能力。历史 Phase 14 的其它未完成业务与并行图布局工作维持原状。

## 设计输入

- [Graph 只读 Scope](../../design/graph.md#read-only-graph-view-与-domain-范围lithograph-v034)：参数互斥、State pin、子 Domain 闭包、空 Domain、底层 Graph View 与错误边界。
- [Web 搜索](../../design/web.md#domain-选择与-graph-view-的-ui-范围)：领域导航、四路检索、连边与邻居扩展。
- [MCP](../../design/mcp.md#mcp-tool-help)、[Client](../../design/client.md#kgossdk)：公共 API / SDK 类型、内嵌文档及无 Skill 使用能力。
- Lithograph 已发布 v0.3.4 的 Graph View requireAnyLabels、历史/Full-text/Vector/Managed Semantic Top-K 语义；原 v0.3.3 升级历史保留于 [Phase 24](24-lithograph-v033-upgrade.md)。

## 工作与验收

1. **依赖与适配**：锁定并验证 v0.3.4 main extension 与 Provider；raw Graph View 通过只读 Host scalar/stream 透传，同 State 可检索，缺字段保持 v0.3.3 兼容默认语义。
2. **Kernel / SDK / MCP**：仅 Graph query/streamQuery 增加可选 domain / graphView；验证无范围、互斥、Ref 类型、未知 Domain、空 Domain、循环/共享、多父子层级、历史 State，服务端及 SDK/MCP 合同一致；原 31 SDK 方法、Go/WASM 权限隔离和 stream terminal contract 不变。
3. **Web**：左侧 Domain 自动限定最近/关键词/全文/托管语义和连边/邻居；查询切换按 Domain/State/连接取消旧请求；Branch 恢复全局；索引元数据单独不带 Graph View；不把 Top-K 后过滤当作范围查询。
4. **文档**：唯一 SDK types/client TSDoc 生成 MCP SDK 方法和类型文档；KG OS 自有 Cypher 25 手册、指南与真实 v0.3.4 同步，保留历史 Phase 24 与本次状态的区别。
5. **质量**：Go 单元/集成 + MCP JS/流 + Web Vitest + 相关真实原生 DB/客户端路径、错误与取消回归；本地工程门禁与 Review/diff，若远端/真实 Docker 未执行，不标记整体 done。

## 当前执行与证据

2026-10-30，本地开发与定向验收证据：

- **依赖**：`scripts/lithograph-artifacts.mjs` 锁定正式 Lithograph v0.3.4 六平台 SHA-256；本机 `prepare-lithograph` 下载并校验 macOS arm64 主扩展与 Provider；`Dockerfile.unified` 和 Host `expectedExtension` 已同步版本。没有进行正式 Docker 构建或远端 CI。
- **Kernel**：`internal/kernel/graph_scope.go` 在精确 immutable State 中递归解析 Domain，合并子 Domain 的 Node Definition，生成 Lithograph `requireAnyLabels` Graph View；空领域强制空图，排除 KG OS 内部 Label。真实数据库 `TestDomainScopedGraphQueryAndStreamV034` 验证父子领域、未分类 Label、空领域、历史、raw OR 范围、只读流式、参数互斥和未知领域；`TestGraphQueryDomainInputFailClosed` 验证 null/类型错误/非领域 Ref 不得回退全图。
- **AI / SDK**：`GraphQueryRequest.domain?` / `graphView?` 已提供于 TypeScript SDK、Go HTTP Kernel 与既有 MCP QuickJS/Go Sandbox，`graph.execute` 未改。隔离真实 `TestPhase16MCPAll31SDKMethods` 通过，包含 Domain 查询、流式查询和错误返回。`pnpm generate:docs` / `pnpm check:docs` 验证 31 方法、76 类型、134 页面，包括新类型与 v0.3.4 Cypher 手册。
- **Web**：选中 Domain 后统一限定最近/关键词/全文/语义及连接种子、一跳扩展，索引目录查询保持全局；切换领域新建 Canvas Session、中止旧请求，Branch 恢复无 Scope。相关测试覆盖作用域透传、连接与扩展、旧请求隔离。`pnpm test:coverage` 全部 81 个 Vitest 文件通过，分支覆盖率 **90.05%**（第一次为 89.97%，补充有意义的连边及邻居领域测试后达到阈值）。
- **真实浏览器**：`tests/e2e/graph-domain-scope-runtime.spec.ts` 用隔离 KG OS Runtime + 本地真实 v0.3.4 数据库与 Provider 验证父领域、空领域、四路范围搜索和切回 Branch；整体 Playwright **81/81 passed**（约 1.1 min），包括原有图谱交互、历史及认证回归。
- **质量门禁**：依赖一致性、TypeScript 类型检查、ESLint、Prettier、Markdown 105 文件 0 问题、拼写 439 文件 0 问题、`check:go`、Go 全包竞态、Go 原生语句覆盖率 **90.3%**（独立复验 `pnpm test:go:coverage` exit 0）、Go 安全扫描、TypeScript 严格类型覆盖率 **99.77%**、重复代码 **0**、未使用代码、许可证、npm high-level 漏洞门禁及 diff 检查均分别通过；npm 审计报告 3 low + 6 moderate，不触发既有 high 门禁。整体 `pnpm validate` 在补齐 Vitest 覆盖率之前曾失败，不能以各门禁的局部成功冒充单次完整 validate 通过。
- **工作区与交付**：仓库仍保留另一并行任务已有的图布局未提交变更（未清理或覆盖）；本次只改 KG OS 仓库与本地开发文档，未修改 Lithograph 源码；**未提交、未推送、未发布、未部署、未执行公开 CI 或正式 Docker 端到端验证**。Phase 33 仍维持 `in_progress`，最终状态以尚未完成的门禁、Review 和后续授权的远端结果为准。

2026-10-31，**v0.3.11 发布前本地复验**：已同步 Go buildinfo、`@kgos/sdk` / CLI / Web 工作区版本、Plugin Manifest、唯一 AI 安装指南和双语安装模板；公开分发生成器从正式源模板成功预渲染，四份官方 Skill 在发布导出时自动标注 `0.3.11`，旧版本快照未改。`pnpm validate` 的 Go 常规测试、全包 `-race` 与原生 Go 语句覆盖率 **90.3%** 已通过；首次 TypeScript 阶段发现 CLI/SDK 两个历史 `0.3.10` 断言，已更新到 `0.3.11`。随后分别复验 `pnpm test:coverage` **81 文件全通过、分支覆盖率 90.05%**，TypeScript 类型检查、全仓 lint、严格类型覆盖率 **99.77%**、重复代码 0、未使用代码、许可证、npm 审计 high 门槛、diff 检查及完整 Playwright **81/81** 均通过。Rust 许可证检查一次因临时命令 PATH 未找到已安装 Cargo 失败，恢复工具链 PATH 后完整通过；**尚未将修正后的所有门禁重新作为单条 `pnpm validate` 执行**，正式 Ubuntu CI 必须独立按同一源码 SHA 执行完整门禁。此处只记录本地证据，不冒充已提交、远端 CI 或正式 Release。

## 发行与后续质量记录（2026-10-31）

- KG OS **v0.3.11** 已使用源码 Commit `d08121978f8e4ceeb315cac88848e4f55e7228bc` 创建并推送私有、公开同名 Tag；[公开 main CI](https://github.com/bYiyLi/kg-releases/actions/runs/41091970913) 2/2 通过。
- [正式 Release](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.11) 已发布：Linux amd64 镜像 `ghcr.io/byiyli/kgos:v0.3.11@sha256:9013d25df8f6dea770020addbe5c519e08dc0add219ffa238aa8c32e865e7123`，匿名 GHCR HEAD 200 和 digest 比对通过；三份安装指南 SHA256、Plugin ZIP 内四个官方 Skill、唯一 INSTALL.md 与同版指南逐字节一致。
- [Tag 级 Release CI](https://github.com/bYiyLi/kg-releases/actions/runs/41094352097/attempts/2) 第一次尝试中完整源码校验失败，Docker 成功；第二次原 SHA 的重跑三个 Job（源代码、Docker、镜像发布）全部成功。首次失败的具体子阶段在公开工作流中已脱敏，不能虚构根因。
- 此后在同一源码的本地完整 `pnpm validate` 重验中观察到 **2 个间歇性 Playwright 失败**：真实节点点击后详情面板未出现，以及 G6 画布 15 秒内未上报 `data-ready=true`；此前同一组浏览器测试 81/81 通过。Trace 未见 G6 初始化异常，但不足以排除真实 UI 时序问题。应作为下一轮图谱交互可靠性修复，不以一次成功重跑证明该问题已消失。
- 官方 KGHub 中英文固定手册、AI 指南与最新版目录在本次发行后按正式 Release 下载资源归档，历史版本保留；官网完成情况以实际构建、Git 同步和 Pages 发布结果为准。
- 本 Phase 保持 `in_progress`：v0.3.11 的正式发行不自动证明真实 ChatGPT 账户已经安装新 Plugin，也不是生产实例部署或服务升级。
