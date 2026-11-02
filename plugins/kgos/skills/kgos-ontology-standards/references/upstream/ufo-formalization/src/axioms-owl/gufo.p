fof(axiom0,axiom,(
  ![X]:(http___www_w3_org_2002_07_owl_Thing(X)|http___www_w3_org_2000_01_rdf_schema_Literal(X)))
).

fof(axiom1,axiom,(
  ![X]:(http___www_w3_org_2002_07_owl_Thing(X)=>~http___www_w3_org_2000_01_rdf_schema_Literal(X)))
).

fof(axiom2,axiom,(
  ?[X]:http___www_w3_org_2002_07_owl_Thing(X))
).

fof(axiom3,axiom,(
  ?[X]:http___www_w3_org_2000_01_rdf_schema_Literal(X))
).

fof(axiom4,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_minExclusive(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom5,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_fractionDigits(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom6,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_pattern(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom7,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_minLength(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom8,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_minInclusive(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom9,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_totalDigits(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom10,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_length(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom11,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_maxExclusive(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom12,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_maxLength(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom13,axiom,(
  ![X,Y]:(http___www_w3_org_1999_02_22_rdf_syntax_ns_langRange(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom14,axiom,(
  ![X,Y]:(http___www_w3_org_2001_XMLSchema_maxInclusive(X,Y)=>(http___www_w3_org_2000_01_rdf_schema_Literal(X)&http___www_w3_org_2000_01_rdf_schema_Literal(Y))))
).

fof(axiom15,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasValueComponent(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom16,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasValueComponent(X,Y)=>http___www_w3_org_2000_01_rdf_schema_Literal(Y)))
).

fof(axiom17,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom18,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)&http___purl_org_nemo_gufo_isObjectProperPartOf(X1,X2))=>http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X2)))
).

fof(axiom19,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_ComparativeRelationshipType(X0)&http___purl_org_nemo_gufo_MaterialRelationshipType(X0)))
).

fof(axiom20,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryParthoodSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_concernsTemporaryWhole(X0,X1)&http___purl_org_nemo_gufo_Endurant(X1))&![X2,X3]:((http___purl_org_nemo_gufo_concernsTemporaryWhole(X0,X2)&http___purl_org_nemo_gufo_Endurant(X2)&http___purl_org_nemo_gufo_concernsTemporaryWhole(X0,X3)&http___purl_org_nemo_gufo_Endurant(X3))=>~(X2!=X3)))))
).

fof(axiom21,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Mixin(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom22,axiom,(
  ![X]:(http___purl_org_nemo_gufo_RoleMixin(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom23,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_NonSortal(X0)&http___purl_org_nemo_gufo_Sortal(X0)))
).

fof(axiom24,axiom,(
  ![X]:(http___purl_org_nemo_gufo_IntrinsicAspect(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom25,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasEndPointInXSDDateTimeStamp(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom26,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isEventProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom27,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isEventProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom28,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_Endurant(X0)&http___purl_org_nemo_gufo_Event(X0)))
).

fof(axiom29,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_Endurant(X1)&http___purl_org_nemo_gufo_Situation(X1)))
).

fof(axiom30,axiom,(
  ![X2]:~(http___purl_org_nemo_gufo_Event(X2)&http___purl_org_nemo_gufo_Situation(X2)))
).

fof(axiom31,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Sortal(X0)=>http___purl_org_nemo_gufo_EndurantType(X0)))
).

fof(axiom32,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_EndurantType(X0)=>http___purl_org_nemo_gufo_ConcreteIndividualType(X0)))
).

fof(axiom33,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_EventType(X0)&http___purl_org_nemo_gufo_SituationType(X0)))
).

fof(axiom34,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isComponentOf(X0,X1)=>http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom35,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_concernsNonRigidType(X0,X1)&http___purl_org_nemo_gufo_concernsNonRigidType(X0,X2))=>(X1=X2)))
).

fof(axiom36,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Relator(X0)=>http___purl_org_nemo_gufo_ExtrinsicAspect(X0)))
).

fof(axiom37,axiom,(
  ![X]:(http___purl_org_nemo_gufo_EventType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom38,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Event(X0)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom39,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasEndPoint(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom40,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasEndPoint(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom41,axiom,(
  ![X]:(http___purl_org_nemo_gufo_SubKind(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom42,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X0)&http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)))
).

fof(axiom43,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Object(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom44,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedParthood(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom45,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_NonSortal(X0)=>http___purl_org_nemo_gufo_EndurantType(X0)))
).

fof(axiom46,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_mediates(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom47,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_mediates(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom48,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSubCollectionOf(X0,X1)=>http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)))
).

fof(axiom49,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_contributedToTrigger(X0,X1)=>http___purl_org_nemo_gufo_Event(X1)))
).

fof(axiom50,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_ExtrinsicMode(X0)&http___purl_org_nemo_gufo_Relator(X0)))
).

fof(axiom51,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_constitutes(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X1)))
).

fof(axiom52,axiom,(
  ![X]:(http___purl_org_nemo_gufo_SemiRigidType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom53,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X0,X1)=>http___purl_org_nemo_gufo_standsIn(X0,X1)))
).

fof(axiom54,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_broughtAbout(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom55,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_broughtAbout(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom56,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_ExtrinsicAspect(X0)&http___purl_org_nemo_gufo_IntrinsicAspect(X0)))
).

fof(axiom57,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_Individual(X0)&http___purl_org_nemo_gufo_Type(X0)))
).

fof(axiom58,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_isProperPartOf(X0,X1)))
).

fof(axiom59,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ConcreteIndividual(X0)=>http___purl_org_nemo_gufo_Individual(X0)))
).

fof(axiom60,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)=>http___purl_org_nemo_gufo_Situation(X0)))
).

fof(axiom61,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_inheresIn(X0,X1)=>http___purl_org_nemo_gufo_Aspect(X0)))
).

