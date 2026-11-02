# AIMemory isolated runtime replay

This document preserves the **independently reproducible** KG OS/Lithograph integration scenario after AIMemory became an optional domain package. It is **not** a test run receipt, an executable script or a requirement for the KG OS core Plugin.

1. Prepare a disposable, authenticated KG OS Instance and a branch selected for this isolated test. Never use real user Memory or a production Branch.
2. Using that Instance's `kgos_docs` instructions, create the four AIMemory Node Definitions and eight Relationship Definitions from [the canonical model](../ontology.md), plus the optional AIMemory Domain. For the supplied fixture only, adapt the relevant VLog Source, Event, Entity, Place, DOCUMENTED_BY and OCCURRED_AT Definitions into this **same isolated State**, using the [single VLog source](../../vlog/ontology.md). Do not copy these Definitions into AIMemory.
3. Pin the returned Schema State and verify each installed Definition before writing test Knowledge. Run [seed.cypher](seed.cypher) on the selected test Branch.
4. Read the exact Q1–Q9 queries in [cypher.md](../cypher.md). For every record in [expected.json](expected.json), supply its `params` to the matching query at the same immutable seeded State, then compare the returned `columns` and ordered `rows` to the fixture. The eleven cases cover new classification, owner separation, topics, cues, provenance, supersession, event/place and linked Entity.
5. Attempt a second Memory with the same `memoryKey`; confirm the declared UNIQUE constraint rejects it and the test Branch remains unchanged. Check that other Branches are unchanged.

Read-only fixture checks and static YAML validation are **not substitutes** for an isolated runtime replay. Keep results, precise model Commit, versioned State, environment and any failures with the test report. Do not infer that installing the optional Skill creates the model or automatically performs this replay.
