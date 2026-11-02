# Full PDF text extraction

Original: [documentation/axiomatization-pds/universal-declaration.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/universal-declaration.pdf>)

Source SHA-256: `2de1eac6f9bacd79d3837ee32c04555b9145f52b16ccf3b63ea2a9e7c4df1da1`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Universal Declaration Axioms
Role is a universal [ewm-1]
universal(role)
Site is a universal [yhb-1]
universal(site)
Object is a universal [kxo-1]
universal(object)
History is a universal [gki-1]
universal(history)
Process is a universal [bsm-1]
universal(process)
Quality is a universal [mit-1]
universal(quality)
Function is a universal [rym-1]
universal(function)
Fiat line is a universal [spk-1]
universal(fiatLine)
Occurrent is a universal [lkt-1]
universal(occurrent)
Continuant is a universal [axs-1]
universal(continuant)
Fiat point is a universal [rns-1]
universal(fiatPoint)
Disposition is a universal [mld-1]
universal(disposition)
Fiat surface is a universal [ebw-1]
universal(fiatSurface)
Spatial region is a universal [rej-1]
universal(spatialRegion)
Material entity is a universal [hru-1]
universal(materialEntity)
Temporal region is a universal [toj-1]
universal(temporalRegion)
Fiat object part is a universal [csp-1]
universal(fiatObjectPart)
Object aggregate is a universal [cqv-1]
````

## PDF page 2

````text
universal(objectAggregate)
Process boundary is a universal [zqv-1]
universal(processBoundary)
Temporal instant is a universal [bjs-1]
universal(temporalInstant)
Immaterial entity is a universal [zcc-1]
universal(immaterialEntity)
Realizable entity is a universal [gpp-1]
universal(realizableEntity)
Temporal interval is a universal [kuz-1]
universal(temporalInterval)
Relational quality is a universal [zrp-1]
universal(relationalQuality)
Spatiotemporal region is a universal [mdh-1]
universal(spatiotemporalRegion)
Independent continuant is a universal [ufw-1]
universal(independentContinuant)
Continuant fiat boundary is a universal [zvi-1]
universal(continuantFiatBoundary)
One dimensional spatial region is a universal [zwl-1]
universal(oneDimensionalSpatialRegion)
Two dimensional spatial region is a universal [whi-1]
universal(twoDimensionalSpatialRegion)
One dimensional temporal region is a universal [qar-1]
universal(oneDimensionalTemporalRegion)
Zero dimensional spatial region is a universal [vij-1]
universal(zeroDimensionalSpatialRegion)
Universals and particulars comprise the whole domain of discourse [eto-1]
∀x(universal(x) ∨particular(x))
Generically dependent continuant is a universal [qiz-1]
universal(genericallyDependentContinuant)
Three dimensional spatial region is a universal [qov-1]
universal(threeDimensionalSpatialRegion)
Zero dimensional temporal region is a universal [bau-1]
universal(zeroDimensionalTemporalRegion)
Specifically dependent continuant is a universal [wda-1]
universal(specificallyDependentContinuant)
````

## PDF page 3

