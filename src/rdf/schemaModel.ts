import type { Quad } from "n3";
import { findOverrideLiteral, localName } from "./opExtensions";
import { readRdfList } from "./rdfList";
import {
  assignRelationalAppearance,
  colorOverrideFor,
  DEFAULT_CLASS_ICON,
  DEFAULT_INFERRED_ICON,
  DEFAULT_SKOS_ICON,
  iconFor,
  iconOverrideFor,
} from "./appearance";
import {
  OWL_ALL_VALUES_FROM,
  OWL_ANNOTATION_PROPERTY,
  OWL_CARDINALITY,
  OWL_CLASS,
  OWL_DATATYPE_PROPERTY,
  OWL_DIFFERENT_FROM,
  OWL_DISJOINT_WITH,
  OWL_EQUIVALENT_CLASS,
  OWL_EQUIVALENT_PROPERTY,
  OWL_FUNCTIONAL_PROPERTY,
  OWL_HAS_KEY,
  OWL_HAS_VALUE,
  OWL_IMPORTS,
  OWL_INTERSECTION_OF,
  OWL_INVERSE_FUNCTIONAL_PROPERTY,
  OWL_INVERSE_OF,
  OWL_MAX_CARDINALITY,
  OWL_MAX_QUALIFIED_CARDINALITY,
  OWL_MIN_CARDINALITY,
  OWL_MIN_QUALIFIED_CARDINALITY,
  OWL_NAMED_INDIVIDUAL,
  OWL_OBJECT_PROPERTY,
  OWL_ON_CLASS,
  OWL_ON_PROPERTY,
  OWL_ONTOLOGY,
  OWL_PRIOR_VERSION,
  OWL_QUALIFIED_CARDINALITY,
  OWL_RESTRICTION,
  OWL_SAME_AS,
  OWL_SOME_VALUES_FROM,
  OWL_THING,
  OWL_UNION_OF,
  OWL_VERSION_IRI,
  RDF_FIRST,
  RDF_PROPERTY,
  RDF_REST,
  RDF_TYPE,
  RDFS_CLASS,
  RDFS_COMMENT,
  RDFS_DOMAIN,
  RDFS_IS_DEFINED_BY,
  RDFS_LABEL,
  RDFS_RANGE,
  RDFS_RESOURCE,
  RDFS_SEE_ALSO,
  RDFS_SUBCLASS_OF,
  RDFS_SUBPROPERTY_OF,
  SKOS_ALT_LABEL,
  SKOS_BROADER,
  SKOS_CONCEPT,
  SKOS_CONCEPT_SCHEME,
  SKOS_IN_SCHEME,
  SKOS_NARROWER,
  SKOS_PREF_LABEL,
  SKOS_RELATED,
  XSD,
  isKnownVocabularyIri,
} from "./vocabulary";

export type PropertyType = "string" | "integer" | "decimal" | "double" | "date" | "datetime" | "boolean" | "enum" | "other";
export type Cardinality = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many" | "unspecified";
export type EntityOrigin = "owlClass" | "rdfsClass" | "skosConcept" | "inferred";
export type RelationKind = "objectProperty" | "subClassOf" | "skosBroader";

/**
 * How a fact was arrived at. `"declared"` facts come straight from the text;
 * everything else is a step down a fallback ladder (see the comment above
 * `attachObjectProperty`). The webview renders non-`"declared"` edges as
 * visibly softer (dashed / reduced opacity) so a reader never mistakes an
 * inference for something the ontology actually states.
 */
export type Provenance =
  | "declared"
  | "inferred-union"
  | "inferred-inverse"
  | "inferred-restriction"
  | "inferred-usage"
  | "default";

export interface SchemaProperty {
  iri: string;
  name: string;
  type: PropertyType;
  datatypeIri?: string;
  isIdentifier?: boolean;
  unit?: string;
  enumValues?: string[];
  description?: string;
  provenance: Provenance;
}

export interface SchemaEntity {
  /** Fully resolved IRI — the diagram node id. */
  id: string;
  name: string;
  description?: string;
  origin: EntityOrigin;
  properties: SchemaProperty[];
  instanceCount: number;
  icon: string;
  /** 0..COLOR_PALETTE_SIZE-1; the concrete color is theme-dependent. */
  colorIndex: number;
  connectionGroup: {
    /** Stable one-based connected-component number. */
    index: number;
    count: number;
    size: number;
  };
  /** A validated `#rrggbb`-family literal found in the document, if any. */
  colorOverride?: string;
}

