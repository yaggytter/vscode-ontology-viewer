import { describe, expect, it } from "vitest";
import { graphLayoutOptions } from "./layoutOptions";

describe("graphLayoutOptions", () => {
  it("gives card nodes enough room for relationship labels", () => {
    const options = graphLayoutOptions("fcose") as unknown as Record<string, unknown>;
    expect(options.fit).toBe(false);
    expect(options.idealEdgeLength).toBeGreaterThanOrEqual(140);
    expect(options.nodeSeparation).toBeGreaterThanOrEqual(70);
  });

  it("keeps hierarchical layouts spacious too", () => {
    const options = graphLayoutOptions("dagre", true) as unknown as Record<string, unknown>;
    expect(options.animate).toBe(true);
    expect(options.rankSep).toBeGreaterThanOrEqual(110);
    expect(options.nodeSep).toBeGreaterThanOrEqual(80);
  });
});
