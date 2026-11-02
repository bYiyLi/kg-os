# Full PDF text extraction

Original: [documentation/axiomatization-pds/generic-dependence.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/generic-dependence.pdf>)

Source SHA-256: `27a00d2f4af78b4afc964f478ec6cad69d108fbd8ff1de592bba08145ed0c0ca`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Generic Dependence Axioms
Concretizes and is concretized by are inverse relations [zba-1]
∀t,a,b(concretizes(a,b,t) ↔isConcretizedBy(b,a,t))
Generically depends on and is carrier of are inverse relations [mvp-1]
∀t,a,b(genericallyDependsOn(a,b,t) ↔isCarrierOf(b,a,t))
Concretizes is dissective on third argument, a temporal region [nyz-1]
∀p,q,r,s(concretizes(p,q,r) ∧temporalPartOf(s,r) →concretizes(p,q,s))
Along with qaf 1 this axiom has the consequence that a generically dependent continuant must always be concretized by
something [ibk-1]
∀t,g (instanceOf(g,genericallyDependentContinuant,t)
→ ∃s,tp(temporalPartOf(tp,t) ∧concretizes(s,g,tp)))
A g dependent continuant b g depends on an independent continuant c at t means: there inheres in c at t an s dependent
continuant which concretizes b at t [otx-1]
∀g,c,t (genericallyDependsOn(g,c,t)
→ ∃s,tp(temporalPartOf(tp,t) ∧inheresIn(s,c)∧concretizes(s,g,tp)))
Concretizes is time indexed and has domain: specifically dependent continuant or process and range: generically dependent
continuant [rog-1]
∀a,b,t (concretizes(a,b,t)
→(instanceOf(a,specificallyDependentContinuant,t) ∨instanceOf(a,process,t))
∧instanceOf(b,genericallyDependentContinuant,t)
∧instanceOf(t,temporalRegion,t))
Generically depends on is time indexed and has domain: generically dependent continuant and range: independent continu-
ant but not spatial region [ekp-1]
∀a,b,t (genericallyDependsOn(a,b,t)
→instanceOf(a,genericallyDependentContinuant,t)
∧instanceOf(b,independentContinuant,t) ∧ ¬instanceOf(b,spatialRegion,t)
∧instanceOf(t,temporalRegion,t))
If a specifically dependent continuant concretizes a gdc then the gdc generically depends on the bearer of the sdc [cik-1]
∀g,b,sdc (∃t instanceOf(g,genericallyDependentContinuant,t)
∧ ∃t instanceOf(sdc,specificallyDependentContinuant,t)
∧ ∃t instanceOf(b,independentContinuant,t)
→ ∀t(concretizes(sdc,g,t) ∧inheresIn(sdc,b) →genericallyDependsOn(g,b,t)))
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

