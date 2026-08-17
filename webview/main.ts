import type cytoscape from "cytoscape";
import type {
  HostToWebviewMessage,
  UiStrings,
  ViewMode,
  WebviewToHostMessage,
} from "../src/shared/messages";
import type { OntologyGraph, OntologyNode } from "../src/rdf/graphModel";
import type { PropertyType, SchemaModel } from "../src/rdf/schemaModel";
import type { DocumentLayout } from "../src/preview/layoutStore";
import { accessibleTextColor, cssVar } from "./theme";
import { createCy } from "./graph/cy";
import { schemaToElements } from "./graph/elements";
import { schemaStyle } from "./graph/style";
import { graphLayoutOptions } from "./graph/layoutOptions";
import { collectViewPositions, restorationPlan, savedLayoutKey } from "./graph/layoutPersistence";
import { applyDim, clearFocus, setSearchQuery, toggleFocusedNode } from "./graph/focus";
import { createSearchPanel, type SearchPanel } from "./panels/search";
import { renderStats } from "./panels/stats";
import { renderLegend } from "./panels/legend";
import { renderEmptySelection, renderEntitySelection, renderRelationSelection, renderUnattached } from "./panels/inspector";
import { showPromptForm } from "./panels/promptForm";
import { inspectorPlacementForWidth, type InspectorPlacement } from "./layout";
import type { SchemaSearchResult } from "./searchModel";
import { DEFAULT_ZOOM, readableFitZoom, zoomLabel, zoomStep } from "./viewportModel";

/**
 * Bumped whenever WebviewState's shape changes. A cached state written by an
 * older build of this extension must never be trusted blindly — see the
 * try/catch around the cache fast-path below. Bumped 2->3 for the schema
 * view (viewMode/schema fields, and layout keys now namespaced per view);
 * 3->4 for commentEditableNodeIds (Phase 5 comment editing); 4->5 for the
 * resetZoomLabel chrome string; 5->6 for persisted layout restoration.
 */
const STATE_VERSION = 6;

interface WebviewState {
  stateVersion: number;
  generation: number;
  graph: OntologyGraph;
  schema: SchemaModel;
  layoutCache: DocumentLayout;
  editableNodeIds: string[];
  commentEditableNodeIds: string[];
  isEditableDocument: boolean;
  algorithm: "fcose" | "dagre";
  viewMode: ViewMode;
  strings: UiStrings;
}

function saveState(state: Omit<WebviewState, "stateVersion">): void {
  vscode.setState({ ...state, stateVersion: STATE_VERSION });
}

const vscode = acquireVsCodeApi<WebviewState>();

function post(message: WebviewToHostMessage): void {
  vscode.postMessage(message);
}

const root = document.getElementById("app") as HTMLDivElement;
root.innerHTML = `
  <div id="banner" class="banner" hidden></div>
  <div id="toolbar" class="toolbar">
    <div class="toolbar-leading">
      <div id="view-toggle" class="view-toggle" role="group">
        <button id="view-schema" type="button" class="view-toggle-btn"></button>
        <button id="view-triples" type="button" class="view-toggle-btn"></button>
      </div>
      <div id="search-container" class="search-container"></div>
    </div>
    <div class="toolbar-actions">
      <div class="layout-control">
        <label id="layout-label" for="layout-select"></label>
        <select id="layout-select">
          <option value="fcose">fCoSE</option>
          <option value="dagre">Dagre</option>
        </select>
      </div>
      <button id="add-class-btn" type="button" class="toolbar-btn toolbar-btn-primary" hidden></button>
      <button id="connect-btn" type="button" class="toolbar-btn" hidden></button>
      <button id="inspector-toggle-btn" type="button" class="icon-btn inspector-toggle-btn" hidden>
        <span aria-hidden="true">◫</span>
      </button>
      <button id="export-png-btn" type="button" class="icon-btn">
        <span aria-hidden="true">⇩</span>
        <span id="export-png-label"></span>
      </button>
    </div>
  </div>
  <div id="body" class="body-row">
    <div id="stage">
      <div id="cy"></div>
      <div id="empty" class="empty" hidden></div>
      <div id="canvas-summary" class="canvas-summary" hidden>
        <strong id="canvas-title" class="canvas-title"></strong>
        <span id="canvas-meta" class="canvas-meta"></span>
      </div>
      <div id="connect-hint" class="connect-hint" hidden></div>
      <div id="graph-controls" class="graph-controls" role="group">
        <button id="zoom-out-btn" type="button" class="graph-control-btn">−</button>
        <button id="zoom-level-btn" type="button" class="graph-control-btn graph-zoom-readout" aria-live="polite">100%</button>
        <button id="zoom-in-btn" type="button" class="graph-control-btn">+</button>
        <span class="graph-control-separator" aria-hidden="true"></span>
        <button id="fit-btn" type="button" class="graph-control-btn">⛶</button>
        <button id="run-layout-btn" type="button" class="graph-control-btn">↻</button>
      </div>
    </div>
    <div id="inspector-scrim" class="inspector-scrim" hidden></div>
    <aside id="inspector" class="inspector">
      <div class="inspector-toolbar">
        <div>
          <div class="inspector-eyebrow">Ontology</div>
          <h2 id="inspector-heading"></h2>
        </div>
        <button id="inspector-close-btn" type="button" class="icon-btn inspector-close-btn">×</button>
      </div>
      <section class="overview-card">
        <h3 id="overview-heading"></h3>
        <div id="inspector-stats"></div>
      </section>
      <div id="inspector-selection"></div>
      <div id="inspector-unattached"></div>
      <div id="inspector-legend"></div>
    </aside>
  </div>
  <div id="toast" class="toast" hidden></div>
`;

