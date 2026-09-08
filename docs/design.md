# KG OS 设计

本文是 KG OS 当前技术架构与数据设计的真源。产品定义见 [README](../README.md)；[会话交接](../HANDOFF.md)只记录接续位置与工作规则，不另立设计结论。

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | [技术架构](#已确认技术架构)、[图内核边界](#图内核扩展原则)、[统一图](#统一图与能力边界)、[Ontology Schema](#ontology-schema)的字段、JSON 格式、绑定、约束叠加与变更规则 |
| 暂定 | `properties` 的约束规范采用 JSON Schema Draft 2020-12；不因示例采用该规范而升级为最终选型 |
| 待设计 | [后续能力合同](#待设计能力合同)，不回退已经确认的本体基础规则 |
| 待实现 | [工程实现待办](#工程实现待办)，不等于产品语义尚未确定 |

**已确认不等于已实现；未实现不等于未设计。** 实现、验证、提交和推送状态以当前仓库与实际命令结果为准。

## 核心理念：一切皆可被定义

> **一切皆可被定义。**

KG OS 通过明确定义，让知识、关系、结构和约束能够被建模和操作。

KG OS 不替调用方定义世界，而是提供**定义世界并操作这个世界**的基础设施。

### 直接边界

- Kernel 不预定义具体领域的本体、节点、关系或知识语义。
- 调用方负责定义自己的领域模型和语义。
- KG OS 的确定性能力应作用于明确的定义，而不是依赖 Kernel 内部的隐式领域判断。
- 理解、提炼、分类和建模等认知决策仍属于外部 Agent 与 Skill。

### 这不意味着

- 所有领域必须使用同一种固定模型。
- 所有内容必须提前静态定义。
- 核心理念会自动决定全部机制；具体已确认范围以下文为准。

## 已确认技术架构

KG OS 当前确认采用以下上下层技术架构：

```text
CLI / SDK / Web / Skill (TypeScript / npm)
        ↓
      kgosd (Rust)
        ↓
      SQLite
  ├─ FTS5 + trigram
  ├─ sqlite-vec
  └─ KG OS Graph Engine (Rust, based on GraphQLite)
```

| 部分 | 已确认选择与职责 |
| --- | --- |
| 本地服务 | Rust 开发 `kgosd`，作为统一访问入口 |
| 知识库引擎 | Fork GraphQLite，以 Rust 做源码级扩展，承载 KG OS 的图读写与确定性语义 |
| 数据底座 | SQLite；Rust 层负责集成、查询执行与数据一致性 |
| 检索基础 | FTS5 + trigram 用于全文／子串检索，sqlite-vec 用于向量检索 |
| 上层 | TypeScript / npm 开发 SDK、CLI、Web，并提供 Skill 与生态集成 |

以上是已确认的技术选择，不表示已经完成 fork、集成或功能实现。

## 图内核扩展原则

KG OS 图引擎负责执行本体、时序和数据可见域相关能力，但**不自行判断某段图具有何种业务语义**。语义由上层定义，底层按明确规范执行。

- GraphQLite 作为 KG OS 图内核的上游基础，而不是不可修改的黑盒依赖。
- KG OS 可以修改 GraphQLite 的源码和执行路径，以实现自身独有的图语义。
- 调用方仍使用普通图查询；本体、时序、版本分支和可见域等约束由图引擎根据当前上下文透明执行。
- 可见域约束必须作用于图遍历过程本身，不能仅在查询结果返回前做末端过滤。
- 在扩展内部语义的同时，优先保持 SQLite 数据基础和 Cypher 查询兼容性，避免把 KG OS 的内部机制泄漏给上层使用方。

## 统一图与能力边界

KG OS 的持久化知识统一表示为图，**Schema 本身也作为图数据保存**。底层不预设领域节点、关系或业务属性，也不把本体、普通知识、时序或版本拆成割裂的数据体系。

- 节点和关系可以携带调用方需要的属性；KG OS 不预定义领域字段集合。
- 本体、普通知识、时序、版本等都可以由同一图数据表达。
- 上层负责声明哪些节点、关系和数据构成某种定义或语义，例如某组图数据构成本体定义。
- 图引擎不需要主动识别“这是不是本体”或“这是不是时序图”；它只提供可被上层调用的确定性能力。
- 当上层要求按某组图数据执行本体校验、时序可见域或其它规则时，底层按照对应能力合同执行。

因此，KG OS 的原则是：**语义由上层定义，能力由底层执行。**

## Ontology Schema

KG OS 固定本体 Schema 的基础结构，但不预定义调用方的领域标签、字段或业务语义。本体 Schema 是附加在图数据上的确定性约束；图中的 Node / Edge 数据本身仍是真源。

### Node / Edge 固定字段

| 字段 | Node Schema | Edge Schema |
| --- | --- | --- |
| `kind` | `node` | `edge` |
| `name` | Schema 名称，匹配节点标签 | Schema 名称，匹配边的标签／类型 |
| `properties` | 节点属性数据的结构和值约束 | 边属性数据的结构和值约束 |
| `unique`（可选） | 单字段／联合业务唯一键 | 同样支持单字段／联合业务唯一键 |
| `title`（可选） | 展示名称 | 展示名称 |
| `description`（可选） | 说明 | 说明 |
| `cardinality` | 不适用 | 以下四种关系基数之一 |

`properties` 暂定采用 **JSON Schema Draft 2020-12**，约束对象是 Node / Edge 的属性数据，不替代图结构与图级约束。

### 关系基数

基数始终按照图中 Edge 的 source → target 箭头方向解释：

| `cardinality` | 每个 source 可关联的 target 数量 | 每个 target 可关联的 source 数量 |
| --- | --- | --- |
| `one-to-one` | 最多一个 | 最多一个 |
| `one-to-many` | 不限 | 最多一个 |
| `many-to-one` | 最多一个 | 不限 |
| `many-to-many` | 不限 | 不限 |

`one = 0..1`，不要求关系必须存在；“必须存在关系”不属于当前基数约束。

Edge Schema 不重复定义 `from` / `to`。Edge 的 source 和 target 已经由图结构本身表达；Schema 只对现有图结构施加约束，不能建立第二份可能与真实图关系冲突的端点数据。

### Schema 叠加

一个 Node 或 Edge 可以同时适用多个标签 / Schema 定义。此时所有适用 Schema 的约束共同生效：

- 所有 `properties` 约束都必须满足；
- 所有 `unique` 约束都必须满足；
- Edge 上所有适用的关系基数约束都必须满足。

Schema 不把图数据切分成彼此隔离的类型空间。一个对象本质上仍是同一个 Node 或 Edge；多个 Schema 只是同时作用于该数据的约束集合。

因此，当前本体 Schema 的原则是：**图结构是真源，Schema 定义数据约束；多个 Schema 以逻辑“且”叠加。**

### Schema 与图绑定

Schema 不建立额外 mapping。Schema 的 `name` 直接对应图上的标签 / 类型名称：

```text
图上的 label / type 名称 = Schema name
```

当一个 Node / Edge 同时拥有多个可匹配的标签 / 类型时，对应的多个 Schema 自动同时生效，并继续遵守前述逻辑“且”叠加规则。

Schema 自身的稳定身份由 `kind + name` 组成。同一个 `kind + name` 同时只能存在一个有效 Schema；因此同名 Node Schema 与 Edge Schema 可以同时存在，但不能存在两份同名 Node Schema 或两份同名 Edge Schema。

Schema 是可选约束。图中的 Node / Edge 可以在不存在同名 Schema 时存在；一旦创建同名 Schema，该 Schema 就自动作用于所有匹配的数据，不需要额外绑定操作。

### `unique` 语义

`unique` 采用类似 SQLite `UNIQUE` 的业务唯一键语义，并支持单字段与联合唯一键：

```json
{
  "unique": [
    ["email"],
    ["country", "id"]
  ]
}
```

- 每个内层数组定义一组独立的唯一键；只有一个字段时是单字段唯一键，多个字段时是联合唯一键。
- 一组唯一键中的所有字段都有非 `null` 值时，该组合值必须唯一。
- 任意字段缺失或为 `null` 时，该对象不参与这一组唯一键的冲突判断。
- Node 与 Edge 使用相同的 `unique` 规则。
- 当多个 Schema 同时生效时，其中声明的所有 `unique` 约束都必须满足。

### 固定 JSON 格式

Ontology Schema 使用固定 JSON 格式。Node Schema 的标准形态为：

```json
{
  "kind": "node",
  "name": "Person",
  "title": "人物",
  "description": "一个人物",
  "properties": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "email": { "type": ["string", "null"] }
    },
    "required": ["name"]
  },
  "unique": [
    ["email"]
  ]
}
```

Edge Schema 的标准形态为：

```json
{
  "kind": "edge",
  "name": "works_at",
  "title": "任职",
  "properties": {
    "type": "object",
    "properties": {
      "since": {
        "type": "string",
        "format": "date"
      }
    }
  },
  "unique": [],
  "cardinality": "many-to-one"
}
```

这些 JSON 是 Schema 的固定表达格式，不代表另建一套独立于图的存储。示例中的 `Person`、`works_at` 及其业务字段不是系统预定义的领域模型。

KG OS 提供固定的 **Ontology Meta-Schema** 来校验 Ontology Schema 自身是否合法。调用方定义领域 Schema，但不能自行扩展或改变 KG OS 的 Ontology Schema 基础格式。

### Schema 强一致

已生效 Schema 与当前图数据必须始终保持一致。

- 新建或修改 Schema 时，必须校验所有受该 Schema 影响的现有 Node / Edge；新建 Schema 也必须检查此前已经存在的同名标签 / 类型数据。
- 只有全部受影响数据都满足新 Schema 时，Schema 变更才能提交。
- 任意现有数据不满足新 Schema 时，整个 Schema 变更失败并报错，不允许留下“Schema 已生效但现有数据非法”的状态。
- 删除 Schema 只移除对应约束，不删除、修改或级联处理原有 Node / Edge 数据。
- 为 Node / Edge 增加或删除标签 / 类型会改变其适用的 Schema 集合；变更后的数据必须满足全部新适用 Schema，否则该图数据变更失败。
- 需要进行不兼容 Schema 变更时，应通过迁移逻辑先完成数据适配，再使新 Schema 生效；具体迁移机制后续单独设计。

因此，普通 Schema 变更不承担兼容迁移职责；**不兼容演进属于迁移能力。**

## 待设计能力合同

当前先聚焦本体，不展开时序／版本的详细设计。以下范围尚未形成完整公共合同，不影响前文已确认的设计：

- 统一数据修改与迁移：具体操作接口及不兼容演进流程；Schema 变更不兼容即报错的原则已经确认。
- 时序／版本：生效范围、分支与合并的详细语义；上下文透明约束图遍历的方向已经确认。
- 混合检索与查询：图遍历中组合结构化、全文和向量检索的调用与结果合同。
- 上下层通信：TypeScript 客户端与 `kgosd` 之间的具体协议和公共接口。

## 工程实现待办

以下工作是在已确认设计下确定实现方案并验证，不是重新要求用户决定产品方向：

- 将 Schema 的固定格式落实为图中的物理编码、名称查找、索引与缓存；Schema 也是图、按名称绑定且不另设 mapping 已确认。
- 实现 Ontology Meta-Schema、属性校验、`unique`、`cardinality` 与 Schema 变更强一致检查，并建立测试。
- 检查 GraphQLite 源码，确定改造位置并验证 SQLite 扩展集成、事务和分发方式；选型确认不代替实际验证。

实现中发现真实语义缺口时，应列出具体输入、不同结果和推荐方案；若要改变已确认决定，应说明冲突证据并取得用户确认，不把整个主题退回“尚未设计”。