fof(axiom62,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isCollectionMemberOf(X0,X1)=>http___purl_org_nemo_gufo_Collection(X1)))
).

fof(axiom63,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Individual(X0)<=>(http___purl_org_nemo_gufo_AbstractIndividual(X0)|http___purl_org_nemo_gufo_ConcreteIndividual(X0))))
).

fof(axiom64,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_AbstractIndividual(X1)&http___purl_org_nemo_gufo_ConcreteIndividual(X1)))
).

fof(axiom65,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_inheresIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom66,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_inheresIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom67,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ExtrinsicAspect(X0)=>http___purl_org_nemo_gufo_Aspect(X0)))
).

fof(axiom68,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_historicallyDependsOn(X0,X1)&http___purl_org_nemo_gufo_historicallyDependsOn(X1,X2))=>http___purl_org_nemo_gufo_historicallyDependsOn(X0,X2)))
).

fof(axiom69,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Mixin(X0)=>http___purl_org_nemo_gufo_NonSortal(X0)))
).

fof(axiom70,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_concernsRelationshipType(X0,X1)&http___purl_org_nemo_gufo_concernsRelationshipType(X0,X2))=>(X1=X2)))
).

fof(axiom71,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_inheresIn(X0,X1)&http___purl_org_nemo_gufo_inheresIn(X0,X2))=>(X1=X2)))
).

fof(axiom72,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Individual(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom73,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isEventProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Event(X1)))
).

fof(axiom74,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isObjectProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom75,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isObjectProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom76,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X0)=>http___purl_org_nemo_gufo_Situation(X0)))
).

fof(axiom77,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsRelationshipType(X0,X1)=>http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)))
).

fof(axiom78,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_concernsTemporaryWhole(X0,X1)&http___purl_org_nemo_gufo_concernsTemporaryWhole(X0,X2))=>(X1=X2)))
).

fof(axiom79,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsQualityType(X0,X1)=>http___purl_org_nemo_gufo_EndurantType(X1)))
).

fof(axiom80,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X1,X0)&http___purl_org_nemo_gufo_Endurant(X1))&![X2,X3]:((http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X2,X0)&http___purl_org_nemo_gufo_Endurant(X2)&http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X3,X0)&http___purl_org_nemo_gufo_Endurant(X3))=>~(X2!=X3)))))
).

fof(axiom81,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedConstitution(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom82,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedConstitution(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom83,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsRelatedEndurant(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X1)))
).

fof(axiom84,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_contributedToTrigger(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom85,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_contributedToTrigger(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom86,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)&http___purl_org_nemo_gufo_TemporaryParthoodSituation(X0)))
).

fof(axiom87,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_QualityValue(X0)=>http___purl_org_nemo_gufo_AbstractIndividual(X0)))
).

fof(axiom88,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_AbstractIndividual(X0)=>http___purl_org_nemo_gufo_Individual(X0)))
).

fof(axiom89,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_mediates(X0,X1)=>http___purl_org_nemo_gufo_Relator(X0)))
).

fof(axiom90,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_historicallyDependsOn(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom91,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ExtrinsicAspect(X0)<=>(http___purl_org_nemo_gufo_ExtrinsicMode(X0)|http___purl_org_nemo_gufo_Relator(X0))))
).

fof(axiom92,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_ExtrinsicMode(X1)&http___purl_org_nemo_gufo_Relator(X1)))
).

fof(axiom93,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_isEventProperPartOf(X0,X1)&http___purl_org_nemo_gufo_isEventProperPartOf(X1,X2))=>http___purl_org_nemo_gufo_isEventProperPartOf(X0,X2)))
).

fof(axiom94,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_AbstractIndividualType(X0)=>http___purl_org_nemo_gufo_Type(X0)))
).

fof(axiom95,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Participation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_participatedIn(X1,X0)&http___purl_org_nemo_gufo_Object(X1))&![X2,X3]:((http___purl_org_nemo_gufo_participatedIn(X2,X0)&http___purl_org_nemo_gufo_Object(X2)&http___purl_org_nemo_gufo_participatedIn(X3,X0)&http___purl_org_nemo_gufo_Object(X3))=>~(X2!=X3)))))
).

fof(axiom96,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_externallyDependsOn(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X1)))
).

fof(axiom97,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom98,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom99,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDateTimeStamp(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom100,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_constitutes(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom101,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_partitions(X0,X1)=>(http___purl_org_nemo_gufo_Type(X0)&~http___purl_org_nemo_gufo_AbstractIndividualType(X0)&http___www_w3_org_2002_07_owl_Thing(X0)&~http___purl_org_nemo_gufo_ConcreteIndividualType(X0)&http___www_w3_org_2002_07_owl_Thing(X0))))
).

fof(axiom102,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSituationProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_isProperPartOf(X0,X1)))
).

fof(axiom103,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedConstitution(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom104,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)&http___purl_org_nemo_gufo_TemporaryParthoodSituation(X0)))
).

fof(axiom105,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_NonRigidType(X0)=>http___purl_org_nemo_gufo_EndurantType(X0)))
).

fof(axiom106,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSituationProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Situation(X1)))
).

fof(axiom107,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsTemporaryWhole(X0,X1)=>http___purl_org_nemo_gufo_TemporaryParthoodSituation(X0)))
).

fof(axiom108,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSubQuantityOf(X0,X1)=>http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)))
).

fof(axiom109,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ExtrinsicMode(X0)=>?[X1]:(http___purl_org_nemo_gufo_externallyDependsOn(X0,X1)&http___purl_org_nemo_gufo_ConcreteIndividual(X1))))
).

fof(axiom110,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsRelatedEndurant(X0,X1)=>http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)))
).

