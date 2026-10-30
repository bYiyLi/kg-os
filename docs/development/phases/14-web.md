# Phase 14：Web

<!-- cspell:words Linkurious -->

## 目标与状态

`in_progress`（2026-10-28 领域树与 Branch 历史弹窗已有本地增量证据；用户另批准 Q3 单画布搜索与真实图谱浏览增量，其余完整业务链继续暂缓）。本阶段把已确认的 [Web 设计](../../design/web.md)接入现有 Runtime、SDK 与业务 API，交付可以真实浏览、查询、编辑和管理版本的内置 Web 工作区。2026-10-13 已另行提前实现静态页面外壳；2026-10-14 先行实现强制 Token 认证弹窗、`web.data.info`、daemon boot guard 与 Web 连接失效 / 显式重连，通过 SDK 对受保护业务 API 发起请求；已增加服务器持久 Web Session、Cookie 无感刷新恢复及退出撤销，不依赖后续 Web UI store。2026-10-14 **P14-00 Web 国际化基础已实现并通过定向测试**；2026-10-15 **先行实现紧凑版本导航的真实 Evolution SDK 读取**。本轮范围见下文增量，Web 数据存储、查询、编辑及完整 A14-08/整体 Phase 验收仍未完成，P14-04/05 的主页面呈现按本轮用户认可的 Q3 单画布方向替代旧帧布局；其余原 Acceptance 与协议、数据、安全和完整交付门禁不因局部增量降低。

**职责补充（2026-10-14）**：[Phase 18](18-chatgpt-embedded-web.md) 负责 ChatGPT MCP Apps 的双入口、同一 React Shell 复用及宿主通信验收；本阶段仍独占真实 Web 查询、图谱、Ontology/Knowledge 编辑、版本/草稿等业务 Feature。Phase 18 的入口联通不替代本阶段 A14 业务验收，后续每个已实现 Feature 再按需复用到内嵌 UI。

完成后的主流程：

```text
打开当前 Instance 的 daemon endpoint，显式连接
  → 选择并固定浏览 State
  → 搜索知识起点，在单一画布点选、查看详情并展开关系
  → 显式编辑，预览并确认一次高层 Patch
  → 查看真实回执，按需刷新当前分支
  → 刷新 / 重开后优先恢复有效 Web Session（失效时重新输入根 Token），之后恢复已保存输入和工作位置
```

这是一个完整的交付与验收 Phase：P14-00 为可以先行落地的 Web 显示基础，原有 P14-01–11 仍按五组业务 Feature 实施，不新建顶层 Phase。局部测试、组件画板或先后依赖不另建顶层 Phase。设计输入、既有前置能力、Feature 顺序和 Acceptance 已具备；未启动的业务链继续按原排期暂缓，不是设计阻塞。本轮不将局部导航验收当作整个 Phase 完成。

## 设计输入

