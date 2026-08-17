import type cytoscape from "cytoscape";

let searchQuery = "";
let focusedNodeId: string | undefined;

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

/**
 * Single owner of the `dimmed` cytoscape class, recomputed from both
 * `searchQuery` and `focusedNodeId` on every call — if search and focus mode
 * each toggled the class independently, clearing one would clobber the
 * other's effect (e.g. clearing the search box after focusing a node would
 * also undim everything outside the focused neighborhood). Must be called
 * after any full element rebuild too: `elements().remove()` drops classes.
 */
export function applyDim(cy: cytoscape.Core): void {
  if (!searchQuery && !focusedNodeId) {
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

  const keepIds = new Set(keep.map((n) => n.id()));
  cy.nodes().forEach((n) => {
    n.toggleClass("dimmed", !keepIds.has(n.id()));
  });
  cy.edges().forEach((e) => {
    e.toggleClass("dimmed", !(keepIds.has(e.source().id()) && keepIds.has(e.target().id())));
  });
}
