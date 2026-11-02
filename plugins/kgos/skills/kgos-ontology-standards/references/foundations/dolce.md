# DOLCE：按变体使用原始理论

固定版本、许可及全部文件见 [DOLCE 原件目录](../source-index/dolce.md)。本文件是 KG OS 适配；原始模块与归档保留原样。

## 先选择变体

读 [OWL 原说明](../upstream/dolce/OWL/readme.md)，明确本次采用 basic、naryRel、epistemic 或 experimental tweaks，以及版本。basic 3.5、naryRel 4.5、epistemic 0.7、tweaks 0.1 的完整文件均在目录中；Archives 只作历史比对；其中 2.2/2.3 的 RDF/XML 在本次静态解析中被 rdflib 7.6.0 拒绝，保留原件而不称其为可载入的现行模型。FOL simple 和 simpleNary 各有自己的公理/模型输入，不是把两个文件拼起来使用。

需要 FOL 语义时读取完整 [simple FOL](../upstream/dolce/FOL/DOLCEsimpleFOL/DOLCEsimpleFOL.in) 或 [simpleNary FOL](../upstream/dolce/FOL/DOLCEsimpleNaryFOL/DOLCEsimpleNaryFOL.in) 中相关定义与公理。需要 OWL 映射边界时读 [原证明说明](../upstream/dolce/OWL/Proof/readme.md) 及对应证明文件，不从上游声称证明通过推断本轮已重跑。epistemic FOL 目录的空说明不能作为已有理论证据。

原 FOL 文件头明确列出相对 DOLCE D18 的简化，包括较弱的 mereology、缺失部分空间公理，以及移除 modal 结构后的依赖简化。完整保留 SIMPLE 文件不等于完整保留 D18 理论；依赖被移除公理的设计须标明缺口。D18 外部报告未因在文件头被引用就获得本包分发许可。

需要应用方法时，从原件目录的 example-and-support 类选择完整 `OWL/UC/` 或 `Tutorial/FOIS2024/` 的 OWL/SPARQL 对。构成、时间、性质等题材要分别读取其案例；SPARQL 是原环境查询资料，不是可直接发送到 KG OS 的 Cypher。

## 分析与映射

按所选模块的定义区分 endurant、perdurant、quality、quality region/abstract 及参与、构成、部分关系。一个对象被同一材料构成，不自动与该材料同一；对象的性质、性质值以及性质值空间也不是同一实体。先核对持续身份、时间条件和依赖，再选择字段和图结构。

binary 与 n 元/时间化关系要保持原参数语义。一个关系事实若需要多个端点、独立时间或证据，可用有身份的 Node 加明确参与边表达；不能把 n 元关系任意拆为二元边后仍声称保留所有约束。若本次只承诺一个明确二元事实，关系 Property 可以保留其条件，但要说明丢失的表达范围。

simpleNary 原文件把 reified relationships 明定为表达关系陈述的技术补充，不是新的 genuine ontological category。将其映射为 KG OS Node 时保留这一表示层含义，不能因此等同于 UFO 的 relator 或任意新增一种领域实体。

按 import 链选择依赖：naryRel 依赖 basic，epistemic 依赖 naryRel/4.5，tweaks 依赖 naryRel；文件均在包内，原 IRI 不因离线打包被改写。Review 同时检查原定义、公理/案例、KG OS 图结构和实际 Knowledge；类互斥、量化、时间全称或推论不是 KG OS 自动执行能力，未实现承诺逐项列出。
