% Ax |= "th_sortalsSpecializeAUniqueKind_t14"; conjecture commented for convenience

fof(th_sortalsSpecializeAUniqueKind_t14, conjecture, (
  ![S]: ((sortal(S)) => (~?[U,U2]: (kind(U) & kind(U2) & specializes(S,U) & specializes(S,U2) & ~(U=U2))))
)).