const banner = document.getElementById("banner") as HTMLDivElement;
const layoutLabel = document.getElementById("layout-label") as HTMLLabelElement;
const layoutSelect = document.getElementById("layout-select") as HTMLSelectElement;
const viewSchemaBtn = document.getElementById("view-schema") as HTMLButtonElement;
const viewTriplesBtn = document.getElementById("view-triples") as HTMLButtonElement;
const addClassBtn = document.getElementById("add-class-btn") as HTMLButtonElement;
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const inspectorToggleBtn = document.getElementById("inspector-toggle-btn") as HTMLButtonElement;
const inspectorCloseBtn = document.getElementById("inspector-close-btn") as HTMLButtonElement;
const connectHintEl = document.getElementById("connect-hint") as HTMLDivElement;
const exportPngBtn = document.getElementById("export-png-btn") as HTMLButtonElement;
const exportPngLabel = document.getElementById("export-png-label") as HTMLSpanElement;
const searchContainer = document.getElementById("search-container") as HTMLDivElement;
const stage = document.getElementById("stage") as HTMLDivElement;
const cyContainer = document.getElementById("cy") as HTMLDivElement;
const emptyEl = document.getElementById("empty") as HTMLDivElement;
const canvasSummaryEl = document.getElementById("canvas-summary") as HTMLDivElement;
const canvasTitleEl = document.getElementById("canvas-title") as HTMLElement;
const canvasMetaEl = document.getElementById("canvas-meta") as HTMLElement;
const inspectorScrimEl = document.getElementById("inspector-scrim") as HTMLDivElement;
const inspectorEl = document.getElementById("inspector") as HTMLDivElement;
const inspectorHeadingEl = document.getElementById("inspector-heading") as HTMLHeadingElement;
const overviewHeadingEl = document.getElementById("overview-heading") as HTMLHeadingElement;
const inspectorSelectionEl = document.getElementById("inspector-selection") as HTMLDivElement;
const inspectorUnattachedEl = document.getElementById("inspector-unattached") as HTMLDivElement;
const inspectorStatsEl = document.getElementById("inspector-stats") as HTMLDivElement;
const inspectorLegendEl = document.getElementById("inspector-legend") as HTMLDivElement;
const graphControlsEl = document.getElementById("graph-controls") as HTMLDivElement;
const zoomInBtn = document.getElementById("zoom-in-btn") as HTMLButtonElement;
const zoomOutBtn = document.getElementById("zoom-out-btn") as HTMLButtonElement;
const zoomLevelBtn = document.getElementById("zoom-level-btn") as HTMLButtonElement;
const fitBtn = document.getElementById("fit-btn") as HTMLButtonElement;
const runLayoutBtn = document.getElementById("run-layout-btn") as HTMLButtonElement;
const toastEl = document.getElementById("toast") as HTMLDivElement;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(text: string): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 4000);
}

let cy: cytoscape.Core | undefined;
let searchPanel: SearchPanel | undefined;
let editableIds = new Set<string>();
let commentEditableIds = new Set<string>();
let strings: UiStrings | undefined;
let isEditableDocument = false;
let lastRenderedGeneration = -1;
let requestSeq = 0;
const pendingEdits = new Map<string, { nodeId: string; previousLabel: string }>();
/** requestId -> the IRI a deleteDeclaration was sent for, so a failure can jump the user to it rather than leaving them stuck. */
const pendingDeletes = new Map<string, string>();

let viewMode: ViewMode = "schema";
let lastRenderedMode: ViewMode | undefined;
let lastGraph: OntologyGraph = { nodes: [], edges: [] };
let lastSchema: SchemaModel = { entities: [], relations: [], unattachedProperties: [], isEmpty: true };
/** Saved node positions, keyed by `layoutKey(viewMode, nodeId)` — see WebviewToHostNodeMoved for why. */
let layoutCache: DocumentLayout = {};

type Selection = { kind: "entity"; id: string } | { kind: "relation"; id: string } | undefined;
let selection: Selection;
let inspectorOpen = true;
let inspectorPlacement: InspectorPlacement | undefined;

// "Connect" mode: two-click relation creation. Chosen over a
// drag-to-connect gesture (e.g. cytoscape-edgehandles) — see DevPlan.md —
// because it works in a narrow docked panel and is reachable without a
// precise drag.
let connectModeActive = false;
let connectPendingSource: string | undefined;
/** Set from a successful addClass/addRelation editResult; consumed by the next 'update' to auto-select the new entity/relation. */
let pendingNewSelection: string | undefined;

function updateInspectorVisibility(): void {
  root.classList.toggle("inspector-closed", !inspectorOpen);
  inspectorToggleBtn.setAttribute("aria-expanded", String(inspectorOpen));
  const showScrim = inspectorOpen && inspectorPlacement !== "side" && !inspectorEl.hidden;
  inspectorScrimEl.hidden = !showScrim;
  requestAnimationFrame(() => {
    cy?.resize();
  });
}

function setInspectorOpen(open: boolean): void {
  inspectorOpen = open;
  updateInspectorVisibility();
}

function applyResponsiveLayout(): void {
  const nextPlacement = inspectorPlacementForWidth(root.clientWidth || window.innerWidth);
  const placementChanged = nextPlacement !== inspectorPlacement;
  inspectorPlacement = nextPlacement;
  root.dataset.inspectorPlacement = nextPlacement;

  if (placementChanged) {
    if (nextPlacement === "side") {
      inspectorOpen = true;
    } else if (!selection) {
      inspectorOpen = false;
    }
  }
  updateInspectorVisibility();
}

