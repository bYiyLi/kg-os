# Full PDF text extraction

Original: [documentation/axiomatization-pds/temporal-region.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/temporal-region.pdf>)

Source SHA-256: `8b62ad7433124658820b3e912b6ab6335b81be1979637640f84e784641891b59`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 T emporal Region Axioms
Has last instant and last instant of are inverse relations [wal-1]
∀a,b(hasLastInstant(a,b) ↔lastInstantOf(b,a))
Has first instant and first instant of are inverse relations [bon-1]
∀a,b(hasFirstInstant(a,b) ↔firstInstantOf(b,a))
Temporal part of and has temporal part are inverse relations [boo-1]
∀a,b(temporalPartOf(a,b) ↔hasTemporalPart(b,a))
Temporal part of for occurrents implies occurrent part of [bal-1]
∀a,b(temporalPartOf(a,b) →occurrentPartOf(a,b))
Proper temporal part of and has proper temporal part are inverse relations [dbc-1]
∀a,b(properTemporalPartOf(a,b) ↔hasProperTemporalPart(b,a))
If something is an instance of temporal region at t, then t is part of that temporal region [njq-1]
∀ti,t(instanceOf(ti,temporalRegion,t) →temporalPartOf(t,ti))
All occurrents are temporal parts of themselves [bvr-1]
∀a( ∃t instanceOf(a,occurrent,t) →temporalPartOf(a,a))
Temporal part of is antisymmetric [zdq-1]
∀a,b(temporalPartOf(a,b) ∧temporalPartOf(b,a) →a=b)
Proper temporal part of is asymmetric [aqu-1]
∀a,b(properTemporalPartOf(a,b) → ¬properTemporalPartOf(b,a))
Has last instant is functional on second argument [ogd-1]
∀p,q,r(hasLastInstant(p,q) ∧hasLastInstant(p,r) →q=r)
Has first instant is functional on second argument [fwf-1]
∀p,q,r(hasFirstInstant(p,q) ∧hasFirstInstant(p,r) →q=r)
A proper temporal part of b means a is a temporal part of b and b a is not the same as b [aeu-1]
∀x,y(properTemporalPartOf(x,y) ↔temporalPartOf(x,y) ∧x̸=y)
The only part of a temporal instant is itself [pir-2]
∀p,q(instanceOf(p,temporalInstant,p) ∧hasTemporalPart(p,q) →p=q)
Instance of is dissective on third argument, a temporal region [qaf-1]
∀p,q,r,s(instanceOf(p,q,r) ∧temporalPartOf(s,r) →instanceOf(p,q,s))
Temporal part of is transitive [bfq-1]
∀a,b,c(temporalPartOf(a,b) ∧temporalPartOf(b,c) →temporalPartOf(a,c))
The first and last time points for an instant are the instant itself [nfo-1]
∀i(instanceOf(i,temporalInstant,i) ↔hasFirstInstant(i,i) ∧hasLastInstant(i,i))
If a temporal part of b then if a is an instance of temporal region then b is an instance of temporal region, and vice versa
[mjn-2]
∀p,q (temporalPartOf(p,q)
→(instanceOf(p,temporalRegion,p) ↔instanceOf(q,temporalRegion,q)))
Has last instant has domain temporal region and range temporal instant [jtk-2]
````

## PDF page 2

