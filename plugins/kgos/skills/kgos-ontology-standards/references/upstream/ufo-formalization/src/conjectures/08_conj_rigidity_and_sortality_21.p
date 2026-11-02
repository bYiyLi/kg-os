% Ax |= "th_leafCategoriesCompletelyCategorizeAllEndurantTypes_t19"; conjecture commented for convenience
  
fof(th_leafCategoriesCompletelyCategorizeAllEndurantTypes_t19, conjecture, (
  ![T]: (endurantType(T) => (
    kind(T) | subkind(T) | phase(T) | role(T) | category(T) | mixin(T) | phaseMixin(T) | roleMixin(T)
  ))
)).