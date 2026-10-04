# Web 功能设计材料

本文按 Q / E / O / V / R / A 管理 Web 的功能画板、组件变体与覆盖情况，阅读从功能和操作流程进入。[Web 设计](web.md)拥有交互语义；数据与写入仍以该文链接的 owner 合同为准。本页不另立产品规则，不表示页面、持久化 API 或动态验收已经实现。

## 功能覆盖矩阵

十四张功能 / 任务示意与五张独立状态组件规范均已保存并实际查看，共十九张 PNG。R1 / R2 四张材料已按用户最新简化决定替换；材料齐套不表示应用实现或真实交互验收完成。

完整浏览见 [Web 功能图册 PDF](assets/web/KGOS-Web-Design.pdf)：二十一页，封面 / 索引后为十三张功能 / 任务画板，附录为五张状态组件和 A1 适配规范。目录的十九个跳转、各图返回目录与二十八个书签按功能组织；PDF 只是本轮 PNG 的浏览集合，不另立语义真源。

阅读按功能进入：

- 主流程：V1 版本选择，Q1 / Q2 查询结果阅读，O1 / O2 本体阅读与聚合编辑，E1 / E2 显式编辑提交。
- 按需任务：E3 高级执行，V2 / V3 / V4 版本详情、差异与合并，R1 显式连接，R2 原编辑位置的自动恢复与真实冲突处理。
- 开发规范附录：A1 响应式 / 键盘适配与下列五张独立状态表；它们描述条件成立时的组件表现，不是额外导航页面或同时展示的异常卡阵列。

