# Evolution 设计

本文件是 KG OS **State、State Data、Branch、Tag、History、Diff 与 Merge** 的设计真源。

## Evolution

Evolution 是 KG OS 对 **Knowledge Base 状态演进**的公共能力域。它不创建第二套版本系统，而是把 Lithograph 的 immutable Commit DAG、Branch、Tag 与 Commit Data 映射成适合知识世界的 State、演进路径、状态标签和状态注释。

### State：Knowledge Base 的不可变状态

一个 KG OS State 与一个 Lithograph Commit 一一对应，并直接复用其底层 Commit identity；KG OS 不创建 `stateId` 到 Commit ID 的第二套持久化映射。公共 wire 按 D35 直接使用 Lithograph `commit/<64-lowercase-hex>` 作为 resolved State identity。

一个 State Snapshot 同时覆盖：

```text
State
└── immutable Snapshot
    ├── Ontology Structure   → versioned Lithograph Schema
    ├── Ontology Semantics   → versioned graph data
    │   ├── Definition / Property semantics
    │   └── Domain / INCLUDES organization
    └── Knowledge Data       → versioned graph data
```

因此 KG OS 不引入 `ontologyVersion`、`knowledgeVersion` 或另一套 State history。Ontology、Knowledge 与 Evolution 共享同一个底层 Commit DAG。

### State Data：可修改的状态注释

State Data 直接复用 Lithograph Commit Data，是调用方附加在某个 State 上的 mutable JSON annotation。KG OS 不预定义 `title`、`time`、`stage`、`world` 等业务字段，也不把 State Data 解释成领域事实。

State Data 与 State Snapshot 必须严格区分：

- State / Snapshot immutable；
- State Data 可以 set / replace / clear，不因此创建新 State；
- State Data 不进入 Ontology / Knowledge query、Constraint、Diff 或 Merge；
- 修改 State Data 不改变 State identity；
- 如果一项数据需要随世界状态一起历史化、查询、约束、Diff 或 Merge，它必须进入 Ontology / Knowledge，而不是 State Data。

State Data 保留 Lithograph Commit Data 的“absence 与 JSON `null` 不同”语义：没有 sidecar 时 `hasData=false` 且 `data=null`；显式执行 `set data null` 后 `hasData=true` 且 `data=null`。`set data` 接受任意合法 JSON value，包括 `null`；`clear data` 才表示移除 sidecar。

KG OS 不为 State Data 再定义第二套业务 schema 或任意固定 byte 上限；JSON 合法性、底层可接受资源大小与失败类别直接服从 Lithograph Commit Data / `RESOURCE_ERROR` 公共合同。adapter 可以设置请求体级 transport limit，但不能把它解释成 State Data 的持久化语义上限。

因此 State detail 可以在读取时聚合 immutable State metadata 与当前 State Data，但响应必须保持字段边界，不能让 State Data 看起来像创建 Commit 时冻结的 Snapshot 内容。Branch / Tag 的枚举由独立能力负责；State `get` 不要求为了附带所有反向 refs 而扫描整个 ref 集合。

### Branch 与 Tag

KG OS 使用 Lithograph Branch 表达**可以继续演进的命名路径**，使用 Lithograph Tag 表达**显式命名的 State 引用**：

```text
Branch
→ 会随该 Branch 上成功的 Object Patch / Graph Execute 向新 State 前进

Tag
→ 指向某个 State
→ 不随普通 write 自动移动
→ 只有显式 move 才改变目标
```

KG OS 不把 Lithograph connection-local `checkout` 提升为公共 Evolution 能力。AI / SDK 读取必须显式传递 State / Branch / Tag reference，写入必须显式指定目标 Branch，避免依赖隐藏的 connection state。底层实现可以按 Lithograph 合同管理 connection，但该状态不能成为 KG OS 公共请求语义的一部分。

### State reference

Object / Graph Read 共享同一套 State 引用语义：调用方可以直接引用确定 State，也可以通过 Branch / Tag 引用；KG OS 在 operation 开始时解析到 immutable State，并在整个 operation 中保持 pinned Snapshot。所有 read response 应返回最终 resolved State identity，使 Branch / Tag 后续移动不会改变已经返回数据的解释。这里的 State / Branch / Tag reference 类似 Git ref resolution，不建立独立 `State Context` 对象。

v1 wire 直接复用 Lithograph Version Descriptor，不建立第二套字符串：

