# VLog event-centered ontology · 事件中心本体

A **reference Property Graph model** for real system activities. It can represent an incident, distinct recovery attempts, independent verification, affected systems, optional physical places/time windows and evidence. It is **not** a task scheduler, audit guarantee, default KG OS schema, or a substitute for an application's own facts.

本模型适合记录真实发生的故障、执行尝试、验证、后续和证据。它不是 KG OS 内置 Schema，也不要求每次记录创建所有类型的节点。

## Structure · 结构

- **6 Node Definitions**: `Event`, `Entity`, `Time`, `Place`, `Concept`, `Source`.
- **7 Relationship Definitions**: `HAS_TYPE`, `INVOLVES`, `OCCURRED_DURING`, `OCCURRED_AT`, `DOCUMENTED_BY`, `VERIFIES`, `FOLLOWS`.
- A new event category (for example, `security-incident`) is normally **Concept Knowledge**, not a new Definition.
- Each actual operation or verification is a distinct Event. `VERIFIES` points from the verification Event to the operation Event; a verification link alone is not a passing result.
- `FOLLOWS` is chronological evidence, **not causal inference**. `Place` is a real physical location; a software environment belongs to `Entity`. Do not invent `Time` or `Source` nodes when the fact has no such identity.
- A source Branch/State locator is a property of a local Source, **not a Graph edge across snapshots**.

## Files

- [`ontology.md`](ontology.md): canonical semantics, full KG OS Definition YAML, modeling and selection boundaries.
- [`cypher.md`](cypher.md): six read-only parameterized business queries.
- [`tests/seed.cypher`](tests/seed.cypher): synthetic fixture for isolated KG OS/Lithograph tests, not real-world event history.
- [`tests/expected.json`](tests/expected.json): seven expected result sets for those six queries.

## Adoption and verification

Inspect your target State and reuse compatible Definitions first. Use only the necessary definitions and get the required model-change authorization; do not automatically create `branch/vlog` or copy any fixture into a production knowledge world. Run the exact Cypher from the same pinned model version and check the actual relationships, business identities and constraints.

The upstream KG OS Skill test for these assets exercises **13 Definitions** and **7 query cases** using a real isolated KG OS/Lithograph runtime; this repository's CI validates structural consistency only. An upstream success proves that particular fixture/environment, not an arbitrary user's instance or later edits.

模型长期维护应以本目录为单一真源；KG OS Skill 中的副本必须固定 Git Commit 并由同步命令生成，不得人工双份维护。
