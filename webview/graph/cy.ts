import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import dagre from "cytoscape-dagre";
import { onThemeChange } from "../theme";
import { viewportBecameRenderable } from "./layoutPersistence";

cytoscape.use(fcose);
cytoscape.use(dagre);

export interface CyCallbacks {
  /** Single click: select (populate Inspector), does not touch the editor. */
  onNodeTap: (nodeId: string) => void;
  /** Single click on an edge: select the relation in the Inspector (schema view only). */
  onEdgeTap: (edgeId: string) => void;
  /** Double click: toggle focus mode on this node — see graph/focus.ts. */
  onNodeDoubleTap: (nodeId: string) => void;
  onNodeDragFree: (nodeId: string, x: number, y: number) => void;
  /** Tap on empty canvas: clear selection and focus mode. */
  onBackgroundTap: () => void;
  /** Resolves the stylesheet for whichever view is currently active. */
  getCurrentStyle: () => cytoscape.StylesheetStyle[];
  onZoom: (zoom: number) => void;
  /** Refit after a hidden/recreated webview receives a non-zero viewport. */
  onViewportReady: (cy: cytoscape.Core) => void;
}

/**
 * Constructs the single shared cytoscape instance and wires the Phase 1
 * rendering-bug fixes (zero-size-viewport recovery, theme re-resolution,
 * never-hidden container — see webview/style.css) plus the Phase 4 selection
 * gestures. There is deliberately only one cytoscape instance for the whole
 * panel lifetime, reused across the Schema/Triples toggle: a second
 * `display:none`-toggled instance would collapse to a 0x0 container and
 * reintroduce the exact bug Phase 1 fixed (`fit()` silently no-ops against a
 * zero-size viewport, stranding nodes off-screen with no automatic recovery).
 */
export function createCy(container: HTMLElement, stage: HTMLElement, callbacks: CyCallbacks): cytoscape.Core {
  const cy = cytoscape({
    container,
    style: callbacks.getCurrentStyle(),
    elements: [],
    minZoom: 0.35,
    maxZoom: 2.5,
  });

  cy.on("tap", "node", (evt) => callbacks.onNodeTap(evt.target.id()));
  cy.on("tap", "edge", (evt) => callbacks.onEdgeTap(evt.target.id()));
  cy.on("tap", (evt) => {
    if (evt.target === cy) {
      callbacks.onBackgroundTap();
    }
  });
  cy.on("dbltap", "node", (evt) => callbacks.onNodeDoubleTap(evt.target.id()));
  cy.on("dragfree", "node", (evt) => {
    const pos = evt.target.position();
    callbacks.onNodeDragFree(evt.target.id(), pos.x, pos.y);
  });
  cy.on("zoom", () => callbacks.onZoom(cy.zoom()));

  // #cy is never `display:none`d (see style.css), so this is a defensive
  // recovery path rather than the primary fix: if the panel is ever laid
  // out with a transient zero-size viewport (e.g. a tab restore mid-resize),
  // cytoscape's own resize observer calls cy.resize() but never re-fits —
  // fit() itself silently no-ops against a 0x0 container. The main renderer
  // owns its readable-fit policy, so this observer only resizes here. The
  // first nonzero tick also reapplies resolved theme colors: the stylesheet reads
  // `--vscode-*` at cytoscape-construction time, which can run before the
  // stylesheet `<link>` has finished applying, silently locking in the
  // hardcoded fallback colors with no later correction (onThemeChange only
  // fires on an actual theme *change*, not on "resolved late").
  let lastWasZeroSize = true;
  const resizeObserver = new ResizeObserver(() => {
    const rect = stage.getBoundingClientRect();
    const isZeroSize = rect.width === 0 || rect.height === 0;
    cy.resize();
    if (viewportBecameRenderable(lastWasZeroSize, rect.width, rect.height)) {
      cy.style(callbacks.getCurrentStyle());
      callbacks.onViewportReady(cy);
    }
    lastWasZeroSize = isZeroSize;
  });
  resizeObserver.observe(stage);

  onThemeChange(() => cy.style(callbacks.getCurrentStyle()));

  return cy;
}
