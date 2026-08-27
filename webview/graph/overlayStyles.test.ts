import { describe, expect, it } from "vitest";
import type cytoscape from "cytoscape";
import { schemaStyle } from "./style";
import { tripleStyle } from "./tripleStyle";
import { overlayStyles } from "./overlayStyles";

function selectors(sheet: cytoscape.StylesheetStyle[]): string[] {
  return sheet.map((rule) => rule.selector);
}

describe("overlayStyles", () => {
  it("defines both the dim and the SPARQL-match selectors for nodes and edges", () => {
    expect(selectors(overlayStyles())).toEqual([
      "node.dimmed",
      "edge.dimmed",
      "node.sparql-match",
      "edge.sparql-match",
    ]);
  });

  /**
   * Regression: `sparql-match` was defined only in the schema stylesheet, so
   * highlighting a query result in the triples view applied a class with no
   * style behind it and appeared to do nothing.
   */
  it.each([
    ["schema", schemaStyle],
    ["triples", tripleStyle],
  ])("is included in the %s view stylesheet", (_name, style) => {
    const present = selectors(style());
    for (const selector of selectors(overlayStyles())) {
      expect(present).toContain(selector);
    }
  });
});
