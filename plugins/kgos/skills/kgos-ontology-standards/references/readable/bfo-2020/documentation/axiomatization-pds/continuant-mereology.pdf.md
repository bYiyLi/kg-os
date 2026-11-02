# Full PDF text extraction

Original: [documentation/axiomatization-pds/continuant-mereology.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/continuant-mereology.pdf>)

Source SHA-256: `3de54f5074b80faba1ba6fe046a596121d9fdf4fd89ec1828e2700db549c6575`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Continuant Mereology Axioms
Continuant part of and has continuant part are inverse relations [eld-1]
∀t,a,b(continuantPartOf(a,b,t) ↔hasContinuantPart(b,a,t))
All independent continuants are continuant part of themselves [mcd-1]
∀a,t(instanceOf(a,independentContinuant,t) →continuantPartOf(a,a,t))
Proper continuant part of and has proper continuant part are inverse relations [hpm-1]
∀t,a,b(properContinuantPartOf(a,b,t) ↔hasProperContinuantPart(b,a,t))
Exists at is dissective on first argument when it is a continuant [uns-1]
∀p,q,r(existsAt(p,q) ∧continuantPartOf(r,p,q) →existsAt(r,q))
A fiat point has no parts other than itself [jgo-1]
∀fp,t,p(instanceOf(fp,fiatPoint,t) ∧continuantPartOf(p,fp,t) →p=fp)
Continuant part of is dissective on third argument, a temporal region [mqp-1]
∀p,q,r,s(continuantPartOf(p,q,r) ∧temporalPartOf(s,r) →continuantPartOf(p,q,s))
If a has continuant part b then if a is an instance of fiat point then b is an instance of fiat point [jqd-1]
∀p,q,t(hasContinuantPart(p,q,t) ∧instanceOf(p,fiatPoint,t) →instanceOf(q,fiatPoint,t))
If a continuant part of b then if a is an instance of spatial region then b is an instance of spatial region, and vice versa [kbr-2]
∀p,q,t (continuantPartOf(p,q,t)
→(instanceOf(p,spatialRegion,t) ↔instanceOf(q,spatialRegion,t)))
X proper continuant part of y means x is a continuant part of y but y is not continuant part of x [sls-1]
∀x,y,t (properContinuantPartOf(x,y,t)
↔continuantPartOf(x,y,t)∧ ¬continuantPartOf(y,x,t))
Proper continuant part of is dissective on third argument, a temporal region [vjv-1]
∀p,q,r,s (properContinuantPartOf(p,q,r)∧temporalPartOf(s,r)
→properContinuantPartOf(p,q,s))
If a continuant part of b then if a is an instance of material entity then b is an instance of material entity [dok-1]
∀p,q,t (continuantPartOf(p,q,t)∧instanceOf(p,materialEntity,t)
→instanceOf(q,materialEntity,t))
If a has continuant part b then if a is an instance of fiat surface then b is an instance of continuant fiat boundary [ysp-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,fiatSurface,t)
→instanceOf(q,continuantFiatBoundary,t))
If a continuant part of b then if a is an instance of independent continuant then b is an instance of independent continuant,
and vice versa [cez-2]
∀p,q,t (continuantPartOf(p,q,t)
→(instanceOf(p,independentContinuant,t) ↔instanceOf(q,independentContinuant,t)))
If a has continuant part b then if a is an instance of three dimensional spatial region then b is an instance of spatial region
[fzg-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,threeDimensionalSpatialRegion,t)
→instanceOf(q,spatialRegion,t))
If a has continuant part b then if a is an instance of continuant fiat boundary then b is an instance of continuant fiat boundary
[ixo-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,continuantFiatBoundary,t)
→instanceOf(q,continuantFiatBoundary,t))
If a continuant part of b then if a is an instance of site then b is an instance of site or material entity [izr-1]
∀p,q,t (continuantPartOf(p,q,t)∧instanceOf(p,site,t)
→instanceOf(q,site,t) ∨instanceOf(q,materialEntity,t))
Continuant part of is transitive at a time [plp-1]
````

