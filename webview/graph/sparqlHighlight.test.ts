import { describe, expect, it } from "vitest";
import { computeSparqlMatchIds } from "./sparqlHighlight";

describe("computeSparqlMatchIds", () => {
  const nodes = ["http://ex/A", "http://ex/B", "http://ex/C"];
  const edges = [
    { id: "e1", source: "http://ex/A", target: "http://ex/B" },
    { id: "e2", source: "http://ex/B", target: "http://ex/C" },
  ];

  it("selects matched nodes and edges whose both endpoints matched", () => {
    const { nodeIds, edgeIds } = computeSparqlMatchIds(
      ["http://ex/A", "http://ex/B"],
      nodes,
      edges,
    );
    expect(nodeIds).toEqual(new Set(["http://ex/A", "http://ex/B"]));
    // e1 (A->B) has both endpoints matched; e2 (B->C) does not.
    expect(edgeIds).toEqual(new Set(["e1"]));
  });

  it("ignores match IRIs that correspond to no node in the diagram", () => {
    const { nodeIds } = computeSparqlMatchIds(["http://ex/Z", "http://ex/A"], nodes, edges);
    expect(nodeIds).toEqual(new Set(["http://ex/A"]));
  });

  it("returns empty sets for no matches", () => {
    const { nodeIds, edgeIds } = computeSparqlMatchIds([], nodes, edges);
    expect(nodeIds.size).toBe(0);
    expect(edgeIds.size).toBe(0);
  });
});
