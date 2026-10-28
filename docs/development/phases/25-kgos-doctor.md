# Phase 25：KG OS Doctor · 使用环境自检

<!-- cspell:words mcpserver -->

## 当前目标与状态

**状态：`in_progress`（2026-10-28）**。Doctor 是用户按需触发的只读自检 Skill，现行合同见 [MCP Doctor 设计](../../design/mcp.md#kgos-doctor-v1)、[D118](../../design/decisions.md#d118-kgos-doctor-six-checks) 和 [Skill 正文](../../../plugins/kgos/skills/kgos-doctor/SKILL.md)。历史 D104 的五项诊断、四状态及参考文件结构由本次六项检查取代；对应历史测试与评审仍保留在下文，不作为当前验收规则。

**目标**：通过简洁的单文件 Skill，在明确授权的可见范围执行 D0–D5 六项真实检查，逐项给出证据、结果与必要建议。官方全局引导词正文仍由 [唯一资产](../../../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md) 维护，不随 Doctor 重构而修改。实际 MCP/SDK 签名与操作方法由 `kgos_docs` 提供；不增加内置 Agent、调度器或 Doctor 专用接口。

## Feature 与验收

| Feature | 当前工作 | 验收 |
| --- | --- | --- |
| P25-01 · 六项 Skill 合同 | 重写 `SKILL.md`，删去旧 Doctor 专属参考与模板；维护唯一引导资产 | 选择条件、六项方法、结果与只读边界完整，无旧规则冲突 |
| P25-02 · 本地合同及分发 | 更新 Go 合同测试、场景评测与公开分发文件清单 | YAML 元数据与资源可读，六项行为检查点覆盖，分发恰好包含现行文件 |
| P25-03 · 真实宿主验收 | 在目标 ChatGPT 与真实 MCP 检查版本、系统级引导、Skill、State、Knowledge、维护记录 | 检查结论符合当次证据，不把不可见的宿主/版本信息或有限样本编成成功 |
| P25-04 · 交付门禁 | Review、diff 与相关本地测试，按发布要求补齐真实 Linux/CI/Plugin 证据 | 阶段要求的真实验收全部满足后才可标 `done`；提交、发布、部署另需独立授权 |

## 当前 Acceptance

1. **D0 · 版本**：取得已安装 Plugin/Skills、目标 MCP `serverInfo.version` 与官方最新稳定 Release；核对实际版本，发现新版本只推荐升级。若客户端不暴露版本信息，记录验收受阻而不猜测。
2. **D1 · 全局引导**：检查当前会话开始时是否由宿主自动加载 KG OS 全局引导词；初始化的用户自定义指令或项目指令有效，不要求 `system` 消息角色。后续 Skill、MCP、文件、工具或聊天消息中的正文不算生效，不要求账户持久设置或过往会话行为审计。
3. **D2 · MCP/State**：通过真实 `kgos_docs` 和 `kgos_query` 执行 `evolution.overview` / `evolution.get` / `ontology.read`，在目标 Instance 的固定 State 验证一致性与 Ontology 可读性。默认分支通过不能代替其它指定 Branch。
4. **D3 · 官方 Skills**：依据实际安装发行包检查宿主 Skill 清单、`SKILL.md` 与必要资源，对照当前 MCP 文档核对兼容；不能用待发布源码误判旧版缺失。
5. **D4 · Knowledge**：按实际 Ontology 执行有界 `graph.query`，只声明已覆盖范围的发现、读取与检索事实；空样本不证明全库为空。
6. **D5 · 维护/VLog**：核对已配置任务及真实运行结果，按实际模型检查可用 VLog、验证来源和未决延续；未启用的可选能力不当成故障，也不建立任务或模型。
7. **报告与权限**：仅 `PASS` / `FAIL` / `N/A`，区分故障与证据不足/受阻，按 D0–D5 线性报告、保留独立检查；全程只读，不自动修复、安装、升级或部署。普通检索、模型设计、VLog 创作及 CLI `kg doctor` 不触发本 Skill。

**交付边界**：写入源码及本地测试不代表私人 Plugin 自动升级、Release 已发布或实际 ChatGPT 自检通过。没有真实客户端/远端验证、Commit、Push、Tag 与部署证据时，Phase 保持 `in_progress`。

---

<a id="doctor-skill-v1-evidence"></a>

## Doctor Skill v1.0.0 源码创作与验证（2026-10-21）

### 交付与职责

[kgos-doctor](../../../plugins/kgos/skills/kgos-doctor/SKILL.md) 为独立只读诊断 **workflow**，拥有诊断结果而非规范转发、修复或维护执行。当时的运行时包为入口、宿主证据（D1/D3）、知识就绪性（D2/D4）、维护证据（D5）及引导对照资产共五个 Markdown 文件；历史正文由对应 Git 历史/Tag 保留，当前入口为 [Global AI Guidance](../../../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md)。旧版标签和正文在其历史版本中原样保留；文件标题仅用于文档呈现，不属于宿主配置正文，不因读取资产而判断已注入。完整/定向诊断、依赖失败、不可见信息、四种结果及结束边界均在包内可达。

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
