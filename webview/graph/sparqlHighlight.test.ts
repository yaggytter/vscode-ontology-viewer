import { describe, expect, it } from "vitest";
import { computeSparqlMatchIds, resolveHighlightNodeIds } from "./sparqlHighlight";

const HARBOR = "https://example.org/ontology/harbor-market#";

describe("resolveHighlightNodeIds", () => {
  it("prefers a resource's own node when the view drew one", () => {
    const nodeIds = new Set(["http://ex/alice", "http://ex/Person"]);
    const resolved = resolveHighlightNodeIds(
      ["http://ex/alice"],
      { "http://ex/alice": ["http://ex/Person"] },
      nodeIds,
    );
    // The instance has a node of its own (triples view), so its class must not
    // be pulled in — that would highlight more than the query matched.
    expect(resolved).toEqual(new Set(["http://ex/alice"]));
  });

  it("falls back to a resource's type when the view has no node for it", () => {
    // Schema view: only classes are drawn.
    const nodeIds = new Set(["http://ex/Person"]);
    const resolved = resolveHighlightNodeIds(
      ["http://ex/alice"],
      { "http://ex/alice": ["http://ex/Person"] },
      nodeIds,
    );
    expect(resolved).toEqual(new Set(["http://ex/Person"]));
  });

  it("ignores resources that have neither a node nor a drawable type", () => {
    const nodeIds = new Set(["http://ex/Other"]);
    expect(resolveHighlightNodeIds(["http://ex/ghost"], {}, nodeIds)).toEqual(new Set());
  });

  it("keeps every drawable type when a resource has more than one", () => {
    const nodeIds = new Set(["http://ex/A", "http://ex/B"]);
    const resolved = resolveHighlightNodeIds(
      ["http://ex/thing"],
      { "http://ex/thing": ["http://ex/A", "http://ex/B"] },
      nodeIds,
    );
    expect(resolved).toEqual(new Set(["http://ex/A", "http://ex/B"]));
  });

  /** End-to-end shape of the reported bug, at the view layer. */
  it("lights up Stall and Product for the reported harbor-market query in schema view", () => {
    const schemaNodeIds = new Set([`${HARBOR}Vendor`, `${HARBOR}Stall`, `${HARBOR}Product`, `${HARBOR}MarketDay`]);
    const resolved = resolveHighlightNodeIds(
      [`${HARBOR}pierStall`, `${HARBOR}seaSaltCrackers`],
      {
        [`${HARBOR}pierStall`]: [`${HARBOR}Stall`],
        [`${HARBOR}seaSaltCrackers`]: [`${HARBOR}Product`],
      },
      schemaNodeIds,
    );
    expect(resolved).toEqual(new Set([`${HARBOR}Stall`, `${HARBOR}Product`]));
  });
});

describe("computeSparqlMatchIds", () => {
  const nodes = ["http://ex/A", "http://ex/B", "http://ex/C"];
  const edges = [
    { id: "e1", source: "http://ex/A", target: "http://ex/B", iri: "http://ex/rel" },
    { id: "e2", source: "http://ex/B", target: "http://ex/C", iri: "http://ex/other" },
  ];

  it("selects matched nodes and edges whose both endpoints matched", () => {
    const { nodeIds, edgeIds } = computeSparqlMatchIds(new Set(["http://ex/A", "http://ex/B"]), nodes, edges);
    expect(nodeIds).toEqual(new Set(["http://ex/A", "http://ex/B"]));
    expect(edgeIds).toEqual(new Set(["e1"]));
  });

  it("selects an edge whose predicate IRI was matched even if its endpoints were not", () => {
    // The schema view draws relations as edges keyed by predicate IRI, so a
    // query returning the predicate itself should light that relation up.
    const { edgeIds } = computeSparqlMatchIds(new Set(["http://ex/other"]), nodes, edges);
    expect(edgeIds).toEqual(new Set(["e2"]));
  });

  it("ignores match ids that correspond to nothing in the diagram", () => {
    const { nodeIds, edgeIds } = computeSparqlMatchIds(new Set(["http://ex/Z"]), nodes, edges);
    expect(nodeIds.size).toBe(0);
    expect(edgeIds.size).toBe(0);
  });

  it("returns empty sets for no matches", () => {
    const { nodeIds, edgeIds } = computeSparqlMatchIds(new Set(), nodes, edges);
    expect(nodeIds.size).toBe(0);
    expect(edgeIds.size).toBe(0);
  });
});
