# Full PDF text extraction

Original: [formalization.pdf](<../../upstream/ufo-formalization/formalization.pdf>)

Source SHA-256: `d4e9e1392545f5a12948ae757da807b19eb9878ca0c562c738fdea554254a6ed`. Extracted with pypdf 6.13.2, plain mode.

Complete page sequence; no summarization or translation. Formula layout, diagrams and extraction artifacts must be checked in the original PDF; this is not a verified semantic substitute.

## PDF page 1

````text
A First-Order Logic Formalization of the Uniﬁed Foundational
Ontology
Daniele Porelo, Claudenir M. Fonseca, Jo˜ ao Paulo A. Almeida,
Giancarlo Guizzardi, Tiago Prince Sales
December 3, 2021
Abstract
This document presents a formalization of the Uniﬁed Foundational Ontology (UFO) in ﬁrst-
order logic. This formalization is documented by means of three complementary representations:
(i) a representation in standard Common Logic using the CLIF syntax; (ii) a representation in
natural language; and, when applicable, (iii) a UML-based diagrammatic representation. The
presented formalization is supported by consistency and satisﬁability checks performed through
automated prooﬁng tools.
1 Introduction
This document presents a formalization of the Uniﬁed Foundational Ontology (UFO) in ﬁrst-order
logic. This formalization is documented by means of three complementary representations: (i) a
representation in standard Common Logic using the CLIF syntax; (ii) a representation in natural
language; and, when applicable, (iii) a UML-based diagrammatic representation. The presented
formalization is supported by consistency and satisﬁability checks performed through automated
prooﬁng tools.
The remainder of this document is organized as a single formalization section (Section 2), which
contains subsections for each submodule of the ontology.
2 Formalization
This section contains the formalization of the Uniﬁed Foundational Ontology (UFO) in ﬁrst-order
logics. This formalization is organized in several subsections where each presents the formalization
of a portion of the whole ontology. The formalization is presented through diﬀerent equivalent
representations, designed to support the understanding of its contents: (i) a representation in stan-
dard Common Logic using the CLIF syntax; (ii) a representation in natural language; and, when
applicable, (iii) a UML-based diagrammatic representation.
The UML-based diagrammatic representation serves as a visual representation certain predicates
and axioms, being each element in Figure 1 being translated as follows:
• Rectangle shape (Figure 1a): visual representation of unary predicates associated to types in
the ontology; the associated predicate is shown in lower camel case with no spaces.
classA(x)
1
````

## PDF page 2

````text
(a) Rectangle shape.
 (b) Labeled open arrow.
(c) Closed arrow.
 (d) Labeled closed arrows.
