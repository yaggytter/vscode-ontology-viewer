import * as vscode from "vscode";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { parseOntology } from "../rdf/parse";
import { buildGraphModel } from "../rdf/graphModel";
import { buildSchemaModel } from "../rdf/schemaModel";
import { buildPositionIndex } from "../rdf/positionIndex";
import { getDocumentLayout, mergeDocumentLayout } from "./layoutStore";
import { computeEditableSubjects } from "../edit/editLiteral";
import { computeCommentEditableSubjects } from "../edit/editComment";
import type { HostToWebviewMessage, UiStrings, ViewMode, WebviewToHostMessage } from "../shared/messages";
import { isEditableLanguage } from "../util/languages";
import { resolveFormat } from "./format";
import {
  handleAddClass,
  handleAddProperty,
  handleAddRelation,
  handleDeleteDeclaration,
  handleEditComment,
  handleEditLabel,
  handleUpdatePropertyType,
} from "./editHandlers";

interface PanelState {
  panel: vscode.WebviewPanel;
  document: vscode.TextDocument;
  disposables: vscode.Disposable[];
  debounceTimer?: ReturnType<typeof setTimeout>;
  algorithm: "fcose" | "dagre";
  defaultViewMode: ViewMode;
}

/** Namespaces saved node positions by view mode — see WebviewToHostNodeMoved. */
function layoutKey(viewMode: ViewMode, nodeId: string): string {
  return `${viewMode}:${nodeId}`;
}

const panels = new Map<string, PanelState>();

function uiStrings(): UiStrings {
  return {
    loading: vscode.l10n.t("Loading diagram..."),
    parseError: vscode.l10n.t("This file has a syntax error — showing the last valid diagram."),
    readOnlyBanner: vscode.l10n.t("This format is view-only in the diagram."),
    convertToTurtle: vscode.l10n.t("Convert to Turtle to edit"),
    layoutSelectLabel: vscode.l10n.t("Layout:"),
    emptyGraph: vscode.l10n.t("No classes, properties, or individuals found yet."),
    schemaViewLabel: vscode.l10n.t("Schema"),
    triplesViewLabel: vscode.l10n.t("Triples"),
    schemaEmptyBanner: vscode.l10n.t(
      "This document has no classes to show as a schema diagram — showing the raw triples instead.",
    ),
    unattachedPropertiesBanner: vscode.l10n.t(
      "Unattached properties (not shown in the schema diagram): {0}",
    ),
    entitiesLabel: vscode.l10n.t("Entities"),
    relationsLabel: vscode.l10n.t("Relations"),
    propertiesLabel: vscode.l10n.t("Properties"),
    instancesLabel: vscode.l10n.t("{0} instances"),
    unattachedHeading: vscode.l10n.t("Unattached properties"),
    revealInSource: vscode.l10n.t("Reveal in source"),
    nameFieldLabel: vscode.l10n.t("Name"),
    searchPlaceholder: vscode.l10n.t("Search entities, relations, properties..."),
    clearSearchLabel: vscode.l10n.t("Clear search"),
    noSearchResultsLabel: vscode.l10n.t("No matching ontology elements"),
    exportPngLabel: vscode.l10n.t("Export PNG"),
    detailsLabel: vscode.l10n.t("Details"),
    showDetailsLabel: vscode.l10n.t("Show details"),
    closeDetailsLabel: vscode.l10n.t("Close details"),
    overviewLabel: vscode.l10n.t("Ontology overview"),
    graphControlsLabel: vscode.l10n.t("Graph controls"),
    zoomInLabel: vscode.l10n.t("Zoom in"),
    zoomOutLabel: vscode.l10n.t("Zoom out"),
    resetZoomLabel: vscode.l10n.t("Reset zoom to 100%"),
    fitViewLabel: vscode.l10n.t("Fit to view"),
    runLayoutLabel: vscode.l10n.t("Re-run layout"),
    inspectorEmptyTitle: vscode.l10n.t("Explore the ontology"),
    inspectorEmptyHint: vscode.l10n.t("Select a node to see its details."),
    legendTitle: vscode.l10n.t("Legend"),
    legendInferredHint: vscode.l10n.t("Dashed = inferred, not directly stated in the document."),
    legendColorHint: vscode.l10n.t(
      "Similar colors indicate entities that are close in the relationship graph; separated color families are disconnected groups.",
    ),
    connectionGroupLabel: vscode.l10n.t("Connection group {0}/{1} · {2} entities"),
    customColorLabel: vscode.l10n.t("Custom document color overrides the automatic family color."),
    legendClass: vscode.l10n.t("Class"),
    legendSkosConcept: vscode.l10n.t("SKOS Concept"),
    legendInferredEntity: vscode.l10n.t("Inferred (referenced but undeclared)"),
    legendRelation: vscode.l10n.t("Relation"),
    legendSubClassOf: vscode.l10n.t("Subclass of"),
    legendSkosBroader: vscode.l10n.t("Broader (SKOS)"),
    addClassLabel: vscode.l10n.t("+ Class"),
    connectLabel: vscode.l10n.t("Connect"),
    connectHintPickSource: vscode.l10n.t("Click the source node for the new relation (Esc to cancel)."),
    connectHintPickTarget: vscode.l10n.t("Now click the target node."),
    promptClassNameLabel: vscode.l10n.t("Class name"),
    promptRelationNameLabel: vscode.l10n.t("Relation name"),
    okLabel: vscode.l10n.t("OK"),
    cancelLabel: vscode.l10n.t("Cancel"),
    commentFieldLabel: vscode.l10n.t("Description"),
    commentFieldPlaceholder: vscode.l10n.t("Add a description..."),
    commentClearUnsupported: vscode.l10n.t("Clearing a description isn't supported yet — edit it directly in the text editor."),
    commentNotEditableHint: vscode.l10n.t("This description is not in a simple single-line form; edit it directly in the text editor."),
    addPropertyLabel: vscode.l10n.t("+ Property"),
    promptPropertyNameLabel: vscode.l10n.t("Property name"),
    propertyTypeLabel: vscode.l10n.t("Type"),
    propertyNotEditableHint: vscode.l10n.t(
      "This property is inferred from usage and has no declaration to edit — add one in the text editor.",
    ),
    deleteLabel: vscode.l10n.t("Delete"),
  };
}

