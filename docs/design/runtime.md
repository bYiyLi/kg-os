# 本地运行时

本文件是 KG OS v1 **`kgosd` 本地服务、HTTP bind、daemon lifecycle、Web hosting、默认 endpoint 与 `~/.kgosd/` 本地目录布局**的设计真源。Kernel 能力由 [Object](object.md)、[Graph](graph.md) 与 [Evolution](evolution.md) 负责；CLI 命令由 [CLI](cli.md) 负责。

## 本地服务模型

KG OS v1 采用一个本地 `kgosd` daemon 作为统一运行时入口：

```text
kg CLI ───────────┐
SDK ──────────────┼── HTTP ──→ kgosd ──→ KG OS Kernel ──→ Lithograph
Browser Web ──────┘
```

`kgosd` 同时承载 API 与 Human-facing Web，因此 CLI、SDK 与 Web 使用同一个 KG OS Kernel 和同一组 Object / Graph / Evolution logical contract。v1 不为 CLI 再建立 Unix socket / Named Pipe / gRPC 私有协议，也不要求另起一个 Web server。

## HTTP bind 与默认 endpoint

v1 使用 IPv4 HTTP。默认配置只监听本机 loopback：

```text
default host = 127.0.0.1
default port = 4765
default origin = http://127.0.0.1:4765
```

`server.host` 与 `server.port` 都允许调用方在 `~/.kgosd/config.toml` 中显式覆盖。v1 `server.host` 接受 IPv4 bind address；默认值是 `127.0.0.1`。因此默认仍然只允许本机访问，但调用方可以明确配置 LAN address 或 `0.0.0.0`。`kgosd` 只绑定配置解析得到的这一组 `host:port`，不额外监听第二个地址。

`server.host = "0.0.0.0"` 表示监听所有 IPv4 interfaces。由于 wildcard bind address 不是一个适合作为 client target 的远端地址，`kg` 在这种配置下仍连接 `127.0.0.1:<port>`；其它设备应使用运行 `kgosd` 主机的实际可达 IP。对于其它具体 `server.host`，本机 CLI 直接连接该 configured host。

如果目标端口已被其它进程占用，`kgosd` **启动失败并返回明确错误**；不能自动寻找下一个端口，也不能退回随机端口。这样 Web URL、CLI target 与本地工具观察到的 endpoint 始终来自确定配置，而不是进程启动时的隐式选择。

普通 API request / response 使用 HTTP + JSON；Object body 继续按 Object contract 使用 `application/yaml` 或 `application/json`；Graph streaming 使用 HTTP streaming + NDJSON。具体 HTTP method / route / metadata carrier 仍属于 HTTP adapter mapping，但不得改变 logical contract。

## Web hosting

`kgosd` 自己提供 Human-facing Web：

```text
http://<host>:<port>/          → Web UI
same origin                    → KG OS API / streaming
```

Web 与 API 使用同一个 origin，因此 v1 不需要为了 Web 再设计独立前端 server、反向代理或跨 origin API。Web asset packaging、具体 API path、client-side routing 与 caching 属于实现 / Web adapter 合同。

## 本地模式不做认证

KG OS v1 的 daemon runtime **不定义认证或授权机制**：

- CLI / SDK 请求不携带 daemon token、Bearer token、API key 或其它本地 credential；
- Web 不需要登录 `kgosd` 才能调用本机 API；
- `kgosd` 不生成或保存 authentication token；
- 默认 `127.0.0.1` 只允许本机访问；如果调用方显式配置非 loopback `server.host`，同一个无认证 Web/API 会暴露到该 bind address 可达的网络。

因此 v1 的 configurable host 是一个明确的 operator choice，不是远程安全模型。非 loopback bind **不会自动启用认证、TLS 或权限隔离**；需要这些能力的多用户 / 不可信网络 deployment 必须另行设计。

## `~/.kgosd/` 目录

KG OS v1 在当前 OS 用户 home 下使用一个明确的 daemon home：

```text
~/.kgosd/
├── config.toml
├── kgosd.lock
├── logs/
└── data/
```

这些目录职责固定如下。

