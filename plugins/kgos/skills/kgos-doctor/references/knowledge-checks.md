# MCP 与知识就绪性

通过当前连接的 `kgos_docs` 获取 `guides/reading.md`、`guides/evolution.md` 及需要的 SDK/类型页；这些是独立工具文档路径，不是 JavaScript 方法。只读调用使用 `kgos_query`，按真实宿主暴露的连接名称区分目标。

## D2：实际连接与有效 State

只核对当前诊断范围内且获准的连接、环境与知识世界，不因工具可见就读取其它用途资料。区分未暴露工具、明确未配置、认证拒绝、传输失败、文档可读而业务读取失败；工具清单成功不能替代真实读取。宿主无法发现其它连接时只说明当前范围，不宣称用户只有一个库。相同 Commit 不证明两个连接属于同一物理 Instance。

实际读取文档后，检查默认 Branch 的已解析 State；用户指定目标时改为解析该 Branch，不拿默认 State 替代。下面是默认 Branch 的只读探测，具体签名仍以当前文档为准：

```js
const result = {};
let method = "evolution.overview";
try {
  const { defaultBranch, state } = await evolution.overview();
  Object.assign(result, { defaultBranch, state });
  method = "evolution.get";
  const commit = await evolution.get({ state });
  Object.assign(result, {
    inspectedState: commit.state,
    consistency: commit.consistency
  });
  if (
    commit.state !== state ||
    commit.consistency.status !== "valid" ||
    commit.consistency.issues.length !== 0
  ) {
    return result;
  }
  method = "ontology.read";
  const models = await ontology.read({ at: state, limit: 1 });
  return {
    ...result,
    ontologyState: models.state,
    ontologyReadable: models.state === state,
    overview: models.results.map((item) => ({
      kind: item.kind,
      total: item.total,
      hasMore: Boolean(item.cursor)
    }))
  };
} catch (error) {
  result.readError = {
    method,
    code: typeof error?.code === "string" ? error.code : null
  };
  return result;
}
```

文档和业务读取成功、返回同一真实 Commit、`consistency.status` 为 `valid` 且 `issues` 为空、Ontology 可读，才在该目标范围 `PASS`。`readError` 表示该步骤失败，不能因外层工具成功返回 JSON 而判通过；保留已返回的 State/一致性证据，未执行的后续读取仍未验证。不转述原始错误详情；没有错误码时不猜错误类别。整个调用被取消或未返回时不能假定局部结果已交付。`limit: 1` 只验证入口可读，`total` 是该 Ontology 导航范围数量，不是 Knowledge 数量。空模型不导致 D2 失败；`valid` 不证明业务事实正确、所有 Branch/历史有效或写权限通过。

确切认证/连接/目标状态失败为 `FAIL`；确认未配置或非核心能力缺失为 `WARN`；未开放调用、被用户禁止读取或缺必要证据为 `UNKNOWN`。文档失败不自动等于认证失败；没有可依赖的当前接口说明时不猜方法。确认请求错误先按文档修正；实际服务错误按原错误报告，不自动换库、绕过认证或新建实例。

## D4：内容、发现入口与规范

只检查 D2 已确认可读取的目标 State。需要另一个 Branch 时先解析并核对该 State；默认 Branch 通过不能替代 `branch/vlog` 或其它业务世界的检查。选择与诊断相关的世界/模型、结果条数和有限关系深度，记录覆盖范围；达到足够证据或真实资源边界就停止，不追求导出全库。

**内容与可读性。** 根据实际 Ontology 的 Label、Relationship Type、字段及身份语义读取有限实例，必要时按真实 Ref 用公共 Object 读取核对。原始 Graph 可以返回 KG OS 内部语义节点；不使用无区别的全图计数证明用户知识存在。没有模型、只读到内部数据或一页零结果均不足以证明全库无知识；无法可靠区分时 `UNKNOWN`。确认有可解释的实例可报告限定范围存在/可读；确认空业务范围时报告为空；预期空库不告警，已明确需要现有业务知识而当前缺失才提示 `WARN`。目标不明时只报告内容事实与限制，不推定应有数据，也不说数据库损坏。

**可发现性。** 允许读取整实例预览时，复用 `kgos_ontology_overview` 的 Branch 索引、Head Message、Domain/Definition 导航，按绝对偏移和同一 `viewRevision` 阅读必要部分；首屏未显示不是不存在。新视图生成全部 Branch 的 Ontology，分页不提供权限或用途隔离；混库受限时不先全量预览后过滤，已知目标使用定向 State/Ontology 读取，仍未知则请求范围决定。若预览超限或某 Branch 无效，报告限制，使用已确认可读 State 的分范围 Ontology 读取继续；不把部分成功说成完整预览。

以实际样本核对“简介说明的范围、模型语义、真实内容”是否能相互定位。简介不是事实替代品，模型存在不证明有实例；缺 `## 简介` 是导航缺口而非无效 Commit。名称或其它说明已足以定位时，不因缺 Domain/可选 description 就判不合格；有证据的误导、缺口或含义不明可报告 `WARN`，建议改进但不补建模型、目录或 Commit。

**规范与覆盖。** 需要评价模型、实例、检索证据或版本说明时，只应用当前可取得且版本明确的对应官方规范，标明具体规则与证据。缺规范或关键依据时该子项 `UNKNOWN`，不覆盖已确认的内容读取结果。Doctor 只报告就绪性及已观察的明显问题，不进行全库去重、现实事实全面核验、评分或深度维护。模型被接受不证明语义正确；样本无问题仅支持该样本，不给全库质量认证。

查询优先本地结构化过滤与必要投影；`LIMIT` 限制返回量而非保证扫描成本，不为诊断执行无界路径、全量聚合、外部语义服务或索引重建。实际检索策略按已读模型与检索规范决定，不预置领域字段、统一质量阈值或第二套知识目录。
