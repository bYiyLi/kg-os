# Full PDF text extraction

Original: [documentation/user guides/ontology developer guide/Basic Formal Ontology Case Studies.pdf](<../../../../../upstream/bfo-2020/documentation/user guides/ontology developer guide/Basic Formal Ontology Case Studies.pdf>)

Source SHA-256: `b9d9db6f79c97e8bde7bc2accf451d3bd310cf0149ad4124b5bc731d1957862b`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
Basic Formal Ontology: Case Studies
J. Neil Otte1, John Beverley2, and Alan Ruttenberg3
1Johns Hopkins University Applied Physics Laboratory
2Northwestern University
3University at Buﬀalo
August 11, 2021
Abstract. Basic Formal Ontology (BFO) is a top-level ontology consisting of
thirty-eight classes, designed to support information integration, retrieval, and
analysis across all domains of scientiﬁc investigation, presently employed in
over 350 ontology projects around the world. BFO is a genuine top-level on-
tology, containing no terms particular to material domains, such as physics,
medicine, or psychology. In this paper, we demonstrate how a series of cases
illustrating common types of change may be represented by universals, deﬁned
classes, and relations employing the BFO framework. We provide discussion
of these cases to provide a template for other ontologists using BFO, as well
as to facilitate comparison with the strategies proposed by ontologists using
diﬀerent top-level ontologies.
Keywords: BFO, top-level ontology, ontological analysis, formal ontology
1. Introduction1
In this paper, we demonstrate how Basic Formal Ontology (BFO) may be used
to represent seven cases involving change. These cases, their goals, and their
accompanying focus statements are discussed in order to provide a template
for other ontologists using BFO, as well as to facilitate comparison with the
strategies proposed by ontologists using diﬀerent top-level ontologies.
Basic Formal Ontology2 is a top-level ontology designed to support infor-
mation integration, retrieval, and analysis across all domains of scientiﬁc in-
vestigation. Containing only general terms common across disciplines, BFO
serves as the top-level ontology of the Open Biomedical and Bioinformatic
Ontology (OBO) Foundry [1] and the Industrial Ontology Foundry (IOF) [2].
1All authors contributed equally to this work.
2 International Organization for Standardization. (2016). Information technology — Top-level
ontologies (TLO) — Part 2: Basic Formal Ontology (BFO)(ISO Standard No. 21838-2:2020). Re-
trieved from https://www.iso.org/standard/74572.html
1
````

## PDF page 2

````text
Moreover, BFO provides a starting point for over 350 known ontology exten-
sions3 covering more speciﬁc domains, such as infectious disease [3], plant
development [4], and processed materials [5]. BFO has been designated an
ISO standard [6] and BFO’s ISO 21838-2 speciﬁcation has been axiomatized in
First-Order Logic, OWL 2, and CLIF.4
BFO is committed to the following principles [7], which distinguish it from
other top-level ontologies [8]:
• Ontological Realism – The goal of an ontology is to describe reality. Sci-
entiﬁc investigation is concerned with general features of reality and re-
lations among them. Consequently, BFO consists fundamentally of rep-
resentations of reality rather than merely language, concepts, or mental
representations about reality [9].
• Fallibilism – Whereas universals themselves do not change, our under-
standing of them must in light of new discoveries. While present scien-
tiﬁc theories are assumed to be our best sources of accurate statements
about reality, BFO recognizes, of course, that present scientiﬁc theories
may be incorrect. Consequently, BFO is committed to tracking scientiﬁc
developments over time, and updating ontologies in accordance with sci-
entiﬁc developments [2].
• Adequatism – Entities in a domain should not be assumed to be reducible
to other kinds of entities. All scientiﬁc disciplines are worthy of repre-
sentation in their own terms, and it is not necessary to paraphrase talk
of these entities in terms of a privileged set of entities (e.g. those de-
scribed by physics). This commitment contrasts withreductionism, which
seeks to reduce entities described by some domain of science to another
deemed more fundamental [9].
2. Principles and Structure of BFO
BFO adopts the following fundamental categories [6, 8]:
• universal and particular – Particulars are individual denizens of reality
restricted to speciﬁc times and places, which instantiate universals, but
which cannot be instantiated. Universals are repeatable across time and
space and may have an indeﬁnite number of instantiated particulars [13,
14].
• continuant and occurrent – BFO is largely bifurcated into disjoint uni-
versals5, distinguished by how particulars relate to time. Continuants
endure through time maintaining identity, have no temporal parts, and
are fully-present at any time they exist. Examples include house cats, the
3 Users of BFO. Accessed December 25, 2020 at http://basic-formal-ontology.org/users.html
4BFO-2020. Accessed December 25, 2020 at https://github.com/BFO-ontology/BFO-
2020/tree/21838-2/21838-2
5 The exceptions to disjointedness are BFO’s classes ﬁat object part, object, and object aggregate.
Some instances may belong to more than one of these classes.
2
````

## PDF page 3

````text
color of an apple, the function of mitochondria. By contrast, occurrent
entities unfold over time or have temporal parts. Examples include: the
history of Japan, drinking a cup of coﬀee, the temporal interval on which
a mitotic division occurs [15].
• relations – BFO adopts three basic relation types: universal-universal,
universal-particular, and particular-particular, the latter two of which
may be time indexed. Universal-universal relations in BFO relate sub-
types to parent types, whereas the sole universal-particular relation is
the instance of relation, which holds between particulars and the univer-
sals under which they fall [16].
We discuss here only those classes necessary for the comprehension of the
cases.6 In what follows, deﬁnitions are indicated with the use of “=def”, and
those entries regarding classes that lack this symbol are elucidations. First, sub-
classes of continuant:
• a is an independent continuant = def a is a continuant which is such that
there is no b such that a speciﬁcally depends on b and no b such that a
generically depends on b.
– material entity – an independent continuant that at all times at
which it exists has some portion of matter as continuant part.
∗ object – a material entity that manifests causal unity and is of
a type instances of which are maximal relative to the sort of
causal unity manifested.
∗ object aggregate – a material entity consisting exactly of ( ≥1)
object(s) as member(s).
• a is an immaterial entity = def a is an independent continuant which is
such that there is no time t when it has a material entity as continuant
part.
– site – a three-dimensional immaterial entity whose boundaries ei-
ther (partially or wholly) coincide with the boundaries of one or
more material entities or have locations determined in relation to
some material entity.
An independent continuant may bear dependent continuants, including:
• generically dependent continuant – an entity that exists in virtue of the
fact that there is at least one of what may be multiple copies; it is the
content or the pattern that the multiple copies share.
6 We leave aside discussion of ﬁat object part, spatial region and its subclasses, process bound-
ary, spatiotemporal region, relational quality, history, and continuant ﬁat boundary and its sub-
classes, as these classes were not necessary to represent the cases under discussion.
3
````

## PDF page 4

````text
• b is a speciﬁcally dependent continuant = def b is a continuant and there
is some independent continuant c which is not a spatial region and which
is such that b speciﬁcally depends on c.
– quality – a speciﬁcally dependent continuant that, in contrast to
roles and dispositions, does not require any further process in or-
der to be realized.
– realizable entity – a speciﬁcally dependent continuant that inheres
in some independent continuant which is not a spatial region and
is of a type some instances of which are realized in processes of a
correlated type.
∗ role – a realizable entity that exists because there is some single
bearer that is in some special physical, social, or institutional
set of circumstances in which this bearer does not have to be
and which is not such that, if it ceases to exist, then the physical
make-up of the bearer is thereby changed.
∗ disposition – a realizable entity such that if it ceases to exist,
then its bearer is physically changed, and whose realization oc-
curs when and because its bearer is in some special physical cir-
cumstances, and this realization occurs in virtue of the bearer’s
physical make-up.
· function – a disposition that exists in virtue of the bearer’s
physical make-up and this physical make-up is something
the bearer possesses because it came into being either through
evolution (in the case of natural biological entities) or through
intentional design (in the case of artifacts), in order to real-
ize processes of a certain sort.
From the occurrent portion of the hierarchy, we include the following:
• p is a process = def p is an occurrent that has some temporal proper part
and for some time has some material entity as participant.
• temporal region – an occurrent over which processes can unfold.
– temporal instant – a zero-dimensional temporal region that has no
proper temporal part.
– temporal interval – a one-dimensional temporal region that is con-
tinuous, thus without gaps or breaks.
There is often a practical need to accommodate terms in scientiﬁc discourse
that do not correspond to universals. Examples of such terms include ‘medical
doctor’ and disjunctions such as ‘dog or cat’. Such classes are called ‘deﬁned
classes’, and are represented as equivalent to any member satisfying a set of
assertions whose non-logical symbols are satisﬁed by models consisting only
of relations, universals, or instances of universals. In this way, we hold that
4
````

## PDF page 5

