import type cytoscape from "cytoscape";
import { clearSparqlFilter, setSparqlFilter } from "./focus";

/** How a SPARQL result should be reflected on the diagram. */
export type SparqlGraphMode = "highlight" | "filter" | "off";

interface EdgeEndpoints {
  id: string;
  source: string;
  target: string;
}

export interface SparqlMatchIds {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Resolves a flat list of matched IRIs against the diagram's actual nodes and
 * edges. A node matches iff its id (a resolved IRI) is in the match list;
 * IRIs that name no diagram node are ignored. An edge matches iff *both* its
 * endpoints matched — a lone matched endpoint does not imply the relation
 * itself was part of the result, so highlighting the edge would overstate
 * what the query returned. Pure and DOM-free so it is unit-testable without a
 * live cytoscape instance.
 */
export function computeSparqlMatchIds(
  matchedIris: readonly string[],
  nodeIds: readonly string[],
  edges: readonly EdgeEndpoints[],
): SparqlMatchIds {
  const matched = new Set(matchedIris);
  const presentNodeIds = new Set<string>();
  for (const id of nodeIds) {
    if (matched.has(id)) {
      presentNodeIds.add(id);
    }
  }
  const matchedEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (presentNodeIds.has(edge.source) && presentNodeIds.has(edge.target)) {
      matchedEdgeIds.add(edge.id);
    }
  }
  return { nodeIds: presentNodeIds, edgeIds: matchedEdgeIds };
}

/**
 * Applies a SPARQL result to the live cytoscape graph according to `mode`:
 *  - "highlight": tag matched nodes/edges with `sparql-match` (see style.ts),
 *    leaving the rest fully visible.
 *  - "filter": keep only matched nodes via the shared dim filter
 *    (graph/focus.ts), dimming everything else.
 *  - "off": remove both effects.
 *
 * Highlight and filter are independent axes, so switching to one always
 * tears down the other first — a caller flipping the mode never leaves a
 * stale `sparql-match` ring behind a freshly filtered graph.
 *
 * Callers must run `applyDim(cy)` after this (main.ts owns that call) so the
 * filter set change is reflected; this function only sets the filter state
 * and the highlight classes.
 */
export function applySparqlGraphEffect(
  cy: cytoscape.Core,
  matchedIris: readonly string[],
  mode: SparqlGraphMode,
): void {
  cy.elements().removeClass("sparql-match");

  if (mode === "off") {
    clearSparqlFilter();
    return;
  }

  if (mode === "filter") {
    clearSparqlFilter();
    setSparqlFilter(matchedIris);
    return;
  }

  // highlight
  clearSparqlFilter();
  const nodeIds = cy.nodes().map((n) => n.id());
  const edges = cy.edges().map((e) => ({ id: e.id(), source: e.source().id(), target: e.target().id() }));
  const { nodeIds: matchNodeIds, edgeIds: matchEdgeIds } = computeSparqlMatchIds(matchedIris, nodeIds, edges);
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