Figure 1: UML-based representation of ﬁrst-order logic axioms.
• Open arrow (Figure 1b): visual representation of binary predicates; the predicate associated
to the arrows’ label is shown in lower camel case with no spaces; the predicate can only be
true for any x and y if it is also true predicates associated to the types of each end (keeping
the order of the arrow in the binary predicate’s positions); this representation may also be
associated to ternary predicates iﬁf its third position represents a time-index.
∀x, y(relation(x, y) → (classA(x) ∧ classB(y)))
∀x, y, w(relation(x, y, w) → (classA(x) ∧ classB(y) ∧ world(w)))
• Closed arrow (Figure 1c): visual representation of specializations between ontology’s types,
where the type in the tail of the arrow is a subtype of the type in the head of the arrow.
∀x(classB(x) → classA(x))
• Labeled closed arrow (Figure 1d): visual representation of disjoint and/or complete constraints
over sets specializations between ontology’s types.
∀x(classB(x) → classA(x))
∀x(classC(x) → classA(x))
∀x(classA(x) → (classB(x) ∨ classC(x))) {complete}
¬∃x(classB(x) ∧ classC(x)) {disjoint}
2.1 Partial Taxonomy of UFO: Thing
This subsection presents most general types of UFO’s taxonomy specializing the type Thing (Fig-
ure 2).
a1 For every x, x is a Thing iﬁf x is either a Type or an Individual.
∀x(type (x) ∨ individual(x) ↔ thing(x))
1 ( cl - text a x _ t h i n g _ t a x o n o m y
2 ( forall ( x )
3 ( iff ( or ( type_ x ) ( i n d i v i d u a l x ) )
2
````

## PDF page 3

````text
Figure 2: Visual representation of UFO’s taxonomy of Thing.
4 ( thing x ) )
5 )
6 )
a2 There is no x such that it is a Type and an Individual.
¬∃x(type (x) ∧ individual(x))
7 ( cl - text a x _ t h i n g _ p a r t i t i o n
8 ( not ( exists ( x )
9 ( and ( type_ x ) ( i n d i v i d u a l x ) ) )
10 )
11 )
a3 For every x, x is an Individual iﬁf x is either a Concrete Individual or an Abstract Individual .
∀x(concreteIndividual(x) ∨ abstractIndividual(x) ↔ individual(x))
12 ( cl - text a x _ i n d i v i d u a l _ t a x o n o m y
13 ( forall ( x )
14 ( iff ( or ( c o n c r e t e I n d i v i d u a l x ) ( a b s t r a c t I n d i v i d u a l x ) )
15 ( i n d i v i d u a l x ) )
16 )
17 )
a4 There is no x such that it is a Concrete Individual and an Abstract Individual .
¬∃x(concreteIndividual(x) ∧ abstractIndividual(x))
18 ( cl - text a x _ i n d i v i d u a l _ p a r t i t i o n
19 ( not ( exists ( x )
20 ( and ( c o n c r e t e I n d i v i d u a l x ) ( a b s t r a c t I n d i v i d u a l x ) ) )
21 )
22 )
a5 For every x, x is a Concrete Individual iﬁf x is either a Perdurant or an Endurant.
∀x(endurant(x) ∨ perdurant(x) ↔ concreteIndividual(x))
3
````

## PDF page 4

````text
23 ( cl - text a x _ c o n c r e t e I n d i v i d u a l _ t a x o n o m y
24 ( forall ( x )
25 ( iff ( or ( en du ra nt x ) ( p e r d u r a n t x ) )
26 ( c o n c r e t e I n d i v i d u a l x ) )
27 )
28 )
a6 There is no x such that it is a Perdurant and an Endurant.
¬∃x(endurant(x) ∧ perdurant(x))
29 ( cl - text a x _ c o n c r e t e I n d i v i d u a l _ p a r t i t i o n
30 ( not ( exists ( x )
31 ( and ( en du ran t x ) ( p e r d u r a n t x ) ) )
32 )
33 )
a7 For every x, x is a Concrete Individual iﬁf x is either a Perdurant or an Endurant.
∀x(endurantType(x) ∨ perdurantType(x) → type (x))
34 ( cl - text a x _ t y p e _ t a x o n o m y
35 ( forall ( x )
36 ( if ( or ( e n d u r a n t T y p e x ) ( p e r d u r a n t T y p e x ) )
37 ( type_ x ) )
38 )
39 )
a8 There is no x such that it is a Perdurant Type and an Endurant Type.
¬∃x(endurantType(x) ∧ perdurantType(x))
40 ( cl - text a x _ t y p e _ p a r t i t i o n
41 ( not ( exists ( x )
42 ( and ( e n d u r a n t T y p e x ) ( p e r d u r a n t T y p e x ) ) )
43 )
44 )
2.2 Partial Taxonomy of UFO: Abstract Individual
This subsection presents a portion of UFO’s taxonomy specializing the type Abstract Individual
(Figure 3).
a9 Every x that is a Quale is also an Abstract Individual .
∀x(quale(x) → abstractIndividual(x))
1 ( cl - text a x _ a b s t r a c t I n d i v i d u a l _ t a x o n o m y _ q u a l e
2 ( forall ( x )
3 ( if ( quale x )
4 ( a b s t r a c t I n d i v i d u a l x ) )
5 )
6 )
a10 Every x that is a Set is also an Abstract Individual .
∀x(set (x) → abstractIndividual(x))
4
````

## PDF page 5

