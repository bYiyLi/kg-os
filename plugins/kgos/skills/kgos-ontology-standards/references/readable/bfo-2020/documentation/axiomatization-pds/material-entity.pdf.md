# Full PDF text extraction

Original: [documentation/axiomatization-pds/material-entity.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/material-entity.pdf>)

Source SHA-256: `abb3c360b959e6ce4edcc238f165ba2156cea9808790783934b8d8e27989369c`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Material Entity Axioms
Member part of and has member part are inverse relations [jrm-1]
∀t,a,b(memberPartOf(a,b,t) ↔hasMemberPart(b,a,t))
Member part of is dissective on third argument, a temporal region [yip-1]
∀p,q,r,s(memberPartOf(p,q,r) ∧temporalPartOf(s,r) →memberPartOf(p,q,s))
An object aggregate always has at least one member [uhs-1]
∀ag,t (instanceOf(ag,objectAggregate,t)
→ ∃o1(instanceOf(o1,object,t) ∧memberPartOf(o1,ag,t)))
Member part of is time indexed and has domain: object and range: object aggregate [dvq-1]
∀a,b,t (memberPartOf(a,b,t)
→instanceOf(a,object,t) ∧instanceOf(b,objectAggregate,t)
∧instanceOf(t,temporalRegion,t))
A fiat object part =def a proper part of an object [yir-1]
∀f,t (instanceOf(f,fiatObjectPart,t)
↔ ∃o(instanceOf(o,object,t) ∧properContinuantPartOf(f,o,t)
∧ ¬instanceOf(f,immaterialEntity,t)))
I is an immaterial entity = Def. i is an independent continuant that has no material entities as parts. [udu-1]
∀i,t (instanceOf(i,immaterialEntity,t)
↔instanceOf(i,independentContinuant,t)
∧ ¬(∃m(instanceOf(m,materialEntity,t)∧continuantPartOf(m,i,t))))
Any continuant that doesn’t s depend or g depend on something is an independant continuant [ilw-1]
∀c1 (∃t instanceOf(c1,independentContinuant,t)
↔ ∃t instanceOf(c1,continuant,t)
∧ ¬(∃c2,t(specificallyDependsOn(c1,c2) ∨genericallyDependsOn(c1,c2,t))))
An object aggregate has more than one member at at least one time [ibd-1]
∀ag (∃t instanceOf(ag,objectAggregate,t)
→ ∃o1,o2,t(o1 ̸=o2 ∧instanceOf(o1,object,t) ∧memberPartOf(o1,ag,t)
∧instanceOf(o2,object,t) ∧memberPartOf(o2,ag,t)))
All parts of an aggregate overlap some member [fsy-1]
∀t,b,x (properContinuantPartOf(x,b,t)∧instanceOf(b,objectAggregate,t)
→ ∃o(memberPartOf(o,b,t)
∧(∃z(continuantPartOf(z,x,t) ∧continuantPartOf(z,o,t)))))
If a material entity has a proper part, then at least one of its proper parts is not an immaterial entity [adm-1]
∀m,t (instanceOf(m,materialEntity,t)∧(∃mp(continuantPartOf(mp,m,t) ∧mp̸=m))
→ ∃mp(mp ̸=m ∧continuantPartOf(mp,m,t) ∧ ¬instanceOf(mp,immaterialEntity,t)))
An object aggregate has member parts only disjoint objects [evk-1]
∀b,c,t (memberPartOf(b,c,t)
↔instanceOf(b,object,t) ∧instanceOf(c,objectAggregate,t)
∧properContinuantPartOf(b,c,t)
∧(∀d(memberPartOf(d,c,t)
→b=d ∨ ¬(∃z(continuantPartOf(z,b,t) ∧continuantPartOf(z,d,t))))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

