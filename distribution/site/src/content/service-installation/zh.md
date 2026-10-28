---
title: "安装 KG OS"
description: "部署 KG OS、连接 ChatGPT、制作私人 Plugin，并完成自检、升级与恢复。"
version: "0.3.5"
---

<!-- cspell:words newurl rstrip isfinite hashlib pathlib urlopen hexdigest sudoedit xattrs getpass fileno -->

本教程面向你选定的 **Linux amd64 主机**。推荐 **Docker Compose + Web 初始化**；也提供 Docker 命令和配置文件初始化。已有服务请先核对身份与状态，复用原数据，不按新安装步骤覆盖。

安装顺序：**部署与初始化 → 公网 HTTPS → 连接 ChatGPT → AI 制作私人 Plugin → 全局引导词 → 自检与使用**。基础 MCP 应用可以独立使用；希望获得四个官方 Skill 与完整使用引导时，继续完成私人 Plugin 安装。

**已有实例**：先记录实际镜像版本、持久目录、启动配置与公网地址，用第 4 步的只读状态查询确认现状。`ready` 时沿用原路径从第 6 步验收；其他状态按第 11 步恢复。不要执行新目录、建容器或重新初始化步骤；非本教程布局使用原实例的对应命令。

## 1. 准备环境

你需要：

- Linux x86_64 主机、可操作 Docker Engine 的账户、Bash、curl、Python 3；Compose 路径另需 Docker Compose **2.30 或更新版本**，用于原样读取凭证文件。
- GNU tar、GNU coreutils（含 sha256sum、mv）、可用的 sudo 权限，用于完整备份和保留文件属主；升级前为备份准备足够空间。
- 持久磁盘、可以访问 GHCR 与所选 Embedding 服务的网络。容器内的 `localhost` 指容器自身；主机或内网模型需要容器可达的真实地址。
- 一个由你管理的域名，例如 `kgos.example.com`，以及最终根地址 `https://kgos.example.com`。域名、主机、模型服务和相关费用由你选择。
- OpenAI-compatible Embeddings 服务的 Base URL、模型名、实际输出维度（1–4096）、`cosine` 或 `euclidean` 相似度算法，以及服务要求的 API Key；无需认证的服务可留空。

