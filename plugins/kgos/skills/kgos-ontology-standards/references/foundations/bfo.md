# BFO：选择原件并形成 KG OS 模型

固定来源、许可和完整文件表见 [BFO 原件目录](../source-index/bfo-2020.md)。以下是 KG OS 适配，不能替代 BFO 原定义或公理。

## 选择与读取

- 确认采用 BFO 2020 的具体版本及 core/atemporal/temporalized profile。先读 [原目录说明](../upstream/bfo-2020/21838-2/README.md) 和 [OWL 说明](../upstream/bfo-2020/21838-2/owl/README.md)，再读取所选完整 [core Turtle](../upstream/bfo-2020/21838-2/owl/bfo-core.ttl) 或 [RDF/XML](../upstream/bfo-2020/21838-2/owl/bfo-core.owl)。同一语义的多种语法不是多个要一起导入的模型。
- 要判断原始公理、依赖或时间关系时，从 [CLIF 说明](../upstream/bfo-2020/21838-2/common-logic/README.md) 选择相关子理论；不能从 core OWL 推断全部一阶承诺。具体路径均在原件目录的 axiom-or-model 类中。
- 要选择时间化关系时，读 [时间扩展原始说明](<../upstream/bfo-2020/21838-2/owl/profiles/temporal extensions/README.md>) 及其所选 OWL/CLIF，不默认把扩展或 `contrib` 当核心。
- 要了解原方法的实际应用，读完整 [案例 PDF](<../upstream/bfo-2020/documentation/user guides/ontology developer guide/Basic Formal Ontology Case Studies.pdf>) 的相关案例；[全文逐页提取](<../readable/bfo-2020/documentation/user guides/ontology developer guide/Basic Formal Ontology Case Studies.pdf.md>) 可辅助定位，图与公式回到原件核对。

## 身份与关系判断

先判断对象是持续存在的实体还是在时间中展开的发生体，再按原定义核对独立/依赖方式、参与或实现关系。不要把“记录是文本”当作所述业务对象的本体类别；来源载体、载体表达的内容及内容描述的事件要分别识别。角色、功能、性质与承载者不能仅凭同一个名称合并。

为每个相关判断记录原类/关系标识和依据。例如原件中 role 与 bearer 的依赖及 realization 的不同，可能要求分别表达角色承载与实际发生；只有当前问题确实需要对应事实时才引入结构。对持续体在不同时间的性质或关系，先确定所选 profile 的时间承诺，不把提交时间代替业务时间。

## KG OS 映射与结果 Review

持续对象、发生事实或有独立身份的依赖对象映射为相应 Node；参与、承载、实现等按明确业务谓词表达真实边。时间限定能忠实归属于一条关联时可以放关系 Property；若理论承诺需要独立的关系发生、证据或时间身份，再以相应 Node 表达。不能用一条无时间的边声称实现了所有时间量化公理。

将原公理逐项标为数据库可保证、查询可检查、应用需取证或未实现。KG OS 不因使用 BFO 名称自动执行类互斥、所有时刻约束、传递闭包或 FOL 证明；需要这些承诺时给出实际执行办法或保留缺口。Review 对照原件、类型说明、图、字段和实际数据，特别检查持续身份、角色/过程区分及时间作用域。
