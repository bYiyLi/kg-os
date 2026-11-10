# Object Patch 关系写入故障排查

本指南适用于 KG OS Phase 38 实现后的 Docker 运行环境，面向有 Instance 观测权限的管理员。操作默认**只读**；不要直接修改 `kgos.db`、诊断 SQLite、Branch Head，也不要因日志显示 `incomplete` 就重试原 Patch。行为和字段合同以 [Observability](../design/observability.md#patch-stage-diagnostics)、[Object](../design/object.md#knowledge-relationship-的内部创建与查询成本) 为准；实现和验收状态见 [Phase 38](../development/phases/38-relationship-write-diagnostics.md)。

## 从请求定位执行阶段

1. 记录真实请求时间（带时区）、目标 Instance 和 HTTP `X-KGOS-Request-ID`，或从 Web 的 **Observability → Requests** 按时间/Tool 查找请求。确认请求来自正确的运行 Instance；历史数据默认仅保留有限时间和容量。
2. 打开 Request 详情，核对 `request_id`、`run_id`、`trace_id`、首个可信 Tool、Operation ID 及其 Span 父子关系。MCP Tool 开始后即使中断也可能有身份记录，但不是所有开始记录都一定完成持久化。
3. 查看每个 Operation 的 **Last persisted stage（最近已保存阶段）** 和时间。`base_read`、`parse_plan`、`tx_begin`、`pre_schema`、`staged_safety`、`post_schema_nodes`、`post_schema_relationships`、`read_back`、`commit` 都是*进入*阶段的证据。尤其 `commit` **不等于已经提交成功**。
4. 检查 `lithograph.execute` 等 Span 的 `db_call_seq`、`query_family`、开始/结束状态。`knowledge.relationship.create` 只说明执行调用属于关系创建；未结束的 Span 不证明它就是 OOM 或数据库错误的唯一来源。一个 Request 可含多个 Tool/Operation，按真实 ID 和 Span 关联，不按时间相近推断。

不使用 Web 时，同一信息由受保护的 **POST** 接口查询。请求体示例（使用已有 Instance Bearer 或有效 Web Session，不能用 MCP OAuth Token 代替 API 身份）：

```http
POST /api/v1/system/observability/requests/list
Content-Type: application/json

{"route":"mcp","limit":50}
```

```http
POST /api/v1/system/observability/requests/get
Content-Type: application/json

{"request_id":"req_0123456789abcdef0123456789abcdef","limit":100}
```

日志时间线由 `POST /api/v1/system/observability/logs/list` 分页读取。请求体中的 ID 为示例，必须替换成**本次 Instance 实际返回的服务器生成 ID**。切勿将 Token、请求源码或原始 Patch 放进工单、日志或对外报告。

## Docker 与内存证据

在已确认的目标宿主上，用实际容器名替换示例的 `CONTAINER`：

```sh
docker logs --since 30m CONTAINER 2>&1 | grep -E 'kgosd: write started|kgosd: diagnostic storage unavailable'
docker inspect --format '{{.State.OOMKilled}} {{.State.ExitCode}} {{.State.StartedAt}} {{.State.FinishedAt}}' CONTAINER
docker exec CONTAINER cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events
```

`docker logs` 仅有少量脱敏应急摘要，不是完整请求日志；摘要可能因限流、队列压力或 SIGKILL 丢失。`docker exec` 只适用于仍在运行、能访问 cgroup 的容器；进程退出时须从可信宿主的 Docker/systemd/OOM 记录取证。**Exit 137、缺少 Span 完成或一个 `commit` 阶段都不能单独证明 OOM 或提交结果**。需要对齐同一时间段和容器的 `oom_kill`、`memory.peak`、进程 RSS、Request/Run/Operation ID 等事实。

若接口返回 `availability: "unavailable"`，说明当前没有可查询的持久观测数据；这不意味着业务库不可用。检查诊断库初始化/存储故障的固定 `cause_class` 与容器状态，不要擅自删除或重建 `.kgos/logs/`。若 `coverage.dropped > 0`、`truncated = true`，或覆盖时间不包含事故时刻，只能如实标记证据缺失。

## 最后验证真正的图状态

通过现有授权的**只读** SDK，获取实际目标 Branch 而不是默认使用 `main`：

```js
return await evolution.get({ state: "branch/<actual-branch>" });
```

必要时结合该 Branch 的 History、指定 Commit 的 `object.read` / `graph.query` 对比写入前后节点和关系；使用同一个固定 State，不能将不同 State 的结果混在一起。只有真实 Commit 和图数据回读才能证明写入结果。若无法从历史、请求 ID 或图状态证明是否提交，停止自动补偿或重复提交，并保留 `unknown/incomplete` 结论。

**故障报告至少记录**：Instance/容器标识、时间段、固定 Lithograph/镜像版本、真实 Base/最终 State（可按授权脱敏）、Node/Relationship/Binding 规模、Request/Run/Operation ID、最后已持久化阶段、Span 的安全类别与序号、覆盖率/丢失情况、OOM 可信宿主证据以及实际读回结果。不得把未经验证的猜测提升为故障根因。
