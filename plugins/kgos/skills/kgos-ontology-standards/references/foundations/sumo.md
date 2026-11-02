# SUMO：原始模块、语言资料与 KG OS 适配

固定 Commit `8bb7a9c3ec423f48ea946c3da74c994b8341934d`。SUMO 核心的 IEEE 条款、MILO 的原作者通知及仓库 GPL/署名条款分别见原文件头和 [README.txt](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/README.txt)；上游未统一指明 GPL 版本，不能改称本项目商业许可或通用 CC。这里是原文索引，不复制整个上层/领域/WordNet 语料。读取规则见 [通用入口](../foundations.md#渐进读取方法)。

## 固定原文结构

| 原始位置                                                                                                                                                                                                                                                                                                                                                    | 文件作用与读取条件                                                                           | 范围/依赖                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [README.txt](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/README.txt)                                                                                                                                                                                                                                               | 许可通知、SUO-KIF/WordNet 文件形式、开发目录与官方资料入口                                   | 外部开发工具只作原资料链接，不要求安装                                              |
| [Merge.kif](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/Merge.kif)                                                                                                                                                                                                                                                 | 完整上层定义与公理；按术语定位 documentation、instance/subclass、domain/range 及相关量化规则 | 连同否定、量词和前提读，不抽成无约束术语表                                          |
| [Mid-level-ontology.kif](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/Mid-level-ontology.kif)                                                                                                                                                                                                                       | 上层不足且需要中层概念时，按模块注释及相关术语补读                                           | MILO 依赖上层 Merge；不能将中层文件当独立完整 SUMO                                  |
| [tinySUMO.kif](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/tinySUMO.kif)、[tinyHOL.kif](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/tinyHOL.kif)、[tinyIntSUMO.kif](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/tinyIntSUMO.kif) | 小型语言/表达对照，需要理解其演示的结构时读                                                  | 教学/特定逻辑材料，不替代 Merge 全部公理                                            |
| [仓库根目录](https://github.com/ontologyportal/sumo/tree/8bb7a9c3ec423f48ea946c3da74c994b8341934d)                                                                                                                                                                                                                                                          | 按真实领域文件名和文件头说明选择领域扩展，再追踪其所用核心/中层术语                          | `Geography.kif`、`FinancialOntology.kif` 等只是实际文件示例，不是封闭分类或必读清单 |
| [Translations/](https://github.com/ontologyportal/sumo/tree/8bb7a9c3ec423f48ea946c3da74c994b8341934d/Translations)、[WordNetMappings/](https://github.com/ontologyportal/sumo/tree/8bb7a9c3ec423f48ea946c3da74c994b8341934d/WordNetMappings)、[mappings/](https://github.com/ontologyportal/sumo/tree/8bb7a9c3ec423f48ea946c3da74c994b8341934d/mappings)    | 需要自然语言表达、词义映射或外部对齐时选相关资源及说明                                       | 词汇映射不自动等于业务对象身份或类成员事实                                          |
| [SimpleFacts/](https://github.com/ontologyportal/sumo/tree/8bb7a9c3ec423f48ea946c3da74c994b8341934d/SimpleFacts)、[development/](https://github.com/ontologyportal/sumo/tree/8bb7a9c3ec423f48ea946c3da74c994b8341934d/development)                                                                                                                          | 需要事实材料或开发中扩展时查目录及具体文件                                                   | 开发中内容不默认为稳定理论；按其本身前提与来源判断                                  |
| [tests/tq_notes.txt](https://github.com/ontologyportal/sumo/blob/8bb7a9c3ec423f48ea946c3da74c994b8341934d/tests/tq_notes.txt)、[tests/](https://github.com/ontologyportal/sumo/tree/8bb7a9c3ec423f48ea946c3da74c994b8341934d/tests)                                                                                                                         | 理解上游查询、答案/问题文件形式，或审查某项具体示例时按目录选择                              | 原测试/证明语料只供阅读，不能从存在 expected/proof 输出推断本轮已执行               |

最新发现入口：[官方仓库](https://github.com/ontologyportal/sumo)、README 指定的 [SUMO 官网](https://www.ontologyportal.org/)。官网若受访问限制，不能据此认定资料不存在，按通用读取边界报告依赖该网页的结论。索引覆盖原始目录入口，不宣称已核读所有领域、词义映射或证明语料。

## 大文件与原文符号

固定 Merge（657,674 bytes）和 MILO（1,194,157 bytes）均能严格 UTF-8 解码并往返到原始 Git 字节。GitHub Contents 对 MILO 可能返回空内容，不能据此认定原文不存在。需要该入口且宿主具有相应能力时，可按固定树的对象定位读取：

| 文件                   | 此 Commit 中的 Git blob SHA                |
| ---------------------- | ------------------------------------------ |
| Merge.kif              | `e02fe406b2d038bf19203b3f021a895ec03d22e7` |
| Mid-level-ontology.kif | `5dcace648603db93bf0febb6281b1b9d21a70fc2` |

这些 SHA 用于取原文，不是下载/执行指令，也不保证任一接口支持大文件或分段。若接口仍不可用或超出读取限制，报告受影响的定义/公理，不能改读浮动版本或声称已读全。Merge 第 11 行的一个 U+FFFD 已在固定上游原件中（UTF-8 `EF BF BD`，零起始 byte offset 418），MILO 无此字符；不要猜测替换，或将整份文本按 CP1252/Latin-1 重解码。公理中的变量、符号、数量和否定不能忽略。

## 分析与 KG OS 映射

先区分 class、instance、关系及其参数条件，检查关系的 arity、domain/range 与量化范围。`subclass` 与 `instance` 的原语义不能机械等同 KG OS 的 Definition 与 Knowledge；先明确本次要表达哪种对象和分类承诺。

多参数关系可按需要重实体化为有身份的事实 Node 加明确参与边；只有确实是某条二元关联的描述时才选关系 Property。不能因减少字段而丢失参数、时间或量词，也不能从相同参数形状推断同一关系语义。SUO-KIF 的规则不会因原样放入正文而被执行；Review 区分实际数据库约束、查询/应用核实以及未实现推论。
