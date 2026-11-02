% Composition in use
% (tested to rule out trivial models)

fof(ax_compositionInUse, axiom, (
  componentOf(e11_1,t11_1,e11_2,t11_2,w11) & ~(e11_1=e11_2) & ~(e11_1=t11_1) & ~(e11_2=t11_2) & ~(e11_1=t11_2) & ~(e11_2=t11_1) & ~(t11_1=t11_2)
)).