```text
StateRef      = commit/<64-lowercase-hex> | branch/<name> | tag/<name>
ResolvedState = commit/<64-lowercase-hex>
```

Branch / Tag name validation 与 Lithograph 完全一致；KG OS 不做大小写折叠、路径重写或别名。任何接受 StateRef 的 read 都在开始时解析并 pin，返回值中的 `state` 永远使用 ResolvedState，而不是把调用方传入的 Branch / Tag 原样当成已解析 State。

Object Patch / Graph Execute 必须明确目标 Branch。Object Patch 使用 Lithograph explicit transaction，把实现同一上层 target change 所需的多条标准 Cypher mutation 合并为恰好一个新 Commit；Graph `execute` 则继续完全服从 Lithograph writable Cypher 自身的 transaction / Commit 语义，不继承 Object Patch 的 one-State guarantee。KG OS 不要求调用方执行“修改后再手工 commit”的两步流程。成功响应必须返回**最终 State identity**；Object Patch 调用方无需理解底层 connection-local explicit transaction lifecycle，Graph 调用方也不通过 KG OS 控制底层 Commit boundary。

### Evolution 能力面

KG OS 当前只提升对知识世界有直接产品意义的版本能力，不镜像 Lithograph 的全部 Version Procedure：

```text
Evolution Capability
│
├── Read
│   ├── overview
│   ├── get
│   ├── ancestry
│   ├── history
│   └── diff
│
├── State
│   ├── create
│   ├── set data
│   └── clear data
│
├── Branch
│   ├── list
│   ├── create
│   └── delete
│
├── Tag
│   ├── list
│   ├── create
│   ├── move
│   └── delete
│
└── Merge
    ├── start
    ├── list
    ├── get
    ├── conflicts
    ├── resolve
    ├── finalize
    └── abort
```

这些名称描述逻辑能力，不冻结最终 CLI command、SDK method 或 HTTP route。

### Evolution 公共调用合同

Evolution wire 同样使用 transport-neutral logical shape；State Data 原样是 JSON value，不引入 KG OS 业务 schema。

公共结果类型：

```text
StateSummary = {
  state: ResolvedState,
  parents: ResolvedState[],
  author: string?,
  message: string?,
  committedAt               # UTC Unix epoch microseconds
}

Change = {
  change: add | update | delete | rename | restructure,
  kind: ObjectKind,
  path: string,          # RFC 6901 JSON Pointer over logical Object Value; "" = whole Object
  beforeRef?: ObjectRef,
  afterRef?: ObjectRef,
  relatedRefs?: ObjectRef[], # shared resource 的其它受影响 Definition
  before?,
  after?
}

HistoryEntry = {
  state: ResolvedState,
  parents: ResolvedState[],
  change: Change?        # explicit empty-delta State 在 all-scope history 中为 null
}

MergeConflict = {
  conflictId: string,
  kind: ObjectKind,
  path: string,          # 与 Change.path 相同的 public logical slot
  baseRef?: ObjectRef,
  oursRef?: ObjectRef,
  theirsRef?: ObjectRef,
  relatedRefs?: ObjectRef[],
  base?,
  ours?,
  theirs?,
  resolution?: {
    choice: ours | theirs | value,
    value?
  }
}

MergeResolution = {
  conflictId: string,
  choice: ours | theirs | value,
  value?                 # choice=value 时必填
}

MergeSessionSummary = {
  session: string,
  branch: string,
  targetState: ResolvedState,
  sourceState: ResolvedState,
  revision: integer
}

MergeSession = {
  session: string,
  branch: string,
  targetState: ResolvedState,
  sourceState: ResolvedState,
  revision: integer,
  status: up_to_date | fast_forward | conflicted | ready,
  unresolved: integer
}
```

`Change.path` 只用于解释 Diff / History 的逻辑位置，不是 mutation API；Object Patch 仍只接受 Git Extended Diff。`before/after` 使用对应 public Object Value / Lithograph typed value 的 JSON-compatible representation，不返回 internal slot。Add 只有 `afterRef`，Delete 只有 `beforeRef`，Update / Restructure 对 identity 未变化的 Object 令 `beforeRef == afterRef`。只有 owner 已有 continuity evidence 能证明 rename 前后仍是同一个 Object 时，Rename Change 才同时给出不同的 `beforeRef/afterRef`，例如顶层 Definition / Domain 的 Binding / Domain identity continuity；内嵌 Property rename 保持 aggregate Ref，在字段级 Change 中说明。Knowledge Relationship 因 type / endpoint change 发生 replacement 时，D20 明确不持久化 old→new continuity，因此 Evolution Diff / History 必须表现为独立 Delete + Add；当次 Object Patch response 的 `transitions` 不能被 History 事后用来拼接生命周期。Definition-level 派生的大量 Relationship replacement 同样表现为可分页的 Delete/Add change。