export interface SchemaRelation {
  id: string;
  iri?: string;
  name: string;
  source: string;
  target: string;
  kind: RelationKind;
  cardinality: Cardinality;
  description?: string;
  inverseOfIri?: string;
  provenance: Provenance;
  attributes?: { name: string; type: PropertyType }[];
}

export interface UnattachedProperty {
  iri: string;
  name: string;
  kind: "object" | "datatype";
  reason: string;
}

export interface SchemaModel {
  title?: string;
  description?: string;
  entities: SchemaEntity[];
  relations: SchemaRelation[];
  /** Properties whose owning class(es) could not be resolved by any rung of the ladder — never silently dropped. */
  unattachedProperties: UnattachedProperty[];
  isEmpty: boolean;
}

/** Meta-classes that must never themselves become diagram entities. */
const EXCLUDED_META_CLASS_IRIS = new Set([
  OWL_CLASS,
  RDFS_CLASS,
  OWL_OBJECT_PROPERTY,
  OWL_DATATYPE_PROPERTY,
  OWL_ANNOTATION_PROPERTY,
  OWL_ONTOLOGY,
  OWL_NAMED_INDIVIDUAL,
  RDF_PROPERTY,
  OWL_THING,
  RDFS_RESOURCE,
  OWL_RESTRICTION,
  SKOS_CONCEPT,
  SKOS_CONCEPT_SCHEME,
]);

/**
 * Predicates handled explicitly elsewhere in this module. Excluded from the
 * "discover object/datatype properties by usage" scan below so e.g.
 * `rdfs:subClassOf` never also gets treated as a generic relation, and a
 * `someValuesFrom`/`onProperty` pair inside a blank-node restriction never
 * gets misread as a schema-level relationship on the restriction itself.
 */
const STRUCTURAL_PREDICATES = new Set([
  RDF_TYPE,
  RDFS_LABEL,
  RDFS_COMMENT,
  RDFS_SUBCLASS_OF,
  RDFS_SUBPROPERTY_OF,
  RDFS_DOMAIN,
  RDFS_RANGE,
  OWL_INVERSE_OF,
  OWL_UNION_OF,
  OWL_INTERSECTION_OF,
  OWL_ON_PROPERTY,
  OWL_SOME_VALUES_FROM,
  OWL_ALL_VALUES_FROM,
  OWL_HAS_VALUE,
  OWL_EQUIVALENT_CLASS,
  OWL_EQUIVALENT_PROPERTY,
  OWL_SAME_AS,
  OWL_DIFFERENT_FROM,
  OWL_DISJOINT_WITH,
  OWL_CARDINALITY,
  OWL_MIN_CARDINALITY,
  OWL_MAX_CARDINALITY,
  OWL_QUALIFIED_CARDINALITY,
  OWL_MIN_QUALIFIED_CARDINALITY,
  OWL_MAX_QUALIFIED_CARDINALITY,
  OWL_ON_CLASS,
  OWL_HAS_KEY,
  OWL_IMPORTS,
  OWL_VERSION_IRI,
  OWL_PRIOR_VERSION,
  RDFS_SEE_ALSO,
  RDFS_IS_DEFINED_BY,
  SKOS_BROADER,
  SKOS_NARROWER,
  SKOS_RELATED,
  SKOS_PREF_LABEL,
  SKOS_ALT_LABEL,
  SKOS_IN_SCHEME,
  RDF_FIRST,
  RDF_REST,
]);

const XSD_LOCAL_TO_PROPERTY_TYPE: Record<string, PropertyType> = {
  string: "string",
  integer: "integer",
  int: "integer",
  long: "integer",
  short: "integer",
  nonNegativeInteger: "integer",
  positiveInteger: "integer",
  decimal: "decimal",
  float: "decimal",
  double: "double",
  date: "date",
  dateTime: "datetime",
  boolean: "boolean",
  anyURI: "other",
  time: "other",
  duration: "other",
};

