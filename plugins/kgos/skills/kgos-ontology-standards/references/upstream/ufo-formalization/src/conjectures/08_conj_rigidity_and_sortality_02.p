% Ax |= "th_pairwiseDisjointRigidities_t6"; conjecture commented for convenience

fof(th_pairwiseDisjointRigidities_t6, conjecture, (
  ~![T]: ((rigid(T) & semiRigid(T)) | (semiRigid(T) & antiRigid(T)) | (rigid(T) & antiRigid(T)))
)).