fof(axiom111,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_standsInQualifiedAttribution(X1,X0)&http___purl_org_nemo_gufo_Endurant(X1))&![X2,X3]:((http___purl_org_nemo_gufo_standsInQualifiedAttribution(X2,X0)&http___purl_org_nemo_gufo_Endurant(X2)&http___purl_org_nemo_gufo_standsInQualifiedAttribution(X3,X0)&http___purl_org_nemo_gufo_Endurant(X3))=>~(X2!=X3)))))
).

fof(axiom112,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_wasTerminatedIn(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom113,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasValueComponent(X0,X1)=>http___purl_org_nemo_gufo_QualityValue(X0)))
).

fof(axiom114,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_concernsQualityType(X0,X1)&http___purl_org_nemo_gufo_concernsQualityType(X0,X2))=>(X1=X2)))
).

fof(axiom115,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_categorizes(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom116,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_categorizes(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom117,axiom,(
  ![X0]:~http___purl_org_nemo_gufo_externallyDependsOn(X0,X0))
).

fof(axiom118,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isComponentOf(X0,X1)=>http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)))
).

fof(axiom119,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasEndPoint(X0,X1)=>http___www_w3_org_2006_time_Instant(X1)))
).

fof(axiom120,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_contributedToTrigger(X0,X1)=>http___purl_org_nemo_gufo_Situation(X0)))
).

fof(axiom121,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_manifestedIn(X0,X1)=>http___purl_org_nemo_gufo_Aspect(X0)))
).

fof(axiom122,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isSubCollectionOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom123,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isSubCollectionOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom124,axiom,(
  ![X]:(http___www_w3_org_2006_time_Instant(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom125,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isEventProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_isProperPartOf(X0,X1)))
).

fof(axiom126,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_historicallyDependsOn(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X1)))
).

fof(axiom127,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)=>?[X1]:(http___purl_org_nemo_gufo_concernsRelatedEndurant(X0,X1)&http___purl_org_nemo_gufo_Endurant(X1))))
).

fof(axiom128,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_isSubQuantityOf(X0,X1)&http___purl_org_nemo_gufo_isSubQuantityOf(X1,X2))=>http___purl_org_nemo_gufo_isSubQuantityOf(X0,X2)))
).

fof(axiom129,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Sortal(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom130,axiom,(
  ![X]:(http___purl_org_nemo_gufo_IntrinsicMode(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom131,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDateTimeStamp(X0,X1)=>http___www_w3_org_2001_XMLSchema_dateTimeStamp(X1)))
).

fof(axiom132,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDate(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom133,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDate(X,Y)=>http___www_w3_org_2000_01_rdf_schema_Literal(Y)))
).

fof(axiom134,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedAttribution(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom135,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedAttribution(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom136,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Phase(X0)=>http___purl_org_nemo_gufo_AntiRigidType(X0)))
).

fof(axiom137,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)&http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)))
).

fof(axiom138,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom139,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasEndPointInXSDDateTimeStamp(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom140,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasEndPointInXSDDateTimeStamp(X,Y)=>http___www_w3_org_2000_01_rdf_schema_Literal(Y)))
).

fof(axiom141,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_mediates(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X1)))
).

fof(axiom142,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsReifiedQualityValue(X0,X1)=>http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)))
).

fof(axiom143,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasQualityValue(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom144,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsConstitutedEndurant(X0,X1)=>http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X0)))
).

fof(axiom145,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Event(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom146,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Object(X0)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom147,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasReifiedQualityValue(X0,X1)=>http___purl_org_nemo_gufo_QualityValue(X1)))
).

fof(axiom148,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)=>((?[X1]:(http___purl_org_nemo_gufo_concernsReifiedQualityValue(X0,X1)&http___purl_org_nemo_gufo_QualityValue(X1))&![X2,X3]:((http___purl_org_nemo_gufo_concernsReifiedQualityValue(X0,X2)&http___purl_org_nemo_gufo_QualityValue(X2)&http___purl_org_nemo_gufo_concernsReifiedQualityValue(X0,X3)&http___purl_org_nemo_gufo_QualityValue(X3))=>~(X2!=X3)))|(?[X4]:(http___purl_org_nemo_gufo_concernsQualityValue(X0,X4)&http___www_w3_org_2000_01_rdf_schema_Literal(X4))&![X5,X6]:((http___purl_org_nemo_gufo_concernsQualityValue(X0,X5)&http___www_w3_org_2000_01_rdf_schema_Literal(X5)&http___purl_org_nemo_gufo_concernsQualityValue(X0,X6)&http___www_w3_org_2000_01_rdf_schema_Literal(X6))=>~(X5!=X6))))))
).

fof(axiom149,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_isSubCollectionOf(X0,X1)&http___purl_org_nemo_gufo_isSubCollectionOf(X1,X2))=>http___purl_org_nemo_gufo_isSubCollectionOf(X0,X2)))
).

fof(axiom150,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_EndurantType(X0)<=>(http___purl_org_nemo_gufo_NonSortal(X0)|http___purl_org_nemo_gufo_Sortal(X0))))
).

fof(axiom151,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_NonSortal(X1)&http___purl_org_nemo_gufo_Sortal(X1)))
).

fof(axiom152,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsTemporaryWhole(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X1)))
).

fof(axiom153,axiom,(
  ![X]:(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom154,axiom,(
  ![X]:(http___purl_org_nemo_gufo_ExtrinsicMode(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom155,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isAspectProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Aspect(X0)))
).

fof(axiom156,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isAspectProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_isProperPartOf(X0,X1)))
).

fof(axiom157,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isComponentOf(X0,X1)=>http___purl_org_nemo_gufo_FunctionalComplex(X1)))
).

fof(axiom158,axiom,(
  ![X]:(http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom159,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_hasBeginPointInXSDDate(X0,X1)&http___purl_org_nemo_gufo_hasBeginPointInXSDDate(X0,X2))=>(X1=X2)))
).

