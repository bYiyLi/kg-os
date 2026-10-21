# VLog 可选建模参考：VLogEntry

**用途**：当目标知识世界缺少能够准确保存当前系统记录的 Ontology，且宿主**已获相应建模授权**时，参考这一套单节点方案。它不是 KG OS 的官方固定模型，也不在 Kernel、Lithograph、`kgos_docs` 或 Plugin 安装时自动创建。实际数据模型由目标 `branch/vlog` 的当前 Ontology 决定；已有合适模型直接复用，不为使用示例强制迁移、更名或增加字段。

本参考只给出一个 `VLogEntry` Node Definition，**18 个 Property、其中 3 个必填、0 个 Relationship Definition**。Node 表达一条独立的系统记录；是否记成事件、决定、某次执行或已有事件的后续，由真实身份及依据决定，不要求每类记录都填写所有字段。此处的 `name`、字段名、类型及约束是**这一建议模型内部**的具体定义，不是所有用户知识库的强制合同。

## 可用于 KG OS Ontology 的完整 Node Definition

以下 YAML 是 **Node Definition 的可编辑 body**，不是完整 Patch、Skill 配置或 Knowledge 实例；在真正创建前，宿主须以目标 State 的现有模型核对命名冲突、实际含义和授权。

```yaml
name: VLogEntry
title: 系统知识记录
description: 记录重要系统事件、决定、执行结果及其可核实证据。
properties:
  - name: entryKey
    type: STRING
    required: true
    unique: true
    description: 本记录模型作用域内稳定且唯一的记录业务键。
  - name: kind
    type: STRING
    required: true
    description: 实际记录类别，不预设固定枚举。
  - name: summary
    type: STRING
    required: true
    description: 对这条记录最重要的事实作准确简述。
  - name: details
    type: STRING
    description: 重要过程、原因、决定依据、影响及必要上下文。
  - name: occurredAt
    type: ZONED DATETIME
    description: 已知事件发生或实际执行开始的时间，不是记录修改时间。
  - name: recordedAt
    type: ZONED DATETIME
    description: 能够可靠确认的首次记录时间，不用计划时间代填。
  - name: verifiedAt
    type: ZONED DATETIME
    description: 与当前verificationResult对应的真实验证时间。
  - name: eventKey
    type: STRING
    description: 同一真实事件或事故的来源作用域内身份。
  - name: taskKey
    type: STRING
    description: 长期或一次性任务在来源作用域内的身份。
  - name: runKey
    type: STRING
    description: 实际执行在来源作用域内的身份，不是记录身份。
  - name: scope
    type: STRING
    description: 目标、影响范围、检查覆盖和已知遗漏。
  - name: executionStatus
    type: STRING
    description: 已知实际执行阶段或操作回执状态，不表示验证通过。
  - name: executionResult
    type: STRING
    description: 实际操作结果、影响、部分完成或未知的具体边界。
  - name: verificationStatus
    type: STRING
    description: 独立验证阶段与结果，不替代执行状态。
  - name: verificationResult
    type: STRING
    description: 验证目标、版本、范围、结果及限制。
  - name: evidence
    type: STRING
    description: 支持关键结论的实际证据摘要与可用定位。
  - name: pending
    type: STRING
    description: 有依据的未解决问题、阻塞与待核实事项。
  - name: provenance
    type: STRING
    description: 可确认的来源系统、知识世界、对象与版本定位上下文。
constraints: []
```

本例 `entryKey` 的 `unique` 是当前Definition覆盖的业务键唯一性，**不**等于跨所有Instance/Branch的全球唯一身份，也不等于 Lithograph 的 `n:` 元素Ref。某次记录提交结果未知时，用之前已决定的键及当前可读 State 核实，不能新生成键盲目重试。无需定义额外独立 Index；约束是否可用以目标 KG OS 实际模型编译与执行结果为准。

## 正确填写而不是凑满字段

