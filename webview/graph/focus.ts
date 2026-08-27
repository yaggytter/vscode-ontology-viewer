import type cytoscape from "cytoscape";

let searchQuery = "";
let focusedNodeId: string | undefined;
/**
 * IRIs a SPARQL query matched, when the user has chosen "filter" mode for the
 * result. `undefined` means no SPARQL filter is active (distinct from an
 * empty set, which would legitimately dim everything for a query that matched
 * nothing).
 */
let sparqlFilterIris: Set<string> | undefined;

export function setSearchQuery(query: string): void {
  searchQuery = query.trim().toLowerCase();
}

export function getFocusedNodeId(): string | undefined {
  return focusedNodeId;
}

export function toggleFocusedNode(nodeId: string): void {
  focusedNodeId = focusedNodeId === nodeId ? undefined : nodeId;
}

export function clearFocus(): void {
  focusedNodeId = undefined;
}

/** Activates SPARQL filter mode: only nodes whose IRI is in `iris` are kept. */
export function setSparqlFilter(iris: Iterable<string>): void {
  sparqlFilterIris = new Set(iris);
}

/** Deactivates SPARQL filter mode (leaves search/focus untouched). */
export function clearSparqlFilter(): void {
  sparqlFilterIris = undefined;
}

/**
 * Single owner of the `dimmed` cytoscape class, recomputed from `searchQuery`,
 * `focusedNodeId`, and the optional SPARQL filter on every call — if each
 * source toggled the class independently, clearing one would clobber the
 * others' effect (e.g. clearing the search box after focusing a node would
 * also undim everything outside the focused neighborhood). The three
 * conditions combine with AND semantics: a node is kept only if it survives
 * every active filter. Must be called after any full element rebuild too:
 * `elements().remove()` drops classes.
 */
export function applyDim(cy: cytoscape.Core): void {
  if (!searchQuery && !focusedNodeId && !sparqlFilterIris) {
    cy.elements().removeClass("dimmed");
    return;
  }

  let keep = cy.nodes();
  if (focusedNodeId) {
    const center = cy.getElementById(focusedNodeId);
    keep = center.nonempty() ? center.closedNeighborhood().nodes() : cy.collection();
  }
  if (searchQuery) {
    keep = keep.filter((n) => (n.data("label") as string | undefined)?.toLowerCase().includes(searchQuery) ?? false);
  }
  if (sparqlFilterIris) {
    const iris = sparqlFilterIris;
    keep = keep.filter((n) => iris.has(n.id()));
  }

  const keepIds = new Set(keep.map((n) => n.id()));
  cy.nodes().forEach((n) => {
    n.toggleClass("dimmed", !keepIds.has(n.id()));
  });
  cy.edges().forEach((e) => {
    e.toggleClass("dimmed", !(keepIds.has(e.source().id()) && keepIds.has(e.target().id())));
  });
}
