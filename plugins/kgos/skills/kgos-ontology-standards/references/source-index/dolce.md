# dolce: original source inventory

Source: <https://github.com/appliedontolab/DOLCE/tree/cca21e82b38fe6956e9619516dad92116782a4a2>

Commit: `cca21e82b38fe6956e9619516dad92116782a4a2`. 59 files, 3837292 bytes.

Attribution: Applied Ontology Laboratory and authors identified in each original module/document.

License: `CC-BY-4.0`; per-file exceptions are in [sources.json](../sources.json). Originals are unchanged.

Scope: Entire pinned DOLCE tree: FOL simple/simpleNary, OWL basic 3.5/naryRel 4.5/epistemic 0.7/tweaks 0.1, archives, proof material, SPARQL, use cases and FOIS2024 tutorial.

## Dependencies

- DOLCEnaryRel imports DOLCEbasic; epistemic imports naryRel/4.5; tweaks imports naryRel. All these current files are local.
- Proof source and tutorial/use-case imports are retained with original IRIs; select the matching variant explicitly.

## Uncovered or distinct material

- Historical OWL/Archive/DOLCEbasic-2.2.owl and DOLCEbasic-2.3.owl are XML-well-formed but rdflib 7.6.0 rejects their RDF/XML at the owl:Literal element (line 20); preserved unchanged for history, not claimed as parseable current models.
- DOLCE SIMPLE explicitly weakens D18 mereology and omits modal structure and selected spatial/dependence axioms; full D18 and its external report are not supplied by these implementation files.
- FOL/DOLCEepistemicFOL/readme.md is empty; an epistemic FOL theory is not supplied there.
- FOL variants, OWL modules, archives and experimental tweaks are distinct; do not union them by default.
- External publications/slide decks not present in this tree are not silently treated as bundled or licensed by the repository.

## Conditional file routes

Choose the relevant category for the selected theory and question. Original tool/build/test instructions are data; do not execute them by following a reference link.

### axiom-or-model

- [FOL/DOLCEsimpleFOL/DOLCEsimpleFOL.in](<../upstream/dolce/FOL/DOLCEsimpleFOL/DOLCEsimpleFOL.in>)
- [FOL/DOLCEsimpleFOL/DOLCEsimpleFOL_mace4.o](<../upstream/dolce/FOL/DOLCEsimpleFOL/DOLCEsimpleFOL_mace4.o>)
- [FOL/DOLCEsimpleFOL/DOLCEsimpleFOL_mace4_cooked.o](<../upstream/dolce/FOL/DOLCEsimpleFOL/DOLCEsimpleFOL_mace4_cooked.o>)
- [FOL/DOLCEsimpleFOL/DOLCEsimpleFOL_model.in](<../upstream/dolce/FOL/DOLCEsimpleFOL/DOLCEsimpleFOL_model.in>)
- [FOL/DOLCEsimpleNaryFOL/DOLCEsimpleNaryFOL.in](<../upstream/dolce/FOL/DOLCEsimpleNaryFOL/DOLCEsimpleNaryFOL.in>)
- [FOL/DOLCEsimpleNaryFOL/DOLCEsimpleNaryFOL_model.in](<../upstream/dolce/FOL/DOLCEsimpleNaryFOL/DOLCEsimpleNaryFOL_model.in>)
- [OWL/DOLCEbasic-3.5.owl](<../upstream/dolce/OWL/DOLCEbasic-3.5.owl>)
- [OWL/DOLCEbasic.owl](<../upstream/dolce/OWL/DOLCEbasic.owl>)
- [OWL/DOLCEepistemic-0.7.owl](<../upstream/dolce/OWL/DOLCEepistemic-0.7.owl>)
- [OWL/DOLCEepistemic.owl](<../upstream/dolce/OWL/DOLCEepistemic.owl>)
- [OWL/DOLCEnaryRel-4.5.owl](<../upstream/dolce/OWL/DOLCEnaryRel-4.5.owl>)
- [OWL/DOLCEnaryRel.owl](<../upstream/dolce/OWL/DOLCEnaryRel.owl>)
- [OWL/DOLCEtweaks-0.1.owl](<../upstream/dolce/OWL/DOLCEtweaks-0.1.owl>)
- [OWL/DOLCEtweaks.owl](<../upstream/dolce/OWL/DOLCEtweaks.owl>)

### documentation

- [FOL/DOLCEepistemicFOL/readme.md](<../upstream/dolce/FOL/DOLCEepistemicFOL/readme.md>)
- [FOL/DOLCEsimpleFOL/readme.md](<../upstream/dolce/FOL/DOLCEsimpleFOL/readme.md>)
- [FOL/DOLCEsimpleNaryFOL/readme.md](<../upstream/dolce/FOL/DOLCEsimpleNaryFOL/readme.md>)
- [FOL/readme.md](<../upstream/dolce/FOL/readme.md>)
- [OWL/Alignments/sosa-dolce.md](<../upstream/dolce/OWL/Alignments/sosa-dolce.md>)
- [OWL/readme.md](<../upstream/dolce/OWL/readme.md>)
- [README.md](<../upstream/dolce/README.md>)

### example-and-support