function focusSearchResult(result: SchemaSearchResult): void {
  if (!cy) {
    return;
  }

  cy.elements().unselect();
  if (result.kind === "relation") {
    const edge = cy.getElementById(result.id);
    if (edge.nonempty()) {
      edge.select();
      selection = { kind: "relation", id: result.id };
      fitReadable(cy, edge.connectedNodes().union(edge), 80);
    }
  } else {
    const entityId = result.ownerId ?? result.id;
    const node = cy.getElementById(entityId);
    if (node.nonempty()) {
      node.select();
      selection = { kind: "entity", id: entityId };
      cy.center(node);
      cy.zoom(Math.min(1.35, Math.max(cy.zoom(), 1)));
    }
  }
  updateInspectorSelection();
  setInspectorOpen(true);
}

function installSearch(nextStrings: UiStrings): void {
  searchPanel = createSearchPanel(nextStrings, {
    onQueryChange: () => cy && applyDim(cy),
    onSelect: focusSearchResult,
  });
  searchPanel.updateSchema(lastSchema);
  searchContainer.replaceChildren(searchPanel.element);
}

function configureChrome(nextStrings: UiStrings): void {
  layoutLabel.textContent = nextStrings.layoutSelectLabel;
  viewSchemaBtn.textContent = nextStrings.schemaViewLabel;
  viewTriplesBtn.textContent = nextStrings.triplesViewLabel;
  addClassBtn.textContent = nextStrings.addClassLabel;
  connectBtn.textContent = nextStrings.connectLabel;
  exportPngLabel.textContent = nextStrings.exportPngLabel;
  inspectorHeadingEl.textContent = nextStrings.detailsLabel;
  overviewHeadingEl.textContent = nextStrings.overviewLabel;
  inspectorToggleBtn.setAttribute("aria-label", nextStrings.showDetailsLabel);
  inspectorToggleBtn.title = nextStrings.showDetailsLabel;
  inspectorCloseBtn.setAttribute("aria-label", nextStrings.closeDetailsLabel);
  inspectorCloseBtn.title = nextStrings.closeDetailsLabel;
  graphControlsEl.setAttribute("aria-label", nextStrings.graphControlsLabel);
  zoomInBtn.setAttribute("aria-label", nextStrings.zoomInLabel);
  zoomInBtn.title = nextStrings.zoomInLabel;
  zoomOutBtn.setAttribute("aria-label", nextStrings.zoomOutLabel);
  zoomOutBtn.title = nextStrings.zoomOutLabel;
  zoomLevelBtn.setAttribute("aria-label", nextStrings.resetZoomLabel);
  zoomLevelBtn.title = nextStrings.resetZoomLabel;
  fitBtn.setAttribute("aria-label", nextStrings.fitViewLabel);
  fitBtn.title = nextStrings.fitViewLabel;
  runLayoutBtn.setAttribute("aria-label", nextStrings.runLayoutLabel);
  runLayoutBtn.title = nextStrings.runLayoutLabel;
  exportPngBtn.setAttribute("aria-label", nextStrings.exportPngLabel);
  exportPngBtn.title = nextStrings.exportPngLabel;
  emptyEl.textContent = nextStrings.emptyGraph;
  installSearch(nextStrings);
}

function currentStyleFn(mode: ViewMode): cytoscape.StylesheetStyle[] {
  return mode === "schema" ? schemaStyle() : tripleStyle();
}

/**
 * Cytoscape draws to a `<canvas>` and cannot resolve CSS custom properties —
 * a raw `var(--vscode-*)` string is invalid input to it and silently falls
 * back to cytoscape's own defaults (this used to be the whole stylesheet).
 * Every color here is resolved to a concrete value via `cssVar()` first, and
 * this function is re-invoked (and `cy.style()` reapplied) on theme change.
 */
function tripleStyle(): cytoscape.StylesheetStyle[] {
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
    { selector: "node.dimmed", style: { opacity: 0.15 } },
    { selector: "edge.dimmed", style: { opacity: 0.08 } },
  ];
}

function toElements(graph: OntologyGraph): cytoscape.ElementDefinition[] {
  const nodes: cytoscape.ElementDefinition[] = graph.nodes.map((n: OntologyNode) => ({
    data: { id: n.id, label: n.label, kind: n.kind, comment: n.comment ?? "" },
    classes: editableIds.has(n.id) ? "editable" : "",
  }));
  const edges: cytoscape.ElementDefinition[] = graph.edges.map((e) => ({
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      predicateLabel: e.predicateLabel,
    },
  }));
  return [...nodes, ...edges];
}

