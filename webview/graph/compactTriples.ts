import { isKnownVocabularyIri } from "../../src/rdf/vocabulary";
import type { OntologyEdge, OntologyGraph, OntologyNode } from "../../src/rdf/graphModel";

export interface CompactTriplesResult {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  /**
   * Facts absorbed into a node because their object was a folded sink, keyed
   * by node id — e.g. `"http://ex/createdAt" -> ["range: dateTime"]`. The view
   * renders these on the node so nothing the document states is lost.
   */
  foldedFacts: Map<string, string[]>;
  removedNodeCount: number;
  removedEdgeCount: number;
}

/**
 * Folds standard-vocabulary "sink" nodes out of the triples graph.
 *
 * Why this and not the obvious "hide all property nodes": on a schema-heavy
 * ontology the property nodes are the hinge that connects one class to
 * another (`Class <-domain- property -range-> Class`), so hiding them
 * shatters the graph — measured on samples/saas_ontology_v0.ttl, it turned 42
 * classes into 45 isolated boxes. The transformation that hides properties
 * *and* keeps the graph connected is exactly what the schema view already
 * does, by rewiring domain/range into a direct class-to-class edge.
 *
 * What genuinely hurts the triples view instead is a handful of extremely
 * high-degree sinks: every datatype property's `rdfs:range` converges on
 * `xsd:string`, `xsd:dateTime`, and friends. On that same file `xsd:string`
 * alone had degree 56, which no force-directed layout can arrange readably.
 * Removing 6 such nodes drops ~100 edges while leaving the largest connected
 * component essentially intact.
 *
 * A node is folded only when both hold, so the rule stays principled rather
 * than a hardcoded blocklist:
 *  1. its IRI is in a standard vocabulary namespace (rdf, rdfs, owl, xsd,
 *     skos, dcterms, foaf), and
 *  2. it has no outgoing edges — it is purely something other nodes point at.
 *
 * Condition 2 matters: a document that states `rdfs:Resource rdfs:subClassOf
 * ex:Thing` has said something about that term, so it keeps its node.
 *
 * Pure, and never mutates the input — the underlying `OntologyGraph` stays a
 * faithful representation of the parsed triples, and this compaction is a view
 * concern the user can toggle off.
 */
/**
 * Trims a vocabulary prefix off a predicate label for the folded form, so a
 * property reads `range: string` rather than the noisier `rdfs:range: string`.
 * The prefix carries no information here — the fact is already anchored to the
 * node it belongs to.
 */
function factPredicateLabel(predicateLabel: string): string {
  const colon = predicateLabel.indexOf(":");
  return colon >= 0 ? predicateLabel.slice(colon + 1) : predicateLabel;
}

export function compactTriples(graph: OntologyGraph): CompactTriplesResult {
  const hasOutgoing = new Set<string>();
  const hasIncoming = new Set<string>();
  for (const edge of graph.edges) {
    hasOutgoing.add(edge.source);
    hasIncoming.add(edge.target);
  }

  const sinkIds = new Set<string>();
  for (const node of graph.nodes) {
    if (
      !node.isBlankNode &&
      isKnownVocabularyIri(node.id) &&
      !hasOutgoing.has(node.id) &&
      hasIncoming.has(node.id)
    ) {
      sinkIds.add(node.id);
    }
  }

  if (sinkIds.size === 0) {
    return {
      nodes: graph.nodes,
      edges: graph.edges,
      foldedFacts: new Map(),
      removedNodeCount: 0,
      removedEdgeCount: 0,
    };
  }

  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const foldedFacts = new Map<string, string[]>();
  const edges: OntologyEdge[] = [];

  for (const edge of graph.edges) {
    if (!sinkIds.has(edge.target)) {
      edges.push(edge);
      continue;
    }
    // Absorb the statement onto its subject instead of drawing it.
    const fact = `${factPredicateLabel(edge.predicateLabel)}: ${labelById.get(edge.target) ?? edge.target}`;
    const existing = foldedFacts.get(edge.source);
    if (!existing) {
      foldedFacts.set(edge.source, [fact]);
    } else if (!existing.includes(fact)) {
      existing.push(fact);
    }
  }

  const nodes = graph.nodes.filter((node) => !sinkIds.has(node.id));

  return {
    nodes,
    edges,
    foldedFacts,
    removedNodeCount: graph.nodes.length - nodes.length,
    removedEdgeCount: graph.edges.length - edges.length,
  };
}