````text
Figure 3: Visual representation of UFO’s taxonomy of Abstract Individual .
7 ( cl - text a x _ a b s t r a c t I n d i v i d u a l _ t a x o n o m y _ s e t
8 ( forall ( x )
9 ( if ( set_ x )
10 ( a b s t r a c t I n d i v i d u a l x ) )
11 )
12 )
a11 Every x that is a World is also an Abstract Individual .
∀x(world(x) → abstractIndividual(x))
13 ( cl - text a x _ a b s t r a c t I n d i v i d u a l _ t a x o n o m y _ w o r l d
14 ( forall ( x )
15 ( if ( world x )
16 ( a b s t r a c t I n d i v i d u a l x ) )
17 )
18 )
a12 There is no x such that it is a Quale, a Set, and a World (pairwise disjoint).
¬∃x((quale(x) ∧ set (x)) ∨ (quale(x) ∧ world(x)) ∨ (set (x) ∧ world(x)))
19 ( cl - text a x _ a b s t r a c t I n d i v i d u a l _ p a i r w i s e D i s j o i n t
20 ( not ( exists ( x )
21 ( or ( and ( quale x ) ( set_ x ) ) ( and ( quale x ) ( world x ) ) ( and ( set_ x ) ( world x )
) ) )
22 )
23 )
a13 Every x that is a Quality Structure is also a Set.
∀x(qualityStructure(x) → set (x))
24 ( cl - text a x _ s e t _ t a x o n o m y _ q u a l i t y S t r u c t u r e
25 ( forall ( x )
26 ( if ( q u a l i t y S t r u c t u r e x )
27 ( set_ x ) )
28 )
29 )
5
````

## PDF page 6

````text
a14 For every x, x is a Quality Structure iﬁf x is either a Quality Dimension or a Quality Space.
∀x(qualityDimension(x) ∨ qualitySpace(x) ↔ qualityStructure(x))
30 ( cl - text a x _ q u a l i t y S t r u c t u r e _ t a x o n o m y
31 ( forall ( x )
32 ( iff ( or ( q u a l i t y D i m e n s i o n x ) ( q u a l i t y S p a c e x ) )
33 ( q u a l i t y S t r u c t u r e x ) )
34 )
35 )
a15 There is no x such that it is a Quality Dimension and a Quality Space.
¬∃x(qualityDimension(x) ∧ qualitySpace(x))
36 ( cl - text a x _ q u a l i t y S t r u c t u r e _ p a r t i t i o n
37 ( not ( exists ( x )
38 ( and ( q u a l i t y D i m e n s i o n x ) ( q u a l i t y S p a c e x ) ) )
39 )
40 )
2.3 Partial Taxonomy of UFO: Endurant
This subsection presents a portion of UFO’s taxonomy specializing the type Endurant (Figure 4).
Figure 4: Visual representation of UFO’s taxonomy of Endurant.
a16 For every x, x is an Endurant iﬁf x is either a Substantial or a Moment.
∀x(substantial(x) ∨ moment(x) ↔ endurant(x))
6
````

## PDF page 7

````text
1 ( cl - text a x _ e n d u r a n t _ t a x o n o m y
2 ( forall ( x )
3 ( iff ( or ( s u b s t a n t i a l x ) ( moment x ) )
4 ( end ur ant x ) )
5 )
6 )
a17 There is no x such that it is a Substantial and a Moment.
¬∃x(substantial(x) ∧ moment(x))
7 ( cl - text a x _ e n d u r a n t _ p a r t i t i o n
8 ( not ( exists ( x )
9 ( and ( s u b s t a n t i a l x ) ( moment x ) ) )
10 )
11 )
a18 For every x, x is a Substantial iﬁf x is either an Object, a Collective, or a Quantity.
∀x(object(x) ∨ collective(x) ∨ quantity(x) ↔ substantial(x))
12 ( cl - text a x _ s u b s t a n t i a l _ t a x o n o m y
13 ( forall ( x )
14 ( iff ( or ( object x ) ( c o l l e c t i v e x ) ( qu ant it y x ) )
15 ( s u b s t a n t i a l x ) )
16 )
17 )
a19 There is no x such that it is an Object, a Collective, and a Quantity (pairwise disjoint).
¬∃x((object(x) ∧ collective(x)) ∨ (object(x) ∧ quantity(x)) ∨ (collective(x) ∧ quantity(x)))
18 ( cl - text a x _ s u b s t a n t i a l _ p a r t i t i o n
19 ( not ( exists ( x )
20 ( or ( and ( object x ) ( c o l l e c t i v e x ) ) ( and ( object x ) ( q ua nti ty x ) ) ( and (
c o l l e c t i v e x ) ( qua nt ity x ) ) ) )
21 )
22 )
a20 For every x, x is a Moment iﬁf x is either an Intrinsic Moment or a Relator.
∀x(intrinsicMoment(x) ∨ relator(x) ↔ moment(x))
23 ( cl - text a x _ m o m e n t _ t a x o n o m y
24 ( forall ( x )
25 ( iff ( or ( i n t r i n s i c M o m e n t x ) ( relator x ) )
26 ( moment x ) )
27 )
28 )
a21 There is no x such that it is an Intrinsic Moment and a Relator.
¬∃x(intrinsicMoment(x) ∧ relator(x))
29 ( cl - text a x _ m o m e n t _ p a r t i t i o n
30 ( not ( exists ( x )
31 ( and ( i n t r i n s i c M o m e n t x ) ( relator x ) ) )
32 )
33 )
7
````

