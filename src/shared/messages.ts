import type { OntologyGraph } from "../rdf/graphModel";
import type { PropertyType, SchemaModel } from "../rdf/schemaModel";
import type { DocumentLayout } from "../preview/layoutStore";

export type ViewMode = "schema" | "triples";

/**
 * Wire protocol between the extension host (src/preview/previewPanel.ts)
 * and the webview UI (webview/main.ts). Type-only on both sides so it costs
 * nothing at runtime in either bundle — each esbuild target tree-shakes the
 * `import type` away.
 */

export interface UiStrings {
  loading: string;
  parseError: string;
  readOnlyBanner: string;
  convertToTurtle: string;
  layoutSelectLabel: string;
  emptyGraph: string;
  schemaViewLabel: string;
  triplesViewLabel: string;
  schemaEmptyBanner: string;
  /** Template with a single `{0}` placeholder for the count, replaced client-side. */
  unattachedPropertiesBanner: string;
  entitiesLabel: string;
  relationsLabel: string;
  propertiesLabel: string;
  /** Template with a single `{0}` placeholder for the count, replaced client-side. */
  instancesLabel: string;
  unattachedHeading: string;
  revealInSource: string;
  nameFieldLabel: string;
  searchPlaceholder: string;
  clearSearchLabel: string;
  noSearchResultsLabel: string;
  exportPngLabel: string;
  detailsLabel: string;
  showDetailsLabel: string;
  closeDetailsLabel: string;
  overviewLabel: string;
  graphControlsLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  resetZoomLabel: string;
  fitViewLabel: string;
  runLayoutLabel: string;
  inspectorEmptyTitle: string;
  inspectorEmptyHint: string;
  legendTitle: string;
  legendInferredHint: string;
  legendColorHint: string;
  connectionGroupLabel: string;
  customColorLabel: string;
  legendClass: string;
  legendSkosConcept: string;
  legendInferredEntity: string;
  legendRelation: string;
  legendSubClassOf: string;
  legendSkosBroader: string;
  addClassLabel: string;
  connectLabel: string;
  connectHintPickSource: string;
  connectHintPickTarget: string;
  promptClassNameLabel: string;
  promptRelationNameLabel: string;
  okLabel: string;
  cancelLabel: string;
  commentFieldLabel: string;
  commentFieldPlaceholder: string;
  commentClearUnsupported: string;
  commentNotEditableHint: string;
  addPropertyLabel: string;
  promptPropertyNameLabel: string;
  propertyTypeLabel: string;
  propertyNotEditableHint: string;
  /** Tooltip/aria-label for the small delete button next to a declared property row or a declared relation's Inspector panel. */
  deleteLabel: string;
}

export interface HostToWebviewInit {
  type: "init";
  generation: number;
  graph: OntologyGraph;
  schema: SchemaModel;
  layout: DocumentLayout;
  editableNodeIds: string[];
  /** Subset of entities whose rdfs:comment is a simple single-line form the Inspector's comment field can safely overwrite. */
  commentEditableNodeIds: string[];
  isEditableDocument: boolean;
  defaultLayoutAlgorithm: "fcose" | "dagre";
  defaultViewMode: ViewMode;
  strings: UiStrings;
  parseErrorMessage?: string;
}

export interface HostToWebviewUpdate {
  type: "update";
  generation: number;
  graph: OntologyGraph;
  schema: SchemaModel;
  editableNodeIds: string[];
  commentEditableNodeIds: string[];
  parseErrorMessage?: string;
}

export interface HostToWebviewEditResult {
  type: "editResult";
  requestId: string;
  ok: boolean;
  message?: string;
  /** Set on a successful addClass/addRelation — the newly minted entity/relation IRI. */
  newIri?: string;
}

export type HostToWebviewMessage = HostToWebviewInit | HostToWebviewUpdate | HostToWebviewEditResult;

export interface WebviewToHostReady {
  type: "ready";
}

export interface WebviewToHostNodeMoved {
  type: "nodeMoved";
  nodeId: string;
  x: number;
  y: number;
  /**
   * The schema and triples views share an id space for class/entity IRIs but
   * have unrelated layouts, so positions are stored per view mode (the host
   * namespaces its DocumentLayout keys by this field) — otherwise dragging a
   * node in one view silently relocates it in the other.
   */
  viewMode: ViewMode;
}

export interface WebviewToHostLayoutChanged {
  type: "layoutChanged";
  /** Namespaced positions for one completed schema/triples layout pass. */
  layout: DocumentLayout;
}

export interface WebviewToHostJumpToNode {
  type: "jumpToNode";
  nodeId: string;
}

export interface WebviewToHostEditLabel {
  type: "editLabel";
  requestId: string;
  nodeId: string;
  newLabel: string;
}

export interface WebviewToHostConvertToTurtle {
  type: "convertToTurtle";
}

export interface WebviewToHostSetLayoutAlgorithm {
  type: "setLayoutAlgorithm";
  algorithm: "fcose" | "dagre";
}

export interface WebviewToHostExportPng {
  type: "exportPng";
  /** A `cy.png({ output: "base64uri" })` result — the host can't render canvas itself. */
  dataUri: string;
}

export interface WebviewToHostEditComment {
  type: "editComment";
  requestId: string;
  subjectIri: string;
  newComment: string;
}

export interface WebviewToHostAddClass {
  type: "addClass";
  requestId: string;
  name: string;
  description?: string;
}

export interface WebviewToHostAddRelation {
  type: "addRelation";
  requestId: string;
  sourceIri: string;
  targetIri: string;
  name: string;
}

export interface WebviewToHostAddProperty {
  type: "addProperty";
  requestId: string;
  entityIri: string;
  name: string;
  propertyType: PropertyType;
}

export interface WebviewToHostUpdatePropertyType {
  type: "updatePropertyType";
  requestId: string;
  propertyIri: string;
  propertyType: PropertyType;
}

export interface WebviewToHostDeleteDeclaration {
  type: "deleteDeclaration";
  requestId: string;
  /** The property's or object-property relation's own IRI — its whole declaration is removed as one block. */
  iri: string;
}

export type WebviewToHostMessage =
  | WebviewToHostReady
  | WebviewToHostNodeMoved
  | WebviewToHostLayoutChanged
  | WebviewToHostJumpToNode
  | WebviewToHostEditLabel
  | WebviewToHostConvertToTurtle
  | WebviewToHostSetLayoutAlgorithm
  | WebviewToHostExportPng
  | WebviewToHostEditComment
  | WebviewToHostAddClass
  | WebviewToHostAddRelation
  | WebviewToHostAddProperty
  | WebviewToHostUpdatePropertyType
  | WebviewToHostDeleteDeclaration;
