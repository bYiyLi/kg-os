# Ontology 与 Definition

本文件是 KG OS **Ontology 逻辑模型、渐进式读取、Domain / Definition 编辑聚合、约束与索引的公共表达、semantic graph 与 Binding** 的唯一设计真源。共享身份、YAML 序列化和 Patch 协议由 [Object](object.md) 负责；命令与输出由 [CLI](cli.md) 负责。

## 使用模型

KG OS 负责把定义一个模型所需的结构、说明、约束和索引组合起来。AI 不需要按 Lithograph 的 Graph Type、Property、standalone Constraint、Index 逐个读取和编辑资源。

```text
看全局 → Ontology Overview
按需展开 → Domain（可选）→ Node / Relationship Definition
修改模型 → 读取该聚合的 canonical YAML → 提交局部 Patch
查询 / 修改知识 → Graph Cypher
查看演进 → Evolution
```

Ontology 的公共编辑入口只有 **Domain、Node Definition、Relationship Definition**。Property、Constraint、Index 是 Definition 的组成内容，不再是要求 AI 独立操作的顶层 Object。一个 Definition 的 Patch 可以产生多项底层 Schema / Index / semantic graph 变化，拆分与排序由 KG OS 完成。

不建立虚拟文件系统、磁盘、文件路径身份、全库可编辑 Markdown 或 Ontology Search。Markdown 只用于阅读；Knowledge 继续是 Property Graph，不包装成文档。统一 Patch 沿用 [Object Patch](object.md#object-公共调用合同)。`kg ontology patch` 是限定 Ontology target 的专用入口，内部仍调用同一 Patch contract / compiler；不增加平行的 create/update/save、各子资源 CRUD、第二套并发规则或第二套 transaction 语义。

### 渐进式读取

每次读取都 pin 一个 immutable State；同一次展开的摘要、Schema、索引与语义来自同一 State。调用方可以从全局进入 Domain，也可以用已知 Definition Ref 直接读取，不强制走满层级。

读取支持 **batch refs**。调用方可以一次给出多个 Domain / Node Definition / Relationship Definition Ref；KG OS 只解析一次 `at`，把全部目标固定到同一个 resolved State，再按调用方给出的 Ref 顺序返回。v1 一次接受 `1..100` 个 Ref，重复 Ref 返回 `INVALID_ARGUMENT`。任一 Ref 非法、不存在、不可解释或整个 batch 超过响应资源限制时，整次 read 失败，不返回一部分成功结果，避免 AI 把残缺模型当成完整上下文。

| 范围 | 返回什么 | 不返回什么 |
| --- | --- | --- |
| 全局 Overview | Domain 的名称、说明、准确 Ref，以及未归入 Domain 的 Definition 摘要；无 Domain 时直接列 Definition 摘要 | 全部 Property / Index 细节、完整可编辑模型 |
| Domain | 自身说明、直接包含的 Domain / Definition 摘要、关系的方向与端点、下一步准确 Ref | 递归展开所有成员的完整定义 |
| Definition | 完整业务说明、真实 Label / Type、Property 类型与说明、关系结构、相关约束和真实索引名称 / target / 配置 | 需要 AI 再去拼装的底层 Schema resource 清单 |

摘要不是单词清单。每项包含 `kind/ref/name/title?/description?`；Relationship 摘要还包含 `from/to`。语义摘要使用调用方保存的说明，不由 Kernel 调用模型生成。说明缺失时明确标注“未提供说明”，不捏造业务含义。本次不把既有 optional description 改为数据库必填字段；调用方应提供足以区分用途与边界的说明。

Domain 仍然允许多父级和循环。全局枚举所有 Domain 摘要，而不是只选没有父级的 Domain，避免整个循环子图不可发现；未归类 Definition 单独可达。每次 Domain 只展开直接成员，递归图预览使用 visited-set、去重和有界遍历。所有 Definition 必须能由全局入口沿准确 Ref 到达；Definition 详情中的相关关系要带真实端点和引用，跨 Domain 关系不被当前阅读范围隐藏。

结果过大时按确定顺序分页，携带总项数和 continuation，不能静默截断后声称“完整全局”。每页仍保留当前范围及其说明。没有 Domain 也不强迫创建 Domain，不凭空自动分类；分页只是传输边界，不是按词猜测的搜索。大型扁平模型的语义组织由调用方改善。

目录、可选 Mermaid 预览和关联摘要只读、按状态派生。图预览标明全局还是当前页/范围，不重复输出巨大图，也不能把 Domain membership 画成知识实例关系。Definition 默认阅读需显示真实查询所需的索引名称、覆盖范围与类型，不能仅显示 `searchable: true`。

### Ontology read 合同

```text
OntologyRef = node:<name> | relationship:<name> | domain:<name>
OntologySummary = { kind, ref, name, title?, description?, from?, to? }
OntologyReadItem = {
  ref?,
  kind: overview | domain | node-definition | relationship-definition,
  title?, description?,
  items: OntologySummary[],
  total,
  cursor?,
  markdown
}

read({ at: StateRef, refs?: OntologyRef[], limit?, cursor? })
→ { state: ResolvedState, results: OntologyReadItem[] }
```

`refs` 缺省或为空时读取全局 Overview，并返回一个 `results` item；给出 Ref 时数量为 `1..100`，结果数量和顺序与请求一致。Domain `items` 是直接成员；Definition `items=[]`、`total=0`、`cursor=null`，详情在 `markdown`，不把它的 Property 伪装成导航 Object。Definition 请求不接受分页语义；完整详情超出资源限制时明确返回 `RESOURCE_ERROR`，不能截断。

Overview / Domain 的 `limit` 默认 100，接受 1..1000；`limit` 在 batch 中独立作用于每个 Domain result。每个 Domain item 可以返回自己的 continuation cursor；`cursor` 输入只允许 Overview 或**单个 Domain Ref**，因为一个 opaque cursor 只绑定一个 resolved State + scope。继续读取某个 batch item 的下一页时，调用方使用 batch 返回的 resolved State、该 Domain Ref 和该 item 的 cursor 单独继续，不因 Branch 前进而混页。Domain 内部 items 按 `kind/ref` UTF-8 bytes 排序；batch 外层保持调用方 Ref 顺序。此能力没有 `query` 或搜索字段。

编辑读取复用 Object `read(at, ref)` 的同一聚合值和 canonical YAML；`--edit` 只是 CLI 输出选择，不创建编辑 session 或第二套写入能力。v1 `--edit` 与普通 read 一样接受 `1..100` 个明确 Ref，并固定到同一个 immutable State。单 Ref 输出仍是该 Object 的纯 canonical YAML；多 Ref 输出使用标准 YAML 1.2 multi-document stream，每个 document body 与该对象单独 `--edit` 时的 canonical YAML **逐字一致**。Stream 的 `state/ref` framing 只用于把 document 与请求目标对应，不进入 Object Value，也不作为 Patch hunk 的内容。Overview 不是 Object，也不可编辑。

### 全局与领域的阅读示例

下面使用后文 Content/Person/Document/AUTHORED 的同一示例。State 的重复 `1` 只是合法格式的示意值，实际调用使用服务器返回的 Commit；metadata 全部只读。

`kg ontology --at branch/main`：

```markdown
---
state: "commit/1111111111111111111111111111111111111111111111111111111111111111"
kind: "overview"
ref: null
total: 1
cursor: null
---
# Ontology

- **Content（内容）** — 组织人物、文档及作者关系；用于内容管理和检索。
  继续读取：`domain:Content`
```

读取 `domain:Content`：

```markdown
---
state: "commit/1111111111111111111111111111111111111111111111111111111111111111"
kind: "domain"
ref: "domain:Content"
total: 3
cursor: null
---
# Content · 内容

组织人物、文档及作者关系；用于内容管理和检索。

- **Document（文档）** — 保存文章与教学资料；支持正文全文检索和托管语义检索。`node:Document`
- **Person（人物）** — 现实世界中的自然人，可作为文档作者。`node:Person`
- **AUTHORED（创作）** — `Person → Document`，某人创作某篇文档；不隐含一篇文档只有一位作者。`relationship:AUTHORED`
```

没有 Domain 时，第一层直接给出这些 Definition 摘要，不强行创建 Content。取得 `node:Document` 后可直接进入其详情或 `--edit`，不必用额外 search 找属性或索引。Node Person 的说明为“现实世界中的自然人，可作为文档作者。”；阅读摘要来自该 Definition，不是 Kernel 推理。

需要同时理解多个模型时可一次读取：

```text
kg ontology node:Person node:Document relationship:AUTHORED \
  --at commit/1111111111111111111111111111111111111111111111111111111111111111
```

三份详情来自同一 State，并按 `Person → Document → AUTHORED` 的请求顺序组织到一个只读 Markdown 输出中；SDK / Web 直接使用同一个 logical `results[]`，不需要解析 CLI Markdown。

需要同时修改这三个模型时，可以对同一个 resolved State 一次取得编辑基线：

```text
kg ontology node:Person node:Document relationship:AUTHORED \
  --at commit/1111111111111111111111111111111111111111111111111111111111111111 \
  --edit
```

stdout 是标准 YAML multi-document stream：

```yaml
# kgos-state: commit/1111111111111111111111111111111111111111111111111111111111111111
--- # kgos-ref: node:Person
name: "Person"
title: "人物"
description: "现实世界中的自然人，可作为文档作者。"
properties:
  - name: "name"
    description: "人物姓名。"
    type: "STRING"
constraints: []
--- # kgos-ref: node:Document
name: "Document"
title: "文档"
description: "保存文章与教学资料；支持正文全文检索和正文语义检索。"
properties:
  - name: "content"
    description: "文档正文。"
    type: "STRING"
    indexes:
      - name: "document_content"
        type: "fulltext"
      - name: "document_semantic"
        type: "vector"
  - name: "id"
    description: "文档业务编号，不是数据库 element identity。"
    type: "STRING"
    required: true
    unique: true
  - name: "title"
    description: "文档标题。"
    type: "STRING"
    required: true
constraints: []
--- # kgos-ref: relationship:AUTHORED
name: "AUTHORED"
title: "创作"
description: "某人创作某篇文档；不隐含一篇文档只有一位作者。"
from: "node:Person"
to: "node:Document"
properties:
  - name: "since"
    description: "开始创作的日期。"
    type: "DATE"
constraints: []
```

`# kgos-state:` 与每个 `--- # kgos-ref:` 都是 CLI stream framing comment；标准 YAML parser 可以忽略它们。三个 document 的映射内容仍分别是三个 Object 的 canonical editable representation。调用方生成 Git Extended Diff 时以对应 document body 为 base，而不是把 framing comment 写进 `node:Person`、`node:Document` 或 `relationship:AUTHORED` 的 hunk。

## Ontology

Ontology 是知识库对“世界如何建模、模型是什么意思、模型如何组织”的完整逻辑定义。公共逻辑模型与持久化职责分开：

```text
KG OS public Ontology aggregates
    ↓ compile / decode
Structure  → Lithograph versioned Schema
Semantics  → KG OS metadata graph in the same Lithograph State
```

### Structure：Lithograph 是唯一结构真源

“唯一结构真源”指不再持久化第二份可独立漂移的 Schema，也不重建数据库约束引擎；**不意味着公共编辑格式必须复制 Lithograph resource / AST / ownership**。

KG OS 可以且应当提供 `type / required / unique / from / to / constraints / indexes` 这样的直接表达，并负责把它们编译为 Lithograph 的公开能力。读取反向组合当前 Schema 与 metadata，不保存整份 Definition YAML / JSON。数据库的类型、约束、查询和版本执行仍由 Lithograph 负责。

KG OS 不为方便实现把底层缺少原地 ALTER/rename 的问题转交给 AI。只要可通过公开操作安全完成目标，就由 compiler 编排必要的替换、引用维护与数据改写。不能实现合法目标时返回具体能力或数据冲突，不降级为“请逐个编辑底层资源”，也不静默丢弃字段。

KG OS-owned reserved internal Schema 不属于调用方 Ontology，读取不显示，输入不能指向它们。KG OS 不要求修改 Lithograph 方言、不访问内部表，不重建 Graph/Search/Version Engine。v1 不自动接管任意已有 Lithograph database；bootstrap 边界见 [架构](architecture.md#knowledge-base-bootstrap)。

## Definition

Definition 是 **AI 的读取与 mutation aggregate**，不是持久化 Schema 副本。Node / Relationship 都聚合自身说明、Property、Constraint 与 Index；Domain 只组织 Definition，不拥有这些结构。

### 公共可编辑格式

格式采用标准 YAML 1.2；下列字段是 KG OS 逻辑合同，不声称属于 YAML 标准或 Lithograph 原始序列化。`kind/ref/state` 放在响应 metadata，不是可编辑 body。规范字段顺序如下；`?` 表示可省略：

```text
Domain:
  name, title?, description?, includes[]
Node Definition:
  name, title?, description?, labels?, properties[], constraints[], indexes?
Relationship Definition:
  name, title?, description?, from, to, properties[], constraints[], indexes?
Property:
  name, title?, description?, type, required?, unique?, constraints?, indexes?
Constraint:
  name?, type, properties?
Index:
  name, type, targets?, properties?
```

- `name` 是当前定位名称；Domain name 在 State 内唯一；Node / Relationship 分别在各自类型内唯一。`node:Person` 与 `relationship:Person` 可以同时存在，因此 Ref 必须带 kind 前缀，不能只把单词当永久身份。
- Node 的 `name` 是 identifying Label；`labels` 为附加必须具有的 Label 集合，缺省为空，不重复 `name`。不隐式创建继承、领域隔离或额外 Node identity。普通 Knowledge Node 仍可有多个 Label。修改 Definition 的 `labels` 是模型约束变化，**不自动给已有 Knowledge Node 添加或移除业务 Label**；已有覆盖 Node 若不满足目标 Graph Type，Ontology-scoped Patch 整体失败。未来通用 Object Patch 可以在同一原子请求中显式改 Knowledge Node 后再完成模型变化。
- Relationship 的 `name` 是 identifying Relationship Type。`from/to` 为 Node Definition Ref，或 `null` 表示这一端不限制类型。具名端点表示该类型关系的对应节点必须符合该 Node Definition；Node 定义必须存在。它不是 Node 实例 Ref，也不表示关系数量限制。
- v1 常规关系按 Relationship Type 识别，`from/to` 约束端点，不把端点作为隐藏的另一套匹配范围。底层 compiler 选择实现该语义的 Graph Type pattern。关系端点变化是模型约束变化，不能自行把现有边迁往另一节点。
- `properties` 是必填、非空的完整 Property 声明列表，按 name 唯一。**Node / Relationship Definition 都必须至少声明一个字段**；创建无字段类型，或修改后让仍存在的类型没有字段，在编译前返回 `INVALID_ARGUMENT`。附加 Label、关系端点或索引不能代替字段声明，KG OS 不自动添加占位字段。
- Property 的 `type` 使用 Lithograph 冻结 profile 的 Cypher 属性类型表达式，canonical 例子为 `STRING`、`INTEGER`、`DATE`、`ZONED DATETIME`、`LIST<STRING NOT NULL>`。KG OS v1 **不接受 caller-owned `VECTOR<...>` Property type**，也不接受通过 list/compound type 把 Vector 带回调用方 Property；公共 standalone `type` Constraint 整体不属于 v1 profile。Vector 只作为 Lithograph Managed Semantic 的非图属性派生数据使用。这个收窄不改变 Lithograph 自身对 Vector 的支持。
- `required: true` 要求 Property 存在且不为 null；`unique: true` 要求该 Definition 覆盖的元素中此单字段值唯一。二者独立，unique 不自动变为 required，更不是 element identity 或关系 cardinality。缺省或 false 表示未声明该规则；canonical 省略 false。
- `type` 最外层存在性只由 `required` 表达；输入最外层 `NOT NULL` 归一到 required，若显式 `required:false` 与之冲突则拒绝。List 元素的 `NOT NULL` 保留在 type 中，不能误当整个字段必填。
- 顶层 `properties` 必须输出且非空；`constraints` 与 Domain `includes` 即使为空也输出。Definition 顶层 `indexes` 为可选集合：缺省与 `[]` 都表示没有顶层索引，canonical YAML / JSON 为空时省略；非空时输出完整声明。Property 内的 `indexes` 及其它 optional collection 同样为空时省略。未知字段报错，不忽略。title/description 保持 optional，不把自然语言中的“必须”“唯一”等字样解释成 Schema 规则。

`labels`、Domain `includes` 与 Index `targets` 是 **set-like collection**：输入不得出现重复 logical name / typed Ref，canonical 输出按 UTF-8 bytes 升序；重复项是非法 Object Value，而不是“自动去重后继续”。`properties`、复合 Constraint 的 property list 与 Index `properties` 则保持其各自已定义的 name uniqueness / 有序语义，不能因为 renderer 会排序其它集合而重排复合字段。

至少一个字段的要求属于 Ontology / Object 的 Definition profile，也参与高层 State 一致性检查；公共 Graph 仍原样执行 Lithograph Cypher，不增加该检查。模型有字段声明不等于每个 Knowledge 实例都必须填写该字段；实例的必填规则由 `required` 或覆盖该字段的 `key` Constraint 决定。

此模型直接表达当前需要的节点、关系、约束和检索能力，不是“完整 Lithograph Schema 管理工具”。Graph Type 命令组织、lookup 等数据库管理资源不因此升级为 Ontology 顶层对象。对于超出当前可表达 profile 的 Schema，不能以不完整 YAML 假装可无损编辑；必须明确诊断。以后补充真实需要的结构时扩充对应聚合字段，不恢复 raw `structure` 或大量独立 API。

### Property、Constraint 与 Index 的组织

只作用于当前 Definition 单个 Property 的额外约束 / 索引放在该 Property 下；同一 Definition 的多字段规则放在 Definition 下。Property 内不再重复 `properties: [自身名称]`。涉及多个 Definition 的共享 Full-text / Managed Semantic Index 放在参与 Definition 的顶层，并显示**完整 targets 与 properties**；底层 hidden versioned config 必须由 decoder/compiler 保留，但不进入公共 YAML。

顶层 `indexes` 可省略不等于取消多字段或共享索引。复合 Range、多字段 Full-text，以及当前底层能够表达的跨 Definition Full-text / Managed Semantic 共享索引仍在顶层表达；不能拆成多个单字段索引后声称等价。输入空数组归一成省略只影响表示，不产生 Schema delta；从非空顶层集合删除声明仍按正常索引删除 / 共享资源规则处理。

存在性与属性类型只通过 Property 的 `required` / `type` 表达；`constraints` v1 只接受 `unique | key`，两者都可以显式命名或省略名称。`key` 表示字段组合必填且联合唯一。顶层 Constraint 的 `properties` 必填非空，Property 内由所在字段确定目标。联合唯一不是每个字段分别唯一，索引也不能拆成多个单字段后声称等价。

KG OS v1 不接受公共 `not_null` / `type` Constraint，也不为它们保存一份只用于名称的 metadata：Lithograph v0.3.0 对 identifying Graph Type Label / Relationship Type 的存在性与类型规则属于 Graph Type dependent Constraint，独立 `not_null/type` Constraint会被数据库拒绝，而 dependent Constraint 的数据库生成名称不是调用方可指定的稳定名称。允许公共 named `not_null/type` 会迫使 KG OS 建立第二份 Schema 名称真源，违反当前 persistence 边界。因此调用方使用 `required` 和 Property `type`；输入 standalone `not_null/type` 返回 `UNSUPPORTED_OPERATION`。

同一个约束不能同时由 Boolean 与一个同义的内嵌声明重复编辑；发现相同覆盖范围与同一规则重复表达时拒绝并指出位置。多字段 KEY 的存在性效果不反写成每个 Property 的独立 required 声明。默认阅读可说明有效规则，editable body 保留真实声明来源，不把“推导结果”变成另一份规则。

Constraint 名称可省略，由 KG OS 创建时确定；explicit named Constraint 读取时保留真实名称。匿名 standalone Constraint 所需名称使用 `kgos_c_` 加其 canonical `{kind, targetRefs, type, properties}` UTF-8 JSON 的 SHA-256 hex（kind 为 node/relationship，targetRefs 按 UTF-8 bytes 排序，properties 保序，键按上述顺序，JSON 无空白、直接 UTF-8 且不转义非 ASCII），创建后读回真实名称；若该名称已被不同资源占用则报冲突，不覆盖。创建后已存在的资源名称不因字段或 Definition 改名而重新计算。简单 required/unique 的底层内生资源名称不成为 AI 必须管理的对象。来源归并与派生 backing index 的区别由 compiler 从当前公开 Schema 读取，不能丢弃原有显式约束名称。

Index 的 `name` 必填，是之后查询真实使用的名称，不是显示别名。`type` 为 `range | text | point | fulltext | vector`；名字冲突按底层同一 Schema 的规则检测，不能以 Domain 当 namespace。`range/text/point` 表示对调用方业务 Property 的直接数据库索引：Range 接受一个或多个有序 Property，Text / Point 恰好一个 Property；它们在当前 Lithograph v0.3.0 contract 中没有 versioned Index configuration，因此 KG OS v1 **不暴露 per-index `options`**。Full-text 与 `vector` 同样不暴露 per-index 配置：前者由 daemon 当前显式 Full-text 初始化配置编译，后者由当前显式 Managed Semantic 初始化配置编译并保留目标 State 中已有的 hidden versioned config。

Lithograph 的 `UNIQUE/KEY` Constraint 自带同 target / properties 的 owning Range Index。KG OS 因此不允许再声明一个与某条有效 `unique/key`（包括 Property `unique:true`）**同 Definition、同有序 properties** 的独立 Range Index；这两个名字无法同时成为两个真实数据库资源。该组合在 transaction 前返回 `OBJECT_CONFLICT`，不能把显式 Index 静默映射成 Constraint backing Index、丢掉调用方 Index name，或在 decoder 中伪造两份资源。不同 target 或不同有序 properties 的 Range Index 不受此限制。

`targets` 只用于当前底层确实支持多 target 的 Full-text / Managed Semantic Index；省略表示当前 Definition。`range/text/point` 是 Definition-local Index，公共输入不得为它们声明跨 Definition `targets`，canonical read 也不输出这类伪共享范围。Full-text / Managed Semantic 的共享 targets 必须全部是同 kind Definition。KG OS 不为标准 Index 拆出多个底层资源后伪装成一个共享 Index。

当前公共 `Index` 也**不包含 `filterProperties`**。Lithograph v0.3.0 Managed Semantic create/query surface 尚不能把它表达为“先在结构化过滤范围内取 top-k”的索引定义；KG OS 不保留一个无法正确实现的声明字段，也不静默忽略输入。未来底层出现等价能力时再通过新的设计修订扩展公共 Index shape。

`fulltext` 只表达“这些业务 String 字段需要全文检索”，不要求 AI/调用方理解 FTS5 tokenizer、`fulltext.analyzer`、`eventually_consistent` 或 SQLite extension。Property-local `type: fulltext` 以所在 `STRING` Property 为唯一字段；Definition-level Full-text Index 使用非空 `properties`，所有 source Property 必须是目标 Definition 上可解释的 `STRING` 字段。KG OS compiler 新建或因业务定义变化重建 Lithograph Full-text Index 时，把**当前 daemon `[fulltext].analyzer` 的值**写入 IndexDefinition，并固定 `fulltext.eventually_consistent = false`；不是去修改 `config.toml`，也不是批量改写已有 IndexDefinition。Analyzer 的实际 tokenizer implementation 由 `[[sqlite.extensions]]` 在每个 SQLite connection 上提供；Ontology 不保存插件路径、下载 URL、entrypoint 或 tokenizer 参数 registry。

Full-text analyzer 是有意隐藏的运行/数据库参数，不属于公共 Ontology Value。Aggregate decoder 读取某个 State 时，可以把不同 analyzer 创建的实际 Lithograph Full-text IndexDefinition 都投影为同一个简化 `type: fulltext`；**analyzer 不同本身不是 KG OS consistency violation**。已经存在且本次业务 Patch 没有要求重建的 Full-text Index 保留其 versioned analyzer；新建或因 targets/properties 等业务定义变化必须重建时，compiler 使用当前 daemon 的 `[fulltext].analyzer`，并继续固定 `fulltext.eventually_consistent = false`。

KG OS 不在 State 中额外保存 analyzer fingerprint/generation，也不在打开已有 Knowledge Base 时比较当前 config 与历史 IndexDefinition。`[fulltext].analyzer` 在安装合同中属于初始化后禁止修改的配置；KG OS 不保存初始化副本来检测或阻止人工修改，也不批量迁移历史索引。历史索引继续使用自身 versioned analyzer；新建/重建索引使用 daemon startup 时读取到的当前配置。除 analyzer 这一有意隐藏字段外，若底层 Full-text definition 含 KG OS v1 无法安全解释的其它配置，decoder 仍不能静默伪装成等价公共定义。

### 托管语义索引

`type: vector` 保留为 KG OS 公共索引类型，底层改为 Lithograph **Managed Semantic Index**。调用方只声明 source Property 和真实索引名；KG OS 不创建 embedding Property，不调用 Embeddings HTTP API，也不维护第二份向量或 HNSW。

已确认的单字段映射：

| 公共声明 | Lithograph 映射 |
| --- | --- |
| Node 的 Property-local `type: vector` | `db.index.semantic.createNodeIndex(name, labels, sourceProperty, options)` |
| Relationship 的 Property-local `type: vector` | `db.index.semantic.createRelationshipIndex(name, types, sourceProperty, options)` |
| `targets` | 缺省当前 Definition；共享索引使用完整同 kind Definition Ref 集合，compiler 转为真实 Label / Type |
| 所在 `STRING` Property | 唯一 source Property；共享声明的 `properties` 在这条已确认路径上恰好包含该字段 |
| `name` | 实际 Semantic Index 名称，可直接用于 `db.index.semantic.queryNodes/queryRelationships` |

共享语义索引的每个 target Definition 都必须声明这个同名 `STRING` source Property。语义输入为 source 的**原始 UTF-8 字符串**，不添加字段名前缀、不拼接、不截断或切块。缺失/null source 不参与索引；已声明的类型约束仍由 Lithograph 执行。原来单字段的 `propertyName:\nvalue` framing 随 KG OS 自行生成向量的方案一起取消。

底层 Semantic create procedure 的 `options` 由 compiler 按 [Runtime 的配置映射](runtime.md#embedding-配置与索引映射)产生：新建或因业务定义变化必须重建索引时，使用当前 `[embedding]`；已有且未重建的索引保留完整 versioned provider/config/dimensions/similarity。Ontology 不增加 per-index 模型、维度或 provider 选项，也不把这些运行参数复制到 KG OS metadata。Decoder 保留它们的底层来源，不能因为公共 YAML 隐藏了配置就用当前 runtime 覆盖。不同创建配置本身不构成 KG OS consistency violation；不属于已支持映射的底层参数仍必须明确诊断。

### 语义索引的首版范围

首版已确认只支持**单字段语义索引**：一个索引使用一个 `STRING` source Property。`title + content` 等多字段拼接不在首版实现范围，不再作为开工前的待确认项。多个 Definition 可以共享同一个单字段索引；“多目标”不等于“多字段”。不支持的多字段声明应明确拒绝，不静默选第一个字段、拆成多个索引或增加隐藏拼接字段。

**结构化检索、图遍历、全文与向量检索可以通过 Cypher 组合。** KG OS 原样执行，实际语法和执行顺序由 Lithograph 决定；这一能力不需要在 KG OS 新建查询语言或解析器。

当前 Managed Semantic 的具体限制是：公共 Index 不提供 `filterProperties`；`queryNodes/queryRelationships` 的内部 `limit` 会先限制返回数量，之后的 `WHERE` 只筛选已返回结果，不能保证得到结构化过滤范围内最相似的 top-k。该限制不等于联合检索不可用。KG OS 不切回自行生成 raw Vector 的旧实现，也不把“省略内部 limit”等未采纳方案写成已支持行为；调用边界见 [Graph](graph.md#graph-公共调用合同)。

多字段 Full-text、复合 Range，以及跨 Definition Full-text / Managed Semantic 共享索引继续按各自既有规则实现。首版单字段语义范围不要求取消这些能力，也不承诺多字段语义索引的后续实现方式。

### 检索维护术语

为了避免把正常数据库写入误解成“迁移”，v1 固定使用下面的术语：

- **Index Maintenance**：普通业务写入只提交 source graph data；Full-text 物理维护由 Lithograph / FTS5 负责。Managed Semantic 按查询 Snapshot 的最终 source/target 解释结果，不要求 KG OS 在写事务中生成向量。
- **Semantic Index Create / Replace**：创建或替换 versioned 索引定义，仅做本地 Provider/config validation，不遍历数据、不调用 embedding 服务。定义变更与同次 Ontology Patch 的其它变化仍原子提交。
- **Automatic Embedding Cache**：OpenAI-compatible Provider 可以按 IndexDefinition 中的 `providerConfig.cache` 透明命中 / 填充自己的独立 SQLite cache；Lithograph / KG OS 不拥有 text→Vector cache，调用方不需要预热。连接与持久化接入按 [Runtime](runtime.md#embedding-result-cache) 验证。
- **Semantic materialization rebuild**：Lithograph 的 `db.index.semantic.rebuild(name, version)` 只重建目标 Snapshot 的 TEMP Semantic/HNSW materialization，不承担 Provider cache预热；它不创建 State、不移动 Branch，也不是创建索引、保存正文或普通查询的前置条件。KG OS 不新增预热 CLI/API；明确执行维护 Cypher 时使用 Graph `execute`。
- **Config Migration**：因为运行配置变化而主动重写旧索引或历史 State。KG OS v1 不提供自动配置迁移；Full-text / Embedding 初始化配置按安装合同禁止修改，同时 KG OS 不保存历史配置做检测或迁移。

业务索引定义的替换、Lithograph TEMP/HNSW materialization 与 Provider-owned text→Vector cache 是三个独立生命周期，不能再用“先补齐 managed Property 才能提交”的旧规则把它们绑在一个写事务中。

KG OS v1 不提供 caller-managed raw Vector Property / Vector Index profile。`type: vector` 只存在于 **Index**，表示上述托管语义索引；它不是 Property type。若绕过 KG OS 直接在 Lithograph **Schema** 中建立 caller-owned Vector Property type / type Constraint / raw Vector Index，Schema introspection无法无损映射到当前公共 Ontology profile，该 Snapshot 对 Ontology 高层能力属于 consistency-invalid，不能由 aggregate decoder伪装成可编辑定义。

纯 graph data 中由公共 Graph 原样写入的 caller-owned Vector value则遵守 D59：Ontology startup/read **不扫描全部 Knowledge value**来把整个 Snapshot升级为 invalid。未来 Knowledge Object read/patch若实际寻址到含 Vector 的 Object，由 Object value profile在该 operation上返回既有 `UNSUPPORTED_OPERATION`；Graph仍可按 Lithograph合同读取/修改这些数据。Schema-level不可解释结构与 addressed Object value限制必须分开，不能为了 Object简化模型恢复全图 commit guard。

`properties` 中复合字段顺序有意义，不能排序为另一种索引。Full-text 多目标表示底层允许的任一 Label/Type 匹配与多字段检索，不把它改成“所有 Label 必须同时出现”；新建/业务重建时的分词策略来自当前 runtime config，已有 Index 继续由自身 versioned analyzer 决定。Semantic 首版只使用一个 source，范围与联合检索边界见上文。调用方不编排 DDL、SQLite extension 或 embedding API。

### 共享资源与聚合编辑

当前可以跨 Definition 的 Full-text / Managed Semantic Index 可能出现在多个 Definition 中，**不等于多份存储、多个 Index 或多个独立编辑 owner**。程序根据真实资源名与 baseState 识别同一资源，完整显示 targets。AI 可从任一参与 Definition 修改它，不必先读取 `index:...`。Range / Text / Point 不具备这一跨 Definition 共享语义。

一次 Patch 先从每个 aggregate 的 before/after 取得显式变化，再按底层逻辑资源/字段归一化：

- 相同 slot 的相同目标变化合并一次；不同目标值、delete-vs-update 或重复但不一致的新增声明整体冲突；不同 slot 的变化可以组合，但最终资源必须合法。
- 没有被修改的另一份展示只是上下文，不会撤销本次变更，也不要求 AI 同步修改全部参与 Definition。
- 编辑 `targets` 表示改变覆盖范围；从一个参与 Definition **显式删除整条完整共享 Index 声明**表示删除这个全局索引，不是只解除当前关联。范围调整使用 targets。读取和错误信息必须显示完整影响范围。
- 把同一个索引从单字段位置移到 Definition 层、或把单字段扩展为组合索引，先按名字配对再比较 targets/config；不能仅按 YAML 层级视为无关 delete/create。底层确需 rebuild 时由 KG OS 执行。
- Definition / Property 的普通删除不自动删除涉及其它仍存活字段/Definition 的共享规则，也不把复合规则静默缩小。调用方在同一 Patch 中明确调整或删除该规则；否则返回依赖冲突，并指出 aggregate 和字段位置。

不新增 schema owner registry、公共 Index UUID 或全库模型副本。共享关系由原生 Index target 确定，Domain membership 与资源放置不决定数据库身份。

### 编辑示例

以下是设计合同示例，不表示 CLI 已实现。示例中的 `Person`、`Document`、`AUTHORED` 都是调用方定义，不是 Kernel 内建模型。Node `Person` 创建时就声明一个 `name` 字段（`STRING`），再按任务增加其它字段；示例不把这个字段设为必填或唯一。

`kg ontology domain:Content --at <resolved-state> --edit`：

```yaml
name: "Content"
title: "内容"
description: "组织人物、文档及作者关系；用于内容管理和检索。"
includes:
  - "node:Document"
  - "node:Person"
  - "relationship:AUTHORED"
```

`kg ontology node:Person --at <resolved-state> --edit`：

```yaml
name: "Person"
title: "人物"
description: "现实世界中的自然人，可作为文档作者。"
properties:
  - name: "name"
    description: "人物姓名。"
    type: "STRING"
constraints: []
```

`kg ontology node:Document --at <resolved-state> --edit`：

```yaml
name: "Document"
title: "文档"
description: "保存文章与教学资料；支持正文全文检索和正文语义检索。"
properties:
  - name: "content"
    description: "文档正文。"
    type: "STRING"
    indexes:
      - name: "document_content"
        type: "fulltext"
      - name: "document_semantic"
        type: "vector"
  - name: "id"
    description: "文档业务编号，不是数据库 element identity。"
    type: "STRING"
    required: true
    unique: true
  - name: "title"
    description: "文档标题。"
    type: "STRING"
    required: true
constraints: []
```

`kg ontology relationship:AUTHORED --at <resolved-state> --edit`：

```yaml
name: "AUTHORED"
title: "创作"
description: "某人创作某篇文档；不隐含一篇文档只有一位作者。"
from: "node:Person"
to: "node:Document"
properties:
  - name: "since"
    description: "开始创作的日期。"
    type: "DATE"
constraints: []
```

复合约束示例（`tenant_id + username` 联合唯一，单独的 username 不要求全局唯一）：

```yaml
name: "User"
description: "租户中的用户账号。"
properties:
  - name: "tenant_id"
    type: "STRING"
    required: true
  - name: "username"
    type: "STRING"
    required: true
constraints:
  - name: "user_tenant_username_unique"
    type: "unique"
    properties:
      - "tenant_id"
      - "username"
indexes:
  - name: "user_tenant_username"
    type: "range"
    properties:
      - "tenant_id"
      - "username"
```

共享全文索引片段，在已定义且均具有 name/team 字段的 Employee、Manager 两个 Definition 中显示同一个完整声明：

```yaml
indexes:
  - name: "people_text"
    type: "fulltext"
    targets:
      - "node:Employee"
      - "node:Manager"
    properties:
      - "name"
      - "team"
```

看 Document 的默认详情时，AI 已知道真实的 `document_content` 与 `document_semantic`。全文可直接使用 Graph Cypher：

```cypher
CALL db.index.fulltext.queryNodes('document_content', $query)
YIELD node, score
RETURN node, score
```

语义检索调用 Lithograph 的 Semantic query procedure，参数直接传 String：

```cypher
CALL db.index.semantic.queryNodes('document_semantic', $query, {limit: 10})
YIELD node, score
RETURN node.title, node.content, score
```

对应 params：

```json
{"query":"如何设计知识图谱"}
```

AI 不需要提供 provider、model、dimension 或 query Vector；模型配置来自目标 State 的实际索引定义。查询只返回业务数据与 score。执行边界与过滤语义见 [Graph](graph.md#graph-公共调用合同)，配置示例见 [Runtime](runtime.md#configtoml)。

### 局部 Patch 示例

基于前面完整 Document editable body，AI 只提交下列 patch（baseState 与 branch 在 Object Patch envelope 中，不放进 YAML）：

```diff
diff --git a/node:Document b/node:Document
--- a/node:Document
+++ b/node:Document
@@ -15,6 +15,12 @@
     type: "STRING"
     required: true
     unique: true
+  - name: "summary"
+    description: "文档摘要。"
+    type: "STRING"
+    indexes:
+      - name: "document_summary"
+        type: "fulltext"
   - name: "title"
     description: "文档标题。"
     type: "STRING"
```

它表达新增 `summary: STRING`、说明和真实全文索引 `document_summary`。KG OS 负责 Schema、Index 与 Property Binding 的原子变化；AI 不需要另外创建 Index Object，也不需要提交没有改动的整个定义。该例子只演示合同，未执行数据库写入。

## Domain：业务组织

Domain 的逻辑模型保持 `name / title? / description? / includes → Domain | Definition`。它是可选组织层，不是 namespace、Graph Type、权限、数据隔离或独立版本单元。

Domain name decode 后为 1..255 UTF-8 bytes，禁止 NUL / ASCII control，同 State 唯一；不做 Unicode normalization 或 case folding。rename 改变公共名称，内部 Domain Node identity 连续。

includes 使用准确 typed Ref，可以包含 Domain 或 Definition，允许多父级、Definition 属于多个 Domain、Definition 不属于 Domain，以及业务组织 cycle。读取遵守前文的有界直接展开规则；KG OS 不替调用方判断领域划分是否合理。

Domain editable body 只修改自身名称、说明和 includes；不通过 Domain Patch 重写成员 Definition。阅读时成员的一句话说明是只读聚合，来自各自定义。删除 Domain 只删除自身和组织边，不删除任何成员、Schema 或 Knowledge。

## Semantics 与持久化边界

KG OS 的 `title/description` 解释 Definition 和 Property 的含义，Domain/INCLUDES 提供业务组织。二者仍是 Lithograph 中的普通 versioned Property Graph 数据，不向 Lithograph 添加 KG OS 专用 annotation。

`title` 为可选简短显示名；`description` 为可选自然语言说明。Property 说明随其 Definition 编辑，通过内部 Property Binding 保存；不再建立独立的 Property CRUD。`examples/aliases/prompt/instructions` 不在当前存储合同中，生成的使用示例不因此变成业务字段。

### Semantic graph 的内部边界

Domain、`INCLUDES` 与 Schema semantic metadata 和普通 Knowledge 共存在同一个 Lithograph versioned graph 中，但 KG OS 必须能明确区分自身内部 Ontology semantic graph 与调用方 Knowledge：

KG OS v1 为所有 **KG OS 显式命名**的 internal graph / Schema identifier 保留 exact UTF-8 prefix `__kgos_`。调用方创建或修改的 Label、Relationship Type、Property key、Graph Type resource name、Constraint name、Index name 等只要以该 prefix 开头，都在 Object / Ontology Patch boundary 返回 `RESERVED_IDENTIFIER`；比较按 Lithograph identifier 的实际 name semantics，不额外做 Unicode normalization。这个 namespace 只服务 KG OS 基础设施，不进入调用方 Ontology 语义。Graph 是原始 Cypher 执行入口，不按该 prefix 拦截；直接 Cypher 与高层模型校验的边界见 [Graph](graph.md#graph)。

Lithograph 因 Graph Type / Constraint 自动派生的 dependent Constraint / backing Index 是数据库生成资源，不属于 KG OS 自己选择名称的 identifier，因此它们**不要求**使用 `__kgos_` 前缀。KG OS 必须通过公开 Schema introspection 与当前 frozen artifact 的真实 source discriminator 识别这类资源，并把 D68 reserved Graph Type 派生的规则视为 reserved Schema 组成部分；不能仅靠名字前缀分类。v0.3.0 对 Graph-Type-origin 与 standalone `UNIQUE/KEY` 都报告 `classification=undesignated`，而 `SHOW CURRENT GRAPH TYPE AS GRAPH` 的 identifying element 又会同时列出两类 `constraints`，因此这两项都不足以恢复声明来源；KG OS 按 [D71](decisions.md#d71-lithograph-generated-constraint-identity) 使用 exact generated-name 映射。`graph_constraint_*` 前缀本身不属于 KG OS reserved namespace，也不能被 decoder 直接投影成调用方 Constraint。反过来，任何额外 standalone Constraint / Index 只要 target 指向 reserved internal Label/Type/Property，即使其名称没有 `__kgos_`，也不属于调用方 Ontology，且在 D68 未冻结时使 State consistency-invalid。

v1 internal semantic graph 的最小持久化编码固定为：

```text
Node labels
  __kgos_internal             # 所有 KG OS internal Node 的 marker
  __kgos_definition_binding
  __kgos_property_binding
  __kgos_domain

Relationship types
  __kgos_property_of          # Property Binding -> Definition Binding
  __kgos_includes             # Domain -> Domain | Definition Binding

Property keys
  __kgos_kind                 # definition: node | relationship
  __kgos_name                 # 当前 definition/property/domain name
  __kgos_title
  __kgos_description
```

Definition Binding 的当前 Schema Locator 由 `__kgos_kind + __kgos_name` 表达；Property Binding 的 locator 由自身 `__kgos_name` 加 `__kgos_property_of` 指向的 Definition Binding 当前 locator 组成。这样 rename 只更新对应 Binding Record 的当前 locator component，stable internal Node identity 与 Domain / Property ownership edge 不重建。Domain 使用 `__kgos_name` 作为当前公共 name；`title` / `description` 都是 optional。KG OS 不再为 locator 保存 JSON blob、第二套 Schema AST 或额外 UUID。

这些 exact identifier 是 KG OS internal persistence-format constant；未来修改必须通过显式 KG OS migration 保持已有 State 可解释，不能在普通软件升级中静默改名。internal Graph Type / Constraint 只声明上述真实所需 element/property legality；没有已验证性能或完整性需求时不提前增加 internal Index / Constraint，Binding coverage、Domain/Definition/Property uniqueness 与 kind/locator consistency 继续由本文定义的 KG OS consistency validation 保证。

v1 reserved Graph Type 的**精确逻辑 profile**固定如下；它是 bootstrap 与后续 consistency validation 的共同输入，不由实现自行发挥：

| Internal element | Graph Type / property legality |
| --- | --- |
| `__kgos_definition_binding` Node | identifying Label 为 `__kgos_definition_binding`，同时必须带 implied marker Label `__kgos_internal`；`__kgos_kind: STRING NOT NULL`、`__kgos_name: STRING NOT NULL`；`__kgos_title: STRING`、`__kgos_description: STRING` 可选 |
| `__kgos_property_binding` Node | identifying Label 为 `__kgos_property_binding`，同时必须带 `__kgos_internal`；`__kgos_name: STRING NOT NULL`；`__kgos_title: STRING`、`__kgos_description: STRING` 可选 |
| `__kgos_domain` Node | identifying Label 为 `__kgos_domain`，同时必须带 `__kgos_internal`；`__kgos_name: STRING NOT NULL`；`__kgos_title: STRING`、`__kgos_description: STRING` 可选 |
| `__kgos_property_of` Relationship | source 必须匹配 `__kgos_property_binding`，target 必须匹配 `__kgos_definition_binding`；两端都是 non-identifying Label constraint；不定义 Relationship Property |
| `__kgos_includes` Relationship | source 必须匹配 `__kgos_domain`，target 至少必须带 `__kgos_internal`；两端都是 non-identifying Label constraint；不定义 Relationship Property |

`__kgos_internal` 只是所有 internal Node 的共同 marker / implied Label，不单独创建一个空 Graph Node Type。`__kgos_includes` 的 target 之所以在底层只约束到 `__kgos_internal`，是因为当前 Lithograph 一个 Relationship Type 只有一组 endpoint Label 约束，无法把 `Domain | Definition Binding` 表达成 endpoint union；KG OS consistency validation 进一步要求它的 target **只能是 `__kgos_domain` 或 `__kgos_definition_binding`，不能是 `__kgos_property_binding` 或其它 internal Node**。这不是放宽公共 Domain 语义，而是把数据库可表达的基础合法性与 KG OS 上层 invariant 分层。

Definition Binding 的 `__kgos_kind` 值域固定为 `node | relationship`，由 KG OS consistency validation 校验；不为这两个字符串额外建立数据库 enum 类型。Domain name、Definition locator、Property name 的唯一性与 Binding 双向覆盖继续由 KG OS validation保证，因此 v1 bootstrap **不新增 standalone internal UNIQUE/KEY Index/Constraint，也不新增 internal Index**。Graph Type 自身为上述 Property type / NOT NULL 与 endpoint legality产生的数据库 Schema rule不属于额外业务资源。

KG OS-valid State 对 **reserved Schema + internal marker subgraph** 采用 closed profile：任何带 `__kgos_internal` 的 Node 必须恰好属于 `__kgos_domain | __kgos_definition_binding | __kgos_property_binding` 三类之一，不能零类、不能多类，也不能带未冻结的额外 Label / Property；这三类 Node 也不能缺 marker。D68 已冻结的 reserved Label / Relationship Type 在 internal boundary 内必须按其定义使用。

任何 **至少一个 endpoint 是 internal Node** 的 Relationship 都属于 internal boundary，必须是 `__kgos_property_of | __kgos_includes` 两种 type之一、两个 endpoint 都是 internal Node且没有 Relationship Property；反过来，这两种 reserved Relationship Type 也不得连接普通 Knowledge Node。每个 Property Binding 必须恰好有一条 `__kgos_property_of` 指向唯一 Definition Binding，Domain 对同一 target 最多一条 `__kgos_includes`。reserved internal Schema 必须精确匹配 D68 Graph Type及其 Lithograph-dependent rules，不允许额外 standalone Constraint / Index target internal elements。internal marker subgraph 中出现未知 / 错位 reserved identifier、未预期的 internal-target Schema resource、重复平行 internal edge、unclassified marker Node、cross-boundary edge 或额外 internal payload 都是 consistency error，decoder不能静默忽略后继续输出一个“看似正常”的 Ontology。

因此 startup / Ontology read 的 consistency validation 必须以 Schema introspection、`__kgos_internal` marker集合及其 incident Relationships 为边界，**不扫描 marker subgraph之外的全部 Knowledge 来寻找 reserved-looking Label / Relationship Type / Property key**。raw Graph 在纯 Knowledge element 上写入这类名称时，它们不因此被解释为 internal metadata；未来 Knowledge Object read/patch 对本次 addressed Object / candidate target执行 reserved-identifier边界，KG OS自己的 Object mutation仍不能创建或维持非法 reserved target。这与公共 Graph 可以原样读写任意 Cypher 的 D59 边界一致。

- 所有 KG OS Ontology 内部 Node 都必须携带 reserved marker Label `__kgos_internal`；它属于已冻结 internal persistence encoding，不进入公共 Object representation；Graph 显式查询可读取该 marker；
- KG OS 内部 Relationship 只连接 KG OS internal Node，不通过普通 graph edge 直接连接调用方 Knowledge Node；
- 面向普通 Knowledge 的 Object `read` / `patch` 必须由 KG OS 构造 Lithograph execution options，并使用公开 `graphView` 排除 reserved internal marker；此规则只服务明确 Ref 的 Object 投影与修改，不注入公共 Graph `query` / `execute`；
- Object Knowledge mutation 的 **candidate target state** 也必须保持在公共 Graph View 内：Object Patch 不得给普通 Node 添加 reserved internal marker，不得创建 / 改造成 KG OS-owned internal Relationship Type，也不得设置 KG OS-owned reserved internal Property key。即使调用方猜到具体内部字符串，mutation boundary 也必须 reject，不能先写入再依靠读取过滤隐藏；
- Ontology semantic graph 的内部读取使用相反的 Graph View，只允许 KG OS internal Node 进入本次 Cypher 的可见 Property Subgraph；
- 这种隔离必须在 Lithograph Planner / Executor / Search / mutation boundary 生效，不能由 KG OS 对查询结果事后过滤，也不能通过直接访问 `_lithograph_*` 实现；
- Lithograph `graphView` 不是认证系统。公共 Graph 按底层合同访问完整 graph，可读取或修改内部 semantic graph；上面的隔离保证只适用于 Ontology / Object 高层能力，不构成 Cypher 执行限制。

KG OS internal graph 使用普通 Lithograph graph data，因此仍受目标 Snapshot 的 Lithograph Schema / Constraint 约束。为保证调用方 Definition 约束与内部 semantic graph 同时合法，KG OS 必须在**同一份 Lithograph versioned Schema** 中维护自身运行所需的 reserved internal element types / properties，以及当前实现真实需要的 internal Constraint / Index definition。这些内部 Schema resources 不是调用方 Ontology Structure，不创建调用方 Binding Record，也不参与 Domain organization；它们没有公共 Object Ref，不能通过普通 Object `read` / `patch` 访问；通过 Graph 原始 Cypher 访问则按 Lithograph 合同执行。KG OS 不为它们建立第二套 Schema。若 Lithograph 的公开 Schema 能力无法同时表达调用方结构与这些必要 internal resources，则该 KG OS 实现路径视为依赖能力不足，不能退回直接 SQL 或旁路存储。

隔离同时作用于**输入 target**，而不是只过滤输出：调用方通过 Domain / Definition aggregate Patch 创建或修改 Ontology 时，任何直接定义 reserved internal identifier、与其发生命名冲突、或让调用方 Constraint / Index target 指向 reserved internal Schema resource 的目标状态都必须在编译前 reject。调用方不能通过知道内部名字来跨越 Object visibility boundary；Graph 不使用这项 target 检查。

### Binding Record 与 Schema Locator

Definition 本身仍然只是聚合视图，不作为新的持久化 Schema 对象。KG OS 在 semantic graph 内使用稳定的 **Binding Record** 保存业务解释与组织关系，再通过 **Schema Locator** 在同一 Snapshot 中确定性定位 Lithograph Schema element：

```text
Domain
  │
  └── INCLUDES
          ↓
Definition Binding Record
  ├── stable internal graph element identity
  ├── title? / description?
  └── target Schema Locator
          ↓
    Lithograph Schema element

Definition Binding Record
  │
  └── property metadata relation
          ↓
Property Binding Record
  ├── stable internal graph element identity
  ├── title? / description?
  └── target Schema Locator
          ↓
    Lithograph Property
```

Binding Record 是 KG OS-owned 的内部普通 Node，使用 Lithograph graph element identity 获得跨 Commit 的稳定内部身份；这个 identity 只表示“同一个 KG OS metadata / binding record”，**不冒充 Lithograph Schema element 的永久 identity，也不自动成为公共 `definitionId`**。

在一个 **KG OS-valid State** 中，每个调用方可见的 Definition 与 Property 都必须恰好存在一个对应的 Definition / Property Binding Record，即使 `title` / `description` 全部缺省。Binding Record 因而不仅保存可选语义，也承担 Domain organization 与跨 rename continuity anchor。KG OS-owned reserved internal Schema resources 是这一覆盖规则的例外，不创建调用方 Binding Record；聚合中的 Constraint / Index 不新增 Binding Record；其实际名称、target 与配置来自同一 Snapshot 的 Lithograph Schema，由 KG OS 归一化到对应 Definition。底层资源拆分不决定公共编辑边界。

公共 Schema 还必须可解释为本文件的 aggregate profile：无法完整表达的覆盖范围/类型/配置或矛盾的共享声明属于 consistency-invalid，不能隐去后继续编辑。对经 Object / Ontology compiler 创建的状态，compiler 必须保持这一条件；不能把自身尚未实现的 decoder 称为合法输入“过于复杂”。

因此一致性检查是双向的：Binding Record 的 Schema Locator 必须解析到正确 kind 的当前 Schema element；同时每个调用方可见的 Definition / Property Schema element 也必须能找到唯一 Binding Record。缺失、重复、悬空或 kind 不匹配都属于 **Ontology consistency error**。通过 KG OS Object Patch 进行 create / rename / delete 时必须原子维护这个一一对应关系；绕过 KG OS 直接修改 Lithograph Schema 可以使目标 Snapshot 不再是 KG OS-valid State，KG OS 不猜测或自动补建 Binding。

Schema Locator 只负责在目标 Snapshot 的 Lithograph Schema 中定位当前结构。当前最小逻辑形式是：

```text
Node Definition
→ { kind: node, identifyingLabel }

Relationship Definition
→ { kind: relationship, identifyingRelationshipType }

Node Property
→ { owner: Node Definition Locator, propertyName }

Relationship Property
→ { owner: Relationship Definition Locator, propertyName }
```

Schema Locator 的 KG OS internal persistence encoding 已由本节 `__kgos_` Binding 字段冻结：Definition 使用 `__kgos_kind + __kgos_name`，Property 使用 `__kgos_name + __kgos_property_of` 的 owner locator。解析时再映射到 Lithograph 公开 Graph Type / Schema introspection contract；KG OS 不把 Schema Locator 另序列化为公共 JSON/YAML 对象。Schema Locator 不保存 Commit ID，因为 Binding Record 本身已经与 Schema 一起进入同一个 Lithograph Snapshot；读取时始终以目标 Commit 同时解析 Binding Record 和 Schema。

因此 KG OS 明确区分：

```text
Binding Record identity
→ KG OS 内部语义对象的连续性

Schema Locator
→ 某个 Snapshot 中的结构定位

Lithograph Schema
→ 结构事实的唯一真源
```

KG OS 不要求 Lithograph 为 Node element type、Relationship element type 或 Property 新增跨版本永久 `SchemaElementId`。如果 Lithograph 未来提供通用稳定 Schema identity，KG OS 可以在新的设计修订中评估是否采用，但当前合同不依赖它。

当调用方通过 Object Patch 明确请求 Definition / Property rename 时，KG OS 在产品层保持 Binding Record 连续，并把 rename 编译为 Lithograph 当前公开能力能够表达的**语义保持目标 Snapshot change**。这个合同不要求 Lithograph 提供原生 rename；底层可以表现为 old element remove + new element add，并必须同步完成 D17 定义的已有 Knowledge data rewrite。Domain `INCLUDES` 等指向 Binding Record 的组织关系不因此重建。顶层 Definition / Domain rename 返回旧 Ref → 新 Ref transition；内嵌 Property rename 的连续性由 Binding 保持，并在 Definition 的 History / Diff 字段变化中解释。若 Relationship Definition rename 派生出大量 Relationship replacement，旧 Relationship Ref 在新 State 中失效，调用方通过 Graph 重新发现新 Relationship；Evolution diff/history 只保证可审计新旧集合变化，不承诺恢复一对一 oldRef → newRef 映射。

如果通过 Graph 原始 Cypher 或直接访问 Lithograph 修改 Schema，导致上述双向 Binding 覆盖不成立，高层 Ontology / Object 能力必须把该 Snapshot 判定为 **Ontology consistency error**：不猜测 rename target、不自动创建或改写 metadata、不静默删除 Binding Record。历史 KG OS-valid Snapshot 仍按各自当时的 Binding Record + Schema Locator 正常解析。

Consistency-invalid Lithograph Commit 仍然存在于底层 DAG，KG OS 不篡改历史把它“修掉”。Evolution `overview` / `get` / `ancestry` 可以为了诊断暴露该 Commit / ref 的轻量 identity、topology、State Data 与一致性状态，但不能把它伪装成正常可解释 Snapshot。Ontology read、Object `read` / `patch` 以及会创建新 State 或把 Branch / Tag 指向目标 Snapshot 的高层 Evolution mutation 仍要求相关 base / target State 满足当前 KG OS consistency invariants；否则返回 consistency error。Graph `query` / `execute` 不运行这项 KG OS 检查，可继续按 Lithograph 合同诊断或显式修改底层状态；KG OS 不自动为这些直接变更修复 Binding 或保证高层 aggregate 可解释。

## Patch 到真实变化

### Create / Update

AI 只提交基于准确 baseState 的局部 Git Extended Diff。KG OS 重新生成对应 Domain / Definition canonical YAML，精确应用 Patch、解析和比较逻辑值，再编排底层变化；不要求 AI 重传全库，不解析自然语言意图，不把整个 after 当 PUT。

```text
Definition aggregate + local Patch
    ↓
显式 logical delta + 跨引用派生变化
    ↓
去重 / 冲突 / 依赖 / 类型与目标校验
    ↓
tx_begin(branch, expectedHead=baseState)
    ↓
标准 Cypher Schema / Index / semantic graph / 必要 Knowledge data rewrite / index maintenance
    ↓
tx_commit → 一个新 State
```

添加字段及其索引、改变 required/unique、更新描述或同时创建 Node/Relationship/Domain 都走同一 Patch。顶层新对象采用 Object 的 request-local alias；Domain includes 和关系 from/to 可引用本请求新建 Definition，不依赖 entry 顺序。

只修改描述不执行 Schema/Index DDL。底层资源名、现有选项和没有被显式修改的字段必须保持；默认值规范化不能重置配置。共享资源显式变化遵守前文归一化规则。

单个请求可以跨多个 aggregate，并包含为结构变化明确给出的 Knowledge Object 改写。已有数据不满足新的附加 Label、类型、必填、唯一或端点规则时，若同一请求没有明确解决则整体失败；不自动增删业务 Label、不填造默认值、不丢弃重复记录、不删除边、不靠“最终检查”掩盖非法中间 statement。Definition / Property rename 的 mandatory identity-preserving rewrite 仍按 Rename 小节处理，不因此把其它模型变化升级为隐式数据迁移。

compiler 必须按 Lithograph immediate constraint semantics 安排 DDL/DML；必要的临时 Schema 替换只存在同一 transaction 内。任一 statement/validation/commit 失败整体 rollback，不允许先提交中间状态再 squash。Branch 前进返回 STALE_BASE_STATE；纯格式变化或语义无变化在 strict base check 后返回原 State，不建立 transaction。

### Rename

顶层 Definition / Domain 改名复用 Git Rename entry；单纯改 body 的顶层 name 不是隐式 rename。Property 内嵌在 Definition 中，用最小显式输入标记 `renameFrom` 解决“改名还是删旧建新”的歧义：新名称条目携带 baseState 中的旧 Property name，旧条目同时移除。该标记只存在本次 Patch 输入，成功后不持久化、不出现在 canonical read。

```yaml
properties:
  - name: "body"
    renameFrom: "content"
    description: "文档正文。"
    type: "STRING"
    indexes:
      - name: "document_content"
        type: "fulltext"
      - name: "document_semantic"
        type: "vector"
```

这个片段表示将 content 改名为 body，不改索引的真实名字。`renameFrom` 必须存在于 base、同一旧字段只能被消费一次、新名不能与目标中仍存在字段冲突；没有标记的移除+增加按 delete+add 处理，不能依据相似度自动猜成 rename。交换名字可以在同一 Patch 中明确成对表达，compiler 负责无损 staged planning。

rename 必须同步维护 Binding 连续性、Domain / 关系端点 / Constraint / Index 的引用，以及实际 Knowledge 的对应 Label / Property / Relationship Type。Property value 只在该 Definition 覆盖的元素上改写；同一物理元素受多个 Definition 覆盖时必须检查所有受影响语义。不能静默覆盖已存在的新 key；同一 Patch 明确安排的字段交换或数据改写必须先保留源值再执行，不属于隐式覆盖。不能全图修改所有同名字段。不能安全保持数据语义时整体冲突，而不是留下定义与实例脱节。

Relationship Type rename 在底层需要 replacement 时保持端点与 Property。直接寻址的顶层对象 transition 沿用 Object 合同；派生的大量 Relationship replacement 不建立永久 alias，调用方从新 State 查询实际关系，History/Diff 记录集合变化。

### Delete

删除 Definition / Property 不隐式删除 Knowledge，不提供 `force/cascade/preserve_orphan` 模式。按**整个 Patch 的 planned target**检查：若仍有使用该定义的 Node/Relationship、该 Property 的值或未解决 Schema 依赖，就拒绝；同一 Patch 可以明确改写/删除依赖后再删除定义。

删除聚合时清理只服务被删结构的类型/必填/唯一声明、专属索引、对应 Binding，以及 Definition 的 Domain membership。这是已删除聚合的结构清理，不是删除实际业务数据。涉及其它存活字段/Definition 的 composite/shared 规则必须在同一 Patch 中明确处理，不能凭包含关系级联删除。

删除一条索引只删除其 versioned definition，不删除业务正文。Provider-owned embedding cache独立于 Lithograph Index lifecycle；DROP 不要求 KG OS/Lithograph去扫描或清理 Provider cache。删除 Domain 只移除组织关系。所有删除只改变新 State，历史 State 的结构、语义、索引定义与知识按原 Snapshot 解释。

### 正反向映射验收

验收比较的是 **KG OS 公共逻辑值**，不是要求公共 YAML 与底层 AST 一一相同。无修改 read→patch 应为 no-op；合法修改 compile→读取新 State 应得到规范化后的目标 aggregate，同时保持无关图数据/Schema/名字/配置。

Schema 来源、依赖与共享资源归并是 KG OS compiler 的责任。声明式输入与数据库状态转换需要实际 round-trip、错误、data rewrite 与 index-maintenance 测试；文档例子通过解析不等于 compiler 已实现。具体工程验收见 [实现待办](implementation.md)。
