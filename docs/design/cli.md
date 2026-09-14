# CLI

本文件是 KG OS v1 **AI-facing CLI 命令、参数、输入输出、错误与非交互行为**的设计真源。CLI 只适配已经确认的 [Object](object.md)、[Graph](graph.md)、[Evolution](evolution.md) 与 [共享公共合同](contracts.md)，不得建立第二套业务能力。`kgosd` 的本地 HTTP endpoint 与 daemon home 由 [本地运行时](runtime.md) 负责。

## 目标与边界

CLI 的第一使用者是 AI / Agent，同时保持人类可以直接理解和操作。产品、CLI 与 daemon 的名称职责明确分开：

```text
Product  → KG OS
CLI      → kg
Daemon   → kgosd
```

v1 CLI executable 固定为 `kg`。短 binary 适合 AI 高频调用和人工输入；它只是 KG OS 的命令入口，不替代产品名，也不改变 `kgosd` 的 daemon 名称。

CLI 遵守以下边界：

- 命令树直接映射 Object / Graph / Evolution，不按底层 REST route、Lithograph procedure 或数据库内部资源组织；
- 默认输出稳定 JSON，适合 AI、脚本和 shell pipeline；人类需要可读缩进时使用 `--pretty`，不维护第二套 table 输出合同；
- 不存在 connection-local current Branch、current State 或 checkout；需要 StateRef / Branch 的命令必须显式提供；
- 不弹交互确认、不自动启动 editor、不进入 REPL、不自动打开 pager；命令参数不足时直接失败；
- 不自动遍历所有 pagination page；AI / 调用方显式读取 cursor 并决定是否继续，避免一次命令无界扩大上下文；
- 不提供 `kg request`、raw SQL、raw Lithograph procedure、`_lithograph_*` 或 SQLite pass-through；Graph `query` / `execute` 已是普通 Knowledge graph-data 的完整 Cypher 能力边界；
- CLI 只通过 `kgosd` 的 HTTP endpoint 使用 Kernel，不直接打开 SQLite database 或加载 Lithograph extension；
- CLI endpoint 从 `~/.kgosd/config.toml` 的 `server.host` / `server.port`（默认 `127.0.0.1:4765`）确定，不为业务命令增加 `--endpoint` / `--host` / random discovery；
- v1 本地请求不附带 daemon token、API key 或其它 authentication credential。

v1 不定义命令别名、缩写 namespace 或另一组 flattened commands。`kg branch ...`、`kg query ...` 等都不是 `kg evolution branch ...`、`kg graph query ...` 的第二种 canonical 拼写。

## 命令树

```text
kg
├── object
│   ├── list
│   ├── search
│   ├── read
│   └── patch
│
├── graph
│   ├── query
│   └── execute
│
└── evolution
    ├── overview
    ├── get
    ├── ancestry
    ├── history
    ├── diff
    │
    ├── state
    │   ├── create
    │   ├── set-data
    │   └── clear-data
    │
    ├── branch
    │   ├── list
    │   ├── create
    │   └── delete
    │
    ├── tag
    │   ├── list
    │   ├── create
    │   ├── move
    │   └── delete
    │
    └── merge
        ├── start
        ├── list
        ├── get
        ├── conflicts
        ├── resolve
        ├── finalize
        └── abort
```

`kg --help`、任意 namespace / command 的 `--help` 以及 `kg --version` 属于标准 CLI discovery，不需要连接 daemon。Help 必须使用本文和 logical contract 的真实名词，并明确标出 required argument、StateRef grammar、分页、stdin/file input 和 write behavior；help 示例不能引入隐藏默认 Branch 或另一套快捷写语义。

## 通用参数与输出

### JSON-first stdout

除 Object raw body 和 Graph streaming 两个明确例外外，命令成功时 stdout 只输出**一个 UTF-8 JSON document**，字段保持对应 logical result 的语义；不在 stdout 混入日志、spinner、颜色、提示语或表格。

```text
default        → compact JSON + trailing LF
--pretty       → 相同 JSON value，仅增加确定性的 indentation + trailing LF
```

`--pretty` 只改变空白，不改变 field、value、排序或类型，因此不是第二种数据格式。v1 不提供 `--table`、template、`--jq` 或字段选择 DSL；调用方需要进一步转换时使用标准 shell / JSON 工具。

成功但结果为空仍返回 exit `0` 和合法 JSON，例如 `items: []`；不能用非零 exit code 表示“没找到搜索结果”。

### Required text input

Cypher、Object Patch 和 Merge resolutions 等**必填的大文本 / 结构化正文**统一支持三种互斥来源：

```text
inline flag
explicit file flag
stdin
```

