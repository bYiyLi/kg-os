# SUMO：从完整上层公理到 KG OS 表达

本包的选定范围是完整 SUMO 上层与完整 MILO，不是整个领域/词汇映射仓库。固定版本、不同许可、选定示例及全部排除项见 [SUMO 原件目录](../source-index/sumo.md)。本文件为 KG OS 独立适配。

## 读取原件

先读 [原 README](../upstream/sumo/README.txt) 和完整 [Merge.kif](../upstream/sumo/Merge.kif) 中的许可、语言与模块说明。按本次问题定位类/关系的 `documentation`、`instance`、`subclass`、`domain`、`range` 及相关公理，连同其量词和前提阅读，不能只抽出术语表。

上层不足且需要中层概念时，再读完整 [Mid-level-ontology.kif](../upstream/sumo/Mid-level-ontology.kif) 的相关段落；它依赖已收录的上层核心。`tinySUMO.kif` 只是原始教学对照，不能拿它替代 Merge.kif。需要理解原示例的查询与答案格式时读 [原说明](../upstream/sumo/tests/tq_notes.txt) 及目录列出的结构示例；本包不运行任何示例或证明器。

本包固定版本的 Merge 和 MILO 均已用 **UTF-8 严格解码并往返核对**，原始字节与上游 Git blob 一致；直接按 UTF-8 读取上述原件即可，没有另行提供 SUMO 可读副本。编码和核对结果记录在 [sources.json](../sources.json) 的对应文件项。这是当前字节的验证结果，不是对作者历史编码方式的推测。

Merge 的第 11 行包含一个原文已有的 U+FFFD（UTF-8 字节 `EF BF BD`，从零起始的 byte offset 418）；MILO 没有 U+FFFD。这个字符已存在于固定上游原件，不是本包或连接器在解码时插入。保留它并披露来源限制，不能改成另一个符号冒充恢复，也不能把整份含非 ASCII 文本的文件按 CP1252/Latin-1 重解码。

有本地 Python 文件读取能力时，在本 Skill 的 `references/` 目录执行以下只读命令；读 MILO 时将参数换成 `upstream/sumo/Mid-level-ontology.kif`。命令严格按 UTF-8 解码、核对往返字节并向标准输出提供原文，不写文件、不运行 KIF：

```sh
python3 - upstream/sumo/Merge.kif <<'PY'
from pathlib import Path
import sys
data = Path(sys.argv[1]).read_bytes()
text = data.decode("utf-8", errors="strict")
assert text.encode("utf-8") == data
sys.stdout.buffer.write(data)
PY
```

只有资源读取接口时按 UTF-8 读取同一原件路径；接口失败应报告具体接口/结果，不能据单个连接器失败推断原件编码错误或整个宿主不支持。不得忽略或替换公理中的符号、变量、数量和否定。

## 分析与映射

区分类与实例、关系与关系实例、函数与其值；`subclass` 不是任意分类标签，`instance` 也不是同义词边。按原公理判断持续身份、属性/过程、时空限定和关系参数，不能因为词义相近就合并概念。

对每条需采用的规则，先写明变量、量词、前提和结论，再决定采用范围。KG OS 的普通边不表达任意高阶关系、函数语义、模态或量化推理；必要的 n 元事实可由有身份的关系对象加参数边表达，但需说明身份和成立条件。不能把 `=>` 丢掉前提后写成已证实事实，也不能把公理转写为说明文字就称执行完成。

将可执行的属性/唯一键约束交数据库，其余明确采用显式 Knowledge、只读查询、应用规则或未实现状态。用户需要领域本体、WordNet 或其他缺失语料时先指出具体依赖与许可；本包未宣称提供这些内容。核心的 IEEE 许可与扩展 GPL/署名通知分别保留，KG OS 商业许可不覆盖它们。
