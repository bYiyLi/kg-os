# KG OS official Jieba tokenizer research

<!-- cspell:ignore sqlitejiebatokenizer rlib rustc cdylib -->

本文件记录 KG OS Phase 10 为 official Jieba tokenizer 选择实现时取得的外部与本地工程证据。它是研究材料，不是产品设计真源；最终行为由 [Runtime](../design/runtime.md)、[CLI](../design/cli.md) 与 [D80](../design/decisions.md#d80-official-jieba) 定义。

## 研究目标

KG OS 已确认 new Instance 默认 `jieba`、Runtime 官方提供 tokenizer、已有 Instance 不自动迁移。本研究只判断实际 FTS5 artifact 能否承载该合同，不重新决定默认值。

## SQLite FTS5 registration 约束

SQLite FTS5 custom tokenizer API 规定：同名 tokenizer 已存在时，新注册会替换旧注册。

- 来源：[SQLite FTS5 Custom Tokenizers](https://www.sqlite.org/fts5.html#custom_tokenizers)
- 访问日期：2026-09-26

因此 caller additional extension 若在 official Jieba 之后加载，可以再次注册 `jieba` 并改变实际语义。KG OS 应让 caller additional extensions 先加载、official Jieba 最后注册，再执行 analyzer capability probe，以固定最终 `jieba` identity。

## 已选实现：sqlite-jieba-tokenizer 0.6.0 + KG OS cdylib adapter

- Repository：[候选仓库](https://github.com/miyayaLora/sqlite-simple-tokenizer)
- package：`sqlite-jieba-tokenizer`
- 研究 revision：`720b3fa794b3fe8163fba9088bb964b4c629aa33`
- workspace version：`0.6.0`
- license：`MIT OR Apache-2.0`
- direct dependency：`jieba-rs = 0.9.0`
- KG OS loadable-extension entrypoint：`sqlite3_kgosjieba_init`

上游 README 使用 FTS5 `tokenize = 'jieba'`，声明支持 SQLite 3.51.4，并给出 `cargo build --release --features build_extension`。KG OS 当前 `go-sqlite3 v1.14.52` bundled amalgamation 实际声明 SQLite `3.53.4`，因此 SQLite 版本下限本身不是当前 host 的阻塞项。

### 2026-09-26 macOS arm64 本地验证

在 repo 外 `/tmp` clone 执行上游 build 命令后：

- Rust build 成功；
- 只生成 `libsqlite_jieba_tokenizer.rlib`，没有生成可直接给 SQLite/KG OS 加载的 `.dylib`；
- 进一步用 `cargo rustc ... -- --crate-type=cdylib` 尝试生成动态库未成功。

上游命令本身没有提供可分发的动态库。KG OS 因此在 `native/jieba/` 增加一个很薄的 `cdylib` adapter，直接调用同一 revision 的 `rusqlite-ext::register_tokenizer::<JiebaTokenizer>`。没有复制或修改上游分词实现。上游 `load()` 还会设置进程环境变量并尝试初始化全局 logger；adapter 绕过该路径，只注册 FTS5 tokenizer，避免影响宿主进程。

当前构建输入由 `native/jieba/Cargo.toml`、`Cargo.lock` 与 Rust `1.97.1` 固定。`jieba-rs` `0.9.0` 的默认词典和 HMM 实现、上游中文停词表与英文 stemmer 均编入动态库，运行时不读取宿主词典或联网下载。研究时核对的关键输入 SHA-256：

| 输入 | SHA-256 |
| --- | --- |
| `jieba-rs 0.9.0/src/data/dict.txt` | `139519822fe8ab9e10d9d07e68ea0451045380aedaf54ecc51e2a28c6b42a13f` |
| `jieba-rs 0.9.0/src/hmm.rs` | `610e1bb45f2913d7925afedf72e18083eec225e5740ec15a187d17b67729e39b` |
| `sqlite-chinese-stopword/data/stopword.txt`，上述 Git revision | `12d0689a793153bb7edfa900451903bcc93f3cbbb76020c25598960e90b8f8a4` |

KG OS 当前 macOS arm64 本地证据：`cargo build --locked --release` 产出 `.dylib`；Go bundled SQLite 真实 load 后 `tokenize='jieba'` 对“这是知识图。”与“知识图”命中；caller 先把 `unicode61` 注册为同名 `jieba` 时不能命中，official artifact 最后注册后可以命中；repo 外 packed Runtime package 通过 manifest/hash 校验、daemon load、中文索引和查询。`pnpm check:licenses:rust` 检查 Cargo metadata 的 pinned source/version 与所有依赖 license expression，随包分发的 NOTICE 和上游 MIT 文本在 `native/jieba/`。macOS x64、Linux glibc arm64/x64 的目标 runner 真实证据仍待 CI；本地 arm64 不能代替四平台验收。

## Phase 10 冻结实现前的选择门

official Jieba implementation 必须先证明：

1. source revision / package version / license / attribution 明确；
2. tokenizer code、词典、停词/stemming 等影响 tokenization 的输入全部固定；
3. macOS arm64/x64、Linux glibc arm64/x64 都可获得可再分发 artifact；
4. artifact 可被 KG OS bundled SQLite 真实加载并注册 exact `jieba`；
5. 四平台中文 create/index/query 与代表性 tokenization corpus 一致；
6. 不运行时下载词典，不依赖 manifest identity 外的宿主资源；
7. official Jieba 最后注册后，caller extension 不能改变最终 `jieba` 行为。

上述本地证据已使该 adapter 成为当前 implementation candidate；本节第 3、5 项的四平台部分仍需各自目标 runner 的真实 build/load/query 结果。Phase 10 在这些证据及其余 Acceptance 闭合前保持 `in_progress`。