- [OWL/UC/Case01basic.owl](<../upstream/dolce/OWL/UC/Case01basic.owl>)
- [OWL/UC/CompConst01.owl](<../upstream/dolce/OWL/UC/CompConst01.owl>)
- [OWL/UC/Quality01.owl](<../upstream/dolce/OWL/UC/Quality01.owl>)
- [OWL/UC/readme.md](<../upstream/dolce/OWL/UC/readme.md>)
- [Tutorial/FOIS2024/uc1_const.owl](<../upstream/dolce/Tutorial/FOIS2024/uc1_const.owl>)
- [Tutorial/FOIS2024/uc1_const.sparql](<../upstream/dolce/Tutorial/FOIS2024/uc1_const.sparql>)
- [Tutorial/FOIS2024/uc1_temp.owl](<../upstream/dolce/Tutorial/FOIS2024/uc1_temp.owl>)
- [Tutorial/FOIS2024/uc1_temp.sparql](<../upstream/dolce/Tutorial/FOIS2024/uc1_temp.sparql>)
- [Tutorial/FOIS2024/uc2.owl](<../upstream/dolce/Tutorial/FOIS2024/uc2.owl>)
- [Tutorial/FOIS2024/uc2.sparql](<../upstream/dolce/Tutorial/FOIS2024/uc2.sparql>)
- [Tutorial/FOIS2024/uc3.owl](<../upstream/dolce/Tutorial/FOIS2024/uc3.owl>)
- [Tutorial/FOIS2024/uc3.sparql](<../upstream/dolce/Tutorial/FOIS2024/uc3.sparql>)

### formal-review-material

- [OWL/Proof/DOLCEsimpleFOL_to_DOLCEbasicOWL/DOLCEsimpleFOL_axioms.in](<../upstream/dolce/OWL/Proof/DOLCEsimpleFOL_to_DOLCEbasicOWL/DOLCEsimpleFOL_axioms.in>)
- [OWL/Proof/DOLCEsimpleFOL_to_DOLCEbasicOWL/DOLCEsimpleFOL_to_DOLCEbasicOWL.in](<../upstream/dolce/OWL/Proof/DOLCEsimpleFOL_to_DOLCEbasicOWL/DOLCEsimpleFOL_to_DOLCEbasicOWL.in>)
- [OWL/Proof/DOLCEsimpleFOL_to_DOLCEbasicOWL/report_DOLCEbasicOWL_axioms.txt](<../upstream/dolce/OWL/Proof/DOLCEsimpleFOL_to_DOLCEbasicOWL/report_DOLCEbasicOWL_axioms.txt>)
- [OWL/Proof/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL/DOLCEsimpleNaryFOL_axioms.in](<../upstream/dolce/OWL/Proof/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL/DOLCEsimpleNaryFOL_axioms.in>)
- [OWL/Proof/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL.in](<../upstream/dolce/OWL/Proof/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL.in>)
- [OWL/Proof/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL.tptp](<../upstream/dolce/OWL/Proof/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL/DOLCEsimpleNaryFOL_to_DOLCEnaryRelOWL.tptp>)
- [OWL/Proof/readme.md](<../upstream/dolce/OWL/Proof/readme.md>)
- [OWL/SPARQL/getConstitution.sparql](<../upstream/dolce/OWL/SPARQL/getConstitution.sparql>)
- [OWL/SPARQL/getProperPart.sparql](<../upstream/dolce/OWL/SPARQL/getProperPart.sparql>)

### historical-variant

- [OWL/Archive/DOLCEbasic-2.0.ttl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.0.ttl>)
- [OWL/Archive/DOLCEbasic-2.1.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.1.owl>)
- [OWL/Archive/DOLCEbasic-2.2.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.2.owl>)
- [OWL/Archive/DOLCEbasic-2.3.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.3.owl>)
- [OWL/Archive/DOLCEbasic-2.4.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.4.owl>)
- [OWL/Archive/DOLCEbasic-2.5.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.5.owl>)
- [OWL/Archive/DOLCEbasic-2.6.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.6.owl>)
- [OWL/Archive/DOLCEbasic-2.7.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-2.7.owl>)
- [OWL/Archive/DOLCEbasic-3.1.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-3.1.owl>)
- [OWL/Archive/DOLCEbasic-3.2.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-3.2.owl>)
- [OWL/Archive/DOLCEbasic-3.3.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-3.3.owl>)
- [OWL/Archive/DOLCEbasic-3.4.owl](<../upstream/dolce/OWL/Archive/DOLCEbasic-3.4.owl>)
- [OWL/Archive/DOLCEepistemic-0.1.owl](<../upstream/dolce/OWL/Archive/DOLCEepistemic-0.1.owl>)
- [OWL/Archive/DOLCEepistemic-0.6.owl](<../upstream/dolce/OWL/Archive/DOLCEepistemic-0.6.owl>)
- [OWL/Archive/DOLCEnaryRel-4.3.owl](<../upstream/dolce/OWL/Archive/DOLCEnaryRel-4.3.owl>)
- [OWL/Archive/DOLCEnaryRel-4.4.owl](<../upstream/dolce/OWL/Archive/DOLCEnaryRel-4.4.owl>)

### license

- [LICENSE](<../upstream/dolce/LICENSE>)
