% External Dependence and Externally Dependent Modes

fof(ax_externallyDependsOn_a71, axiom, (
  ~?[M,X]: (externallyDependsOn(M,X) <=> (existentiallyDependsOn(M,X) & (![Y]: (inheresIn(M,Y) => existentiallyIndependentOf(X,Y)))))
)).

fof(ax_dExternallyDependentMode_a72, axiom, (
  ![M]: (externallyDependentMode(M) <=> (mode(M) & (?[X]: (externallyDependsOn(M,X)))))
)).

% Founded by

fof(ax_foundedByInvolvedThings_a73, axiom, (
  ![M,P]: (foundedBy(M,P) <=> ((externallyDependentMode(M) | relator(M)) & perdurant(P)))
)).

fof(ax_relationalModesHaveAFoundationEvent_a74, axiom, (
  ![M]: ((externallyDependentMode(M) | relator(M)) => (?[P]: (foundedBy(M,P))))
)).

fof(ax_uniqueFoundationEvents_a74, axiom, (
  ![M,P1,P2]: ((foundedBy(M,P1) & foundedBy(M,P2)) => (P1=P2))
)).

% Qua Individual

fof(ax_dQuaIndividualOf_a75, axiom, (
  ![X,Y]: (quaIndividualOf(X,Y) <=> (![Z]: (overlap(Z,X) <=> (
    externallyDependentMode(Z) & inheresIn(Z,Y) & (![P]: (foundedBy(X,P) => foundedBy(Z,P)))
  ))))
)).

fof(ax_dQuaIndividual_a76, axiom, (
  ![X]: (quaIndividual(X) <=> ?[Y]: (quaIndividualOf(X,Y)))
)).

% Qua Individual is already defined as a subtype of Externally Dependent Mode in the taxonomy; skipping (a78)

% Skipping (a79); already defined in (a74)

fof(ax_thePartsOfARelatorShareTheFoundationOfTheWhole_a80, axiom, (
  ![X,Y,Z]: ((relator(X) & partOf(Z,X)) => (![P]: (foundedBy(Z,P) => foundedBy(X,P))))
)).

fof(ax_dRelator_a81, axiom, (
  ![R]: (relator(R) <=> (
    (?[X]: (properPartOf(X,R))
    & (![Y,Z]: ((properPartOf(Y,R) & properPartOf(Z,R)) => (quaIndividual(Y) & quaIndividual(Z) & existentiallyDependsOn(Y,Z) & existentiallyDependsOn(Z,Y) & (![P]: (foundedBy(Y,P) <=> foundedBy(Z,P))))))
    & (![Y2,Z2]: ((properPartOf(Y2,R) & quaIndividual(Z2) & existentiallyDependsOn(Y2,Z2) & existentiallyDependsOn(Z2,Y2) & (![P2]: (foundedBy(Y2,P2) <=> foundedBy(Z2,P2)))) => (properPartOf(Z2,R))))
  )))
)).

fof(ax_dMediates_a82, axiom, (
  ![R,E]: (mediates(R,E) <=> (relator(R) & endurant(E) & (?[Q]: (quaIndividualOf(Q,E) & partOf(Q,R)))))
)).
