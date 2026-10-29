# KG OS 本体论建模方法论

<!-- cspell:words SKOS CIDOC -->

本文件是 KG OS 面向 AI 的**领域本体建模方法**，不是 RDF/OWL 语言教程、固定上层本体、强制工作流或 Lithograph 数据库手册。目的是让 AI 在新领域里先理解语义，再用 KG OS 已有 Property Graph 合同表达；方法应按任务难度使用，不要求简单的现有字段修改重复执行完整研究。

## 1. 基本认识：建模不是列字段

- **本体（Ontology）**：约定一个知识世界中可区分的概念、身份、关系及约束；在 KG OS 中通过 Node / Relationship Definition、Property、Constraint、Index 和可选 Domain 表达。
- **知识（Knowledge）**：真实的对象、事件、分类项、事实及其关系，按实际 Ontology 写入 Node/Relationship 实例；**新增知识不等于修改本体**。
- **概念分类**：某类业务标签可能是一个可独立识别和关联的 Concept Knowledge（例如“安全事件”），也可能只是 Property 值；只有语义、约束或结构确需不同，才考虑专门 Definition。**不要把每个分类名自动变成 Node Definition**。
- **知识世界**：Branch 是完整 State 的命名演进路径，不是实体类别、Domain 或物理权限边界；Domain 只是组织 Definition。既有图能满足共同管理与连接需求时优先复用。
- **表达与推理**：KG OS 当前是 Property Graph + Cypher；Node Label、Relationship Type、属性、约束和显式知识边可查询，但不自动拥有 OWL 类继承、SKOS 层级传递、来源真实性或因果推理能力。需要推论时必须具备实际规则、证据或已实现的查询能力。

本方法借鉴传统本体工程的 **Competency Questions（能力问题）**、迭代复用、概念分类、事件/时间及来源模式，但由 KG OS 自行定义适合 Property Graph 的实践规范。外部标准提供启发而非兼容承诺。

## 2. 六步决策法：问题 → 语义 → 身份 → 图 → 验证 → 演进

### 第一步：界定知识世界与能力问题

首先复用当前已发现的 Branch、Domain 和 Definition，核对目标 Instance/Branch/State、现有 Ontology 与相关 Knowledge；前置信息不足时通过 KG OS 补查。尚无现成世界但用户只要求概念设计时可继续提出假设明确的方案，不能把示例模型写成已经安装。记录模型必须回答的**业务问题**，尽量包含具体返回对象和范围，而不是“支持知识查询”一类口号。

- 正例：某个项目关联了哪些决定，分别在什么时间生效？
- 正例：哪两份资料引用了同一来源的不同内容版本？
- 反例：“保存项目的所有信息”；没有给出需要区分的事实和关系。

明确当前确实要支持的查询/修改与一个**合理的相邻扩展**（例如新增一个分类、一次新运行、新来源版本）。用户未要求的未来任意需求不能成为设计通用元模型或预置众多字段的借口。

### 第二步：从事实识别稳定概念与语义边界

在映射到数据库资源前，必须先区分：

1. **持续存在的对象**（人、系统、文档、项目等）和**发生的事情**（发布、签署、验证、故障等）。
2. **概念类别**与**具体实例**：术语“验证”是类型名称还是一次真实验证？“同一事件的新执行”与“同一事件的新证据”不是一个身份。
3. **名称**与**身份**：同名可能不同实体，异名可能同一实体；业务唯一键需要真实来源和作用域，不从显示名或文本相似度推断。
4. **状态、事件和时间**：一个对象现在的状态、一次状态变化、变化发生时间以及首次记录时间可能不同。
5. **来源事实和判断**：报告、推断、独立验证、互相矛盾的来源不能因为有图边就自动升级为已证实事实。

同义词不自动变成多个概念；同一词也可能因实际语义不同而对应不同概念。无法判定就保留差异/未知，不用结构去掩盖证据缺口。

### 第三步：决定 Definition、Knowledge 与属性的边界

