import * as vscode from "vscode";
import { SerialTaskQueue } from "./serialTaskQueue";

export interface NodePosition {
  x: number;
  y: number;
}

export type DocumentLayout = Record<string, NodePosition>;

const LAYOUT_STATE_KEY = "ontologyViewer.layouts";

type LayoutState = Record<string, DocumentLayout>;

const layoutWriteQueue = new SerialTaskQueue();
const pendingDocumentLayouts = new Map<string, DocumentLayout>();

/**
 * Reads/writes per-node drag positions via `workspaceState`, keyed by
 * document URI (per the confirmed design: never write coordinates into the
 * ontology file itself). A sidecar-JSON mode is planned as a config-switch
 * follow-up (see DevPlan.md / ontologyViewer.layout.storage) but v1 ships
 * the workspace-state path only.
 */
export function getDocumentLayout(context: vscode.ExtensionContext, documentUri: vscode.Uri): DocumentLayout {
  const documentKey = documentUri.toString();
  const pending = pendingDocumentLayouts.get(documentKey);
  if (pending) {
    return { ...pending };
  }
  const state = context.workspaceState.get<LayoutState>(LAYOUT_STATE_KEY, {});
  return { ...(state[documentKey] ?? {}) };
}

function enqueueDocumentLayoutUpdate(
  context: vscode.ExtensionContext,
  documentUri: vscode.Uri,
  update: (current: DocumentLayout) => DocumentLayout,
): Promise<void> {
  const documentKey = documentUri.toString();
  const state = context.workspaceState.get<LayoutState>(LAYOUT_STATE_KEY, {});
  const current = pendingDocumentLayouts.get(documentKey) ?? state[documentKey] ?? {};
  const nextLayout = update({ ...current });
  pendingDocumentLayouts.set(documentKey, nextLayout);

  return layoutWriteQueue.run(async () => {
    const state = context.workspaceState.get<LayoutState>(LAYOUT_STATE_KEY, {});
    await context.workspaceState.update(LAYOUT_STATE_KEY, { ...state, [documentKey]: nextLayout });
  }).finally(() => {
    if (pendingDocumentLayouts.get(documentKey) === nextLayout) {
      pendingDocumentLayouts.delete(documentKey);
    }
  });
}

export async function setDocumentLayout(
  context: vscode.ExtensionContext,
  documentUri: vscode.Uri,
  layout: DocumentLayout,
): Promise<void> {
  await enqueueDocumentLayoutUpdate(context, documentUri, () => ({ ...layout }));
}

export async function mergeDocumentLayout(
  context: vscode.ExtensionContext,
  documentUri: vscode.Uri,
  layout: DocumentLayout,
): Promise<void> {
  await enqueueDocumentLayoutUpdate(context, documentUri, (current) => ({ ...current, ...layout }));
}

export async function exportActiveLayout(context: vscode.ExtensionContext): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    void vscode.window.showWarningMessage(vscode.l10n.t("Open an ontology file first."));
    return;
  }
  const layout = getDocumentLayout(context, document.uri);
  if (Object.keys(layout).length === 0) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t("No saved diagram layout for this file yet. Drag some nodes in the preview first."),
    );
    return;
  }

  const defaultUri = vscode.Uri.file(`${document.uri.fsPath}.ontology-layout.json`);
  const target = await vscode.window.showSaveDialog({ defaultUri, filters: { JSON: ["json"] } });
  if (!target) {
    return;
  }
  const bytes = Buffer.from(JSON.stringify(layout, null, 2), "utf8");
  await vscode.workspace.fs.writeFile(target, bytes);
  void vscode.window.showInformationMessage(vscode.l10n.t("Diagram layout exported to {0}.", target.fsPath));
}