````text
‘medical doctor’ is only a short-hand way of referring to instances of persons
who bear a medical doctor role, and to be a ‘dog or cat’ is nothing over and
above being an instance of dog or an instance of cat. As with the familiar
notion of ‘deﬁned class’ in the OWL2 speciﬁcation, every deﬁned class is rep-
resented with an equivalency axiom however, the ontological interpretation of
the notion of asserted class as corresponding to a universal and ‘deﬁned class’
as picking out a mere term is unique to BFO.
3. Formalization of BFO in First-Order Logic
We describe a fragment of the BFO ISO 21838-2 First-Order Logic (FOL) ax-
iomatization [6]. The domain is comprised of particulars that stand in the
primitive instances of relation to universals at times. BFO’s hierarchy of uni-
versals can be represented by deﬁning the relation:7
∀x,t is a(A, B) =def instance of(x, A, t)→ instance of(x, B, t)
For example, material entity is a independent continuant. Visual representa-
tion of BFO’s hierarchy can be found inFigure 1 and Figure 2.
zero- 
dimensional 
spatial region 
two- 
dimensional 
spatial region 
three- 
dimensional 
spatial region 
speciﬁcally 
dependent 
continuant 
spatial 
region site role relational 
quality 
realizable 
entity quality 
one- 
dimensional 
spatial region 
object 
aggregate object 
material 
entity 
independent 
continuant 
immaterial 
entity 
generically 
dependent 
continuant 
disposition 
ﬁat 
surface ﬁat point 
ﬁat object 
part 
ﬁat line function 
continuant ﬁat 
boundary 
continuant is a 
Figure 1: BFO Continuant Hierarchy
By rigid universal Ur, we mean any entity that is instantiated by Ur, instanti-
ates Ur for the whole of its existence. All classes in BFO are rigid other than
the three subclasses of material entity: ﬁat object part, object, and object ag-
gregate. For example, an instance of object aggregate at some time may later
instantiate object.
BFO’s theory of parts is modeled after Minimal Extension Mereology (MEM)
[7]. MEM is described in terms of binary part relations, but is extended to han-
dle the time-indexed relations. The MEM axioms state that a part relation
is reﬂexive, antisymmetric, transitive, weakly supplemented, and exhibits the
7This relation is not included in the BFO-ISO speciﬁcation, but is deﬁned here to simplify
discussion.
5
````

## PDF page 6

````text
zero- 
dimensional 
temporal 
region 
temporal 
region 
temporal 
interval 
temporal 
instant 
spatiotemporal 
region 
process 
boundary process 
one- 
dimensional 
temporal region 
history 
occurrent is a 
Figure 2: BFO Occurrent Hierarchy
unique product property. Any time-indexed relation implies that the ﬁrst two
relata exist, and holds at any time the relata exist. For instance, when a time-
indexed relation is reﬂexive we mean that the self-relationship refers to the
ﬁrst two relata and it must hold at any time the relata exist.
BFO has two part of relations, one for continuants, called continuant part
of and one for occurrents called occurrent part of. Continuant part of is time
indexed, whereas occurrent part of is not. Worth noting is the treatment of
the anti-symmetry of continuant part of applied to object aggregates. If a
continuant part of b at some t and b continuant part of a at the same time t,
we do not conclude that a=b.
Using these relations we can deﬁne irreﬂexive, asymmetric, transitiveproper
occurrent part of and proper continuant part of relations in the usual way.
Starting at the continuant side of the BFO hierarchy inFigure 1, an indepen-
dent continuant is distinguished from other continuants in that they neither
generically nor speciﬁcally depend on other entities. In contrast, a speciﬁcally
dependent continuant speciﬁcally depends on an independent continuant 8
rigidly. If x speciﬁcally depends on y, then as long as x exists, the relation
holds. If y ceases to exist, then x does as well.
A speciﬁcally dependent continuant is said toinhere in – a relation deﬁned
in terms of speciﬁcally depends on – an instance of independent continuant.
The inverse of inheres in is bearer of. A generically dependent continuant
8In a number of relations involving independent continuants the relation is actually valid only
if the entity is a spatial region. In order to keep the discussion simpler, we do not mention it in the
body.
6
````

## PDF page 7

````text
is concretized by a process or speciﬁcally dependent continuant. When the
concretization is a speciﬁcally dependent continuant the generically depen-
dent continuant generically depends on the speciﬁcally dependent continu-
ant’s bearer.
All independent continuants other than spatial regions occupy a spatial
region, and so are extended in space and time. Some may be located in others
at some time, as the food you ingest is at some point located in the lumen of
your stomach after you have eaten. Located in is transitive.
A material entity can becontinuant part of another material entity at some
time. Material entities can have material and immaterial parts. An object can
be member part of an object aggregate. Member part of is not transitive but
implies continuant part of. An object aggregate always has at least one mem-
ber, and must, at some time, have more than one.
Any independent continuant, speciﬁcally dependent continuant, or gener-
ically dependent continuant can participate in a process. In the latter two
cases, it is implied that their bearer also participates in the process. When a
process realizes a realizable entity, the realizable entity’s bearer also partici-
pates in the process. When a generically dependent continuant participates
in a process p, some concretization of the generically dependent continuant
participates in p. If that concretization is a process, it is temporal part of p.
A process occupies temporal region some temporal region. Processes have
at least one process boundary as part. The temporal region that a process oc-
cupies must have as part a temporal interval. A process boundary can only
occupy a temporal instant.
An occurrent can be a temporal part of some other. Occurrent parts can
diﬀer from what they are part of both spatially and temporally (e.g. the process
which occurs in the left half of a soccer ﬁeld during the ﬁrst period of a game).
By contrast, temporal part of an occurrent diﬀers in that there is no diﬀerence
in the spatial extent of the part and the whole.
Temporal regions provide the indices for all the time-indexed ternary rela-
tions in BFO. A temporal region has ﬁrst instant and has last instant a tem-
poral instant marking its extrema. A ﬁrst or last instant can be temporal part
of the region or not. A temporal instant thatprecedes the last instant of a tem-
poral interval and are preceded by the interval’s ﬁrst instant are necessarily
part of the interval. Using these relations, the familiar and widely used Allen’s
interval algebra may be formulated [17].
4. Analysis and Formalization in BFO: Examples
In this section, we examine several cases reﬂecting composition, roles, property
and event change, and scientiﬁc progress. As BFO is a small top-level ontology
comprised of domain-neutral terms, the examples use either terms we deﬁne in
this paper, or wherever possible, existing terms from BFO-aligned ontologies
within the OBO Foundry library [18] and The Common Core Ontologies (CCO)
[19].
Since the cases reﬂect changes over time, temporal intervals will be used
throughout. We introduce some formalization here to avoid repetitions. In
7
````

## PDF page 8

````text
each case, we will use “i” to represent the interval during which the case un-
folds. We will use subscripts on “i” to represent proper 9 interval parts of i
ordered by precedence. Formally:
1. instance of(i, temporal interval, i)
2. ⋀
1≤k≤n instance of (ik, temporal interval, ik)
3. ⋀
1≤k≤n proper temporal part (ik, i)
4. ⋀
1≤k≤n precedes (ik, ik+1)
Many of the cases involve information. An information content entity is
a generically dependent continuant that is about some entity. The term orig-
inates in the Information Artifact Ontology (IAO), an ontology that extends
BFO. Because information content entity is a direct subclass of generically de-
pendent continuant, an information content entity may generically depend
on one or more material entities. One example is the content of a novel may
be concretized by patterns of ink in multiple physical books or may be con-
cretized by the digital patterns in di ﬀerent network servers; when this oc-
curs, the novel (an information content entity) then generically depends on
the physical books and network servers.
Although it is possible to deﬁne a subclass of information content entity
as always having a unique serialization (e.g. as in the case of an International
Standard Book Number ISBN, which would have a unique serialization such
as “978-0-393-28857-5”), it is preferable in many cases to track information
that can be common across serializations or translations, much as a proposi-
tion may be expressed by di ﬀerent sentences. One way to enable this is to
treat the serialization as a property of the bearer of the information content
entity, rather than the information content entity itself. To illustrate, Figure
310 depicts a measurement information content entity, its subject (aninstance
of process of walking), a material entity, and the measurement unit and string
associated with that material entity. If the measurement information content
entity was converted to kilometers, the instance of information content entity
would remain the same, but would now also generically depend on a distinct
instance of information bearing entity that would have text value “3.22 kilo-
meters per hour”. Preliminaries in hand, we turn to the formalization of cases.
4.1 Composition/Constitution
CASE 1: There is a four-legged table made of wood. Sometime later, a leg of the
table is replaced. Even later, the table is demolished so it ceases to exist although the
wood is still there after the demolition.
9Any “proper” relation R(x,y) used here should be understood as R(x,y)∧ x,y.
10In ﬁgures throughout, we use circular nodes to represent both universals and deﬁned classes,
and diamonds to represent particulars.
8
````

## PDF page 9