| 记录事实 | 建议使用的属性 | 判定边界 |
| --- | --- | --- |
| 重要决定 | `entryKey`、`kind`、`summary`；理由/影响在 `details`，证据在 `evidence` | 没有实际执行就不填虚构的 `runKey`、执行/验证状态 |
| 无变化的维护巡检 | `taskKey`、真实 `runKey`、`occurredAt`、`scope`、实际结果 | 仍是一次运行；只审了20条不能写成全库检查通过 |
| 同事故多次执行 | 多条VLogEntry共享已确认的 `eventKey` / `taskKey`，每次真实执行使用相应 `runKey` | 独立尝试不因摘要相同而合并；同一Run重发不产生新执行 |
| 执行成功但验证失败 | `executionStatus` 可记执行成功，`verificationStatus` 记验证失败，分别给依据 | 不用单个 `success` 抹掉验证失败或未知部分 |
| 后续复核与纠错 | 对旧记录补充 `verificationResult` / `evidence`，必要时改正错误断言 | 保留重要先前失败及更正含义；新Run与新验证不是一回事 |
| 外部部署或别的Branch上的变更 | `provenance`、`scope`、`evidence` 提供可核实来源和版本角色 | 不能用目标VLog State冒充源State，也不能把定位字符串当跨快照关系 |

**状态字符串不是数据库枚举**。确有执行信息时，`executionStatus` 可以采用 `not_started`、`in_progress`、`succeeded`、`failed`、`partial`、`unknown`；`verificationStatus` 可以采用 `not_checked`、`passed`、`failed`、`partial`、`unknown`。这些取值只建议**这一示例**的写入方保持语义一致，KG OS v1 的 `STRING` 本身不校验这些枚举；已有目标模型有不同取值时以其合同为准。计划未执行、执行结果未知、验证未进行、验证结果未知是不同事实；不需要这些状态的决定/事件可以省略。

时间字段也均为可选：缺真实时点不伪造；`occurredAt` 指事实发生或该次运行开始，不从 `recordedAt`、最近的VLog Commit或修改时间推导。若一次执行持续一段时间或有多次验证，以实际可解释的 `details` / `verificationResult` 保留区别；真实需求要求单独查询多次检查时间时，再在既有授权下扩展模型，**不把一个 `verifiedAt` 当全部验证时间**。

`eventKey`、`taskKey`、`runKey` 不是本地统一生成的三种永恒ID。只填写实际来源能确认的身份，须连同相应来源作用域理解；标题/错误文本相同、名称相近、多个Agent转述同一次执行，均不足以创建新的Run身份。对本地自主记录，`entryKey` 可以按目标库现有键规则稳定分配，不凭它臆造真实外部Run标识。

`provenance` 与 `evidence` 是可阅读的 `STRING`，**不是结构化来源表或Doctor可直接按字段查询所有Source State的保证**。记录KG OS活动时，按已知事实明确来源Instance、原Branch、修改前/后/验证所读的不变State及必要对象Ref，保持每个版本的角色；外部任务则使用真实平台的来源身份和凭据，不强求KG OS Commit。VLog写入用目标Branch自身的State；保存后的记录Ref/State来自实际回执，不预填当前记录的最终Commit，也不在后续Commit中无限追逐自身。不得将未经授权的私人资料或Secret复制到记录中。

## 与现有模型及 Doctor 的关系

使用顺序按实际需求，而不是按示例字段驱动：

1. **已有足够模型**：直接复用，即使类型不叫 `VLogEntry`、字段名不同，也不视为不合规范。
2. **表达能力不足**：说明具体缺失的事实及后果；宿主确有模型创建/修改授权时，才将本示例作为起点，按 Ontology 规范作最小调整，不自动新建多个Task/Run/Event/Result节点。
3. **已有复杂模型**：需要独立Task/Run或证据图关系时，按照现有语义使用；这个单Node示例不能代替真实适用的模型。

Doctor 以后应先读取目标 `branch/vlog` 的真实 Ontology，再依据实际记录的事件/Run身份、真实时间、执行与验证、可核实的来源进行有界只读判断。**不能要求所有知识库先装本示例才能检查**。如果真实模型或证据不足以分辨一次运行、最近时间及结果，Doctor 对相应结论报告 `UNKNOWN`，而不是假定某字段一定存在或把一条记录的 `succeeded` 当作实际外部验证成功。调度启用与运行安排仍属于外部平台。
