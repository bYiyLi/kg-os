% Ax |= "th_sortalLeafCategoriesAreDisjoint_t25"; conjecture commented for convenience

fof(th_sortalLeafCategoriesAreDisjoint_t25, conjecture, (
  ![T]: (objectKind(T) => (~(collectiveKind(T) | quantityKind(T) | modeKind(T) | qualityKind(T) | relatorKind(T) | category(T) | mixin(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (collectiveKind(T) => (~(objectKind(T) | quantityKind(T) | modeKind(T) | qualityKind(T) | relatorKind(T) | category(T) | mixin(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (quantityKind(T) => (~(objectKind(T) | collectiveKind(T) | modeKind(T) | qualityKind(T) | relatorKind(T) | category(T) | mixin(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (modeKind(T) => (~(objectKind(T) | quantityKind(T) | collectiveKind(T) | qualityKind(T) | relatorKind(T) | category(T) | mixin(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (qualityKind(T) => (~(objectKind(T) | quantityKind(T) | modeKind(T) | collectiveKind(T) | relatorKind(T) | category(T) | mixin(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (relatorKind(T) => (~(objectKind(T) | quantityKind(T) | modeKind(T) | qualityKind(T) | collectiveKind(T) | category(T) | mixin(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (category(T) => (~(objectKind(T) | quantityKind(T) | modeKind(T) | qualityKind(T) | relatorKind(T) | collectiveKind(T) | mixin(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (mixin(T) => (~(objectKind(T) | quantityKind(T) | modeKind(T) | qualityKind(T) | relatorKind(T) | category(T) | collectiveKind(T) | phaseMixin(T) | roleMixin(T))))
  & ![T]: (phaseMixin(T) => (~(objectKind(T) | quantityKind(T) | modeKind(T) | qualityKind(T) | relatorKind(T) | category(T) | mixin(T) | collectiveKind(T) | roleMixin(T))))
  & ![T]: (roleMixin(T) => (~(objectKind(T) | quantityKind(T) | modeKind(T) | qualityKind(T) | relatorKind(T) | category(T) | mixin(T) | phaseMixin(T) | collectiveKind(T))))
)).