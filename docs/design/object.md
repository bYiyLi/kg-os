# Object 设计

本文件是 KG OS **Object identity、Object Value、representation、discovery、read 与 Patch mutation** 的设计真源。State / History / Merge 由 [Evolution](evolution.md) 负责。

## Object Ref 与公共身份

KG OS 不建立一套覆盖所有资源的额外 UUID / Resource ID 体系。Object Ref 直接复用对象 owner 已有的原生 identity，或使用当前 Snapshot 中足以确定定位的业务名称；KG OS 不再把原生 identity 包装成第二种公开地址：

| Object | Object Ref / 定位依据 |
| --- | --- |
| Knowledge Node | Lithograph `elementId()`，例如 `n:123` |
| Knowledge Relationship | Lithograph `elementId()`，例如 `r:456` |
| Current Graph Type | Lithograph 公开 current Graph Type locator / identity |
| Node Definition | `kind=node` + 当前 Schema identifying name |
| Relationship Definition | `kind=relationship` + 当前 Relationship Type / Schema identifying name |
| Property | owner Definition Ref + 当前 property name |
| Standalone Constraint | Lithograph 公开 constraint identity / name |
| Index Definition | Lithograph 公开 index identity / name |
| Domain | 当前 Domain name |

Object Ref v1 的 canonical string serialization 固定为：

```text
Knowledge Node             n:<decimal-id>
Knowledge Relationship     r:<decimal-id>
Node Definition            node:<name>
Relationship Definition    relationship:<name>
Property                   property:<owner-definition-ref>#<property-name>
Domain                     domain:<name>
Current Graph Type         graph-type:<lithograph-locator>
Standalone Constraint      constraint:<lithograph-locator>
Index Definition           index:<lithograph-locator>
```

其中 `<name>`、`<property-name>` 与 Lithograph locator component 先按 UTF-8 编码，再按 RFC 3986 percent-encoding 作为单个 component 序列化；unreserved bytes `ALPHA / DIGIT / - . _ ~` 保持原样，其它 byte 使用 `%HH` uppercase hex。KG OS 不做 Unicode normalization、case folding 或名称重写。Property 的 owner 只能是 `node:...` 或 `relationship:...` Definition Ref；因为 component 内的 `#` 必须 percent-encode，raw `#` 可以无歧义作为 owner Ref 与 property name 的分隔符。

公共 API 输入的 Object Ref 必须是 canonical serialization：percent escape 使用 uppercase `%HH`，可保持 unreserved 的 byte 不能额外 percent-encode，decode 后必须是合法 UTF-8；同一个 Object 不接受多种等价 Ref 拼写。非 canonical / 非法编码返回 `INVALID_ARGUMENT`，不存在的 canonical Ref 才返回 `OBJECT_NOT_FOUND`。

`graph-type:` / `constraint:` / `index:` 后的 locator 只是 Lithograph **公开 canonical locator / identity 的无损字符串编码**，不建立 KG OS name→ID mapping。若 Lithograph 对某类 Schema resource 尚未提供可无歧义序列化的公开 canonical locator，该 Object kind 的实现继续按前述规则视为底层公共能力阻塞；KG OS 不通过内部表或自建 UUID 补洞。

Knowledge element 必须直接使用 Lithograph 已公开的 `n:<id>` / `r:<id>`，不能再转换成 `/knowledge/n:<id>`、`object:n:<id>` 或其它 KG OS 专用身份。Graph 查询返回的 `elementId()` 因而可以原样用于 Object `read` / `patch`，也可以原样重新用于 Cypher。

“统一 Object Ref”表示所有 Object 都通过一个公共 `ref` 概念定位，**不表示所有 Ref 都是同一种 Lithograph value**。只有 Knowledge Node / Relationship 的 `n:<id>` / `r:<id>` 是 Cypher `elementId()` 字符串，可以直接用于 `elementId()` 比较；Definition / Property / Domain / Graph Type / Constraint / Index Ref 是各自 owner 的 Schema / KG OS locator，只用于相应 Object / Evolution 语义，不能当作 Knowledge elementId 传入 Cypher。Object discovery result 按本文 `ObjectSummary` 同时返回 `kind + ref`，调用方不需要从任意 locator 内容猜 Object kind。

如果 Lithograph 对某类 versioned Schema resource 尚未提供足以无歧义 read / mutate / history 的公共 locator / identity，KG OS 不得通过读取内部表、生成持久 UUID 或维护 name→ID side table 来补洞；对应 Object kind 的实现 readiness 视为被底层公共能力阻塞，直到 Lithograph 自身公共合同能够支持。这个规则保证“统一 Object”不会反过来迫使 KG OS 建立第二套 Schema identity。

State / Branch / Tag 不是另一类 Object identity，而是 Evolution reference：State 直接复用 Lithograph Commit identity，Branch / Tag 直接复用各自名称。一个历史对象的完整定位语义是 **State reference + Object Ref**；两者保持独立字段，不拼成新的永久 ID。

