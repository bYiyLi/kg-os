# Phase 04：General Object Read & Patch

**状态：`done`**

## 1. 目标与范围

在 Phase 02 已完成 Ontology read/edit/Patch、Phase 03 已完成本地 Runtime onboarding 之后，Phase 04 首次开放通用 Object surface，使调用方可以对明确的公共 Object Ref 进行一致的批量读取，并通过现有 Object Patch 模型原子维护 Knowledge Node / Relationship。

本 Phase 完成后，公开 Object 能力固定为：

```text
kg object read
  → 1..100 个明确 Ref
  → 一个 resolved State
  → Domain / Definition / Knowledge Node / Knowledge Relationship

kg object patch
  → 一个 Git Extended Diff
  → 一个或多个 Ontology / Knowledge Object
  → 一个 strict baseState
  → 有有效 delta 时一个 Lithograph explicit transaction / Commit
  → no-op 保持 baseState，不创建 Commit
```

本 Phase 交付：

- 五种公共 Object Ref 的通用 batch read；
- Knowledge Node / Relationship 的公共 Object Value 投影与 canonical serialization；
- `kg object read` positional text / refs file / stdin 三种互斥 Ref 输入；
- 单 / 批量 JSON envelope、canonical YAML body 与 batch YAML multi-document framing；
- 通用 authenticated Object read / patch daemon adapter；
- Knowledge Node / Relationship create / update / delete / restructure；
- request-local alias、Ref transition、strict baseState、no-op 与 all-or-nothing batch Patch；
- Ontology + Knowledge 同一 Patch 的单 transaction原子修改；
- 将现有 Ontology editable read / scoped Patch继续复用共享 Object primitive，不建立第二套 parser / renderer / transaction。

本 Phase **不实现 `object list` 或 `object search`**。未知 Knowledge Object 的发现、属性条件、全文、Semantic Search与图遍历属于后续 Graph；不为本 Phase增加 Search DSL、分页枚举或另一套 CRUD API。

## 2. Design Inputs