````text
∀a,b (hasLastInstant(a,b)
→instanceOf(a,temporalRegion,a) ∧instanceOf(b,temporalInstant,b))
Proper temporal part of is transitive [mns-1]
∀a,b,c(properTemporalPartOf(a,b)∧properTemporalPartOf(b,c) →properTemporalPartOf(a,c))
Has first instant has domain temporal region and range temporal instant [fwk-2]
∀a,b (hasFirstInstant(a,b)
→instanceOf(a,temporalRegion,a) ∧instanceOf(b,temporalInstant,b))
If the last instant of a temporal region precedes the first instant of another, then the first region precedes the second [qqv-1]
∀i1,i2,l1,f2 (hasLastInstant(i1,l1)∧hasFirstInstant(i2,f2) ∧precedes(l1,f2)
→precedes(i1,i2))
Any temporal region has a first and last instant [daf-1]
∀i (instanceOf(i,temporalRegion,i)
→ ∃t1,t2(hasFirstInstant(i,t1) ∧hasLastInstant(i,t2)))
All temporal regions are part of a temporal interval [mvd-1]
∀t (instanceOf(t,temporalRegion,t)
→ ∃i(instanceOf(i,temporalInterval,i) ∧temporalPartOf(t,i)))
Temporal part of has domain occurrent and range occurrent [ruj-1]
∀a,b(temporalPartOf(a,b) → ∃t instanceOf(a,occurrent,t)∧ ∃t instanceOf(b,occurrent,t))
First instant of a temporal region that is not an instant precedes last instant [rzv-1]
∀t,ft,lt (¬instanceOf(t,temporalInstant,t) ∧hasFirstInstant(t,ft) ∧hasLastInstant(t,lt)
→precedes(ft,lt))
If one temporal region precedes another then the first last time point precedes the second first time point [miz-1]
∀t1,t2,l1,f2 (precedes(t1,t2)∧hasLastInstant(t1,l1) ∧hasFirstInstant(t2,f2) ∧l1̸=f2
→precedes(l1,f2))
A one dimensional temporal region has at least one interval as part [jhe-2]
∀t (instanceOf(t,oneDimensionalTemporalRegion,t)
→ ∃p(temporalPartOf(p,t) ∧instanceOf(p,temporalInterval,p)))
If a temporal part of b then if a is an instance of one dimensional temporal region then b is an instance of one dimensional
temporal region [mei-2]
∀p,q (temporalPartOf(p,q)
→(instanceOf(p,oneDimensionalTemporalRegion,p)
→instanceOf(q,oneDimensionalTemporalRegion,q)))
If a has temporal part b then if a is an instance of zero dimensional temporal region then b is an instance of zero dimensional
temporal region [bnt-2]
∀p,q (hasTemporalPart(p,q)
→(instanceOf(p,zeroDimensionalTemporalRegion,p)
→instanceOf(q,zeroDimensionalTemporalRegion,q)))
Temporal instants are totally ordered [qnf-1]
∀t1,t2 (instanceOf(t1,temporalInstant,t1)∧instanceOf(t2,temporalInstant,t2)
→precedes(t1,t2)∨precedes(t2,t1)∨t1=t2)
Temporal region is the union of zero dimensional temporal region and one dimensional temporal region [hgs-1]
∀i,t (instanceOf(i,temporalRegion,t)
→instanceOf(i,zeroDimensionalTemporalRegion,t)
∨instanceOf(i,oneDimensionalTemporalRegion,t))
The last temporal instant is such that every part of the interval that doesn’t have the last instant as part precedes it [nhd-3]
∀i,li,ip (hasLastInstant(i,li)∧temporalPartOf(ip,i)
→precedes(ip,li)∨temporalPartOf(li,ip) ∨instanceOf(i,temporalInstant,i))
The first temporal instant is such that it precedes every part of the interval that doesn’t have the first instant as part [ixz-2]
∀i,fi,ip (hasFirstInstant(i,fi)∧temporalPartOf(ip,i)
→precedes(fi,ip)∨temporalPartOf(fi,ip) ∨instanceOf(i,temporalInstant,i))
Temporal regions are instances at themselves [tvx-3]
∀a,b(( ∀c(instanceOf(a,b,c) ∧instanceOf(a,temporalRegion,c) →instanceOf(a,b,a)))
∧(instanceOf(a,b,a) →instanceOf(a,temporalRegion,a)))
````

## PDF page 3