````text
Universals are not particulars [qkp-1]
¬(∃x(universal(x) ∧particular(x)))
History is subclass of process [zuj-1]
∀t,x(instanceOf(x,history,t) →instanceOf(x,process,t))
Process is subclass of occurrent [lso-1]
∀t,x(instanceOf(x,process,t) →instanceOf(x,occurrent,t))
Disposition, role are mutually disjoint [bwk-2]
¬(∃x,t(instanceOf(x,disposition,t) ∧instanceOf(x,role,t)))
Function is subclass of disposition [lnj-1]
∀t,x(instanceOf(x,function,t) →instanceOf(x,disposition,t))
Object is subclass of material entity [vbm-1]
∀t,x(instanceOf(x,object,t) →instanceOf(x,materialEntity,t))
Role is subclass of realizable entity [tcp-1]
∀t,x(instanceOf(x,role,t) →instanceOf(x,realizableEntity,t))
Site is subclass of immaterial entity [tcd-1]
∀t,x(instanceOf(x,site,t) →instanceOf(x,immaterialEntity,t))
If something is an instance of temporal region at t, then t is part of that temporal region [njq-1]
∀ti,t(instanceOf(ti,temporalRegion,t) →temporalPartOf(t,ti))
Continuant, occurrent are mutually disjoint [wrf-2]
¬(∃x,t(instanceOf(x,continuant,t) ∧instanceOf(x,occurrent,t)))
Temporal region is subclass of occurrent [ejl-1]
∀t,x(instanceOf(x,temporalRegion,t) →instanceOf(x,occurrent,t))
Process boundary is subclass of occurrent [xot-1]
∀t,x(instanceOf(x,processBoundary,t) →instanceOf(x,occurrent,t))
Relational quality is subclass of quality [taj-1]
∀t,x(instanceOf(x,relationalQuality,t) →instanceOf(x,quality,t))
Quality, realizable entity are mutually disjoint [ksk-2]
¬(∃x,t(instanceOf(x,quality,t)∧instanceOf(x,realizableEntity,t)))
Disposition is subclass of realizable entity [fxd-1]
∀t,x(instanceOf(x,disposition,t) →instanceOf(x,realizableEntity,t))
Spatiotemporal region is subclass of occurrent [les-1]
∀t,x(instanceOf(x,spatiotemporalRegion,t) →instanceOf(x,occurrent,t))
Fiat object part is subclass of material entity [lal-1]
∀t,x(instanceOf(x,fiatObjectPart,t) →instanceOf(x,materialEntity,t))
Object aggregate is subclass of material entity [fda-1]
∀t,x(instanceOf(x,objectAggregate,t) →instanceOf(x,materialEntity,t))
Spatial region is subclass of immaterial entity [bre-1]
````

## PDF page 4

````text
∀t,x(instanceOf(x,spatialRegion,t) →instanceOf(x,immaterialEntity,t))
Independent continuant is subclass of continuant [wyq-1]
∀t,x(instanceOf(x,independentContinuant,t) →instanceOf(x,continuant,t))
Fiat line is subclass of continuant fiat boundary [dhy-1]
∀t,x(instanceOf(x,fiatLine,t) →instanceOf(x,continuantFiatBoundary,t))
Fiat point is subclass of continuant fiat boundary [xlm-1]
∀t,x(instanceOf(x,fiatPoint,t) →instanceOf(x,continuantFiatBoundary,t))
Material entity, immaterial entity are mutually disjoint [sij-2]
¬(∃x,t(instanceOf(x,materialEntity,t)∧instanceOf(x,immaterialEntity,t)))
Fiat surface is subclass of continuant fiat boundary [kfj-1]
∀t,x(instanceOf(x,fiatSurface,t) →instanceOf(x,continuantFiatBoundary,t))
Material entity is subclass of independent continuant [faf-1]
∀t,x(instanceOf(x,materialEntity,t) →instanceOf(x,independentContinuant,t))
Immaterial entity is subclass of independent continuant [bzp-1]
∀t,x(instanceOf(x,immaterialEntity,t) →instanceOf(x,independentContinuant,t))
Quality is subclass of specifically dependent continuant [nbm-1]
∀t,x(instanceOf(x,quality,t) →instanceOf(x,specificallyDependentContinuant,t))
Continuant fiat boundary is subclass of immaterial entity [tgs-1]
∀t,x(instanceOf(x,continuantFiatBoundary,t) →instanceOf(x,immaterialEntity,t))
Generically dependent continuant is subclass of continuant [zyw-1]
∀t,x(instanceOf(x,genericallyDependentContinuant,t) →instanceOf(x,continuant,t))
Specifically dependent continuant is subclass of continuant [dhv-1]
∀t,x(instanceOf(x,specificallyDependentContinuant,t) →instanceOf(x,continuant,t))
One dimensional spatial region is subclass of spatial region [fzn-1]
∀t,x(instanceOf(x,oneDimensionalSpatialRegion,t) →instanceOf(x,spatialRegion,t))
Two dimensional spatial region is subclass of spatial region [abo-1]
∀t,x(instanceOf(x,twoDimensionalSpatialRegion,t) →instanceOf(x,spatialRegion,t))
Zero dimensional spatial region is subclass of spatial region [abh-1]
∀t,x(instanceOf(x,zeroDimensionalSpatialRegion,t) →instanceOf(x,spatialRegion,t))
One dimensional temporal region is subclass of temporal region [fpd-1]
∀t,x(instanceOf(x,oneDimensionalTemporalRegion,t) →instanceOf(x,temporalRegion,t))
Three dimensional spatial region is subclass of spatial region [apt-1]
∀t,x(instanceOf(x,threeDimensionalSpatialRegion,t) →instanceOf(x,spatialRegion,t))
Zero dimensional temporal region is subclass of temporal region [pvu-1]
∀t,x(instanceOf(x,zeroDimensionalTemporalRegion,t) →instanceOf(x,temporalRegion,t))
Temporal instant is subclass of zero dimensional temporal region [bjp-1]
∀t,x(instanceOf(x,temporalInstant,t) →instanceOf(x,zeroDimensionalTemporalRegion,t))
````

