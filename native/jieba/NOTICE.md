# Official Jieba Runtime attribution

The `kgos-jieba` SQLite FTS5 extension is built from this repository's adapter and these pinned sources:

- `sqlite-jieba-tokenizer` 0.6.0 and its `rusqlite-ext`, Chinese stopword, and English stemmer workspace crates: [miyayaLora/sqlite-simple-tokenizer](https://github.com/miyayaLora/sqlite-simple-tokenizer), revision `720b3fa794b3fe8163fba9088bb964b4c629aa33`, MIT OR Apache-2.0. KG OS distributes under its MIT option; see [the license text](licenses/sqlite-simple-tokenizer-MIT.txt).
- `jieba-rs` 0.9.0 and `jieba-macros` 0.9.0: [messense/jieba-rs](https://github.com/messense/jieba-rs), MIT; see [the license text](licenses/jieba-rs-MIT.txt).

The `jieba-rs` default dictionary and HMM model are embedded in the compiled extension. Their crate checksums are fixed by `Cargo.lock`; no dictionary is downloaded or read from the host at runtime. The shipped Runtime manifest hashes the compiled extension and this notice and license files.
