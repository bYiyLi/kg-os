# Ontology / Object 的 canonical Git Extended Diff

高层 Ontology/Object mutation 只接受 **Git Extended Diff 文本 Patch**，不是任意 JSON Merge Patch，也不能直接传 SQL。要先读取真实 State 和 canonical editable YAML，再建立精确的 base→target 差异。

```js
const {state}=await evolution.overview();
const selected=await object.readText({at:state,refs:["node:Person"]});
return {state,selected};
```

构造 Patch 之前务必确认 `node:Person` 真的存在于已观测 State；Diff 的具体文本必须依照 canonical YAML 和 Git Extended Diff 语法。`object.patch({branch,baseState,patch,author?,message?})` 能在**一个原子操作**中更新多个 public Object；`ontology.patch` 用于 Ontology 范围。`baseState` 须使用对应的已观测 State，发生 Branch Head 移动时可能拒绝过期编辑。

不要直接手写内核内部 Label/Constraint 名称；业务 Definition 字段、关系端点与共享 Index 的公共格式由 KG OS Ontology 定义。Query 返回的图 Node/Relationship 不自动等于 Ontology Definition。
