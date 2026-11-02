% Rigidity properties
% (tested to rule out trivial models)

fof(ax_rigidityInUse, axiom, (
  endurantType(t4_1) & endurantType(t4_2) & endurantType(t4_3) & rigid(t4_1) & semiRigid(t4_2) & antiRigid(t4_3) & properSpecializes(t4_1,t4_2) & properSpecializes(t4_3,t4_1)
)).