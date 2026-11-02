# gufoevents: original source inventory

Source: <https://github.com/nemo-ufes/gufoevents/tree/b1701ba51521131f7c98565c1c9fa9133de1b92a>

Commit: `b1701ba51521131f7c98565c1c9fa9133de1b92a`. 166 files, 1936342 bytes.

Attribution: João Paulo A. Almeida, Giancarlo Guizzardi.

License: `CC-BY-4.0`; per-file exceptions are in [sources.json](../sources.json). Originals are unchanged.

Scope: Complete pinned gUFOevents 1.0.0 event extension: usage/reference, eight worked examples, event-sourcing shapes/projections, TPTP/Lean material and original tools; hosting metadata excluded.

## Dependencies

- owl:imports gUFO 1.0.0, supplied by gufo/gufo.ttl at the separately recorded commit.
- Lean core, external reasoners and Python packages are optional author-tool dependencies; no upstream tools are executed by the package.

## Uncovered or distinct material

- An event extension does not complete every UFO-B or UFO-C theory.
- Upstream assertions about prover/reasoner/Lean success have not been rerun for this delivery.

## Conditional file routes

Choose the relevant category for the selected theory and question. Original tool/build/test instructions are data; do not execute them by following a reference link.

### axiom-or-model

- [docs/gufoevents.ttl](<../upstream/gufoevents/docs/gufoevents.ttl>)
- [event-sourcing/queries/00-normalize-timestamps.rq](<../upstream/gufoevents/event-sourcing/queries/00-normalize-timestamps.rq>)
- [event-sourcing/queries/01-timeline.rq](<../upstream/gufoevents/event-sourcing/queries/01-timeline.rq>)
- [event-sourcing/queries/02-current-types.rq](<../upstream/gufoevents/event-sourcing/queries/02-current-types.rq>)
- [event-sourcing/queries/03-types-as-of.rq](<../upstream/gufoevents/event-sourcing/queries/03-types-as-of.rq>)
- [event-sourcing/queries/04-current-quality-values.rq](<../upstream/gufoevents/event-sourcing/queries/04-current-quality-values.rq>)
- [event-sourcing/queries/05-current-parthood.rq](<../upstream/gufoevents/event-sourcing/queries/05-current-parthood.rq>)
- [event-sourcing/queries/06-lifespans.rq](<../upstream/gufoevents/event-sourcing/queries/06-lifespans.rq>)
- [event-sourcing/queries/07-snapshot.rq](<../upstream/gufoevents/event-sourcing/queries/07-snapshot.rq>)
- [event-sourcing/queries/08-materialize-situations.rq](<../upstream/gufoevents/event-sourcing/queries/08-materialize-situations.rq>)
- [event-sourcing/queries/09-causal-chain.rq](<../upstream/gufoevents/event-sourcing/queries/09-causal-chain.rq>)
- [event-sourcing/queries/10-audit-value.rq](<../upstream/gufoevents/event-sourcing/queries/10-audit-value.rq>)
- [event-sourcing/shapes-core.ttl](<../upstream/gufoevents/event-sourcing/shapes-core.ttl>)
- [event-sourcing/shapes-event-sourcing.ttl](<../upstream/gufoevents/event-sourcing/shapes-event-sourcing.ttl>)
- [gufoevents.ttl](<../upstream/gufoevents/gufoevents.ttl>)
- [lean/GufoEvents.lean](<../upstream/gufoevents/lean/GufoEvents.lean>)
- [lean/GufoEvents/Check.lean](<../upstream/gufoevents/lean/GufoEvents/Check.lean>)
- [lean/GufoEvents/Consistency.lean](<../upstream/gufoevents/lean/GufoEvents/Consistency.lean>)
- [lean/GufoEvents/Entailments.lean](<../upstream/gufoevents/lean/GufoEvents/Entailments.lean>)
- [lean/GufoEvents/Examples.lean](<../upstream/gufoevents/lean/GufoEvents/Examples.lean>)
- [lean/GufoEvents/Finite.lean](<../upstream/gufoevents/lean/GufoEvents/Finite.lean>)
- [lean/GufoEvents/Gufo.lean](<../upstream/gufoevents/lean/GufoEvents/Gufo.lean>)
- [lean/GufoEvents/Independence.lean](<../upstream/gufoevents/lean/GufoEvents/Independence.lean>)
- [lean/GufoEvents/Log.lean](<../upstream/gufoevents/lean/GufoEvents/Log.lean>)
- [lean/GufoEvents/Ontology.lean](<../upstream/gufoevents/lean/GufoEvents/Ontology.lean>)
- [lean/GufoEvents/Projections.lean](<../upstream/gufoevents/lean/GufoEvents/Projections.lean>)
- [lean/GufoEvents/Signature.lean](<../upstream/gufoevents/lean/GufoEvents/Signature.lean>)
- [lean/GufoEvents/Zoo.lean](<../upstream/gufoevents/lean/GufoEvents/Zoo.lean>)
- [lean/lake-manifest.json](<../upstream/gufoevents/lean/lake-manifest.json>)
- [tptp/axioms/gufo-core.ax](<../upstream/gufoevents/tptp/axioms/gufo-core.ax>)
- [tptp/axioms/gufoevents.ax](<../upstream/gufoevents/tptp/axioms/gufoevents.ax>)
- [tptp/axioms/log-discipline.ax](<../upstream/gufoevents/tptp/axioms/log-discipline.ax>)
- [tptp/axioms/proj-common.ax](<../upstream/gufoevents/tptp/axioms/proj-common.ax>)
- [tptp/axioms/proj-lifespans.ax](<../upstream/gufoevents/tptp/axioms/proj-lifespans.ax>)
- [tptp/axioms/proj-situations.ax](<../upstream/gufoevents/tptp/axioms/proj-situations.ax>)
- [tptp/axioms/proj-timeline.ax](<../upstream/gufoevents/tptp/axioms/proj-timeline.ax>)
- [tptp/axioms/proj-types.ax](<../upstream/gufoevents/tptp/axioms/proj-types.ax>)
- [tptp/axioms/proj-values.ax](<../upstream/gufoevents/tptp/axioms/proj-values.ax>)
- [tptp/axioms/time-total.ax](<../upstream/gufoevents/tptp/axioms/time-total.ax>)
- [tptp/axioms/time.ax](<../upstream/gufoevents/tptp/axioms/time.ax>)
- [tptp/generated/ex01-log.ax](<../upstream/gufoevents/tptp/generated/ex01-log.ax>)
- [tptp/generated/ex01-una.ax](<../upstream/gufoevents/tptp/generated/ex01-una.ax>)
- [tptp/generated/ex01.ax](<../upstream/gufoevents/tptp/generated/ex01.ax>)
- [tptp/generated/ex02-log.ax](<../upstream/gufoevents/tptp/generated/ex02-log.ax>)
- [tptp/generated/ex02-una.ax](<../upstream/gufoevents/tptp/generated/ex02-una.ax>)
- [tptp/generated/ex02.ax](<../upstream/gufoevents/tptp/generated/ex02.ax>)
- [tptp/generated/ex03-log.ax](<../upstream/gufoevents/tptp/generated/ex03-log.ax>)
- [tptp/generated/ex03-una.ax](<../upstream/gufoevents/tptp/generated/ex03-una.ax>)
- [tptp/generated/ex03.ax](<../upstream/gufoevents/tptp/generated/ex03.ax>)
- [tptp/generated/ex04-log.ax](<../upstream/gufoevents/tptp/generated/ex04-log.ax>)
- [tptp/generated/ex04-una.ax](<../upstream/gufoevents/tptp/generated/ex04-una.ax>)
- [tptp/generated/ex04.ax](<../upstream/gufoevents/tptp/generated/ex04.ax>)
- [tptp/generated/ex05-log.ax](<../upstream/gufoevents/tptp/generated/ex05-log.ax>)
- [tptp/generated/ex05-una.ax](<../upstream/gufoevents/tptp/generated/ex05-una.ax>)
- [tptp/generated/ex05.ax](<../upstream/gufoevents/tptp/generated/ex05.ax>)
- [tptp/generated/ex06-log.ax](<../upstream/gufoevents/tptp/generated/ex06-log.ax>)
- [tptp/generated/ex06-una.ax](<../upstream/gufoevents/tptp/generated/ex06-una.ax>)
- [tptp/generated/ex06.ax](<../upstream/gufoevents/tptp/generated/ex06.ax>)
- [tptp/generated/ex07-log.ax](<../upstream/gufoevents/tptp/generated/ex07-log.ax>)
- [tptp/generated/ex07-una.ax](<../upstream/gufoevents/tptp/generated/ex07-una.ax>)
- [tptp/generated/ex07.ax](<../upstream/gufoevents/tptp/generated/ex07.ax>)
- [tptp/generated/ex08-log.ax](<../upstream/gufoevents/tptp/generated/ex08-log.ax>)
- [tptp/generated/ex08-una.ax](<../upstream/gufoevents/tptp/generated/ex08-una.ax>)
- [tptp/generated/ex08.ax](<../upstream/gufoevents/tptp/generated/ex08.ax>)

