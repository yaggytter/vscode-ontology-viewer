import * as vscode from "vscode";
import { detectObjectOntology, OBJECT_ONTOLOGY_GLOB } from "../objectOntology/detect";
import { parseObjectOntology } from "../objectOntology/parse";
import { keyRangeAt } from "../objectOntology/locate";
import type { Document } from "yaml";

const DEBOUNCE_MS = 300;

function isObjectOntology(document: vscode.TextDocument): boolean {
  return detectObjectOntology(document.fileName, document.languageId, document.getText()) !== undefined;
}

function toRange(document: vscode.TextDocument, start: number, end: number): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(Math.max(start, end)));
}

/**
 * Problems-panel diagnostics for Object Ontology documents: YAML syntax,
 * shape errors, and broken cross references, each at its exact source range.
 * Kept separate from the RDF diagnostics so neither reader runs on the
 * other's files.
 */
export function registerDiagnostics(): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection("objectOntology");
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const refresh = (document: vscode.TextDocument): void => {
    if (!isObjectOntology(document)) {
      collection.delete(document.uri);
      return;
    }
    const { diagnostics } = parseObjectOntology(document.getText());
    collection.set(
      document.uri,
      diagnostics.map((d) => {
        const diagnostic = new vscode.Diagnostic(
          toRange(document, d.range.start, d.range.end),
          d.message,
          d.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = "Object Ontology";
        return diagnostic;
      }),
    );
  };

  const schedule = (document: vscode.TextDocument): void => {
    if (document.languageId !== "yaml" && document.languageId !== "json" && document.languageId !== "jsonc") {
      return;
    }
    const key = document.uri.toString();
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(document);
      }, DEBOUNCE_MS),
    );
  };

  vscode.workspace.textDocuments.forEach(schedule);
  return vscode.Disposable.from(
    collection,
    vscode.workspace.onDidOpenTextDocument(schedule),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
      const timer = timers.get(document.uri.toString());
      if (timer) {
        clearTimeout(timer);
        timers.delete(document.uri.toString());
      }
    }),
  );
}

function symbol(
  document: vscode.TextDocument,
  yaml: Document,
  path: (string | number)[],
  name: string,
  detail: string,
  kind: vscode.SymbolKind,
): vscode.DocumentSymbol | undefined {
  const range = keyRangeAt(yaml, path);
  if (!range) {
    return undefined;
  }
  const r = toRange(document, range.start, range.end);
  return new vscode.DocumentSymbol(name, detail, kind, r, r);
}

/** Outline: one group per section, with properties nested under their type. */
export const symbolProvider: vscode.DocumentSymbolProvider = {
  provideDocumentSymbols(document) {
    if (!isObjectOntology(document)) {
      return [];
    }
    const { ontology, document: yaml } = parseObjectOntology(document.getText());
    if (!ontology) {
      return [];
    }
    const out: vscode.DocumentSymbol[] = [];
    for (const type of ontology.objectTypes) {
      const s = symbol(document, yaml, ["objectTypes", type.apiName], type.apiName, type.displayName ?? "object type", vscode.SymbolKind.Class);
      if (s) {
        s.children = type.properties
          .map((p) => symbol(document, yaml, ["objectTypes", type.apiName, "properties", p.apiName], p.apiName, p.type, vscode.SymbolKind.Property))
          .filter((c): c is vscode.DocumentSymbol => c !== undefined);
        out.push(s);
      }
    }
    for (const iface of ontology.interfaces) {
      const s = symbol(document, yaml, ["interfaces", iface.apiName], iface.apiName, "interface", vscode.SymbolKind.Interface);
      if (s) {
        out.push(s);
      }
    }
    for (const link of ontology.linkTypes) {
      const s = symbol(document, yaml, ["linkTypes", link.apiName], link.apiName, `${link.from.objectType} → ${link.to.objectType}`, vscode.SymbolKind.Field);
      if (s) {
        out.push(s);
      }
    }
    for (const action of ontology.actionTypes) {
      const s = symbol(document, yaml, ["actionTypes", action.apiName], action.apiName, action.displayName ?? "action", vscode.SymbolKind.Function);
      if (s) {
        out.push(s);
      }
    }
    return out;
  },
};

export function register(): vscode.Disposable {
  return vscode.Disposable.from(
    registerDiagnostics(),
    vscode.languages.registerDocumentSymbolProvider({ pattern: OBJECT_ONTOLOGY_GLOB }, symbolProvider),
  );
}
