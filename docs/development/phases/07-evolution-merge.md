# Phase 07：Evolution Merge Session

**状态：`ready`**

## 1. 目标与范围

在 Phase 00–06 已完成 Runtime、Ontology、Object、Graph 与 Evolution Core 之后，Phase 07 把已确认的 whole-Knowledge-Base Merge Session 开放为正式公共能力。

本 Phase 完成后，调用方可以：

```text
开始一个 pinned Merge Session
  -> merge start

恢复 / 查看未完成工作
  -> merge list / get

分页理解并渐进解决冲突
  -> merge conflicts / resolve

验证精确 candidate revision
  -> KG OS consistency validation

提交或放弃工作
  -> merge finalize / abort
```

CLI 对应为：

```text
kg evolution merge start
kg evolution merge list
kg evolution merge get
kg evolution merge conflicts
kg evolution merge resolve
kg evolution merge finalize
kg evolution merge abort
```

本 Phase 只实现设计已经确认的 Merge Session lifecycle，不把 Lithograph 其它 Version Procedure 顺带提升为 KG OS 产品能力。

## 2. Design Inputs

- [Evolution 公共调用合同](../../design/evolution.md#evolution-公共调用合同)；
- [Merge Session 行为与一致性边界](../../design/evolution.md#evolution)；
- [Evolution CLI / Merge Session](../../design/cli.md#merge-session)；
- [公共错误合同](../../design/contracts.md#公共错误合同)；
- [D31 Invalid Snapshot 边界](../../design/decisions.md#d31-invalid-lithograph-snapshot-只允许-evolution-诊断不继续演进)；
- [D35 StateRef 复用 Lithograph Version Descriptor](../../design/decisions.md#d35-公共-stateref-直接复用-lithograph-version-descriptor)；
- [D41 Evolution Merge 使用 Lithograph Merge Session](../../design/decisions.md#d41-evolution-merge-使用-lithograph-merge-session-渐进解决冲突)；
- [实现范围映射](../../design/implementation.md#实现范围映射)；
- [Phase 06 Evolution Core](06-evolution-core.md)。

本计划只拆分实现、验证与 Review，不重新定义 MergeSession / MergeConflict / MergeResolution、State identity、conflict identity、candidate validation、expected revision、finalize 或 invalid State 的产品语义。

## 3. 依赖与当前基线

### 3.1 KG OS 前置依赖

- Phase 00–06 均为 `done`；
- Phase 01 已有统一 Lithograph v0.3.0 Host、read/write connection、SQL execution、context cancellation 与 typed database error category；
- Phase 02–04 已有 KG OS-valid Snapshot decoder、Binding / reserved Schema consistency validation、五类公共 Object Ref / Object Value、canonical aggregate projection 与 Knowledge element identity；
- Phase 05 已有 authenticated daemon、JSON adapter、Runtime auto-start 与真实 Lithograph Graph integration；
- Phase 06 已有 StateRef resolution、Branch/Tag/Commit metadata、History/Diff Change projector、public error mapping，以及正式 `kg evolution` command tree；
- 当前代码已经识别 `MERGE_CONFLICT`、`MERGE_SESSION_NOT_FOUND`、`MERGE_SESSION_CHANGED` 等 Lithograph category，但尚没有公共 Merge Kernel / HTTP / CLI；
- Phase 06 的 daemon integration test 明确验证 `/api/v1/evolution/merge/start` 尚未注册，因此现有代码不能作为 Phase 07 完成证据。

Design Inputs、前置依赖、Feature 顺序与 Acceptance 已齐全；当前没有需要重新确认的 Merge 产品语义，因此本 Phase 状态为 `ready`。

### 3.2 Lithograph v0.3.0 baseline

继续使用当前冻结的 Lithograph v0.3.0 SQL-only integration。当前 Lithograph `main` 已提供并验收：

```text
CALL lithograph.merge.start(source [, expectedHead])
CALL lithograph.merge.get(session)
CALL lithograph.merge.list([limit [, cursor]])
CALL lithograph.merge.conflicts(session [, limit [, cursor]])
CALL lithograph.merge.resolve(session, expectedRevision, resolutions)
CALL lithograph.merge.finalize(session, expectedRevision)
CALL lithograph.merge.abort(session, expectedRevision)
```

以及：

- durable Merge Session 与 restart recovery；
- pinned `ours/theirs`、monotonic revision 与 resolution CAS；
- bounded conflict pagination，cursor 绑定 session + revision；
- `merge.start(..., expectedHead)` 的 target-head CAS；
- `options.mergeSession={id,revision}` 的 exact candidate read context；
- finalize 时 revision + target Branch head 复核；
- `up_to_date / fast_forward / conflicted / ready` lifecycle；
- finalize/abort 后 Session 原子删除；
- open Session 作为 GC reachability root。

Phase 07 只消费这些公开 SQL contract，不修改 Lithograph 仓库，不访问 `_lithograph_*` internal table，也不建立第二套 Merge engine、workspace、conflict store 或 revision model。

## 4. Phase 边界

### 4.1 本 Phase 拥有

```text
Lithograph Merge Session adapter
  -> candidate read context
  -> public MergeSession projection
  -> public MergeConflict projection
  -> public MergeResolution reverse mapping
  -> exact-revision KG OS candidate validation
  -> finalize / abort lifecycle
  -> authenticated Merge HTTP
  -> kg evolution merge CLI
  -> integration / concurrency / recovery review closure
```

### 4.2 明确不属于本 Phase

- Rebase、Squash、Reset、Revert、GC、Patch passthrough 或 public checkout；
- Git working tree / staging；
- 第二套 Merge Session / conflict persistence、request-id idempotency log 或 application event store；
- 自动 conflict resolution、AI 决策、LLM conflict solver 或 interactive editor；
- `--auto-finalize`、`--resolve-all` 或隐藏的 finalize；
- 把 Merge candidate 暴露成新的 StateRef、ObjectRef 或持久业务 identity；
- raw Lithograph conflict slot、Binding Record、Schema locator、reserved identifier 或 internal graph representation；
- SDK、Web、Skill；
- 新 dependency、大范围 Snapshot decoder 重写或通用 workspace abstraction，除非实现出现当前真实且无法由现有 primitive 解决的约束。

## 5. Feature 顺序

```text
07.1 Merge host primitives / candidate read context
 -> 07.2 Session start / list / get / abort
 -> 07.3 Public conflict projection
 -> 07.4 Resolution reverse mapping
 -> 07.5 Exact-revision candidate consistency validation
 -> 07.6 Finalize lifecycle
 -> 07.7 Authenticated Merge HTTP
 -> 07.8 kg evolution merge CLI
 -> 07.9 Integration hardening / review closure
```

### Feature 07.1 Merge Host Primitives / Candidate Read Context

- 在现有 `internal/lithograph.Host` 上增加最小 Merge Session SQL adapter，继续使用同一 read/write pools、typed Lithograph JSON decoder 与 error category；
- 严格解码 `merge.start/get/list/conflicts/resolve/finalize/abort` 的公开列；缺字段、空/错误类型 session、非法 revision/status/Commit identity 或 malformed typed value 必须 fail closed；Session 本身保持 opaque，不解析其底层编码；
- `merge.start` 允许 query-level `branch`；`merge.finalize` 只允许 `author/message`；其它 Session operation 不携带这些 execution option；
- conflict page adapter必须让 Session metadata/revision 与该页 conflict inventory来自同一 SQLite read snapshot；尤其当前 page 为0条 conflict时，公共 `{session,revision,items:[]}` 的 revision仍必须来自同一 snapshot，不能用两个独立autocommit read拼接；
- 增加内部 candidate read primitive，把 `{session,revision}` 映射到 Lithograph `options.mergeSession`，只允许当前 Snapshot decoder / consistency validator 所需的 read / Schema introspection；
- 为复用既有 decoder，只提炼“读取 commit State 或 Merge candidate 的最小内部 read context”；不得复制一套 candidate-specific Ontology decoder，也不得把 candidate 伪造成 `commit/...` State；
- candidate context 中的 mutation / Version Procedure / `LOAD CSV` 继续由 Lithograph 的 `READ_ONLY_SNAPSHOT` / `TRANSACTION_BOUNDARY_REQUIRED` contract 拒绝，不在 KG OS 建第二套 allowlist。

### Feature 07.2 Session Start / List / Get / Abort

- `merge.start` 先解析 target Branch 当前 head 与 `source` 为 immutable `targetState/sourceState`，分别完成 KG OS-valid consistency validation；
- 调用 Lithograph 时 `source` 传已经 pin 的 `commit/...`，并显式传 `expectedHead=targetState`；target Branch 在校验后移动必须返回 `BRANCH_HEAD_MOVED` 且不创建 Session；
- start 成功后核对返回的 target Branch、ours/theirs 与已验证输入一致；无论 `up_to_date`、`fast_forward` 或 diverged 都不得自动 finalize；
- `merge.list` 只投影 `MergeSessionSummary`，不为每个 row 额外计算 status/conflict；默认 limit `100`，接受 `1..1000`，cursor opaque；保持 Lithograph 的 **live operational inventory** 语义，不把第一页时的 Session 集合冻结成跨页 snapshot，并发 start/finalize/abort 可以改变后续 page；
- `merge.get` 返回当前 `MergeSession`，保持一次底层 read snapshot 内 revision/status/unresolved 一致；
- `merge.list/get` 是 operational metadata/diagnostic read：即使存在绕过 KG OS 由 Lithograph 直接创建且 pinned State 已不满足 KG OS consistency 的 Session，也允许读取其公开 metadata；
- `merge.abort` 只按 `session + expectedRevision` cleanup，允许清理 invalid Session；stale revision 返回 `MERGE_SESSION_CHANGED`，成功不创建 State、不移动 Branch。

### Feature 07.3 Public Conflict Projection

- `merge.conflicts` 在解释 conflict 前重新确认 Session pinned `targetState/sourceState` 均为 KG OS-valid；invalid 时返回 `CONSISTENCY_ERROR`；
- 直接复用 Lithograph opaque `conflictId`，不按 path/ref 再生成第二套 conflict identity；
- 把 raw graph / Schema / Index conflict slot 映射为 `MergeConflict` 的公共 `kind/path/baseRef/oursRef/theirsRef/relatedRefs/base/ours/theirs/resolution`；
- 复用 Phase 06 Evolution Diff 已有的 aggregate、identity continuity 与 shared resource 映射规则；Property/Constraint/Index 仍归入 Definition，不恢复 standalone Object；
- shared Index 等同一 native `conflictId` 只报告一次，用稳定展示 anchor + `relatedRefs` 表达其它受影响 Definition；
- Knowledge Relationship type/endpoint replacement、delete-vs-modify 与 Schema/constraint conflict 必须按真实公共对象语义表达，不用名称启发式伪造 continuity；
- 明确保留“side 不存在”和“side 的合法值是 JSON/Cypher `null`”的区别，不能因 JSON serialization 把 add/delete conflict 与显式 null value 混淆；
- 无法安全双向映射的 raw conflict 返回 `CONSISTENCY_ERROR`，不暴露 raw slot、internal identifiers 或底层完整诊断；
- conflict page 默认 `100`、范围 `1..1000`；cursor 保持 session + revision binding，resolution 改变后旧 cursor 返回 `MERGE_SESSION_CHANGED`。
- 同一 page 的 native conflict row必须与该 read snapshot pin 的 Session/revision一致；items为空时同样返回这一版精确revision，不能产生“items来自R、revision来自R+1”的混合响应。

### Feature 07.4 Resolution Reverse Mapping

- `merge.resolve` 接受调用方当前已决定的一批 `MergeResolution`，不要求一次提交全部 conflict；
- `expectedRevision` 必须由调用方显式提交，不由 Kernel/daemon/CLI 先 get 再自动填充；
- 进入公开 resolution 解释前重新确认 Session pinned `targetState/sourceState` 均为 KG OS-valid；invalid 时返回 `CONSISTENCY_ERROR`，不能借 direct-Lithograph Session 绕过 D31；
- 只为本次请求中的 `conflictId` 建立当前 revision 的 public/native 双向映射，不要求为了少量 resolution 把全部 conflict 一次 materialize 到调用方或 Kernel memory；无法安全定位的 id、duplicate id 与非法 choice/value返回 `INVALID_ARGUMENT`；
- `choice=ours|theirs` 只引用对应 native conflict side；`choice=value` 必须携带 value，并先按该 public logical slot/Object Value contract 验证，再确定性转换为 Lithograph 所需 typed value；
- resolve preflight保留该 Session immutable `branch/targetState/sourceState` 并确认 `expectedRevision` 对应当前 revision；Lithograph resolve成功后用这组已pin metadata + resolve返回的 `revision/status/unresolved` 组装公共 `MergeSession`，**不得 resolve 后再 get 当前 Session**，避免并发 resolve/abort把本次成功响应漂移到另一 revision或 `NOT_FOUND`；
- 同一 request 的 resolution batch 由 Lithograph 原子 set/replace；有效变化使 revision 至多递增一次，完全相同的 no-op resolution 保持 revision 不变；
- 已保存 resolution 因其它 resolution 暂时使 conflict 消失时，KG OS 不自行删除或重建 dormant resolution；同一 native conflictId 重现时继续沿用 Lithograph state；
- resolve 成功只返回更新后的 `MergeSession`，不创建 KG OS State、不移动 Branch。

### Feature 07.5 Exact-Revision Candidate Consistency Validation

- 只有 Session `unresolved=0` 才进入 candidate validation；仍有 conflict 时保留 `MERGE_CONFLICT`；
- validation 前再次确认 pinned `targetState/sourceState` 均满足 D31，阻止 direct-Lithograph invalid Session 借 KG OS 继续演进；
- 使用 **同一个 `session + expectedRevision` candidate read context**运行现有 KG OS Snapshot / consistency validation，覆盖 Binding coverage、reserved internal graph / Schema isolation、Ontology aggregate 可解释性、shared declaration consistency，以及 caller-owned Schema/Knowledge 不含 Vector；
- decoder 的多次只读查询都携带同一 revision；并发 resolve 一旦把 revision 改变，后续 candidate read 必须返回 `MERGE_SESSION_CHANGED`，不能拼出跨 revision Snapshot；
- candidate 是非持久工作区，不生成 State identity、不进入 History/Diff、不创建 cache/index 作为 correctness source；
- Semantic source / IndexDefinition 只作为 candidate 业务值参与校验；KG OS 不生成 embedding、不访问 Provider cache 作为 consistency source，也不因普通正文 merge 主动调用远端模型；
- candidate validation成功只证明这个 revision 可作为 KG OS-valid Snapshot解释；真正 canonical publication仍必须由同 revision的 `merge.finalize` 完成。

### Feature 07.6 Finalize Lifecycle

- `merge.finalize` 要求显式 `expectedRevision`；先执行 Feature 07.5 的 exact-revision candidate validation，成功后立刻用同一 revision调用 Lithograph finalize；
- 并发 resolution 改变时必须返回 `MERGE_SESSION_CHANGED`；target Branch 被删除返回 `BRANCH_NOT_FOUND`，head 已离开 pinned target返回 `BRANCH_HEAD_MOVED`；失败都保留 Session；
- merged candidate 中新增或改变的 Semantic definition 继续由 Lithograph 在 Schema publication 前执行本地 Provider/config validation；validation失败时保留Session且不移动Branch，KG OS不为了该检查主动发起远端embedding请求；
- 成功 `up_to_date` 返回 pinned target State，不移动 Branch、不创建 Commit；
- 成功 `fast_forward` 只把 target Branch移动到 pinned source State，不创建额外 Merge Commit；
- 成功 `merged` 创建唯一 two-parent Merge Commit并返回新 State；parent 顺序继续由Lithograph保证；
- `author/message` 只有 `merged` 真正创建 Commit时写入；up-to-date / fast-forward不能为了保存 metadata造空 Commit；
- finalize success 后 Session/resolution 不再可读；KG OS 不额外维护 completed-session tombstone；
- 返回 `{status,targetState,sourceState,state}` 时 target/source来自Session pinned inputs，`state`来自Lithograph finalize真实 resolved Commit。

### Feature 07.7 Authenticated Merge HTTP

- 在现有 `kgosd` 同一个 `net/http` server 增加：
  - `POST /api/v1/evolution/merge/start`
  - `POST /api/v1/evolution/merge/list`
  - `POST /api/v1/evolution/merge/get`
  - `POST /api/v1/evolution/merge/conflicts`
  - `POST /api/v1/evolution/merge/resolve`
  - `POST /api/v1/evolution/merge/finalize`
  - `POST /api/v1/evolution/merge/abort`
- 全部 route 复用现有 Bearer middleware、request body limit、strict JSON decode、public error envelope、request cancellation 与 graceful shutdown；
- transport 每次只调用一次对应 Kernel logical operation，不由 daemon 自动翻页、自动 resolve 或自动 finalize；
- Session 与 cursor 始终按 opaque token 处理：HTTP/Kernel只校验必填/JSON类型、revision/limit范围和resolution shape等公共合同，不解析 `merge-session/<uuid>` 或 cursor内部编码；任意非空opaque Session/cursor直接交给底层验证，Session不存在映射为 `MERGE_SESSION_NOT_FOUND`，cursor与当前session/revision不匹配时保留实际 `INVALID_ARGUMENT` / `MERGE_SESSION_CHANGED`；
- success 使用 `application/json`；Merge不引入NDJSON、SSE或额外长连接协议。

### Feature 07.8 `kg evolution merge` CLI

- 正式开放：

```text
kg evolution merge start --branch <branch-name> --source <StateRef>
kg evolution merge list [--limit <n>] [--cursor <token>]
kg evolution merge get <session>
kg evolution merge conflicts <session> [--limit <n>] [--cursor <token>]
kg evolution merge resolve <session> --expected-revision <integer> (...)
kg evolution merge finalize <session> --expected-revision <integer> [--author <text>] [--message <text>]
kg evolution merge abort <session> --expected-revision <integer>
```

- `merge resolve` 的 resolutions正文继续使用互斥 `--resolutions` / `--resolutions-file` / non-TTY stdin，正文是裸 `MergeResolution[]` JSON array；
- CLI 不自动读取全部 conflict、不自动 retry stale revision、不自动选择 ours/theirs、不自动 finalize；
- `expectedRevision` 始终来自调用方上一次观察到的 start/get/conflicts/resolve结果；
- success stdout为一个compact JSON document，`--pretty`只改变空白；失败stdout为空、stderr输出公共error JSON并复用既有exit-code mapping；
- 复用Phase 03 Runtime ensure、credential resolution和English/中文human-facing help；命令名、machine field、StateRef、session、enum与error code不翻译。

### Feature 07.9 Integration Hardening / Review Closure

- 使用真实 bundled SQLite + Lithograph v0.3.0 extension验证 Kernel → daemon → CLI完整 Merge Session链路，不用mock Merge store替代核心E2E；
- 用Object Patch / Graph execute建立分叉State、Ontology/Knowledge/shared Index/Relationship变化，再通过公共 Merge命令完成disjoint、conflicted、fast-forward、up-to-date与two-parent merge；
- 构造大量 conflict验证bounded pagination、渐进resolve、stale cursor、no-op resolution、dormant resolution与revision CAS；
- 通过 raw Graph / Lithograph public能力建立 direct-Lithograph Session与KG OS-invalid pinned/candidate场景，验证metadata read / abort cleanup允许，而conflicts/resolve/finalize按D31拒绝；
- 验证connection close、daemon restart后open Session和resolution仍可由list/get恢复；
- 验证client cancel / daemon shutdown不会返回partial伪成功，也不会把未知结果自动重放；
- 保持Phase 00–06 Ontology/Object/Graph/Evolution/onboarding/runtime验收通过；
- 检查生产代码没有第二套Merge engine/session store、raw internal table access、candidate State identity、auto-finalize/auto-resolution、Rebase/Squash/Reset/Revert/GC/checkout scope creep或新dependency。

## 6. Acceptance Matrix

| ID | 场景 | 必须证明的结果 |
| --- | --- | --- |
| A | Session identity / pinning | start把target/source解析并pin为真实immutable State；expectedHead阻止校验后target漂移；Session token不成为StateRef/ObjectRef |
| B | Recovery / inventory | list/get只投影公开metadata；open Session跨connection/process restart可恢复；list不为每个Session隐式展开冲突，也不错误承诺跨页固定Session集合 |
| C | Conflict projection | raw graph/schema/index conflict转换为公共kind/path/ref/value；shared resource不重复；不泄露Binding/Schema locator/internal slot |
| D | Pagination / resolution | conflict分页绑定session+revision且空页revision仍来自同一read snapshot；resolve可分批、可替换、no-op不推进revision；stale revision/cursor稳定失败；resolve响应不被post-write get观察到的并发状态污染 |
| E | Explicit value mapping | ours/theirs/value语义和类型验证正确；不存在side与合法null不混淆；无法安全反向映射时fail closed |
| F | Candidate consistency | unresolved=0后对同一session+revision运行完整KG OS一致性校验；并发revision变化不能形成混合candidate；candidate无State identity |
| G | Invalid State boundary | KG OS start拒绝invalid输入；direct-Lithograph invalid Session允许list/get/abort，但conflicts/resolve/finalize不能继续演进 |
| H | Finalize semantics | up_to_date/fast_forward/merged三种结果准确；revision/head CAS、two-parent Commit、author/message与Session删除原子语义正确 |
| I | HTTP / auth / cancellation | 七个route统一Bearer、JSON/error contract与context cancellation；无自动翻页/resolve/finalize，无internal泄漏 |
| J | CLI contract | 七个命令、resolutions text/file/stdin、pagination、expected revision、pretty、Runtime ensure、i18n和stdout/stderr/exit符合CLI设计 |
| K | Regression / delivery | Phase 00–06无退化；无第二Merge store/engine或其它Version API scope creep；本地、fresh-source与要求的Ubuntu CI取得证据 |

## 7. 关键失败路径

至少覆盖：

1. malformed / nonexistent source StateRef、Branch，缺失/空 Session、非法 cursor/revision，以及非空但不存在的 opaque Session；
2. start 的source是Branch/Tag并在校验后移动，本次仍使用已pin source Commit；
3. start 校验后target Branch head移动，`expectedHead` CAS拒绝且没有partial Session；
4. start 的target/source任一为KG OS-invalid State；
5. up-to-date / fast-forward start只创建Session，不提前移动Branch或自动结束；
6. list/get读取由直接Lithograph权限建立的Session，不因为pinned State invalid而无法诊断；
7. list分页期间并发start/finalize/abort可以改变后续page；KG OS不得伪造跨页pinned inventory，需要最新完整inventory时调用方从首屏重新枚举；
8. conflicts/resolve/finalize面对direct-Lithograph invalid pinned State返回`CONSISTENCY_ERROR`；
9. abort仍可cleanup上述invalid Session；
10. conflict cursor跨session/revision复用或resolve后继续使用旧cursor；
11. raw internal Binding/reserved graph/Schema locator conflict无法出现在public payload；
12. shared Index同一native conflictId不能因多个Definition展示位置变成多次resolution；
13. Knowledge Relationship type/endpoint replacement不被名称/Ref启发式拼成伪continuity；
14. conflict一侧缺失与explicit `null` value严格区分；
15. resolve含unknown/duplicate conflictId、非法choice、`choice=value`缺value或value类型错误；
16. resolve完全重复已有resolution时revision保持不变；
17. resolve写入成功后立即发生并发resolve或abort，本次公共响应仍返回本次已pin的branch/target/source与底层resolve实际返回的revision/status/unresolved，不通过post-write get漂移；
18. stale expectedRevision即使payload与当前resolution相同也不能覆盖新状态；
19. dormant resolution对应conflict消失/重现时不被KG OS删除或错配；
20. unresolved>0时candidate inspection/finalize被`MERGE_CONFLICT`阻止；
21. candidate validation多次query之间发生resolve，旧revision后续读取或finalize必须失败；
22. candidate违反Binding coverage、reserved Schema、Ontology aggregate或caller-owned Vector profile；
23. candidate validation不得生成State、History entry、embedding Property或第二份correctness cache；
24. finalize前target Branch删除或head移动，Session保留；
25. finalize前resolution改变，旧validated revision不能提交；
26. finalize up_to_date不移动Branch，fast_forward不创建Commit，merged恰好创建一个two-parent Commit；
27. finalize author/message不为up_to_date/fast_forward额外制造Commit；
28. Semantic definition新增/改变时本地Provider/config validation失败，Session保留、Branch不移动且KG OS不发远端embedding请求；
29. stale abort不能删除别人刚更新的Session；
30. finalize/abort失败或取消后不得出现canonical history已改变但Session仍可重复提交的partial状态；
31. daemon restart后Session/resolution可恢复并继续resolve/finalize；
32. CLI required resolutions正文缺失且stdin为TTY时直接usage error，不等待editor/REPL；
33. 实现不得依赖connection上一次checkout或把Session变成跨请求hidden current merge。
34. 当前revision没有任何conflict时，`merge.conflicts`仍返回该精确revision + empty items；并发resolve不能让items与revision来自两个不同snapshot。

## 8. 验证计划

### Targeted

- `internal/lithograph`：Merge procedure option、result decoder、typed values、candidate read context、cursor/revision/error mapping、connection cleanup；
- `internal/kernel`：start pin/consistency、Session projection、conflict projector、shared resource dedupe、explicit value reverse mapping、candidate validation、finalize result mapping；
- `internal/daemon`：七个route的method/auth/body/error/context mapping；
- `cmd/kg`：Merge command tree、参数互斥、resolutions输入、pagination、pretty、i18n、Runtime ensure与error/exit。

### Integration

- 真实 Lithograph v0.3.0：start/get/list/conflicts/resolve/candidate/finalize/abort、revision/head CAS、restart recovery与typed error category；
- 真实 Kernel：Ontology + Knowledge + shared Index + Relationship冲突公共投影、渐进resolve、candidate consistency、invalid direct Session boundary；
- 真实 daemon：Bearer、bounded conflict page、stale revision/cursor、cancel/shutdown；
- 真实 packaged `kg`：stopped daemon auto-start后执行完整conflicted merge、resume与finalize/abort workflow；
- reopen后Session/resolution仍来自同一 `kgos.db`，成功finalize后的History/Ancestry/Branch head继续由Phase 06 Evolution Core正确读取。

### Repository gates

- 先运行受影响Go package targeted tests与真实Lithograph integration；
- 完成 `pnpm check:quick`，再运行完整 `pnpm validate`；
- 保持Go statement coverage门禁 **>= 90%**、race/staticcheck/govulncheck与jscpd既有门禁；
- 在独立fresh-source checkout运行 `pnpm run setup && pnpm validate`；
- `git diff --check`、Markdown本地链接、最终diff与untracked file检查通过；
- Ubuntu 24.04 x64 GitHub Actions Validate取得真实成功结果后才允许Phase进入 `done`。

## 9. Review 重点

Phase Review至少检查：

- 是否真正复用Lithograph Merge Session，而不是在KG OS维护第二套workspace/conflict/revision；
- start是否先验证immutable target/source，再用`expectedHead`关闭target check-then-use竞态；
- candidate decoder是否复用现有KG OS consistency逻辑，同时没有把candidate伪造成State；
- conflict projector与reverse mapper是否双向一致，尤其是shared resource、null/absence、rename/replacement与typed value；
- conflictId是否始终保留Lithograph opaque identity，没有由public path生成第二identity；
- list/get/abort与conflicts/resolve/finalize的invalid State边界是否按D31严格区分；
- candidate validation是否绑定精确revision，任何并发resolve都不能静默替换被验证内容；
- finalize是否保留Lithograph短writer/CAS与原子Session删除，不在KG OS外层持有大型writer transaction；
- HTTP/CLI是否保持AI-first显式生命周期，没有自动resolve、自动retry stale revision或自动finalize；
- public error/details是否隐藏internal graph/schema identity；
- 是否意外实现Rebase/Squash/Reset/Revert/GC/checkout、SDK/Web/Skill或增加新dependency。

发现finding后按“修复 → targeted复验 → 必要范围扩大验证 → 再Review”闭环；没有新改动或新finding时停止重复验证。

## 10. 完成条件

Phase 07只有同时满足以下条件才能进入 `done`：

1. 07.1–07.9 Scope全部真实实现；
2. A–K Acceptance全部取得当前工作树/提交的真实证据；
3. Kernel、authenticated HTTP与正式 `kg evolution merge` CLI使用同一logical contract；
4. public conflict projection / resolution reverse mapping、candidate validation、invalid State与revision concurrency均通过真实Lithograph integration；
5. up-to-date / fast-forward / conflicted / ready / merged lifecycle及restart recovery通过端到端验证；
6. Phase 00–06 regression无退化；
7. Phase Review findings全部关闭；
8. 主工作树 `pnpm validate` 与独立fresh-source validation成功；
9. 最终diff、文档/链接、coverage与仓库卫生检查通过；
10. Phase要求的Ubuntu 24.04 x64 GitHub Actions Validate真实成功；
11. README、设计状态导航、开发路线、Phase状态与实际实现证据同步。

完成代码、七个CLI命令存在、单组merge测试通过或本地validation成功，都不能单独把Phase标记为 `done`。Commit、push、发布仍是独立动作，只按实际执行证据记录。

## 11. 当前状态

2026-09-24：Phase 07 为 `ready`。Phase 00–06均已完成；Evolution owner、CLI owner、公共错误合同与D41已经冻结Merge Session logical contract。当前KG OS仍没有公共Merge Kernel / HTTP / CLI，Phase 06还显式验证Merge route不存在。

本计划已核对当前Lithograph v0.3.0 `main`：durable Merge Session、expected-head CAS、bounded conflict pagination、incremental resolution、candidate `mergeSession` read context、revision/head finalize CAS、restart recovery与GC root均已有公开SQL合同和Phase 09验收证据。Phase 07可以复用现有Host/Snapshot/Object/Evolution primitive完成，不需要修改Lithograph或新增产品设计。