Definition、Property 与 Domain 的 Object Ref 用于在一个确定 Snapshot 中定位当前对象，不承担跨版本永久身份。显式 rename 后 Object Ref 随名称变化；KG OS internal Binding Record / Domain Node 的稳定 Lithograph graph element identity 负责跨 Commit 的内部连续性，使 Evolution History / Diff 可以把 rename 解释为同一对象的演化，而不是要求调用方持有额外 UUID。

因此：

```text
Object Ref
→ 在目标 Snapshot 中定位对象

State reference + Object Ref
→ 定位历史 Snapshot 中的对象

internal graph identity
→ KG OS 内部识别跨 Snapshot 连续性
```

内部 Binding Record / Domain Node identity 当前不进入 v1 公共 identity。未来只有出现必须跨 rename 长期持有 opaque public identifier 的真实需求时，才重新评估是否暴露稳定公共 ID。

## Object

Object 是 KG OS 面向 AI / SDK / Web 的统一**可寻址、可读取、可编辑投影**。Ontology 与 Knowledge 仍然保持各自的数据责任，但不再各自维护一套 CRUD surface；Domain、Definition、Property、Lithograph current Graph Type / standalone Constraint / Index definition，以及 Knowledge Node / Relationship 都通过同一个 Object 模型被定位和维护。

Object 不是新的持久化层。每次读取都从目标 State 的 Lithograph Schema、普通 Knowledge graph 与 KG OS internal semantic graph 动态生成；每次修改都必须回写到底层真实 owner，不能保存第二份 Object JSON 作为真源。

### Object 能力面

```text
Object Capability
│
├── list
├── search
├── read
└── patch
```

这些名称描述逻辑能力，不冻结最终 CLI command、SDK method 或 HTTP route。**Object Patch 的交互模型已经冻结为“canonical YAML + Git Extended Diff textual Patch”**。文本 Patch 语法直接采用普通 two-way `git diff -p` / Git Extended Diff 格式，KG OS 不再定义自己的 section marker、hunk grammar 或 path escaping。

KG OS v1 不再增加独立 `save` / `create` / `update` / `replace` / `upsert` 核心 mutation capability。Add / Update / Delete / Rename / Restructure 都由同一个 `patch` 表达；“新增一个 Object”使用 Git new-file entry，“修改已有 Object”使用基于 `baseState` canonical YAML 的 hunk，“删除 / rename”复用 Git 对应 extended headers。这样 `save` 不会再引入“Ref 不存在是否自动 create”“完整 Object 缺失字段是删除还是保留”“更新是否等价 replace / upsert”等第二套写入语义，也不会为多 Object 原子变化再复制 batch / alias / concurrency contract。Adapter 可以提供生成 Patch 的本地 convenience helper，但不能把它提升成具有独立写入语义的第二个公共能力。

`list` 用于按 Object kind / scope 做轻量枚举与分页，只返回定位和必要摘要，不因为某个 scope 下对象很多就展开所有 Object 内容。`search` 用于不知道准确 Ref 时发现相关 Object；Ontology 的 `name` / `title` / `description` 等语义可以进入这一能力，但它不演化成第二套 Search DSL。海量 Knowledge 的条件发现、关系遍历、全文/向量混合检索等复杂任务继续由 Graph `query` 完成。

### Object Value 与 representation

`read` 接受 State reference + Object Ref，先解析出唯一的逻辑 **Object Value**，再按调用方需要序列化。YAML 与 JSON 只是同一 Object Value 的不同 representation，不是两份对象状态、两套 Schema 或第二持久化真源。

Object Value 的**逻辑内容和 ownership 已由各 owner 章节确认**，serialization contract 不重新设计它们：Domain 使用已确认的 `name / title? / description? / includes`；Definition / Property 聚合 Lithograph Structure 与对应 `title? / description?`；Knowledge Node / Relationship 投影 Lithograph 当前 graph state；current Graph Type / standalone Constraint / Index 直接投影各自 Lithograph Schema resource 的 owner state。本文已经冻结 KG OS 自己拥有的字段、顺序、typed value 与调用合同；唯一仍依赖底层设计的是 `structure` 内部如何无损投影 Lithograph public Schema resource。

v1 已能从当前 owner contract 冻结的 Object Value shape 如下；这些字段描述**可编辑 owner state**，Object Ref、resolved State、Object kind 等定位 metadata 不放进 canonical body：

```text
Domain
  name
  title? / description?
  includes[]                 # Object Ref

Knowledge Node
  labels[]
  properties{}

Knowledge Relationship
  type
  start                      # n:<id>
  end                        # n:<id>
  properties{}

Node / Relationship Definition
  name
  title? / description?
  structure                  # Lithograph public Schema projection
  properties[]               # 按 Property name 排序的完整 child Property projection

Property
  name
  title? / description?
  structure                  # Lithograph public Property Schema projection

Graph Type / Constraint / Index
  structure                  # 对应 Lithograph public Schema resource projection
```

