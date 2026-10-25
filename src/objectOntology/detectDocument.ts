import * as vscode from "vscode";
import { detectObjectOntology, type ObjectOntologySyntax } from "./detect";

/** Lines read when sniffing an untitled document for the `objectOntology:` marker. */
const SNIFF_LINES = 200;

/**
 * {@link detectObjectOntology} for a live document, reading at most the
 * first lines and only when the file name and language leave the question
 * open — this runs on keystrokes and on every webview message, so a large
 * RDF file must not be copied just to be told "no".
 */
export function detectDocumentObjectOntology(document: vscode.TextDocument): ObjectOntologySyntax | undefined {
  return detectObjectOntology(document.fileName, document.languageId, () =>
    document.getText(new vscode.Range(0, 0, Math.min(document.lineCount, SNIFF_LINES), 0)),
  );
}
