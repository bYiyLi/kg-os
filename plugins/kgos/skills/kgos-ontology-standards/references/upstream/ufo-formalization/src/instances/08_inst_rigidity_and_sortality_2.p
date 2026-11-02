% Sortality properties
% (tested to rule out trivial models)

fof(ax_sortalityInUse, axiom, (
  endurant(e5_1) & endurant(e5_2) & world(w5) & kind(k5_1) & kind(k5_2) & iof(e5_1,k5_1,w5) & iof(e5_1,k5_1,w5) & ~(k5_1=k5_2)
)).