fof(axiom160,axiom,(
  ![X]:(http___purl_org_nemo_gufo_ConcreteIndividualType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom161,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsIn(X0,X1)=>http___purl_org_nemo_gufo_Situation(X1)))
).

fof(axiom162,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedInstantiation(X0,X1)=>http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X1)))
).

fof(axiom163,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_hasBeginPointInXSDDateTimeStamp(X0,X1)&http___purl_org_nemo_gufo_hasBeginPointInXSDDateTimeStamp(X0,X2))=>(X1=X2)))
).

fof(axiom164,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasEndPointInXSDDate(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom165,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedAttribution(X0,X1)=>http___purl_org_nemo_gufo_standsIn(X0,X1)))
).

fof(axiom166,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_AbstractIndividual(X0)&http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom167,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Category(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom168,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_Collection(X0)&http___purl_org_nemo_gufo_FunctionalComplex(X0)))
).

fof(axiom169,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_Collection(X1)&http___purl_org_nemo_gufo_Quantity(X1)))
).

fof(axiom170,axiom,(
  ![X2]:~(http___purl_org_nemo_gufo_FunctionalComplex(X2)&http___purl_org_nemo_gufo_Quantity(X2)))
).

fof(axiom171,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryParthoodSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_standsInQualifiedParthood(X1,X0)&http___purl_org_nemo_gufo_Endurant(X1))&![X2,X3]:((http___purl_org_nemo_gufo_standsInQualifiedParthood(X2,X0)&http___purl_org_nemo_gufo_Endurant(X2)&http___purl_org_nemo_gufo_standsInQualifiedParthood(X3,X0)&http___purl_org_nemo_gufo_Endurant(X3))=>~(X2!=X3)))))
).

fof(axiom172,axiom,(
  ![X]:(http___purl_org_nemo_gufo_ExtrinsicAspect(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom173,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsNonRigidType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom174,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsNonRigidType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom175,axiom,(
  ![X]:(http___www_w3_org_2001_XMLSchema_date(X)=>http___www_w3_org_2000_01_rdf_schema_Literal(X)))
).

fof(axiom176,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasReifiedQualityValue(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom177,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_RelationshipType(X0)=>http___purl_org_nemo_gufo_Type(X0)))
).

fof(axiom178,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_VariableCollection(X0)=>http___purl_org_nemo_gufo_Collection(X0)))
).

fof(axiom179,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasEndPointInXSDDate(X0,X1)=>http___www_w3_org_2001_XMLSchema_date(X1)))
).

fof(axiom180,axiom,(
  ![X]:(http___purl_org_nemo_gufo_AbstractIndividualType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom181,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)&http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)))
).

fof(axiom182,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)=>http___purl_org_nemo_gufo_Situation(X0)))
).

fof(axiom183,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Kind(X0)=>http___purl_org_nemo_gufo_Sortal(X0)))
).

fof(axiom184,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedParthood(X0,X1)=>http___purl_org_nemo_gufo_TemporaryParthoodSituation(X1)))
).

fof(axiom185,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Quality(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom186,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_wasCreatedIn(X0,X1)=>http___purl_org_nemo_gufo_Event(X1)))
).

fof(axiom187,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_partitions(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom188,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_partitions(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom189,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isAspectProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Aspect(X1)))
).

fof(axiom190,axiom,(
  ![X]:(http___purl_org_nemo_gufo_VariableCollection(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom191,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_EndurantType(X0)&http___purl_org_nemo_gufo_EventType(X0)))
).

fof(axiom192,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Category(X0)=>http___purl_org_nemo_gufo_RigidType(X0)))
).

fof(axiom193,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_SubKind(X0)=>http___purl_org_nemo_gufo_Sortal(X0)))
).

fof(axiom194,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_categorizes(X0,X1)=>(http___purl_org_nemo_gufo_Type(X0)&~http___purl_org_nemo_gufo_AbstractIndividualType(X0)&http___www_w3_org_2002_07_owl_Thing(X0)&~http___purl_org_nemo_gufo_ConcreteIndividualType(X0)&http___www_w3_org_2002_07_owl_Thing(X0))))
).

fof(axiom195,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasBeginPoint(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom196,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_AntiRigidType(X0)&http___purl_org_nemo_gufo_SemiRigidType(X0)))
).

fof(axiom197,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Object(X1)))
).

fof(axiom198,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Mixin(X0)=>http___purl_org_nemo_gufo_SemiRigidType(X0)))
).

fof(axiom199,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_partitions(X0,X1)=>http___purl_org_nemo_gufo_categorizes(X0,X1)))
).

fof(axiom200,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_PhaseMixin(X0)=>http___purl_org_nemo_gufo_AntiRigidType(X0)))
).

fof(axiom201,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_participatedIn(X0,X1)=>http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom202,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedAttribution(X0,X1)=>http___purl_org_nemo_gufo_QualityValueAttributionSituation(X1)))
).

fof(axiom203,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedConstitution(X0,X1)=>http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X1)))
).

fof(axiom204,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_manifestedIn(X0,X1)=>http___purl_org_nemo_gufo_Event(X1)))
).

fof(axiom205,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Role(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom206,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ConcreteIndividual(X0)<=>(http___purl_org_nemo_gufo_Endurant(X0)|http___purl_org_nemo_gufo_Event(X0)|http___purl_org_nemo_gufo_Situation(X0))))
).

fof(axiom207,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_Endurant(X1)&http___purl_org_nemo_gufo_Event(X1)))
).

fof(axiom208,axiom,(
  ![X2]:~(http___purl_org_nemo_gufo_Endurant(X2)&http___purl_org_nemo_gufo_Situation(X2)))
).

fof(axiom209,axiom,(
  ![X3]:~(http___purl_org_nemo_gufo_Event(X3)&http___purl_org_nemo_gufo_Situation(X3)))
).