````text
Measurement 
Information 
Content Entity 
Information 
Bearing Entity 
Information 
Content Entity 
i 4 
i 5 
instance of instance of 
generically depends on 
at 
at 
at 
Material Entity Generically Dependent 
Continuant 
is a 
i 2 
Measurement 
Unit in Miles 
“2 miles per hour” 
Measurement 
Unit of 
Distance 
instance of 
at 
i 3 
is measurement unit of 
is a 
Process of 
Walking 
Process 
instance of 
at 
i 1 
is a measurement of 
has text value 
Figure 3: Relationships among Information Content Entities and Bearers
GOAL: The example aims to show if and how the ontology models materials, objects,
and components and the relationships among them.
FOCUS: The relationship between the wood and the table and the table’s parts over
time. (Artefacts and functions are not the focus.)
BFO does not have a constitution relation such as “made of”, typically related
to an entity described as a mass noun. Instead, our example directly represents
the particular portion of wood and its parts which are, when the table exists,
part of the table. In Table 1, we describe the classes, particulars, and relations
we will use in our discussion. The portion of wood exists throughout the inter-
val but changes. At the beginning of the interval, the portion of wood bears a
table function and has parts that bear leg functions. The portion of wood par-
ticipates in a leg replacement process, during which one of its proper parts
that bears a leg function is replaced by a material entity bearing a leg function.
After the replacement, the original leg is no longer part of the portion of wood,
and the replacement leg is now part of it. Afterward, the portion of wood par-
ticipates in a destruction process, during which it loses its table function, and
so no longer instantiates table.
Class Deﬁnition or Elucidation
9
````

## PDF page 10

````text
portion of wood a material entity that was formerly part of one
or more tree trunks or branches
table function a function that inheres in a material entity with
a ﬂat surface that has realization a process dur-
ing which a material entity is placed on the
bearer without it falling oﬀ
leg function a function that inheres in a sti ﬀ object and
which has realization a process of support and
elevation of other objects
table destruction process a process during which a material entity bearer
of a table function loses that table function
Particular Description
wood the portion of wood that has continuant part leg
1 at i2 and leg 2 at i5
leg 1 the object that is bearer of leg function 1. leg 1 is
replaced in the example.
leg 2 the object that is bearer of leg function 2 . leg 2
replaces leg 1 in the example.
table function the table function that inheres in wood
leg function 1 the leg function that inheres in leg 1
leg function 2 the leg function that inheres in leg 2
leg replacement process a process during which leg 1 is replaced by leg 2
table destruction process a process resulting in wood losing table function 1
i1 the temporal interval during which wood is
bearer of table function
i2 the temporal interval during whichleg 1 is bearer
of leg function 1
i3 the temporal interval during which leg 1 is
proper continuant part of wood
i4 the temporal intervaloccupied by leg replacement
process, which leg 1, leg 2, and wood participate in
i5 the temporal interval during which leg 2 is
proper continuant part of wood
i6 the temporal interval at which leg 2 exists at
i7 the temporal interval occupied by table destruc-
tion process in which wood loses table function
Relation Usage
10
````

## PDF page 11

````text
bearer of holding between a portion of wood and a
function it bears. bearer of is the inverse of
inheres in
exists at holding between an entity and the temporal
interval when it exists
occupies temporal region holding a process and just those temporal in-
tervals over which the process unfolds.
has participant holding between a process, a material entity
involved in that process, and the temporal re-
gion at which the process occurs
proper continuant part of holding between a proper mereological part of
wood and wood itself, at the temporal region
during which they are parts.
Table 1: Classes, Particulars, and Relations used to Formalize Case 1
wood is an instance of portion of wood throughout interval i and its seven
sub-intervals:
1. is a(portion of wood, material entity)
2. instance of(wood, portion of wood, i)
wood bears a table function and has proper continuant part several legs. We
focus on leg 1. We relate respective functions and material bearers:
3. instance of(leg function 1, leg function, i2)
4. instance of(table function, table function, i1)
5. instance of(leg 1, object, i3)
6. instance of(wood, object, i2)
7. bearer of(wood, table function)
8. bearer of(leg 1, leg function 1)
9. proper continuant part of(leg 1, wood, i2)
wood, leg 1, and leg 2 participate in leg replacement process:
10. instance of(leg function 2, leg function, i)
11. instance of(leg 2, object, i6)
12. bearer of(leg 2, leg function 2)
13.¬continuant part of(leg 2, wood, i3)11
14. instance of(leg replacement process, leg replacement process, i4)
11Strictly speaking, leg 2 is also not a continuant part of wood at earlier times. Corresponding
axioms are assumed but not displayed here.
11
````

## PDF page 12

````text
15. occupies temporal region(leg replacement process, i4)
16. participates in(leg 1, leg replacement process, i4)
17.¬continuant part of(leg 1, wood, i5)12
18. participates in(leg 2, leg replacement process, i4)
19. proper continuant part of(leg 2, wood, i5)
Afterwards, wood and its parts participate in an instance of table destruction
process:
20. instance of(table destruction process, table destruction process, i7)
21. occupies temporal region(table destruction process, i7)
22. participates in(wood, table destruction process, i7)
23.∃toccurrent part of(t, i7)∧¬exists at(table function, t)
We leave open whether proper parts of wood maintain their respective func-
tions. That is compatible with the case that most proper parts of wood parts
maintain their functions but are arranged such that wood loses table function.
In any event, wood exists at i7 though table function does not and thus wood
no longer instantiates table. Figure 4 provide an illustration of the change de-
scribed in this case.
4.2 Roles
CASE 2: Mr. Potter is the teacher of class 2C at Shapism School and resigns at the
beginning of the spring break. After the spring break, Mrs. Bumblebee replaces Mr.
Potter as the teacher of 2C. Also, student Mary left the class at the beginning of the
break and a new student, John, joins in when the break ends.
GOAL: The example aims to show if and how the ontology models the relationships
between roles, players and organizations.
FOCUS: The change of roles/players; the vacancy of the teaching position; persis-
tence of the class while students come and go.
Mr. Potter is – we assume – the only teacher of class 2C prior to Spring Break
and participates in an act of resignation prior to this break. Classes at Shapism
School are not in session during the break, but during this time Mrs. Bumble-
bee and Shapism School agree that Mrs. Bumblebee will bear a 2C teacher role
at the end of Spring Break. We focus on only Mr. Potter and Mrs. Bumble-
bee in our formalization, as the loss of student Mary and gain of student John
during this interval does not di ﬀer greatly from the loss of teacher Mr. Potter
and gain of teacher Mrs. Bumblebee. We use the following assignment in our
formalization:
12Strictly speaking, leg 1 is also not a continuant part of wood at earlier times. Corresponding
axioms are assumed but not displayed here.
12
````

## PDF page 13

````text
Table 
i 2 
Table 
Destruction 
Process 
i 7 
Leg 2 
i 5 
Leg 1 
Leg 
Replacement 
Process 
i 4 
occupies temporal region 
at 
has participant at 
proper continuant part of 
proper continuant part of 
occupies temporal region 
has participant at 
has participant at 
at 
at 
at 
at 
Table 
Function 
bearer of 
Leg Function 2 bearer of 
Leg Function 
1
bearer of 
Table 
Function 
i 1 exists at 
exists at 
i 6 
exists at exists at 
i 3 
exists at 
exists at 
Figure 4: Table Undergoing Change in Case 1
Class Deﬁnition or Elucidation
person an object belonging to the species primate and distinguished
by a high level of intelligence.
organization an independent continuant that can play roles, has members,
and has a set of organization rules.
Particulars Descriptions
Mr. Potter an instance of person
Mrs. Bumblebee an instance of person
Shapism School an instance of organization, the academic em-
ployer of Mr. Potter and Mrs. Bumblebee
2C a member part of Shapism School, in which Mr.
Potter and Mrs. Bumblebee teach
2C teacher role 1 the role borne by Mr. Potter as the teacher of class
2C
2C teacher role 2 the role borne by Mrs. Bumblebee as the teacher
of class 2C
act of resignation the process during which Mr. Potter resigns from
his role as teacher of class 2C
act of teaching assignment the process during whichShapism School and Mrs.
Bumblebee coordinate resulting inMrs. Bumblebee
becoming teacher of 2C
spring break a process during which Spring Break occurs
i1 the interval during which Mr. Potter is a member
part of 2C
i2 the interval during which2C is a member part of
Shapism School
i3 the interval during which Mr. Potter participates
in act of resignation
i4 the interval during which Mrs. Bumblebee partic-
ipates in an act of teaching assignment
i5 the interval occupied by the act of teaching assign-
ment in which Mrs. Bumblebee and Shapism School
participate
i6 the interval during which Shapism School partici-
pates in an act of teaching assignment
i7 the interval during which Mrs. Bumblebee is a
member part of 2C
13
````

## PDF page 14

