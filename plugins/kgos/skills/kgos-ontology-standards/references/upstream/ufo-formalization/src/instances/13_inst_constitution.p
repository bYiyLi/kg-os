% Constitution in use
% (tested to rule out trivial models)

fof(ax_constitutionInUse, axiom, (
  object(e12_1) & object(e12_2) & objectKind(k12_1) & objectKind(k12_2) & world(w12) & ~(k12_1=k12_2) & iof(e12_1,k12_1,w12) & iof(e12_2,k12_2,w12) & constitutedBy(e12_1,e12_2,w12) & genericConstitutionalDependence(k12_1,k12_2) & constitution(e12_1,k12_1,e12_2,k12_2,w12)
)).