import type cytoscape from "cytoscape";
import { COLOR_PALETTE_SIZE } from "../../src/rdf/appearance";
import { accessibleTextColor, cssVar, paletteColorFor, paletteSurfaceFor } from "../theme";
import { overlayStyles } from "./overlayStyles";

/**
 * Cytoscape stylesheet for the class-centric schema view. Three things carry
 * the model's honesty into pixels, deliberately:
 *  - `provenance !== "declared"` edges render dashed + dimmed, so an inferred
 *    relation (fallback-ladder rungs 2-5 in schemaModel.ts) never reads as
 *    something the document actually states.
 *  - `edgeLabel` already omits the cardinality badge for "unspecified"
 *    relations (see graph/elements.ts) — nothing extra to do here.
 *  - `subClassOf` edges use a distinct color/arrow so inheritance (a concept
 *    Ontology-Playground doesn't have) reads as visually different from an
 *    ordinary relation.
 */
export function schemaStyle(): cytoscape.StylesheetStyle[] {
  const nodeBackground = (ele: cytoscape.NodeSingular): string =>
    (ele.data("colorOverride") as string | null) ??
    paletteSurfaceFor(ele.data("colorIndex") as number, COLOR_PALETTE_SIZE);
  return [
    {
      selector: "node",
      style: {
        label: "data(displayLabel)",
        "text-valign": "center",
        "text-halign": "center",
        "background-color": nodeBackground,
        "border-color": (ele: cytoscape.NodeSingular) =>
          (ele.data("colorOverride") as string | null) ?? paletteColorFor(ele.data("colorIndex") as number, COLOR_PALETTE_SIZE),
        color: (ele: cytoscape.NodeSingular) =>
          accessibleTextColor(
            nodeBackground(ele),
            cssVar("--vscode-editor-background", "#1e1e1e"),
          ),
        "font-size": 14,
        "font-weight": 600,
        "text-wrap": "wrap",
        "text-max-width": "166px",
        width: 188,
        height: 68,
        padding: "10px",
        shape: "round-rectangle",
        "border-width": 2.5,
      },
    },
    {
      selector: "node[origin = 'skosConcept']",
      style: { shape: "ellipse" },
    },
    {
      selector: "node[origin = 'inferred']",
      style: { "border-style": "dashed", opacity: 0.85 },
    },
    {
      selector: "node.editable",
      style: { "border-width": 2 },
    },
    {
      selector: "node:selected",
      style: {
        "border-color": cssVar("--vscode-focusBorder", "#007fd4"),
        "border-width": 4,
      },
    },
    {
      // The pending source node while "Connect" (two-click relation
      // creation) mode is waiting for its second click.
      selector: "node.connect-source",
      style: { "border-color": cssVar("--vscode-focusBorder", "#007fd4"), "border-width": 3 },
    },
    {
      selector: "edge",
      style: {
        label: "data(edgeLabel)",
        "font-size": 12,
        "text-background-color": cssVar("--vscode-editor-background", "#1e1e1e"),
        "text-background-opacity": 0.92,
        "text-background-padding": "5px",
        color: cssVar("--vscode-descriptionForeground", "#999"),
        width: 2.2,
        // `--vscode-editorWidget-border` is tuned for subtle low-emphasis
        // borders and is nearly invisible against a dark editor background —
        // `--vscode-charts-lines` is the token VS Code themes actually define
        // for chart/graph line content, so it stays visible in both themes.
        "line-color": cssVar("--vscode-charts-lines", "#a0a0a0"),
        "target-arrow-color": cssVar("--vscode-charts-lines", "#a0a0a0"),
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 1,
        "loop-direction": (ele: cytoscape.EdgeSingular) => `${(ele.data("loopIndex") as number) * 45}deg`,
        "loop-sweep": "40deg",
      },
    },
    {
      selector: "edge:selected",
      style: {
        width: 3,
        "line-color": cssVar("--vscode-focusBorder", "#007fd4"),
        "target-arrow-color": cssVar("--vscode-focusBorder", "#007fd4"),
        color: cssVar("--vscode-editor-foreground", "#ccc"),
      },
    },
    {
      selector: "edge[kind = 'subClassOf']",
      style: {
        "line-color": cssVar("--vscode-charts-purple", "#b180d7"),
        "target-arrow-color": cssVar("--vscode-charts-purple", "#b180d7"),
        "target-arrow-shape": "triangle-tee",
        width: 2,
      },
    },
    {
      selector: "edge[kind = 'skosBroader']",
      style: {
        "line-color": cssVar("--vscode-charts-green", "#89d185"),
        "target-arrow-color": cssVar("--vscode-charts-green", "#89d185"),
      },
    },
    {
      selector: "edge[provenance != 'declared']",
      style: {
        "line-style": "dashed",
        opacity: 0.65,
      },
    },
    // Dim and SPARQL-match selectors are shared with the triples view — see
    // graph/overlayStyles.ts.
    ...overlayStyles(),
  ];
}