## PDF page 8

````text
a22 For every x, x is an Intrinsic Moment iﬁf x is either a Quality or a Mode.
∀x(quality(x) ∨ mode(x) ↔ intrinsicMoment(x))
34 ( cl - text a x _ i n t r i n s i c M o m e n t _ t a x o n o m y
35 ( forall ( x )
36 ( iff ( or ( quality x ) ( mode x ) )
37 ( i n t r i n s i c M o m e n t x ) )
38 )
39 )
a23 There is no x such that it is an Intrinsic Moment and a Relator.
¬∃x(quality(x) ∧ mode(x))
40 ( cl - text a x _ i n t r i n s i c M o m e n t _ p a r t i t i o n
41 ( not ( exists ( x )
42 ( and ( quality x ) ( mode x ) ) )
43 )
44 )
a24 Every x that is a Disposition is also a Mode.
∀x(disposition(x) → mode(x))
45 ( cl - text a x _ m o d e _ t a x o n o m y _ d i s p o s i t i o n
46 ( forall ( x )
47 ( if ( d i s p o s i t i o n x )
48 ( mode x ) )
49 )
50 )
a25 Every x that is an Externally Dependent Mode is also a Mode.
∀x(externallyDependentMode(x) → mode(x))
51 ( cl - text a x _ m o d e _ t a x o n o m y _ e x t e r n a l l y D e p e n d e n t M o d e
52 ( forall ( x )
53 ( if ( e x t e r n a l l y D e p e n d e n t M o d e x )
54 ( mode x ) )
55 )
56 )
a26 Every x that is an Qua Individual is also an Externally Dependent Mode .
∀x(quaIndividual(x) → externallyDependentMode(x))
57 ( cl - text a x _ e x t e r n a l l y D e p e n d e n t M o d e _ t a x o n o m y _ q u a I n d i v i d u a l
58 ( forall ( x )
59 ( if ( q u a I n d i v i d u a l x )
60 ( e x t e r n a l l y D e p e n d e n t M o d e x ) )
61 )
62 )
2.4 Partial Taxonomy of UFO: Endurant Type by Ontological Natures
This subsection presents a portion of UFO’s taxonomy specializing the type Endurant Type classiﬁed
by ontological natures (Figure 5).
8
````

## PDF page 9

````text
Figure 5: Visual representation of UFO’s taxonomy of Endurant Type classiﬁed by ontological na-
tures.
a27 For every x, x is an Endurant Type iﬁf x is either a Substantial Type or a Moment Type.
∀x(substantialType(x) ∨ momentType(x) ↔ endurantType(x))
1 ( cl - text a x _ e n d u r a n t T y p e _ t a x o n o m y _ n a t u r e
2 ( forall ( x )
3 ( iff ( or ( s u b s t a n t i a l T y p e x ) ( m o m e n t T y p e x ) )
4 ( e n d u r a n t T y p e x ) )
5 )
6 )
a28 There is no x such that it is a Substantial Type and a Moment Type.
¬∃x(substantialType(x) ∧ momentType(x))
7 ( cl - text a x _ e n d u r a n t T y p e _ p a r t i t i o n _ n a t u r e
8 ( not ( exists ( x )
9 ( and ( s u b s t a n t i a l T y p e x ) ( m o m e n t T y p e x ) ) )
10 )
11 )
a29 For every x, x is a Substantial Type iﬁf x is either an Object Type , a Collective Type , or a
Quantity Type.
∀x(objectType(x) ∨ collectiveType(x) ∨ quantityType(x) ↔ substantialType(x))
12 ( cl - text a x _ s u b s t a n t i a l T y p e _ t a x o n o m y
13 ( forall ( x )
14 ( iff ( or ( o b j e c t T y p e x ) ( c o l l e c t i v e T y p e x ) ( q u a n t i t y T y p e x ) )
15 ( s u b s t a n t i a l T y p e x ) )
16 )
17 )
a30 There is no x such that it is an Object Type, a Collective Type, and a Quantity Type (pairwise
disjoint).
9
````

