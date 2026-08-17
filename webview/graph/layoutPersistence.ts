import type { DocumentLayout, NodePosition } from "../../src/preview/layoutStore";
import type { ViewMode } from "../../src/shared/messages";

export function savedLayoutKey(mode: ViewMode, nodeId: string): string {
  return `${mode}:${nodeId}`;
}

export function viewportBecameRenderable(wasZeroSize: boolean, width: number, height: number): boolean {
  return wasZeroSize && width > 0 && height > 0;
}

export function restorationPlan(
  nodeIds: readonly string[],
  mode: ViewMode,
  layout: DocumentLayout,
): { positions: Map<string, NodePosition>; needsAutomaticLayout: boolean } {
  const positions = new Map<string, NodePosition>();
  for (const nodeId of nodeIds) {
    const position = layout[savedLayoutKey(mode, nodeId)];
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      positions.set(nodeId, { ...position });
    }
  }
  return { positions, needsAutomaticLayout: positions.size !== nodeIds.length };
}

export function collectViewPositions(
  mode: ViewMode,
  nodes: readonly { id: string; position: NodePosition }[],
): DocumentLayout {
  return Object.fromEntries(nodes.map((node) => [savedLayoutKey(mode, node.id), { ...node.position }]));
}
