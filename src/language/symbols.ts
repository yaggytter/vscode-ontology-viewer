import * as vscode from "vscode";
import { detectFormatFromLanguageId, parseOntology } from "../rdf/parse";
import { buildGraphModel, type NodeKind, type OntologyNode } from "../rdf/graphModel";
import { buildPositionIndex } from "../rdf/positionIndex";
import { isEditableLanguage } from "../util/languages";
import { spanToRange } from "./termAt";

const ZERO_RANGE = new vscode.Range(0, 0, 0, 0);

const GROUP_ORDER: NodeKind[] = ["class", "property", "individual", "resource"];
const GROUP_LABEL: Record<NodeKind, string> = {
  class: vscode.l10n.t("Classes"),
  property: vscode.l10n.t("Properties"),
  individual: vscode.l10n.t("Individuals"),
  resource: vscode.l10n.t("Other Resources"),
};
const KIND_TO_SYMBOL_KIND: Record<NodeKind, vscode.SymbolKind> = {
  class: vscode.SymbolKind.Class,
  property: vscode.SymbolKind.Property,
  individual: vscode.SymbolKind.Object,
  resource: vscode.SymbolKind.Variable,
};

export const provider: vscode.DocumentSymbolProvider = {
  async provideDocumentSymbols(document): Promise<vscode.DocumentSymbol[]> {
    const format = detectFormatFromLanguageId(document.languageId);
    if (!format) {
      return [];
    }
    const text = document.getText();
    const baseIRI = document.uri.toString();
    const parsed = await parseOntology(text, format, baseIRI);
    if (parsed.errors.length > 0) {
      return [];
    }
    const graph = buildGraphModel(parsed.quads);

    const index = isEditableLanguage(document.languageId) ? buildPositionIndex(text, baseIRI) : undefined;
    const rangeFor = (nodeId: string): vscode.Range => {
      if (!index || index.degraded) {
        return ZERO_RANGE;
      }
      const stmt = index.statements.find((s) => s.subject.value === nodeId);
      return stmt ? spanToRange(stmt.subject.span) : ZERO_RANGE;
    };

    const byKind = new Map<NodeKind, vscode.DocumentSymbol[]>();
    for (const node of graph.nodes as OntologyNode[]) {
      if (node.isBlankNode) {
        continue; // blank nodes/synthetic literal nodes aren't meaningful outline entries.
      }
      const range = rangeFor(node.id);
      const symbol = new vscode.DocumentSymbol(node.label, node.id, KIND_TO_SYMBOL_KIND[node.kind], range, range);
      const list = byKind.get(node.kind) ?? [];
      list.push(symbol);
      byKind.set(node.kind, list);
    }

    const result: vscode.DocumentSymbol[] = [];
    for (const kind of GROUP_ORDER) {
      const list = byKind.get(kind);
      if (!list || list.length === 0) {
        continue;
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      const group = new vscode.DocumentSymbol(GROUP_LABEL[kind], "", vscode.SymbolKind.Namespace, ZERO_RANGE, ZERO_RANGE);
      group.children = list;
      result.push(group);
    }
    return result;
  },
};
