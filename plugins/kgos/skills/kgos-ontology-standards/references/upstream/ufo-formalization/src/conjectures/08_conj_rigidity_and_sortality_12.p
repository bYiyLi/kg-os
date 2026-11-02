% If we have the taxonomy's axiomatization, then a25 becomes a theorem
% Ax |= "th_kindAndSubkindAreDisjoint_a25"; conjecture commented for convenience
  
fof(th_kindAndSubkindAreDisjoint_a25, conjecture, (
  ~?[T]: (kind(T) & subkind(T))
)).