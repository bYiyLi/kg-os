% Mereology in use
% (tested to rule out trivial models)

fof(ax_mereologyInUse, axiom, (
  concreteIndividual(ci10_1) & concreteIndividual(ci10_2) & concreteIndividual(ci10_3) & concreteIndividual(ci10_4) & concreteIndividual(ci10_5) & ~(ci10_1=ci10_2) & ~(ci10_2=ci10_3) & ~(ci10_3=ci10_4) & ~(ci10_4=ci10_5) & properPart(ci10_1,ci10_2) & properPart(ci10_3,ci10_4) & sum(ci10_5,ci10_3,ci10_4)
)).