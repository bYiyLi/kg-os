# 工程映射与实现待办

本文件只记录 KG OS 已确认设计到实现之间的 **readiness、projection/compiler mapping、adapter mapping 与实现顺序**。它不能重新定义 [架构](architecture.md)、[Ontology](ontology.md)、[Object](object.md)、[Graph](graph.md) 或 [Evolution](evolution.md) 的产品语义。

## 剩余依赖与工程合同

以下问题属于实现 readiness、compiler / projection mapping、adapter mapping 或实现级持久化设计，**不等于对应产品语义或 logical model 未设计**。判断是否真的出现新设计缺口时，必须先回看该主题所属章节和已确认 Decision；如果 logical state、ownership、identity、lifecycle 与公共 logical wire 已经明确，而只剩底层 projection、字符串常量、adapter carrier 或 operation mapping，则按工程问题处理，不重新向产品层提问。

| 已确认，不因本节重新打开 | 剩余依赖 / 工程工作 |
| --- | --- |
| Object logical state / owner、ObjectRef、canonical YAML / JSON、list/search/read/patch logical wire | Lithograph Cypher 25 Schema / current-graph `SHOW` result → owner-only `structure` projection / normalization 与反向 compiler mapping |
| StateRef、Graph query/execute、Evolution read/mutation、pagination、公共 error envelope 与 [`kg` CLI command contract](cli.md) | CLI parser / I/O / NDJSON / exit-code 实现；SDK / HTTP / Skill 的 adapter-specific route / method / metadata carrier 与 usage docs |
| Object Patch 的 Git Extended Diff、strict base、logical delta、derived migration、conflict/all-or-nothing 语义 | logical slot → explicit transaction 内标准 Cypher 25 mutation 的 statement planning、alias/result capture 与测试矩阵 |
| internal semantic graph 的职责、隔离、一致性不变量与 `__kgos_` v1 persistence encoding | bootstrap Schema、migration 与 consistency checker 的实现和验证 |
| Evolution Merge Session、conflict projection、incremental resolution、revision-bound candidate validation / finalize | Lithograph raw logical slot → KG OS `MergeConflict` projection、candidate consistency-check query plan 与 adapter workflow tests |
| `kgosd` local daemon、configurable IPv4 HTTP bind、`127.0.0.1:4765` default、`~/.kgosd/` home、Web/API same-origin、v1 no-auth | HTTP route / handler、process lifecycle、`daemon.json` maintenance、Web asset packaging、Knowledge Base target/layout 与开发/分发方式 |

1. **Schema projection / compiler mapping**：Definition / Property / Graph Type / Constraint / Index 的 `structure` 已确认只投影 Lithograph owner state。实现使用 Lithograph Cypher 25 Schema 与 current-graph `SHOW` public surface，把返回结果归一化成 owner-only logical slots，并为 editable slot 建立反向 Cypher compiler 与 round-trip tests；这属于 KG OS projection/compiler 工作，不再要求一个额外 KG OS-specific Schema API。若实现证据表明某个已确认 owner state 确实无法由 Lithograph public surface 无损读取/修改，再以具体底层缺口处理，而不是预先发明第二套 Schema AST。
2. **Object Patch compiler implementation mapping**：本文已经冻结 parse → exact apply → Object Value → explicit delta → derived migration → logical-slot conflict → candidate validation → `tx_begin(expectedHead=baseState)` → 标准 Cypher 25 mutation → `tx_commit` 的语义。剩余是每个 logical slot 的 statement planning、request-local alias 到 Cypher-created identity 的 result capture、Ref transition、错误映射与测试矩阵，属于工程设计/实现，不再要求产品层逐项选择。
3. **Merge projection / validation mapping**：Evolution Merge 的 Session lifecycle 已确认；实现只需把 Lithograph conflict logical slot 转换为公开 Object/Knowledge `MergeConflict`，并在 exact session revision 上执行 Binding coverage / reserved internal Schema / graph consistency checker。无法安全映射的 raw/internal conflict 返回 `CONSISTENCY_ERROR`，不把内部 slot 暴露给调用方，也不由 KG OS 猜 resolution。
4. **Adapter contracts**：CLI command / argument / stdout-stderr / input-source contract 已由 [CLI](cli.md) 冻结；daemon transport / home 已由 [本地运行时](runtime.md) 冻结。剩余是 TypeScript parser、stdin/file、JSON/NDJSON、HTTP client、具体 route / handler 与 Web adapter 实现。Skill、SDK、HTTP 与 Web adapter 仍需把已确认 logical wire 映射成各自 method / route / metadata carrier 并建立 usage/reference 文档；任何 adapter 都不能重新定义能力语义。
5. **Human-facing Web**：Object / Graph / Evolution 的查看、管理和纠正交互可以在核心能力实现后按真实用户流程设计，不阻塞 Kernel / CLI / SDK 的数据与版本合同。
6. **`kgosd` runtime implementation**：v1 已确认 IPv4 HTTP、configurable `server.host/server.port`、默认 `127.0.0.1:4765`、`~/.kgosd/`、same-origin Web/API 与 no-auth；实现剩余是 HTTP route / streaming handler、配置加载、host/port bind validation、port bind fail-fast、`0.0.0.0` 的 local-connect mapping、`run/daemon.json` 生命周期、日志输出、Web asset serving、process start/stop/status 与 package/distribution。Knowledge Base 在 `data/` 下的具体 target/layout 在对应产品设计冻结前保持独立 gap。上层 client 始终没有直接 SQLite / Lithograph 访问路径。