## PDF page 10

````text
¬∃x((objectType(x)∧collectiveType(x))∨(objectType(x)∧quantityType(x))∨(collectiveType(x)∧
quantityType(x)))
18 ( cl - text a x _ s u b s t a n t i a l T y p e _ p a r t i t i o n
19 ( not ( exists ( x )
20 ( or ( and ( o b j e c t T y p e x ) ( c o l l e c t i v e T y p e x ) ) ( and ( o b j e c t T y p e x ) ( q u a n t i t y T y p e
x ) ) ( and ( c o l l e c t i v e T y p e x ) ( q u a n t i t y T y p e x ) ) ) )
21 )
22 )
a31 For every x, x is a Moment Type iﬁf x is either an Intrinsic Moment Type or a Relator Type.
∀x(intrinsicMomentType(x) ∨ relatorType(x) ↔ momentType(x))
23 ( cl - text a x _ m o m e n t T y p e _ t a x o n o m y
24 ( forall ( x )
25 ( iff ( or ( i n t r i n s i c M o m e n t T y p e x ) ( r e l a t o r T y p e x ) )
26 ( m o m e n t T y p e x ) )
27 )
28 )
a32 There is no x such that it is an Intrinsic Moment Type and a Relator Type.
¬∃x(intrinsicMomentType(x) ∧ relatorType(x))
29 ( cl - text a x _ m o m e n t T y p e _ p a r t i t i o n
30 ( not ( exists ( x )
31 ( and ( i n t r i n s i c M o m e n t T y p e x ) ( r e l a t o r T y p e x ) ) )
32 )
33 )
a33 For every x, x is an Intrinsic Moment Type iﬁf x is either a Quality Type or a Mode Type.
∀x(qualityType(x) ∨ modeType(x) ↔ intrinsicMomentType(x))
34 ( cl - text a x _ i n t r i n s i c M o m e n t T y p e _ t a x o n o m y
35 ( forall ( x )
36 ( iff ( or ( q u a l i t y T y p e x ) ( m ode Ty pe x ) )
37 ( i n t r i n s i c M o m e n t T y p e x ) )
38 )
39 )
a34 There is no x such that it is an Intrinsic Moment Type and a Relator Type.
¬∃x(qualityType(x) ∧ modeType(x))
40 ( cl - text a x _ i n t r i n s i c M o m e n t T y p e _ p a r t i t i o n
41 ( not ( exists ( x )
42 ( and ( q u a l i t y T y p e x ) ( mo de Typ e x ) ) )
43 )
44 )
2.5 Partial Taxonomy of UFO: Endurant Type by Modal Properties of
Types
This subsection presents a portion of UFO’s taxonomy specializing the type Endurant Type classiﬁed
by the modal properties of types (Figure 6).
10
````

## PDF page 11