````text
Relations Descriptions
bearer of holds between instances of person and the
teacher roles which inhere in that person
proper temporal part of holds between temporal intervals and the larger
interval of which they are occurent part
occupies temporal region holds between processes and just those tempo-
ral intervals over which they unfold
participates in holds between material entities and the pro-
cesses in which they are involved
member part of holds holding between object aggregates and
their members
has speciﬁed output holds between act of teaching assignment and
Mrs. Bumblebee’s2C teacher role
Table 2: Particulars and Relations Used to Formalize Case 2
Mr. Potter and Mrs. Bumblebee are instances of person [19]. Shapism School
is an instance of organization [20,21]. Organizations may have other organi-
zations as member parts, allowing for class 2C to be member part of Shapism
School:
1. is a(person, object)
2. is a(organization, object aggregate)
3. instance of(Mr. Potter, person, i)
4. instance of(Mrs. Bumblebee, person, i)
5. instance of(Shapism School, organization, i)
6. member part of(2C, Shapism School, i)
Mr. Potter was a member part of2C prior to the start ofspring break. Mrs. Bum-
blebee was not a member of 2C during this time. Before spring break begins, Mr.
Potter participates in an act of resignation so that during and after spring break
Mr. Potter is no longer a member part of 2C. We leave open whetherMr. Potter
remains a member of Shapism School during and after spring break:
7. member part of(Mr. Potter, 2C, i1)
8.¬member part of(Mrs. Bumblebee, 2C, i1)
9. instance of(spring break, process, i)
10. instance of(act of resignation, process, i3)
11. participates in(Mr. Potter, act of resignation, i3)
14
````

## PDF page 15

````text
12.¬member part of(Mr. Potter, 2C, i4)13
Shapism School and Mrs. Bumblebee participate in act of teaching assignment
resulting in Mrs. Bumblebee being a member part of 2C after spring break.
13. occupies temporal region(act of teaching assignment, i5)
14. proper temporal part of(i4, i5)
15. proper temporal part of(i6, i5)
16. participates in(Shapism School, act of teaching assignment, i6)
17. participates in(Mrs. Bumblebee, act of teaching assignment, i4)
18. member part of(Mrs. Bumblebee, 2C, i7)
2C Teacher Role 2 
Act of Teaching 
Assignment 
Mrs. Bumblebee 
bearer of 
participates in 
i 4 
at 2C Teacher Role 1 
Act of 
Resignation 
Mr. Potter 
bearer of 
participates in 
i 3 at 
2C 
Shapism 
School 
member part of 
member part of 
i 7 
at 
i 1 
at 
i 2 
at 
participates in 
at 
i 6 
i 5 
proper temporal part of proper temporal part of 
occurs on temporal region 
member part of 
has speciﬁed output 
Figure 5: Resignation and Assignment of 2C Teacher Roles in Case 2
With respect to relevant roles, Mr. Potter bears 2C teacher role 1 – a role borne
by a unique person who is a member part of 2C at a given time. Following the
13Mr. Potter is, additionally, not a member part of 2C during subsequent intervals.
15
````

## PDF page 16

````text
act of teaching assignment in which Shapism School and Mrs. Bumblebee partici-
pate, Mrs. Bumblebee is the unique bearer of 2C teacher role 2. There is, to date,
no well developed treatment of titles, organizational positions, and o ﬃces as
such, where these are understood to be independent of the particular role that
persons bear when holding such o ﬃces. This may arise in cases, for instance,
where one wishes to refer to advertise an open teaching position at the school.
However, generically dependent continuants may serve as the parent class for
such entities.
19. bearer of(Mr. Potter, 2C teacher role 1)
20.¬exists at(2C teacher role 1, i4)14
21. has speciﬁed output (act of teaching assignment, 2C teacher role 2)15
22. bearer of(Mr. Bumblebee, 2C teacher role 2)
4.3 Property Change
CASE 3: A ﬂower is red in the summer. As time passes, the color changes. In
autumn the ﬂower is brown.
GOAL: The example aims to show if and how the ontology models change in quali-
ties/properties.
FOCUS: The change of the color of a ﬂower.
Color is a messy phenomenon. Color ascriptions can be described at di ﬀerent
levels of granularity, for example, the whole ﬂower, ﬂower petals, or proper
surface parts of petals. Distributions of colors at one level of granularity often
determine color at higher levels of granularity. For example, classiﬁcation of a
petal as “red” depends on the distribution of red on proper parts of the petal’s
surface. Additionally, color may be understood as qualities, or dispositions
to cause color experiences, or the color experiences themselves. We will thus
need to simplify our formalization. We focus on a speciﬁc petal of the ﬂower
for simplicity, noting our formalization can be applied to lower or higher levels
of granularity. Moreover, we focus on colors as qualities of entities, rather than
dispositions to cause experiences or as experiences. Broadly speaking then, the
petal bears a red color quality during summer that becomes brown during fall.
During this time, the ﬂower participates in an act of withering. We use the
following assignments in our formalization:
Class Deﬁnition or Elucidation
petal a material entity leaf that often surrounds reproductive parts of
some ﬂower
142C teacher role does not exist during subsequent intervals.
152C teacher role does not exist before interval i5.
16
````

## PDF page 17

````text
ﬂower a material entity that generates seeds during a reproductive cycle
color a quality borne by a material entity that underwrites the reﬂection
of light
red a color with wavelength between 625 and 740 nanometers
brown a color with wavelength of approximately 600 nanometers, with
low saturation and luminance
Particular Description
petal the petal that bears a color quality that changes
from red to brown
ﬂower the ﬂower whose petal continuant part changes
color through the season change
color the color borne by the petal that changes from red
to brown
summer the process during which the petal begins as red
and gradually becomes closer in color to brown
fall the process during which the petal begins as red-
dish brown, but gradually becomes brown
process of withering the process during which the ﬂower loses elasticity
and vibrancy
i1 the interval occupied by summer
i2 the interval occupied by fall
i3 the interval during which color is an instance of
red, which is an occurrent part of both i1 and i6
i4 the interval occupied by process of withering, which
is an occurrent part of i2
i5 the interval during which color is an instance of
brown, which is an occurrent part of both i4 and
i6
i6 the interval during which color is an instance of
color
Relation Usage
participates in holds between ﬂower and process of wither-
ing
occupies temporal region holds between summer, fall, process of with-
ering, and the respective temporal region s
they each occupy
17
````

## PDF page 18

````text
occurrent part of holds betweentemporal intervals and larger
intervals of which they are parts
proper continuant part of holds betweenpetal and the ﬂower of which
it is a part
bearer of holds between petal and the color that it
bears
Table 3: Classes, Particulars, and Relations Used to Formalize Case 3
We use the classes ﬂower and petal [4,22] and assert the instance ﬂower of the
former has continuant part petal, which is an instance of the latter:
1. instance of(ﬂower, ﬂower, i)
2. instance of(petal, petal, i)
3. proper continuant part of(petal, ﬂower, i)
Color is a speciﬁcally dependent continuant in BFO [23]. We assert two sub-
classes of color: red and brown, and we furthermore assert that petal bears an
instance of color:
4. is a(color, quality)
5. is a(red, color)
6. is a(brown, color)
7. instance of(color, color, i6)
8. bearer of(petal, color)
The color borne by petal is an instance of red during summer, and an instance
of brown during fall:
9. instance of(summer, process, i1)
10. instance of(fall, process, i2)
11. occupies temporal region(summer, i1)
12. occupies temporal region(fall, i2)
13. instance of(color, red, i3)
14. instance of(color, brown, i5)
15. occurrent part of(i3, i1)
16. occurrent part of(i3, i6)
17. occurrent part of(i5, i4)
18. occurrent part of(i5, i6)
The ﬂower participates in a process of withering that occurs during fall:
18
````

## PDF page 19

````text
Flower Process of 
Withering 
i 4 
i 2 
Fall 
i 5 
Color Summer 
i 1 
i 3 
Color 
Red Brown 
occurrent part of 
occupies temporal region 
is a is a 
instance of 
instance of 
instance of 
at 
at 
bearer of 
participates in 
occurrent part of 
occupies temporal region 
occurrent part of 
occupies temporal region 
i 6 
at 
occurrent part of 
occurrent part of 
at i 4 
Figure 6: Petal Changing Color in Case 3
19. instance of(process of withering, process, i4)
20. occupies temporal region(process of withering, i4)
21. occurrent part of(i4, i2)
CASE 4: A man is walking when suddenly he starts walking faster and then breaks
into a run.
GOAL: The example aims to show if and how the ontology models change during
an event.
FOCUS: The change in the speed and mode of locomotion.
Processes do not change; they are changes. Participating in an act of loco-
motion, however, may have proper process walking, accelerating, and running
parts. Intuitively, walking and running consist of sequences involving an agent
who makes patterned contact with the ground using their feet, over some du-
ration. For a given agent and given duration, walking is distinguished from
running based on the number of moments of contact between the agent’s feet
and the ground. If this number is above some threshold, which may vary given
the agent’s size and shape, then it will count as running. An individual is accel-
erating when the there is a patterned decrease in the duration between contacts
with the ground and an increase in the spatial distance traversed by the agent.
In this case, a man is participating in an act of locomotion having proper
process parts an act of walking, act of running, and act of accelerating. Our
19
````