Ontology Change 的 `kind/ref` 始终定位公共 Domain / Definition，不把 Property/Constraint/Index 重新暴露为独立 Object。`path` 定位 aggregate 中的字段；Property 改名或 canonical 数组排序导致位置变化时，Diff 可以报告对应 collection 的完整 before/after，而不是用一个 index 指向两个不同属性。

共享索引的一次底层变更在 whole-Ontology Diff 中只报告一次：从 before/after 中参与该资源的 Definition Ref 并集按 UTF-8 bytes 选择最小 Ref 作为展示锚点，`relatedRefs` 列出其余受影响 Ref。这个选择只用于报告，不成为编辑 ownership；object-scope 过滤命中任一参与 aggregate 都能看到该变化。beforeRef/afterRef 只在对应 State 的该聚合确实包含被报告字段时给出；共享 target 的加入/移除可以只在一侧具有该展示位置，不据此推断整个 Definition 被新增/删除。查询该 aggregate 当前详情时看到的仍是同一个共享资源。

Merge 也不为同一个底层 conflictId 的多个展示位置制造重复 conflict。选择上述展示锚点，显示完整资源 scope，并按同一个 conflictId 解决一次。显式 replacement value 使用该 conflict 对应的公开 aggregate 字段表示，由 KG OS 映射回原生 conflict slot；这不是要求 AI 用独立 Schema API 修复。一个底层 conflict 无法安全双向表达时仍按既有 consistency 边界拒绝，不猜测或泄露内部资源。

`history.items` 的分页单位是 **一个 State 中的一条 public Change**；同一个 State 有多条变化时可以出现多个相同 `state/parents` 的 HistoryEntry。显式 empty-delta State 在 `scope=all` 时仍返回一个 `change=null` entry，使业务 State 的存在不会因为 Snapshot diff 为空而从 History 消失。

`committedAt` 直接复用 Lithograph Commit metadata 的 UTC Unix epoch microseconds，不再转换成另一套时间字符串；它是 immutable Commit metadata，不等同于业务时间字段。

```text
overview()
→ { defaultBranch: string, state: ResolvedState }

get({ state: StateRef })
→ {
    state: ResolvedState,
    parents: ResolvedState[],
    author: string?,
    message: string?,
    committedAt,
    consistency: {
      status: valid | invalid,
      issues: [ { code, message } ... ]
    },
    hasData: boolean,
    data
  }

ancestry({ root: StateRef, limit?, cursor? })
→ { root: ResolvedState, items: StateSummary[], cursor? }

history({ root: StateRef, scope: all|ontology|knowledge|object,
          object?: { anchorState: StateRef, ref: ObjectRef }, limit?, cursor? })
→ { root: ResolvedState, items: HistoryEntry[], cursor? }

diff({ before: StateRef, after: StateRef,
       scope: all|ontology|knowledge|object,
       object?: { anchorState: StateRef, ref: ObjectRef }, limit?, cursor? })
→ { before: ResolvedState, after: ResolvedState, items: Change[], cursor? }
```

`scope=object` 时必须提供 `object`，其它 scope 不接受 `object`。`anchorState` 在 operation 开始时解析并 pin 为 immutable anchor；它只负责证明 Object continuity，不替代 `root`、`before` 或 `after` 的 traversal/diff 范围。History 中 resolved `anchorState` 必须位于 resolved `root` 的 ancestry 内；Diff 中 resolved `anchorState` 必须等于 resolved `before` 或 `after`，否则返回 `INVALID_ARGUMENT`。History / Diff 内部变化按 public Object / Knowledge semantics 聚合，不暴露 Binding Record、Schema Locator、reserved identifiers 或 raw Lithograph Patch slot。

