# Phase 06：Evolution Core

**状态：`in_progress`**

## 1. 目标与范围

在 Phase 00–05 已完成 Runtime、Knowledge Base、Ontology、Object 与 Graph 公共能力之后，Phase 06 首次把 KG OS 已确认的版本化知识世界能力开放为正式 **Evolution Core** surface。

本 Phase 完成后，调用方可以：

```text
读取当前/历史 State
  -> overview / get / ancestry

管理显式状态与引用
  -> state create / set-data / clear-data
  -> branch list / create / delete
  -> tag list / create / move / delete

理解知识世界如何变化
  -> history / diff
```

CLI 对应为：

```text
kg evolution overview
kg evolution get
kg evolution ancestry
kg evolution history
kg evolution diff

kg evolution state create
kg evolution state set-data
kg evolution state clear-data

kg evolution branch list
kg evolution branch create
kg evolution branch delete

kg evolution tag list
kg evolution tag create
kg evolution tag move
kg evolution tag delete
```

本 Phase **不实现 Merge Session**。Merge 已有完整产品设计，但 conflict projection、渐进 resolution、candidate validation 与 finalize 构成独立 correctness boundary，留给后续 Phase；Phase 06 不建立空 Merge route、CLI stub 或半成品实现。

## 2. Design Inputs

