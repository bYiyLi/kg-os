# Graph Type、Schema、Constraint 和 Index

Cypher 25 当前图语法支持 Graph Type 的 `SET` / `EXTEND` / `ALTER` / `SHOW` / `DROP`，以及键、唯一性、存在性/类型约束和多种 Index 定义。具体语法与名称以 **Lithograph v0.3.1** 冻结兼容 Profile 为准。

KG OS 的 Ontology 定义与 Knowledge 实例不同：Ontology 高层 API 负责模型聚合和 canonical Patch；Cypher DDL 则通过 Lithograph 直接修改底层 Schema。**直接修改 KG OS 内部 Schema/Binding 可能造成高层 Ontology 无法解释的 Snapshot**。不能凭 `graph.execute` 成功就认定所有高层模型仍一致。

可使用查询 `SHOW INDEXES`、`SHOW CONSTRAINTS`、`SHOW CURRENT GRAPH TYPE` 了解当前图的 Schema。Index 类型包括 Lookup、Range、Text、Point、Full-text、Vector。功能支持不代表所有 Index 配置在 KG OS 高层 Ontology 的简化配置中都可编辑。

在 KG OS 上定义业务模型优先参考 `sdk/ontology/read.md`、`sdk/ontology/patch.md` 和 `guides/objects.md`；直接 Cypher DDL 应仅在用户明确要求数据库级操作时使用 `kgos_run`。