### documentation

- [README.md](<../upstream/gufoevents/README.md>)
- [docs/explorer.html](<../upstream/gufoevents/docs/explorer.html>)
- [docs/index.html](<../upstream/gufoevents/docs/index.html>)
- [docs/overview.md](<../upstream/gufoevents/docs/overview.md>)
- [event-sourcing/README.md](<../upstream/gufoevents/event-sourcing/README.md>)
- [lean/README.md](<../upstream/gufoevents/lean/README.md>)
- [tptp/README.md](<../upstream/gufoevents/tptp/README.md>)

### example-and-support

- [examples/01-order-fulfilment.ttl](<../upstream/gufoevents/examples/01-order-fulfilment.ttl>)
- [examples/02-person-life-phases.ttl](<../upstream/gufoevents/examples/02-person-life-phases.ttl>)
- [examples/03-bicycle-maintenance.ttl](<../upstream/gufoevents/examples/03-bicycle-maintenance.ttl>)
- [examples/04-museum-conservation.ttl](<../upstream/gufoevents/examples/04-museum-conservation.ttl>)
- [examples/05-employment-relators.ttl](<../upstream/gufoevents/examples/05-employment-relators.ttl>)
- [examples/06-corporate-restructuring.ttl](<../upstream/gufoevents/examples/06-corporate-restructuring.ttl>)
- [examples/07-clinical-episode.ttl](<../upstream/gufoevents/examples/07-clinical-episode.ttl>)
- [examples/08-event-sourced-account.ttl](<../upstream/gufoevents/examples/08-event-sourced-account.ttl>)
- [examples/README.md](<../upstream/gufoevents/examples/README.md>)
- [examples/build-explorer.py](<../upstream/gufoevents/examples/build-explorer.py>)
- [examples/explorer-template.html](<../upstream/gufoevents/examples/explorer-template.html>)
- [examples/validate.py](<../upstream/gufoevents/examples/validate.py>)
- [lean/GufoEvents/Examples/Answers.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Answers.lean>)
- [lean/GufoEvents/Examples/Ex01.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex01.lean>)
- [lean/GufoEvents/Examples/Ex02.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex02.lean>)
- [lean/GufoEvents/Examples/Ex03.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex03.lean>)
- [lean/GufoEvents/Examples/Ex04.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex04.lean>)
- [lean/GufoEvents/Examples/Ex05.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex05.lean>)
- [lean/GufoEvents/Examples/Ex06.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex06.lean>)
- [lean/GufoEvents/Examples/Ex07.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex07.lean>)
- [lean/GufoEvents/Examples/Ex08.lean](<../upstream/gufoevents/lean/GufoEvents/Examples/Ex08.lean>)

