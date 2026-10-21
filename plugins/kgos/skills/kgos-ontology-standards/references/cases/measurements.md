# 案例 7：测量对象、观测与单位

**需求**：保存资产的一次次观测，区分正常零值、未取得结果和不同单位；按单位和指标查询真实测量。本例不承担校准、医疗判断或高精度十进制运算。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:Asset

```yaml
name: "Asset"
description: "被观测的资产。"
properties:
  - name: "assetKey"
    description: "资产登记编号。"
    type: "STRING"
    required: true
    unique: true
  - name: "name"
    description: "展示名称。"
    type: "STRING"
    required: true
constraints: []
```

### node:Observation

```yaml
name: "Observation"
description: "一次采集尝试及其观测结果；不是资产永久属性。"
properties:
  - name: "observationKey"
    description: "采集事件键。"
    type: "STRING"
    required: true
    unique: true
  - name: "quantity"
    description: "被测量的量，如 length。"
    type: "STRING"
    required: true
  - name: "value"
    description: "有效测量的数值，缺失不是零。"
    type: "FLOAT"
  - name: "unit"
    description: "结果单位；必须与 quantity 及 value 一起解释。"
    type: "STRING"
    required: true
  - name: "resultState"
    description: "示例 measured/missing；组合合法性由应用检查。"
    type: "STRING"
    required: true
  - name: "observedAt"
    description: "此观测对应的业务时间。"
    type: "ZONED DATETIME"
    required: true
  - name: "method"
    description: "测量方法或仪器模式。"
    type: "STRING"
    required: true
constraints: []
```

### relationship:OBSERVED_ON

```yaml
name: "OBSERVED_ON"
description: "观测的目标资产；本场景恰一目标由应用保证。"
from: "node:Observation"
to: "node:Asset"
properties:
  - name: "sourceLocator"
    description: "产生此关联/观测的采集来源。"
    type: "STRING"
    required: true
constraints: []
```

## 关键取舍与保证边界

值、单位、量、方法和时间共同决定可比较性。`resultState=measured` 应有 value，missing 不得用 0 代替；这些条件不是字段 required 能完整表达，所以 value 可选并由语义检查控制。FLOAT 只服务该例允许近似的测量，不宣称适合所有金额或精确数值。

观测与资产分开保留多次结果；unit 字符串在本例受控词表由采集方定义，不自动执行单位换算。需要共享单位概念、精度、误差或量纲推理时再引入明确模型，不能在无需求时先建通用科学本体。

## 合成实例（仅隔离测试）

```cypher
CREATE (a:Asset {assetKey:'A1',name:'Example gauge'}),
       (o1:Observation {observationKey:'M1',quantity:'length',value:0.0,unit:'m',resultState:'measured',observedAt:datetime('2026-10-01T10:00:00Z'),method:'sensor'}),
       (o2:Observation {observationKey:'M2',quantity:'length',unit:'m',resultState:'missing',observedAt:datetime('2026-10-01T11:00:00Z'),method:'sensor'}),
       (o3:Observation {observationKey:'M3',quantity:'length',value:100.0,unit:'cm',resultState:'measured',observedAt:datetime('2026-10-01T12:00:00Z'),method:'manual'}),
       (o1)-[:OBSERVED_ON {sourceLocator:'run:M1'}]->(a), (o2)-[:OBSERVED_ON {sourceLocator:'run:M2'}]->(a), (o3)-[:OBSERVED_ON {sourceLocator:'sheet:M3'}]->(a)
```

## 验证问题

### 以米为单位的有效观测包含零值吗？

```cypher
MATCH (o:Observation)-[:OBSERVED_ON]->(:Asset {assetKey:'A1'}) WHERE o.quantity = 'length' AND o.unit = 'm' AND o.resultState = 'measured' AND o.value IS NOT NULL RETURN o.observationKey AS observation, o.value AS value ORDER BY observation
```

```json
{
  "columns": [
    "observation",
    "value"
  ],
  "rows": [
    [
      "M1",
      0.0
    ]
  ]
}
```

### 缺测是否保留为缺测而不是零？

```cypher
MATCH (o:Observation {resultState:'missing'}) RETURN o.observationKey AS observation, o.value IS NULL AS absent ORDER BY observation
```

```json
{
  "columns": [
    "observation",
    "absent"
  ],
  "rows": [
    [
      "M2",
      true
    ]
  ]
}
```

## 数据库反例

以下写入违反本案例明确的结构约束，应拒绝且不移动测试分支 Head；不是业务库操作建议。

```cypher
CREATE (:Observation {observationKey:'M4',quantity:'length',value:1.0,resultState:'measured',observedAt:datetime('2026-10-01T13:00:00Z'),method:'manual'})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。value 可选允许缺测，但语义状态必须与实际结果一致；字段存在性和业务合法性分开。

```cypher
CREATE (:Observation {observationKey:'M4',quantity:'length',unit:'m',resultState:'measured',observedAt:datetime('2026-10-01T13:00:00Z'),method:'manual'})
```

## 语义检查

```cypher
MATCH (o:Observation) WHERE NOT (o.resultState IN ['measured','missing']) OR (o.resultState = 'measured' AND o.value IS NULL) OR (o.resultState = 'missing' AND o.value IS NOT NULL) RETURN o.observationKey AS invalidObservation ORDER BY invalidObservation
```

```json
{
  "columns": [
    "invalidObservation"
  ],
  "rows": [
    [
      "M4"
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：把不存在的读数默认填 0，再用 `value > 0` 判断有效测量；这样真实零值丢失。**合法替代**：若业务从不记录失败采集且每条记录必有结果，可将 value 设必填并取消 missing 状态。

**错误**：把 100 cm 与 100 m 直接求和，或只改单位字段不换算数值。换算需要明确量纲、公式、精度和授权，不是简单属性 rename。

## 修改与维护

发现单位混写先定位实际实例，不能为掩盖问题把 FLOAT 统一改 STRING。精度需求增长时明确可表示范围、误差和转换规则；未知精度不得后补成已校准值。来源是测量证据，不要用数据库录入时间替换 observedAt。

## 参考依据

参考 [W3C SSN/SOSA](https://www.w3.org/TR/vocab-ssn/) 的观测、结果、特征和方法区分（核对：2026-10-20）。此例是简化 Property Graph，不实现完整单位或观测推理体系。