const VALID_PROPERTY_TYPES = new Set<string>([
  "string",
  "integer",
  "decimal",
  "double",
  "date",
  "datetime",
  "boolean",
  "enum",
  "other",
]);

const VALID_CARDINALITY_LABELS = new Set<string>(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]);

/**
 * Local names this module treats as Ontology-Playground-style extension
 * metadata (see `opExtensions.ts`) rather than schema-worthy data. These are
 * bound to each document's own base namespace, not a fixed IRI, so they can
 * only be recognized by local name — matched narrowly below (subject must
 * itself be a declared Class/DatatypeProperty/ObjectProperty, predicate
 * namespace must not be a known vocabulary) so a genuine domain property that
 * happens to share one of these words is never swept up by accident.
 */
const OP_EXTENSION_LOCAL_NAMES = new Set([
  "icon",
  "emoji",
  "color",
  "colour",
  "fillColor",
  "isIdentifier",
  "unit",
  "enumValues",
  "propertyType",
  "cardinality",
  "fromEntityId",
  "toEntityId",
  "relationshipAttributeOf",
  "attributeType",
]);

interface QuadIndex {
  typesOf: Map<string, Set<string>>;
  labelOf: Map<string, string>;
  prefLabelOf: Map<string, string>;
  commentOf: Map<string, string>;
}

function buildIndex(quads: Quad[]): QuadIndex {
  const typesOf = new Map<string, Set<string>>();
  const labelOf = new Map<string, string>();
  const prefLabelOf = new Map<string, string>();
  const commentOf = new Map<string, string>();

  for (const quad of quads) {
    if (quad.subject.termType !== "NamedNode") {
      continue;
    }
    const subject = quad.subject.value;
    if (quad.predicate.value === RDF_TYPE && quad.object.termType === "NamedNode") {
      let types = typesOf.get(subject);
      if (!types) {
        types = new Set();
        typesOf.set(subject, types);
      }
      types.add(quad.object.value);
    } else if (quad.predicate.value === RDFS_LABEL && quad.object.termType === "Literal") {
      labelOf.set(subject, quad.object.value);
    } else if (quad.predicate.value === SKOS_PREF_LABEL && quad.object.termType === "Literal") {
      prefLabelOf.set(subject, quad.object.value);
    } else if (quad.predicate.value === RDFS_COMMENT && quad.object.termType === "Literal") {
      commentOf.set(subject, quad.object.value);
    }
  }

  return { typesOf, labelOf, prefLabelOf, commentOf };
}

function humanize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function uncapitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/**
 * Named + `owl:unionOf`/`owl:intersectionOf`-expanded values of `predicate`
 * on `subjectIri` (used for both `rdfs:domain` and `rdfs:range`). Reports
 * whether expansion actually happened, since that changes the resulting
 * fact's provenance from `"declared"` to `"inferred-union"`.
 */
function resolveClassTerms(quads: Quad[], subjectIri: string, predicate: string): { terms: string[]; usedUnion: boolean } {
  const terms: string[] = [];
  let usedUnion = false;
  for (const quad of quads) {
    if (quad.subject.value !== subjectIri || quad.predicate.value !== predicate) {
      continue;
    }
    if (quad.object.termType === "NamedNode") {
      terms.push(quad.object.value);
      continue;
    }
    if (quad.object.termType !== "BlankNode") {
      continue;
    }
    const unionHead = findListHead(quads, quad.object.value, OWL_UNION_OF) ?? findListHead(quads, quad.object.value, OWL_INTERSECTION_OF);
    if (unionHead) {
      const members = readRdfList(quads, unionHead);
      if (members.length > 0) {
        terms.push(...members);
        usedUnion = true;
      }
    }
  }
  return { terms, usedUnion };
}

function findListHead(quads: Quad[], blankLabel: string, listPredicate: string) {
  return quads.find((q) => q.subject.termType === "BlankNode" && q.subject.value === blankLabel && q.predicate.value === listPredicate)
    ?.object;
}

function rangeIriFor(quads: Quad[], predicateIri: string): string | undefined {
  return quads.find((q) => q.subject.value === predicateIri && q.predicate.value === RDFS_RANGE && q.object.termType === "NamedNode")
    ?.object.value;
}

