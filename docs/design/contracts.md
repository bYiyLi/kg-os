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
SQLITE_EXTENSION_ERROR
FULLTEXT_CONFIG_ERROR
FULLTEXT_ANALYZER_UNAVAILABLE
EMBEDDING_CONFIG_ERROR
EMBEDDING_PROVIDER_ERROR
```

Lithograph `VERSION_NOT_FOUND` 在 KG OS 公共语义中映射为 `STATE_NOT_FOUND`；Object Patch 的 `tx_begin(expectedHead=baseState)` mismatch 或 no-op strict-head check mismatch 映射为 `STALE_BASE_STATE`；Git hunk 无法精确应用到 `baseState` 重新生成的 canonical YAML 时返回 `PATCH_BASE_MISMATCH`，不能 fuzzy/offset apply，也不能误报为 Branch stale；Binding coverage、reserved internal graph/schema 等 KG OS invariants 失败映射为 `CONSISTENCY_ERROR`。HTTP status 与 SDK exception class 仍属于各 adapter mapping；CLI 的 stdout/stderr 与 coarse exit-code mapping 由 [CLI](cli.md#error-与-exit-code) 冻结，但都不能改变上述稳定 error `code`。

SQLite Extension / Full-text 运行时错误固定区分：

- `SQLITE_EXTENSION_ERROR`：`[[sqlite.extensions]]` 配置形状非法，remote source 缺/错 `sha256`，source 不存在/下载失败，hash mismatch，archive 不安全或无法解包，配置的 `library` 不存在，SQLite load/entrypoint 初始化失败，或 resolved libraries 中无法发现**恰好一个完整 Lithograph ABI provider**（零个/多个/partial export family）。`details` 可以包含公开的 extension ordinal、source kind（local/https）、phase（resolve/hash/extract/load/capability）与安全可显示的路径/URL，但不能回显下载 credential（v1 不支持）或 native library 私有诊断中的敏感文本。
- `FULLTEXT_CONFIG_ERROR`：`[fulltext]` 字段未知、`analyzer` 类型错误、空/只含无效分隔内容或含 NUL。省略 `[fulltext]` 不报错，等价 `unicode61`。
- `FULLTEXT_ANALYZER_UNAVAILABLE`：当前 runtime 在 extension 加载后无法构造 `[fulltext].analyzer`，或实际执行某个历史/当前 Full-text Index query 时，该 IndexDefinition 保存的 analyzer / 显式 query override 当前未注册或不可构造。它不能伪装成零结果；历史索引需要旧 tokenizer 但当前 runtime 没有加载时，只失败该次 Full-text 操作，不把整个 Knowledge Base 判定为损坏。

这些 runtime code 不改变 Lithograph 自己的 `SCHEMA_ERROR` / `SEMANTIC_ERROR` 等数据库分类。KG OS 只有在错误来自自己的 extension resolver、global Full-text config 或已知 tokenizer runtime capability boundary 时使用上述稳定 code；普通 Lithograph Full-text query expression 语法错误仍保留其公开数据库 category。

Embedding 错误固定区分：`EMBEDDING_CONFIG_ERROR` 表示 `[embedding]` 缺失、`base_url/model/dimensions/similarity` 非法、出现已经移除的 `provider`/其它未知字段、`api_key` 与 `api_key_env` 同时配置、inline/env credential 为空，或 `api_key_env` 指向不存在/空环境变量；`EMBEDDING_PROVIDER_ERROR` 表示配置合法但实际 `POST {base_url}/embeddings` timeout、网络失败、非成功 HTTP status、响应 JSON/`data/index/embedding` shape 非法、embedding 非 finite number 或返回维度不等于配置。KG OS v1 不定义 embedding-space mismatch 错误，也不比较当前 runtime config 与历史 managed vectors 的生成配置；任何依赖 embedding 的 mutation/provider 调用失败仍必须保持原 Branch/State 不变。任何 error/debug surface 都不得回显 `api_key` 或 resolved env credential。

Graph params 的 `SemanticText` marker **只在 Graph `params` 的直接 value 位置识别**，并只接受 exact `{"$semantic":"<non-empty-string>"}`。在这个识别位置，`$semantic` 与其它 key 并存、value 非 String/空 String 返回 `INVALID_ARGUMENT`；调用方确实要传同形状普通 Cypher Map 时使用 Lithograph `$type:"Map"` wrapper。Graph params 的嵌套 Map、Object/State Data 或其它 surface 中的 `$semantic` key 没有特殊含义，按各自普通 Map/data contract 处理。SemanticText 在 Lithograph parameter decode 前由 KG OS 消费，因此不会作为 Cypher Map 或持久值进入 Lithograph。

KG OS v1 public profile 不接受 caller-owned Vector。Ontology Property `type` / type-constraint `valueType` 包含 `VECTOR`、Object/Knowledge Property value 含 Vector、Graph caller parameter 的任意 public value tree 中出现 Lithograph `$type:"Vector"`、Graph result 的任意 public value tree 中出现 Vector，或 Graph mutation candidate 的 caller-owned Property 写入 Vector，统一属于**底层支持但 KG OS v1 未公开的能力**，返回 `UNSUPPORTED_OPERATION`；mutation 必须在 commit 前 abort。reserved `__kgos_` managed vector 与 SemanticText 解析后生成的内部 query Vector 不适用此错误，它们永不作为公共 Object/Graph value 返回。KG OS 不解析 Cypher 去禁止只存在于表达式内部且未跨越上述边界的 Vector 计算；这类行为属于 Lithograph execution semantics，不建立 KG OS public Vector contract。

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
