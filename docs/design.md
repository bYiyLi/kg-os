# KG OS 设计

本文承载 KG OS 当前已确认的核心设计原则。尚未确认的具体机制只记录为开放问题，不写成设计事实。

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
- 具体的 Definition / Model 语法、生命周期、存储方式或扩展机制已经确定。

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

- KG OS 采用本地 daemon 形态，`kgosd` 作为统一访问入口。
- SQLite 作为底层数据基础。
- FTS5 + trigram 提供全文与子串检索能力。
- sqlite-vec 提供向量检索能力。
- KG OS 图引擎以 **GraphQLite** 为上游基础进行源码级扩展，继续建立在 SQLite 上。
- `kgosd` 与 KG OS 图引擎使用 **Rust** 开发。
- CLI、SDK、Web、Skill 等上层能力使用 **TypeScript** 开发，并进入 npm 生态。

其中：

- **Rust 层**负责 daemon、图引擎、SQLite 集成、查询执行和数据一致性。
- **TypeScript / npm 层**负责 SDK、CLI、Web、Skill 与其它上层产品能力。

该技术架构已确认；本体 Schema 的基础模型已确认到本文所述范围，时序、版本、查询合同以及更细的执行语义仍需继续设计。

## 图内核扩展原则

KG OS 图引擎负责执行本体、时序和数据可见域相关能力，但**不自行判断某段图具有何种业务语义**。语义由上层定义，底层按明确规范执行。

- GraphQLite 作为 KG OS 图内核的上游基础，而不是不可修改的黑盒依赖。
- KG OS 可以修改 GraphQLite 的源码和执行路径，以实现自身独有的图语义。
- 调用方仍使用普通图查询；本体、时序、版本分支和可见域等约束由图引擎根据当前上下文透明执行。
- 可见域约束必须作用于图遍历过程本身，不能仅在查询结果返回前做末端过滤。
- 在扩展内部语义的同时，优先保持 SQLite 数据基础和 Cypher 查询兼容性，避免把 KG OS 的内部机制泄漏给上层使用方。

## 统一图与能力边界

KG OS 的持久化知识统一表示为图。底层不预设节点、关系及其业务属性的固定结构，也不把本体、普通知识、时序或版本物理拆成不同数据体系。

- 节点和关系可以携带调用方需要的属性；KG OS 不预定义领域字段集合。
- 本体、普通知识、时序、版本等都可以由同一图数据表达。
- 上层负责声明哪些节点、关系和数据构成某种定义或语义，例如某组图数据构成本体定义。
- 图引擎不需要主动识别“这是不是本体”或“这是不是时序图”；它只提供可被上层调用的确定性能力。
- 当上层要求按某组图数据执行本体校验、时序可见域或其它规则时，底层按照对应能力合同执行。

因此，KG OS 的原则是：**语义由上层定义，能力由底层执行。**

## Ontology Schema

KG OS 固定本体 Schema 的基础结构，但不预定义调用方的领域标签、字段或业务语义。本体 Schema 是附加在图数据上的确定性约束；图中的 Node / Edge 数据本身仍是真源。

### Node Schema

Node Schema 当前由以下部分组成：

```text
Node Schema
├─ properties
├─ unique?
├─ title?
└─ description?
```

- `properties` 定义节点属性数据的结构和值约束，当前暂定采用 **JSON Schema Draft 2020-12**。
- `unique` 是可选业务唯一键，可以由单个属性或多个属性联合组成。
- `title` 和 `description` 为可选定义信息。

### Edge Schema

Edge Schema 当前由以下部分组成：

```text
Edge Schema
├─ properties
├─ unique?
├─ title?
├─ description?
└─ cardinality
   ├─ one-to-one
   ├─ one-to-many
   ├─ many-to-one
   └─ many-to-many
```

- `properties` 定义边属性数据的结构和值约束，当前暂定采用 **JSON Schema Draft 2020-12**。
- `unique` 与 Node Schema 一样，是作用于边数据的可选业务唯一键，可以由单个属性或多个属性联合组成。
- `title` 和 `description` 为可选定义信息。
- `cardinality` 支持 `one-to-one`、`one-to-many`、`many-to-one` 和 `many-to-many` 四种关系基数。
- 关系基数始终按照 Edge 自身的有向关系解释，即按照图中的 source → target 方向解释 `one` 与 `many`。

Edge Schema 不重复定义 `from` / `to`。Edge 的 source 和 target 已经由图结构本身表达；Schema 只对现有图结构施加约束，不能建立第二份可能与真实图关系冲突的端点数据。

### Schema 叠加

一个 Node 或 Edge 可以同时适用多个标签 / Schema 定义。此时所有适用 Schema 的约束共同生效：

- 所有 `properties` 约束都必须满足；
- 所有 `unique` 约束都必须满足；
- Edge 上所有适用的关系基数约束都必须满足。

Schema 不把图数据切分成彼此隔离的类型空间。一个对象本质上仍是同一个 Node 或 Edge；多个 Schema 只是同时作用于该数据的约束集合。

因此，当前本体 Schema 的原则是：**图结构是真源，Schema 定义数据约束；多个 Schema 以逻辑“且”叠加。**

## 尚未确认

当前仍未确认的内容包括：

- Ontology Schema 的具体序列化格式、声明语法和持久化表示；
- Schema 与图中标签 / 类型之间的具体绑定合同；
- `unique`、`cardinality` 等约束在 Graph Engine 与 SQLite 中的具体执行方式；
- 时序、版本、查询和其它后续能力的公共合同。