| 问题 | 优先表达 | 何时改变 |
| --- | --- | --- |
| 新增一个人、项目、事件实例 | 既有 Node Knowledge | 真实身份/语义无法由既有模型表达 |
| 新增“部署”“事故”等分类项 | 已有 Concept/Category Knowledge 或合适属性值 | 新类别具有不同结构性关系、约束或独立生命周期时考虑新 Definition |
| 一条事实指向另一可复用对象 | 有业务语义的 Graph Relationship | 只是标量描述或无独立端点时保持 Property |
| 同一对象在不同关系里的角色、有效期间 | Relationship Property（关系有一等身份） | 关系本身需关联多份证明、多个参与者或独立生命周期时再建 Node |
| 简单已知日期、数值、单位 | 适当类型的 Property | 时间段需独立关联/复用或空间对象有查询身份时再建 Node |
| 关系端点、约束或检索能力的真实缺口 | 修改/新增 Definition（需确认） | 禁止仅为了使模型“更完整”而提前加 |
| 新主题需要组织模型 | 按实际用途使用可选 Domain | 独立 State 演进/管理职责才考虑新 Branch（需确认） |

**避免两个极端**：不把一切压成一个通用 Record/Entity 搭配大量 text、JSON 或 *type* 字符串；也不把每个术语、任务阶段、状态、计数和时间戳都机械拆成 Node。结构由独立身份、关系和实际查询要求驱动。

### Domain：何时组织（仅有关时）

Domain 是可选的 Ontology 导航组织，不是 Knowledge 分类实例或数据容器。已有模型可从全局清楚找到时无需为了形式完整新建 Domain；当多组 Definition 的职责、规模或阅读路径已经需要分组时，先查看现有 Domain 的名称、说明和直接成员，能复用就不新增。

- **划分依据**：按用户需要理解的业务模型范围组织，写清每个 Domain 涵盖与不涵盖什么；使用准确的 `domain:`、`node:`、`relationship:` Ref 作为 `includes`，而不是按名称猜成员或把 Knowledge 实例放入 Domain。
- **共享与跨域**：一份 Definition 可以属于多个 Domain，也可以不属于任何 Domain；跨 Domain 的真实 Knowledge Relationship 仍按同一图中的实际端点建模，不能因为导航分组复制实体或拆分 Branch。
- **组织边界**：Domain 不提供 namespace、业务键作用域、查询过滤、权限或独立版本。底层允许多父级与循环，但方案仍应避免无实际导航收益的重复层级与循环；不假定它会自动搜索、索引或隔离成员。
- **验证**：用固定 State 的全局 Overview 与目标 Domain 直接成员阅读检查可发现性、说明和跨组关联；改变 `includes` 不意味着修改成员 Definition，更不意味着迁移 Knowledge。

例如 `domain:Research` 与 `domain:Projects` 都可以包含同一个 `node:Source`；两处引用的是同一份 Definition，不是两份 Source Knowledge。若删除 `domain:Research`，只删除该 Domain 及其组织关系，`node:Source`、业务关系和 Knowledge 不会随之删除。

### 第四步：映射为可解释的 Property Graph

- 为每个 Node Definition 写明**本质、身份依据、适用/排除条件、与相似概念的区别**，而不是仅列字段。
- 每个 Relationship Definition 要明确**起点、终点、方向、业务谓词与成立条件**。关系的角色、时间、证据用途等属于该关系时使用 Relationship Property；无依据不使用模糊的 `RELATED_TO`。
- `unique`、`required`、类型及 Index 只承诺当前数据库合同能实际保证的规则；不要把业务推理、跨对象条件、时间覆盖、跨 Branch 引用或证据真实性说成 Schema 已自动强制。
- 分清 **Schema Definition 名称、数据库 elementId、业务键和关联目标身份**；实际引用或共享对象要核实当前 State。跨 Branch/Instance 的字符串定位不是跨 Snapshot Relationship。
- 可选复用官方 `kgos-ontologies` 的已核实模型，但必须比对现有语义并按需选取；不可访问时在已知需求下独立建模。参考模型、图示和例子不是当前数据库已安装证据。

### 检索需求驱动的 Index 设计

