import type { Quad } from "n3";
import {
  isClassTypeIri,
  isPropertyTypeIri,
  lookupKnownTerm,
  OWL_NAMED_INDIVIDUAL,
  RDF_TYPE,
  RDFS_COMMENT,
  RDFS_LABEL,
  RDFS_SUBCLASS_OF,
} from "./vocabulary";

export type NodeKind = "class" | "property" | "individual" | "resource";

export interface OntologyNode {
  /** Fully resolved IRI, or a synthetic `_:label` id for blank nodes. */
  id: string;
  kind: NodeKind;
  /** Prefers rdfs:label; falls back to a shortened form of the IRI. */
  label: string;
  comment?: string;
  isBlankNode: boolean;
}

export interface OntologyEdge {
  id: string;
  source: string;
  predicate: string;
  predicateLabel: string;
  target: string;
}

export interface OntologyGraph {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
}

/** Predicates rendered as edges rather than folded into a node's label/comment. */
const LABEL_LIKE_PREDICATES = new Set([RDFS_LABEL, RDFS_COMMENT]);

/**
 * Builds a diagram-ready graph from parsed quads. This is intentionally
 * decoupled from serialization format and from position tracking — it only
 * needs quads, so it works identically for Turtle, RDF/XML, and JSON-LD.
 * (Editability of a given node's label is decided separately, by whether a
 * Turtle position-index entry exists for it — see src/rdf/positionIndex.ts.)
 */
export function buildGraphModel(quads: Quad[]): OntologyGraph {
  const nodes = new Map<string, OntologyNode>();
  const edges: OntologyEdge[] = [];

  const nodeFor = (id: string, isBlankNode: boolean): OntologyNode => {
    let node = nodes.get(id);
    if (!node) {
      node = { id, kind: "resource", label: shortLabel(id, isBlankNode), isBlankNode };
      nodes.set(id, node);
    }
    return node;
  };

  for (const quad of quads) {
    if (quad.subject.termType !== "NamedNode" && quad.subject.termType !== "BlankNode") {
      continue;
    }
    const subjectId = subjectKey(quad);
    const subject = nodeFor(subjectId, quad.subject.termType === "BlankNode");

    if (quad.predicate.value === RDF_TYPE && quad.object.termType === "NamedNode") {
      applyTypeAnnotation(subject, quad.object.value);
      continue;
    }

    if (quad.object.termType === "Literal") {
      if (quad.predicate.value === RDFS_LABEL) {
        subject.label = quad.object.value;
        continue;
      }
      if (quad.predicate.value === RDFS_COMMENT) {
        subject.comment = quad.object.value;
        continue;
      }
      // Other literal-valued properties (e.g. dcterms:title) still become
      // edges, pointing at a synthetic literal "node" so they're visible in
      // the diagram without being mistaken for a resource.
      const literalNodeId = `_:literal:${subjectId}:${quad.predicate.value}:${quad.object.value}`;
      const literalNode = nodeFor(literalNodeId, true);
      literalNode.label = quad.object.value;
      literalNode.kind = "resource";
      pushEdge(edges, subject.id, quad.predicate.value, literalNode.id);
      continue;
    }

    if (quad.object.termType !== "NamedNode" && quad.object.termType !== "BlankNode") {
      continue;
    }
    const objectId = objectKey(quad);
    nodeFor(objectId, quad.object.termType === "BlankNode");

    if (quad.predicate.value === RDFS_SUBCLASS_OF) {
      subject.kind = subject.kind === "resource" ? "class" : subject.kind;
    }

    pushEdge(edges, subject.id, quad.predicate.value, objectId);
  }

  return { nodes: [...nodes.values()], edges };
}

function applyTypeAnnotation(node: OntologyNode, typeIri: string): void {
  if (isClassTypeIri(typeIri)) {
    node.kind = "class";
  } else if (isPropertyTypeIri(typeIri)) {
    node.kind = "property";
  } else if (typeIri === OWL_NAMED_INDIVIDUAL) {
    node.kind = node.kind === "resource" ? "individual" : node.kind;
  } else if (node.kind === "resource") {
    // An instance of a user-defined class (not itself known to be a class,
    // property, or ontology) — treat as an individual.
    node.kind = "individual";
  }
}

function pushEdge(edges: OntologyEdge[], source: string, predicate: string, target: string): void {
  if (LABEL_LIKE_PREDICATES.has(predicate)) {
    return;
  }
  edges.push({
    id: `${source}|${predicate}|${target}|${edges.length}`,
    source,
    predicate,
    predicateLabel: lookupKnownTerm(predicate)?.label ?? shortLabel(predicate, false),
    target,
  });
}

function subjectKey(quad: Quad): string {
  return quad.subject.termType === "BlankNode" ? `_:${quad.subject.value}` : quad.subject.value;
}

function objectKey(quad: Quad): string {
  return quad.object.termType === "BlankNode" ? `_:${quad.object.value}` : quad.object.value;
}

/** Falls back to `prefix:local` style or the fragment/last-segment of an IRI. */
function shortLabel(id: string, isBlankNode: boolean): string {
  if (isBlankNode) {
    return id.startsWith("_:literal:") ? id : `[blank node ${id.slice(2)}]`;
  }
  const known = lookupKnownTerm(id);
  if (known) {
    return known.label;
  }
  const hashIndex = id.lastIndexOf("#");
  const slashIndex = id.lastIndexOf("/");
  const cut = Math.max(hashIndex, slashIndex);
  return cut >= 0 && cut < id.length - 1 ? id.slice(cut + 1) : id;
}