fof(axiom210,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasEndPointInXSDDateTimeStamp(X0,X1)=>http___www_w3_org_2001_XMLSchema_dateTimeStamp(X1)))
).

fof(axiom211,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_RoleMixin(X0)=>http___purl_org_nemo_gufo_AntiRigidType(X0)))
).

fof(axiom212,axiom,(
  ![X]:(http___purl_org_nemo_gufo_FunctionalComplex(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom213,axiom,(
  ![X]:(http___purl_org_nemo_gufo_ConcreteIndividual(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom214,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_externallyDependsOn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom215,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_externallyDependsOn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom216,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_PhaseMixin(X0)=>http___purl_org_nemo_gufo_NonSortal(X0)))
).

fof(axiom217,axiom,(
  ![X]:(http___purl_org_nemo_gufo_MaterialRelationshipType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom218,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_EndurantType(X0)<=>(http___purl_org_nemo_gufo_NonRigidType(X0)|http___purl_org_nemo_gufo_RigidType(X0))))
).

fof(axiom219,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_NonRigidType(X1)&http___purl_org_nemo_gufo_RigidType(X1)))
).

fof(axiom220,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_FixedCollection(X0)=>http___purl_org_nemo_gufo_Collection(X0)))
).

fof(axiom221,axiom,(
  ![X]:(http___purl_org_nemo_gufo_NonSortal(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom222,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsNonRigidType(X0,X1)=>http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)))
).

fof(axiom223,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isCollectionMemberOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom224,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isCollectionMemberOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom225,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedRelationship(X0,X1)=>http___purl_org_nemo_gufo_standsIn(X0,X1)))
).

fof(axiom226,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasBeginPoint(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom227,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasBeginPoint(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom228,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_AbstractIndividualType(X0)&http___purl_org_nemo_gufo_RelationshipType(X0)))
).

fof(axiom229,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_isProperPartOf(X0,X1)&http___purl_org_nemo_gufo_isProperPartOf(X1,X2))=>http___purl_org_nemo_gufo_isProperPartOf(X0,X2)))
).

fof(axiom230,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)&http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)))
).

fof(axiom231,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_hasEndPointInXSDDateTimeStamp(X0,X1)&http___purl_org_nemo_gufo_hasEndPointInXSDDateTimeStamp(X0,X2))=>(X1=X2)))
).

fof(axiom232,axiom,(
  ![X]:(http___purl_org_nemo_gufo_QualityValue(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom233,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_concernsConstitutedEndurant(X0,X1)&http___purl_org_nemo_gufo_Object(X1))&![X2,X3]:((http___purl_org_nemo_gufo_concernsConstitutedEndurant(X0,X2)&http___purl_org_nemo_gufo_Object(X2)&http___purl_org_nemo_gufo_concernsConstitutedEndurant(X0,X3)&http___purl_org_nemo_gufo_Object(X3))=>~(X2!=X3)))))
).

fof(axiom234,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasAssociatedQualityValueType(X0,X1)=>http___purl_org_nemo_gufo_AbstractIndividualType(X1)))
).

fof(axiom235,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Quantity(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom236,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_broughtAbout(X0,X1)=>http___purl_org_nemo_gufo_Event(X0)))
).

fof(axiom237,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsQualityValue(X0,X1)=>http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)))
).

fof(axiom238,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_Kind(X0)&http___purl_org_nemo_gufo_SubKind(X0)))
).

fof(axiom239,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)=>http___purl_org_nemo_gufo_Situation(X0)))
).

fof(axiom240,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedRelationship(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom241,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedRelationship(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom242,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedRelationship(X0,X1)=>http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X1)))
).

fof(axiom243,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedAttribution(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom244,axiom,(
  ![X]:(http___purl_org_nemo_gufo_RelationshipType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom245,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Relator(X0)=>?[X1,X2]:((X1!=X2)&http___purl_org_nemo_gufo_mediates(X0,X1)&http___purl_org_nemo_gufo_Endurant(X1)&http___purl_org_nemo_gufo_mediates(X0,X2)&http___purl_org_nemo_gufo_Endurant(X2))))
).

fof(axiom246,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsQualityType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom247,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsQualityType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom248,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Collection(X0)<=>(http___purl_org_nemo_gufo_FixedCollection(X0)|http___purl_org_nemo_gufo_VariableCollection(X0))))
).

fof(axiom249,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_FixedCollection(X1)&http___purl_org_nemo_gufo_VariableCollection(X1)))
).

fof(axiom250,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isProperPartOf(X0,X1)=>http___www_w3_org_2002_07_owl_Thing(X0)))
).

fof(axiom251,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsQualityValue(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom252,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsQualityValue(X,Y)=>http___www_w3_org_2000_01_rdf_schema_Literal(Y)))
).

fof(axiom253,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_NonRigidType(X0)<=>(http___purl_org_nemo_gufo_AntiRigidType(X0)|http___purl_org_nemo_gufo_SemiRigidType(X0))))
).

fof(axiom254,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_AntiRigidType(X1)&http___purl_org_nemo_gufo_SemiRigidType(X1)))
).

fof(axiom255,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Kind(X0)=>http___purl_org_nemo_gufo_RigidType(X0)))
).

fof(axiom256,axiom,(
  ![X]:(http___purl_org_nemo_gufo_EndurantType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom257,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_RoleMixin(X0)=>http___purl_org_nemo_gufo_NonSortal(X0)))
).

fof(axiom258,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ConcreteIndividualType(X0)=>http___purl_org_nemo_gufo_Type(X0)))
).

fof(axiom259,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSubCollectionOf(X0,X1)=>http___purl_org_nemo_gufo_Collection(X1)))
).

fof(axiom260,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isSituationProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom261,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isSituationProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom262,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isAspectProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom263,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isAspectProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom264,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_AntiRigidType(X0)=>http___purl_org_nemo_gufo_NonRigidType(X0)))
).

