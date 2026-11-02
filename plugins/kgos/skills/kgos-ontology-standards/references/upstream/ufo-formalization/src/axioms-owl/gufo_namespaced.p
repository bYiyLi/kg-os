fof(axiom0,axiom,(
  ![X]:(owl__Thing(X)|rdfs__Literal(X))
)).

fof(axiom1,axiom,(
  ![X]:(owl__Thing(X)=>~rdfs__Literal(X))
)).

fof(axiom2,axiom,(
  ?[X]:owl__Thing(X)
)).

fof(axiom3,axiom,(
  ?[X]:rdfs__Literal(X)
)).

fof(axiom4,axiom,(
  ![X,Y]:(xds__minExclusive(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom5,axiom,(
  ![X,Y]:(xds__fractionDigits(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom6,axiom,(
  ![X,Y]:(xds__pattern(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom7,axiom,(
  ![X,Y]:(xds__minLength(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom8,axiom,(
  ![X,Y]:(xds__minInclusive(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom9,axiom,(
  ![X,Y]:(xds__totalDigits(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom10,axiom,(
  ![X,Y]:(xds__length(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom11,axiom,(
  ![X,Y]:(xds__maxExclusive(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom12,axiom,(
  ![X,Y]:(xds__maxLength(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom13,axiom,(
  ![X,Y]:(rdf__langRange(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom14,axiom,(
  ![X,Y]:(xds__maxInclusive(X,Y)=>(rdfs__Literal(X)&rdfs__Literal(Y)))
)).

fof(axiom15,axiom,(
  ![X,Y]:(gufo__hasValueComponent(X,Y)=>owl__Thing(X))
)).

fof(axiom16,axiom,(
  ![X,Y]:(gufo__hasValueComponent(X,Y)=>rdfs__Literal(Y))
)).

fof(axiom17,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedInstantiation(X0,X1)=>gufo__Endurant(X0))
)).

fof(axiom18,axiom,(
  ![X0,X1,X2]:((gufo__isObjectProperPartOf(X0,X1)&gufo__isObjectProperPartOf(X1,X2))=>gufo__isObjectProperPartOf(X0,X2))
)).

fof(axiom19,axiom,(
  ![X0]:~(gufo__ComparativeRelationshipType(X0)&gufo__MaterialRelationshipType(X0))
)).

fof(axiom20,axiom,(
  ![X0]:(gufo__TemporaryParthoodSituation(X0)=>(?[X1]:(gufo__concernsTemporaryWhole(X0,X1)&gufo__Endurant(X1))&![X2,X3]:((gufo__concernsTemporaryWhole(X0,X2)&gufo__Endurant(X2)&gufo__concernsTemporaryWhole(X0,X3)&gufo__Endurant(X3))=>~(X2!=X3))))
)).

fof(axiom21,axiom,(
  ![X]:(gufo__Mixin(X)=>owl__Thing(X))
)).

fof(axiom22,axiom,(
  ![X]:(gufo__RoleMixin(X)=>owl__Thing(X))
)).

fof(axiom23,axiom,(
  ![X0]:~(gufo__NonSortal(X0)&gufo__Sortal(X0))
)).

fof(axiom24,axiom,(
  ![X]:(gufo__IntrinsicAspect(X)=>owl__Thing(X))
)).

fof(axiom25,axiom,(
  ![X0,X1]:(gufo__hasEndPointInXSDDateTimeStamp(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom26,axiom,(
  ![X,Y]:(gufo__isEventProperPartOf(X,Y)=>owl__Thing(X))
)).

fof(axiom27,axiom,(
  ![X,Y]:(gufo__isEventProperPartOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom28,axiom,(
  ![X0]:~(gufo__Endurant(X0)&gufo__Event(X0))
)).

fof(axiom29,axiom,(
  ![X1]:~(gufo__Endurant(X1)&gufo__Situation(X1))
)).

fof(axiom30,axiom,(
  ![X2]:~(gufo__Event(X2)&gufo__Situation(X2))
)).

fof(axiom31,axiom,(
  ![X0]:(gufo__Sortal(X0)=>gufo__EndurantType(X0))
)).

fof(axiom32,axiom,(
  ![X0]:(gufo__EndurantType(X0)=>gufo__ConcreteIndividualType(X0))
)).

fof(axiom33,axiom,(
  ![X0]:~(gufo__EventType(X0)&gufo__SituationType(X0))
)).

fof(axiom34,axiom,(
  ![X0,X1]:(gufo__isComponentOf(X0,X1)=>gufo__Object(X0))
)).

fof(axiom35,axiom,(
  ![X0,X1,X2]:((gufo__concernsNonRigidType(X0,X1)&gufo__concernsNonRigidType(X0,X2))=>(X1=X2))
)).

fof(axiom36,axiom,(
  ![X0]:(gufo__Relator(X0)=>gufo__ExtrinsicAspect(X0))
)).

fof(axiom37,axiom,(
  ![X]:(gufo__EventType(X)=>owl__Thing(X))
)).

fof(axiom38,axiom,(
  ![X0]:(gufo__Event(X0)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom39,axiom,(
  ![X,Y]:(gufo__hasEndPoint(X,Y)=>owl__Thing(X))
)).

fof(axiom40,axiom,(
  ![X,Y]:(gufo__hasEndPoint(X,Y)=>owl__Thing(Y))
)).

fof(axiom41,axiom,(
  ![X]:(gufo__SubKind(X)=>owl__Thing(X))
)).

fof(axiom42,axiom,(
  ![X0]:~(gufo__TemporaryConstitutionSituation(X0)&gufo__TemporaryInstantiationSituation(X0))
)).

fof(axiom43,axiom,(
  ![X]:(gufo__Object(X)=>owl__Thing(X))
)).

fof(axiom44,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedParthood(X0,X1)=>gufo__Endurant(X0))
)).

fof(axiom45,axiom,(
  ![X0]:(gufo__NonSortal(X0)=>gufo__EndurantType(X0))
)).

fof(axiom46,axiom,(
  ![X,Y]:(gufo__mediates(X,Y)=>owl__Thing(X))
)).

fof(axiom47,axiom,(
  ![X,Y]:(gufo__mediates(X,Y)=>owl__Thing(Y))
)).

fof(axiom48,axiom,(
  ![X0,X1]:(gufo__isSubCollectionOf(X0,X1)=>gufo__isObjectProperPartOf(X0,X1))
)).

fof(axiom49,axiom,(
  ![X0,X1]:(gufo__contributedToTrigger(X0,X1)=>gufo__Event(X1))
)).

fof(axiom50,axiom,(
  ![X0]:~(gufo__ExtrinsicMode(X0)&gufo__Relator(X0))
)).

fof(axiom51,axiom,(
  ![X0,X1]:(gufo__constitutes(X0,X1)=>gufo__ConcreteIndividual(X1))
)).

fof(axiom52,axiom,(
  ![X]:(gufo__SemiRigidType(X)=>owl__Thing(X))
)).

fof(axiom53,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedInstantiation(X0,X1)=>gufo__standsIn(X0,X1))
)).

fof(axiom54,axiom,(
  ![X,Y]:(gufo__broughtAbout(X,Y)=>owl__Thing(X))
)).

fof(axiom55,axiom,(
  ![X,Y]:(gufo__broughtAbout(X,Y)=>owl__Thing(Y))
)).

fof(axiom56,axiom,(
  ![X0]:~(gufo__ExtrinsicAspect(X0)&gufo__IntrinsicAspect(X0))
)).

fof(axiom57,axiom,(
  ![X0]:~(gufo__Individual(X0)&gufo__Type(X0))
)).

fof(axiom58,axiom,(
  ![X0,X1]:(gufo__isObjectProperPartOf(X0,X1)=>gufo__isProperPartOf(X0,X1))
)).

fof(axiom59,axiom,(
  ![X0]:(gufo__ConcreteIndividual(X0)=>gufo__Individual(X0))
)).

fof(axiom60,axiom,(
  ![X0]:(gufo__TemporaryRelationshipSituation(X0)=>gufo__Situation(X0))
)).

fof(axiom61,axiom,(
  ![X0,X1]:(gufo__inheresIn(X0,X1)=>gufo__Aspect(X0))
)).

fof(axiom62,axiom,(
  ![X0,X1]:(gufo__isCollectionMemberOf(X0,X1)=>gufo__Collection(X1))
)).

fof(axiom63,axiom,(
  ![X0]:(gufo__Individual(X0)<=>(gufo__AbstractIndividual(X0)|gufo__ConcreteIndividual(X0)))
)).

fof(axiom64,axiom,(
  ![X1]:~(gufo__AbstractIndividual(X1)&gufo__ConcreteIndividual(X1))
)).

fof(axiom65,axiom,(
  ![X,Y]:(gufo__inheresIn(X,Y)=>owl__Thing(X))
)).

fof(axiom66,axiom,(
  ![X,Y]:(gufo__inheresIn(X,Y)=>owl__Thing(Y))
)).

fof(axiom67,axiom,(
  ![X0]:(gufo__ExtrinsicAspect(X0)=>gufo__Aspect(X0))
)).

fof(axiom68,axiom,(
  ![X0,X1,X2]:((gufo__historicallyDependsOn(X0,X1)&gufo__historicallyDependsOn(X1,X2))=>gufo__historicallyDependsOn(X0,X2))
)).

fof(axiom69,axiom,(
  ![X0]:(gufo__Mixin(X0)=>gufo__NonSortal(X0))
)).

fof(axiom70,axiom,(
  ![X0,X1,X2]:((gufo__concernsRelationshipType(X0,X1)&gufo__concernsRelationshipType(X0,X2))=>(X1=X2))
)).

fof(axiom71,axiom,(
  ![X0,X1,X2]:((gufo__inheresIn(X0,X1)&gufo__inheresIn(X0,X2))=>(X1=X2))
)).

fof(axiom72,axiom,(
  ![X]:(gufo__Individual(X)=>owl__Thing(X))
)).

fof(axiom73,axiom,(
  ![X0,X1]:(gufo__isEventProperPartOf(X0,X1)=>gufo__Event(X1))
)).

fof(axiom74,axiom,(
  ![X,Y]:(gufo__isObjectProperPartOf(X,Y)=>owl__Thing(X))
)).

fof(axiom75,axiom,(
  ![X,Y]:(gufo__isObjectProperPartOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom76,axiom,(
  ![X0]:(gufo__TemporaryConstitutionSituation(X0)=>gufo__Situation(X0))
)).

fof(axiom77,axiom,(
  ![X0,X1]:(gufo__concernsRelationshipType(X0,X1)=>gufo__TemporaryRelationshipSituation(X0))
)).

fof(axiom78,axiom,(
  ![X0,X1,X2]:((gufo__concernsTemporaryWhole(X0,X1)&gufo__concernsTemporaryWhole(X0,X2))=>(X1=X2))
)).

fof(axiom79,axiom,(
  ![X0,X1]:(gufo__concernsQualityType(X0,X1)=>gufo__EndurantType(X1))
)).

fof(axiom80,axiom,(
  ![X0]:(gufo__TemporaryInstantiationSituation(X0)=>(?[X1]:(gufo__standsInQualifiedInstantiation(X1,X0)&gufo__Endurant(X1))&![X2,X3]:((gufo__standsInQualifiedInstantiation(X2,X0)&gufo__Endurant(X2)&gufo__standsInQualifiedInstantiation(X3,X0)&gufo__Endurant(X3))=>~(X2!=X3))))
)).

fof(axiom81,axiom,(
  ![X,Y]:(gufo__standsInQualifiedConstitution(X,Y)=>owl__Thing(X))
)).

fof(axiom82,axiom,(
  ![X,Y]:(gufo__standsInQualifiedConstitution(X,Y)=>owl__Thing(Y))
)).

fof(axiom83,axiom,(
  ![X0,X1]:(gufo__concernsRelatedEndurant(X0,X1)=>gufo__Endurant(X1))
)).

fof(axiom84,axiom,(
  ![X,Y]:(gufo__contributedToTrigger(X,Y)=>owl__Thing(X))
)).

fof(axiom85,axiom,(
  ![X,Y]:(gufo__contributedToTrigger(X,Y)=>owl__Thing(Y))
)).

fof(axiom86,axiom,(
  ![X0]:~(gufo__TemporaryInstantiationSituation(X0)&gufo__TemporaryParthoodSituation(X0))
)).

fof(axiom87,axiom,(
  ![X0]:(gufo__QualityValue(X0)=>gufo__AbstractIndividual(X0))
)).

fof(axiom88,axiom,(
  ![X0]:(gufo__AbstractIndividual(X0)=>gufo__Individual(X0))
)).

fof(axiom89,axiom,(
  ![X0,X1]:(gufo__mediates(X0,X1)=>gufo__Relator(X0))
)).

fof(axiom90,axiom,(
  ![X0,X1]:(gufo__historicallyDependsOn(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom91,axiom,(
  ![X0]:(gufo__ExtrinsicAspect(X0)<=>(gufo__ExtrinsicMode(X0)|gufo__Relator(X0)))
)).

fof(axiom92,axiom,(
  ![X1]:~(gufo__ExtrinsicMode(X1)&gufo__Relator(X1))
)).

fof(axiom93,axiom,(
  ![X0,X1,X2]:((gufo__isEventProperPartOf(X0,X1)&gufo__isEventProperPartOf(X1,X2))=>gufo__isEventProperPartOf(X0,X2))
)).

fof(axiom94,axiom,(
  ![X0]:(gufo__AbstractIndividualType(X0)=>gufo__Type(X0))
)).

fof(axiom95,axiom,(
  ![X0]:(gufo__Participation(X0)=>(?[X1]:(gufo__participatedIn(X1,X0)&gufo__Object(X1))&![X2,X3]:((gufo__participatedIn(X2,X0)&gufo__Object(X2)&gufo__participatedIn(X3,X0)&gufo__Object(X3))=>~(X2!=X3))))
)).

fof(axiom96,axiom,(
  ![X0,X1]:(gufo__externallyDependsOn(X0,X1)=>gufo__Endurant(X1))
)).

fof(axiom97,axiom,(
  ![X,Y]:(gufo__standsInQualifiedInstantiation(X,Y)=>owl__Thing(X))
)).

fof(axiom98,axiom,(
  ![X,Y]:(gufo__standsInQualifiedInstantiation(X,Y)=>owl__Thing(Y))
)).

fof(axiom99,axiom,(
  ![X0,X1]:(gufo__hasBeginPointInXSDDateTimeStamp(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom100,axiom,(
  ![X0,X1]:(gufo__constitutes(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom101,axiom,(
  ![X0,X1]:(gufo__partitions(X0,X1)=>(gufo__Type(X0)&~gufo__AbstractIndividualType(X0)&owl__Thing(X0)&~gufo__ConcreteIndividualType(X0)&owl__Thing(X0)))
)).

fof(axiom102,axiom,(
  ![X0,X1]:(gufo__isSituationProperPartOf(X0,X1)=>gufo__isProperPartOf(X0,X1))
)).

fof(axiom103,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedConstitution(X0,X1)=>gufo__Endurant(X0))
)).

fof(axiom104,axiom,(
  ![X0]:~(gufo__QualityValueAttributionSituation(X0)&gufo__TemporaryParthoodSituation(X0))
)).

fof(axiom105,axiom,(
  ![X0]:(gufo__NonRigidType(X0)=>gufo__EndurantType(X0))
)).

fof(axiom106,axiom,(
  ![X0,X1]:(gufo__isSituationProperPartOf(X0,X1)=>gufo__Situation(X1))
)).

fof(axiom107,axiom,(
  ![X0,X1]:(gufo__concernsTemporaryWhole(X0,X1)=>gufo__TemporaryParthoodSituation(X0))
)).

fof(axiom108,axiom,(
  ![X0,X1]:(gufo__isSubQuantityOf(X0,X1)=>gufo__isObjectProperPartOf(X0,X1))
)).

fof(axiom109,axiom,(
  ![X0]:(gufo__ExtrinsicMode(X0)=>?[X1]:(gufo__externallyDependsOn(X0,X1)&gufo__ConcreteIndividual(X1)))
)).

fof(axiom110,axiom,(
  ![X0,X1]:(gufo__concernsRelatedEndurant(X0,X1)=>gufo__TemporaryRelationshipSituation(X0))
)).

fof(axiom111,axiom,(
  ![X0]:(gufo__QualityValueAttributionSituation(X0)=>(?[X1]:(gufo__standsInQualifiedAttribution(X1,X0)&gufo__Endurant(X1))&![X2,X3]:((gufo__standsInQualifiedAttribution(X2,X0)&gufo__Endurant(X2)&gufo__standsInQualifiedAttribution(X3,X0)&gufo__Endurant(X3))=>~(X2!=X3))))
)).

fof(axiom112,axiom,(
  ![X0,X1]:(gufo__wasTerminatedIn(X0,X1)=>gufo__Endurant(X0))
)).

fof(axiom113,axiom,(
  ![X0,X1]:(gufo__hasValueComponent(X0,X1)=>gufo__QualityValue(X0))
)).

fof(axiom114,axiom,(
  ![X0,X1,X2]:((gufo__concernsQualityType(X0,X1)&gufo__concernsQualityType(X0,X2))=>(X1=X2))
)).

fof(axiom115,axiom,(
  ![X,Y]:(gufo__categorizes(X,Y)=>owl__Thing(X))
)).

fof(axiom116,axiom,(
  ![X,Y]:(gufo__categorizes(X,Y)=>owl__Thing(Y))
)).

fof(axiom117,axiom,(
  ![X0]:~gufo__externallyDependsOn(X0,X0)
)).

fof(axiom118,axiom,(
  ![X0,X1]:(gufo__isComponentOf(X0,X1)=>gufo__isObjectProperPartOf(X0,X1))
)).

fof(axiom119,axiom,(
  ![X0,X1]:(gufo__hasEndPoint(X0,X1)=>time__Instant(X1))
)).

fof(axiom120,axiom,(
  ![X0,X1]:(gufo__contributedToTrigger(X0,X1)=>gufo__Situation(X0))
)).

fof(axiom121,axiom,(
  ![X0,X1]:(gufo__manifestedIn(X0,X1)=>gufo__Aspect(X0))
)).

fof(axiom122,axiom,(
  ![X,Y]:(gufo__isSubCollectionOf(X,Y)=>owl__Thing(X))
)).

fof(axiom123,axiom,(
  ![X,Y]:(gufo__isSubCollectionOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom124,axiom,(
  ![X]:(time__Instant(X)=>owl__Thing(X))
)).

fof(axiom125,axiom,(
  ![X0,X1]:(gufo__isEventProperPartOf(X0,X1)=>gufo__isProperPartOf(X0,X1))
)).

fof(axiom126,axiom,(
  ![X0,X1]:(gufo__historicallyDependsOn(X0,X1)=>gufo__ConcreteIndividual(X1))
)).

fof(axiom127,axiom,(
  ![X0]:(gufo__TemporaryRelationshipSituation(X0)=>?[X1]:(gufo__concernsRelatedEndurant(X0,X1)&gufo__Endurant(X1)))
)).

fof(axiom128,axiom,(
  ![X0,X1,X2]:((gufo__isSubQuantityOf(X0,X1)&gufo__isSubQuantityOf(X1,X2))=>gufo__isSubQuantityOf(X0,X2))
)).

fof(axiom129,axiom,(
  ![X]:(gufo__Sortal(X)=>owl__Thing(X))
)).

fof(axiom130,axiom,(
  ![X]:(gufo__IntrinsicMode(X)=>owl__Thing(X))
)).

fof(axiom131,axiom,(
  ![X0,X1]:(gufo__hasBeginPointInXSDDateTimeStamp(X0,X1)=>xds__dateTimeStamp(X1))
)).

fof(axiom132,axiom,(
  ![X,Y]:(gufo__hasBeginPointInXSDDate(X,Y)=>owl__Thing(X))
)).

fof(axiom133,axiom,(
  ![X,Y]:(gufo__hasBeginPointInXSDDate(X,Y)=>rdfs__Literal(Y))
)).

fof(axiom134,axiom,(
  ![X,Y]:(gufo__standsInQualifiedAttribution(X,Y)=>owl__Thing(X))
)).

fof(axiom135,axiom,(
  ![X,Y]:(gufo__standsInQualifiedAttribution(X,Y)=>owl__Thing(Y))
)).

fof(axiom136,axiom,(
  ![X0]:(gufo__Phase(X0)=>gufo__AntiRigidType(X0))
)).

fof(axiom137,axiom,(
  ![X0]:~(gufo__TemporaryInstantiationSituation(X0)&gufo__TemporaryRelationshipSituation(X0))
)).

fof(axiom138,axiom,(
  ![X0,X1]:(gufo__isObjectProperPartOf(X0,X1)=>gufo__Object(X0))
)).

fof(axiom139,axiom,(
  ![X,Y]:(gufo__hasEndPointInXSDDateTimeStamp(X,Y)=>owl__Thing(X))
)).

fof(axiom140,axiom,(
  ![X,Y]:(gufo__hasEndPointInXSDDateTimeStamp(X,Y)=>rdfs__Literal(Y))
)).

fof(axiom141,axiom,(
  ![X0,X1]:(gufo__mediates(X0,X1)=>gufo__Endurant(X1))
)).

fof(axiom142,axiom,(
  ![X0,X1]:(gufo__concernsReifiedQualityValue(X0,X1)=>gufo__QualityValueAttributionSituation(X0))
)).

fof(axiom143,axiom,(
  ![X0,X1]:(gufo__hasQualityValue(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom144,axiom,(
  ![X0,X1]:(gufo__concernsConstitutedEndurant(X0,X1)=>gufo__TemporaryConstitutionSituation(X0))
)).

fof(axiom145,axiom,(
  ![X]:(gufo__Event(X)=>owl__Thing(X))
)).

fof(axiom146,axiom,(
  ![X0]:(gufo__Object(X0)=>gufo__Endurant(X0))
)).

fof(axiom147,axiom,(
  ![X0,X1]:(gufo__hasReifiedQualityValue(X0,X1)=>gufo__QualityValue(X1))
)).

fof(axiom148,axiom,(
  ![X0]:(gufo__QualityValueAttributionSituation(X0)=>((?[X1]:(gufo__concernsReifiedQualityValue(X0,X1)&gufo__QualityValue(X1))&![X2,X3]:((gufo__concernsReifiedQualityValue(X0,X2)&gufo__QualityValue(X2)&gufo__concernsReifiedQualityValue(X0,X3)&gufo__QualityValue(X3))=>~(X2!=X3)))|(?[X4]:(gufo__concernsQualityValue(X0,X4)&rdfs__Literal(X4))&![X5,X6]:((gufo__concernsQualityValue(X0,X5)&rdfs__Literal(X5)&gufo__concernsQualityValue(X0,X6)&rdfs__Literal(X6))=>~(X5!=X6)))))
)).

fof(axiom149,axiom,(
  ![X0,X1,X2]:((gufo__isSubCollectionOf(X0,X1)&gufo__isSubCollectionOf(X1,X2))=>gufo__isSubCollectionOf(X0,X2))
)).

fof(axiom150,axiom,(
  ![X0]:(gufo__EndurantType(X0)<=>(gufo__NonSortal(X0)|gufo__Sortal(X0)))
)).

fof(axiom151,axiom,(
  ![X1]:~(gufo__NonSortal(X1)&gufo__Sortal(X1))
)).

fof(axiom152,axiom,(
  ![X0,X1]:(gufo__concernsTemporaryWhole(X0,X1)=>gufo__Endurant(X1))
)).

fof(axiom153,axiom,(
  ![X]:(gufo__QualityValueAttributionSituation(X)=>owl__Thing(X))
)).

fof(axiom154,axiom,(
  ![X]:(gufo__ExtrinsicMode(X)=>owl__Thing(X))
)).

fof(axiom155,axiom,(
  ![X0,X1]:(gufo__isAspectProperPartOf(X0,X1)=>gufo__Aspect(X0))
)).

fof(axiom156,axiom,(
  ![X0,X1]:(gufo__isAspectProperPartOf(X0,X1)=>gufo__isProperPartOf(X0,X1))
)).

fof(axiom157,axiom,(
  ![X0,X1]:(gufo__isComponentOf(X0,X1)=>gufo__FunctionalComplex(X1))
)).

fof(axiom158,axiom,(
  ![X]:(gufo__TemporaryConstitutionSituation(X)=>owl__Thing(X))
)).

fof(axiom159,axiom,(
  ![X0,X1,X2]:((gufo__hasBeginPointInXSDDate(X0,X1)&gufo__hasBeginPointInXSDDate(X0,X2))=>(X1=X2))
)).

fof(axiom160,axiom,(
  ![X]:(gufo__ConcreteIndividualType(X)=>owl__Thing(X))
)).

fof(axiom161,axiom,(
  ![X0,X1]:(gufo__standsIn(X0,X1)=>gufo__Situation(X1))
)).

fof(axiom162,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedInstantiation(X0,X1)=>gufo__TemporaryInstantiationSituation(X1))
)).

fof(axiom163,axiom,(
  ![X0,X1,X2]:((gufo__hasBeginPointInXSDDateTimeStamp(X0,X1)&gufo__hasBeginPointInXSDDateTimeStamp(X0,X2))=>(X1=X2))
)).

fof(axiom164,axiom,(
  ![X0,X1]:(gufo__hasEndPointInXSDDate(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom165,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedAttribution(X0,X1)=>gufo__standsIn(X0,X1))
)).

fof(axiom166,axiom,(
  ![X0]:~(gufo__AbstractIndividual(X0)&gufo__ConcreteIndividual(X0))
)).

fof(axiom167,axiom,(
  ![X]:(gufo__Category(X)=>owl__Thing(X))
)).

fof(axiom168,axiom,(
  ![X0]:~(gufo__Collection(X0)&gufo__FunctionalComplex(X0))
)).

fof(axiom169,axiom,(
  ![X1]:~(gufo__Collection(X1)&gufo__Quantity(X1))
)).

fof(axiom170,axiom,(
  ![X2]:~(gufo__FunctionalComplex(X2)&gufo__Quantity(X2))
)).

fof(axiom171,axiom,(
  ![X0]:(gufo__TemporaryParthoodSituation(X0)=>(?[X1]:(gufo__standsInQualifiedParthood(X1,X0)&gufo__Endurant(X1))&![X2,X3]:((gufo__standsInQualifiedParthood(X2,X0)&gufo__Endurant(X2)&gufo__standsInQualifiedParthood(X3,X0)&gufo__Endurant(X3))=>~(X2!=X3))))
)).

fof(axiom172,axiom,(
  ![X]:(gufo__ExtrinsicAspect(X)=>owl__Thing(X))
)).

fof(axiom173,axiom,(
  ![X,Y]:(gufo__concernsNonRigidType(X,Y)=>owl__Thing(X))
)).

fof(axiom174,axiom,(
  ![X,Y]:(gufo__concernsNonRigidType(X,Y)=>owl__Thing(Y))
)).

fof(axiom175,axiom,(
  ![X]:(xds__date(X)=>rdfs__Literal(X))
)).

fof(axiom176,axiom,(
  ![X0,X1]:(gufo__hasReifiedQualityValue(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom177,axiom,(
  ![X0]:(gufo__RelationshipType(X0)=>gufo__Type(X0))
)).

fof(axiom178,axiom,(
  ![X0]:(gufo__VariableCollection(X0)=>gufo__Collection(X0))
)).

fof(axiom179,axiom,(
  ![X0,X1]:(gufo__hasEndPointInXSDDate(X0,X1)=>xds__date(X1))
)).

fof(axiom180,axiom,(
  ![X]:(gufo__AbstractIndividualType(X)=>owl__Thing(X))
)).

fof(axiom181,axiom,(
  ![X0]:~(gufo__QualityValueAttributionSituation(X0)&gufo__TemporaryInstantiationSituation(X0))
)).

fof(axiom182,axiom,(
  ![X0]:(gufo__TemporaryInstantiationSituation(X0)=>gufo__Situation(X0))
)).

fof(axiom183,axiom,(
  ![X0]:(gufo__Kind(X0)=>gufo__Sortal(X0))
)).

fof(axiom184,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedParthood(X0,X1)=>gufo__TemporaryParthoodSituation(X1))
)).

fof(axiom185,axiom,(
  ![X]:(gufo__Quality(X)=>owl__Thing(X))
)).

fof(axiom186,axiom,(
  ![X0,X1]:(gufo__wasCreatedIn(X0,X1)=>gufo__Event(X1))
)).

fof(axiom187,axiom,(
  ![X,Y]:(gufo__partitions(X,Y)=>owl__Thing(X))
)).

fof(axiom188,axiom,(
  ![X,Y]:(gufo__partitions(X,Y)=>owl__Thing(Y))
)).

fof(axiom189,axiom,(
  ![X0,X1]:(gufo__isAspectProperPartOf(X0,X1)=>gufo__Aspect(X1))
)).

fof(axiom190,axiom,(
  ![X]:(gufo__VariableCollection(X)=>owl__Thing(X))
)).

fof(axiom191,axiom,(
  ![X0]:~(gufo__EndurantType(X0)&gufo__EventType(X0))
)).

fof(axiom192,axiom,(
  ![X0]:(gufo__Category(X0)=>gufo__RigidType(X0))
)).

fof(axiom193,axiom,(
  ![X0]:(gufo__SubKind(X0)=>gufo__Sortal(X0))
)).

fof(axiom194,axiom,(
  ![X0,X1]:(gufo__categorizes(X0,X1)=>(gufo__Type(X0)&~gufo__AbstractIndividualType(X0)&owl__Thing(X0)&~gufo__ConcreteIndividualType(X0)&owl__Thing(X0)))
)).

fof(axiom195,axiom,(
  ![X0,X1]:(gufo__hasBeginPoint(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom196,axiom,(
  ![X0]:~(gufo__AntiRigidType(X0)&gufo__SemiRigidType(X0))
)).

fof(axiom197,axiom,(
  ![X0,X1]:(gufo__isObjectProperPartOf(X0,X1)=>gufo__Object(X1))
)).

fof(axiom198,axiom,(
  ![X0]:(gufo__Mixin(X0)=>gufo__SemiRigidType(X0))
)).

fof(axiom199,axiom,(
  ![X0,X1]:(gufo__partitions(X0,X1)=>gufo__categorizes(X0,X1))
)).

fof(axiom200,axiom,(
  ![X0]:(gufo__PhaseMixin(X0)=>gufo__AntiRigidType(X0))
)).

fof(axiom201,axiom,(
  ![X0,X1]:(gufo__participatedIn(X0,X1)=>gufo__Object(X0))
)).

fof(axiom202,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedAttribution(X0,X1)=>gufo__QualityValueAttributionSituation(X1))
)).

fof(axiom203,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedConstitution(X0,X1)=>gufo__TemporaryConstitutionSituation(X1))
)).

fof(axiom204,axiom,(
  ![X0,X1]:(gufo__manifestedIn(X0,X1)=>gufo__Event(X1))
)).

fof(axiom205,axiom,(
  ![X]:(gufo__Role(X)=>owl__Thing(X))
)).

fof(axiom206,axiom,(
  ![X0]:(gufo__ConcreteIndividual(X0)<=>(gufo__Endurant(X0)|gufo__Event(X0)|gufo__Situation(X0)))
)).

fof(axiom207,axiom,(
  ![X1]:~(gufo__Endurant(X1)&gufo__Event(X1))
)).

fof(axiom208,axiom,(
  ![X2]:~(gufo__Endurant(X2)&gufo__Situation(X2))
)).

fof(axiom209,axiom,(
  ![X3]:~(gufo__Event(X3)&gufo__Situation(X3))
)).

fof(axiom210,axiom,(
  ![X0,X1]:(gufo__hasEndPointInXSDDateTimeStamp(X0,X1)=>xds__dateTimeStamp(X1))
)).

fof(axiom211,axiom,(
  ![X0]:(gufo__RoleMixin(X0)=>gufo__AntiRigidType(X0))
)).

fof(axiom212,axiom,(
  ![X]:(gufo__FunctionalComplex(X)=>owl__Thing(X))
)).

fof(axiom213,axiom,(
  ![X]:(gufo__ConcreteIndividual(X)=>owl__Thing(X))
)).

fof(axiom214,axiom,(
  ![X,Y]:(gufo__externallyDependsOn(X,Y)=>owl__Thing(X))
)).

fof(axiom215,axiom,(
  ![X,Y]:(gufo__externallyDependsOn(X,Y)=>owl__Thing(Y))
)).

fof(axiom216,axiom,(
  ![X0]:(gufo__PhaseMixin(X0)=>gufo__NonSortal(X0))
)).

fof(axiom217,axiom,(
  ![X]:(gufo__MaterialRelationshipType(X)=>owl__Thing(X))
)).

fof(axiom218,axiom,(
  ![X0]:(gufo__EndurantType(X0)<=>(gufo__NonRigidType(X0)|gufo__RigidType(X0)))
)).

fof(axiom219,axiom,(
  ![X1]:~(gufo__NonRigidType(X1)&gufo__RigidType(X1))
)).

fof(axiom220,axiom,(
  ![X0]:(gufo__FixedCollection(X0)=>gufo__Collection(X0))
)).

fof(axiom221,axiom,(
  ![X]:(gufo__NonSortal(X)=>owl__Thing(X))
)).

fof(axiom222,axiom,(
  ![X0,X1]:(gufo__concernsNonRigidType(X0,X1)=>gufo__TemporaryInstantiationSituation(X0))
)).

fof(axiom223,axiom,(
  ![X,Y]:(gufo__isCollectionMemberOf(X,Y)=>owl__Thing(X))
)).

fof(axiom224,axiom,(
  ![X,Y]:(gufo__isCollectionMemberOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom225,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedRelationship(X0,X1)=>gufo__standsIn(X0,X1))
)).

fof(axiom226,axiom,(
  ![X,Y]:(gufo__hasBeginPoint(X,Y)=>owl__Thing(X))
)).

fof(axiom227,axiom,(
  ![X,Y]:(gufo__hasBeginPoint(X,Y)=>owl__Thing(Y))
)).

fof(axiom228,axiom,(
  ![X0]:~(gufo__AbstractIndividualType(X0)&gufo__RelationshipType(X0))
)).

fof(axiom229,axiom,(
  ![X0,X1,X2]:((gufo__isProperPartOf(X0,X1)&gufo__isProperPartOf(X1,X2))=>gufo__isProperPartOf(X0,X2))
)).

fof(axiom230,axiom,(
  ![X0]:~(gufo__QualityValueAttributionSituation(X0)&gufo__TemporaryRelationshipSituation(X0))
)).

fof(axiom231,axiom,(
  ![X0,X1,X2]:((gufo__hasEndPointInXSDDateTimeStamp(X0,X1)&gufo__hasEndPointInXSDDateTimeStamp(X0,X2))=>(X1=X2))
)).

fof(axiom232,axiom,(
  ![X]:(gufo__QualityValue(X)=>owl__Thing(X))
)).

fof(axiom233,axiom,(
  ![X0]:(gufo__TemporaryConstitutionSituation(X0)=>(?[X1]:(gufo__concernsConstitutedEndurant(X0,X1)&gufo__Object(X1))&![X2,X3]:((gufo__concernsConstitutedEndurant(X0,X2)&gufo__Object(X2)&gufo__concernsConstitutedEndurant(X0,X3)&gufo__Object(X3))=>~(X2!=X3))))
)).

fof(axiom234,axiom,(
  ![X0,X1]:(gufo__hasAssociatedQualityValueType(X0,X1)=>gufo__AbstractIndividualType(X1))
)).

fof(axiom235,axiom,(
  ![X]:(gufo__Quantity(X)=>owl__Thing(X))
)).

fof(axiom236,axiom,(
  ![X0,X1]:(gufo__broughtAbout(X0,X1)=>gufo__Event(X0))
)).

fof(axiom237,axiom,(
  ![X0,X1]:(gufo__concernsQualityValue(X0,X1)=>gufo__QualityValueAttributionSituation(X0))
)).

fof(axiom238,axiom,(
  ![X0]:~(gufo__Kind(X0)&gufo__SubKind(X0))
)).

fof(axiom239,axiom,(
  ![X0]:(gufo__QualityValueAttributionSituation(X0)=>gufo__Situation(X0))
)).

fof(axiom240,axiom,(
  ![X,Y]:(gufo__standsInQualifiedRelationship(X,Y)=>owl__Thing(X))
)).

fof(axiom241,axiom,(
  ![X,Y]:(gufo__standsInQualifiedRelationship(X,Y)=>owl__Thing(Y))
)).

fof(axiom242,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedRelationship(X0,X1)=>gufo__TemporaryRelationshipSituation(X1))
)).

fof(axiom243,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedAttribution(X0,X1)=>gufo__Endurant(X0))
)).

fof(axiom244,axiom,(
  ![X]:(gufo__RelationshipType(X)=>owl__Thing(X))
)).

fof(axiom245,axiom,(
  ![X0]:(gufo__Relator(X0)=>?[X1,X2]:((X1!=X2)&gufo__mediates(X0,X1)&gufo__Endurant(X1)&gufo__mediates(X0,X2)&gufo__Endurant(X2)))
)).

fof(axiom246,axiom,(
  ![X,Y]:(gufo__concernsQualityType(X,Y)=>owl__Thing(X))
)).

fof(axiom247,axiom,(
  ![X,Y]:(gufo__concernsQualityType(X,Y)=>owl__Thing(Y))
)).

fof(axiom248,axiom,(
  ![X0]:(gufo__Collection(X0)<=>(gufo__FixedCollection(X0)|gufo__VariableCollection(X0)))
)).

fof(axiom249,axiom,(
  ![X1]:~(gufo__FixedCollection(X1)&gufo__VariableCollection(X1))
)).

fof(axiom250,axiom,(
  ![X0,X1]:(gufo__isProperPartOf(X0,X1)=>owl__Thing(X0))
)).

fof(axiom251,axiom,(
  ![X,Y]:(gufo__concernsQualityValue(X,Y)=>owl__Thing(X))
)).

fof(axiom252,axiom,(
  ![X,Y]:(gufo__concernsQualityValue(X,Y)=>rdfs__Literal(Y))
)).

fof(axiom253,axiom,(
  ![X0]:(gufo__NonRigidType(X0)<=>(gufo__AntiRigidType(X0)|gufo__SemiRigidType(X0)))
)).

fof(axiom254,axiom,(
  ![X1]:~(gufo__AntiRigidType(X1)&gufo__SemiRigidType(X1))
)).

fof(axiom255,axiom,(
  ![X0]:(gufo__Kind(X0)=>gufo__RigidType(X0))
)).

fof(axiom256,axiom,(
  ![X]:(gufo__EndurantType(X)=>owl__Thing(X))
)).

fof(axiom257,axiom,(
  ![X0]:(gufo__RoleMixin(X0)=>gufo__NonSortal(X0))
)).

fof(axiom258,axiom,(
  ![X0]:(gufo__ConcreteIndividualType(X0)=>gufo__Type(X0))
)).

fof(axiom259,axiom,(
  ![X0,X1]:(gufo__isSubCollectionOf(X0,X1)=>gufo__Collection(X1))
)).

fof(axiom260,axiom,(
  ![X,Y]:(gufo__isSituationProperPartOf(X,Y)=>owl__Thing(X))
)).

fof(axiom261,axiom,(
  ![X,Y]:(gufo__isSituationProperPartOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom262,axiom,(
  ![X,Y]:(gufo__isAspectProperPartOf(X,Y)=>owl__Thing(X))
)).

fof(axiom263,axiom,(
  ![X,Y]:(gufo__isAspectProperPartOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom264,axiom,(
  ![X0]:(gufo__AntiRigidType(X0)=>gufo__NonRigidType(X0))
)).

fof(axiom265,axiom,(
  ![X]:(gufo__Aspect(X)=>owl__Thing(X))
)).

fof(axiom266,axiom,(
  ![X]:(gufo__Phase(X)=>owl__Thing(X))
)).

fof(axiom267,axiom,(
  ![X0]:(gufo__Aspect(X0)=>gufo__Endurant(X0))
)).

fof(axiom268,axiom,(
  ![X0,X1]:(gufo__isDerivedFrom(X0,X1)=>(gufo__ComparativeRelationshipType(X0)|gufo__MaterialRelationshipType(X0)))
)).

fof(axiom269,axiom,(
  ![X0,X1]:(gufo__wasTerminatedIn(X0,X1)=>gufo__Event(X1))
)).

fof(axiom270,axiom,(
  ![X0,X1]:(gufo__hasBeginPointInXSDDate(X0,X1)=>xds__date(X1))
)).

fof(axiom271,axiom,(
  ![X]:(gufo__Kind(X)=>owl__Thing(X))
)).

fof(axiom272,axiom,(
  ![X0,X1]:(gufo__standsIn(X0,X1)=>owl__Thing(X0))
)).

fof(axiom273,axiom,(
  ![X0,X1]:(gufo__categorizes(X0,X1)=>gufo__Type(X1))
)).

fof(axiom274,axiom,(
  ![X]:(gufo__AntiRigidType(X)=>owl__Thing(X))
)).

fof(axiom275,axiom,(
  ![X0,X1]:(gufo__participatedIn(X0,X1)=>gufo__Event(X1))
)).

fof(axiom276,axiom,(
  ![X0,X1]:(gufo__concernsQualityType(X0,X1)=>gufo__QualityValueAttributionSituation(X0))
)).

fof(axiom277,axiom,(
  ![X0,X1]:(gufo__hasAssociatedQualityValueType(X0,X1)=>gufo__EndurantType(X0))
)).

fof(axiom278,axiom,(
  ![X0]:~(gufo__Aspect(X0)&gufo__Object(X0))
)).

fof(axiom279,axiom,(
  ![X,Y]:(gufo__constitutes(X,Y)=>owl__Thing(X))
)).

fof(axiom280,axiom,(
  ![X,Y]:(gufo__constitutes(X,Y)=>owl__Thing(Y))
)).

fof(axiom281,axiom,(
  ![X]:(gufo__Situation(X)=>owl__Thing(X))
)).

fof(axiom282,axiom,(
  ![X0,X1]:(gufo__isCollectionMemberOf(X0,X1)=>gufo__isObjectProperPartOf(X0,X1))
)).

fof(axiom283,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedRelationship(X0,X1)=>gufo__Endurant(X0))
)).

fof(axiom284,axiom,(
  ![X0]:(gufo__EventType(X0)=>gufo__ConcreteIndividualType(X0))
)).

fof(axiom285,axiom,(
  ![X]:(gufo__AbstractIndividual(X)=>owl__Thing(X))
)).

fof(axiom286,axiom,(
  ![X0,X1]:(gufo__hasEndPoint(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom287,axiom,(
  ![X,Y]:(gufo__isSubQuantityOf(X,Y)=>owl__Thing(X))
)).

fof(axiom288,axiom,(
  ![X,Y]:(gufo__isSubQuantityOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom289,axiom,(
  ![X0]:(gufo__IntrinsicMode(X0)=>gufo__IntrinsicAspect(X0))
)).

fof(axiom290,axiom,(
  ![X0]:(gufo__Phase(X0)=>gufo__Sortal(X0))
)).

fof(axiom291,axiom,(
  ![X0]:(gufo__IntrinsicAspect(X0)<=>(gufo__IntrinsicMode(X0)|gufo__Quality(X0)))
)).

fof(axiom292,axiom,(
  ![X1]:~(gufo__IntrinsicMode(X1)&gufo__Quality(X1))
)).

fof(axiom293,axiom,(
  ![X]:(gufo__FixedCollection(X)=>owl__Thing(X))
)).

fof(axiom294,axiom,(
  ![X,Y]:(gufo__standsInQualifiedParthood(X,Y)=>owl__Thing(X))
)).

fof(axiom295,axiom,(
  ![X,Y]:(gufo__standsInQualifiedParthood(X,Y)=>owl__Thing(Y))
)).

fof(axiom296,axiom,(
  ![X0]:(gufo__QualityValueAttributionSituation(X0)=>(?[X1]:(gufo__concernsQualityType(X0,X1)&gufo__EndurantType(X1))&![X2,X3]:((gufo__concernsQualityType(X0,X2)&gufo__EndurantType(X2)&gufo__concernsQualityType(X0,X3)&gufo__EndurantType(X3))=>~(X2!=X3))))
)).

fof(axiom297,axiom,(
  ![X0]:(gufo__Category(X0)=>gufo__NonSortal(X0))
)).

fof(axiom298,axiom,(
  ![X0]:(gufo__Collection(X0)=>gufo__Object(X0))
)).

fof(axiom299,axiom,(
  ![X0]:(time__Instant(X0)=>gufo__AbstractIndividual(X0))
)).

fof(axiom300,axiom,(
  ![X0]:~(gufo__PhaseMixin(X0)&gufo__RoleMixin(X0))
)).

fof(axiom301,axiom,(
  ![X0]:~(gufo__NonRigidType(X0)&gufo__RigidType(X0))
)).

fof(axiom302,axiom,(
  ![X,Y]:(gufo__concernsReifiedQualityValue(X,Y)=>owl__Thing(X))
)).

fof(axiom303,axiom,(
  ![X,Y]:(gufo__concernsReifiedQualityValue(X,Y)=>owl__Thing(Y))
)).

fof(axiom304,axiom,(
  ![X,Y]:(gufo__hasEndPointInXSDDate(X,Y)=>owl__Thing(X))
)).

fof(axiom305,axiom,(
  ![X,Y]:(gufo__hasEndPointInXSDDate(X,Y)=>rdfs__Literal(Y))
)).

fof(axiom306,axiom,(
  ![X,Y]:(gufo__isProperPartOf(X,Y)=>owl__Thing(X))
)).

fof(axiom307,axiom,(
  ![X,Y]:(gufo__isProperPartOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom308,axiom,(
  ![X,Y]:(gufo__hasBeginPointInXSDDateTimeStamp(X,Y)=>owl__Thing(X))
)).

fof(axiom309,axiom,(
  ![X,Y]:(gufo__hasBeginPointInXSDDateTimeStamp(X,Y)=>rdfs__Literal(Y))
)).

fof(axiom310,axiom,(
  ![X,Y]:(gufo__wasCreatedIn(X,Y)=>owl__Thing(X))
)).

fof(axiom311,axiom,(
  ![X,Y]:(gufo__wasCreatedIn(X,Y)=>owl__Thing(Y))
)).

fof(axiom312,axiom,(
  ![X]:(gufo__Relator(X)=>owl__Thing(X))
)).

fof(axiom313,axiom,(
  ![X0,X1]:(gufo__isDerivedFrom(X0,X1)=>gufo__EndurantType(X1))
)).

fof(axiom314,axiom,(
  ![X0,X1,X2]:((gufo__isAspectProperPartOf(X0,X1)&gufo__isAspectProperPartOf(X1,X2))=>gufo__isAspectProperPartOf(X0,X2))
)).

fof(axiom315,axiom,(
  ![X,Y]:(gufo__concernsConstitutedEndurant(X,Y)=>owl__Thing(X))
)).

fof(axiom316,axiom,(
  ![X,Y]:(gufo__concernsConstitutedEndurant(X,Y)=>owl__Thing(Y))
)).

fof(axiom317,axiom,(
  ![X,Y]:(gufo__hasAssociatedQualityValueType(X,Y)=>owl__Thing(X))
)).

fof(axiom318,axiom,(
  ![X,Y]:(gufo__hasAssociatedQualityValueType(X,Y)=>owl__Thing(Y))
)).

fof(axiom319,axiom,(
  ![X,Y]:(gufo__wasTerminatedIn(X,Y)=>owl__Thing(X))
)).

fof(axiom320,axiom,(
  ![X,Y]:(gufo__wasTerminatedIn(X,Y)=>owl__Thing(Y))
)).

fof(axiom321,axiom,(
  ![X0]:~(gufo__FixedCollection(X0)&gufo__VariableCollection(X0))
)).

fof(axiom322,axiom,(
  ![X0,X1]:(gufo__concernsNonRigidType(X0,X1)=>gufo__NonRigidType(X1))
)).

fof(axiom323,axiom,(
  ![X0]:(gufo__Situation(X0)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom324,axiom,(
  ![X0]:~(gufo__Phase(X0)&gufo__Role(X0))
)).

fof(axiom325,axiom,(
  ![X0]:(gufo__ComparativeRelationshipType(X0)=>gufo__RelationshipType(X0))
)).

fof(axiom326,axiom,(
  ![X0,X1]:(gufo__isSubQuantityOf(X0,X1)=>gufo__Quantity(X1))
)).

fof(axiom327,axiom,(
  ![X0]:(gufo__Endurant(X0)<=>(gufo__Aspect(X0)|gufo__Object(X0)))
)).

fof(axiom328,axiom,(
  ![X1]:~(gufo__Aspect(X1)&gufo__Object(X1))
)).

fof(axiom329,axiom,(
  ![X0,X1]:(gufo__hasBeginPoint(X0,X1)=>time__Instant(X1))
)).

fof(axiom330,axiom,(
  ![X0]:~(gufo__IntrinsicMode(X0)&gufo__Quality(X0))
)).

fof(axiom331,axiom,(
  ![X]:(gufo__ComparativeRelationshipType(X)=>owl__Thing(X))
)).

fof(axiom332,axiom,(
  ![X]:(gufo__PhaseMixin(X)=>owl__Thing(X))
)).

fof(axiom333,axiom,(
  ![X0]:(gufo__SituationType(X0)=>gufo__ConcreteIndividualType(X0))
)).

fof(axiom334,axiom,(
  ![X0]:(gufo__MaterialRelationshipType(X0)=>gufo__RelationshipType(X0))
)).

fof(axiom335,axiom,(
  ![X0]:(gufo__Quantity(X0)=>gufo__Object(X0))
)).

fof(axiom336,axiom,(
  ![X0]:~(gufo__TemporaryConstitutionSituation(X0)&gufo__TemporaryRelationshipSituation(X0))
)).

fof(axiom337,axiom,(
  ![X0]:(gufo__RigidType(X0)=>gufo__EndurantType(X0))
)).

fof(axiom338,axiom,(
  ![X0]:~(gufo__AbstractIndividualType(X0)&gufo__ConcreteIndividualType(X0))
)).

fof(axiom339,axiom,(
  ![X0]:(gufo__Quality(X0)=>gufo__IntrinsicAspect(X0))
)).

fof(axiom340,axiom,(
  ![X0]:(gufo__ExtrinsicMode(X0)=>gufo__ExtrinsicAspect(X0))
)).

fof(axiom341,axiom,(
  ![X0,X1]:(gufo__externallyDependsOn(X0,X1)=>gufo__ExtrinsicMode(X0))
)).

fof(axiom342,axiom,(
  ![X0]:~gufo__inheresIn(X0,X0)
)).

fof(axiom343,axiom,(
  ![X0]:(gufo__Aspect(X0)<=>(gufo__ExtrinsicAspect(X0)|gufo__IntrinsicAspect(X0)))
)).

fof(axiom344,axiom,(
  ![X1]:~(gufo__ExtrinsicAspect(X1)&gufo__IntrinsicAspect(X1))
)).

fof(axiom345,axiom,(
  ![X0]:(gufo__ExtrinsicMode(X0)=>(?[X1]:(gufo__inheresIn(X0,X1)&gufo__ConcreteIndividual(X1))&![X2,X3]:((gufo__inheresIn(X0,X2)&gufo__ConcreteIndividual(X2)&gufo__inheresIn(X0,X3)&gufo__ConcreteIndividual(X3))=>~(X2!=X3))))
)).

fof(axiom346,axiom,(
  ![X0,X1,X2]:((gufo__concernsRelatedEndurant(X0,X1)&gufo__concernsRelatedEndurant(X0,X2))=>(X1=X2))
)).

fof(axiom347,axiom,(
  ![X0]:~(gufo__QualityValueAttributionSituation(X0)&gufo__TemporaryConstitutionSituation(X0))
)).

fof(axiom348,axiom,(
  ![X0]:(gufo__Endurant(X0)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom349,axiom,(
  ![X0,X1]:~(gufo__mediates(X0,X1)&gufo__mediates(X1,X0))
)).

fof(axiom350,axiom,(
  ![X,Y]:(gufo__concernsTemporaryWhole(X,Y)=>owl__Thing(X))
)).

fof(axiom351,axiom,(
  ![X,Y]:(gufo__concernsTemporaryWhole(X,Y)=>owl__Thing(Y))
)).

fof(axiom352,axiom,(
  ![X0,X1]:(gufo__inheresIn(X0,X1)=>gufo__ConcreteIndividual(X1))
)).

fof(axiom353,axiom,(
  ![X0,X1]:(gufo__wasCreatedIn(X0,X1)=>gufo__Endurant(X0))
)).

fof(axiom354,axiom,(
  ![X,Y]:(gufo__manifestedIn(X,Y)=>owl__Thing(X))
)).

fof(axiom355,axiom,(
  ![X,Y]:(gufo__manifestedIn(X,Y)=>owl__Thing(Y))
)).

fof(axiom356,axiom,(
  ![X0]:(gufo__TemporaryInstantiationSituation(X0)=>(?[X1]:(gufo__concernsNonRigidType(X0,X1)&gufo__NonRigidType(X1))&![X2,X3]:((gufo__concernsNonRigidType(X0,X2)&gufo__NonRigidType(X2)&gufo__concernsNonRigidType(X0,X3)&gufo__NonRigidType(X3))=>~(X2!=X3))))
)).

fof(axiom357,axiom,(
  ![X0,X1]:(gufo__concernsReifiedQualityValue(X0,X1)=>gufo__QualityValue(X1))
)).

fof(axiom358,axiom,(
  ![X]:(gufo__NonRigidType(X)=>owl__Thing(X))
)).

fof(axiom359,axiom,(
  ![X0]:(gufo__IntrinsicAspect(X0)=>(?[X1]:(gufo__inheresIn(X0,X1)&gufo__ConcreteIndividual(X1))&![X2,X3]:((gufo__inheresIn(X0,X2)&gufo__ConcreteIndividual(X2)&gufo__inheresIn(X0,X3)&gufo__ConcreteIndividual(X3))=>~(X2!=X3))))
)).

fof(axiom360,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedParthood(X0,X1)=>gufo__standsIn(X0,X1))
)).

fof(axiom361,axiom,(
  ![X0]:~gufo__mediates(X0,X0)
)).

fof(axiom362,axiom,(
  ![X]:(gufo__TemporaryInstantiationSituation(X)=>owl__Thing(X))
)).

fof(axiom363,axiom,(
  ![X0,X1]:(gufo__isEventProperPartOf(X0,X1)=>gufo__Event(X0))
)).

fof(axiom364,axiom,(
  ![X,Y]:(gufo__hasQualityValue(X,Y)=>owl__Thing(X))
)).

fof(axiom365,axiom,(
  ![X,Y]:(gufo__hasQualityValue(X,Y)=>rdfs__Literal(Y))
)).

fof(axiom366,axiom,(
  ![X]:(gufo__Endurant(X)=>owl__Thing(X))
)).

fof(axiom367,axiom,(
  ![X,Y]:(gufo__concernsRelationshipType(X,Y)=>owl__Thing(X))
)).

fof(axiom368,axiom,(
  ![X,Y]:(gufo__concernsRelationshipType(X,Y)=>owl__Thing(Y))
)).

fof(axiom369,axiom,(
  ![X0,X1]:(gufo__isSituationProperPartOf(X0,X1)=>gufo__Situation(X0))
)).

fof(axiom370,axiom,(
  ![X0,X1]:~(gufo__inheresIn(X0,X1)&gufo__inheresIn(X1,X0))
)).

fof(axiom371,axiom,(
  ![X]:(gufo__RigidType(X)=>owl__Thing(X))
)).

fof(axiom372,axiom,(
  ![X]:(gufo__TemporaryRelationshipSituation(X)=>owl__Thing(X))
)).

fof(axiom373,axiom,(
  ![X0]:(gufo__Participation(X0)=>gufo__Event(X0))
)).

fof(axiom374,axiom,(
  ![X0]:~(gufo__TemporaryParthoodSituation(X0)&gufo__TemporaryRelationshipSituation(X0))
)).

fof(axiom375,axiom,(
  ![X0]:~(gufo__EndurantType(X0)&gufo__SituationType(X0))
)).

fof(axiom376,axiom,(
  ![X0,X1,X2]:((gufo__hasEndPointInXSDDate(X0,X1)&gufo__hasEndPointInXSDDate(X0,X2))=>(X1=X2))
)).

fof(axiom377,axiom,(
  ![X0]:(gufo__IntrinsicAspect(X0)=>gufo__Aspect(X0))
)).

fof(axiom378,axiom,(
  ![X,Y]:(gufo__standsIn(X,Y)=>owl__Thing(X))
)).

fof(axiom379,axiom,(
  ![X,Y]:(gufo__standsIn(X,Y)=>owl__Thing(Y))
)).

fof(axiom380,axiom,(
  ![X0,X1]:(gufo__isSubQuantityOf(X0,X1)=>gufo__Quantity(X0))
)).

fof(axiom381,axiom,(
  ![X]:(gufo__Participation(X)=>owl__Thing(X))
)).

fof(axiom382,axiom,(
  ![X,Y]:(gufo__hasReifiedQualityValue(X,Y)=>owl__Thing(X))
)).

fof(axiom383,axiom,(
  ![X,Y]:(gufo__hasReifiedQualityValue(X,Y)=>owl__Thing(Y))
)).

fof(axiom384,axiom,(
  ![X]:(gufo__TemporaryParthoodSituation(X)=>owl__Thing(X))
)).

fof(axiom385,axiom,(
  ![X,Y]:(gufo__concernsRelatedEndurant(X,Y)=>owl__Thing(X))
)).

fof(axiom386,axiom,(
  ![X,Y]:(gufo__concernsRelatedEndurant(X,Y)=>owl__Thing(Y))
)).

fof(axiom387,axiom,(
  ![X0]:(gufo__TemporaryRelationshipSituation(X0)=>(?[X1]:(gufo__concernsRelationshipType(X0,X1)&gufo__RelationshipType(X1))&![X2,X3]:((gufo__concernsRelationshipType(X0,X2)&gufo__RelationshipType(X2)&gufo__concernsRelationshipType(X0,X3)&gufo__RelationshipType(X3))=>~(X2!=X3))))
)).

fof(axiom388,axiom,(
  ![X0,X1,X2]:((gufo__concernsReifiedQualityValue(X0,X1)&gufo__concernsReifiedQualityValue(X0,X2))=>(X1=X2))
)).

fof(axiom389,axiom,(
  ![X,Y]:(gufo__isDerivedFrom(X,Y)=>owl__Thing(X))
)).

fof(axiom390,axiom,(
  ![X,Y]:(gufo__isDerivedFrom(X,Y)=>owl__Thing(Y))
)).

fof(axiom391,axiom,(
  ![X0,X1]:(gufo__broughtAbout(X0,X1)=>gufo__Situation(X1))
)).

fof(axiom392,axiom,(
  ![X,Y]:(gufo__isComponentOf(X,Y)=>owl__Thing(X))
)).

fof(axiom393,axiom,(
  ![X,Y]:(gufo__isComponentOf(X,Y)=>owl__Thing(Y))
)).

fof(axiom394,axiom,(
  ![X0,X1]:(gufo__concernsConstitutedEndurant(X0,X1)=>gufo__Endurant(X1))
)).

fof(axiom395,axiom,(
  ![X0]:(gufo__FunctionalComplex(X0)=>gufo__Object(X0))
)).

fof(axiom396,axiom,(
  ![X0]:(gufo__Role(X0)=>gufo__AntiRigidType(X0))
)).

fof(axiom397,axiom,(
  ![X0,X1]:(gufo__hasBeginPointInXSDDate(X0,X1)=>gufo__ConcreteIndividual(X0))
)).

fof(axiom398,axiom,(
  ![X0,X1]:(gufo__isProperPartOf(X0,X1)=>owl__Thing(X1))
)).

fof(axiom399,axiom,(
  ![X0]:(gufo__TemporaryConstitutionSituation(X0)=>(?[X1]:(gufo__standsInQualifiedConstitution(X1,X0)&gufo__Object(X1))&![X2,X3]:((gufo__standsInQualifiedConstitution(X2,X0)&gufo__Object(X2)&gufo__standsInQualifiedConstitution(X3,X0)&gufo__Object(X3))=>~(X2!=X3))))
)).

fof(axiom400,axiom,(
  ![X0]:(gufo__Role(X0)=>gufo__Sortal(X0))
)).

fof(axiom401,axiom,(
  ![X0,X1]:(gufo__isSubCollectionOf(X0,X1)=>gufo__Collection(X0))
)).

fof(axiom402,axiom,(
  ![X,Y]:(gufo__participatedIn(X,Y)=>owl__Thing(X))
)).

fof(axiom403,axiom,(
  ![X,Y]:(gufo__participatedIn(X,Y)=>owl__Thing(Y))
)).

fof(axiom404,axiom,(
  ![X0]:(gufo__SubKind(X0)=>gufo__RigidType(X0))
)).

fof(axiom405,axiom,(
  ![X0,X1]:(gufo__standsInQualifiedConstitution(X0,X1)=>gufo__standsIn(X0,X1))
)).

fof(axiom406,axiom,(
  ![X]:(gufo__Type(X)=>owl__Thing(X))
)).

fof(axiom407,axiom,(
  ![X0]:(gufo__TemporaryParthoodSituation(X0)=>gufo__Situation(X0))
)).

fof(axiom408,axiom,(
  ![X]:(gufo__Collection(X)=>owl__Thing(X))
)).

fof(axiom409,axiom,(
  ![X0]:(gufo__SemiRigidType(X0)=>gufo__NonRigidType(X0))
)).

fof(axiom410,axiom,(
  ![X0,X1]:(gufo__concernsRelationshipType(X0,X1)=>gufo__RelationshipType(X1))
)).

fof(axiom411,axiom,(
  ![X0]:~(gufo__ConcreteIndividualType(X0)&gufo__RelationshipType(X0))
)).

fof(axiom412,axiom,(
  ![X0,X1]:(gufo__isCollectionMemberOf(X0,X1)=>gufo__Object(X0))
)).

fof(axiom413,axiom,(
  ![X0]:(gufo__TemporaryRelationshipSituation(X0)=>(?[X1]:(gufo__standsInQualifiedRelationship(X1,X0)&gufo__Endurant(X1))&![X2,X3]:((gufo__standsInQualifiedRelationship(X2,X0)&gufo__Endurant(X2)&gufo__standsInQualifiedRelationship(X3,X0)&gufo__Endurant(X3))=>~(X2!=X3))))
)).

fof(axiom414,axiom,(
  ![X]:(gufo__SituationType(X)=>owl__Thing(X))
)).

fof(axiom415,axiom,(
  ![X,Y]:(gufo__historicallyDependsOn(X,Y)=>owl__Thing(X))
)).

fof(axiom416,axiom,(
  ![X,Y]:(gufo__historicallyDependsOn(X,Y)=>owl__Thing(Y))
)).
