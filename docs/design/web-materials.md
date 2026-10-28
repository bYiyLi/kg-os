# Web 功能设计材料

<!-- cspell:words Linkurious -->

本文按 Q / E / O / V / R / A 管理 Web 的功能画板、组件变体与覆盖情况，阅读从功能和操作流程进入。[Web 设计](web.md)拥有交互语义；数据与写入仍以该文链接的 owner 合同为准。本页不另立产品规则，不表示页面、持久化 API 或动态验收已经实现。

## 功能覆盖矩阵

既有十四张功能 / 任务示意与五张独立状态组件规范均已保存并实际查看，共十九张 PNG；2026-10-25 另补 V5 知识世界导航图，见下文补充，共二十张 PNG；随后补充最终 V6 平铺展开与满高导航，共二十一张 PNG；2026-10-28 补充 V7 领域树与居中历史弹窗两张，并补充 Q3 单画布搜索稿，共二十四张 PNG。R1 / R2 四张材料已按用户最新简化决定替换；材料齐套不表示应用实现或真实交互验收完成。

完整浏览见 [Web 功能图册 PDF](assets/web/KGOS-Web-Design.pdf)：二十一页，封面 / 索引后为十三张功能 / 任务画板，附录为五张状态组件和 A1 适配规范。目录的十九个跳转、各图返回目录与二十八个书签按功能组织；PDF 只是本轮 PNG 的浏览集合，不另立语义真源。

阅读按功能进入：

- 当前主流程：V7 Branch / 领域树与历史选择，Q3 搜索与单画布知识探索；后续 O1 / O2 本体阅读与聚合编辑、E1 / E2 显式编辑提交按仍有效的 owner 合同实施。Q1 / Q2 与 V1 的旧主页面布局保留为历史材料。
- 按需任务：E3 高级执行，V2 / V3 / V4 版本详情、差异与合并，R1 显式连接，R2 原编辑位置的自动恢复与真实冲突处理。
- 开发规范附录：A1 响应式 / 键盘适配与下列五张独立状态表；它们描述条件成立时的组件表现，不是额外导航页面或同时展示的异常卡阵列。