function resolvePropertyType(override: string | undefined, rangeIri: string | undefined): PropertyType {
  if (override && VALID_PROPERTY_TYPES.has(override)) {
    return override as PropertyType;
  }
  if (rangeIri && rangeIri.startsWith(XSD)) {
    return XSD_LOCAL_TO_PROPERTY_TYPE[localName(rangeIri)] ?? "other";
  }
  return "other";
}

/**
 * `owl:FunctionalProperty` bounds the property to at most one value *per
 * subject* — i.e. many subjects may still share one target, so the honest
 * label is "many-to-one" (target-side capped at one, source-side left
 * unconstrained). `owl:InverseFunctionalProperty` is the mirror image.
 * Restriction-based cardinality (`owl:cardinality` etc. on an
 * `owl:Restriction`) is deliberately not attempted here — see DevPlan.md's
 * v2 risk notes; it is future work, not a silent gap in what's claimed.
 */
function deriveCardinality(quads: Quad[], idx: QuadIndex, predicateIri: string): Cardinality {
  const override = findOverrideLiteral(quads, predicateIri, ["cardinality"]);
  if (override && VALID_CARDINALITY_LABELS.has(override)) {
    return override as Cardinality;
  }

  const types = idx.typesOf.get(predicateIri) ?? new Set<string>();
  const functional = types.has(OWL_FUNCTIONAL_PROPERTY);
  const inverseFunctional = types.has(OWL_INVERSE_FUNCTIONAL_PROPERTY);

  if (functional && inverseFunctional) {
    return "one-to-one";
  }
  if (functional) {
    return "many-to-one";
  }
  if (inverseFunctional) {
    return "one-to-many";
  }
  return "unspecified";
}

/**
 * Builds a schema-level (class-centric, ER-diagram-style) model from parsed
 * quads — the "Schema" diagram view, as opposed to `graphModel.ts`'s raw
 * triple-per-edge "Triples" view. Works identically for every RDF
 * serialization since it only touches `N3.Quad[]` (see `parseOntology`).
 */
