/**
 * Known-vocabulary metadata used by the graph model (to classify nodes) and
 * by the language features in Phase 5 (hover documentation, completion).
 * Deliberately small and hand-curated rather than a full ontology import —
 * this only needs to cover the terms common hand-written OWL/RDFS files use.
 */

export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
export const OWL = "http://www.w3.org/2002/07/owl#";
export const XSD = "http://www.w3.org/2001/XMLSchema#";
export const SKOS = "http://www.w3.org/2004/02/skos/core#";
export const DCTERMS = "http://purl.org/dc/terms/";
export const FOAF = "http://xmlns.com/foaf/0.1/";

export const WELL_KNOWN_PREFIXES: Record<string, string> = {
  rdf: RDF,
  rdfs: RDFS,
  owl: OWL,
  xsd: XSD,
  skos: SKOS,
  dcterms: DCTERMS,
  foaf: FOAF,
};

export const RDF_TYPE = `${RDF}type`;
export const RDFS_LABEL = `${RDFS}label`;
export const RDFS_COMMENT = `${RDFS}comment`;
export const RDFS_SUBCLASS_OF = `${RDFS}subClassOf`;
export const RDFS_SUBPROPERTY_OF = `${RDFS}subPropertyOf`;
export const RDFS_DOMAIN = `${RDFS}domain`;
export const RDFS_RANGE = `${RDFS}range`;
export const RDFS_RESOURCE = `${RDFS}Resource`;
export const OWL_CLASS = `${OWL}Class`;
export const OWL_OBJECT_PROPERTY = `${OWL}ObjectProperty`;
export const OWL_DATATYPE_PROPERTY = `${OWL}DatatypeProperty`;
export const OWL_ANNOTATION_PROPERTY = `${OWL}AnnotationProperty`;
export const OWL_NAMED_INDIVIDUAL = `${OWL}NamedIndividual`;
export const OWL_ONTOLOGY = `${OWL}Ontology`;
export const OWL_THING = `${OWL}Thing`;
export const OWL_RESTRICTION = `${OWL}Restriction`;
export const OWL_UNION_OF = `${OWL}unionOf`;
export const OWL_INTERSECTION_OF = `${OWL}intersectionOf`;
export const OWL_INVERSE_OF = `${OWL}inverseOf`;
export const OWL_FUNCTIONAL_PROPERTY = `${OWL}FunctionalProperty`;
export const OWL_INVERSE_FUNCTIONAL_PROPERTY = `${OWL}InverseFunctionalProperty`;
export const OWL_ON_PROPERTY = `${OWL}onProperty`;
export const OWL_SOME_VALUES_FROM = `${OWL}someValuesFrom`;
export const OWL_ALL_VALUES_FROM = `${OWL}allValuesFrom`;
export const OWL_HAS_VALUE = `${OWL}hasValue`;
export const OWL_EQUIVALENT_CLASS = `${OWL}equivalentClass`;
export const OWL_EQUIVALENT_PROPERTY = `${OWL}equivalentProperty`;
export const OWL_SAME_AS = `${OWL}sameAs`;
export const OWL_DIFFERENT_FROM = `${OWL}differentFrom`;
export const OWL_DISJOINT_WITH = `${OWL}disjointWith`;
export const OWL_CARDINALITY = `${OWL}cardinality`;
export const OWL_MIN_CARDINALITY = `${OWL}minCardinality`;
export const OWL_MAX_CARDINALITY = `${OWL}maxCardinality`;
export const OWL_QUALIFIED_CARDINALITY = `${OWL}qualifiedCardinality`;
export const OWL_MIN_QUALIFIED_CARDINALITY = `${OWL}minQualifiedCardinality`;
export const OWL_MAX_QUALIFIED_CARDINALITY = `${OWL}maxQualifiedCardinality`;
export const OWL_ON_CLASS = `${OWL}onClass`;
export const OWL_HAS_KEY = `${OWL}hasKey`;
export const OWL_IMPORTS = `${OWL}imports`;
export const OWL_VERSION_IRI = `${OWL}versionIRI`;
export const OWL_PRIOR_VERSION = `${OWL}priorVersion`;
export const RDFS_SEE_ALSO = `${RDFS}seeAlso`;
export const RDFS_IS_DEFINED_BY = `${RDFS}isDefinedBy`;
export const RDFS_CLASS = `${RDFS}Class`;
export const RDF_PROPERTY = `${RDF}Property`;
export const RDF_FIRST = `${RDF}first`;
export const RDF_REST = `${RDF}rest`;
export const RDF_NIL = `${RDF}nil`;
export const SKOS_CONCEPT = `${SKOS}Concept`;
export const SKOS_CONCEPT_SCHEME = `${SKOS}ConceptScheme`;
export const SKOS_BROADER = `${SKOS}broader`;
export const SKOS_NARROWER = `${SKOS}narrower`;
export const SKOS_RELATED = `${SKOS}related`;
export const SKOS_PREF_LABEL = `${SKOS}prefLabel`;
export const SKOS_ALT_LABEL = `${SKOS}altLabel`;
export const SKOS_IN_SCHEME = `${SKOS}inScheme`;

