# AIMemory · AI 长期记忆参考本体

**AIMemory** is an opt-in Property Graph model pack for KG OS. It organizes memory points by **type, topic, recall cue, evidence, event and lifecycle**. The paired [Memory Skill](skills/kgos-memory-standards/SKILL.md) describes how AI should interpret and maintain memory. Neither the model nor Skill installs a memory Agent or modifies the KG OS Kernel.

## Model graph

- 4 Node Definitions: `Memory`, `MemoryKind`, `MemoryTopic`, `MemoryCue`.
- 8 Relationship Definitions: `HAS_KIND`, `IN_TOPIC`, `SUBTOPIC_OF`, `RECALLED_WHEN`, `EVIDENCED_BY`, `ABOUT`, `FORMED_DURING`, `SUPERSEDES`.
- Optional `domain:AIMemory` groups these Definitions. This **does not** isolate data, enforce ownership, create a Branch or impose access control.
- `semantic`, `episodic`, `procedural`, `prospective` are **MemoryKind Knowledge instances**, not four separate schemas. New classes, topics and cues add Knowledge, not Definitions.
- A `Memory` has its own identity, source/assessment and lifetime. It **must not** duplicate ordinary domain facts/relationships, Event logs or task plans as text-only entries.

## Reusing existing objects

`EVIDENCED_BY`, `ABOUT`, `FORMED_DURING` have `to: null`: KG OS does not restrict the **target Label**. Their **actual target must still be an existing local Knowledge Node**, verified against the chosen world and pinned State. This design supports compatible `Source`, `Event`, `Place` and `Entity` from other domains without inventing duplicate definitions.

The synthetic isolated regression fixture opts into four canonical [VLog definitions](../vlog/ontology.md) (Source, Event, Place, Entity) and two VLog relationships (DOCUMENTED_BY and OCCURRED_AT) **inside the same isolated database State**. Adoption of AIMemory does **not** require the VLog model or a VLog Branch. Users with equivalent real domain models should reuse those instead. [Isolated runtime replay instructions](tests/runtime.md) remain with these fixtures, without making KG OS core tests depend on this domain.

An episode is a **MemoryKind**. An independently identified actual event belongs in a genuine Event or domain model; not every conversation becomes an Event. The formed-at Event may carry an actual time, physical place, participants and evidence. `Memory.observedAt` records when the AI learned something; `occurredAt` records when an episode happened; `validFrom/validTo` belong to the business truth, not the Commit DAG. `triggerDescription` concerns past formation; `MemoryCue` concerns future retrieval. No cue runs a task or overrides instructions.

`ownerKey` indicates a business owner, **not permission**. A Memory about a Project may belong to a different subject than the Project. An old mistake should be corrected as such; only a real-world change may justify a new Memory with `SUPERSEDES`. Neither supersession nor KG OS immutable history guarantees physical deletion of sensitive facts.

## Use the package

1. Read the canonical [Ontology](ontology.md), [Cypher queries](cypher.md) and synthetic [tests](tests/) from the **same immutable Git Commit or Tag**.
2. Read the target KG OS Branch/State and existing Knowledge; select only necessary compatible definitions and the optional Domain. Obtain the required model or knowledge mutation authorization.
3. Use the actual target `kgos_docs` contract, inspect true endpoint identities and relations, and verify with real queries and Source evidence.
4. For AI memory tasks, install or load the [Memory Skill](skills/kgos-memory-standards/SKILL.md) **separately from the KG OS core Plugin**, with matching model resources from the same pinned Commit. The public repository is their sole editable source.

To produce the standalone Skill directory from the repository root (without installing anything):

```sh
python3 scripts/export_memory_skill.py --ref <immutable-commit> --output <new-directory-outside-this-repo>
```

The output contains `kgos-memory-standards/SKILL.md` and its locally reachable `references/ontology.md` and `references/cypher.md`. Installing this directory is optional and never changes the Knowledge Base, Domain, Branch or KG OS core Plugin.

Test locally: `python3 scripts/validate.py` and `python3 -m unittest discover -s tests -p 'test_*.py'`. Static validation does not prove KG OS/Lithograph runtime acceptance or native AI Skill selection. No production data belongs in these fixtures.
