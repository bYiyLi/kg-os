% If we have the taxonomy's axiomatization, then a27 becomes a theorem
% Ax |= "th_phaseAndRoleAreDisjoint_a27"; conjecture commented for convenience
  
fof(th_phaseAndRoleAreDisjoint_a27, conjecture, (
  ~?[T]: (phase(T) & role(T))
)).