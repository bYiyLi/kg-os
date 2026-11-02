# Full PDF text extraction

Original: [documentation/axiomatization-pds/profiles/temporalized-relations.pdf](<../../../../../upstream/bfo-2020/documentation/axiomatization-pds/profiles/temporalized-relations.pdf>)

Source SHA-256: `6f929c6aa6fa8e4a500f72cec628904f760ba8790631c6013756a87d846f75e3`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 At T T emporalized Axioms
Located in at some time [asd-1]
∀p,q(locatedInAtSomeTime(p,q) ↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧locatedIn(p,q,t)))
Concretizes at some time [gkc-1]
∀p,q (concretizesAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧concretizes(p,q,t)))
Location of at some time [spm-1]
∀p,q(locationOfAtSomeTime(p,q) ↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧locationOf(p,q,t)))
Is carrier of at some time [qkm-1]
∀p,q (isCarrierOfAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧isCarrierOf(p,q,t)))
Member part of at some time [kax-1]
∀p,q (memberPartOfAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧memberPartOf(p,q,t)))
Has member part at some time [smy-1]
∀p,q (hasMemberPartAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧hasMemberPart(p,q,t)))
Has participant at some time [ebs-1]
∀p,q (hasParticipantAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧hasParticipant(p,q,t)))
Participates in at some time [oia-1]
∀p,q (participatesInAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧participatesIn(p,q,t)))
Rdf:type is interpreted as meaning an instance is a given type whenever it exists, and that the instance exists at some point.
[fyy-1]
∀c,i(rdfType(c,i) ↔(∀t(existsAt(i,t) →instanceOf(i,c,t))) ∧ ∃t existsAt(i,t))
Is concretized by at some time [zgk-1]
∀p,q (isConcretizedByAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧isConcretizedBy(p,q,t)))
Material basis of at some time [exa-1]
∀p,q (materialBasisOfAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧materialBasisOf(p,q,t)))
Continuant part of at some time [lzq-1]
∀p,q (continuantPartOfAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧continuantPartOf(p,q,t)))
Has material basis at some time [fqc-1]
∀p,q (hasMaterialBasisAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧hasMaterialBasis(p,q,t)))
Has continuant part at some time [jvz-1]
∀p,q (hasContinuantPartAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧hasContinuantPart(p,q,t)))
Generically depends on at some time [vrq-1]
∀p,q (genericallyDependsOnAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧genericallyDependsOn(p,q,t)))
Occupies spatial region at some time [yci-1]
∀p,q (occupiesSpatialRegionAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧occupiesSpatialRegion(p,q,t)))
Spatially projects onto at some time [epa-1]
∀p,q (spatiallyProjectsOntoAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧spatiallyProjectsOnto(p,q,t)))
````

## PDF page 2

````text
Proper continuant part of at some time [sql-1]
∀p,q (properContinuantPartOfAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧properContinuantPartOf(p,q,t)))
Has proper continuant part at some time [ule-1]
∀p,q (hasProperContinuantPartAtSomeTime(p,q)
↔ ∃t(existsAt(p,t) ∧existsAt(q,t) ∧hasProperContinuantPart(p,q,t)))
Located in at all times [vdo-1]
∀p,q (locatedInAtAllTimes(p,q)
↔(∃t(locatedIn(p,q,t) ∧existsAt(p,t))) ∧(∀t(existsAt(p,t) →locatedIn(p,q,t))))
Concretizes at all times [uge-1]
∀p,q (concretizesAtAllTimes(p,q)
↔(∃t(concretizes(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →concretizes(p,q,t))))
Location of at all times [imi-1]
∀p,q (locationOfAtAllTimes(p,q)
↔(∃t(locationOf(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →locationOf(p,q,t))))
Is carrier of at all times [fya-1]
∀p,q (isCarrierOfAtAllTimes(p,q)
↔(∃t(isCarrierOf(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →isCarrierOf(p,q,t))))
Member part of at all times [maf-1]
∀p,q (memberPartOfAtAllTimes(p,q)
↔(∃t(memberPartOf(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →memberPartOf(p,q,t))))
Has member part at all times [xwi-1]
∀p,q (hasMemberPartAtAllTimes(p,q)
↔(∃t(hasMemberPart(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →hasMemberPart(p,q,t))))
Has participant at all times [wyo-1]
∀p,q (hasParticipantAtAllTimes(p,q)
↔(∃t(hasParticipant(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →hasParticipant(p,q,t))))
Participates in at all times [ghl-1]
∀p,q (participatesInAtAllTimes(p,q)
↔(∃t(participatesIn(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →participatesIn(p,q,t))))
Is concretized by at all times [qhq-1]
∀p,q (isConcretizedByAtAllTimes(p,q)
↔(∃t(isConcretizedBy(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →isConcretizedBy(p,q,t))))
Material basis of at all times [scx-1]
∀p,q (materialBasisOfAtAllTimes(p,q)
↔(∃t(materialBasisOf(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →materialBasisOf(p,q,t))))
Continuant part of at all times [ztt-1]
∀p,q (continuantPartOfAtAllTimes(p,q)
↔(∃t(continuantPartOf(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →continuantPartOf(p,q,t))))
Has material basis at all times [qdl-1]
∀p,q (hasMaterialBasisAtAllTimes(p,q)
↔(∃t(hasMaterialBasis(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →hasMaterialBasis(p,q,t))))
Has continuant part at all times [uhy-1]
````

## PDF page 3

````text
∀p,q (hasContinuantPartAtAllTimes(p,q)
↔(∃t(hasContinuantPart(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →hasContinuantPart(p,q,t))))
Generically depends on at all times [wie-1]
∀p,q (genericallyDependsOnAtAllTimes(p,q)
↔(∃t(genericallyDependsOn(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →genericallyDependsOn(p,q,t))))
Occupies spatial region at all times [tpr-1]
∀p,q (occupiesSpatialRegionAtAllTimes(p,q)
↔(∃t(occupiesSpatialRegion(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →occupiesSpatialRegion(p,q,t))))
Spatially projects onto at all times [ogh-1]
∀p,q (spatiallyProjectsOntoAtAllTimes(p,q)
↔(∃t(spatiallyProjectsOnto(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →spatiallyProjectsOnto(p,q,t))))
Proper continuant part of at all times [jiz-1]
∀p,q (properContinuantPartOfAtAllTimes(p,q)
↔(∃t(properContinuantPartOf(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →properContinuantPartOf(p,q,t))))
Has proper continuant part at all times [mxe-1]
∀p,q (hasProperContinuantPartAtAllTimes(p,q)
↔(∃t(hasProperContinuantPart(p,q,t) ∧existsAt(p,t)))
∧(∀t(existsAt(p,t) →hasProperContinuantPart(p,q,t))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