`get.consistency` 是 invalid State 的诊断入口。`status=valid` 时 `issues=[]`；`status=invalid` 时至少以公开 issue code 区分 `BINDING_MISSING`、`BINDING_DUPLICATE`、`BINDING_DANGLING`、`BINDING_KIND_MISMATCH` 与 `RESERVED_SCHEMA_INVALID`，`message` 只描述公开 Object / Schema kind，不泄露 internal element identity 或 `_lithograph_*`。其它 Evolution topology read 不要求为每个历史 State 执行完整 consistency scan；调用方需要诊断某个 State 时使用 `get`。

`ancestry` / `history` / `diff` 的 `limit` 与 cursor 使用和 Object pagination 相同的基础规则：省略 limit 为 `100`，v1 接受 `1..1000`，cursor opaque 且绑定 operation、resolved root/before/after、scope/filter；输入不匹配返回 `INVALID_ARGUMENT`。

`ancestry` 的 State 顺序直接复用 Lithograph `log` 的 deterministic DAG order：reverse-topological；同一 topology level 先按 `committedAt` descending，再按 Commit ID ascending。`history` 使用同一 State order，同一 State 内多条 `Change` 按 `kind`、`beforeRef ?? afterRef`、`path`、`change` 的 UTF-8 bytes 升序。`diff` 不存在 State traversal order，直接按同一 canonical Change key 升序。cursor 保存 pinned traversal / change frontier，不受 Branch / Tag 后续移动影响。

`ancestry` 可以穿过 invalid / pre-KGOS Commit，因为它只暴露 topology / lightweight metadata；`history` 与 `diff` 不解释 invalid Snapshot。`history.root` 必须是 KG OS-valid State，并且向 ancestry 回溯时在第一个 invalid / pre-KGOS parent 处终止业务 history，不跨该边界猜 continuity；第一个 KG OS-valid bootstrap State 可以作为 history genesis，以 `change=null` 表示 public Snapshot 没有可解释的前置 KG OS State。`diff.before/after` 与 object `anchorState` 都必须是 KG OS-valid State，否则返回 `CONSISTENCY_ERROR`。

State / ref mutation：

```text
state.create({ branch, data?, author?, message? })
→ { state: ResolvedState }

state.setData({ state: StateRef, data })
→ { state: ResolvedState, data }

state.clearData({ state: StateRef })
→ { state: ResolvedState }

branch.list()
→ { items: [ { name, state } ... ] }

branch.create({ name, from: StateRef })
→ { name, state }

branch.delete({ name })
→ { name, previousState }

tag.list()
→ { items: [ { name, state } ... ] }

tag.create({ name, target: StateRef })
→ { name, state }

tag.move({ name, target: StateRef })
→ { name, previousState, state }

tag.delete({ name })
→ { name, previousState }

merge.start({
  branch,
  source: StateRef
})
→ MergeSession

merge.list({ limit?, cursor? })
→ {
  items: MergeSessionSummary[],
  cursor?
}

merge.get({ session })
→ MergeSession

merge.conflicts({ session, limit?, cursor? })
→ {
  session,
  revision,
  items: MergeConflict[],
  cursor?
}

merge.resolve({
  session,
  expectedRevision: integer,
  resolutions: MergeResolution[]
})
→ MergeSession

merge.finalize({
  session,
  expectedRevision: integer,
  author?,
  message?
})
→ {
  status: up_to_date | fast_forward | merged,
  targetState: ResolvedState,
  sourceState: ResolvedState,
  state: ResolvedState
}

merge.abort({ session, expectedRevision: integer })
→ { session }
```

KG OS 没有 connection-local active Branch，因此 `branch.create.from` 必须显式提供，不继承 Lithograph connection checkout。`branch.list` / `tag.list` v1 沿用当前设计的完整有界 ref enumeration，并按 ref name UTF-8 bytes 升序；不为了尚未验证的大 ref 集合提前增加 cursor，如果实际规模或底层接口证明需要分页，再以兼容扩展增加。

D31 对 invalid State 的限制只阻止业务 Snapshot 继续演进或把新 ref 指向 invalid target：`state.create` 的 Branch head、`branch.create.from`、`tag.create/move.target` 必须解析到 KG OS-valid State；Merge 按上文先验证 resolved `targetState/sourceState`，再以 Lithograph `merge.start(..., expectedHead=targetState)` 原子建立只绑定这些已验证 State 的 Session。`state.setData/clearData` 只修改 Commit Data sidecar，因此允许作用于 invalid State，便于诊断注释；`branch.delete` / `tag.delete` 只移除 ref，也允许清理当前指向 invalid State 的引用。这些 sidecar/ref cleanup 不把 invalid Snapshot 重新解释为业务 State。