fof(axiom265,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Aspect(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom266,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Phase(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom267,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Aspect(X0)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom268,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isDerivedFrom(X0,X1)=>(http___purl_org_nemo_gufo_ComparativeRelationshipType(X0)|http___purl_org_nemo_gufo_MaterialRelationshipType(X0))))
).

fof(axiom269,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_wasTerminatedIn(X0,X1)=>http___purl_org_nemo_gufo_Event(X1)))
).

fof(axiom270,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDate(X0,X1)=>http___www_w3_org_2001_XMLSchema_date(X1)))
).

fof(axiom271,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Kind(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom272,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsIn(X0,X1)=>http___www_w3_org_2002_07_owl_Thing(X0)))
).

fof(axiom273,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_categorizes(X0,X1)=>http___purl_org_nemo_gufo_Type(X1)))
).

fof(axiom274,axiom,(
  ![X]:(http___purl_org_nemo_gufo_AntiRigidType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom275,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_participatedIn(X0,X1)=>http___purl_org_nemo_gufo_Event(X1)))
).

fof(axiom276,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsQualityType(X0,X1)=>http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)))
).

fof(axiom277,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasAssociatedQualityValueType(X0,X1)=>http___purl_org_nemo_gufo_EndurantType(X0)))
).

fof(axiom278,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_Aspect(X0)&http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom279,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_constitutes(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom280,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_constitutes(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom281,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Situation(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom282,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isCollectionMemberOf(X0,X1)=>http___purl_org_nemo_gufo_isObjectProperPartOf(X0,X1)))
).

fof(axiom283,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedRelationship(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom284,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_EventType(X0)=>http___purl_org_nemo_gufo_ConcreteIndividualType(X0)))
).

fof(axiom285,axiom,(
  ![X]:(http___purl_org_nemo_gufo_AbstractIndividual(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom286,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasEndPoint(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom287,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isSubQuantityOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom288,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isSubQuantityOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom289,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_IntrinsicMode(X0)=>http___purl_org_nemo_gufo_IntrinsicAspect(X0)))
).

fof(axiom290,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Phase(X0)=>http___purl_org_nemo_gufo_Sortal(X0)))
).

fof(axiom291,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_IntrinsicAspect(X0)<=>(http___purl_org_nemo_gufo_IntrinsicMode(X0)|http___purl_org_nemo_gufo_Quality(X0))))
).

fof(axiom292,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_IntrinsicMode(X1)&http___purl_org_nemo_gufo_Quality(X1)))
).

fof(axiom293,axiom,(
  ![X]:(http___purl_org_nemo_gufo_FixedCollection(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom294,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedParthood(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom295,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsInQualifiedParthood(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom296,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_concernsQualityType(X0,X1)&http___purl_org_nemo_gufo_EndurantType(X1))&![X2,X3]:((http___purl_org_nemo_gufo_concernsQualityType(X0,X2)&http___purl_org_nemo_gufo_EndurantType(X2)&http___purl_org_nemo_gufo_concernsQualityType(X0,X3)&http___purl_org_nemo_gufo_EndurantType(X3))=>~(X2!=X3)))))
).

fof(axiom297,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Category(X0)=>http___purl_org_nemo_gufo_NonSortal(X0)))
).

fof(axiom298,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Collection(X0)=>http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom299,axiom,(
  ![X0]:(http___www_w3_org_2006_time_Instant(X0)=>http___purl_org_nemo_gufo_AbstractIndividual(X0)))
).

fof(axiom300,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_PhaseMixin(X0)&http___purl_org_nemo_gufo_RoleMixin(X0)))
).

fof(axiom301,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_NonRigidType(X0)&http___purl_org_nemo_gufo_RigidType(X0)))
).

fof(axiom302,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsReifiedQualityValue(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom303,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsReifiedQualityValue(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom304,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasEndPointInXSDDate(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom305,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasEndPointInXSDDate(X,Y)=>http___www_w3_org_2000_01_rdf_schema_Literal(Y)))
).

fof(axiom306,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom307,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isProperPartOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom308,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDateTimeStamp(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom309,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDateTimeStamp(X,Y)=>http___www_w3_org_2000_01_rdf_schema_Literal(Y)))
).

fof(axiom310,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_wasCreatedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom311,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_wasCreatedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom312,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Relator(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom313,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isDerivedFrom(X0,X1)=>http___purl_org_nemo_gufo_EndurantType(X1)))
).

fof(axiom314,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_isAspectProperPartOf(X0,X1)&http___purl_org_nemo_gufo_isAspectProperPartOf(X1,X2))=>http___purl_org_nemo_gufo_isAspectProperPartOf(X0,X2)))
).

fof(axiom315,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsConstitutedEndurant(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom316,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsConstitutedEndurant(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom317,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasAssociatedQualityValueType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom318,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasAssociatedQualityValueType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom319,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_wasTerminatedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom320,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_wasTerminatedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom321,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_FixedCollection(X0)&http___purl_org_nemo_gufo_VariableCollection(X0)))
).

fof(axiom322,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsNonRigidType(X0,X1)=>http___purl_org_nemo_gufo_NonRigidType(X1)))
).

fof(axiom323,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Situation(X0)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom324,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_Phase(X0)&http___purl_org_nemo_gufo_Role(X0)))
).

fof(axiom325,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ComparativeRelationshipType(X0)=>http___purl_org_nemo_gufo_RelationshipType(X0)))
).

fof(axiom326,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSubQuantityOf(X0,X1)=>http___purl_org_nemo_gufo_Quantity(X1)))
).

fof(axiom327,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Endurant(X0)<=>(http___purl_org_nemo_gufo_Aspect(X0)|http___purl_org_nemo_gufo_Object(X0))))
).

