# Full PDF text extraction

Original: [documentation/axiomatization-pds/spatiotemporal.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/spatiotemporal.pdf>)

Source SHA-256: `a760600461f6a2fad2b99b44cbed8045e406ddbf620185dda819140ba0b3d69c`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Spatiotemporal Axioms
If something occupies a temporal region, then it exists at that region [bmc-1]
∀a,t(occupiesTemporalRegion(a,t) →existsAt(a,t))
Exists at is a lower bound on first argument [jqz-1]
∀p,q,r(existsAt(p,q) ∧temporalPartOf(p,r) →existsAt(r,q))
Occupies temporal region is functional on second argument [wzd-1]
∀p,q,r(occupiesTemporalRegion(p,q) ∧occupiesTemporalRegion(p,r) →q=r)
Temporally projects onto is functional on second argument [jtq-1]
∀p,q,r(temporallyProjectsOnto(p,q) ∧temporallyProjectsOnto(p,r) →q=r)
Spatially projects onto is functional on second argument [fdb-1]
∀p,q,r,s(spatiallyProjectsOnto(p,q,r) ∧spatiallyProjectsOnto(p,s,r) →q=s)
Occupies spatiotemporal region is functional on second argument [uqt-1]
∀p,q,r(occupiesSpatiotemporalRegion(p,q) ∧occupiesSpatiotemporalRegion(p,r) →q=r)
If a process occurs in c then it occurs in any place that c is located in at least as long as p exists [yex-2]
∀p,c1,c2(occursIn(p,c1) ∧(∀t(existsAt(p,t) →locatedIn(c1,c2,t))) →occursIn(p,c2))
If a occupies spatial region b then if a is an instance of site then b is an instance of three dimensional spatial region [uqb-1]
∀p,q,t (occupiesSpatialRegion(p,q,t)∧instanceOf(p,site,t)
→instanceOf(q,threeDimensionalSpatialRegion,t))
The temporal region during which a process occurs is the same as that which the spatiotemporal region the process occupies
temporally projects onto [cur-1]
∀p,t (occupiesTemporalRegion(p,t)
↔ ∃st(occupiesSpatiotemporalRegion(p,st) ∧temporallyProjectsOnto(st,t)))
Temporally projects onto has domain spatiotemporal region and range temporal region [cvr-2]
∀a,b (temporallyProjectsOnto(a,b)
→ ∃t instanceOf(a,spatiotemporalRegion,t)∧instanceOf(b,temporalRegion,b))
If a occupies spatial region b then if a is an instance of material entity then b is an instance of three dimensional spatial region
[ocw-1]
∀p,q,t (occupiesSpatialRegion(p,q,t)∧instanceOf(p,materialEntity,t)
→instanceOf(q,threeDimensionalSpatialRegion,t))
A process boundary occupies a spatiotemporal instant [atz-1]
∀pb,tr (∃t instanceOf(pb,processBoundary,t)∧occupiesTemporalRegion(pb,tr)
→instanceOf(tr,temporalInstant,tr))
For every process or process boundary there’s a corresponding spatiotemporal region that it occupies [qyy-1]
∀p (∃t(instanceOf(p,process,t) ∨instanceOf(p,processBoundary,t))
→ ∃s occupiesSpatiotemporalRegion(p,s))
Spatiotemporal regions always project on to some temporal region [scq-1]
∀st (∃t instanceOf(st,spatiotemporalRegion,t)
→ ∃t(instanceOf(t,temporalRegion,t) ∧temporallyProjectsOnto(st,t)))
Every temporal region is a projection from a spatiotemporal region [xco-2]
∀tr (instanceOf(tr,temporalRegion,tr)
→ ∃st( ∃t instanceOf(st,spatiotemporalRegion,t)∧temporallyProjectsOnto(st,tr)))
Spatially projects onto is time indexed and has domain: spatiotemporal region and range: spatial region [blj-1]
∀a,b,t (spatiallyProjectsOnto(a,b,t)
→instanceOf(a,spatiotemporalRegion,t) ∧instanceOf(b,spatialRegion,t)
∧instanceOf(t,temporalRegion,t))
Occupies temporal region has domain process or process boundary and range temporal region [lyx-2]
````

## PDF page 2