## PDF page 20

````text
formalization uses the following assignments:
Particulars Descriptions
man an instance of person who bears some male gender
act of locomotion an instance of process in which the man changes spatial
position
act of walking an instance of process in which the man changes spatial
position exerting little eﬀort, at a low speed
act of accelerating an instance of process in which theman increases speed
at which he changes spatial position
act of running an instance of process in which the man changes spa-
tial position, while exerting signiﬁcant e ﬀort, at a high
speed
i1 the interval during which theman participates in an act
of walking
i2 the interval during which theman participates in an act
of accelerating
i3 the interval during which theman participates in an act
of running
Relations Usage
proper occurrent part of holds between acts of accelerating, walking,
and the larger act of locomotion of which they
are parts
participates in holds between the man and processes in which
he participates
Table 4: Classes, Particulars, and Relations used to Formalize Case 4
The man participates in an act of locomotion [18].
1. instance of(man, person, i)
2. instance of(act of locomotion, process, i)
3. participates in(man, act of locomotion, i)
This process is comprised of proper occurrent parts [23] – an act of walking ,
act of accelerating, and act of running. The man participates in each. Figure 7
illustrates our formalization of the case.
4. proper occurrent part of(act of walking, act of locomotion)
20
````

## PDF page 21

````text
Act of 
Locomotion 
Act of 
Walking 
Act of  
Accelerating 
Act of 
Running 
Man 
participates in 
participates in 
participates in 
occurrent part of occurrent part of occurrent part of 
occurrent part of occurrent part of 
i 1 
i 2 
i 3 
at at 
at 
Figure 7: Man Moving with Increasing Speed in Case 4
5. proper occurrent part of(act of accelerating, act of locomotion)
6. proper occurrent part of(act of running, act of locomotion)
7. proper occurrent part of(act of accelerating, act of walking)
8. proper occurrent part of(act of accelerating, act of running)
9. participates in(man, act of walking, i1)
10. participates in(man, act of accelerating, i2)
11. participates in(man, act of running, i3)
While our characterization of this case is general, complementary reﬁnements
could be added. For example, the man’s changing speed at times during this
case might be represented as measurements taken at temporal parts of the in-
terval. Figure 3 provides a recipe for characterizing measurements using in-
stances of generically dependent continuant. as evidenced in the next case.
Moreover, our analysis of the next case illustrates a further complementary
characterization of changing motion.
4.4 Event Change
CASE 5: A man is walking to the station, but before he gets there, he turns around
and goes home.
GOAL: The example aims to show if and how the ontology models change in goal-
directed activities.
FOCUS: An activity/event is not completed and another activity/event is completed
instead.
21
````

## PDF page 22

````text
The man commits himself to a plan to walk to the station, which is speciﬁed
in terms of actions he might take and the objective he seeks. Prior to arriving
at the station, the man abandons his initial plan, and forms another, this time
to turn around and walk home. As before, the man’s plan to walk home is
speciﬁed in terms of actions he might take and the objective he seeks. In this
case, the man achieves his objective.
Class Deﬁnition or Elucidation
plan a realizable entity that inheres in a bearer
who is committed to realizing it as a
planned process
plan speciﬁcation an information entity with action speciﬁ-
cations and objective speciﬁcations as con-
tinuant partsthat, when concretized, isre-
alized in a process in that the bearer tries
to achieve the objectives by taking the ac-
tions speciﬁed
information content entity a generically dependent entity that de-
pends on some artifact and stands in a re-
lation of aboutness to some entity
action speciﬁcation an information entity thatdescribes an ac-
tion the bearer will take
objective speciﬁcation an information entity that describes an in-
tended process endpoint. When continu-
ant part of a plan speciﬁcation the con-
cretization is realized in a planned process
in which the bearer tries to eﬀect the world
so that the process endpoint is achieved
facility a material entity that is designed as a
building or campus dedicated to some spe-
ciﬁc purpose
planned process a process that realizes a plan that is the
concretization of a plan speciﬁcation
Particulars Descriptions
man the person who bears some male gender in
the scenario
plan 1 the plan that the man forms to walk to the
station
22
````

## PDF page 23

````text
plan 2 the plan that theman forms to turn around
and walk home
station plan speciﬁcation the plan speciﬁcation having continuant
part station action speciﬁcation and station
objective speciﬁcation
station action speciﬁcation an action speciﬁcation describing the steps
the man intends to take to walk to the sta-
tion
station objective speciﬁcation the objective speciﬁcation describing
reaching the station as the objective of the
station plan speciﬁcation
home plan speciﬁcation the plan speciﬁcation having parts home
action speciﬁcation and home objective spec-
iﬁcation
home action speciﬁcation the action speciﬁcation describing the
steps the man intends to take to turn
around and walk home
home objective speciﬁcation the objective speciﬁcation describing
reaching home as the objective of the home
objective plan
station the facility to which the man initially in-
tends to walk
home the facility to which the man later walks
station description the information content entity describing
the station, that is continuant part of the
station objective speciﬁcation
home description the information content entity describing
the man’s home, that is continuant part of
the home objective speciﬁcation
4mph walk the process during which the man walks at
a uniform velocity of 4 mph
3mph walk the process during which the man walks at
a uniform velocity of 3 mph
180 turn the process during which the man turns
180 degrees
i1 interval during which the station plan spec-
iﬁcation exists, and during which the sta-
tion action speciﬁcation and objective speci-
ﬁcation are proper continuant parts of the
station plan speciﬁcation
i2 interval during which is station plan speci-
ﬁcation concretized by plan 1
i3 interval during which the man partici-
pates in the 4mph walk process
23
````

## PDF page 24

````text
i4 interval during which the man partici-
pates in the 180 turn process
i5 interval during which the man partici-
pates in the 3mph walk process
i6 interval during which home plan speciﬁca-
tion is concretized by plan 2
i7 interval during which the home plan speci-
ﬁcation exists, and during which the home
action speciﬁcation and objective speciﬁca-
tion are proper continuant parts of the
home plan speciﬁcation
Relations Descriptions
concretized by holds between station plan speciﬁcation ,
home plan speciﬁcation , and plan 1 and
plan 2, respectively
proper continuant part of at holds between action and objective speci-
ﬁcations and plan speciﬁcations, as well as
between descriptions and objective speci-
ﬁcations
exists at holds between plan speciﬁcations and the
temporal intervals at which they exist
is about holds between descriptions and the enti-
ties they describe
bearer of holds between the man and plan 1 and
plan 2
prescribes holds between an action speciﬁcation
and the processes that the speciﬁcation
prescribes
achieves planned objective holds between a planned process and
objective speciﬁcation when the criteria
speciﬁed in the objective speciﬁcation
are met at the end of the planned process
participates in holds between man and the processes in
which he participates
Table 5: Classes, Particulars, and Relations Used to Formalize Case 5
The man bears plan 1 [25,26], which is a concretization of station plan speciﬁ-
cation. Station plan speciﬁcation has continuant part both an action speciﬁcation
that prescribes the steps the man might take to walk to the station and the ob-
jective speciﬁcation that describes the goal of plan 1:
24
````

## PDF page 25

````text
1. is a(plan, realizable entity)
2. is a(plan speciﬁcation, information content entity)
3. instance of(plan 1, plan, i)
4. instance of(station plan speciﬁcation, plan speciﬁcation, i2)
5. instance of(station action speciﬁcation, action speciﬁcation, i2)
6. instance of(station objective speciﬁcation, objective speciﬁcation, i2)
7. inheres in(plan 1, man)
8. concretized by(station plan speciﬁcation, plan 1, i3)
9. continuant part of(station action speciﬁcation, station plan speciﬁcation, i2)
10. continuant part of(station objective speciﬁcation, station plan speciﬁcation,
i2)
Station is an instance of facility [18]. Because plan 1 is an instance of re-
alizable entity, it is not strictly speaking about anything, as only information
content entities may be about some entity. Nevertheless, there is aninstance of
information content entity that is part of the station objective speciﬁcation and
concretized by plan 1, which includes the station in its description. We can
thus say man’splan 1 (derivatively) is about the station. Moreover, the station
action speciﬁcation includes the walking plan he intends to take in pursuit of
that objective. Additionally, the man participates in a 4mph walk:
11. instance of(station, facility, i)
12. instance of(station description, information content entity, i)
13. continuant part of(station description, station objective speciﬁcation, i2)
14. described by(station, station description)
15. participates in(man, 4mph walk, i4)
At some time, the man forms plan 2 to walk back home, then participates in an
instance of 180 turn, then participates in a 3mph walk until he arrives home:
16. instance of(plan 2, plan, i)
17. instance of(home plan speciﬁcation, plan speciﬁcation, i)
18. instance of(home action speciﬁcation, action speciﬁcation, i6)
19. instance of(home objective speciﬁcation, objective speciﬁcation, i6)
20. continuant part of(home action speciﬁcation, home plan speciﬁcation, i6)
21. continuant part of(home objective speciﬁcation, home plan speciﬁcation, i6)
22. inheres in(plan 2, man)
23. concretized by(home plan speciﬁcation, plan 2, i6)
24. prescribes(home plan speciﬁcation, 180 turn)
25
````