十四张功能画板不代表十四个顶级页面。[首版范围](web.md#信息架构与当前上下文)由 Web owner 规定：缓存自动管理，导入 / 导出、容量与整份清理不进入首版常用流程；不为旧图中的管理动作新增接口。

| ID / 功能 | 入口与操作 | 结果 / 恢复对应 | 画板与核对状态 | 语义真源 |
| --- | --- | --- | --- | --- |
| Q1 查询工作区 | 顶部编辑器运行；每帧重跑、折叠、关闭 | 多个独立帧的 Graph / JSON、各自 State；查询状态见组件变体 | [Q1 原图](assets/web/Q1-query-workspace.png)，已保存并查看 | [编辑器与帧流](web.md#编辑器与结果帧流)、[State 与重跑](web.md#state-固定与重跑) |
| Q2 全屏检查与邻居 | 全屏当前帧；检查关系与端点；展开邻居 | 保留帧选择和 State；未应用展开、退出、展开失败 | [Q2 原图](assets/web/Q2-fullscreen-inspection.png)，关系检查器修订已保存并查看 | [图投影与检查器](web.md#图投影与帧内检查器) |
| E1 对象草稿 | 检查器显式编辑；新节点 / 关系与删除入口 | 原结果与草稿分开；字段错误、删除依赖、保留 / 放弃输入 | [E1 原图](assets/web/E1-object-drafts.png)，字段错误组件修订已保存并查看 | [显式编辑](web.md#显式编辑工作流)、[删除影响](web.md#节点关系与删除影响) |
| E2 Patch 预览与提交 | 变更摘要与明确提交；按需展开 canonical / Patch，后台可靠保存 | 就地显示实际回执、no-op、stale、结果未知、知识成功但回执未保存 | [E2 原图](assets/web/E2-patch-submit-receipts.png)，已保存并查看；流程图不要求多步向导 | [草稿与恢复](web.md#草稿状态与恢复)、[保存与知识提交](web.md#保存与知识提交) |
| E3 高级执行 | 显式选择 Branch 与 execute 模式 | JSON / 实际写入摘要；取消或断连后的写入核对 | [E3 原图](assets/web/E3-raw-cypher-safety.png)，已保存并查看 | [高级执行](web.md#高级执行与无图写入结果) |
| O1 本体组织与导航 | 全局 / Domain 图；直接成员与端点导航 | 组织范围、多父 / 环、未加载与域外端点 | [O1 原图](assets/web/O1-ontology-organization.png)，中文修订已保存并查看 | [本体图谱](web.md#本体图谱) |
| O2 Definition 聚合 | 字段、Constraint、Index 在聚合内编辑 | 聚合预览；共享 Index 影响与校验失败 | [O2 原图](assets/web/O2-definition-aggregate.png)，共享全文索引类型修订已保存并查看；独立状态见组件变体 | [本体图谱](web.md#本体图谱)、[Ontology 公共格式](ontology.md#公共可编辑格式) |
| V1 列表与覆盖 DAG | 左侧紧凑列表展开为纵向 DAG | 选择、分页范围与关闭恢复；底层查询布局保留 | [V1 原图](assets/web/V1-version-overlay.png)，已保存并查看 | [紧凑列表](web.md#紧凑提交列表)、[覆盖 DAG](web.md#覆盖式纵向-git-dag) |
| V2 State 与版本操作 | State 详情、业务历史、Branch / Tag、State Data | immutable / mutable 区分；显式操作与原上下文保留 | [V2 原图](assets/web/V2-state-detail.png)，版本操作修订已保存并查看 | [State 详情](web.md#state-详情与两-state-差异)、[Branch / Tag](web.md#branch-与-tag)、[Evolution](evolution.md#evolution-公共调用合同) |
| V3 两 State 比较 | 明确 before / after 与 scope；选择 Change | 两侧属性与缺失侧、空 Diff、详情读取失败 | [V3 原图](assets/web/V3-state-diff.png)，已保存并查看 | [State 差异](web.md#state-详情与两-state-差异) |
| V4 Merge | 开始、冲突选择、resolve、finalize / abort | Session revision 与实际完成状态；并发变化后的核对 | [V4 原图](assets/web/V4-merge-session.png)，已保存并查看；独立结果见组件变体 | [Merge Session](web.md#merge-session) |
| R1 本地连接 | 简短 dialog 显式连接与重新认证 | 就地短提示；凭证不可用、离线、连接变化后的重连 | [R1 原图](assets/web/R1-local-connection.png)，简化版已保存并查看；独立状态见组件变体 | [连接与恢复](web.md#连接认证与恢复) |
| R2 自动恢复与真实冲突 | 原查询 / 编辑位置恢复，小保存标识；真实冲突才比较 | 保留输入、缓存缺失后的原 State 新跑、实际 CAS 冲突处理 | [R2 原图](assets/web/R2-workspace-recovery.png)，简化版已保存并查看；无管理 / 导出 / 恢复中心，独立状态见组件变体 | [持久记录](web.md#持久记录与可丢弃缓存)、[库绑定与恢复](web.md#库绑定格式与恢复)、[多窗口保存](web.md#受控-api-与多窗口保存) |
| A1 适配规范附录 | 重排、焦点进入、关闭与返回 | 帧内检查器、长文本、表单与二维画布的不同布局 | [A1 原图](assets/web/A1-responsive-accessibility.png)，已保存并查看；开发规范，非独立用户功能 | [键盘与响应式](web.md#键盘与响应式) |

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
| R2 | [保存与恢复状态](assets/web/R2-states.png)：保存中 / 已保存、暂未保存、内容变化、提交未知、断连；简化版已保存并查看 | 条件成立时就地反馈，不建管理 / 导出 / 恢复中心；实际内容 / CAS 冲突才局部比较。暂未保存的重试只适用于确定失败，保存或提交未知先核对，不盲目重复写入；Web 错误映射与持久化 API 已接入，实际验证见 [Phase 14](../development/phases/14-web.md) |

没有独立状态表的变体由主图内嵌组件或矩阵链接的规则说明；链接到规则不等于该状态已经另行出图。图中的示意数字不能代替本次请求的实际返回范围或后端验收证据。

## 图示简化与实现约束

- R2 / A1 的缩略结果帧未完整展开原语句头；实现必须复用 Q1 帧组件，保留该帧原语句、固定 State 与独立动作。A1 的“视口内 3 / 18”是可视范围，不是查询结果截断为三个节点。
- Q1 状态表的数值 ID 与 JSON 只解释界面状态，不是 wire 示例；canonical Ref、typed value、序列化和 summary 后确认 State 的合同仍见 [查询状态](web.md#查询状态与反馈)与 [Graph](graph.md#graph-公共调用合同)。
- Q1 状态表“显示上限”的 22 行是独立显示预算示意输入，不是所示无过滤 Cypher 对基准库的预期总量；真实运行使用返回计数。E3 完成卡的“查看摘要”对应实际响应的 `state` 和 counters，顶栏 S4 仍是旧只读帧的 State。
- V2 创建 State 的“来源 / Parent”是所选 Branch 的观察值，不增加 `from/parent/baseState` 参数或调用方 CAS；结果 State 以 `state.create` 返回为准，实际 parent 通过该 State 的详情确认。
- E1 / O2 的“保存草稿”与 E2 保存步骤表达可靠保存能力，不是首版提交前必须另点的保存操作；实现用原编辑位置的自动保存与小标识，完整 YAML / Patch 和技术详情按需展开，不复制常驻向导或回执页。
- R2 的“提交修改”先进入本次变更预览与确认，继续遵守 E2 的可靠保存、canonical Patch 与 strict base，不表示一键跳过审查；B 只在另一窗口更新同一草稿的实际 CAS 冲突时出现，草稿保存不创建 Knowledge State。
- 少量被模态面板遮挡的背景箭头不定义新关系、方向或数据；真实样例见 [Web 样例](web-examples.md#有向关系与属性)。
- R1 / R2 简化版只展示日常连接、自动保存恢复与必要反馈；没有管理中心或常驻异常卡阵列，缓存预算、库绑定、格式迁移与诊断仍遵守 Web owner 的内部合同。

## 原件与来源

PNG 按原字节保存，未裁切、重画或重编码。每项 Library 来源、版本、原文件名、字节数、尺寸与 SHA-256 见[来源记录](assets/web/sources.json)；PDF 单独记录来源、页数与对应 PNG 哈希。消费者已在 Mac 检查文件长度、PNG chunk 校验、图像解码及来源属性，再实际查看；最终 PDF 检查了完整文件、二十一页可读渲染、目录 / 返回链接与书签。PDF 全页栅格化、无字体对象，Mac 渲染检查不等同于在所有 iOS 设备上验收；这些检查只针对材料，不是应用动态验收。

Q1 当前主图返回 Lumen-7B 的出向 TRAINED_ON / EVALUATED_ON 子集，显示 **7 Node / 6 Relationship**；另一帧为 S2 下的 Paper 查询。它们不代表整个 18 / 22 样例子图，图内 JSON 不替代正式 Graph 响应编码。基准数据与版本场景见[一致评审样例](web-examples.md#结果帧样例)。

原有 `query-workspace.png` 与 `overlay-drawer-review.png` 文件保持原位置与原字节。本入口只按功能组织本轮材料，旧合集 PDF 与多轮稿件不混入正式图集。