fof(axiom328,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_Aspect(X1)&http___purl_org_nemo_gufo_Object(X1)))
).

fof(axiom329,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasBeginPoint(X0,X1)=>http___www_w3_org_2006_time_Instant(X1)))
).

fof(axiom330,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_IntrinsicMode(X0)&http___purl_org_nemo_gufo_Quality(X0)))
).

fof(axiom331,axiom,(
  ![X]:(http___purl_org_nemo_gufo_ComparativeRelationshipType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom332,axiom,(
  ![X]:(http___purl_org_nemo_gufo_PhaseMixin(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom333,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_SituationType(X0)=>http___purl_org_nemo_gufo_ConcreteIndividualType(X0)))
).

fof(axiom334,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_MaterialRelationshipType(X0)=>http___purl_org_nemo_gufo_RelationshipType(X0)))
).

fof(axiom335,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Quantity(X0)=>http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom336,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X0)&http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)))
).

fof(axiom337,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_RigidType(X0)=>http___purl_org_nemo_gufo_EndurantType(X0)))
).

fof(axiom338,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_AbstractIndividualType(X0)&http___purl_org_nemo_gufo_ConcreteIndividualType(X0)))
).

fof(axiom339,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Quality(X0)=>http___purl_org_nemo_gufo_IntrinsicAspect(X0)))
).

fof(axiom340,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ExtrinsicMode(X0)=>http___purl_org_nemo_gufo_ExtrinsicAspect(X0)))
).

fof(axiom341,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_externallyDependsOn(X0,X1)=>http___purl_org_nemo_gufo_ExtrinsicMode(X0)))
).

fof(axiom342,axiom,(
  ![X0]:~http___purl_org_nemo_gufo_inheresIn(X0,X0))
).

fof(axiom343,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Aspect(X0)<=>(http___purl_org_nemo_gufo_ExtrinsicAspect(X0)|http___purl_org_nemo_gufo_IntrinsicAspect(X0))))
).

fof(axiom344,axiom,(
  ![X1]:~(http___purl_org_nemo_gufo_ExtrinsicAspect(X1)&http___purl_org_nemo_gufo_IntrinsicAspect(X1)))
).

fof(axiom345,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_ExtrinsicMode(X0)=>(?[X1]:(http___purl_org_nemo_gufo_inheresIn(X0,X1)&http___purl_org_nemo_gufo_ConcreteIndividual(X1))&![X2,X3]:((http___purl_org_nemo_gufo_inheresIn(X0,X2)&http___purl_org_nemo_gufo_ConcreteIndividual(X2)&http___purl_org_nemo_gufo_inheresIn(X0,X3)&http___purl_org_nemo_gufo_ConcreteIndividual(X3))=>~(X2!=X3)))))
).

fof(axiom346,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_concernsRelatedEndurant(X0,X1)&http___purl_org_nemo_gufo_concernsRelatedEndurant(X0,X2))=>(X1=X2)))
).

fof(axiom347,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_QualityValueAttributionSituation(X0)&http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X0)))
).

fof(axiom348,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Endurant(X0)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom349,axiom,(
  ![X0,X1]:~(http___purl_org_nemo_gufo_mediates(X0,X1)&http___purl_org_nemo_gufo_mediates(X1,X0)))
).

fof(axiom350,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsTemporaryWhole(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom351,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsTemporaryWhole(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom352,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_inheresIn(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X1)))
).

fof(axiom353,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_wasCreatedIn(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X0)))
).

fof(axiom354,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_manifestedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom355,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_manifestedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom356,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_concernsNonRigidType(X0,X1)&http___purl_org_nemo_gufo_NonRigidType(X1))&![X2,X3]:((http___purl_org_nemo_gufo_concernsNonRigidType(X0,X2)&http___purl_org_nemo_gufo_NonRigidType(X2)&http___purl_org_nemo_gufo_concernsNonRigidType(X0,X3)&http___purl_org_nemo_gufo_NonRigidType(X3))=>~(X2!=X3)))))
).

fof(axiom357,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsReifiedQualityValue(X0,X1)=>http___purl_org_nemo_gufo_QualityValue(X1)))
).

fof(axiom358,axiom,(
  ![X]:(http___purl_org_nemo_gufo_NonRigidType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom359,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_IntrinsicAspect(X0)=>(?[X1]:(http___purl_org_nemo_gufo_inheresIn(X0,X1)&http___purl_org_nemo_gufo_ConcreteIndividual(X1))&![X2,X3]:((http___purl_org_nemo_gufo_inheresIn(X0,X2)&http___purl_org_nemo_gufo_ConcreteIndividual(X2)&http___purl_org_nemo_gufo_inheresIn(X0,X3)&http___purl_org_nemo_gufo_ConcreteIndividual(X3))=>~(X2!=X3)))))
).

fof(axiom360,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedParthood(X0,X1)=>http___purl_org_nemo_gufo_standsIn(X0,X1)))
).

fof(axiom361,axiom,(
  ![X0]:~http___purl_org_nemo_gufo_mediates(X0,X0))
).

fof(axiom362,axiom,(
  ![X]:(http___purl_org_nemo_gufo_TemporaryInstantiationSituation(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom363,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isEventProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Event(X0)))
).

fof(axiom364,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasQualityValue(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom365,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasQualityValue(X,Y)=>http___www_w3_org_2000_01_rdf_schema_Literal(Y)))
).

fof(axiom366,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Endurant(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom367,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsRelationshipType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom368,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsRelationshipType(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom369,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSituationProperPartOf(X0,X1)=>http___purl_org_nemo_gufo_Situation(X0)))
).

fof(axiom370,axiom,(
  ![X0,X1]:~(http___purl_org_nemo_gufo_inheresIn(X0,X1)&http___purl_org_nemo_gufo_inheresIn(X1,X0)))
).