索引是为**已经明确的查询和检索入口**服务的访问能力，不是本体越完整就越应该多建的字段装饰。先对照实际 Ontology 的 Property、Constraint、已有 Index、代表性 Knowledge 和真实查询；只在现有能力不能满足查找/覆盖/性能需求时提出最小的索引变化。对每项候选说明“谁用哪种查询、找什么对象、哪些字段和 Definition 必须被覆盖”，无依据的全字段自动索引应舍弃。

| 需要回答的查询 | 优先检查或考虑 | 不应混淆 |
| --- | --- | --- |
| 按稳定业务键精确查找、验证唯一性 | 已有 `key` / `unique` 约束及其 owning Range Index | 不重复建立同目标、同有序字段的独立 Range Index；Index 不替代真实业务身份 |
| 结构化相等/范围/排序，或字符串的包含条件 | 按实际 Cypher 谓词与引擎能力评估 `range`、`text`；空间条件考虑 `point` | `text` 不是分词全文检索；不要未经执行计划或测量就断言新索引必然加速 |
| 按自然语言词项、短语或正文查找 | `fulltext`，选有业务意义的 `STRING` 来源字段、目标类型及合适的分词配置 | 不把 TEXT/LIKE、字段名称命中当作真正的全文召回；分词效果取决于已配置 analyzer |
| 用不同说法寻找相近含义 | KG OS 公共 `type: vector`（底层 Managed Semantic），选择一条能独立承载语义的 `STRING` 来源字段 | 不是 caller-owned Vector Property；当前每索引只支持单来源字段，不自动拼接标题和正文或切块 |
| 同时需要精确术语和语义近邻 | 各自有必要时组合 Full-text 与 Managed Semantic，并由实际查询层融合候选 | 不要求每个 Definition 都有双索引，不混合不同分数作为概率 |

决定索引前逐项检查：

1. **覆盖匹配**：真实查询入口能否发现并调用该索引？它搜索 Node 还是 Relationship，期望的 Label / Type、来源字段和语言是否均被覆盖？Domain membership 不是 Index target，也不会自动限定搜索范围。
2. **放置与复用**：单字段索引放对应 Property；多字段或跨 Definition 的索引按当前 Ontology 公共合同在 Definition 顶层表达。仅 Full-text 和 Managed Semantic 能跨同类 Definition 共享 targets；语义共享要求各目标有同名 `STRING` 来源字段且一个索引只取一个字段。复用已有可满足需求的索引，不因 Domain 不同复制同一份共享索引；多字段 Full-text 不等于多字段语义。
3. **可用性与代价**：核对目标 State 中既有索引、现实数据规模与查询负载，评估存储/更新成本；Managed Semantic 还需检查 Provider 的可用性、费用与数据外发条件。没有明确收益时不为所有 String、所有新 Definition 或每种搜索通道预建索引。
4. **配置与权限边界**：创建/修改 Index 是 Ontology 变更，需要明确授权；使用当前 `kgos_docs` 取得可表达的 YAML / Patch 及 Runtime 合同。Full-text 的 analyzer、Semantic 的 Provider/模型/维度并非让 AI 逐索引随意添加的公共字段，现有历史配置不能用新 Runtime 配置静默覆盖。

**共享索引的修改与删除**：一个共享 Index 在多个 Definition 中显示仍是一份全局资源。例如 `shared_text` 覆盖 `node:Document` 和 `node:Note`，若只需取消 Note 的覆盖，应将完整 `targets` 从两个 Ref 调整为仅含 `node:Document`，并核对保留目标的检索仍然有效。**从任一参与 Definition 显式删除整条共享 Index 声明，含义是全局删除该索引**；不是移除该 Definition 的成员资格。索引收窄为单 Definition、单字段后，回读可能将它投影到 Property 内；后续删除或修改应以最新 canonical 位置为准，不能只清空原先的顶层 `indexes` 就宣称已删除。删除受索引依赖的字段或 Definition 也不能默认静默缩小索引，必须核对影响并按当前合同协调变更。不要为同步共享展示而重复编辑所有参与 Definition。

