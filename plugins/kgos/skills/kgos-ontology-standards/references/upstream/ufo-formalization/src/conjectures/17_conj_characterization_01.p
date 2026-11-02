% Ax |= "th_qualitiesInheresInAUniqueEndurantConnectThroughCharacteization_a84"; conjecture commented for convenience

fof(th_qualitiesInheresInAUniqueEndurantConnectThroughCharacteization_a84, conjecture, (
  ![QT,ET]: ((characterizes(QT,ET) & qualityType(QT)) => (![Q,W]: (iof(Q,QT,W) => (?[E]: (iof(E,ET,W) & inheresIn(Q,E) & (![E2]: (inheresIn(Q,E2) <=> (E=E2))))))))
)).