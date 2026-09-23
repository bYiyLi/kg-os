# CLI

本文件是 KG OS v1 **AI-facing CLI 命令、参数、输入输出、错误与非交互行为**的设计真源。CLI 只适配已经确认的 [Ontology](ontology.md)、[Object](object.md)、[Graph](graph.md)、[Evolution](evolution.md) 与 [共享公共合同](contracts.md)，不得建立第二套业务能力。`kgosd` 的本地 HTTP endpoint、`KG_HOME` 与认证由 [本地运行时](runtime.md) 负责。

## 目标与边界

CLI 的第一使用者是 AI / Agent，同时保持人类可以直接理解和操作。产品、CLI 与 daemon 的名称职责明确分开：

```text
Product  → KG OS
CLI      → kg
Daemon   → kgosd
```

v1 CLI executable 固定为 `kg`。短 binary 适合 AI 高频调用和人工输入；它只是 KG OS 的命令入口，不替代产品名，也不改变 `kgosd` 的 daemon 名称。

CLI 遵守以下边界：

- 命令树提供 Ontology 渐进读取，并映射共享 Object / Graph / Evolution；不按底层 REST route、Lithograph procedure 或数据库内部资源组织；
- 除 Ontology 文本读取、`doctor` 人类诊断与 `install` 交互向导等下述显式例外外，默认输出稳定 JSON，适合 AI、脚本和 shell pipeline；人类需要可读缩进时使用 `--pretty`，不维护第二套 table 输出合同；
- 不存在 connection-local current Branch、current State 或 checkout；需要 StateRef / Branch 的命令必须显式提供；
- 业务命令不弹交互确认、不自动启动 editor、不进入 REPL、不自动打开 pager；只有 `kg install` 在配置缺失且 stdin/stdout 都可交互时逐项询问缺失配置；
- 不自动遍历所有 pagination page；AI / 调用方显式读取 cursor 并决定是否继续，避免一次命令无界扩大上下文；
- 不提供 `kg request`、raw SQL 或 SQLite 内部表 pass-through；Graph `query` / `execute` 原样执行 Lithograph Cypher / procedure，分别选择只读 / 读写连接；
- CLI 只通过 `kgosd` 的 HTTP endpoint 使用 Kernel，不直接打开 SQLite database 或加载 Lithograph extension；
- active daemon endpoint 从 `$KG_HOME/kgosd.lock` 的 active lock owner 定位；`KG_HOME` 未设置时默认 `~/.kgosd`。`config.toml` 的 `server.host/server.port` 只决定 daemon startup，不为业务命令增加 `--endpoint` / `--host` / random discovery；
- 任何发送到 active `kgosd` 的 CLI HTTP request 都发送 Bearer credential；本机解析顺序固定为非空 `KG_TOKEN` 优先，否则读取当前 `$KG_HOME/auth.json`。显式 token 错误时不 fallback；CLI 不提供 `--token`、不把 token 写入 stdout/stderr。

`KG_HOME` 选择本地 runtime profile / daemon target。`KG_TOKEN` 是显式 credential override；未设置时，本机 CLI 使用目标 profile 自己的 `auth.json`。

v1 不定义命令别名、缩写 namespace 或另一组 flattened commands。`kg branch ...`、`kg query ...` 等都不是 `kg evolution branch ...`、`kg graph query ...` 的第二种 canonical 拼写。

## 命令树

