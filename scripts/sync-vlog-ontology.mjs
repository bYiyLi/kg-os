// Retained only to fail safely for callers of the retired cross-repository sync entry.
// D121: edit the VLog Skill references in this repository; old model revisions
// remain immutable provenance. This entry never reads or overwrites a model.
throw new Error(
  "VLog cross-repository sync is retired. See docs/guide/ontology-sources.md; " +
    "maintain plugins/kgos/skills/kgos-vlog-standards/references in kg-os."
);