function ensureCy(): cytoscape.Core {
  if (cy) {
    return cy;
  }
  cy = createCy(cyContainer, stage, {
    getCurrentStyle: () => currentStyleFn(viewMode),
    onZoom: (zoom) => {
      zoomLevelBtn.textContent = zoomLabel(zoom);
    },
    onViewportReady: (instance) => {
      // A restored webview is initially measured at 0x0. The earlier fit is
      // therefore a no-op, so repeat it once Cytoscape has a real canvas.
      fitReadable(instance, instance.elements(), 40);
    },
    onNodeTap: (nodeId) => {
      if (connectModeActive) {
        handleConnectClick(nodeId);
        return;
      }
      if (lastRenderedMode === "schema") {
        cy?.elements().unselect();
        cy?.getElementById(nodeId).select();
        selection = { kind: "entity", id: nodeId };
        updateInspectorSelection();
        setInspectorOpen(true);
      } else {
        post({ type: "jumpToNode", nodeId });
      }
    },
    onEdgeTap: (edgeId) => {
      if (lastRenderedMode === "schema" && !connectModeActive) {
        cy?.elements().unselect();
        cy?.getElementById(edgeId).select();
        selection = { kind: "relation", id: edgeId };
        updateInspectorSelection();
        setInspectorOpen(true);
      }
    },
    onNodeDoubleTap: (nodeId) => {
      if (connectModeActive) {
        return;
      }
      toggleFocusedNode(nodeId);
      if (cy) {
        applyDim(cy);
      }
    },
    onNodeDragFree: (nodeId, x, y) => {
      const renderedMode = lastRenderedMode ?? viewMode;
      layoutCache[savedLayoutKey(renderedMode, nodeId)] = { x, y };
      post({ type: "nodeMoved", nodeId, x, y, viewMode: renderedMode });
      saveLayoutCacheState();
    },
    onBackgroundTap: () => {
      if (connectModeActive) {
        cancelConnectPending();
        return;
      }
      selection = undefined;
      cy?.elements().unselect();
      clearFocus();
      updateInspectorSelection();
      if (inspectorPlacement !== "side") {
        setInspectorOpen(false);
      }
      if (cy) {
        applyDim(cy);
      }
    },
  });
  return cy;
}

/**
 * Fits the graph without turning normal-sized ontologies into thumbnails.
 * When the literal fit falls below the readable floor, the graph remains
 * centered and the user pans through it at a useful scale.
 */
function fitReadable(
  instance: cytoscape.Core,
  elements: cytoscape.CollectionReturnValue = instance.elements(),
  padding = 52,
): void {
  if (elements.empty()) {
    return;
  }
  instance.fit(elements, padding);
  const readableZoom = readableFitZoom(instance.zoom(), instance.nodes().length);
  if (readableZoom > instance.zoom()) {
    instance.zoom(readableZoom);
    instance.center(elements);
  }
}

function cancelConnectPending(): void {
  connectPendingSource = undefined;
  cy?.nodes(".connect-source").removeClass("connect-source");
  updateConnectUi();
}

function updateConnectUi(): void {
  connectBtn.setAttribute("aria-pressed", String(connectModeActive));
  if (!connectModeActive || !strings) {
    connectHintEl.hidden = true;
    return;
  }
  connectHintEl.hidden = false;
  connectHintEl.textContent = connectPendingSource === undefined ? strings.connectHintPickSource : strings.connectHintPickTarget;
}

function handleConnectClick(nodeId: string): void {
  if (!strings) {
    return;
  }
  if (connectPendingSource === undefined) {
    connectPendingSource = nodeId;
    cy?.getElementById(nodeId).addClass("connect-source");
    updateConnectUi();
    return;
  }
  const sourceId = connectPendingSource;
  cancelConnectPending();
  showPromptForm({
    label: strings.promptRelationNameLabel,
    okLabel: strings.okLabel,
    cancelLabel: strings.cancelLabel,
    onSubmit: (name) => {
      const requestId = `edit-${++requestSeq}`;
      post({ type: "addRelation", requestId, sourceIri: sourceId, targetIri: nodeId, name });
    },
  });
}

/** The Inspector's name field is the only caller — renaming lives there now, not on the graph itself. */
function requestRename(nodeId: string, previousLabel: string, newLabel: string): void {
  const requestId = `edit-${++requestSeq}`;
  pendingEdits.set(requestId, { nodeId, previousLabel });
  post({ type: "editLabel", requestId, nodeId, newLabel });
}

/**
 * Runs one layout pass over the current triples elements, protecting any
 * node with a saved position from the algorithm before restoring and fitting
 * the resulting mixed saved/automatic layout.
 */
function saveLayoutCacheState(): void {
  const prior = vscode.getState();
  if (prior) {
    saveState({ ...prior, layoutCache });
  }
}

function persistCurrentPositions(instance: cytoscape.Core, mode: ViewMode): void {
  const completedLayout = collectViewPositions(
    mode,
    instance.nodes().map((node) => ({ id: node.id(), position: { ...node.position() } })),
  );
  layoutCache = { ...layoutCache, ...completedLayout };
  post({ type: "layoutChanged", layout: completedLayout });
  saveLayoutCacheState();
}

function runLayoutPass(
  instance: cytoscape.Core,
  mode: ViewMode,
  algorithm: "fcose" | "dagre",
  knownPositions: Map<string, cytoscape.Position>,
  animate = false,
): void {
  const knownNodes = instance.nodes().filter((node) => knownPositions.has(node.id()));
  knownNodes.forEach((node) => {
    node.position(knownPositions.get(node.id()) as cytoscape.Position);
  });
  knownNodes.lock();

  instance.one("layoutstop", () => {
    knownNodes.unlock();
    knownNodes.forEach((node) => {
      node.position(knownPositions.get(node.id()) as cytoscape.Position);
    });
    fitReadable(instance, instance.elements(), 40);
    persistCurrentPositions(instance, mode);
  });
  instance.layout(graphLayoutOptions(algorithm, animate)).run();
}

function restoreOrLayout(instance: cytoscape.Core, mode: ViewMode, algorithm: "fcose" | "dagre"): void {
  const plan = restorationPlan(instance.nodes().map((node) => node.id()), mode, layoutCache);
  plan.positions.forEach((position, nodeId) => instance.getElementById(nodeId).position(position));
  if (!plan.needsAutomaticLayout) {
    instance.layout({ name: "preset", fit: false }).run();
    fitReadable(instance, instance.elements(), 40);
    return;
  }
  runLayoutPass(instance, mode, algorithm, plan.positions);
}

