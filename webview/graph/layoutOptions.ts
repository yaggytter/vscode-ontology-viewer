import type cytoscape from "cytoscape";

/** Layout defaults tuned for card-shaped nodes and readable edge labels. */
export function graphLayoutOptions(
  name: "fcose" | "dagre",
  animate = false,
): cytoscape.LayoutOptions {
  const common = {
    name,
    animate,
    animationDuration: animate ? 280 : undefined,
    fit: false,
    padding: 0,
  };

  if (name === "dagre") {
    return {
      ...common,
      nodeSep: 86,
      edgeSep: 34,
      rankSep: 118,
    } as cytoscape.LayoutOptions;
  }

  return {
    ...common,
    quality: "default",
    idealEdgeLength: 145,
    nodeRepulsion: 8_200,
    nodeSeparation: 76,
  } as cytoscape.LayoutOptions;
}