**结构化条件与语义 Top-K**：当前 `db.index.semantic.queryNodes/queryRelationships` 的 `limit` 限制的是先返回的语义候选；在 `YIELD` 后附加 `WHERE` 只过滤这些候选，并不能保证得到条件范围内最相似的 K 项。比如先取全图前 10 条，再筛出项目 A 的知识，可能遗漏排在第 11 名的项目 A 知识。公共 Ontology 暂不支持 `filterProperties`；调大 `limit` 只能扩大候选，不应冒充严格的“项目 A 内 Top-K”。若业务确实要求这种保证，应指出现有能力边界，区分可接受的部分候选检索与待解决的执行能力缺口，不能为了满足描述而发明索引配置或查询语法。

**长文本的语义粒度**：托管语义索引使用来源 Property 的原始 UTF-8 字符串，不自动截断、切块或将多个字段拼接。对于很长或包含多个主题的正文，先核实 Provider 的输入限制、成本，以及用户要查的是整篇文档还是独立片段；单一向量能建成不代表能按段落准确召回。确需片段级身份、出处和关系时，按实际业务需求另行设计适当的 Knowledge/Definition；不得默认新增隐藏 chunk 节点、内部向量字段或未经确认的自动拆分流程。

将选择结果写成最小方案：具体查询问题 → Index 名称/类型 → 来源字段及完整 targets → 预期覆盖与收益 → 已有索引复用/额外代价 → 验证方法。查询本来可用、数据很少、尚无检索需求或依赖条件未确认时，允许明确选择**不新增索引**，不将“当前某种索引数量为零”视为建模失败。

获准实施后用同一固定 State 回读真实 Definition 与 `SHOW INDEXES`（或当前支持的等价查询），核对名称、类型、实体范围、字段和实际状态。对代表性问题用真实查询入口验证正确命中、遗漏、排序与 Top-K/覆盖限制；必要时以实际查询计划或耗时证据检验性能收益。全文 analyzer 不匹配、语义 Provider 不可用、没有建索引、搜索无命中和部分覆盖是不同结果；Index ONLINE、Patch 成功或合成案例通过均不能单独证明用户搜索可用。未获数据写入授权不往生产库放置测试知识，验证受阻则如实标明未覆盖范围。

### 第五步：用正反例和实际查询验收

先从能力问题写出所需的 Cypher 查询和最少的代表性实例数据。至少判断这四种情况（按任务规模取相关项）：

1. **正向查询**：能获得正确对象、关系、角色、时间/版本和来源，不只证明存储成功。
2. **反向边界**：同名不同身份、重复写入、未验证主张、不适用关系或范围限制不会被误认作正确结论。
3. **合理扩展**：新增一种业务分类或新实例时，能否只增加 Knowledge 而不改变 Definition？不能时分析是否确有新结构语义。
4. **修改安全**：新增约束和模型迁移不会错误破坏现有数据、关系及合法查询；工具成功不代替写后回读。

查询必须从目标实际 Ontology 或明确标注的拟议方案推导，测试数据需明确为合成。未获测试数据写入授权时只能论证或运行适用的真实只读查询；**不能把教学示例通过当成生产实例验收**。

### 第六步：最小设计、用户确认与持续演进

在给用户的建模方案中说明：核心概念及身份、关键关系、哪些新需求是 Knowledge 扩展、哪些是真正的结构改动、代表性查询与数据影响。复用足够的现有模型时展示“无结构改动”。需新建/修改 Ontology、迁移或建 Branch 且尚未确认具体方案时，调用 [Ontology 变更确认模板](model-confirmation-template.md) 取得明确确认；用户已直接指定并授权完整方案或已批准此前方案时不重复审批，已有模型下的普通实例写入不追加建模审批。

获准实施后依据最新 State 和当前 `kgos_docs` 执行必要 Patch、回读、验证，再按新证据渐进修正。已有模型下的普通实例写入不需要额外建模审批，但仍须获本次具体变更授权。禁止盲目套用样例、为保证“永不改 Schema”丢失真实语义，或因未来不确定需求提前增加新抽象层。

## 3. 快速评审：容易产生错误本体的模式

