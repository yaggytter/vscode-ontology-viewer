import * as vscode from "vscode";
import { detectFormatFromLanguageId, parseOntology } from "../rdf/parse";
import { buildPositionIndex } from "../rdf/positionIndex";
import { isEditableLanguage } from "../util/languages";

const DEBOUNCE_MS = 300;

function errorRange(document: vscode.TextDocument, line: number | undefined): vscode.Range {
  const zeroBased = Math.min(Math.max((line ?? 1) - 1, 0), Math.max(document.lineCount - 1, 0));
  return document.lineAt(zeroBased).range;
}

async function refresh(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): Promise<void> {
  const format = detectFormatFromLanguageId(document.languageId);
  if (!format) {
    collection.delete(document.uri);
    return;
  }

  const text = document.getText();
  const baseIRI = document.uri.toString();
  const parsed = await parseOntology(text, format, baseIRI);
  const diagnostics: vscode.Diagnostic[] = parsed.errors.map(
    (e) => new vscode.Diagnostic(errorRange(document, e.line), e.message, vscode.DiagnosticSeverity.Error),
  );

  if (diagnostics.length === 0 && isEditableLanguage(document.languageId)) {
    const index = buildPositionIndex(text, baseIRI);
    if (index.degraded) {
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          vscode.l10n.t(
            "Diagram editing is unavailable for this file: {0}",
            index.degradedReason ?? vscode.l10n.t("unknown reason"),
          ),
          vscode.DiagnosticSeverity.Information,
        ),
      );
    }
  }

  collection.set(document.uri, diagnostics);
}

export function register(_context: vscode.ExtensionContext): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection("ontologyViewer");
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const schedule = (document: vscode.TextDocument) => {
    if (!detectFormatFromLanguageId(document.languageId)) {
      return;
    }
    const key = document.uri.toString();
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => void refresh(document, collection), DEBOUNCE_MS),
    );
  };

  const disposables: vscode.Disposable[] = [
    collection,
    vscode.workspace.onDidOpenTextDocument(schedule),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const key = doc.uri.toString();
      const existing = timers.get(key);
      if (existing) {
        clearTimeout(existing);
        timers.delete(key);
      }
      collection.delete(doc.uri);
    }),
  ];
  vscode.workspace.textDocuments.forEach(schedule);

  return vscode.Disposable.from(...disposables);
}