```text
kg
├── doctor
├── install
│
├── ontology
│   ├── [<OntologyRef> ...]      # 0 refs = Overview；1..100 refs = batch read
│   └── patch                    # Ontology-scoped Object Patch
│
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

## 国际化

v1 人类可见 CLI 文案支持 English 与中文，默认 English。locale 解析按 `LC_ALL` → `LC_MESSAGES` → `LANG` 取首个非空值；识别为中文 locale 时使用中文，其它值、缺失或无法识别时使用英文。v1 不增加独立语言配置文件或 profile setting。

国际化只作用于 help、`doctor` 人类输出、`install` prompt / warning、普通本地说明文字。命令名、flag、JSON field、error code、配置 key、Ref、enum 与其它机器协议不翻译；因此 AI / script 不需要根据 locale 改写解析逻辑。

## 通用参数与输出

### JSON-first stdout

除 Ontology Markdown/--edit、Object raw body 和 Graph streaming 明确例外外，命令成功时 stdout 只输出**一个 UTF-8 JSON document**，字段保持对应 logical result 的语义；不在 stdout 混入日志、spinner、颜色、提示语或表格。

```text
default        → compact JSON + trailing LF
--pretty       → 相同 JSON value，仅增加确定性的 indentation + trailing LF
```

`--pretty` 只改变空白，不改变 field、value、排序或类型，因此不是第二种数据格式。v1 不提供 `--table`、template、`--jq` 或字段选择 DSL；调用方需要进一步转换时使用标准 shell / JSON 工具。

结果为空仍返回 exit `0`；JSON 命令返回如 `items: []`，Ontology 返回带明确空范围说明的 Markdown。不能用非零 exit code 表示“没有匹配结果”。

### Required text input

Cypher、Object/Ontology Patch 和 Merge resolutions 等**必填的大文本 / 结构化正文**统一支持三种互斥来源：

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
| Object / Ontology Patch | `--patch` | `--patch-file` | 是 |
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

除 Graph `--stream` 已经开始输出的情况外，失败时 stdout 必须为空；stderr 输出一个 [公共错误合同](contracts.md#公共错误合同) JSON envelope，并以 LF 结束。Graph streaming 如果在第一个 event 前收到 daemon 的普通 non-2xx JSON error，stdout 同样为空并按 daemon public error处理。stream 已经输出 `columns` / `row` 后，daemon 的 terminal NDJSON `error` event **不复制到 stdout**；CLI取出其中的 public error envelope写到 stderr，保留已经输出的 partial stdout，不输出 final `summary`，并以 exit `1`结束。如果 socket/read/EOF发生在没有收到 terminal `summary` 或 `error` 的情况下，CLI生成本地 `IO_ERROR` envelope并以 exit `3`结束；这类 transport failure不能伪造成 daemon已返回业务错误。默认不在 error envelope前后输出其它 diagnostics。CLI 参数解析、本地 JSON/YAML/text parse 或文件读取也尽量使用同一公开 category，例如 `INVALID_ARGUMENT`、`PARSE_ERROR`、`IO_ERROR`，但不能伪造成 daemon 已执行请求。

v1 exit code 只表达粗粒度执行层级，稳定业务分类始终读取 error `code`：

| Exit | Meaning |
| ---: | --- |
| `0` | command 成功，包括 empty result |
| `1` | daemon 已返回 KG OS / Lithograph public error |
| `2` | CLI usage、参数、stdin/file/local parse/input，或 install / Runtime ensure 的本地 config/spawn/lifecycle error；请求未成功 dispatch |
| `3` | `kgosd` target / transport 不可用，或请求 / 响应传输失败 |

连接中断按普通连接错误返回，使用既有 `IO_ERROR` envelope 与 exit `3`。该退出码只表示通信失败，不保证请求尚未执行或已提交变更已经回滚；CLI 不因连接错误自动重试写请求。

进程被 shell signal 中断使用平台惯例，不建立 KG OS 业务 exit code。结构化 stdout/stderr 不输出 ANSI escape sequence。

需要 active daemon 的业务命令在 Runtime ensure 完成后解析 credential：非空 `KG_TOKEN` 优先，否则读取当前 `$KG_HOME/auth.json`；两者都不可用时返回本地 `AUTHENTICATION_FAILED`（exit `2`）且不发送业务 request。token 存在但 daemon 拒绝时属于 daemon public error（exit `1`）。`--help`、`--version`、`doctor`、`install` 与本地 daemon spawn 本身不要求先有 Bearer credential。

## Doctor

```text
kg doctor [--json]
```

`doctor` 是 side-effect-free 本地诊断入口。它检查 effective `KG_HOME`、安装状态、`config.toml` 完整性与静态合法性、installer-managed Runtime artifacts、configured extension source 的可确定状态、必需环境变量以及 daemon lock/state；不得创建目录或文件、下载 artifact、启动 daemon、生成 credential、打开/初始化 `kgos.db` 或执行 Knowledge Base bootstrap。

daemon `stopped` 是正常非阻塞诊断结果，因为后续业务命令会自动启动 Runtime；`starting/running/unavailable` 必须如实报告。默认 TTY 输出使用当前 locale 的简洁诊断文本；`--json` 输出稳定 machine result，至少包含 overall readiness、每个 check 的稳定 `id/status/blocking` 与适用的缺失配置 key，不翻译这些 identifier。

`doctor` 的 machine status 只使用 `ok | info | error`；daemon lifecycle state 放在对应 check 的 `details.state`，值固定为 `stopped | starting | running | unavailable`。`stopped` 对应 `status=info, blocking=false`。只要诊断过程本身完成，`doctor` 即 exit `0`，环境是否 ready 由 `ready` 与 `blocking` 表达；CLI usage / 无法读取必需诊断输入等命令自身失败才使用通用非零 exit code。

## Install

```text
kg install
  [--server-host <ipv4>]
  [--server-port <1..65535>]
  [--cache-path <path>]
  [--cache-max-size-mb <n>]
  [--fulltext-analyzer <fts5-spec>]
  [--embedding-base-url <url>]
  [--embedding-model <id>]
  [--embedding-dimensions <1..4096>]
  [--embedding-similarity <cosine|euclidean>]
  [--embedding-api-key-env <name-or-empty>]
