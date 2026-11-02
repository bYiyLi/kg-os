% Ax |= "th_endurantsInstantiateEndurantKindsOfSomeNature_a46"; conjecture commented for convenience
% This axiom is actually a theorem in this version of the axiomatization

fof(th_endurantsInstantiateEndurantKindsOfSomeNature_a46, conjecture, (
  ![E]: (endurant(E) => (
    ?[K,W]: ((objectKind(K) | collectiveKind(K) | quantityKind(K) | modeKind(K) | qualityKind(K) | relatorKind(K))
    & iof(E,K,W))
  ))
)).