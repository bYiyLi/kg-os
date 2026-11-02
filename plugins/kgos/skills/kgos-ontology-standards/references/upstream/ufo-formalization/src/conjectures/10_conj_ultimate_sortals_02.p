% Ax |= "th_endurantSortalsCompleteness_t23"; conjecture commented for convenience
% Thanks to the taxonomy, we already have "sortal(T) => endurantType(T)", but I leave it like this to be consistent with the paper

fof(th_endurantSortalsCompleteness_t23, conjecture, (
  ![T]: ((endurantType(T) & sortal(T)) => (objectKind(T) | collectiveKind(T) | quantityKind(T) | qualityKind(T) | modeKind(T) | relatorKind(T) | phase(T) | role(T)))
)).