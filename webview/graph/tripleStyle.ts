import type cytoscape from "cytoscape";
import { accessibleTextColor, cssVar } from "../theme";
import { overlayStyles } from "./overlayStyles";

/**
 * Cytoscape stylesheet for the raw subject/predicate/object triples view.
 *
 * Cytoscape draws to a `<canvas>` and cannot resolve CSS custom properties — a
 * raw `var(--vscode-*)` string is invalid input to it and silently falls back
 * to cytoscape's own defaults (this used to be the whole stylesheet). Every
 * color here is therefore resolved to a concrete value via `cssVar()` first,
 * and this function is re-invoked (and `cy.style()` reapplied) on theme change.
 *
 * Lives beside schemaStyle() rather than in main.ts so both view stylesheets
 * sit together and can share graph/overlayStyles.ts.
 */
export function tripleStyle(): cytoscape.StylesheetStyle[] {
  const editorBackground = cssVar("--vscode-editor-background", "#1e1e1e");
  const nodeColors = {
    default: cssVar("--vscode-charts-blue", "#3794ff"),
    class: cssVar("--vscode-charts-purple", "#b180d7"),
    property: cssVar("--vscode-charts-orange", "#d18616"),
    individual: cssVar("--vscode-charts-green", "#89d185"),
  };
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "background-color": nodeColors.default,
        color: accessibleTextColor(nodeColors.default, editorBackground),
        "font-size": 11,
        "text-wrap": "wrap",
        "text-max-width": "120px",
        width: "label",
        height: "label",
        padding: "8px",
        shape: "round-rectangle",
        "border-width": 1,
        "border-color": cssVar("--vscode-editorWidget-border", "#454545"),
      },
    },
    {
      selector: "node[kind = 'class']",
      style: { "background-color": nodeColors.class, color: accessibleTextColor(nodeColors.class, editorBackground) },
    },
    {
      selector: "node[kind = 'property']",
      style: { "background-color": nodeColors.property, color: accessibleTextColor(nodeColors.property, editorBackground) },
    },
    {
      selector: "node[kind = 'individual']",
      style: { "background-color": nodeColors.individual, color: accessibleTextColor(nodeColors.individual, editorBackground) },
    },
    {
      selector: "node.editable",
      style: { "border-style": "dashed", "border-width": 2 },
    },
    {
      selector: "edge",
      style: {
        label: "data(predicateLabel)",
        "font-size": 9,
        color: cssVar("--vscode-descriptionForeground", "#999"),
        width: 1.5,
        // `--vscode-editorWidget-border` is a subtle low-emphasis border
        // color that's nearly invisible in dark themes; `--vscode-charts-lines`
        // is the token themes define for chart/graph line content instead.
        "line-color": cssVar("--vscode-charts-lines", "#a0a0a0"),
        "target-arrow-color": cssVar("--vscode-charts-lines", "#a0a0a0"),
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    ...overlayStyles(),
  ];
}
