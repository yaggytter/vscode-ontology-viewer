import * as vscode from "vscode";
import { detectFormatFromExtension, detectFormatFromLanguageId, type OntologyFormat } from "../rdf/parse";

export function resolveFormat(document: vscode.TextDocument): OntologyFormat | undefined {
  return detectFormatFromLanguageId(document.languageId) ?? detectFormatFromExtension(document.fileName);
}
