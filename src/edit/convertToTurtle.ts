import * as vscode from "vscode";
import * as N3 from "n3";
import { detectFormatFromLanguageId, parseOntology } from "../rdf/parse";
import { WELL_KNOWN_PREFIXES } from "../rdf/vocabulary";

function serializeToTurtle(quads: N3.Quad[], prefixes: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new N3.Writer({ prefixes: { ...WELL_KNOWN_PREFIXES, ...prefixes } });
    writer.addQuads(quads);
    writer.end((error, result) => (error ? reject(error) : resolve(result)));
  });
}

/**
 * Converts the active RDF/XML or JSON-LD document to Turtle and opens the
 * result as a new untitled document, so the user can continue editing (and
 * get diagram write-back) there. Never touches the original file — v1 keeps
 * write-back scoped to Turtle only (see DevPlan.md §2), so this is the
 * documented path for bringing a view-only format into the editable one.
 */
export async function convertActiveDocumentToTurtle(): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    void vscode.window.showWarningMessage(vscode.l10n.t("Open an ontology file first."));
    return;
  }

  const format = detectFormatFromLanguageId(document.languageId);
  if (!format || format === "turtle") {
    void vscode.window.showInformationMessage(vscode.l10n.t("This file is already Turtle."));
    return;
  }

  const baseIRI = document.uri.toString();
  const parsed = await parseOntology(document.getText(), format, baseIRI);
  if (parsed.errors.length > 0) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t("Could not convert: {0}", parsed.errors[0].message),
    );
    return;
  }
  if (parsed.quads.length === 0) {
    void vscode.window.showWarningMessage(vscode.l10n.t("This file has no triples to convert."));
    return;
  }

  const turtle = await serializeToTurtle(parsed.quads, parsed.prefixes);
  const converted = await vscode.workspace.openTextDocument({ language: "turtle", content: turtle });
  await vscode.window.showTextDocument(converted, vscode.ViewColumn.Beside);
  void vscode.window.showInformationMessage(
    vscode.l10n.t("Converted to Turtle in a new untitled file. Save it to keep editing and use the diagram."),
  );
}
