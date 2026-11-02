# Phase 27：KG OS 官方知识规范 Skill 体系

<!-- cspell:words testdata SKOS CIDOC pypdf Diátaxis Persistant Presential -->

<a id="d122-remote-foundation-navigation"></a>

## D122：基础本体原文引用与渐进加载（2026-11-02）

**状态：`in_progress`**。按用户最新决定和 [D122](../../design/decisions.md#d122-remote-foundation-navigation)，在同一 draft PR #2 将整套原件内置改为固定原文导航。D121 的身份建模、知识质量规范、必要案例、旧业务模型库退出及 VLog 本仓维护继续有效；以下 D121 包体与检查记录标为历史，不作为当前资源合同。

| 范围 | 当前交付与检查边界 |
| --- | --- |
| 五套理论导航 | BFO/UFO/DOLCE/SUMO/GFO 按真实原始结构及文件功能说明版本、用途、读取条件、范围与准确固定 URL；最新发现分开，理论/权限缺口保留 |
| 渐进读取 | 主 Skill 关键路由 → 通用方法 → 所选理论目录/文件 → 必要章节/依赖；依据足够停止，不要求全量五套，不用预设问题穷举封闭路由 |
| 资料退出 | 删除本 PR 新增的上游原件/全文转换、逐文件目录与清单、专用 hash 检查及 Native 分发/体积例外；沿用原 Markdown 分发合同，Git 历史保留 |
| 保留内容 | 独立 KG OS 适配、问题驱动建模、条件明确的小案例与 Knowledge 的视角/结构/简洁/准确/必要完整性/独立理解/用途规范；不恢复旧库发现或生成维护 |
| 结果 Review | 源树/原文读取、固定路径/版本/IRI 对应、许可范围、指令密度/职责、资源/分发及 diff 的静态检查；GitHub 独立 Review 与人工 Review 仍待完成 |

Acceptance：固定原文的定义、公理、指南、案例和依赖可按用途定位；读取失败、GitHub 大文件空内容、格式限制及受限资料有准确处理边界；不把阅读定位写成运行时导入，不重新依赖失效 GFO catalog。文档与分发合同不再声称当前含 553 原件/17 转换。必要案例说明前提、理由和边界，完整上游例按索引读取。无额外 Skill、Kernel/模型语义引擎、生产修改或发布。

本轮已实际读取开发规范助手的 prompt-authoring-spec、skill-authoring-spec 及 context/examples、resource-layering、contract-validation 等相关正文，按必要性、职责、条件路由和信息密度审查；不由文字自洽声称模型行为已实测。

### 当前检查证据

实施基线为 `99812bfd2b648171efbb76d29dc744cded7e615b`；以下为本轮工作树的实际证据，不沿用历史整包检查称本轮通过。交付 head/base 及最终候选归档以同一 draft PR 的实际记录为准。

- **原文/路径**：八个来源固定 Git 树核对 101 处文件/目录链接（96 个不同定位）；GitHub 实际读取关键 README 的 blob 与本地固定树一致。MILO 的 Contents 返回空内容，按固定 blob `5dcace648603db93bf0febb6281b1b9d21a70fc2` 成功读取正文。DOLCE D18、GFO 两版 Part I 及 gUFO 论文版本页已直接核读其版本/范围入口，不据此声称全文语义已审完。
- **阅读依赖与语义**：只解析 17 份固定本体模块元数据，5 条 import IRI 有固定阅读定位；GFO 全部 11 个现行模块 identifier 与导航一致，失效根 catalog 明确披露。按原 base 修正 Persistant 为 Universal 子类、由 Presential 实例化的适配表述，未运行推理/证明。
- **资源与保留范围**：Ontology 仅 10 份 Markdown 资源且条件路由可达，四 Skill 清单保持不变。Knowledge 主规范/质量参考、VLog 三份 Markdown、原有建模案例及全局引导与基线逐字节一致；本次未改其语义或执行案例。删除 583 个原件包专用文件，普通分发/大小/格式规则恢复至 PR base。
- **实际静态检查**：`pnpm lint`、目标 Markdown（117 份）、新增导航及相关 Skill/方法的定向 Prettier/CSpell、本地文档 849 条路径/锚点、五个 Go 元数据/资源合同、两项确定性分发/版本检查及 `git diff --check` 通过。分发检查覆盖四 Skill、实际 Markdown 清单、原文包退出及源码测试排除，不调用知识库或模型。GitHub 补丁回读后，将 UFO/GFO 中读取案例/求解器的措辞收敛为“读取不授予执行权限”，避免把本轮禁测要求写成长期禁止，宿主仍按实际用户授权决定是否执行。
- **读取限制**：SUMO 官网与 UFO 2005 博士论文 PDF 本轮浏览返回 403，出版页/固定仓库可读；未绕过、未把不可读当不存在或已读全文，依赖相应正文的结论保持受限。理论未公开/实现子集、出版物权限、目标宿主外部读取/加载及模型行为仍各有边界；静态检查不能证明未来原文持续可用。

未执行查询、案例、行为模型评测、任务模拟、证明器、生产例子、额外模型 API、Docker/Dev 或远程 CI；未进行账户 Plugin 安装、合并、发布或部署。独立 GitHub Review 及用户人工 Review 尚未完成。

<a id="d121基础本体资料与质量规范增量2026-11-02"></a>

## D121 历史方案及检查记录

下节对应此前内置原件方案及其修订，最晚基线为 [`99812bfd2b648171efbb76d29dc744cded7e615b`](https://github.com/bYiyLi/kg-os/tree/99812bfd2b648171efbb76d29dc744cded7e615b)。其中原件数量、路径、清单、命令和候选产物只在该历史版本成立，D122 已删除其当前态资源及专用检查。历史证据保留，不证明远程原文的新导航、当前包体或宿主读取已通过。

**历史实施状态：`in_progress`**。此前增量按 [D121](../../design/decisions.md#d121-bundled-foundations-and-quality-review) 和 [MCP owner](../../design/mcp.md#ontology-standards-authoring) 实施，交付一个 draft PR，经结果 Review 后交用户人工 Review。该历史增量当时替代旧记录中关于独立模型库入口及本增量案例/行为验收的安排；历史证据不重写，不据此关闭整个 Phase 27 或 Phase 25/28。

| 内部步骤 | 交付与依赖 | 当时结果 |
| --- | --- | --- |
| 来源与许可 | 五套理论逐项核对；固定版本/Commit，明确原件、公理、实现、指南、案例、依赖及缺口 | 固定清单及取证完成，保留实际理论/许可缺口 |
| 规范改造 | 语义身份先于字段；知识内容、证据、视角及维护过程分工；四 Skill 边界 | 源码已改，含一手内容方法适配及具体 Review 判据 |
| 原件与适配打包 | 原文及逐文件清单，独立 KG OS 适配、条件路由与确定性分发检查 | 553 原件、17 份完整提取；本地分发检查已通过，实际宿主未验证 |
| 旧库退出 | 停止运行时发现/同步，包内可选静态案例、来源与恢复说明 | 当前源码完成；旧远端仓库及用户安装未改 |
| 结果 Review 与交付 | 全 diff、许可/忠实度/语义/资源/迁移 Review，修正后复审；Commit/Push/draft PR | 本地结果 Review 与确定性检查收尾；独立 GitHub/人工 Review 待完成 |

Acceptance：

- BFO、UFO、DOLCE、SUMO、GFO 全部有实际来源核查与范围声明，原件和 hash 可核对；子集、空目录、外部版权资料或非公开公理不能冒充完整理论。
- 选择理论后可从版本、承诺语义走到 KG OS 图表达及执行边界；主 Skill 不全量加载资料，不强制特定理论、固定领域 Schema 或领域 Skill。
- 规范与示例标题不把分类实例、角色 Property 等局部选择写成普遍定律；相同字段但身份/成员资格不同的对象有明确判断路径。
- Knowledge 正文能区分对象内容与维护过程，保留会改变使用判断的条件和必要经历；不将来源观点变成无归属事实。
- 内容 Review 同时覆盖用途、视角、结构、简洁、准确、必要完整性、独立理解和使用价值；每项有检查对象/可观察缺陷/依据/修正及结果边界，支持合格/需修订/证据待核/无新增价值。KCS、Google、Diátaxis、Microsoft 一手方法须有实际适配与不照搬范围，并给合成 Claim/Procedure/Case 对照，不复制私有数据或强制通用模板。
- 包内依赖/路径/格式/许可及公开分发完整性通过确定性检查；读取已写结果、检查新增文件和 `git diff --check`。真实宿主不可观察的格式/体积/加载/行为标记未验证。
- 本增量采用**结果 Review**，不跑案例、模型评测、任务模拟、生产示例或额外模型 API；`pnpm validate`/pre-commit 中含案例执行的整套入口不在本次运行。保留既有门禁定义，报告实际未运行项，不通过禁用门禁制造全绿。无 Kernel/运行时变更，不要求此资料增量执行 Docker/Dev 写入。
- 分支提交推送并开 draft PR，记录 head/base 和检查结果，供独立 GitHub Review 及用户人工 Review；不自动合并、发布、部署或更新账户 Plugin。

Review 检查完整收录范围、原文忠实与可读转换、概念身份/关系成立条件、资源路径与第三方许可、职责/指令冲突、描述密度与视角、旧库迁移及恢复；静态 Review 不证明模型行为改进。

### 历史检查与 Review 证据

证据对应本任务工作分支的 D121 改动，基线为 `ac85628985e66860ed28f82a0f5cec9ba4c3d09a`，不是该基线已包含新资料。交付 Commit、head/base 与独立 GitHub Review 结论以实际 draft PR 为准。

- **来源完整性**：`node scripts/check-ontology-sources.mjs --upstream-root /tmp` 核对 10 个来源包、553 份原件（17,244,963 bytes）、17 份全文转换及 8 个固定 Git 树；收录与 1,094 个排除项完整对应，无未知原件。版本、逐文件 hash/blob、许可、用途、依赖与缺口在随包 `sources.json`/目录中。
- **转换与语法**：用 pypdf 6.13.2 重新提取 17 份 PDF 的全部 113 页，逐页文本、页序及字符数与副本一致；不据此认证图/公式排版忠实。41 份 XML/JSON 解析通过；56 份 Turtle 解析通过。进一步 RDF 解析为 89 份通过、2 份历史 DOLCE Archive（2.2/2.3）失败，已保留原字节并在清单/适配明确说明，不冒充现行可载入模型。导入检查定位 54 条边；gUFO HTTPS 别名以显式本地对应处理，未修改原件或执行推理。
- **资源与分发**：五个定向 Go 元数据/资源合同检查通过，涵盖 Ontology、Knowledge、VLog、Doctor 和未改引导词基线；没有执行案例/数据库业务测试。公开导出白名单、570 份原件/转换逐字节相同、篡改与未登记文件拒绝、版本注入三项确定性分发检查通过。原四 Skill、源码测试目录排除及第三方通知保留。
- **文本 Review**：已核对新规范与来源、权限、职责及资源路径；修正分类/角色案例标题的普遍化、相同字段掩盖身份区别、GFO Persistant/Presential 层次、DOLCE SIMPLE 与 D18 及技术重实体化的差别。Knowledge 判据将多主体主张、聊天指代、维护历史错放、冗余与必要限定分别处理；外部内容方法只有适配、无整页转载或私有案例。
- **限制**：完整 UFO-C、GFO 未公开 FOL、DOLCE D18 外部报告、BFO ISO/商业书籍及 SUMO 未选领域/词汇语料未冒称收齐。未执行案例、行为评测、模型 API、真实宿主安装/加载、Docker/Dev、整套 `pnpm validate`/`check:quick` 或远端 CI；没有生产库/账户 Plugin 修改。模型指令和静态 Review 不证明稳定行为收益。

恢复与旧库处理见 [维护指南](../../guide/ontology-sources.md)。源码/资料分发检查与未来真实宿主或整阶段门禁分开，不以本增量关闭整个 Phase 27。

### 历史 GitHub Review 修订

对 draft PR #2 初版 `6638a1fcc1640c209fbfa241bbc1e7b6f042e6b6` 的三项发现作针对性修正：

- **内容 Review 路由**：`quality-audit.md` 入口对齐主 Skill 第 3/4 节。第 3 节只加载相关内容判据与方法依据，不触发全量盘点/覆盖报告；第 4 节审计才使用相应完整审计方法，仍按实际范围执行。
- **SUMO 编码与不存在的副本**：删除“readable copies”声明。Merge（657,674 bytes）与 MILO（1,194,157 bytes）均严格 UTF-8 解码/往返成功，且与固定上游 blob 一致；新增逐文件编码与 U+FFFD 计数校验。Merge 第 11 行的单个 U+FFFD 已存在于上游（零起始 byte offset 418），未擅自恢复或替换。文档给出的只读 Python 读取命令对两份原件均实际核对输出字节/hash，不运行 KIF。
- **GFO 失效 catalog**：删除“原 catalog 提供 base 映射”的错误说明，保留原 catalog，并记录其 `core/` → 不存在 `modules/gfo-core.ttl` 的问题。在独立 `importAliases` 明确 base → `modules/gfo-base.owl`，核对目标 ontology identifier；复查 54 条本体导入无未解析目标，18 条原 catalog 路由中 17 条文件存在，仅保留这一已披露的上游失效项。

553 份原件与 17 份 PDF 提取内容保持原 hash。修订仅做取证、文本和确定性资源/分发检查，不执行案例或模型试验；整体独立 Review 及用户人工 Review 尚未完成。

**后续逐文件 Review（基线 `9e325fea3e25220a34b573844e3e9ac18c9e029c`）**：纠正 VLog `references/cypher.md` 的旧快照维护说明：旧 Commit 仅作历史溯源，当前查询直接在本仓库维护；合成资料在源码中与 `references/` 同级的 `tests/`，不随 Plugin 分发，静态检查与运行验证归 KG OS 当前开发及分发 CI 流程。与主 Skill、D121、实际目录、隔离测试读取路径及分发排除规则对照一致；仅该段改变，六个 Cypher 代码块及 Q1 之后全部内容与基线逐字节一致。两份修订文档的 Prettier、MarkdownLint、CSpell、本地链接与 `git diff --check` 通过。本次未执行查询、案例、行为测试、证明器或远程 CI，整体 Review 继续进行。

## D115/D116/D117 历史实施基线（2026-10-28）

**状态：`in_progress`**。原 Ontology/Branch 已合并为 `kgos-ontology-standards`；Knowledge/Retrieval/Maintenance 合并为唯一 `kgos-knowledge-standards`；VLog 保持独立。三个规范加 `kgos-doctor`，当前源码目标共 **四个官方 Skill**。已发行 v0.3.5 七 Skill、用户私人 Plugin 和当前部署不受本次本地修改影响。

本阶段新增验收条件：统一 Ontology Skill 必须先进行本体语义与身份判断，明确能力问题、Ontology/Knowledge 分类边界及最小图结构；[KG OS 本体论方法论](../../../plugins/kgos/skills/kgos-ontology-standards/references/ontology-methodology.md)和[四个建模案例](../../../plugins/kgos/skills/kgos-ontology-standards/references/modeling-examples.md)随 Skill 可独立读取。通过 [简版确认模板](../../../plugins/kgos/skills/kgos-ontology-standards/references/model-confirmation-template.md) 向用户展示实际结构改动、关系图、语义与数据影响；**即使仅复用模型的建模任务，也须确认方案，普通 Knowledge 写入例外**。VLog 独立 `branch/vlog` 的内容归属不变。外部 `kgos-ontologies` 尚未创建时必须继续支持独立建模，不可强制依赖 GitHub 地址或额外 Skill。

本次统一交付须通过：四目录源码与分发白名单一致、Ontology 包含入口与三份按需参考、Knowledge 包含入口与一份按需质量审计参考、所有链接可达；原 Ontology 及 Knowledge/Retrieval/Maintenance 历史教学案例仍作为隔离测试数据，现行案例还须由分发原文通过真实模型/查询验证。统一 Knowledge 的行为边界覆盖检索充分性、语义/身份/关系、更新冲突、质量审计、维护和写后核实，不将读/写/维护/审计强制串联，也不新增模型修改权限。此前冻结的分离 Skill 评测仅保留历史证据，统一 Ontology 使用 [建模评测](../../../tests/skills/ontology-unified-evaluation.json)，统一 Knowledge 使用 [知识评测](../../../tests/skills/knowledge-unified-evaluation.json)。实际客户端安装、版本发布及 CI 仍由 Phase 28 单独验收，不能标记 `done`。

**D115 本地实现与验证（2026-10-27）**：四个运行时 Skill 目录已实际建立，Knowledge 仅保留 `SKILL.md`；原 Knowledge 四组实例、Retrieval 五组查询及 Maintenance 三组案例共十二份独立移到 `internal/kernel/testdata/knowledge/`，其中 39 个代码块与原版本一致。Go Skill 资源合同测试通过；真实本机 Lithograph v0.3.3/Jieba 下执行 Knowledge 实例、Retrieval 查询、Maintenance 证据以及既有 Ontology 测试回归全部通过。公开分发 Node 测试 **14/14**，Markdown 检查 **0 问题**、CSpell **0 问题**，Prettier/gofmt/`git diff --check` 通过，相关 **38 份 Markdown** 的链接检查 **0 失效**。新增 13 个合并 Knowledge 行为评测输入与判据，但**尚未运行独立 AI 行为评测、真实 ChatGPT Plugin 安装/选择、远端 CI、Commit、Push 或 Release**，不据本地检查关闭 Phase。

**2026-10-29 Knowledge 质量审计增量验证**：新增主 Skill 的审计触发/质量验收规则和按需 `references/quality-audit.md`，扩展 Knowledge 评测至 21 个静态场景（新增来源真实性、全量覆盖、真实业务问题三组）。Go 资源合同测试 PASS；公开分发资源白名单定向测试 PASS；Prettier、MarkdownLint、CSpell 和 `git diff --check` 通过。完整公开分发 Node 套件本次 **14/15**，唯一失败为发布流程测试的 `RELEASE_FLAGS[@]: unbound variable`，不在新增 Skill 资源导出路径，不能报告全套通过。未运行真实 ChatGPT 行为评测、部署或正式发行，本阶段仍为 `in_progress`。

**2026-10-29 知识质量 P0–P2 增量**：现有 Knowledge Skill 与按需参考明确分离来源可定位、来源支持具体主张及独立验证结果；按结构覆盖、语义深度、实际问题分别验收，依据影响范围优先核对高风险主张，并最小化对外披露。VLog 保留系统事件、执行尝试和独立验证的专业判据，Knowledge 只提供通用来源/质量标准；Doctor 仍为环境就绪诊断，Ontology 只处理真正的结构缺口。没有新增官方 Skill、通用质量模型或 Kernel 功能。

**独立评测入口与证据**：`tests/skills/knowledge-unified-evaluation.json` 增至 28 个静态选择/决策案例，其中 4 个为非 Knowledge 触发；`tests/skills/knowledge-quality-evidence-evaluation.json` 提供 4 对、8 条不含生产数据的证据正反案例；`tests/skills/knowledge-quality-contract.node-test.mjs` 验证独立材料及跨 Skill 边界。可选 `node tests/skills/evaluate-knowledge-quality.mjs selection|evidence <case-id>` 通过本机 Codex CLI 的独立模型、只读临时会话评估，模型只接收原始任务、真实 Skill 描述/内容和合成材料，不接收 `expected`；评分发生在输出后。实际 Codex CLI `gpt-6-astra` 运行了 3 条专业选择案例及 8 条证据/授权案例，修正两处评测资料本身的错误（漏掉项目关联、把已证实错误误设为证据不足）并对受影响场景重测后，**3/3 与 8/8 样例符合预期**；这不是宿主原生 Skill 自动选用或真实工具写入验收，也没有证明未来所有模型都会通过。Prod 仅执行只读验证：在固定 State 下有限 `LIMIT 1` 查询遗漏的 Decision 可由精确身份查询命中，不以有限命中推断全库缺失。还需真实 ChatGPT Plugin 安装/触发、MCP 工具路径、端到端权限与发布验收，Phase 保持 `in_progress`。

**2026-10-29 Ontology 索引与 Domain 增量**：根据本轮只读 Review，补充共享 Full-text / Managed Semantic Index 的 `targets` 范围调整与全局删除区别、缩小后单字段索引的 Property-local 回读位置、Managed Semantic 先 Top-K 再 `WHERE` 无法保证子集 Top-K、长文本不自动切块，以及 Domain 共享/删除不影响 Knowledge 的建模引导。第 4 个公开教学案例通过真实 KG OS/Lithograph 隔离 Runtime 创建、回读和查询，覆盖跨 Domain 关系、共享全文命中、收窄索引目标、删除索引及移除 Domain 后仍保留知识与关系；原三组示例回归也通过。定向 Go Skill/Index 合同测试与独立真实引擎索引/Domain 测试通过，Plugin 分发 Node 测试 **15/15 PASS**，Prettier、MarkdownLint、CSpell、gofmt、`git diff --check` 通过。统一 Ontology 静态评测扩展到 **45** 个场景（含 **8** 个非 Ontology 选择反例），结构检查通过；本机 Codex CLI 只读临时会话额外抽查 **4 条 Skill 选择与 3 条索引判断场景**，观察结果分别为 **4/4** 与 **3/3** 符合预期。抽查不代表其余静态案例通过，也不证明 ChatGPT 宿主原生 Skill 自动选用。未提交、推送、发布或升级私人 Plugin，Phase 仍为 `in_progress`。

### D116 · VLog 事件本体模型包与查询验证（2026-10-28）

- **设计与交付**：VLog Skill 独立保留，入口负责记录准入、事件身份、证据与更新；`references/ontology.md` 集中维护可选的六 Node、七 Relationship KG OS Definition YAML；`references/cypher.md` 维护有业务目的的六条参数化查询。源码 `tests/seed.cypher` 与 `tests/expected.json` 提供隔离真实模型、实例及查询验证，公开 Plugin 包不携带 `tests/`。按 [D116](../../design/decisions.md#d116-vlog-event-ontology-package) 与 [MCP VLog 设计](../../design/mcp.md#vlog-standards-authoring) 执行。
- **现有资料处理**：已存在的历史单 `VLogEntry` 模型与旧案例仍是可验证的历史参考，迁到 `internal/kernel/testdata/vlog/`，不作为当前可安装推荐模型；归并其它按需说明到 `SKILL.md` 与本体文档，不复制第二份完整 YAML。
- **Acceptance**：由 Go 合同测试直接解析入口及 `references/` 两份 Markdown 的 YAML/查询围栏；真实 KG OS/Lithograph 的隔离测试必须使用文档原始模型与 Cypher，核验全部 Definition 可创建及回读、业务关系、七组查询预期、扩展 Concept 不改变 Definition、唯一键拒绝、旧模型/其它世界不变。历史 VLog 七项场景和旧单节点模型回归仍须通过。分发测试确保只有三份 Markdown 发布，`tests/` 不泄漏；完成链接/格式/拼写/最终 diff 检查。
- **剩余门禁**：新 VLog 行为评测、真实 ChatGPT Skill 选用、完整 Phase/CI、Dev/Plugin 部署与正式发布，未获得实际证据前均标注未完成；没有本轮 Commit、Push 或发布授权。

**本轮已取得的本地证据**：`TestVLogSkillEventOntology` 在实际 Lithograph v0.3.3/Jieba 隔离库中从 `references/ontology.md` 提取并成功创建、回读 **13 份 Definition（6 Node + 7 Relationship）**，直接执行 `references/cypher.md` 的 **6 类参数化查询 / 7 组预期**，包括新增 `Concept` 类别不改 `Event` Definition、真实图关系、执行成功但复测失败、物理地点/时间窗口、来源定位、重复业务键约束拒绝与来源 Branch 不变；执行结果为 PASS。原 `TestVLogSkillRecords` 七个测试分组、原单 `VLogEntry` 兼容测试与当前 Skill 资源合同测试同样 PASS。公开分发生成器测试 **14/14 PASS**，确认运行时只携带 `SKILL.md`、`references/ontology.md`、`references/cypher.md`，不打包 `tests/`；Markdown、CSpell、Prettier 与 Go 格式检查通过。**12 个 VLog 行为评测场景仅已编写，尚未运行模型试验；真实客户端、远端 CI、发布与部署均未执行。**

### D117 · Ontology 本体工程方法论与当前 Skill 更名（2026-10-28）

- **内容**：由 `kgos-modeling-standards` 更名为 `kgos-ontology-standards`，仍合并原 Ontology 与 Branch 选型职责；`SKILL.md` 强制先判断能力问题、稳定概念、分类/实例、业务身份、真实图关系，优先用 Knowledge 增加业务类别、只在必要结构缺口下改变 Definition。三份按需参考为 `references/model-confirmation-template.md`、`references/ontology-methodology.md`、`references/modeling-examples.md`。不恢复旧独立 Branch Skill，也不使 VLog 六 Node 成为其它领域的通用固定本体。
- **外部依据**：方法论独立整理 Stanford Ontology Development 101、NeOn、W3C SKOS/PROV-O/OWL-Time、CIDOC CRM 和时间化参与设计模式；只提供可访问原始参考链接与 KG OS 原创归纳，不复制外部论文/教程。
- **验收**：`TestOntologyStandardsResourceContract` 核查 Skill 元数据、行为入口、三份参考、链接与四文件运行时资源；`TestOntologyStandardsPublishedExamples` 必须直接读取公开参考中的三组 YAML/Cypher，在隔离真实 KG OS/Lithograph 中创建、回读模型、查询、拒绝重复业务键并检验数据库不保证的语义反例。旧八类本体隔离案例继续独立验证；发布生成器检查新 Skill 名与四项资源准确齐全。新的 [统一 Ontology 行为评测](../../../tests/skills/ontology-unified-evaluation.json) 还需要真实模型试验，不能以评测数据文件存在代替通过。
- **交付边界**：当前改动是未提交本地工作树，不代表私人 Plugin 已安装、Dev/CI 已完成或发布版本已变化。详见 [D117](../../design/decisions.md#d117-ontology-methodology-and-skill-renaming)。

## 历史开发记录（原六规范与七 Skill 基线）

## 目标与当前状态

**状态：`in_progress`（2026-10-20）**。六项规范已有各自单项源码与验证记录；此前已创作 `kgos-maintenance-standards`，本轮按用户确认的设计完善 **`kgos-vlog-standards` 的一套可选 `VLogEntry` 推荐模型**，不创建统一官方 Ontology。Doctor 后续只按实际模型及可验证的运行证据判断。私人Plugin安装、ChatGPT原生触发、六规范整体验收与远端CI仍未完成；不将单Skill源码交付当作Phase `done`，不修改通用 `kgos` 或执行Phase 28退役。

目标：形成可按任务独立选择的知识管理规范体系，让外部 AI 按一致原则进行**本体建模、知识创作、知识检索与使用、知识世界组织与演进、持续维护、系统级 VLog 记录**。规范属于 AI-facing 指导，不新增 Kernel 数据模型、固定领域 Schema、Scheduler、权限或 MCP 业务 Tool。规范适用于用户明确授权的操作任务；规范存在不代表授权写入。

当前业务规则的唯一概述：[MCP 官方知识规范 Skill 体系](../../design/mcp.md#kgos-standards-skill-suite)；设计决定：[D106](../../design/decisions.md#d106-six-kgos-standards-skills)。与 [Doctor v1 / VLog D104](../../design/decisions.md#d104-kgos-doctor-v1-and-vlog) 和 [Phase 25](25-kgos-doctor.md) 协作，不将 Doctor 的只读诊断职责转交给规范 Skill。

**最终官方清单**遵循 [D107](../../design/decisions.md#d107-final-seven-official-skills)：本阶段六个规范 + Phase 25 的 `kgos-doctor` = **七个 Skill**，无其它官方目标。现有通用 `kgos` 是过渡资源；其操作指南覆盖核对、最终模板收敛与受控退役由 [Phase 28](28-official-skill-roster.md) 单独验收，本阶段不提前移除。

## 六个目标交付物

| 目标 Skill | 规范职责 | 独立适用场景 | 本轮已确认范围外 |
| --- | --- | --- | --- |
| `kgos-knowledge-standards` | 既有 Ontology 下的实例语义、证据、身份/关系、更新冲突及写入核实；不设主观长期价值门禁 | 保存信息、复用关联或修正当前任务的知识实例 | 模型粒度/结构设计、检索回答、全库维护及分支策略 |
| `kgos-ontology-standards` | Domain/Definition、Property、关系类型、Constraint/Index 的设计质量 | 新建/修改本体模型 | 业务知识真假与查询结果解释 |
| `kgos-retrieval-standards` | 按任务取证、实际模型驱动检索、候选确认、覆盖/停止、State/业务时间及可靠交付 | 查询、分析既有知识，或为已授权后续工作提供可靠上下文 | 模型/实例修改、索引修复、分支策略、全库维护及通用宿主路由 |
| `kgos-branch-standards` | 长期知识世界及实验路径的组织、起始State、版本记录、融合与安全生命周期 | 新建领域知识库、选择已有世界、派生实验、比较融合或停用引用 | 具体本体/实例内容、Instance部署、VLog正文、数据库版本算法 |
| `kgos-vlog-standards` | 系统记录准入、事件/执行语义、真实结果、跨世界证据、记录延续与必要披露 | 起草、评审、创建或补充重要系统事件/维护/决策记录 | 实体粒度/Schema、维护与调度执行、Branch准备、一般实例API |
| `kgos-maintenance-standards` | 知识世界质量范围、疑似/已确认/合理差异、处理选择、效果验证、维护连续性 | 整理知识库、质量巡检、有据修复与处理未决问题 | Doctor环境诊断、普通单对象编辑/模型/检索、Branch或VLog管理、Scheduler |

这些名字、分界与目标产物已确认；六个规范均已有源码，不等于已实际安装或按宿主自动选用。同一任务可以引用多个已发布规范，但不依赖宿主保证 Skill 之间自动触发、嵌套调用或路由。没有规范 Skill 的 AI 仍可以通过现有 MCP 与自描述文档使用基础能力。

## Feature / 后续实施顺序

| Feature | 工作内容 | 验收入口 |
| --- | --- | --- |
| **P27-00 共同职责与选择边界** | 检查实际官方 Plugin/Skill 安装形态、Skill 清单、宿主选择能力与现行 MCP；建立六种场景的独立选择与交叉规则，避免另建总规范/Router | A27-01、A27-08 |
| **P27-01 Knowledge 专项设计与创作** | 已创作六项实例质量规则、四份条件式参考和四组决策对照案例；定向测试及审核证据单独记录，不接管模型设计 | A27-02、A27-07 |
| **P27-02 Ontology 专项设计与创作** | 已创作核心规范、四份按需参考和八类案例；源码/定向验证/独立 Review 证据见下文，客户端正式安装不在本轮完成声明内 | A27-03、A27-07 |
| **P27-03 Retrieval 专项设计与创作** | 已创作六项检索/证据规则、四份按需参考与五组决策案例；真实查询、边界测试和独立模型证据单独记录 | A27-04、A27-07 |
| **P27-04 Branch 专项设计与创作** | 已创作世界划分/独立演进/完整继承/融合与生命周期的规范、四组决策案例及资源/隔离测试；选择与独立审核证据单独记录 | A27-05、A27-07 |
| **P27-05 VLog 专项设计与创作** | 已创作记录质量guidance、三组决策案例；本轮补充一个 `VLogEntry` 可选建模范例并进行实际模型验证。无统一官方Model要求；Doctor实际多模型只读识别仍待单独验收 | A27-06、A27-07 |
| **P27-06 Maintenance 专项设计与创作** | 已创作 M1–M6、四份条件式参考和三组正反决策案例；独立文本Review、真实引擎与模型选择各自记录，不代替全阶段客户端验收 | A27-06、A27-07 |
| **P27-07 集成与真实验收** | 按实际客户端约定集成六个独立 Skill，检查文档导航、版本与选用，覆盖相邻职责和缺失 Skill；与 Doctor 的只读规范消费边界核对 | A27-01–08 |

**顺序不是用户操作的强制加载顺序**。六个专项Skill可分别设计、验证并在获得实施权限后交付；本Phase只有全部Scope与自身验收满足时才能设为 `done`。本轮只修订P27-05的可选推荐模型与必要设计边界，保留其它Skill；不创建新Skill、占位目录、私人Plugin Release或Kernel级VLog模型。

## Acceptance（完整阶段门禁；单项实际证据见后文）

### A27-01 · 六个 Skill 的独立性与选择

- 保留六个独立名称和职责；实际 Skill 描述能让 AI 区分“定义模型、保存知识、检索使用、版本演进、持续维护、系统记录”，没有第七个大型 `kgos-standards` 依赖或必须先触发的 Router。
- 验证单一场景只需要对应规范即可使用；跨场景明确相关规范各自负责哪个决策，不含强制一次加载全部正文的规则。
- 客户端不能联动/发现某 Skill 时准确降级，不对无 Skill 的 MCP 施加新的前置认证或调用要求。

### A27-02 · Knowledge 规范

- 知识准入、事实与推断、上下文来源、现有对象复用、实例关系和更新/去重各有可理解的适用边界与真实/反例；不得预置特定领域实体或必需 Property。
- 若用户仅要求阅读信息，Knowledge 规范不将其误判为写入授权；实际知识一致性仍需从现有 Schema/Graph 证据核实。
- 既有 Ontology 是前提，不由本 Skill 重新设计知识粒度/组织、Definition、字段或索引。模型确有表达缺口时保留未决并说明；宿主另获建模授权时按对应职责解决，不增加永久禁令或新的强制审批节点。
- 案例以少量深入决策及相邻合法情况教学，不复制领域模型库；至少检验认识状态、同名/别名、关系事实、补充/纠错/变化/冲突、缺省与明确清空、结果未知及批次授权。独立行为判据在运行前固定，不以格式检查代替语义审核。

### A27-03 · Ontology 规范

- Domain、Node/Relationship Definition、Property、Constraint、Index 的设计质量属于本 Skill；给出复用与新增模型的选择示例，能够区分关系**模型**和关系**实例**。
- 不重写 [Ontology](../../design/ontology.md#使用模型) 的身份、结构、编译或数据库约束合同，不强制所有领域使用统一 Model。
- 包含本体质量标准、条件式建模决策、修改维护规则和逐类参考模型；案例同时说明正例、相邻反例、合理替代及语义不变量的真实执行层。YAML、示例查询与约束反例直接从交付文件提取并在隔离真实 Runtime 验证；概念正确性另经逐例审核，不以数据库通过代替语义审核。

### A27-04 · Retrieval 规范

- 覆盖结构化/全文/向量/混合查询的选择判断、跨查询 State 一致性、证据不足与冲突处理；实际结果必须归因于真实已授权查询，不把推断/旧缓存写成查到的事实。
- 不替代 [Graph](../../design/graph.md#graph) 的查询语言/API 合同，也不因需要更多证据而自动改变数据。
- 按问题区分精确定位、存在性、完整枚举、计数、探索与综合的充分性；正确处理null、分页/排名截断、失败、图路径与对象数量。数据库范围的否定不能直接外推现实不存在，充分的限定结论也不应无限拖延。
- 在实际模型和索引覆盖下选择查询，准确表达Managed Semantic后过滤及Provider边界；分开验证可控引擎协议/排序与真实模型相关性，不以本地fixture的确定向量证明生产召回质量。
- 案例以给定知识条件和相邻正确选择指导检索，不创建领域模型或强制固定查询流水线；独立模型评测先冻结判据，执行者只看原始问题和实际选择面，保留失败与未验证的宿主自动激活范围。

### A27-05 · Branch 规范

- 检查普通创建/更新分支、回看 State、Diff/History、Merge 等场景中的工作习惯与验证边界；误用 Branch Head、写入目标或 Commit 结果须可识别。
- 不将 `branch/vlog` 特殊化为底层版本引擎的一部分；不会在规范层改造 Lithograph/Evolution 合同。
- 支持长期领域知识世界与实验路径，分别判断用途和生命周期，不将所有Branch默认合并main或按空闲自动删除；Domain只组织模型，Branch不提供独立物理/认证隔离。
- 创建来源须真实有效且符合继承目标；完整快照继承、干净业务基线、裸Root与祖先历史不同。不得发明empty参数、按Domain分支复制或分支专属State Data。
- 区分只读参考、选择性知识引入和完整State Merge；祖先删除、语义兼容、Session写权限/固定输入/并发及回执未知须有正确反例和相邻合法情境。
- 区分停用、删除ref、Tag保留、备份和物理清除；现有接口缺少条件删除保护时不得虚构原子Head检查，已授权普通删除也不受无关审批阻碍。

### A27-06 · VLog 与 Maintenance 规范

- VLog 专项需有明确的高价值记录准入/质量和证据边界；Maintenance 专项需要自检、整理、复核、记录移交与长期执行建议，两者不能相互承担外部调度、写权限或隐藏 Agent 的职责。
- 能区分真实执行、计划执行、失败与结果未知；VLog 存在不等于维护任务仍活跃。未来关联 [Doctor v1](../../design/mcp.md#kgos-doctor-v1) 时只对可访问、可验证的规范/记录作只读评价。
- VLog按未来复核/原因/影响/经验判断记录价值；明确合法记录请求及已授权维护运行证据不被“通常无变化不记”否决。事件语义不强制Task/Run/Event/Result实体、状态枚举或记录模板。
- 准确区分同事件后续、另一执行/复发、旧错纠正与重复投递，保留结果归属；源活动成功、验证通过、VLog写入及回读各自取证，未知不转换成失败或成功。
- 源库/Branch/固定State/对象或外部证据与VLog目标State分开，定位值不产生跨快照边，不假设跨分支原子性或递归填写自身最终Commit；敏感资料的源读取权不自动授予目标披露权。
- VLog Skill 只提供一套单 `VLogEntry` 的可选推荐模型，目标实际Ontology仍为真源，不预置官方强制Node、字段或身份/状态枚举。对推荐模型本身执行真实Kernel的定义/实例/约束验证；Doctor对不同实际Model中近期运行的可识别性与证据充分性仍需单独验收，不能从教学模型推断全部可消费。
- Maintenance 不将只读审查误作写入授权，不以文本同名、相似分数、旧时间、缺边或单页零结果认定必须删除；按实际身份/语义与范围区分疑似、确认、合理差异。
- Maintenance 可选择无改动、保留不同来源、补充证据、有据纠正、审慎去重或报告模型缺口；具体模型由Ontology、实例由Knowledge、检索由Retrieval、版本由Branch负责，不增加维护专用Kernel/Agent/Schema。
- 验证按任务核对受影响Node/Relationship和前后State及无关内容，正确处理并发、取消/未知与多次调用的部分成功；无变化巡检可在真实覆盖范围完成，不强制按期调度或生成VLog。

### A27-07 · 规范质量、安全与独立迭代

- 逐个 Skill 复核其真实触发描述、职责边界、规范文本真源、适用/反例、必要资源及版本；未确认的细节不当作已有强制标准。
- 通用正确性规则遵循 KG OS 现行设计真源，不在六份文件重复发明多套公共 Schema、来源存储字段、认证/权限或版本算法。任何授权/修改仍由用户任务、客户端宿主及 MCP 服务端控制。
- 每个 Skill 能独立审核修订且不无意更改其他五个的合同；缺少某一个不导致其它规范整体失效。

### A27-08 · 实际安装、触发与回归

- 真实目标宿主中检查六个 Skill 的可见性、选择与冲突、已配置 MCP 与无 Skill 基础访问、只读与授权写入行为。宿主不支持的自动选择/联动必须如实报告，不能靠模拟对话宣称用户客户端验收。
- 如实施涉及 Plugin 文件/代码，按仓库现行质量门禁执行相关格式、规范、独立案例及真实受控环境验收；最终 diff/Review/版本/安装文档同步且实际证据满足时才可标记 `done`。Commit、Push、Plugin 更新、Dev 部署、Release 各自需要相应授权。

## 待后续专项讨论与当前限制

六项规范的内容、版本与条件式资源布局由各Skill源码表达；VLog仅保留可选推荐模型，**不再将固定官方VLog Model作为待实现项**。Doctor对实际模型的只读识别、记录可获取性/保留证据、Doctor实现及宿主安装/加载策略仍待对应工作；不由示例提前冻结这些保证。

**实际状态**：六个质量规范已有单项源码及各自检查记录；VLog的单一可选参考模型已完成源码与定向验证（见 [VLog v1.1.0](#p27-05-vlog-model-v11)），整包安装与真实客户端验收尚未完成，Phase保持 `in_progress`。Phase25 Doctor只能依据实际可获取的模型和证据判断；Phase26 Web-first初始化是平行工作，不被本Phase改写。

<a id="p27-06-maintenance-evidence"></a>

## P27-06 Maintenance 规范创作与审核证据（2026-10-20）

### 交付内容与唯一职责

原 `kgos-maintenance-standards`（已合并） 版本 `1.0.0`，类型 `guidance`。运行时包为 **8 个 Markdown 文件**：入口、范围/覆盖、质量判断、处理选择、验证/连续性四份条件式专业参考和三组决策案例。三组 **21 个场景（I1–I6、C1–C7、S1–S8）** 及其相邻合法情况分别检验身份重复、来源证据、冲突/时效、缺边、范围、授权、并发及失败恢复；不是预置领域Model、固定评分或自动维护计划。

维护规范负责检查范围、候选确认、处理方向与维护效果，而不替代普通实例编辑（Knowledge）、模型/约束设计（Ontology）、具体查询策略（Retrieval）、长期知识世界版本管理（Branch）、维护事件正文（VLog）或用户环境只读诊断（Doctor）。未新增 Kernel API、系统字段、Scheduler、Agent、持久Issue队列或额外必填流程。

### 创作规范与独立Review

读取当日实际 `prompt-authoring-spec`、`skill-authoring-spec` 及必要参考，并对照 KG OS `mcp.md` 职责真源、Object/Graph/Evolution合同与前五个规范的真实选择描述。独立只读评审检查全部8份模型可见文件、21个案例和各资源路由，结论为文本合同和职责范围内未见必须修正的问题；不把文本Review当作实际AI行为或执行保证。

独立评测标准及其修订后的职责判据保存在 [49个原始任务与判据](../../../tests/skills/maintenance-standards-evaluation.json)。区分**多对象/知识世界质量治理**与目标和修复方式已知的单对象纠错（Knowledge）、纯查询统计（Retrieval）、单次Object Patch协议恢复（公共能力）。初次目录试验有一例把单对象旧baseState误判为Maintenance正例；发现后保留原始证据，更正判据并增加真正的批量维护并发案例。最终49题行为试验最初出现9个选择不符；另一轮独立盲审只读原始任务、兄弟Skill与设计合同，裁决其中8项是评测预期越界、1项为真实Maintenance触发遗漏。按此修订，**该轮49题中48题满足修订后的职责判据**，保留此前失败证据。

针对遗漏的“修复已知关系之外又提出清理其它对象”，在入口Description明确**额外范围治理**的触发条件，同时限制一般知识讨论、已知单对象纠错、Doctor/调度/VLog等误触发。对照试验的结论并不完全稳定，因此不宣称措辞的普遍因果收益；最终 **16题独立目录选择复测全部符合已核实的边界判据（16/16）**，覆盖该遗漏、相邻合法场景与无关请求。期间两次17题目录重试只返回空results，未当作通过；后续16题确有逐题输出。不能将以前的48/49或局部16/16冒充修改后的全49题已再次完整运行。

最终选择复测基于真实可用的七个本地Skill目录（含过渡通用`kgos`）、Codex CLI `0.159.2` 报告的 `gpt-6.1-sol`，只读合成任务，不含业务MCP。模型仅凭目录名称/Description作选择，较早49题随后按需读取被选Skill资源并分别回答；回复已逐项核对，无真实数据库时明确未执行。选择试验、实际Kernel行为、ChatGPT原生自动激活分别评价，不以一项替代另一项。

### 真实隔离 Kernel/Lithograph 测试

原 `TestMaintenanceSkillResourceContract`（已退役；现由 [统一 Knowledge 合同测试](../../../internal/kernel/knowledge_skill_contract_test.go) 验证测试资料） 使用真实YAML解析器核对姓名/Description/版本与包内八文件全部可达，避免悬空路由。[引擎集成测试](../../../internal/kernel/maintenance_skill_integration_test.go) 在 `t.TempDir()` 的隔离KG OS真实Runtime及Lithograph上运行 **九组**、与其它库完全独立的预设测试模型：

| 组 | 已验证的真实底层行为 |
| --- | --- |
| 同名但不同业务键 | 多个同名节点仍分别保存，不将文本同名交给数据库作自动合并 |
| 同身份候选的独立来源 | 两个疑似同键节点仍可分别关联不同来源/期间，简单删其一不能被视作信息无损 |
| 局部纠正与历史 | 修改一个值后其它实例、来源边不变，旧State仍可回读原值 |
| 错误边的处理边界 | 仅修正人物说明仍保留错误关系，不能把写入成功当关系修复 |
| 并发保护 | 旧baseState被拒，读取新State后保留其它Agent补充再修正目标 |
| 整批拒绝 | 同一Object Patch含合法修改和必填字段缺失对象时原子拒绝，Head与原对象不变 |
| 无变化检查 | 无变化Patch不产生新Commit，允许有界零修改结果 |
| 版本固定 | 旧State查询仍看到原集合，新Branch Head只影响新的Snapshot |
| 可选关系缺失 | Node可存在而没有某种Relationship；缺边不能直接证明语义错误 |

底层测试只证明当前已有能力对这些明确样例的存取、拒绝与版本行为，**不证明**模型能自动识别人物身份、现实事实真伪或任意维护任务已完成。每个测试还核对无关Branch Head未动、模型Definition未被日常维护改写。调试后对任务自有测试中的关系类型用全词 `MAINTENANCE_TEST_LINK`，并纠正评测ID拼写，不改实际语义或Kernel逻辑。

主机为Yi Mac darwin-arm64、Go `1.27.2`、Lithograph及OpenAI-compatible Provider `v0.3.3`、已有Jieba本地产物；通过哈希核对复制三份Native扩展到专用临时目录，避免并行构建影响原文件。已通过源码资源测试、`go vet`、普通sqlite标签`staticcheck`、相关 `TestKnowledgeSkillInstances` 及 Phase04 Object/Knowledge 既有回归，并以 `-race` 验证Maintenance九组案例。检查范围分别由实际命令输出支持；没有修改或访问用户长期知识库。

### 仍待整包验收的项目

本轮是未提交工作树的单项交付，不等于六规范在ChatGPT中的原生安装与自动选择、Docker/Dev、GitHub CI、VLog官方Model或Doctor的完整集成已验收。通用 `kgos` 过渡Skill及前五规范均保留；Phase27仍 `in_progress`，Phase28未进入退役实施。Commit、Push、Plugin安装/发布和部署均未执行，也不能用合成案例和本地定向测试代替远端真实客户端证据。

<a id="p27-05-vlog-evidence"></a>

## P27-05 VLog 质量规范创作与审核证据（2026-10-20）

### 实际产物与职责

[VLog Skill](../../../plugins/kgos/skills/kgos-vlog-standards/SKILL.md) 版本 `1.0.0`，guidance 类型。运行时包为 **8 个 Markdown 文件**：入口、准入/事件、执行证据、跨世界追溯、演进/披露四份参考，以及三组决策案例。V1–V6负责记录质量，不执行维护/调度、不自动创建Branch、不设计固定Task/Run/Event/Result实体，也不复制通用SDK手册。

三组案例共 **16 个情境及相邻条件**：A1–A5记录准入，E1–E5执行与结果，P1–P6跨世界与延续。其中三个JSON直接展示既定教学模型的实例目标，不是官方VLog Schema、已存在业务数据或工具调用参数。本轮完成这份质量Skill，**没有冻结官方Model、保留策略或Doctor结构化消费合同**，P27-05相关后续子项仍保留。

### Review与模型行为

实际核对当前本地 `prompt-authoring-spec`、`skill-authoring-spec` 及其引用，以现行Object/Graph/Evolution/MCP设计为技术依据。两轮独立只读Review完整读取入口、全部参考和三组案例；第二轮另检查新增测试的证据范围。正文和职责检查未发现剩余必改问题，不以文字审查证明实际行为或未来所有输入无误。

重点补齐的使用边界包括：明确授权的无变化巡检应保留真实运行证据；同任务多次Run不能被摘要去重；操作回执、效果验证、VLog写入和回读分别报告；引用外部State不会产生跨快照图边；记录自身最终Commit不形成无限补写；旧记录更正日期不冒充新的执行时间。

[独立模型任务与预设判据](../../../tests/skills/vlog-standards-evaluation.json) 在执行前冻结，共 **42个原始任务**。先在13个相邻选择场景比较完整与精简description，两者均满足预设，保留较短描述；仅报告这一组观察，不宣称精简普遍提升选择率。随后资源测试发现精简描述中的冒号需YAML引号，已修正编码，独立核对语义/正文未改变，并重新执行最终42题及资源/Native测试，未以先前快照代替复验。

最终目录试验使用真实六个已存在Skill的name/description；执行者只见原始任务、目录与可按需读取的包，不见判据或作者结论。**36个VLog适用任务、6个相邻/无关任务**选择符合预设，逐项核对回答，未发现必须修正的结果。可合理共用Knowledge/Branch，不依赖强制自动转交。实际为Codex CLI `0.159.2`、其报告模型 `gpt-6.1-sol`、只读临时目录，无业务MCP；批量手工选择试验不是ChatGPT原生安装/自动激活、真实用户库执行或跨模型稳定性保证。

### 实际Kernel/Lithograph验证

[资源合同测试](../../../internal/kernel/vlog_skill_contract_test.go) 验证合法YAML metadata、版本、八文件包内可达及三个交付JSON的公共Object解析。[记录集成测试](../../../internal/kernel/vlog_skill_integration_test.go) 直接读取这些实例，使用临时独立库及预先建立的测试模型，最终带 `-race` 的七组测试全部通过：

| 测试组 | 实际核对 |
| --- | --- |
| 不同尝试与后续验证 | 同事件两次Run分别落库；更新第二条后第一条不变，旧State仍读原第二条；三个JSON逐项回读 |
| 来源/记录State分离 | 错用源State作VLog基线被拒；保存真实来源定位；源后续前进不改变原证据State，源对象不被自动导入VLog |
| 源成功而记录失败 | 缺必填内容导致记录拒绝，VLog Head/内容不变；来源已完成操作仍保留，不回滚或重复 |
| 跨快照端点 | 来源独有Ref不能作VLog边端点；返回 `OBJECT_NOT_FOUND`，包含新记录的整批无部分写入 |
| 并发记录补充 | 旧基线被拒；重新读取后只改授权内容，保留另一个观察者的新证据和旧历史 |
| 重复投递与不同执行 | 同记录无变化Patch不产生新State，重复键被拒；同摘要不同Run可并存；结构可接受缺真实依据的过强结论，不能冒充事实验证 |
| 丢弃记录回执后核查 | 一次真实保存后忽略返回值，再按已知记录键读取唯一结果及内容；不重复执行源操作，不把该模拟当实际网络故障注入 |

各测试结束还核对VLog模型不变、main不变；实际业务数据仅存在临时库，不触碰用户长期知识。源Instance属性是测试中的明确定位值，不意味着SDK提供全局数据库身份服务；测试模型只是给定前提，不是官方Schema。初次负例fixture误将请求alias送入canonical renderer，已改用真实输入Patch YAML并强化错误类别断言，没有修改Kernel或降低拒绝标准。

`go vet`、普通sqlite_fts5的`staticcheck`、资源测试及上表Native测试通过；另复跑既有 Knowledge批量创建/关系替换、混合模型/知识原子性两个回归，均带 `-race` 通过。

```sh
go test -tags=sqlite_fts5 -count=1 -run '^TestVLogSkillResourceContract$' ./internal/kernel
go vet -tags=sqlite_fts5,lithograph_smoke ./internal/kernel
go tool staticcheck -tags=sqlite_fts5 ./internal/kernel
go test -race -tags=sqlite_fts5,lithograph_smoke -count=1 \
  -run '^(TestVLogSkill|TestPhase04KnowledgeBatchCreateReadAndRelationshipReplacement|TestPhase04MixedOntologyKnowledgeBatchReadSafetyAndAtomicity)' \
  -v ./internal/kernel
```

环境为Yi Mac darwin-arm64、Go `1.27.2`、真实Lithograph/Provider `v0.3.3`与已有Jieba；启用CGO，用 `KGOS_LITHOGRAPH_LIBRARY`、`KGOS_LITHOGRAPH_PROVIDER_LIBRARY`、`KGOS_JIEBA_LIBRARY`指定实际fixture。一次并行构建期间共享Jieba文件短暂消失，测试据实失败而非skip；文件重新出现后复制到本轮临时目录并校验SHA-256，再完成全部复验，未重建/改写共享环境。最终文档质量检查使用已有Node `24.15.0`和仓库本地质量工具，不修改全局工具配置。

当前证据属于未提交工作树；格式、Markdown、拼写、资源链接和最终diff另行核对。未执行完整 `pnpm validate`、新的远端CI、Docker交付、私人Plugin安装或ChatGPT原生触发；未Commit、Push、Deploy或Release。此前四个规范及通用Skill保留，Phase27仍为 `in_progress`，Phase28不提前退役。

<a id="p27-05-vlog-model-v11"></a>

### P27-05 后续优化：VLog Skill v1.1.0 可选推荐模型（2026-10-21）

**用户明确调整**：不为KG OS预置统一的VLog本体论，取消官方固定Model的前置条件；只在 `kgos-vlog-standards` 内提供**一套**按需引用的 [`VLogEntry` 历史建模参考](../../../internal/kernel/testdata/vlog/legacy-vlogentry.md)。这是Skill指导材料，不能当成目标知识库自动安装的Schema；实际 `branch/vlog` 模型足够时直接复用，缺模型时需先有建模授权。此决定和Doctor按实际Ontology/证据读取的职责，已同步 [MCP设计](../../design/mcp.md#vlog-standards-authoring)、[D104后续澄清](../../design/decisions.md#d104-kgos-doctor-v1-and-vlog) 与 [Phase25](25-kgos-doctor.md)；不新增 `plugins/kgos/ontologies/vlog.yaml`、`kgos_docs`公共Schema、Kernel、Scheduler或其它Skill。

**实际Skill**：版本从 `1.0.0` 调整为 `1.1.0`；新增一份可条件读取的 `model-examples.md`，运行时包变为**9份Markdown**。唯一推荐方案是一个Node Definition、18个Property、3个必填（`entryKey`、`kind`、`summary`），仅该示例内 `entryKey` 唯一；另外15项可选，0个Relationship Definition、无新增独立Index、无强制状态枚举。时间、任务/Run身份、执行与验证状态、证据及来源State的区分只在有实际依据时填写； `provenance` 为文本，不假装Doctor能对任意来源State进行结构化过滤。V1–V6正文及原有16例保留，之前的 `ExampleVLog` 测试案例仍是不同的教学前提，不冒充第二套推荐模型。

**真实验证**：[资源合同测试](../../../internal/kernel/vlog_skill_contract_test.go) 已从交付Markdown提取并通过KG OS公共Ontology YAML解析，核对18项字段/类型、仅3项必填、唯一键、版本与全部9份资源可达。[真实隔离模型测试](../../../internal/kernel/vlog_skill_model_integration_test.go) 使用临时KG OS实例、真实Lithograph `v0.3.3` 及原有Jieba/Provider，确认仅导入推荐模型时才出现Definition、创建和回读模型、简单决定与同任务不同Run并存、执行成功与验证失败可同时保存、可选字段缺失、重复entryKey/必填缺失被拒、旧State保留、无关模型/Branch不变，三个 `ZONED DATETIME` 值经Cypher写入和逐项等值比较通过。实际模型验证不证明AI自动辨识真实事件含义，也不证明任意Schema下Doctor可精确消费。

初轮独立只读Review检查9份模型可见文件、两套创作规范、项目技术合同及五个兄弟Skill，**未发现Skill文字/职责的必改问题**；发现集成测试只断言时间非空，已改为分别比较三个时间字段与写入的预期值。修改后再执行目标测试，最终结合既有VLog七组记录测试与Phase04两个回归执行 `-race`，**全部通过**；`go vet`、`staticcheck`、格式/Markdown/拼写检查通过。

独立模型行为原始任务及判据见 [VLog单模型评测](../../../tests/skills/vlog-model-evaluation.json)。初批15个原始任务回答在原始判据下为14/15，其中一项过度要求模型对“STRING枚举是否自动强制”主动讨论未被请求的模型修改审批。经独立核对，修订该条判据为用户实际提出的问题，并新增单独的“只读评审却要求创建数据库enum约束”任务：原15个回答满足修订判据，新增任务也正确拒绝未经授权的本体修改，并未发明KG OS不存在的enum保证；不将这一过程谎报为修改后重新批量运行了16题。实际环境为Codex CLI `0.159.2`、报告模型 `gpt-6.1-sol`、只读临时快照，不等于ChatGPT原生Skill选择或真实用户库执行。

**尚未执行**：完整Phase27安装/真实ChatGPT触发、Docker/Dev、最终远端CI、Git提交与推送、Plugin发布、Doctor实现及多模型读取验收。因此本轮只关闭VLog参考内容的单项工作，不将Phase27或Phase25标记为 `done`。本段是 `v1.0.0` 原始创作证据的后续增量，不追溯改写原有版本当时的状态。

<a id="p27-04-branch-evidence"></a>

## P27-04 Branch 创作与审核证据（2026-10-20）

### 产物与职责收敛

原 `kgos-branch-standards`（历史独立 Skill）版本 `1.0.0`，guidance 类型。运行时 **9 个 Markdown 文件**：入口、世界边界/起点定位/版本记录/融合生命周期四份专业参考、四组决策案例。B1–B6 指导世界组织和演进，不预定小说/学习/VLog本体，不编辑普通事实，不部署Instance，不创建Branch元数据或新的版本API。Architecture/Evolution仅澄清多个长期知识世界的使用方式并指向[MCP职责真源](../../design/mcp.md#branch-standards-authoring)，底层接口未修改。

四组案例共 **19 个情境及相邻合法选择**：W1–W4世界组织、O1–O4继承起点、F1–F5融合、L1–L6版本生命周期。名称与S0/S1为教学条件，不是待执行请求或预置Branch清单；独立模型、领域实例的内容仍由相应规范负责。包中没有脚本、模板数据、Skill自动路由前置或无用途资源。

### Review、优化与模型行为

实际读取当前 `prompt-authoring-spec`、`skill-authoring-spec` 及其引用，核对必要性、职责、可执行条件、权限和资源路径。两轮独立只读模型审核完整九文件、逐组案例、项目合同和相邻Skill；第二轮另核对测试及真实BranchDelete请求/实现。审查范围内未发现剩余必改Skill问题，不以文字自洽保证所有未来输入正确。

作者补强了条件删除边界：当前Branch Delete没有expectedHead，预读不能提供原子条件保证；授权仅限某Head且并发不可排除时保留未决，不虚构锁/参数。相邻的普通授权按名称删除仍合法，不增加普遍审批阻碍。第二轮审核指出旧测试仅查valid不足以证明空基线，随后补上完整Ontology总项/游标、全图节点和关系为零的实际断言，重跑通过；没有降低验收或修改Kernel来配合案例。

[独立任务与冻结判据](../../../tests/skills/branch-standards-evaluation.json) 包含 **39 个原始任务**，执行前确定标准；执行者只看实际目录name/description、用户任务及所选Skill，不看判据。先在相同11个相邻场景对完整/精简description各进行一次独立目录试验，两者均满足选择边界，保留较短描述；这仅证明该组观察，不声称短句普遍改善模型。

最终包再执行全部39个任务：**35个Branch适用请求、4个相邻/无关请求**的选择满足预设，回答逐条核对未发现必改偏差；覆盖无“Branch”字样的长期领域库、同世界多主题、干净基线、共享sidecar、选择性引入/整体Merge、删除传播、只读Session、固定输入、条件删除、数据指令及宿主继续执行。实际为 Codex CLI `0.159.2`、报告模型 `gpt-6.1-sol`、只读临时目录和真实五Skill目录；没有业务MCP，也不是ChatGPT原生自动触发/安装或跨模型稳定性验收。最终Skill哈希与独立审核/行为执行快照核对一致。

### 实际Evolution/Kernel验证

当时的 `branch_skill_contract_test.go` 检查 metadata、版本和全部九个资源的包内可达性（现在由 [Ontology 资源合同测试](../../../internal/kernel/ontology_standards_contract_test.go) 替代）；它不声称证明模型行为。[隔离集成测试](../../../internal/kernel/branch_skill_integration_test.go) 使用真实Kernel/Lithograph，在临时独立库验证七组行为，最终带 `-race` 全部通过：

| 测试组 | 实际核对 |
| --- | --- |
| 长期世界与完整继承 | 小说、学习、vlog从同一实际State分别建立；各自模型/数据独立推进；实验继承完整模型和知识，源后续变化不自动下传；同名创建不覆盖Head |
| 有效且干净的起点 | 初始KG OS-valid状态具有完整空Ontology、零节点/关系；裸bootstrap前Root被拒绝且不留下Branch；合法起点被接受 |
| 共享State Data | 同一Commit的各Branch看到同一sidecar变化，Head不动；独有新Commit的注释不改变原注释，Snapshot Diff仍为空 |
| 完整世界融合 | 综合Branch合并两套模型与数据，产生two-parent State；start不移动Head，两个来源及main保持原位 |
| 删除传播 | 共同祖先A/B、来源删A、目标加C，无冲突Merge得到B/C而不是A/B/C；旧State仍保留原内容 |
| 快进、Message与保留 | fast-forward复用来源Commit及Message；删除Branch仍可经Tag读取；普通写入不移动Tag，显式move可移动 |
| 固定输入与目标并发 | 来源前进不改变Session source；目标Head前进导致finalize拒绝，不覆盖现态；按当前revision中止对应Session不移动Head |

另复跑既有 State Data/引用/固定Ancestry、Merge冲突/分页解决/恢复、快进/up-to-date/abort 回归，均通过。测试仅用临时库；没有向长期Dev或用户知识库写入，也没有验证物理擦除、备份恢复或提供Branch权限隔离。合成模型仅属于测试准备，不进入Skill运行时指令。

```sh
go test -tags=sqlite_fts5 -count=1 -run '^TestBranchSkillResourceContract$' ./internal/kernel
go vet -tags=sqlite_fts5,lithograph_smoke ./internal/kernel
go tool staticcheck -tags=sqlite_fts5 ./internal/kernel
go test -race -tags=sqlite_fts5,lithograph_smoke -count=1 \
  -run '^(TestBranchSkill|TestPhase06EvolutionStateDataRefsAndPinnedAncestry|TestPhase07EvolutionMergeConflictResolveFinalizeAndRecovery|TestPhase07EvolutionMergeFastForwardUpToDateAndAbort)' \
  -v ./internal/kernel
```

实际环境为Yi Mac darwin-arm64、Go `1.27.2`、Lithograph/Provider `v0.3.3`及已有Jieba fixture；启用CGO并通过现行 `KGOS_LITHOGRAPH_LIBRARY`、`KGOS_LITHOGRAPH_PROVIDER_LIBRARY`、`KGOS_JIEBA_LIBRARY` 指定真实文件。缺fixture即失败，非skip通过。`staticcheck`范围是普通sqlite_fts5，不误报为全Native静态检查。

本轮证据对应未提交工作树。未执行完整 `pnpm validate`、远端CI、Docker交付验收、私人Plugin安装/更新或ChatGPT原生触发；未Commit、Push、Deploy或Release。此前三个规范、通用Skill和安装文件保留，Phase27仍为 `in_progress`，Phase28退役未实施。

<a id="p27-03-retrieval-evidence"></a>

## P27-03 Retrieval 创作与审核证据（2026-10-20）

### 产物与独立职责

原 `kgos-retrieval-standards`（已合并） 版本 `1.0.0`，guidance 类型。包内 **10 个 Markdown 文件**：入口、策略/覆盖/State时间/证据交付四份按需参考、五组深入决策案例。R1–R6 指导任务内检索与证据使用，不设计模型或数据粒度，不负责知识修复、索引维护、分支策略、全库巡检或 VLog；没有运行脚本、额外依赖、独立 Agent 或强制输出报告。

案例合计 **20 个情境及相邻合法条件**，并有 **17 条只读 Cypher 与明确预期列/行**。它们描述给定模型和合成数据，不是要在用户库创建的模板。代码及正文分别检查，数据库语法成功不替代语义合理性的审核。

| 案例组 | 情境 / 可执行查询 | 关键判断 |
| --- | --- | --- |
| 身份与关系上下文 | I1–I3 / 4 | 同名实体、事件与对象计数、直边与两跳路径 |
| 完整性与否定结论 | C1–C4 / 6 | 分页/数量/存在性各自的停止条件、null、限定范围的否定 |
| 检索与排名 | S1–S4 / 4 | 真实全文、Managed Semantic后过滤、缺source、不跨分数解释可信度 |
| 版本与业务时间 | T1–T4 / 2 | 固定State、合法历史比较、未来生效、跨库身份及外部当前事实 |
| 证据综合 | E1–E5 / 1 | 按项目归属实施证据、历史动机与推断、转引/冲突、权限和后续工作 |

### Review 与独立模型试验

按本地 `prompt-authoring-spec`、`skill-authoring-spec` 及相应参考审核职责、必要性、权限、条件执行、渐进加载和实际证据。独立只读模型完成两轮全文及逐组案例审查；第二轮同时检查新增测试、正常/相邻范围以及精简description的书面对照。保留“grounding work”以明确非问答宿主任务的知识准备范围；此文字对照不声称证明实际模型选择的因果改善。

作者自检进一步明确：用户要求从库核实时，已有摘要不能成为跳过真实读取的理由；同任务同State材料已充分、一般概念解释、明确不查库仍不强迫检索。修订后的独立审核未发现检查范围内剩余必改问题，不承诺所有未来输入无误。

[34 个原始任务与冻结判据](../../../tests/skills/retrieval-standards-evaluation.json) 在运行前确定。执行者只拿实际四个 Skill 的name/description目录、原始任务及相应Skill文件，没有评分判据或作者结论；先选择再按需读取。实际选择与预设相符：**30 个 Retrieval 适用任务、4 个相邻/无关任务不选 Retrieval**；逐项核对回答的证据、覆盖、时间及权限判断，未发现必改偏差。两个测试标识随后仅作拼写规范化，原始问题、判据和原始执行结果保留未改，比较使用明确的标识映射。

实际执行为 Codex CLI `0.159.2`、其返回的 `gpt-6.1-sol`、只读临时目录，无真实业务 MCP。启动时可选模型目录刷新曾超时，但本次执行实际结束且完整返回34个结果；不把目录刷新失败隐去，也不把它混同为任务执行失败。该批量手工目录试验不是 ChatGPT 原生安装/自动激活、真实工具调用或跨模型稳定性保证；源文件哈希核对确保交付包与末次审核和行为试验快照一致。

### 真实查询与边界验证

原 `TestRetrievalSkillResourceContract`（已退役；现由 [统一 Knowledge 合同测试](../../../internal/kernel/knowledge_skill_contract_test.go) 验证 17 条查询资料） 在普通Go测试中检查metadata、版本、10个资源可达性和17组查询/预期JSON的完整配对。[实际检索测试](../../../internal/kernel/retrieval_skill_integration_test.go) 直接读取这些已交付查询文本，在独立临时Kernel/Lithograph库执行，逐项比较返回State、columns、rows；**17条全部通过**，读取不移动测试Head。

额外六组检查也通过：结构化/全文不调用embedding；缺索引返回错误而不是空成功；真实Provider路径收到可控HTTP失败后返回错误；只读查询拒绝写语句且不升级权限；消费者中断后没有成功summary；分支前进后旧State仍读旧值、明确新State读新值。另复跑既有Graph快照/分支回归和Provider等待取消回归，均通过。

使用真实 Lithograph/Provider `v0.3.3`、已有Jieba、Go `1.27.2`、Yi Mac darwin-arm64。语义查询通过真实Provider扩展访问本地 HTTP 测试服务，以确定向量验证协议、候选排序与过滤；**没有访问生产embedding服务，不证明真实模型相关性、召回率或生产可用性**。建索引、数据准备及有意推进State仅在测试fixture中进行，不是Skill给予的写权限，未接触用户长期数据。

```sh
go test -tags=sqlite_fts5 -count=1 -run '^TestRetrievalSkillResourceContract$' ./internal/kernel
go vet -tags=sqlite_fts5,lithograph_smoke ./internal/kernel
go tool staticcheck -tags=sqlite_fts5 ./internal/kernel
go test -race -tags=sqlite_fts5,lithograph_smoke -count=1 \
  -run '^(TestRetrievalSkill|TestPhase05GraphSemanticProviderWaitCancellation|TestPhase05GraphSnapshotBranchMetadataAndValues)' \
  -v ./internal/kernel
```

以上命令实际通过；Native测试使用CGO和已有 `KGOS_LITHOGRAPH_LIBRARY`、`KGOS_LITHOGRAPH_PROVIDER_LIBRARY`、`KGOS_JIEBA_LIBRARY`，缺fixture即失败，不以skip算通过。`staticcheck`范围为普通 `sqlite_fts5`，不误报为全Native静态检查。案例内容的正确性由另行文本/行为审核支撑，不从固定向量fixture推出世界事实。

当前证据属于未提交工作树。未执行本阶段完整 `pnpm validate`、远端CI、Docker交付验收、私人Plugin更新或ChatGPT原生触发；没有Commit、Push、Deploy或Release。Ontology、Knowledge和通用Skill保持原有内容，Phase27仍为 `in_progress`，Phase28未开始退役。

<a id="p27-01-knowledge-evidence"></a>

## P27-01 Knowledge 创作与审核证据（2026-10-20）

### 交付与职责

[Knowledge Skill 入口](../../../plugins/kgos/skills/kgos-knowledge-standards/SKILL.md) 版本为 `1.0.0`，guidance 类型。运行时包为 **9 个 Markdown 文件**：入口、语义证据/身份关系/更新冲突/写入核实四份参考、四组决策案例。没有执行脚本、独立 Agent、全库治理、领域 Schema 模板或依赖其它 Skill 的强制加载。

六项 K1–K6 约束当前实例任务。资料准入不设置主观长期价值评分；模型粒度和字段设计仍归 Ontology。四组案例分别含 E1–E3、I1–I4、U1–U5、W1–W5，共 **17 个决策情境及相邻条件**，不是 17 套本体；其中五段实例 JSON 是按既定模型描述的目标值，不是 SDK 请求或真实用户数据。

### 审核、修正与模型试验

按当前本地 `prompt-authoring-spec`、`skill-authoring-spec` 及其引用，检查职责归属、选择描述、条件式资源加载、权限、数据与指令分离、规则可执行性和证据边界。独立只读 Review 逐份检查全部九个运行文件、四组案例及 KG OS 合同；第二轮另检查新增测试，不把测试 fixture 当运行时 Skill 指令。

首轮 Review 发现敏感内容条款过于绝对：已收窄为不得从普通整理任务推断保存凭证的授权；明确专门请求仍按实际宿主规则、访问控制和授权处理，不自建普遍禁令。首次独立行为试验还发现 AI 为保留纠错依据，建议向原本要求保留不变的 notes 追加内容；已明确“保留依据不授权改变无关字段”，没有合适且获准的位置时在任务结果说明，而非改造备注或自动写 VLog。

[独立任务与预设判据](../../../tests/skills/knowledge-standards-evaluation.json) 在执行前冻结，包含 **25 个场景**：22 个适用场景和纯查询、纯建模、全库维护三个不适用场景。执行模型仅获得原始任务与 Skill 文件，没有作者判据。实际环境为 Codex CLI `0.159.2`、其报告模型 `gpt-6.1-sol`、只读隔离目录，无真实业务 MCP；修订后按相同任务重跑，25 项范围判断与预设一致，逐条检查其内容后未发现剩余必改结果。纠错场景明确仅改 currentVersion，不向 notes 追加日志。

第二轮完整 Review 未发现当前检查范围内剩余必改问题。模型试验是批量、手工提供 Skill 的适用性与决策试验，**不是 ChatGPT 原生自动选择/安装验收、真实工具执行，或跨模型稳定性保证**。未把一个通过的模型回答当作所有未来输入正确的证明。

### 实际测试

[资源合同测试](../../../internal/kernel/knowledge_skill_contract_test.go) 在普通 Go 测试中验证元数据、版本、九个资源的包内可达性和五段实例 JSON 的真实公共模型解析。[实例集成测试](../../../internal/kernel/knowledge_skill_integration_test.go) 直接读取案例 JSON，用临时独立 Kernel/Lithograph 库验证以下七组情况，带 `-race` 全部通过：

| 实际测试 | 结果与边界 |
| --- | --- |
| 认识状态与用户陈述 | 两段教学实例成功写入及完整回读；也证明结构允许错误的确定性，不能靠数据库识别事实失真 |
| 身份范围及并发更新 | A/P1 正确更新，A/P2 与 B/P1 不误改；过期 Patch 被拒绝，重读后只改 name 并保留并发 email |
| 关系事件和端点修正 | 相同事件无变化不创建新 State；不同事件 M1/M2 保留；端点替换后使用真实 transition 核对关系与属性 |
| 当前值更新与历史 | A1 更新到2.0，notes 不变；旧 State 仍可读旧值，不把它当作业务历史的独立证明 |
| 归属明确的冲突 | 两条有来源的互斥 Report 并存，不覆盖已有 confirmed 意义的操作值；并存不代表两者同时被确认 |
| 原子拒绝 | 一项缺必填正文导致整批拒绝，Head 与数据不产生部分变化 |
| 未观察到回执后的核对 | 丢弃一次成功返回后，在 review 分支按真实键读取唯一目标，不重复创建，main 不变 |

测试在知识操作前一次建立给定模型，结束时对各实际分支逐一核对六个相关 Definition 的 canonical 内容保持不变。测试 fixture 与业务 Skill 分离，**没有向用户长期库写入任何案例**。丢弃返回值不是实际网络故障注入；教学实例往返正确也不能代替原文与结论的语义审核。

`go vet`、上述资源/实例测试，以及既有 `TestPhase04KnowledgeBatchCreateReadAndRelationshipReplacement`、`TestPhase04MixedOntologyKnowledgeBatchReadSafetyAndAtomicity` 的 `-race` 定向回归均通过。环境为 Yi Mac / darwin-arm64、Go `1.27.2`、真实 Lithograph/Provider `v0.3.3` 与已有 Jieba fixture。

```sh
go test -tags=sqlite_fts5 -count=1 -run '^TestKnowledgeSkillResourceContract$' ./internal/kernel
go vet -tags=sqlite_fts5,lithograph_smoke ./internal/kernel
go test -race -tags=sqlite_fts5,lithograph_smoke -count=1 \
  -run '^(TestKnowledgeSkill|TestPhase04KnowledgeBatchCreateReadAndRelationshipReplacement|TestPhase04MixedOntologyKnowledgeBatchReadSafetyAndAtomicity)' \
  -v ./internal/kernel
```

Native 命令使用现行 `KGOS_LITHOGRAPH_LIBRARY`、`KGOS_LITHOGRAPH_PROVIDER_LIBRARY`、`KGOS_JIEBA_LIBRARY`、CGO 环境；缺 fixture 会失败，不以 skip 当通过。最初测试夹具将复合键 Person 与具名端点关系分两次建模时观察到既有 `CONSISTENCY_ERROR`；未修改 Kernel 或掩盖为成功，改为在测试准备阶段一次创建给定模型后，上述**实例**测试全部通过。分步模型创建路径不是本 Skill 的职责，本轮未修复或宣称验证它。

本轮没有执行完整 `pnpm validate`、新的远端 CI、Docker 交付验收、私人 Plugin 安装、ChatGPT 原生触发、发布、Commit、Push 或 Deploy。证据属于当前未提交工作树；既有 Ontology Skill、通用 Skill、插件安装文件及其它用户改动保留。本 Phase 仍为 `in_progress`，不因两个 Skill 源码完成而关闭阶段。

## P27-02 创作与审核证据（2026-10-20）

### 实际产物与职责

- 原 `kgos-ontology-standards/SKILL.md` 当时为 guidance 类型，版本 `1.0.0`；核心原则、选择条件、授权/停止边界和按需读取路径自包含。运行时包共 **13 个 Markdown 文件**：入口、质量/建模/演进/案例约定四份参考、八份案例；没有执行脚本、外部 Skill 前置或未引用资源。
- [真实案例与演进测试](../../../internal/kernel/ontology_skill_examples_integration_test.go) 当时直接读取 Skill 教学案例中的 YAML、Cypher 与预期 JSON；现在从独立 `internal/kernel/testdata/ontology/` 读取同一案例，不再将案例作为 Skill 运行资源。每个测试使用临时独立库，不访问长期 Dev/用户数据。
- [独立模型评测任务与预设判据](../../../tests/skills/ontology-standards-evaluation.json) 在执行前冻结，共 14 个场景。执行模型只收到原始用户任务与 Skill，不收到判据或作者结论；评测不打包进 Skill 的运行资源。

### 逐例审查及实际数据库结果

| 案例 | 核心语义及本轮重点审查 | 实际模型数 / 正例查询 / 语义检查 |
| --- | --- | --- |
| 资料与溯源 | 原始来源与内容快照分离；持久内容定位和引用片段；引用用途不冒充证明 | 3 / 2 / 1，全部通过 |
| 时效规则 | 业务版本、发布/观察/生效时间；半开边界；未知结束不算开放结束 | 2 / 2 / 1，全部通过 |
| 人物与组织 | 同名不同身份、关系角色、重复任职；缺结束的场景前提明确 | 3 / 2 / 1，全部通过 |
| 项目与决策 | 批准归决策，实施结果归项目/范围；同一决策两个项目独立状态 | 3 / 3 / 1，全部通过 |
| 事件与过程 | 重试、事件身份、发生/观察时间、局部记录顺序；不推断运行整体成功 | 3 / 2 / 1，全部通过 |
| 技术与依赖 | 组件与发行、需求与已解析事实；同版本文字可属于不同组件 | 4 / 2 / 1，全部通过 |
| 度量与观测 | 零值与缺测、单位/量/方法/时间；不混加或只改单位标签 | 3 / 2 / 1，全部通过 |
| 受控词表 | scheme/code 联合身份、别名、层级与 Domain 不混同 | 3 / 2 / 1，全部通过 |

合计 **24 个模型的实际创建与 canonical 回读、17 个正例查询、8 个业务语义反例检查**。另外八个数据库约束反例均返回 `CONSTRAINT_ERROR` 且不推进 Branch Head；每个语义反例则特意能被 Schema 接受，再由检查查询识别，避免“描述就是约束”的错误教学。来源归档内容实际可访问性、外部 embedding/语义查询质量、所有可能的跨边业务约束不属于这些数据库检查的已证明范围。

`TestOntologySkillEvolution` 验证无变化 Patch 不创建 State、缺值时收紧 required 被拒绝、纯 Property 改名保留数据及真实索引名、历史 State 保留旧字段、过期基线拒绝重放、在用 Definition 删除不级联且不移动 Head。`TestOntologySkillResourceContract` 验证 metadata、版本、入口选择描述及全部 13 个资源的包内可达性。

### Review → 修正 → 复验

1. 按本地 `prompt-authoring-spec` 和 `skill-authoring-spec` 及其相关参考审核必要性、职责、条件可执行性、权限、单一真源、资源加载和证据边界；以当前 KG OS Ontology/Object/Graph/Evolution 设计与实际 Kernel 为技术依据。
2. 第一轮独立只读模型 Review 发现项目决策案例的实施状态错误放在可被多个项目复用的 Decision 上。已将实施状态、核实时间、证据移到 `APPLIES_TO`，补充 A/B 项目状态不同的真实查询回归，避免跨项目误报。
3. 第二轮独立 Review 重新读取全部入口/参考/八例/当前合同和测试，未发现该检查范围内剩余的必改问题。随后作者补强资料内容的持久定位，针对该最后改动另做独立审核与原始资料建模任务回归；未发现剩余的必改问题，最终源码数据库测试重新通过。
4. 独立行为试验使用 Codex CLI `0.159.2`、实际报告模型 `gpt-6.1-sol`、只读隔离上下文、无业务 MCP。14 个场景的范围判断与预设一致，逐项核对了最小建模、来源、时间、项目状态、命名范围、单位、约束收紧、未知写入、提示注入、描述/约束、三个不适用任务和已授权小修边界。批量手工注入 Skill 的试验**不是** ChatGPT 原生自动选择、跨会话稳定性或真实 MCP 端到端验收；末次资料补强另有一个定向模型回归。

### 可复验入口与边界

本轮环境为 Yi Mac / darwin-arm64、Go `1.27.2`、真实 Lithograph/Provider `v0.3.3` 和已有 Jieba fixture；`go vet` 与下列带 `-race` 的定向测试通过。测试必须提供真实 fixture；缺失时本测试失败，不以跳过算通过。可复用仓库既有 Native fixture 准备流程，不在 Mac 运行 Docker。

```sh
go vet -tags=sqlite_fts5,lithograph_smoke ./internal/kernel
go test -race -tags=sqlite_fts5,lithograph_smoke -count=1 \
  -run '^(TestOntologySkill|TestPhase02(RenameMaintains|PropertyRename|DeleteWithKnowledge|PropertyDelete|ModelTightening))' \
  -v ./internal/kernel
```

额外执行 `go tool staticcheck -tags=sqlite_fts5,lithograph_smoke ./internal/kernel` 未通过：已有 `internal/kernel/evolution_integration_test.go:86,128` 报两条 `S1016` 结构转换建议。该文件与 `HEAD` 逐字一致，未由本轮修改；本轮新增测试文件未出现对应告警。不修改范围外旧测试，不将这次扩展静态检查记作通过。格式、Markdown、拼写、资源引用、未跟踪文件空白与任务 diff 另行检查。

运行前通过现有 `KGOS_LITHOGRAPH_LIBRARY`、`KGOS_LITHOGRAPH_PROVIDER_LIBRARY`、`KGOS_JIEBA_LIBRARY` 指向实际已验证的 native fixture，并启用 CGO。本轮证据对应未提交工作树，不把基线 HEAD 当作包含新 Skill 的已提交版本。尚未执行本阶段完整 `pnpm validate`、远端 CI、Docker 交付验收、私人 Plugin 安装、ChatGPT 原生触发或正式发布；这些不借用旧 Phase 的证据，也不阻止如实交付本轮已授权的单 Skill 源码。没有 Commit、Push 或 Deploy。