function applyTriplesGraph(graph: OntologyGraph, algorithm: "fcose" | "dagre", isInitial: boolean): void {
  const instance = ensureCy();
  // Mirrors applySchemaGraph's instance.style(schemaStyle()) below — without
  // this, switching from Schema to Triples view left the cytoscape instance
  // on schemaStyle()'s stylesheet (last explicitly set by applySchemaGraph),
  // whose edge selector labels from `edgeLabel` (triples edges carry
  // `predicateLabel`) and dashes/dims anything without `provenance ===
  // "declared"` (triples edges have no `provenance` field at all).
  instance.style(tripleStyle());

  if (isInitial) {
    instance.elements().remove();
    instance.add(toElements(graph));
    restoreOrLayout(instance, "triples", algorithm);
    // Cytoscape can leave newly-added Triples edges unpainted on its first
    // synchronous layout. A preset pass on the next frame invalidates the
    // renderer without changing the positions that were just restored or
    // calculated. This intentionally mirrors the pre-persistence recovery.
    requestAnimationFrame(() => {
      if (cy !== instance || lastRenderedMode !== "triples") {
        return;
      }
      instance.resize();
      instance.style(tripleStyle());
      instance.layout({ name: "preset", fit: false }).run();
      fitReadable(instance, instance.elements(), 40);
    });
  } else {
    const existingIds = new Set(instance.nodes().map((n) => n.id()));
    const nextIds = new Set(graph.nodes.map((n) => n.id));

    instance.nodes().forEach((n) => {
      if (!nextIds.has(n.id())) {
        n.remove();
      }
    });
    instance.edges().forEach((e) => {
      if (!graph.edges.some((ge) => ge.id === e.id())) {
        e.remove();
      }
    });

    const stationary = instance.nodes();
    stationary.lock();

    const newElements = toElements(graph).filter(
      (el) => !el.data.source && !existingIds.has(el.data.id as string),
    );
    instance.add(newElements);
    // Refresh data on nodes/edges that already existed (label/kind/comment may have changed).
    graph.nodes.forEach((n) => {
      const el = instance.getElementById(n.id);
      if (el.nonempty()) {
        el.data({ label: n.label, kind: n.kind, comment: n.comment ?? "" });
        el.toggleClass("editable", editableIds.has(n.id));
      }
    });
    graph.edges.forEach((e) => {
      if (!instance.getElementById(e.id).nonempty()) {
        instance.add({ data: { id: e.id, source: e.source, target: e.target, predicateLabel: e.predicateLabel } });
      }
    });

    const freshNodes = instance.nodes().filter((n) => !existingIds.has(n.id()));
    stationary.unlock();
    if (freshNodes.length > 0) {
      restoreOrLayout(instance, "triples", algorithm);
    }
  }

  // #cy is deliberately never hidden (see style.css) — a hidden/display:none
  // container collapses to 0x0, which makes cytoscape's `fit()` silently
  // no-op and strands nodes off-screen with no automatic recovery (bug #2).
  // "Nothing to show" is expressed purely by the #empty overlay on top.
  emptyEl.hidden = graph.nodes.length > 0;
}

/**
 * Schema view is a clear+rebuild rather than the triples view's incremental
 * patch — the schema model is derived (entities/relations are synthesized,
 * not 1:1 with source nodes), so diffing it against the previous render buys
 * little and risks subtly wrong patches. But a *full* rebuild on every
 * refresh (every debounced document edit) would re-run the layout and reset
 * the camera while the user is mid-edit, which is worse than the bug Phase 1
 * fixed. So: capture every node's current on-screen position before
 * clearing, restore it after (falling back to `layoutCache` for a node seen
 * for the first time), and only re-run `layout()`/`fit()` when the node set
 * actually changed — an untouched refresh is visually a no-op.
 */
function applySchemaGraph(schema: SchemaModel, algorithm: "fcose" | "dagre"): void {
  const instance = ensureCy();
  instance.style(schemaStyle());

  const previousPositions = new Map(instance.nodes().map((n) => [n.id(), { ...n.position() }]));
  instance.elements().remove();
  instance.add(schemaToElements(schema, editableIds));

  const hasNewNodes = instance.nodes().filter((n) => !previousPositions.has(n.id())).length > 0;

  const savedPlan = restorationPlan(instance.nodes().map((node) => node.id()), "schema", layoutCache);
  const knownPositions = new Map(previousPositions);
  savedPlan.positions.forEach((position, nodeId) => knownPositions.set(nodeId, position));
  knownPositions.forEach((position, nodeId) => instance.getElementById(nodeId).position(position));

  if (hasNewNodes) {
    if (!savedPlan.needsAutomaticLayout) {
      instance.layout({ name: "preset", fit: false }).run();
      fitReadable(instance, instance.elements(), 40);
    } else {
      runLayoutPass(instance, "schema", algorithm, knownPositions);
    }
  }

  emptyEl.hidden = schema.entities.length > 0;
}

