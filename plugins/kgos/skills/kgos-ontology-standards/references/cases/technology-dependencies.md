# 案例 6：组件发行版与解析后的依赖

**需求**：区分组件与发行版、声明的版本需求与已实际解析到的版本；回答“某发行版实际依赖哪个组件的哪个发行版”。不实现版本范围解析器、兼容性证明或软件包管理器。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:Component

```yaml
name: "Component"
description: "独立的软件组件；名称不是发行版本。"
properties:
  - name: "componentKey"
    description: "组件登记键。"
    type: "STRING"
    required: true
    unique: true
  - name: "name"
    description: "组件展示名称。"
    type: "STRING"
    required: true
constraints: []
```

### node:Release

```yaml
name: "Release"
description: "一个组件的一次可独立引用的发行。"
properties:
  - name: "releaseKey"
    description: "发行登记键，在当前库中唯一；不是单独的版本字符串。"
    type: "STRING"
    required: true
    unique: true
  - name: "version"
    description: "发行者提供的版本文字；不同组件可以相同。"
    type: "STRING"
    required: true
  - name: "releasedOn"
    description: "已知发布日期，未知时缺省。"
    type: "DATE"
constraints: []
```

### relationship:RELEASE_OF

```yaml
name: "RELEASE_OF"
description: "发行归属组件，当前业务约定恰好一个，由采集校核而非 Schema 自动保证。"
from: "node:Release"
to: "node:Component"
properties:
  - name: "channel"
    description: "该发行的通道，如 stable。"
    type: "STRING"
    required: true
constraints: []
```

### relationship:DEPENDS_ON

```yaml
name: "DEPENDS_ON"
description: "从依赖方发行指向已解析的依赖发行；不是只写版本范围的声明。"
from: "node:Release"
to: "node:Release"
properties:
  - name: "requirement"
    description: "原声明需求，按发行方语法解释，不由本字段验证。"
    type: "STRING"
    required: true
  - name: "resolutionLocator"
    description: "锁文件或解析结果的证据定位。"
    type: "STRING"
    required: true
constraints: []
```

## 关键取舍与保证边界

发行版需要被独立依赖和查询，所以单独建 Node。`releaseKey` 来自可靠登记；真实系统采用组件+版本复合键也可以，但需要明确命名范围，不能把 version 全局 unique。RELEASE_OF 的“恰一归属”仍是应用约束。

DEPENDS_ON 只承载已解析事实，requirement 是当时声明，不保证依赖发行真满足兼容要求；其判断需要相应版本规则和验证。仅需记录未解析需求时，采用单独的需求记录/明确状态，不伪造已解析 Release 边。

## 合成实例（仅隔离测试）

```cypher
CREATE (a:Component {componentKey:'app',name:'Example App'}), (l:Component {componentKey:'lib',name:'Example Library'}),
       (ar:Release {releaseKey:'app:1.0',version:'1.0'}), (l1:Release {releaseKey:'lib:1.0',version:'1.0'}), (l2:Release {releaseKey:'lib:2.0',version:'2.0'}),
       (ar)-[:RELEASE_OF {channel:'stable'}]->(a), (l1)-[:RELEASE_OF {channel:'stable'}]->(l), (l2)-[:RELEASE_OF {channel:'stable'}]->(l),
       (ar)-[:DEPENDS_ON {requirement:'2.x',resolutionLocator:'lock:example-1'}]->(l2)
```

## 验证问题

### 实际依赖的组件、版本及证据是什么？

```cypher
MATCH (:Release {releaseKey:'app:1.0'})-[d:DEPENDS_ON]->(r:Release)-[:RELEASE_OF]->(c:Component) RETURN c.componentKey AS component, r.version AS version, d.resolutionLocator AS evidence
```

```json
{
  "columns": [
    "component",
    "version",
    "evidence"
  ],
  "rows": [
    [
      "lib",
      "2.0",
      "lock:example-1"
    ]
  ]
}
```

### 相同版本文字是否仍区分不同组件？

```cypher
MATCH (r:Release {version:'1.0'})-[:RELEASE_OF]->(c:Component) RETURN c.componentKey AS component ORDER BY component
```

```json
{
  "columns": [
    "component"
  ],
  "rows": [
    [
      "app"
    ],
    [
      "lib"
    ]
  ]
}
```

## 数据库反例

以下写入违反本案例明确的结构约束，应拒绝且不移动测试分支 Head；不是业务库操作建议。

```cypher
CREATE (:Release {releaseKey:'app:1.0',version:'9.0'})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。在数据库里允许一份发行连接两个组件；本例恰一归属须先验证。唯一 releaseKey 不自动提供边 cardinality。

```cypher
MATCH (r:Release {releaseKey:'app:1.0'}),(c:Component {componentKey:'lib'}) CREATE (r)-[:RELEASE_OF {channel:'stable'}]->(c)
```

## 语义检查

```cypher
MATCH (r:Release) OPTIONAL MATCH (r)-[i:RELEASE_OF]->(:Component) WITH r.releaseKey AS release, count(i) AS owners WHERE owners <> 1 RETURN release, owners ORDER BY release
```

```json
{
  "columns": [
    "release",
    "owners"
  ],
  "rows": [
    [
      "app:1.0",
      2
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：把 `version='1.0'` 当所有组件共享的同一个发行；或只在 Component 上保留 latestVersion，从而丢失旧依赖目标。**合理简化**：完全不需要版本级关系时，当前版本属性足够。

**错误**：根据声明 `2.x` 直接建立指向某最新版本的边，未经解析却称为已安装。模型应区分声明与观察，而不是让 AI 猜出版本事实。

## 修改与维护

组件改名保持 componentKey；版本格式更换不等同数值排序。撤回发行应表达其状态/证据，不为保持“只有最新版”删除历史依赖目标。需要多平台/构建变体时先确定发行粒度及键范围，再扩展，避免给所有版本提前增加不存在的变体。

## 参考依据

KG OS 原创技术建模案例。版本字符串的外部标准由实际生态决定，本例不假定 Semantic Versioning、字符串排序或任意版本兼容规则。
