# 本地运行时

本文件是 KG OS v1 **`kgosd` 本地服务、HTTP bind、Web hosting、默认 endpoint 与 `~/.kgosd/` 本地目录布局**的设计真源。Kernel 能力由 [Object](object.md)、[Graph](graph.md) 与 [Evolution](evolution.md) 负责；CLI 命令由 [CLI](cli.md) 负责。

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
- `~/.kgosd/run/` 不生成或保存 authentication token；
- 默认 `127.0.0.1` 只允许本机访问；如果调用方显式配置非 loopback `server.host`，同一个无认证 Web/API 会暴露到该 bind address 可达的网络。

因此 v1 的 configurable host 是一个明确的 operator choice，不是远程安全模型。非 loopback bind **不会自动启用认证、TLS 或权限隔离**；需要这些能力的多用户 / 不可信网络 deployment 必须另行设计。

## `~/.kgosd/` 目录

KG OS v1 在当前 OS 用户 home 下使用一个明确的 daemon home：

```text
~/.kgosd/
├── config.toml
├── run/
│   └── daemon.json
├── logs/
└── data/
```

这些目录职责固定如下。

### `config.toml`

`config.toml` 是持久本地配置。v1 当前冻结的 server 配置只有 host 与 port：

```toml
[server]
host = "127.0.0.1"
port = 4765
```

省略 `server.host` 等价默认 `127.0.0.1`；省略 `server.port` 等价默认 `4765`。`server.host` 必须是合法 IPv4 address string；v1 不把 hostname / DNS resolution 引入 bind contract。未来新增配置字段必须有真实运行需求，不能把尚未存在的扩展点提前塞入配置文件。

### `run/daemon.json`

`run/` 只存当前 daemon instance 的可重建运行状态，不保存业务真源或 secret。v1 这里只冻结文件职责，不冻结一套新的公共 JSON API；实现可以记录类似下面的诊断字段：

```json
{
  "pid": 12345,
  "endpoint": "http://127.0.0.1:4765",
  "version": "0.1.0",
  "startedAt": 0
}
```

其中如果记录 `endpoint`，它必须和已加载配置及实际 bind 一致。文件用于 status / diagnostics，不是另一份 endpoint 配置真源；异常退出后残留的 stale runtime file 不能证明 daemon 仍然存活。精确字段、时间单位与兼容策略属于 operator/runtime 实现合同，不能被业务 CLI 当成 Kernel wire contract。

### `logs/`

`logs/` 保存 `kgosd` 的本地诊断日志。日志格式、rotation 与 retention 属于运维实现合同；它不是 Knowledge Base history，也不能成为业务状态真源。

### `data/`

`data/` 是 `kgosd` 拥有的持久 runtime data 根目录。它与 `run/` 不同：daemon 重启不能把 `data/` 当作临时状态清理。

当前只冻结这个 ownership 与根路径；**Knowledge Base 在 `data/` 中的具体布局暂不由本决定定义**。一个 daemon 最终管理一个还是多个 Knowledge Base，以及对应的命名、选择、文件路径和 lifecycle，会直接影响 CLI / Web target 模型，需要在该主题设计时单独冻结，不能从 `data/` 目录存在推导出来。

## 启动与发现

一个 `~/.kgosd/` runtime profile 在 v1 同一时间只预期一个 active `kgosd`。daemon 启动流程至少遵守：

```text
resolve ~/.kgosd/
→ load/create config.toml
→ resolve configured host + port
→ bind <host>:<port>
→ write run/daemon.json
→ serve Web + API
```

`kg` 不需要随机 endpoint discovery。业务命令按同一 `~/.kgosd/config.toml` 解析 endpoint：具体 host 直接连接 `http://<host>:<port>`；`0.0.0.0` 则连接本机 `http://127.0.0.1:<port>`。`daemon.json` 可用于 status / diagnostics，但不能覆盖 config 中的 host / port。

进程是由登录启动、显式 command、系统 service 还是其它机制拉起，`daemon start|stop|status` 等 operator command 的最终命令形态，以及异常退出清理策略，继续属于 process lifecycle / implementation 设计，不改变这里已经冻结的 endpoint、目录或 HTTP 模型。

## 边界

- `kg`、SDK、Web 都不能直接访问 SQLite / Lithograph 来绕过 `kgosd`；
- v1 不提供随机端口 fallback；
- v1 不提供第二种 IPC transport；
- v1 不提供 local token / auth；显式配置非 loopback host 也不会改变这一点；
- Web 与 API 由同一 `kgosd` origin 提供；
- `~/.kgosd/` 是 daemon runtime/config/persistent-data home，但不是 KG OS Knowledge graph 本身的另一套存储模型；
- `data/` 的 Knowledge Base layout 与 target semantics 必须由后续独立设计决定。
