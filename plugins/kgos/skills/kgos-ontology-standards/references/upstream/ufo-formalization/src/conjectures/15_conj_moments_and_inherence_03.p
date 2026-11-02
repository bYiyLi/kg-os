% Ax |= "th_antiTransitiveInherence_t30"; conjecture commented for convenience

fof(th_antiTransitiveInherence_t30, conjecture, (
  ![X,Y,Z]: ((inheresIn(X,Y) & inheresIn(Y,Z)) => (~inheresIn(X,Z)))
)).