function updateInspectorSelection(): void {
  if (!strings) {
    return;
  }
  const callbacks = {
    onRevealInSource: (iri: string) => post({ type: "jumpToNode", nodeId: iri }),
    onRename: (entityId: string, newName: string) => {
      const previousLabel = (cy?.getElementById(entityId).data("label") as string | undefined) ?? newName;
      requestRename(entityId, previousLabel, newName);
      if (cy) {
        cy.getElementById(entityId).data("label", newName); // optimistic
      }
    },
    onEditComment: (entityId: string, newComment: string) => {
      const requestId = `edit-${++requestSeq}`;
      post({ type: "editComment", requestId, subjectIri: entityId, newComment });
    },
    onCommentClearUnsupported: () => {
      if (strings) {
        showToast(strings.commentClearUnsupported);
      }
    },
    onUpdatePropertyType: (propertyIri: string, propertyType: PropertyType) => {
      const requestId = `edit-${++requestSeq}`;
      post({ type: "updatePropertyType", requestId, propertyIri, propertyType });
    },
    onAddProperty: (entityId: string) => {
      if (!strings) {
        return;
      }
      showPromptForm({
        label: strings.promptPropertyNameLabel,
        okLabel: strings.okLabel,
        cancelLabel: strings.cancelLabel,
        onSubmit: (name) => {
          const requestId = `edit-${++requestSeq}`;
          post({ type: "addProperty", requestId, entityIri: entityId, name, propertyType: "string" });
        },
      });
    },
    onDeleteDeclaration: (iri: string) => {
      const requestId = `edit-${++requestSeq}`;
      pendingDeletes.set(requestId, iri);
      post({ type: "deleteDeclaration", requestId, iri });
    },
  };

  if (selection?.kind === "entity") {
    const entity = lastSchema.entities.find((e) => e.id === selection?.id);
    if (entity) {
      renderEntitySelection(inspectorSelectionEl, strings, lastSchema, entity, callbacks, commentEditableIds.has(entity.id));
      return;
    }
  } else if (selection?.kind === "relation") {
    const relation = lastSchema.relations.find((r) => r.id === selection?.id);
    if (relation) {
      renderRelationSelection(inspectorSelectionEl, strings, lastSchema, relation, callbacks);
      return;
    }
  }
  renderEmptySelection(inspectorSelectionEl, strings);
}

function updateInspectorPanels(): void {
  if (!strings) {
    return;
  }
  renderUnattached(inspectorUnattachedEl, strings, lastSchema, {
    onRevealInSource: (iri: string) => post({ type: "jumpToNode", nodeId: iri }),
  });
  renderStats(inspectorStatsEl, strings, lastSchema);
  renderLegend(inspectorLegendEl, strings, lastSchema);
}

function updateCanvasSummary(effectiveMode: ViewMode): void {
  if (!strings || effectiveMode !== "schema" || lastSchema.entities.length === 0) {
    canvasSummaryEl.hidden = true;
    return;
  }
  canvasTitleEl.textContent = lastSchema.title?.trim() || strings.schemaViewLabel;
  canvasMetaEl.textContent = `${lastSchema.entities.length} ${strings.entitiesLabel}  ·  ${lastSchema.relations.length} ${strings.relationsLabel}`;
  canvasSummaryEl.hidden = false;
}

/**
 * `schema.isEmpty` (e.g. a SKOS taxonomy with zero owl:Class before the
 * schemaModel fallback kicks in — or a document with genuinely no classes at
 * all) falls back to the triples view rather than showing a blank canvas
 * under a "Schema" label. `viewMode` itself is left alone — the toggle still
 * shows "Schema" as the user's selection, and the banner explains why the
 * triples view is what's actually on screen. The Inspector is schema-only
 * (its content — properties/relations/instance counts — doesn't map onto
 * the raw triple graph), so it collapses whenever the triples view is what's
 * actually rendered.
 */
function render(
  graph: OntologyGraph,
  schema: SchemaModel,
  algorithm: "fcose" | "dagre",
  parseErrorMessage: string | undefined,
): void {
  const effectiveMode: ViewMode = viewMode === "schema" && schema.isEmpty ? "triples" : viewMode;
  const forceFullRebuild = effectiveMode !== lastRenderedMode;

  if (effectiveMode === "schema") {
    applySchemaGraph(schema, algorithm);
  } else {
    applyTriplesGraph(graph, algorithm, forceFullRebuild);
  }
  lastRenderedMode = effectiveMode;

  viewSchemaBtn.setAttribute("aria-pressed", String(viewMode === "schema"));
  viewTriplesBtn.setAttribute("aria-pressed", String(viewMode === "triples"));
  inspectorEl.hidden = effectiveMode !== "schema";
  inspectorToggleBtn.hidden = effectiveMode !== "schema";
  graphControlsEl.hidden = effectiveMode === "schema" ? schema.entities.length === 0 : graph.nodes.length === 0;
  searchPanel?.updateSchema(schema);
  updateCanvasSummary(effectiveMode);
  updateInspectorVisibility();

  // Write-back affordances only make sense against the schema view of an
  // editable document. Leaving connect mode active while the toolbar button
  // that started it disappears would strand the user mid-gesture.
  const showWriteControls = effectiveMode === "schema" && isEditableDocument;
  addClassBtn.hidden = !showWriteControls;
  connectBtn.hidden = !showWriteControls;
  if (!showWriteControls && connectModeActive) {
    connectModeActive = false;
    cancelConnectPending();
  }

  if (cy) {
    applyDim(cy);
  }

  if (strings) {
    updateBanner(strings, isEditableDocument, parseErrorMessage, viewMode === "schema" && schema.isEmpty);
    if (effectiveMode === "schema") {
      updateInspectorSelection();
      updateInspectorPanels();
    }
  }
}

