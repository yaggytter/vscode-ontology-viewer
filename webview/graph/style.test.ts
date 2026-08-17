import { describe, expect, it } from "vitest";
import type cytoscape from "cytoscape";
import { schemaStyle } from "./style";

function fakeNode(data: Record<string, unknown>): cytoscape.NodeSingular {
  return { data: (key: string) => data[key] } as unknown as cytoscape.NodeSingular;
}

describe("schemaStyle", () => {
  it("uses a document color as the card background with readable text", () => {
    const nodeStyle = schemaStyle()[0].style as Record<string, unknown>;
    const node = fakeNode({ colorOverride: "#89d185", colorIndex: 0 });
    const background = nodeStyle["background-color"] as (element: cytoscape.NodeSingular) => string;
    const foreground = nodeStyle.color as (element: cytoscape.NodeSingular) => string;

    expect(background(node)).toBe("#89d185");
    expect(foreground(node)).toBe("#000000");
  });
});