上面的 Object Value shape 描述 `read` 返回和成功 State 中的**正式 logical value**。Request-local `new:<kind>:<alias-component>` 不是新的 Object Value scalar type；它只允许在 Object Patch 输入中替代一个本来要求 Object Ref、但目标是本请求新增 Object 的 Ref-typed slot。成功后的 Relationship `start/end`、Domain `includes` 等位置必须全部解析成正式 Object Ref，canonical `read` 永远不返回 `new:...`。反过来，普通 String / Property value 即使文本恰好以 `new:` 开头，只要该 slot 不是 Object Ref 类型，就按普通 String 处理，不能被 alias resolver 截获。

`structure` **不是 KG OS 自建 Schema AST**。它由 Lithograph 已确认的 Cypher 25 Schema / current-graph `SHOW` public surface 投影，并由 KG OS projection/compiler 层归一化成 owner-only logical value，再编译回标准 Cypher 25 Schema mutation。精确字段 / row 到 `structure` slot 的映射与 canonical normalization 属于实现合同；如果实现时发现某个 KG OS 已确认 owner state 确实无法通过 Lithograph public surface 读取或修改，这是具体底层能力缺口，而不是允许 KG OS 自建第二套 Schema AST 的理由。

`structure` 仍必须服从 owner-only、single-slot 原则，不能把已经由外层字段或 child Object 拥有的状态再复制一遍：Definition 的 `structure` 不重复自身 identifying `name`，也不内联 child Property state；Property 的 `structure` 不重复 Property `name` / `title` / `description`；Graph Type 的 `structure` 只包含 D27 定义的 graph-level owner state，不内联 Definition / Property / Constraint / Index；Constraint / Index 的 `structure` 只包含自身 Lithograph owner state，并以 public locator / Object Ref 引用其它资源而不是复制其可变内容。KG OS renderer / parser 必须把每个可编辑 logical slot 映射到唯一位置；如果 Lithograph introspection 原始结果有嵌套重复，projection 层负责归一化，而不是原样制造第二个 mutation owner。

v1 确认两种公开 serialization：

```text
Object Value
├── application/yaml  → canonical editable representation
└── application/json  → equivalent structured representation
```

- **YAML 是唯一 canonical editable representation。** 同一个 immutable State + 同一个 Object Ref 必须由 KG OS renderer 产生确定、可重放的 canonical YAML；字段顺序、集合排序、缩进、多行字符串、escaping 与特殊 typed value 的 canonical rendering 由 Object serialization contract 冻结；
- **JSON 是同一 Object Value 的等价结构化 representation。** JSON wire 继续复用适用的 Lithograph JSON typed-value encoding，不为 Integer64、Temporal、Point、Vector、UUID 等值再建立第二套类型编码；SDK / Web 可以把 `application/json` payload 解析成语言内 Object / Map，这不构成另一种 wire format；
- KG OS **不定义自己的 YAML 方言或 YAML 子语言**。调用方提交的 YAML 只要能由标准 YAML 1.2 parser 解析，并能无歧义映射为目标 Object 的合法 logical value，就可以进入后续 Object schema / type validation；同义但非 canonical 的 YAML 写法不会因为格式不同而被拒绝。Parser 必须在构造普通 Map/List/String/value tree 前拒绝 duplicate mapping key；anchors / aliases 可以使用，但展开后必须是有限、无循环并可映射到普通 Object Value；unknown/custom tag 只有在能按 KG OS/Lithograph 已知 value encoding 无歧义解释时才合法，否则返回 `INVALID_ARGUMENT`。resource/depth/alias-expansion limit 命中返回 `RESOURCE_ERROR`，而不是由 KG OS 猜测或截断输入；
- canonical YAML 是 Git Extended Diff 的唯一文本 base。JSON 可以作为文本或结构化数据读取，但 v1 Object Patch 不以 JSON serialization 作为 diff base，因此 Patch request 不需要额外携带 `yaml | json` patch-format selector；
- 核心 Object 合同不发明 `representation: {mode, format}` 之类参数。HTTP adapter 使用标准 content negotiation：客户端通过 `Accept: application/yaml` 或 `Accept: application/json` 请求 representation，响应通过对应 `Content-Type` 声明实际媒体类型。CLI / SDK 可以提供 `--format`、`readText`、`readObject` 等便利接口，但它们只是同一 Object Value / serialization contract 的适配，不建立新的数据模型；
- State、Object Ref、请求时使用的 Branch / Tag 等定位上下文仍属于 read result metadata，不是可编辑 Object Value。具体 HTTP header / response envelope、CLI 输出包装和 SDK method shape 仍由 transport contract 冻结。

