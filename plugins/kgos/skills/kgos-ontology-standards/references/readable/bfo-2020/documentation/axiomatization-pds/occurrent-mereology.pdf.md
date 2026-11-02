# Full PDF text extraction

Original: [documentation/axiomatization-pds/occurrent-mereology.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/occurrent-mereology.pdf>)

Source SHA-256: `2cbf681777920a20b539540682b540e85bb044adcadb0ad41a80b286e3c249dd`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Occurrent Mereology Axioms
Occurrent part of and has occurrent part are inverse relations [yvi-1]
∀a,b(occurrentPartOf(a,b) ↔hasOccurrentPart(b,a))
Proper occurrent part of and has proper occurrent part are inverse relations [wim-1]
∀a,b(properOccurrentPartOf(a,b) ↔hasProperOccurrentPart(b,a))
All occurrents are occurrent part of themselves [hbj-1]
∀a( ∃t instanceOf(a,occurrent,t) →occurrentPartOf(a,a))
Occurrent part of is antisymmetric [xlu-1]
∀a,b(occurrentPartOf(a,b) ∧occurrentPartOf(b,a) →a=b)
A proper occurrent part of b means a is an occurrent part of b and a is not the same as b [okr-1]
∀x,y(properOccurrentPartOf(x,y) ↔occurrentPartOf(x,y)∧x̸=y)
Occurrent part of is transitive [kad-1]
∀a,b,c(occurrentPartOf(a,b) ∧occurrentPartOf(b,c) →occurrentPartOf(a,c))
If one occurrent is part of another, then the temporal region on which the former projects is a part of the temporal region on
which the latter projects [ybr-1]
∀o1,o2(occurrentPartOf(o1,o2) → ∀t(existsAt(o1,t) →existsAt(o2,t)))
If a occurrent part of b then if a is an instance of temporal region then b is an instance of temporal region, and vice versa
[gjl-2]
∀p,q (occurrentPartOf(p,q)
→(instanceOf(p,temporalRegion,p) ↔instanceOf(q,temporalRegion,q)))
Occurrent part of has domain occurrent and range occurrent [zmr-1]
∀a,b(occurrentPartOf(a,b) → ∃t instanceOf(a,occurrent,t)∧ ∃t instanceOf(b,occurrent,t))
If a occurrent part of b then if a is an instance of process then b is an instance of process [csk-1]
∀p,q(occurrentPartOf(p,q) →(∃t instanceOf(p,process,t) → ∃t instanceOf(q,process,t)))
Proper temporal part of has domain occurrent and range occurrent [ees-1]
∀a,b (properTemporalPartOf(a,b)
→ ∃t instanceOf(a,occurrent,t)∧ ∃t instanceOf(b,occurrent,t))
Proper occurrent part of has domain occurrent and range occurrent [yhc-1]
∀a,b (properOccurrentPartOf(a,b)
→ ∃t instanceOf(a,occurrent,t)∧ ∃t instanceOf(b,occurrent,t))
Every process has a process boundary [aff-1]
∀p (∃t instanceOf(p,process,t)
→ ∃pb,t(instanceOf(pb,processBoundary,t)∧occurrentPartOf(pb,p)))
Definition of temporal part for temporal regions [cmy-2]
∀b,c (instanceOf(b,temporalRegion,b)∧instanceOf(c,temporalRegion,c)
→(temporalPartOf(b,c) ↔occurrentPartOf(b,c)))
If a has occurrent part b then if a is an instance of process boundary then b is an instance of process boundary [hdk-1]
∀p,q (hasOccurrentPart(p,q)
→(∃t instanceOf(p,processBoundary,t)→ ∃t instanceOf(q,processBoundary,t)))
If a occurrent part of b then if a is an instance of spatiotemporal region then b is an instance of spatiotemporal region, and
vice versa [myl-1]
∀p,q (occurrentPartOf(p,q)
→(∃t instanceOf(p,spatiotemporalRegion,t)
↔ ∃t instanceOf(q,spatiotemporalRegion,t)))
````

## PDF page 2

````text
If a has occurrent part b then if a is an instance of process then b is an instance of process or process boundary [ccz-1]
∀p,q (hasOccurrentPart(p,q)
→(∃t instanceOf(p,process,t)
→ ∃t(instanceOf(q,process,t) ∨instanceOf(q,processBoundary,t))))
If a occurrent part of b then if a is an instance of process boundary then b is an instance of process or process boundary
[ptm-1]
∀p,q (occurrentPartOf(p,q)
→(∃t instanceOf(p,processBoundary,t)
→ ∃t(instanceOf(q,process,t) ∨instanceOf(q,processBoundary,t))))
A process boundary is any temporal part of a process that has no proper temporal parts. [esh-2]
∀pb,t (instanceOf(pb,processBoundary,t)
↔(∃p(temporalPartOf(pb,p) ∧ ∃t instanceOf(p,process,t)))
∧occupiesTemporalRegion(pb,t)∧instanceOf(t,temporalInstant,t))
Occurrent part of has a unique product [hpc-1]
∀x,y (∃t(instanceOf(x,occurrent,t) ∧instanceOf(y,occurrent,t)
∧instanceOf(t,temporalRegion,t))
→(∃w(occurrentPartOf(w,x)∧occurrentPartOf(w,y))
→ ∃z( ∀w(occurrentPartOf(w,z) ↔occurrentPartOf(w,x)∧occurrentPartOf(w,y)))))
At least one process boundary needs to be at the first or last instant of the process it bounds [qsp-1]
∀p (∃tp instanceOf(p,process,tp)
→ ∃pb,tb,tp(occupiesTemporalRegion(p,tp) ∧occurrentPartOf(pb,p)
∧occupiesTemporalRegion(pb,tb)∧instanceOf(pb,processBoundary,tb)
∧(∃ltp,ftp(hasFirstInstant(tp,ftp) ∧hasLastInstant(tp,ltp)
∧(tb=ftp ∨tb=ltp)))))
B temporal part c (both spatiotemporal regions) iff b temporal projection is part of c’s temporal projection, and for all parts
of b’s existence, if it spatially projects onto s at that time, then so does c [eom-2]
∀b,c (∃t instanceOf(b,spatiotemporalRegion,t)∧ ∃t instanceOf(c,spatiotemporalRegion,t)
→(temporalPartOf(b,c)
↔ ∃tb,tc(temporallyProjectsOnto(b,tb) ∧temporallyProjectsOnto(c,tc)
∧occurrentPartOf(tb,tc)
∧(∀tp(occurrentPartOf(tp,tb) ∧ ∃s spatiallyProjectsOnto(b,s,tp)
→ ∃s(spatiallyProjectsOnto(b,s,tp)
∧spatiallyProjectsOnto(c,s,tp)))))))
Two spatiotemporal regions are parts when they are temporal parts and their spatial projects are always parts [txf-1]
∀st1,st2 (∃t instanceOf(st1,spatiotemporalRegion,t)
∧ ∃t instanceOf(st2,spatiotemporalRegion,t)
→(occurrentPartOf(st1,st2)
↔(∃t1,t2(temporallyProjectsOnto(st1,t1) ∧temporallyProjectsOnto(st2,t2)
∧temporalPartOf(t1,t2)))
∧(∀t(existsAt(st1,t)
→ ∃s1,s2,tp(temporalPartOf(tp,t) ∧spatiallyProjectsOnto(st1,s1,tp)
∧spatiallyProjectsOnto(st2,s2,tp)
∧continuantPartOf(s1,s2,tp))))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