Merge 采用 **Merge Session**，因为冲突可能非常多，AI / 用户必须能够分页读取并跨多个调用逐步解决。KG OS 开始 merge 时先把 target Branch head 与 `source` 分别解析为 immutable `targetState/sourceState` 并完成 D31 consistency check；随后调用 Lithograph `merge.start(source=sourceState, expectedHead=targetState)`，target Branch 通过 query-level `branch` 指定。Lithograph 在 Session 持久化的同一 writer boundary 内做 expected-head CAS：Branch 中间发生变化就返回 `BRANCH_HEAD_MOVED` 且**不创建 Session**；成功 Session 必须返回相同的 `targetState/sourceState`。因此无效 State 不会先变成一个可见 workspace，也不存在“先检查 ref、再由底层重新解析另一个 State”的竞态。

`merge.start` 成功后，无论是否存在 conflict、甚至是否可以 fast-forward，都不创建 State、不移动 Branch。Session id 只是本次未完成 merge 的 operational token，不是 StateRef、ObjectRef 或新的持久业务资源 identity。

`merge.list` 用于恢复和清理未完成工作，避免调用方丢失 session token 后留下长期 GC root；它只返回轻量 `MergeSessionSummary`，不为列表中的每个 Session 展开 conflict/status。`merge.start/get/resolve` 返回的 `status` 固定为 `up_to_date | fast_forward | conflicted | ready`。`conflicted` 表示仍存在 unresolved conflict；`ready` 表示 diverged candidate 已经没有 unresolved conflict，可以进入 KG OS candidate validation。`merge.list` / `merge.conflicts` 的 `limit` 与 Object/Evolution 其它分页相同：默认 `100`，v1 接受 `1..1000`；conflict cursor 绑定 session + revision。一次 resolution 改变 Session 后，旧 conflict cursor 不得继续解释新 candidate。

KG OS 不能假设数据库里的所有 open Merge Session 都由 KG OS 创建，因为具有直接 Lithograph 权限的维护工具可以绕过上层建立 Session。为保持 D31 边界：`merge.list/get` 只作为 operational metadata/diagnostic read，可以显示这类 Session 的 `targetState/sourceState`；`merge.abort` 是 cleanup，因此即使 pinned State 当前 KGOS-invalid 也允许按 expectedRevision 删除 Session。`merge.conflicts/resolve/finalize` 在进入公开 conflict 解释或任何可能推进 merge 的路径前，都必须重新确认 Session pinned `targetState/sourceState` 为 KGOS-valid，否则返回 `CONSISTENCY_ERROR`。因此 direct-Lithograph Session 不能借 KG OS finalize 从 invalid State 继续演进；需要诊断 pinned State 时使用 Evolution `get`。

Conflict result 只暴露可映射到公共 Object / Graph 的 conflict；`path` 使用 public logical Object Value 的 RFC 6901 slot，`base/ours/theirs` 与对应 Ref 都是 public representation。`conflictId` **直接复用 Lithograph 当前 Merge Session 返回的 opaque conflictId**，KG OS 不再根据 public path 生成第二套 conflict identity；同一个 public `kind/path` 可以因为底层存在多个独立 logical slot 而出现多个 conflict，调用方始终以 `conflictId` 区分和提交 resolution。这个 token 只在对应 pinned merge inputs 的 Session workflow 中有效，不是持久业务资源 identity。

`merge.resolve` 一次只需要提交调用方当前已经决定的一批 resolution，不要求一次解决全部冲突。`expectedRevision` 必须等于 Session 当前 revision；Lithograph 负责原子 set/replace resolution 并递增 revision。调用方可以先解决 10 个，再解决 20 个，直到 `unresolved=0`；这些中间步骤全部只是 Merge Session state，不产生 KG OS State，也不移动 Branch。`resolutions.conflictId` 原样传回对应 Lithograph Session；unknown / duplicate conflictId 返回 `INVALID_ARGUMENT`。`choice=value` 的显式 value 先按该 public conflict row 的 logical slot/value contract 验证，再确定性映射到底层 conflict 所需 typed value；无法把某个底层 conflict 安全投影/反向映射为公共 target 时返回 `CONSISTENCY_ERROR`，不泄露 internal graph / schema identifiers，也不由 KG OS 猜 resolution。