## PDF page 5

````text
Temporal interval is subclass of one dimensional temporal region [fye-1]
∀t,x(instanceOf(x,temporalInterval,t) →instanceOf(x,oneDimensionalTemporalRegion,t))
Entity is either universal or particular, so not all are instantiated. Instead make a predicate ’entity’ analogous to particular
universal [vgn-1]
∀x( ∃t(instanceOf(x,continuant,t) ∨instanceOf(x,occurrent,t)) →entity(x))
Realizable entity is subclass of specifically dependent continuant [qix-1]
∀t,x(instanceOf(x,realizableEntity,t) →instanceOf(x,specificallyDependentContinuant,t))
If something is a role at any time then as long as it exists it is a role. [hxo-1]
∀x( ∃t instanceOf(x,role,t) → ∀t(existsAt(x,t) →instanceOf(x,role,t)))
If something is a site at any time then as long as it exists it is a site. [txn-1]
∀x( ∃t instanceOf(x,site,t) → ∀t(existsAt(x,t) →instanceOf(x,site,t)))
One dimensional temporal region, zero dimensional temporal region are mutually disjoint [zkj-2]
¬(∃x,t(instanceOf(x,oneDimensionalTemporalRegion,t)
∧instanceOf(x,zeroDimensionalTemporalRegion,t)))
If something is a quality at any time then as long as it exists it is a quality. [jdo-1]
∀x( ∃t instanceOf(x,quality,t)→ ∀t(existsAt(x,t) →instanceOf(x,quality,t)))
If something is a function at any time then as long as it exists it is a function. [hww-1]
∀x( ∃t instanceOf(x,function,t) → ∀t(existsAt(x,t) →instanceOf(x,function,t)))
If something is a fiat line at any time then as long as it exists it is a fiat line. [ylr-1]
∀x( ∃t instanceOf(x,fiatLine,t) → ∀t(existsAt(x,t) →instanceOf(x,fiatLine,t)))
If something is a continuant at any time then as long as it exists it is a continuant. [ghs-1]
∀x( ∃t instanceOf(x,continuant,t) → ∀t(existsAt(x,t) →instanceOf(x,continuant,t)))
If something is a fiat point at any time then as long as it exists it is a fiat point. [cqf-1]
∀x( ∃t instanceOf(x,fiatPoint,t) → ∀t(existsAt(x,t) →instanceOf(x,fiatPoint,t)))
If something is a disposition at any time then as long as it exists it is a disposition. [ijx-1]
∀x( ∃t instanceOf(x,disposition,t) → ∀t(existsAt(x,t) →instanceOf(x,disposition,t)))
If something is a fiat surface at any time then as long as it exists it is a fiat surface. [dyv-1]
∀x( ∃t instanceOf(x,fiatSurface,t) → ∀t(existsAt(x,t) →instanceOf(x,fiatSurface,t)))
If something is a spatial region at any time then as long as it exists it is a spatial region. [thk-1]
∀x( ∃t instanceOf(x,spatialRegion,t) → ∀t(existsAt(x,t) →instanceOf(x,spatialRegion,t)))
If something is a material entity at any time then as long as it exists it is a material entity. [opd-1]
∀x (∃t instanceOf(x,materialEntity,t)
→ ∀t(existsAt(x,t) →instanceOf(x,materialEntity,t)))
No occurrent changes type during its existence [ayr-2]
∀o,u,t1,t2 (instanceOf(o,occurrent,t1)∧instanceOf(o,u,t2)
→instanceOf(o,occurrent,t2)∧instanceOf(o,u,t1))
If something is a immaterial entity at any time then as long as it exists it is a immaterial entity. [nlc-1]
∀x (∃t instanceOf(x,immaterialEntity,t)
→ ∀t(existsAt(x,t) →instanceOf(x,immaterialEntity,t)))
If something is a realizable entity at any time then as long as it exists it is a realizable entity. [gsg-1]
∀x (∃t instanceOf(x,realizableEntity,t)
→ ∀t(existsAt(x,t) →instanceOf(x,realizableEntity,t)))
````