以上剩余项按真实实现依赖解决，不作为继续产品讨论的默认议题。只有实现证据表明现有产品合同无法唯一决定行为，并且不同答案会改变调用方可观察语义时，才升级为新的产品设计决定。

## 工程实现待办

实现顺序应建立在 Lithograph 对应公开能力真实可用的基础上，具体 readiness 始终从 Lithograph 仓库检查，不在这里复制状态。

设计层已经没有“mixed Schema + graph 必须等待另一套 Lithograph mutation contract”的 gate：该问题由 Lithograph public explicit transaction + `expectedHead` + 标准 Cypher 25 mutation 解决。实现 readiness 仍必须从 Lithograph 仓库确认对应 explicit transaction、Schema / `SHOW` surface 与所需 Cypher mutation 已真实可用；实现未完成时只能报告依赖尚未 ready，不能把它重新表述为 KG OS 产品模型未设计。

1. 建立 Rust `kgosd` 本地 daemon 与最小 Lithograph host / client 边界，只暴露 KG OS 所需公开能力，不访问内部表；由 `kgosd` 打开 Knowledge Base、加载 Lithograph extension，接入 Native explicit transaction lifecycle、`expectedHead` 与结构化错误映射，实现 D33 的 empty-database bootstrap boundary，未完成 KG OS-valid bootstrap 前不开放公共业务能力。
2. 按本文 `__kgos_` v1 internal physical encoding 实现 Ontology semantic graph：Definition / Property Binding Record、Domain / `INCLUDES`、同一 Lithograph Schema 中的 required internal Schema resources，以及基于 Lithograph `graphView` 的 Knowledge/Internal 隔离、双向 Binding coverage 与 Snapshot-scoped Schema Locator resolution。
3. 实现统一 Object Ref resolver 与 Object Value projection：按 D36 canonical Ref；Domain 与 Knowledge Node / Relationship 直接投影 graph state；Graph Type / Constraint / Index 与 Definition / Property 的 `structure` 通过 Lithograph Cypher 25 Schema / current-graph `SHOW` public surface 做 owner-only projection。同一 State + Ref 产生同一 logical Object Value，并按 D34 renderer 稳定渲染为 canonical YAML 或等价 JSON，同时保持 internal graph 不可见。
4. 实现 Object `list` / `search` / `read`，支持大集合分页与轻量摘要；复杂 Knowledge discovery 不扩展 Object search，而是交给 Graph Cypher。
5. 实现 Object Patch compiler：canonical YAML + Git Extended Diff parser/application、标准 YAML parse → Object Value、Add / Update / Delete / Rename / Restructure、多 Object、request-local alias、strict base State / target Branch、direct Ref transition。先在 `baseState` 上完成 logical planning / conflict / dependency validation；存在有效 target delta 时调用 `tx_begin(targetBranch, expectedHead=baseState)`，在一个 Lithograph explicit transaction 内执行最少标准 Cypher 25 graph / Schema / Constraint / Index mutation，捕获本请求新 element identity 解析 alias，最后一次 `tx_commit`。所有路径落实 D17 rename migration、Schema↔Binding 一一覆盖、semantic cleanup 与 request all-or-nothing；任何失败都不得留下 intermediate State。
6. 实现 Graph `query` / `execute`：只读查询具有真实只读边界，writable execute 只修改普通 Knowledge graph data；两者固定到统一 State semantics、复用 Lithograph value encoding，并执行 Knowledge/Internal Graph View isolation。
7. 实现 Evolution 基础 Read：`overview`、State `get`、从明确 root 渐进读取 State DAG 的 `ancestry`、统一 `history`，以及 Branch / Tag list；保持 immutable State 与 mutable State Data / refs 的返回边界。
8. 实现 Evolution mutation：State create/data、Branch lifecycle、Tag lifecycle，以及 D41 的 whole-Knowledge-Base Merge Session lifecycle。Merge conflict 转成公开 Object/Knowledge slot，支持 bounded page + incremental resolution；unresolved=0 后在同一 session revision 上跑 KG OS consistency checker，再用该 revision finalize。候选不合法时保留 Session、不移动 Branch；不暴露 checkout，也不复制尚无 KG OS use case 的其它 Lithograph Version Procedure。
9. 实现统一 History / Diff 的 Lithograph version 过滤与业务解释视图，支持 scope / Object Ref filter，覆盖公开 Ontology + Knowledge 并隐藏 internal semantic graph。
10. 按 [CLI](cli.md) 与 [本地运行时](runtime.md) 实现 TypeScript / npm `kg` → `kgosd` loopback HTTP，并让 `kgosd` 提供 same-origin Human-facing Web；随后建立 Skill、SDK 与其它 Web interaction。所有上层 surface 只通过 daemon 的公共 HTTP contract 使用 Kernel，不直接访问 SQLite / Lithograph。

实现、验证、提交和推送必须分别按仓库真实状态报告；设计完成不代表 Lithograph 依赖能力或 KG OS 功能已经实现。
