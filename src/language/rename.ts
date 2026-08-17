import * as vscode from "vscode";
import { buildPositionIndex } from "../rdf/positionIndex";
import { planAndVerifyRename } from "../edit/renameEntity";
import { isEditableLanguage } from "../util/languages";
import { findNamedTermAt, spanToRange } from "./termAt";

/**
 * F2 "Rename Symbol" support for Turtle IRIs. Verification runs entirely
 * inside `provideRenameEdits`, before any `WorkspaceEdit` is returned — once
 * we hand VS Code an edit it applies it directly, so unlike the diagram's
 * own edit path (src/preview/previewPanel.ts) there is no "apply, then
 * verify, then roll back" step available here.
 */
export const provider: vscode.RenameProvider = {
  prepareRename(document, position) {
    if (!isEditableLanguage(document.languageId)) {
      throw new Error(vscode.l10n.t("This document format cannot be renamed from here."));
    }
    const index = buildPositionIndex(document.getText(), document.uri.toString());
    if (index.degraded) {
      throw new Error(vscode.l10n.t("This document could not be safely indexed for renaming."));
    }
    const term = findNamedTermAt(index, position);
    if (!term || term.kind !== "NamedNode") {
      throw new Error(vscode.l10n.t("Nothing renameable at this position."));
    }
    return { range: spanToRange(term.span), placeholder: term.value };
  },

  async provideRenameEdits(document, position, newName) {
    const index = buildPositionIndex(document.getText(), document.uri.toString());
    if (index.degraded) {
      return undefined;
    }
    const term = findNamedTermAt(index, position);
    if (!term || term.kind !== "NamedNode") {
      return undefined;
    }

    const newIri = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(newName) ? newName : `${splitNamespace(term.value)}${newName}`;
    const baseIRI = document.uri.toString();
    const result = await planAndVerifyRename(document.getText(), baseIRI, term.value, newIri);
    if (!result.verified || !result.edits) {
      throw new Error(result.verifyReason ?? result.reason ?? vscode.l10n.t("This rename could not be verified."));
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const e of result.edits) {
      workspaceEdit.replace(document.uri, spanToRange(e.span), e.newText);
    }
    return workspaceEdit;
  },
};

function splitNamespace(iri: string): string {
  const cut = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
  return cut >= 0 ? iri.slice(0, cut + 1) : iri;
}
