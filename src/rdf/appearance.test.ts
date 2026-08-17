import { describe, expect, it } from "vitest";
import { DataFactory, type Quad } from "n3";
import {
  assignRelationalColorIndices,
  assignRelationalAppearance,
  colorOverrideFor,
  iconFor,
  iconOverrideFor,
} from "./appearance";

function circularDistance(a: number, b: number, size: number): number {
  const diff = Math.abs(a - b) % size;
  return Math.min(diff, size - diff);
}

function literalQuad(subject: string, predicate: string, value: string): Quad {
  return {
    termType: "Quad",
    subject: DataFactory.namedNode(subject),
    predicate: DataFactory.namedNode(predicate),
    object: DataFactory.literal(value),
    graph: DataFactory.defaultGraph(),
    equals: () => false,
  };
}

describe("iconFor", () => {
  it("matches whole tokens, not substrings — 'Classification' must not match the 'class' keyword", () => {
    expect(iconFor(["Classification"], "📦")).toBe("📦");
  });

  it("prefers the more specific rule over a more general one", () => {
    // "CheeseTopping" should hit the "cheese" rule (🧀), not the generic
    // "topping"/"food" rule (🍽️) that also matches.
    expect(iconFor(["CheeseTopping"], "📦")).toBe("🧀");
  });

  it("falls back to the provided default when nothing matches", () => {
    expect(iconFor(["Zzyzx"], "⬜")).toBe("⬜");
  });
});

describe("iconOverrideFor / colorOverrideFor — Ontology-Playground-style extensions", () => {
  const subject = "http://ex.org/Widget";

  it("accepts a short emoji icon regardless of the predicate's namespace", () => {
    const quads = [literalQuad(subject, "http://ex.org/doc#icon", "🔧")];
    expect(iconOverrideFor(quads, subject)).toBe("🔧");
  });

  it("rejects an icon value that looks like plain ASCII text", () => {
    const quads = [literalQuad(subject, "http://ex.org/doc#icon", "wrench")];
    expect(iconOverrideFor(quads, subject)).toBeUndefined();
  });

  it("accepts a validated #RRGGBB color", () => {
    const quads = [literalQuad(subject, "http://ex.org/doc#color", "#0078D4")];
    expect(colorOverrideFor(quads, subject)).toBe("#0078D4");
  });

  it("rejects a non-hex color value — this is a security boundary, not formatting", () => {
    const quads = [literalQuad(subject, "http://ex.org/doc#color", "javascript:alert(1)")];
    expect(colorOverrideFor(quads, subject)).toBeUndefined();
  });

  it("ignores an icon/color-named predicate from a known vocabulary namespace", () => {
    const quads = [literalQuad(subject, "http://www.w3.org/2000/01/rdf-schema#color", "#0078D4")];
    expect(colorOverrideFor(quads, subject)).toBeUndefined();
  });

  it("does not match a different subject's override", () => {
    const quads = [literalQuad("http://ex.org/OtherWidget", "http://ex.org/doc#icon", "🔧")];
    expect(iconOverrideFor(quads, subject)).toBeUndefined();
  });
});

describe("assignRelationalColorIndices", () => {
  it("assigns every entity an index in range [0, paletteSize)", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ];
    const result = assignRelationalColorIndices(ids, edges, 48);
    expect([...result.keys()].sort()).toEqual([...ids].sort());
    for (const index of result.values()) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(48);
    }
  });

  it("is deterministic — same ids/edges produce the same map every time", () => {
    const ids = ["Zebra", "Apple", "Mango"];
    const edges = [{ source: "Apple", target: "Mango" }];
    const first = assignRelationalColorIndices(ids, edges, 48);
    const second = assignRelationalColorIndices(ids, edges, 48);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it("within one connected component, entities closer in the graph get closer hues than entities many hops away", () => {
    // A five-node chain: A-B-C-D-E, all one component. DFS from the
    // alphabetically-first root visits it in exactly that order, so
    // hop-distance in the chain and order-distance within the component's
    // arc should track together.
    const ids = ["A", "B", "C", "D", "E"];
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
      { source: "D", target: "E" },
    ];
    const result = assignRelationalColorIndices(ids, edges, 48);
    const distAB = circularDistance(result.get("A")!, result.get("B")!, 48);
    const distAD = circularDistance(result.get("A")!, result.get("D")!, 48);
    expect(distAB).toBeLessThan(distAD);
  });

  it("keeps one connected component within a bounded arc of the wheel rather than spreading it across the whole circle", () => {
    // 8 entities in one big chain — the common real-world shape (e.g. a
    // class hierarchy hanging off one root, like neighborhood-garden.ttl). Without a
    // cap, spreading 8 entities over a 48-slot wheel would use 42 of the 48
    // slots (nearly the whole rainbow) with no visible "these are related"
    // grouping at all.
    const ids = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const edges = ids.slice(0, -1).map((id, i) => ({ source: id, target: ids[i + 1] }));
    const paletteSize = 48;
    const result = assignRelationalColorIndices(ids, edges, paletteSize);
    const indices = ids.map((id) => result.get(id)!);
    const spread = Math.max(...indices) - Math.min(...indices);
    expect(spread).toBeLessThanOrEqual(paletteSize / 3);
  });

  it("puts two different connected components on separated parts of the wheel, further apart than any pair within one component", () => {
    const ids = ["A", "B", "X", "Y"];
    const edges = [
      { source: "A", target: "B" },
      { source: "X", target: "Y" },
    ];
    const result = assignRelationalColorIndices(ids, edges, 48);
    const withinComponent = circularDistance(result.get("A")!, result.get("B")!, 48);
    const crossComponent = circularDistance(result.get("A")!, result.get("X")!, 48);
    expect(crossComponent).toBeGreaterThan(withinComponent);
  });

  it("handles a graph with no edges at all — every entity still gets a spread-out, valid index", () => {
    const ids = ["A", "B", "C"];
    const result = assignRelationalColorIndices(ids, [], 48);
    expect(result.size).toBe(3);
    expect(new Set(result.values()).size).toBe(3);
  });

  it("ignores edges referencing an id outside the given entity list, and self-loops", () => {
    const ids = ["A", "B"];
    const edges = [
      { source: "A", target: "Ghost" },
      { source: "A", target: "A" },
    ];
    const result = assignRelationalColorIndices(ids, edges, 48);
    expect(result.size).toBe(2);
  });
});

describe("assignRelationalAppearance", () => {
  it("reports deterministic one-based connection groups and their sizes", () => {
    const result = assignRelationalAppearance(
      ["B", "A", "Y", "X", "Solo"],
      [
        { source: "A", target: "B" },
        { source: "X", target: "Y" },
      ],
      48,
    );

    expect(result.get("A")).toMatchObject({ groupIndex: 1, groupCount: 3, groupSize: 2 });
    expect(result.get("B")).toMatchObject({ groupIndex: 1, groupCount: 3, groupSize: 2 });
    expect(result.get("Solo")).toMatchObject({ groupIndex: 2, groupCount: 3, groupSize: 1 });
    expect(result.get("X")).toMatchObject({ groupIndex: 3, groupCount: 3, groupSize: 2 });
  });
});
