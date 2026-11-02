% Specialization relations
% (tested to rule out trivial models)

fof(ax_specializesInUse, axiom, (
  endurantType(t3_1) & endurantType(t3_2) & specializes(t3_1,t3_2) & properSpecializes(t3_1,t3_2) & specializes(t3_1,t3_1) & endurant(e3) & world(w3) & iof(e3,t3_1,w3)
)).