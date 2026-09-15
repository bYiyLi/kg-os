# 共享公共合同

本文件只拥有 **跨 Ontology read / Object / Graph / Evolution 的共享公共错误合同**。各能力自己的 request / result / identity 语义仍由对应职责文件拥有。

## 公共错误合同

KG OS adapter 的稳定 error envelope：

```json
{
  "code": "OBJECT_NOT_FOUND",
  "message": "...",
  "details": {}
}
```

`details` 只放公开可定位信息并可省略；不能包含 `_lithograph_*`、Binding Record identity、reserved internal Schema locator 或其它实现细节。Graph / Schema / value 错误在不泄露内部实现时尽量保留 Lithograph 已公开且对调用方有意义的稳定 category，例如 `PARSE_ERROR`、`SEMANTIC_ERROR`、`TYPE_ERROR`、`SCHEMA_ERROR`、`CONSTRAINT_ERROR`、`INVALID_ARGUMENT`、`BRANCH_NOT_FOUND`、`TAG_NOT_FOUND`、`BRANCH_HEAD_MOVED`、`MERGE_CONFLICT`、`MERGE_SESSION_NOT_FOUND`、`MERGE_SESSION_CHANGED`、`RESOURCE_ERROR`、`IO_ERROR`、`INTERNAL_ERROR`。Evolution Merge 的可解决业务冲突通过 `merge.conflicts` 返回结构化 items，不把正常 conflict discovery 强制变成 error response；`MERGE_CONFLICT` 只用于 unresolved conflict 阻止 candidate inspection/finalize 等“当前还没准备好”的调用。

KG OS 自有稳定 code 至少包括：

```text
OBJECT_NOT_FOUND
OBJECT_CONFLICT
PATCH_BASE_MISMATCH
STALE_BASE_STATE
CONSISTENCY_ERROR
UNSUPPORTED_OPERATION
STATE_NOT_FOUND
RESERVED_IDENTIFIER
```

Lithograph `VERSION_NOT_FOUND` 在 KG OS 公共语义中映射为 `STATE_NOT_FOUND`；Object Patch 的 `tx_begin(expectedHead=baseState)` mismatch 或 no-op strict-head check mismatch 映射为 `STALE_BASE_STATE`；Git hunk 无法精确应用到 `baseState` 重新生成的 canonical YAML 时返回 `PATCH_BASE_MISMATCH`，不能 fuzzy/offset apply，也不能误报为 Branch stale；Binding coverage、reserved internal graph/schema 等 KG OS invariants 失败映射为 `CONSISTENCY_ERROR`。HTTP status 与 SDK exception class 仍属于各 adapter mapping；CLI 的 stdout/stderr 与 coarse exit-code mapping 由 [CLI](cli.md#error-与-exit-code) 冻结，但都不能改变上述稳定 error `code`。

Object Patch 的错误归类固定为：

- Git Extended Diff / YAML **语法无法解析** → `PARSE_ERROR`；
- Git form 语法合法但不在 KG OS v1 profile（combined diff、binary、copy、mode-only 等）→ `UNSUPPORTED_OPERATION`；
- malformed / non-canonical Object Ref、StateRef、cursor、alias，unknown alias，duplicate `(kind, alias)`，或 request field 组合非法 → `INVALID_ARGUMENT`；
- YAML 可解析但未知字段、字段类型、Lithograph tagged value 或 Object Value shape 不合法 → `TYPE_ERROR`；
- exact hunk 与 regenerated base canonical YAML 不匹配 → `PATCH_BASE_MISMATCH`；
- existing target 不存在 → `OBJECT_NOT_FOUND`；
- duplicate Add target/name、共享资源显式 slot 冲突、explicit-vs-derived slot 冲突、rename target 与显式 `name` 不一致 → `OBJECT_CONFLICT`；
- 触碰 `__kgos_` reserved namespace → `RESERVED_IDENTIFIER`；
- KG OS 公共模型本身不允许请求的变化（不等同于底层没有原地 ALTER） → `UNSUPPORTED_OPERATION`；
- target Snapshot 违反 Lithograph Schema / Constraint → 保留 `SCHEMA_ERROR` / `CONSTRAINT_ERROR`；
- target Snapshot 违反 KG OS Binding / internal isolation consistency → `CONSISTENCY_ERROR`。

这些 code 表示稳定的调用方可观察类别；`message/details` 可以增加诊断信息，但不能通过文案改变 code 语义。

Ontology read / batch edit 与 aggregate Patch 使用相同错误 envelope。Ontology batch 的重复 Ref、超过 100 个 Ref、batch `--edit` 携带 pagination 参数，以及 `ontology patch` 出现 Knowledge target / alias kind，都返回 `INVALID_ARGUMENT`；任一 Ref 不存在返回 `OBJECT_NOT_FOUND`；完整 batch 输出超过资源限制返回 `RESOURCE_ERROR`。这些错误都发生在 stdout 产生之前，不能返回 partial Markdown / YAML stream。对 Property/Constraint/Index 的错误，details 使用公开的 `ref`（Domain/Definition）与 `path`（RFC 6901，必要时指向整个相关 collection），可附真实 name 与受影响 Definition refs。不能要求调用方改用独立 index/constraint API，也不能泄露内部 Binding identity。

不支持的旧 Object kind/Ref、Ontology search 参数和无目标 Overview --edit 返回 `INVALID_ARGUMENT`。共享索引的相同显式目标合并不算冲突；不同目标、delete/update 竞争或依赖未解决返回 `OBJECT_CONFLICT`。底层 immediate constraint failure 仍返回对应数据库公开分类，整个 Patch rollback。
