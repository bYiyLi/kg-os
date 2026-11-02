% Ax |= "th_objectTypesSpecializeAKindOfSameNature_t24"; conjecture commented for convenience

fof(th_objectTypesSpecializeAKindOfSameNature_t24, conjecture, (
  ![T]: ((objectType(T) & sortal(T)) <=> (?[K]: (objectKind(K) & specializes(T,K))))
)).