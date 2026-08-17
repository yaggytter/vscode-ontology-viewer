import * as vscode from "vscode";
import { parseOntology } from "../rdf/parse";
import { buildSchemaModel } from "../rdf/schemaModel";
import type { Span } from "../rdf/positionIndex";
import { planAndVerifyLabelEdit } from "../edit/editLiteral";
import { planAndVerifyCommentEdit } from "../edit/editComment";
import { planAndVerifyAddClass } from "../edit/addClass";
import { planAndVerifyAddRelation } from "../edit/addRelation";
import { planAndVerifyAddProperty } from "../edit/addProperty";
import { planAndVerifySetPropertyType } from "../edit/setPropertyType";
import { findExternalReferences, planAndVerifyDeleteStatement } from "../edit/deleteStatement";
import { localName } from "../rdf/opExtensions";
import type { PropertyType } from "../rdf/schemaModel";
import type { HostToWebviewMessage } from "../shared/messages";
import { isEditableLanguage } from "../util/languages";
import { resolveFormat } from "./format";

/**
 * All write-back handlers live here rather than in previewPanel.ts (see
 * DevPlan.md §9 "実装方針 F") — previewPanel.ts owns panel lifecycle and
 * message routing only. Every handler follows the same shape: check
 * editability, plan+verify (see src/edit/verify.ts's "never write before a
 * reparse of the PROPOSED text confirms it"), apply via WorkspaceEdit, post
 * an `editResult`, and report back whether the caller should `pushUpdate`.
 */

function spanToRange(span: Span): vscode.Range {
  return new vscode.Range(span.start.line, span.start.character, span.end.line, span.end.character);
}

async function postEditResult(
  panel: vscode.WebviewPanel,
  requestId: string,
  ok: boolean,
  message?: string,
  newIri?: string,
): Promise<void> {
  await panel.webview.postMessage({ type: "editResult", requestId, ok, message, newIri } satisfies HostToWebviewMessage);
}

async function applyEdit(document: vscode.TextDocument, edit: { span: Span; newText: string }): Promise<boolean> {
  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.replace(document.uri, spanToRange(edit.span), edit.newText);
  return vscode.workspace.applyEdit(workspaceEdit);
}

async function existingEntityIris(document: vscode.TextDocument): Promise<string[]> {
  const format = resolveFormat(document);
  if (!format) {
    return [];
  }
  const parsed = await parseOntology(document.getText(), format, document.uri.toString());
  return buildSchemaModel(parsed.quads).entities.map((e) => e.id);
}

export async function handleEditLabel(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  nodeId: string,
  newLabel: string,
): Promise<boolean> {
  if (!isEditableLanguage(document.languageId)) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("This document format cannot be edited from the diagram."));
    return false;
  }
  const baseIRI = document.uri.toString();
  const plan = await planAndVerifyLabelEdit(document.getText(), baseIRI, nodeId, newLabel);
  if (!plan.verified || !plan.edit) {
    await postEditResult(panel, requestId, false, plan.verifyReason ?? plan.reason ?? vscode.l10n.t("The edit could not be verified."));
    return false;
  }
  if (!(await applyEdit(document, plan.edit))) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("VS Code rejected the edit."));
    return false;
  }
  await postEditResult(panel, requestId, true);
  return true;
}

export async function handleEditComment(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  subjectIri: string,
  newComment: string,
): Promise<boolean> {
  if (!isEditableLanguage(document.languageId)) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("This document format cannot be edited from the diagram."));
    return false;
  }
  const baseIRI = document.uri.toString();
  const plan = await planAndVerifyCommentEdit(document.getText(), baseIRI, subjectIri, newComment);
  if (!plan.verified || !plan.edit) {
    await postEditResult(panel, requestId, false, plan.verifyReason ?? plan.reason ?? vscode.l10n.t("The edit could not be verified."));
    return false;
  }
  if (!(await applyEdit(document, plan.edit))) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("VS Code rejected the edit."));
    return false;
  }
  await postEditResult(panel, requestId, true);
  return true;
}

export async function handleAddClass(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  name: string,
  description: string | undefined,
): Promise<boolean> {
  if (!isEditableLanguage(document.languageId)) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("This document format cannot be edited from the diagram."));
    return false;
  }
  const baseIRI = document.uri.toString();
  const existingIris = await existingEntityIris(document);
  const plan = await planAndVerifyAddClass(document.getText(), baseIRI, existingIris, name, description);
  if (!plan.verified || !plan.edit) {
    await postEditResult(panel, requestId, false, plan.verifyReason ?? plan.reason ?? vscode.l10n.t("The edit could not be verified."));
    return false;
  }
  if (!(await applyEdit(document, plan.edit))) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("VS Code rejected the edit."));
    return false;
  }
  await postEditResult(panel, requestId, true, undefined, plan.newIri);
  return true;
}

