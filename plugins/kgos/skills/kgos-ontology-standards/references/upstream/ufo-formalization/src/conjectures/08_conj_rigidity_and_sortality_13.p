% If we have the taxonomy's axiomatization, then a26 becomes a theorem
% Ax |= "th_kindAndSubkindAreRigidSortals_a26"; conjecture commented for convenience

fof(th_kindAndSubkindAreRigidSortals_a26, conjecture, (
  ![T]: ((kind(T) | subkind(T)) <=> (rigid(T) & sortal(T)))
)).