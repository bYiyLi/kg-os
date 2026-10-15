# Phase 20：MCP Tool Prompt & SDK Help

<!-- cspell:words mcpsandbox mcpserver MSYS paccache -->

## 目标与状态

**`in_progress`（2026-10-15）**。针对现有四个 AI-facing MCP Tool 优化准确、可执行的提示词与参数说明，并提供 SDK 方法的按需自描述帮助，消除模型只知道方法名、却无法获取真实入参/出参类型和调用示例的问题。现有 `kgos_workspace` 仍为 app-only UI 入口，不增加业务 MCP Tool。

本 Phase 只涉及 **Tool metadata、MCP server instructions、SDK Help 生成物、TypeScript SDK 本地 Help、Go/WASM Bridge、验证**；不修改 Plugin/Skill 内容、底层 Knowledge / Cypher / Evolution 语义、OAuth、Web、HTTP API、SDK 既有业务方法或持久化结构。提交、推送、Dev 部署、正式发布各自独立授权。

## 设计输入与基线

- [D98](../../design/decisions.md#d98-mcp-sdk-help-prompt-contract)、[MCP Tool/Help](../../design/mcp.md#mcp-tool-help)、[Client SDK](../../design/client.md#kgossdk) 是本阶段合同真源；参数/结果由 `packages/sdk/src/client.ts`、`types.ts` 和领域设计定义。
- [Phase 16](16-kgosd-unified-mcp.md) 现行 Go MCP、31 个受控 SDK 方法、独立 WASM Invocation 与 JS 全局四 namespace 已验收；[Phase 18](18-chatgpt-embedded-web.md) 的 app-only UI metadata 不在本轮改写；[Phase 19](19-observability.md) 日志与诊断需要保持兼容。
- 现有 MCP 的 Go Tool Description 太简略，`kgos_run` 的 “Each write commits independently” 会混淆 ref/session 改动与 Commit；`kgos_read` 共享的 destructive 注解不准确。旧 Skill 的全面改造不在本 Phase。

## Feature 与依赖

| Feature | 范围 | 验收 |
| --- | --- | --- |
| **P20-01 Prompt 合同** | 四 Tool 与 UI Tool 的准确 Title/Description、参数 Schema Description、安全 Hint；短 Server Instructions | A20-01 |
| **P20-02 SDK Help 真源和生成** | 读取公共 TypeScript 类型/签名，维护方法用途与示例；生成 TS/Go 同版本文档数据，构建一致性门禁 | A20-02 |
| **P20-03 Go/WASM + SDK 查询** | TypeScript `help()` / `help(name)`；Go 内嵌只读 Help；两类 JS Tool 的异步全局 `help`，未知方法显式错误，沙箱写权限不变 | A20-03 |
| **P20-04 质量与交付验收** | 定向 TS/Go/MCP 真协议回归、全量 Mac 质量、隔离 Linux amd64 Docker、远程 CI 和 Review；文档及 Help 示例核对 | A20-04 |

## Acceptance

### A20-01 Tool 和 Server Metadata

1. 真实 `tools/list` 仍有四个 AI-facing Tool 和一个 app-only `kgos_workspace`；只读/写入 Hint 真实，Tool Title/Description 对应最小任务及真实限制。Preview/Ancestry JSON Schema 参数描述与实际 100..500/1..1000、缺省、分页/Revision 相符，`code` 引导 `return await help()` 与 `return await help("...")`。
2. Server `initialize.instructions` 只负责必要跨 Tool 规则，不重复 Skill 或创造批准/安全保证；错误或取消不能错误承诺持久写入回滚。

### A20-02 自描述资料与版本一致

1. 31/31 公共 SDK 方法与 Go read/write 许可方法完全对应；所有 Help Detail 含准确 `signature`、`requestType`、`returnType`、可追溯的完整公共类型声明、用途、有效使用示例；复杂 Merge 类型可逐层查到嵌套类型，无自造 Request/Result 模型。
2. 只维护一份 SDK 方法元数据、TypeScript 公开类型真源；生成的 TS/Go Help 数据内容完全一致，修改类型/方法/帮助说明后无须手工复制第二份产物。正式检查对过期生成文件和新增/删除方法不一致返回失败。

### A20-03 SDK 与 MCP 执行边界

1. TS `@kgos/sdk` 无须实例凭证即可同步 `help()` 列目录、`help(name)` 取详情；MCP `kgos_read` 与 `kgos_run` 的异步 `help` 对同方法内容一致。无入参目录稳定排序，未知名/非法类型/额外参数明确失败，不暗中回退列表。
2. `kgos_read` 可查看写入方法帮助但调用写入仍被宿主拒绝；Help 不使用真实 Kernel、不访问网络、文件或凭证、不新增 SDK 业务方法、不触发业务 State，不修改原先 31 方法及流式/取消语义。

### A20-04 验证、Review 与交付

1. 运行生成门禁、SDK 本地单测、Go Sandbox 与真实 MCP 协议定向测试（参数错误、Help parity、输出/权限及最小模型可见文本），并在本次工作树完成 `pnpm validate`、最终静态 Review 与 diff 审核。
2. Mac 上不跑 Docker。OpenClaw 对**本次源码**使用独立隔离 Instance/Volume 测试最终 Linux amd64 镜像、四业务 Tool + UI Tool、31/31 SDK、read-help/write-denied、重启持久化；不在长期 Dev 上写测试数据。最终 Commit 对应的远端 CI 必须真实通过，无 Push/CI 证据不能标为通过。**原定六平台 Native/npm 发行 CI 已由 [D99](../../design/decisions.md#d99-linux-amd64-docker-only-distribution) 取代**，现行关闭门禁是同一源码上的 Ubuntu Validate + Linux amd64 Docker 两 Job，而不是忽略运行失败的旧发行 CI。
3. 通过已冻结的代表性提示词场景核查工具选择与参数说明；静态元数据检查仅证明文本/合同正确，不声称独立 ChatGPT 模型质量提升。Plugin 与 Skill 内容不得改动，Web 并行工作树保持原样。

## Review 特别检查

- Go 绝不能从任意 `help(name)` 将未知字符串拼成内部方法调用；Help 静态返回必须遵循同一输出预算与明确的错误处理，且不泄漏未开放的 SDK 方法。
- `help("evolution.state.create")` 的 Branch/data/author/message 和 `{state}` 必须来自当前 TypeScript 类型；嵌套 Merge 的 TypeScript 声明不能只剩孤立类型名或丢失依赖。
- Helper 无写权限、无 Context side effect、无跨 Invocation 状态；`kgos_read` 的 readMethods 强制边界与现有 `graph.query` 原样 Cypher 语义不变。
- 实际 MCP JSON Schema、SDK 包打包后的 import 和 Go clean build 的嵌入文档必须真实验证。不要因为测试里的伪 Host 成功而宣布真实 ChatGPT 已更新。

## 当前证据与完成条件

- **进入时**：已检查当前 `main` 和相关 TypeScript/Go 类型/工具代码；Phase 14 Web 并行未提交改动保留，用户未授权 Commit、Push、Dev 部署或发布。
- **本轮已写入（2026-10-15）**：修改 `internal/mcpserver/server.go` 等 MCP Tool Title/Description、参数 JSON Schema、真实安全注解和初始化 Instructions；在 `internal/mcpsandbox` 暴露通过 Go Bridge 读取的 `help()` / `help(name)`，保持脚本执行白名单；向 `@kgos/sdk` 导出不需连接的本地 Help。生成器 `scripts/generate-sdk-help.mjs` 从当前 SDK 31 个已公开方法及 TypeScript 公共类型抽取签名与嵌套定义，并对全部 Help 示例进行 TypeScript 类型检查；`pnpm check:help` 和正式构建负责拒绝过期的 TS/Go 帮助目录。Plugin/Skill 与业务 Kernel 无改动。
- **定向验证**：`node scripts/generate-sdk-help.mjs --check` exit 0（31 方法）；SDK Help Vitest 3/3；`go test ./internal/mcpsandbox ./internal/mcpserver` exit 0；`go test -race -count=1 -run TestHelpViaRealMCPProtocol ./internal/mcpserver` exit 0。覆盖 Help 目录、写方法的只读 Help、非法参数、只读沙箱禁写、真实 MCP `tools/list` / JSON Schema / Server Instructions，以及 Go 与 SDK 类型关系。
- **OpenClaw Linux amd64 隔离实测**：从独立临时目录 `/tmp/kgos-phase20-1CCxPe/src` 中的本轮源码，用未修改的 `Dockerfile.unified` 构建镜像 `kgos-phase20-help:20261015-qa1`，实际镜像 ID `sha256:80429007b0d4eed0b75cc40b062bd481e6f5fc0e31625ccfc46165f3b569f1bb`。默认构建最初在 Docker Hub 基础层校验、随后在 npm registry 下载时因网络失败；使用可信基础镜像代理及**仅在构建阶段**的 host-network / 已配置宿主代理后，同一 Dockerfile 完成构建。最终镜像仍为 `linux/amd64`、非 root UID `10001`；对该镜像设置 `KGOS_UNIFIED_DOCKER_SMOKE_IMAGE`，用独立随机 Docker Volume 运行 `pnpm test:docker:unified`，**exit 0**：四业务 Tool + UI Tool、31/31 SDK、Help 读取、读写权限隔离、无 Node、单 `kgosd`、重启持久化均通过。长期 Dev 未部署或进行写入。
- **Mac 全量门禁（2026-10-15）**：包含 SDK Help 示例静态类型检查与本轮 Review 修正的最终工作树 `pnpm validate` **exit 0**；涵盖 Go race / coverage / 静态与安全检查、TypeScript 类型/格式/Lint、Vitest、Playwright **26/26**、原生 Lithograph/Jieba、正式 Web/Go 构建、SDK 打包与 exports、许可证、依赖审计、重复代码与 diff 门禁。实际从编译后的 `packages/sdk/dist/index.js` 导入 `help`，读取 **31 个方法与 StateCreateRequest** 成功。生产依赖审计无已知漏洞；全依赖仍提示 1 项 low 与 1 项按仓库现有规则忽略的 high，不能报为零风险。新增 Phase 记录经 Markdown、CSpell（0 项）和 `git diff --check` 定向复验。
- **模型可见文案静态 Review**：按“发现模型→`kgos_preview`、版本 ancestry→`state_ancestry`、定向只读→`kgos_read`、已授权修改→先 `kgos_read` 查询准确 Help 后用 `kgos_run`、未知方法→`INVALID_ARGUMENT`”核对了实际 Tool Description、参数 Schema、Help 返回及权限约束。此结论是源代码/真实 MCP Client 的合同检查，**不是**目标 ChatGPT 模型自动选工具成功率的实测。Review 修正过的事项包括写入示例不可默认针对 `main`、复杂 Merge 必须读取真实 Session revision、JS Helper 多余参数须拒绝、Go race 定向测试要有足够但有界的 WASM 超时，以及 Help 生成文件受控豁免重复文件扫描；已针对改动复验。
- **原始交付前基线**：实现阶段的本地 Review 只验证源码与隔离 MCP Client，尚未包含提交、推送、长期 Dev 部署或当前 SHA 的 GitHub CI；以下交付记录提供其后续实际结果。
- **交付进展（2026-10-15）**：Phase 20 实现及设计/计划以 `6ca1716c31de484b373429dadc8f5c517c9dcbed` 单独提交，pre-commit `pnpm check:quick` 成功（Vitest 231/231），并已推送 `origin/main`。原先在 `main` 上、属于其它 Web 任务的 `a4001d5` 作为已有历史随正常非强制 Push 同步，没有混入本 Phase 提交。
- **正式 Dev 部署**：从上述 clean revision 执行 `pnpm dev:mcp deploy` exit 0，遵守先备份、构建、切换、验收的项目部署脚本；OpenClaw 运行镜像 `sha256:a8907388716f92c5aae7621567619d2a366cdfa4ce35c9d74e3349bb38dedc2e`，记录 `2026-10-15T09:53:20Z`、`clean`。`pnpm dev:mcp check` exit 0，健康、Instance Bearer、Web/OAuth、四业务 Tool + app-only UI、Preview/State/Ancestry 均通过。用**实际已部署镜像**在独立临时 Docker Volume 完成新版 `31/31` SDK 和重启持久化 Smoke（exit 0），没有向长期 Dev 写测试数据；通过本会话实际连接的 `kgos-dev` 插件只读调用 `help("evolution.state.create")`，返回当前 StateCreateRequest/Result、签名、示例和注意事项。
- **旧 CI 失败事实与新门禁**：Run [38715878540](https://github.com/bYiyLi/kg-os/actions/runs/38715878540) 精确对应上述 SHA，最终为 **failure**；Linux amd64 Docker 是 `success`，Windows x64 Native/npm Smoke 中 `kgosd.exe` 退出代码 `3221226505`，Windows arm64 MSYS2 `paccache` 退出代码 `4`。这两项失败不能记录为成功。用户随后通过 [D99](../../design/decisions.md#d99-linux-amd64-docker-only-distribution) 明确停止全产品 Native/npm 发行并收敛到 Linux amd64 Docker；新目标需在 **Phase 21 提交后的 Ubuntu Validate + Linux amd64 Docker** CI 实际通过，才满足本 Phase 的现行远端完成门禁，而不是宣布旧 Run 全绿。
- **完成门槛**：P20-01–04 与 A20-01–04 均有实际验证，文档/生成数据/代码相符，无剩余本阶段 task-affecting review finding；缺少隔离 Docker 或最终 revision 的 GitHub CI 保持 `in_progress`，不能自动承袭旧 Phase 的门禁成功。
