% If we have the taxonomy's axiomatization, then a24 becomes a theorem
% Ax |= "th_nonSortalsAreEndurantsThatAreNotSortals_a24"; conjecture commented for convenience

fof(th_nonSortalsAreEndurantsThatAreNotSortals_a24, conjecture, (
  ![NS]: ((nonSortal(NS)) <=> (endurantType(NS) & ~sortal(NS)))
)).