## PDF page 26

````text
25. prescribes(home plan speciﬁcation, 3mph walk)
26. participates in(man, 180 turn, i4)
27. participates in(man, 3mph walk, i5)
28. realized in(plan 2, 180 turn)
29. realized in(plan 2, 3mph walk)
The man’s home is a facility. There is an instance of information content entity
that is part of the home objective speciﬁcation and concretized by plan 2, where
plan 2 includes home in its description. We can thus say the man’s plan 2 is
(derivatively) about the home. As before, the home action speciﬁcation includes
the walking plan the man intends to take. In this case, the man does achieve
his planned objective, which we can represent by theman’s participating in an
instance of planned process and bearing an achieves objective relation to the
home objective speciﬁcation, which we import from [21,22].
30. is a(planned process, process)
31. instance of(planned process, planned process, i)
32. instance of(home, facility, i)
33. instance of(home description, information content entity,i7)
34. continuant part of(home description, home objective speciﬁcation, i7)
35. described by(home, home description)
36. participates in(man, planned process, i6)
37. achieves planned objective(planned process, home objective speciﬁcation)
For further speciﬁcation of theman’swalk, formalizations of distance measure-
ment using BFO and its extensions illustrated in Figure 3 can be leveraged to
describe how far the man traveled in his initial trip before turning back.
4.5 Concept Evolution
CASE 6: A marriage is a contract that is regulated by civil and social constraints.
These constraints can change but the meaning of marriage continues over time.
GOAL: The example aims to show if and how the ontology models the evolution of
the meaning of a term.
FOCUS: The continuity/discontinuity of the meaning of marriage in the presence of
changing qualiﬁcations.
Speaking of ‘the meaning’ of marriage is spurious. Like most words, ‘marriage’
is polysemous. It can refer to a process in which spouses participate; it can refer
to information content entities (i.e. the idea of marriage in the minds of partic-
ular people, or as represented in legal documents); and it can refer to a pair of
mutually dependent spousal roles and their associated powers and privileges.
Some uses of ‘marriage’ pull together all three meanings, as when we speak of
26
````

## PDF page 27

````text
man 
plan1 home 
station 
station plan 
speciﬁcation 
station objective 
speciﬁcation home plan 
speciﬁcation 
home objective 
speciﬁcation 
station 
description 
Home Action 
Speciﬁcation 
4mph Walk 
180 Turn 3mph Walk 
bearer of 
plan2 
bearer of 
station Action 
speciﬁcation 
concretized in 
concretized in 
i 2 i 6 
at 
at 
proper continuant part of 
proper continuant part of 
propert continuant part of 
propert continuant part of 
i 1 at 
at 
exists at 
i 7 
at 
at exists at 
is about 
proper continuant part of 
at 
i 3 
at 
participates in 
prescribes 
Home 
description described by 
continuant part of 
at 
participates in 
at 
participates in 
i 4 
i 5 
achieves planned objective 
prescribes 
realized in 
i 8 
at 
Figure 8: Man Walking to Station, then Home in Case 5
the institution of marriage and denote a set of practices (processes) realizing
marital powers (roles) that are prescribed by social or religious doctrine and
law (information content entities). In representing marriage, we should take
care not to conﬂate these di ﬀerent notions. As Groucho Marx once quipped:
”Marriage is a wonderful institution, but who wants to live in an institution?”
Marriage license regulations vary by geographical region, population, and
organizational a ﬃliation. In the U.S., for example, marriage requirements,
laws, and associated rights are established by states. All states impose eligibil-
ity requirements on individuals. For example, individuals entering marriage
must have the capacity to consent to the arrangement and must be above a
certain age. States also impose eligibility requirements on the couple. For ex-
ample, at least one member of the union must be a U.S. citizen, before 1967
several states prohibited interracial marriage, and until 2015 several prohib-
ited same-sex marriage [28]. Governments also grant obligations to spouses -
married partners bear ﬁnancial responsibilities to one another - and privileges
- married partners are not required to testify against one another in court.
Obligations and privileges can, like eligibility requirements, be changed by
governing agencies.
We focus on the present status of a marriage contract issued in the U.S. be-
tween 1967 and 2015, and subsequent legal changes after 2015.
27
````

## PDF page 28

````text
Class Deﬁnition or Elucidation
document a collection of information content entities in-
tended to be understood together as a whole
government an organization that exercises executive, legisla-
tive, or judicial authority over a region
marriage license a document issued by a government, which legally
binds agents as spouses, and invests them with as-
sociated instances of deontic role
deontic declaration a social act that creates or revokes a deontic role
social act a planned process that is carried out by a person
or an organization, and is self-generated, directed
towards another person or an aggregate of persons,
an organization or an aggregate of organizations,
and that needs to be perceived
deontic role a role that inheres in a person and that is exter-
nally grounded in the normative expectations that
other persons within a social context have concern-
ing how that person should behave
action regulation an information content entity that prescribes an
act as required, prohibited, or permitted, and is the
output of an act that realizes some authority role
authority role a role that is realized by actions that create, mod-
ify, transfer, or eliminate action regulations or
other authority roles, and inheres in an agent in
virtue of collective acceptance of that agent’s abil-
ity to issue binding directives
Particulars Descriptions
U.S. Supreme Court the branch of government able to legally
create or revoke deontic powers of state
government
deontic declaration 1 the deontic declaration that has speciﬁed
output marriage license
deontic declaration 2 the deontic declaration that has speciﬁed
output action regulation 1
deontic declaration 3 the deontic declaration that legally re-
vokes deontic role 1 and deontic role 3
28
````

## PDF page 29

````text
deontic role 1 the deontic role inhering in Alex realized
in Alex legally refraining from testifying
against Bailey in court
deontic role 2 the deontic role inhering in Alex realized
in Alex’s legal permission to ﬁle income
taxes jointly with Bailey
deontic role 3 the deontic role inhering in Bailey real-
ized in Bailey legally refraining from tes-
tifying against Alex in court
deontic role 4 the deontic role inhering in Bailey real-
ized in Bailey’s legal permission to ﬁle in-
come taxes jointly with Alex
marriage license the marriage license issued bystate govern-
ment, which legally binds Alex and Bailey
together as spouses, and invests them with
associated instances of deontic role
state government the government participating in the mar-
riage of Alex and Bailey
Alex the person entering acquiring amarriage li-
cense with Bailey
Bailey the person entering acquiring amarriage li-
cense with Alex
marriage licensure document a document describing the objective of is-
suing, and steps that must be taken to issue
marriage license
action regulation 1 an action regulation requiringstate govern-
ment to issue instances of marriage license
for consenting same-sex couples
authority role 1 an authority role borne by state govern-
ment, prescribed by action regulation 1
i1 the interval during whichstate government,
Alex, and Bailey participate in deontic dec-
laration 1 resulting in the creation of mar-
riage contract
i2 the interval during which U.S. Supreme
Court participates in deontic declaration
2 requiring state government to recognize
same-sex marriage
i3 the interval during which state government
legally revokes deontic role 1 and deontic
role 3
Relations Descriptions
29
````

## PDF page 30

````text
participates in holds between agents and instances of deontic
declaration
has speciﬁed input holds between deontic declaration 1 and marriage
licensure document
has speciﬁed output holds between instances of deontic declaration
and document, and action regulation 1
inheres in holds between instances of deontic role and Alex
and Bailey, respectively
prescribes holds between action regulation 1 and authority
role 1
legally revokes holds between deontic declaration 3 and deontic
role 1 and deontic role 3
Table 6: Classes, Particulars, and Relations Used to Formalize Case 6
The marriage license is an instance of the class marriage license, which is a sub-
class of document [29,30 31,32]. State government, which issues the marriage
license, is an instance of government, which is a type of organization able to
exercise judicial, legislative, or executive authority over a site.
1. is a(document, information content entity)
2. is a(marriage license, document)
3. is a(government, organization)
4. instance of(marriage license, marriage license, i)
5. instance of(state government, government, i)
State governmentparticipates in deontic declaration 1, a type of social act [28,29,30]
which has speciﬁed input a marriage licensure document that has, as part, a
plan speciﬁcation. This plan speciﬁcation describes the intended legal enti-
ties created according to the objective speciﬁcation, as well as the manner in
which the deontic declaration should be performed to achieve that objective
– as described by the action speciﬁcation. For simplicity, we do not include
these continuant parts of marriage licensure document. The deontic declaration
1, moreover, has speciﬁed output the marriage license:
6. is a(deontic declaration, social act)
7. instance of(deontic declaration 1, deontic declaration, i1)
8. participates in(state government, deontic declaration 1, i1)
9. has speciﬁed input (deontic declaration 1, marriage licensure document)
10. has speciﬁed output (deontic declaration 1, marriage license)
30
````