- [Evolution 设计](../../design/evolution.md#evolution)；
- [Evolution 公共调用合同](../../design/evolution.md#evolution-公共调用合同)；
- [History 与历史读取](../../design/evolution.md#history-与历史读取)；
- [Evolution CLI](../../design/cli.md#evolution-cli)；
- [公共错误合同](../../design/contracts.md#公共错误合同)；
- [D12 Evolution 不镜像 Lithograph Version Procedure](../../design/decisions.md#d12-evolution-不镜像-lithograph-version-procedure)；
- [D13 State 引用显式且所有状态写入返回最终 State](../../design/decisions.md#d13-state-引用显式且所有状态写入返回最终-state)；
- [D31 Invalid Snapshot 只允许 Evolution 诊断](../../design/decisions.md#d31-invalid-lithograph-snapshot-只允许-evolution-诊断不继续演进)；
- [D35 StateRef 直接复用 Lithograph Version Descriptor](../../design/decisions.md#d35-公共-stateref-直接复用-lithograph-version-descriptor)；
- [D74 Evolution state.create writer boundary](../../design/decisions.md#d74-evolution-state-create-writer-boundary)；
- [实现范围映射](../../design/implementation.md#实现范围映射)；
- [Phase 01 Runtime & Lithograph Host](01-runtime-lithograph-host.md)；
- [Phase 04 General Object Read & Patch](04-object.md)；
- [Phase 05 Graph Query & Execute](05-graph.md)。

本计划只拆分实现、验证与 Review；不重新定义 State identity、State Data、Branch / Tag 生命周期、Change / HistoryEntry、Object continuity、invalid State 边界或 Lithograph Version Procedure 语义。

## 3. 依赖与当前基线

### 3.1 前置依赖

- Phase 00–05 均为 `done`；
- Phase 01 已有统一 Lithograph v0.3.0 Host、read/write connection pool、StateRef resolve、SQL execution、context cancellation 与 shutdown lifecycle；
- Phase 02–04 已有 KG OS-valid Snapshot decoder、Binding / reserved Schema consistency、五类公共 Object Ref / Object Value、canonical aggregate projection 与 Knowledge element identity；
- Phase 03 已有业务 CLI Runtime ensure、`KG_TOKEN -> auth.json` credential resolution、中英文 help 基础与稳定 HTTP client path；
- Phase 05 已证明同一 Kernel / daemon / CLI 分层可以稳定暴露 State-aware public capability，且不需要第二套 database host；
- 当前 Ontology pagination 已有 opaque cursor 的 State/scope binding模式，可作为 Evolution cursor engineering reference，但 Evolution cursor仍必须满足自己的 root/before/after/filter pinning合同；
- 当前 KG OS 还没有公共 Evolution Kernel / HTTP / CLI，实现存在于本 Phase 之后才能作为完成证据。

Design Inputs、依赖顺序与 Acceptance 已齐全；当前没有需要重新确认的 Evolution Core 产品语义。Phase 06 实现已经进入工作树，因此当前状态为 `in_progress`。

### 3.2 Lithograph baseline

继续使用当前冻结的 Lithograph v0.3.0、storage format 3、`CY25-2026.08` 与 SQLite 3.45.0+ SQL-only integration。

当前 Lithograph 公共 Version Procedure 已实际提供：

```text
branch.create / branch.list / branch.delete
commit.get / commit.create / commit.data.set / commit.data.clear
tag.create / tag.list / tag.move / tag.delete
log
diff
```

其公开结果已经覆盖 Phase 06 所需的 Commit metadata、parents、Commit Data、Branch / Tag target、DAG log cursor 与 canonical structured diff。Phase 06 只在 KG OS 中建立业务 projection 与 public surface，不修改 Lithograph 仓库，也不新增：

- application-facing Native query ABI；
- raw SQLite table / internal storage access；
- 第二套 Commit DAG、Branch、Tag、State ID 或 History store；
- KG OS 自己的 structural diff engine；
- Git working tree / staging；
- checkout / rebase / squash / reset / revert / GC 的 KG OS wrapper；
- Merge Session。

## 4. Phase 边界

### 4.1 本 Phase 拥有

```text
Evolution version/ref adapter
  -> State / State Data public types
  -> overview / get / ancestry
  -> Branch / Tag lifecycle
  -> public Change projection
  -> diff
  -> history + Object continuity
  -> authenticated Evolution HTTP
  -> kg evolution Core CLI
  -> integration / review closure
```

### 4.2 明确不属于本 Phase

- `kg evolution merge ...` 与任何 Merge Session Kernel / HTTP route；
- conflict projection / resolution / candidate validation / finalize；
- Rebase、Squash、Reset、Revert、GC、Patch passthrough 或 public checkout；
- connection-local current Branch / current State；
- 新 State ID、Object history ID 或第二套 ref grammar；
- raw Lithograph Patch / internal slot 作为 KG OS public History / Diff；
- Object list/search、第二套 History API 或 Ontology/Knowledge 各自独立 history；
- SDK、Web 业务页面、Skill；
- 持久化 History cache/index、event sourcing layer 或额外数据库；
- 新 dependency、抽象层或协议，除非实现中出现当前真实且无法由现有基线解决的约束。

## 5. Feature 顺序

```text
06.1 Evolution foundation / version-ref adapter
 -> 06.2 Overview / Get / Ancestry
 -> 06.3 State Data + Branch / Tag lifecycle
 -> 06.4 Public Diff projection
 -> 06.5 History + Object continuity
 -> 06.6 Authenticated Evolution HTTP
 -> 06.7 kg evolution Core CLI
 -> 06.8 Integration hardening / review closure
```

### Feature 06.1 Evolution Foundation / Version-Ref Adapter

- 在现有 `internal/lithograph.Host` 上增加最小 Version/ref read-write primitive；继续使用同一 SQLite/Lithograph connection pools 与 `lithograph()` public SQL surface，不建立第二个 host。
- Version/ref operation默认在其自己的 autocommit lifecycle 中执行；不得塞入 Object Patch explicit transaction，也不得用 Graph 的 connection-local checkout 作为公共 Evolution state。实现核对 v0.3.0 后确认唯一例外为 `state.create`：按 [D74](../../design/decisions.md#d74-evolution-state-create-writer-boundary) 用短 caller-owned SQLite writer boundary只包裹一个 `commit.create([data])`，用于在 publication 前原子复核已校验 parent并保留初始 Commit Data原子性；不得借此组合多个 Version Procedure、Graph/Object mutation或跨请求状态。
- 读取优先复用现有 `ResolveState` / metadata query能力；Branch / Tag / Commit Data mutation使用现有 write pool上的专用 version operation，完成后不依赖或泄漏 connection-local checkout。
- 定义 Phase 06 需要的内部 request/result projection：State summary/detail、Branch/Tag item、Change、HistoryEntry 与分页 cursor；逻辑字段严格沿用 Evolution owner。
- 统一解码 Lithograph Version Procedure result column；缺字段、非法 Commit identity、非法 JSON / typed value或不满足冻结 v0.3.0 contract时 fail closed，不伪造 State。
- 把现有 Snapshot decoder / Binding / reserved Schema validation 提炼为可复用的 State consistency诊断路径；`get.consistency` 至少稳定区分设计要求的公开 issue code，不向 message/details 泄露 Binding element identity、Schema locator、`__kgos_` / `_lithograph_*` internal detail。
- Evolution cursor使用 opaque KG OS framing并绑定 operation与已解析 immutable inputs；可以复用 Lithograph log cursor作为内部 traversal payload，但不能把可变 Branch/Tag字符串或无约束 offset当成分页真源。

### Feature 06.2 Overview / Get / Ancestry

- `overview` 只返回默认 Branch 与其当前 resolved `commit/...`，不得扫描完整 Branch/Tag集合或 State DAG。
- `get` 在 operation开始解析并 pin StateRef，返回 immutable Commit metadata、`parents`、`committedAt`、当前 State Data与公开 consistency诊断；`committedAt`直接保留Lithograph UTC Unix epoch microseconds，不改成时间字符串；不加载完整 Ontology / Knowledge，也不反向扫描所有 refs。
- `hasData=false,data=null` 与显式 `hasData=true,data=null` 必须保持可区分。
- `ancestry` 第一次请求把 root解析并pin为 immutable State，随后按 Lithograph log的 deterministic DAG order逐页返回轻量 StateSummary。
- `ancestry` 默认limit `100`，接受 `1..1000`；cursor必须绑定resolved root与traversal frontier，Branch/Tag后续移动不改变既有分页。
- `ancestry` 允许穿过 invalid / pre-KGOS Commit，只暴露 topology / lightweight metadata；不得为了每个 row执行完整 Snapshot consistency scan或展开State Data。

### Feature 06.3 State Data + Branch / Tag Lifecycle

- `state.create` 在显式 Branch 上调用 Lithograph empty-delta Commit能力；即使 Snapshot无变化也必须产生新 State，并返回真实 resolved Commit。
- `state.create` 必须对**实际成为新 Commit parent的有效 Branch head**完成 KG OS-valid consistency校验；校验后Branch head若已变化，实现必须重新解析/校验实际head或返回并发错误，不能从未验证的head继续演进。可选 `data` 与新 Commit按 Lithograph原子语义建立，`author/message`只作用于这个新 Commit。
- `state.setData` 接受任意合法 JSON value，包括 `null`；`state.clearData`只移除 sidecar。两者都不创建 Commit、不移动 Branch、不改变 State identity。
- `state.setData/clearData` 接受 StateRef时先解析并pin到immutable `commit/...`，随后只修改该Commit sidecar；调用方传入的Branch/Tag在解析后移动不能把同一请求重定向到另一个State。
- set/clear data允许作用于 invalid State，以支持诊断注释；这不能把 invalid Snapshot重新解释为 valid。
- `branch.list` / `tag.list` 一次完整枚举并按 name UTF-8 bytes顺序返回；Phase 06不为其增加分页或自创hard limit。Lithograph `branch.list` 的connection-local `active`字段不是KG OS公共合同，必须丢弃，只投影 `{name,state}`。
- `branch.create --from`、`tag.create/move --target` 必须先解析并pin到immutable `commit/...`、完成 KG OS consistency validation，再把**已解析 Commit**交给Lithograph建立/移动ref；Branch/Tag在校验后继续移动不能替换本次已验证target。
- `branch.delete` / `tag.delete` 只清理 ref，因此允许目标当前指向 invalid State；保留 Lithograph 自己对 `main`、active connection等底层合法性的真实错误。
- 不开放 `branch.checkout`；任何 Evolution write都不能建立跨请求 hidden current Branch。

### Feature 06.4 Public Diff Projection

- `diff.before/after` 在operation开始解析并pin；两端都必须是 KG OS-valid State，invalid Snapshot返回 `CONSISTENCY_ERROR`。
- 调用 Lithograph canonical structured `diff` 获取底层 graph / Schema / Index change，然后使用 KG OS已有 Snapshot/Object decoder投影为 `Change[]`；不把 raw Patch、Binding Record、Schema locator或reserved identifiers暴露给调用方。
- `scope=all|ontology|knowledge|object` 只过滤同一套 public Change，不建立平行 diff engine。
- `scope=object` 必须同时提供 `anchorState + ObjectRef`；anchor解析后必须等于 resolved before或after，并只使用真实 continuity evidence定位对象。
- Definition / Domain / Property变化按公共 aggregate表达；Property / Constraint / Index不重新变成独立 Object。
- shared Index等共享资源的一次底层变化按 Evolution owner只报告一次，确定展示 anchor并使用 `relatedRefs` 表达其它受影响 Definition。
- Knowledge Relationship因type/endpoint变化发生replacement时报告独立 Delete + Add，不利用 Object Patch response transition伪造持久连续性。
- State Data、Branch、Tag变化不进入 Snapshot diff。
- Change按 owner定义的canonical key排序；默认limit `100`、范围 `1..1000`，cursor绑定resolved before/after、scope、object filter与change frontier。

### Feature 06.5 History + Object Continuity

- `history.root` 在operation开始解析并pin，必须是 KG OS-valid State；不允许从 invalid root开始解释业务历史。
- 使用 Lithograph DAG log作为 State遍历真源，并复用 **同一套 Public Diff / Change projector** 解释每个可解释 State变化；不得为 History重新实现另一套 Object diff语义。
- State顺序沿用 Evolution owner规定的 reverse-topological顺序；同一 State内 Change按canonical key排序。
- 一个 State有多条 public Change时返回多个相同 `state/parents` 的 HistoryEntry；显式 empty-delta State在 `scope=all` 时返回 `change=null`。
- 已存在的multi-parent State必须保留完整 `parents[]`，并按Evolution owner与Lithograph Commit/Layer的既有父子语义解释该State的public change；不得为了Phase 06自行增加first-parent-only History模式或丢弃第二parent。
- 向 ancestry回溯遇到第一个 invalid / pre-KGOS parent时终止业务 history，不跨边界猜测 continuity；首个可解释 KG OS bootstrap/genesis State按设计允许 `change=null`。
- object scope使用 `anchorState + ObjectRef`：History anchor必须位于root ancestry；Definition / Domain / Property使用现有 Binding/Domain continuity，Knowledge使用Lithograph element identity，Constraint/Index只使用底层确实存在的identity证据。
- 名称被删除后重新使用时不得把新对象接到旧对象历史；Relationship replacement同样从新 identity重新开始。
- History pagination单位是单条 HistoryEntry，不是 State；cursor绑定resolved root、scope/object filter、State traversal frontier与当前 State内change位置，使Branch/Tag后续移动不改变已开始的分页解释。

### Feature 06.6 Authenticated Evolution HTTP

- 在现有 `kgosd` 同一 `net/http` server增加 Evolution JSON adapter；transport只映射已确认 logical operation，不增加新的业务能力。
- 固定 operation route：
  - `POST /api/v1/evolution/overview`
  - `POST /api/v1/evolution/get`
  - `POST /api/v1/evolution/ancestry`
  - `POST /api/v1/evolution/history`
  - `POST /api/v1/evolution/diff`
  - `POST /api/v1/evolution/state/create`
  - `POST /api/v1/evolution/state/set-data`
  - `POST /api/v1/evolution/state/clear-data`
  - `POST /api/v1/evolution/branch/list`
  - `POST /api/v1/evolution/branch/create`
  - `POST /api/v1/evolution/branch/delete`
  - `POST /api/v1/evolution/tag/list`
  - `POST /api/v1/evolution/tag/create`
  - `POST /api/v1/evolution/tag/move`
  - `POST /api/v1/evolution/tag/delete`
- 所有 route复用现有 Bearer middleware、request body limit、JSON decode、public error envelope、request context cancellation 与 graceful shutdown。
- 每个HTTP request只调用一次对应 Kernel logical operation；不得由daemon循环发起多个public请求模拟pagination。
- malformed StateRef/ObjectRef/cursor、非法scope/field组合在进入不必要数据库执行前返回稳定 public error；Lithograph `VERSION_NOT_FOUND`映射为 `STATE_NOT_FOUND`。
- success默认 `application/json`；Phase 06不为Evolution建立NDJSON、SSE或第二套streaming protocol。
- 不注册任何 `/merge` route或占位成功响应。

### Feature 06.7 `kg evolution` Core CLI

- root command tree新增 `evolution` namespace并只开放本 Phase Core命令；不得提前出现可执行的 `evolution merge`。
- Read命令严格使用设计中的 required StateRef、`--scope`、`--object-ref/--anchor-state`、`--limit/--cursor`组合；CLI不自动追完pagination。
- State Data输入保持既有required-text规则：`state create` data可选且不隐式读stdin；`state set-data`使用互斥 `--data` / `--data-file` / non-TTY stdin；JSON `null`原样传递。
- Branch/Tag positional `<name>` 是原始name；`--from/--target` 才接受完整 StateRef。CLI不维护active Branch。
- success stdout默认一个compact JSON document；`--pretty`只改变空白。失败保持stdout为空、stderr public error JSON与既有exit-code mapping。
- 复用Phase 03 Runtime ensure与credential resolution；不增加 `--endpoint` / `--host` / `--token`。
- human-facing help支持现有 English / 中文 locale，机器字段、命令名、Ref、enum与error code不翻译。

### Feature 06.8 Integration Hardening / Review Closure

- 使用真实 bundled SQLite + Lithograph v0.3.0 extension验证 Kernel → daemon → CLI完整 Evolution Core链路，不以mock Version store替代核心E2E。
- 用Object Patch / Graph execute建立多State、Branch、Tag与Knowledge/Ontology变化，再从Evolution读取真实History/Diff，证明多个public surface共享同一Commit DAG。
- 构造合法 State、empty-delta State、State Data null/absence、ref move/delete、invalid/pre-KGOS State与名称复用等关键边界。
- 通过直接 Graph / Lithograph public能力构造高层invalid Snapshot时，验证 `get`可诊断、`ancestry`可导航、History/Diff与新ref/State演进按D31拒绝或停止；不自动修复。
- 保持Phase 00–05的Ontology/Object/Graph/onboarding/runtime验收通过。
- 检查生产代码没有第二套Version store、raw internal table访问、public checkout/current Branch、persistent History index、raw Patch public response或Merge stub。
- 完成Phase Review、文档状态同步、full validation、fresh-source validation与要求的远端CI。

## 6. Acceptance Matrix

| ID | 场景 | 必须证明的结果 |
| --- | --- | --- |
| A | State identity / metadata / data | StateRef解析到真实`commit/...`；parents/author/message/committedAt来自Lithograph；State Data absence与JSON `null`严格区分 |
| B | Overview / Get / Ancestry | Overview轻量；Get聚合metadata/data/consistency；Ancestry按pinned DAG稳定分页，Branch/Tag移动不改变已开始遍历 |
| C | Consistency boundary | Get对invalid State给公开issue；Ancestry可穿过invalid/pre-KGOS；History/Diff与create/new-ref target不把invalid Snapshot继续解释为业务State |
| D | State lifecycle | state.create真实创建empty-delta Commit并返回State；optional data原子；set/clear data不建Commit、不移动ref、允许invalid State诊断注释 |
| E | Branch / Tag lifecycle | list/create/delete与tag list/create/move/delete映射真实ref语义；创建/移动只指向valid State；删除可清理invalid target；不暴露Lithograph `active`，无hidden checkout/current Branch |
| F | Diff projection | Lithograph structured diff正确投影为public Change；Ontology aggregate/shared resource/Knowledge replacement/internal filtering/scope/object anchor与canonical排序正确 |
| G | History / continuity / pagination | History复用同一Change语义；State/Change顺序、empty-delta、invalid boundary、对象identity continuity、名称复用与HistoryEntry级cursor均正确 |
| H | HTTP / auth / error / cancellation | Evolution route统一Bearer、JSON与public error；request cancel/shutdown传播到底层；STATE_NOT_FOUND/CONSISTENCY_ERROR等分类稳定，无internal泄漏 |
| I | CLI contract | 全部Core命令、State Data输入、scope/anchor、pagination、pretty、Runtime ensure、i18n与stdout/stderr/exit行为符合CLI设计；无Merge命令 |
| J | Regression / delivery | Phase 00–05无退化；无第二Version store/History index/checkout/Merge scope creep；本地、fresh-source与要求的Ubuntu CI全部取得证据 |

## 7. 关键失败路径

至少覆盖：

1. malformed / nonexistent Commit、Branch、Tag StateRef；
2. cursor格式非法、cursor跨operation/root/scope/object filter复用；
3. ancestry分页期间调用方传入的Branch/Tag继续移动；
4. State Data absent、JSON `null`、普通object/array/scalar与clear之间的区别；
5. `state.create`目标Branch head为KG OS-invalid；
6. `state.create`校验后目标Branch被并发移动，不能从未验证的新head继续创建State；
7. `state.setData/clearData`传入Branch/Tag后ref移动，仍只作用于请求开始pin住的Commit；
8. `branch.create.from`或`tag.create/move.target`为invalid State；
9. 删除当前指向invalid State的Branch/Tag仍可作为cleanup执行；
10. Get面对Binding missing/duplicate/dangling/kind mismatch与reserved Schema invalid，只输出公开issue；
11. History root / Diff before/after / object anchor为invalid State；
12. History遇到pre-KGOS/invalid ancestry边界，不跨越猜连续性；
13. object anchor不在History root ancestry，或Diff anchor不等于before/after；
14. 删除后同名Definition/Domain/Schema resource重新创建，不被名称猜成旧identity；
15. Knowledge Relationship type/endpoint replacement保持Delete + Add；
16. shared Index变化只出现一个public Change，并稳定设置relatedRefs；
17. raw Binding、reserved graph、Schema locator、Lithograph raw patch slot不能出现在History/Diff public payload；
18. explicit empty-delta State在all-scope History仍可见，Diff可为空；
19. multi-parent State不能丢失parent topology或被静默改成另一套History traversal模式；
20. request cancellation / daemon shutdown期间的log/diff/metadata请求正确终止，不返回partial伪成功；
21. Version Procedure错误不按message substring猜分类；
22. CLI stdin为TTY且required State Data正文缺失时直接usage error，不等待editor/REPL；
23. 任何实现不得依赖connection上一次遗留checkout。

## 8. 验证计划

### Targeted

- `internal/lithograph`：Version/ref read-write adapter、result decoder、autocommit/connection cleanup、cancel/error mapping；
- `internal/kernel`：State detail/consistency、cursor binding、Change projection、scope filter、shared resource dedupe、identity continuity、History/Diff ordering；
- `internal/daemon`：每个Evolution route的method/auth/body/error/context mapping；
- `cmd/kg`：命令树、参数互斥、State Data input、pagination、pretty、i18n、Runtime ensure与error/exit。

### Integration

- 真实 Lithograph v0.3.0：Commit metadata/Data、Branch/Tag、log cursor、diff结构与error category；
- 真实 Kernel：Ontology + Knowledge多State演进、empty-delta、invalid boundary、shared Index与Relationship replacement；
- 真实 daemon：Bearer、StateRef pin、pagination、cancel/shutdown；
- 真实 packaged `kg`：stopped daemon auto-start后执行全部Evolution Core workflow；
- restart后State Data、refs、History/Diff结果继续来自同一 `kgos.db` 与Commit DAG。

### Repository gates

- 先运行受影响Go package targeted tests与真实 Lithograph integration；
- 完成 `pnpm check:quick`，再运行完整 `pnpm validate`；
- 保持 Go statement coverage门禁 **>= 90%**、race/staticcheck/govulncheck 与 jscpd 既有门禁；
- 在独立 fresh-source checkout运行 `pnpm run setup && pnpm validate`；
- `git diff --check`、Markdown本地链接、最终diff与untracked file检查通过；
- Ubuntu 24.04 x64 GitHub Actions Validate取得真实成功结果后才允许Phase进入 `done`。

## 9. Review 重点

Phase Review至少检查：

- 是否把 Lithograph Commit/Branch/Tag直接映射为KG OS State/ref，而不是复制第二套版本模型；
- 是否只在Get和需要业务解释的History/Diff路径做必要consistency工作，避免Ancestry退化为全Snapshot扫描；
- History/Diff是否确实共享一个public Change projector，避免同一变化在两个接口得出不同语义；
- object history是否只使用真实continuity evidence，没有name heuristic或Object Patch transition回填；
- shared Schema resource是否只报告一次且relatedRefs稳定；
- cursor是否pin immutable inputs，并拒绝跨scope/filter复用；
- State Data是否始终保持sidecar语义，不进入Snapshot diff/history change；
- Version/ref mutation是否使用正确autocommit boundary，避免嵌套explicit transaction或遗留checkout；
- public error/details是否隐藏internal graph/schema identity；
- HTTP/CLI是否保持AI-first、JSON-first、显式State/Branch与非交互行为；
- 是否意外实现Merge、checkout、rebase/squash/reset/revert/gc、第二History store或新dependency。

发现finding后按“修复 → targeted复验 → 必要范围扩大验证 → 再Review”闭环；没有新改动或新finding时停止重复验证。

## 10. 完成条件

Phase 06只有同时满足以下条件才能进入 `done`：

1. 06.1–06.8 Scope全部真实实现；
2. A–J Acceptance全部取得当前工作树/提交的真实证据；
3. Kernel、authenticated HTTP与正式 `kg evolution` Core CLI使用同一logical contract；
4. History/Diff公共投影、Object continuity、invalid State与State Data边界均通过真实Lithograph integration；
5. Phase 00–05 regression无退化；
6. Phase Review findings全部关闭；
7. 主工作树 `pnpm validate` 与独立 fresh-source validation成功；
8. 最终diff、文档/链接、coverage与仓库卫生检查通过；
9. Phase要求的Ubuntu 24.04 x64 GitHub Actions Validate真实成功；
10. README、设计状态导航、开发计划、Phase状态与实际实现证据同步。

完成代码、单个Feature或本地一组测试都不能单独把Phase标记为 `done`。Commit、push、发布仍是独立动作，只按实际执行证据记录。

## 11. 当前状态

2026-09-24：Phase 00–05 已为 `done`；Evolution / CLI / implementation owner中的State、State Data、Branch、Tag、Ancestry、History、Diff合同已确认。当前工作树已经实现公共 Evolution Kernel / HTTP / CLI Core surface，并进入 Phase 级验收与 Review 收口。

本计划已核对当前KG OS实现基线与Lithograph公开Version Procedure：Phase 06需要的Commit metadata/Data、Branch/Tag、bounded DAG log与structured diff均已有底层public SQL contract，可复用现有Host与Snapshot/Object primitive；Merge Session不属于本Phase。

当前本地实现与 Review 已收口：`pnpm check:go`、`pnpm check:quick`、主工作树完整 `pnpm validate` 与独立 `.cache/phase06-fresh-20260924-1022` 的 `pnpm run setup && pnpm validate` 均成功；Go statement coverage **90.0%**、jscpd 0 clones，race、govulncheck、TypeScript/V8/type coverage、Playwright、真实 bundled Lithograph v0.3.0 native suite、package、licenses、npm audit 与 diff gate 均通过。真实场景覆盖 empty-delta State/Data、invalid State诊断、ref lifecycle、pinned Ancestry/History、shared Index、Relationship replacement、rename/name reuse、multi-parent History、authenticated HTTP、fresh installed profile Runtime auto-start 与 CLI E2E。最终 Phase Review 未发现新的 task-affecting implementation finding，生产代码没有第二套 Version store/History index、Evolution Merge/checkout/rebase/squash/reset/revert/gc surface或新依赖。仍缺最终 pushed SHA 的 Ubuntu 24.04 x64 GitHub Actions Validate，因此状态保持 `in_progress`，不能提前标记 `done`。
