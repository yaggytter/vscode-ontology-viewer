import type cytoscape from "cytoscape";
import { cssVar } from "../theme";

/**
 * Selectors shared by every view's stylesheet.
 *
 * Both the schema and triples stylesheets need these, and they were previously
 * duplicated — with the result that `sparql-match` existed only in the schema
 * view, so a SPARQL highlight silently did nothing in the triples view even
 * though the class was being applied. Defining them once removes that whole
 * failure mode.
 *
 * Ownership:
 *  - `dimmed` belongs to graph/focus.ts's applyDim(); search, focus mode, and
 *    the SPARQL filter all express themselves through that single class.
 *  - `sparql-match` belongs to graph/sparqlHighlight.ts.
 */
export function overlayStyles(): cytoscape.StylesheetStyle[] {
  const accent = cssVar("--vscode-charts-yellow", "#e2c08d");
  return [
    { selector: "node.dimmed", style: { opacity: 0.15 } },
    { selector: "edge.dimmed", style: { opacity: 0.08 } },
    {
      selector: "node.sparql-match",
      style: {
        "border-color": accent,
        "border-width": 5,
        "overlay-color": accent,
        "overlay-opacity": 0.18,
        "overlay-padding": 6,
      },
    },
    {
      selector: "edge.sparql-match",
      style: {
        "line-color": accent,
        "target-arrow-color": accent,
        width: 4,
      },
    },
  ];
}