export async function handleAddProperty(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  entityIri: string,
  name: string,
  propertyType: PropertyType,
): Promise<boolean> {
  if (!isEditableLanguage(document.languageId)) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("This document format cannot be edited from the diagram."));
    return false;
  }
  const baseIRI = document.uri.toString();
  const existingIris = await existingEntityIris(document);
  const plan = await planAndVerifyAddProperty(document.getText(), baseIRI, existingIris, entityIri, name, propertyType);
  if (!plan.verified || !plan.edit) {
    await postEditResult(panel, requestId, false, plan.verifyReason ?? plan.reason ?? vscode.l10n.t("The edit could not be verified."));
    return false;
  }
  if (!(await applyEdit(document, plan.edit))) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("VS Code rejected the edit."));
    return false;
  }
  await postEditResult(panel, requestId, true, undefined, plan.newIri);
  return true;
}

export async function handleUpdatePropertyType(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  propertyIri: string,
  propertyType: PropertyType,
): Promise<boolean> {
  if (!isEditableLanguage(document.languageId)) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("This document format cannot be edited from the diagram."));
    return false;
  }
  const baseIRI = document.uri.toString();
  const plan = await planAndVerifySetPropertyType(document.getText(), baseIRI, propertyIri, propertyType);
  if (!plan.verified || !plan.edit) {
    await postEditResult(panel, requestId, false, plan.verifyReason ?? plan.reason ?? vscode.l10n.t("The edit could not be verified."));
    return false;
  }
  if (!(await applyEdit(document, plan.edit))) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("VS Code rejected the edit."));
    return false;
  }
  await postEditResult(panel, requestId, true);
  return true;
}

export async function handleAddRelation(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  sourceIri: string,
  targetIri: string,
  name: string,
): Promise<boolean> {
  if (!isEditableLanguage(document.languageId)) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("This document format cannot be edited from the diagram."));
    return false;
  }
  const baseIRI = document.uri.toString();
  const existingIris = await existingEntityIris(document);
  const plan = await planAndVerifyAddRelation(document.getText(), baseIRI, existingIris, sourceIri, targetIri, name);
  if (!plan.verified || !plan.edit) {
    await postEditResult(panel, requestId, false, plan.verifyReason ?? plan.reason ?? vscode.l10n.t("The edit could not be verified."));
    return false;
  }
  if (!(await applyEdit(document, plan.edit))) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("VS Code rejected the edit."));
    return false;
  }
  await postEditResult(panel, requestId, true, undefined, plan.newIri);
  return true;
}

/**
 * Deletes a property's or object-property relation's entire declaration
 * (see src/edit/deleteStatement.ts — scoped to a single whole-subject
 * block; classes and subClassOf/skosBroader edges aren't offered a delete
 * button in the Inspector at all, precisely because they don't fit this
 * shape). Before planning the edit, checks whether anything else in the
 * document references this IRI and, if so, asks the user to confirm via a
 * native modal — this is the one write-back operation where "it verified
 * cleanly" isn't the same question as "are you sure," since the verify
 * step only guarantees the *edit* is safe, not that nothing elsewhere in
 * the document still points at what it removed.
 */
export async function handleDeleteDeclaration(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  iri: string,
): Promise<boolean> {
  if (!isEditableLanguage(document.languageId)) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("This document format cannot be edited from the diagram."));
    return false;
  }
  const baseIRI = document.uri.toString();

  const before = await parseOntology(document.getText(), "turtle", baseIRI);
  const references = findExternalReferences(before.quads, iri);
  if (references.length > 0) {
    const deleteAnyway = vscode.l10n.t("Delete Anyway");
    const preview = references
      .slice(0, 3)
      .map((r) => `${localName(r.subjectIri)} → ${localName(r.predicateIri)}`)
      .join("\n");
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t(
        "This is still referenced {0} time(s) elsewhere in the document (e.g. as a predicate, or via owl:inverseOf). Deleting it will leave those references pointing at nothing that exists anymore.\n\n{1}",
        String(references.length),
        preview,
      ),
      { modal: true },
      deleteAnyway,
    );
    if (choice !== deleteAnyway) {
      await postEditResult(panel, requestId, false);
      return false;
    }
    // The modal awaited user input; the document (and thus the reference
    // count the user just confirmed against) may have changed underneath
    // us in the meantime. planAndVerifyDeleteStatement re-reads the
    // document for the edit itself and is safe regardless, but a stale
    // reference count would mean the user approved a decision that no
    // longer reflects reality — re-check rather than proceed on it blindly.
    const currentText = document.getText();
    const after = await parseOntology(currentText, "turtle", baseIRI);
    const stillReferenced = findExternalReferences(after.quads, iri);
    if (stillReferenced.length !== references.length) {
      await postEditResult(
        panel,
        requestId,
        false,
        vscode.l10n.t("The document changed while the confirmation dialog was open. Please try deleting again."),
      );
      return false;
    }
  }

  const plan = await planAndVerifyDeleteStatement(document.getText(), baseIRI, iri);
  if (!plan.verified || !plan.edit) {
    await postEditResult(
      panel,
      requestId,
      false,
      plan.verifyReason ?? plan.reason ?? vscode.l10n.t("The edit could not be verified."),
    );
    return false;
  }
  if (!(await applyEdit(document, plan.edit))) {
    await postEditResult(panel, requestId, false, vscode.l10n.t("VS Code rejected the edit."));
    return false;
  }
  await postEditResult(panel, requestId, true);
  return true;
}
