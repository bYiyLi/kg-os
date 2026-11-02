# Full PDF text extraction

Original: [documentation/axiomatization-pds/history.pdf](<../../../../upstream/bfo-2020/documentation/axiomatization-pds/history.pdf>)

Source SHA-256: `5f73808af734cc3db9e49f271a1fbfd6fa5b601c40c6627b7994f4f689fc4b51`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
BFO 2020 History Axioms
History of and has history are inverse relations [abx-1]
∀a,b(historyOf(a,b) ↔hasHistory(b,a))
History of is functional on second argument [zek-1]
∀p,q,r(historyOf(p,q) ∧historyOf(p,r) →q=r)
History of is functional on first argument [woe-1]
∀p,q,r(historyOf(p,q) ∧historyOf(r,q) →p=r)
Every history is the history of something [vvy-1]
∀h( ∃t instanceOf(h,history,t)→ ∃m historyOf(h,m))
Every material entity has a history [okt-1]
∀m( ∃t instanceOf(m,materialEntity,t)→ ∃h historyOf(h,m))
A material entity participates in its history [lga-1]
∀h,m(historyOf(h,m) → ∀t(existsAt(m,t) →participatesIn(m,h,t)))
Material entity and its history exist at exactly the same times [uzz-1]
∀m,h(historyOf(h,m) → ∀t(instanceOf(m,materialEntity,t) ↔instanceOf(h,history,t)))
History of has domain history and range material entity [rph-1]
∀a,b(historyOf(a,b) → ∃t instanceOf(a,history,t)∧ ∃t instanceOf(b,materialEntity,t))
Alan Ruttenberg, October 5, 2026. The most recent version of this file will always be in the GitHub repository
https://github.com/bfo-ontology/bfo-2020
This work is licensed under a Creative Commons “Attribution 4.0 International”
license.
````