export function buildSchemaModel(quads: Quad[]): SchemaModel {
  const idx = buildIndex(quads);
  const entityMap = new Map<string, SchemaEntity>();
  const relations: SchemaRelation[] = [];
  const unattachedProperties: UnattachedProperty[] = [];

  function entityFor(iri: string, origin: EntityOrigin): SchemaEntity {
    const existing = entityMap.get(iri);
    if (existing) {
      if (existing.origin === "inferred" && origin !== "inferred") {
        existing.origin = origin;
      }
      return existing;
    }
    const name = idx.labelOf.get(iri) ?? idx.prefLabelOf.get(iri) ?? localName(iri);
    const fallbackIcon = origin === "skosConcept" ? DEFAULT_SKOS_ICON : origin === "inferred" ? DEFAULT_INFERRED_ICON : DEFAULT_CLASS_ICON;
    const entity: SchemaEntity = {
      id: iri,
      name,
      description: idx.commentOf.get(iri),
      origin,
      properties: [],
      instanceCount: 0,
      icon: iconOverrideFor(quads, iri) ?? iconFor([name, localName(iri)], fallbackIcon),
      // Placeholder — overwritten below, once every entity and relation is
      // known, by assignRelationalAppearance. Never observed by a caller
      // in this intermediate state.
      colorIndex: 0,
      connectionGroup: { index: 1, count: 1, size: 1 },
      colorOverride: colorOverrideFor(quads, iri),
    };
    entityMap.set(iri, entity);
    return entity;
  }

  // --- Stage 1 + 2: declared entities (additive — both run unconditionally) ---
  for (const [subject, types] of idx.typesOf) {
    if (types.has(OWL_CLASS)) {
      entityFor(subject, "owlClass");
    } else if (types.has(RDFS_CLASS)) {
      entityFor(subject, "rdfsClass");
    }
  }
  for (const [subject, types] of idx.typesOf) {
    if (types.has(SKOS_CONCEPT)) {
      entityFor(subject, "skosConcept");
    }
  }

  // --- Stage 3: fallback only if nothing was declared at all ---
  // Catches documents like a SKOS taxonomy with zero owl:Class/skos:Concept
  // *declarations*, and RDF/XML written against an external vocabulary
  // (e.g. FOAF) where `foaf:Person` is used as a type but never itself
  // declared as a class anywhere in the document.
  if (entityMap.size === 0) {
    for (const quad of quads) {
      if (quad.object.termType !== "NamedNode") {
        continue;
      }
      if (![RDF_TYPE, RDFS_SUBCLASS_OF, RDFS_DOMAIN, RDFS_RANGE].includes(quad.predicate.value)) {
        continue;
      }
      const iri = quad.object.value;
      if (iri.startsWith(XSD) || EXCLUDED_META_CLASS_IRIS.has(iri)) {
        continue;
      }
      entityFor(iri, "inferred");
    }
  }

  // --- Ontology-level title/description ---
  let title: string | undefined;
  let description: string | undefined;
  for (const [subject, types] of idx.typesOf) {
    if (types.has(OWL_ONTOLOGY)) {
      title = idx.labelOf.get(subject);
      description = idx.commentOf.get(subject);
      break;
    }
  }

  // --- rdfs:subClassOf hierarchy edges (named parent/child only; a blank
  // parent is a restriction, out of scope for this edge kind) ---
  for (const quad of quads) {
    if (quad.predicate.value !== RDFS_SUBCLASS_OF) {
      continue;
    }
    if (quad.subject.termType !== "NamedNode" || quad.object.termType !== "NamedNode") {
      continue;
    }
    const child = entityFor(quad.subject.value, "inferred");
    const parent = entityFor(quad.object.value, "inferred");
    relations.push({
      id: `subClassOf|${child.id}|${parent.id}`,
      name: "",
      source: child.id,
      target: parent.id,
      kind: "subClassOf",
      cardinality: "unspecified",
      provenance: "declared",
    });
  }

  // --- SKOS hierarchy (skos:broader) and generic association (skos:related) ---
  for (const quad of quads) {
    if (quad.subject.termType !== "NamedNode" || quad.object.termType !== "NamedNode") {
      continue;
    }
    if (quad.predicate.value === SKOS_BROADER) {
      const child = entityFor(quad.subject.value, "skosConcept");
      const parent = entityFor(quad.object.value, "skosConcept");
      relations.push({
        id: `skosBroader|${child.id}|${parent.id}`,
        name: "",
        source: child.id,
        target: parent.id,
        kind: "skosBroader",
        cardinality: "unspecified",
        provenance: "declared",
      });
    } else if (quad.predicate.value === SKOS_RELATED) {
      const a = entityFor(quad.subject.value, "skosConcept");
      const b = entityFor(quad.object.value, "skosConcept");
      relations.push({
        id: `related|${a.id}|${b.id}`,
        name: humanize(localName(SKOS_RELATED)),
        source: a.id,
        target: b.id,
        kind: "objectProperty",
        cardinality: "unspecified",
        provenance: "declared",
      });
    }
  }

  // --- Discover datatype/object properties: explicitly typed, or by usage
  // pattern for documents that never declare their properties at all (the
  // The bundled RDF/XML sample is exactly this: its local properties are used but never
  // typed as owl:Datatype/ObjectProperty anywhere in the document). ---
  const declaredDatatypeProperties = new Set<string>();
  const declaredObjectProperties = new Set<string>();
  for (const [subject, types] of idx.typesOf) {
    if (types.has(OWL_DATATYPE_PROPERTY)) {
      declaredDatatypeProperties.add(subject);
    }
    if (types.has(OWL_OBJECT_PROPERTY)) {
      declaredObjectProperties.add(subject);
    }
  }

  // A predicate is treated as Ontology-Playground extension metadata (and
  // excluded from usage-based property discovery below) only when it's found
  // on a subject that is itself a declared Class/DatatypeProperty/
  // ObjectProperty — i.e. describing the schema, not instance data — and its
  // local name matches the reserved list and its namespace isn't a known
  // vocabulary. Without this, e.g. `ont:isIdentifier`/`ont:fromEntityId` on a
  // DatatypeProperty/ObjectProperty declaration gets misread as a brand new,
  // undeclared datatype property used on that declaration's subject.
  function isOpExtensionMetadataQuad(quad: Quad): boolean {
    if (quad.subject.termType !== "NamedNode" || isKnownVocabularyIri(quad.predicate.value)) {
      return false;
    }
    if (!OP_EXTENSION_LOCAL_NAMES.has(localName(quad.predicate.value))) {
      return false;
    }
    const subjectTypes = idx.typesOf.get(quad.subject.value);
    if (!subjectTypes) {
      return false;
    }
    return (
      subjectTypes.has(OWL_CLASS) ||
      subjectTypes.has(RDFS_CLASS) ||
      subjectTypes.has(OWL_DATATYPE_PROPERTY) ||
      subjectTypes.has(OWL_OBJECT_PROPERTY)
    );
  }

  const usageObjectPredicates = new Set<string>();
  const usageDatatypePredicates = new Set<string>();
  for (const quad of quads) {
    if (STRUCTURAL_PREDICATES.has(quad.predicate.value)) {
      continue;
    }
    if (quad.subject.termType !== "NamedNode" && quad.subject.termType !== "BlankNode") {
      continue;
    }
    if (isOpExtensionMetadataQuad(quad)) {
      continue;
    }
    if (quad.object.termType === "Literal") {
      usageDatatypePredicates.add(quad.predicate.value);
    } else {
      usageObjectPredicates.add(quad.predicate.value);
    }
  }

  const allObjectProperties = new Set([
    ...declaredObjectProperties,
    ...[...usageObjectPredicates].filter((p) => !declaredDatatypeProperties.has(p)),
  ]);
  const allDatatypeProperties = new Set([
    ...declaredDatatypeProperties,
    ...[...usageDatatypePredicates].filter((p) => !allObjectProperties.has(p)),
  ]);

  // Datatype properties marked `ont:relationshipAttributeOf` (Ontology-
  // Playground form: an attribute *of a relationship*, e.g. "quantity" on an
  // order-contains-product edge) never belong to a class, so routing them
  // through attachDatatypeProperty's domain resolution would just dump them
  // in unattachedProperties as noise. Collect them separately, keyed by the
  // local name of the relation property they describe, and splice them onto
  // the matching SchemaRelation(s) after relations are built below.
  const relationshipAttributesByTarget = new Map<string, { name: string; type: PropertyType }[]>();
  for (const predicateIri of allDatatypeProperties) {
    const relationshipAttributeOf = findOverrideLiteral(quads, predicateIri, ["relationshipAttributeOf"]);
    if (relationshipAttributeOf) {
      const name = idx.labelOf.get(predicateIri) ?? humanize(localName(predicateIri));
      const attributeTypeOverride = findOverrideLiteral(quads, predicateIri, ["attributeType"]);
      const type = resolvePropertyType(attributeTypeOverride, undefined);
      const list = relationshipAttributesByTarget.get(relationshipAttributeOf) ?? [];
      list.push({ name, type });
      relationshipAttributesByTarget.set(relationshipAttributeOf, list);
      continue;
    }
    attachDatatypeProperty(predicateIri, declaredDatatypeProperties.has(predicateIri));
  }
  for (const predicateIri of allObjectProperties) {
    attachObjectProperty(predicateIri, declaredObjectProperties.has(predicateIri));
  }
  if (relationshipAttributesByTarget.size > 0) {
    for (const relation of relations) {
      if (!relation.iri) {
        continue;
      }
      const attrs = relationshipAttributesByTarget.get(localName(relation.iri));
      if (attrs && attrs.length > 0) {
        relation.attributes = attrs;
      }
    }
  }

  function resolveEntityIdOverride(shortId: string): string | undefined {
    for (const [iri] of entityMap) {
      if (uncapitalize(localName(iri)) === shortId) {
        return iri;
      }
    }
    return undefined;
  }

  /**
   * Attaches a datatype property to the entity/entities named by its
   * `rdfs:domain`. Falls back to usage-based inference (look at the
   * `rdf:type` of subjects actually carrying a value for this predicate)
   * when no domain is declared at all, and only gives up — landing the
   * property in `unattachedProperties`, never silently dropping it — when
   * neither approach resolves anything.
   */
  function attachDatatypeProperty(predicateIri: string, isDeclared: boolean): void {
    const name = idx.labelOf.get(predicateIri) ?? humanize(localName(predicateIri));
    const description = idx.commentOf.get(predicateIri);
    const propertyTypeOverride = findOverrideLiteral(quads, predicateIri, ["propertyType"]);
    const isIdentifierOverride = findOverrideLiteral(quads, predicateIri, ["isIdentifier"]) === "true";
    const unitOverride = findOverrideLiteral(quads, predicateIri, ["unit"]);
    const enumValuesOverride = findOverrideLiteral(quads, predicateIri, ["enumValues"]);
    const rangeIri = rangeIriFor(quads, predicateIri);

    const { terms: domainTerms, usedUnion } = resolveClassTerms(quads, predicateIri, RDFS_DOMAIN);
    let targets = domainTerms;
    let provenance: Provenance = usedUnion ? "inferred-union" : "declared";

    if (targets.length === 0) {
      const inferred = new Set<string>();
      for (const quad of quads) {
        if (quad.predicate.value !== predicateIri || quad.object.termType !== "Literal") {
          continue;
        }
        if (quad.subject.termType !== "NamedNode") {
          continue;
        }
        for (const t of idx.typesOf.get(quad.subject.value) ?? []) {
          if (entityMap.has(t)) {
            inferred.add(t);
          }
        }
      }
      if (inferred.size > 0) {
        targets = [...inferred];
        provenance = "inferred-usage";
      }
    }

    if (targets.length === 0) {
      unattachedProperties.push({
        iri: predicateIri,
        name,
        kind: "datatype",
        reason: isDeclared
          ? "no rdfs:domain, and no instance data to infer an owning class from"
          : "used only with literal values; no owl:DatatypeProperty declaration or inferable owning class",
      });
      return;
    }

    const type = resolvePropertyType(propertyTypeOverride, rangeIri);
    for (const targetIri of targets) {
      const entity = entityFor(targetIri, "inferred");
      if (entity.properties.some((p) => p.iri === predicateIri)) {
        continue;
      }
      entity.properties.push({
        iri: predicateIri,
        name,
        type,
        datatypeIri: rangeIri,
        isIdentifier: isIdentifierOverride || undefined,
        unit: unitOverride,
        enumValues: enumValuesOverride ? enumValuesOverride.split(",").map((v) => v.trim()) : undefined,
        description,
        provenance,
      });
    }
  }

  /**
   * Resolves an object property's source/target entity pair through a
   * fallback ladder, measured against this repo's own samples (see
   * DevPlan.md v2): a domain/range-only implementation would silently delete
   * relations in `tool-lending.ttl` that are resolved from inverse
   * declarations or usage. Each rung down is strictly less certain than the
   * last, which is why `provenance` is
   * tracked and rendered (dashed / muted) rather than presented uniformly.
   *
   *   1. `ont:fromEntityId`/`toEntityId` override (Ontology-Playground form)
   *   2. declared `rdfs:domain`/`rdfs:range` (named or `owl:unionOf`-expanded)
   *   3. `owl:inverseOf` another property that itself resolves via (2)
   *   4. instance-level usage: actual (subject, object) pairs asserted with
   *      this predicate, typed via their own `rdf:type`
   *   5. unresolved → `unattachedProperties`, never dropped
   *
   * `rdfs:subPropertyOf` inheritance and `owl:Restriction`
   * (`someValuesFrom`/`onProperty`)-derived relations are deliberately not
   * attempted — a documented gap (DevPlan.md v2 risk notes), not a silent one.
   */
  function attachObjectProperty(predicateIri: string, isDeclared: boolean): void {
    const name = idx.labelOf.get(predicateIri) ?? humanize(localName(predicateIri));
    const description = idx.commentOf.get(predicateIri);
    const cardinality = deriveCardinality(quads, idx, predicateIri);

    const inverseOfQuad = quads.find(
      (q) => q.subject.value === predicateIri && q.predicate.value === OWL_INVERSE_OF && q.object.termType === "NamedNode",
    );
    const inverseOfIri = inverseOfQuad?.object.value;

    let pairs: { source: string; target: string }[] = [];
    let provenance: Provenance = "declared";

    const fromOverride = findOverrideLiteral(quads, predicateIri, ["fromEntityId"]);
    const toOverride = findOverrideLiteral(quads, predicateIri, ["toEntityId"]);
    if (fromOverride && toOverride) {
      const source = resolveEntityIdOverride(fromOverride);
      const target = resolveEntityIdOverride(toOverride);
      if (source && target) {
        pairs = [{ source, target }];
      }
    }

    if (pairs.length === 0) {
      const domain = resolveClassTerms(quads, predicateIri, RDFS_DOMAIN);
      const range = resolveClassTerms(quads, predicateIri, RDFS_RANGE);
      if (domain.terms.length > 0 && range.terms.length > 0) {
        for (const source of domain.terms) {
          for (const target of range.terms) {
            pairs.push({ source, target });
          }
        }
        provenance = domain.usedUnion || range.usedUnion ? "inferred-union" : "declared";
      }
    }

    if (pairs.length === 0 && inverseOfIri) {
      const otherDomain = resolveClassTerms(quads, inverseOfIri, RDFS_DOMAIN);
      const otherRange = resolveClassTerms(quads, inverseOfIri, RDFS_RANGE);
      if (otherDomain.terms.length > 0 && otherRange.terms.length > 0) {
        for (const source of otherRange.terms) {
          for (const target of otherDomain.terms) {
            pairs.push({ source, target });
          }
        }
        provenance = "inferred-inverse";
      }
    }

    if (pairs.length === 0) {
      const seen = new Set<string>();
      for (const quad of quads) {
        if (quad.predicate.value !== predicateIri) {
          continue;
        }
        if (quad.subject.termType !== "NamedNode" || quad.object.termType !== "NamedNode") {
          continue;
        }
        const subjectTypes = [...(idx.typesOf.get(quad.subject.value) ?? [])].filter((t) => entityMap.has(t));
        const objectTypes = [...(idx.typesOf.get(quad.object.value) ?? [])].filter((t) => entityMap.has(t));
        for (const source of subjectTypes) {
          for (const target of objectTypes) {
            const key = `${source}|${target}`;
            if (!seen.has(key)) {
              seen.add(key);
              pairs.push({ source, target });
            }
          }
        }
      }
      if (pairs.length > 0) {
        provenance = "inferred-usage";
      }
    }

    if (pairs.length === 0) {
      unattachedProperties.push({
        iri: predicateIri,
        name,
        kind: "object",
        reason: isDeclared
          ? "no rdfs:domain/range, no resolvable owl:inverseOf, and no instance data to infer endpoints from"
          : "used only between resources with no owl:ObjectProperty declaration and no inferable endpoint types",
      });
      return;
    }

    for (const { source, target } of pairs) {
      const sourceEntity = entityFor(source, "inferred");
      const targetEntity = entityFor(target, "inferred");
      relations.push({
        id: `${predicateIri}|${sourceEntity.id}|${targetEntity.id}`,
        iri: predicateIri,
        name,
        source: sourceEntity.id,
        target: targetEntity.id,
        kind: "objectProperty",
        cardinality,
        description,
        inverseOfIri,
        provenance,
      });
    }
  }

  // --- Instance counts (individuals are never entities themselves — they
  // surface only as a count + sample list on the class they instantiate) ---
  for (const [subject, types] of idx.typesOf) {
    for (const typeIri of types) {
      if (typeIri === subject) {
        continue;
      }
      const entity = entityMap.get(typeIri);
      if (entity) {
        entity.instanceCount += 1;
      }
    }
  }

  // Colors are assigned last, once the full entity/relation set is known —
  // see assignRelationalAppearance for why this needs the whole graph
  // rather than being computable per-entity at construction time above.
  const appearanceById = assignRelationalAppearance(
    [...entityMap.keys()],
    relations.map((r) => ({ source: r.source, target: r.target })),
  );
  for (const entity of entityMap.values()) {
    const appearance = appearanceById.get(entity.id);
    if (appearance) {
      entity.colorIndex = appearance.colorIndex;
      entity.connectionGroup = {
        index: appearance.groupIndex,
        count: appearance.groupCount,
        size: appearance.groupSize,
      };
    }
  }

  return {
    title,
    description,
    entities: [...entityMap.values()],
    relations,
    unattachedProperties,
    isEmpty: entityMap.size === 0,
  };
}