````text
∀a,b (occupiesTemporalRegion(a,b)
→(∃t(instanceOf(a,process,t) ∨instanceOf(a,processBoundary,t)))
∧instanceOf(b,temporalRegion,b))
Spatiotemporal regions always project on to some spatial region at any time [geq-1]
∀st,t (instanceOf(st,spatiotemporalRegion,t)
→ ∃s,tp(temporalPartOf(tp,t) ∧instanceOf(s,spatialRegion,tp)
∧spatiallyProjectsOnto(st,s,tp)))
Every spatial region is a projection from a spatiotemporal region [mdb-1]
∀sr (∃t instanceOf(sr,spatialRegion,t)
→ ∃st( ∃t instanceOf(st,spatiotemporalRegion,t)∧ ∃t spatiallyProjectsOnto(st,sr,t)))
Occupies spatiotemporal region has domain process or process boundary and range spatiotemporal region [vvo-1]
∀a,b (occupiesSpatiotemporalRegion(a,b)
→(∃t(instanceOf(a,process,t) ∨instanceOf(a,processBoundary,t)))
∧ ∃t instanceOf(b,spatiotemporalRegion,t))
A process occupies at least a temporal interval [fzy-1]
∀proc,tr (∃t instanceOf(proc,process,t)∧occupiesTemporalRegion(proc,tr)
→ ∃interval(instanceOf(interval,temporalInterval,interval)
∧temporalPartOf(interval,tr)))
If one occurrent is part of another, then the temporal region of the first is part of the temporal region of the second [jiv-1]
∀o1,o2,t1,t2 ((∃t(instanceOf(o1,process,t) ∨instanceOf(o1,processBoundary,t)))
∧ ∃t instanceOf(o2,process,t)∧occurrentPartOf(o1,o2)
∧occupiesTemporalRegion(o1,t1)∧occupiesTemporalRegion(o2,t2)
→temporalPartOf(t1,t2))
If one process or process boundary is part of another, then their corresponding temporal regions are also in a parthood
relation [iqe-1]
∀o1,o2,st1,st2 ((∃t(instanceOf(o1,process,t) ∨instanceOf(o1,processBoundary,t)))
∧(∃t(instanceOf(o2,process,t) ∨instanceOf(o2,processBoundary,t)))
∧occurrentPartOf(o1,o2)∧occupiesSpatiotemporalRegion(o1,st1)
∧occupiesSpatiotemporalRegion(o2,st2)
→occurrentPartOf(st1,st2))
If a process or process boundary is part of another, their spatiotemporal regions are part too [kqv-2]
∀p1,p2 ((∃t instanceOf(p1,process,t)∨ ∃t instanceOf(p1,processBoundary,t))
∧(∃t instanceOf(p2,process,t)∨ ∃t instanceOf(p2,processBoundary,t))
→(occurrentPartOf(p1,p2)
→ ∃st1,st2(occupiesSpatiotemporalRegion(p1,st1)
∧occupiesSpatiotemporalRegion(p2,st2)
∧occurrentPartOf(st1,st2))))
Process or process boundary p occupies temporal region t iff every part of p temporally occupies a part of t, and there isn’t a
smaller part of t that p occupies. [tao-1]
∀o,t ((∃t1 instanceOf(o,process,t1)∨ ∃t1 instanceOf(o,processBoundary,t1))
∧instanceOf(t,temporalRegion,t)
→(occupiesTemporalRegion(o,t)
↔(∀op(occurrentPartOf(op,o)
→ ∀tp(occupiesTemporalRegion(op,tp) →occurrentPartOf(tp,t))))
∧ ¬(∃t′(t′̸=t ∧occurrentPartOf(t′,t)
∧occupiesTemporalRegion(o,t′)))))
Process p (or boundary) occupies spatiotemporal region st iff every part of p occupies spatiotemporal region a part of st, and
there isn’t a smaller part of st that p occupies. [dki-1]
∀o,st ((∃t1 instanceOf(o,process,t1)∨ ∃t1 instanceOf(o,processBoundary,t1))
∧ ∃t1 instanceOf(st,spatiotemporalRegion,t1)
→(occupiesSpatiotemporalRegion(o,st)
↔(∀op(occurrentPartOf(op,o)
→ ∀stp(occupiesSpatiotemporalRegion(op,stp)
→occurrentPartOf(stp,st))))
∧ ¬(∃st′(st′̸=st ∧occurrentPartOf(st′,st)
∧occupiesSpatiotemporalRegion(o,st′)))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