canonical YAML renderer v1 使用 YAML 1.2 block style，并固定：2-space indentation、LF document newline、文档末尾一个 newline、不输出 anchors / aliases / custom tags、不输出 comment；固定字段按上面各 Object shape 的顺序输出，动态 map key 与 set-like collection 按 UTF-8 byte ascending 排序。固定 schema field name 使用 plain key；调用方数据产生的动态 map key 一律 double-quote。

String rendering 必须无损：

- 不含 `LF` 的 String 一律使用 double-quoted scalar；
- 含 `CR` 或其它需要 escape 的 control character 时，即使同时含 `LF` 也使用 double-quoted scalar；backslash、double quote、BS / FF / LF / CR / TAB 以及其它 control character 按 JSON string escaping 规则确定性转义，避免依赖 YAML emitter 的自由选择；
- 其余包含 `LF` 的 String 使用 literal block，不使用 folded `>`：逻辑值末尾没有 `LF` 时用 `|-`，恰好一个 trailing `LF` 时用 `|`，两个及以上 trailing `LF` 时用 `|+` 并输出对应 trailing blank lines；
- UTF-8 printable Unicode character 保持原字符，不做 normalization 或 ASCII escaping。

其它 scalar / typed value rendering 继续以 Lithograph JSON v1 为类型边界，并固定：`null` 写作 `null`；Boolean 只写 `true / false`；JSON safe-range Integer 使用无前导 `+`、无多余前导零的 base-10 scalar，超出 safe range 继续使用 `$type: Integer` + decimal String；finite Float 使用能 round-trip 回同一 IEEE-754 value 的 shortest decimal，并且 lexical form 必须带小数点或 exponent 以区别 Integer，整数值 Float 例如 `1.0` 不能规范化成 `1`，negative zero 固定保留为 `-0.0`；NaN / ±Infinity 继续使用 Lithograph `$type: Float` tagged form。Temporal、Duration、Point、Vector、UUID 与 reserved-`$type` Map wrapper 都与 Lithograph JSON v1 同构。

因此 canonical renderer 往返解析必须得到逐 code point 相同的 String 和同一 typed scalar value，不允许为了“更好看”增加/移除末尾换行、把 Float 改成 Integer，或丢失特殊值类型。缺省的可选 `title` / `description` 不输出；结构性 collection 即使为空也输出为空 collection。Lithograph typed value 只是在 YAML 中表达同一 tagged map，不创建第二套特殊类型语法。

输入仍遵守 D34：调用方不需要复刻 canonical renderer 的风格，只要标准 YAML 能无歧义解析为同一合法 Object Value 即可；成功写入后再次 `read` 会规范化回 canonical YAML。

### Object 公共调用合同

Object 的逻辑 wire contract 独立于具体 HTTP route、CLI command 或 SDK method；不同 adapter 必须保持下列字段与语义，不得因为 transport 不同产生第二套行为。

共同类型：

```text
ObjectKind =
  domain | node-definition | relationship-definition | property |
  graph-type | constraint | index | knowledge-node | knowledge-relationship

ObjectSummary = {
  kind,
  ref,
  name?,
  title?
}

Page<T> = {
  state,          # 本次读取 pin 的 ResolvedState
  items: T[],
  cursor: string? # null 表示结束
}
```