export async function openPreview(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument | undefined,
): Promise<void> {
  if (!document) {
    void vscode.window.showWarningMessage(vscode.l10n.t("Open an ontology file first."));
    return;
  }
  const format = resolveFormat(document);
  if (!format) {
    void vscode.window.showWarningMessage(vscode.l10n.t("This file is not a recognized ontology format."));
    return;
  }

  const key = document.uri.toString();
  const existing = panels.get(key);
  if (existing) {
    existing.panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "ontologyViewer.preview",
    vscode.l10n.t("Diagram: {0}", path.basename(document.fileName)),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist"), vscode.Uri.joinPath(context.extensionUri, "webview")],
    },
  );

  const config = vscode.workspace.getConfiguration("ontologyViewer");
  const state: PanelState = {
    panel,
    document,
    disposables: [],
    algorithm: config.get<"fcose" | "dagre">("preview.layout", "fcose"),
    defaultViewMode: config.get<ViewMode>("preview.defaultView", "schema"),
  };
  panels.set(key, state);

  panel.webview.html = buildHtml(panel.webview, context.extensionUri);

  panel.onDidDispose(
    () => {
      state.disposables.forEach((d) => d.dispose());
      panels.delete(key);
    },
    null,
    state.disposables,
  );

  panel.webview.onDidReceiveMessage(
    (message: WebviewToHostMessage) => void handleWebviewMessage(context, state, message),
    null,
    state.disposables,
  );

  state.disposables.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== key) {
        return;
      }
      // No echo-suppression flag here (deliberately — see handleEditLabel):
      // every change, including our own edits, refreshes the webview. The
      // webview's own `generation` guard (document.version, monotonic) is
      // what prevents a stale render, not a fragile "ignore the very next
      // event" flag that a concurrent edit could steal from under us.
      scheduleRefresh(state);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.toString() === key) {
        panel.dispose();
      }
    }),
  );
}

async function handleWebviewMessage(
  context: vscode.ExtensionContext,
  state: PanelState,
  message: WebviewToHostMessage,
): Promise<void> {
  switch (message.type) {
    case "ready":
      await sendInit(context, state);
      return;
    case "nodeMoved": {
      await mergeDocumentLayout(context, state.document.uri, {
        [layoutKey(message.viewMode, message.nodeId)]: { x: message.x, y: message.y },
      });
      return;
    }
    case "layoutChanged": {
      await mergeDocumentLayout(context, state.document.uri, message.layout);
      return;
    }
    case "jumpToNode":
      await jumpToNode(state.document, message.nodeId);
      return;
    case "editLabel":
      if (await handleEditLabel(state.panel, state.document, message.requestId, message.nodeId, message.newLabel)) {
        await pushUpdate(state);
      }
      return;
    case "editComment":
      if (await handleEditComment(state.panel, state.document, message.requestId, message.subjectIri, message.newComment)) {
        await pushUpdate(state);
      }
      return;
    case "addClass":
      if (await handleAddClass(state.panel, state.document, message.requestId, message.name, message.description)) {
        await pushUpdate(state);
      }
      return;
    case "addRelation":
      if (
        await handleAddRelation(state.panel, state.document, message.requestId, message.sourceIri, message.targetIri, message.name)
      ) {
        await pushUpdate(state);
      }
      return;
    case "addProperty":
      if (
        await handleAddProperty(
          state.panel,
          state.document,
          message.requestId,
          message.entityIri,
          message.name,
          message.propertyType,
        )
      ) {
        await pushUpdate(state);
      }
      return;
    case "updatePropertyType":
      if (
        await handleUpdatePropertyType(state.panel, state.document, message.requestId, message.propertyIri, message.propertyType)
      ) {
        await pushUpdate(state);
      }
      return;
    case "deleteDeclaration":
      if (await handleDeleteDeclaration(state.panel, state.document, message.requestId, message.iri)) {
        await pushUpdate(state);
      }
      return;
    case "convertToTurtle":
      await vscode.commands.executeCommand("ontologyViewer.convertToTurtle");
      return;
    case "setLayoutAlgorithm":
      state.algorithm = message.algorithm;
      return;
    case "exportPng":
      await exportDiagramPng(state, message.dataUri);
      return;
  }
}