如果 inline / file 都未提供：

- stdin 不是 TTY → 读取 stdin 到 EOF；
- stdin 是 TTY → 返回 CLI usage error，不打开 editor、不等待交互输入。

同时提供两个或更多来源返回 `INVALID_ARGUMENT`。文件正文按 UTF-8 读取；文件读取失败使用公开 `IO_ERROR` error envelope，不把本地 stack trace 输出给调用方。

不同命令的 canonical flag 与 logical field 对齐：

| Payload | Inline | File | implicit stdin |
| --- | --- | --- | --- |
| Graph Cypher | `--cypher` | `--cypher-file` | 是 |
| Object Patch | `--patch` | `--patch-file` | 是 |
| Merge resolutions | `--resolutions` | `--resolutions-file` | 是 |
| required State Data | `--data` | `--data-file` | 是 |

可选正文不能把“stdin 空闲”解释成“调用方想传值”。例如 `state create.data` 可缺省，因此只通过显式 `--data` / `--data-file` 传入；省略两者就是 logical field absent。

Graph `params` 是可选 JSON Map，并且 stdin 可能已经用于 Cypher，因此只支持互斥的 `--params <json>` / `--params-file <path>`，不隐式占用 stdin。

### Pagination

凡 logical contract 有 `limit/cursor` 的命令，CLI 原样使用：

```text
--limit <1..1000>
--cursor <opaque-token>
```

省略 `--limit` 继续使用 logical default `100`。CLI v1 **不提供 `--all` / auto-page**；调用方读取返回 cursor 后显式决定下一次请求。Branch / Tag list 当前 logical contract 没有分页，CLI 不自行增加。

### Error 与 exit code

