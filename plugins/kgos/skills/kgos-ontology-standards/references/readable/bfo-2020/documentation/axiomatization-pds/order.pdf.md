# Full PDF text extraction

Original: [documentation/axiomatization-pds/order.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/order.pdf>)

Source SHA-256: `66f31b45780f4a6da460b92f689d3fdd1bdfedcf57c7d2f3a1486df7d7b7b5d8`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Order Axioms
Precedes and preceded by are inverse relations [tib-1]
∀a,b(precedes(a,b) ↔precededBy(b,a))
Precedes is antisymmetric [hew-1]
∀a,b(precedes(a,b) → ¬precedes(b,a))
Precedes is transitive [ctz-1]
∀a,b,c(precedes(a,b) ∧precedes(b,c) →precedes(a,c))
If the last instant of a temporal region precedes the first instant of another, then the first region precedes the second [qqv-1]
∀i1,i2,l1,f2 (hasLastInstant(i1,l1)∧hasFirstInstant(i2,f2) ∧precedes(l1,f2)
→precedes(i1,i2))
Precedes has domain occurrent and range occurrent [sen-1]
∀a,b(precedes(a,b) → ∃t instanceOf(a,occurrent,t)∧ ∃t instanceOf(b,occurrent,t))
If you are part of something that precedes something else, you also precede it [wix-1]
∀o1,o2,o1p,o2p (occurrentPartOf(o1p,o1)∧occurrentPartOf(o2p,o2)∧precedes(o1,o2)
→precedes(o1p,o2p))
First instant of a temporal region that is not an instant precedes last instant [rzv-1]
∀t,ft,lt (¬instanceOf(t,temporalInstant,t) ∧hasFirstInstant(t,ft) ∧hasLastInstant(t,lt)
→precedes(ft,lt))
If one temporal region precedes another then the first last time point precedes the second first time point [miz-1]
∀t1,t2,l1,f2 (precedes(t1,t2)∧hasLastInstant(t1,l1) ∧hasFirstInstant(t2,f2) ∧l1̸=f2
→precedes(l1,f2))
If one occurrent precedes another then they do not overlap temporally [aou-1]
∀p,q (precedes(p,q)∨precedes(q,p)
→ ¬(∃overlap(temporalPartOf(overlap,p) ∧temporalPartOf(overlap,q))))
Temporal instants are totally ordered [qnf-1]
∀t1,t2 (instanceOf(t1,temporalInstant,t1)∧instanceOf(t2,temporalInstant,t2)
→precedes(t1,t2)∨precedes(t2,t1)∨t1=t2)
If the last instant of a temporal region is the first instant of another, the first region precedes the second [suk-1]
∀i1,i2,l1,f2 (¬instanceOf(i1,temporalInstant,i1) ∧ ¬instanceOf(i2,temporalInstant,i2)
∧hasLastInstant(i1,l1) ∧hasFirstInstant(i2,f2) ∧l1=f2
→precedes(i1,i2))
A last instant is either part of an extended region or is preceded by it [acg-1]
∀l,i (instanceOf(l,temporalInstant,l)∧instanceOf(i,temporalRegion,i)
∧ ¬instanceOf(i,temporalInstant,i) ∧hasLastInstant(i,l)
→(¬temporalPartOf(l,i) ↔precedes(i,l)))
A first instant is either part of an extended region or precedes it [qga-1]
∀f,i (instanceOf(f,temporalInstant,f)∧instanceOf(i,temporalRegion,i)
∧ ¬instanceOf(i,temporalInstant,i) ∧hasFirstInstant(i,f)
→(¬temporalPartOf(f,i) ↔precedes(f,i)))
If two temporal intervals do not overlap then one of them precedes the other [owb-1]
∀t1,t2 (instanceOf(t1,temporalInterval,t1)∧instanceOf(t2,temporalInterval,t2)
∧ ¬(∃part(temporalPartOf(part,t1) ∧temporalPartOf(part,t2)))
→precedes(t1,t2)∨precedes(t2,t1))
If you temporally occupy part of something that precedes something else, you also precede it [wff-1]
∀o1,o2 (∃t1,t2((occupiesTemporalRegion(o1,t1) ∨temporallyProjectsOnto(o1,t1)∨t1=o1)
∧(occupiesTemporalRegion(o2,t2)∨temporallyProjectsOnto(o2,t2)∨t2=o2)
∧precedes(t1,t2))
↔precedes(o1,o2))
If two processes that occupy temporal intervals do not overlap, one of them precedes the other [duz-1]
````

## PDF page 2

````text
∀o1,o2,t1,t2 (occupiesTemporalRegion(o1,t1)∧occupiesTemporalRegion(o2,t2)
∧instanceOf(t1,temporalInterval,t1) ∧instanceOf(t2,temporalInterval,t2)
∧ ¬(∃part(temporalPartOf(part,t1) ∧temporalPartOf(part,t2)))
→precedes(o1,o2)∨precedes(o2,o1))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

