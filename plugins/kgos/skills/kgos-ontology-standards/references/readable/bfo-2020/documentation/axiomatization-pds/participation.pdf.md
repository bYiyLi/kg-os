# Full PDF text extraction

Original: [documentation/axiomatization-pds/participation.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/participation.pdf>)

Source SHA-256: `a21935475e4fe08dd2ff7282cd7b15eb4aae4844b09810e494fbbd04128f33d8`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Participation Axioms
Participates in and has participant are inverse relations [xjr-1]
∀t,a,b(participatesIn(a,b,t) ↔hasParticipant(b,a,t))
At every time a process exists it has a participant [trl-1]
∀p,t(instanceOf(p,process,t) → ∃c participatesIn(c,p,t))
Participates in is dissective on third argument, a temporal region [yjm-1]
∀p,q,r,s(participatesIn(p,q,r) ∧temporalPartOf(s,r) →participatesIn(p,q,s))
If c participates in p at t and p occupies temporal region r then t is part of r [kxe-1]
∀c,p,r,t(occupiesTemporalRegion(p,r)∧participatesIn(c,p,t) →temporalPartOf(t,r))
Participates in is time indexed and has domain: independent continuant or specifically dependent continuant or generically
dependent continuant but not spatial region and range: process [ild-2]
∀a,b,t (participatesIn(a,b,t)
→(instanceOf(a,independentContinuant,t)
∨instanceOf(a,specificallyDependentContinuant,t)
∨instanceOf(a,genericallyDependentContinuant,t))
∧ ¬instanceOf(a,spatialRegion,t) ∧instanceOf(b,process,t)
∧instanceOf(t,temporalRegion,t))
At every time a specific dependent s participates in a process p there’s a part of that time, during which there’s an independent
continuant that s s depends on, and that participates in p at that time [cgn-1]
∀sdc,p,t (instanceOf(sdc,specificallyDependentContinuant,t)∧participatesIn(sdc,p,t)
→ ∃tp,ic(instanceOf(tp,temporalRegion,tp) ∧temporalPartOf(tp,t)
∧instanceOf(ic,independentContinuant,tp)
∧ ¬instanceOf(ic,spatialRegion,tp) ∧specificallyDependsOn(sdc,ic)
∧participatesIn(ic,p,tp)))
If a generically dependent continuant participates in a process p then, if it is concretized as a process, that process is part of
p, and if concretized as an sdc then the bearer of that sdc participates in the process [fmm-1]
∀gdc,p,t (instanceOf(gdc,genericallyDependentContinuant,t)∧participatesIn(gdc,p,t)
→ ∃tp,b(temporalPartOf(tp,t) ∧concretizes(b,gdc,tp)
∧((instanceOf(b,specificallyDependentContinuant,tp)
∧(∃ic(specificallyDependsOn(b,ic) ∧participatesIn(ic,p,tp))))
∨(occurrentPartOf(b,p)∧existsAt(b,tp)))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