- 目标 ChatGPT 账户或 Workspace 允许添加自定义 MCP、安装并使用 Plugin；制作私人 Plugin 还需要可用的 Plugin Creator。先检查 [ChatGPT Plugins](https://chatgpt.com/plugins) 中的入口与 Workspace 权限。缺少能力时由你选择申请管理员开放、改用另一个获准账户，或先完成服务部署；不能把服务成功称作完整安装。

在目标主机确认环境：

```bash
uname -m
docker version
docker compose version
```

预期架构为 `x86_64`，Docker 输出包含 Server；仅 Docker 命令路径可跳过 Compose 检查。当前发行不提供原生 arm64 镜像。本教程不覆盖模拟运行或替你选择云主机。

### 版本与镜像

**适用版本：KG OS v0.3.5。** 镜像与官方 Plugin 来自 [正式 Release](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.5)，命令固定版本和不可变 digest：

```text
ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
```

该镜像仅支持 `linux/amd64`，默认端口 `3777`，运行身份 `10001:10001`。容器 `/workspace` 对应你的持久目录，实例配置与数据位于其下的 `.kgos`。官方当前不提供 `:latest` 浮动标签。已有实例先按[升级流程](#upgrade)核对兼容性，不直接套用新安装步骤。

通过页面版本菜单查看各个正式发布版本的完整手册；切换语言时保持所选版本。本版中英文手册、[AI 安装指南](https://kgos.sites.y2l.top/install/v0.3.5/INSTALL.md)和[官方 Plugin](https://github.com/bYiyLi/kg-releases/releases/download/v0.3.5/kgos-plugin-v0.3.5.zip)均适用于 KG OS v0.3.5。新版本发布不会覆盖本版正文；升级前查看目标版本说明。官方 Plugin 包用于取得 Skill 与资源，AI 安装流程以本版配套指南为准。

### 建立独立安装目录

以下命令用于**全新安装**。先检查项目目录、容器名、网络名和卷名是否已被使用：

```bash
ls -ld "$HOME/kgos"
docker ps -a --format '{{.Names}}'
docker network ls --format '{{.Name}}'
docker volume ls --format '{{.Name}}'
ss -ltn
```

新安装时，目录不存在导致 `ls` 报错是正常的。若已有 `~/kgos`、`kgos`、`kgos-caddy`、`kgos-net`、`kgos-caddy-data`、`kgos-caddy-config` 或端口 `3777` 被占用，先确认归属。选择复用原安装或为新安装更换整套名称和端口，不能删除或接管未知资源。若主机没有 `ss`，使用其网络管理工具确认端口。

确认上述名称空闲后，在同一个终端中依次执行；任一命令失败先处理，不继续粘贴后续命令：

```bash
(
  set -eu
  umask 077
  mkdir "$HOME/kgos"
  cd "$HOME/kgos"
  sudo install -d -m 0700 -o 10001 -g 10001 "$PWD/workspace" "$PWD/workspace/.kgos"
  install -m 0600 /dev/null embedding.env
  docker network create kgos-net
  docker pull ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
)
```

准备命令在独立子 Shell 中遇错即停；已有目录不会继续执行权限或文件操作。中断后先检查已经创建的目录、网络和已拉取的镜像，仅补齐确认缺失的步骤，不整段重跑，也不删除已生成的数据。全部成功后，后续命令均在以下工作目录与私有文件权限下执行：

```bash
cd "$HOME/kgos"
umask 077
```

`workspace` 只在这次新建的目录上设置权限；不要对已有数据目录递归改属主。`embedding.env` 是仅本机账户可读写的凭证文件，Web 路径保持为空。

## 2. 选择初始化方式

| 方式                                       | 适合谁                 | 启动前要做什么                                 |
| ------------------------------------------ | ---------------------- | ---------------------------------------------- |
| [Web 可视化初始化](#start-service)（推荐） | 希望逐步填写并测试连接 | 保持 `.kgos` 无 `config.toml`，直接进入第 3 步 |
| [配置文件初始化](#file-init)               | 希望自行管理完整配置   | 完成本节配置，再进入第 3 步                    |

只选一种。已经存在 `config.toml`、`auth.json` 或数据库时，先核实是否为旧安装，不要把它当作空目录。

<a id="file-init"></a>

### 配置文件路径：先准备完整配置

在 `~/kgos` 创建 `config.toml`，用你的域名、服务和模型替换示例值。下列 OpenAI 地址与模型只演示字段关系，不表示你已选择该供应商；模型输出必须实际为配置维度。

```toml
[server]
public_origin = "https://kgos.example.com"

[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096

[sqlite]
extensions = []

[fulltext]
analyzer = "jieba"

[embedding]
base_url = "https://api.openai.com/v1"
model = "text-embedding-3-small"
dimensions = 1536
similarity = "cosine"
api_key_env = "KGOS_EMBEDDING_API_KEY"
```

- `public_origin` 是**最终公网 HTTPS 根地址**，不含 `/mcp`、其他路径、查询参数或片段；填写它不会自动配置域名或证书。
- `cache.path` 相对 `.kgos` 解析，`max_size_mb` 是正整数；示例使用 4096 MiB 的向量缓存预算，并不预占等量磁盘。`cache`、`fulltext` 和 `embedding` 字段必须完整，不能省略来表示默认或关闭。
- `sqlite.extensions=[]` 不需要填写镜像已内置的官方扩展。`jieba` 是内置全文分析器。
- Base URL 不附加 `/embeddings`；实际请求使用 Base URL 加 `/embeddings`。示例不会发送 `dimensions` 参数，维度应匹配模型实际返回值。
- 需要认证时，在本机编辑器中打开 `embedding.env`，填写下列格式；将占位内容替换成真实值，不加引号。不要将密钥写进 TOML、命令历史、Git 或聊天。

```text
KGOS_EMBEDDING_API_KEY=replace-with-your-provider-key
```

无需认证时，TOML 改为 `api_key_env = ""`，并保持 `embedding.env` 为空。不要设置保留变量 `KGOS_WEB_EMBEDDING_API_KEY`，它只供 Web Setup 内部使用。

保存后将配置安装到实例目录，确保只有运行身份能读写：

```bash
chmod 600 config.toml embedding.env
sudo install -m 0600 -o 10001 -g 10001 config.toml workspace/.kgos/config.toml
```

继续第 3 步。完整合法的配置会在 daemon 启动时触发自动初始化；不需要再启动一个初始化容器或第二个 daemon。

<a id="start-service"></a>

## 3. 选择启动方式

两种方式共享 `workspace`、`embedding.env` 与 `kgos-net`。**二选一**，不要同时创建两个服务。端口只绑定主机 loopback，初始化前不对公网开放。

<a id="compose"></a>

### Docker Compose（推荐）

在 `~/kgos/compose.yaml` 保存完整配置：

```yaml
services:
  kgos:
    image: ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
    platform: linux/amd64
    container_name: kgos
    user: "10001:10001"
    restart: unless-stopped
    ports:
      - "127.0.0.1:3777:3777"
    volumes:
      - ./workspace:/workspace
    env_file:
      - path: ./embedding.env
        format: raw
    networks:
      kgos:
        aliases:
          - kgos
networks:
  kgos:
    external: true
    name: kgos-net
```

```bash
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d
docker compose -f compose.yaml logs --tail 80 kgos
```

`config --quiet` 仅验证结构，不输出展开后的凭证。预期容器保持运行，无权限或初始化失败日志。随后进入第 4 步。

<a id="docker"></a>

### Docker 命令

此路径不依赖 Compose。在 `~/kgos` 执行：

```bash
docker run -d \
  --name kgos \
  --platform linux/amd64 \
  --user 10001:10001 \
  --restart unless-stopped \
  --network kgos-net --network-alias kgos \
  -p 127.0.0.1:3777:3777 \
  --mount type=bind,src="$PWD/workspace",dst=/workspace \
  --env-file "$PWD/embedding.env" \
  ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
docker logs --tail 80 kgos
```

预期容器保持运行，无权限或初始化失败日志。若名称已存在，检查现状，不重复运行创建命令。

## 4. 完成初始化

先在服务主机查询：

```bash
curl --silent --show-error --write-out '\nHTTP %{http_code}\n' http://127.0.0.1:3777/api/v1/setup/status
```

- Web 路径预期 `state="setup_required"`，接着使用下面的向导。
- 配置文件路径自动初始化时会生成管理员 Token，此后匿名状态查询返回 **401**。使用下方认证后的状态查询确认 `initializing` → `ready`，再跳到[配置文件路径的检查](#file-check)。
- 首次查询若返回 `error`，按文末排查；Token 存在后的 HTTP 401 是认证门禁生效，并不表示初始化失败。容器运行也不等于初始化完成。

`auth.json` 创建后，在可信的主机终端使用现有根 Token **认证查询状态，不打印 Token，也不把 Token 放在命令参数中**（从 `~/kgos` 执行）：

```bash
sudo python3 - <<'PY'
import json, pathlib, urllib.request
credential = json.loads(pathlib.Path("workspace/.kgos/auth.json").read_text())
req = urllib.request.Request("http://127.0.0.1:3777/api/v1/setup/status",
    headers={"Authorization": "Bearer " + credential["token"]})
with urllib.request.urlopen(req, timeout=10) as response:
    print(response.read().decode())
PY
```

<a id="web-init"></a>

### Web 路径：四步 Token-first 初始化

在服务主机的浏览器打开 `http://127.0.0.1:3777/setup`。若服务在远程主机，在**你的电脑**另开终端建立 SSH 转发，将用户名和主机替换为你已有的 SSH 连接：

```bash
ssh -N -L 13777:127.0.0.1:3777 your-user@your-server
```

保持 SSH 终端运行，在本机浏览器打开 `http://127.0.0.1:13777/setup`。浏览器不需要直接访问服务器 `3777` 公网端口。

依次完成页面的四步：

1. **管理员凭证**：首次通过 `rotate-token` 生成实例管理员 Token 并保存在自己的密码管理器中；第一次创建后立即生效。此后包括再次生成 Token、查询初始化状态、测试向量服务在内的所有 Setup API 都要求已登录。已有实例须使用原 Token 登录，不能匿名重新生成；Web 自动恢复有效 Session，也提供输入已有 Token 的登录入口。不要将 Token 放入聊天。
2. **公网地址**：把 loopback 预填值改为最终 `https://kgos.example.com`，替换成你实际的域名。不是浏览器当前的 SSH 转发地址。
3. **向量模型**：填写你选定的 Base URL、模型、实际维度、算法及 API Key；无需认证时留空。点击连接测试，必须实际请求成功且返回维度匹配后继续。页面预填供应商只是示例，不代表你的选择。已登录管理员可使用包括本机、私网、Fake-IP 在内的合法 HTTP(S) 地址；服务须从容器可达，仍限制超时、并发、请求大小且禁止重定向。
4. **确认并初始化**：核对配置后提交，等待状态变为 `ready`；失败时保留配置与数据，按文末诊断原因后重启原容器恢复，不重新建库。

Web 会保存完整配置；Embedding Key 单独保存在私有文件中，不写入 TOML。未提交配置且浏览器 Session 丢失时，必须使用已有 Token 重新登录，才能调用 `rotate-token`；成功轮换将使旧 Token 与 Session 失效，须重新保存新 Token。配置已提交后，不再提供此操作；出现 `error` 应保留配置和 `auth.json`，查明原因后重启原容器恢复。

**继续条件**：真实 Embedding 测试通过、Token 已安全保存、`setup/status` 为 `ready`。这四步完成后才进行后续持久化验收。

<a id="file-check"></a>

### 配置文件路径：管理员凭证与真实模型检查

等待 `state="ready"`。系统会生成并保留 `.kgos/auth.json` 中的管理员 Token；通过可信终端把它复制到仅你可读的文件，在本机编辑器查看并保存到密码管理器，不在终端回显：

```bash
sudo install -m 0600 -o "$(id -u)" -g "$(id -g)" workspace/.kgos/auth.json admin-credential.json
```

用该 Token 在上述本地或 SSH 转发入口登录 Web。`ready` 说明运行时与数据库已初始化，**不证明远端模型可用**。

执行下面的一次性检查。它会额外拉取 [Python 官方镜像](https://hub.docker.com/_/python)，仅短暂共享 KG OS 的网络，将实例目录以只读方式挂载，只读取配置及所需的模型凭证并发送一个 Embedding 请求；不创建本体、知识、分支或 Commit。配置文件路径从你的 `embedding.env` 读取凭证；Web 路径仅在配置指定保留变量时读取实例私有模型凭证文件，响应正文和密钥不输出。请求可能产生供应商的一次模型调用费用。

```bash
docker run --rm -i \
  --network container:kgos \
  --env-file "$PWD/embedding.env" \
  --mount type=bind,src="$PWD/workspace/.kgos",dst=/instance,readonly \
  python:3.13-alpine python - <<'PY'
import json, math, os, pathlib, sys, tomllib, urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
try:
    with open('/instance/config.toml', 'rb') as f:
        cfg = tomllib.load(f)['embedding']
    headers = {'Content-Type': 'application/json'}
    if cfg['api_key_env']:
        key = (pathlib.Path('/instance/embedding-api-key').read_text()
               if cfg['api_key_env'] == 'KGOS_WEB_EMBEDDING_API_KEY'
               else os.environ.get(cfg['api_key_env'], ''))
        if not key:
            raise ValueError('missing credential')
        headers['Authorization'] = 'Bearer ' + key
    body = json.dumps({'model': cfg['model'], 'input': 'KG OS installation check',
                       'encoding_format': 'float'}).encode()
    req = urllib.request.Request(cfg['base_url'].rstrip('/') + '/embeddings',
                                 data=body, headers=headers, method='POST')
    with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
        result = json.load(response)
    vector = result['data'][0]['embedding']
    assert len(vector) == cfg['dimensions']
    assert all(type(v) in (int, float) and math.isfinite(v) for v in vector)
    assert any(v != 0 for v in vector)
    print('Embedding check passed:', len(vector), 'dimensions')
except Exception:
    print('Embedding check failed; check URL, model, dimensions, credential and network.', file=sys.stderr)
    sys.exit(1)
PY
```

预期输出 `Embedding check passed` 和你配置的维度。失败先修复既定服务、网络或凭证；初始化后的模型、维度、相似度和全文分析器不能按新安装示例直接更换，确需变更时先取得适用的迁移方案，由你选择。凭证按文末的受控更新步骤处理；若改环境文件，须重新创建本教程的服务容器以载入环境，保留同一 `workspace` 挂载，不删除数据。Compose 可用 `docker compose -f compose.yaml up -d --force-recreate kgos`；Docker 路径先停止并删除**本教程刚创建的容器**再用原创建命令启动，不能删除卷或目录。完成同网络检查后再开放公网。此检查也支持 Web 初始化后的原配置，可在升级时复用；不需要重新打开 Setup 或生成凭证。

## 5. 配置公网 HTTPS

只有第 4 步通过后才开放公网入口。已有可信 HTTPS 反向代理可以复用：将请求转发到本实例，保留 Host/协议、支持 MCP 流式响应，确保外部根地址与 `public_origin` 一致。

以下标准方案使用 [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)：

1. 将你域名的 A 记录指向这台主机公网 IPv4；若配置 AAAA，IPv6 也必须实际可达。
2. 在主机防火墙、云安全组和必要的路由/NAT 中允许外部 TCP `80`、`443` 到达该主机，并确认未被其他服务占用。保持 KG OS `3777` 只在 loopback 发布。
3. 主机允许 HTTPS 出站访问证书颁发服务；填写域名不等于已有证书。

在 `~/kgos/Caddyfile` 保存，替换为你的真实域名：

```text
kgos.example.com {
    reverse_proxy kgos:3777 {
        flush_interval -1
    }
}
```

Caddy 与 KG OS 使用同一个 `kgos-net` 网络；`kgos` 是容器网络别名。以下两种方式与第 3 步对应，选原来的路径。

### Compose 路径的 HTTPS

在 `compose.https.yaml` 保存：

```yaml
services:
  caddy:
    image: caddy:2.11.7-alpine
    container_name: kgos-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - kgos
volumes:
  caddy_data:
    name: kgos-caddy-data
  caddy_config:
    name: kgos-caddy-config
```

```bash
docker compose -f compose.yaml -f compose.https.yaml config --quiet
docker compose -f compose.yaml -f compose.https.yaml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f compose.yaml -f compose.https.yaml up -d caddy
docker logs --tail 80 kgos-caddy
```

### Docker 命令路径的 HTTPS

```bash
docker volume create kgos-caddy-data
docker volume create kgos-caddy-config
docker run --rm \
  --mount type=bind,src="$PWD/Caddyfile",dst=/etc/caddy/Caddyfile,readonly \
  caddy:2.11.7-alpine caddy validate --config /etc/caddy/Caddyfile
docker run -d \
  --name kgos-caddy \
  --restart unless-stopped \
  --network kgos-net \
  -p 80:80 -p 443:443 \
  --mount type=bind,src="$PWD/Caddyfile",dst=/etc/caddy/Caddyfile,readonly \
  --mount type=volume,src=kgos-caddy-data,dst=/data \
  --mount type=volume,src=kgos-caddy-config,dst=/config \
  caddy:2.11.7-alpine
docker logs --tail 80 kgos-caddy
```

首次启动会申请证书；成功前不要继续。Caddy 的 `/data` 和 `/config` 是持久卷，重建代理时继续使用，不清理证书存储。证书申请失败时按[常见问题](#recovery)处理，成功后再继续。

## 6. 验收服务

### HTTPS、Web 与认证

在能够访问公网的客户端执行，替换示例域名；不要使用 `-k` 跳过证书检查：

```bash
curl --silent --show-error --write-out '\nHTTP %{http_code}\n' https://kgos.example.com/api/v1/setup/status
curl --silent --show-error -D - -o /dev/null https://kgos.example.com/mcp
curl --fail --silent --show-error https://kgos.example.com/.well-known/oauth-authorization-server
curl --fail --silent --show-error https://kgos.example.com/.well-known/oauth-protected-resource/mcp
```

验收结果应同时满足：

- HTTPS 证书可信；已生成 Token 时，公网匿名访问 `setup/status` 应返回 **401**，不得泄漏 `ready`。通过第 4 步的已认证状态查询或 Web 登录确认 `ready`，并核对 MCP 路径为 `/mcp`。
- 匿名 `/mcp` 返回 **401**，`WWW-Authenticate` 指向正确的 OAuth 资源元数据；匿名拒绝是预期。
- OAuth 元数据的 `issuer`、授权/Token 地址和资源地址均指向你填写的公网根地址。
- 浏览器打开 `https://kgos.example.com`，使用你保存的管理员 Token 正常登录；确认进入正确实例并可读取现有版本和知识视图。空知识库允许通过，不创建测试业务数据。

这只是服务及公开接入验收，不等于 ChatGPT 已连接或 MCP 工具调用已通过。

### 重启与持久化

确认此时没有其他客户端写入。下面脚本只读调用当前版本与一致性接口，仅保留 State 标识、一致性及数据/Token 摘要，不落盘完整 State 数据或凭证；记录只在本机比较，不用于公开分享。第 1 步的 `umask 077` 使这些文件仅当前账户可读写。首次使用前创建 `acceptance.py`：

```python
import hashlib, json, pathlib, urllib.request
root = pathlib.Path('workspace/.kgos')
token = json.loads((root / 'auth.json').read_text())['token']
def call(path, body):
    request = urllib.request.Request('http://127.0.0.1:3777/api/v1/' + path,
        data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)
overview = call('evolution/overview', {})
state = call('evolution/get', {'state': overview['state']})
assert state['state'] == overview['state']
assert state['consistency']['status'] == 'valid'
assert state['consistency']['issues'] == []
data_hash = hashlib.sha256(json.dumps(state['data'], sort_keys=True,
    separators=(',', ':')).encode()).hexdigest()
print(json.dumps({'overview': overview, 'state': state['state'],
    'consistency': state['consistency'], 'hasData': state['hasData'],
    'stateDataFingerprint': data_hash,
    'credentialFingerprint': hashlib.sha256(token.encode()).hexdigest()}, sort_keys=True))
```

在服务主机执行，保存重启前记录：

```bash
sudo python3 acceptance.py > acceptance-before.json
```

按原启动方式**只重启本教程的 KG OS 容器**：

Compose 路径：

```bash
docker compose -f compose.yaml restart kgos
```

Docker 命令路径：

```bash
docker restart kgos
```

只执行所选路径的命令。按第 4 步的已认证状态查询确认 `ready` 后执行：

```bash
sudo python3 acceptance.py > acceptance-after.json
diff -u acceptance-before.json acceptance-after.json
```

预期无差异：默认分支、不可变 State、State 数据及管理员身份保持一致。再次用原 Token 登录并读取原有内容。非空库还应在 Web 核对原有内容；空库无需为了验收创建知识。并发写入可能正常改变记录，应先排除它，不能据此重置数据。

**服务安装完成条件**：初始化 `ready`、真实 Embedding 验证通过、HTTPS 与认证正确、重启后身份/State/已有数据保持。任何一项失败或不可观察，保留已完成部分并继续处理对应缺项。

<a id="connect-chatgpt"></a>

## 7. 连接 ChatGPT 并验收

服务验收通过后，在你选定的账户或 Workspace 操作。这里先创建可使用 MCP 的**基础应用**；ChatGPT 会将它显示为 Plugin，它尚不包含四个官方 Skill。已有指向正确实例的可用应用，直接复用并进入只读验收。

### 添加基础 MCP 应用

按 [OpenAI 官方连接流程](https://developers.openai.com/plugins/deploy/connect-chatgpt)操作，界面名称以当前账户实际显示为准：

1. 打开 [ChatGPT Plugins](https://chatgpt.com/plugins)，先确认当前账户与 Workspace。
2. 选择 **＋ → Add custom MCP server**，填写可识别的名称（例如“KG OS 基础连接”）和用途说明。
3. 在 **Connection** 选择公网地址，填入 `https://你的域名/mcp`，不能只填根地址或 `/setup`。
4. 选择 **OAuth**。KG OS 使用 ChatGPT CIMD 身份与 PKCE，不需要自建 OAuth client ID 或 client secret。若界面要求填写它们，不填管理员 Token，先核对所选认证方式与平台能力。
5. 阅读授权风险与工具权限，仅在接受后勾选 **I understand and want to continue**，再选择 **Create as a plugin**。按页面提示完成 OAuth；确认跳转域名是你自己的 KG OS，必要时在该站点用管理员 Token 登录，核对并同意 ChatGPT 的连接请求。
6. 检查服务实际发现的工具和名称，安装生成的基础 Plugin。新建会话，在输入框键入 **@** 并选择它。

KG OS 当前连接权限包含读写；安装验收只执行只读调用，后续写入仍需你的授权。管理员 Token 只在自己的可信 KG OS Web 页面输入，不能放进 ChatGPT 的 client secret、安装提示词或聊天。服务重启后 OAuth Access/Refresh Token 会失效；在**原连接**重新授权即可，管理员身份和知识库仍保留。不要因此删除应用或重新初始化。

### 在目标 ChatGPT 会话实际验证

选中基础 Plugin 后，发送以下只读请求；先将“目标服务”对应到你刚创建或复用的连接，不能因两个连接有相同 State 就认定它们是同一物理实例：

```markdown
请只读检查当前会话选中的 KG OS 应用，不写入数据。

1. 确认连接指向我指定的公网服务和账户。
2. 用 kgos_docs 读取 guides/reading.md、guides/evolution.md 及当前 SDK 签名。
3. 调用 evolution.overview 解析不可变 State，再用该 State 调用 evolution.get。
4. 确认返回同一 State、consistency.status="valid"、consistency.issues=[]。
5. 用同一 State 调用 ontology.read，核实业务读取成功，不能只看外层工具返回成功。
   列出应用与连接、实际 State、检查结果、失败和未知项。空知识库允许通过；不创建模型、知识、分支或 Commit。
```

**继续条件**：文档和业务读取真实成功、连接指向选定服务、同一 State 的一致性正常且 Ontology 可读。工具列表出现或 OAuth 页面成功不能单独代替验收。空知识库允许通过；失败先按[恢复表](#recovery)处理，保留已连接应用，成功后再进入下一步。

<a id="private-plugin"></a>

## 8. 制作私人 Plugin、配置引导词并自检

在 [ChatGPT Plugins](https://chatgpt.com/plugins) 找到并安装 **Plugin Creator**；已可用时直接复用。在安装会话中启用它与已通过验收的基础 KG OS 应用；若当前界面无法同时选中，使用会话可用的应用选择或工具入口。找不到 Plugin Creator 时先核对账户与 Workspace 权限，不改动现有连接。复制下面的请求，替换方括号；没有旧私人 Plugin 时填写“无”，不确定时说明未知，不提供凭证：

```markdown
请按照官方 KG OS 私人 Plugin 安装手册协助安装：
https://kgos.sites.y2l.top/install/v0.3.5/INSTALL.md

已验证的 ChatGPT KG OS 应用：[应用名称]
公网服务：https://[我的域名]
目标 ChatGPT 账户/Workspace：[目标]
已有私人 Plugin：[名称与版本；没有则填“无”]
使用需求与需要保留的定制：[说明]

复用这个应用和连接，不重新部署或初始化服务。
检查实际服务、官方发行物及旧 Plugin/定制，给出具体方案，经我确认后新建并安装带版本号的私人 Plugin，保留四个官方 Skill。迁移我的定制，冲突由我选择。新版本验收前保留旧 Plugin 和共享连接，未获授权的清理由我决定。
提供完整官方全局引导词与 ChatGPT 配置步骤，最后完成安装自检。不要让我在聊天中提供凭证，已授权步骤不要重复确认。
```

接下来由 AI 按唯一 [INSTALL.md](https://kgos.sites.y2l.top/install/v0.3.5/INSTALL.md)协助完成：

1. **确认方案**：核对服务与同版官方资源；如有旧私人 Plugin，读取旧版内容并与旧官方基线比较，列出定制迁移与冲突。制作前同时核对持久指令入口的容量、已有内容及适用范围；无法观察时说明限制，不假设另一全局入口存在。你选择目标、迁移内容、权限、引导词保存方案与安装范围，确认后执行；已授权步骤不重复确认。
2. **创建并安装新版本**：每次新建名称带官方版本号的私人 Plugin，同版重做增加修订号；复用基础应用的真实连接，保留四个官方 Skill 与资源。旧 Plugin 先保留，发生冲突由你选择，不原地覆盖。
3. **配置全局引导词**：AI 给出完整官方 Global AI Guidance。按 [ChatGPT 个性化设置](https://help.openai.com/en/articles/8096356-chatgpt-custom-instructions)打开 **Settings → Personalization → Custom instructions**，查看现有内容，由你选择追加、合并或替换冲突部分并保存；不静默覆盖原指令。沿用方案中的容量预检；空间不足时仅选择实际可用且适用范围明确的保存方式，或解决已有内容冲突。无法完整保存则保留未配置状态，不临时删节官方正文，也不将项目/单次会话范围当全局加载。
4. **新会话自检**：安装新 Plugin，确认其启用后新建会话并通过 `@` 选中；不在会话中重新粘贴引导词作为“已生效”的证明。发送：

```markdown
使用已安装的 kgos-doctor Skill，只做安装相关 D1–D3 自检：全局引导词、选定 KG OS MCP 连接与知识库、四个官方 Skill。复用适用的已有证据，分别报告官方资源、当前可见指令差异、持久配置证据、普通任务行为，以及连接/Skill 的安装状态、真实调用、版本与资源可用性。整体不可见不掩盖已确认局部差异；未验证部分单列。空知识库允许通过；不写入知识、不创建分支或 Commit、不配置维护任务、不卸载任何内容。
```

AI 应分别列出服务和应用、私人 Plugin 版本、四个官方 Skill 与引用资源、引导词保存和可观察行为，以及旧定制迁移结果。四个 Skill 为 Ontology、Knowledge、VLog 规范和 Doctor，实际资源以所选版本发行包为准。

**完整安装条件**：服务与 ChatGPT 真实读取通过，所选版本私人 Plugin 已安装，四个 Skill 及必要资源齐备可用，引导词完整保存，相关 D1–D3 没有已确认的阻塞缺项。隐藏的宿主加载来源或自动触发轨迹可以标为不可观测，不能据此无限检查；“已安装”“实际可用”“观察到使用”分别记录。知识质量、维护调度与写入业务数据不属于安装条件。你明确选择只使用基础 MCP 应用时，以该范围交付，不声称已安装私人 Plugin。

新 Plugin 验收后，你可选择卸载旧私人 Plugin；不删除仍被使用的基础应用或共享 MCP 连接。制作、安装或验收失败时保留旧版，从实际失败处继续。

## 9. 开始使用

新会话选中 KG OS Plugin，按需要提出任务：

- “查看我知识库的入口和分支简介，说明目前有哪些可用内容。”
- “只读查看当前 Ontology，解释已有模型，不创建新模型。”
- “我想把以下资料整理进知识库，请先结合已有模型给出方案，等我确认后再写入。”

空库可以先查看现有结构，再由你授权建模与保存；安装不预建业务模型或测试内容。后续服务版本升级与私人 Plugin 升级分别按下一节处理。

<a id="upgrade"></a>

## 10. 升级与备份恢复

### 选定目标版本

从 [Releases](https://github.com/bYiyLi/kg-releases/releases)选择正式目标版本，在页面版本菜单打开其完整手册，阅读当前版本到目标版本的兼容性、迁移、停机和恢复要求，取得该版本官方镜像 **Tag + digest** 及 Plugin 资源。目标版本尚未登记到 KGHub 时，先使用该 Release 提供的配套资料，不使用旧版安装提示词制作新版 Plugin。没有明确支持的升级路径时先停止，向项目确认，不能假定任意跨版本兼容或可降级。

以下命令针对本教程的 `~/kgos`、`kgos` 容器与单一 `workspace` 布局。先确认当前实际挂载、网络、端口、凭证来源和启动配置；做过定制的实例必须沿用原参数，并将安装目录外的持久目录、凭证和启动文件纳入备份。不要把默认命令覆盖到自定义实例。

记录当前镜像，输入你选定的官方完整镜像引用并预先拉取。输入必须形如 `ghcr.io/byiyli/kgos:vX.Y.Z@sha256:…`；失败先处理，不进入停机步骤：

```bash
cd "$HOME/kgos"
umask 077
docker inspect --format '{{.Config.Image}}' kgos
read -r -p 'Target official image (version@sha256 digest): ' KGOS_TARGET_IMAGE
[[ "$KGOS_TARGET_IMAGE" =~ ^ghcr\.io/byiyli/kgos:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$ ]] &&
  docker pull "$KGOS_TARGET_IMAGE"
```

若恢复到另一个终端，重新设置并核对目标值；不要用空变量或浮动标签继续。代理 Caddy 不随本次 KG OS 服务升级替换，其现有证书卷继续保留。

### 停止写入并完整备份

暂停 ChatGPT 和其他客户端的写入，等待在途操作结束，先执行 `sudo python3 acceptance.py > acceptance-before-upgrade.json` 保存第 6 步的只读基线。确认磁盘同时容纳完整备份与运行数据。**不要先修改 Compose 镜像或配置**，备份必须包含旧版可恢复的启动配置。

Compose 路径：

```bash
docker compose -f compose.yaml stop kgos
docker inspect --format '{{.State.Running}}' kgos
```

Docker 命令路径：

```bash
docker stop kgos
docker inspect --format '{{.State.Running}}' kgos
```

只执行原路径；最后一行必须为 `false`。若应用由外部管理器自动拉起，先按它原有方式停止，确认不会重新写入，然后继续公共备份步骤：

```bash
(
  set -eu
  umask 077
  test "$PWD" = "$HOME/kgos"
  test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
  sudo test -d workspace/.kgos
  install -d -m 0700 "$HOME/kgos-backups"
  backup_dir=$(mktemp -d "$HOME/kgos-backups/pre-upgrade.XXXXXXXX")
  docker inspect kgos > "$backup_dir/container-inspect.private.json"
  docker inspect --format '{{.Config.Image}}' kgos > "$backup_dir/previous-image.txt"
  sudo tar --numeric-owner --acls --xattrs -cpf "$backup_dir/kgos.tar" -C "$HOME" kgos
  sudo chown "$(id -u):$(id -g)" "$backup_dir/kgos.tar"
  chmod 600 "$backup_dir/kgos.tar"
  (cd "$backup_dir" && sha256sum kgos.tar > kgos.tar.sha256 && sha256sum -c kgos.tar.sha256)
  printf '%s\n' "$backup_dir" > .last-upgrade-backup
  printf 'Backup saved: %s\n' "$backup_dir"
)
```

预期 `kgos.tar: OK` 并输出新的私有备份目录。归档包含整个安装目录：`.kgos` 数据库、认证、完整配置、缓存、环境文件、Compose、Caddyfile 及其他现有文件，并保留数字 UID/GID、权限、ACL 和扩展属性。备份放在安装目录外且每次新建，不覆盖旧备份；`container-inspect.private.json` 可能含密钥，只在本机私有保存，不上传或贴入聊天。

Caddy 的证书卷不在此归档中，本次保持原样；若要迁移整台主机，另行按代理运维方式备份证书卷和外部资源。任何备份、校验或停服检查失败都不替换镜像。镜像已拉取而服务尚未替换时，可以修复备份问题后继续，或启动原容器恢复服务。

### 按原启动方式替换镜像

**Compose**：只将原 `compose.yaml` 中 `kgos.image` 改为上面选定并已拉取的完整引用，保留其他配置、同一项目目录与全部原挂载。确认新值与目标一致后执行：

```bash
(
  set -eu
  test -n "${KGOS_TARGET_IMAGE:-}"
  test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
  backup_dir=$(cat .last-upgrade-backup)
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  docker compose -f compose.yaml config --quiet
  test "$(docker compose -f compose.yaml config --images)" = "$KGOS_TARGET_IMAGE"
  docker compose -f compose.yaml up -d --no-deps --force-recreate kgos
  docker inspect --format '{{.Config.Image}}' kgos
  docker logs --tail 80 kgos
)
```

**Docker 命令**：下列操作保留已停止的旧容器并改名，创建新容器，重新载入同一凭证文件；不会删除 `workspace`。仅适用于原参数与本教程一致的实例，定制实例应使用已记录的原参数，只更换镜像：

```bash
(
  set -eu
  test -n "${KGOS_TARGET_IMAGE:-}"
  [[ "$KGOS_TARGET_IMAGE" =~ ^ghcr\.io/byiyli/kgos:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$ ]]
  test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
  backup_dir=$(cat .last-upgrade-backup)
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  previous_container="kgos-before-upgrade-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
  docker rename kgos "$previous_container"
  printf '%s\n' "$previous_container" > .previous-container
  docker run -d \
    --name kgos \
    --platform linux/amd64 \
    --user 10001:10001 \
    --restart unless-stopped \
    --network kgos-net --network-alias kgos \
    -p 127.0.0.1:3777:3777 \
    --mount type=bind,src="$PWD/workspace",dst=/workspace \
    --env-file "$PWD/embedding.env" \
    "$KGOS_TARGET_IMAGE"
  docker inspect --format '{{.Config.Image}}' kgos
  docker logs --tail 80 kgos
)
```

若新容器创建失败，旧容器仍以 `.previous-container` 记录的名称保留；先核实现状再恢复，不重复执行整段。不要同时启动两个访问同一 `workspace` 的 KG OS 容器，也不要运行 `down -v`、删卷或初始化命令。

### 升级验收与 Plugin 升级

查看日志，并按第 4 步的已认证状态查询确认 `ready` 后执行：

```bash
sudo python3 acceptance.py > acceptance-upgrade.json
diff -u acceptance-before-upgrade.json acceptance-upgrade.json
```

核对实际镜像为所选 Tag/digest，按第 6 步检查 HTTPS、原管理员 Token、现有内容、State 和身份。兼容说明允许改变的元数据须按该版本说明判断，不能将差异一概当成功或据此重置。重复第 4 步的同网络真实 Embedding 检查；该检查同时支持 Web 与配置文件初始化，不为验收新增业务数据。模型或凭证问题按原初始化路径诊断，不重新初始化。

重启会使旧 OAuth Token 失效：在原 ChatGPT 连接重新授权，按第 7 步重做只读验收。工具元数据变化时刷新原连接并在新会话检查。服务通过后，切换到**升级目标版本**的 KGHub 手册，按该版 ChatGPT 与私人 Plugin 步骤读取旧定制、确认迁移方案、创建新版本并验收；交接提示词、`INSTALL.md`、四个 Skill 和 Plugin 资源都必须对应目标版本，不继续复制本旧版第 8 步的固定版本提示词。再由你选择卸载旧版；不原地替换旧 Plugin，不删除共享连接。

<a id="upgrade-recovery"></a>

### 升级失败后恢复

先停止写入和失败的 KG OS 服务，保留失败日志、容器配置、整个失败目录与原备份。**镜像回退不等于数据恢复**：目标版本可能已经改写数据或配置，不能直接启动旧容器碰运气。

由你选择按目标版本说明修复，或按其支持的恢复方式回到完整旧备份。需要恢复数据时，先将选定的可信备份解包到全新的私有目录进行核对，下面操作不覆盖当前实例：

```bash
(
  set -eu
  umask 077
  read -r -p 'Absolute path to the selected pre-upgrade backup: ' backup_dir
  test "${backup_dir#/}" != "$backup_dir"
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  restore_dir=$(mktemp -d "$HOME/kgos-restore.XXXXXXXX")
  sudo tar --acls --xattrs --same-owner -xpf "$backup_dir/kgos.tar" -C "$restore_dir"
  sudo test -d "$restore_dir/kgos/workspace/.kgos"
  printf 'Restored privately for inspection: %s/kgos\n' "$restore_dir"
)
```

核对解包目录中的原配置、环境文件与 UID/GID；确认归档是你选定的旧版本、数据完整，且升级前镜像仍可获取。以下恢复命令只适用于本教程标准布局，以及目标版本说明允许恢复整套旧备份的情况。保持所有共享该 `workspace` 的容器停止；Docker 清单查询失败时不切换目录，不能当作容器不存在。自定义布局须按其原启动合同恢复。命令输入上一步输出的完整恢复路径与选定备份路径；恢复前会比较解包内容与选定归档，防止误用另一份同版本备份。任一检查失败先处理，不重复整段。

**Compose 恢复**保留原目录、项目名、配置、挂载和外部网络。它先私有保存失败容器的日志与配置，并将整个失败安装目录另名保留；随后 Compose 会替换本教程的失败容器，容器对象本身不作为保留凭据。Caddy 与证书卷不改动：

```bash
(
  set -eu
  umask 077
  cd "$HOME"
  read -r -p 'Selected restored directory (.../kgos-restore.XXXXXXXX/kgos): ' restored_path
  read -r -p 'Selected pre-upgrade backup directory: ' backup_dir
  [[ "$restored_path" == "$HOME"/kgos-restore.*/kgos ]]
  test "${backup_dir#/}" != "$backup_dir"
  sudo test -d "$restored_path/workspace/.kgos"
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  sudo tar --acls --xattrs --compare --file "$backup_dir/kgos.tar" --directory "$(dirname "$restored_path")"
  previous_image=$(cat "$backup_dir/previous-image.txt")
  docker info >/dev/null
  test "$(docker compose -f "$restored_path/compose.yaml" config --images)" = "$previous_image"
  failed_dir=$(mktemp -d "$HOME/kgos-failed.XXXXXXXX")
  container_names=$(docker ps -a --format '{{.Names}}')
  if printf '%s\n' "$container_names" | grep -Fxq kgos; then
    docker stop kgos
    test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
    docker logs kgos > "$failed_dir/container.log.private" 2>&1
    docker inspect kgos > "$failed_dir/container-inspect.private.json"
  fi
  mv -T -- "$HOME/kgos" "$failed_dir/installation"
  test ! -e "$HOME/kgos"
  mv -T -- "$restored_path" "$HOME/kgos"
  cd "$HOME/kgos"
  docker compose -f compose.yaml config --quiet
  docker compose -f compose.yaml up -d --no-deps --force-recreate kgos
  printf 'Failed files retained: %s\n' "$failed_dir"
  docker logs --tail 80 kgos
)
```

**Docker 命令恢复**先从当前安装目录读取已记录的升级前容器名，核对其镜像与备份一致；保留旧容器原有环境、挂载和其他参数。失败的新容器改名保留，失败目录另名保留，然后恢复旧容器：

```bash
(
  set -eu
  umask 077
  cd "$HOME"
  read -r -p 'Selected restored directory (.../kgos-restore.XXXXXXXX/kgos): ' restored_path
  read -r -p 'Selected pre-upgrade backup directory: ' backup_dir
  [[ "$restored_path" == "$HOME"/kgos-restore.*/kgos ]]
  test "${backup_dir#/}" != "$backup_dir"
  sudo test -d "$restored_path/workspace/.kgos"
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  sudo tar --acls --xattrs --compare --file "$backup_dir/kgos.tar" --directory "$(dirname "$restored_path")"
  previous_image=$(cat "$backup_dir/previous-image.txt")
  docker info >/dev/null
  previous_container=$(cat "$HOME/kgos/.previous-container")
  [[ "$previous_container" == kgos-before-upgrade-* ]]
  test "$(docker inspect --format '{{.Config.Image}}' "$previous_container")" = "$previous_image"
  docker stop "$previous_container"
  test "$(docker inspect --format '{{.State.Running}}' "$previous_container")" = false
  failed_dir=$(mktemp -d "$HOME/kgos-failed.XXXXXXXX")
  container_names=$(docker ps -a --format '{{.Names}}')
  if printf '%s\n' "$container_names" | grep -Fxq kgos; then
    docker stop kgos
    test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
    docker logs kgos > "$failed_dir/container.log.private" 2>&1
    docker inspect kgos > "$failed_dir/container-inspect.private.json"
    failed_container="kgos-failed-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
    docker rename kgos "$failed_container"
    printf '%s\n' "$failed_container" > "$failed_dir/container-name.txt"
  fi
  mv -T -- "$HOME/kgos" "$failed_dir/installation"
  test ! -e "$HOME/kgos"
  mv -T -- "$restored_path" "$HOME/kgos"
  docker rename "$previous_container" kgos
  docker start kgos
  printf 'Failed files retained: %s\n' "$failed_dir"
  docker logs --tail 80 kgos
)
```

没有 `.previous-container`、旧容器丢失或参数与备份不符时，不猜名字、不启动；读取私有备份中的原镜像和原参数，明确恢复方案后重建。目录切换或启动结果未知时先检查原路径、失败目录和容器状态；已移动成功的目录不重复移动，不能覆盖或删除现场。

恢复会放弃备份后发生的修改，必须由你明确选择。恢复后按第 6、7 步重新验收并重新授权 ChatGPT。保留旧镜像、备份和失败现场，直到你确认新版本或恢复版本正常，再决定清理。

<a id="recovery"></a>

## 11. 常见问题与恢复

| 现象                                     | 检查与下一步                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup_required`                         | 无完整配置时进入 Web；手工路径检查文件是否在 `workspace/.kgos/config.toml`。运行中补文件不会热加载，检查完成后重启本容器                                                                     |
| `initializing`                           | 查看 `phase` 与容器日志，等待当前操作，不重复提交或启动第二个 daemon；长期无进展先定位日志错误                                                                                               |
| `error`                                  | 记录不含密钥的公开 `message` 和相关日志；检查完整 TOML、权限、磁盘和模型凭证。保留数据，修复原因后重启原容器；配置已发布时保留原配置与 `auth.json`，查因后重启同一容器恢复，不重复提交新配置 |
| 容器退出或权限拒绝                       | 检查挂载是否为这次新建目录、UID/GID 是否为 `10001:10001`、目录可遍历且文件可读写；不要对未知目录递归 `chown` 或改为 `777`                                                                    |
| 名称、目录、端口或网络冲突               | 先确定归属，选择复用或完整更换新安装名称；不要自动删除旧资源。SSH 本地 `13777` 冲突可换本地端口，同时修改浏览器地址                                                                          |
| Embedding 失败                           | 核对容器可达的 URL、模型、实际维度、算法、凭证及服务配额；管理员验证允许本机、私网和 Fake-IP 等合法 HTTP(S) 地址；检查实际容器网络与代理/DNS。不要在日志或求助消息中贴 API Key               |
| 证书失败或公网不可达                     | 核对 DNS A/AAAA、NAT、80/443、安全组及 Caddy 日志。先修网络与证书，不跳过 TLS 检查，也不把未初始化服务暴露出去                                                                               |
| OAuth 地址不正确                         | 核对实例内 `[server].public_origin`，按下方受控配置编辑步骤修正为实际根 Origin，重启服务后重新检查元数据                                                                                     |
| ChatGPT 缺少自定义 MCP 或 Plugin Creator | 核对当前账户、Workspace 与管理员策略，由你选择申请权限、使用另一个获准账户或先只完成服务；不自动切换账户或谎报完整安装                                                                       |
| ChatGPT OAuth 失败或重启后失去授权       | 确认 HTTPS、`public_origin` 与元数据，再在原连接中重新授权。管理员 Token 只输入自己的 KG OS 页面；不删除应用或重新建库                                                                       |
| ChatGPT 没有 KG OS 工具                  | 确认基础 Plugin 已安装且在新会话中通过 `@` 选中；必要时刷新原连接元数据。工具发现、授权和业务读取分别检查                                                                                    |
| 新私人 Plugin 制作或验收失败             | 保留旧版与共享连接，查明本次创建结果和失败项后恢复；不要重复创建未知结果，不先卸载旧版                                                                                                       |
| 升级失败                                 | 停止写入与失败服务，保留现场及停服前备份，按[升级恢复](#upgrade-recovery)选择修复或恢复；不删除数据重新安装                                                                                  |
| 重启后要求重新初始化、内容或身份改变     | 停止后续接入，检查是否挂错目录、换了实例或缺少必要文件；保留原目录和备份，恢复原挂载，不能删除数据库/凭证再生成                                                                              |

### 受控编辑实例配置

需要修正已保存配置时，编辑**实际挂载的实例文件**，不是仅修改 `~/kgos/config.toml` 模板。先在可信服务终端备份，再用提权编辑器修改必要值：

```bash
sudo cp -p --backup=numbered workspace/.kgos/config.toml workspace/.kgos/config.toml.before-edit
sudoedit workspace/.kgos/config.toml
sudo chown 10001:10001 workspace/.kgos/config.toml
sudo chmod 600 workspace/.kgos/config.toml
```

这里只修正已确认的可变值，例如 `public_origin`，不递归修改目录。完成后按原路径重启 KG OS，重新检查状态、模型和 OAuth；已有 Token 与数据库继续保留。初始化后的 Embedding 模型、维度、相似度和全文分析器属于已有索引合同，不在这里直接更换；需要适用的迁移说明。

**更新模型凭证**：保持模型与认证方式不变。配置文件路径在本机编辑 `embedding.env`，再按第 4 步重新创建原服务容器。Web 初始化且配置使用 `KGOS_WEB_EMBEDDING_API_KEY` 时，先按原路径停止 KG OS，再执行下列操作；新 Key 只在可信终端的隐藏输入提示中输入，文件不能包含引号或换行：

```bash
(
  set -eu
  sudo cp -p --backup=numbered workspace/.kgos/embedding-api-key workspace/.kgos/embedding-api-key.before-edit
  sudo python3 - <<'PY'
import getpass, os, pathlib
path = pathlib.Path('workspace/.kgos/embedding-api-key')
key = getpass.getpass('New Embedding API Key: ')
if not key or len(key.encode()) > 8192 or any(c in key for c in '\r\n\x00'):
    raise SystemExit('Invalid credential; original file retained.')
with path.open('w') as file:
    file.write(key)
    file.flush()
    os.fsync(file.fileno())
os.chown(path, 10001, 10001)
path.chmod(0o600)
PY
)
```

任一操作失败先保留备份并检查，不启动未确认的文件。成功后启动原容器，重复同网络 Embedding 检查；不重新初始化或改管理员 Token。

需要帮助时提供：镜像版本/digest、选择的两种路径、公开地址、非敏感状态、报错及已完成步骤。不要发送 Token、API Key、`auth.json`、`embedding.env` 或完整环境输出。
