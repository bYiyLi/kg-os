% If we have the taxonomy's axiomatization, then a28 becomes a theorem
% Ax |= "th_phaseAndRoleAreAntiRigidSortals_a28"; conjecture commented for convenience

fof(th_phaseAndRoleAreAntiRigidSortals_a28, conjecture, (
  ![T]: ((phase(T) | role(T)) <=> (antiRigid(T) & sortal(T)))
)).