function switchViewMode(mode: ViewMode): void {
  if (mode === viewMode || !strings) {
    // No `strings` yet means `init` hasn't landed (or the cache restore
    // failed) — there's nothing coherent to render or persist yet.
    return;
  }
  viewMode = mode;
  // Search/focus are per-view: a schema-view query left active would
  // otherwise silently dim most of the (unrelated) triples graph on arrival
  // while the search box still shows the old text.
  setSearchQuery("");
  searchPanel?.setValue("");
  clearFocus();
  selection = undefined;
  render(lastGraph, lastSchema, layoutSelect.value as "fcose" | "dagre", undefined);
  saveState({
    generation: lastRenderedGeneration,
    graph: lastGraph,
    schema: lastSchema,
    layoutCache,
    editableNodeIds: [...editableIds],
    commentEditableNodeIds: [...commentEditableIds],
    isEditableDocument,
    algorithm: layoutSelect.value as "fcose" | "dagre",
    viewMode,
    strings,
  });
}

/**
 * Renders the banner from whichever of "parse error" / "read-only format" /
 * "schema view has nothing to show" / "nothing to say" applies, in that
 * priority order. A parse error masking itself as an empty ontology (bug #6)
 * was a real, silent failure mode — this is the only place `parseErrorMessage`
 * is read, so it must always be consulted here, on every init AND every update.
 */
function updateBanner(
  s: UiStrings,
  editable: boolean,
  parseErrorMessage: string | undefined,
  schemaEmptyFallback: boolean,
): void {
  banner.replaceChildren();
  if (parseErrorMessage) {
    banner.hidden = false;
    banner.textContent = s.parseError;
    return;
  }
  if (!editable) {
    banner.hidden = false;
    banner.textContent = s.readOnlyBanner;
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = s.convertToTurtle;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      post({ type: "convertToTurtle" });
    });
    banner.appendChild(document.createTextNode(" "));
    banner.appendChild(link);
    return;
  }
  if (schemaEmptyFallback) {
    banner.hidden = false;
    banner.textContent = s.schemaEmptyBanner;
    return;
  }
  banner.hidden = true;
}

function exportPng(): void {
  if (!cy) {
    return;
  }
  const dataUri = cy.png({
    output: "base64uri",
    bg: cssVar("--vscode-editor-background", "#1e1e1e"),
    full: true,
  });
  post({ type: "exportPng", dataUri });
}

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  const message = event.data;

  if (message.type === "init") {
    // 'init' is the authoritative full snapshot sent in direct response to
    // our own 'ready' — it must never be droppable by a generation guard.
    // (The guard below exists only to stop a stale cached-state fast path
    // from clobbering a newer 'update'; applying it to 'init' too would
    // mean a bad lastRenderedGeneration permanently pins the panel to a
    // stale graph with no error shown — precisely the failure class bug #4
    // just eliminated.)
    lastRenderedGeneration = message.generation;
    strings = message.strings;
    isEditableDocument = message.isEditableDocument;
    editableIds = new Set(message.editableNodeIds);
    commentEditableIds = new Set(message.commentEditableNodeIds);
    viewMode = message.defaultViewMode;
    lastGraph = message.graph;
    lastSchema = message.schema;
    layoutCache = message.layout;
    selection = undefined;
    layoutSelect.value = message.defaultLayoutAlgorithm;
    configureChrome(strings);
    applyResponsiveLayout();
    lastRenderedMode = undefined; // force a full rebuild on this first render
    render(message.graph, message.schema, message.defaultLayoutAlgorithm, message.parseErrorMessage);
    saveState({
      generation: message.generation,
      graph: message.graph,
      schema: message.schema,
      layoutCache,
      editableNodeIds: message.editableNodeIds,
      commentEditableNodeIds: message.commentEditableNodeIds,
      isEditableDocument: message.isEditableDocument,
      algorithm: message.defaultLayoutAlgorithm,
      viewMode,
      strings: message.strings,
    });
  } else if (message.type === "update") {
    // Defends against a stale message (e.g. the cached-state fast path
    // above, on a later reload) overwriting a render that's already newer.
    // document.version only ever increases for the panel's lifetime (the
    // panel is disposed when its document closes), so this is a safe order.
    if (message.generation < lastRenderedGeneration) {
      return;
    }
    lastRenderedGeneration = message.generation;
    editableIds = new Set(message.editableNodeIds);
    commentEditableIds = new Set(message.commentEditableNodeIds);
    lastGraph = message.graph;
    lastSchema = message.schema;
    if (pendingNewSelection) {
      const entity = lastSchema.entities.find((e) => e.id === pendingNewSelection);
      const relation = lastSchema.relations.find((r) => r.iri === pendingNewSelection);
      if (entity) {
        selection = { kind: "entity", id: entity.id };
      } else if (relation) {
        selection = { kind: "relation", id: relation.id };
      }
      pendingNewSelection = undefined;
    }
    render(message.graph, message.schema, layoutSelect.value as "fcose" | "dagre", message.parseErrorMessage);
    const prior = vscode.getState();
    if (prior) {
      saveState({
        ...prior,
        generation: message.generation,
        graph: message.graph,
        schema: message.schema,
        editableNodeIds: message.editableNodeIds,
        commentEditableNodeIds: message.commentEditableNodeIds,
        layoutCache,
      });
    }
  } else if (message.type === "editResult") {
    const pending = pendingEdits.get(message.requestId);
    pendingEdits.delete(message.requestId);
    if (!message.ok && pending && cy) {
      cy.getElementById(pending.nodeId).data("label", pending.previousLabel);
      updateInspectorSelection();
    }
    if (message.ok && message.newIri) {
      // Consumed by the 'update' this write-back's own pushUpdate() triggers
      // — auto-selects the class/relation just created once it actually
      // exists in the next schema model.
      pendingNewSelection = message.newIri;
    }
    const pendingDeleteIri = pendingDeletes.get(message.requestId);
    pendingDeletes.delete(message.requestId);
    if (!message.ok && pendingDeleteIri && message.message) {
      // A refused delete (not in a simple enough form, declared more than
      // once, etc.) would otherwise leave the user stuck with only a toast
      // and no way to act on it — jump to the declaration in source so
      // they can finish the deletion by hand. Doesn't fire on a plain user
      // cancellation of the "still referenced elsewhere" confirmation
      // modal, which the host reports as ok:false with no message.
      post({ type: "jumpToNode", nodeId: pendingDeleteIri });
    }
    if (!message.ok && message.message) {
      showToast(message.message);
    }
  }
});

