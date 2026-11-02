# GFO：按身份、时间与情境选择表达

固定来源、许可、完整模块与未公开部分见 [GFO 原件目录](../source-index/gfo.md)。这里采用现代模块仓库的固定 Commit；不把旧 2006/2008 文件、GFO-light 和现代模块混成同一版本。本文件是 KG OS 独立适配。

## 选择与读取

先读完整 [原 README](../upstream/gfo/README.md) 的使用、模块和理论可用范围，再按 [gfo.owl](../upstream/gfo/gfo.owl) 的导入与 [base 原件](../upstream/gfo/modules/gfo-base.owl) 读取本次相关定义/公理。根模型 revision 为 2024-11-18，base 和 situation 文件各自的版本也应保留，不能从根日期推断每份文件都同版。

离线读取 base 使用 [sources.json](../sources.json) 的独立 `importAliases`：`https://w3id.org/gfo/base` 对应 `upstream/gfo/modules/gfo-base.owl`，该文件的 ontology identifier 与导入 IRI 一致。不要依赖原始根 `catalog-v001.xml`：它只把 `https://w3id.org/gfo/core/` 指向该版本不存在的 `modules/gfo-core.ttl`，没有提供 base 映射。原 catalog 保持原样；这条失效历史记录不自动改指 base，也不表示用户应采用另一个理论模块。

需要情境、对象在某时刻的表达或关系重实体化时，从目录的 axiom-or-model 类选择 `modules/situation/` 的实际变体，再选 example-and-support 中配套实例。原 [案例 catalog](../upstream/gfo/modules/situation/examples/catalog-v001.xml) 给出导入 IRI 到本地文件的对应；这些文件均已保留。不能默认所有可选模式同时兼容。

## 身份与映射

依据原件区分有持续身份的对象、某时刻的 presentic 表现、过程及 situation；持续对象与它某一时刻的切片不能因名称相同或字段相同直接视为同一实例。区分 bearer、attributive、关系与参加关系的对象，先明确依赖和时间，再决定图表示。

尤其注意 base 原件使用 `Presential`（某时点完整存在的个体）及 `Persistant`：后者在此是其不同 presentials 实例所共享的 particular universal，用来解释持续身份，不是把普通领域对象直接改名为 Persistant。采用这一承诺时需明确表示实例化/持续关联的层次，或说明仅在领域层保留持续身份、尚未完整表达该高阶承诺；`modules/situation/` 的 presentic/object 模式也要按各自原件解释。

若选择 presentic/reified 模式，分别表达持续对象身份、时点/范围及相应状态或性质，避免将每次观察错误变成另一个持续对象；也不能将真正独立的过程压成当前状态 Property。只需单一事实且不承担独立身份的标量仍可用 Property，选择必须保持所承诺语义。

Review 逐项对应原定义/模式、KG OS Node/Relationship、时间和依赖条件、实际数据及执行责任。模型中的理论关系不使 KG OS 自动拥有 FOL、互斥/传递或所有时刻推理。上游说明原生 FOL 草稿尚未公开；依赖完整原生 FOL 或未获再分发许可的历史报告时，保留具体缺口，不能凭本包 OWL 说明宣称覆盖。