````text
If the last instant of a temporal region is the first instant of another, the first region precedes the second [suk-1]
∀i1,i2,l1,f2 (¬instanceOf(i1,temporalInstant,i1) ∧ ¬instanceOf(i2,temporalInstant,i2)
∧hasLastInstant(i1,l1) ∧hasFirstInstant(i2,f2) ∧l1=f2
→precedes(i1,i2))
If a has temporal part b then if a is an instance of one dimensional temporal region then b is an instance of one dimensional
temporal region or zero dimensional temporal region [eeg-2]
∀p,q (hasTemporalPart(p,q)
→(instanceOf(p,oneDimensionalTemporalRegion,p)
→instanceOf(q,oneDimensionalTemporalRegion,q)
∨instanceOf(q,zeroDimensionalTemporalRegion,q)))
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
Intervals have no internal gaps [ekm-1]
∀i,start,end (instanceOf(i,temporalInterval,i)∧hasFirstInstant(i,start)
∧hasLastInstant(i,end)
→ ¬(∃gap,gapStart,gapEnd(hasFirstInstant(gap,gapStart)
∧hasLastInstant(gap,gapEnd)
∧precedes(gapEnd,end)∧precedes(start,gapStart)
∧ ¬temporalPartOf(gap,i))))
Temporal part of has weak supplementation [vbw-1]
∀x,y (instanceOf(x,temporalRegion,x)∧instanceOf(y,temporalRegion,y)
→(properTemporalPartOf(x,y)
→ ∃z(properTemporalPartOf(z,y)
∧ ¬(∃overlap(instanceOf(overlap,temporalRegion,overlap)
∧temporalPartOf(overlap,x) ∧temporalPartOf(overlap,z))))))
Any temporal instant that precedes the last instant of an interval and which is preceded by the first instant is part of the
interval [zlp-1]
∀t,r (instanceOf(t,temporalInstant,t)∧instanceOf(r,temporalInterval,r)
→hasFirstInstant(r,t)∨hasLastInstant(r,t)
∨(∃f,l(instanceOf(r,temporalInterval,r) ∧hasFirstInstant(r,f)
∧hasLastInstant(r,l)∧precedes(t,l)∧precedes(f,t))
↔properTemporalPartOf(t,r)))
Two intervals are identical if their first and last instants are the same and if an instant is part of one of the intervals it is also
part of the other [xkl-1]
∀i1,i2 (instanceOf(i1,temporalInterval,i1)∧instanceOf(i2,temporalInterval,i2)
→(∃f,l(hasFirstInstant(i1,f) ∧hasFirstInstant(i2,f) ∧hasLastInstant(i1,l)
∧hasLastInstant(i2,l) ∧(temporalPartOf(l,i1) ↔temporalPartOf(l,i2))
∧(temporalPartOf(f,i1) ↔temporalPartOf(f,i2)))
→i1=i2))
Temporal part of has unique product [wsg-2]
∀x,y (instanceOf(x,temporalRegion,x)∧instanceOf(y,temporalRegion,y)
→(∃o(temporalPartOf(o,x) ∧temporalPartOf(o,y))
→ ∃z(instanceOf(z,temporalRegion,z)
∧(∀w(instanceOf(w,temporalRegion,w) ∧instanceOf(z,temporalRegion,z)
→(temporalPartOf(w,z)
↔temporalPartOf(w,x)∧temporalPartOf(w,y)))))))
An interval has no gaps [nui-1]
````

## PDF page 4

````text
∀i,start,end (instanceOf(i,temporalInterval,i)∧hasFirstInstant(i,start)
∧hasLastInstant(i,end)
→ ¬(∃gap,gapStart,gapEnd( ¬instanceOf(gap,temporalInstant,gap)
∧hasFirstInstant(gap,gapStart)
∧hasLastInstant(gap,gapEnd)
∧(precedes(gapEnd,end)
∨(temporalPartOf(end,i) ∧gapEnd=end))
∧(precedes(start,gapStart)
∨(temporalPartOf(start,i) ∧gapStart=start))
∧ ¬temporalPartOf(gap,i))))
Intervals have no gaps strong version every two instants without another in between bound an interval [cop-1]
∀i,start,end (instanceOf(i,temporalInterval,i)∧hasFirstInstant(i,start)
∧hasLastInstant(i,end)
→ ∀t1,t2(temporalPartOf(t1,i) ∧temporalPartOf(t2,i)
∧instanceOf(t1,temporalInstant,t1)
∧instanceOf(t2,temporalInstant,t2) ∧precedes(t1,t2)
∧ ¬(∃t3(instanceOf(t3,temporalInstant,t3) ∧precedes(t1,t3)
∧precedes(t3,t2)))
→ ∃fill(instanceOf(fill,temporalInterval,fill)
∧hasFirstInstant(fill,t1) ∧hasLastInstant(fill,t2)
∧temporalPartOf(fill,i))))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

