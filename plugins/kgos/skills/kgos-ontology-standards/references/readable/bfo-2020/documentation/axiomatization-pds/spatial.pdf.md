# Full PDF text extraction

Original: [documentation/axiomatization-pds/spatial.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/spatial.pdf>)

Source SHA-256: `eab30e7bb1bc2053f31c6b7565878716e6fcb92e8e135b3c31ead9f37315cc38`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Spatial Axioms
Occurs in and environs are inverse relations [uys-1]
∀a,b(occursIn(a,b) ↔environs(b,a))
Located in and location of are inverse relations [kaw-1]
∀t,a,b(locatedIn(a,b,t) ↔locationOf(b,a,t))
Occurs in is dissective on first argument when it is an occurrent [jil-1]
∀p,q,r(occursIn(p,q) ∧occurrentPartOf(r,p) →occursIn(r,q))
If a process (or process boundary) occurs in a continuant, that continuant exists at least as long as the process does [dxv-1]
∀p,c(occursIn(p,c) → ∀t(existsAt(p,t) →existsAt(c,t)))
Located in is dissective on third argument, a temporal region [put-1]
∀p,q,r,s(locatedIn(p,q,r) ∧temporalPartOf(s,r) →locatedIn(p,q,s))
Located in is a lower bound on second argument [evu-1]
∀p,q,r,s(locatedIn(p,q,r) ∧continuantPartOf(q,s,r) →locatedIn(p,s,r))
Located in is dissective on first argument when it is a continuant [wty-1]
∀p,q,r,s(locatedIn(p,q,r) ∧continuantPartOf(s,p,r) →locatedIn(s,q,r))
Occupies spatial region is functional on second argument [zls-1]
∀p,q,r,s(occupiesSpatialRegion(p,q,r) ∧occupiesSpatialRegion(p,s,r) →q=s)
Occupies spatial region is functional on first argument [csx-1]
∀p,q,r,s(occupiesSpatialRegion(p,q,r) ∧occupiesSpatialRegion(s,q,r) →p=s)
Occupies spatial region is dissective on third argument, a temporal region [mud-1]
∀p,q,r,s (occupiesSpatialRegion(p,q,r)∧temporalPartOf(s,r)
→occupiesSpatialRegion(p,q,s))
Spatially projects onto is dissective on third argument, a temporal region [ivt-1]
∀p,q,r,s (spatiallyProjectsOnto(p,q,r)∧temporalPartOf(s,r)
→spatiallyProjectsOnto(p,q,s))
Located in is transitive at a time [ets-1]
∀a,b,c,t,t2 (locatedIn(a,b,t)∧locatedIn(b,c,t2) ∧temporalPartOf(t,t2)
→locatedIn(a,c,t))
If a location of b then if a is an instance of continuant fiat boundary then b is an instance of continuant fiat boundary [wte-1]
∀p,q,t (locationOf(p,q,t)∧instanceOf(p,continuantFiatBoundary,t)
→instanceOf(q,continuantFiatBoundary,t))
If a process occurs in c then it occurs in any place that c is part of at least as long as p exists [czc-2]
∀p,c1,c2 (occursIn(p,c1)∧(∀t(existsAt(p,t) →continuantPartOf(c1,c2,t)))
→occursIn(p,c2))
All spatial regions are part of a 3 dimensional spatial region [xcx-1]
∀s,t (instanceOf(s,spatialRegion,t)
→ ∃s3(instanceOf(s3,threeDimensionalSpatialRegion,t) ∧continuantPartOf(s,s3,t)))
Spatial regions don’t change what they are part of. [mlb-2]
∀sr1,sr2,t1,t2 (continuantPartOf(sr1,sr2,t1)∧(existsAt(sr2,t2) ∨existsAt(sr1,t2))
∧instanceOf(sr2,spatialRegion,t1)
→continuantPartOf(sr1,sr2,t2))
Material entities occupy three dimensional spatial regions [hpz-1]
∀m,t (instanceOf(m,materialEntity,t)
→ ∃t1,s(temporalPartOf(t1,t) ∧instanceOf(s,threeDimensionalSpatialRegion,t1)
∧occupiesSpatialRegion(m,s,t1)))
````

