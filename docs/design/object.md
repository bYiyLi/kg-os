# Object 设计

本文件拥有 KG OS **共享 Object Ref、序列化、read 与统一 Patch mutation 合同**。Ontology 聚合的逻辑字段、渐进式读取和结构语义由 [Ontology](ontology.md) 拥有；Knowledge 数据由 [Graph](graph.md) 拥有；State / History / Merge 由 [Evolution](evolution.md) 拥有。

## Object Ref 与公共身份

Object 定位的是 KG OS 公共业务对象，不是一比一暴露底层数据库资源。公共 Object kinds 固定为：

| Object | Canonical Ref | 定位依据 |
| --- | --- | --- |
| Knowledge Node | `n:<decimal-id>` | Lithograph elementId |
| Knowledge Relationship | `r:<decimal-id>` | Lithograph elementId |
| Node Definition | `node:<name>` | 当前 Definition name |
| Relationship Definition | `relationship:<name>` | 当前 Definition name |
| Domain | `domain:<name>` | 当前 Domain name |

名称 decode 后非空；Definition/Property 名按对应 Lithograph identifier 合同校验，Domain 名的长度限制见 Ontology。`n:`/`r:` id 必须是原生有效范围内的 canonical 十进制，无前导零或符号；不再重新分配或转换 element identity。

`<name>` 先 UTF-8 编码，再用 RFC 3986 单 component percent-encoding；unreserved bytes 保持，其余为 uppercase `%HH`。不做 Unicode normalization 或 case folding。输入必须是 canonical spelling：decode 后必须为合法 UTF-8，unreserved byte 不能额外 percent-encode，percent escape 必须为 uppercase。非法或非 canonical Ref 返回 `INVALID_ARGUMENT`，合法但不存在返回 `OBJECT_NOT_FOUND`。

`property:`、`constraint:`、`index:`、`graph-type:` 不再是 v1 的公共 read / patch / history Object kinds。Property 和具名 Constraint / Index 在 Definition aggregate 内定位；错误与 Diff 使用 Definition Ref + 字段位置。真实 Index name 仍可用于 Cypher，但它不要求成为独立 KG OS CRUD resource。旧设计尚未实现，本次直接替换合同，不添加兼容层。

`n:<id>` / `r:<id>` 原样用于 Cypher `elementId()`；Definition / Domain Ref 不是 Knowledge elementId。State / Branch / Tag 仍是独立 Evolution reference；历史定位为 **State reference + Object Ref**，不拼新 ID，不新增公共 UUID。

Definition / Domain Ref 随显式 rename 变化，内部 Binding / Domain Node identity 保持连续。Property 的连续性在 Definition 内由 Property Binding 保持。这个内部身份不冒充数据库 Schema 永久 identity，也不进入公共 body。关系 replacement 的旧新 `r:` 不建立持久 alias。

## Object

Object 提供明确对象的稳定读取和统一局部修改，不强迫 AI 逐个理解底层资源。Ontology 使用 Domain / Definition aggregate；Knowledge 保留 Node / Relationship。Object Value 只在读取和编译时组合，不持久化第二份 YAML / JSON 真源。

### Object 能力面

```text
list    → 枚举公共 aggregate / Knowledge 对象的摘要
search  → 仅保留 Knowledge 范围的既有定位能力
read    → 同一对象的 canonical YAML / equivalent JSON
patch   → 统一 Add / Update / Delete / Rename / Restructure
```

