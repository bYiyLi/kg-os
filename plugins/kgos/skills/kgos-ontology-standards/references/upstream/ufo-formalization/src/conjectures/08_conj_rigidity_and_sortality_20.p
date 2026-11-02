% Ax |= "th_leafCategoriesArePairwiseDisjoint_t18"; conjecture commented for convenience

fof(th_leafCategoriesArePairwiseDisjoint_t18, conjecture, (
  ~?[T]: (endurantType(T) & (
    (
      (kind(T) & subkind(T))
      | (kind(T) & phase(T))
      | (kind(T) & role(T))
      | (kind(T) & category(T))
      | (kind(T) & mixin(T))
      | (kind(T) & phaseMixin(T))
      | (kind(T) & roleMixin(T))
    ) | (
      (subkind(T) & phase(T))
      | (subkind(T) & role(T))
      | (subkind(T) & category(T))
      | (subkind(T) & mixin(T))
      | (subkind(T) & phaseMixin(T))
      | (subkind(T) & roleMixin(T))
    ) | (
      (phase(T) & role(T))
      | (phase(T) & category(T))
      | (phase(T) & mixin(T))
      | (phase(T) & phaseMixin(T))
      | (phase(T) & roleMixin(T))
    ) | (
      (role(T) & category(T))
      | (role(T) & mixin(T))
      | (role(T) & phaseMixin(T))
      | (role(T) & roleMixin(T))
    ) | (
      (category(T) & mixin(T))
      | (category(T) & phaseMixin(T))
      | (category(T) & roleMixin(T))
    ) | (
      (mixin(T) & phaseMixin(T))
      | (mixin(T) & roleMixin(T))
    ) | (
      (phaseMixin(T) & roleMixin(T))
    )
  ))
)).