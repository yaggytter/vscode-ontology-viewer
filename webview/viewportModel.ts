export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.5;
export const DEFAULT_ZOOM = 1;

const NORMAL_READABLE_FLOOR = 0.8;
const LARGE_GRAPH_READABLE_FLOOR = 0.6;
const LARGE_GRAPH_THRESHOLD = 40;
const ZOOM_FACTOR = 1.2;

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * A literal fit-to-view can turn a useful graph into a thumbnail. Keep
 * ordinary ontologies at a readable floor and let the canvas pan instead.
 * Very large graphs get a little more room while still remaining legible.
 */
export function readableFitZoom(fittedZoom: number, nodeCount: number): number {
  const floor = nodeCount >= LARGE_GRAPH_THRESHOLD ? LARGE_GRAPH_READABLE_FLOOR : NORMAL_READABLE_FLOOR;
  return clampZoom(Math.max(fittedZoom, floor));
}

export function zoomStep(current: number, direction: "in" | "out"): number {
  return clampZoom(current * (direction === "in" ? ZOOM_FACTOR : 1 / ZOOM_FACTOR));
}

export function zoomLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}
