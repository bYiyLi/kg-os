% Ax |= "th_leafCategoriesArePairwiseDisjoint_t21"; conjecture commented for convenience
% Having the previously defined taxonomy, this should be quite trivial
  
fof(th_leafCategoriesArePairwiseDisjoint_t21, conjecture, (
  ~?[T]: (type_(T) & (
    (
      (objectType(T) & collectiveType(T)) | (objectType(T) & quantityType(T)) | (objectType(T) & modeType(T)) | (objectType(T) & qualityType(T)) | (objectType(T) & relatorType(T)) | (objectType(T) & perdurantType(T))
    ) | (
      (collectiveType(T) & quantityType(T)) | (collectiveType(T) & modeType(T)) | (collectiveType(T) & qualityType(T)) | (collectiveType(T) & relatorType(T)) | (collectiveType(T) & perdurantType(T))
    ) | (
      (quantityType(T) & modeType(T)) | (quantityType(T) & qualityType(T)) | (quantityType(T) & relatorType(T)) | (quantityType(T) & perdurantType(T))
    ) | (
      (modeType(T) & qualityType(T)) | (modeType(T) & relatorType(T)) | (modeType(T) & perdurantType(T))
    ) | (
      (qualityType(T) & relatorType(T)) | (qualityType(T) & perdurantType(T))
    ) | (
      relatorType(T) & perdurantType(T)
    )
  ))
)).