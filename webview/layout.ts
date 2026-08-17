export type InspectorPlacement = "side" | "overlay" | "sheet";

// At 1024px a 328px side panel left too little room for readable graph cards.
// Keep the Inspector floating until a genuinely wide editor group is open.
const SIDE_INSPECTOR_MIN_WIDTH = 1280;
const OVERLAY_INSPECTOR_MIN_WIDTH = 640;

/**
 * Chooses how the details panel shares a VS Code editor group with the graph.
 * The medium layout floats over the canvas so the graph never collapses into
 * an unusably thin strip; the narrow layout becomes a bottom sheet.
 */
export function inspectorPlacementForWidth(width: number): InspectorPlacement {
  if (width >= SIDE_INSPECTOR_MIN_WIDTH) {
    return "side";
  }
  if (width >= OVERLAY_INSPECTOR_MIN_WIDTH) {
    return "overlay";
  }
  return "sheet";
}