fof(axiom371,axiom,(
  ![X]:(http___purl_org_nemo_gufo_RigidType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom372,axiom,(
  ![X]:(http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom373,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Participation(X0)=>http___purl_org_nemo_gufo_Event(X0)))
).

fof(axiom374,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_TemporaryParthoodSituation(X0)&http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)))
).

fof(axiom375,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_EndurantType(X0)&http___purl_org_nemo_gufo_SituationType(X0)))
).

fof(axiom376,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_hasEndPointInXSDDate(X0,X1)&http___purl_org_nemo_gufo_hasEndPointInXSDDate(X0,X2))=>(X1=X2)))
).

fof(axiom377,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_IntrinsicAspect(X0)=>http___purl_org_nemo_gufo_Aspect(X0)))
).

fof(axiom378,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom379,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_standsIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom380,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSubQuantityOf(X0,X1)=>http___purl_org_nemo_gufo_Quantity(X0)))
).

fof(axiom381,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Participation(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom382,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasReifiedQualityValue(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom383,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_hasReifiedQualityValue(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom384,axiom,(
  ![X]:(http___purl_org_nemo_gufo_TemporaryParthoodSituation(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom385,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsRelatedEndurant(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom386,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_concernsRelatedEndurant(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom387,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_concernsRelationshipType(X0,X1)&http___purl_org_nemo_gufo_RelationshipType(X1))&![X2,X3]:((http___purl_org_nemo_gufo_concernsRelationshipType(X0,X2)&http___purl_org_nemo_gufo_RelationshipType(X2)&http___purl_org_nemo_gufo_concernsRelationshipType(X0,X3)&http___purl_org_nemo_gufo_RelationshipType(X3))=>~(X2!=X3)))))
).

fof(axiom388,axiom,(
  ![X0,X1,X2]:((http___purl_org_nemo_gufo_concernsReifiedQualityValue(X0,X1)&http___purl_org_nemo_gufo_concernsReifiedQualityValue(X0,X2))=>(X1=X2)))
).

fof(axiom389,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isDerivedFrom(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom390,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isDerivedFrom(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom391,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_broughtAbout(X0,X1)=>http___purl_org_nemo_gufo_Situation(X1)))
).

fof(axiom392,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isComponentOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom393,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_isComponentOf(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom394,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsConstitutedEndurant(X0,X1)=>http___purl_org_nemo_gufo_Endurant(X1)))
).

fof(axiom395,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_FunctionalComplex(X0)=>http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom396,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Role(X0)=>http___purl_org_nemo_gufo_AntiRigidType(X0)))
).

fof(axiom397,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_hasBeginPointInXSDDate(X0,X1)=>http___purl_org_nemo_gufo_ConcreteIndividual(X0)))
).

fof(axiom398,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isProperPartOf(X0,X1)=>http___www_w3_org_2002_07_owl_Thing(X1)))
).

fof(axiom399,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryConstitutionSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_standsInQualifiedConstitution(X1,X0)&http___purl_org_nemo_gufo_Object(X1))&![X2,X3]:((http___purl_org_nemo_gufo_standsInQualifiedConstitution(X2,X0)&http___purl_org_nemo_gufo_Object(X2)&http___purl_org_nemo_gufo_standsInQualifiedConstitution(X3,X0)&http___purl_org_nemo_gufo_Object(X3))=>~(X2!=X3)))))
).

fof(axiom400,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_Role(X0)=>http___purl_org_nemo_gufo_Sortal(X0)))
).

fof(axiom401,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isSubCollectionOf(X0,X1)=>http___purl_org_nemo_gufo_Collection(X0)))
).

fof(axiom402,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_participatedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom403,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_participatedIn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))
).

fof(axiom404,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_SubKind(X0)=>http___purl_org_nemo_gufo_RigidType(X0)))
).

fof(axiom405,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_standsInQualifiedConstitution(X0,X1)=>http___purl_org_nemo_gufo_standsIn(X0,X1)))
).

fof(axiom406,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Type(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom407,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryParthoodSituation(X0)=>http___purl_org_nemo_gufo_Situation(X0)))
).

fof(axiom408,axiom,(
  ![X]:(http___purl_org_nemo_gufo_Collection(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom409,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_SemiRigidType(X0)=>http___purl_org_nemo_gufo_NonRigidType(X0)))
).

fof(axiom410,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_concernsRelationshipType(X0,X1)=>http___purl_org_nemo_gufo_RelationshipType(X1)))
).

fof(axiom411,axiom,(
  ![X0]:~(http___purl_org_nemo_gufo_ConcreteIndividualType(X0)&http___purl_org_nemo_gufo_RelationshipType(X0)))
).

fof(axiom412,axiom,(
  ![X0,X1]:(http___purl_org_nemo_gufo_isCollectionMemberOf(X0,X1)=>http___purl_org_nemo_gufo_Object(X0)))
).

fof(axiom413,axiom,(
  ![X0]:(http___purl_org_nemo_gufo_TemporaryRelationshipSituation(X0)=>(?[X1]:(http___purl_org_nemo_gufo_standsInQualifiedRelationship(X1,X0)&http___purl_org_nemo_gufo_Endurant(X1))&![X2,X3]:((http___purl_org_nemo_gufo_standsInQualifiedRelationship(X2,X0)&http___purl_org_nemo_gufo_Endurant(X2)&http___purl_org_nemo_gufo_standsInQualifiedRelationship(X3,X0)&http___purl_org_nemo_gufo_Endurant(X3))=>~(X2!=X3)))))
).

fof(axiom414,axiom,(
  ![X]:(http___purl_org_nemo_gufo_SituationType(X)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom415,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_historicallyDependsOn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(X)))
).

fof(axiom416,axiom,(
  ![X,Y]:(http___purl_org_nemo_gufo_historicallyDependsOn(X,Y)=>http___www_w3_org_2002_07_owl_Thing(Y)))).