## PDF page 6

````text
If something is a relational quality at any time then as long as it exists it is a relational quality. [jyh-1]
∀x (∃t instanceOf(x,relationalQuality,t)
→ ∀t(existsAt(x,t) →instanceOf(x,relationalQuality,t)))
If something is a independent continuant at any time then as long as it exists it is a independent continuant. [otk-1]
∀x (∃t instanceOf(x,independentContinuant,t)
→ ∀t(existsAt(x,t) →instanceOf(x,independentContinuant,t)))
If something is a continuant fiat boundary at any time then as long as it exists it is a continuant fiat boundary. [yuh-1]
∀x (∃t instanceOf(x,continuantFiatBoundary,t)
→ ∀t(existsAt(x,t) →instanceOf(x,continuantFiatBoundary,t)))
If something is a one dimensional spatial region at any time then as long as it exists it is a one dimensional spatial region.
[bld-1]
∀x (∃t instanceOf(x,oneDimensionalSpatialRegion,t)
→ ∀t(existsAt(x,t) →instanceOf(x,oneDimensionalSpatialRegion,t)))
If something is a two dimensional spatial region at any time then as long as it exists it is a two dimensional spatial region.
[uld-1]
∀x (∃t instanceOf(x,twoDimensionalSpatialRegion,t)
→ ∀t(existsAt(x,t) →instanceOf(x,twoDimensionalSpatialRegion,t)))
If something is a zero dimensional spatial region at any time then as long as it exists it is a zero dimensional spatial region.
[vsa-1]
∀x (∃t instanceOf(x,zeroDimensionalSpatialRegion,t)
→ ∀t(existsAt(x,t) →instanceOf(x,zeroDimensionalSpatialRegion,t)))
If something is a generically dependent continuant at any time then as long as it exists it is a generically dependent continuant.
[iup-1]
∀x (∃t instanceOf(x,genericallyDependentContinuant,t)
→ ∀t(existsAt(x,t) →instanceOf(x,genericallyDependentContinuant,t)))
If something is a three dimensional spatial region at any time then as long as it exists it is a three dimensional spatial region.
[qpr-1]
∀x (∃t instanceOf(x,threeDimensionalSpatialRegion,t)
→ ∀t(existsAt(x,t) →instanceOf(x,threeDimensionalSpatialRegion,t)))
If something is a specifically dependent continuant at any time then as long as it exists it is a specifically dependent continuant.
[hke-1]
∀x (∃t instanceOf(x,specificallyDependentContinuant,t)
→ ∀t(existsAt(x,t) →instanceOf(x,specificallyDependentContinuant,t)))
Fiat surface, fiat line, fiat point are mutually disjoint [sjf-1]
¬(∃x,t(instanceOf(x,fiatSurface,t) ∧instanceOf(x,fiatLine,t)))
∧ ¬(∃x,t(instanceOf(x,fiatSurface,t) ∧instanceOf(x,fiatPoint,t)))
∧ ¬(∃x,t(instanceOf(x,fiatLine,t) ∧instanceOf(x,fiatPoint,t)))
Site, spatial region, continuant fiat boundary are mutually disjoint [twc-1]
¬(∃x,t(instanceOf(x,site,t) ∧instanceOf(x,spatialRegion,t)))
∧ ¬(∃x,t(instanceOf(x,site,t) ∧instanceOf(x,continuantFiatBoundary,t)))
∧ ¬(∃x,t(instanceOf(x,spatialRegion,t) ∧instanceOf(x,continuantFiatBoundary,t)))
Specifically dependent continuant, independent continuant, generically dependent continuant are mutually disjoint [cig-1]
¬(∃x,t(instanceOf(x,specificallyDependentContinuant,t)
∧instanceOf(x,independentContinuant,t)))
∧ ¬(∃x,t(instanceOf(x,specificallyDependentContinuant,t)
∧instanceOf(x,genericallyDependentContinuant,t)))
∧ ¬(∃x,t(instanceOf(x,independentContinuant,t)
∧instanceOf(x,genericallyDependentContinuant,t)))
Process, spatiotemporal region, process boundary, temporal region are mutually disjoint [mem-1]
¬(∃x,t(instanceOf(x,process,t) ∧instanceOf(x,spatiotemporalRegion,t)))
∧ ¬(∃x,t(instanceOf(x,process,t) ∧instanceOf(x,processBoundary,t)))
∧ ¬(∃x,t(instanceOf(x,process,t) ∧instanceOf(x,temporalRegion,t)))
∧ ¬(∃x,t(instanceOf(x,spatiotemporalRegion,t) ∧instanceOf(x,processBoundary,t)))
∧ ¬(∃x,t(instanceOf(x,spatiotemporalRegion,t) ∧instanceOf(x,temporalRegion,t)))
∧ ¬(∃x,t(instanceOf(x,processBoundary,t)∧instanceOf(x,temporalRegion,t)))
````

