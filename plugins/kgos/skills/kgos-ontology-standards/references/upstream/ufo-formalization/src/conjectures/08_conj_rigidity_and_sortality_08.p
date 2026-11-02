% Ax |= "th_kindsHaveDisjointTaxonomies_t11"; conjecture commented for convenience

fof(th_kindsHaveDisjointTaxonomies_t11, conjecture, (
  ![K1,K2]: ((kind(K1) & kind(K2) & ~(K1=K2)) => (
    ~?[T]: (specializes(T,K1) & specializes(T,K2)))
  )
)).