import { describe, expect, it } from "vitest";
import { collectViewPositions, restorationPlan, viewportBecameRenderable } from "./layoutPersistence";

describe("restorationPlan", () => {
  const cache = {
    "schema:A": { x: 10, y: 20 },
    "schema:B": { x: 30, y: 40 },
    "triples:A": { x: 100, y: 200 },
  };

  it("skips automatic layout when every node has a saved position", () => {
    expect(restorationPlan(["A", "B"], "schema", cache)).toEqual({
      positions: new Map([
        ["A", { x: 10, y: 20 }],
        ["B", { x: 30, y: 40 }],
      ]),
      needsAutomaticLayout: false,
    });
  });

  it("keeps known nodes but requests layout for newly added nodes", () => {
    const plan = restorationPlan(["A", "C"], "schema", cache);
    expect(plan.positions).toEqual(new Map([["A", { x: 10, y: 20 }]]));
    expect(plan.needsAutomaticLayout).toBe(true);
  });

  it("never mixes schema and triples positions", () => {
    expect(restorationPlan(["A"], "triples", cache).positions.get("A")).toEqual({ x: 100, y: 200 });
  });

  it("ignores non-finite saved coordinates instead of restoring nodes off-canvas", () => {
    const plan = restorationPlan(["A"], "schema", {
      "schema:A": { x: Number.NaN, y: 20 },
    });
    expect(plan.positions.size).toBe(0);
    expect(plan.needsAutomaticLayout).toBe(true);
  });
});

describe("viewportBecameRenderable", () => {
  it("requests recovery when a hidden webview receives a usable viewport", () => {
    expect(viewportBecameRenderable(true, 900, 600)).toBe(true);
  });

  it("does not repeatedly recover ordinary non-zero resizes", () => {
    expect(viewportBecameRenderable(false, 900, 600)).toBe(false);
  });

  it("waits while either viewport dimension is zero", () => {
    expect(viewportBecameRenderable(true, 900, 0)).toBe(false);
  });
});

describe("collectViewPositions", () => {
  it("namespaces a completed layout for bulk persistence", () => {
    expect(
      collectViewPositions(
        "schema",
        [
          { id: "A", position: { x: 1, y: 2 } },
          { id: "B", position: { x: 3, y: 4 } },
        ],
      ),
    ).toEqual({ "schema:A": { x: 1, y: 2 }, "schema:B": { x: 3, y: 4 } });
  });
});