当 `unresolved=0` 时，KG OS 再次确认 Session pinned `targetState/sourceState` 仍满足 D31，然后使用 Lithograph `options.mergeSession={id, revision}` 对**该精确 revision 的 candidate**做只读一致性校验。校验至少覆盖 Binding coverage、reserved internal graph / Schema isolation、Ontology aggregate 可解释性与共享声明一致性，以及本文其它 KG OS-valid State invariants；可以通过多条只读 Cypher / Schema introspection 完成，但不能修改 candidate。校验失败返回 `CONSISTENCY_ERROR`，Session 保留且不产生 State/ref move；调用方可以调整已有 conflict resolution 后重新校验，或者 `merge.abort` 放弃。如果当前没有可通过调整 resolution 修复的公共 conflict，调用方应 abort，先通过普通 Object/Graph mutation 修复 source/target State，再开始新的 merge；v1 不再发明一套“直接编辑 merge candidate”的第二 mutation surface。

校验通过后，KG OS 立刻以同一个 `expectedRevision` 调用 Lithograph `merge.finalize`。Lithograph 再检查 Session revision 未变化且 target Branch head 仍等于 pinned `targetState`；resolution 被并发修改时返回 `MERGE_SESSION_CHANGED`，target Branch 已前进时返回 `BRANCH_HEAD_MOVED`。因此 KG OS 校验过的 candidate 不会在校验与 finalize 之间被静默替换。成功 finalize 的 `up_to_date / fast_forward / merged` 都返回最终 `state`；只有 `merged` 创建新的 two-parent Commit，`fast_forward` 只移动 Branch，`up_to_date` 不移动 Branch。

`merge.finalize.author/message` 只有 `status=merged` 真正创建新 Merge Commit 时写入该 Commit；`up_to_date` 与 `fast_forward` 都不为了保存 metadata 创建额外 Commit。`merge.abort` 必须携带调用方最后观察到的 `expectedRevision`；stale abort 返回 `MERGE_SESSION_CHANGED`，不能误删其他调用方刚更新的 resolution。成功 abort 只放弃未完成 Session，不创建 State、不移动 Branch。`state.create` 总会创建新 Commit，因此它的 `author/message` 总能落到新 State；Graph `execute` 继续服从 Lithograph writable query 自身的 Commit/no-op metadata 语义。

`overview` 只返回适合导航的轻量摘要，例如 default Branch 及其 resolved head，并且不得扫描或展开完整 State DAG。Branch / Tag 的完整枚举分别通过 `branch.list` / `tag.list` 完成；当前没有真实需求要求为了假设中的超大 ref 集合提前冻结另一套分页机制，后续如底层能力和规模约束需要再加入。

`get` 读取一个 resolved State 的 immutable metadata 与当前 State Data。它不自动加载该 Snapshot 的全部 Ontology / Knowledge，也不默认反向枚举所有指向它的 Branch / Tag；真正的数据内容继续通过 Object / Graph 使用同一个 resolved State 读取。

`ancestry` 从调用方指定的 State / Branch / Tag root 开始读取该 root **可达的 State ancestry DAG**，每次只返回 bounded slice，并通过 opaque cursor 渐进遍历。它返回轻量 State topology / metadata，默认不展开 State Data，更不加载每个 State 的 Knowledge Snapshot。State 数量很大时不提供“一次返回整个 DAG”的合同；不同 Branch 的独立演进空间通过选择对应 root 分别导航，不为“全库一次聚合所有 roots”增加第二套历史索引。这里刻意不使用 `graph` 作为能力名，避免与顶层 Graph / Cypher 能力混淆。

`history` 返回统一 State DAG 上与调用方 scope / Object address 相关的业务变化序列；`diff` 比较两个 immutable State Snapshot。两者都把底层历史业务化为公开 Object / Knowledge graph 变化，并过滤 KG OS internal Binding Record、reserved Label / Relationship、Schema Locator 等实现细节；mutable State Data、Branch 与 Tag 不进入 Snapshot diff。