### `config.toml`

`config.toml` 是持久的 **startup configuration**。v1 当前冻结的 server 配置只有 host 与 port：

```toml
[server]
host = "127.0.0.1"
port = 4765
```

省略 `server.host` 等价默认 `127.0.0.1`；省略 `server.port` 等价默认 `4765`。`server.host` 必须是合法 IPv4 address string；v1 不把 hostname / DNS resolution 引入 bind contract。未来新增配置字段必须有真实运行需求，不能把尚未存在的扩展点提前塞入配置文件。

`kgosd` **只在进程启动时读取配置**。运行期间修改 `config.toml`：

- 不触发 file watch / hot reload；
- 不改变当前进程的 effective config；
- 不触发当前进程自动退出；
- `server.host` / `server.port` 的新值只在下一次 `kgosd` 启动时生效。

因此 host / port 是 restart-required settings。`kg daemon restart` 是应用这类新配置的显式 lifecycle 操作；普通业务命令不能因为发现文件变化而隐式 restart daemon。

### `kgosd.lock`

`kgosd.lock` 是 **single-instance lock + active endpoint locator**，不是配置文件、PID file 或 runtime state database。每个 `~/.kgosd/` profile 同一时间最多一个 active `kgosd`。

`kgosd` 启动时 open/create 此文件并尝试获取 OS-level exclusive file lock；整个进程生命周期持续持有该 lock。另一个 `kgosd` 无法取得 lock 时必须停止启动，不能通过不同端口绕过 single-instance 约束。

取得 lock 后，新的 owner 先覆盖任何旧内容。HTTP bind 成功并且本机 control endpoint 已确定后，文件只需要保存当前 active daemon 的本机可连接 endpoint，例如：

```json
{
  "endpoint": "http://127.0.0.1:4765"
}
```

如果 effective bind host 是 `0.0.0.0`，这里记录供本机 `kg` 使用的 `http://127.0.0.1:<port>`，而不是 wildcard address。其它具体 host 记录对应 effective local client endpoint。

**文件存在本身不表示 daemon 正在运行。** active ownership 以 OS file lock 是否被另一个进程持有为准；进程崩溃时 OS 自动释放 lock，即使文件内容残留也只是 stale content。下一次成功取得 lock 的 `kgosd` 会覆盖它。因此 v1 不保存 PID、version、startedAt 或第二份 configured endpoint，也不需要 `run/daemon.json`。

### `logs/`

`logs/` 保存 `kgosd` 的本地诊断日志。日志格式、rotation 与 retention 属于运维实现合同；它不是 Knowledge Base history，也不能成为业务状态真源。

### `data/`

`data/` 是 `kgosd` 拥有的持久 runtime data 根目录。daemon 重启不能把 `data/` 当作临时状态清理。

当前只冻结这个 ownership 与根路径；**Knowledge Base 在 `data/` 中的具体布局暂不由本决定定义**。一个 daemon 最终管理一个还是多个 Knowledge Base，以及对应的命名、选择、文件路径和 lifecycle，会直接影响 CLI / Web target 模型，需要在该主题设计时单独冻结，不能从 `data/` 目录存在推导出来。

## Daemon lifecycle

`kgosd` 自身始终是 **foreground server**：直接执行 `kgosd` 时不 self-daemonize、不 fork 到后台。这样 terminal、launchd、systemd、Windows Service 或其它 supervisor 都可以直接管理同一个进程模型。

`kg` 提供四个明确的 operator command：

```text
kg daemon start
kg daemon status
kg daemon stop
kg daemon restart
```

普通 Object / Graph / Evolution 命令 **不会自动启动 daemon**。没有 active daemon 时，它们按 CLI transport-unavailable 规则失败，不产生隐藏 process side effect。

### 启动

直接 `kgosd` 与 `kg daemon start` 最终都进入同一个 daemon startup path：

```text
resolve ~/.kgosd/
→ open/create kgosd.lock
→ acquire exclusive OS lock
→ clear stale lock content
→ load/create config.toml once
→ resolve configured host + port
→ open / bootstrap Knowledge Base and Kernel
→ bind <host>:<port>
→ write active local endpoint into kgosd.lock
→ serve Web + API
```