layoutSelect.addEventListener("change", () => {
  const algorithm = layoutSelect.value as "fcose" | "dagre";
  post({ type: "setLayoutAlgorithm", algorithm });
  if (cy) {
    runLayoutPass(cy, lastRenderedMode ?? viewMode, algorithm, new Map());
  }
});

viewSchemaBtn.addEventListener("click", () => switchViewMode("schema"));
viewTriplesBtn.addEventListener("click", () => switchViewMode("triples"));
exportPngBtn.addEventListener("click", exportPng);
inspectorToggleBtn.addEventListener("click", () => setInspectorOpen(!inspectorOpen));
inspectorCloseBtn.addEventListener("click", () => setInspectorOpen(false));
inspectorScrimEl.addEventListener("click", () => setInspectorOpen(false));

function zoomBy(factor: number): void {
  if (!cy) {
    return;
  }
  const level = factor > 1 ? zoomStep(cy.zoom(), "in") : zoomStep(cy.zoom(), "out");
  cy.zoom({
    level,
    renderedPosition: { x: stage.clientWidth / 2, y: stage.clientHeight / 2 },
  });
}

zoomInBtn.addEventListener("click", () => zoomBy(1.2));
zoomOutBtn.addEventListener("click", () => zoomBy(1 / 1.2));
zoomLevelBtn.addEventListener("click", () => {
  if (!cy) {
    return;
  }
  cy.zoom({
    level: DEFAULT_ZOOM,
    renderedPosition: { x: stage.clientWidth / 2, y: stage.clientHeight / 2 },
  });
});
fitBtn.addEventListener("click", () => cy && fitReadable(cy));
runLayoutBtn.addEventListener("click", () => {
  if (!cy) {
    return;
  }
  runLayoutPass(cy, lastRenderedMode ?? viewMode, layoutSelect.value as "fcose" | "dagre", new Map(), true);
});

addClassBtn.addEventListener("click", () => {
  if (!strings) {
    return;
  }
  showPromptForm({
    label: strings.promptClassNameLabel,
    okLabel: strings.okLabel,
    cancelLabel: strings.cancelLabel,
    onSubmit: (name) => {
      const requestId = `edit-${++requestSeq}`;
      post({ type: "addClass", requestId, name });
    },
  });
});

connectBtn.addEventListener("click", () => {
  connectModeActive = !connectModeActive;
  connectPendingSource = undefined;
  cy?.nodes(".connect-source").removeClass("connect-source");
  updateConnectUi();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && connectModeActive) {
    connectModeActive = false;
    cancelConnectPending();
  } else if (e.key === "Escape" && inspectorOpen && inspectorPlacement !== "side") {
    setInspectorOpen(false);
  } else if (
    e.key === "/" &&
    !(e.target instanceof HTMLInputElement) &&
    !(e.target instanceof HTMLTextAreaElement) &&
    !(e.target instanceof HTMLSelectElement)
  ) {
    e.preventDefault();
    searchPanel?.input.focus();
  } else if ((e.metaKey || e.ctrlKey) && ["+", "=", "-", "0"].includes(e.key)) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }
    e.preventDefault();
    if (e.key === "-") {
      zoomBy(1 / 1.2);
    } else if (e.key === "0") {
      zoomLevelBtn.click();
    } else {
      zoomBy(1.2);
    }
  }
});

window.addEventListener("resize", applyResponsiveLayout);

// Fast-path re-render from cached state immediately on (re)load, so switching
// back to a hidden webview tab doesn't show a blank canvas while waiting for
// the extension host's fresh 'init' message to arrive. `retainContextWhenHidden`
// is false, so this path runs on every tab hide/show, not just first load.
//
// Wrapped in try/catch: a cached state written by an older build (different
// WebviewState shape) must not be able to throw here. Before this fix, an
// exception here aborted the whole module before `post({type:'ready'})` ran,
// which meant the host never got a 'ready' to respond to and the panel was
// left permanently dead with no error shown anywhere (bug #4).
try {
  const cached = vscode.getState();
  if (cached && cached.stateVersion === STATE_VERSION) {
    editableIds = new Set(cached.editableNodeIds);
    commentEditableIds = new Set(cached.commentEditableNodeIds);
    strings = cached.strings;
    isEditableDocument = cached.isEditableDocument;
    lastRenderedGeneration = cached.generation;
    viewMode = cached.viewMode;
    lastGraph = cached.graph;
    lastSchema = cached.schema;
    layoutCache = cached.layoutCache;
    layoutSelect.value = cached.algorithm;
    configureChrome(strings);
    applyResponsiveLayout();
    lastRenderedMode = undefined;
    render(cached.graph, cached.schema, cached.algorithm, undefined);
  }
} catch {
  // Ignore a corrupted/incompatible cache — the host's fresh 'init' below
  // will repaint everything correctly regardless.
}

post({ type: "ready" });