````text
Figure 6: Visual representation of UFO’s taxonomy of Endurant Type classiﬁed by the modal prop-
erties of types.
a35 For every x, x is an Endurant Type iﬁf x is either a Sortal or a NonSortal.
∀x(sortal(x) ∨ nonSortal(x) ↔ endurantType(x))
1 ( cl - text a x _ e n d u r a n t T y p e _ t a x o n o m y _ p r o p e r t i e s
2 ( forall ( x )
3 ( iff ( or ( sortal x ) ( n o n S o r t a l x ) )
4 ( e n d u r a n t T y p e x ) )
5 )
6 )
a36 There is no x such that it is a Sortal and a NonSortal.
¬∃x(sortal(x) ∧ nonSortal(x))
7 ( cl - text a x _ e n d u r a n t T y p e _ p a r t i t i o n _ p r o p e r t i e s
8 ( not ( exists ( x )
9 ( and ( sortal x ) ( n o n S o r t a l x ) ) )
10 )
11 )
a37 For every x, x is a Sortal iﬁf x is either a Rigid Sortal or an AntiRigid Sortal.
∀x(rigidSortal(x) ∨ antiRigidSortal(x) ↔ sortal(x))
12 ( cl - text a x _ s o r t a l _ t a x o n o m y
13 ( forall ( x )
14 ( iff ( or ( r i g i d S o r t a l x ) ( a n t i R i g i d S o r t a l x ) )
15 ( sortal x ) )
16 )
17 )
a38 There is no x such that it is a Rigid Sortal and an AntiRigid Sortal.
¬∃x(rigidSortal(x) ∧ antiRigidSortal(x))
18 ( cl - text a x _ s o r t a l _ p a r t i t i o n
19 ( not ( exists ( x )
20 ( and ( r i g i d S o r t a l x ) ( a n t i R i g i d S o r t a l x ) ) )
11
````

## PDF page 12

````text
21 )
22 )
a39 For every x, x is a Rigid Sortal iﬁf x is either a Kind or a Subkind.
∀x(kind(x) ∨ subkind(x) ↔ rigidSortal(x))
23 ( cl - text a x _ r i g i d S o r t a l _ t a x o n o m y
24 ( forall ( x )
25 ( iff ( or ( kind x ) ( subkind x ) )
26 ( r i g i d S o r t a l x ) )
27 )
28 )
a40 There is no x such that it is a Kind and a Subkind.
¬∃x(kind(x) ∧ subkind(x))
29 ( cl - text a x _ r i g i d S o r t a l _ p a r t i t i o n
30 ( not ( exists ( x )
31 ( and ( kind x ) ( subkind x ) ) )
32 )
33 )
a41 For every x, x is an AntiRigid Sortal iﬁf x is either a Phase or a Role.
∀x(phase(x) ∨ role(x) ↔ antiRigidSortal(x))
34 ( cl - text a x _ a n t i R i g i d S o r t a l _ t a x o n o m y
35 ( forall ( x )
36 ( iff ( or ( phase x ) ( role x ) )
37 ( a n t i R i g i d S o r t a l x ) )
38 )
39 )
a42 There is no x such that it is a Phase and a Role.
¬∃x(phase(x) ∧ role(x))
40 ( cl - text a x _ a n t i R i g i d S o r t a l _ p a r t i t i o n
41 ( not ( exists ( x )
42 ( and ( phase x ) ( role x ) ) )
43 )
44 )
a43 For every x, x is a NonSortal iﬁf x is either a Rigid NonSortal , an AntiRigid NonSortal , or a
SemmiRigid NonSortal.
∀x(rigidNonSortal(x) ∨ semiRigidNonSortal(x) ∨ antiRigidNonSortal(x) ↔ nonSortal(x))
45 ( cl - text a x _ n o n S o r t a l _ t a x o n o m y
46 ( forall ( x )
47 ( iff ( or ( r i g i d N o n S o r t a l x ) ( s e m i R i g i d N o n S o r t a l x ) ( a n t i R i g i d N o n S o r t a l x ) )
48 ( n o n S o r t a l x ) )
49 )
50 )
12
````

## PDF page 13

