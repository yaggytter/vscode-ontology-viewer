import { describe, expect, it, beforeEach } from "vitest";
import {
  applyDim,
  clearFocus,
  setSearchQuery,
  setSparqlFilter,
  clearSparqlFilter,
} from "./focus";

/**
 * A hand-rolled fake of the slice of the cytoscape API applyDim() touches.
 * The real Core is a heavyweight canvas object; these tests only care about
 * which elements end up with the `dimmed` class, so a light double keeps the
 * unit fast and deterministic.
 */
interface FakeEle {
  id: string;
  label?: string;
  source?: string;
  target?: string;
  classes: Set<string>;
}

function makeCy(nodes: FakeEle[], edges: FakeEle[]) {
  const wrap = (eles: FakeEle[]) => {
    const collection = {
      map: <T>(fn: (e: unknown) => T) => eles.map((e) => fn(nodeApi(e))),
      filter: (fn: (e: unknown) => boolean) => wrap(eles.filter((e) => fn(nodeApi(e)))),
      forEach: (fn: (e: unknown) => void) => eles.forEach((e) => fn(nodeApi(e))),
      removeClass: (c: string) => eles.forEach((e) => e.classes.delete(c)),
      nonempty: () => eles.length > 0,
      nodes: () => wrap(eles),
      length: eles.length,
    };
    return collection;
  };

  const nodeApi = (e: FakeEle) => ({
    id: () => e.id,
    data: (key: string) => (key === "label" ? e.label : undefined),
    source: () => ({ id: () => e.source }),
    target: () => ({ id: () => e.target }),
    toggleClass: (c: string, on: boolean) => {
      if (on) {
        e.classes.add(c);
      } else {
        e.classes.delete(c);
      }
    },
    closedNeighborhood: () => ({ nodes: () => wrap(nodes) }),
  });

  return {
    elements: () => ({ removeClass: (c: string) => [...nodes, ...edges].forEach((e) => e.classes.delete(c)) }),
    nodes: () => wrap(nodes),
    edges: () => wrap(edges),
    getElementById: (id: string) => {
      const found = nodes.find((n) => n.id === id);
      return found ? nodeApi(found) : { nonempty: () => false, closedNeighborhood: () => ({ nodes: () => wrap([]) }) };
    },
    collection: () => wrap([]),
  } as unknown as import("cytoscape").Core;
}

describe("applyDim with SPARQL filter", () => {
  beforeEach(() => {
    setSearchQuery("");
    clearFocus();
    clearSparqlFilter();
  });

  it("dims everything outside the SPARQL match set when a filter is active", () => {
    const a = { id: "http://ex/A", label: "A", classes: new Set<string>() };
    const b = { id: "http://ex/B", label: "B", classes: new Set<string>() };
    const c = { id: "http://ex/C", label: "C", classes: new Set<string>() };
    const edgeAB = { id: "e1", source: "http://ex/A", target: "http://ex/B", classes: new Set<string>() };
    const cy = makeCy([a, b, c], [edgeAB]);

    setSparqlFilter(["http://ex/A", "http://ex/B"]);
    applyDim(cy);

    expect(a.classes.has("dimmed")).toBe(false);
    expect(b.classes.has("dimmed")).toBe(false);
    expect(c.classes.has("dimmed")).toBe(true);
    // Edge between two kept nodes stays visible.
    expect(edgeAB.classes.has("dimmed")).toBe(false);
  });

  it("intersects the SPARQL filter with the search query (AND semantics)", () => {
    const a = { id: "http://ex/Apple", label: "Apple", classes: new Set<string>() };
    const b = { id: "http://ex/Banana", label: "Banana", classes: new Set<string>() };
    const cy = makeCy([a, b], []);

    setSparqlFilter(["http://ex/Apple", "http://ex/Banana"]);
    setSearchQuery("apple");
    applyDim(cy);

    expect(a.classes.has("dimmed")).toBe(false);
    expect(b.classes.has("dimmed")).toBe(true);
  });

  it("clears all dimming once the SPARQL filter is cleared and no other filter is active", () => {
    const a = { id: "http://ex/A", label: "A", classes: new Set(["dimmed"]) };
    const cy = makeCy([a], []);

    clearSparqlFilter();
    applyDim(cy);

    expect(a.classes.has("dimmed")).toBe(false);
  });
});