## PDF page 7

````text
Continuant, material entity, object, fiat object part, object aggregate, site, immaterial entity, continuant fiat boundary, fiat
surface, fiat line, fiat point, spatial region, three dimensional spatial region, two dimensional spatial region, one dimensional
spatial region, zero dimensional spatial region, independent continuant, generically dependent continuant, specifically depen-
dent continuant, quality, relational quality, function, disposition, realizable entity, role, occurrent, process, process boundary,
temporal region, zero dimensional temporal region, temporal instant, one dimensional temporal region, temporal interval,
history, spatiotemporal region are all different [xtf-1]
The axiom is too large to show. It is a conjunction of 1190 pairwise inequalities between the constants continuant, materialEn-
tity, object, fiatObjectPart, objectAggregate, site, immaterialEntity, continuantFiatBoundary, fiatSurface, fiatLine, fiatPoint,
spatialRegion, threeDimensionalSpatialRegion, twoDimensionalSpatialRegion, oneDimensionalSpatialRegion, zeroDimen-
sionalSpatialRegion, independentContinuant, genericallyDependentContinuant, specificallyDependentContinuant, quality,
relationalQuality, function, disposition, realizableEntity, role, occurrent, process, processBoundary, temporalRegion, zeroDi-
mensionalTemporalRegion, temporalInstant, oneDimensionalTemporalRegion, temporalInterval, history and spatiotempo-
ralRegion.
Zero dimensional spatial region, one dimensional spatial region, two dimensional spatial region, three dimensional spatial
region are mutually disjoint [luc-1]
¬(∃x,t(instanceOf(x,zeroDimensionalSpatialRegion,t)
∧instanceOf(x,oneDimensionalSpatialRegion,t)))
∧ ¬(∃x,t(instanceOf(x,zeroDimensionalSpatialRegion,t)
∧instanceOf(x,twoDimensionalSpatialRegion,t)))
∧ ¬(∃x,t(instanceOf(x,zeroDimensionalSpatialRegion,t)
∧instanceOf(x,threeDimensionalSpatialRegion,t)))
∧ ¬(∃x,t(instanceOf(x,oneDimensionalSpatialRegion,t)
∧instanceOf(x,twoDimensionalSpatialRegion,t)))
∧ ¬(∃x,t(instanceOf(x,oneDimensionalSpatialRegion,t)
∧instanceOf(x,threeDimensionalSpatialRegion,t)))
∧ ¬(∃x,t(instanceOf(x,twoDimensionalSpatialRegion,t)
∧instanceOf(x,threeDimensionalSpatialRegion,t)))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