export interface VocabularyTerm {
  iri: string;
  prefix: string;
  local: string;
  label: string;
  comment: string;
}

function term(prefix: string, namespace: string, local: string, comment: string): VocabularyTerm {
  return { iri: `${namespace}${local}`, prefix, local, label: `${prefix}:${local}`, comment };
}

export const KNOWN_TERMS: VocabularyTerm[] = [
  term("rdf", RDF, "type", "States that a resource is an instance of a class."),
  term("rdf", RDF, "Property", "The class of RDF properties."),
  term("rdfs", RDFS, "Class", "The class of classes."),
  term("rdfs", RDFS, "subClassOf", "Relates a class to one of its superclasses."),
  term("rdfs", RDFS, "subPropertyOf", "Relates a property to one of its superproperties."),
  term("rdfs", RDFS, "domain", "Declares the class of subjects a property applies to."),
  term("rdfs", RDFS, "range", "Declares the class or datatype of a property's values."),
  term("rdfs", RDFS, "label", "A human-readable name for a resource."),
  term("rdfs", RDFS, "comment", "A human-readable description of a resource."),
  term("rdfs", RDFS, "seeAlso", "Points to a related resource."),
  term("rdfs", RDFS, "isDefinedBy", "Points to the resource defining a term."),
  term("owl", OWL, "Class", "The class of OWL classes."),
  term("owl", OWL, "ObjectProperty", "A property relating individuals to individuals."),
  term("owl", OWL, "DatatypeProperty", "A property relating individuals to literal values."),
  term("owl", OWL, "AnnotationProperty", "A property used for non-logical annotations."),
  term("owl", OWL, "NamedIndividual", "An explicitly named individual."),
  term("owl", OWL, "Ontology", "Marks the document/ontology itself."),
  term("owl", OWL, "equivalentClass", "States that two classes have the same instances."),
  term("owl", OWL, "equivalentProperty", "States that two properties have the same meaning."),
  term("owl", OWL, "inverseOf", "Declares that a property is the inverse of another."),
  term("owl", OWL, "TransitiveProperty", "Marks a property as transitive."),
  term("owl", OWL, "SymmetricProperty", "Marks a property as symmetric."),
  term("owl", OWL, "FunctionalProperty", "Marks a property as functional (at most one value)."),
  term("owl", OWL, "sameAs", "States that two individuals are identical."),
  term("owl", OWL, "differentFrom", "States that two individuals are distinct."),
  term("owl", OWL, "disjointWith", "States that two classes share no instances."),
  term("skos", SKOS, "Concept", "The class of SKOS concepts."),
  term("skos", SKOS, "ConceptScheme", "A set of SKOS concepts."),
  term("skos", SKOS, "prefLabel", "The preferred lexical label for a concept."),
  term("skos", SKOS, "altLabel", "An alternative lexical label for a concept."),
  term("skos", SKOS, "broader", "Relates a concept to a more general concept."),
  term("skos", SKOS, "narrower", "Relates a concept to a more specific concept."),
  term("skos", SKOS, "related", "Relates a concept to an associated concept."),
  term("skos", SKOS, "inScheme", "Relates a concept to the scheme it belongs to."),
  term("dcterms", DCTERMS, "title", "The title of a resource."),
  term("dcterms", DCTERMS, "description", "A description of a resource."),
  term("dcterms", DCTERMS, "creator", "The creator of a resource."),
];

const TERMS_BY_IRI = new Map(KNOWN_TERMS.map((t) => [t.iri, t]));

export function lookupKnownTerm(iri: string): VocabularyTerm | undefined {
  return TERMS_BY_IRI.get(iri);
}

const CLASS_TYPE_IRIS = new Set([OWL_CLASS, RDFS_CLASS]);
const PROPERTY_TYPE_IRIS = new Set([
  OWL_OBJECT_PROPERTY,
  OWL_DATATYPE_PROPERTY,
  OWL_ANNOTATION_PROPERTY,
  RDF_PROPERTY,
]);

export function isClassTypeIri(iri: string): boolean {
  return CLASS_TYPE_IRIS.has(iri);
}

export function isPropertyTypeIri(iri: string): boolean {
  return PROPERTY_TYPE_IRIS.has(iri);
}

/** Namespaces this extension has built-in knowledge of. */
export const KNOWN_VOCABULARY_NAMESPACES = [RDF, RDFS, OWL, XSD, SKOS, DCTERMS, FOAF];

export function isKnownVocabularyIri(iri: string): boolean {
  return KNOWN_VOCABULARY_NAMESPACES.some((ns) => iri.startsWith(ns));
}
