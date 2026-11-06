# SUMO：面向 AI 本体建模的参考

核读日期：2026-11-04。\
性质：依据原始论文和官方源码整理的中文参考，不是官方译本，也不是完整公理文件的替代品。

## 1. SUMO 是什么

SUMO 的全名是 Suggested Upper Merged Ontology。它以跨领域的上层概念、关系和逻辑公理，为更具体的领域本体提供共同基础。应将 SUMO 理解为一套可用于推理的逻辑理论，而不只是概念目录、分类树或一组数据库表。

最初的工作合并并协调了多种既有本体内容。Niles 与 Pease 的 2001 年原始论文解释了其合并动机，以及概念完全重合、部分重合、缺少对应项和不宜纳入等不同情形。该论文反映的是当时版本，不能用其中的分类图替代今天的正式源码。[原始论文](https://nlp.ontologyportal.org/FOIS.pdf)

对 AI 建模而言，SUMO 的主要价值在于：

- 通过已有形式定义检查本地概念究竟指什么。
- 区分实例、类型、属性、关系、对象和过程。
- 利用关系参数约束与公理审查建模后果。
- 为跨领域概念对齐提供有语义依据的候选。
- 将部分自然语言问题转化为明确的逻辑问题。

使用 SUMO 不等于证明领域数据真实，也不自动证明采用后的检索或推理效果优于原方案。

## 2. 本参考采用的版本与来源

### 2.1 可执行定义的主要依据

官方仓库：ontologyportal/sumo。

本次固定提交：

`52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa`

该提交时间为 2026-11-03。正文涉及当前实现的判断以这一提交的文件为准：

- [Merge.kif](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/Merge.kif)：上层本体及基础公理。
- [Mid-level-ontology.kif](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/Mid-level-ontology.kif)：中层内容的入口，具体采用时仍须读取所用定义。
- [README.txt](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/README.txt)：仓库组织与工具说明。
- [WordNet 映射说明](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/WordNetMappings/README.txt)。
- [贡献与验证要求](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/CONTRIBUTING.md)。

固定提交只固定了这些文件的内容。实际推理还需要记录加载文件集合、翻译器、推理器和运行配置。

### 2.2 解释性原始文献

- Niles, I. & Pease, A.，2001，*Towards a Standard Upper Ontology*：[论文](https://nlp.ontologyportal.org/FOIS.pdf)。
- Niles, I. & Pease, A.，*Linking Lexicons and Ontologies: Mapping WordNet to the Suggested Upper Merged Ontology*：[论文](https://nlp.ontologyportal.org/Niles-IKE.pdf)。
- Pease, A.，2023，*Converting the Suggested Upper Merged Ontology to Typed First-order Form*，arXiv:2303.04148v1：[论文](https://arxiv.org/pdf/2303.04148)。

这些文献分别用于理解历史设计、词义映射与逻辑翻译，不应将三个时期的实现细节混成一个不存在的统一版本。

## 3. 表达语言：先理解逻辑，再理解图

SUMO 的原生文件使用 SUO-KIF，即 Standard Upper Ontology – Knowledge Interchange Format。其表达采用括号式前缀语法，可以表达量化、条件、否定、函数项和关于关系的陈述。

基本阅读方式：

- `(instance a C)`：a 是 C 的实例。
- `(subclass C D)`：C 的每个实例也是 D 的实例。
- `(r a b)`：关系 r 对有序参数 a、b 成立。
- `(=> P Q)`：P 蕴含 Q。
- `(and P Q)`、`(or P Q)`、`(not P)`：合取、析取、否定。
- `(forall (?x) P)`、`(exists (?x) P)`：全称与存在量化。
- `?x` 是变量，不是现实对象的名称。

这些形式不是可随意互换的图边。尤其要区分：

1. **谓词应用**形成可真可假的公式。
2. **函数应用**形成指称对象或数值的项。
3. **自然语言文档字符串**解释含义，但不是所有解释都已经被完整形式化。
4. **注释**不参与加载后的理论。

SUMO 包含高阶内容。Pease 的 2023 年翻译论文明确指出，转换到一阶表示时会丢失严格高阶内容。因此，原生 SUO-KIF、TPTP FOF、TFF、THF 或其他投影不应被默认视为完全等价。[逻辑翻译论文](https://arxiv.org/pdf/2303.04148)

对 AI 的实际要求是：在声称“该结论可由 SUMO 推出”前，明确采用的表达版本、实际加载的公理与推理配置。

## 4. 本体组织与主要概念

### 4.1 上层、中层与领域内容

官方仓库同时包含上层文件、中层文件、领域文件、词义映射、测试与仍在发展的内容。README 明确将新而不成熟的知识放在 development 目录。

因此，发现一个同名术语并不足以决定采用：

- 它可能来自某个领域文件，而不是上层核心。
- 它可能依赖其他文件。
- 它可能处于尚未成熟的目录。
- 它的定义可能只适用于特定领域或建模粒度。

应先记录术语的来源文件与依赖，再决定本地采用范围。[仓库说明](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/README.txt)

### 4.2 当前源码中的概念骨架

以下是所核读 Merge.kif 的主要入口，不是完整类层次：

- **Entity**：根类。
- **Physical**：具有时空位置的实体。
- **Abstract**：抽象实体，包括属性、数量、关系等。
- **Object**：通常意义上的对象，也包括地理区域等。
- **Process**：发生并具有时间部分或阶段的事物。
- **Collection**：具有时空位置的集合体，成员变化不必改变集合体身份。
- **Attribute**：用于表达性质，而未将其重构为对象子类的概念。
- **Quantity**：数量相关入口。
- **SetOrClass、Set**：集合相关入口。
- **Relation、Predicate、Function**：关系、成句运算与成项运算。
- **Proposition**：信息内容，与表达它的具体载体区别开来。

**必须注意版本差异：**

在本次固定版本的 Merge.kif 中：

- `Entity` 到 `Physical`、`Abstract` 的 partition 是有效语句。
- `Object`、`Process`、`Collection` 都有通向 `Physical` 的有效 subclass 声明。
- `partition Physical Object Process` 被注释。
- `partition SetOrClass Set Class` 和 `subclass Class SetOrClass` 被注释。

所以，不能仅凭旧论文或旧图声称当前加载理论仍明确执行了相同划分；也不能把文档字符串中出现的 `Class` 直接当作当前文件已经启用的同名元类。上述观察只针对该固定文件，不替代对完整加载集合的检查。[固定版本源码](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/Merge.kif)

### 4.3 四种容易混淆的关系

- **类型归属**：这块电池是某类电池的实例。
- **子类关系**：某种电池是更一般电池类型的一种。
- **组成关系**：一个部件是某个对象的一部分。
- **集合成员关系**：某件工具是某个工具集合的成员。

SUMO 中 `instance`、`subclass`、`part`、`member` 分别承担不同责任。把它们统一为“属于”，会丢失推理所需的语义。

例如，某人属于某组织，不自动意味着此人是“组织类型”的实例，也不自动意味着此人是该组织的物理部件。

## 5. 类型、关系与约束

### 5.1 实例与子类

`instance` 不要求一个对象只有一个类型，也不表示所给类型必定是最具体类型。

`subclass` 允许多继承。它表达实例集合之间的包含后果，不表示两个概念只是文字上相似。

判断本地类型是否可成为某 SUMO 类型的子类时，应问：

> 本地类型的每一个允许实例，是否都满足该上层类型的定义与约束？

如果只在部分情形成立，就不能直接建立无条件 subclass。

### 5.2 关系参数位置

`domain` 根据参数位置说明实例类型约束；`domainSubclass` 则要求该参数是某类型的子类。两者不能混用。

例如：

- 要求“某个过程实例”的参数；
- 要求“某种过程类型”的参数；

在自然语言中可能都写作“过程”，但形式表达的层次不同。

函数的 `range` 与 `rangeSubclass` 也有相应区别。`valence` 说明固定元数，变元关系不能被机械当成二元边。

### 5.3 子关系

`subrelation` 表示子关系成立时，相同参数元组上的上位关系也成立。因此，必须核对：

- 参数个数；
- 参数顺序；
- 参数类型；
- 子关系到上位关系的真正蕴含。

仅因两个关系都涉及相同对象，不能推断它们具有子关系关系。

### 5.4 不相交与穷尽

- `disjoint`：不共享实例。
- `disjointDecomposition`：所列子类两两不相交。
- `exhaustiveDecomposition`：所列子类覆盖上位类。
- `partition`：同时要求覆盖与互斥。

设计者列出的几个例子通常不是完整 partition。把示例清单误作穷尽划分，会排除原本合法的未知或未来类型。

以上均应结合实际公理，而不是仅根据自然语言说明理解为某数据库已经实施的校验。[结构关系定义](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/Merge.kif)

## 6. 对象、过程与参与者

SUMO 用过程实例承载具体发生，用 CaseRole 关系说明参与者以什么方式参与。

常用关系包括：

- `agent`：过程中的主动决定者，当前参数约束指向 AutonomousAgent。
- `patient`：过程所涉及、作用于或经历的对象；不要求一定发生结构变化。
- `instrument`：被行动者用于促成过程、且不被该过程改变的工具。
- `result`：过程产生的结果。
- `subProcess`：过程的时间部分，可以是真部分，也可以不是。
- `causes`：过程实例之间的致因关系。
- `capability`：对象具备在某种过程类型中承担指定角色的能力。

这些关系不能互相替换：

- 参与不等于主动实施。
- 被使用不一定符合 instrument 的“不被改变”条件。
- 过程结束后的对象不一定就是该过程的 result。
- 能够执行不等于已经执行。
- 时间在前不等于导致后者。
- 过程类型不是某次过程实例。

对 AI 提取而言，应将“计划检查”“正在检查”“已经检查”和“具备检查能力”保留为不同内容；不能只因它们都出现“检查”而合并成一个过程事实。

## 7. 时间、数量、属性与信息内容

### 7.1 时间

SUMO 区分 TimePoint 与 TimeInterval。时间点没有持续长度；时间区间具有延展与位置，源码中的 TimeInterval 为无间隙的凸区间。

需要区别：

- `time`：某 Physical 在指定时间存在或发生。
- `WhenFn`：对象或过程存在的确切时间区间。
- `holdsDuring`：某公式表达的命题在指定时间范围内成立。

因此，“对象存在于某日”与“某属性在某日成立”不是同一问题。系统记录时间、来源发布时间、业务有效时间也不应直接混用。

### 7.2 数量

纯 Number 与带量纲的 PhysicalQuantity 不同。`MeasureFn` 将数值与计量单位组合成数量项。

例如 `(MeasureFn 12 Kilogram)` 表达 12 千克，而不是一个没有单位的数字 12。

建模时仍需额外明确：

- 测量什么；
- 测量对象的身份；
- 测量时间；
- 来源与精度；
- 是实测值、估计值还是要求值。

数量词汇本身不替代这些证据条件。

### 7.3 属性

Attribute 的建模价值是避免将每一种性质都变成对象类型。另一方面，若某种性质需要独立生命周期、来源或变化记录，也不能仅凭“SUMO 有 Attribute”便强行压成一个简单字段。

当前源码中的 `attribute` 以 Object 为首参数类型；更一般的 `property` 以 Entity 为首参数类型。使用时应核对具体关系，而不是把两者当作拼写变体。

### 7.4 信息内容与载体

Proposition 表达信息内容；ContentBearingObject 等概念表达承载或表达内容的对象。一个命题可以有多种表达形式，两个文档也可以表达相同命题。

本地模型需要分别考虑：

- 文档或载体身份；
- 文档版本；
- 其中表达的主张；
- 主张所涉及的对象；
- 对主张真实性的判断。

“某文档写了 P”不推出 P 为真。SUMO 的信息内容区分可以帮助分析这个问题，但不能代替来源核验。[相关定义](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/Merge.kif)

## 8. WordNet 映射应如何使用

WordNet 是词义资源，SUMO 是本体理论。二者的映射连接的是词义与本体概念，不是把词形直接变为现实事实。

原始映射论文区分：

- 同义或等价映射；
- 映射到更宽泛概念；
- 映射到某类型的实例。

因此：

- “相关”不能自动提升为“等价”。
- 指向上位概念不证明两者范围相同。
- 表示特定实体的词义不能误建为类。
- 同一词形的不同义项必须依据上下文区分。[映射原始论文](https://nlp.ontologyportal.org/Niles-IKE.pdf)

固定仓库的映射 README 还说明，映射可指向 SUMO、中层或领域本体中的术语，并要求映射版本与 WordNet 数据版本匹配。[固定映射说明](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/WordNetMappings/README.txt)

对 AI，WordNet 映射适合用来发现候选术语，不应单独用作建立强等价关系的证据。

## 9. 教学例：检查活动

以下是本参考构造的假设性示例，不是官方领域扩展，也未提交给推理器执行。

~~~lisp
(subclass LocalInspection Process)

(instance Inspection001 LocalInspection)
(instance Inspector001 AutonomousAgent)
(instance Battery001 Object)

(agent Inspection001 Inspector001)
(patient Inspection001 Battery001)

(measure Battery001 (MeasureFn 12 Kilogram))
~~~

这组表达有意区分：

- LocalInspection：本地过程类型。
- Inspection001：某次检查。
- Inspector001：参与者。
- Battery001：被检查对象。
- 12 千克：数量，而不是电池身份。

它没有表达以下事项：

- 检查是否成功；
- 检查何时发生；
- 重量是否由此次检查测得；
- 测量是否可信；
- 电池是否满足某个要求。

这些缺失不能靠模型自行补全。若任务需要回答，必须再设计相应的事实、关系和证据表达。

同样，若有本地类型 `LocalDetailedInspection`，可在定义与实例边界确认后考虑：

~~~lisp
(subclass LocalDetailedInspection LocalInspection)
~~~

不能仅凭“详细检查听起来像检查”就跳过语义核验。

## 10. 将 SUMO 用于本地建模

以下流程是本参考的工程整理，不是 SUMO 官方规定的逐字方法。

1. **写出实际问题。**\
   例如：查某设备参与过哪些检查、谁实施、用了什么、产生了什么。

2. **识别候选对象与关系。**\
   先确定真实身份与变化边界，不从名词列表直接生成类。

3. **查同一版本的定义。**\
   同时阅读术语说明、上位类型、参数约束、关键公理和依赖。

4. **区分复用方式。**\
   可以是直接采用、建立本地子类、建立子关系、保留较弱映射，或仅作概念分析参考。

5. **列出承诺与排除项。**\
   例如，采用某关系是否额外要求主动者、时间、量纲或不相交性。

6. **用正常例和反例测试。**\
   包括角色改变、重复发生、身份未明、信息缺失及互相冲突的来源。

7. **验证后再映射技术结构。**\
   若转为属性图、关系表或 OWL，明确保存了什么、遗漏了什么、哪些规则需要另行实现。

不能把本地 KG OS Domain、标签或字段与 SUMO 同名词直接等同。名称相同不构成语义等价。

## 11. 验证标准与常见误用

### 应记录的验证材料

- 固定 SUMO 提交与实际加载文件。
- 本地新增定义和公理。
- 每个能力问题及其形式表达。
- 预期可推出的结论。
- 预期不可推出或应冲突的反例。
- 翻译器、推理器、版本、参数与时限。
- 实际证明、反模型、超时或未知结果。

官方贡献指南要求报告逻辑矛盾时提供证明、具体输入文件、调用方式与推理器版本；新增推理功能时，也鼓励提供新结论的证明。[官方验证要求](https://github.com/ontologyportal/sumo/blob/52f2aceaf2dcd790310a2c4d5ee7832e3bca71aa/CONTRIBUTING.md)

### 常见误用

- 只采用类名，不采用其语义约束。
- 将 subclass、instance、part 和 member 合并。
- 根据词义映射直接建立严格等价。
- 将旧论文图中的关系当作当前有效公理。
- 把注释中的公式当作实际加载公式。
- 将自然语言说明视为已经完整实现的机器约束。
- 把一次推理超时解释成命题为假。
- 把未发现矛盾解释成已经证明整个理论一致。
- 把属性图遍历结果称作 SUMO 逻辑证明。
- 将能力、计划或意图直接转为既成过程。

## 12. 使用与引用边界

SUMO 适合帮助澄清语义和组织推理，但并不替代领域调查、证据判断、业务规则设计或具体应用验收。

Merge.kif 文件头载有 IEEE 版权及允许复制、分发、衍生并要求适当署名的许可说明；仓库 README 对代码另有许可说明。采用或分发具体内容时，应保留相应文件的来源与许可，不能笼统宣称整个仓库“无版权限制”。

本参考依据 IEEE 所有的 SUMO 上层本体内容，以及 ontologyportal 维护者与上述论文作者的工作作中文解释和重新组织。原始公理的权威依据始终是所采用版本的源码。