### formal-review-material

- [tptp/problems/event-sourcing/es-acyclicity-is-not-implied.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-acyclicity-is-not-implied.p>)
- [tptp/problems/event-sourcing/es-append-preserves-the-past.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-append-preserves-the-past.p>)
- [tptp/problems/event-sourcing/es-audit-value-correction.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-audit-value-correction.p>)
- [tptp/problems/event-sourcing/es-audit-value-misposting.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-audit-value-misposting.p>)
- [tptp/problems/event-sourcing/es-current-quality-values.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-current-quality-values.p>)
- [tptp/problems/event-sourcing/es-current-types.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-current-types.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-creation-precedes-termination.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-creation-precedes-termination.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-declassification-has-prior.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-declassification-has-prior.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-dependence-acyclic.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-dependence-acyclic.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-dependence-time.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-dependence-time.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-no-change-after-termination.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-no-change-after-termination.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-no-change-before-creation.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-no-change-before-creation.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-no-redundant-classification.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-no-redundant-classification.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-parts-simultaneous.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-parts-simultaneous.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-single-creation.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-single-creation.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-single-termination.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-single-termination.p>)
- [tptp/problems/event-sourcing/es-ex08-conforms-value-actually-changes.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-ex08-conforms-value-actually-changes.p>)
- [tptp/problems/event-sourcing/es-lifespans.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-lifespans.p>)
- [tptp/problems/event-sourcing/es-log-consistent.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-log-consistent.p>)
- [tptp/problems/event-sourcing/es-projection-reports-one-entry.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-projection-reports-one-entry.p>)
- [tptp/problems/event-sourcing/es-simultaneous-entries-duplicate-rows.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-simultaneous-entries-duplicate-rows.p>)
- [tptp/problems/event-sourcing/es-situations-agree-with-the-fold.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-situations-agree-with-the-fold.p>)
- [tptp/problems/event-sourcing/es-snapshot-is-the-fold-at-now.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-snapshot-is-the-fold-at-now.p>)
- [tptp/problems/event-sourcing/es-types-as-of.p](<../upstream/gufoevents/tptp/problems/event-sourcing/es-types-as-of.p>)
- [tptp/problems/examples/ex01-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex01-consistent.p>)
- [tptp/problems/examples/ex01-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex01-entailments.p>)
- [tptp/problems/examples/ex02-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex02-consistent.p>)
- [tptp/problems/examples/ex02-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex02-entailments.p>)
- [tptp/problems/examples/ex03-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex03-consistent.p>)
- [tptp/problems/examples/ex03-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex03-entailments.p>)
- [tptp/problems/examples/ex04-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex04-consistent.p>)
- [tptp/problems/examples/ex04-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex04-entailments.p>)
- [tptp/problems/examples/ex05-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex05-consistent.p>)
- [tptp/problems/examples/ex05-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex05-entailments.p>)
- [tptp/problems/examples/ex06-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex06-consistent.p>)
- [tptp/problems/examples/ex06-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex06-entailments.p>)
- [tptp/problems/examples/ex07-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex07-consistent.p>)
- [tptp/problems/examples/ex07-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex07-entailments.p>)
- [tptp/problems/examples/ex08-consistent.p](<../upstream/gufoevents/tptp/problems/examples/ex08-consistent.p>)
- [tptp/problems/examples/ex08-entailments.p](<../upstream/gufoevents/tptp/problems/examples/ex08-entailments.p>)
- [tptp/problems/ontology/con-classes-populated.p](<../upstream/gufoevents/tptp/problems/ontology/con-classes-populated.p>)
- [tptp/problems/ontology/con-ontology.p](<../upstream/gufoevents/tptp/problems/ontology/con-ontology.p>)
- [tptp/problems/ontology/ent-achievements-are-events.p](<../upstream/gufoevents/tptp/problems/ontology/ent-achievements-are-events.p>)
- [tptp/problems/ontology/ent-complex-achievement-inferred.p](<../upstream/gufoevents/tptp/problems/ontology/ent-complex-achievement-inferred.p>)
- [tptp/problems/ontology/ent-created-entails-wascreatedin.p](<../upstream/gufoevents/tptp/problems/ontology/ent-created-entails-wascreatedin.p>)
- [tptp/problems/ontology/ent-creation-change-termination-disjoint.p](<../upstream/gufoevents/tptp/problems/ontology/ent-creation-change-termination-disjoint.p>)
- [tptp/problems/ontology/ent-five-changes-disjoint.p](<../upstream/gufoevents/tptp/problems/ontology/ent-five-changes-disjoint.p>)
- [tptp/problems/ontology/ent-one-change-one-endurant.p](<../upstream/gufoevents/tptp/problems/ontology/ent-one-change-one-endurant.p>)
- [tptp/problems/ontology/ent-quality-value-change-targets-quality.p](<../upstream/gufoevents/tptp/problems/ontology/ent-quality-value-change-targets-quality.p>)
- [tptp/problems/ontology/ent-rigid-type-rejected.p](<../upstream/gufoevents/tptp/problems/ontology/ent-rigid-type-rejected.p>)
- [tptp/problems/ontology/ent-simple-achievement-has-no-parts.p](<../upstream/gufoevents/tptp/problems/ontology/ent-simple-achievement-has-no-parts.p>)
- [tptp/problems/ontology/ent-terminated-entails-wasterminatedin.p](<../upstream/gufoevents/tptp/problems/ontology/ent-terminated-entails-wasterminatedin.p>)
- [tptp/problems/ontology/ent-transformation-kinds-disjoint.p](<../upstream/gufoevents/tptp/problems/ontology/ent-transformation-kinds-disjoint.p>)
- [tptp/problems/ontology/ent-transformation-structure.p](<../upstream/gufoevents/tptp/problems/ontology/ent-transformation-structure.p>)
- [tptp/problems/ontology/neg-complex-parts-need-not-be-achievements.p](<../upstream/gufoevents/tptp/problems/ontology/neg-complex-parts-need-not-be-achievements.p>)
- [tptp/problems/ontology/neg-created-is-not-a-change.p](<../upstream/gufoevents/tptp/problems/ontology/neg-created-is-not-a-change.p>)
- [tptp/problems/ontology/neg-instantaneous-event-may-last.p](<../upstream/gufoevents/tptp/problems/ontology/neg-instantaneous-event-may-last.p>)
- [tptp/problems/ontology/neg-merging-cardinality-not-axiomatized.p](<../upstream/gufoevents/tptp/problems/ontology/neg-merging-cardinality-not-axiomatized.p>)
- [tptp/problems/ontology/neg-reclassification-not-inferred.p](<../upstream/gufoevents/tptp/problems/ontology/neg-reclassification-not-inferred.p>)
- [tptp/problems/ontology/neg-reclassification-parts-may-differ.p](<../upstream/gufoevents/tptp/problems/ontology/neg-reclassification-parts-may-differ.p>)
- [tptp/problems/ontology/neg-self-parthood-allowed.p](<../upstream/gufoevents/tptp/problems/ontology/neg-self-parthood-allowed.p>)
- [tptp/problems/ontology/neg-simple-achievement-not-inferred.p](<../upstream/gufoevents/tptp/problems/ontology/neg-simple-achievement-not-inferred.p>)
- [tptp/problems/ontology/neg-wascreatedin-does-not-entail-created.p](<../upstream/gufoevents/tptp/problems/ontology/neg-wascreatedin-does-not-entail-created.p>)

### illustration

- [docs/ufo-logo.png](<../upstream/gufoevents/docs/ufo-logo.png>)

### license

- [LICENSE](<../upstream/gufoevents/LICENSE>)

### source-tool-read-only

- [docs/build.py](<../upstream/gufoevents/docs/build.py>)
- [docs/style.css](<../upstream/gufoevents/docs/style.css>)
- [event-sourcing/run.py](<../upstream/gufoevents/event-sourcing/run.py>)
- [event-sourcing/validate_shapes.py](<../upstream/gufoevents/event-sourcing/validate_shapes.py>)
- [lean/lakefile.toml](<../upstream/gufoevents/lean/lakefile.toml>)
- [lean/lean-toolchain](<../upstream/gufoevents/lean/lean-toolchain>)
- [lean/ttl2lean.py](<../upstream/gufoevents/lean/ttl2lean.py>)
- [tptp/run.py](<../upstream/gufoevents/tptp/run.py>)
- [tptp/ttl2tptp.py](<../upstream/gufoevents/tptp/ttl2tptp.py>)