async function exportDiagramPng(state: PanelState, dataUri: string): Promise<void> {
  const prefix = "base64,";
  const commaIndex = dataUri.indexOf(prefix);
  if (commaIndex === -1) {
    return;
  }
  const base64 = dataUri.slice(commaIndex + prefix.length);

  const defaultUri = vscode.Uri.file(`${state.document.uri.fsPath}.diagram.png`);
  const target = await vscode.window.showSaveDialog({ defaultUri, filters: { PNG: ["png"] } });
  if (!target) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(base64, "base64"));
  void vscode.window.showInformationMessage(vscode.l10n.t("Diagram exported to {0}.", target.fsPath));
}

async function sendInit(context: vscode.ExtensionContext, state: PanelState): Promise<void> {
  const format = resolveFormat(state.document);
  if (!format) {
    return;
  }
  const isEditableDocument = isEditableLanguage(state.document.languageId);
  const text = state.document.getText();
  const baseIRI = state.document.uri.toString();
  const parsed = await parseOntology(text, format, baseIRI);
  const graph = buildGraphModel(parsed.quads);
  const schema = buildSchemaModel(parsed.quads);
  const editableNodeIds = isEditableDocument
    ? [...computeEditableSubjects(text, baseIRI, graph.nodes.map((n) => n.id))]
    : [];
  const commentEditableNodeIds = isEditableDocument
    ? [...computeCommentEditableSubjects(text, baseIRI, graph.nodes.map((n) => n.id))]
    : [];

  const message: HostToWebviewMessage = {
    type: "init",
    generation: state.document.version,
    graph,
    schema,
    layout: getDocumentLayout(context, state.document.uri),
    editableNodeIds,
    commentEditableNodeIds,
    isEditableDocument,
    defaultLayoutAlgorithm: state.algorithm,
    defaultViewMode: state.defaultViewMode,
    strings: uiStrings(),
    parseErrorMessage: parsed.errors[0]?.message,
  };
  await state.panel.webview.postMessage(message);
}

function scheduleRefresh(state: PanelState): void {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }
  const debounceMs = vscode.workspace
    .getConfiguration("ontologyViewer")
    .get<number>("preview.autoRefreshDebounceMs", 300);
  state.debounceTimer = setTimeout(() => void pushUpdate(state), debounceMs);
}

async function pushUpdate(state: PanelState): Promise<void> {
  const format = resolveFormat(state.document);
  if (!format) {
    return;
  }
  const isEditableDocument = isEditableLanguage(state.document.languageId);
  const text = state.document.getText();
  const baseIRI = state.document.uri.toString();
  const parsed = await parseOntology(text, format, baseIRI);
  const graph = buildGraphModel(parsed.quads);
  const schema = buildSchemaModel(parsed.quads);
  const editableNodeIds = isEditableDocument
    ? [...computeEditableSubjects(text, baseIRI, graph.nodes.map((n) => n.id))]
    : [];
  const commentEditableNodeIds = isEditableDocument
    ? [...computeCommentEditableSubjects(text, baseIRI, graph.nodes.map((n) => n.id))]
    : [];

  const message: HostToWebviewMessage = {
    type: "update",
    generation: state.document.version,
    graph,
    schema,
    editableNodeIds,
    commentEditableNodeIds,
    parseErrorMessage: parsed.errors[0]?.message,
  };
  await state.panel.webview.postMessage(message);
}

async function jumpToNode(document: vscode.TextDocument, nodeId: string): Promise<void> {
  let range: vscode.Range | undefined;

  if (isEditableLanguage(document.languageId)) {
    const index = buildPositionIndex(document.getText(), document.uri.toString());
    if (!index.degraded) {
      const match =
        index.statements.find((s) => s.subject.value === nodeId) ??
        index.statements.find((s) => s.object.value === nodeId);
      const span = match?.subject.value === nodeId ? match.subject.span : match?.object.span;
      if (span) {
        range = new vscode.Range(span.start.line, span.start.character, span.end.line, span.end.character);
      }
    }
  }

  if (!range) {
    const local = nodeId.split(/[/#]/).pop() ?? nodeId;
    const offset = document.getText().indexOf(local);
    if (offset >= 0) {
      const pos = document.positionAt(offset);
      range = new vscode.Range(pos, pos.translate(0, local.length));
    }
  }

  const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preserveFocus: true });
  if (range) {
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString("base64");
  const documentLanguage = vscode.env.language.toLowerCase().startsWith("ja") ? "ja" : "en";
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview", "style.css"));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join("; ");

  return `<!doctype html>
<html lang="${documentLanguage}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="${styleUri}" />
<title>Ontology Diagram</title>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
