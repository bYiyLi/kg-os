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

Lithograph explicit-transaction begin options 中 `expectedHead=baseState` 的 mismatch，或 no-op strict-head check mismatch，在 KG OS 公共语义中映射为 `STALE_BASE_STATE`；Lithograph `VERSION_NOT_FOUND` 映射为 `STATE_NOT_FOUND`。Git hunk 无法精确应用到 `baseState` 重新生成的 canonical YAML 时返回 `PATCH_BASE_MISMATCH`，不能 fuzzy/offset apply，也不能误报为 Branch stale；高层 Ontology / Object / Evolution 的 Binding coverage、reserved internal graph/schema 等 KG OS invariants 失败映射为 `CONSISTENCY_ERROR`；Graph 不以这项检查拦截底层执行。HTTP status 与 SDK exception class 仍属于各 adapter mapping；CLI 的 stdout/stderr 与 coarse exit-code mapping 由 [CLI](cli.md#error-与-exit-code) 冻结，但都不能改变上述稳定 error `code`。

`AUTHENTICATION_FAILED` 是 `kgosd` single-token authentication 的唯一失败类别：HTTP API request 缺少 Bearer credential、header malformed、token 为空或 token 与当前 Instance Root 的 `auth.json` 不匹配都返回同一 code；HTTP adapter 使用 `401 Unauthorized`，`message/details` 不区分“missing”与“wrong”也不回显任何 secret。本机 `@kgos/cli` 只从显式 `--root` 对应的 `auth.json` 取得 credential；该文件缺失、非法或 token 为空时使用同一稳定 code 作为本地 pre-dispatch error并返回 exit `2`，请求已发送而被 daemon 拒绝时返回 exit `1`。CLI 不读取 `KG_TOKEN`，也不跨 root fallback。认证只判断是否持有实例 token，不建立 user/role/scope authorization。

SQLite Extension / Full-text 运行时错误固定区分：

- `SQLITE_EXTENSION_ERROR`：`[[sqlite.extensions]]` 配置形状非法（包括 required `source/entrypoint` 缺失、空值或 NUL），remote source 缺/错 `sha256`，source 不存在/下载失败，hash mismatch，archive 不安全或无法解包，配置的 `library` 不存在，SQLite load/entrypoint 初始化失败，或目标 connection 缺失/不兼容 KG OS 所需的 Lithograph v0.3.0 public SQL / Provider registration capability。`details` 可以包含公开的 extension ordinal、source kind（local/https）、phase（resolve/hash/extract/load/capability）与安全可显示的路径/URL，但不能回显下载 credential（v1 不支持）或 native library 私有诊断中的敏感文本。KG OS 不探测 application-facing Native query symbols。
- `FULLTEXT_CONFIG_ERROR`：`[fulltext]` 或 required `analyzer` 缺失、字段未知、`analyzer` 类型错误、空/只含无效分隔内容或含 NUL。
- `FULLTEXT_ANALYZER_UNAVAILABLE`：KG OS 在 extension 加载后、把 connection 放入可用池前，对**当前 `[fulltext].analyzer`**执行 capability probe 时无法构造该 analyzer。这个 code 只用于 KG OS 自己明确知道正在验证哪一个 runtime analyzer 的边界。公共 Graph 原样执行 Lithograph Full-text Cypher 时不解析语句或错误文案来猜 analyzer；历史 IndexDefinition 或显式 query-time analyzer 不可用时，保留 Lithograph v0.3.0 的实际公开数据库 category（当前 query 路径为 `SEMANTIC_ERROR`，DDL 构造失败为 `SCHEMA_ERROR`），并且绝不能伪装成零结果。

这些 runtime code 不改变 Lithograph 自己的 `SCHEMA_ERROR` / `SEMANTIC_ERROR` 等数据库分类。KG OS 只有在错误来自自己的 extension resolver、global Full-text config 或 KG OS 自己执行的当前 analyzer capability probe 时使用上述稳定 code；Graph passthrough 中的 Full-text Index/query analyzer failure 与普通 Full-text query expression error 都保留 Lithograph 的公开数据库 category，不能按 message substring 二次分类。

Embedding 配置错误由 `EMBEDDING_CONFIG_ERROR` 表示：`[embedding]` 或 required `base_url/model/dimensions/similarity/api_key_env` 字段缺失，字段值非法，出现不支持的 `api_key/provider` 或其它未知字段；非空 `api_key_env` 指向不存在/空的环境变量同样失败。空字符串是显式 no-auth endpoint 配置。该 code 也覆盖 KG OS required `[cache].path/max_size_mb` 缺失、类型/范围或 path 解析非法，以及已移除的 `cache.enabled` 字段。KG OS 不再直接发起 Embeddings HTTP 请求；实际 Semantic procedure 的远端失败保留 Lithograph `IO_ERROR`，资源不足保留 `RESOURCE_ERROR`，非法 query 参数保留 `INVALID_ARGUMENT` / `TYPE_ERROR`，Provider registration/Schema validation 失败保留底层公开 category。不要按错误文本猜分类，也不要把普通 cache/database I/O 一律伪装成“模型服务失败”。扩展 resolve/load 失败仍使用 `SQLITE_EXTENSION_ERROR`，取消保留既有 interrupt/cancellation 映射。任何诊断都不得回显 resolved credential。

OpenAI-compatible Provider 的远端 HTTP failure虽然继续使用 Lithograph公开 category，但公开诊断必须与真实失败原因一致：至少保留 HTTP status code；如果响应提供可安全显示的错误 message，可以有界保留该信息；不能把与本次 HTTP response 无关的 socket/OS errno文本拼接成看似 provider 返回的原因。401 / 403 等认证失败不得回显 API key、Authorization header或其它 resolved credential，429 / 5xx / timeout同样不能泄露请求敏感字段。KG OS adapter不根据任意 message substring重分类或在上层 hardcode某个 status 的文案；如果KG OS使用的SQLite driver根据结构化 `SystemErrno`向原始诊断追加无关尾部，adapter仅依据该字段的确定格式移除尾部，并保留原始错误cause与SQLite code。若当前 pinned Lithograph / Provider artifact本身不能满足该诊断合同，应在其 owner实现中修复并由KG OS更新到通过验收的 artifact。

Graph params 不再识别 `SemanticText` / `$semantic` marker；语义检索直接接受 String。普通 Map 中的 `$semantic` key 没有特殊意义；把 Map 传给要求 String 的 Semantic procedure，按底层参数类型规则失败。Semantic query 的 external I/O 本身不构成 KG OS 或 `lithograph_rows()` 的拒绝理由；它与 mutation / explicit transaction / transaction subquery 的组合完全遵守当前 Lithograph v0.3.0 execution contract，KG OS 不追加规则。Provider-owned cache 的配置冲突映射为底层 `INVALID_ARGUMENT`，cache file I/O / resource failure保留 `IO_ERROR` / `RESOURCE_ERROR`，取消保留既有 interrupt/cancellation 映射。HTTP request / daemon shutdown cancellation 继续通过 host driver 触发 SQLite interrupt；OpenAI-compatible Provider 在调用前后、retry/backoff 与 batch boundary观察该取消状态，但正在阻塞的单次第三方 HTTP system call 只受 IndexDefinition 中 versioned `providerConfig.timeout_ms` 上界约束，KG OS 不覆盖 timeout、不开第二条 HTTP client，也不承诺异步抢占该 system call。调用返回到 Provider/Lithograph cancellation checkpoint 后必须终止为错误，不能返回缺候选的 partial success。普通 source 写入、普通非 Semantic read 与未改变 Semantic definition 的 merge 不因 KG OS cache policy主动发 embedding 请求。

Ontology / Object v1 public profile 仍不接受 caller-owned Vector：Property `type` 为 `VECTOR<...>`、Object Value 含 Vector，或底层 Schema 出现当前 Ontology 无法表达的 raw Vector Property / type Constraint / Vector Index 时，按对应高层边界返回 `UNSUPPORTED_OPERATION` 或 `CONSISTENCY_ERROR`；公共 standalone `type` Constraint 本身已不属于 v1 Ontology profile。Graph parameters、results 与 Cypher 写入则直接复用 Lithograph 的 Vector 能力，不因 Vector、`__kgos_` identifier 或高层 Binding 状态而额外拒绝；不再为这些内容附加 Graph commit 前校验。Managed Semantic 内部 embedding 仍不是图 Property，不会因普通 `RETURN n` 自动成为返回字段。写语句进入 Graph `query` 时，保留底层只读连接 / 执行错误，不将其解释成 KG OS 语句黑名单。

Object Patch 的错误归类固定为：

- Git Extended Diff / YAML **语法无法解析** → `PARSE_ERROR`；
- Git form 语法合法但不在 KG OS v1 profile（combined diff、binary、copy、mode-only 等）→ `UNSUPPORTED_OPERATION`；
- malformed / non-canonical Object Ref、StateRef、cursor、alias，unknown alias，duplicate `(kind, alias)`，或 request field 组合非法 → `INVALID_ARGUMENT`；
- YAML 可解析但未知字段、字段类型、Lithograph tagged value、重复 set-like member（如 `labels/includes/targets`）或 Object Value shape 不合法 → `TYPE_ERROR`；
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