## PDF page 31

````text
Alex and Bailey each participates in deontic declaration 1 as well. Instances
of deontic declaration involve the creation or revoking of deontic roles. In-
stances of deontic role inhere in persons or organizations, but are externally
grounded in the normative expectations others have concerning how bearers
should behave. In this case, instances of deontic roleinhere in Alex and Bailey,
respectively. These respective roles are realized in processes typically associ-
ated with marriage, such as ﬁling taxes jointly and making medical decisions
on behalf of the spouse. For simplicity, we focus on only two such deontic roles
each for Alex and Bailey.
11. instance of(Alex, person, i)
12. instance of(Bailey, person, i)
13. participates in(Alex, deontic declaration 1, i1)
14. participates in(Bailey, deontic declaration 1, i1)
15. is a(deontic role, role)
16. instance of(deontic role 1, deontic role, i1)
17. instance of(deontic role 2, deontic role, i1)
18. instance of(deontic role 3, deontic role, i1)
19. instance of(deontic role 4, deontic role, i1)
20. inheres in(deontic role 1, Alex)
21. inheres in(deontic role 2, Alex)
22. inheres in(deontic role 3, Bailey)
23. inheres in(deontic role 4, Bailey)
At some point, following deontic declaration 1 that results in the state govern-
ment issuing marriage license for Alex and Bailey, the U.S. Supreme Court par-
ticipates in deontic declaration 2 resulting in all state prohibitions on same-sex
marriage being deemed unconstitutional. Deontic declaration 2 has speciﬁed
output action regulation 1 permitting the authorization of same-sex marriage.
This prescription sanctions new realizations of state and local agent instances
of authority role relevant to marriage contracts, by broadening the class of
those eligible to participate in an act of marrying.
24. instance of(U.S. Supreme Court, organization, i)
25. instance of(deontic declaration 2, deontic declaration, i2)
26. participates in(U.S. Supreme Court, deontic declaration 2, i2)
27. is a(action regulation, information content entity)
28. instance of(action regulation, action regulation, i2)
29. has speciﬁed output (deontic declaration 2, action regulation 1)
30. is a(authority role, role)
31
````

## PDF page 32

````text
Authority 
Role 
Deontic 
Declaration 1 
Deontic Role 
1
Deontic Role 
2
proper continuant part proper continuant part 
i2 
at 
i 4 
at 
Deontic 
Declaration 2 
Action 
Regulation 2 
Action 
Regulation 1 
has speciﬁed output 
has speciﬁed output prescribes prescribes 
prescribes prescribes 
i 3 i 1 
U.S. 
Supreme 
Court 
participates in 
has speciﬁed output 
occupies temporal region 
occupies temporal region 
Notarizing a Same Sex 
Marriage License 
Notarizing an Opposite 
Sex Marriage License 
realized in realized in 
precedes precedes precedes 
has speciﬁed output 
Figure 9: Changing Deontic Roles in Case 6
31. instance of(authority role 1, authority role, i2)
32. prescribes(action regulation, authority role 1)
33. inheres in(authority role 1, state government 1)
The expansion of sanctioned realizations ofinstances of authority role by state
government does not undermine that Alex and Bailey have a marriage license.
This is because instances of deontic role borne by Alex and Bailey are not
altered by action regulation 1 , since action regulation 1 targets eligibility con-
straints on marriage.
As discussed, governments may alter marriage contracts in another way, by
changing spousal obligations and powers. To illustrate, suppose state govern-
ment participates in deontic declaration 3 which legally revokes the deontic
role 1 that inheres in Alex and deontic role 2 that inheres in Bailey, which
we assume correspond to privileges bearers have to refrain from testifying
against their spouse. This results in Alex and Bailey losing these respective
roles, though they maintain deontic role 2 and deontic role 4.
34. participates in(state government, deontic declaration 3, i3)
35. legally revokes(deontic declaration 3, deontic role 1, i3)
36. legally revokes(deontic declaration 3, deontic role 3, i3)
37.∃t occurrent part of(t, i3)∧¬exists at(deontic role 1, t)∧¬exists at(deontic
role 3, t)
At least two types of change to marriage licenses can be represented with BFO,
reﬂecting changes to eligibility requirements – which either narrow or extend
32
````

## PDF page 33

````text
participants – or changes to associated roles – which either narrow or extend
spousal rights and obligations. In each case, the meaning of marriage, in some
sense, remains the same.
5. Ontology Usage and Community Impact
BFO is committed to there being a single reality, with scientiﬁc investigation
often resulting in clariﬁcations of our picture of this reality. As science up-
dates, ontology should follow. Other conceptions, past or present, of the way
the world is, or might be, are merely informational entities and impose no fur-
ther ontological commitments.
As the core architecture of OBO and IOF [1,2], BFO is widely used across
a range of scientiﬁc disciplines. BFO is, for example, used extensively in the
biomedical domain [33], providing domain specialists foundational support
when modeling phenotypes [34], disease [35,36,37], diagnosis [38,39], and re-
sistance [40]. BFO is presently used in over 350 ontology products, and with
its recent standardization, this number will no doubt increase in the coming
years.
Acknowledgements
Thanks to Barry Smith for his comments on an early draft of this manuscript.
J. Neil Otte and Alan Ruttenberg gratefully acknowledge The Digital Manu-
facturing and Design Innovation Institute (DMDII) for their research funding
in support of this work.
References
[1] Barry Smith, Michael Ashburner, Werner Ceusters, Louis Goldberg, Chris
Mungall, Nigam Shah, Jonathan Bard, Karen Eilbeck, the OBI Working Group,
Neocles Leontis, Philippe Rocca-Serra, Cornelius Rosse, Alan Ruttenberg, and
Suzanna Lewis. The obo foundry: coordinated evolution of ontologies to sup-
port biomedical data integration. Nature Biotechnology, 25:1251–1255, 2007.
[2] Smith, B., Ameri, F., Cheong, H., Kiritsis, D., Sormaz, D., Will, C., & Otte, J.
(2019). A First-Order Logic Formalization of the Industrial Ontologies Foundry
Signature Using Basic Formal Ontology.JOWO.
[3] Cowell LG, Smith B. Infectious Diseases Ontology. In: Sintchenko V, editor.
Infectious Disease Informatics. New York, NY: Springer; 2010. p. 373-95.
[4] Walls RL, Cooper L, Elser J, et al. The Plant Ontology Facilitates Compar-
isons of Plant Development Stages Across Species.Front Plant Sci. 2019;10:631.
Published 2019 Jun 4. doi:10.3389/fpls.2019.00631
[5] Smith, et. al., 2019
[6] Ruttenberg, Alan. BFO-2020. 2020. Basic Formal Ontology (BFO), 2021.
GitHub, https://github.com/BFO-ontology/BFO-2020.
[7] Simons, P . (1987). Parts: A Study in Ontology. Oxford: Clarendon Press;
New York, NY. pg. 79
[8] Masolo, C., Vieu, L., Bottazzi, E., Catenacci, C., Ferrario, R., Gangemi, A.
and Guarino, N. (2004). Social Roles and Their Descriptions. In D. Dubois,
33
````

## PDF page 34