## PDF page 2

````text
∀a,b,c,t,t2 (continuantPartOf(a,b,t)∧continuantPartOf(b,c,t2) ∧temporalPartOf(t,t2)
→continuantPartOf(a,c,t))
Continuant part of is time indexed and has domain: continuant and range: continuant [bdd-1]
∀a,b,t (continuantPartOf(a,b,t)
→instanceOf(a,continuant,t) ∧instanceOf(b,continuant,t)
∧instanceOf(t,temporalRegion,t))
If a has continuant part b then if a is an instance of fiat line then b is an instance of fiat line or fiat point [cwp-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,fiatLine,t)
→instanceOf(q,fiatLine,t) ∨instanceOf(q,fiatPoint,t))
If a has continuant part b then if a is an instance of site then b is an instance of site or continuant fiat boundary [mjj-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,site,t)
→instanceOf(q,site,t) ∨instanceOf(q,continuantFiatBoundary,t))
Proper continuant part of is time indexed and has domain: continuant and range: continuant [kte-1]
∀a,b,t (properContinuantPartOf(a,b,t)
→instanceOf(a,continuant,t) ∧instanceOf(b,continuant,t)
∧instanceOf(t,temporalRegion,t))
If a has continuant part b then if a is an instance of zero dimensional spatial region then b is an instance of zero dimensional
spatial region [bfv-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,zeroDimensionalSpatialRegion,t)
→instanceOf(q,zeroDimensionalSpatialRegion,t))
Proper continuant part of is transitive at a time [xpg-1]
∀a,b,c,t,t2 (properContinuantPartOf(a,b,t)∧properContinuantPartOf(b,c,t2)
∧temporalPartOf(t,t2)
→properContinuantPartOf(a,c,t))
A fiat line occupies a one dimensional spatial region [kcq-2]
∀x,t (instanceOf(x,fiatLine,t)
→ ∃s,tp(temporalPartOf(tp,t) ∧occupiesSpatialRegion(x,s,tp)
∧instanceOf(s,oneDimensionalSpatialRegion,tp)))
A fiat point occupies a zero dimensional spatial region [alm-2]
∀x,t (instanceOf(x,fiatPoint,t)
→ ∃tp,s(temporalPartOf(tp,t) ∧occupiesSpatialRegion(x,s,tp)
∧instanceOf(s,zeroDimensionalSpatialRegion,tp)))
A fiat surface occupies a two dimensional spatial region [fpl-2]
∀x,t (instanceOf(x,fiatSurface,t)
→ ∃s,tp(temporalPartOf(tp,t) ∧occupiesSpatialRegion(x,s,tp)
∧instanceOf(s,twoDimensionalSpatialRegion,tp)))
If a has continuant part b then if a is an instance of material entity then b is an instance of site or continuant fiat boundary or
material entity [mic-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,materialEntity,t)
→instanceOf(q,site,t) ∨instanceOf(q,continuantFiatBoundary,t)
∨instanceOf(q,materialEntity,t))
If a has continuant part b then if a is an instance of one dimensional spatial region then b is an instance of one dimensional
spatial region or zero dimensional spatial region [wne-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,oneDimensionalSpatialRegion,t)
→instanceOf(q,oneDimensionalSpatialRegion,t)
∨instanceOf(q,zeroDimensionalSpatialRegion,t))
The dimensionality of the region of something occupying a one dimensional spatial region does not change [qfe-1]
∀m,s (∃t(occupiesSpatialRegion(m,s,t) ∧instanceOf(s,oneDimensionalSpatialRegion,t))
→ ∀t1,s1(occupiesSpatialRegion(m,s1,t1)
→instanceOf(s1,oneDimensionalSpatialRegion,t1)))
The dimensionality of the region of something occupying a two dimensional spatial region does not change [dor-1]
∀m,s (∃t(occupiesSpatialRegion(m,s,t) ∧instanceOf(s,twoDimensionalSpatialRegion,t))
→ ∀t1,s1(occupiesSpatialRegion(m,s1,t1)
→instanceOf(s1,twoDimensionalSpatialRegion,t1)))
The dimensionality of the region of something occupying a zero dimensional spatial region does not change [fok-1]
````

