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

`details` 可以省略。Ontology / Object / Evolution 的高层错误使用公共 Ref / path 定位，不泄露内部 Binding 或 Schema Locator。Graph 原样执行 Cypher 时保留 Lithograph 对该语句公开的错误位置、identifier 和 category，不因为名称带 `__kgos_` 就改写成 KG OS 禁止错误；认证 secret、运行时解析的 credential 和私有宿主诊断仍不能回显。公开数据库 category 包括 `PARSE_ERROR`、`SEMANTIC_ERROR`、`TYPE_ERROR`、`SCHEMA_ERROR`、`CONSTRAINT_ERROR`、`INVALID_ARGUMENT`、`READ_ONLY_SNAPSHOT`、`BRANCH_NOT_FOUND`、`TAG_NOT_FOUND`、`BRANCH_HEAD_MOVED`、`MERGE_CONFLICT`、`MERGE_SESSION_NOT_FOUND`、`MERGE_SESSION_CHANGED`、`RESOURCE_ERROR`、`IO_ERROR`、`INTERNAL_ERROR`，按实际底层结果映射，不按错误文案猜测。Evolution Merge 的可解决业务冲突仍通过 `merge.conflicts` 返回结构化 items；其 `MERGE_CONFLICT` 表示当前冲突阻止相应操作。

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
AUTHENTICATION_FAILED
SQLITE_EXTENSION_ERROR
FULLTEXT_CONFIG_ERROR
FULLTEXT_ANALYZER_UNAVAILABLE
EMBEDDING_CONFIG_ERROR
```

Lithograph `VERSION_NOT_FOUND` 在 KG OS 公共语义中映射为 `STATE_NOT_FOUND`；Object Patch 的 `tx_begin(expectedHead=baseState)` mismatch 或 no-op strict-head check mismatch 映射为 `STALE_BASE_STATE`；Git hunk 无法精确应用到 `baseState` 重新生成的 canonical YAML 时返回 `PATCH_BASE_MISMATCH`，不能 fuzzy/offset apply，也不能误报为 Branch stale；高层 Ontology / Object / Evolution 的 Binding coverage、reserved internal graph/schema 等 KG OS invariants 失败映射为 `CONSISTENCY_ERROR`；Graph 不以这项检查拦截底层执行。HTTP status 与 SDK exception class 仍属于各 adapter mapping；CLI 的 stdout/stderr 与 coarse exit-code mapping 由 [CLI](cli.md#error-与-exit-code) 冻结，但都不能改变上述稳定 error `code`。

`AUTHENTICATION_FAILED` 是 `kgosd` single-token authentication 的唯一失败类别：HTTP API/control request 缺少 Bearer credential、header malformed、token 为空或 token 与 `$KG_HOME/auth.json` 不匹配都返回同一 code；HTTP adapter 使用 `401 Unauthorized`，`message/details` 不区分“missing”与“wrong”也不回显任何 secret。CLI 在需要 active daemon 的命令 dispatch 前发现 `KG_TOKEN` 缺失/空时，同样使用该稳定 code 作为本地 pre-dispatch error，但按 CLI 合同返回 exit `2`；请求已发送而被 daemon 拒绝时返回 exit `1`。认证只判断是否持有实例 token，不建立 user/role/scope authorization。

SQLite Extension / Full-text 运行时错误固定区分：

- `SQLITE_EXTENSION_ERROR`：`[[sqlite.extensions]]` 配置形状非法，remote source 缺/错 `sha256`，source 不存在/下载失败，hash mismatch，archive 不安全或无法解包，配置的 `library` 不存在，SQLite load/entrypoint 初始化失败，所需 Lithograph SQL capability 缺失/不兼容，或所需 Native adapter 在 resolved libraries 中无法发现**恰好一个满足其全部调用需求的 Lithograph ABI provider**（零个/多个/缺失所需 symbol）。`details` 可以包含公开的 extension ordinal、source kind（local/https）、phase（resolve/hash/extract/load/capability）与安全可显示的路径/URL，但不能回显下载 credential（v1 不支持）或 native library 私有诊断中的敏感文本。
- `FULLTEXT_CONFIG_ERROR`：`[fulltext]` 字段未知、`analyzer` 类型错误、空/只含无效分隔内容或含 NUL。省略 `[fulltext]` 不报错，等价 `unicode61`。
- `FULLTEXT_ANALYZER_UNAVAILABLE`：当前 runtime 在 extension 加载后无法构造 `[fulltext].analyzer`，或实际执行某个历史/当前 Full-text Index query 时，该 IndexDefinition 保存的 analyzer / 显式 query override 当前未注册或不可构造。它不能伪装成零结果；历史索引需要旧 tokenizer 但当前 runtime 没有加载时，只失败该次 Full-text 操作，不把整个 Knowledge Base 判定为损坏。

这些 runtime code 不改变 Lithograph 自己的 `SCHEMA_ERROR` / `SEMANTIC_ERROR` 等数据库分类。KG OS 只有在错误来自自己的 extension resolver、global Full-text config 或已知 tokenizer runtime capability boundary 时使用上述稳定 code；普通 Lithograph Full-text query expression 语法错误仍保留其公开数据库 category。

Embedding 配置错误由 `EMBEDDING_CONFIG_ERROR` 表示：`[embedding]` 缺失、`base_url/model/dimensions/similarity` 非法、出现不支持的 `api_key/provider` 或其它未知字段、`api_key_env` 字段非法或指向不存在/空的环境变量。KG OS 不再直接发起 Embeddings HTTP 请求；实际 Semantic procedure 的远端失败保留 Lithograph `IO_ERROR`，资源不足保留 `RESOURCE_ERROR`，非法 query 参数保留 `INVALID_ARGUMENT` / `TYPE_ERROR`，Provider registration/Schema validation 失败保留底层公开 category。不要按错误文本猜分类，也不要把普通 cache/database I/O 一律伪装成“模型服务失败”。扩展 resolve/load 失败仍使用 `SQLITE_EXTENSION_ERROR`，取消保留既有 interrupt/cancellation 映射。任何诊断都不得回显 resolved credential。

Graph params 不再识别 `SemanticText` / `$semantic` marker；语义检索直接接受 String。普通 Map 中的 `$semantic` key 没有特殊意义；把 Map 传给要求 String 的 Semantic procedure，按底层参数类型规则失败。Semantic query 与 mutation / explicit transaction 混用时，在 Provider I/O 前返回 Lithograph `TRANSACTION_BOUNDARY_REQUIRED`。该类别不表示普通 source 写入需要模型服务；source 写入、普通 read 与未改变 Semantic definition 的 merge 不发 embedding 请求。

Ontology / Object v1 public profile 仍不接受 caller-owned Vector：Property `type` / type-constraint `valueType` 为 `VECTOR`，或 Object Value 含 Vector，按相应高层合同返回 `UNSUPPORTED_OPERATION`。Graph parameters、results 与 Cypher 写入则直接复用 Lithograph 的 Vector 能力，不因 Vector、`__kgos_` identifier 或高层 Binding 状态而额外拒绝；不再为这些内容附加 Graph commit 前校验。Managed Semantic 内部 embedding 仍不是图 Property，不会因普通 `RETURN n` 自动成为返回字段。写语句进入 Graph `query` 时，保留底层只读连接 / 执行错误，不将其解释成 KG OS 语句黑名单。

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
