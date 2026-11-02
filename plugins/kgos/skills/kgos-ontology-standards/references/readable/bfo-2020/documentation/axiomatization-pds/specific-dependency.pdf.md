# Full PDF text extraction

Original: [documentation/axiomatization-pds/specific-dependency.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/specific-dependency.pdf>)

Source SHA-256: `0e791224a5a9e04d11ced82620e7f788b8fd331b2419b9c9b939ca2458198247`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Specific Dependency Axioms
Inheres in and bearer of are inverse relations [dzz-1]
∀a,b(inheresIn(a,b) ↔bearerOf(b,a))
Realizes and has realization are inverse relations [pvk-1]
∀a,b(realizes(a,b) ↔hasRealization(b,a))
Has material basis and material basis of are inverse relations [tla-1]
∀t,a,b(hasMaterialBasis(a,b,t) ↔materialBasisOf(b,a,t))
Specifically depends on and specifically depended on by are inverse relations [yct-1]
∀a,b(specificallyDependsOn(a,b) ↔specificallyDependedOnBy(b,a))
When a realizable entity is realized, the bearer of the thing realized participates in the realization process [grx-1]
∀r,p,b(realizes(p,r) ∧inheresIn(r,b) → ∃t participatesIn(b,p,t))
Has material basis is dissective on third argument, a temporal region [hnl-1]
∀p,q,r,s(hasMaterialBasis(p,q,r) ∧temporalPartOf(s,r) →hasMaterialBasis(p,q,s))
Realizes has domain process and range realizable entity [oot-1]
∀a,b(realizes(a,b) → ∃t instanceOf(a,process,t)∧ ∃t instanceOf(b,realizableEntity,t))
No role changes type during its existence [bks-2]
∀o,u,t1,t2 (instanceOf(o,role,t1)∧instanceOf(o,u,t2)
→instanceOf(o,role,t2)∧instanceOf(o,u,t1))
Specifically depends on is transitive [myu-1]
∀a,b,c (specificallyDependsOn(a,b)∧specificallyDependsOn(b,c) ∧a̸=c
→specificallyDependsOn(a,c))
If s s depends on c then s and c never share common parts (s,c continuants) [nfe-1]
∀s,c (specificallyDependsOn(s,c)
→ ¬(∃w,t(continuantPartOf(w,s,t)∧continuantPartOf(w,c,t))))
A realizable entity exists at least at the beginning of the realization process [vhg-1]
∀r,p (realizes(p,r)
→ ∃proct,first(occupiesTemporalRegion(p,proct)∧hasFirstInstant(proct,first)
∧existsAt(r,first)))
Has material basis is time indexed and has domain: disposition and range: material entity [cfs-1]
∀a,b,t (hasMaterialBasis(a,b,t)
→instanceOf(a,disposition,t) ∧instanceOf(b,materialEntity,t)
∧instanceOf(t,temporalRegion,t))
If s s depends on c then there’s at least one time when they both exist and whenever s exists, c must also exist [iyu-1]
∀s,c (specificallyDependsOn(s,c)
→(∃t(existsAt(s,t) ∧existsAt(c,t))) ∧(∀t(existsAt(s,t) →existsAt(c,t))))
B is a relational quality =Def. b is a quality and there exists c and d such that b and c are not identical, & b specifically depends
on on c & b specifically depends on d [dbp-4]
∀b (∃t instanceOf(b,relationalQuality,t)
↔(∃c,d(c ̸=d ∧specificallyDependsOn(b,c) ∧specificallyDependsOn(b,d)))
∧ ∃t instanceOf(b,quality,t))
A inheres in b =Def. a is a specifically dependent continuant and b is an independent continuant that is not a spatial region
and a s depends on b. [tht-1]
∀a,b (inheresIn(a,b)
↔specificallyDependsOn(a,b)
∧(∃t(instanceOf(a,specificallyDependentContinuant,t)
∧instanceOf(b,independentContinuant,t) ∧ ¬instanceOf(b,spatialRegion,t))))
````

## PDF page 2

````text
Definition of specifically dependent continuant. [akq-1]
∀s (∃t instanceOf(s,specificallyDependentContinuant,t)
↔ ∃c,t(instanceOf(s,continuant,t) ∧instanceOf(c,independentContinuant,t)
∧ ¬instanceOf(c,spatialRegion,t) ∧specificallyDependsOn(s,c)))
The material basis of a disposition is part of the bearer of the disposition [uxo-1]
∀m,d,b (∃t instanceOf(m,materialEntity,t)∧ ∃t instanceOf(d,disposition,t)
∧ ∃t instanceOf(b,materialEntity,t)∧inheresIn(d,b)
→ ∀t(hasMaterialBasis(d,m,t) →continuantPartOf(m,b,t)))
Specifically depends on has domain specifically dependent continuant and range specifically dependent continuant or
independent continuant but not spatial region [kkl-1]
∀a,b (specificallyDependsOn(a,b)
→ ∃t instanceOf(a,specificallyDependentContinuant,t)
∧(∃t(instanceOf(b,specificallyDependentContinuant,t)
∨(instanceOf(b,independentContinuant,t)
∧ ¬instanceOf(b,spatialRegion,t)))))
At every time a specific dependent s participates in a process p there’s a part of that time, during which there’s an independent
continuant that s s depends on, and that participates in p at that time [cgn-1]
∀sdc,p,t (instanceOf(sdc,specificallyDependentContinuant,t)∧participatesIn(sdc,p,t)
→ ∃tp,ic(instanceOf(tp,temporalRegion,tp) ∧temporalPartOf(tp,t)
∧instanceOf(ic,independentContinuant,tp)
∧ ¬instanceOf(ic,spatialRegion,tp) ∧specificallyDependsOn(sdc,ic)
∧participatesIn(ic,p,tp)))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