## PDF page 3

````text
∀m,s (∃t(occupiesSpatialRegion(m,s,t) ∧instanceOf(s,zeroDimensionalSpatialRegion,t))
→ ∀t1,s1(occupiesSpatialRegion(m,s1,t1)
→instanceOf(s1,zeroDimensionalSpatialRegion,t1)))
The dimensionality of the region of something occupying a three dimensional spatial region does not change [rlf-1]
∀m,s (∃t(occupiesSpatialRegion(m,s,t) ∧instanceOf(s,threeDimensionalSpatialRegion,t))
→ ∀t1,s1(occupiesSpatialRegion(m,s1,t1)
→instanceOf(s1,threeDimensionalSpatialRegion,t1)))
If a material entity has a proper part, then at least one of its proper parts is not an immaterial entity [adm-1]
∀m,t (instanceOf(m,materialEntity,t)∧(∃mp(continuantPartOf(mp,m,t) ∧mp̸=m))
→ ∃mp(mp ̸=m ∧continuantPartOf(mp,m,t) ∧ ¬instanceOf(mp,immaterialEntity,t)))
If a has continuant part b then if a is an instance of two dimensional spatial region then b is an instance of two dimensional
spatial region or one dimensional spatial region or zero dimensional spatial region [hbn-1]
∀p,q,t (hasContinuantPart(p,q,t)∧instanceOf(p,twoDimensionalSpatialRegion,t)
→instanceOf(q,twoDimensionalSpatialRegion,t)
∨instanceOf(q,oneDimensionalSpatialRegion,t)
∨instanceOf(q,zeroDimensionalSpatialRegion,t))
If at any time that two non object aggregates exist each is part of the other, then they are identical [tab-1]
∀a,b (∃t(instanceOf(a,independentContinuant,t) ∧ ¬instanceOf(a,objectAggregate,t)
∧instanceOf(b,independentContinuant,t) ∧ ¬instanceOf(b,objectAggregate,t)
∧continuantPartOf(a,b,t) ∧continuantPartOf(b,a,t))
→a=b)
If at all times that two object aggregates exist each is part of the other, then they are identical [glc-3]
∀a,b ((∃t(instanceOf(a,objectAggregate,t) ∧continuantPartOf(a,b,t)
∧continuantPartOf(b,a,t)))
∧(∀t(existsAt(a,t) ↔existsAt(b,t)))
∧(∀t(existsAt(a,t)
→instanceOf(a,objectAggregate,t)∧instanceOf(b,objectAggregate,t)
∧continuantPartOf(a,b,t) ∧continuantPartOf(b,a,t)))
→a=b)
The continuant parthood relation satisfies weak supplementation [fyf-2]
∀t,x,y (instanceOf(x,continuant,t)∧instanceOf(y,continuant,t)
∧instanceOf(t,temporalRegion,t)
→(properContinuantPartOf(x,y,t)
→ ∃z(instanceOf(z,continuant,t) ∧properContinuantPartOf(z,y,t)
∧ ¬(∃overlap(instanceOf(overlap,continuant,t)
∧continuantPartOf(overlap,x,t)
∧continuantPartOf(overlap,z,t))))))
Continuant part of has a unique product at a time [gzr-1]
∀x,y,t (instanceOf(x,continuant,t)∧instanceOf(y,continuant,t)
∧instanceOf(t,temporalRegion,t)
→(∃overlap(instanceOf(overlap,continuant,t) ∧continuantPartOf(overlap,x,t)
∧continuantPartOf(overlap,y,t))
→ ∃overlap(instanceOf(overlap,continuant,t)
∧(∀w(instanceOf(w,continuant,t)
→(continuantPartOf(w,overlap,t)
↔continuantPartOf(w,x,t)∧continuantPartOf(w,y,t)))))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

