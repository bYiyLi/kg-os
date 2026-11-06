# BFO：持续体、发生体、依赖与时间

本文整理 Basic Formal Ontology（BFO）的基本承诺、分类和关系，重点说明这些区分如何影响领域建模。中文术语是辅助译法，以英文名称和原始 IRI 为准。解释与教学例不等于标准原文，也不构成完整公理化或合规证明。

## BFO 的位置与资料版本

BFO 是小型、领域中立的顶层本体，为不同领域的本体提供共同的上层分类与关系。它本身不提供完整的医学、工业、软件或组织词汇，也不是数据库设计方法、知识抽取流程或推理器。它的作用在于使领域模型对“对象是什么、如何存在、依赖什么、如何参与变化”等问题保持可比较的语义。[BFO 官方介绍](https://basic-formal-ontology.org/)

本文区分以下资料层次：

- **BFO 2020 与 ISO 标准。** 正式标准编号是 ISO/IEC 21838-2:2021，第一版发布于 2021 年 11 月。“2020”是本体版本名称，不是标准出版年份。标准覆盖术语、关系、OWL 2 和 Common Logic 公理化，以及领域本体与 BFO 的衔接要求。[ISO 标准页](https://www.iso.org/standard/74572.html)
- **当前维护的实现。** 本文核对的 BFO-2020 仓库固定在 commit `bd1fb61c5fa4e358fc9690f0d214b1ac63fae594`，提交日期为 2026-10-06，资料核读日期为 2026-11-04。这个提交号是可复查的实现快照，不是新命名的 BFO 理论版本。[固定提交](https://github.com/BFO-ontology/BFO-2020/commit/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594)
- **不同表达形式。** `bfo-core.owl` 是当前核心 OWL 实现。官方说明把 OWL 视为逻辑更强的 CLIF/FOL 实现的不完整近似。OWL 文件、自然语言注释和 Common Logic 模块不能被当作逐项等价的表达。[实现说明](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/README.md)
- **时间扩展与研究论文。** 时间扩展在核心之上提供额外表达选择；论文可能解释、批评或建议修改 BFO。作者参与过 BFO，也不意味着其论文提案已经进入核心。

BFO 2.0 的旧指南可用于理解思想背景，但不能据此覆盖 BFO 2020 当前实现。旧版本与当前仓库中相似的英文名称，仍需核对版本、IRI 和公理。

## 从类型与具体事物，到持续与发生

### Universal、particular 与实例化

BFO 区分 universal 与 particular：

- universal 是可由具体事物实例化的类型，例如某种对象或过程类型。
- particular 是具体的个体，例如这台泵、这次检修、这台泵的某个具体性质。
- `is a` 连接类型；`instance of` 连接具体事物与类型。BFO 的 Common Logic 表达还把实例化关联到时间。

因此，“离心泵是一种泵”和“泵 P17 是一台离心泵”不是同一种关系。登记 P17 不等于新增一个类型；一个系统里的标签、数据库表或任意集合也不能仅凭形式就被认定为 BFO universal。[实例化模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/existence-instantiation.cl)

### Continuant 与 occurrent

BFO 对具体实体最重要的区分，是 continuant 与 occurrent：

- **Continuant，持续体：** 在时间中保持自身身份而持续存在。人、球、洞穴和具体温度都可属于这一侧。持续体可以变化，“保持身份”不等于保持所有性质不变。
- **Occurrent，发生体：** 在时间中展开的事物，以及过程边界、时间区域和时空区域。

持续体不是一串过程片段的总和；过程也不是参与者在数据库里的另一份记录。泵与泵的一次运行不同，工人与工人的一次维修不同。两侧在 BFO 中互斥，不能把同一个实体既作为泵本身，又作为它的运行过程。[分类公理](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/universal-declaration.cl)

发生体侧进一步包括：

- **Process，过程：** 具有时间真部分，并有物质实体参与。一次销售、睡眠、细胞分裂或计算机编程都是官方例子。
- **Process boundary，过程边界：** 没有时间真部分的过程时间部分。它不是一个很短但仍有持续时间的过程。
- **Temporal region，时间区域：** 过程展开所对应的时间范围。
- **Spatiotemporal region，时空区域：** 过程所占据的时空范围。

`event` 在当前核心中是 process 的替代标签，不宜把日常语言里每个“事件”未经分析都归入同一类。[BFO-Core 术语](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/owl/bfo-core.ttl)

## 持续体的三种存在方式

持续体下面的三大分支是 independent continuant、specifically dependent continuant 与 generically dependent continuant。这里的“独立”和“依赖”是技术概念，不是“有无任何因果条件”或“能不能独自工作”。

### Independent continuant：不是特定依赖或一般依赖的持续体

**Independent continuant，独立持续体**不以 BFO 的 specific dependence 或 generic dependence 方式依赖另一实体。

其物质侧包括：

- **Object：** 具有相应因果统一性的物质实体，例如生物体、阀门、笔记本电脑。
- **Object aggregate：** 由对象作为成员部分组成的物质整体，例如某一组轴承。它不是数学集合，也不是数据库查询结果。当前公理允许它在某些时候只剩一个成员，但要求它至少在某时有多个成员。
- **Fiat object part：** 对象中以界定边界分出的物质部分，例如地球西半球；“人为界定”不表示该部分是虚构的。

`member part of` 描述对象与对象聚合体的成员部分关系，不等于实例所属类型，也不自动适用于任何叫作“成员”的业务关系。[物质实体模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/material-entity.cl)

独立持续体也包括非物质实体，而不只有实体物件：

- **Site：** 相对于物质实体确定边界或位置的三维场所，例如洞穴内部、船舱或汽车后备箱内部。
- **Continuant fiat boundary：** 相对于物质实体确定的零、一或二维边界，包括 fiat point、fiat line、fiat surface。
- **Spatial region：** 空间区域，具有零至三维的进一步分类。

所以，“不是物质实体”并不能推出“是信息对象”。一个容器、容器内部的场所、容器占据的空间区域，是不同的对象。[官方术语表 A.1.2.23–35](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/owl/profiles/temporal%20extensions/temporalized%20relations/documentation/bfo-2020-terms.csv)

### Specifically dependent continuant：依赖特定承载者

**Specifically dependent continuant，特定依赖持续体，简称 SDC**，依赖特定的独立持续体承载者；它不能脱离相应承载者继续作为同一个性质实例存在。

一台泵的具体质量或某人的具体角色，不会因为另一台泵具有相同数值、另一个人担任相同职位，就变成同一个实例。关系性性质也可以依赖多个承载者，不是所有 SDC 都只能依赖一个对象。

`inheres in` 连接 SDC 与独立持续体承载者，逆关系是 `bearer of`。承载不是部分关系：泵的某个性质并非泵的一块物质零件。[特定依赖模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/specific-dependency.cl)

### Generically dependent continuant：可跨承载者保有的内容或模式

**Generically dependent continuant，一般依赖持续体，简称 GDC**，允许相同内容或模式具有多个具体呈现，并不要求始终依赖同一个承载者。

相关关系有两个层次：

- `generically depends on`：GDC 与相应独立持续体承载者之间的关系。
- `concretizes`：SDC 或过程与其具体呈现的 GDC 之间的关系；逆关系是 `is concretized by`。

BFO 2020 允许过程充当 concretization，因此不能沿用“只有 SDC 才能 concretize”的旧版简化说法。但 GDC 仍不是脱离任何呈现而自在存在的模式。[一般依赖模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/generic-dependence.cl)

教学例：同一份说明内容、纸上的具体墨迹模式、承载墨迹的纸张，应分别分析。内容被复制不意味着纸张变成两份，也不意味着两份物理呈现具有同一身份。内容是否仍为“同一份说明”，还需要领域层的版本与身份规则，不能仅由文件名决定。

## 性质、倾向、功能、角色

BFO 的 SDC 侧区分 **quality** 与 **realizable entity**；后者又包括 **role** 和 **disposition**，其中 **function 是 disposition 的子类**。

### Quality 与 realizable entity

**Quality，性质**，如某个物体的质量、形状、颜色，不需要再发生一个额外过程才得以表现。性质实例不等于测量数值，也不等于一份报告。

**Realizable entity，可实现实体**可以在相应类型的过程中实现，但其存在不要求当下已经发生这种过程。例如材料具有遇到特定条件会硬化的倾向，并不表示它已经硬化。[Duncan 等，2024，BFO 分类与背景部分](https://pmc.ncbi.nlm.nih.gov/articles/PMC11334599/)

这使以下对象可以分开：

- 某物的具体性质；
- 对该性质进行的一次测量；
- 测量得到的数据或记录；
- 某物能够参与的过程类型；
- 实际发生的一次过程。

上述区分不要求每个应用都建立相同数量的数据库节点，但不能在语义分析中把它们视为同一事物。

### Disposition 与 function

**Disposition，倾向**与承载者的物理构成有关，在适当条件下通过过程表现；失去该倾向意味着承载者发生相应物理改变。

**Function，功能**是具有特定形成历史的 disposition。BFO 对自然生物功能诉诸演化，对人工物功能诉诸有意设计。因此，“某物恰好能产生某效果”不足以独自证明该效果是其 function。

例如一个部件的导电倾向、它被设计来完成的功能、某次真实通电过程，不是三个同义名称。关于功能的理论背景，BFO 采用的是兼顾生物与人工物的形成史解释，而不只是把一切有用效果称作功能。[Spear、Ceusters、Smith，2016](https://journals.sagepub.com/doi/10.3233/AO-160164)

### Role

**Role，角色**源于承载者所处的特殊物理、社会或制度情境；失去该角色本身不要求承载者的物理构成因此改变。学生角色、试验参与者角色、石头作为边界标记的角色是不同情境下的例子。[官方术语表 A.1.2.42–46](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/owl/profiles/temporal%20extensions/temporalized%20relations/documentation/bfo-2020-terms.csv)

“学生”可以在领域本体中指承担学生角色的人，但**人不是角色本身**。相似地，维修技师、技师的技能或倾向、维修任务中的角色、实际维修过程，不能仅凭名称关联就合并。

BFO role 也不等同于任何图关系的“端点角色”、权限配置中的角色名称，或其他本体论体系的 role 概念。跨体系映射需要比较定义。

## 部分、参与、实现与空间关系

### 两种部分关系

BFO 不用一个无条件的 `part of` 覆盖全部结构：

- `continuant part of(a, b, t)` 讨论持续体之间在时间 t 的部分关系。
- `occurrent part of(p, q)` 讨论发生体之间的部分关系。
- `temporal part of` 是发生体侧进一步的时间部分关系。
- `proper … part of` 排除相应的非真部分情形。

例如叶轮是泵在某时的部件；检修中的拆卸过程是整个检修过程的一个发生体部分。叶轮并不是检修过程的同类“部分”。[持续体部分模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/continuant-mereology.cl)，[发生体部分模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/occurrent-mereology.cl)

持续体部分关系的传递需要相容的时间条件。若零件 A 在一月属于组件 B，而 B 在二月属于设备 C，不能仅凭这两项事实推出 A 曾属于 C。

### Participation 与 realization

- `participates in` 连接适当的持续体与过程，并在 Common Logic 中带有时间参数。参与者不只限于物质对象；SDC、GDC 的参与有进一步依赖和具体呈现条件。
- `realizes` 连接过程与 realizable entity。
- `has realization` 是 `realizes` 的逆关系。

教学例：泵参与运行过程；运行过程可以实现泵的某个功能。“泵参与了过程”本身并不推出该过程实现了任何指定功能，更不证明任务成功。[参与模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/participation.cl)，[实现关系公理](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/specific-dependency.cl)

### 位置与发生地点

`located in`、`occupies spatial region` 与 `occurs in` 不能互换：

- `located in` 表达适当独立持续体之间的位置包含。
- `occupies spatial region` 指实体精确占据的空间区域。
- `occurs in` 连接过程或过程边界与物质实体或 site。
- `occupies spatiotemporal region` 表达过程或过程边界的时空范围。

“维修发生在车间”“技师位于车间”“技师身体占据某空间区域”分别涉及不同关系。位置包含本身也不是组成关系。[空间模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/spatial.cl)，[时空模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/spatiotemporal.cl)

## 时间不是给每条边附一个日期

BFO 区分事物在某时存在、过程占据某时间范围，以及关系在某时成立。具体的时间区域还包括 temporal instant、temporal interval 及更一般的零维、一维时间区域；一个 temporal region 不一定是连续区间。[时间区域模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/temporal-region.cl)

### Common Logic 与 OWL 的表达差异

Common Logic 可以直接表达三元关系，例如某发动机在 t1 是车辆的部件、在 t2 不再是。OWL 对象属性是二元的，不能直接照搬这种表达。

BFO 团队因此把更强的时间表达放在扩展中，并讨论不同策略及其成本。官方材料建议从具体时间与变化问题出发选择表达方式，并不要求所有应用采用同一种时间模型。[Taking Time Seriously](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/owl/profiles/temporal%20extensions/README.md)

2024 核心调整保留了相关 some-time 关系的 IRI，去掉标签中的时间后缀，并把 all-times 关系移到扩展。因此，核心标签没写“某时”，不等于“现在成立”，也不等于“永远成立”。[官方发布说明](https://github.com/BFO-ontology/BFO-2020/releases/tag/release-2024-01-29)

### Some time 与 all times

时间化关系的两个典型强度不同：

- **At some time：** 存在某个时间使关系成立。
- **At all times：** 在该关系主语存在的所有时间成立，而不是在整个宇宙的全部时间成立。

这不直接回答“具体从哪天到哪天成立”。把 some-time 关系当当前状态，或把它任意串接为传递链，都会丢失时间限制。[时间化关系公理](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/profiles/temporalized-relations.cl)

### Reverse 不必是 inverse

全时关系的量化范围依赖主语，因此交换主客体会改变时间范围：

- 一个人在整个会议期间都参与会议；
- 一个人在自己全部存在期间都参与会议；

这两句话显然不同。`has participant at all times` 与 `participates in at all times` 不能仅凭名称就声明为逻辑逆关系。官方材料明确区分 reverse 与 inverse，并说明必要时使用真正的逆属性表达式。[官方 reverse/inverse 说明](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/owl/profiles/temporal%20extensions/temporalized%20relations/documentation/reverse-vs-inverse.txt)

### History 与先后

BFO 的 **history** 是物质实体的过程性历史，而不是关于该实体的日志、年表或档案。档案只可能记录这段历史的一部分，记录缺失不等于事情未发生。[历史模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/history.cl)

`precedes` 表达发生体的时间先后，不表达因果。它的具体边界条件由时间公理规定，不能简单改写成任意应用数据库里的日期小于比较。[先后关系模块](https://github.com/BFO-ontology/BFO-2020/blob/bd1fb61c5fa4e358fc9690f0d214b1ac63fae594/21838-2/common-logic/order.cl)

业务有效时间、录入时间、纠错时间等数据库问题，可以借助其他模型处理；它们不是 BFO 直接给出的统一字段方案。

## 信息、计划与软件：BFO 核心不能替代领域扩展

GDC 为内容与承载者的区分提供基础，但 BFO 核心并未因此完整定义文档、命题、计划、规范、证据、软件版本与数据集。

例如 IAO 的 information content entity 和 plan specification 是在 BFO 之上的扩展。计划说明、执行意向或能力、实际执行过程和执行结果需要区分。2024 年关于计划具体呈现的论文讨论了既有模式对失败计划、变化计划的困难，并提出包括 CCO `prescribed by` 在内的方案。这是领域模式研究，不是 BFO 核心统一规定。[Duncan 等，2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11334599/)

对软件建模尤其重要的是：标准 BFO 中，realizable entity 的承载者是非 spatial region 的 independent continuant。若软件或数据集被建模为 GDC，就不能直接把它作为 BFO function、disposition、role 的承载者。

Neuhaus 在 2025 年论文中明确讨论这一限制，并比较定义类方案与修改 BFO 的方案。该文提出的是分析和修订建议，不能据此声称 BFO 核心已允许 GDC 直接承载这些实体。[Neuhaus，2025，版本 2](https://arxiv.org/html/2506.17085v2)

因此，“软件有某功能”在日常工程语言中合理，并不意味着把“软件”与“功能”直接连成 BFO `bearer of` 就已得到忠实模型。这里需要辨明所说的是程序内容、运行中的物理系统、设计说明、能力描述还是一次执行，必要时保留领域扩展与 BFO 核心之间的差异。

## 一个贯通例子：泵、功能与检修

以下是基于上述区分编写的教学分析，不是官方案例，也不是要求每个系统采用的固定图模式。

某台泵 P17 在检修前装有叶轮 I8，检修后换成 I9：

- P17、I8、I9 是具体物质实体，分别具有身份。更换部件是否使 P17 仍是同一台泵，需要相应领域身份依据，不能由名称未变自动决定。
- I8 与 P17 的持续体部分关系有时间范围；I9 的安装不能覆盖掉 I8 曾经安装的事实。
- 泵的具体质量是 quality；一次称量是 process；称量结果是信息内容或数据，不是质量本身。
- 泵的设计功能、某次实际泵送过程、过程是否达到要求，是不同问题。
- 技师是参与者；技师在本次工作中承担的角色不是技师本人。
- 检修说明是信息，检修执行是过程。存在说明不证明已执行，执行发生也不证明成功。
- 检修日志记录有关过程的信息，但不是 P17 的 BFO history。
- “先拆卸后安装”只给出顺序，不单独证明拆卸造成安装或解释检修成功。

这个例子的价值在于发现同一业务名称背后可能混合的对象，而不是把所有名称机械扩展成节点。

## 从 BFO 语义到计算模型的边界

BFO 分类与公理确定的是语义承诺，数据库节点、字段、关系属性和索引是实现选择。把一个 quality 作为字段存储，不意味着它在 BFO 中就是字面量；反过来，为每个字段建立实体节点也不会自动获得更忠实的模型。

在 OWL 中还有独立的语言边界：

- 缺少事实不等于事实为假。
- domain/range 用于推理类型，不是数据库式的输入拒绝规则。
- 存在性限制不保证数据中已经显式提供了所有相关个体。
- 逻辑一致不等于描述真实，也不等于满足业务所需完整性。

这些是 OWL 语义与验证的区别，不是 BFO 独有规则。[W3C OWL 2 Primer，§2、§4.6](https://www.w3.org/TR/owl2-primer/)

实际采用 BFO 时，有三个不同层面的结论：

1. 借用若干 BFO 区分，帮助理解对象。
2. 将领域类型、关系明确映射到指定 BFO 版本。
3. 在选定形式化和推理环境中检查相容性或进一步的符合性。

只做了第一层，不能声称完成第三层。本文提供的是对 BFO 的有源整理及建模分析，不宣称任何现有模型已经 BFO 合规，也不宣称这些内容已经过目标 AI 的行为评测。

## 资料使用说明

本文的核心依据是官方 BFO-2020 固定仓库中的术语、Common Logic 模块、OWL 实现及维护说明，辅以直接相关的原始研究论文。源码标注的许可为 CC BY 4.0；本文为中文概述与分析，不是逐字翻译。

当前仓库中的不同文件仍可能保留不同历史阶段的措辞。例如核心 OWL 中 `member part of` 的自然语言注释与 Common Logic 的目标类型表述并不完全相同。因此，涉及精确约束时，应明确所采用的文件、版本与表达层，而不是把多个来源的片段拼成一个未经验证的“完整 BFO”。

本文未把无法完整核读的 BFO 2.0 PDF 指南或《Basic Formal Ontology: Case Studies》PDF 当作已核验的详细论据。后续需要逐项复现它们的论证或案例时，应另行取得并核读全文。
