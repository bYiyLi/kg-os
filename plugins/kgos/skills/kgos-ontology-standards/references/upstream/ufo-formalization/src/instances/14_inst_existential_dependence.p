% Existential dependence in use
% (tested to rule out trivial models)

fof(ax_constitutionInUse, axiom, (
  object(e13_1) & object(e13_2) & object(e13_3) & ~(e13_1=e13_2) & ~(e13_1=e13_3) & ~(e13_2=e13_3) & existentiallyDependsOn(e13_2,e13_1) & existentiallyIndependentOf(e13_3,e13_1)
)).