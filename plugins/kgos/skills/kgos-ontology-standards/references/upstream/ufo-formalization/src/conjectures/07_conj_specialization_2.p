
% Ax |= "th_transitiveSpecializations_t4"; conjecture commented for convenience

fof(th_transitiveSpecializations_t4, conjecture, (
  ![X,Y,Z]: ((specializes(X,Y) & specializes(Y,Z)) => (specializes(X,Z)))
)).