| 症状 | 需要重新回答的问题 |
| --- | --- |
| 每增加一个分类都出现一个新 Node Definition | 是新实体结构，还是现有 Concept/Category 的一个实例？ |
| 所有记录都是一个巨大的 `Entry` | 是否把真实有独立身份与关系的对象压扁了？ |
| 每个名词都是 Node，每个词都是关系类型 | 哪个对象需要身份、复用、关联或独立生命周期？ |
| 关系被写成另一对象的字符串 ID | 是否确有目标 Node 且需要图遍历？它是否处于同一 Snapshot？ |
| 一个状态值同时代表计划、执行、验收 | 是否混淆事件与状态、操作与验证、发生与观察？ |
| 把人名、标题、URL 当作全局唯一键 | 同名、重命名、来源版本、业务作用域是否已处理？ |
| 把“后来发生”写成“导致发生” | 哪些有据的关系只能表示先后，哪些有因果证据？ |
| 为新主题默认新建 Branch | 当前是否真有独立 State 演进或管理职责？ |
| 只因术语多就为所有字段建全文/语义索引 | 哪个具体查询入口需要哪些字段、目标和召回方式？ |
| 认为 Index ONLINE 就保证 Web 搜索有效 | 真实搜索入口是否覆盖该类型与字段，Provider 和分词是否实际可用？ |
| 想移除一个共享索引成员却删掉整条声明 | 是否应调整完整 `targets`，其余 Definition 还需要该索引吗？ |
| 把语义 Top-K 的结果经 `WHERE` 过滤后视为子集 Top-K | 筛选对象是否可能被全局 `limit` 提前排除？ |
| 认为语义索引自动切块或截断长文 | 来源字段全文是否超出 Provider 限制，用户需要文档级还是片段级检索？ |
| 把 Domain 当作命名空间或筛选条件 | 这些条件应由业务键作用域和实际 Cypher 表达吗？ |
| 只展示 YAML、没有实际查询或实例 | 哪些 Competency Questions 得到了可核实回答？ |
| 宣称本体自动推断分类、传递或来源真实性 | KG OS 当前是否实际提供相应推理或执行规则？ |

## 4. 外部研究依据与 KG OS 的取舍

以下只记录**来源与启发点**，不复制外部教程、完整本体或其受版权保护的原文。原文和变更情况以链接为准；本方法为 KG OS 独立编写的实践总结。

| 资料 | 可借鉴内容 | KG OS 不直接采用的假设 |
| --- | --- | --- |
| [Stanford · Ontology Development 101](https://protege.stanford.edu/publications/ontology_development/ontology101-noy-mcguinness.html) | 领域范围、Competency Questions、概念/实例区分、迭代与复用 | 不要求 Protégé、OWL 类层级 |
| [NeOn Methodology](https://oeg.etsiinf.upm.es/index.php/en/methodologies/59-neon-methodology/index.html) | 从需求出发、复用和重构现有本体、按场景演进 | 不引入额外 Ontology Network 服务 |
| [W3C · SKOS Primer](https://www.w3.org/TR/skos-primer/) | 分类概念、广义/狭义关系、同义词和作用域说明 | 不默认实现 SKOS/OWL 推理 |
| [W3C · PROV-O](https://www.w3.org/TR/prov-o/) | 区分实体、活动、责任主体与来源链 | 不把来源关系冒充事实已证实 |
| [W3C · OWL-Time](https://www.w3.org/TR/owl-time/) | 时点/区间与时间关系、不同精度 | 不强制每个时间戳成为 Node |
| [CIDOC CRM](https://cidoc-crm.org/) | 事件、参与者、时间、地点的可组合语义模式 | 不要求所有领域都事件中心化 |
| [Ontology Design Patterns · Time-indexed participation](https://odpa.github.io/patterns-repository/Time_indexed_participation/Time_indexed_participation) | 角色/参与关系的时间语义与独立表达条件 | 不因关系有时间就强制重实体化 |

需要具体可执行的 KG OS 示例时，再读取 [建模案例](modeling-examples.md)；该案例文档中的业务前提不可自动当成其它知识世界的事实。
