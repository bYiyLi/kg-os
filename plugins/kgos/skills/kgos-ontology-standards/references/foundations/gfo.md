# GFO：模块、报告与 KG OS 适配

<!-- cspell:words presentic presential persistant -->

现代模块阅读基线：Commit `233b38dcabf3656b46e3f54d0c73f76aaee73227`，`gfo.owl`/base 的 versionInfo 为 2024-11-18；situation 等模块各有自己的版本。Onto-Med Research Group，原 [CC BY 4.0 许可](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/LICENSE) 与 [CITATION.cff](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/CITATION.cff)。本页为独立导航与适配，按 [通用方法](../foundations.md#渐进读取方法) 选读。

## 固定原文结构

| 原始位置                                                                                                                                                                                                                     | 文件作用与读取条件                                                     | 范围与依赖                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [README](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/README.md)                                                                                                                            | 模块策略、FOL 公开边界及报告/历史实现入口                              | 模块可以独立选择，平行扩展不保证可一起采用                                 |
| [gfo.owl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/gfo.owl)、[modules/gfo-base.owl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl) | 前者是现代入口及版本/import 声明；后者包含基本类、关系、定义注释与公理 | base 是实际定义所在，不把只含 import 的入口当完整正文                      |
| [modules/situation/](https://github.com/Onto-Med/GFO/tree/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation)                                                                                                        | situation 及不同对象/时间/重实体化模式；按文件名和 ontology 注释选择   | 模块各有理论选择及版本，不合并所有模式；具体 IRI 阅读对应见下              |
| [modules/situation/examples/](https://github.com/Onto-Med/GFO/tree/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/examples)                                                                                      | 与所选模式配套的完整 Turtle 例及其 import 信息                         | 选择对应模式的例再读其前提，不因阅读而执行案例，不把其布局推广为全领域法则 |
| [qc_report/](https://github.com/Onto-Med/GFO/tree/233b38dcabf3656b46e3f54d0c73f76aaee73227/qc_report)                                                                                                                        | 原质量检查查询与 profile 说明，需要判断上游检查覆盖时读                | 不是理论教程，也不是本轮运行结果                                           |

理论说明另见原作者 [Part I 1.0 报告（2006-07-01）](https://www.onto-med.de/sites/www.onto-med.de/files/files/uploads/Publications/2006/om-report-no8.pdf) 及 [1.0.1 draft（2007-02-14）](https://www.onto-med.de/sites/www.onto-med.de/files/files/uploads/Publications/2007/gfo-part1-v1-0-1.pdf)。它们解释基本原则/概念，不等于现代 OWL 每个模块或完整 FOL 公理集；报告版本、权限与可用格式单独核对，不因引用获得再分发权。按原 README，原生 FOL 草稿未公开，Part II/III 不能当作已有完整材料；教程未完成的说明也不应虚构为指南。GFO-light 是独立简化实现，不默认为本基线替代。

## IRI 的固定阅读定位

下表只帮助找到原文，**不是运行时 import 配置**。根 [catalog-v001.xml](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/catalog-v001.xml) 只将 `https://w3id.org/gfo/core/` 指向不存在的 `modules/gfo-core.ttl`，没有 base 映射；不能依赖它，也不能把 legacy core 与 base 擅自判为等价。

| 原文中的 IRI                                                                             | 同一固定树的阅读位置                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://w3id.org/gfo`                                                                   | [gfo.owl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/gfo.owl)                                                                                                                                       |
| `https://w3id.org/gfo/base`                                                              | [gfo-base.owl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/gfo-base.owl)，声明同一 ontology identifier                                                                                       |
| `https://w3id.org/gfo/situation`                                                         | [gfo-situation.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation.ttl)                                                                                                 |
| `https://w3id.org/gfo/pattern/situation/simple`                                          | [gfo-situation-simple.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-simple.ttl)                                                                                   |
| `https://w3id.org/gfo/pattern/situation/object`                                          | [gfo-situation-object.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-object.ttl)                                                                                   |
| `https://w3id.org/gfo/pattern/situation/object-extended`                                 | [gfo-situation-object-extended.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-object-extended.ttl)                                                                 |
| `https://w3id.org/gfo/pattern/situation/presentic-simple`                                | [gfo-situation-presentic-simple.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-presentic-simple.ttl)                                                               |
| `https://w3id.org/gfo/pattern/situation/presentic-object`                                | [gfo-situation-presentic-object.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-presentic-object.ttl)                                                               |
| `https://w3id.org/gfo/pattern/situation/presentic-object-reified-presentic-objects`      | [gfo-situation-presentic-object-reified-presentic-objects.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-presentic-object-reified-presentic-objects.ttl)           |
| `https://w3id.org/gfo/pattern/situation/presentic-object-reified-presentic-attributives` | [gfo-situation-presentic-object-reified-presentic-attributives.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-presentic-object-reified-presentic-attributives.ttl) |
| `https://w3id.org/gfo/pattern/situation/time-extended`                                   | [gfo-situation-time-extended.ttl](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/gfo-situation-time-extended.ttl)                                                                     |

release IRI 在各固定文件的 versionIRI 中核对；配套例的 import 与 [原 examples catalog](https://github.com/Onto-Med/GFO/blob/233b38dcabf3656b46e3f54d0c73f76aaee73227/modules/situation/examples/catalog-v001.xml) 仅作交叉定位，不能据 catalog 猜不存在的文件或混用版本。

最新发现入口：[官方现代仓库](https://github.com/Onto-Med/GFO)、[原作者资料页](https://www.onto-med.de/ontologies/gfo/)。资料页还列有 2006/2008 历史 OWL，它们不是此现代模块树；页面最新字样不意味着新于本页基线。

## 分析与 KG OS 映射

按所选原定义区分 particular、universal/concept/symbolic structure，及 presential、process、persistant 等层次。特别是现代 base 将 `Persistant` 声明为 `Universal` 子类，并以 `instantiated_by` 关联至少一个 `Presential`；不能写成 particular，或直接当作“一个跨时间不变的普通对象”别名。具体依赖与时间条件回到其定义核对。

对象在某时的显现、持续身份、过程及情境按实际查询需求分别表达。若一个情境或时间阶段有独立身份、引用与关系需要，可有相应 Node；只有描述某个关联的条件时才选关系 Property，不把 presentic/persistent 区别压成无含义的日期字段。

Review 将选定报告/模块承诺映射到 KG OS 图、字段与真实数据，特别检查对象/过程层次、成员/实例化关系和时间作用域。模块中的量化、跨时身份、互斥与推论不是 KG OS 自动能力，列出数据库、查询、应用取证及未实现责任；导航不填补非公开 FOL 缺口。
