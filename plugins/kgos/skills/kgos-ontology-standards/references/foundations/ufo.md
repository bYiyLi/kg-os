# UFO：身份、类型与关系的使用路径

这里的材料分别是作者 FOL 形式化、gUFO 轻量实现和事件扩展；它们不等于完整 UFO-A/B/C。版本、许可和缺口分别见 [形式化目录](../source-index/ufo-formalization.md)、[gUFO 目录](../source-index/gufo.md)、[事件扩展目录](../source-index/gufoevents.md) 及 [论文目录](../source-index/gufo-paper.md)。本文件为独立 KG OS 适配。

## 选择与读取

- 需要原始类型、身份、刚性、sortality、依赖或 relator 的形式约束时，读取 [作者形式化报告](../upstream/ufo-formalization/formalization.pdf) 的对应节与 `src/axioms/` 的同主题 TPTP 原件；[逐页全文](../readable/ufo-formalization/formalization.pdf.md) 辅助定位。CLIF 和旧版材料另列，不默认合并。
- 需要实际轻量建模方法时，读完整 [gUFO usage guide](../upstream/gufo/docs/overview.md) 的相关章节和 [gUFO 完整声明/注释](../upstream/gufo/gufo.ttl)。需要区别理论与实现时，读 [gUFO 论文原件](../upstream/gufo-paper/2603.20948v1.pdf) 的对应章节或 [逐页全文](../readable/gufo-paper/2603.20948v1.pdf.md)。
- gUFO 示例的 HTTPS 导入别名与本地文件的 HTTP ontology identifier 不同；离线读取按 `sources.json` 的 `importAliases` 对应到 `upstream/gufo/gufo.ttl`，不改写原件或依赖在线重定向。需要应用对照时，从 [七例入口](../upstream/gufo/examples/README.md) 选择同类问题：类型、部分、性质、relator、事件、situation、高阶类型；读该例的完整教程和 `ontology.ttl`，不是只看标题。
- 需要显式表达创建、终止、重分类或性质变化时，再读 [gUFOevents 完整指南](../upstream/gufoevents/docs/overview.md)、[完整声明](../upstream/gufoevents/gufoevents.ttl) 及 [八例说明](../upstream/gufoevents/examples/README.md)。它依赖包内 gUFO 1.0.0；event-sourcing、SHACL、TPTP、Lean 是分开的扩展/检查材料，不因读取而执行。

## 决定对象与类型

先确定谁承担同一对象的持续身份，再判断分类是本质性的、可变的、依赖关系的还是跨种类的。依据所选原件区分 kind、subkind、phase、role、category、mixin/roleMixin；不要把这些词直接变成通用固定字段，也不要将所有分类降为任意字符串。

例如 Person 与 Employee 可有相同存储字段，但雇员资格依赖任职关系且可失去；这种成员条件与人的持续身份不同。是否用单一 Person Definition 加任职关系、独立 Employment relator，或有明确约束的独立角色表达，应由业务问题、所选理论承诺和 KG OS 实际能力决定；不能因字段相同而直接合并，也不能因名称不同机械拆型。

关系需要区分形式关系与有基础的物质关系、relator 及其参与者。relator 有独立身份/依赖、多个参与者或需关联证明时，不能仅压成无身份的边属性。事件、situation 和在某时适用的分类也不能互当别名。

## KG OS 映射与结果 Review

原类型/实例层次、刚性或高阶分类不会自动成为 KG OS Label 的语义。只对本次需要的对象、类型/分类实例和有据关系选择 Definition/Node/Relationship；按原件承诺明确分类成立条件和持续身份。不能靠多贴 Label 声称数据库已保证 anti-rigidity、sortal identity、existential dependence 或 mediation 的全部公理。

分别审查原约束的表达与执行：基本属性类型/必填/业务唯一键可交当前数据库合同，其余跨对象、时间、modal 和高阶条件需要具体查询/应用检查或标为未实现。完整 UFO-C 社会/意向理论不在所收子包范围，需要该部分时报告依赖缺口，不把 gUFO 的局部支持冒充完整理论。
