% Ax |= "th_kindsHaveDisjointExtensions_t10"; conjecture commented for convenience

fof(th_kindsHaveDisjointExtensions_t10, conjecture, (
  ![K1,K2]: ((kind(K1) & kind(K2) & ~(K1=K2)) => (
    ~?[X,W1,W2]: (world(W1) & world(W2) & iof(X,K1,W1) & iof(X,K2,W2)))
  )
)).