````text
a44 There is no x such that it is an Rigid NonSortal , an AntiRigid NonSortal , and a SemiRigid
NonSortal (pairwise disjoint).
¬∃x((rigidNonSortal(x) ∧ semiRigidNonSortal(x)) ∨(rigidNonSortal(x) ∧ antiRigidNonSortal(x)) ∨
(semiRigidNonSortal(x) ∧ antiRigidNonSortal(x)))
51 ( cl - text a x _ n o n S o r t a l _ p a r t i t i o n
52 ( not ( exists ( x )
53 ( or ( and ( r i g i d N o n S o r t a l x ) ( s e m i R i g i d N o n S o r t a l x ) ) ( and ( r i g i d N o n S o r t a l x ) (
a n t i R i g i d N o n S o r t a l x ) ) ( and ( s e m i R i g i d N o n S o r t a l x ) ( a n t i R i g i d N o n S o r t a l x ) ) ) )
54 )
55 )
a45 Every x that is a Rigid NonSortal is also a Category.
∀x(rigidNonSortal(x) ↔ category(x))
56 ( cl - text a x _ r i g i d N o n S o r t a l _ t a x o n o m y
57 ( forall ( x )
58 ( iff ( r i g i d N o n S o r t a l x )
59 ( cat eg ory x ) )
60 )
61 )
a46 Every x that is a SemiRigid NonSortal is also a Mixin.
∀x(semiRigidNonSortal(x) ↔ mixin(x))
62 ( cl - text a x _ s e m i R i g i d N o n S o r t a l _ t a x o n o m y
63 ( forall ( x )
64 ( iff ( s e m i R i g i d N o n S o r t a l x )
65 ( mixin x ) )
66 )
67 )
a47 For every x, x is an AntiRigid NonSortal iﬁf x is either a Phase Mixin or a Role Mixin.
∀x(phaseMixin(x) ∨ roleMixin(x) ↔ antiRigidNonSortal(x))
68 ( cl - text a x _ a n t i R i g i d N o n S o r t a l _ t a x o n o m y
69 ( forall ( x )
70 ( iff ( or ( p h a s e M i x i n x ) ( r o l e M i x i n x ) )
71 ( a n t i R i g i d N o n S o r t a l x ) )
72 )
73 )
a48 There is no x such that it is a Phase Mixin and a Role Mixin.
¬∃x(phaseMixin(x) ∧ roleMixin(x))
74 ( cl - text a x _ a n t i R i g i d N o n S o r t a l _ p a r t i t i o n
75 ( not ( exists ( x )
76 ( and ( p h a s e M i x i n x ) ( r o l e M i x i n x ) ) )
77 )
78 )
13
````

## PDF page 14

````text
Figure 7: Types, individuals, instantiation, and specialization.
2.6 On the Deﬁnitions of Type, Individual, Instantiation, and Specializa-
tion
This subsection introduces the UFO’s deﬁnitions of Type and Individual as well as the deﬁnitions for
the relations of instance of, specializes, and proper specializes .
a49 The instance of relation can only hold between x, y, and w, where x is an instance of a type y
in w, and w is the world where this relation holds.
∀x, y, w(iof(x, y, w) → type (y) ∧ world(w))
1 ( cl - text ax_dIof
2 ( forall ( x y w )
3 ( if ( iof x y w )
4 ( and ( type_ y ) ( world w ) ) )
5 )
6 )
a50 For every x, x is a type iﬁf there exists some y and w such that y is instance of x in the world
w.
∀x(type (x) ↔ ∃y, w(iof(y, x, w)))
7 ( cl - text ax _d Typ e
8 ( forall ( x )
9 ( iff ( type_ x )
10 ( exists ( y w )
11 ( iof y x w ) )
12 )
13 )
14 )
a51 For every x, x is an individual iﬁf there is no pair y and w such that y is instance of x in w.
∀x(individual(x) ↔ ¬∃y, w(iof(y, x, w)))
15 ( cl - text a x _ d I n d i v i d u a l
16 ( forall ( x )
17 ( iff ( i n d i v i d u a l x )
18 ( not ( exists ( y w )
19 ( iof y x w ) )
20 ) )
21 )
22 )
14
````

## PDF page 15

````text
a52 The instance x in an instance of relation must be either a type or an individual.
∀x, y, w(iof(x, y, w) → type (x) ∨ individual(x))
23 ( cl - text a x _ m u l t i L e v e l
24 ( forall ( x y w )
25 ( if ( iof x y w )
26 ( or ( type_ x ) ( i n d i v i d u a l x ) ) )
27 )
28 )
a53 Chains of instance of relations are limited to a depth of two.
¬∃x, y, z, w(type (x) ∧ iof(x, y, w) ∧ iof(y, z, w))
29 ( cl - text a x _ t w o L e v e l C o n s t r a i n e d
30 ( not ( exists ( x y z w )
31 ( and ( type_ x ) ( iof x y w ) ( iof y z w ) ) )
32 )
33 )
15
````

