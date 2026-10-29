# Phase 32：知识使用就绪性与场景回归

<!-- cspell:words mcpserver EPERM -->

## 目标与当前状态

**状态：`in_progress`（2026-10-26）**。已在 `main` 的本地工作树开展模型增量扩展修复、引导/Skill/MCP 文档同步与 Web 登录主题修复，部分真实引擎与浏览器回归通过。A32-02/03/04 的受控跨连接真实客户端使用验收、A32-07 的恢复矩阵以及阶段级 CI/Dev 验收尚不完整；禁止把单项源码通过等同全阶段 `done`。

本阶段不重做单实例单物理库架构，不新增知识库注册表、万能 Agent、路由 Skill、封闭属性模式或分支权限。服务发布、生产部署、私人插件更新及 Work/Codex 使用分别服从实际授权。不得改动默认库和已有业务数据来验证试验。

## Design Inputs 与依赖

- [D111](../../design/decisions.md#d111-task-scoped-knowledge-loading) 与 [MCP 初始化加载](../../design/mcp.md#task-scoped-knowledge-loading)：允许范围先于知识读取，复用预览；知识名称与说明质量以 MCP owner 的组件边界为准。
- [D113](../../design/decisions.md#d113-mandatory-knowledge-behavior)、[D119](../../design/decisions.md#d119-recommend-first-authorized-mutation) 与 [全局引导/日常职责](../../design/mcp.md#global-ai-guidance-and-daily-responsibility)：每条消息必须实际读取并检索 KG OS、检查知识变化；未获具体变更授权时先推荐，获准后执行并验证。唯一当前正文随 KG OS Tag 版本化；旧的 D111/D112 读取豁免与 D113 自动写入规则属于历史。
- [Ontology 增量扩展](../../design/ontology.md#增量扩展保持既有定义)：未修改定义保持一致；Issue 1 是故障证据，不是已确认根因。
- [Graph 检索与属性边界](../../design/graph.md#检索组合与属性边界)、[Evolution 合并](../../design/evolution.md#evolution-公共调用合同)：保留已有接口、事务和安全映射。
- [Phase 25](25-kgos-doctor.md)、[Phase 27](27-knowledge-standards-skills.md)、[Phase 28](28-official-skill-roster.md) 继续拥有原诊断、技能和私人安装验收。本阶段只负责新增改进，不重置其状态或冒用旧证据关闭它们。
- 实施前核实源码、依赖和 Dev 镜像 revision，保留本地用户改动。真实模型行为验收需要获准的宿主/模型/连接；不可用时对应验收为 blocked，不用文本推演替代。
- [Web 显示偏好与主题](../../design/web.md#显示偏好与主题)：登录弹窗沿用现有系统/浅色/深色解析和 Portal 主题合同，不新建主题机制或改变认证规则。2026-10-26 用户反馈配置为“跟随系统”但登录弹窗仍为暗色；实际系统配色、服务版本与触发路径待复现确认。

## Feature 与交付顺序

| Feature | 工作与交付 | 验收 |
| --- | --- | --- |
| P32-00 固定复现基线 | 保存Issue 1请求、失败和对照；取得计划值与实际值差异；核对实际源码及底层版本 | A32-01 |
| P32-01 修复模型扩展 | 根据已确认差异修改所属编译/投影代码；保持旧定义、事务及约束 | A32-01、A32-07 |
| P32-02 全局引导与日常职责 | 维护唯一六条强制行为 Global AI Guidance 正文、发行 Tag 对照及安装模板；同步 Skill 中每轮检索、先推荐后授权及失败反馈规则，保留连接/环境边界 | A32-02、A32-03 |
| P32-03 知识记录质量与诊断 | 按下表维护 Ontology 的知识世界选择、提交指南及 Knowledge/VLog 写入指引；补真实持久结果回归及 Doctor 证据判定，保持四 Skill 的职责边界 | A32-03、A32-04 |
| P32-04 使用边界 | 复现搜索组合，补合法示例；测量脚本/Provider耗时；澄清属性及合并限制 | A32-05、A32-06 |
| P32-06 登录弹窗主题 | 复现用户反馈，检查认证前主题初始化、文档根/Portal 继承和弹窗样式；修复已确认偏差，补主题回归 | A32-09 |
| P32-05 集成与Review | 源码、生成文档、技能资源一致性；真实场景回归；审查并关闭范围内发现 | A32-07、A32-08、A32-09 |

P32-06 可独立于模型修复推进，完成后纳入 P32-05 集成审核；编号保持既有身份，不按编号强制串行。

P32-02/03 的文档与场景准备不依赖 P32-01 修复完成；涉及运行数据的验收使用有效隔离基线。发现底层缺陷时先在对应所有者修复并核验精确依赖版本，不通过KG OS改写Cypher或弱化校验规避。

### P32-03 实施文件与责任

| 交付 | 修改位置 | 验证 |
| --- | --- | --- |
| 分支命名要求及正反例 | `kgos-ontology-standards/SKILL.md` 与 `docs/guide/mcp-guides/evolution.md` | 名称合法性、用途可读性、用户指定名称与重名场景 |
| 提交规范唯一正文 | `docs/guide/mcp-guides/evolution.md` | 简介/改动内容判据、支持 message 与新 Commit 条件、回读/并发边界；为仅 MCP 客户端提供最小命名规则 |
| 独立写入场景接入 | `kgos-ontology-standards/SKILL.md`、`kgos-knowledge-standards/SKILL.md`、`kgos-vlog-standards/SKILL.md` 及各自通过 `kgos_docs` 读取的操作指南 | 普通 Knowledge 编辑可直接取得正确规范，不需已退役的分支 Skill；引用可达，不重复完整规则 |
| MCP 入口和生成资源 | `internal/mcpserver/server.go`、`packages/sdk/src/client.ts` / `types.ts` 的对应文档；运行现有 `scripts/generate-mcp-docs.mjs` | 服务端 Tool 元数据、生成 SDK/Guide 与来源一致；不新增不支持的参数 |
| 产品呈现与失败路径 | 现有 MCP Preview / Web 定向回归；仅在发现实际缺陷时修复所属实现 | 回读与预览/页面一致，受限读取、并发、未知回执不越界 |
| 旧记录处置边界 | 在本 Phase 验收证据中记录问题清单及处理建议 | 原引用和历史保留；未获具体授权不得执行整理 |

先完成规范来源和 Skill/MCP 引导，再生成资源、进行定向测试及真实场景验收，最后由 P32-05 汇总审核。保持 API 的 message 可选合同；不得以缩小 Kernel 能力替代 AI 使用质量修复。新 Skill/MCP 文档需按实际变更更新版本和分发记录，源仓库、生成包、实际服务和私人账户安装分别核验；发布/安装操作仍需相应授权。

## Acceptance

### A32-01 模型增量扩展

以[问题单1](https://github.com/bYiyLi/kg-os/issues/1)的无实例 Person→Note 两步请求作为必要复现，记录修改前失败与修改后结果。覆盖无约束、unique、单字段 KEY 和联合 KEY。单字段约束分别测试 Definition 顶层与属性内的合法写法；联合 KEY 只测试 Definition 顶层声明，另以属性内重复 properties 作为非法输入对照。各合法组合覆盖显式/匿名名字、空实例/合法已有实例。新增节点/关系定义后，原公共定义、有效约束、资源名称和业务数据不发生无关变化。

覆盖no-op、旧baseState、非法约束和运行失败，确认不会留下部分持久结果。证据包含精确版本、请求、前后State、实际字段差异和结果，不能只断言不再报错。不得删除KEY或跳过原定义比较来通过。

### A32-02 环境和多库加载

冻结同名逻辑库、测试/正式两个连接、仅测试连接、无可信默认、连接失效和明确跨环境对照等输入。正式任务不得调用未获准测试连接的预览/正文；目标明确不重复问，目标不明先确认；失败不自动换库。

经验/资料用途与环境独立判断，支持同一任务按需读取多个相关世界。保留各自连接、State及业务来源；同名或相同Commit不作为同实例证明。任务切换后测试内容不得作为正式结论依据；不宣称提示词或Branch提供权限级隔离。

同一已允许连接内混放正式与测试 Branch 时，若当前范围禁止读取测试简介或模型，不能调用全分支预览。已知正式目标时用定向 State/模型读取继续；目标未知且无安全发现入口时先确认，不读全视图后再过滤。分别验收允许整库预览、只允许已知 Branch、未知受限目标三个相邻场景。

真实客户端须观察实际调用轨迹，不能仅检查回答里是否写了“正式”。没有第二个获准连接时，单连接结果不计多实例验收通过。

### A32-03 引导升级和证据

新规则标记、唯一正文、Doctor比较和安装说明一致；旧版本差异清楚，不擅自覆盖用户定制。分别记录保存、宿主可见加载与实际调用行为。仅在文件中发现标签、读取对照资产、不可见宿主指令等场景，不得判定已经加载。

包内资源引用可解析，当前四 Skill 清单保持；源模板与私人安装分别核验，未授权安装就保留该项未执行。

最终正文六条强制行为须与每轮真实检索、先推荐后授权、实际证据和权限边界核对；不以“等义精简”重新加入可跳过读取的条件。canonical INSTALL 的无版本标记完整区块与唯一资产一致，发布渲染后仍一致；历史已发行快照不改写。

对照全局职责与各 Skill 选择边界：每条消息（含问候、闲聊、简单问题）必须实际读取并检索 KG OS，而非仅查 State/模型或复用上轮；每轮检查变更需求，有证据且未获授权时先给出具体建议，无实际变化则不写入也不制造建议。明确要求保存某项 Knowledge 可在该授权内直接实施，单纯提出初始化想法不得修改 Ontology 或 Branch；已批准方案的常规实施不额外逐项请示。当前不查库、不保存或只读禁令及宿主权限继续生效；已知单对象纠错不扩大为全库维护；疑似问题先核实、最小建议或获准处置；系统记录区分源活动与保存结果。覆盖连接失败、权限限制、指导缺失和未知回执的恢复与如实报告。

文本审查与合成情境推演分别记录，新增原始用例及判据只作后续独立行为验收输入；至少覆盖未授权建议、明确写入请求、模型变更待确认、VLog 记录与源任务授权区分、超范围变更以及未知回执。没有实际模型运行就标记未执行，不把用例存在或哈希通过说成自然任务选用/写入已验证。

状态情境覆盖：任务确需记录而当前无模型、空世界但当前无使用需求、已有知识和模型充分、可靠事实变化、未决冲突与合理差异、必要模型工作超出授权。分别核对有据缺口、最小必要行动或合理不改、专业规则、结果核实，以及无法自行解决时的具体阻塞请求和独立继续；不以工具、模型或记录的固定数量判成功。Doctor 同时覆盖不同 KG OS Release Tag 的同包引导基线；当前源码只含最终正文，情境假设不充当发行事实。

### A32-04 分支命名与提交说明质量（核心验收）

本项以[知识名称与提交说明的产品质量](../../design/mcp.md#知识名称与提交说明的产品质量)为判定合同，不验收私人聊天习惯。以下条件必须全部有证据；仅修改 Skill 文案或通过底层 consistency 检查不算通过。

1. **名称**：覆盖普通资料整理、教师备课、开发经验及测试空间。新名称能表达实际用途，必要区分信息不掩盖主体；用户明确指定的合法名称保留，同名先核对复用。测试中文与另一用户语言、合法字符限制、已有引用及同用途对照空间，不把“不用英文”当质量规则。
2. **内容**：说明包含约定标题、完整已知范围与用途、实际改动；合成资料有明确标识。不只检查标题；空泛简介、仅写增量、只写技术缩写、把未验证效果写成成功均为失败。规范说明必须与实际模型/数据和 Diff 相符。
3. **入口覆盖**：逐项执行普通知识新增/纠错、Ontology 修改、Graph execute/streamExecute 的真实 message 传递、新建 Branch、获准独立阶段的 evolution.state.create（包括无图差异但实际新建 Commit）、实际新建 Merge Commit、fast-forward、up-to-date、无变化 Patch、方法不支持 message 等路径。分别记录是否支持 message、是否产生新 Commit、是否应用规范及实际结果；无新 Commit 路径不强求新说明。state.create 必须验证指南可发现、message 实际传递、返回 State 与回读说明一致，并复用第5项展示检查；它只用于用户实际需要的独立阶段，不作为补简介的额外提交。
4. **可发现性**：固定相同原始任务分别验证 Skill 可用和仅 MCP 文档可用的受支持客户端情形。普通知识编辑不预加载分支 Skill；确认相关写入 Skill 或 MCP 方法入口能引导到规范；仅 MCP 客户端通过 branch.create 指引和服务端 evolution 指南也能获得命名规则，不依赖仓库文件或未安装 Skill。使用真实调用轨迹，不能把作者手工准备好的合规 message 喂给模型后当自主执行通过。
5. **持久化与展示**：检查调用参数、返回 State、回读 Message、允许范围内预览首行和完整说明；Web 现有目录/版本记录展示与数据一致。模拟并发 Head 前进、写入回执未知和全预览受限，不能误认别人的结果、盲重试或越权全库读取。
6. **反例及相邻有效例**：保留2026-10-26当前 Head 审计中技术化名称、单句说明、缺 Message 和有标题但用途不足的样本作为回归输入；另测用户指定合法技术名称、正常历史无 Message、共享 Commit 及快进，不为消除提示改写旧历史或强制空提交。

先冻结用例、模型/宿主、次数与判定标准，再执行获得授权的真实隔离写入。记录每项输入、源码/服务/Skill版本、实际输出与失败，区分文字、自动化、模型行为和 Web 证据；不能用一个成功例证明普遍改善。必要客户端或权限不可用则 blocked，不减少覆盖宣布完成。

旧测试记录单独交付问题清单与处理方案，说明引用影响、不可原地修改的历史及需要的操作授权；方案完成不等于旧数据已整理。本阶段默认不修改这些旧记录。

### A32-05 检索组合和时限

同一State下对比命中节点直接关联、合法重绑定、结构化后关联等写法，保留真实查询与错误。区分错误调用、底层限制和实现缺陷；成功示例必须实际运行，不能仅凭源码存在通过。

比较冷/热、单条/组合查询及代表性数据量，分别保留脚本总预算、请求时限、Provider耗时的可观察证据。超时不是零结果，不返回缺候选的假成功；失败/取消后涉及写入要先读实际状态。保留既定安全预算和外部HTTP取消边界。

### A32-06 属性和合并

分别测试未知对象顶层字段、额外业务属性、已声明属性错误类型、缺必填和唯一冲突，不把不同层的约束混成白名单。

合并覆盖ours/theirs、合法第三值、删除冲突属性、改非冲突字段、其它属性也不同而无法安全映射、过期revision。合法第三值成功；不安全变更被拒且说明公共范围，不泄露内部标识；不得为方便整对象覆写而放宽保护。

### A32-07 故障恢复与历史

覆盖单Patch原子性、多SDK调用部分完成、未知回执、旧Head及并发Session。核实当前值与历史值分别正确；逻辑删除不称物理擦除，重建内容不称恢复原身份。

长期记忆补充来源、纠错、撤回、同名和业务时间场景。数小时回读、跨会话召回、重启和备份恢复分别记证，前者不替代后者；生产使用所需而未获准执行的验证保持明确缺口。

### A32-08 文档与最终审核

设计各主题保持唯一正文，方案不成为第二真源。MCP用法从实际生成来源修改并同步内嵌文档，技能资源与安装清单一致，不写私人应用ID或凭证到公开模板。

按[开发指南](../../guide/development.md)和[AGENTS](../../../AGENTS.md)执行改动相关检查及阶段要求的质量门禁；Go/Kernel变更须有真实依赖集成、Linux隔离Docker与相应最终SHA CI证据。仅文档交付时，检查文本/链接/例子/差异，不虚报代码测试通过。

### A32-09 登录弹窗跟随主题配置

先记录实际源码/服务版本、浏览器、主题选项、系统配色及触发步骤，保留修复前截图与结果。配置为“跟随系统”且系统为深色时显示深色是正确行为；必须以实际解析主题与弹窗不一致来确认故障，不预先断定根因。

沿用 Web 显示偏好与主题合同，检查认证前首屏初始化、共享主题状态、文档根和 Dialog Portal 的颜色继承，以及是否存在硬编码暗色样式。仅修复实际偏差，不新增后端主题设置或弹窗独立主题来源。

所有模式下，登录弹窗必须与页面当前生效主题一致，不能只核对设置选项或弹窗单独颜色。

浏览器回归至少覆盖：

- 跟随系统分别为浅色、深色；弹窗打开期间系统明暗切换，弹窗与页面同步更新。
- 手动浅色/深色分别对照相反的系统配色，手动选择仍优先；切回“跟随系统”后立即按系统解析，刷新后保持正确模式。
- 未登录首屏、已保存显示偏好后的刷新、主动退出后重新登录，以及会话失效重新出现弹窗；无偏好与无效旧偏好按既有默认规则处理。
- 弹窗背景、文字、输入框、按钮、错误提示和焦点状态均使用对应主题，具有可读性；桌面与窄屏一致，不出现首屏错误暗色闪烁。
- 主题变化不清空已输入内容、不重新提交登录、不改变认证状态，不让遮罩或 Esc 绕过强制登录。

交付相关主题解析/组件定向测试及真实浏览器回归证据，记录版本、模式、系统配色、实际结果和明暗截图；截图不得包含真实 Token。源码检查或单张截图不替代上述矩阵。未运行的场景保持未验证，不把计划补充写成问题已修复。

## 2026-10-28 D119 授权边界与四 Skill Review 增量

本轮按用户新决定将默认知识变更从“发现后自动写入”改为“自主只读检查与推荐，获具体授权后执行”。完成唯一 Global AI Guidance、canonical INSTALL、Ontology / Knowledge / VLog Skill、Ontology 方法论及对应设计真源的同步；Doctor 保持只读诊断职责。沿用四 Skill 选择边界，不恢复旧 Branch / Retrieval / Maintenance Skill，也不为每次写入增加模型审批。

- **文本 Review**：纠正旧自动写入与 Ontology 确认的适用冲突，并明确用户直接要求的知识修改、获准的批量整理无需逐条重复审批；纯建模讨论与 VLog 的源任务完成不自动获得写权限。修正本阶段已退役的 Branch Skill 路径和七 Skill 表述；不更改原有历史发布/验收记录。
- **行为评测输入**：[13 个原始任务与冻结判据](../../../tests/skills/authorization-boundaries-evaluation.json) 分离模型输入和审核标准，覆盖必读问候、只读建议、明确写入、批量许可、未知回执、Ontology 方案/授权/超范围、VLog 选用/记录及 Doctor 只读。JSON 结构、Skill 名称和案例唯一性检查通过，**未执行独立模型行为或 ChatGPT 原生自动 Skill 选择测试**。
- **已执行验证**：`node --test tests/render-kg-releases.node-test.mjs` **14/14 通过**；`go test -count=1 -run '^(TestDoctorSkillResourceContract|TestDoctorGuidanceApprovedBaseline)$' ./internal/mcpserver` 通过；Knowledge 和 VLog 两个 Go 资源合同测试通过，Ontology 的文本和包内引用已检查，但没有独立同名 Go 资源合同测试。 `pnpm lint` 通过（含生成 MCP 文档一致性、ESLint、Prettier、Markdown、拼写、秘密检查等）。另有变更文件 416 个本地 Markdown 链接目标检查、D119 锚点与 `git diff --check` 通过。
- **未实施与验收边界**：本轮没有修改生产知识、宿主全局配置、已安装私人 Plugin、冻结发行快照；没有 Commit、Push、Release、部署或完整 `pnpm validate`。Source/Skill 文本合同和隔离资源测试不证明宿主已加载新指令，Phase 25/27/28/32 的客户端、生产使用与发布验收仍独立待完成。

## 先前 P32 实施与验收记录（2026-10-26，v3 优化前）

以下保留当次本地 KG OS 源码与**隔离数据**实测记录，未更改 Dev/Prod 的默认业务图或历史；其中版本与门禁结果属于当次输入，不作为后续工作树的当前证据。当次记录的发行版为 v0.3.2，后续源码候选与已安装正式 Plugin 必须分别报告。

| 范围 | 实施及已取得证据 | 当前边界 |
| --- | --- | --- |
| A32-01 | Issue #1 原请求在修复前复现一致性错误：Graph Type 更新后计划值保留 Person KEY/UNIQUE，暂存版本的 Person 却丢失旧 Constraint 资源；修复 KG OS `patch_execute.go`，按真实暂存 Schema 恢复丢失的旧资源而不跳过一致性检查。真实 Lithograph v0.3.3 隔离测试覆盖无约束、匿名/具名 UNIQUE、匿名/具名单字段 KEY、属性内 KEY、匿名/具名联合 KEY、既有合法实例、旧 RANGE Index 共十组全部通过；同一场景又检查非法属性内重复 properties、no-op、陈旧 baseState、增量增加关系定义与原旧定义原文一致。 | 其它约束失败注入及完整持久故障矩阵可继续扩大，不能从这些用例推断所有底层执行路径已覆盖。 |
| A32-02/03 | 增加 Global AI Guidance v2 独立候选资产；环境允许范围优先、禁止混用正式/测试来源、混库受限时不先全量 Overview；Doctor D1 按真实发布包 v1/v2 比较。v1 冻结基线仍保留，v2 新增哈希测试、六个资源完整性测试，四项相关 Skill 更新至 1.1.0。 | 源码候选不等于宿主已保存、可见加载或自然任务使用；当前 v0.3.2 发行安装指南继续精确使用 v1。未实际获准的第二连接、私人 Plugin 安装与真实多环境模型使用验收不计完成。 |
| A32-04 | 分支命名示例与实际合法性约束、世界简介/增量消息、支持 message 的 SDK/MCP 入口、无 Commit/State Create/fast-forward 的判别写入唯一 Evolution Guide；生成的内嵌 31 方法/75 类型/133 页文档校验通过。隔离已有 State Create/Merge 回归与原始 Message 读取路径已经有真实测试。 | 是否由未被提示的 AI 自动选到指南、自由生成具用途的新说明，需要有版本约束的真实 Skill-only、MCP-only 客户端重复测试。当前测试资料旧记录保持原引用，不改写历史。 |
| A32-05/06/07 | 真实 Lithograph v0.3.3 的检索组合/Provider HTTP 故障、stream partial、快照与三组 Merge 集成测试通过；新增 MCP Graph 示例解释全局 top-k 后过滤、结构化范围及属性边界。 | 冷/热 Provider 定量时限、受限超时和多 SDK 调用后的未知回执、跨重启/备份恢复等完整阶段场景仍须各自留证。 |
| A32-09 | 共享文档主题决定登录 Portal 样式；修复固定深色背景与浅色登录场景。Playwright 两组真实浏览器回归通过：系统浅/深动态切换、手动相反模式、刷新、旧设置、窄屏、输入保留，截图使用空 Token。既有 Web auth E2E 覆盖退出和令牌失效。 | 与用户原始设备/真实服务一致的主题复现、完整多语言及响应式截图矩阵仍须区分本地回归。 |
| A32-08 | 本轮完整 Mac `pnpm validate` **通过**（2026-10-26）：Go 全包/Race 通过、Go 覆盖率 **90.3%**、Vitest 覆盖率、Web Playwright **58/58**、Type Coverage、重复与无用代码、Go 安全、三语言许可证和 Diff 检查均通过。`pnpm audit` 无高危，余 3 个低危与 5 个中危（当前门禁允许）；初轮固定文件数、版本断言、lint、拼写问题已修正复验。 | 最终 SHA 的 Linux Docker/CI、公共同步及实际宿主验收仍需分别核实；不能把本地完整通过当作外部部署通过。 |

**历史质量样本处置（仅建议，未执行）**：2026-10-26 Dev 只读 Head 抽样 21 个 Branch 中 19 个技术化名称；11 份规范双节 Message、8 份单句、2 份无 Message，预览有 10 个无规范简介。此类历史 Commit 不可原位修改，禁止为美容生成多余 Commit。需要真正修改知识世界时应先取得用户对目标 Branch、用途及引用影响的明确授权，以真实后续 Commit 更新动态简介；旧名称若已有稳定引用，保留别名及引用关系的风险由具体迁移方案处理。上述样本不是对全库或所有历史 Commit 的判定。

<a id="guidance-v3-local-evidence"></a>

## 六部分引导与日常职责初版增量（2026-10-26，优化前基线）

本次在 Mac `/Users/yi/Code/KGOS`、源码 `11ecd9e` 的未提交工作树执行。开始时 Git staged/unstaged/untracked 均为空；未覆盖用户已有改动。仅修改引导/Skill、安装候选模板、设计/计划及相关合同测试和用例；未改业务代码、产品版本或发布目录，未提交、推送、发布、部署、安装 Plugin、修改账号配置或知识数据，不运行 Docker，不另启任务。规范来源为 development-standards 的 develop-software、prompt-authoring-spec、skill-authoring-spec 及适用 references；checkout 无 `.agents`，云端所需规范可读。

### 交付与逐项核对

- 当次新增 [Global AI Guidance（当时称 v3，现为唯一当前正文）](../../../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md)，与用户选定消息的 27 个非空正文行逐项比较一致，仅适配 Markdown 标题/空行与版本标记。优化前完整标记区块 SHA-256：`509f0a0d8b5e31396604c7e91ae7be8c199b30332be8f3684e617529d85974ad`；当次 canonical INSTALL 与发布渲染结果保持同一完整区块，未压缩。该未发布候选的第一部分随后按新授权优化，当前正文和检查结果见后续记录。
- Doctor、Knowledge、VLog 候选版本为 `1.2.0`，Retrieval、Maintenance 为 `1.1.0`；Ontology/Branch 继续既有职责与版本。官方清单仍七项，未增加万能 Skill。v1/v2 正文、v0.3.0–v0.3.3 三件套安装快照与 `catalog.json` 未改；canonical INSTALL 和双语模板依 D109 为下次发布候选，不证明旧安装已升级。

| 正文部分 | 本次文本/职责审查 |
| --- | --- |
| 责任与授权 | 持续授权内主动执行；Skill 选择不产生权限，当前只读/不查库/不保存限制生效；普通选择不新增批准节点 |
| 范围与发现 | 明确目标直接使用，受限混库定向读，不先全量后过滤、不因失败换库；简单交流无需正文 |
| 读取与证据 | 依赖既有知识时先读，包含适用跨主题偏好；复用有效内容、核对变化，同组固定 State，实际来源核实当前状态 |
| 沉淀与维护 | 明确且有长期价值时及时沉淀；显式合法保存不另设主观价值门槛；匹配/更新优先，疑似问题先确认，不扩展无关清理，不存秘密 |
| 规范与接口 | Knowledge/维护/VLog 等按各自任务触发，Ontology/Branch 不接管日常编辑；Doctor 按请求只读，接口仍由当前 kgos_docs 维护 |
| 验证与反馈 | 写后核实、未知先查，局部阻塞与独立继续；请求操作报告结果，日常正常维护不逐条播报，重要纠正/冲突/失败仍说明 |

新增 12 个原始情境及独立判据，分别附在既有 Knowledge、Maintenance、Retrieval、VLog、Doctor 评测文件中；本轮仅作选择/授权/恢复边界的文本推演，**没有执行独立模型行为测试或真实宿主安装验收**。

### 实际检查与 Review

已通过修改前资源基线及三项安装链基线；修改后专项 Go 检查通过 9 项（五规范资源、Doctor 资源和 v1/v2/v3 正文哈希），公开生成/安装/冻结快照链通过 13 项；Review 后 Go 9 项及安装衔接两项复验通过。`pnpm check:docs` 验证 31 方法、75 类型、133 页一致，不需要改动生成器或内嵌文档。仓库 Markdown 104 文件与额外含 Plugin 的 170 文件检查通过；仓库拼写 347 文件及补充 Plugin/用例 74 文件检查通过。定向 ESLint、Prettier、gofmt、Git diff 检查、699 个本地链接目标与 17 个新增/改动本地锚点检查通过；新增未跟踪 v3 文件的行末空白与文件末换行另行检查通过。

Review 修复了四类具体问题：Doctor 表格改动导致的四项 Markdown 对齐错误；Knowledge/VLog 旧秘密保存例外与定稿冲突；Doctor 将所有沉淀统一要求长期价值而可能拒绝显式合法保存；冻结安装测试应只锁定既有四版而非要求未来所有版本继续 v1。修复后复查对应输入；文本审查不证明模型今后一定按规则行动。

**完整门禁未通过**：本轮实际启动 `pnpm validate`，在第一阶段 `pnpm check:install` 的 `pnpm install --frozen-lockfile --ignore-scripts` 遇到 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，pnpm 中止依赖目录重建，后续全量阶段未执行。未设置自动同意清理、未重建现有依赖目录；继续可独立完成的专项检查。失败日志在本次临时文件 `/tmp/kgos-guidance-validate.log`，不将历史完整 validate 结果冒充本轮通过。

未验证：完整本地质量门禁后续阶段、自然任务下真实模型的主动选用/沉淀/维护、目标宿主全文保存/加载、跨连接实际行为、私人 Plugin 安装、远端 Docker/CI。范围外动作未执行；Phase 25/27/28/32 均不据本次文本交付关闭。

<a id="guidance-v3-responsibility-optimization"></a>

## 知识持续可用责任优化（2026-10-26）

本次承接 `11ecd9e` 上原有 32 文件未提交改动；修改前将其逐文件内容、SHA-256 清单、完整 tracked diff 和 Git status 保存到 `/tmp/kgos-guidance-optimization-20261026-0839/`。原只读复核确认初版 v3 的 27 个非空正文行、INSTALL 完整区块与初版哈希一致，七 Skill 保留，v1/v2、四版安装快照及发布目录未改。原专项测试通过声明仅作为阶段记录读取，未冒称由复核重新实跑；旧 validate 日志可确认无 TTY 中止。

用户随后授权在同一工作树优化第一部分及必要衔接。按 D112 将责任改为知识持续支持对话、任务和已知长期目标：判断足够性、可信性与适用性，按有据缺口自主选择最小必要行动；已有知识足够时不制造记录、模型或维护动作。专业判断继续由既有七 Skill 分担，未新增总管 Skill、Agent 或框架。Ontology 补充日常表达缺口的选择入口，候选版本为 `1.2.0`；Branch 保持 `1.1.0`，其余 Skill 沿用初版候选版本。

第二至六部分与修改前备份逐字一致；当前 v3 完整标记区块 SHA-256 为 `68335e8172d7d7ac38d949e648ddacb2a0516dfd00ee52568a932b6523f3e21c`，INSTALL 已同步，哈希合同测试改为此授权修订。修正两处复核发现：Doctor 依据真实目标发行包选择 v1/v2/v3，不再把 v3 永久限定为源码候选；本阶段初始计划和先前实施状态明确标为历史，不再将旧未执行项与本次结果混用。

在初版 12 个情境之外新增 12 个原始情境及独立判据，覆盖有实际记录需求的空模型、无使用需求的空世界、充分的模型/知识/系统记录、可靠事实变化、未决冲突、合理差异、建模权限不足、已采用 v3 的正式目标包等路径。文本推演检查必要行动、合理不改、具体阻塞和独立继续；**未执行独立模型行为测试、真实宿主安装或跨连接验收**。

### 本次实际检查

- Go 专项实际通过 10 项：`sqlite_fts5` 下五规范与 Doctor 的资源合同、v1/v2/v3 哈希共 9 项；另在 `sqlite_fts5,lithograph_smoke` 下执行 Ontology 资源合同 1 项。默认 Go cache 因沙箱不可写首次失败，改用现有 `/tmp/kgos-guidance-go-cache` 后通过；未改权限。
- `node --test tests/render-kg-releases.node-test.mjs` **13/13 通过**，日志 `/tmp/kgos-guidance-optimization-install-tests.log`，覆盖当前完整正文同步、发布渲染和冻结安装快照。
- MCP 文档检查通过：31 方法、75 类型、133 页；含 Plugin 的 Markdown 170 文件零问题，仓库拼写 347 文件及 Plugin/情境补充 74 文件零问题。定向 Prettier、ESLint 和 Go 格式检查通过。Doctor 表格对齐在本轮检查中发现并修正后通过。
- 收尾比对确认原 32 文件均保留；其中 18 文件按本轮目标继续编辑，14 文件逐字不变，另有 3 个既有文件纳入优化，当前共 35 个未提交改动文件。全部旧评测情境对象未改，仅追加本轮 12 例；v1/v2、四版快照、发布目录、产品/Plugin 版本与锁文件共 18 项逐字不变。七 Skill 的 65 个包内文件均可达，713 个本地 Markdown 文件目标存在，新增 v3 文件无行末空白且有末尾换行，Git diff 检查通过；HEAD 与 staging 保持修改前状态。最终计划正文更新后另验 Markdown/拼写，不重跑未受影响的测试。

### 前轮完整门禁阻塞（已由后续补验解除）

当次完整 `pnpm validate` **未通过，后续阶段未运行**。使用固定 Node.js `24.15.0`、pnpm `10.34.5` 与 TTY 重试时，当前默认 pnpm store 与已有依赖登记路径不同，触发重装提示；选择取消，未清空依赖目录。改为复用已有 `/Users/yi/Library/pnpm/store` 后，`check:install` 因沙箱禁止建立该缓存的项目登记链接而 `EPERM`。日志分别为 `/tmp/kgos-guidance-optimization-validate.log` 与 `/tmp/kgos-guidance-optimization-validate-existing-store.log`。

随后请求复用现有缓存运行同一完整门禁的提权执行，自动审批**拒绝，未执行**；理由引用原只读限制，认为 `pnpm install` 可能重建依赖并写缓存/日志。没有绕过拒绝、清理依赖或升级版本，仅继续独立专项检查。当次完整门禁为 blocked，不以这些专项结果或历史完整通过记录替代；未提交、推送、发布、部署、安装 Plugin、修改账户或知识数据，也未运行 Docker 或另启任务。该阻塞在用户后续明确授权后通过下列完整检查解除。

<a id="guidance-v3-full-validation"></a>

## 完整质量门禁补验（2026-10-26）

用户于 09:02 UTC 明确授权执行完整 `pnpm validate`，允许依赖安装写缓存登记、必要时重建本项目依赖目录，但不升级依赖或改变锁文件。本轮先核对当前 35 文件工作树、旧日志、依赖目录及已知操作状态；前次被拒操作已知未执行。携新授权走一次正常审批获准，执行前确认没有另一条完整验证进程，未绕过先前拒绝。

在同一 Mac 工作树、HEAD `11ecd9e2c824c6590e1fc847f713984dedfaac45` 加 35 文件未提交修改上，使用 Node.js `24.15.0`、pnpm `10.34.5`、既有 Go `1.27.3` 工具链和 TTY 执行原始完整门禁。仅将 pnpm store 指向已有 `/Users/yi/Library/pnpm/store`，Go build cache 指向已有 `/tmp/kgos-guidance-go-cache`；没有修改仓库质量命令、关闭检查或更新依赖。缓存登记及安装检查输出 `Already up to date`，未重建 `node_modules`。

本次完整命令于 **09:13 UTC 退出，exit code 0**；读回最终日志并核对 `scripts/tasks.mjs` 的顺序，**17/17 阶段全部通过**：

| 阶段范围 | 实际结果 |
| --- | --- |
| 安装、依赖版本、TypeScript、Lint、构建 | 全部通过；MCP 文档 31 方法、75 类型、133 页一致；Markdown 104 文件及拼写 347 文件零问题 |
| Go 全包检查、Race、真实 Lithograph 覆盖率、Go 安全 | 全部通过；12 个有测试的包在各轮返回成功，合并覆盖率 **90.3%**，Go 漏洞检查无发现 |
| Vitest 覆盖率 | **52 文件、451/451 用例通过**；Statements 94.19%、Branches 90.11%、Functions 96.01%、Lines 96.55% |
| Type Coverage、重复与无用代码 | 全部通过；重复代码 0 clones |
| 真实浏览器 Playwright | **58/58 通过**，28.6 秒 |
| npm/Go/Rust 许可、安全审计、Diff | 全部通过；生产审计无已知漏洞，全依赖审计报告 **3 low / 5 moderate**、无 high/critical，符合现有门禁；未升级依赖 |

完整原始日志 `/tmp/kgos-guidance-full-validation-20261026/validate.log`，SHA-256 为 `6bdc68af5a5b46d2e86d856a0b8c2e29bea24435381f5d0e57c2269d98481a83`；同目录 `validate.clean.log` 为去除终端控制码的阅读副本，`result.json` 逐项记录 17 个阶段与结果，`baseline.json` 保存执行前哈希。构建仅保留非阻断的 Web chunk 大小提示，没有据此扩大产品修改。

验证结束、记录本文之前，原 35 文件及产品版本/锁文件与执行前哈希全部一致，HEAD 与 staging 未变；本轮源码唯一后续修改是本节验证证据和前轮阻塞状态的历史标注，另做文档检查，不重复未受影响的完整测试。旧 v1/v2、发行快照和此前改动保持。本次未提交、推送、发布、部署、修改账户配置或知识库数据、运行 Docker，也未另启任务。

本地完整质量门禁不替代自然任务下模型行为、目标宿主全文保存/加载、私人 Plugin 安装、跨连接行为、远端 Docker/CI；这些仍未验证。Phase 25/27/28/32 不因本次本地检查自动关闭。

## 全局引导单一源码收敛（2026-10-26）

用户明确：Skill 与文档只维护当前最终正文，历史版本由 KG OS Git Tag / Release 管理，不再在当前目录并存 v1/v2/v3 文件。此要求取代本阶段此前“保留三份全局引导资产”的候选策略，不改写以前的工作记录。

- 将 Doctor 的三份版本化对照资产收敛为唯一 `plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md`，保留已确认的六部分完整语义，去掉正文起止标记中的独立版本号；历史文件通过 Git 历史及正式 Release 回溯，不在当前 Skill 包维护副本。
- Doctor D1 改为依据目标实际安装的 KG OS Release Tag 和同包完整正文取证，当前源码只对照当前包；不能用新正文判断旧包、用文件可读证明全局加载或把宿主不可见状态判为成功。调整 Go 合同测试、评估情境和资源计数，增加单资产分发断言。
- 同步 canonical `plugins/kgos/INSTALL.md` 全文区块与双语可编辑官网模板；设计入口、MCP 所属设计、D112 决定和 Doctor/Phase 计划均指向同一个现行资产。网站 `service-installation/vX.Y.Z/` 旧版静态快照是**已发布页面的冻结交付内容**，本次不修改、不作为日常维护源；旧版规则应从对应发行 Tag 读取。用户现有自定义指令及已安装 Plugin 不自动更新。

此项只完成当前源码及引用的整理，不代表当前文件已打 Tag、发布、推送、部署或在真实 ChatGPT 宿主生效；Phase 32 的其它跨连接、自然任务及最终 CI 验收仍独立存在。

验证：`go test -tags sqlite_fts5 ./internal/mcpserver -run 'TestDoctorSkillResourceContract|TestDoctorGuidanceApprovedBaseline' -count=1` 通过；`node --test tests/render-kg-releases.node-test.mjs` **13/13 通过**，覆盖单一资产、当前 INSTALL 区块及历史发行快照原文；`pnpm check:markdown` **104 文件零问题**、`pnpm check:spelling` **347 文件零问题**，受影响文件 Prettier、Go 格式及 `git diff --check` 通过。上述为当前 Mac 工作树定向检查，不代替整个 Phase 的最终 CI 或真实客户端验收。

## 提示词与 Skill 审阅优化（2026-10-26）

用户批准先前八项审阅建议，本增量属于 P32-02/03/05；限于仓库规范、官方提示词/Skill、MCP 文档与相关验证，不包含提交、推送、发行、部署、私人 Plugin 或宿主配置修改。开始基线 `65849c417e63836f8b9f9506d1633fc1f309b18a`，工作树干净。具体合同由 [MCP owner](../../design/mcp.md#kgos-doctor-v1)、[全局引导](../../design/mcp.md#global-ai-guidance-and-daily-responsibility) 和 [AGENTS](../../../AGENTS.md)维护，本节不重置原阶段 Acceptance。

本增量验收：Doctor 对可见局部差异和持久配置未知分别报告；空库/未启用选配能力不自动告警；普通工程选择不重复批准且明确审批保留；MCP-only 的受限读取入口在操作前可达；未知写入只暂停危险重复；已读有效文档不循环重读；安装前核对容量与定制；唯一官方正文、INSTALL 和生成文档同步，冻结发行材料不改。复核授权、部分失败、只读、相邻合法案例及资源可达性；文件/测试结果不冒充真实宿主行为。

外部参考核验日期：2026-10-26。以下只支持编辑方法，不替代项目授权或证明模型效果：

- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model)：明确自治/批准边界，避免冲突规则；按同一任务评价改动。
- [Agent Skills best practices](https://agentskills.io/skill-creation/best-practices)：按条件加载参考，核心限制在动作前可达，检查执行轨迹而非只看答案。
- [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)：优先高信息密度与任务相关上下文，不把最短字数当正确性。
- [ChatGPT Custom Instructions](https://help.openai.com/en/articles/8096356-chatgpt-custom-instructions)：容量与宿主入口有实际限制；安装时核对当前说明/UI及已有内容，不硬编码套餐能力或假设另一持久入口。

### 本增量验证与 Review 结果

本地源码优化已完成，未提交、推送、发行或部署，未改私人 Plugin、用户持久指令或业务知识库。以下证据来自本轮 Mac 工作树；不替代真实客户端行为、跨连接及远端 CI 验收。

| 检查 | 本轮结果与范围 |
| --- | --- |
| 改动前基线 | `node scripts/generate-mcp-docs.mjs --check` 通过；`node --test tests/render-kg-releases.node-test.mjs` 13/13 通过 |
| 最终 MCP 文档 | 同一 `--check` 验证 31 方法、75 类型、133 页；38 份变动内嵌页由生成器更新，不手改生成副本 |
| Go 定向真实测试 | 下方定向命令：13 个主测试及 15 个子场景通过，无失败/跳过；使用现有 Lithograph v0.3.3 / Provider / Jieba 原生库与临时数据库 |
| 文档读取示例 | 新增 `TestDocumentedPinnedReadingBoundaries`，通过真实 MCP 分别读取两个不同 Head 的默认/指定分支；返回目标 pinned State，读取前后 Branch 列表不变 |
| Skill 资源与正文 | 七个资源合同通过；63 份包内 Markdown 全部可达；官方完整区块与 INSTALL 一致，当前批准正文的 SHA-256 受测试保护 |
| 分发 | `node --test tests/render-kg-releases.node-test.mjs` 最终 14/14；新增 v0.3.4 冻结正文校验，已发布 v0.3.0–v0.3.4 材料未改 |
| 静态质量 | MCP 包 `go vet`、`go tool staticcheck`（同上 tags）通过；生成器/分发测试 ESLint、所改文本 Prettier、Markdownlint（含 Plugin 和双语模板）、CSpell、`git diff --check` 通过 |
| 引用与范围 | 所改 Markdown及 Skill 包共114份文件的本地目标/大小写检查通过；新增片段链接可定位。没有新增依赖、公共接口、业务模型、未跟踪产物或修改冻结 Release |

定向测试命令：

```bash
go test -tags=sqlite_fts5,lithograph_smoke ./internal/mcpserver ./internal/kernel -run 'Test(.*SkillResourceContract|DoctorGuidanceApprovedBaseline|DoctorSkillReadProbe|DoctorSkillProbeKeepsReadFailureEvidence|DocsViaRealMCPProtocolNoSkill|Documented.*)$' -count=1 -v
```

场景集合新增12个输入（Doctor 8、Knowledge 2、Retrieval 2），当前8份场景文件合计301条定义；执行者输入与判据继续分离。新增场景和既有相邻合法情况完成**文本合同推演**：可见差异/隐藏其余配置、部分匹配/引用样本/合法定制、预期空库/手动维护/已有周期或记录要求缺失、未知写入/已确认拒绝后恢复、受限分支读取和有效文档复用。另复核仅评审不写、明确预先审批仍停、普通工程选择直接推进、Doctor 结束后宿主继续已有授权任务、安装容量未知不虚构替代入口。未执行独立模型批跑，不能将301条定义称为301次行为通过。

Review 已修正：D1 的缺节/不配对判定邻接完整可见范围条件；D5 仅在明确不需要周期维护时判不适用，避免掩盖已约定但缺配置的任务；Object/Ontology/错误指南的循环前置及设计入口旧版本表述；精简稿保留已知目标、同实例用途范围、合理事实差异和授权边界。首轮新增 Go 夹具因零 Property 被正常拒绝，已补合法 Property 后重新通过，未放宽引擎合同。双语模板检查另修复既存表格对齐空格和英文表述，不改其部署语义。

复核六部分含义、当前指令/案例及生成副本后，所审阅范围没有遗留影响本次优化完成的问题。全局指导成对区块 1,745→1,500 字符，AGENTS 5,449→4,778，设计索引 13,756→8,669；字符数不是 Token 或模型效果测量。实际可保存容量仍须扣除用户已有内容并核对宿主，不能据本文宣称账户配置已更新。

原 A32-02/03/04 的真实跨连接/客户端验收及其它阶段缺项继续保留；本轮未运行完整 `pnpm validate`、Docker/远端 CI 或真实 ChatGPT 自动选用评测，不由本地文档增量关闭整个 Phase。

## v0.3.5 正式发布与官网归档（2026-10-26）

本轮全局引导与官方 Skill 优化以 `6d8b4096d1b2baeda42437e9814975eb0c15de75` 提交；Release 版本预备提交为 `81adcb7526d45bc3111d6b390b770aac5470633c`。私有 `main` 推送、`v0.3.5` 注释 Tag 及公开同名 Tag/Manifest 已验证，公开主分支两项 CI 通过，正式 [Release CI](https://github.com/bYiyLi/kg-releases/actions/runs/40353232170) 的验证、Docker 集成与镜像发布三个 Job 均成功。不可变镜像 `ghcr.io/byiyli/kgos@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc` 已通过独立匿名 OCI Manifest/配置读取，核实 Linux amd64 与精确私有 SHA。

[公开 GitHub Release](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.5) 实际已发布五个附件：一个七 Skill 的 Plugin ZIP、三份同版安装手册及手册校验清单。逐字节核验清单 SHA-256、ZIP 中唯一 `INSTALL.md` 与独立 AI 指南一致、Plugin Manifest `0.3.5`、七份 Skill 入口与无退役通用 Skill。将已验证的三个官方手册字节原样归档到 `distribution/site/src/content/service-installation/v0.3.5/`，切换网站 `catalog.latest`，同步双语可编辑模板中已验证 Digest 及 README 的示例链接；旧版快照保留。官网 Pages CI、远端当前页面和历史版本切换，须以本次归档提交后的实际证据另行核对，不以 GitHub Release 成功代替网站上线。服务 Dev/Prod 升级、用户私人 Plugin/持久引导配置与完整 Phase 32 其他验收仍不属于本次发布的完成声明。

## Review 与完成条件

每轮Review以当前变更为准，检查需求覆盖、所有权、现有合同、失败路径、兼容及可执行验收；记录具体发现和修改，再重新检查受影响项。新证据或真实未闭合问题驱动后续轮次，不预定轮数，也不无限重复无变化检查。

阶段done必须同时满足范围内Feature、A32-01至09、必要门禁、文档同步和Review结论。当前设计/计划文档审核完成只能标记对应文档结果，不能把Phase标done；缺执行权限、镜像版本或真实客户端证据时明确partial/blocked。发布和生产部署不包含在本阶段默认完成动作中。

## 初始计划时证据（历史）

以下保留初始计划时的观察与未执行项；后续已完成或仍缺失的证据以本文件上方各次实施记录为准，不将这里的旧状态继续当作当前结论。

- 已有2026-10-25真实插件最小复现及对照，见Issue 1。
- 已读取源码基线 `f9f06feb5c563a682bb3b237090b046ca77e99ea` 的相关实现与设计；错误触发链路已定位，字段级根因尚未确认。
- 2026-10-26 Dev 只读检查21个当前 Branch Head：19个名称为 qa-/overnight- 加场景和日期；11份 Message 有两节结构、8份单句、2份缺失，预览10项显示“无规范简介”。该观察覆盖当前 Head，不是全部历史或内容真实性审核；规范/体验缺陷与 State 有效性分开判断。
- 登录弹窗主题问题来自2026-10-26用户反馈，已纳入 P32-06 / A32-09；尚未执行复现、修复或浏览器验收。
- 文档交付检查与阶段运行验收分开记录：已完成远端文件回读、改动差异和本地链接目标检查；仓库 `pnpm check:markdown`、`pnpm check:spelling`、完整 `pnpm validate` 与最终提交 CI 未取得通过证据，不得以本次文本审核替代。检查所需执行环境和依赖未就绪时保留未验证，不擅自启动 Work/Codex 或安装工具。
- 本次目标为设计和新计划的文档交付；代码修复、场景执行、插件更新、质量命令、CI、发布及部署均未由文档编写证明完成。