这里使用的 `StateRef / ResolvedState` 直接引用 Evolution [State reference](evolution.md#state-reference) 的唯一 canonical grammar；Object 不维护第二份版本引用定义。

所有 pageable read 的 `limit` 省略时为 `100`，v1 接受 `1..1000`；`cursor` 是 opaque continuation，只能与产生它时相同的 resolved State、operation 和 filters 一起继续使用。调用方不能解析或修改 cursor；不匹配时返回 `INVALID_ARGUMENT`。

`list`：

```text
request  = { at: StateRef, kind?, scope?: all|ontology|knowledge, limit?, cursor? }
response = Page<ObjectSummary>
```

结果按 `kind`、canonical Object Ref 的 UTF-8 bytes 升序稳定排序。`scope=ontology` 覆盖 Domain / Definition / Property / Graph Type / Constraint / Index；`scope=knowledge` 覆盖 Knowledge Node / Relationship；省略 scope 等价 `all`。`kind` 与 scope 冲突时返回 `INVALID_ARGUMENT`。

`search`：

```text
request  = { at: StateRef, query: string, kind?, scope?: all|ontology|knowledge, limit?, cursor? }
response = Page<ObjectSummary>
```

它只是 Object discovery，不建立 correctness-sensitive Search DSL。`query` 必须是非空 String；v1 不做 relevance ranking：

- canonical Object Ref 与 query 完全相等时命中；
- Domain / Definition / Property 的 identifying name、`title`、`description`，以及 Graph Type / Constraint / Index 的公开 resource name / locator，对 query 做 Unicode default case-fold 后的 substring match；不做 Unicode normalization；
- Knowledge Node / Relationship 除 canonical Object Ref exact match 外不承诺属性文本搜索，属性全文、向量、关系与条件 discovery 继续使用 Graph Cypher。

匹配后的结果仍按 `kind`、canonical Object Ref UTF-8 bytes 升序分页，因此没有 score/ranking cursor。搜索算法未来可以增加新的 discovery surface，但不能让已经定义的 exact Ref / name / title / description match 消失或改变同一 API 的排序语义。

`read`：

```text
request = { at: StateRef, ref: ObjectRef }

result metadata = {
  state: ResolvedState,
  kind: ObjectKind,
  ref: ObjectRef
}

result body = canonical YAML | equivalent JSON Object Value
```

representation 仍通过 adapter 的标准 content negotiation / format selection 决定，不加入业务 request field。canonical body 只包含 Object Value；metadata 必须由 adapter 的 metadata channel 与 body 分离，不能为了返回 `state/ref/kind` 把它们混入可编辑 YAML。SDK 可以把两者组合成一个语言内 result object，但 Patch base 始终只取 canonical YAML body。

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

`baseState` 只接受 immutable `commit/<id>`，不能传 Branch / Tag；`branch` 使用 Lithograph Branch name validation。Patch 中已有 Object target 直接使用 canonical Object Ref；新增 Object target 固定为 `new:<kind>:<alias-component>`，其中 `<kind>` 使用上述 ObjectKind，alias component 使用与 Object Ref 相同的 RFC 3986 component encoding。alias 只在本请求内存在。成功无 effective delta 时 `state == baseState` 且不创建 Commit。

`new:<kind>:<alias-component>` **不是 Git、YAML 或其它外部标准定义的协议，也不是 KG OS Object Ref 的新一种永久类型**。它是 KG OS 在标准 Git pathname slot 上定义的最小 application-level target / reference convention，只解决 Git Extended Diff 与 YAML 本身没有定义的一个问题：同一个多 Object Patch 中，尚未获得最终 owner-backed Ref 的新增 Object 必须能被其它新增 Object 无歧义引用。KG OS 只自定义这一层 Object target mapping；Patch framing / hunk / rename / pathname quoting 继续使用 Git，Object body 使用 YAML 1.2，alias component escaping 使用 RFC 3986，不再为这些已有标准覆盖的部分另造语法。

所有新增 Object 的 Patch target 都统一使用 `new:<kind>:<alias-component>`，即使某个 name-backed Object 的最终 Ref 可以从目标内容推导，也不允许在 Add entry 中直接把“未来 Ref”当作已存在 Object Ref。这样 Add 的定位规则不因 Object kind 改变，也不会出现一部分新增对象按 alias、另一部分靠预测最终 Ref 的双重创建模型。`<kind>` 显式存在是为了在解析 Object body 之前就确定目标 owner / Object schema，并让同名 alias 在不同 kind 下保持可区分；KG OS 不从 YAML 字段组合猜 Object kind。

`author/message` 直接映射到本次 Object Patch 的 Lithograph `tx_begin` transaction metadata，并最终成为**实际新建 Commit**的 immutable metadata；KG OS 不解释其业务语义。Object Patch 无 effective delta 时不调用 `tx_begin`、没有新 Commit，因此即使 request 带 `author/message` 也不为保存 metadata 单独创建 State；需要显式 empty-delta State 时使用 `state.create`。

同一个 `new:<kind>:<alias-component>` 也用于 patched YAML 中所有“本应填写 Object Ref、但引用本请求新对象”的位置；例如新 Relationship 的 `start/end` 可以引用 `new:knowledge-node:alice`，Domain `includes` 可以引用新 Definition alias。alias decode 后必须是 1..255 UTF-8 bytes，禁止 NUL 与 ASCII control characters；同一 Patch 内 `(kind, alias)` 唯一。alias 永不出现在成功后的 canonical Object Value，执行成功后必须通过 `created` 返回最终 Ref。

`created.alias` 返回 decode 后的逻辑 alias String，不返回 percent-encoded target component；`created` 按 `kind` + alias UTF-8 bytes 升序，`transitions` 按 `from` Object Ref UTF-8 bytes 升序。Patch entry 原始文本顺序不影响 result ordering。

因此 `n:123` / `r:456` 等系统分配 identity 不会因为 AI 修改 YAML 而被重新赋值。Definition / Domain / Property 的 identifying name 属于业务结构本身，可以出现在 canonical YAML / JSON Object Value 中；修改这些名称表示 rename，并按 Ref transition 语义处理。

Object Value / canonical YAML 遵守 **owner-only projection**：只包含当前 Object 自己拥有的可编辑状态，以及指向其它 Object 的 Ref；不能为了“更易理解”把其它独立 Object 的可变内容复制进当前 representation。例如 Knowledge Node 可以包含自己的 Labels / Properties，但不能内联这些 Label 对应 Definition 的 `title` / `description`；Relationship 可以保存 endpoint Ref，但不能内联 endpoint Node 内容；Domain 保存 `includes` Ref，不复制成员 Definition。需要额外语义时由 AI 继续 `read` 对应 Ref。唯一明确的重叠投影是 Definition → Property parent/child 关系，并受 D21 overlap rule 约束。

同一原则适用于 Lithograph Schema aggregation：Current Graph Type Object 只投影不能由 child Definition / Property / Constraint / Index Object 独立拥有的 graph-level state；如果为了理解需要展示其 element definitions，只返回 child Object Ref / summary，不复制可编辑 Definition 内容，也不允许通过 Graph Type Patch 间接 add/update/delete Definition。Definition lifecycle 继续由 Definition Object 管理；KG OS compiler 在需要调用 whole-Graph-Type 底层操作时从同一 target Object set 重新合成完整 Lithograph Schema，而不是把底层整体结构原样暴露成第二个公共 mutation target。

Constraint ownership 同样按 Lithograph 真实 Schema model 切分：属于 Graph Type / element definition 本身的 property type、key、existence / `NOT NULL` 等内生结构继续由 Definition / Property Object 表达；Lithograph 明确建模为 **standalone constraint definition** 的资源只由 Constraint Object 拥有。Definition 为理解需要展示相关 standalone Constraint / Index 时只能返回 Ref / summary，不能复制成第二份可编辑定义。Index definition 统一由 Index Object 拥有。

Owner-only 不禁止**引用目标自身 rename 引起的派生 Ref rewrite**。如果 Constraint / Index / Domain 等 Object 保存了对 `node:Person` 或某 Property 的逻辑引用，而该被引用 Object 在同一 Patch 中 rename，KG OS 可以自动把这些 locator 重写为目标 Snapshot 的新 Ref，以保持原有引用关系；这类 rewrite 只能改变 locator，不得顺带修改 Constraint / Index 的其它配置或 Domain membership 语义。调用方若在同一 Patch 中还显式修改该 Constraint / Index，其显式变化与派生 locator rewrite 必须在 logical-slot normalization 后不冲突，否则整体 reject。

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
- KG OS 采用的是成熟 Git patch **文本语法**，不是 Git filesystem / index / blob 模型。Patch parser/application 必须把 file target 映射到 Object Ref，或新增对象的 alias + object kind，再按本文 strict base-State、exact apply、owner-only、overlap、dependency、derived migration 与 all-or-nothing 规则执行；不得直接把 `git apply` 的文件系统行为当成 KG OS mutation semantics。

这五类描述的是统一 Patch 能表达的**变化类别**，不是给所有 Object kind 强行增加相同生命周期。每个 Object 的合法 target change 仍由其真实 owner contract 决定：例如系统分配 Knowledge element identity 不能 rename；current Graph Type 的存在 / 生命周期服从 Lithograph Graph Type 语义；Constraint / Index 是否支持原生 rename 或只能 drop + create 以 Lithograph 公开 Cypher contract 为准。KG OS 可以为已明确设计的 Definition / Property / Domain rename 提供上层语义，但不能仅因为 Patch 有 `Rename` 类别就给其它底层资源发明新数据库语义。

对于公共 Ref 由自身 identifying name 决定的顶层 Object（当前包括 Domain、Definition、独立寻址的 Property Object，以及未来 owner contract 明确支持 rename 的其它 name-backed Object），**修改自身 identifying name 必须使用 Git Rename entry**；普通 Update / Restructure entry 不能只在 YAML 中把顶层 `name` 改成另一个值。Rename header 的 `<old-target> → <new-target>` 是该顶层 rename 的显式 locator delta；如果同一个 entry 的 YAML hunk 也修改 `name`，其目标必须与 `<new-target>` 解码出的 identifying name 完全一致，否则返回 `OBJECT_CONFLICT`。如果 YAML hunk 没有触碰 `name`，compiler 以 Rename header 派生目标 Object Value 的新 identifying name。Definition 内嵌 child Property 的 rename 仍是该 Definition entry 内的 child logical-slot change，不要求把 parent file entry 本身 rename。

一个 Object Patch 可以同时包含一个或多个 Git patch file entry。已有对象的 entry 通过 old/current target 解码出的 canonical Object Ref 定位；新增对象尚无最终 Object Ref，使用已经冻结的 `new:<kind>:<alias-component>` 定位该 entry。不得再创建 KG OS 自有 Patch section header、escaping grammar，也不得在后续 adapter 设计中替换成另一套 JSON mutation language。

Object projection 允许为读取便利包含 child Object 内容，但一个 Patch 内的 target change 必须可归一化为**不重叠的底层 logical slots**。例如 Definition entry 可以直接修改 `Person.email`，Property entry 也可以单独修改同一个 Property；二者不能在同一 Patch 同时触碰该 Property。KG OS 在执行顺序之前先检测这种 overlap，存在重叠即整体拒绝，避免同一个目标因 entry 顺序产生不同结果。

因为 Object Patch 严格基于 `baseState`，**Patch 中对任何已经存在 Object 的引用都按 baseState Object Ref 解析**。如果同一 Patch 把 `node:Person` rename 为新的 Ref，其他 entry 要继续引用“同一个 Definition”时仍使用 base Ref `node:Person`；KG OS 通过本次 rename continuity 把该逻辑引用带到目标 Snapshot。调用方不能依赖尚未产生的 target Ref 在同一 Patch 中重新定位该已有对象。只有本次新建、在 baseState 中不存在的 Object 使用 request-local alias。成功后新的 Ref 只通过 alias mapping / Ref transition 返回。这样多 Object Patch 的引用解析完全由 `baseState + Ref | alias` 决定，不依赖 entry 顺序或对未来 Ref 的猜测。

Object Patch 以调用方实际读取的 immutable `baseState` 为 patch base、以明确 Branch 为 write target。**v1 使用 strict base-State 语义：mutation 开始时 target Branch 的当前 head 必须仍等于 `baseState`；如果 Branch 已前进，则整个 Patch 以 `STALE_BASE_STATE` 失败，不把基于旧文本生成的 Patch 自动套用到新 State，也不自动 rebase / merge。** 对存在有效 target delta 的 Patch，这个并发基线由 Lithograph `tx_begin(expectedHead=baseState)` 在取得 single-writer ownership 后原子检查；成功 begin 后其它 writer 不能在本 transaction 生命周期内移动该 Branch。无 effective delta 的 Patch 不开启 transaction，但仍必须先读取并比较 target Branch head，stale 时同样返回 `STALE_BASE_STATE`。

在 base State 校验通过后，KG OS 重新生成对应 Object canonical YAML，精确应用 textual Patch 得到目标 YAML，使用标准 YAML parser 解析为 target Object Value / target Object set，再执行 Object schema / type、Ontology / Knowledge dependency、Schema、Graph View 与其它公开规则校验，最后编排 Lithograph。请求默认 all-or-nothing；任一变化失败都不能留下部分 durable 结果。

对于 Update / Rename / Restructure，KG OS 不把“应用 Patch 后得到的一整份 YAML”当成 `PUT` 语义，而是比较 base Object Value 与 patched YAML 解析得到的 Object Value，只把调用方**显式改变的 logical slots**作为 target delta；Rename entry 的 old/new target 额外贡献该 Object identifying locator 的显式 rename delta。未被 textual Patch 改动的字段只是 context，不会阻止同一请求为了 rename、referential integrity 或 consistency 产生必要的 derived migration。例如 Relationship Definition rename 与某条 Relationship 的 Property update 可以同时存在：该 Relationship entry 没有编辑的旧 type 字段不会覆盖 mandatory type migration。反过来，如果调用方显式修改的 slot 与 mandatory derived change 要写同一 slot 且目标不同，则整个 Object Patch 冲突失败，不按 entry 顺序覆盖。

Textual Patch application 使用**精确 base**，不使用普通文件工具可能提供的 fuzzy hunk matching、自动 offset 猜测或“尽量应用”。Update / Delete / Rename entry 的 Object Ref 必须在 `baseState` 中存在，不存在返回 `OBJECT_NOT_FOUND`；Add 不具有 upsert 语义，planned target 中若最终形成重复 Object Ref / identifying name 则返回 `OBJECT_CONFLICT`。删除一个在 base State 中不存在的 Object 也不是成功 no-op。调用方要修改已有对象必须显式使用其原 Ref，要创建对象必须显式 Add。

KG OS 在编译前计算 Object Patch 的**有效 target delta**。如果所有 entry 归一化后都没有改变 Ontology / Knowledge Snapshot，则 Object Patch 不调用底层 mutation、不创建新的 State，并返回 `baseState` 作为最终 State；需要“Snapshot 内容不变但显式产生一个新业务 State”时只能使用 Evolution `state.create`。Graph `execute` 仍遵守 Lithograph writable Cypher 自己的 Commit 语义，不由这条 Object Patch 规则改写。

Patch 表达的是**目标 Object 要变成什么**，不是要求底层必须原地修改。调用方不能直接给系统分配的 identity 重新赋值，例如不能把 `n:123` 改写成 `n:999`；但 Label、Property、Relationship Type、Relationship endpoint、Definition identifying name、Domain organization 等业务结构都可以成为目标变化。若 Lithograph 可以保持底层 identity，成功结果继续返回原 Ref；若某项变化只能通过 replacement / migration 实现，例如当前 Lithograph 合同下 Relationship Type / endpoint 变化需要删除旧 Relationship 并创建新 Relationship，KG OS 可以这样编排，并在本次结果中返回旧 Ref → 新 Ref transition。这个 transition 是 mutation result，不创建持久的第二套 Knowledge identity / alias。

Knowledge Object 删除同样遵守“无隐式数据损失”：删除 Relationship 只删除该 Relationship；删除仍有 incident Relationship 的 Node 时，Object Patch 必须 reject，除非同一个 Patch 已显式删除或重构这些 Relationship。Object Patch 不把 `Delete n:<id>` 静默解释为 `DETACH DELETE`。如果调用方确实需要条件级 / 集合级 detach 行为，可以通过 Graph `execute` 明确写出 Lithograph / Cypher 对应 mutation。

新增 Object 在执行前可能还没有最终 owner-backed Object Ref。一个 Patch 内可以使用 request-local temporary alias 串联本次新建对象；在同一 Patch 中，任何本应填写 Object Ref 的目标位置都可以引用此前或同时声明的新 Object alias，例如新 Relationship 的 endpoint 可以引用本次新建 Node。alias resolution 必须基于整个 Patch 的声明图完成，不能依赖 entry 文本顺序；不存在、重复 `(kind, alias)` 或形成无法解析的 alias reference 时整个 Patch 失败。alias 只存在于请求内部，成功后必须映射到 Lithograph / Schema / Domain 实际产生的 Object Ref，不成为第二套持久身份。

KG OS 的 Object Patch 不是 raw Lithograph Structural Patch。非 no-op Object Patch 统一编译为一个 Lithograph explicit transaction：`tx_begin(targetBranch, expectedHead=baseState)` → 标准 Cypher 25 graph / Schema / Constraint / Index mutation → `tx_commit`。所有 mutation 都只形成 transaction-local staged state，成功时恰好产生一个最终 Commit；Definition / Property create、rename / restructure、Binding mutation 与必要 Knowledge migration 因此可以共享同一 State boundary，不再需要允许任何 missing / dangling Binding intermediate Commit。request-local alias 在 transaction 内随着 Cypher create result 解析到正式 Ref，成功响应再返回 `created` mapping / direct Ref transition。

KG OS 不使用 Lithograph Structural Patch 解决普通 Object mutation，不使用 caller-owned SQLite transaction 合并 Commit，也不建立自己的 hidden transaction / version layer。Structural Patch 仍属于 Lithograph 的版本 delta/replay 能力；KG OS 只在 Evolution diff/merge 等底层版本操作确实需要时通过 Lithograph 已有 Version capability 消费其结果，而不把 raw Patch 暴露为 Object wire。

Object `list` / `search` / `read` 使用统一 State reference semantics。Branch / Tag 在读取开始时解析并 pin 到 immutable State，并返回 resolved State identity。Object `patch` 不接受模糊的“当前最新版本”作为文本 base：调用方必须提供明确 immutable `baseState` 与目标 Branch。成功写入返回本文 `patch` response 中的最终 State、`created` 与 `transitions`。对调用方**直接寻址并修改**后发生 identity replacement / rename 的 Object，结果必须返回旧 Ref → 新 Ref transition。Definition-level Relationship Type rename 可能派生出大量 Relationship replacement；这类 derived replacement 不承诺永久的一对一 Ref transition mapping，旧 Relationship Ref 在新 State 中失效，调用方通过 Graph 在新 State 中重新发现 Relationship，新旧集合变化通过 Evolution diff/history 审计。

### Object 能力边界

- 不建立虚拟文件系统或把“目录路径”作为第二套 Object identity；稳定文本与 Git Extended Diff Patch 只是 AI 交互方式；
- 不建立与 `patch` 平行的 `save` / `create` / `update` / `replace` / `upsert` 核心写入面；新增、局部更新、删除、rename 与 restructure 都归一到 Object Patch，避免第二套 full-object replace / upsert / batch / concurrency 语义；
- 不建立 Definition / Domain / Property / Node / Relationship 各自完整 CRUD surface；
- 不为 Graph Type / Constraint / Index 再建立平行 Schema API；它们作为 Lithograph-owned Schema Object projection 进入同一个 Object surface，且不获得 KG OS semantic Binding Record，除非未来出现真实业务语义需求再单独设计；
- Object 统一的是 **State Snapshot 内 Ontology / Knowledge 对象**的定位与维护；State Data、Branch、Tag、Merge 等版本 sidecar / ref 不是 Snapshot Object，由 Evolution 负责，不为它们再套一层 Object identity；
- 不暴露 `OntologyElement`、Binding Record、Schema Locator、reserved internal graph element / Schema resource 等实现资源；
- 不允许通过 Object 能力绕过 Knowledge / internal semantic graph 的 `graphView` 隔离；
- 不把 Object `search` 扩展成 Graph traversal、全文、向量、聚合和复杂过滤语言；这些能力继续属于 Graph / Lithograph；
- 不把 Lithograph raw Patch 直接提升为 KG OS Object wire contract，公共 Patch 始终使用业务 Object / Object Ref 表达。