Ontology 首次发现与渐进理解使用 [Ontology read](ontology.md#ontology-read-合同)，不是 Object search。Ontology 不支持关键字搜索，也不能通过 `scope=all` 或省略 scope 间接搜索 Ontology。普通 Knowledge 的属性全文、托管语义检索、条件与遍历仍用 Graph Cypher；Vector 本身不是 KG OS v1 caller-owned Object 能力。

写入始终只有一套 **canonical YAML + Git Extended Diff textual Patch**。不为 Domain、Node Definition、Relationship Definition、Property、Constraint、Index 分别建立 create/update/save API，也不新增 full-object PUT / upsert。聚合 Patch 可以编排多个底层资源，底层 ownership 不决定公共 API 的粒度。

### Object Value 与 representation

`read` 接受 State reference + Object Ref，在该 State 中解析一个公共逻辑值，再序列化。Ontology 的三种 aggregate 使用 [公共可编辑格式](ontology.md#公共可编辑格式)，不使用 raw `structure` 容器。Knowledge 的字段保持不变：

```text
Knowledge Node
  labels[]
  properties{}

Knowledge Relationship
  type
  start       # n:<id>
  end         # n:<id>
  properties{}
```

`state/ref/kind` 是 metadata，不是可编辑 body。Domain 不复制成员内容；Knowledge Relationship 不复制 endpoint Node；**Definition 可以直接编辑它聚合的 Property / Constraint / Index**，即使这些内容映射到多个独立底层资源。共享索引的重叠展示不增加持久 owner，遵守 Ontology 的显式 delta 归一化规则。

KG OS 托管 semantic vector 使用的 reserved `__kgos_` Property / metadata 不属于 Knowledge Object Value：即使物理上与业务 element 共存，也不能出现在 `properties{}`、canonical YAML / JSON、Object diff/history 或调用方可写 slot 中。调用方只看到产生它的 public source Property 与 public semantic Index 定义。KG OS v1 同时不接受 caller-owned Vector Property/value，因此公共 Object Value 中不存在 Vector typed Property。

Request-local `new:<kind>:<alias>` 只在 Patch 的 Ref-typed slot 中引用本请求新建 Object，例如 Domain includes、Relationship Definition from/to、Index targets、Knowledge Relationship start/end。普通字符串恰好以 `new:` 开头不当作引用。成功后全部 Ref 解析为正式 Ref；内嵌 Property 不需要单独的 Object alias 或 Patch entry。

v1 确认两种公开 serialization：

```text
Object Value
├── application/yaml  → canonical editable representation
└── application/json  → equivalent structured representation
```

- **YAML 是唯一 canonical editable representation。** 同一个 immutable State + 同一个 Object Ref 必须由 KG OS renderer 产生确定、可重放的 canonical YAML；字段顺序、集合排序、缩进、多行字符串、escaping 与特殊 typed value 的 canonical rendering 由 Object serialization contract 冻结；
- **JSON 是同一 Object Value 的等价结构化 representation。** JSON wire 继续复用适用的 Lithograph JSON typed-value encoding，不为 Integer64、Temporal、Point、UUID 等 KG OS public Object value 再建立第二套类型编码；Vector 不属于 v1 caller-owned Object Value；SDK / Web 可以把 `application/json` payload 解析成语言内 Object / Map，这不构成另一种 wire format；
- KG OS **不定义自己的 YAML 方言或 YAML 子语言**。调用方提交的 YAML 只要能由标准 YAML 1.2 parser 解析，并能无歧义映射为目标 Object 的合法 logical value，就可以进入后续 Object schema / type validation；同义但非 canonical 的 YAML 写法不会因为格式不同而被拒绝。Parser 必须在构造普通 Map/List/String/value tree 前拒绝 duplicate mapping key；anchors / aliases 可以使用，但展开后必须是有限、无循环并可映射到普通 Object Value；unknown/custom tag 只有在能按 KG OS/Lithograph 已知 value encoding 无歧义解释时才合法，否则返回 `INVALID_ARGUMENT`。resource/depth/alias-expansion limit 命中返回 `RESOURCE_ERROR`，而不是由 KG OS 猜测或截断输入；
- canonical YAML 是 Git Extended Diff 的唯一文本 base。JSON 可以作为文本或结构化数据读取，但 v1 Object Patch 不以 JSON serialization 作为 diff base，因此 Patch request 不需要额外携带 `yaml | json` patch-format selector；
- 核心 Object 合同不发明 `representation: {mode, format}` 之类参数。HTTP adapter 使用标准 content negotiation：客户端通过 `Accept: application/yaml` 或 `Accept: application/json` 请求 representation，响应通过对应 `Content-Type` 声明实际媒体类型。CLI / SDK 可以提供 `--format`、`readText`、`readObject` 等便利接口，但它们只是同一 Object Value / serialization contract 的适配，不建立新的数据模型；
- State、Object Ref、请求时使用的 Branch / Tag 等定位上下文仍属于 read result metadata，不是可编辑 Object Value。具体 HTTP header / response envelope、CLI 输出包装和 SDK method shape 仍由 transport contract 冻结。

批量 editable presentation 不建立第三种 Object serialization。多个 canonical YAML Object body 需要在同一 stdout 中返回时，CLI 使用标准 YAML 1.2 **multi-document stream**：每个 document 的 mapping/list/scalar 内容必须与该 Object 单独 canonical render 的 bytes 一致；document-start marker 以及 marker/stream 上的 `kgos-state` / `kgos-ref` comment 属于 adapter framing，不属于 document 的 Object Value。Framing comment 被标准 YAML parser 丢弃不影响任何业务值；程序化 target association 使用请求顺序与结构化 metadata，不把 comment 当成持久 identity。v1 不建立自动拆文件、目录结构或 `{ref, value}` YAML wrapper，因为这些都会改变 Patch base 或重新引入文件身份。

canonical YAML renderer v1 使用 YAML 1.2 block style，并固定：2-space indentation、LF document newline、文档末尾一个 newline、不输出 anchors / aliases / custom tags、不输出 comment；固定字段按对应 owner 文档的 Object shape 顺序输出，动态 map key 与 set-like collection 按 UTF-8 byte ascending 排序；Property 列表按 name、具名 Constraint/Index 列表按 name 排序。索引/组合约束的 properties 等有序业务列表保留顺序，不能当作 set 排序。固定 schema field name 使用 plain key；调用方数据产生的动态 map key 一律 double-quote。

这里“不输出 comment”约束的是**单个 canonical Object body**。Batch stream 的 `# kgos-state` / `# kgos-ref` 属于外层 transport framing，不由 canonical Object renderer 产生，也不能进入 Git hunk；抽取任意 document body 后仍满足本段 canonical renderer 规则。

String rendering 必须无损：

- 不含 `LF` 的 String 一律使用 double-quoted scalar；
- 含 `CR` 或其它需要 escape 的 control character 时，即使同时含 `LF` 也使用 double-quoted scalar；backslash、double quote、BS / FF / LF / CR / TAB 以及其它 control character 按 JSON string escaping 规则确定性转义，避免依赖 YAML emitter 的自由选择；
- 其余包含 `LF` 的 String 使用 literal block，不使用 folded `>`：逻辑值末尾没有 `LF` 时用 `|-`，恰好一个 trailing `LF` 时用 `|`，两个及以上 trailing `LF` 时用 `|+` 并输出对应 trailing blank lines；
- UTF-8 printable Unicode character 保持原字符，不做 normalization 或 ASCII escaping。

其它 scalar / typed value rendering 继续以 Lithograph JSON v1 为类型边界，并固定：`null` 写作 `null`；Boolean 只写 `true / false`；JSON safe-range Integer 使用无前导 `+`、无多余前导零的 base-10 scalar，超出 safe range 继续使用 `$type: Integer` + decimal String；finite Float 使用能 round-trip 回同一 IEEE-754 value 的 shortest decimal，并且 lexical form 必须带小数点或 exponent 以区别 Integer，整数值 Float 例如 `1.0` 不能规范化成 `1`，negative zero 固定保留为 `-0.0`；NaN / ±Infinity 继续使用 Lithograph `$type: Float` tagged form。Temporal、Duration、Point、UUID 与 reserved-`$type` Map wrapper 都与 Lithograph JSON v1 同构；遇到 caller-owned Vector value 不是 serialization 问题，而是先按 KG OS public Object profile 拒绝。

因此 canonical renderer 往返解析必须得到逐 code point 相同的 String 和同一 typed scalar value，不允许为了“更好看”增加/移除末尾换行、把 Float 改成 Integer，或丢失特殊值类型。缺省的可选 `title` / `description` 不输出；必需 collection 即使为空也输出；optional/default field 的省略规则由对应 owner 文档规定。Lithograph typed value 只是在 YAML 中表达同一 tagged map，不创建第二套特殊类型语法。

输入仍遵守 D34：调用方不需要复刻 canonical renderer 的风格，只要标准 YAML 能无歧义解析为同一合法 Object Value 即可；成功写入后再次 `read` 会规范化回 canonical YAML。

### Object 公共调用合同

下面的 logical wire 与 HTTP route、CLI command 和 SDK method 无关。所有 adapter 使用相同字段与语义。

```text
ObjectKind = domain | node-definition | relationship-definition |
             knowledge-node | knowledge-relationship
ObjectSummary = { kind, ref, name?, title?, description? }
Page<T> = { state: ResolvedState, items: T[], cursor: string? }
```

Ontology `renameFrom` 是唯一已确认的内嵌 input-only rename 字段；解析 Patch 后先验证并提取该指令再生成正式 Object Value，不把它当未知持久字段，也不存入下一次 read。

StateRef / ResolvedState 引用 [Evolution State reference](evolution.md#state-reference)。分页默认 limit=100，接受 1..1000；cursor 绑定 operation、resolved State 和 filters。不能解析或改写 cursor，参数不匹配返回 INVALID_ARGUMENT。

`list`：

```text
request  = { at: StateRef, kind?, scope?: all|ontology|knowledge, limit?, cursor? }
response = Page<ObjectSummary>
```

按 kind、canonical Ref 的 UTF-8 bytes 升序排列。`scope=ontology` 只列 Domain / Node Definition / Relationship Definition；`scope=knowledge` 只列 Knowledge Node / Relationship；缺省为 all。kind 与 scope 不一致报 INVALID_ARGUMENT。它是程序化枚举，不替代带业务说明和明确下一步入口的 Ontology read。

`search`：

```text
request  = { at: StateRef, query: string,
             kind?: knowledge-node|knowledge-relationship,
             scope?: knowledge, limit?, cursor? }
response = Page<ObjectSummary>
```

scope 省略等价 knowledge；ontology/all 或 Ontology kind 均拒绝。维持既有 Knowledge 最小定位语义：query 是非空 String，仅 canonical n:/r: Ref 完全相等时命中；不增加语义排序、属性文本匹配或另一套 Search DSL。Knowledge 内容检索使用 Graph。返回仍按 kind/ref 排序分页。

`read`：

```text
request = { at: StateRef, ref: ObjectRef }
metadata = { state: ResolvedState, kind: ObjectKind, ref: ObjectRef }
body = canonical YAML | equivalent JSON Object Value
```

body 只包含公共逻辑值。Metadata 由 adapter 独立携带，不能混入 editable YAML。JSON 与 YAML 等价，默认 Markdown Ontology read 是另一个只读呈现，不是 Patch base。

`patch`：

```text
request = {
  baseState: ResolvedState,
  branch: string,
  patch: string,       # Git Extended Diff over canonical YAML
  author?: string,
  message?: string
}
response = {
  state: ResolvedState,
  created: [ { alias, kind, ref } ... ],
  transitions: [ { from, to } ... ]
}
```

baseState 只接受 immutable `commit/<64-hex>`，branch 是真实 Branch name。Patch 已有 target 用 canonical Object Ref；新建顶层 Object 用 `new:<kind>:<alias-component>`。这里的 kind 只取五种公共 ObjectKind；alias component 复用 Ref 的 RFC 3986 encoding。无 effective delta 时 state==baseState 且不创建 Commit。

Adapter 可以在不改变上述 logical contract 的前提下收窄允许的 ObjectKind。`kg ontology patch` 固定只接受 Domain / Node Definition / Relationship Definition target，并直接复用本 `patch`；它不是新的 mutation capability。通用 `kg object patch` 仍可处理五种 ObjectKind，因此需要 Ontology + Knowledge 同请求原子变化时不必发明另一套 batch API。

`new:...` 是 KG OS 的 request-local 引用约定，不是 Git/YAML 标准，也不是永久身份。它只解决同一请求中新对象尚未有最终 Ref 时的相互引用；Patch framing/escaping 仍用 Git，值用 YAML 1.2。不能把 new:... 保存到后续请求或作为 Graph elementId 使用。

所有新增 Object 的 Patch target 都统一使用 `new:<kind>:<alias-component>`，即使某个 name-backed Object 的最终 Ref 可以从目标内容推导，也不允许在 Add entry 中直接把“未来 Ref”当作已存在 Object Ref。这样 Add 的定位规则不因 Object kind 改变，也不会出现一部分新增对象按 alias、另一部分靠预测最终 Ref 的双重创建模型。`<kind>` 显式存在是为了在解析 Object body 之前就确定目标 owner / Object schema，并让同名 alias 在不同 kind 下保持可区分；KG OS 不从 YAML 字段组合猜 Object kind。

`author/message` 直接映射到本次 Object Patch 的 Lithograph `tx_begin` transaction metadata，并最终成为**实际新建 Commit**的 immutable metadata；KG OS 不解释其业务语义。Object Patch 无 effective delta 时不调用 `tx_begin`、没有新 Commit，因此即使 request 带 `author/message` 也不为保存 metadata 单独创建 State；需要显式 empty-delta State 时使用 `state.create`。

同一个 `new:<kind>:<alias-component>` 也用于 patched YAML 中所有“本应填写 Object Ref、但引用本请求新对象”的位置；例如新 Relationship 的 `start/end` 可以引用 `new:knowledge-node:alice`，Domain `includes` 可以引用新 Definition alias。alias decode 后必须是 1..255 UTF-8 bytes，禁止 NUL 与 ASCII control characters；同一 Patch 内 `(kind, alias)` 唯一。alias 永不出现在成功后的 canonical Object Value，执行成功后必须通过 `created` 返回最终 Ref。

`created.alias` 返回 decode 后的逻辑 alias String，不返回 percent-encoded target component；`created` 按 `kind` + alias UTF-8 bytes 升序，`transitions` 按 `from` Object Ref UTF-8 bytes 升序。Patch entry 原始文本顺序不影响 result ordering。

因此 `n:123` / `r:456` 等系统分配 identity 不会因为 AI 修改 YAML 而被重新赋值。Definition / Domain 的 identifying name 属于可编辑业务结构，显式顶层 rename 按 Ref transition 语义处理。Property 名称属于 Definition 的内嵌字段；通过 `renameFrom` 声明连续性，在 Definition 字段级 History / Diff 中解释，不返回不存在的独立 Property Object Ref。

公共编辑边界按 KG OS aggregate 定义，不按底层 resource owner 拆分。Node/Relationship Definition entry 可以在同一次局部修改中改变属性、约束、索引和业务说明。共享声明先按 [Ontology 共享资源规则](ontology.md#共享资源与聚合编辑) 合成一个显式 logical delta，再编译到数据库；每条底层资源变化只执行一次。

`patch` 是明确 Object 的统一 mutation 模型。调用方不是提交 JSON Patch、JSON Merge Patch 或 `op/path/value` mutation DSL，而是以 Object `read` 的 canonical YAML 为 base，提交**文件式文本 Patch**。Patch 可以覆盖：

```text
Add
Update
Delete
Rename
Restructure
```

Object Patch v1 的 textual syntax 固定采用普通 two-way **Git Extended Diff**，即 `git diff -p` 生成的 patch text 形态；Git `diff-format` 是语法参考，但 KG OS v1 只承诺本文明确列出的可应用 profile，未来 Git 增加的新格式不会自动进入 KG OS 合同：

- 每个 Object target 映射为一个标准 `diff --git a/<target> b/<target>` file entry；这里的 `<target>` 是 Object transport contract 序列化后的 owner-backed Object Ref，或新增 Object 的 request-local alias + object kind target。`a/` / `b/` 是 Git patch 的语法前缀，不是 KG OS 虚拟目录、Object Ref 的组成部分或持久 identity；
- Update / Restructure 使用标准 `---` / `+++` 与 unified `@@ ... @@` hunks；Add 使用标准 `new file mode 100644`、`--- /dev/null`、`+++ b/<target>`；Delete 使用标准 `deleted file mode 100644`、`--- a/<target>`、`+++ /dev/null`；
- Rename 使用标准 `diff --git a/<old-target> b/<new-target>` 与 `rename from` / `rename to` extended headers，可以同时包含 unified hunks。`<old-target>` 定位 `baseState` 中已有 Object；`<new-target>` 只表达 rename 后的目标 locator，不改变 D23“Patch 内其它已有对象引用仍按 baseState Ref 解析”的规则；
- 一个多 Object Patch 直接由多个标准 `diff --git` file entry 组成，不增加 KG OS 自有 Patch wrapper 或 section delimiter；
- Object target 字符串放入 Git path slot 后，特殊字符的 quoting / escaping 服从 Git patch 的 pathname quoting 规则；KG OS 不再定义第二套 Patch path escaping。已有对象 target 使用上面 canonical Object Ref；新增对象使用 `new:<kind>:<alias-component>`；
- 标准 `similarity index` / `dissimilarity index` / `index <hash>..<hash>` 等 Git metadata 如果出现，只是 Patch framing / advisory metadata，不是 KG OS identity、concurrency guard 或业务状态；`baseState` + target Branch 才是 Object Patch 的权威并发基线；
- v1 不接受 Git combined diff、copy semantics、binary patch、symlink / submodule、mode-only mutation 或其它没有 Object mutation 语义的 Git patch 形式。Add / Delete 使用的 `100644` 只作为 canonical YAML regular-file framing，不产生权限或文件模式业务状态；
- KG OS 采用的是成熟 Git patch **文本语法**，不是 Git filesystem / index / blob 模型。Patch parser/application 必须把 file target 映射到 Object Ref，或新增对象的 alias + object kind，再按本文 strict base-State、exact apply、aggregate delta normalization、dependency、derived maintenance 与 all-or-nothing 规则执行；不得直接把 `git apply` 的文件系统行为当成 KG OS mutation semantics。

五类 Patch 变化以 KG OS 公共逻辑模型为准。系统分配的 Knowledge identity 不能 rename；Definition / Domain name 可显式 rename；Property rename 在 Definition 内表达。底层缺少原地 ALTER/rename 不等于公共变化不可用：compiler 可以用安全的 staged replacement 实现同一逻辑目标，不允许因此丢失数据或更改未请求语义。

顶层 identifying name 修改必须使用 Git Rename entry。old target 定位 baseState 的 Object，new target 表达新名称；若 YAML hunk 也改 name，则必须一致；未触碰 name 时 compiler 从 Rename header 派生。Property rename 使用 Ontology 规定的 input-only `renameFrom`，不能把普通字段移除/新增靠相似度猜成 rename。

一个 Object Patch 可以同时包含一个或多个 Git patch file entry。已有对象的 entry 通过 old/current target 解码出的 canonical Object Ref 定位；新增对象尚无最终 Object Ref，使用已经冻结的 `new:<kind>:<alias-component>` 定位该 entry。不得再创建 KG OS 自有 Patch section header、escaping grammar，也不得在后续 adapter 设计中替换成另一套 JSON mutation language。

同一 Patch 的 aggregate overlap 按**显式变化的 logical slots**检测，而不是因为两个 body 读到了同一 Index 就拒绝。相同 slot 相同目标合并，不同值或 delete/update 竞争整体拒绝；不重叠变化合成后验证最终资源。未变化字段只是上下文。内嵌资源在单字段与组合位置间移动时先按资源名称配对，不依赖 entry 顺序。

因为 Object Patch 严格基于 `baseState`，**Patch 中对任何已经存在 Object 的引用都按 baseState Object Ref 解析**。如果同一 Patch 把 `node:Person` rename 为新的 Ref，其他 entry 要继续引用“同一个 Definition”时仍使用 base Ref `node:Person`；KG OS 通过本次 rename continuity 把该逻辑引用带到目标 Snapshot。调用方不能依赖尚未产生的 target Ref 在同一 Patch 中重新定位该已有对象。只有本次新建、在 baseState 中不存在的 Object 使用 request-local alias。成功后新的 Ref 只通过 alias mapping / Ref transition 返回。这样多 Object Patch 的引用解析完全由 `baseState + Ref | alias` 决定，不依赖 entry 顺序或对未来 Ref 的猜测。

Object Patch 以调用方实际读取的 immutable `baseState` 为 patch base、以明确 Branch 为 write target。**v1 使用 strict base-State 语义：mutation 开始时 target Branch 的当前 head 必须仍等于 `baseState`；如果 Branch 已前进，则整个 Patch 以 `STALE_BASE_STATE` 失败，不把基于旧文本生成的 Patch 自动套用到新 State，也不自动 rebase / merge。** 对存在有效 target delta 的 Patch，这个并发基线由 Lithograph `tx_begin(expectedHead=baseState)` 在取得 single-writer ownership 后原子检查；成功 begin 后其它 writer 不能在本 transaction 生命周期内移动该 Branch。无 effective delta 的 Patch 不开启 transaction，但仍必须先读取并比较 target Branch head，stale 时同样返回 `STALE_BASE_STATE`。

在 base State 校验通过后，KG OS 重新生成对应 Object canonical YAML，精确应用 textual Patch 得到目标 YAML，使用标准 YAML parser 解析为 target Object Value / target Object set，再执行 Object schema / type、Ontology / Knowledge dependency、Schema、Graph View 与其它公开规则校验，最后编排 Lithograph。请求默认 all-or-nothing；任一变化失败都不能留下部分 durable 结果。若 Knowledge Object 变化会新增/删除 semantic-index target 或改变 source Property，managed vector refresh 属于该 Patch 的 mandatory derived change；Provider/refresh 失败必须让整个 Patch rollback，不能提交 source/vector 不一致 State。

Ontology Patch 对 semantic Index 的 create/delete、targets 变化、source properties 增删/重排，或 source Property rename/type change，也必须把**当前 baseState 中全部受影响 Knowledge element**的 managed-vector index maintenance 纳入同一个最终 State：新建/扩展执行 backfill，删除/缩小清理不再需要的 managed value，source framing 改变执行 rebuild / refresh。不能先提交新的 public Index 定义，再异步补 embedding 或追加第二个隐藏 Commit。调用方显式 delta 仍只有 Ontology aggregate；这些 Knowledge vector 变化属于 mandatory derived maintenance，不要求 AI 枚举每个实例，也不是 Config Migration。

对于 Update / Rename / Restructure，KG OS 不把“应用 Patch 后得到的一整份 YAML”当成 `PUT` 语义，而是比较 base Object Value 与 patched YAML 解析得到的 Object Value，只把调用方**显式改变的 logical slots**作为 target delta；Rename entry 的 old/new target 额外贡献该 Object identifying locator 的显式 rename delta。未被 textual Patch 改动的字段只是 context，不会阻止同一请求为了 rename、referential integrity 或 consistency 产生必要的 derived maintenance。例如 Relationship Definition rename 与某条 Relationship 的 Property update 可以同时存在：该 Relationship entry 没有编辑的旧 type 字段不会覆盖 mandatory type rewrite。反过来，如果调用方显式修改的 slot 与 mandatory derived change 要写同一 slot 且目标不同，则整个 Object Patch 冲突失败，不按 entry 顺序覆盖。

Textual Patch application 使用**精确 base**，不使用普通文件工具可能提供的 fuzzy hunk matching、自动 offset 猜测或“尽量应用”。Update / Delete / Rename entry 的 Object Ref 必须在 `baseState` 中存在，不存在返回 `OBJECT_NOT_FOUND`；Add 不具有 upsert 语义，planned target 中若最终形成重复 Object Ref / identifying name 则返回 `OBJECT_CONFLICT`。删除一个在 base State 中不存在的 Object 也不是成功 no-op。调用方要修改已有对象必须显式使用其原 Ref，要创建对象必须显式 Add。

KG OS 在编译前计算 Object Patch 的**有效 target delta**。如果所有 entry 归一化后都没有改变 Ontology / Knowledge Snapshot，则 Object Patch 不调用底层 mutation、不创建新的 State，并返回 `baseState` 作为最终 State；需要“Snapshot 内容不变但显式产生一个新业务 State”时只能使用 Evolution `state.create`。Graph `execute` 仍遵守 Lithograph writable Cypher 自己的 Commit 语义，不由这条 Object Patch 规则改写。

Patch 表达的是**目标 Object 要变成什么**，不是要求底层必须原地修改。调用方不能直接给系统分配的 identity 重新赋值，例如不能把 `n:123` 改写成 `n:999`；但 Label、Property、Relationship Type、Relationship endpoint、Definition identifying name、Domain organization 等业务结构都可以成为目标变化。若 Lithograph 可以保持底层 identity，成功结果继续返回原 Ref；若某项变化只能通过 replacement / data rewrite 实现，例如当前 Lithograph 合同下 Relationship Type / endpoint 变化需要删除旧 Relationship 并创建新 Relationship，KG OS 可以这样编排，并在本次结果中返回旧 Ref → 新 Ref transition。这个 transition 是 mutation result，不创建持久的第二套 Knowledge identity / alias。

Knowledge Object 删除同样遵守“无隐式数据损失”：删除 Relationship 只删除该 Relationship；删除仍有 incident Relationship 的 Node 时，Object Patch 必须 reject，除非同一个 Patch 已显式删除或重构这些 Relationship。Object Patch 不把 `Delete n:<id>` 静默解释为 `DETACH DELETE`。如果调用方确实需要条件级 / 集合级 detach 行为，可以通过 Graph `execute` 明确写出 Lithograph / Cypher 对应 mutation。

新增 Object 在执行前可能还没有最终 owner-backed Object Ref。一个 Patch 内可以使用 request-local temporary alias 串联本次新建对象；在同一 Patch 中，任何本应填写 Object Ref 的目标位置都可以引用此前或同时声明的新 Object alias，例如新 Relationship 的 endpoint 可以引用本次新建 Node。alias resolution 必须基于整个 Patch 的声明图完成，不能依赖 entry 文本顺序；不存在、重复 `(kind, alias)` 或形成无法解析的 alias reference 时整个 Patch 失败。alias 只存在于请求内部，成功后必须映射到 Lithograph / Schema / Domain 实际产生的 Object Ref，不成为第二套持久身份。

KG OS 的 Object Patch 不是 raw Lithograph Structural Patch。非 no-op Object Patch 统一编译为一个 Lithograph explicit transaction：`tx_begin(targetBranch, expectedHead=baseState)` → 标准 Cypher 25 graph / Schema / Constraint / Index mutation → `tx_commit`。所有 mutation 都只形成 transaction-local staged state，成功时恰好产生一个最终 Commit；Definition / Property create、rename / restructure、Binding mutation 与必要 Knowledge data rewrite / index maintenance 因此可以共享同一 State boundary，不再需要允许任何 missing / dangling Binding intermediate Commit。request-local alias 在 transaction 内随着 Cypher create result 解析到正式 Ref，成功响应再返回 `created` mapping / direct Ref transition。

KG OS 不使用 Lithograph Structural Patch 解决普通 Object mutation，不使用 caller-owned SQLite transaction 合并 Commit，也不建立自己的 hidden transaction / version layer。Structural Patch 仍属于 Lithograph 的版本 delta/replay 能力；KG OS 只在 Evolution diff/merge 等底层版本操作确实需要时通过 Lithograph 已有 Version capability 消费其结果，而不把 raw Patch 暴露为 Object wire。

Object `list` / `search` / `read` 使用统一 State reference semantics。Branch / Tag 在读取开始时解析并 pin 到 immutable State，并返回 resolved State identity。Object `patch` 不接受模糊的“当前最新版本”作为文本 base：调用方必须提供明确 immutable `baseState` 与目标 Branch。成功写入返回本文 `patch` response 中的最终 State、`created` 与 `transitions`。对调用方**直接寻址并修改**后发生 identity replacement / rename 的 Object，结果必须返回旧 Ref → 新 Ref transition。Definition-level Relationship Type rename 可能派生出大量 Relationship replacement；这类 derived replacement 不承诺永久的一对一 Ref transition mapping，旧 Relationship Ref 在新 State 中失效，调用方通过 Graph 在新 State 中重新发现 Relationship，新旧集合变化通过 Evolution diff/history 审计。

### Object 能力边界

- 不建立虚拟文件系统或第二套路径 identity；Git file entry 只是 textual Patch framing。
- Object 统一 KG OS 业务 aggregate 的维护，不把每个底层 Schema resource 提升为公共对象。Ontology 聚合字段只在 ontology.md 定义。
- 不另建 save/create/update/upsert、各 Property/Constraint/Index CRUD 或平行 Ontology Patch engine；`kg ontology patch` 只是本 Patch 的 kind-scoped CLI adapter。
- Ontology discovery 使用渐进式读取，无 Ontology search；Knowledge 查询/批量写保持 Graph Cypher。
- State Data、Branch、Tag、Merge 等 sidecar/ref 由 Evolution 负责，不套 Object 身份。
- 不暴露 Binding Record、Schema Locator 或 reserved internal graph/Schema，不绕过 Graph View。
- 不把 Lithograph raw Structural Patch 当作 Object wire；一次 logical Patch 由 KG OS 编译为一次真实 transaction。