```

`install` 只建立当前 `KG_HOME` 的 Runtime profile 与完整 `config.toml`，并定位/写入当前 KG OS distribution 所需的 `kgosd`、Lithograph 与 OpenAI-compatible Provider artifact 配置；它不启动 daemon、不生成 `auth.json`、不创建 `kgos.db`、不执行 Lithograph init 或 KG OS bootstrap。

安装配置解析对每个用户可配置字段使用同一规则：

```text
CLI flag 已提供 → 直接采用，不询问
        ↓
字段缺失且 TTY 可交互 → 按当前语言逐项询问
        ↓
字段缺失且不可交互 → INSTALL_CONFIGURATION_INCOMPLETE
        ↓
所有字段显式 resolved → validate → 原子写完整 config.toml
```

交互提示可以展示推荐值；用户直接 Enter 表示明确采用该推荐值，不能靠输出文件省略字段表达默认。全部参数已提供时即使存在 TTY 也必须零 prompt，直接 validate + install，适合 AI / automation。非交互缺失错误使用 CLI-local 稳定 code `INSTALL_CONFIGURATION_INCOMPLETE`，exit `2`，`details.missing` 是按 config key 排序的字符串数组。

v1 installer 的推荐值冻结为：

| Config key | Recommended value |
| --- | --- |
| `server.host` | `127.0.0.1` |
| `server.port` | `4765` |
| `cache.path` | `cache/openai-compatible.db` |
| `cache.max_size_mb` | `4096` |
| `fulltext.analyzer` | `unicode61` |
| `embedding.base_url` | `https://api.openai.com/v1` |
| `embedding.model` | `text-embedding-3-small` |
| `embedding.dimensions` | `1536` |
| `embedding.similarity` | `cosine` |
| `embedding.api_key_env` | `OPENAI_API_KEY` |

这些值只用于交互 prompt；它们不是 runtime 缺失字段默认值。用户可以输入其它合法值，也可以按 Enter 明确接受推荐值。`embedding.api_key_env` 的空字符串是一个合法值，因此交互 prompt 使用 `""` 表示调用方显式选择 no-auth；直接 Enter 仍表示采用推荐的 `OPENAI_API_KEY`。

`[fulltext]` 与 `[embedding]` 是初始化配置。交互安装进入这组字段前只显示一次当前语言对应的简短提示：

```text
以下配置初始化后禁止修改。

The following settings must not be changed after initialization.
```

不追加其它责任、迁移或兼容性说明。该提示不意味着 CLI 保存或比较历史配置。

`cache` 没有 disable/skip 模式，installer 必须取得并写出 `path/max_size_mb`；`fulltext` 与 `embedding` 同样不能通过缺失字段表示未启用。`embedding.api_key_env` 字段也必须显式提供；空字符串只表示调用方明确选择无需认证的 endpoint。SQLite extension 的底层 library path / entrypoint 对官方必需 artifacts 由 installer 从 distribution 得到并完整写入，普通用户无需手工寻找这些路径。

如果目标 `config.toml` 已经存在，`kg install` 不覆盖或重新引导配置：未提供任何 config-setting flag且现有配置合法时返回 already-installed 成功；现有配置非法时返回当前配置错误，由调用方直接修正文件；现有配置已经存在且调用方又提供任意 config-setting flag时返回 `INVALID_ARGUMENT` / exit `2`，不能静默忽略，也不比较新旧值。v1 不增加 `setup`、`config set` 或另一套配置持久化接口。