失败时 stdout 必须为空；stderr 输出一个 [公共错误合同](contracts.md#公共错误合同) JSON envelope，并以 LF 结束。默认不在 error envelope 前后输出其它 diagnostics。CLI 参数解析、本地 JSON/YAML/text parse 或文件读取也尽量使用同一公开 category，例如 `INVALID_ARGUMENT`、`PARSE_ERROR`、`IO_ERROR`，但不能伪造成 daemon 已执行请求。

v1 exit code 只表达粗粒度执行层级，稳定业务分类始终读取 error `code`：

| Exit | Meaning |
| ---: | --- |
| `0` | command 成功，包括 empty result |
| `1` | daemon 已返回 KG OS / Lithograph public error |
| `2` | CLI usage、参数、stdin/file/local parse/input error；请求未成功 dispatch |
| `3` | `kgosd` target / transport 不可用；请求未成功 dispatch |

进程被 shell signal 中断使用平台惯例，不建立 KG OS 业务 exit code。结构化 stdout/stderr 不输出 ANSI escape sequence。

## Object CLI

### list

```text
kg object list
  --at <StateRef>
  [--kind <ObjectKind>]
  [--scope all|ontology|knowledge]
  [--limit <n>]
  [--cursor <token>]
```

`--at` 必填。stdout 就是 `Page<ObjectSummary>` JSON，不增加 CLI-specific item wrapper。

示例：

```bash
kg object list --at branch/main --scope ontology --limit 50
```

### search

```text
kg object search <query>
  --at <StateRef>
  [--kind <ObjectKind>]
  [--scope all|ontology|knowledge]
  [--limit <n>]
  [--cursor <token>]
```

`<query>` 是 Object discovery query，不解释成 Cypher 或 shell expression。

### read

默认模式同时需要 metadata 和程序可读 Object Value，因此输出一个 CLI adapter envelope：

```text
kg object read <ObjectRef> --at <StateRef>

→ {
    state: ResolvedState,
    kind: ObjectKind,
    ref: ObjectRef,
    value: ObjectValue       # equivalent JSON representation
  }
```

`value` 只是把 logical body 的 `application/json` representation 放进 CLI envelope，不是新的 Object schema。

需要**纯 Object body**时使用：

```text
kg object read <ObjectRef>
  --at <StateRef>
  --body
  [--format yaml|json]
```

`--body` 默认 `--format yaml`，stdout 只包含 canonical YAML；`--format json` 则只包含 equivalent JSON Object Value。`--format` 只在 `--body` 模式合法；默认 `read` 始终返回上面的 JSON envelope。raw body 模式不混入 `state/kind/ref` metadata，也不接受 `--pretty` 与 YAML 组合；JSON raw body 可以使用 `--pretty`。

因为 Patch 必须基于准确 immutable State，推荐 AI 编辑流程是：先用默认 `read` 取得 resolved `state`，再对该 `commit/...` 执行 `read --body` 取得 canonical YAML，而不是第二次仍读取可能已经移动的 Branch：

```text
kg object read node:Person --at branch/main
→ state = commit/abc...

kg object read node:Person --at commit/abc... --body
→ canonical YAML
```

### patch

```text
kg object patch
  --base-state <ResolvedState>
  --branch <branch-name>
  (--patch <git-extended-diff> | --patch-file <path> | stdin)
  [--author <text>]
  [--message <text>]
```

`--base-state` 只接受 canonical `commit/<id>`；CLI 不接受 Branch / Tag shorthand，也不先替调用方解析成 Commit 后偷偷改变请求。Patch text 原样遵守 Object 的 Git Extended Diff profile。CLI 不增加 `--force`、`--rebase`、`--merge`、`--upsert` 或 `--dry-run`；这些行为没有独立 logical capability。

stdout 原样映射：

```text
{
  state,
  created,
  transitions
}
```

## Graph CLI

### query

```text
kg graph query
  --at <StateRef>
  (--cypher <text> | --cypher-file <path> | stdin)
  [--params <json-map> | --params-file <path>]
  [--stream]
```

Cypher 不要求保存成本地文件。短语句可以直接 `--cypher`，AI / 程序可以 pipe stdin，已有可复用查询才使用 `--cypher-file`：

```bash
kg graph query \
  --at branch/main \
  --cypher 'MATCH (n:Person) RETURN n LIMIT 10'

cat query.cypher | kg graph query --at branch/main
```

默认 stdout 是 logical `{state, columns, rows}` JSON。

### execute

```text
kg graph execute
  --branch <branch-name>
  (--cypher <text> | --cypher-file <path> | stdin)
  [--params <json-map> | --params-file <path>]
  [--author <text>]
  [--message <text>]
  [--stream]
```

CLI 必须保持 Graph logical contract：`execute` **没有 `--base-state`**。它不能为了和 Object Patch 外观统一而增加 strict-base 语义。默认 stdout 是 `{state, columns, rows, counters}` JSON。

### Graph streaming

`--stream` 用于可能很大的 Graph result，并与 `--pretty` 互斥。stdout 是 UTF-8 NDJSON，每行一个 event：

```json
{"type":"columns","columns":["p"]}
{"type":"row","row":["Alice"]}
{"type":"summary","state":"commit/..."}
```

`execute` 的 final summary 额外携带 `counters`：

```json
{"type":"summary","state":"commit/...","counters":{}}
```

`columns` 恰好一次，`row` 零到多次，`summary` 成功时恰好一次并且必须是最后一个 event。stream 中途发生 transport / server failure 时，已经输出的 row 只是 partial result；调用方只有在**进程 exit 0 且观察到 final `summary`**时才能把整个 stream 视为成功。

Streaming 只改变 transport framing，不改变 column order、row value encoding、resolved State 或 counter 语义。

## Evolution CLI

### Read

```text
kg evolution overview

kg evolution get <StateRef>

kg evolution ancestry <StateRef>
  [--limit <n>]
  [--cursor <token>]

kg evolution history <StateRef>
  --scope all|ontology|knowledge|object
  [--object-ref <ObjectRef> --anchor-state <StateRef>]
  [--limit <n>]
  [--cursor <token>]

kg evolution diff
  --before <StateRef>
  --after <StateRef>
  --scope all|ontology|knowledge|object
  [--object-ref <ObjectRef> --anchor-state <StateRef>]
  [--limit <n>]
  [--cursor <token>]
```

`history` 的 positional StateRef 映射 logical `root`。`scope=object` 时 `--object-ref` 与 `--anchor-state` 必须同时存在；其它 scope 时两者都禁止。CLI 不尝试根据 Object Ref 自动猜 anchor State。

### State

```text
kg evolution state create
  --branch <branch-name>
  [--data <json> | --data-file <path>]
  [--author <text>]
  [--message <text>]

kg evolution state set-data <StateRef>
  (--data <json> | --data-file <path> | stdin)

kg evolution state clear-data <StateRef>
```

`state create` 的 data 是 optional，因此它不隐式读取 stdin；`state set-data` 的 data 必填，未指定 inline/file 时可以从 non-TTY stdin 读取。JSON `null` 是明确 data value，不等于 field absent，也不等于 `clear-data`。

### Branch

```text
kg evolution branch list

kg evolution branch create <name>
  --from <StateRef>

kg evolution branch delete <name>
```

`<name>` 是原始 Branch name，不写成 `branch/<name>`；`--from` 才是 StateRef。CLI 不维护 active Branch。

### Tag

```text
kg evolution tag list

kg evolution tag create <name>
  --target <StateRef>

kg evolution tag move <name>
  --target <StateRef>

kg evolution tag delete <name>
```

`<name>` 是原始 Tag name，`--target` 使用完整 StateRef。

### Merge Session

```text
kg evolution merge start
  --branch <branch-name>
  --source <StateRef>

kg evolution merge list
  [--limit <n>]
  [--cursor <token>]

kg evolution merge get <session>

kg evolution merge conflicts <session>
  [--limit <n>]
  [--cursor <token>]

kg evolution merge resolve <session>
  --expected-revision <integer>
  (--resolutions <json-array> | --resolutions-file <path> | stdin)

kg evolution merge finalize <session>
  --expected-revision <integer>
  [--author <text>]
  [--message <text>]

kg evolution merge abort <session>
  --expected-revision <integer>
```

`merge resolve` 的正文直接是 `MergeResolution[]` JSON array，不再套 CLI-specific `{resolutions: ...}` wrapper。`expectedRevision` 只通过 `--expected-revision` 提交；CLI 不先 `get` 然后自动替调用方填 revision，因为这会隐藏并发基线。AI 应使用上一次 `start/get/conflicts/resolve` 返回的 revision。

`start` 即使结果是 `up_to_date` / `fast_forward` 也只创建 Merge Session，不偷偷 finalize。CLI 不提供 `--auto-finalize`、`--resolve-all` 或 interactive conflict editor；分页、渐进 resolve、candidate validation 与 finalize 生命周期保持显式。

## AI-first 可组合性

CLI v1 的 canonical workflow 由小而确定的命令组成：

```text
discover Object
→ object list / search

read exact Object
→ object read

edit exact Object
→ pin resolved commit
→ read --body
→ generate Git Extended Diff
→ object patch

discover / compute Knowledge
→ graph query

bulk / conditional Knowledge mutation
→ graph execute

understand history
→ evolution history / diff

resolve large merge
→ merge start
→ conflicts page
→ resolve batch
→ ...
→ finalize
```

AI 不应因为 CLI 存在就获得额外的“自动理解 / 自动建模 / 自动修复 / 自动合并”命令；这些认知决策属于外部 Agent / Skill。Skill 可以编排多个 CLI primitive，但不能把编排结果伪装成 Kernel 新 capability。

## 人类使用

KG OS CLI 不单独维护 human-only 命令树。人类与 AI 使用相同 command / field / error contract：

- `--help` 提供短说明、required flags 和可复制示例；
- `--pretty` 让 JSON 更适合终端查看；
- `object read --body` 直接提供可阅读 / 可编辑 YAML；
- shell redirect、pipe 和普通 JSON 工具完成保存、过滤与进一步展示。

这样避免“AI API”与“人类 CLI”行为漂移。未来只有真实用户需求证明 table、interactive TUI、shell completion 或其它 human convenience 值得维护时，才作为兼容 convenience 增加；不能改变当前默认 JSON / non-interactive contract。

## Runtime target 与非目标

每次业务命令 dispatch 时，`kg` 按 [本地运行时](runtime.md) 使用 `~/.kgosd/config.toml` 解析当前 daemon host / port，并连接：

```text
http://<host>:<port>
```

默认 endpoint 是 `http://127.0.0.1:4765`。如果 configured host 是 wildcard `0.0.0.0`，本机 CLI 使用 `127.0.0.1` 作为 connect host；其它具体 host 原样用于连接。CLI 不读取 token，因为 v1 daemon 没有认证；也不因为连接失败而自行启动第二个 daemon、随机换端口或直接打开 SQLite。endpoint 不可用时使用本文既有 exit `3` transport failure。

一个 daemon 最终承载一个还是多个 Knowledge Base、Knowledge Base 如何选择、`init` / `daemon start|stop|status` / `doctor` 等 operator command 的最终形态仍不属于当前业务命令树；这些后续设计不能改变本文 Object / Graph / Evolution command、stdout/stderr 或 error semantics。

## 兼容性

本文命令名、required flag、flag meaning、默认 JSON result shape、raw body / streaming framing 与 exit-code category 构成 v1 CLI public adapter contract。实现可以增加新的可选命令 / flag，但不能让已有 canonical invocation 改变业务语义；删除 / 改名已有 command 或 required flag、改变默认输出类型、引入隐藏 current Branch / auto-page / interactive confirmation，都属于 CLI breaking change，需要新的设计决定。

CLI 的 JSON 内部 Object / Graph / Evolution field 继续由对应 logical contract 拥有；如果 logical contract 合法增加 optional field，CLI 可以原样增加该 field，不需要再复制一条 CLI-specific data-model decision。