- [D73 Object surface 收敛为 batch read + batch patch](../../design/decisions.md#d73-object-read-patch-surface)；
- [Object 公共调用合同](../../design/object.md#object-公共调用合同)；
- [Object Ref 与公共身份](../../design/object.md#object-ref-与公共身份)；
- [Knowledge 数据访问](../../design/graph.md#knowledge-数据访问)；
- [CLI Object surface](../../design/cli.md#object-cli)；
- [公共错误合同](../../design/contracts.md#公共错误合同)；
- [Mutation planning / adapter mapping](../../design/implementation.md#mutation-planning)；
- [Phase 01 Runtime & Lithograph Host](01-runtime-lithograph-host.md)；
- [Phase 02 Ontology](02-ontology.md)；
- [Phase 03 Installation & Runtime Onboarding](03-installation-runtime-onboarding.md)。

本计划只拆分实现、验证与Review；不重新定义 Object identity、Knowledge model、canonical YAML、Git Extended Diff、strict base、transaction或Graph职责。

## 3. 依赖与当前基线

### 3.1 前置依赖

- Phase 00–03 均为 `done`；
- Phase 01 已有真实 read/write Lithograph connection、immutable State解析、SQL execution、context cancellation与explicit transaction；
- Phase 02 已有 Ontology Object Ref、canonical YAML/JSON renderer、Git Extended Diff parser/exact apply、Ontology-scoped Patch planner/compiler、request-local alias基础、strict `baseState`与authenticated daemon route；
- Phase 03 已有 business-command Runtime ensure、本机 credential resolution与稳定 `kg` HTTP client路径；
- D73 已冻结通用 Object只保留 batch read / patch，设计上不存在 list/search implementation dependency。

Design Inputs、依赖顺序与Acceptance已经齐全；当前实现、Review、本地/ fresh-source验收与最终 pushed SHA 的 Ubuntu 24.04 x64 GitHub Actions Validate均已完成，因此 Phase状态为 `done`。

### 3.2 Lithograph baseline

继续使用当前冻结的 Lithograph v0.3.0、storage format 3、`CY25-2026.08` 与 SQLite 3.45.0+ SQL-only integration。

本 Phase不修改 Lithograph 仓库，也不新增：

- Native application query ABI；
- raw SQL公共入口；
- Structural Patch作为Object wire；
- 第二套 transaction/version layer；
- Knowledge专用持久ID；
- Search/index capability。

## 4. Phase 边界

### 4.1 本 Phase拥有

```text
General Object Ref parsing
  -> batch read / one State pin
  -> Knowledge Node / Relationship Object Value
  -> shared canonical serialization
  -> authenticated Object adapter
  -> kg object read
  -> Knowledge-aware shared Patch planning
  -> kg object patch
  -> mixed Ontology + Knowledge atomic mutation
  -> integration / review closure
```

### 4.2 明确不属于本 Phase

- `object list` / `object search`；
- Graph `query` / `execute` public surface；
- Full-text / Semantic Search public query；
- 条件级、集合级 Knowledge bulk mutation；
- Evolution / History / Diff / Merge public surface；
- TypeScript SDK、Web业务页面、Skill；
- Object create/update/delete独立命令；
- JSON Patch / Merge Patch / CRUD mutation DSL；
- 自动 detach delete；
- 自动 rebase / merge / force Patch；
- caller-owned Vector Object Value；
- 新 package、dependency或数据库能力，除非实现中出现当前真实且无法由现有基线解决的约束。

## 5. Feature 顺序

```text
04.1 General Object Ref + batch read kernel
 -> 04.2 Knowledge Object projection + serialization
 -> 04.3 Generic authenticated Object adapter
 -> 04.4 kg object read
 -> 04.5 Knowledge Object Patch planner/executor
 -> 04.6 kg object patch
 -> 04.7 Ontology primitive consolidation / regression
 -> 04.8 Integration hardening / review closure
```

### Feature 04.1 General Object Ref 与 Batch Read Kernel

- 将通用 Object Ref parser覆盖五种 ObjectKind：Domain、Node Definition、Relationship Definition、Knowledge Node、Knowledge Relationship。
- batch read一次接受1..100个Ref；重复Ref、非法Ref在数据库执行前拒绝。
- daemon/kernel对 `at` 只解析一次并pin一个immutable `commit/...`；不得按Ref循环解析 Branch/Tag。
- result顺序严格等于请求Ref顺序，单Ref也返回统一 `results[]` shape。
- 任一Ref不存在、不可解释、触发Object value profile限制或整体响应超出资源边界时，整个请求失败并且没有partial result。
- operation cancellation传递到全部底层查询；失败后不得把未完整batch误报成功。

### Feature 04.2 Knowledge Object Projection 与 Serialization

- Knowledge Node投影只包含 `labels[] / properties{}`；技术身份由外层Ref携带。
- Knowledge Relationship投影只包含 `type / start / end / properties{}`；endpoint使用 `n:<id>` Ref。
- 使用Lithograph原生element identity，不创建 `knowledgeId/entityId`。
- 只读取目标State真实graph data，不复制Definition title/description等Ontology语义。
- canonical YAML / equivalent JSON继续复用现有Object renderer与Lithograph typed-value编码。
- addressed Object含caller-owned Vector时按现有Object profile返回 `UNSUPPORTED_OPERATION`；不扫描全库。
- addressed Object触及KG OS reserved/internal边界时按现有Object/Ontology consistency规则失败；不把这项检查扩展到Graph passthrough。

### Feature 04.3 Generic Authenticated Object Adapter

- 建立 `POST /api/v1/object/read`：一次请求携带整个refs数组，返回统一 `ObjectReadResult`，并执行Bearer authentication。
- 建立 `POST /api/v1/object/patch`：直接复用共享 `PatchRequest/PatchResult` 与Kernel compiler。
- 不允许CLI通过N次HTTP请求模拟batch read或batch Patch。
- request size、JSON decode、public error mapping与context cancellation复用当前daemon公共机制。
- transport mapping不得改变Object logical contract；单/批量read的State、顺序与all-or-nothing由Kernel保证。
- CLI raw YAML/JSON body只对同一次read返回的Object Value做共享renderer呈现；现有 Ontology route / CLI 行为继续保持 Phase 02 已验收合同，可以在内部复用新的共享 primitive，但本 Phase 不做无关的破坏性 route 删除。

### Feature 04.4 `kg object read`

- 命令只接受三种互斥Ref来源：
  - positional `<ObjectRef>...`；
  - `--refs-file <path>`；
  - 未提供前两者且stdin非TTY时的implicit stdin。
- file/stdin为UTF-8文本，每个非空行一个canonical Ref；空行忽略，不增加comment/list DSL。
- 解析后必须得到1..100个Ref，重复Ref失败。
- 默认stdout为一个JSON document：`{state, results:[{kind,ref,value}...]}`；`--pretty`只改空白。
- `--body` 默认YAML：单Ref纯canonical YAML；多Ref标准YAML 1.2 multi-document stream，并只在framing层写一次State与每个Ref comment。
- `--body --format json`：单Ref输出Object Value，多Ref输出按请求顺序的Object Value array；需要metadata association时使用默认envelope。
- batch输出必须在全部结果成功并完成renderer验证后一次性写stdout；失败时stdout为空。
- 复用Phase 03 Runtime ensure与credential resolution，不增加endpoint/token flag。

### Feature 04.5 Knowledge Object Patch Planner / Executor

- 在Phase 02同一Git Extended Diff parser、exact apply、logical delta与explicit transaction上开放Knowledge Object。
- Knowledge Node支持：
  - Add：新Node + labels/properties；
  - Update/Restructure：labels/properties显式变化；
  - Delete：无incident Relationship时删除，或同Patch已显式删除/重构相关Relationship；
  - 系统分配 `n:<id>` 不允许rename。
- Knowledge Relationship支持：
  - Add：type/start/end/properties；
  - Update/Restructure：properties以及显式type/endpoint目标变化；
  - Delete；
  - 若底层只能通过replacement实现type/endpoint变化，返回旧 `r:` → 新 `r:` transition，不建立持久alias。
- 新Knowledge Object使用 `new:knowledge-node:<alias>` / `new:knowledge-relationship:<alias>`；Relationship endpoint可以引用同Patch新Node alias，resolution与entry顺序无关。
- Ontology + Knowledge可以同Patch显式修改；derived Ontology maintenance与调用方Knowledge delta共享同一planned target State。
- reserved identifier、Schema/Constraint、endpoint legality、required/unique与其它目标State合法性在transaction前/中按既有即时语义验证；不制造默认值、不隐式删数据。
- no-op不打开transaction、不创建Commit；stale base使用 `STALE_BASE_STATE`；任一entry失败整体abort。

### Feature 04.6 `kg object patch`

- CLI支持现有三种互斥正文来源：`--patch`、`--patch-file`、implicit stdin。
- 一个正文可包含一个或多个合法 `diff --git` Object entry，并受现有 request/resource limit约束；CLI不得拆分成多次请求。
- `--base-state` 只接受immutable `commit/<id>`，`--branch` 必填。
- `--author/--message` 继续只映射真实新Commit metadata；no-op不为metadata创建空Commit。
- stdout保持 `{state,created,transitions}`；排序与alias decode规则完全沿用Object合同。
- 不增加 `--force/--upsert/--rebase/--merge/--dry-run` 或独立create/update/delete命令。

### Feature 04.7 Ontology Primitive Consolidation / Regression

- `kg ontology --edit` 可以复用新的batch Object read primitive与共享renderer，但外部Markdown/edit行为不得改变。
- `kg ontology patch` 继续只是kind-scoped Object Patch adapter；不得复制parser/compiler/transaction。
- Ontology-only helper 可以在不改变既有外部行为的前提下收敛到共享 primitive；只有确认纯内部重复代码且没有外部行为影响时才清理，不把路由删除本身设为 Phase 04 交付物。
- Phase 02所有Ontology read/edit/Patch、Schema/Constraint/Index compiler与bootstrap invariant保持通过。

### Feature 04.8 Integration Hardening / Review Closure

- 用真实Lithograph v0.3.0验证Knowledge Node/Relationship read与mutation，不以mock graph替代核心E2E。
- 覆盖batch state pin、alias dependency graph、replacement transition、incident Relationship delete safety、strict base、rollback与cancellation。
- 检查不存在 `object list/search` implementation、第二套CRUD、客户端逐 Ref batch、重复renderer或Graph能力提前实现。
- 完成Phase Review、文档状态同步、full validation、fresh-source validation与要求的远端CI。

## 6. Acceptance Matrix

| ID | 场景 | 必须证明的结果 |
| --- | --- | --- |
| A | 五类Object batch read | 1..100 Ref只解析一次State；结果顺序与请求一致；单Ref使用同一results shape |
| B | Read失败与边界 | duplicate / invalid / missing / unsupported / resource failure整批失败，stdout/API无partial success |
| C | CLI read输入与body | positional、refs-file、stdin均成功且互斥；单/多YAML与JSON输出符合D73，canonical body无漂移 |
| D | CLI patch输入 | inline `--patch`、`--patch-file`、stdin均成功且互斥；同一多-entry正文只发送一次业务请求 |
| E | Batch create | 一个Patch创建多个Node与Relationship；new alias可跨entry引用；只产生一个Commit并返回真实created Ref |
| F | Update / restructure | Node labels/properties与Relationship properties/type/endpoints按显式delta修改；需要replacement时返回准确transition |
| G | Delete safety | Relationship可独立删除；仍有incident edge的Node delete被拒绝，除非同Patch已显式处理依赖；不隐式DETACH |
| H | Atomicity / concurrency | mixed Ontology+Knowledge Patch共享一个transaction；stale base、constraint/error/cancellation整体rollback；no-op不创建Commit |
| I | Regression / delivery | Ontology既有能力、auth、Runtime ensure与Phase 00–03 gates不退化；无list/search/第二CRUD；本地/fresh-source/远端CI全部取得证据 |

## 7. 关键失败路径

必须显式覆盖：

1. batch read中第N个Ref不存在，前N-1个不得作为partial result输出；
2. Branch/Tag在请求开始后移动，当前batch仍使用已pin的immutable State；
3. refs file/stdin包含重复、非法UTF-8、非法Ref或超过100个有效Ref；
4. Knowledge Object指向internal/reserved state或含Object profile不支持的Vector value；
5. Patch Add alias缺失、重复、kind错误或Relationship endpoint alias无法解析；
6. Node delete仍有未处理incident Relationship；
7. Relationship type/endpoint replacement在create新edge后任一步失败，旧edge与新edge都不能留下partial durable状态；
8. target Branch head不等于baseState；
9. mixed Ontology+Knowledge Patch中Schema/data中间顺序触发即时Constraint失败；
10. client cancellation / daemon shutdown在read或active explicit transaction期间发生。

## 8. 验证计划

### Targeted

- Object Ref parser与Knowledge Ref canonical规则；
- Knowledge Object decode / typed value / canonical YAML round-trip；
- batch read validation、ordering、duplicate、resource与all-or-nothing；
- refs file/stdin parser与CLI source exclusivity；
- Knowledge Patch logical delta、alias graph、delete dependency与transition；
- no-op / stale base / error mapping。

### Integration

- 真实Lithograph v0.3.0创建Ontology后，通过Object Patch创建并读取Node/Relationship；
- 同Patch创建两个Node + 一条Relationship并使用request-local alias；
- mixed Ontology + Knowledge atomic Patch；
- Relationship type/endpoint replacement与Ref transition；
- incident Relationship delete safety；
- read / patch Bearer authentication、Runtime auto-start与credential fallback；
- cancellation与explicit transaction rollback。

### Repository gates

- `pnpm check:quick`；
- 与改动直接相关的Go targeted tests；
- `pnpm validate`；
- 独立fresh-source `pnpm run setup && pnpm validate`；
- `git diff --check`；
- Markdown / local links / spelling按仓库现有门禁；
- Ubuntu 24.04 x64 GitHub Actions Validate取得真实成功结果后才允许 `done`。

## 9. Review 重点

Phase Review至少检查：

1. Object public surface是否只剩read/patch，没有list/search残留；
2. batch read是否真正在daemon/kernel一次pin State，而不是CLI循环请求；
3. canonical YAML是否只有一个共享renderer，单/批量body bytes是否稳定；
4. Knowledge projection是否直接使用Lithograph element identity，没有第二套ID；
5. Patch是否继续只有一套parser/logical delta/transaction；
6. 新Node/Relationship alias是否与entry顺序无关；
7. Node delete是否绝不隐式DETACH；
8. Relationship replacement是否只在底层需要时发生，并准确返回transition；
9. mixed Ontology+Knowledge是否真正在一个Commit边界，失败无partial durable state；
10. reserved/Vector检查是否只作用高层addressed Object，没有恢复全图scan或限制Graph；
11. 是否提前实现Graph/Search/Evolution/SDK/Web或新增无当前必要性的依赖/抽象。

Review发现问题后修复并重跑受影响验证；没有新改动或新finding时停止重复验证。

## 10. 完成条件

Phase 04只有同时满足以下条件才能进入 `done`：

1. 04.1–04.8全部真实实现；
2. A–I Acceptance全部取得当前工作树/提交的真实证据；
3. 五类Object batch read与Knowledge batch Patch在真实Lithograph上闭环；
4. CLI positional/file/stdin read与inline/file/stdin Patch均有自动测试；
5. mixed Ontology+Knowledge transaction、stale base、rollback、delete safety与transition均有E2E证据；
6. Phase Review findings全部关闭；
7. README、Design、Development、Guide/vlog在实际实现需要时按各自职责同步；
8. full local validation、fresh-source validation与Phase要求的远端CI真实通过；
9. 没有secret、database fixture、extension cache、build artifact、临时Patch/Ref文件或unrelated改动进入提交。

## 11. 当前状态

2026-09-23：04.1–04.8 已在当前工作树完成本地实现与 Review。原 A–I Acceptance 保持不变，不以当前实现反向改写验收。

| Acceptance | 当前证据 | 状态 |
| --- | --- | --- |
| A 五类 Object batch read | Kernel / daemon / CLI tests 与真实 Lithograph integration 覆盖 Domain、Node Definition、Relationship Definition、Knowledge Node、Knowledge Relationship；一次 resolved State pin，结果顺序保持请求顺序 | 本地通过 |
| B Read 失败与边界 | tests 覆盖 duplicate / invalid / missing / internal-reserved / unsupported typed value / resource 与 invalid daemon response；CLI失败 stdout 保持为空 | 本地通过 |
| C CLI read 输入与 body | positional、`--refs-file`、implicit stdin，YAML/JSON envelope/body、batch YAML framing 与 canonical renderer 均有自动测试 | 本地通过 |
| D CLI patch 输入 | inline `--patch`、`--patch-file`、implicit stdin 共用单次 patch request 路径；invalid base/body/daemon response/error contract 有测试 | 本地通过 |
| E Batch create | 真实 Lithograph E2E 覆盖同一 Patch 创建多个 Knowledge Node / Relationship、request-local alias 与真实 created Ref | 本地通过 |
| F Update / restructure | Node labels/properties、Relationship properties/type/endpoints、replacement transition 与 property/definition rename maintenance 有真实 integration 证据 | 本地通过 |
| G Delete safety | Node incident Relationship 检查、显式 Relationship delete/restructure、非 DETACH 行为与 staged data-safety 有自动/真实数据库证据 | 本地通过 |
| H Atomicity / concurrency | Ontology + Knowledge 共用 explicit transaction；strict base、no-op、constraint/data-safety failure、abort 与 staged validation 均在真实 Lithograph 路径验证 | 本地通过 |
| I Regression / delivery | 主工作树与独立 fresh-source `pnpm validate` 均通过；Go statement coverage **90.2%**、race、govulncheck、TS/V8 + type coverage 100%、jscpd 0 clones、unused/build/Playwright/native/package/license/audit/diff 全绿；未发现 `object list/search` 实现。实现提交 `d1b4d8ccd792d009496596141520e0a930ae9ef3` 已推送到 `main`，Ubuntu 24.04 x64 GitHub Actions run `35870467442` / Validate job `107212896176` 成功 | 已通过 |

### Phase Review

本轮按第 9 节持续执行 review → 修复 → re-review，并收口以下 finding：

- Knowledge / Ontology mixed Patch 最初在 data-safety 上仍存在 pre-transaction 旧路径；现统一在同一个 explicit transaction 的 staged state 验证，避免 mixed delta 被旧状态误判。
- 删除 mixed Patch 后已经失效的 pre-transaction count wrapper / query 死路径，统一复用 transaction count helper。
- Object / Ontology Patch CLI、daemon Patch route、Knowledge Relationship property update、Knowledge read row validation 与 Object decode 出现重复实现；现只提取最小共享 helper，jscpd 最终为 **0 clones**。
- 补齐 typed-value、canonical YAML/JSON、Knowledge projection、CLI failure contract、旧 Ontology object adapter JSON/YAML/406 等真实边界测试，使仓库 Go total statement coverage稳定为 **90.2%**。
- 复核生产源码不存在 `object list` / `object search`，没有新增第二套 CRUD、Search DSL、Graph public surface、新 dependency 或 Lithograph 仓库改动。
- 主工作树完整 `pnpm validate` 已通过；独立 `/tmp` fresh-source Git repo 在不复用主树 `node_modules` / cache / build artifact 的条件下执行 `pnpm run setup && pnpm validate` 同样通过。
- `git diff --check` 通过；当前工作树没有 secret、database fixture、extension cache 或生成 artifact 进入版本状态。

当前 reviewed scope 没有剩余 task-affecting implementation finding。Phase 04 的 04.1–04.8、A–I Acceptance、Phase Review、主工作树完整 validation、独立 fresh-source validation 与实现提交 `d1b4d8ccd792d009496596141520e0a930ae9ef3` 对应的 Ubuntu 24.04 x64 GitHub Actions run `35870467442` / Validate job `107212896176` 已全部闭环，阶段进入 `done`。