十四张功能画板不代表十四个顶级页面。[首版范围](web.md#信息架构与当前上下文)由 Web owner 规定：缓存自动管理，导入 / 导出、容量与整份清理不进入首版常用流程；不为旧图中的管理动作新增接口。

| ID / 功能 | 入口与操作 | 结果 / 恢复对应 | 画板与核对状态 | 语义真源 |
| --- | --- | --- | --- | --- |
| Q3 单画布搜索与探索 | 顶部简单搜索；整卡片知识图谱、局部点选与邻居展开 | 当前 State、真实 typed 数据、按需详情与局部相机；具体三路混合检索由 owner 维护 | [Q3 高保真](assets/web/Q3-linkurious-canvas-search.png)，用户已认可，原图已保存 | [当前单画布合同](web.md#知识图谱画布与搜索) |
| Q1 查询工作区历史方案 | 旧顶部编辑器与逐次独立帧，已由 Q3 替换 | 状态/取消/协议约束仍作参考，不要求当前主页面恢复帧流 | [Q1 原图](assets/web/Q1-query-workspace.png)，历史材料 | [历史查询帧与执行参考](web.md#历史查询帧与执行参考) |
| Q2 全屏帧历史材料 | 旧帧内检查/邻居；当前对象阅读改按 Q3 按需详情 | 关系端点、同 State 与展开失败保护仍有效，帧外观不再适用 | [Q2 原图](assets/web/Q2-fullscreen-inspection.png)，历史布局 | [当前单画布合同](web.md#知识图谱画布与搜索)、[原图投影语义](web.md#图投影与帧内检查器) |
| E1 对象草稿 | 检查器显式编辑；新节点 / 关系与删除入口 | 原结果与草稿分开；字段错误、删除依赖、保留 / 放弃输入 | [E1 原图](assets/web/E1-object-drafts.png)，字段错误组件修订已保存并查看 | [显式编辑](web.md#显式编辑工作流)、[删除影响](web.md#节点关系与删除影响) |
| E2 Patch 预览与提交 | 变更摘要与明确提交；按需展开 canonical / Patch，后台可靠保存 | 就地显示实际回执、no-op、stale、结果未知、知识成功但回执未保存 | [E2 原图](assets/web/E2-patch-submit-receipts.png)，已保存并查看；流程图不要求多步向导 | [草稿与恢复](web.md#草稿状态与恢复)、[保存与知识提交](web.md#保存与知识提交) |
| E3 高级执行 | 显式选择 Branch 与 execute 模式 | JSON / 实际写入摘要；取消或断连后的写入核对 | [E3 原图](assets/web/E3-raw-cypher-safety.png)，已保存并查看 | [高级执行](web.md#高级执行与无图写入结果) |
| O1 本体组织与导航 | 全局 / Domain 图；直接成员与端点导航 | 组织范围、多父 / 环、未加载与域外端点 | [O1 原图](assets/web/O1-ontology-organization.png)，中文修订已保存并查看 | [本体图谱](web.md#本体图谱) |
| O2 Definition 聚合 | 字段、Constraint、Index 在聚合内编辑 | 聚合预览；共享 Index 影响与校验失败 | [O2 原图](assets/web/O2-definition-aggregate.png)，共享全文索引类型修订已保存并查看；独立状态见组件变体 | [本体图谱](web.md#本体图谱)、[Ontology 公共格式](ontology.md#公共可编辑格式) |
| V1 版本拓扑历史材料 | 旧紧凑列表与覆盖式纵向 DAG；当前入口由 V7 替换 | 选择、分页范围与关闭恢复；底层查询布局保留 | [V1 原图](assets/web/V1-version-overlay.png)，已保存并查看 | [紧凑列表](web.md#紧凑提交列表)、[覆盖 DAG](web.md#覆盖式纵向-git-dag) |
| V2 State 与版本操作 | State 详情、业务历史、Branch / Tag、State Data | immutable / mutable 区分；显式操作与原上下文保留 | [V2 原图](assets/web/V2-state-detail.png)，版本操作修订已保存并查看 | [State 详情](web.md#state-详情与两-state-差异)、[Branch / Tag](web.md#branch-与-tag)、[Evolution](evolution.md#evolution-公共调用合同) |
| V3 两 State 比较 | 明确 before / after 与 scope；选择 Change | 两侧属性与缺失侧、空 Diff、详情读取失败 | [V3 原图](assets/web/V3-state-diff.png)，已保存并查看 | [State 差异](web.md#state-详情与两-state-差异) |
| V4 Merge | 开始、冲突选择、resolve、finalize / abort | Session revision 与实际完成状态；并发变化后的核对 | [V4 原图](assets/web/V4-merge-session.png)，已保存并查看；独立结果见组件变体 | [Merge Session](web.md#merge-session) |
| R1 本地连接 | 简短 dialog 显式连接与重新认证 | 就地短提示；凭证不可用、离线、连接变化后的重连 | [R1 原图](assets/web/R1-local-connection.png)，简化版已保存并查看；独立状态见组件变体 | [连接与恢复](web.md#连接认证与恢复) |
| R2 自动恢复与真实冲突 | 原查询 / 编辑位置恢复，小保存标识；真实冲突才比较 | 保留输入、缓存缺失后的原 State 新跑、实际 CAS 冲突处理 | [R2 原图](assets/web/R2-workspace-recovery.png)，简化版已保存并查看；无管理 / 导出 / 恢复中心，独立状态见组件变体 | [持久记录](web.md#持久记录与可丢弃缓存)、[库绑定与恢复](web.md#库绑定格式与恢复)、[多窗口保存](web.md#受控-api-与多窗口保存) |
| A1 适配规范附录 | 重排、焦点进入、关闭与返回 | 帧内检查器、长文本、表单与二维画布的不同布局 | [A1 原图](assets/web/A1-responsive-accessibility.png)，已保存并查看；开发规范，非独立用户功能 | [键盘与响应式](web.md#键盘与响应式) |

## 知识世界导航补充（2026-10-25）

用户已确认 [V5 知识世界与版本高保真](assets/web/V5-knowledge-world-sidebar.png)，展示日常浏览、世界选择器展开及历史版本浏览三个状态。V5 替换 V1 中默认多 Branch 筛选入口的呈现，不替代 V1 的版本拓扑规则；产品语义由 [版本区域](web.md#版本区域)维护，实施与验收见 [Phase 14 本轮增量](../development/phases/14-web.md#知识世界与版本导航增量2026-10-25)。图中的世界名称、版本说明、Hash 和时间均为示意，不建立额外数据字段。

此 PNG 由本次 image_gen 生成并按原字节保存，尺寸、字节数及 SHA-256 已加入[来源记录](assets/web/sources.json)。既有 PDF 未重建，不包含 V5；本节补充图与 owner 文字共同定义本轮材料范围。

## 平铺展开与满高导航定稿（2026-10-25）

此节保留旧视觉基线；导航内容与历史入口由下方 V7 替换。用户当时已确认 [V6 平铺世界与满高导航](assets/web/V6-flat-world-sidebar.png)，替换 V5 的下拉入口。世界同级平铺、最多一个展开，版本缩进一层并用满可用高度；溢出时导航内部滚动，加载更早版本位于已加载历史末尾，底部只保留设置。主题、语言和退出登录移入现有设置弹窗。图中名称、版本说明、时间及 Hash 为示意，不增加世界元数据。规范见 [版本区域](web.md#版本区域)，代码与验收见 [平铺导航增量](../development/phases/14-web.md#平铺世界与设置入口收敛2026-10-25)。

原 PNG 字节与来源、尺寸、SHA-256 已加入 [来源记录](assets/web/sources.json)；既有 PDF 保留原版，不含 V5/V6。

## 领域树与 Branch 历史弹窗（2026-10-28）

用户已确认 [V7 领域树导航](assets/web/V7-domain-tree-sidebar.png)和 [V7 居中历史弹窗](assets/web/V7-branch-history-dialog.png)。导航展示 Branch → Domain → 子 Domain；历史从 Branch 行末图标进入居中 Git DAG 弹窗，替换 V6 的常驻提交列表和旧靠左历史抽屉。深浅主题、画布、弧形控制柄与底部设置沿用当前风格。图中的领域名、包含关系、Branch、Commit 与时间均为示例，不写入真实 Instance。

弹窗图只作为弹窗布局、轨道和节点信息的视觉依据，其遮罩后的背景仍是修正领域树前的旧示例；实际侧栏以 V7 领域树图和 [Web owner](web.md#版本区域)的同 State、多父/循环规则为准，不由图片限制底层模型。实施与验收见 [Phase 14 增量](../development/phases/14-web.md#领域树与-branch-历史弹窗2026-10-28)。

两张原 PNG 按字节归档，来源、尺寸、字节数与 SHA-256 已追加至[来源记录](assets/web/sources.json)。既有 PDF 不重建，不包含 V5/V6/V7；视觉材料确认不等于实现、运行或动态验收通过。

## 单画布搜索与 Linkurious 风格（2026-10-28）

用户已认可 [Q3 单画布与顶部搜索框](assets/web/Q3-linkurious-canvas-search.png)，并授权先更新设计/计划后实施真实搜索与图谱浏览。右侧整张圆角卡片是一块干净、无点阵的连续图谱画布；顶部只有居中悬浮的简单搜索框，底右保留局部缩放/适配。参考 Linkurious 的小纯色节点、细灰有向边、清晰选中态和按需属性详情，不复制完整企业调查工具栏。左侧仍以 V7 领域树/历史弹窗为准；Q3 替换 Q1/Q2 的多行编辑器、独立结果帧流、知识/本体 Tab 与常驻详情列。

图中节点名、业务关系、分类色、快捷键提示与数量用于解释视觉，不建立通用 Schema 或索引规则。实际产品只呈现真实数据；关键词＋全文＋向量三路混合检索、State/identity、预算、取消与局部探索由 [Web owner](web.md#知识图谱画布与搜索)维护，实施/验收见 [Phase 14 本轮增量](../development/phases/14-web.md#单画布搜索与图谱浏览增量2026-10-28)。

参考来源为 [Linkurious 官方工作区](https://doc.linkurious.com/user-manual/latest/page.html)（2026-10-28 核对）；其视觉只作用户选择的设计参考，不引入产品依赖、许可承诺、搜索语法、写入能力或完整面板。Q3 原 PNG 按字节归档，image_gen 来源、尺寸、字节数与 SHA-256 已追加至[来源记录](assets/web/sources.json)。既有 PDF 保留原版，不包含 V5/V6/V7/Q3；图片认可不等于代码或动态验收通过。

## 组件变体

| 所属画板 | 独立状态与材料 | 范围 |
| --- | --- | --- |
| Q1 | [查询状态组件](assets/web/Q1-states.png)：接收中、零行完成、取消、错误、部分结果、显示受限 | 六个互斥组件实例，不是同一帧同时处于六种状态；JSON 是界面阅读示意，真实 Ref、typed value 与序列化按 [Graph 合同](graph.md#graph-公共调用合同)和 SDK |
| E1 | 原图底部：新节点、关系编辑 / replacement、删除依赖、字段错误 | 与主草稿分开的局部输入变体；空关系 Type 才报错，`parameters=seven` 为合法 STRING |
| E2 | 原图底部：成功、stale、no-op、知识结果未知、知识成功而 Web 回执未保存 | 每次提交只呈现实际对应状态；操作仍由 [保存与知识提交](web.md#保存与知识提交)规定 |
| O1 / O2 | 原图内的 Domain / Relationship Definition 变体 | 组织和 Definition 的示例输入，不是 Kernel 固定业务模型；未将额外示例字段或组织名称写成公共默认 |
| O2 | [定义编辑状态](assets/web/O2-states.png)：共享索引全局删除、模式收紧拒绝、标识更改依赖、删除依赖、最后字段保护、可空端点 | 六个独立输入与状态；模式收紧的违规数据明确是独立变体，主样例不因此改写；依 [聚合编辑](ontology.md#共享资源与聚合编辑)和 [Definition 格式](ontology.md#公共可编辑格式)审阅 |
| V4 | [合并结果与并发状态](assets/web/V4-merge-outcomes.png)：三种互斥完成结果、Session revision 变化与 Branch head 变化 | 主图 A 是合并前的 S2 / S3，B 是独立同属性冲突输入；图中 `finish` 是完成动作标签，对应 SDK `finalize`，`finalState` 是展示标签，真实返回字段为 `state`，不新增 API 或 wire 字段 |
| R1 | [连接状态](assets/web/R1-states.png)：离线、凭证无效、连接变化；简化版已保存并查看 | 状态规范采用简短反馈，boot ID 与原始 code 不作日常主显示。离线的“已保存内容”以本窗口已连接并加载过内容为前提；刷新后需重新认证才能读取 daemon 持久记录。动态 loopback、内存 token 与内部 guard 合同保留 |
| R2 | [保存与恢复状态](assets/web/R2-states.png)：保存中 / 已保存、暂未保存、内容变化、提交未知、断连；简化版已保存并查看 | 条件成立时就地反馈，不建管理 / 导出 / 恢复中心；实际内容 / CAS 冲突才局部比较。暂未保存的重试只适用于确定失败，保存或提交未知先核对，不盲目重复写入；Web 错误映射与持久化 API 仍是待实现工程合同 |

没有独立状态表的变体由主图内嵌组件或矩阵链接的规则说明；链接到规则不等于该状态已经另行出图。图中的示意数字不能代替本次请求的实际返回范围或后端验收证据。

## 图示简化与实现约束

- R2 / A1 的旧缩略帧不再要求当前主页面复用 Q1 可见帧容器。当前读取仍保留原输入、固定 State、独立取消与选择生命周期；A1 的“视口内 3 / 18”是可视范围，不是查询结果截断为三个节点。
- Q1 状态表的数值 ID 与 JSON 只解释界面状态，不是 wire 示例；canonical Ref、typed value、序列化和 summary 后确认 State 的合同仍见 [查询状态](web.md#查询状态与反馈)与 [Graph](graph.md#graph-公共调用合同)。
- Q1 状态表“显示上限”的 22 行是独立显示预算示意输入，不是所示无过滤 Cypher 对基准库的预期总量；真实运行使用返回计数。E3 完成卡的“查看摘要”对应实际响应的 `state` 和 counters，顶栏 S4 仍是旧只读帧的 State。
- V2 创建 State 的“来源 / Parent”是所选 Branch 的观察值，不增加 `from/parent/baseState` 参数或调用方 CAS；结果 State 以 `state.create` 返回为准，实际 parent 通过该 State 的详情确认。
- E1 / O2 的“保存草稿”与 E2 保存步骤表达可靠保存能力，不是首版提交前必须另点的保存操作；实现用原编辑位置的自动保存与小标识，完整 YAML / Patch 和技术详情按需展开，不复制常驻向导或回执页。
- R2 的“提交修改”先进入本次变更预览与确认，继续遵守 E2 的可靠保存、canonical Patch 与 strict base，不表示一键跳过审查；B 只在另一窗口更新同一草稿的实际 CAS 冲突时出现，草稿保存不创建 Knowledge State。
- 少量被模态面板遮挡的背景箭头不定义新关系、方向或数据；真实样例见 [Web 样例](web-examples.md#有向关系与属性)。
- R1 / R2 简化版只展示日常连接、自动保存恢复与必要反馈；没有管理中心或常驻异常卡阵列，缓存预算、库绑定、格式迁移与诊断仍遵守 Web owner 的内部合同。

## 原件与来源

PNG 按原字节保存，未裁切、重画或重编码。每项 Library 来源、版本、原文件名、字节数、尺寸与 SHA-256 见[来源记录](assets/web/sources.json)；PDF 单独记录来源、页数与对应 PNG 哈希。消费者已在 Mac 检查文件长度、PNG chunk 校验、图像解码及来源属性，再实际查看；最终 PDF 检查了完整文件、二十一页可读渲染、目录 / 返回链接与书签。PDF 全页栅格化、无字体对象，Mac 渲染检查不等同于在所有 iOS 设备上验收；这些检查只针对材料，不是应用动态验收。

历史 Q1 主图示例返回 Lumen-7B 的出向 TRAINED_ON / EVALUATED_ON 子集，显示 **7 Node / 6 Relationship**；另一帧为 S2 下的 Paper 查询。它们不代表整个 18 / 22 样例子图，图内 JSON 不替代正式 Graph 响应编码。基准数据与版本场景见[一致评审样例](web-examples.md#结果帧样例)。

本入口按功能组织当前材料，旧稿不进入正式图册。历史稿件若需追溯可从对应 Git 提交恢复，不作为现行 Web 设计依据。
