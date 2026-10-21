# Phase 25：KG OS Doctor v1 · 使用环境诊断

<!-- cspell:words mcpserver -->

## 目标、状态与边界

**状态：`in_progress`（2026-10-21）**。本轮按用户授权创作独立 `kgos-doctor` Skill，落盘已确认的 Global AI Guidance v1 对照正文，并对 D1–D5 的条件读取、证据、未知和只读边界作专项验证。当前是 **Skill 源码交付**，不是私人 Plugin 安装、宿主真实自动触发或整个 Phase 已完成；最终验收和证据见本文件后续记录。通用 `kgos` 保留，Phase 28 不提前实施。

目标：用户在已使用或准备使用 KG OS 的 AI 会话里请求“检查我的 KG OS 使用环境”，AI 通过 `kgos-doctor` **只读**检查当前会话/已暴露连接及每个可访问 Knowledge Base，逐项报告配置就绪情况、真实观察、无法核实的事项与安全的下一步引导。与 [MCP Doctor v1 设计](../../design/mcp.md#kgos-doctor-v1) 对齐，不为执行方便发明新的 Kernel/SQLite/知识质量标准。

**本阶段不负责**：编写知识质量规范或维护规范 Skill、创建或执行持续任务、建立/修复 `branch/vlog`、自动修改或安装客户端全局指令、自动安装插件/授权、读取未授权账号与隐藏上下文、Web 业务实现、底层 Doctor 专用 MCP Tool/API、跨库聚合服务、自动修复或知识库写入。现有 CLI `kg doctor` 是另一个历史安装/Runtime 入口，不在本阶段重命名或迁移。

## 设计输入与真实前置

- [D104](../../design/decisions.md#d104-kgos-doctor-v1-and-vlog) 固定范围与取舍；行为正文由 [MCP Doctor v1](../../design/mcp.md#kgos-doctor-v1) 唯一维护。本计划仅拥有 Feature、Acceptance、状态和实证，不复制模型/权限语义。
- [D107 最终七 Skill 清单](../../design/mcp.md#kgos-seven-skills) 将 Doctor 作为七个官方目标之一；本 Phase 只负责 Doctor 自身，目标七个 Skill 的官方 Plugin 清单收敛与旧通用 `kgos` 退役归 [Phase 28](28-official-skill-roster.md)，不因 Doctor 实现而自动删除现有 Skill。
- [KG OS 使用边界](../../../README.md)、[Ontology](../../design/ontology.md#使用模型)、[Knowledge/Graph](../../design/graph.md#knowledge-数据访问) 与 [Evolution](../../design/evolution.md#branch-与-tag) 决定单库/State/Branch/数据解释；`vlog` 使用普通 Branch，不是内核保留空间。`docs/vlog/` 是仓库开发记录，两者不混用。
- [Phase 23](23-mcp-tool-taxonomy-and-docs.md) 已交付五个 AI-facing Tool、`kgos_docs`/31 个 SDK；[Phase 24](24-lithograph-v033-upgrade.md) 已关闭 v0.3.3 依赖升级。当前 `kgos_query` 只有 15 个只读业务 SDK 方法：`ontology`、`object`、`graph`、`evolution`，**不包含** HTTP `system.diagnostics` / `web.data.info`、宿主全局配置或任务调度 API；不要把这类不可达数据当成已可检查。单个 Instance 只代表一个 Knowledge Base；多个库需客户端实际暴露多个可访问连接。
- [官方 Plugin/Skill](../../design/mcp.md#官方-skill-与私人-plugin) 及当前 `plugins/kgos/` 是现有客户端载体，实际 Skill 自动激活、版本/安装可见性和全局提示词注入取决于宿主，不能从模板或 Server Instructions 推断生效。

**已确认输入与待实际验证的能力**：

1. **引导词**：用户已确认 [Global AI Guidance v1](../../../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance-v1.md) 正文及成对标记。D1 只把它作为对照；实际指令来源、完整加载和行为证据分开验证，不复制第二份正文，不自动安装。
2. **独立规范**：Phase 27 六项源码已存在；Doctor 只消费目标宿主实际可用、版本可辨的有关规则。源码存在不证明安装/发布，缺规则时规范符合性为 `UNKNOWN`。
3. **VLog**：按目标 Branch 的真实模型辨认记录、运行、时间、结果和源 State；不要求统一 `VLogEntry` Schema。不同模型与覆盖不足的判断需分别验收。
4. **宿主能力**：只检查当次实际暴露的指令来源、Skill/版本/轨迹、MCP 连接和外部任务信息；隐藏/不开放的部分未知。没有单一跨宿主配置 API 或自动调度前置。

这些文本合同由 [MCP Doctor owner](../../design/mcp.md#kgos-doctor-v1)拥有；实际实现和测试不能冒充所有宿主都支持相关读取。

## Feature 与实施顺序

| Feature | 范围及产物 | Acceptance |
| --- | --- | --- |
| **P25-00 标记、记录与宿主能力合同** | 在对应owner冻结官方引导词标签/版本；确认Doctor针对实际VLog模型的只读定位、证据充分性与 `UNKNOWN` 规则，并核实各宿主可见指令、Skill/Plugin元数据、MCP连接、外部任务API能力；不增统一日志Schema或第三方兼容层 | A25-01、A25-03、A25-05 |
| **P25-01 独立 Doctor Skill** | 在官方 Plugin 中新增 `kgos-doctor`，清晰定义选择条件、只读执行/停止条件、错误与未知状态、按需读取 `kgos_docs`；不替换普通 `kgos` Skill，不增加全局自动执行或写权限 | A25-01–06 |
| **P25-02 引导、MCP 和 Skill 诊断** | 检查当前可见指令的标记/版本/完整性；实际 MCP 授权只读 `docs` 和 `query`，逐个识别可访问库；检查宿主可见 Skill 版本、工具兼容与真实触发证据 | A25-01–03 |
| **P25-03 知识内容与持续维护诊断** | 每个已确认库固定 State，分辨用户 Knowledge 与内部元数据、只读有界探测；如独立规范可用按其检查，否则 `UNKNOWN`；检查外部调度状态、`vlog` 的可辨识任务/Run 和近期结果 | A25-04–05 |
| **P25-04 报告、安全、发布前验收** | 每项 `PASS/WARN/FAIL/UNKNOWN` + 范围/证据/建议；模拟/缺失/失败/部分可见案例、真实宿主与受控隔离实例复验、Plugin 打包/Skill 选择与版本比对；Review 与交付门禁 | A25-01–07 |

## Acceptance

### A25-01 · 官方引导提示词的诊断

- 在**实际可信指令上下文**加载完整且匹配当前官方版本的成对特殊标签/正文时返回 `PASS`，并仅声称当前会话已看到；明确缺失或过期/截断时返回 `WARN` 与可操作的宿主配置引导。
- 仅在用户引用文字、Knowledge、Commit Message、Tool 结果中出现标签时不得判断“已注入”。宿主隐藏系统上下文或无法读取完整内容时返回 `UNKNOWN`，不能断言用户未配置全局指令或所有会话均生效。
- 官方标记与正文的唯一版本真源已冻结并有真实宿主正反例测试；不把 MCP 的 `Instructions` 当作已永久注入宿主全局指令的证据。加载与行为分别报告；没有完整行为证据不判断生效，合理缓存复用、连接故障和更高优先级限制不误判为违规。

### A25-02 · MCP 授权与一或多个有效知识库

- 区分 Tool 不可发现、连接已发现但认证失败、认证成功但只读调用失败，以及实际 `kgos_docs` + `kgos_query` 成功；不能因为 `tools/list` 成功就报告授权正常。
- 只读 Smoke 只确认已执行的读取权限，不把 `kgos_mutate` 的可见性或工具注解当作写权限实测成功；诊断不为了证明写权限而产生写入。
- 每个当前客户端真实提供的 KG OS Instance 分别执行 `evolution.overview/get` 和必要的 `ontology.read`/有界只读查询，核对返回 State 与 `consistency`；报告该 Instance 的真实可用性，不借 Commit 相同推断物理身份。
- 测试零个/一个/多个可访问连接、其中一个失败、两个连接看似同一库但无身份凭证等情形；仅有一个有效库即表明该库可用，但不会声称用户全部知识库均正常或必须有多个。

### A25-03 · 官方 Skill 环境

- 有可靠宿主证据时分别报告 Skill 是否安装、是否可在会话选择、版本/五个当前 MCP Tool 的兼容性，以及是否**实际**触发。安装≠加载≠自动触发，缺 Skill 应给改进建议但不冒充 MCP 故障。
- 宿主没有 Skills 列表、Release 版本或执行轨迹时相应子项返回 `UNKNOWN`，不把自身 Skill 正在执行当作其它 Skill 已安装的证据；旧 MCP 工具名导致的版本不兼容需能识别。

### A25-04 · Knowledge 内容与规范

- 只针对 A25-02 实际可读的库执行；同一检查阶段绑定一个 resolved State，避免 Branch 移动导致混合快照；查询有界，不默认展开全图或全模型。
- 区分用户可解释的 Ontology 与实际 Knowledge 实例、内置保留结构，以及空库/无可用模型/查询结果不足以证明空库的情形。业务内容存在只能基于可区分的公共数据证据报告。
- 独立规范 Skill 未发布/不可见、规则版本不明时，“内容规范和质量”返回 `UNKNOWN`，**不得**按对象计数、强制 Domain 或主观印象评分；规范存在时先以其实际合同和访问权限进行验收。D4 只检查发现入口、实例可读性和限定范围明显问题；不替代深度 Maintenance。

### A25-05 · 周期任务与系统级 VLog

- 从已授权且可见的**外部调度源**核实任务定义、启用状态、约定周期、最近执行时间及结果；VLog 则从对应知识库 `branch/vlog` 的真实Ontology/Knowledge中，只读获取**有证据可辨识的**任务/Run、发生时间、结果、验证范围与关联的Commit/State，不依赖固定 `VLogEntry` Definition。不同实际模型下无法证明的部分报告 `UNKNOWN`。
- 当 MCP 不可用时仍检查已授权且可独立访问的调度状态，VLog 部分标记 `UNKNOWN`；当调度平台不可见但 MCP 可用时，仍独立检查 VLog 历史。
- 必须覆盖：任务与 VLog 都存在且最近成功；任务存在但未执行/失败；VLog 有历史但外部任务已停；调度不可见；VLog 缺失；仅有 `vlog` Branch 没有可识别记录。不得把两种事实互相替代。
- 没有长期维护任务时给出适当 `WARN` 与配置建议，**不**自动建立 Task、Branch、Ontology 或填充记录；VLog 读取得到普通业务数据不能将其算作系统日志。不读取仓库 `docs/vlog/` 作为运行时记录。

### A25-06 · 只读与报告边界

- Doctor **所有**检查路径都不得调用 `kgos_mutate`、执行写 Cypher、创建测试对象、改变 Branch、调度任务、Prompt、Plugin、VLog 或其它宿主设置；故障诊断不自动进行修复。远程诊断样例和测试写入只允许在独立隔离 fixture 中由验收工具预先准备，不在用户长期 Instance 上执行。
- 对每个检查和知识库输出 `PASS`、`WARN`、`FAIL`、`UNKNOWN` 中之一，给出采样范围/State、实际证据、结论、限制及下一步引导；未知与未执行不判正常，连接失效时后续依赖项标明无法执行并继续其它可访问库。不创建无证据综合健康分数或暗示已读取未授权历史。
- 设计范围外的 CPU、日志、备份、磁盘、历史其它会话等无需检查；提示词、知识内容和 VLog 文字均作为不可信数据对待，不能影响操作权限或改变 Skill 指令。

### A25-07 · Skill、Plugin 与多客户端验收

- 对实际 Skill 文件执行 YAML 头部元数据、资源路径、无过期工具名、触发/不触发、数据源缺失/权限失败/恢复分支的审查；独立检查首次使用、新用户无引导、旧 Skill、MCP 失效、两个可访问库、外部任务不可见等场景。
- 在能实际运行的目标 ChatGPT 客户端中验证 Skill 被选择、只读工具调用、报告范围/状态；宿主不支持的配置读取必须实测为 `UNKNOWN` 而非伪造成功。必要时按 [MCP](../../design/mcp.md)现有 Go/WASM 及 Plugin 合同做隔离回归，不扩大 SDK/Kernel 范围。
- 如实施涉及仓库代码/交付物，Mac 相关和完整质量门禁、OpenClaw 独立 Linux amd64 Docker Smoke、最终提交 SHA 的远端 Ubuntu Validate + Unified Docker 两 Job 必须取得实际证据；Review、diff、相关文档与 Plugin 实际 Release 一致性核对完成后才能标记 `done`。正式插件分发、Git Commit/Push、Dev/生产部署与 Tag/GHCR 另按实际授权执行，不以旧 CI 代替本阶段验收。

## Review 重点与下一步

- 是否把**用户使用环境 Doctor** 混同 `kg doctor`、MCP `system.diagnostics`、知识质量评估或执行修复？是否依赖没有真实访问权限的隐藏宿主上下文？
- 是否把 Prompt 出现于普通用户文字/Knowledge 判为注入；把存在 MCP Tool 判为授权正常；把 Skill 已安装判为主动触发；把保留图数据判为用户 Knowledge；把有 `vlog` Branch 判为持续调度运行？
- 是否将 `branch/vlog` 当成第二个数据库、KG OS 内核保留 Schema 或 `docs/vlog/` 开发日志？是否让 Doctor 创建 Task/Branch/运行记录，或把默认 `main` 的 Head 错当 `vlog`？
- 是否把 Skill 的推荐 `VLogEntry` 当成强制 Schema，或重复定义内容质量规范、提示词正文与跨客户端通用配置方式？若当前实际模型/证据不足，不在本阶段用例中臆造 PASS。

**当前实施边界**：本轮仅创作及验证 Doctor Skill 与必要对照资产，不安装或更新私人 Plugin、不提交/推送/部署；单项证据不关闭 A25-07 的真实宿主和交付门禁。阶段保持 `in_progress`。

<a id="doctor-skill-v1-evidence"></a>

## Doctor Skill v1.0.0 源码创作与验证（2026-10-21）

### 交付与职责

[kgos-doctor](../../../plugins/kgos/skills/kgos-doctor/SKILL.md) 为独立只读诊断 **workflow**，拥有诊断结果而非规范转发、修复或维护执行。运行时包共五个 Markdown 文件：入口、宿主证据（D1/D3）、知识就绪性（D2/D4）、维护证据（D5）和独立 [Global AI Guidance v1](../../../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance-v1.md) 对照资产。用户已确认的起止标签及区块正文逐字保留；文件标题仅用于文档呈现，不属于宿主配置正文，不因读取资产而判断已注入。完整/定向诊断、依赖失败、不可见信息、四种结果及结束边界均在包内可达。

D4 不接管深度知识治理，D5 不要求统一 VLog Model、Scheduler 或固定过期天数；没有新增业务代码、Kernel 模型、API、宿主设置或后台任务。六个既有规范与过渡通用 `kgos` 未修改。最终七个目标已有源码，不等于 Phase 28 的实际迁移已完成。

### 独立评审与合成行为

实际读取本机 `prompt-authoring-spec`、`skill-authoring-spec` 及其相关参考，核对当前 MCP/Graph/Ontology/Evolution 与兄弟 Skill 入口。独立只读模型评审完整五文件及相应合同，未发现有依据的必改问题；只检查兄弟入口及设计中的职责，不冒称审核了所有兄弟深层资源。

[场景与预设判据](../../../tests/skills/doctor-evaluation.json) 最初冻结 40 个请求，执行者只获得实际八个源码 Skill 的名称/description、原始请求和按需可读资源，不获得判断标准。14 个相邻选择场景对比原始与删去末句排除说明的 description，两者均符合预设，采用较短版本；只报告这组观察，不声称措辞具有普遍因果优势。首轮多连接情境只给出 A 读取成功、没有给一致性字段，模型正确保留完整 D2 为 `UNKNOWN`；随后补全阳性输入后复测，未把原回答改判错误或弱化 `PASS` 条件。

精简后完整重跑 40 题，**31 个 Doctor 场景与 9 个相邻场景的选择 40/40 符合预设**；逐题核对 Doctor 回答，未见必须修正的判断偏差。相邻任务只验证不误触发，不将其领域答案算成本 Skill 的质量保证。最终自检明确“对照文件标题不属于配置正文”，新增区块外标题场景，并对 **9 个 D1 相关场景复测，9/9 符合判据**。总计保留 41 个不同原始请求；这不是最终 41 题又一次整批运行。评测后只做 Markdown 表格对齐，逐段比对指令、JavaScript 与批准区块未变。

实际执行环境为 Yi Mac、Codex CLI `0.158.0` 默认执行模型；本次运行结果未给出可独立核实的模型标识，不能据历史记录替填型号。运行在只读临时快照中，没有业务 MCP。合成的可信宿主/工具结果仅用于情境判断，**不证明 ChatGPT 实际注入、自动触发或任意模型下的行为保证**。原始场景、输出、事件及快照哈希保存在本轮本地临时证据目录，不作为 Skill 运行时资源打包。

### 实际 MCP 与引擎验证

[资源合同测试](../../../internal/mcpserver/doctor_skill_contract_test.go) 用真实 YAML 解析元数据、检查五份包内资源全部可达、MCP 文档路径存在，以及唯一公开探测代码可提取。批准提示词的成对标记及区块 SHA-256 固定校验通过，防止比较正文意外漂移；不把资源测试当作模型行为验证。

[真实读取测试](../../../internal/mcpserver/doctor_skill_integration_test.go) 从交付参考中原样提取 JavaScript，经实际 HTTP MCP、QuickJS、Kernel 与 Lithograph 执行。只在 `t.TempDir()` 准备隔离 fixture，诊断路径仅调用文档和只读工具；三组带 `-race` 均通过：

| 场景 | 实际验证 |
| --- | --- |
| 有效空模型 | 真实 State、valid/空 issues、Ontology 可读，不能把空模型当连接失败 |
| 两个模型、入口只读一项 | 返回同一 State，导航 total=2 且 hasMore=true，不把入口探测当完整读取或知识计数 |
| 无效 Binding State | 返回 invalid 及实际 issue，不继续冒称 Ontology 读取成功；无关 Branch 不变 |

每组核对所有 Branch Head 在探测前后不变，结果不输出无关的可变 State Data。另以 `-race` 复跑已有真实 MCP 认证/工具边界与 Preview 缓存/权限隔离/资源限制回归，全部通过；这不是 Doctor 对用户库执行写入探针。已有回归的写入仅属于隔离测试准备及数据库能力测试。

使用仓库现有 v0.3.3 路径的主扩展、Provider 与 Jieba，复制到专用临时目录并核对 SHA-256，避免并行构建影响。一次扩展回归命令误拼 Provider 路径、另一次 shell 未找到 Go，均据实失败；改为已验证绝对路径后，上述整组重新运行成功，不以失败或 skip 充当通过。

可复验入口（Native 需按当前开发指南提供实际三个扩展路径并启用 CGO）：

```sh
go test -tags=sqlite_fts5 -count=1 -run '^TestDoctor' ./internal/mcpserver
go test -race -tags=sqlite_fts5,lithograph_smoke -count=1 \
  -run '^(TestDoctor|TestRealKernelMCPToolsAndAuthentication|TestPhase16PreviewPinnedBranchesCacheEvictionAndBudgets)' \
  -v ./internal/mcpserver
```

另通过 `go vet -tags=sqlite_fts5,lithograph_smoke ./internal/mcpserver`、该包普通 sqlite 标签完整 `-race` 单元回归、MCP 31方法/75类型/133页文档一致性检查。Markdown/拼写、批准区块、资源引用及最终任务 diff 分别核对；仓库 Prettier 忽略 Markdown，因此新 Skill 文件额外直接通过 Prettier API 验证，而不把被忽略的文件当作已检查。

### 交付限制

本轮未执行私人 Plugin 安装/更新、ChatGPT 原生触发与真实指令来源验收、真实外部调度验收、任意实际 VLog 模型自动识别保证、完整仓库 `pnpm validate`、OpenClaw Docker、最终 SHA 远端 CI、Commit、Push 或 Deploy。以上仍按 A25-07 和 Phase 27/28 独立验收；**Skill 内容创作与本地单项验证已完成，Phase 25 保持 `in_progress`**。