- [Web owner](../../design/web.md)：单画布搜索/探索、请求生命周期、草稿、持久化与连接工程合同；实现核对以[当前能力与工程待办](../../design/web.md#当前能力与工程待办)及[动态验收边界](../../design/web.md#设计自查与后续动态验收边界)为入口。
- [Web 国际化与语言偏好](../../design/web.md#国际化与语言偏好)：双语言、语言解析/保存、页面与认证展示、不可翻译数据范围以及前端模块边界。CLI 的环境变量 locale 合同只由 [CLI owner](../../design/cli.md#国际化)负责。
- [统一功能材料与覆盖矩阵](../../design/web-materials.md)：当前右侧以 Q3 单画布/搜索为准，V7 负责领域树与历史弹窗；Q1/Q2 为已替换的帧布局历史材料，E1/E2/E3、O1/O2、V1–V4、R1/R2 与 A1 按各自仍有效的规则适用。状态表不是新页面，视觉认可不等于真实功能已实现。
- [一致评审样例](../../design/web-examples.md)：作为真实测试 fixture 的输入参考；通过正式 API 建立所需模型、数据和版本，符号 State、短 hash、示意 JSON 与计数不作为 wire 或固定返回值。
- [Object 公共调用合同](../../design/object.md#object-公共调用合同)：同 State batch read、canonical YAML、Git Extended Diff、strict base、alias 与 transition；[Ontology](../../design/ontology.md#公共可编辑格式)、[共享资源](../../design/ontology.md#共享资源与聚合编辑)和 [Domain](../../design/ontology.md#domain业务组织)约束模型聚合编辑。
- [Knowledge 数据访问](../../design/graph.md#knowledge-数据访问)及 [Graph 调用合同](../../design/graph.md#graph-公共调用合同)：真实 Property Graph、typed values、query/execute 与底层事务边界。
- [Evolution 调用合同](../../design/evolution.md#evolution-公共调用合同)：State、State Data、ref、ancestry/history/diff 和 Merge Session；不从图稿推导接口。
- [Client SDK](../../design/client.md#kgossdk)、[Runtime 内置 Web](../../design/runtime.md#web-hosting)、[Web operational 数据](../../design/runtime.md#web-operational-数据目录)、[公共错误](../../design/contracts.md#公共错误合同)及 [Web 错误映射](../../design/contracts.md#web-持久数据错误方案)：共享 transport、同源 loopback、认证、存储隔离与错误分类。
- [工程映射](../../design/implementation.md)、[共同完成条件](../README.md#6-phase-通用完成标准)和[开发指南](../../guide/development.md)：实现边界、仓库门禁与实际操作入口。本计划不复制产品规范或维护第二套命令指南。

## 前置依赖与当前实现缺口

2026-10-04 核对 `main@181628b45c1600476514dfc129a5053c6d394b9e` 与当前未提交 Web 设计工作树。Phase 00–13 已完成；其历史成功是前置基线，不是本阶段验收证据。

| 依赖 | 当前证据与本阶段处理 |
| --- | --- |
| Runtime / init / 认证 / 内嵌产物 | [Phase 12](12-first-run-cli-productization.md)、[Phase 13](13-init-wizard-credential-boundary.md)及现有 [Web 构建](../../../scripts/build.mjs)、[内嵌交付](../../../internal/webui/webui.go)已提供基础；继续使用一个 Instance 的 daemon endpoint |
| Ontology / Object / Graph | [Phase 02](02-ontology.md)、[04](04-object.md)、[05](05-graph.md)已提供业务合同与实现；本阶段接入现有 API，不新建模型/对象发现、preview 或提交状态接口 |
| Evolution Core / Merge | [Phase 06](06-evolution-core.md)、[07](07-evolution-merge.md)与 [SDK](../../../packages/sdk/src/client.ts)、[HTTP adapter](../../../internal/daemon/api.go)已有对应操作；新增的是前端工作流 |
| TypeScript / npm Runtime | [Phase 08](08-typescript-client-npm-runtime.md)及后续六平台基线可复用；Web 通过 SDK 访问，不能调用 CLI 子进程或本机文件 |
| Web 页面 | [当前 app shell](../../../packages/web/src/app/app.tsx)已有高保真方向的静态外层布局与响应式画布，另行交付[认证弹窗](../../../packages/web/src/features/connection/authentication-dialog.tsx)，通过 SDK `evolution.overview` 验证 Bearer 后解除遮罩；五组完整业务 Feature 均未验收 |
| Web 国际化 | 当前中英混写、HTML 固定 `zh-CN`，无统一资源、浏览器语言识别或用户切换；P14-00 只改浏览器 Web 显示层，不依赖新增 Runtime/SDK API，也不更改 Phase 17 的 OAuth/Session |
| Web 存储与受控接口 | `web.data.info` 已作为认证后引导信息实现，当前 `storageStatus=unsupported`；[Runtime Paths](../../../internal/runtimeprofile/profile.go) 尚无 `.kgos/web` 持久存储或记录 / 缓存接口；P14-01/02 仍须实现保存、导出与缓存清理能力 |
| 连接与响应预算 | 已有 SDK fetch 注入点、AbortSignal、daemon boot guard、401 / 409 / 离线失效与显式重连；Web 有界 JSON / NDJSON 接收 adapter 尚待 P14-02 实现，不改变 CLI / 第三方默认合同 |
| 业务浏览器验收 | [现有 E2E](../../../tests/e2e/web-shell.spec.ts)覆盖静态布局、空状态、视图切换、窄屏与不存在的 readiness bypass；仍需扩展[现有 Runtime fixture](../../../scripts/serve-built-runtime.mjs)完成真实业务 E2E，不能把 shell 成功算作业务验收 |

未发现必须先追加产品决定的具体阻塞。字段编码、payload shape、内部 SQLite schema 与 SDK mapping 按已确认 owner 合同完成；实现中若出现两种会改变调用方可观察行为且现有真源不能裁决的答案，只暂停依赖该分歧的工作并报告。

## 范围与 Feature

每个 Feature 都包含自己的成功、异常、安全和恢复验证；最后一组负责贯通与交付，不把前面的保护行为延后到最终 Review。

| 内部实施组 | Feature | 交付物与主要落点 | 依赖 / 设计入口 | 验收 |
| --- | --- | --- | --- | --- |
| 0. Web 显示基础 | **P14-00 Web 国际化** | `app/i18n/` 初始化、两套本地资源、手动/浏览器语言解析与偏好持久化；现有 Shell/认证双语化，含状态、错误、无障碍与日期/数量格式化，语言控件复用现有布局 | 现有 React/Vite Shell；[国际化 owner](../../design/web.md#国际化与语言偏好)，无需 P14-01/02 或 Phase 17 完成 | [A14-00](#a14-00-国际化基础与双语界面) |
| 1. 连接与 `.kgos/web` 持久基础 | P14-01 Daemon Web 数据 | Runtime Paths、独立普通 SQLite UI store、缓存、受控 API、共享错误映射与认证后的 boot guard；落在 Runtime/daemon adapter，隔离现有 Kernel | 当前 Runtime 基线；[Web 工作区数据](../../design/web.md#web-工作区数据)、[连接](../../design/web.md#连接认证与恢复) | [A14-01](#a14-01-daemon-存储与接口) |
| 1. 连接与 `.kgos/web` 持久基础 | P14-02 SDK 与连接适配 | SDK `web.data / web.cache` 和 Blob 下载；Web fetch 注入 guard、有界 JSON/NDJSON 接收、每请求取消；简短显式连接与 pinned 上下文 | P14-01；[SDK](../../design/client.md#kgossdk)、[响应预算](../../design/web.md#接收与显示预算)、[当前上下文](../../design/web.md#信息架构与当前上下文) | [A14-02](#a14-02-sdk连接与上下文) |
| 1. 连接与 `.kgos/web` 持久基础 | P14-03 记录保存与恢复基础 | workspace/editor/frame/query/draft 记录接入、自动保存、按记录 CAS、原位置恢复；收藏查询仅填入编辑器，维护能力不新增日常管理页 | P14-01/02；[记录生命周期](../../design/web.md#持久记录与可丢弃缓存)、[库绑定与恢复](../../design/web.md#库绑定格式与恢复)、[多窗口保存](../../design/web.md#受控-api-与多窗口保存) | [A14-03](#a14-03-自动保存与恢复) |
| 2. 搜索与图谱探索 | P14-04 搜索与画布读取生命周期 | 顶部搜索、固定 State、参数化真实检索、操作快照/取消/迟到保护、空/失败/受限反馈及预算；复用 SDK parser，后续高级执行保持显式写入边界 | 当前只读增量复用既有连接/导航，可先于 UI store；持久读取记录后接 P14-03；[单画布合同](../../design/web.md#知识图谱画布与搜索)、[协议反馈](../../design/web.md#查询状态与反馈) | [A14-04](#a14-04-独立帧与执行) |
| 2. 搜索与图谱探索 | P14-05 图投影与按需详情 | 单画布真实 typed Node/Relationship/Path 投影、选择/详情、有界邻居展开、局部布局、平移/缩放/适配；后续按需缓存恢复 | P14-04；[单画布合同](../../design/web.md#知识图谱画布与搜索)、[图投影语义](../../design/web.md#图投影与帧内检查器) | [A14-05](#a14-05-图阅读与预算) |
| 3. Knowledge / 本体编辑 | P14-06 Knowledge 草稿与 Patch | 显式新建/编辑/删除、canonical base、无损表单与按需 YAML/Patch、预览确认、可靠保存后一次提交及真实回执 | P14-03/05；[显式编辑](../../design/web.md#显式编辑工作流)、[删除](../../design/web.md#节点关系与删除影响)、[保存与提交](../../design/web.md#保存与知识提交) | [A14-06](#a14-06-knowledge-草稿与提交) |
| 3. Knowledge / 本体编辑 | P14-07 Ontology 图与聚合编辑 | 全局/Domain/Definition 图、同 State 详情与分页、字段/约束/索引聚合编辑；复用 P14-06 的 Patch/提交路径，支持同请求 Ontology + Knowledge | P14-03/06；[本体图谱](../../design/web.md#本体图谱)及 Ontology/Object owner | [A14-07](#a14-07-本体图与模型变化) |
| 4. 版本演化 | P14-08 知识世界、版本列表与覆盖 DAG | 当前世界单选、版本历史/最新与浏览区分、跨世界筛选、可见范围渲染、分页/局部搜索、真实 parent DAG 与 ref 变化提示；本轮允许复用现有连接/只读 SDK 先行 | P14-02/03 的持久化与旧帧部分后续联验；[版本区域](../../design/web.md#版本区域) | [A14-08](#a14-08-历史与覆盖-dag)及本轮增量 |
| 4. 版本演化 | P14-09 State / History / Diff / ref | State 与 sidecar 详情/编辑、显式 State create、Branch/Tag 操作、业务 History、两 State 结构化 Diff；State Data 未发送输入接入草稿 | P14-03/05/08；[详情与差异](../../design/web.md#state-详情与两-state-差异)、[ref](../../design/web.md#branch-与-tag) | [A14-09](#a14-09-state差异与-ref) |
| 4. 版本演化 | P14-10 Merge 工作流 | Session start/list/get/conflicts/resolve/finalize/abort、冲突选择、精确 revision 与未发送方案恢复 | P14-03/09；[Merge](../../design/web.md#merge-session)、[恢复](../../design/web.md#持久记录与可丢弃缓存) | [A14-10](#a14-10-merge-session) |
| 5. 完整流程与交付验证 | P14-11 阶段贯通 | 真实 Runtime 浏览器 E2E、打包/平台回归、双语言/性能/响应式测量、最终 Review 和按职责文档同步 | P14-00–10；[动态验收](../../design/web.md#设计自查与后续动态验收边界)、[键盘与响应式](../../design/web.md#键盘与响应式) | [A14-11](#a14-11-端到端与交付)及[工程门禁](#工程验证门禁) |

### 非目标

本阶段不增加账号/角色、远程部署、自动读取或持久化 token、跨端口发现、新版本模型、独立 Index CRUD、全历史全文搜索、任意文件接口、Graph dry-run/affected IDs 或提交状态服务。Skill、产品发布、Git tag、npm publish 与部署不属于本阶段。

国际化不新增后端 locale API、账号语言配置、翻译 CDN/管理服务、独立翻译持久层或 CLI 文案迁移。P14-00 只负责当前 Web 页面与其后续组件通用的显示基础；Phase 17 的 MCP OAuth 登录/授权安全逻辑不在本任务中实现，后续授权弹窗作为 Web UI 使用同一个翻译机制。

按[首版简化范围](../../design/web.md#信息架构与当前上下文)，不建设恢复中心、缓存/容量管理页、回执中心或常驻异常卡；导出/缓存清理等已定义维护 API 在 P14-01/02 实现和验收，浏览器导入、整库 reset 与未来补充入口不扩成首版工作流。

## 实现顺序与依赖

```text
0. P14-00 i18next + bundled en/zh-CN + language selection
      → existing Shell/authentication UI conversion + bilingual tests
1. P14-01 daemon store/API/boot guard
      → P14-02 SDK + Web fetch/connection/pinned context
      → P14-03 record autosave/CAS/restore
2. P14-04 search/canvas lifecycle → P14-05 graph/details/neighbor exploration
3. P14-06 Knowledge draft/Patch → P14-07 Ontology aggregate
4. P14-08 list/DAG → P14-09 State/History/Diff/ref → P14-10 Merge
5. P14-11 real E2E/packaged/platform gates/final review
```

这是完整业务链的默认推进顺序，Feature 表给出实际依赖。2026-10-28 已批准的只读单画布增量复用既有认证、SDK 与导航上下文，先完成真实检索/图浏览，不等待尚未实施的 UI store；持久恢复、高级执行、编辑与后续阶段门禁仍单独验收。**P14-00 可独立于暂缓的业务链先行实施**；2026-10-25 两项已批准增量使 Phase 为 `in_progress`，其余业务链仍暂缓；所有后来新增的 Web 可见文案直接使用这套资源，不再硬编码。P14-02 先提供基础 State 解析/切换与显式目标 Branch，保证查询和编辑不等待完整历史 UI；P14-08 再复用该上下文补齐版本列表/DAG。P14-03 提供各记录/subtype 的保存基础，帧、Object、State Data、Merge 各 Feature 再接入自己的恢复校验。UI 库只存操作数据，不能用记录保存替代真正 Kernel 提交。

各 Feature 取得针对性验收与局部 Review 后再接依赖它的功能；需要上下游的场景在两者具备时联验，并在 P14-11 取得完整阶段证据。组件的键盘、窄屏、错误反馈与预算随功能落实，最终阶段测量和回归。设计覆盖按材料 ID → Feature → Acceptance 追踪，不能按画板数量机械拆分交付单位。

## 知识世界与版本导航增量（2026-10-25）

用户已批准“当前知识世界 + 该世界版本历史”的高保真方案，并授权更新设计、计划、代码与验收；本增量归 P14-08，不另建 Phase。先更新 [Web owner](../../design/web.md#版本区域)，再实现依赖它的前端代码。实施范围不包含知识查询/编辑、Web 持久化、世界 CRUD、Commit/Push、远端部署或正式发布。

本节保留 V5 下拉方案及其当时验收记录；当前方案和最终本地结果由下方 [V6 平铺导航增量](#平铺世界与设置入口收敛2026-10-25)维护。

| 项目 | 工作与完成条件 | 状态 |
| --- | --- | --- |
| 世界与浏览上下文 | 普通/内嵌入口传入真实 defaultBranch；可搜索单选；验证成功才同时切换世界与 Commit；失败、乱序、共享 Head、断连和引用删除保持准确上下文 | 已实现；本地专项通过 |
| 版本历史与指针观察 | 当前世界历史、说明优先、Hash/时间次要；已加载搜索/分页；最新与当前浏览独立；返回最新、显式刷新及新 Head 提示；不自动推进历史选择 | 已实现；本地专项通过 |
| 高级历史与版本关系 | 更多菜单保留跨世界多选/去重/分页，筛选不切换世界；按单个 pinned root 的真实 parents 绘制可见范围 DAG，含 Merge、多轨、未加载父节点与继续加载 | 已实现；本地专项通过 |
| 双入口与验收 | 桌面/窄屏抽屉共享状态，English/简体中文、深浅主题、键盘/焦点/Portal；真实 Runtime 浏览器与内嵌协议 Host fixture，完整本地门禁与最终 Review | `in_progress` |

本轮必须覆盖：默认世界不为 main、多个世界共享 Head、搜索无匹配、切换失败/取消/迟到、历史选中与 Head 前进/删除、跨世界过滤不改变当前世界、原 root/cursor 分页稳定、DAG 合并多父/缺父/时间错序、关闭/键盘返回和背景画布几何不变。普通/内嵌入口复用同一组件与 SDK，不新增 HTTP transport、后端 API、依赖或世界元数据。

验收顺序：定向数据与组件测试 → Web check/类型与文档检查 → 正式 Browser/MCP 双构建及 Playwright → 完整 `pnpm validate` → 桌面/320px/375px 浏览器视觉与交互 → 最终 diff Review。检查通过后仅为实际改动/失败/具体未解决问题复跑相关项。真实 ChatGPT 宿主、OpenClaw Docker、远端 CI 与发布未执行时分别保留边界；不以本轮本地导航验收关闭整个 Phase 14。

### 本轮实施与验收证据

**V5 当时的代码及本地导航专项通过，整仓门禁曾失败。** 以下保留原快照结果与失败记录；后续 MCP 修复和 V6 工作树已通过新的完整本地门禁，见下方证据，不倒写为旧快照通过。整个 Phase 14 仍未完成。

- **检查对象**：最初基于 `cdab276546db1e76702de1edbeed6f6747f32c7f` 的未提交 Web 工作树。期间另一任务提交 MCP 修复使主工作区前进到 `25c8401`，另有五分类设置并行开发。为避免将未完成设置混入侧栏证据，使用同一基线的独立验收工作树，只叠加本轮侧栏源文件/测试、当前冻结依赖及共享入口中本轮必要的参数与宽度改动；排除并行 Settings 和未提交 MCP 实现。日志、排除边界及源码指纹保存在本地主工作区 `.cache/sidebar-worlds/acceptance/`，不虚构未提交代码的 Commit SHA。
- **实现**：真实 `defaultBranch` 贯通 Browser 与 Embedded；单世界历史、观察 Head / 当前浏览分离、显式返回最新、15 秒有界引用观察、失败/迟到/删除恢复；更多菜单跨世界筛选与真实父边 DAG；桌面和窄屏共享状态、中英资源、主题、键盘及焦点归还。复用既有 SDK 与 UI 组件，未增加后端 API、依赖或世界元数据。
- **专项与构建**：独立快照 `pnpm --filter @kgos/web check` **24 文件 / 228 项通过**，含 TypeScript、ESLint、Prettier；`pnpm build` 完成普通 Web 与 MCP 内嵌双产物。之后主工作区补齐并行设置组件后，同一 Web check 亦 **27 文件 / 285 项通过**，证明当前共享入口仍可整合编译和测试，不用该数字替代设置功能自身验收。
- **覆盖率及静态门禁**：独立快照 `pnpm test:coverage` **41 文件 / 331 项通过**；Statements **94.70%**、Branches **90.56%**、Functions **97.36%**、Lines **96.98%**。`check:type-coverage` **99.71%**，重复代码 **0**，unused、licenses、diff 通过；`check:security` 按项目 high 门槛通过，生产依赖无已知漏洞，开发依赖仍报告 3 low / 5 moderate，未误记为零漏洞。主工作区此前的 imports、仓库约束及 secrets 检查通过；最终文档检查为 Markdown 103 文件通过、五份本轮文档 CSpell 通过、本地链接/锚点 572 项有效，`git diff --check` 通过。
- **浏览器**：独立快照正式构建后 Playwright **48/48 通过**。新增 6 个导航场景覆盖非 main 默认、共享 Head、切换/历史/引用观察、跨世界筛选、DAG Merge/缺父与原 cursor、320px/375px、键盘、双语/主题以及内嵌协议 Host fixture。另有一项使用临时真实 Go/Lithograph Instance，真实认证和 Evolution API 创建/读取三个世界及版本，不 mock 认证或版本 route；世界名不同而共享 Head、历史/返回最新与真实 parent 边均验证通过，原默认 Head 保持不变。旧密度用例按已批准的 280px 初始宽度更新，未放宽布局断言。当前主工作区另执行完整 `knowledge-world-navigation.spec.ts` 与 `setup-preview.spec.ts`，**16/16 通过**，包含真实 Runtime 场景及其初始化前置流程；首次只过滤后置用例导致跳过串行初始化、缺少认证文件，已按原完整 fixture 重跑而非修改产品或断言。
- **本地实际页面**：保留现有开发库和配置，`http://127.0.0.1:5173/` 已显示新导航；真实旧版本选择、返回最新、世界选择器和版本关系图可用。最终主页面截图保存在 `.cache/sidebar-worlds/final-main-sidebar.png`，版本关系图截图为 `.cache/sidebar-worlds/real-runtime-dag.png`。未为截图创建虚构世界或替换开发数据。
- **V5 当时的整仓失败**：首次主工作区 `pnpm validate` 已通过 install / dependencies / typecheck / lint / build / Go check，但在 Go race 阶段失败：`TestScriptReturnAndSandboxIsolation` 的 BigInt 错误预期被预算超时替换为 `RESOURCE_ERROR`；`TestDoctorSkillReadProbe/models` 返回工具错误，日志未展开正文。未出现 `DATA RACE`，也没有证据将两项失败直接归因于本轮 Web 变更或确定归因于机器负载。BigInt 用例保持预算、断言与 race 不变单独复验已通过；当时一次通过不关闭原完整门禁失败。该完整运行未到达的后续步骤不能算通过，独立快照检查仅补充侧栏证据；后续实际结果见 V6 新工作树完整门禁。
- **Review 与交付边界**：最终只读 Review 检查了 owner、数据 generation、原 root/cursor、观察任务清理、删除引用、DAG 可见范围、焦点及共享入口；已修复引用更新重置图滚动、断连后弹层重开、首次目录失败误报为空、刷新 busy 和跨世界清空后返回单世界误报等问题，并通过对应回归。未提交、未推送、未部署；未执行 OpenClaw Docker、公开双 Job CI 或真实 ChatGPT 客户端验收。其余 Web 业务和整个 Phase 保持未完成。

## 平铺世界与设置入口收敛（2026-10-25）

本节保留当时的实施与验收；侧栏内容、选择行为与历史入口已由下方 [2026-10-28 增量](#领域树与-branch-历史弹窗2026-10-28)替换。用户当时批准 [V6 高保真](../../design/assets/web/V6-flat-world-sidebar.png)并授权先同步设计/计划，再实现与验收；本增量替换上方 V5 的世界下拉入口，沿用 P14-08 与现有五分类设置，不另建 Phase。新规则由 [Web 版本区域](../../design/web.md#版本区域)拥有。

| 工作 | 验收目标 | 状态 |
| --- | --- | --- |
| 平铺世界与独立展开 | 真实名称同级，默认展开真实默认世界，一次一个；展开不读 get、不改浏览上下文，点版本成功后原子确认世界+Commit，失败/乱序/共享Head准确 | `done`（本地） |
| 满高与内部滚动 | 导航使用剩余高度，数据短时自然留白，有后页则补齐到溢出或耗尽；无进度/失败停止，切换世界/模式隔离旧分页状态并保留缓存及原 root/cursor；滚动不影响设置，手动加载只在真实有后页且溢出时出现于历史末尾 | `done`（本地） |
| 设置入口收敛 | 桌面/窄屏底部只设置；真实主题、语言、退出回调接入已有设置；认证前语言仍可用，内嵌不伪造退出/实例管理能力 | `done`（本地） |
| 构建与验收 | 定向 Hook/组件与负路径、桌面/320px/375px、双语/主题、滚动/分页/Resize、真实Runtime与内嵌fixture、完整本地门禁和最终Review | `done`（本地） |

保留展开世界的真实 DAG、各世界原 root/cursor、独立当前浏览、引用观察和删除后的只读历史。世界搜索只过滤真实名称；跨世界历史与其已加载搜索留在更多菜单。本次不新增后端 API、依赖、世界模型或持久 UI store；不包含提交、推送、部署与正式发布。其他完整 Web 业务和 Phase 14 仍未完成。

### 平铺导航实施与验收证据

**V6 代码、完整本地门禁与最终 Review 已完成。** 整个 Phase 14 仍为 `in_progress`；本增量未提交、未推送、未部署。

- **来源与指纹**：主工作区基于 `2c06cea98cbdd090bb9f3a23d19a464ffd8d0152` 的未提交 Web 工作树，包含已有设置和 MCP 修复；不虚构本轮 Commit SHA。完整门禁运行前后 **878 项文件指纹全部一致**。本地日志、运行结果与指纹见 `.cache/flat-world-sidebar/validate.log`、`validate-result.json`、`validate-inputs.json`、`validate-source-comparison.json`；之后只补写本节与开发路线证据，再执行文档检查。
- **交互实现**：真实世界名称平铺、单个展开，世界展开与当前浏览独立；版本验证成功才确认世界+State，共享 Head 不误高亮。新观察到的世界可独立读取首个固定历史页；删除引用保留真实缓存，不伪造空世界。DAG 使用展开世界的真实 root/parents，跨世界高级历史保持显式 State 选择，不猜测世界归属。
- **高度与分页**：导航使用剩余高度，唯一内部滚动区，底部设置固定。真实空间不足时沿原 root/cursor 补齐；溢出或耗尽停止，滚动不加载，按钮位于该世界已加载历史末尾。窗口增高可继续补齐，失败或无新增进度不循环；隐藏、零高度、无 ResizeObserver 均有回归。切换世界/模式仅清理旧分页任务状态，保留页与 cursor；返回原范围可以继续。新范围的自动补页不会被父层取消或迟到选择回调误杀。
- **设置与入口**：桌面及窄屏底部仅设置，主题/语言复用显示设置，退出登录使用连接与访问中的真实回调。认证前语言入口保持；内嵌显示偏好可用，不伪造退出或实例配置管理。认证失效时关闭设置，重连不自动重开，移动端关闭后焦点返回稳定导航入口。
- **完整门禁**：2026-10-25 **`pnpm validate` exit 0，511.24 秒**。包括 install、依赖、类型、全部 lint、普通 Web/MCP 双构建、Go 常规/竞态/覆盖率/安全、前端覆盖率、类型覆盖率、重复/unused、Playwright、许可证、安全审计及 diff。Vitest **52 文件 / 455 项通过**；覆盖率 Statements **95.20%**、Branches **91.31%**、Functions **97.58%**、Lines **97.42%**；Go statement coverage **90.3%**，类型覆盖率 **99.76%**，重复代码 **0**。生产依赖无已知漏洞，开发依赖仍有 **3 low / 5 moderate**，按既有 high 门槛通过，不误报零漏洞。执行期间没有并行构建清理共享产物。
- **浏览器**：正式构建上的 Playwright **56/56 通过（27.0 秒）**，包含 5 项满高/分页场景、桌面/320px/375px、双语/主题、键盘/焦点、真实 Runtime 及内嵌 Host fixture。真实 Runtime 使用临时独立库、正常认证和真实 Evolution API，创建三个世界与共享 Head，验证历史选择/返回最新/父边，未 mock 版本路由、未移动原默认 Head。现有 `http://127.0.0.1:5173/` 实页也已核对展开/收起、历史选择/返回最新及设置中的主题、语言、退出入口；开发库只有 main 与两个真实版本，按耗尽规则自然留白，未为截图伪造数据。实页截图为 `.cache/flat-world-sidebar/final-dev-sidebar.png`。
- **失败修正与 Review**：前期覆盖率不足通过补充真实交互/失败路径回归解决，未放宽阈值；首次完整门禁停在格式检查，格式修正后重新跑完整流程通过。复核中先复现并修正 A 世界分页错误/忙碌污染 B、旧模式闭包取消新分页，以及模式往返把主动取消误判为无进度；最终相关三文件 **38/38 定向通过**，独立只读 Review 确认无剩余必改。旧 V5 与设置专项证据不替代这轮实际结果。
- **交付边界**：本轮不新增后端 API、依赖、世界元数据或持久 UI store；保留原有设置业务文件。未 Commit/Push、OpenClaw Docker、公开 CI、发布或真实 ChatGPT 宿主验收。查询、知识/本体编辑和 Web 持久化仍未完成，不以本地导航增量关闭整个阶段。

## 领域树与 Branch 历史弹窗（2026-10-28）

`done`（本地增量；整个 Phase 14 仍为 `in_progress`）。用户已批准 [V7 领域树](../../design/assets/web/V7-domain-tree-sidebar.png)和 [V7 历史弹窗](../../design/assets/web/V7-branch-history-dialog.png)，并明确要求先更新设计与开发计划，再修改代码和验证。本增量沿用 P14-08，并接入 P14-07 的只读领域导航部分，不另建 Phase；唯一交互规则由 [Web 版本区域](../../design/web.md#版本区域)维护，Domain / State 合同沿用现有 owner。

本次只交付左侧真实领域树、Branch / State / Domain 选中上下文与历史浏览，右侧仍为现有占位画布。保留当前深浅主题、字体、弧形控制柄、侧栏调宽、固定设置和普通浏览器/内嵌双入口。不实现本体图、Knowledge 查询/编辑、领域或 Branch CRUD、Web 持久化，不包含 Commit/Push、远端部署或正式发布。

| 实施顺序 / 工作 | 验收目标 | 状态 |
| --- | --- | --- |
| 1. 设计与材料 | owner 替换 Branch 下 Commit 列表和靠左 DAG 抽屉的有效规则，归档 V7 与来源，计划保留旧验收并明确替换关系 | `done`（文档/材料） |
| 2. 同 State 领域组织读取 | 全局分页枚举 Domain，过滤未归类 Definition；每批最多 100 个 `object.read` 读取公共 `includes`；拓扑完整后派生树根和无领域状态，保留多父/cycle 可发现入口 | `done`（本地） |
| 3. Branch / 领域树 | 名称选择、箭头展开和行末历史独立；真实嵌套、共享路径、循环引用停止、无领域仅 Branch；选中绑定世界+State+Domain，失败/乱序/重连不覆盖既有上下文 | `done`（本地） |
| 4. 居中历史弹窗 | 未展开 Branch 也可按图标打开；对象/root 与领域展开分离；复用真实父边、分页/选中/返回最新；跨世界高级历史迁入独立弹窗模式，不替换领域侧栏 | `done`（本地） |
| 5. 验证与 Review | 定向逻辑/组件与负路径、真实隔离 Runtime、内嵌 fixture、浅深主题/中英文/键盘/桌面与 320/375px；完整本地 `pnpm validate`、最终 diff 与独立 Review | `done`（本地） |

验收同时覆盖：无领域、多根、多层、共享子领域、自引用/循环、完整分页、资源超限、长名称、深层窄屏；Branch 共享 Head、前进/删除、历史版本的领域变化、快速切换和迟到响应；历史打开/关闭不切版本或改画布几何、Merge 多父/未加载端点、加载更早与耗尽提示、焦点恢复。只在隔离临时实例创建验收领域和版本，现有本地 Instance 仅只读核对，不写演示数据。

普通浏览器使用现有 HTTP SDK；内嵌入口补固定 `kgos_query` 的 `ontology.read / object.read` 只读调用，沿用当前认证、取消、错误和权限失效行为，不新增公共 API、依赖或通用脚本代理。领域读取失败保留原导航并重试，部分结果不能成为完整/空树；Domain 选择只维护导航状态，不宣称已接入右侧模型视图。

### 领域树增量实施与验收证据

**本轮设计、代码、完整本地门禁与最终 Review 已完成。** 该结论只覆盖本节左侧导航与历史弹窗增量，整个 Phase 14 仍为 `in_progress`；右侧模型图、查询/编辑和持久化等原范围不因局部交付改变。

- **来源与输入一致性**：Mac 主工作区基于 `main@2c96c3a0f2ff7f8030f67f9c8750e24da01a7919` 的 dirty 工作树，含既有其他未提交工作，不虚构本次 Commit。最终完整门禁前后 **891 项源码输入指纹完全一致**，`changed_inputs=[]`。输入、日志与结果分别在 `.cache/domain-tree-navigation/validation-inputs.json`、`validate.log`、`validate-result.json`；门禁后只补本节与开发路线的验收文字，再做文档检查，不修改已验收代码。
- **实现与读取**：默认侧栏使用真实 Branch / Domain 树，世界名选择、展开箭头和行末历史操作独立；同 State 完整 Overview 分页后通过最多 100 Ref 的 Object batch 读取公共 `includes`，处理多根、共享、循环与真实 Go 空集合编码。缓存、取消与迟到响应按 reader / State 隔离；普通 Web 使用现有 SDK，内嵌使用固定 `kgos_query` 的两个只读方法，无新增公共 API、依赖或 Knowledge 写入路径。历史对象与领域展开独立，跨世界筛选/搜索留在弹窗内；旧版本领域、返回最新与共享 Head 身份保持真实。
- **真实 Runtime 与本地页面**：隔离临时 Instance 通过真实 Object Patch 建立 `Writing → Characters`，验证当前/历史领域、共享 Head、真实 ancestry 父边与重启；没有 mock 认证/版本/领域协议响应，也没有改动原默认 Head。独立串行 Runtime 流程 **3/3 通过（11.6 秒）**，并再次进入最终完整 E2E。最终 Runtime 截图为 `.cache/domain-tree-navigation/runtime-domain-tree.png` 和 `runtime-history-dialog.png`。现有 `.kgos-dev` 仅只读验证中文页面，其真实数据没有领域，因此只展示 `main` 与历史入口；只读截图为 `local-sidebar-zh.png` 和 `local-history-zh.png`，已在最终门禁后只读复核并刷新截图。未为效果图向现有 Instance 写演示数据。
- **深层与窄屏实测**：12 层领域树在 **320 / 375 / 1280px** 三视口下，最深名称按钮宽 **136px**、文字区域宽 **99px**，导航自身可横向滚动，页面无横向溢出；结果在 `.cache/domain-tree-navigation/deep-navigation-result.json`。此前最深按钮被压至 12px、文字宽度为 0 的问题已通过导航容器内部滚动和树行最小可读宽度修复，并纳入后续最终完整门禁。
- **完整本地门禁**：最终 **`pnpm validate` exit 0，540.87 秒**。Vitest **57 文件 / 506 项通过**；TS Statements **94.23%**、Branches **90.08%**、Functions **96.41%**、Lines **96.76%**；Go statement coverage **90.3%**，类型覆盖率 **99.76%**，重复代码 **0**。Playwright **58/58 通过（38.3 秒）**，覆盖深浅主题、双语、桌面/320/375px、键盘与焦点、真实隔离 Runtime 和内嵌 Host fixture；普通与 MCP Web 构建、Go 常规/race/security、许可证与 diff 等既有门禁均通过。生产 npm 依赖无已知漏洞，开发依赖仍有 **3 low / 6 moderate**，按原 high 门槛通过，不称零漏洞。
- **失败记录与修复闭环**：首轮完整门禁 **exit 1，36.66 秒**，停在新 App 测试的 6 项 ESLint 规范错误；抽取真实 fixture/辅助断言并修正类型处理后，App **13/13** 及对应规范检查通过，没有禁用规则。第二轮完整门禁 **exit 1，547.84 秒**，Playwright **57/58**；历史筛选 Popover 的父 Positioner 仍处于 z-index 50，只提高 Popup 无效，随后给该 Positioner 使用专用层级并复验正常点击。两轮记录保留在 `validate-attempt-1.log` / `validate-attempt-1-result.json` 与 `validate-attempt-2.log` / `validate-attempt-2-result.json`，不把失败轮次当成功证据；最终以修复后固定输入重新完整运行，关闭这些失败。
- **Review 与文档检查**：独立只读 Review 检查领域数据/双入口、取消与选中、历史 root/cursor、弹窗和窄屏。已修复迟到名称选择覆盖后续展开、首次引用目录失败缺少反馈、历史后页重试未重发原 cursor，以及在另一历史对象打开时选择新 Head 后重开旧缓存根的问题；另修复筛选浮层层级与深层行收缩，相关回归和最终完整门禁通过。前置文档/材料曾核对 39 个新增/修改本地链接与锚点，两张 V7 PNG 的原字节、SHA-256、尺寸与 chunk CRC 匹配；验收文字补写后另做 Prettier、Markdownlint、本地链接及 diff 检查，不重复运行无代码变化的完整门禁。
- **交付边界**：未由本轮执行 Commit/Push、OpenClaw Docker、远程 CI、部署、正式发布或真实 ChatGPT 宿主验收。内嵌 Host fixture 只证明受控协议/资源与业务路径，不代替真实客户端证据；本增量 `done`（本地）不能据此关闭整个 Phase 14。

### 历史切换体验优化（2026-10-28）

`done`（本地增量；整个 Phase 14 仍为 `in_progress`）。用户反馈历史版本切换不明显，要求在现有风格下优化易用性与流畅性。本轮沿用同一 P14-08 的历史弹窗，不新增 Phase、后端 API、依赖或右侧业务视图；上方已完成的领域树增量及其证据保留，不能代替本轮变更后的验收。交互真源见 [Branch 历史弹窗与纵向 Git DAG](../../design/web.md#branch-历史弹窗与纵向-git-dag)。

| 工作 | 验收目标 | 状态 |
| --- | --- | --- |
| 设计与计划 | 明确当前/请求中/成功/失败反馈与阅读连续性，保留直接切换和现有样式 | `done`（文档） |
| 切换反馈 | 行末常显操作、当前勾选、目标忙碌；顶部持续显示真实世界和 Hash，侧栏历史提示保留 Hash；返回最新不让摘要消失 | `done`（本地实现） |
| 流畅性与状态安全 | 可见行不强制居中，离屏行按最近边缘定位；无其他待切换目标时当前行不重复请求，同一在途目标不重发，当前行可替换其他在途目标；快速切换只接受最后一次有效结果，失败保留已确认上下文 | `done`（本地实现） |
| 验证与 Review | 定向组件/并发负路径、普通与内嵌入口、桌面及 320/375px、双语/双主题、键盘/焦点/减少动态效果；完整本地 `pnpm validate` 与最终 diff/独立 Review | `done`（本地） |

完成条件包括：慢请求能看见目标与忙碌状态；成功/返回最新后能辨认实际版本且弹窗保持打开；失败不预切上下文；共享 Head 或查看其他 Branch 历史不混淆当前世界；没有其他待切换目标时重复点击当前行、重复点击同一在途目标均不重发，点击当前行可替换其他待完成目标，反序响应不能覆盖最后一次选择；已经可见的行与分页阅读锚点不跳动，窄屏仍能看到明确动作。仅记录实际通过的本轮证据；本轮不执行 Commit/Push、远程 CI、部署或真实 ChatGPT 宿主验收。

本轮实现、Review 与完整本地门禁已完成，证据如下；只关闭本节历史切换体验增量，不据此关闭整个 Phase 14：

- **实现与定向回归**：DAG、状态摘要与侧栏定向 **34 项通过**；新增 `version-graph-integration` **3/3 通过**，使用真实 `WorkspaceShell` 与导航 hooks 连接当前 Q3 `GraphCanvas`。另有 `graph-feedback` **13/13 通过**，仅是同一工作区的图谱状态反馈接合 QA，不归为本轮实现 Graph。Review 发现的跨世界同 State 去重身份问题已修复并有回归覆盖，当前世界行可替换其他在途目标。
- **当前构建浏览器验收**：在主工作区 `/Users/yi/Code/KGOS` 当前 Q3 图谱与版本切换组合构建上，`knowledge-world-navigation` 与 `web-shell` **23/23 E2E 通过（22.9 秒）**，命令进程 exit 0、25.24 秒。原 4173 端口被其他发布验收占用，本轮未干预其进程；ignored Playwright 配置只调整到 4175 端口及独立报告目录，源码与执行仍在主仓库。结果和日志为 `.cache/version-switch-ux/e2e-main-result.json` 与 `e2e-main.log`。
- **现有本地页面观感**：999px 浅色/深色及 375/320px 浅色下，历史选择前后 viewport bounds 稳定、操作可见且页面无横向溢出；返回最新后的摘要持续显示由上述 E2E 验证，本轮观感脚本未测量返回最新后的 bounds。结果为 `.cache/version-switch-ux/local-visual-final-result.json`，截图为同目录的 `history-999-light-final.png`、`latest-999-light-final.png`、`history-999-dark-final.png`、`latest-999-dark-final.png`、`history-375-light-final.png`、`latest-375-light-final.png`、`history-320-light-final.png`、`latest-320-light-final.png` 和 `pending-final.png`。
- **最终完整本地门禁**：在主工作区 `/Users/yi/Code/KGOS` 的 dirty 组合工作树执行 **`KGOS_E2E_PORT=4175 pnpm validate`，exit 0，675.25 秒**；当时 HEAD 为 `0a963a0e2b26a254e2025f579952e295e4bee30a`，只标识验证基线，不是本轮创建的提交。**922 项输入前后无变化，`changed_inputs=[]`**；结果与日志为 `.cache/version-switch-ux/validate-result.json`、`validate.log`。最终 **68 文件 / 661 项测试通过、62/62 E2E 通过（34.4 秒）**；Go statement coverage **90.3%**，TS Statements **94.97%**、Branches **91.09%**、Functions **96.86%**、Lines **97.26%**，类型覆盖率 **99.74%**，重复代码 **0**。Browser/MCP 构建、类型、lint、文档、Go 常规/竞态/安全、依赖与许可证、diff 等原门槛均通过；生产 npm 依赖无已知漏洞，开发依赖仍有 **3 low / 6 moderate**，按原 high 门槛通过，不称零漏洞。
- **早期失败与收尾边界**：早期一轮 **636/636 测试通过但 Branch coverage 88.56% 未达 90%** 的结果保留在 `coverage-main.log`；两轮完整尝试分别 **exit 1，48.36/77.16 秒**，日志与结果保留在同目录的 `validate-attempt-1*`、`validate-attempt-2*`。第一轮停于新词汇拼写，第二轮在并行源码变化期间停于 ESLint；修正词汇并冻结源码写入后重新完整运行，最终固定输入结果已通过，旧失败不再代表当前状态，也不计为通过轮次。本轮实现与验证均在主仓库进行，未使用独立工作空间；未执行本轮提交、推送、部署、远程 CI、正式发布或真实 ChatGPT 宿主验收，其他任务造成的 HEAD 变化不归为本轮提交。

## 单画布搜索与图谱浏览增量（2026-10-28）

用户已认可 [Q3 Linkurious 风格](../../design/assets/web/Q3-linkurious-canvas-search.png)，并明确授权先更新设计/开发计划，再实现当前本地页面；随后确认本轮一起接入真实知识搜索与图谱浏览。本增量归 P14-04/05，不新建 Phase；当前 owner 为 [单画布合同](../../design/web.md#知识图谱画布与搜索)，替代旧 Q1/Q2 的顶部多行编辑器和可见结果帧流。左侧 V7 导航、历史弹窗与设置保持既有合同。

本轮范围为连续画布、顶部搜索输入/清空/快捷键、真实只读检索、typed 图投影、节点/关系点选与属性详情、有界邻居展开、局部布局、缩放/平移/适配，以及选择版本/换连接的请求隔离。图中演示数据不复制进产品或现有 Instance；实际验收数据仅在隔离临时 Runtime 创建。当前页面只读浏览，不新增搜索语言、后端 API、图库依赖、任意执行/写入入口或 UI 持久存储。

| 项目 | 工作与验收 | 当前状态 |
| --- | --- | --- |
| owner 与视觉材料 | 归档原始 Q3 PNG、来源及 Hash；同步单画布主结构与旧帧历史边界 | 已写入；文档检查与局部独立 Review 通过 |
| 三路混合检索 | 关键词匹配普通 Knowledge 节点 STRING 属性；全文 `FULLTEXT`/向量托管 `SEMANTIC` 节点索引；同 State、取消/预算、两层 RRF k=60 去重融合，每路完成即展示真实进度；界面呈现路级状态/数量 | 已完成本地实现与验收 |
| 画布与搜索外观 | 干净无点阵的连续画布、顶部居中单行搜索框、输入/清空/Cmd/Ctrl+K、右下局部控件；深浅主题、双语与 320px | 已完成本地实现与验收 |
| 真实图谱浏览 | 复用 SDK 固定节点/一跳关系查询，按真实 typed identity 投影；选择/详情/邻居、平行边/自环、局部布局与视口，不开放任意 Path 结果导入 | 已完成本地实现与验收 |
| 上下文与失败保护 | 同一 pinned State、连接/版本切换取消及 generation、零结果与失败/受限区分；取消清空本次状态与图，不写用户数据 | 已完成本地实现与验收 |
| 本地检查与 Review | 定向数据/组件回归、Web check、正式 Browser/MCP 双构建、隔离真实 Runtime E2E、桌面/窄屏视觉与 diff Review；完整仓库门禁按实际结果报告 | 本轮完整本地门禁、62 项 E2E 与 Review 通过 |

验收重点：搜索结果来自当前版本真实 Knowledge；不把普通业务 Map 或内部保留图伪装成 Knowledge；缺名称的节点仍可定位，类型与属性保持保真；关系方向/端点、自环和平行边准确；邻居范围和显示上限明确。新搜索、快速点选、展开、切版本、断连与重连的旧响应不能覆盖新选择；失败不写成空库，未知/部分响应不写成完成。属性读取与展开保留已有可用内容，控件不写知识库；历史弹窗开关、侧栏拖动和主题/语言切换不重跑查询或随意重置图相机。

本轮替代的旧验收是“每次查询必须另建可见帧、帧流中折叠/全屏与顶层 Graph/JSON”。原 P14-04/05 的固定 State、取消、完整/部分结果、typed 值、资源预算、真实集成与失败路径仍保留并用于当前画布；高级执行与可靠持久恢复继续在后续范围；本次只读增量完成不等于完整 P14-04/05 或整个 Phase 完成。

### 单画布增量本地实施与验收证据

**本次只读画布/搜索增量已完成本地实现与验收。** 结论只覆盖本节 Q3 范围，P14-04/05 的高级执行、通用 streaming/任意结果导入、可靠持久恢复等完整 Feature 尚未完成，整个 Phase 14 仍为 `in_progress`。

- **最终源码与完整门禁**：在主源码目录 `/Users/yi/Code/KGOS` 的 dirty 组合工作树执行 `KGOS_E2E_PORT=4175 pnpm validate`，exit 0，用时 **675.25 秒**。当时 HEAD 为 `0a963a0e2b26a254e2025f579952e295e4bee30a`，只标识验证基线，不是本轮创建的提交；本轮改动仍未提交。门禁记录 **922 项输入、changed_inputs=[]**，主任务另核对本轮 **184 项 Web 源码/测试/配置指纹，0 变化**。实际结果为 `.cache/version-switch-ux/validate-result.json`，完整日志为同目录 `validate.log`，不能用更早的导航/设置门禁替代。
- **构建、类型与质量检查**：类型、Lint、Markdown/拼写、secret、Browser/MCP/native 构建、Go 常规/竞态/安全、前端覆盖率、依赖边界、许可证、安全审计和 diff 均按原门槛通过。Go statement coverage **90.3%**；前端 **68 文件 / 661 项测试通过**，Statements **94.97%**、Branches **91.09%**、Functions **96.86%**、Lines **97.26%**；类型覆盖率 **99.74%（29491/29566）**，重复代码 **0 clones**，unused 检查通过。安全检查按现有门槛通过，不写为零漏洞；正式构建保留既有 >500 KiB chunk 警告。
- **完整浏览器回归**：最终 **62/62 E2E 通过（34.4 秒）**。另有最终专项 **7/7 通过（4190 端口，15.1 秒）**，覆盖真实鼠标点选关系、375/1100px 自包含 MCP UI，以及只关闭最上层历史弹窗后保留外层抽屉和焦点。该协议/浏览器 fixture 不等于真实 ChatGPT 宿主验收。
- **真实只读知识流程**：两项 Graph Runtime 用独立临时 Instance 与本地测试 Embeddings Provider 贯通三路真实查询、语义特有命中、融合去重、typed 属性、邻居平行边/自环和历史 State 隔离；不以现有 Instance 或生产模型承担写入验收，效果稿节点未写入本地用户知识库。搜索进度到达即可阅读，融合期间展开/隐藏有 UI 与 Hook 双层保护，完成后启用；取消清空、迟到响应和只读边界有定向回归。
- **Review 与先前失败闭环**：已修正鼠标点边的 pointer capture、拖动后键盘选择和移动端单次 Escape 同时关闭两层的问题；scene/layout 定向 **26/26** 通过，最终浏览器回归确认。早期 4173 端口占用、fixture 400 及一轮 61/62（375px 抽屉 Escape）属于修正前过程，已由最终真实流程和 62/62 结果闭环，不再是当前阻塞。
- **交付边界**：本轮已修改、已验证；未执行本轮 Git Commit/Push、远端 Docker/CI、部署、正式发布或真实 ChatGPT 宿主验收。其它任务带来的 HEAD 变化不归为本轮提交，本增量不关闭完整 P14-04/05 或整个 Phase。

设计/计划准备验证（2026-10-28 当前未提交工作树）：本轮路径的 Prettier check 与 `git diff --check` 通过；Markdownlint 实际检查 104 份 Markdown，0 问题；五份修改 Markdown 的 CSpell 0 问题；553 处本地路径及本轮新增/变化的 14 处路径/锚点核对通过，Q3 PNG 的原字节、尺寸、长度与来源 SHA-256 一致。局部独立 Review 已修正旧帧术语在当前草稿、键盘、连接和入口材料中的残留，再审未发现本轮必须修正的文档矛盾。这些只证明文档与材料准备，不计为搜索/图谱功能验收。

## 图谱直接操作体验增量（2026-10-28）

状态为 `done`（本地增量；整个 Phase 14 仍为 `in_progress`）。用户反馈现有图谱缺少 Neo4j 式双击/拖动体验，并要求优化直接操作；本轮沿用 Phase 14 的 Q3 单画布，不新建 Phase。[Web 直接操作 owner](../../design/web.md#图谱直接操作与自动布局)记录工程映射，不能写成用户逐项指定的手势、布局公式或新数据模型。首轮 Q3 的 661 项前端测试、62 项 E2E 与完整门禁保留为当时证据；本轮直接操作以以下新增实现、当前构建与实际交互结果独立验收。

| 项目 | 实施与验收目标 | 当前状态 |
| --- | --- | --- |
| 直接指针/触屏/键盘操作 | 节点/边单击详情，双击展开/再双击收起、Shift+Enter 与可访问替代入口；节点拖动固定、边或背景起点平移、光标锚点普通滚轮/捏合/双指、显式 fit/缩放与图内快捷键 | `done`（本地实现与实际交互验收） |
| 搜索种子自动连边 | 三路融合结束后，同 State 参数化读取两端均为最多 50 个命中种子的已有关系，最多 400 条边并识别受限；失败保留节点并单独重试，不引入外部邻居 | `done`（固定查询/预算回归与真实 Runtime） |
| 展开与局部操作生命周期 | 每节点在途去重、多节点并发独立、选择不取消其它展开、反序结果保护；收起保留种子、共享依赖及在途展开的真实发起节点；清空/搜索/切版本/卸载统一取消，隐藏可撤销最后一次 | `done`（并发、取消、隐藏/撤销负路径） |
| 跟手布局与相机 | 自动节点在图结构变化后短时有界松弛，新增邻居就近出现、人工固定保留、可解除固定与整理布局；避让节点/标题，fit 计入标题与曲线/自环；减少动态效果不动画，不无限调度，不因展开重置相机 | `done`（布局回归与真实浏览器） |
| 提示与回归 | 小浮层提示、双主题、桌面/窄屏、原有顶部单搜索布局；新定向测试、隔离真实 Runtime 与浏览器验收，已有本地 22 节点/36 关系演示图仅只读观察效果 | `done`（本轮门禁与独立 Review） |

验收需要真实鼠标双击、节点拖动、从关系起点平移、普通滚轮光标锚点、触屏双指，以及图焦点/可编辑输入/模态隔离；逐一核对 A/B 连续并发展开反序返回、同节点请求去重、收起仍保留搜索种子与共享依赖、隐藏后撤销、搜索种子自动真实连边及补读失败重试。搜索融合 busy 期间可阅读但不修改子图；两次节点点击不得误触发背景 fit，短移动不能丢失 edge click，拖动后的键盘选择仍使用实际位置。

本轮本地实现与验收完成，证据绑定 `/Users/yi/Code/KGOS` 当前未提交工作树（HEAD `0a963a0e2b26a254e2025f579952e295e4bee30a`）；仓库外保留本轮 187 项初始输入基线，最终源码与测试另有 943 项输入指纹记录。最后的状态/证据追加只涉及本节及 Web owner、开发路线三份文档。

- **构建与质量检查**：最终 `pnpm build` exit 0，普通浏览器与 MCP Apps 构建通过；三个 TypeScript 配置的 `pnpm typecheck`、全仓 `pnpm lint` 及随后变更路径的专项 ESLint/Prettier/CSpell 通过。依赖方向检查 0 问题，类型覆盖率 **99.76%**，重复代码 **0**，unused 检查 exit 0（仍有既有 `lefthook` 配置提示）。本轮未重跑完整 `pnpm validate` 或 Go race/coverage/security，不把此前完整门禁当成本轮结果。
- **测试与覆盖率**：最终 `pnpm test:coverage --maxWorkers=4` **76 文件 / 793 项通过，exit 0**；Statements **95.34%**、Branches **91.06%**、Functions **97.29%**、Lines **97.66%**，原 90% 阈值与用例超时保持。新增回归覆盖同 State 种子连边、节点/边身份与预算、并发展开反序返回、在途节点保留、隐藏/撤销、旧响应失效、菜单/快捷键/焦点、碰撞与自环适配、人工固定及减少动态效果。
- **当前构建浏览器验收**：`KGOS_E2E_PORT=4190` 下完整 Playwright **69/69 通过，52.0 秒，exit 0**，使用 4 workers 且未配置重试；其中图谱真实 Runtime 专项 **9/9 通过**。隔离临时 Instance 提供真实三路搜索、种子内关系、平行边/自环与固定 State，验证真实鼠标双击、节点拖动、关系起点平移、普通滚轮锚点、双指触屏、右键/键盘菜单、隐藏/撤销和实际 HTTP 反序响应；临时测试 Provider 不替代用户的外部向量服务验收。
- **实际预览与 Review**：本地演示搜索自动呈现 **22 节点 / 36 关系**；实际鼠标将“林澄”从 **1/0** 双击展开为 **4/4**，再双击收回 **1/0**。节点拖动 **60×40px** 后准确跟随并固定；普通滚轮从 **200%→134%** 时锚点误差小于 1px。键盘菜单首项聚焦、点击搜索关闭菜单并转移焦点已实际复核；深浅主题及 320/375px 无横向溢出，fit 后自环与标题不被搜索框遮挡。独立 Review 检查并修复了在途展开节点消失、修饰键误操作、菜单焦点/外部点击及适配边界，已检查范围内无剩余任务阻塞发现。

首次拼写、旧断言、菜单/触屏交互及末帧读取问题的失败日志和 trace 保留在 `.cache/graph-ux/`；已按实际交互修复后重建并复验。与 E2E 并行的早期覆盖率运行曾出现一个历史用例 5 秒超时，原断言独跑通过后，最终以 `--maxWorkers=4` 与全套浏览器顺序验收；拖动断言改为等待实际最终坐标，保留原 2px 精度及边跟随/固定/整理断言。最终日志为 `build-accepted.log`、`coverage-bounded.log`、`e2e-all-accepted.log`，早期失败不记为通过。

本轮数据与权限边界不变：补读、展开、固定/松弛布局和隐藏/撤销全部只读；现有本地 22/36 演示数据不改写，写入测试数据仅在隔离临时 Instance。演示环境的向量索引仍未配置，本轮不计为外部真实向量服务接入。尚未提交、推送、部署、执行远端 Docker/CI 或真实 ChatGPT 宿主验收；本节完成不关闭完整 P14-04/05 或整个 Phase 14。

## G6 图谱渲染与物理交互迁移（2026-10-29）

状态：`done`（已完成本地实现、专项与整站浏览器验收；整个 Phase 14 仍为 `in_progress`）；属于同一个 Phase 14 的局部增量，不重开 Phase。用户批准用成熟开源 G6 代替自研 SVG 绘制、指针与力导向引擎，以改善节点拖动时邻居实时跟随的物理手感。按 [Web G6 合同](../../design/web.md#g6-交互引擎2026-10-29) 实施，不改现有 Knowledge/Graph API、检索、分支、State 及发布路径。

验收覆盖：真实浏览器 Canvas 呈现与主题；节点拖动跟手并使至少一个自动邻居实时移动、松手固定及解除固定、自动排列保留人工固定；节点/边选择、双击展开收起、右键菜单/隐藏/撤销、连续图局部变更保持相机；滚轮锚点与画布平移、触屏捏合；键盘代理与焦点恢复、降低动态效果；切换 State/搜索/卸载清理无陈旧布局回流。按源码范围运行 Web 测试、浏览器真实 Runtime E2E、生产 Web/MCP 双构建、相关质量门禁及 diff Review，失败继续修复。此次不含 Git 提交、推送、部署或生产知识变更。

本地实现与验收证据（2026-10-29，Yi Mac 未提交工作树）：

- **渲染与交互**：`@antv/g6@5.1.1` Canvas、`d3-force`、`drag-element-force` 接管节点拖动和力导向，原自研 SVG 手势/布局/视口模块及对应旧测试退役。`graph-g6-*`、`graph-scene` 和 React Controller 保留固定 State / typed ID、非持久 Pin/Unpin、按需 Fit、节点与关系键盘代理及低动态直接拖动；邻居在拖动时实时响应、松手固定，并与四路检索、固定中心轻鱼眼和右侧独立卡片裁剪配合。背景平移、滚轮锚点、两指中点校正、双击展开/收起、右键隐藏/撤销均经过真实鼠标与触摸输入验收。
- **定向质量**：`pnpm --filter @kgos/web check` exit 0，**56 个 Vitest 文件、639/639 测试通过**，包含 TypeScript、ESLint、Prettier；根目录 `pnpm typecheck`、`pnpm lint` exit 0，`check:unused` exit 0，`check:type-coverage` 达 **99.75%**，`check:duplicates` 未发现重复代码。G6 依赖引入后 `check:licenses:npm` 核验 **129 项生产依赖**，并精确允许已核对的 `MIT AND ISC` 表达式。 仓库质量补查：`check:dependencies`、`check:diff`、`check:security` exit 0；安全审计生产依赖无已知漏洞，完整依赖无高危（尚有 3 项低危、6 项中危），仅将 Markdownlint 传递依赖 `re2js` 固定升级至已修复的 `2.8.7`，未扩大升级范围。
- **运行时构建与浏览器**：`pnpm build` exit 0（Go `kgosd`、原生 Jieba、Web 主入口与 MCP 内嵌入口）；在隔离临时 KG OS Runtime 上执行 `pnpm exec playwright test --config config/test/playwright.config.ts --workers=2`，**76/76 真实浏览器 E2E 通过**。额外重复验收：双击与 Shift+Enter **5/5**、背景平移 **5/5**、双指捏合 **5/5**，隐藏后撤销与新版卡片 Web Shell **6/6**。扩展的非图谱 E2E fixture 模拟只读最近 Graph Query，但仍保留 401/409 与 daemon boot guard 语义；未弱化浏览器手势或焦点合同。
- **边界与交付**：本次仅完成 G6 表现层局部增量，并核查任务范围 diff、调试日志与错误路径。完整 P14-04/05、持久 Web 功能、其余 Phase 14 业务验收和远程 CI / Dev / 真实 ChatGPT 宿主验收仍须独立取证；未提交、推送、部署，未修改正式 Knowledge。并行的四路检索、固定中心鱼眼和右卡片增量由其各自记录单独维护完成状态。

## 关系聚合布局与重叠避让（2026-10-30）

状态：`done`（本地 Web 表现层的独立增量；完整 Phase 14 仍为 `in_progress`）。用户反馈真实关系两端分散、长连线及交叉过多，并进一步明确要求尽量减少节点重叠；依照 [Web 布局设计真源](../../design/web.md#固定中心相关性布局与轻鱼眼2026-10-29) 的 2026-10-30 后续修正优化，不改变检索、知识图、State 或数据预算。

- **关系优先**：初始投影与显式整理布局按照当前真实已加载 Relationship 计算连通分组，组内按已有邻接、已放置邻居及连线交叉代价选择确定性的起始位置；不再使用搜索排名径向力拉散真实关联节点。G6 保留关系弹簧，但增强连边吸引与碰撞避让、减弱整体居中力；无需添加新图库、后端接口或领域模型。
- **减少重叠**：初始节点间预留 168 画布单位的中心距离；局部展开优先在真实发起节点周边寻找能同时避开原有节点及同批新增节点的环形空位，空间不足时扩大环距，并有保证结果完整的兜底位置。人工 Pin、旧坐标、相机、节点/边身份、低动态偏好和此前 210ms 拖动缓入缓出逻辑均保留。过密图仍可能存在个别关系线交叉，不宣称绝对无交叉。
- **测试与边界**：覆盖拓扑分组、行顺序不变性、已知/无效位置、无关系结果、200 节点关联图、不重叠和拥挤邻居插入；回归真实 Runtime 的拖拽、缩放、触屏、展开/隐藏、焦点、手动固定与松手稳定。只使用隔离测试数据，不写正式知识库，不提交、推送、发布或部署。根项目和当前浏览器验收的最终结论以本轮运行结果为准。

## 四路检索与固定中心视觉焦点（2026-10-29）

状态：`in_progress`（本轮源码与定向验收已落地，整体 G6 交互 / Web 完整门禁待并行迁移收尾）；仍归 Phase 14 P14-04/05。用户已确认“最近 X 条”在无关键词和有关键词时都执行，当前 X 为 200；另外三路用于关键词相关性，优先显示匹配节点、最近节点补齐画布。相关性高的节点靠近中心；视觉始终以屏幕中央为鱼眼中心，而非鼠标驱动。唯一设计真源为 [Web 搜索合同](../../design/web.md#搜索与局部探索合同)及[固定中心布局](../../design/web.md#固定中心相关性布局与轻鱼眼2026-10-29)。

实施：沿用 `graph.query` 参数化读操作和当前 State/取消/预算；新增最近查询，合并与匹配优先级，更新状态/中英文反馈及清空后的默认加载；复用当前 G6 迁移的投影与径向力，加入固定屏幕中心的轻度尺寸强调，保留人工拖拽与真实关系。G6 迁移属于其他并行工作，本增量避免覆盖其未提交成果；不改变 Kernel/API、Ontology、Index、持久存储或依赖。

验收：空关键词加载最近节点；带词四路都执行、RRF 命中优先且最近补位，索引缺失/Provider 错误/零匹配仍展示可用最近知识且语义提示正确；同 State、200/400 预算、全量与受限、取消/迟到响应、版本/连接切换；真实关系、移动/缩放后固定中心强调、相关性径向布局、触屏/键盘/低动态与 G6 正在交付的交互兼容。按定向测试、真实 Runtime 浏览器、双构建、相关静态/质量门禁及最终 diff Review 验证；不得把并行工作的测试证据误归于本轮。此次不提交、推送或部署。

本轮实测（2026-10-29，未提交的 Yi Mac 工作树）：

- 搜索与画布：`graph-queries.ts` 增加数值型 ID 长度优先倒序的最近 200 条 Cypher；`graph-search.ts` 在非空关键词时并发四路、空关键词时单独最近通道，匹配 RRF 排名优先、最近节点补满 200、按真实 identity 去重；维持只读 State、共享预算及取消。Web 首次进入/切换有效 State 自动查询，清空搜索恢复最近视图。接口和数据库 Schema 均未增加。
- 展示：已存在的 G6 `d3-force` 接入按排名递增的目标半径；在 `AFTER_DRAW` 等既有同步事件后以 `requestAnimationFrame` 合并计算屏幕中心节点/标签的静态尺寸，并平滑衰减至外围。不启用鼠标追随鱼眼或另一套独立物理引擎。投影不改 Knowledge Property；图谱同伴的尚未提交 G6 迁移文件及其变更继续保留。
- 定向验证：`packages/web/src/features/graph` 的 Vitest **13 文件、194/194 通过**；包含最近兜底、四路状态、最新 200 限制、RRF 优先、语义失败、取消/版本隔离、G6 布局与固定中心数学单测。Web TypeScript 检查 exit 0；本轮影响的代码 ESLint 与 Prettier 检查 exit 0。双入口 Web/MCP 构建以及包含 `kgosd` 与 Native 依赖的本地 `pnpm build` 已成功执行；修改后额外增加的空知识状态文案只通过后续定向检查，未再重新生成一轮嵌入式 Runtime。
- 真实浏览器：独立临时 KG OS Runtime / Lithograph / 测试 Provider 上，`graph-four-route-runtime.spec.ts` **1/1 通过**，覆盖无输入自动显示最近节点、非空关键词四路皆成功、清空回到最近、所有查询固定同一 State；修改前已有的 `graph-canvas-runtime.spec.ts` 按四路与最近补图断言更新后 **3/3 通过**。验证未使用生产知识库或付费外部 Provider。
- 未闭合：并行 G6 迁移现有真实浏览器拖拽用例仍复现“节点未固定”失败（在本次检索与鱼眼代码改动前亦复现）；本轮没有获得固定鱼眼在不同相机/视口下的独立像素级验收。完整 `pnpm --filter @kgos/web check` 遇到并行迁移代码新增的 `console.info` 诊断日志 ESLint `no-console` 失败；不冒称整仓门禁通过，也不改写其它任务的未提交调试代码。全 Phase 14 仍为 `in_progress`，未提交/推送/部署。

## 渐进式径向探索与图谱可读性（2026-10-29）

状态：`done`（本地增量已通过定向验收；整体 Phase 14 仍为 `in_progress`）。用户明确修正：**最多 200 个真实检索候选全部进入画布，可以超出屏幕，不能仅露出 10 个或增加“显示更多”步骤**。布局要有序且可拖动平移，允许用户自主移动到未显示在屏幕范围的节点；双击必须实际请求 KG OS 后端读取该节点的同 State 一跳邻居（最多 25 条关系），取得真实数据后才围绕目标环绕铺开，继续双击邻居形成下一层。为容纳全部种子后的新邻居，将合并画布预算调整为 400 Node / 800 Relationship；不改变四路检索和最近 200 候选合同。已有节点、相机及人工固定位置不被全图布局改写。单击与双击事件分离，选中时高亮直接邻居、弱化非相关元素；缩放时限制标签密度，改进拖拽可操作性。设计真源见 [径向布局与真实邻居探索](../../design/web.md#图谱直接操作与自动布局)。

验收：初始图直接呈现全部候选且不会自动将大图缩小到一屏；超过屏幕部分可通过拖动画布查看。200 个入口不会耗尽新增邻居空间。双击必须有真实后端查询并确认其原始 State、响应、真实节点与关系，绝不以前端推断补足；一跳的环绕位置及拥挤多圈为视觉排版而非虚构多跳；二次展开/收起、多起点共享节点、平行边/自环、可见种子和取消并发正确。双击不会弹出遮挡详情；节点/关系的一跳聚焦、空白恢复与键盘访问正确；拖拽跟手、局部邻居反馈、固定/取消固定、相机与卡片状态保留。运行图谱与 Web 定向单测、真实本地 Runtime 浏览器 E2E、Web 类型/静态检查/构建与 diff Review；不将未跑的验收记为通过，不提交/推送/部署。

实际验证（2026-10-29）：最新 `pnpm --filter @kgos/web check` 57/57 文件、646/646 测试全部通过；完整 `pnpm build` 通过；真实一次性构建的 Playwright 依次验证四路检索/卡片 2/2、独立临时 Runtime 超过 200 搜索入口后真实后端邻居环绕 1/1、G6 力反馈拖拽固定 1/1、双击与并发邻居 2/2、画布拖拽/缩放/隐藏/触屏等 5/5。回归旧断言仍期待双击自动弹详情，已按用户确认的“仅单击看详情”合同修正并复验通过。文档校验与 diff 检查通过。未提交、推送或部署；其他并行修改保持。

选中灰化修复验收（2026-10-29）：实际连续点击显示 G6 已把第二个节点的状态切换为 `selected`，但旧 `dimmed` 留下的 Drawable `opacity=0.16` 未恢复，导致节点及直接邻居仍显示灰色；为 Node / Relationship 的正常 G6 投影明确设置 `opacity=1`、`labelOpacity=1`，不改选择、检索、Knowledge 或相机。现有 54 节点本地页面复测两次选中切换，新选中节点的真实 Canvas 像素 alpha 从 41/255 恢复到 255/255，旧节点按设计淡化。最新完整 `pnpm build` 成功、`pnpm --filter @kgos/web check` 通过；独立 Runtime 的实际 Canvas 像素 E2E `graph-selection-opacity-runtime.spec.ts` 1/1 通过，图谱交互与本修复合计 8/8 通过；TypeScript、ESLint、Prettier、diff 检查通过。未提交、推送、部署。

## 跳数渐进聚焦与局部径向有序布局（2026-10-29）

状态：`done`（本地 Web 增量已验收；整个 Phase 14 仍为 `in_progress`），不修改底层图数据合同。沿用当前全部搜索入口可见、真实后端双击邻居、局部稳定画布，增加当前**已加载真实 Relationship** 上的 BFS 最短跳数可视层级：0/1 跳 100%，2 跳 65%，3 跳 40%，4 跳及更远 18%，未连通 12%。关系线按照两个端点距离较远者渐淡；选中关系以两端为 0 跳起点；空白选中取消所有灰化。节点和边仍完整保留，可由键盘访问，不创建不存在的知识。

单击时仅在关注节点附近按最短跳数布局 1/2 跳未 Pin 的节点：同层按原角度确定稳定次序，适当拉开可阅读间距；中心、3 跳及以外、Pin 节点和 G6 相机保持坐标不变，不重新渲染整个拓扑或修改 Backend。双击仍通过原只读真实一跳查询加载后插入邻居，成功时重算分层并保持来源/共享节点规则。验收覆盖环、自环、平行边、跨层边、断开分量、共享最短路径、单点/边/空白选择、连续切换透明度恢复、Pin/相机/后台请求稳定，以及真实页面的像素、布局与拖动回归。完成后复查设计与 diff；不提交、推送、部署。

本轮证据（2026-10-29）：`pnpm --filter @kgos/web check` 58/58 测试文件、650/650 用例通过，同时 TypeScript、ESLint 和 Prettier 通过；`pnpm build` 包含 Web、MCP、Runtime 与原生依赖构建成功。独立临时 Runtime 的多跳 BFS/画布实际 alpha/局部布局测试 1/1 通过，原图谱检索、边栏、真实邻居请求、拖拽、缩放、双击、并发、切换透明度恢复等 Playwright 回归 12/12 通过。当前 54 Node / 116 Relationship 的实际本地页面两次焦点切换，0/1/2/3/4+ 跳不透明度分别为 1/1/0.65/0.40/0.18；前两跳按角度移动、三跳及外未移动，G6 相机 Zoom 保持、单击不增加 Graph Query；未创建虚假节点或关系。文档质量、最终 diff 和当前工作树已核对，保留并行修改；未提交、推送或部署。

中心鱼眼强度微调（2026-10-29）：固定中心从 1.5 倍提升至 1.8 倍，外围仍为 0.82 倍，原影响半径与平滑过渡曲线不变；节点与标签一起放大，不改变位置、G6 相机、真实关系线、拖拽阻尼、边栏/卡片或后端数据。以 `graph-center-focus.test.ts` 覆盖中心、外围、连续衰减和文字尺寸；进行真实页面 Canvas 属性核查及定向 Web 检查，结果通过后再记录验收。未提交、推送或部署。

## 点击意图区分与渐进阻尼（2026-10-29）

状态：`done`（本地增量验收通过；整体 Phase 14 仍为 `in_progress`）。根据真实交互反馈，将简短节点单击与有意布局严格区分：普通单击、Enter 只选中、查看真实详情、计算已加载关系最短跳数并更新高亮/标签，**不得修改节点位置或开启径向动画**；持续按住主键满 280ms 或开始原生拖动时才启动已加载可达图的分层环绕。双击、Shift+Enter 继续原有 KG OS 后端一跳请求，查询成功后的新增节点仍通过既有受控局部布局进入画布。持续按住不会误开详情，右键/移动出目标/取消/卸载清理未到期定时器，拖动后不自动 Pin。

将弹性跟随系数与单帧移动上限按真实跳数分别递减：一跳优先响应，较远层越慢越滞后；**按住或开始拖动后约 210ms 平滑加速，松开鼠标、拖拽结束或取消手势时约 210ms 平滑减速到零**，缓出停止并保留当前位置且不自动 Pin，不再在松手后长时间收敛。减少动态偏好直接响应，但同样不允许普通单击触发布局。保留 G6 原生画布平移与节点指针跟手、显式 Pin/Unpin、固定中心鱼眼、全量真实节点、多跳高亮关系及卡片视觉样式，禁止增加数据库/API/知识语义。

验收：短按点击前后实际节点世界坐标全部不变，详情正确；按住门槛前无布局，达到门槛后布局启动且不误开详情；拖动期间目标紧随指针，1～6 跳跟随步幅依次下降，**长按或拖动启动时不得立刻跳到最高速度，松手后允许短暂缓出，但约 210ms 后必须完全停止**，300ms 与 560ms 世界坐标一致；松手可再次拖动、不自动固定，显式 Pin 保持；双击后端查询、视口、低动态、并发和取消不回归。单元、完整 Web 检查、真实浏览器 E2E、构建、最终 diff 与文档均需独立验证，未运行不得标记通过。本地改动暂不提交、推送或部署。

实际完成与验证（2026-10-29）：定向测试覆盖短按 120ms/长按 280ms/拖动开始三种时序，普通单击不触发位置变化或重新布局；本地真实图谱 54 Node / 116 Relationship 中短点击后 0 节点位移，长按启动径向整理，拖动目标跟随指针约 87px、缩放不变且未自动 Pin。六级阻尼计算有独立单测，远处节点逐跳减慢；六级关系线的强调色、不透明度和线宽有 G6 Options 单测。最新 `pnpm build` 完整通过；TypeScript、ESLint、Prettier 及文档检查通过。`pnpm exec vitest run --config config/test/vitest.config.ts packages/web/src --maxWorkers=2 --testTimeout=15000` 60/60 文件、659/659 用例通过；首次高并发下三个无关测试的 5 秒超时经隔离、限并发复验均通过，没有为测试负载修改业务源码。独立构建的 Playwright Runtime 共 12/12 通过，包含短点击保位、长按按层环绕、双击后端真实邻居、拖动不 Pin、画布平移/缩放、触屏、边栏固定 Canvas、透明度复原。早期 E2E 使用 Vite 开发模块路径，在生产包不可用，已将该测试改为读取生产可见的图谱代理、布局与 Canvas，精确 G6 配色由单测验证。保留其它并行工作树修改；未提交、推送、部署。

启动与松手缓入缓出（2026-10-29，已完成本地验收）：用户在“松手立即冻结”的验收后进一步要求两端都更自然。在现有 G6 局部弹性环绕上使用平滑阶跃包络：从按压长按触发或拖动开始时的 0 强度约 210ms 升至 1；松手后保留当时已达到的强度，约 210ms 内平滑降至 0 后停止，不把环状位置再吸附到预设终点。普通单击仍不布局，目标节点直接跟手，远跳更慢，显式固定与后端读图语义不变。验收需含包络曲线单测、真实 54 Node / 116 Relationship 画布中松手后少量缓出但 300ms 后稳定，并复跑实际构建、浏览器交互及 diff；先前“140ms 0 位移”的结果属于被新要求替代的历史验收。

本次验证（2026-10-29）：新增并通过平滑启动、松手衰减的确定性包络单测；当前已加载 54 Node / 116 Relationship 的浏览器实测显示，松手后每帧最大位移由前段约 15.23 个画布单位逐步降到中段 4.43、末段 0.59，约 260ms 后为 0，不再瞬间冻结或持续长时间漂移，人工 Pin 不变；拖动松手也会短暂缓出。最新完整 `pnpm --filter @kgos/web check`、`pnpm build`、文档质量检查和 `git diff --check` 均通过；生产构建的独立 Runtime E2E 13/13 通过，包括缓出停止、真实邻居展开、拖拽、缩放、触摸及边栏。曾偶发的缩放 E2E 改用无遮挡画布落点，并发读取 E2E 改用已有键盘展开入口；各自连续复测 3/3，鼠标双击仍由单独 E2E 验证。所有变更未提交、推送或部署，保留并行工作树修改。

## 右侧卡片内固定最大 Canvas（2026-10-29）

状态：`in_progress`（本地 Web 增量，不改变整体 Phase 14 状态）。用户最终确认右侧保留**独立可见的卡片左边框和圆角**，不能把整张卡片藏在覆盖侧栏后；卡片宽度随侧栏收放改变，图谱与搜索等内部内容的屏幕坐标不动，超出的部分由卡片裁剪。内部 G6 Canvas 固定为边栏收起时可用的最大视口尺寸，只有浏览器实际尺寸改变时才更新；边栏动作不调用 `resize`、重新 Fit、重新查询或重算物理布局。设计真源见 [固定中心相关性布局与轻鱼眼](../../design/web.md#固定中心相关性布局与轻鱼眼2026-10-29)。

实施范围限于外层卡片与内层知识画布的反向水平偏移、响应式宽度和 G6 状态变更去重；保留现有边栏动画、搜索框、原卡片视觉样式及其它同伴未提交的 G6 物理交互代码。不修改后端、Ontology、索引、测试 Instance 或依赖。

验收：侧栏展开时右卡片左边框、圆角和背景在侧栏右侧真实可见；边栏收起时卡片扩张，二者都不能使 G6 Canvas、搜索框、节点屏幕坐标或相机位移；卡片裁剪与右侧真实拖动有效。检查实际 Canvas DOM identity、宽高、Graph 请求、页面错误；浏览器窗口真正 resize 时图谱可更新自身尺寸。覆盖 1173px、902px、900px 与 375px 断点、正常/低动态、定向/浏览器测试、Web 类型/格式/构建及最终 diff Review。未提交、推送或部署。

## 画布背景还原（2026-10-28）

状态为 `done`（本地增量；整个 Phase 14 仍为 `in_progress`）。按用户批准的还原方案，恢复开发图谱卡片前的画布底色、蓝紫渐变与 20×20px 点阵，沿用原透明度、位置和尺寸；用户随后要求移除画布额外出现的整圈蓝色描边，因此仅取消画布本身聚焦时的整圈 outline，保留原 1px 卡片边框、圆角及节点/按钮焦点提示。当前搜索框、节点/连线和图谱直接操作保持。设计真源见 [单一画布与顶部搜索](../../design/web.md#单一画布与顶部搜索)。上方首轮 Q3 的无点阵外观及验收保留为当时记录，当前背景以本节对应的新决定为准。

验收覆盖浅色 `#F8FBFF`、深色 `#0C1530`，桌面与窄屏的视觉、文字/搜索框可读性，点击画布后、拖动后及键盘聚焦时均无整圈描边而节点及按钮焦点仍可见，拖动、缩放与右键操作，以及修改文件的格式、链接和 diff 检查。仅本地修改与验证，不新增公共 API 或数据结构，不包含提交、推送或部署；整个 Phase 14 仍为 `in_progress`。

本轮证据：恢复后的画布背景声明与改版前版本逐项一致；实际页面在 1280px 桌面、375px 与 320px 窄屏的深浅两种主题下，底色、三层背景、20×20px 点阵和原 1px 卡片边框均正确，无横向溢出。键盘聚焦画布后 outline 为 `none`，节点及按钮仍有焦点提示；真实演示仍为 22 节点 / 36 关系，节点拖动 45×25px 准确跟随并固定，滚轮缩放锚点误差小于 1px，右键菜单及 Escape 返回焦点正常。实际截图在仓库外保存，验证记录位于 `.cache/graph-background-restore/20261028T072719Z/`。

修改文件的 Prettier、文档 CSpell、Markdownlint（104 份）和包含未跟踪文件的 diff 检查通过。本轮为 CSS 与设计/计划修正，未新增测试或重跑完整 `pnpm validate`；上方图谱交互增量的 793/69 项记录保留为当时验收，不计作本轮重跑。

## 左边框导航入口统一（2026-10-28）

状态为 `done`（本地增量；整个 Phase 14 仍为 `in_progress`）。本轮移除画布左上角版本菜单及窄屏搜索框为其保留的空间，按 [Web App Shell 合同](../../design/web.md#前端代码架构)复用左边框弧形控制柄。桌面保持点击收放、240–420px 拖动及 16px 键盘调宽；窄屏保留覆盖式抽屉，统一由边框打开。保留已有工作树、历史验收及 Phase 14 的整体状态；不包含提交、推送或部署。

验收覆盖 320/375/867px、900/901px 断点两侧、桌面收放与调宽、抽屉/设置焦点恢复、历史弹窗逐层关闭、跨断点状态保留，以及中英文、深浅主题和普通浏览器/MCP 内嵌入口。运行 Web `check`、当前源码构建后的完整浏览器测试及文档/diff 检查；本节记录本轮结果，不以旧增量测试替代。

### 本轮实施与验收

- **实现与 Review**：Shell 按现有 900px 断点复用同一个边框柄；窄屏不调宽，ARIA 控制实际抽屉，抽屉与设置显式恢复到稳定入口。窗口变宽时关闭抽屉，保留桌面宽度/折叠及浏览上下文。复核当前改动及既有工作树，保留并行背景还原；未改变公共 API、依赖或知识数据。
- **Web 与浏览器**：Web `check` 的类型、ESLint、格式与 **692/692 Vitest（59 文件）**通过；当前源码重新构建后，`KGOS_E2E_PORT=4191 pnpm test:e2e --workers=4` 最终 **73/73 通过，43.0 秒，exit 0**，未配置重试。深浅主题下的 320/375/867/900px 边框连接、44×112px 命中区、搜索居中、键盘/触屏/遮罩均有实际浏览器断言；900/901px 切换保留状态。真实隔离 Runtime 验证导航开关不重查图谱或重置选择/相机；MCP 内嵌使用协议 Host fixture，不代表真实 ChatGPT 宿主验收。
- **失败闭环与证据**：首轮 69/73 中三项是模态打开后用角色定位背景入口的测试错误，改用稳定 DOM 定位；另一项平移提前读取倒数一帧，改为等待原精度的最终位移。后续深色边框的样式过渡也改为等待真实 CSS 状态，未削弱坐标或颜色断言。最终构建与验收期间 178 份前端输入指纹未变化；日志与基线保留在 `.cache/border-navigation/`。本次修改文件的拼写/格式、两份文档 158 个本地目标及新增章节锚点、diff 已检查。仅完成本地增量，未提交、推送、部署或执行远端 CI。

## 五分类设置增量（2026-10-25）

用户批准五类设置高保真并授权实现真实配置接入，本增量归同一 Web Phase。设计输入为 [五分类弹窗](../../design/web.md#五分类设置弹窗2026-10-25)与 [Runtime 设置管理](../../design/runtime.md#已初始化实例的-web-设置管理)；其余暂缓业务范围不变。

| 项目 | 实施与验收目标 | 状态 |
| --- | --- | --- |
| 真实配置接口 | 认证/同源/boot guard、effective/saved 与 revision、按组原子保存、冲突保护、秘密不回显、当前连接测试 | `done` |
| 五类设置 UI | 侧栏/窄屏入口、大弹窗、双主题/双语、真实偏好/配置/诊断、固定项与部署参数只读、未保存保护 | `done` |
| 配置与凭证维护 | 对外地址、缓存、额外扩展真实持久化；私有凭证单独更新，重启生效；外部环境不接管 | `done` |
| 本地验收 | 定向 Go/Vitest、安全及失败路径、隔离真实 Runtime 浏览器保存/重启、桌面/窄屏、完整质量检查与最终 Review | `done` |

本次不包含 Git Commit/Push、Docker/OpenClaw 部署、远端 CI、正式发布或真实 ChatGPT 宿主验收，不以本地设置增量关闭整个 Phase。本增量已完成本地实现与验收；整个 Phase 14 保持 `in_progress`，不替代其它 Feature 和远端验收。

### 设置增量本地交付证据

- **范围与来源**：当前未提交的设置工作树；沿用用户批准的大弹窗、固定五分类、右侧滚动与固定底部操作，普通浏览器接入真实配置，内嵌入口保留显示偏好与浏览器管理提示。对外地址、缓存、额外扩展和既有私有文件密钥可维护，模型/分词器与部署参数只读。
- **完整门禁**：最终 `pnpm validate` **exit 0**，检查期间记录的 **585 项源码指纹未变化**。包含 install、依赖、类型、全部 lint、Browser/MCP 双构建、Go 常规/竞态/覆盖率/安全、Vitest 覆盖率、类型覆盖率、重复/unused、Playwright、许可证、安全审计与 diff。首次覆盖率不足后补齐本次设置的失败路径和组件交互回归，未修改阈值。此最终结果基于并行 MCP 修正后的工作树；前节早期失败保留为当时证据，不代表本次最终结果。
- **测试与覆盖率**：Vitest **48 文件 / 416 项通过**；Statements **94.87%**、Branches **91.13%**、Functions **97.31%**、Lines **97.15%**。Go statement coverage **90.3%**，类型覆盖率 **99.75%**，重复代码 **0**。生产依赖审计无已知漏洞；开发依赖仍有 **3 low / 5 moderate**，按原 high 门槛通过，不记为零漏洞。
- **浏览器与真实保存**：最终全套 Playwright **51/51 通过**；设置专项 **3/3** 使用隔离真实 Go/Lithograph Instance，不拦截认证或设置 API，覆盖五组读取、私有 Key 不回显、地址/cache/extension 落盘、重启 effective/saved 归一、CAS、未知结果保护的组件回归、真实诊断、深浅主题/双语及 320px/375px。视觉复核后仅调整设置弹窗主按钮对比度，正常与 hover 均高于 4.5:1，并重建及复验专项。
- **当前开发预览**：`http://127.0.0.1:5173/` 已连接新版本地后端，保留原 `.kgos-dev`、端口与 Token；通过代理的认证设置读取已成功。重启前后配置/auth 文件 hash 与完整 Evolution overview 相同，未重置知识库或改写用户配置。证据保存在本地 `.cache/web-settings/acceptance/`。
- **Review**：独立 Review 与修正覆盖同源/Bearer/boot guard、revision 校验/原子保存、模型固定边界、URL userinfo 脱敏与无关字段保留、凭证来源/更新、不确定保存禁止重放及双主题/窄屏。已检查范围内无剩余任务阻塞发现；未执行本设置的提交、推送、Docker/OpenClaw 部署、远端 CI 或发布。

## Acceptance

以下是完整 Phase 14 实施后必须取得的证据，现仅认证前置、boot guard 与连接生命周期已有定向单测 / 浏览器 E2E 证据；其余业务、存储、预算及阶段验收尚未完成。验收引用 owner 的规则和工程初值；不另建第二份产品合同。

### A14-00 国际化基础与双语界面

1. `@kgos/web` 使用 `i18next` / `react-i18next` 与内置 `en`、`zh-CN` 资源完成首屏初始化；类型/资源测试检查 Key、插值参数及复数形式一致，组件和浏览器测试核对现有自有可见文案无漏译、原始 Key 或硬编码遗留。资源无需网络获取，不影响离线/同源内嵌 Web 加载；`app / features / core / shared` 依赖方向不回退。
2. 按“有效手动选择 → 浏览器有序语言列表 → `en`”验证 `en` / `en-*`、`zh` / `zh-*`、其它语言、空/异常/损坏偏好；`navigator.languages` 不可用时回退 `navigator.language`，非浏览器/SSR 渲染不抛错。切换后即时生效，刷新按同 origin 的有效偏好恢复，`localStorage` 不可用时能正常使用并回退。HTML `lang` 和当前语言一致，初次加载没有中英文闪烁；不会误把浏览器选择写入其它 Instance 数据库。
3. 当前桌面/窄屏 Shell、强制认证弹窗、加载/错误/帮助及其 `aria-label`、`title`、placeholder 在两种语言下完整可读。认证前切换无需提交 Token；认证后在设置的显示偏好中切换，窄屏通过固定设置入口进入；模态认证无法绕过，已有连接/草稿/输入/状态不会因语言切换重置。切换后已显示的错误即时重译，未知错误只显示当前语言的安全回退信息；不直接翻译后端自由文本。
4. 实际日期、相对时间、数字与数量使用当前语言格式化；静态提交示例的相对时间也由结构化值生成。用户业务文本、Branch/State/Ref、Cypher、JSON/YAML、API 错误码、配置键和协议字段保持原值，不因展示语言改变请求、保存内容或认证/OAuth 权限。
5. 针对两语言完成单测及浏览器交互：Web 现有认证前/认证成功后、语言来回切换、刷新/禁用存储、认证错误显示、键盘可访问、320 CSS px 与 200% 缩放的布局/溢出，验证单次语言变更不触发多余请求或意外重置焦点/对话框。不要求 Phase 17 的 Web Session 或 MCP 授权先完成；P14-00 的局部成功只证明国际化基础，不等于 P14-01–11 业务或整体 Phase 验收。

### A14-01 Daemon 存储与接口

1. 真实 daemon 经认证按需创建 `.kgos/web`；普通 SQLite/WAL、同步提交、私有权限、固定路径及同目录原子发布符合 owner。并发首次请求、I/O/空间失败和路径重定向不会发布半库、越界或泄露内容；Web 故障不阻断已有业务 API。
2. `info/list/read/save/delete/export` 与 `cache.write/read/clear` 经实际 HTTP/SDK 验证。记录 revision 无精度损失；list cursor 与分页快照绑定；save/delete 在同一 UI transaction 校验 CAS，确认不早于 commit。删除清空正文、保留墓碑，frame 删除使缓存 miss 并拒绝晚到写入。
3. UI 保存/删除/缓存不创建 Knowledge State、移动 Branch 或影响 Snapshot Diff/Merge。未完成/非法编辑文本可以保存；各预算、错误 envelope、不存在与 cache miss 不混用。
4. 缓存写入先有可靠保存的有效 frame 记录；完整 typed 结果原子发布，TTL/LRU、总量/单项限制与失败 miss 可验证。execute/部分/取消/截断结果不能被发布为完整只读缓存。
5. 首版建立 v1 格式，验证已有损坏、较新格式、databaseId 不符时保留原件和恢复边界；不虚构历史格式或强制建设无输入的迁移器，若实现明确升级则验证事务失败保留旧数据。不同 Workspace 隔离。压缩一致导出使用真实 driver 验证删除正文清理、无 WAL/secret 泄露、临时文件清理，备份失败不降级为普通原文件下载。
6. boot guard 在 Bearer 认证后、操作前执行；不同 boot 的读取和写入均被拒绝。`info` 在存储故障时仍能返回进程 guard；无 header 的既有 CLI/第三方合同保持可用。

### A14-02 SDK、连接与上下文

1. 新 namespace 复用 SDK 共享错误/协议解析，导出为 Web Platform Blob，无 Node-only 依赖。Web adapter 在 SDK 解码前按 owner 限制 JSON/NDJSON bytes/chunks，保留同一个 AbortSignal；下载流不进 JSON decoder。
2. 显式连接先取得 boot/store 诊断，再带 guard 访问业务 API。401 清除失效内存凭证；boot 变化停止旧连接所有服务器动作并保留输入；重启/复制目录复用端口与 token 的场景不误发操作。正常恢复须显式重新连接。
3. 根 Token 不进 URL、Cookie、browser storage、记录、导出或日志；服务端只保存 Session 摘要及根 Token 指纹，浏览器只保存受保护的 HttpOnly Session Cookie。刷新自动恢复有效 Session 并取得临时 Web Bearer，失效时才重新输入根 Token；主动退出须服务端撤销。UI store 不可用时仍可浏览 Kernel 数据，但依赖可靠草稿保存的提交不可绕过。
4. StateRef 成功解析后才切新上下文；失败保留可用旧视图，解析期间禁止依赖新上下文的执行。当前上下文、画布读取和对象选择的迟到响应只能更新对应 generation；A→B 后 A 的详情不覆盖 B。
5. 通过现有 ref 接口观察跨 Web/CLI 指针变化，只提示手动刷新；Tag/Branch 移动或本页写入不静默切当前 commit，不修改旧帧。所选 ref 被删除时标明引用不存在，原 commit可读则保留只读上下文，不自动回 main；目标 Branch不存在时保留草稿并禁止提交。

### A14-03 自动保存与恢复

1. 各 kind 与 draft subtype 保存完整原输入及其所需 metadata，收藏查询只填编辑器。已保存内容重新认证后恢复原位置；未确认保存才提醒离开，关闭事件不被当作最后保存保证。
2. 一条记录最多一个 in-flight save；新输入仍 dirty，旧响应只确认发送时的版本。lost response 用 `lastMutationId` 和内容核对，不能仅靠 revision 增长宣称保存成功；quota/I/O 失败保留旧确认版本和本窗口输入。
3. 两窗口不同记录可各自成功；同记录竞争保留双方版本，真实 CAS 冲突才比较/另存副本，不自动覆盖。旧窗口不能复活 deleted ID；storeId 改变先停保存。外部保存不替换当前窗口 State、语句或视口。
4. 恢复不自动执行查询/写入，不把别的窗口的运行中记录改成终态。缓存 miss 保留帧 metadata，按原 State 另建帧须用户触发；原 State 不存在仍保留输入，不转成当前 State。
5. Object、Merge、State Data 恢复分别在 P14-06/10/09 重读其权威数据后启用动作；UI revision 不替代 Knowledge baseState、Session revision 或不存在的 sidecar CAS。

<a id="a14-04-独立帧与执行"></a>

### A14-04 搜索与画布读取

2026-10-28 用户认可 Q3 并以单画布探索替代旧帧流；以下验收保留原协议与失败保护，更新可观察的主页面交互。原始帧方案保留于 [Web 历史参考](../../design/web.md#历史查询帧与执行参考)。

1. 顶部只有一个简单搜索框，输入/清空/快捷键/焦点反馈真实可用；模态、认证、其它输入及 IME 不被误触发。关键词、全文、向量三路按 owner 落实；不假定统一 `name/title`，不把当前屏幕过滤称为全库检索。
2. 三路搜索冻结同一输入与当前 immutable State：关键词仅按普通 Knowledge 节点的 STRING 属性做不区分大小写包含匹配，全文/向量发现真实可用索引后检索，按 State + identity 去重并以排名融合合并，不能直接相加不同量纲原始分数。无索引标未配置，一路失败保留其它真实已完成结果并明确部分检索。每次搜索通过现有只读 SDK 查询；新搜索、切版本、换连接使旧操作 generation 失效并使用同一 AbortSignal 取消。旧响应不会混入新画布或改写新搜索状态；失败保留仍有效的上下文与内容。
3. 当前固定 JSON 查询在核对列、rows、typed 值与返回 State 后才可用，区分零匹配、读取失败、未配置、在途及达到预算；每路完成即更新真实结果，不等待全部。取消真实 abort 并清空本次检索/图，不承诺保留逐路 cancelled 状态。后续流式接入仍需唯一 summary 与正常 EOF 后才标完整，分别验证缺 summary/EOF、terminal error 与断流；本轮没有据此宣称通用流式查询已接入。
4. 检验 owner 的当前工程初值：每路/融合最多 50 候选、全文/语义各最多 16 个真实节点索引、单次搜索查询并发 4、单请求 15 秒、浏览器 HTTP JSON 解码前 16 MiB、累计 rows 编码 32 MiB、一跳 25 条关系与画布 200 Node / 400 Relationship、属性深度 64/100,000 值。受限与失败如实反馈，不把累计读取量说成 heap/RSS 保证，不补造节点/属性/边或全库数量；全部操作只读。
5. 后续高级执行仍须显式 Branch、无 strict base 或自动重试；scalar/无 rows 使用真实 JSON/summary/counters，不造新 State 或 affected IDs。取消/断连的写入结果先核对，不能承诺回滚。此能力不从本轮只读搜索框顺带开放，需取得独立实现证据。

### A14-05 图阅读与预算

1. 用当前固定查询真实返回的 typed Node/Relationship 验证 State + element identity 去重、方向、自环/平行边、0 Label、缺失/不一致端点与 payload；普通业务 Map 不猜成图实体，内部保留图不冒充公共 Knowledge。本轮没有任意 Path 结果导入入口，不以单元投影工具能力替代该产品集成。
2. 当前画布只统计已显示子图；选择后按需查看完整 Ref/Labels/Type/端点/typed Property，大整数、null/absence、Temporal/Point/Vector 等编码不因显示或表单入口丢失。A→B 选择后 A 的迟到详情不能覆盖 B；高层不支持的原始值仍可阅读，编辑保持 Object profile 边界。
3. 邻居使用参数化有界 Cypher和同一画布 State，显示本次范围/上限；迟到详情、展开失败、超限只影响对应操作。保留已有位置与选择，新元素局部布局，不自动 fit，不绕过画布接收/显示预算。
4. 平移、节点拖动、缩放、回到选中与适配只改变视图，不写 Knowledge；侧栏/历史弹窗/主题语言等非图操作保持相机与选择，窄屏下搜索和控件不溢出，图与详情都有键盘入口。
5. 测量真实大结果的有界投影、按片段属性/JSON、可见范围渲染与堆内存/交互性能；后续持久缓存仍须完整记录、State 绑定及明确恢复，缓存 miss 不自动补跑。静态图和预算初值不能替代压力或可靠持久化证据。

### A14-06 Knowledge 草稿与提交

1. 只有显式编辑/新建/删除进入草稿；历史/Tag/明确 commit 阅读只读，用户另选/建 Branch 并取符合 head 的 base 才可编辑。原 base 与读取记录始终绑定原 State。
2. canonical base 来自同 State `readText`，Git Extended Diff 精确针对该正文；支持保留未编辑 typed value、无损编辑/null/absence、多个 target 和新节点/关系 alias。Node 0..N Labels、Relationship 单 Type与真实端点遵守 owner，无损能力不足的字段只读。
3. 验证改 Type/端点的直接 transition、新 alias 返回 Ref、显式删除关系、Node incident edge reject 及同 Patch 明确处理依赖；不得从局部图猜全库影响、自动 detach 或臆造派生 replacement mapping。
4. 预览是局部检查与已知影响，须确认具体变化/Branch/base；冻结内容和待核对标记可靠保存确认后，才发送一次同版 Patch。期间重复动作/修改受控；前置保存失败不发送，后置回执失败显示知识成功而 Web 记录未保存。
5. Branch 任意前进，包括无关对象变化，stale 仍拒绝；no-op 不创建 State。后端验证失败保留输入；响应丢失/取消先读 Branch、对象与历史核对，不盲目重试、自动 rebase 或猜 alias mapping。
6. 刷新恢复先重读原 base canonical bytes 和 Branch head；base 不存在/bytes 不符/stale 保留输入并禁止直接提交，只可明确对照新 base 手动重建。

### A14-07 本体图与模型变化

1. 全局/Domain 图直接表达 Definition、类型端点和组织关系；无 Domain、多父/cycle、域外端点、同名不同 kind、缺 title/description、未加载范围均可准确阅读。只做有界直接展开，Domain cursor 与 resolved State 配套，不冒充权限、namespace 或 Knowledge 边。
2. Node/Relationship Definition 详情以结构化 aggregate 读取并复用 Patch 提交；字段、Constraint、Index 内部编辑，组合字段顺序和共享 targets 完整保留。无独立 Index CRUD或 Markdown 解析保存。
3. Node/Relationship Definition 最后字段保护、nullable from/to、required/unique/key 与独立索引表达通过真实 API 验证；端点为 null 表示不限制类型，不造 Any Definition。Definition 声明字段不被显示为默认实例必填。
4. 用违规 Knowledge fixture 验证类型/required/unique/附加 Label/endpoint 收紧失败，保留草稿且不自动修复数据。共享 Index 删除从任一参与 aggregate 预览全部 targets并全局删除；修改 targets、复合规则、Range/Text/Point 的 local 边界分别验证。
5. identifying rename/Property renameFrom、title/description 修改、删除 Property/Definition 的依赖拒绝与同 Patch 处理、删除 Domain 不删成员均有证据。读取超限/invalid Snapshot 不能变成可保存的截断表单；原始 Graph 能力与高层一致性诊断分开。

### A14-08 历史与覆盖 DAG

1. 大历史、多泳道、fork/merge与未加载 parent 通过真实 ancestry验证：reverse-topological 顺序、完整已知 parent、继续加载标识、完整 State 键与去重均正确，不把轨道推断成 Branch 独占历史。
2. 列表/DAG只渲染可见范围及缓冲；首次请求使用解析后的 commit，翻页保留原 root 参数与 cursor，加载新 head 开新分页。覆盖直接用 Branch root 的接口回归：下一页不能改 root 为返回 commit仍沿用旧 cursor。文本搜索标明已加载范围；无匹配、跨过滤连接和直接 StateRef 定位不冒充全史搜索或造 parent。
3. 居中历史弹窗覆盖而不加宽导航/挤压画布；实际测量开关前后底层尺寸、图相机及选择不变，不自动 fit。运行中背景数据返回不引发缩放；关闭恢复列表锚点，选择连续且减少动态效果可用。
4. ancestry topology 与业务 history 分开；immutable 提交时间/摘要与 mutable ref/State Data 来源分开。切版本后画布读取使用新的 pinned State，旧请求/选择不混入；保留的历史读取记录仍绑定其原 State。

### A14-09 State、差异与 ref

1. State immutable metadata/parents、mutable State Data 分组；absence/null 和 set/clear、未发送输入保存恢复可验证。恢复先重读 sidecar、显式比较；现有 API 无 sidecar CAS，UI 不保证避免后端覆盖。sidecar 不创建知识 State或进入 Snapshot Diff/Merge。
2. 显式 `state.create` 复用既有参数与返回值，空 Snapshot delta 可有真实新 State；观察 parent 不伪装 caller CAS。Branch list/create/delete、Tag list/create/move/delete 接真实接口，操作后重读核对；不添加 Branch move/rename、ref cursor 或 expected-head 参数。
3. History/Diff scope、root/before/after与合法 object anchor 通过分页验证；翻页保留原请求参数 tuple，换参数废弃 cursor。History按 public Change 保留条目，同 State多条变化不得按 State去重；`scope=all`的空变化 State保留 `change=null` entry。已加载变更过滤不冒充全量。删除从 before、新增从 after 读取详情；部分 Change不补造完整对象，两侧合法 batch read 和失败可区分。
4. 空 Diff、缺失一侧、invalid State、读取失败、rename continuity 与同名不同 identity分别验证；结构化 Diff 不被当可提交文本 Patch，只有真实 continuity才连同一对象。

### A14-10 Merge Session

1. 开始与重开显示实际 pinned States、token/revision/status；conflicts 按 opaque ID 分页，absence/null、同 path 多冲突与 relatedRefs 保真，不猜共同基底或合并冲突身份。
2. resolve/finalize/abort 带实际 `expectedRevision`；resolve 更新 revision 后废弃旧 cursor。`MERGE_SESSION_CHANGED` 重读，`BRANCH_HEAD_MOVED` 保留方案并显式重建，不重放未核对 choice。
3. 未解决冲突/一致性失败不令 Branch 前进；实际 `up_to_date/fast_forward/merged` 分别验收，只有 merged 两 parent。结果未知先核对，不重复 finalize；关闭保留 Session，明确放弃才 abort。
4. Merge subtype 未发送文本可靠保存；恢复先 get/conflicts 核对 Session/revision/conflictId，已完成/消失/变化时保留输入，不能自动 resolve/finalize或套到新 Session。

### A14-11 端到端与交付

1. 扩展现有 Playwright 真实 Runtime fixture，使用 fresh Workspace、真实 Lithograph 和已认证业务 API 构建数据/版本。至少贯通：连接→选 State→真实搜索与单画布阅读→属性/邻居→Knowledge/模型编辑→预览确认→一次提交→显式刷新并隔离旧 State 响应→重新认证恢复；另贯通真实 Diff和有冲突 Merge。
2. 真实 daemon 验证 401、重启/换端口、store 故障、quota、stale、CAS竞争、cache miss和知识成功但 Web 回执失败；连接/协议故障可在 transport 边界注入，保留实际 Kernel 执行与结果核对。关键业务成功不能以 mock rows或截图替代。
3. 材料矩阵的 Q/E/O/V/R 功能与状态映射均取得对应证据；A1 随组件验收并最终联验。实际浏览器以 English / 简体中文覆盖关键业务流程、错误与提示、键盘主流程、图对象导航、focus trap/返回、Escape、减少动态效果、长文本、200% zoom与320 CSS px，测量对比与点击区，不以静态画板宣称达标。
4. 从构建后的同源内嵌产物和仓库外 packed Runtime 打开 Web 并做已认证操作；SDK新接口与现有 CLI/业务路径无回归，两个 Workspace独立 daemon/存储互不串用。源码 dev server成功不能替代打包交付。
5. 最终 Review 覆盖设计、源码/接口、恢复与安全边界、真实材料适用范围和证据；本轮范围的 task-affecting findings全部修正并复验，入口/owner/指南/状态按职责同步。

## 工程验证门禁

1. Feature 先运行针对性 TypeScript/Go测试与必要 daemon/SQLite/native集成；验证 CAS/并发、取消、失败原子性和恢复等实际风险，不为低影响样式编写镜像实现的测试。
2. 本地完整 `pnpm validate` 通过，沿用现有 Go格式/静态/race/coverage/security、TypeScript类型/lint/coverage/type coverage、依赖/重复/unused、build/exports、Playwright、native/package、license/audit及Markdown/diff门禁。当前仓库的 Go coverage基线90%、[TS coverage各维度90%](../../../config/test/vitest.config.ts)、[type coverage至少99%](../../../package.json)保持；历史达到100%不是另设阈值的依据，不通过排除业务代码降低覆盖要求。
3. 独立 fresh-source `pnpm run setup && pnpm validate`取得实际成功；不得依赖主工作树未纳入交付的文件、node_modules、cache或生成产物。具体执行按[开发指南](../../guide/development.md)，证据记录源码 revision/所应用 diff。
4. 仓库外 packed SDK/CLI/Runtime smoke覆盖内嵌 Web资产、连接、业务读取与 UI保存/恢复；真实本地浏览器覆盖关键写入和跨 Feature流程。
5. 当前 [公开 CI 模板](../../../distribution/.github/workflows/ci.yml)的 `Validate private source` 与 `Docker Linux amd64 integration` 必须在阶段交付 revision 上实际成功，私有仓库只负责同步生成内容。按 D99/D108，不再要求已取消的六平台 native/npm matrix；隔离 Linux Docker Smoke 补充 Web store/API/guard、静态资产与 SQLite/WAL/导出路径边界，浏览器业务 E2E 使用既有 Playwright runner。Mac 本地检查不运行 Docker，也不能替代远端 CI。
6. 新增前端/存储依赖若确有必要，纳入现有license/audit/build gates；继续同daemon内置分发，不新增独立hosting、发布平台或质量系统。Review后重跑受影响检查，最终完整门禁只在仍有效的交付revision上记录成功。

远端结果缺失或未成功时阶段不能标为 `done`。执行CI所需的提交/推送以及任何发布动作另按当次授权处理；本次计划编写不执行这些动作。

## Review Checklist

- 逐项对照 Web owner与材料矩阵：Q1/Q2→P14-04/05，E1/E2→P14-06，E3→P14-04，O1/O2→P14-07，V1→P14-08，V2/V3→P14-09，V4→P14-10，R1→P14-01/02，R2→P14-03及各任务恢复，A1→各Feature与P14-11；独立状态表不能遗漏或变成常驻异常页。
- 业务API是否复用真实SDK/HTTP合同；新增store/cache/guard是否全部到达Runtime、adapter、SDK和Web，而非只画按钮或写类型。
- pinned commit、summary+EOF、request generation、AbortSignal和预算是否在所有相关请求与迟到回调上成立；execute rows不被承诺为一致快照。
- canonical bytes、Git Extended Diff、Branch/baseState、记录CAS与Session revision是否各守自身边界；是否存在自动重放、覆盖、虚假成功/回滚或未知alias猜测。
- 模型图是否区分Schema identifying name、element identity、业务键、Definition端点和Knowledge端点；sharedIndex全局删除、Domain组织与Schema收紧是否准确。
- 覆盖DAG、分页/局部过滤、Diff合法anchor、Branch/Tag实际能力和Merge完成结果是否与真实接口一致。
- UI故障是否隔离Kernel；原件、输入、凭证、私有权限和导出清理是否在平台验证中有证据；维护API是否被扩成首版管理中心。
- 所有 KG OS 自有 Web 文案是否通过相同双语资源覆盖？`app/i18n` 是否为唯一初始化 owner，Key/插值/错误/日期与 ARIA 是否完整，切换与浏览器存储故障不会修改原始数据或凭证、破坏模态认证及布局？
- 实际测试范围、当前源码、运行环境和状态是否一致；旧Phase证据、静态材料检查或workflow配置是否被误写成本阶段成功。

记录finding的位置、依据、修正和复验。独立Review与作者自查均覆盖本阶段范围；全部已发现的task-affecting问题关闭后再审。无新证据或改动时不机械重复相同检查，也不声称系统绝对无缺陷。

## 完成条件

- P14-00–11真实实现，A14-00–11和工程门禁有对应实际成功证据；不得把未完范围移出本阶段或降低验收以标完成。
- 最终Review发现的问题闭环；设计/计划/指南/README/vlog按既有职责同步，阶段状态和实际产物一致。
- 本地、fresh-source、真实业务 E2E、当前 Linux amd64 Docker 交付与规定公开两 Job CI 结果适用于最终交付 revision；缺失证据保持 `in_progress` 或准确记录真实阻塞。本轮局部导航不宣称完成尚未实施的完整业务验收。
- Commit/push、版本发布与部署分别记录真实动作；它们不因本计划完成而自动执行，正式发布不是本阶段完成条件。

## 当前实现与验收证据

2026-10-15 **P14-08 紧凑版本导航局部实现，非完整验收**：普通浏览器 Web 在原认证连接上通过 `@kgos/sdk` 调用现有 `evolution.branch.list / tag.list / ancestry / get`，不新增 Runtime API、依赖或第二条传输。左侧默认全选分支、多选过滤、按已加载完整 State ID 去重的扁平 Commit 列表、真实 Parent Merge 判定、Branch/Tag 当前指针标签、提交摘要/时间、局部搜索、每分支固定 root/cursor 的有界增量加载、读取失败原列表保留与显式重试；桌面和窄屏抽屉共用数据和本地只读选择，选中前用 `get` 验证，失败不更新选择。已删除静态 Mock 版本数据，非连接状态不展示伪造历史。经本机真实 daemon 只读 API 和浏览器登录验证，历史输入 `commit/<64-hex>`、无 Parent 时 `null` 的 Go 编码已适配。**当前仅实现左侧导航自身的选中状态**，不代表已经接入未来图谱/查询帧的顶层 State 上下文；未实现完整 DAG、长历史虚拟渲染、外部 ref 变化观察或 UI 持久化。因此 A14-08 及整个 Phase 14 保持未完成，不能用版本浏览局部成功替代阶段验收。

2026-10-15 **ChatGPT MCP Apps 版本读取适配（Phase 14 局部增量）**：在已实现的 Phase 18 双入口与同一 Shell 上，为现有 `VersionReader` 增加 MCP Bridge 只读适配器，固定 `kgos_read` 脚本调用 Branch/Tag/Ancestry/Get，不调用 iframe HTTP API、不引入新 Tool/Token/后端 API；保留已有 `overview` 入口与右侧状态面板。Host 工具调用支持 AbortSignal，宿主拒绝请求或 MCP 服务端返回明确认证 / 授权失败码时失效连接并清除旧列表，普通工具错误保留可用历史与局部重试。复用普通 Web 版本组件及其分页 / 搜索 / 选择，不复制业务功能。代码与本地测试证据需按实际最终验证记录，不以 Phase 18 的历史客户端验收代替**本次新版界面的真实 ChatGPT 宿主验收**；未部署 Dev、未在真实宿主验收前不得称两个入口均已更新。

截至2026-10-11，本阶段业务功能实现仍未开始，P14-01–11及A14-01–11均待执行；当时页面仅为 Runtime shell。2026-10-13 提前实现静态工作台壳层，不包含 P14 的 API、数据、查询、图谱或编辑能力，也不代表任一 A14 已通过。原 `ready` 依据是设计、前置实现基线、实施依赖与验收计划齐备；现仍保持 `deferred`，不引用 Phase 13 的运行成功替代本阶段证据。

2026-10-04 计划编写时只修改计划与入口，未修改产品代码或图册，未运行产品测试、构建、fresh-source、packed或远端CI，未提交/推送。当时代码基线为`181628b45c1600476514dfc129a5053c6d394b9e`；设计输入使用当时未提交工作树的Web owner与相关引用。审核前后 Web owner、材料入口和资产来源记录 hash一致，Web owner SHA-256为`3a51ff3cb0e04070459e0f6a5a2fb553fc2f9aa99c04f97d8dc5432818fd2dab`；原有设计与资产改动保留。

2026-10-13 静态外壳最终范围：按 Q1 / V1 / O1 的整体分区与白 / 浅灰 / 蓝视觉，保留 56px 顶栏、280–340px 左侧版本区域、知识 / 本体顶层切换和右侧空白工作区；版本与工作区仅显示“待实现”。移除提前放入的查询帧、Graph / JSON、对象检查器、本体分组与模拟版本列表等内部业务布局。只实现全局框架，不引入模拟 Knowledge 数据、后端 API、UI 数据库、主题引擎或新依赖；本 Phase `deferred` 状态与 P14-01–11 业务验收标准不变。

初版静态 Shell 的 Mac 验证历史：Web TypeScript、ESLint、Prettier、Vitest 2/2、依赖边界、`pnpm build` 成功；当时内嵌 `kgosd` 的 Playwright Shell E2E 3/3 通过，仓库 TypeScript Vitest 105/105、全局覆盖率 Statements 98.02% / Branches 94.93% / Functions 94.73% / Lines 98.01%、类型覆盖率 99.70%、jscpd 0 clones 成功。这些是外壳收敛前的记录，不代替最终工作树验收；真正业务交互及完整 Phase 门禁仍未实施。

静态外壳收敛后重新验证：Web TypeScript、ESLint、Prettier、Vitest 2/2、依赖边界及 Vite Web build 均成功；Mac 上运行的 Vite 页面经 Chromium 在 1586 / 900 / 320 CSS px 验证三大分区、知识 / 本体顶层切换、无模拟结果帧、无水平溢出及无页面异常。仓库 Vitest 105/105、全局覆盖率 Statements 98.63% / Branches 94.93% / Functions 96.07% / Lines 98.62%、类型覆盖率 99.69%、jscpd 0 clones 成功；当前仅靠 SSR 单测计入的 Web 模块行覆盖率为 50%，真实顶层切换另由浏览器检查覆盖。未重新执行内嵌 Runtime E2E、全量 `pnpm validate`、fresh-source 或远端 CI，也未提交、推送及部署。

2026-10-13 前端基础完善（本轮独立于 P14 业务 Feature）：按已有 `app / core / features / shared` 依赖方向，把顶层 Shell 拆为 `app/layout/` 真实组件、`app/styles/` 设计变量与全局 / 布局 CSS，以及 `shared/ui/icon.tsx` 通用图标；移除单体 `app.css`。增加独立的 `pnpm --filter @kgos/web dev`（5174，纯 Vite）及 `check`（Web 类型、Lint、格式、单测），保留 `pnpm dev`（5173，与真实 daemon 一体化）和统一 `pnpm validate`。视觉对照 Q1、O1、V1 的顶栏 / 侧栏 / 主工作区比例、浅色分层及覆盖式版本框架；所有业务数据和功能区域仍留空。具体检查结果以本轮最终验收记录为准，此项不把 P14-01–11 或 A14-01–11 标成已完成。

2026-10-14 本轮 App Shell 视觉收敛：依据最新用户截图与反馈移除左侧版本栏的大卡片外框、背景及当前 Branch 的卡片高亮；保留可辨认的版本轨道与 Branches 预览。删除右侧独立头部，将主题切换移至侧栏底部（窄屏抽屉底部）；**右侧独立点阵画布占位卡片仍保留边框与圆角**，画布工具继续禁用。只变更 Web 布局、样式及其测试，不触碰业务 API 或其他 Phase。Web 专项 `check`（TypeScript、ESLint、Prettier、Vitest 5/5）、Web Vite build 通过；Chromium 在 1536 / 900 / 390 / 320 CSS px 验证主题切换、桌面折叠、移动抽屉、无横向溢出和零浏览器异常。针对真实 Runtime 的 Playwright 4 项尝试中仅旧 API 路由保护通过，另 3 项因 `serve:e2e` 使用旧打包 `kgosd` 内嵌的旧版 Web 资源而无法找到新界面元素；需待下一次正式打包刷新内嵌资源后复验，**不得记为已通过**。用户要求不跑整仓全量测试，故未执行 `pnpm validate`；无提交、推送或部署。

2026-10-14 左侧底栏视觉复核：把偏左、偏窄的紫色 Switch 改成展开态全宽、两等份的浅色 / 深色 Segmented Control；当前真实主题高亮，激活的选项重复点击无效果，原生 button 支持键盘操作。Collapse 独立居中占下一整行，与主题控件等宽；折叠侧栏使用紧凑单按钮，移动端抽屉复用双选项。仅修改 Footer 对应 React、CSS、单测和 E2E 断言。Web `check`（TypeScript / ESLint / Prettier / Vitest 5/5）、Vite build 及 E2E 文件 ESLint 通过；直接对正在运行的 Vite 页面用 Chromium 在 1536 / 1024 / 390 / 320 CSS px 核对宽度、居中、实际状态、键盘、折叠 / 恢复、移动抽屉和无横向溢出，且未见页面异常。画布几何不变；本轮未重新打包内嵌 `kgosd`，也未跑整仓 `pnpm validate`、提交或推送。

2026-10-14 侧栏边框控制柄优化：按本轮确认的高保真实现 `SidebarHandle`，替代历史底栏 Collapse / 72px 半收起。控制柄由外层 Shell 在右侧画布左边框垂直中心定位（40 × 62px，画布外层承载，不受 canvas overflow 裁剪），点击收起时版本区域真实宽度为 0，画布保留 16px 左外边距；再次点击恢复此前宽度。支持 Pointer Events 拖动（240–420px、超过 5px 区分点击与拖动）、键盘左右箭头每次 16px，以及 180ms 减少动态效果条件下的平滑过渡。窄屏延续原版本抽屉，控制柄隐藏；没有引入欢迎文案、业务画布或新依赖。Web 定向 TypeScript、ESLint、Prettier、Vitest 6/6、Vite build 及 dependency boundary 检查通过；浏览器在 1536 / 1024 / 901 / 900 / 390 / 320 CSS px 分别验证实际完整收起、居中、拖动、边界、键盘、宽度恢复、移动抽屉、无横向溢出及无页面脚本错误。认证模块正在其它未提交工作中变动，浏览器视觉验收仅在测试环境模拟认证成功；不是认证功能通过证据。未重建正式内嵌 `kgosd` 或运行完整 E2E / `pnpm validate`，也未提交、推送、部署。

2026-10-14 控制柄视觉微调（以上述尺寸与边距为旧实现记录）：根据实际浏览器截图把常驻亮紫色 40×62px 控制柄改成**28×44px 深色细边框外观 + 44×54px 透明命中区**，无常驻光晕；箭头缩小，Hover / Focus 才增强视觉状态。展开、收起的可见部分都位于画布左边框外侧，与边框相距 3px；完全收起后画布左边距改为 40px，控制柄不会被视口裁切。E2E 增加尺寸、外侧位置与收起状态的断言。已通过相关 Prettier / ESLint、Web Vite build、`git diff --check`；Chromium 在 1440 / 1024 / 901 / 900 / 390 / 320 CSS px 以隔离的模拟认证响应验证布局、点击、拖动、移动端抽屉、无水平溢出及无脚本错误。`pnpm --filter @kgos/web check` 仍因**并行国际化代码**给授权弹窗传入暂不支持的 `languageControl` prop，TypeScript 阶段失败，不能声明全量 Web Check 通过；未触碰该业务模块，也未运行内嵌 Runtime E2E 或整仓验证。

2026-10-14 侧栏控制柄高保真边框融合：根据用户最终认可的局部高保真，移除独立圆角按钮的轮廓、背景和投影，改为由 `SidebarHandle` 渲染一条与画布左边框无缝衔接的 SVG 弧线，边框中段向左凸出约 24px 后接回原线；同色填充局部遮盖原直线段，避免画布内叠层和双重边框。展开为向左箭头，收起为向右箭头；控制柄持续居中，展开侧栏默认 272px、调宽 240–420px，完全收起侧栏宽 0、画布左边距 48px。未增加依赖或业务数据，不改变认证、主题或移动端抽屉。已验证 `pnpm --filter @kgos/web check`（TypeScript/ESLint/Prettier、Web Vitest **53/53**）、Web Vite 生产 build 和 `pnpm check:imports`；直接使用运行中 5173 Vite，隔离的 Playwright `web-shell.spec.ts` **13/13** 通过，覆盖边框几何、轮廓描边与画布边框颜色一致、点击/拖动/键盘、响应式和认证保护的 Mock 场景。独立 Chromium 以测试响应在 1440/1024/901/390/320 CSS px 对照展开、完全收起、拖动、方向键及窄屏行为，截图放大复核轮廓连续且完全位于卡片外侧，未见横向溢出或脚本异常。未运行整仓 `pnpm validate`、重建正式内嵌 daemon、提交或推送。

2026-10-14 侧栏曲线进一步柔化：根据用户实际 Web 截图反馈“凸出太明显”，保持画布左边框连续轮廓与既有交互不变，仅将 SVG 轮廓外凸宽度由 24px 收至 **14px**，曲线高度由 86px 延至 **112px**，使用镜像的平滑三次 Bézier 过渡；交互命中宽度仍为 44px，箭头适当缩小并靠近边框。保留侧栏完全收起 / 展开、240–420px 调宽、键盘、暗亮主题与窄屏抽屉，不新增依赖或业务内容。Web 定向 `check`（TypeScript、ESLint、Prettier、Vitest **53/53**）通过；正在运行的 Vite 5173 上使用隔离的 API mock，Playwright `web-shell.spec.ts` **13/13** 成功，Chromium 对照 1280/1024/901/390px 的边框精确连接（offset = 0）、14px 外凸、点击、拖动、移动抽屉、无横向溢出及无脚本异常；已检查两种状态的局部放大截图。未修改后端、认证语义或提交 / 推送，未运行整仓全量验收。

2026-10-14 侧栏完全收起状态的画布边界修正：根据浏览器截图反馈，保留展开时轮廓向左凸出 14px；收起时只对同一 112px SVG 轮廓做水平镜像，让画布左边框**向右凹入 14px**，以页面背景填充凹入区域遮住原竖直边框，箭头移动至凹入中心并保持朝右。收起状态画布的四边距统一为 **12px**（原不对称的左边距 48px 已废弃）；展开态布局、拖动宽度、键盘、认证与移动端抽屉保持原样。未改动后端、公共 API 或依赖。真实 Vite 5173 上以隔离 Mock API 验证：1280/1024/901px 收起后 top/right/bottom/left 均为 12px、轮廓连接偏差 0、凹入 14px，桌面可恢复且无横向溢出；390/320px 抽屉正常。深浅主题的轮廓填充均与页面背景色一致，浏览器无脚本错误。Web `check`（TypeScript、ESLint、Prettier、Vitest **53/53**）、生产构建及 Playwright `web-shell.spec.ts` **13/13** 均通过；E2E 先发生过一次动画尚未结束便读取位置的断言失败，改为等待最终画布坐标后重跑全绿。仅执行本地 Web 专项验证，未跑整仓全量测试，未提交、推送或部署。

本次计划 Review 记录（当前本地工作树，2026-10-04）：

| 核对项 | 修正与复核结果 |
| --- | --- |
| 版本分页与 History 条目 | A14-08/09补清保留原请求参数、换参数废弃cursor；History按public Change保留同State多条变化与empty-delta entry。对照真实Kernel和Evolution owner复核通过 |
| 缓存依赖与格式范围 | A14-01补清先可靠保存有效frame再写缓存；首版建立v1，不虚构无历史输入的迁移器。接口/Runtime独立Review通过 |
| 跨客户端删除所选ref | 独立Review发现验收缺口，A14-02补齐原commit只读保留、不自动回main与不存在Branch禁止提交；修正后复核闭环 |
| 最终计划Review | 作者复读及四路独立Review覆盖设计材料、真实接口、高层编辑、依赖、状态与门禁；本轮已发现问题闭环，再审未发现剩余待修正项。结论仅针对计划，不证明产品实现已通过 |

文档检查：

- `pnpm exec prettier --check docs/development/phases/14-web.md docs/development/README.md`通过。
- `pnpm exec markdownlint-cli2 --config config/quality/markdownlint-cli2.yaml docs/development/phases/14-web.md docs/development/README.md`通过；配置同时带入仓库既有Markdown范围。
- 两个修改文档的CSpell检查通过；本地路径/锚点检查通过，共173处；11个Feature与11组Acceptance映射完整，无模板占位符。
- `git diff --check`及新增未跟踪阶段文件的`git diff --no-index --check`通过。后者无空白诊断、返回1表示新文件差异，不是检查失败。

2026-10-14 **Web 国际化文档增补与 Review（未开发）**：在 [Web 国际化 owner](../../design/web.md#国际化与语言偏好)确认语言范围、优先级、浏览器失效回退、前端职责、现有认证/未来 MCP 授权的显示边界后，新增 P14-00 / A14-00；原 P14-01–11、Phase 17 与 `deferred` 状态不变。检查两份语言资源仍属未来代码交付，不能将文档中的 Key/文案规则记作代码覆盖。对照现有 Shell/认证源码、CLI locale 与 Web/MCP owner 复核后，已修正底栏“仅主题”基线与新语言控件的表达冲突，并补齐非浏览器/SSR 语言检测降级。四份涉及文档的 Prettier、Markdownlint（仓库 61 份 Markdown）、CSpell 与 `git diff --check` 均通过；新增相对引用的 owner 标题和路径已核对。没有运行 Web 代码、浏览器、Docker、CI 或发布验收，也没有提交、推送。

2026-10-14 **P14-00 Web 国际化实现与定向 Review**：`@kgos/web` 已引入 `i18next` / `react-i18next` 和静态 en/zh-CN 资源；`app/i18n/` 统一识别有效手动偏好、浏览器语言及 English 回退，处理 localStorage 异常，更新 document `lang`/meta；当前 App Shell、桌面/移动版本导航、强制认证弹窗和正在开发的 MCP 连接授权弹窗改为双语言，错误保留稳定类别而非文案，示例相对时间/数量使用 `Intl`。语言切换不改变 Token、客户端连接、工作区状态或 OAuth 决策逻辑；`app` 拥有全局初始化，未把 `features` 依赖逆向指向 `app`。

定向验证（Mac 当前工作树，包含其它会话并行未提交变更）：Web `pnpm --filter @kgos/web check` 成功，Web TypeScript/ESLint/Prettier 与 Vitest **41/41** 通过；`pnpm check:imports` 无依赖违例；Vite 生产构建通过。真实 Chromium 以隔离 Vite 开发服务及随后 Vite 生产构建的 `vite preview` 分别运行 `tests/e2e/web-i18n.spec.ts`，**两次均为 5/5**：浏览器语言、手动偏好/刷新、错令牌重译与认证不可关闭、320 CSS px 抽屉、MCP 授权文案切换且无重复 OAuth 请求。仓库 `pnpm check:type-coverage` 为 **99.74%**；本轮 `pnpm test:coverage` 为 **146/146 成功**，Statements **96.16%**、Branches **90.44%**、Functions **95.80%**、Lines **97.74%**，均符合门槛。新增 i18next 依赖的 `pnpm check:licenses:npm`、依赖版本规范、CSpell 全仓与 `pnpm check:repo` 均通过。该证据证明当前代码的国际化基础与定向交互，不代替原 P14-01–11、真实 `kgosd` 内嵌打包、原生浏览器 200% 缩放、远端 CI 或完整 Phase 14 验收；未提交、推送或部署。

2026-10-14 5173 开发环境 Web Session 认证修复：核对 Vite 8 在 `server.proxy` 上默认 `changeOrigin: true`，会把转发到动态 daemon 的 `Host` 改为 daemon 端口，而同源浏览器请求的 `Origin` 保留 5173；后端按既有 Origin / Host 安全合同返回 403。仅在 `packages/web/vite.config.ts` 将 `/api` 代理设置为 `{ target: devEndpoint, changeOrigin: false }`，不放宽服务器校验、不更改 Token、Session 或业务接口。修复前 5173 代理的无效凭证请求返回 403、daemon 直连对应来源验证返回预期 401；修复后经代理返回预期 401。进一步用本地真实 Token、正确 Origin 的实际 Web Session 流程验证 login 200、Web Bearer `web.data.info` 200、带 Boot Guard 的 overview 200、Cookie restore 200、logout 204；独立 Chromium 直接走当前 5173 完成真实登录、工作区展示、刷新自动恢复、退出后重现认证弹窗，所有步骤通过，且无页面脚本错误。真实 Token 和 Web Session 均未输出，测试创建的会话已退出撤销。此证据仅针对本机开发代理与认证流程，不代表 Phase 14 业务功能完成；未运行整仓全量测试，未提交、推送、部署。

后续实际实施时，在本节追加各验收的场景/命令、环境、源码revision或所应用工作树diff、结果及报告位置；本次文档检查不得填作A14验收成功。

尚无必须追加产品决定的阻塞。产品实施与运行验收仍是待执行工作，不记作计划缺陷或已通过测试。