````text
C. Welty and M. A. Williams (eds.), Principles of Knowledge Representation
and Reasoning, Proceedings of the Ninth International Conference (KR 2004),
Whistler British Columbia, Canada, June 2-5, 2004.
[9] Robert Arp, Barry Smith, and Andrew D. Spear. Building ontologies with
Basic Formal Ontology. Massachusetts Institute of Technology, Cambridge,
Massachusetts, 2015.
[10] Barry Smith and Werner Ceusters, “Ontological Realism as a Methodology
for Coordinated Evolution of Scientiﬁc Ontologies”,Applied Ontology, 5 (2010),
139–188. PMC3104413
[11] Bittner T., Smith B. (2001) A Taxonomy of Granular Partitions. In: Mon-
tello D.R. (eds) Spatial Information Theory. COSIT 2001. Lecture Notes in
Computer Science, vol 2205. Springer, Berlin, Heidelberg.
[12] Bittner, T., Smith, B., & Donnelly, M. (2007). The logic of systems of gran-
ular partitions.
[13] Pierre Grenon: “BFO in a Nutshell: A Bi-Categorial Axiomatization of
BFO and Comparison with DOLCE”, IFOMIS Technical Report, 2003.
[14] Robert Arp and Barry Smith, “Function, Role, and Disposition in Ba-
sic Formal Ontology”, Proceedings of Bio-Ontologies Workshop (ISMB 2008),
Toronto, 45-48.Revised version.
[15] Barry Smith and Kevin Mulligan, “Pieces of a Theory”, in Barry Smith
(ed.), Parts and Moments. Studies in Logic and Formal Ontology, Munich 1982
[16] Eddy Zemach, “Four Ontologies”,Journal of Philosophy23 (1970), 231-247.
[17] Michael Gruninger and Zhuojun Li ”The Time Ontology of Allen’s Inter-
val Algebra” 24th International Symposium on Temporal Representation and
Reasoning 16:1:2017.
[18] Barry Smith, Werner Ceusters, Bert Klagges, Jacob Kauhler, Anand Kumar,
Jane Lomax, Chris Mungall, Fabian Neuhaus, Alan L. Rector, and Cornelius
Rosse. Relations in biomedical ontologies. Genome Biology, 6:R46, 2005.
[19] The OBO foundry, 2017. URL http://obofoundry.org. [Online; accessed
31-Oct-2017].
[20] Ron Rudnicki. Modeling information with the common core ontologies.
2016. URL https://github.com/ CommonCoreOntology. [Online; accessed 25-
Oct-2017].
[21] OBI consortium. Ontology for biomedical investigations, 2017. URL
http://purl.obolibrary.org/obo/obi. owl. [Online; accessed 25-Oct-2017].
[22] A. Bandrowski, R. Brinkman, M. Brochhausen, M. H. Brush, B. Bug, M. C.
Chibucos, K. Clancy, M. Courtot, D. Derom, M. Dumontier, L. Fan, J. Fostel, G.
Fragoso, F. Gibson, A. Gonzalez-Beltran, M. A. Haendel, Y. He, M. Heiskanen,
T. Hernandez-Boussard, M. Jensen, Y. Lin, A. L. Lister, P . Lord, J. Malone, E.
Manduchi, M. McGee, N. Morrison, J. A. Overton, H. Parkinson, B. Peters, P .
Rocca-Serra, A. Ruttenberg, S. A. Sansone, R. H. Scheuermann, D. Schober, B.
Smith, L. N. Soldatova, Jr. Stoeckert, C. J., C. F. Taylor, C. Torniai, J. A. Turner,
R. Vita, P . L. Whetzel, and J. Zheng. The ontology for biomedical investiga-
tions. PLoS One, 11:e0154556, 2016.
[23] Pankaj Jaiswal, Shulamit Avraham, Katica Ilic, Elizabeth A Kellogg, Susan
McCouch, Anuradha Pujar, Leonore Reiser, Seung Y Rhee, Martin M Sachs,
34
````

## PDF page 35

````text
Mary Schae ﬀer, et al. Plant ontology (PO): a controlled vocabulary of plant
structures and growth stages. Comparative and functional genomics, 6(7-
8):388–397, 2005.
[24] Smith B. (2012). Classifying Processes: An Essay in Applied Ontology.Ra-
tio, 25: 463–488. https://doi.org/10.1111/j.1467-9329.2012.00557.x
[25] Cleland, Thomas M. (1921). A practical description of the Munsell color sys-
tem, with suggestions for its use. Boston: Munsell Color Company.
[26] Smith, B., & Ceusters, W. (2015). Aboutness: towards foundations for the
Information Artifact Ontology.ICBO.
[27] Alan Ruttenberg, Chris Stoeckart, Melanie Courtor, Ji Zheng, James Over-
ton, James Malone, and Lawrence Hunter. Information artifact ontology web
site, 2017. URL https://github.com/information-artifact-ontology. [Online;
accessed 25-Oct-2017].
[28] Elizabeth Brake. Marriage and domestic partnership. In Edward N. Zalta,
editor, The Stanford Encyclopedia of Philosophy. Metaphysics Research Lab,
Stanford University, winter 2016 edition, 2016.
[29] Barry Smith. Document acts. In Institutions, emotions, and group agents,
pages 19–31. Springer, 2014.
[30] Mauricio B Almeida, Laura Slaughter, and Mathias Brochhausen. Towards
an ontology of document acts: Introducing a document act template for health-
care. In OTM Confederated International Conferences” On the Move to Mean-
ingful Internet Systems”, pages 420–425. Springer, 2012.
[31] Mathias Brochhausen, Amanda Hicks, Laura Slaughter, and Mauricio B.
Almeida. Ontology of document acts, 2017. [Online; accessed 25-Oct-2017].
[32] Buttigieg, P .L., Morrison, N., Smith, B. et al. The environment ontology:
contextualising biological and biomedical entities.J Biomed Semant4, 43 (2013).
https://doi.org/10.1186/2041-1480-4-43
[33] Pierre Grenon, Barry Smith, and Lou Goldberg. Biodynamic ontology: Ap-
plying bfo in the biomedical domain. In D.M. Pisanelli, editor, Ontologies in
Medicine, volume 102 of Studies in Health Technology and Informatics, pages
20–38. IOS Press, Amsterdam, 2004.
[34] Sebastian K ¨ohler, Sandra C Doelken, Christopher J Mungall, Sebastian
Bauer, Helen V Firth, Isabelle Bailleul-Forestier, Graeme CM Black, Danielle
L Brown, Michael Brudno, Jennifer Campbell, et al. The human phenotype
ontology project: linking molecular biology and disease through phenotype
data. Nucleic acids research, 42(D1):D966–D974, 2013.
[35] Scheuermann, R. H., Ceuster, W. and Smith, B. (2009). Towards an Onto-
logical Treatment of Disease and Diagnosis. In Summit on Translational Bioin-
formatics, 116–120.
[36] Gene Ontology Consortium. (2001). Creating the Gene Ontology Re-
source: Design and Implementation, Genome Research, 11, 1425–1433.
[37] He, Y. et al. CIDO, a community-based ontology for coronavirus dis-
ease knowledge and data integration, sharing, and analysis. Scientiﬁc data ,
181:2020.
[38] Beverley, J., Smith, B., Babcock, S., and Cowell, L. G. Coordinating Coro-
navirus Research: The COVID-19 Infectious Disease Ontology. 2020 Sept 3;
35
````

## PDF page 36

````text
doi:10.17605/OSF.IO/7EJ4H.
[39] Babcock S, Beverley J, Cowell LG, Smith B. The Infectious Disease Ontol-
ogy in the Age of COVID-19. J Biomed Semantics. 2021 Jul 18;12(1):13. doi:
10.1186/s13326-021-00245-1.
[40] Goldfain A, Smith B, Cowell LG. Towards an ontological representation of
resistance: the case of MRSA. J Biomed Inform. 2011; 44:35-41.
Appendix
Relation Name and Source16 Deﬁnition or Elucidation
is about(IAO) A primitive relation that relates an in-
formation artifact to an entity.
uses measurement unit(CCO) y uses measurement unit x i ﬀ y is an
instance of information bearing entity
and x is an instance of measurement
unit, such that x describes the mag-
nitude of measured physical quantity
mentioned in y.
is a measurement unit of(CCO) x is measurement unit of y i ﬀ y is an
instance of information content entity
and x is an instance of measurement
unit, such that x describes the mag-
nitude of measured physical quantity
mentioned in y.
has integer value(CCO) A relation holding between an informa-
tion bearing entity and an integer
describes(CCO) x describes y i ﬀ x is an instance of in-
formation content entity, and y is anin-
stance of entity, such that x is about the
characteristics by which y can be recog-
nized or visualized.
achieves planned objective(OBI) This relation obtains between a
planned process and a objective speci-
ﬁcation when the criteria speciﬁed in
the objective speciﬁcation are met at
the end of the planned process.
16These relations come from ontologies using Basic Formal Ontology (BFO), including: The
Common Core Ontologies (CCO), The Ontology for Biomedical Investigations (OBI), The Infor-
mation Artifact Ontology (IAO), and The Ontology of Document Acts (D-Acts).
36
````

## PDF page 37

````text
prescribes(CCO) x prescribes y iﬀ x is an instance of in-
formation content entity and y is an in-
stance of entity, such that x serves as a
rule or guide for y if y an occurrent, or
x serves as a model for y if y is a contin-
uant.
has text value(CCO) A relationship between an information
bearing entity and a string representa-
tion.
has speciﬁed output (OBI) A relation between a planned process
and a continuant which participates in
that process. The presence of the con-
tinuant at the end of the process is ex-
plicitly speciﬁed in the objective spec-
iﬁcation which the process realizes the
concretization of.
legally revokes(D-Acts) d socio-legally revokes s if s partici-
pates in d and at the end of d s no
longer exists. s going out of existence
is complete and unlike the going out
of existence for material entities which
are always transformed into something
else. After the declaration nothing is
left of the socio-legal generically de-
pendent continuant in question.
Table 8: Relations Used in Cases from Other BFO-Conformant Ontologies
37
````

