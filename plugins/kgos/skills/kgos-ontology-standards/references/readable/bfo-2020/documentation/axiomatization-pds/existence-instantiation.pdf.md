# Full PDF text extraction

Original: [documentation/axiomatization-pds/existence-instantiation.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/existence-instantiation.pdf>)

Source SHA-256: `8799de213a37dc18979aa173227283ff00d01b49a44ba91934a10cb81a4d6881`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 Existence Instantiation Axioms
Particulars exist at some time [nmq-1]
∀p(particular(p) → ∃t existsAt(p,t))
Every universal is instantiated at least once [mbf-1]
∀u(universal(u) → ∃p,t instanceOf(p,u,t))
Exists at is dissective on first argument when it is a continuant [uns-1]
∀p,q,r(existsAt(p,q) ∧continuantPartOf(r,p,q) →existsAt(r,q))
Instance of is dissective on third argument, a temporal region [qaf-1]
∀p,q,r,s(instanceOf(p,q,r) ∧temporalPartOf(s,r) →instanceOf(p,q,s))
Relata of exists at are particulars. [oap-1]
∀i,t(existsAt(i,t) →particular(i) ∧particular(t) ∧instanceOf(t,temporalRegion,t))
Relata of instance of are particular, universal, temporal region. [lqn-1]
∀i,u,t(instanceOf(i,u,t) →particular(i) ∧universal(u) ∧instanceOf(t,temporalRegion,t))
There is always something that exists [nis-1]
∀t (instanceOf(t,temporalRegion,t)
→ ∃u,i(i ̸=t ∧universal(u) ∧particular(i) ∧instanceOf(i,u,t)))
If m is a material entity, then there is some one dimensional temporal region during which m exists [zuw-1]
∀m (∃t instanceOf(m,materialEntity,t)
→ ∃t(instanceOf(t,oneDimensionalTemporalRegion,t) ∧existsAt(m,t)))
If you exist you instantiate a universal and vice versa [bee-1]
∀a,t (∃u(universal(u) ∧instanceOf(a,u,t) ∧instanceOf(t,temporalRegion,t))
↔particular(a) ∧instanceOf(t,temporalRegion,t) ∧existsAt(a,t))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

