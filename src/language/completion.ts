import * as vscode from "vscode";
import { detectFormatFromLanguageId, parseOntology } from "../rdf/parse";
import { KNOWN_TERMS } from "../rdf/vocabulary";
import { isEditableLanguage } from "../util/languages";

/**
 * Lightweight, non-safety-critical prefix scan (unlike positionIndex.ts,
 * this does not need to be exact — worst case a completion suggestion is
 * missing or slightly stale, not a corrupted file) used only to resolve
 * "what does this prefix currently map to" for completion purposes.
 */
function collectPrefixesUpTo(text: string, offset: number): Record<string, string> {
  const prefixes: Record<string, string> = {};
  const re = /@prefix\s+([\w-]*):\s*<([^>]*)>\s*\.|(?:^|\s)PREFIX\s+([\w-]*):\s*<([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) && match.index < offset) {
    const name = match[1] ?? match[3] ?? "";
    const iri = match[2] ?? match[4] ?? "";
    prefixes[name] = iri;
  }
  return prefixes;
}

export const provider: vscode.CompletionItemProvider = {
  async provideCompletionItems(document, position): Promise<vscode.CompletionItem[]> {
    if (!isEditableLanguage(document.languageId)) {
      return [];
    }
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const match = /([A-Za-z][\w-]*)?:$/.exec(linePrefix);
    if (!match) {
      return [];
    }
    const prefixName = match[1] ?? "";
    const text = document.getText();
    const offset = document.offsetAt(position);
    const namespace = collectPrefixesUpTo(text, offset)[prefixName];
    if (!namespace) {
      return [];
    }

    const items: vscode.CompletionItem[] = [];
    for (const term of KNOWN_TERMS) {
      if (term.iri.startsWith(namespace) && term.iri.length > namespace.length) {
        const item = new vscode.CompletionItem(term.iri.slice(namespace.length), vscode.CompletionItemKind.Constant);
        item.detail = term.iri;
        item.documentation = term.comment;
        items.push(item);
      }
    }

    const format = detectFormatFromLanguageId(document.languageId);
    if (format) {
      const parsed = await parseOntology(text, format, document.uri.toString());
      const seen = new Set(items.map((i) => i.label as string));
      const collect = (iri: string) => {
        if (iri.startsWith(namespace) && iri.length > namespace.length) {
          const local = iri.slice(namespace.length);
          if (!seen.has(local)) {
            seen.add(local);
            items.push(new vscode.CompletionItem(local, vscode.CompletionItemKind.Reference));
          }
        }
      };
      for (const quad of parsed.quads) {
        if (quad.subject.termType === "NamedNode") {
          collect(quad.subject.value);
        }
        if (quad.predicate.termType === "NamedNode") {
          collect(quad.predicate.value);
        }
        if (quad.object.termType === "NamedNode") {
          collect(quad.object.value);
        }
      }
    }

    return items;
  },
};
