# 原始资料许可与署名

本目录的 `upstream/` 原件及 `readable/` 衍生全文**保留各自第三方许可**，不受 KG OS 的 AGPL/商业双许可替换。原件未编辑；PDF 可读副本只作逐页文本提取，改动与限制记录在各副本和 [sources.json](sources.json)。不暗示原作者认可 KG OS。KG OS 独立适配文件按项目许可提供。

| 来源 | 原作者/署名 | 许可与本地依据 |
| --- | --- | --- |
| BFO-2020 | BFO development team；Barry Smith、Alan Ruttenberg、John Beverley 及原件署名 | [README 许可](upstream/bfo-2020/README.md) 指定 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；完整条款另见 [gUFO 所带法律文本](upstream/gufo/LICENSE) |
| UFO formalization | CORE Conceptual and Cognitive Modelling Research Group (2021)；README 所列作者 | [MIT 原许可](upstream/ufo-formalization/LICENSE)；其中嵌入的 gUFO 保留其 [CC BY 声明](upstream/ufo-formalization/src/axioms-owl/gufo.ttl)，不由 MIT 总声明抹去原通知 |
| gUFO | João Paulo A. Almeida、Giancarlo Guizzardi、Tiago Prince Sales、Ricardo A. Falbo | [CC BY 4.0 原许可](upstream/gufo/LICENSE)，原引用要求保留于 README/Turtle |
| gUFOevents | João Paulo A. Almeida、Giancarlo Guizzardi | [CC BY 4.0 原许可](upstream/gufoevents/LICENSE) |
| gUFO paper | João Paulo A. Almeida、Giancarlo Guizzardi、Tiago Prince Sales、Claudenir M. Fonseca | arXiv:2603.20948v1 (2026-03-21)，[版本页许可链接](https://arxiv.org/abs/2603.20948v1) 指向 CC BY 4.0 |
| DOLCE | Applied Ontology Laboratory 及各原件作者 | [CC BY 4.0 原许可](upstream/dolce/LICENSE)，保留各模块作者/版本通知 |
| GFO | Onto-Med Research Group、University of Leipzig 及原件作者 | [CC BY 4.0 原许可](upstream/gfo/LICENSE) 与 [CITATION.cff](upstream/gfo/CITATION.cff) |
| SUMO 上层核心 | IEEE，2004；原始开发来源见文件 | [Merge.kif 开头 IEEE 条款](upstream/sumo/Merge.kif)：允许复制、出版、分发及衍生，要求每次使用承认 IEEE 来源与版权；不是 public domain |
| MILO 与其余选定 SUMO 资料 | Teknowledge、Articulate Software，README 另含 Infosys 通知 | [MILO 原头部](upstream/sumo/Mid-level-ontology.kif) 与 [README](upstream/sumo/README.txt)：GNU Public License，未指明版本，并要求署名；保留原文，不改标 CC 或 KG OS 商业许可。[GNU GPL v3 法律文本](source-index/gnu-gpl3.md) 一并提供，不由该副本反推原件指定了版本 |
| 旧 KG OS VLog/AIMemory 案例 | KG OS authors | [原 AGPL-3.0-only 法律文本](upstream/legacy-ontologies/LICENSE)；固定 Commit 来源见 [案例目录](source-index/legacy-ontologies.md) |

每个目录的来源 URL、版本/Commit、用途、依赖、未覆盖部分，以及逐文件许可例外和排除项均可从 [资料入口](foundations.md) 和 [清单](sources.json) 定位。旧仓库 README、上游构建与测试指令均是原件内容，不是本包执行授权。未明确许可的外部书籍、标准全文及作者稿不纳入包，不以本项目许可替它们授权。