## PDF page 2

````text
If something is located in something else then the region of the first is part of the region of the second [uas-1]
∀a,b,t (locatedIn(a,b,t)
→ ∃r1,r2,t2(temporalPartOf(t2,t) ∧occupiesSpatialRegion(a,r1,t2)
∧occupiesSpatialRegion(b,r2,t2) ∧continuantPartOf(r1,r2,t2)))
Occurs in has domain process or process boundary and range material entity or site [tfw-1]
∀a,b (occursIn(a,b)
→(∃t(instanceOf(a,process,t) ∨instanceOf(a,processBoundary,t)))
∧(∃t(instanceOf(b,materialEntity,t)∨instanceOf(b,site,t))))
Occupies spatial region is time indexed and has domain: independent continuant but not spatial region and range: spatial
region [lzw-1]
∀a,b,t (occupiesSpatialRegion(a,b,t)
→instanceOf(a,independentContinuant,t) ∧ ¬instanceOf(a,spatialRegion,t)
∧instanceOf(b,spatialRegion,t) ∧instanceOf(t,temporalRegion,t))
If there are two independent continuants that are not spatial regions, and one is part of the other, then it is located in the
other [bao-1]
∀a,b,t (continuantPartOf(a,b,t)∧instanceOf(a,independentContinuant,t)
∧ ¬instanceOf(a,spatialRegion,t) ∧instanceOf(b,independentContinuant,t)
∧ ¬instanceOf(b,spatialRegion,t)
→locatedIn(a,b,t))
Spatial region is the union of zero dimensional spatial region, one dimensional spatial region, two dimensional spatial region,
and three dimensional spatial region [wnm-1]
∀i,t (instanceOf(i,spatialRegion,t)
→instanceOf(i,zeroDimensionalSpatialRegion,t)
∨instanceOf(i,oneDimensionalSpatialRegion,t)
∨instanceOf(i,twoDimensionalSpatialRegion,t)
∨instanceOf(i,threeDimensionalSpatialRegion,t))
No two material entities occupy the same space unless they coincide [scr-1]
∀m1,m2,s,t (instanceOf(m1,materialEntity,t)∧occupiesSpatialRegion(m1,s,t)
∧instanceOf(m2,materialEntity,t)∧occupiesSpatialRegion(m2,s,t)
→(continuantPartOf(m2,m1,t) ∧continuantPartOf(m1,m2,t)) ∨m1=m2)
Located in is time indexed and has domain: independent continuant but not spatial region and range: independent continuant
but not spatial region [bge-1]
∀a,b,t (locatedIn(a,b,t)
→instanceOf(a,independentContinuant,t) ∧ ¬instanceOf(a,spatialRegion,t)
∧instanceOf(b,independentContinuant,t) ∧ ¬instanceOf(b,spatialRegion,t)
∧instanceOf(t,temporalRegion,t))
At all times t, there’s a part of t when c occupies spatial region r iff every part of c occupies a part of r, and there isn’t a smaller
part of r that c occupies. [grv-1]
∀c,r,t (instanceOf(c,independentContinuant,t)∧ ¬instanceOf(c,spatialRegion,t)
∧instanceOf(r,spatialRegion,t)
→ ∃t2(temporalPartOf(t2,t)
∧(occupiesSpatialRegion(c,r,t2)
↔(∀cp(continuantPartOf(cp,c,t2)
→ ∀rp(occupiesSpatialRegion(cp,rp,t2)
→continuantPartOf(rp,r,t2))))
∧ ¬(∃r′(r′̸=r ∧continuantPartOf(r′,r,t2)
∧occupiesSpatialRegion(c,r′,t2))))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

