# GFO：对象、过程与情境的本体建模参考

核读日期：2026-11-04。\
性质：依据原始研究与官方实现整理的中文参考，不是官方译本。

## 1. GFO 的问题意识

GFO 的全名是 General Formal Ontology。它不是只为一个专业领域设计的词表，而是研究对象、过程、属性、关系、角色、功能、时间、空间以及复杂情境如何统一表达的基础本体。

其重要特点不是单纯选择“对象优先”或“过程优先”，而是明确分析：

- 持续存在的对象；
- 对象在某一时刻的呈现；
- 在时间中展开的过程；
- 它们之间的联系。

GFO 还区分不同种类的类别，并讨论物质、心理与社会层面的实体。作者 2024 年的概述将其立场说明为 integrative realism：承认独立于观察者的现实，同时承认主体理解现实离不开概念。[作者概述](https://ceur-ws.org/Vol-3882/journal-first-4.pdf)

对 AI 建模而言，GFO 特别适合帮助处理跨时间身份、性质变化、情境性角色、多方关系与过程整体。但是否采用整套理论，应由实际问题决定。

## 2. 必须分开的理论与实现版本

### 2.1 理论文献

1. **2006 年 Part I，Version 1.0**\
   正式 Onto-Med Report No. 8。

2. **2007 年 Part I，Version 1.0.1**\
   日期为 2007-02-14，是草稿修订，不是同名 OWL 文件的版本号。文档明确是持续发展的工作，部分议题仍未完成。\
   [2007 原始报告](https://www.onto-med.de/sites/www.onto-med.de/files/files/uploads/Publications/2007/gfo-part1-v1-0-1.pdf)

3. **2013 年对象与过程整合论文**\
   Heinrich Herre，*Persistence, Change, and the Integration of Objects and Processes in the Framework of the General Formal Ontology*。\
   [原始论文](https://arxiv.org/pdf/1311.1632)

4. **2022 年综合论文**\
   Loebe、Burek、Herre，*GFO: The General Formal Ontology*，Applied Ontology 17(1):71–106。\
   [期刊入口](https://doi.org/10.3233/AO-220264)

本次未完整取得 2022 年期刊全文。本文不将其未核读部分当作已验证依据，而使用作者 2024 年的公开摘要核对其整体定位。[2024 作者摘要](https://ceur-ws.org/Vol-3882/journal-first-4.pdf)

### 2.2 GFO 主仓库

固定提交：

`233b38dcabf3656b46e3f54d0c73f76aaee73227`

- [gfo.owl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/gfo.owl)。
- [modules/gfo-base.owl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl)。
- [README](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/README.md)。

这两份 OWL 文件标记的版本日期为 **2024-11-18**。其命名空间与理论文献中的简写必须区分。

### 2.3 GFO-core 与独立 GFO-light 仓库

固定提交：

`1ca9d8d00997630e5d910a6376fec2f57ffbfc03`

- [gfo-core.ttl](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/gfo-core.ttl)。
- [gfo-light.ttl](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/gfo-light.ttl)。
- [使用文档](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/docs/README.md)。
- [变更记录](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/CHANGELOG.md)。

两份 TTL 的版本日期均为 **2025-10-01**。当前 GFO-light 明确导入该日期的 GFO-core。

不能把“GFO”“GFO-base”“GFO-core”“GFO-light”当成四个可无差别替换的名称。

## 3. 类别、个体与集合

GFO 的基础区别包括：

- **Category**：可以被实例化，也可以述说其他实体。
- **Individual**：不能进一步被实例化的个体。
- **Set**：集合论层面的实体，不能未经分析就等同于一个现实类别。
- **Universal、Concept、Symbol structure**：不同种类的类别。

例如，需要区分：

- 某一个人；
- 人这一类别；
- 关于人的概念；
- 表达该概念的符号结构；
- 研究者列出的一组人。

它们可以有关联，但不是同一对象。

GFO 还允许高阶类别：一个类别的实例可以是另一个类别，而不必总是具体个体。因此，“类别就是数据库标签，个体就是节点”只能是某种技术映射，不能反过来作为理论定义。[2013 论文，第 3 节](https://arxiv.org/pdf/1311.1632)

在所核读 GFO-base 中，Entity 以 Item 与 Set 的并集组织；Category 与 Individual 位于 Item 之下。Category 下区分 Universal、Concept 与 Symbol_structure。具体采用这些层级时，应检查正式 OWL 表达，而不是按中文名称自行补出不相交或穷尽公理。[固定 GFO-base](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl)

## 4. 对象、呈现与过程

### 4.1 Presential：某一时刻的完整呈现

Presential 是完全存在于某一个时间边界上的实体。

它不是：

- 整个持续对象；
- 一段有持续时间的状态；
- 某次观察记录；
- 一张照片或数据库快照文件。

观察记录可以描述 presential，但记录与被描述者必须区别。

### 4.2 Process：时间中展开的过程

过程具有时间延展和时间部分，不能整体存在于单一时间点。过程的时间边界可以对应 presential。

因此，过程不是若干数据库状态记录的简单集合。记录是否完整，与过程是否发生，是不同问题。

### 4.3 Continuant：持续存在且可以变化的对象

2013 年论述将时空个体区分为 Continuant、Presential 与 Process。Continuant 具有生命周期，可以在变化中保持身份；不同时间表现出的 presential 可以不同。

对象—过程整合原则将某个持续对象与支撑其存在的过程相联系：该对象在各时刻的呈现，与相应过程的边界保持对应。[2013 原始论文，第 3、7 节](https://arxiv.org/pdf/1311.1632)

### 4.4 Persistant 不是 Continuant 的无条件同义词

早期理论及当前 GFO-base 中，**Persistant** 用作由 presentials 实例化的特定 universal，以解释跨时间身份。在固定 GFO-base 中：

- Persistant 是 Universal 的子类；
- 它要求有 Presential 实例；
- Material_persistant 进一步限制实例为相应物质对象。

当前 GFO-core/light 中，**Continuant** 则是 concrete individual 的类别。

这是表达层次的实质差别，不能凭“都与持续身份有关”直接设为等价类。[GFO-base 定义](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl)、[GFO-core 定义](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/gfo-core.ttl)

### 4.5 建模时应问什么

以下是本参考的操作性问题：

- 要追踪的是跨时间的同一对象，还是某时刻的状态？
- 两次记录对应同一对象的依据是什么？
- 属性变化、部件替换或角色改变是否改变对象身份？
- 过程的开始、结束与内部阶段如何识别？
- 来源只观察到若干时刻，还是有连续过程证据？
- 是否把描述、观察和现实对象误合为一体？

这些问题必须依据领域材料回答，上层本体不能替代身份事实。

## 5. 时间与空间不是普通数值字段

### 5.1 Chronoid 与时间边界

在 GFO 的经典时间理论中，Chronoid 是具有延展的时间实体，不是仅以点集定义的构造。它具有两端边界及内部时间边界。

不同时间边界可以 **coincide**，即时间上重合，却不因此是同一个实体。

这可以用于分析相接过程：前一个过程的结束与后一个过程的开始没有时间间隙，同时仍保留各自边界身份。[2007 报告，第 5 节](https://www.onto-med.de/sites/www.onto-med.de/files/files/uploads/Publications/2007/gfo-part1-v1-0-1.pdf)

不能把 coincidence 自动转换为：

- `owl:sameAs`；
- 两个业务事件相同；
- 两个来源记录相同；
- 两个字符串日期相同便足以确认的身份关系。

### 5.2 空间区域与边界

GFO 的空间研究分别处理空间区域、空间部分、空间边界与边界重合。物质对象和它占据的空间也不同。

尤其要避免把“物体接触”直接解释为“物质边界是同一个实体”。有关空间理论明确区分纯空间边界与物质边界。[空间公理化论文](https://arxiv.org/pdf/1110.5832)

### 5.3 工程时间与本体时间

即使使用时间本体，应用仍需自行明确：

- 时间粒度与精度；
- 开闭区间约定；
- 业务有效时间与系统记录时间；
- 不确定时间的表达；
- 迟报、纠错与实际终止的区别。

一个日期字段不会自动实现过程边界、持续身份或时间推理。

## 6. 属性、属性值与测量

GFO 强调区分承载者、其具体性质、性质的类别，以及性质所关联的值。

以温度为教学例：

- 某设备是承载者。
- 设备在特定情境中的温度性质，不是设备本身。
- 温度这一可复用类别，不是某次温度性质。
- 数值及单位，是表达该性质的一种值。
- 测量记录是对它的观察，不等于被测性质本身。

在固定 GFO-base 中，Property、Property_value、Value_space 及 has_value 等提供相关表达入口。但不同理论时期对 property、attribute、attributive 的用法并不完全一致，不能仅依英文字面建立映射。[GFO-base](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl)

GFO-light 用 Quality 表达具体性质，位于 Attributive 之下，并通过 qualityOf 联系承载者。官方指南允许根据应用需要采用数据属性或更独立的性质对象。[GFO-light 指南](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/docs/README.md)

本地设计不必把每个数值都实体化。但当性质需要独立时间、来源、关系或身份时，不能只为减少节点而抹去这些差异。

## 7. 关系、Relator 与角色

### 7.1 关系类型与关系实例

GFO 区分可复用的关系和具体连接实体的 relator。Relator 不是关系名称，也不只是参数元组的另一种写法；它承担特定关系实例的身份。

例如，两个相同参与者可能多次建立、终止、重新建立某种关系。若任务需要分别追踪这些发生段，单一无时间边未必足够。

### 7.2 角色是有情境的

关系中的各方可能以不同方式参与。GFO 用角色分析这种差别：

- 角色承担者；
- 所承担的角色；
- 角色所在的关系或情境；
- 与其相联系的其他角色。

“某人是审核人”必须问清：审核什么、在哪次审核或哪种组织安排中、什么时候成立。

角色承担者不等于角色实例。同一个承担者可以在不同情境中承担不同角色。[2007 报告，第 11 节](https://www.onto-med.de/sites/www.onto-med.de/files/files/uploads/Publications/2007/gfo-part1-v1-0-1.pdf)

### 7.3 不同实现不能混用

GFO-base 区分 Relational_role、Processual_role、Social_role，三者的正式上位结构不同。不能据“角色一般具有依赖性”就给所有现成角色类补上同一个形式父类。

当前 GFO-light 将 Role 作为 Attributive 的子类，使用：

- plays / playedBy：承担者与角色；
- roleIn / containsRole：角色与情境；
- relates / relatedBy：relator 与关联个体。

当前 light 不再显式保留旧版本的多种角色子类；变更记录说明 2025-03-17 移除了相关角色细分类。[版本变更](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/CHANGELOG.md)

### 7.4 何时值得引入 Relator

以下为本参考的建模判断：

- 多方参数和不同参与角色需要明确区分；
- 关系有独立身份；
- 同一参与组合可以反复发生；
- 关系本身需要关联时间、来源、要求或结果；
- 简单边无法保存能力问题所需的信息。

反过来，若只需一个明确而简单的关系，且不需要上述独立信息，不应为了“符合本体风格”一律增加 relator 和角色节点。

## 8. 功能、目标与实现

GFO 的 function 主要分析目的性，不等于数学函数，也不等于某段程序代码。

其分析涉及：

- **goal**：期望达到的情境；
- **requirements**：实现前提或初始条件；
- **functional item**：实体为实现目标所需满足的条件；
- **realization**：实现功能的具体发生或表现。

因此，需要分别表达：

- 被设计为实现某功能；
- 具有相关能力；
- 正在执行某次实现；
- 已经达成目标；
- 已被观察并验证达成目标。

“系统支持导出”并不证明某次导出已经成功；一次成功也不直接证明所有条件下都有同样能力。

GFO-base 中存在 has_function、has_goal、has_requirement、realizes 等入口，但具体参数与 formalization 必须以所用版本为准。2013 论文还讨论了 function 的不同解释层次，不能把它们压成单一无区分的字符串字段。[2013 论文，第 4 节](https://arxiv.org/pdf/1311.1632)、[GFO-base](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl)

## 9. Facts、Situations 与 Situoids

### 9.1 事实与命题

经典报告将 facts 视为世界中的组成或组合，而 propositions 对事实是否存在作出断言。命题可以有真假，不能把记录中写出的句子直接当作其描述的事实。

对 AI 知识组织，这提示至少保留：

- 世界中讨论的对象及关系；
- 来源表达的主张；
- 表达该主张的文本或载体；
- 对主张的证据与判断。

### 9.2 情境不是任意打包的数据

经典报告中：

- Configuration 组合处于同一时间边界的相关事实。
- Situation 是满足统一性条件、可以被理解为整体的特殊 configuration。
- Situoid 是具有时间延展、其边界为 situations 的连贯过程整体。

因此，“把所有关联节点放进一个集合”并不能自动获得理论意义上的 situation 或 situoid。

### 9.3 State 的明显版本差异

固定 GFO-base 中，State 是 Process 的子类，其定义涉及内部时间边界不发生瞬时变化。

当前 GFO-core/light 中：

- Situation 是上位入口；
- State 是静态 situation；
- Process 是动态 situation；
- SituationAggregate 用于情境相关、但并非时间连续连接的情境集合。

不能在忽略这些定义的情况下把两个版本的 State 或 Situation 强行设为等价。[GFO-base](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl)、[GFO-light 当前指南](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/docs/README.md)

## 10. 当前 GFO-core/light 的实践入口

若应用希望采用较轻的正式表示，可先评估当前 GFO-core/light，而不是把经典报告全部概念直接变成数据库节点。

### GFO-core 的主要入口

- Continuant：持续个体。
- Attributive：依赖其他个体的属性性实体。
- Situation：相关属性性内容形成的情境。
- State：静态情境。
- Process：动态情境。
- TimeEntity：时间实体。

### GFO-light 的主要扩展

- Object、ObjectAggregate 等对象组织。
- Quality、Role、Relator。
- InformationObject。
- SituationAggregate。
- 对象部分、集合成员、角色情境及时间关系。

官方指南对 InformationObject 明确采用简化处理，并不区分所有信息内容与信息载体。如果任务需要严格区分文件、版本、编码和内容，应另作分析，不能声称 light 已经完整解决信息本体问题。[官方使用指南](https://github.com/Onto-Med/gfo-light/blob/1ca9d8d00997630e5d910a6376fec2f57ffbfc03/docs/README.md)

旧 GFO 主仓库 README 对 light 的组织介绍，与当前独立仓库已有差异。本次应以独立仓库所固定版本的实际 imports、TTL 与变更记录判断当前 light，而不是把旧介绍继续当作完整事实。

## 11. 教学例：设备的一次检修

以下是本参考构造的概念示例，不是官方案例，也不是已完成的 OWL 实现。

假设设备 D 经历一次检修 M，检修前后温度不同，技术员 T 在这次检修中承担负责人角色。

可分析为：

1. **设备 D**\
   关注跨时间持续身份，不能把检修前和检修后的观察直接当成两个设备。

2. **检修 M**\
   是有发生范围和时间延展的过程，不是“检修流程规范”。

3. **温度性质及其观察**\
   温度值有对象、时间与来源；观测记录不是设备的性质本身。

4. **负责人角色 R**\
   承担者是 T，情境是 M。T 离开负责人角色，不等于 T 不再存在。

5. **检修后的状态 S**\
   若应用需要独立查询其满足条件、参与对象与性质，可将其作为状态分析。状态被记录，不等于目标已验证达成。

6. **检修功能或目标 F**\
   描述期望效果；M 是一次可能的实现尝试。F 与 M 不应使用同一身份。

若选择 GFO-light，必须使用该版本的 Continuant、Process、State、Role 等语义。若选择 GFO-base 的 presential/persistant 路线，则需要另写完整映射，不能把两条路线的类混成一个层次。

验证问题至少包括：

- 更换一个部件后，D 是否仍是同一设备？
- 第二次检修如何与 M 区分？
- T 是否只在 M 的某一阶段担任负责人？
- 一个温度值是目标值、实测值还是估计值？
- 两个同时间戳记录是否真在同一时间边界描述同一对象？
- 缺少结束记录，是否只意味着结束时间未知？

这些答案来自领域依据，不由 GFO 自动提供。

## 12. 面向 AI 的采用与核验规则

以下为本参考的工程整理。

### 12.1 先决定所需解释层次

明确任务是需要：

- 基础概念辨析；
- 上层类型对齐；
- 当前 OWL 实现；
- 过程与时间分析；
- 角色或功能模式；
- 还是完整的领域本体推理。

仅需要角色语义，并不意味着必须导入整套时间与空间理论。

### 12.2 固定版本及依赖闭包

记录论文版本、仓库提交、命名空间、versionIRI、imports 和本地扩展。

一个文件固定到提交，不代表其中指向非版本化 IRI 的 imports 也自动固定。应分别核验其解析结果与实际导入内容。

### 12.3 逐项写出映射依据

每项映射至少说明：

- 本地概念定义；
- 官方目标概念及版本；
- 是等价、子类、关联还是仅作参考；
- 是否保留身份与时间语义；
- 有哪些附加承诺；
- 有哪些不能映射的差异。

### 12.4 区分描述、逻辑与数据验证

必须分别检查：

1. 自然语言是否清楚；
2. 正式表达是否符合预期；
3. 实际数据是否满足应用要求；
4. 推理器是否支持采用的构造；
5. 真实任务是否得到正确答案。

OWL 的存在或基数限制不应自动解释为数据库必须已经显式存有所有值。开放世界下的可满足性，与表单完整性、数据质量校验，是不同问题。

### 12.5 不把理论承诺当作证据

不能由本体结构推出：

- 未观察到的过程已经发生；
- 角色当前仍有效；
- 同名对象具有相同身份；
- 目标已实现；
- 没有记录结束就永远有效；
- 引用某来源就意味着来源正确。

## 13. 适用范围与不适用的捷径

GFO 值得重点考虑的情形：

- 对象在变化中保持身份。
- 需要区分过程、阶段和瞬时呈现。
- 角色依赖不同关系或社会情境。
- 多方关系有独立身份。
- 性质及其值需要时间和来源。
- 功能、实现、目标与结果容易混淆。
- 复杂活动需要明确情境整体与内部组成。

不应采用的捷径：

- 把 Persistant 与 Continuant 当作无条件同义词。
- 混用 GFO-base 和 GFO-light 的 State。
- 将 presential 当作数据库快照记录。
- 将 coincidence 当作身份相等。
- 将所有角色无差别套入同一形式依赖关系。
- 将所有关系都实体化成 relator。
- 把理论中的高阶类别直接当成普通业务类型。
- 将某个简化实现声称为完整 GFO。
- 把官方提供的特定模式默认施用于所有本地数据。

本参考对理论事实的说明以明确标注的原始来源为依据；教学例、采用流程与核验清单属于整理建议。是否适用于具体领域，仍需通过能力问题、实例、反例与实际实现验证。

## 14. 来源与许可

- Herre 等，*GFO Part I: Basic Principles, Version 1.0.1*：[2007 原始报告](https://www.onto-med.de/sites/www.onto-med.de/files/files/uploads/Publications/2007/gfo-part1-v1-0-1.pdf)。
- Herre，*Persistence, Change, and the Integration of Objects and Processes…*：[2013 论文](https://arxiv.org/pdf/1311.1632)。
- Baumann 与 Herre，*The Axiomatic Foundation of Space in GFO*：[2011 预印本](https://arxiv.org/pdf/1110.5832)。
- Loebe、Burek、Herre，*GFO: The General Formal Ontology*：[2022 期刊入口](https://doi.org/10.3233/AO-220264)。
- 同作者，*GFO: The General Formal Ontology, extended abstract*：[2024 作者摘要](https://ceur-ws.org/Vol-3882/journal-first-4.pdf)。
- [GFO 固定仓库](https://github.com/Onto-Med/GFO/tree/233b38dcabf3656b46e3f54d0c73f76aaee73227)。
- [GFO-light 固定仓库](https://github.com/Onto-Med/gfo-light/tree/1ca9d8d00997630e5d910a6376fec2f57ffbfc03)。

GFO 与 GFO-core/light 的所读本体文件标注 CC BY 4.0。使用或改编这些内容时应保留作者、来源、许可及修改说明；论文则应分别按各自许可处理。本参考是中文解释与重新组织，原作者不因此为本参考的教学例或本地建模方案背书。
