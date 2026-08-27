import type cytoscape from "cytoscape";
import { clearSparqlFilter, setSparqlFilter } from "./focus";

/** How a SPARQL result should be reflected on the diagram. */
export type SparqlGraphMode = "highlight" | "filter" | "off";

/** `rdf:type` IRIs per matched resource, as resolved host-side. */
export type SparqlTypeFallback = Record<string, string[]>;

interface EdgeEndpoints {
  id: string;
  source: string;
  target: string;
  /** Predicate IRI for a relation edge, when the view has one. */
  iri?: string;
}

export interface SparqlMatchIds {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Decides, per matched resource, which node id the *current view* should light
 * up. Only the view knows what it drew, which is why this choice cannot be
 * made host-side:
 *
 *  - The resource has a node of its own (typical in the triples view) → use it.
 *  - It does not (an individual in the class-centric schema view) → fall back
 *    to its `rdf:type`s, so `:pierStall` lights up `:Stall`.
 *
 * The fallback is deliberately *per resource* rather than global: pulling a
 * class in when the instance itself is on screen would highlight more than the
 * query actually matched.
 */
export function resolveHighlightNodeIds(
  matchedIris: readonly string[],
  typeFallback: SparqlTypeFallback,
  nodeIds: ReadonlySet<string>,
): Set<string> {
  const resolved = new Set<string>();
  for (const iri of matchedIris) {
    if (nodeIds.has(iri)) {
      resolved.add(iri);
      continue;
    }
    for (const type of typeFallback[iri] ?? []) {
      if (nodeIds.has(type)) {
        resolved.add(type);
      }
    }
  }
  return resolved;
}

/**
 * Resolves already-view-mapped match ids against the diagram's nodes and edges.
 *
 * An edge is matched when either its predicate IRI was itself matched (the
 * schema view draws relations as predicate-keyed edges, so a query returning
 * the predicate means that relation), or *both* of its endpoints matched — a
 * lone matched endpoint does not imply the relation was part of the result.
 * Pure and DOM-free so it is unit-testable without a live cytoscape instance.
 */
export function computeSparqlMatchIds(
  matchIds: ReadonlySet<string>,
  nodeIds: readonly string[],
  edges: readonly EdgeEndpoints[],
): SparqlMatchIds {
  const presentNodeIds = new Set<string>();
  for (const id of nodeIds) {
    if (matchIds.has(id)) {
      presentNodeIds.add(id);
    }
  }
  const matchedEdgeIds = new Set<string>();
  for (const edge of edges) {
    const predicateMatched = edge.iri !== undefined && matchIds.has(edge.iri);
    const endpointsMatched = presentNodeIds.has(edge.source) && presentNodeIds.has(edge.target);
    if (predicateMatched || endpointsMatched) {
      matchedEdgeIds.add(edge.id);
    }
  }
  return { nodeIds: presentNodeIds, edgeIds: matchedEdgeIds };
}

/** A query result already reduced to what the diagram should react to. */
export interface SparqlGraphEffect {
  matchedIris: readonly string[];
  typeFallback: SparqlTypeFallback;
}

/**
 * Applies a SPARQL result to the live cytoscape graph according to `mode`:
 *  - "highlight": tag matched nodes/edges with `sparql-match` (see style.ts),
 *    leaving the rest fully visible.
 *  - "filter": keep only matched nodes via the shared dim filter
 *    (graph/focus.ts), dimming everything else.
 *  - "off": remove both effects.
 *
 * Highlight and filter are independent axes, so switching to one always tears
 * down the other first — a caller flipping the mode never leaves a stale
 * `sparql-match` ring behind a freshly filtered graph.
 *
 * Callers must run `applyDim(cy)` after this (main.ts owns that call) so a
 * filter change is reflected; this function only sets the filter state and the
 * highlight classes.
 */
export function applySparqlGraphEffect(
  cy: cytoscape.Core,
  effect: SparqlGraphEffect,
  mode: SparqlGraphMode,
): void {
  cy.elements().removeClass("sparql-match");
  clearSparqlFilter();

  if (mode === "off") {
    return;
  }

  const nodeIds = cy.nodes().map((n) => n.id());
  const matchIds = resolveHighlightNodeIds(effect.matchedIris, effect.typeFallback, new Set(nodeIds));

  if (mode === "filter") {
    setSparqlFilter(matchIds);
    return;
  }

  const edges = cy.edges().map((e) => ({
    id: e.id(),
    source: e.source().id(),
    target: e.target().id(),
    iri: (e.data("relationIri") as string | undefined) ?? undefined,
  }));
  const { nodeIds: matchNodeIds, edgeIds: matchEdgeIds } = computeSparqlMatchIds(matchIds, nodeIds, edges);
  cy.nodes().forEach((n) => {
    if (matchNodeIds.has(n.id())) {
      n.addClass("sparql-match");
    }
  });
  cy.edges().forEach((e) => {
    if (matchEdgeIds.has(e.id())) {
      e.addClass("sparql-match");
    }
  });
}
