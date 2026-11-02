% If we have the taxonomy's axiomatization, then a32 becomes a theorem
% Ax |= "th_phaseMixinAndRoleMixinAreDisjoint_a32"; conjecture commented for convenience
  
fof(th_phaseMixinAndRoleMixinAreDisjoint_a32, conjecture, (
  ~?[T]: (phaseMixin(T) & roleMixin(T))
)).