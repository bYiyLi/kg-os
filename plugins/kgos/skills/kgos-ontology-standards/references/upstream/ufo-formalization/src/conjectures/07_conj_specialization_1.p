% Ax |= "th_cyclicSpecializations_t3"; conjecture commented for convenience

fof(th_cyclicSpecializations_t3, conjecture, (
  ![X,Y]: (specializes(X,Y) => (specializes(X,X) & specializes(Y,Y)))
)).