交互向导实际询问过至少一个字段时，成功输出使用当前 locale 的简短 human text；完全参数化、零交互安装成功时遵守 JSON-first 规则，stdout 返回稳定 JSON，例如 `{"status":"installed","home":"<absolute KG_HOME>"}`。already-installed 的零交互成功使用 `status="already_installed"`。这些状态值不翻译。

## Ontology CLI

```text
kg ontology [<OntologyRef> ...]
  --at <StateRef>
  [--limit <n>]
  [--cursor <token>]

kg ontology <OntologyRef> [<OntologyRef> ...]
  --at <ResolvedState>
  --edit

kg ontology patch
  --base-state <ResolvedState>
  --branch <branch-name>
  (--patch <git-extended-diff> | --patch-file <path> | stdin)
  [--author <text>]
  [--message <text>]
```

`--at` 必填，不暗中使用 main/current Branch。没有目标读取全局；一个或多个 `domain:` / `node:` / `relationship:` positional Ref 分别读取对应 Domain / Definition。OntologyRef 使用 Object 的 canonical typed string，帮助 AI 区分同名领域、节点和关系；正文始终同时提供业务名称、说明与可复制 Ref，不要求 AI 猜前缀。

默认 stdout 输出 [Ontology read](ontology.md#ontology-read-合同) 的只读 Markdown。批量读取一次接受 `1..100` 个 Ref；daemon 只解析一次 `--at`，全部结果使用同一 resolved State，并按 positional Ref 顺序输出。CLI Markdown 顶部只写一次 resolved State，随后为每个 logical `results[]` item 输出独立范围段及其 `ref/total/cursor`；单 Ref 与 batch 只是同一 read 的不同 cardinality。任一 Ref 失败时 stdout 为空，整批按统一错误 envelope 失败。SDK/Web 直接使用 structured `results[]`，不需要解析 CLI Markdown。

`--limit` 只影响 Overview / Domain items，在 batch 中对每个 Domain 独立应用。`--cursor` 只能用于没有 Ref 的 Overview 或单个 Domain Ref；batch 返回的各 Domain cursor 需要以返回的 resolved State + 对应单 Ref 分别续读。Definition 详情不分页拆成碎片；整个 batch 超出资源限制返回错误，不截断、不返回 partial success。`--pretty` 不适用于 Ontology 文本输出。Ontology 没有 search、文本定位、文件路径或 raw Schema passthrough。

`--edit` 用于 `1..100` 个 Domain / Node Definition / Relationship Definition Ref。它不启动 editor，不创建 session，不写数据库；`--edit --at` 必须是已有读取返回的 immutable `commit/<64-hex>`，不接受 Branch/Tag 或分页参数。整个 batch 先完整解析并验证，任一 Ref 失败时 stdout 为空，不输出 partial stream。

单 Ref `--edit` stdout 保持既有行为：只输出该 Object 的完整 canonical YAML body。多 Ref `--edit` stdout 是**标准 YAML 1.2 multi-document stream**，顺序与 positional Ref 一致：

```text
# kgos-state: commit/<64-hex>
--- # kgos-ref: node:Person
<node:Person 的 canonical YAML body>
--- # kgos-ref: node:Document
<node:Document 的 canonical YAML body>
```

`# kgos-state:` 和 `--- # kgos-ref:` 是 CLI-only framing comment，不是 Object Value，也不是 Git Patch base 的一部分；每个 document body 与同一 State 下对应的单 Ref `--edit` / `object read <ref> --body` 逐字一致。Ref comment 让 AI / 人在文本中直接识别 target；程序化 consumer 应以调用请求顺序和 structured API metadata 为准，不依赖 YAML parser 保留 comment。v1 不提供 output directory、自动拆文件或 multi-object wrapper schema。

`ontology patch` 是 Ontology-scoped Object Patch adapter。Patch framing、canonical YAML、strict `baseState`、request-local alias、并发、错误、transaction、`created/transitions` result 都**完全复用 Object Patch**；唯一额外约束是 file target / alias kind 只能是 `domain`、`node-definition`、`relationship-definition` 对应的 Ontology aggregate。出现 `n:` / `r:` Knowledge target 或 `new:knowledge-*` 时返回 `INVALID_ARGUMENT`，整批不执行。普通 Ontology 修改优先使用此命令；确实需要在同一 atomic Patch 中显式同时修改 Ontology 与 Knowledge Object 时，使用通用 `kg object patch`。

以下为命令格式示意，`<resolved-state>` 必须替换成上一步实际返回的 State：

```text
kg ontology --at branch/main
→ state = commit/<64-hex>，包含可继续读取的准确 Ref

kg ontology domain:Content --at <resolved-state>
kg ontology node:Person node:Document relationship:AUTHORED --at <resolved-state>
kg ontology node:Document --at <resolved-state> --edit
kg ontology node:Person node:Document relationship:AUTHORED --at <resolved-state> --edit

kg ontology patch --base-state <resolved-state> --branch main --patch-file change.diff
```

只有最后一步写数据。`kg ontology patch` 可以在一个 Patch 中修改多个 Domain / Definition，包括它们聚合的 Property / Constraint / Index；它只是统一 Object Patch 的 Ontology scope，不增加 `kg index/constraint` 或第二个 compiler。单 Ref `--edit` 与 `object read <ref> --body` 逐字一致；batch `--edit` 只是把这些 canonical bodies 放进标准 YAML multi-document stream，天然对应一个 multi-entry Git Patch。

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
kg object list --at branch/main --scope knowledge --limit 50
```

### search

```text
kg object search <query>
  --at <StateRef>
  [--kind knowledge-node|knowledge-relationship]
  [--scope knowledge]
  [--limit <n>]
  [--cursor <token>]
```

此处只保留 Object 已有的 Knowledge exact-Ref 定位行为。scope 缺省为 knowledge；ontology/all 或 Ontology kind 是非法参数。Ontology 导航使用 `kg ontology`，Knowledge 属性搜索使用 Graph Cypher，不隐藏增加第二套搜索语言。

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

`query` 选择只读连接，语句原样交给 Lithograph；误提交写语句由底层拒绝，CLI / daemon 不解析关键字或自动换到写连接。Cypher 不要求保存成本地文件。短语句可以直接 `--cypher`，AI / 程序可以 pipe stdin，已有可复用查询才使用 `--cypher-file`：

```bash
kg graph query \
  --at branch/main \
  --cypher 'MATCH (n:Person) RETURN n LIMIT 10'

cat query.cypher | kg graph query --at branch/main
```

默认 stdout 是 logical `{state, columns, rows}` JSON。

托管语义检索使用同一个 `kg graph query`。Cypher 调用 Lithograph Semantic procedure，`--params` 直接传普通 String：

```bash
kg graph query \
  --at branch/main \
  --cypher 'CALL db.index.semantic.queryNodes("document_semantic", $q, {limit: 10}) YIELD node, score RETURN node.title, node.content, score' \
  --params '{"q":"如何设计知识图谱"}'
```

上述托管语义调用只需 String，不需要 Vector、model 或 dimensions。CLI / daemon 不做 `$semantic` 转换；其它 Cypher 可直接使用 Lithograph JSON 的 Vector 参数与结果。stdout 仍是 `{state, columns, rows}`，结果列由底层语句决定。`LOAD CSV`、`SHOW` 等不设 KG OS 黑白名单，详见 [Graph](graph.md#graph)。

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

`execute` 选择读写连接，可运行 Lithograph 支持的 Cypher / procedure，不局限于 Knowledge mutation。普通正文写入只传业务字段。例如前述 `Document` 模型要求 `id/title`：

```bash
kg graph execute \
  --branch main \
  --cypher 'CREATE (d:Document {id: $id, title: $title, content: $content}) RETURN elementId(d) AS ref' \
  --params '{"id":"doc-001","title":"知识图谱设计","content":"知识图谱通过节点和关系组织知识。"}'
```

这次写入不调用 embedding 服务，也不要求调用方手工更新向量。上述 CLI 仍是待实现的设计合同。

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

CLI stdout只包含成功路径的 `columns` / `row` / `summary` event：`columns` 恰好一次，`row` 零到多次，`summary` 成功时恰好一次并且必须是最后一个 stdout event。HTTP adapter 的 terminal `error` event由 CLI转换到 stderr，不能混进 stdout NDJSON。stream中途发生底层执行/编码 failure时，已经输出的 row只是 partial result；transport在 terminal event前断开时同样只保留 partial stdout。Vector是合法的底层值，不再作为中途拒绝的条件。调用方只有在进程 exit 0且观察到 final `summary` 时才能把整个 stream视为成功。

对 `graph execute --stream`，final `summary.state` 反映底层完成时的 State。summary 前观察到的 elementId 不能直接当作已确认持久结果；缺少 summary 也不等于没有已提交变更，例如底层 transaction subquery 可能已有成功批次，或提交后传输失败。事务、取消与部分提交行为遵守 Lithograph，KG OS 不承诺任意 Cypher 一律整体回滚，也不自动重放结果未知的写入。

Streaming 只改变 transport framing，不改变 column order、row value encoding、resolved State 或 counter 语义。daemon 的 terminal error framing与逐 event backpressure见 [Runtime](runtime.md#graph-http-streaming-framing)。

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
understand Ontology
→ ontology overview
→ optional Domain
→ Definition detail

discover Knowledge Object
→ object list / graph query

read exact Object
→ object read

edit exact Ontology aggregate(s) / Object
→ pin resolved commit
→ ontology <ref>... --edit / object read --body
→ generate Git Extended Diff
→ ontology patch（只改 Ontology）/ object patch（通用或跨 Ontology + Knowledge）

discover / compute Knowledge
→ graph query

semantic search
→ graph query with db.index.semantic.queryNodes/queryRelationships + String param

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
- `ontology` 提供可读概览/详情；`ontology <ref>... --edit` 提供单对象 canonical YAML 或多对象 YAML stream，`object read --body` 提供单对象 canonical body；
- shell redirect、pipe 和普通 JSON 工具完成保存、过滤与进一步展示。

这样避免“AI API”与“人类 CLI”行为漂移。未来只有真实用户需求证明 table、interactive TUI、shell completion 或其它 human convenience 值得维护时，才作为兼容 convenience 增加；不能改变当前默认 JSON / non-interactive contract。

## Runtime target 与非目标

每次业务命令 dispatch 时，`kg` 按 [本地运行时](runtime.md) 先解析 effective `KG_HOME`（默认 `~/.kgosd`），再执行 Runtime ensure。只有 OS lock 存在 active owner 且已经发布 endpoint 时，才把其中的 endpoint 视为当前 daemon target。

```text
active owner + endpoint → use current kgosd
stopped                 → spawn kgosd → wait ready → use endpoint
starting                → wait ready → use endpoint
unavailable             → fail explicitly
```

如果没有 active owner，业务命令自动后台启动 `kgosd`；spawn / startup validation / ready wait 失败属于本地 Runtime failure，原始业务 request 不得在未 ready 的 endpoint 上提前 dispatch。多个并发 caller 只能由 single-instance lock 产生一个 winner。运行中的 daemon 启动后即使磁盘 `config.toml` 被修改，当前进程仍继续使用 startup 时的 effective config；CLI 不比较配置文件、不自动 hot-reload/restart。

daemon ready 后，CLI 使用非空 `KG_TOKEN` 或当前 profile 的 `auth.json` 取得 credential，再发送原始业务 request。连接失败时不随机换端口、不直接打开 SQLite，也不因为显式 `KG_TOKEN` 失败而 fallback。

一个 daemon 固定只承载 `$KG_HOME/kgos.db` 这一个 Knowledge Base。OpenAI-compatible Provider 可以使用独立 SQLite cache database，但它只是 derived runtime data，不是第二个 Knowledge Base 或 CLI target；标准 installer 推荐 `cache/openai-compatible.db`，实际路径仍由完整 `[cache].path` 显式配置。v1 不提供 `base list/use`、`--base` 或其它单-daemon多库选择 surface；需要另一套知识世界时启动另一个 `KG_HOME` profile。

## 兼容性

本文命令名、required flag、flag meaning、默认 JSON result shape、Ontology Markdown/--edit、raw body / streaming framing 与 exit-code category 构成 v1 CLI public adapter contract。实现可以增加新的可选命令 / flag，但不能让已有 canonical invocation 改变业务语义；删除 / 改名已有 command 或 required flag、改变默认输出类型、引入隐藏 current Branch / auto-page / interactive confirmation，都属于 CLI breaking change，需要新的设计决定。

CLI 的 JSON 内部 Object / Graph / Evolution field 继续由对应 logical contract 拥有；如果 logical contract 合法增加 optional field，CLI 可以原样增加该 field，不需要再复制一条 CLI-specific data-model decision。

本次文档阶段的 Ontology 命令及 Object kind/scope 调整按 D46 替换旧设计基线；它不意味着已发布实现需保留旧 Ontology search 或独立 Index/Constraint 接口的兼容层。