Object-specific History / Diff **不能只用裸 Object Ref 作为跨版本 continuity anchor**。任何基于名称 / locator 的 Ref 都可能在旧对象删除后被新的资源重新使用；因此对象级历史定位使用上述 `object.anchorState + object.ref`。KG OS 在 anchor State 内先解析该 Object，再只使用 owner 已有的稳定 continuity evidence 跟踪后续历史：Definition / Domain 使用 internal Binding / Domain identity，Knowledge 使用 Lithograph element identity；Property 使用内部 Binding 在 Definition 内跟踪。Constraint / Index 的变更归入 Definition，资源连续性只使用 Lithograph 公开 history / identity 的实际证据。若底层对某类 Schema resource 只有名称而没有可证明的跨 drop+create identity，KG OS 不把同名新资源猜成旧对象的延续。

Ontology / Knowledge / 单 Object 历史都只是同一 `history` / `diff` 的 scope filter，不建立平行 History API。History / Diff 结果可能因为批量 migration 很大，因此公共 wire 必须支持 bounded result / cursor，而不是承诺一次返回全部变化。Raw Lithograph Patch 不作为 KG OS 当前 Evolution 公共能力。

`state.create` 在调用方明确指定的 Branch 上建立一个新的业务 State，即使当前 Ontology / Knowledge Snapshot 与 parent 相同；底层映射到 Lithograph explicit empty-delta Commit，可同时设置初始 State Data。它不引入 Git working tree / staging，也不改变普通 Object Patch / Graph Execute 自动产生 State 的规则。因为 Snapshot 可以与 parent 完全相同，`diff(parent, state)` 合法为空，即使新 State 拥有不同的 State Data。

`set data` / `clear data` 只修改 State Data sidecar，不创建新 State。`branch.create/delete` 与 `tag.create/move/delete` 只操作对应 Lithograph ref；Tag 不因 Branch write、merge 或其它普通状态演进自动移动。

Merge 操作整个 Knowledge Base State，包括调用方 Ontology Structure、Ontology Semantics 与 Knowledge Data。底层使用 Lithograph Merge Session，但 KG OS 必须把 conflict 与结果转换为公开 Object / Graph 语义，不向调用方泄露 internal semantic graph representation。参与 merge 的 KG OS State 必须满足 Binding coverage、reserved internal graph / Schema 等当前 KG OS consistency invariants；candidate 在 finalize 前通过 pinned session revision 被同一套 consistency validation 检查。包括 fast-forward 在内，只要 source / candidate 无法作为 KG OS-valid Snapshot 解释，finalize 就不能移动目标 Branch。如果某个底层冲突或 consistency failure 无法安全映射为公共对象，KG OS 返回不暴露内部标识的 consistency/conflict error，而不是透传 raw slot。Merge 成功后返回最终 State identity；State Data 与 Tag 的继承 / 移动继续服从 Lithograph sidecar/ref 规则，不由 KG OS 隐式猜测业务意图。

Lithograph 仍然提供 Patch、Rebase、Squash、Reset、Revert、GC、checkout 等通用数据库能力，但 KG OS 当前没有已确认需求要求把它们全部提升为公共产品能力。未来只有出现明确 KG OS 使用场景时才增加，不因底层存在就复制一套接口。

### History 与历史读取

历史 Definition 必须从目标 State Snapshot 的 Schema 与同一 Snapshot 的 semantic metadata 动态组合，不能使用当前 metadata 去解释旧 Schema，也不能使用当前 Schema 去解释历史 metadata。

历史 Domain 与 Ontology organization 同样从目标 State Snapshot 的 semantic graph 读取。任何 Ontology read view 都必须在同一个 State 上组合 Schema、Definition semantics、Domain organization 与相关结构投影，不能跨 State 拼接。

KG OS 不再为 Ontology / Knowledge 各自建立 `history` / `diff` API。Evolution `history` / `diff` 接受 scope 与 **anchor State + Object Ref** 过滤，同一能力既能解释整个 Knowledge Base，也能聚焦 Ontology、Knowledge 或某个明确 Object。Binding Record / Domain Node 的稳定 internal graph identity 可以作为 Definition / Property / Domain rename 的内部 continuity anchor。普通 Knowledge Node / Relationship 则只按 Lithograph element identity 跟踪：如果直接 Relationship Patch 因 type / endpoint 变化产生 replacement，新 Ref 的对象级 history 从新 Relationship 创建开始，不跨 Ref transition 冒充同一个持久对象；当次 mutation result 与 State diff 可以同时显示旧 Relationship 删除和新 Relationship 创建。Definition-level 批量 Relationship replacement 同样只保证新旧集合变化可审计，不虚构一对一 mapping。