任一步失败都必须结束该次启动并释放 OS lock；不能留下一个“看起来 active”的逻辑实例。`kg daemon start` 负责把 `kgosd` 作为 detached/background child 启动并等待它达到 `running`；`kgosd` 自身仍保持 foreground process 语义。

`start` 是 idempotent：已有健康 `running` daemon 时返回当前实例，不再启动第二个进程。两个并发 `start` 最终也只能有一个 `kgosd` 获得 exclusive lock；另一个 caller 在观察到 winner 已经 `running` 后可以按同一成功结果返回。

### 当前实例发现与状态

业务 CLI 与 daemon operator **优先使用 active lock 中的 endpoint**，而不是重新用磁盘上的 `config.toml` 推测当前进程监听位置。这样运行中修改 host / port 后，旧 daemon 仍然可以被正常访问和停止。

状态判断遵守：

```text
kgosd.lock 未被其它进程持有              → stopped
lock 被持有，但尚未发布 endpoint           → starting
lock 被持有，endpoint 的 control status=running → running
lock 被持有，endpoint 的 control status=stopping → stopping
lock 被持有并已有 endpoint，但 control HTTP 不可用 → unavailable
```

stale `kgosd.lock` 文件因为没有 active OS lock，只能解释为 `stopped`，不能把旧 endpoint 当成正在运行的 daemon。

### 停止

`kg daemon stop` 从 active lock 取得当前 endpoint，并通过同一个 HTTP service 请求 graceful shutdown，不读取 PID、不直接 `kill` 进程。daemon shutdown path 至少保证：

```text
进入 stopping
→ 不再接受新的业务操作
→ 让已接受操作到达安全完成点；未提交 transaction 必须 rollback
→ 关闭 Lithograph / SQLite connection lifecycle
→ flush 必要日志
→ 退出进程并释放 OS lock
```

平台正常 termination signal / event（例如 Unix SIGINT / SIGTERM）也进入同一个 graceful shutdown path。`stop` 对已经 `stopped` 的状态是 idempotent success。若 lock owner 仍存在但 HTTP control channel 不可用，v1 不根据 PID 做 force kill；CLI 返回 daemon unavailable，由用户或外部 supervisor 处理异常进程。

### Restart 与配置生效

`kg daemon restart` 等价于显式的 lifecycle composition：

```text
stop current active daemon using lock endpoint
→ old process releases lock
→ start new kgosd
→ new process重新读取当前 config.toml
→ publish new active endpoint
```

如果 daemon 原本已经 stopped，`restart` 直接执行 start。因此手工修改运行中的 `config.toml` 不会让老进程漂移或退出；调用方在准备应用新 startup config 时显式执行 restart。

### OS service manager 边界

v1 不建立自己的开机启动注册、service installation 或 process supervisor。需要长期托管时，macOS launchd、Linux systemd user service、Windows Service 等只需要执行 foreground `kgosd`。`kg daemon start` 是方便用户/AI 的本地 background launcher，不替代操作系统 service manager。

exact HTTP control route、background detach 的平台实现、shutdown wait timeout 和 system-service packaging 属于工程实现合同，不改变上述 lifecycle 语义。

## 边界

- `kg`、SDK、Web 都不能直接访问 SQLite / Lithograph 来绕过 `kgosd`；
- v1 不提供随机端口 fallback；
- v1 不提供第二种 IPC transport；
- v1 不提供 local token / auth；显式配置非 loopback host 也不会改变这一点；
- Web 与 API 由同一 `kgosd` origin 提供；
- `config.toml` 不 hot reload；host / port 通过显式 restart 生效；
- `kgosd.lock` 只承担 single-instance + active-endpoint 定位，不保存 PID 或业务状态；
- 业务命令不隐式启动 `kgosd`；
- `~/.kgosd/` 是 daemon runtime/config/persistent-data home，但不是 KG OS Knowledge graph 本身的另一套存储模型；
- `data/` 的 Knowledge Base layout 与 target semantics 必须由后续独立设计决定。
