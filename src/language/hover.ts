import * as vscode from "vscode";
import { detectFormatFromLanguageId, parseOntology } from "../rdf/parse";
import { buildPositionIndex } from "../rdf/positionIndex";
import { lookupKnownTerm, RDFS_COMMENT, RDFS_LABEL } from "../rdf/vocabulary";
import { isEditableLanguage } from "../util/languages";
import { findNamedTermAt, spanToRange } from "./termAt";
import type { Quad } from "n3";

function findLiteralObject(quads: Quad[], subject: string, predicate: string): string | undefined {
  return quads.find((q) => q.subject.value === subject && q.predicate.value === predicate && q.object.termType === "Literal")
    ?.object.value;
}

export const provider: vscode.HoverProvider = {
  async provideHover(document, position) {
    if (!isEditableLanguage(document.languageId)) {
      return undefined;
    }
    const format = detectFormatFromLanguageId(document.languageId);
    if (!format) {
      return undefined;
    }

    const text = document.getText();
    const baseIRI = document.uri.toString();
    const index = buildPositionIndex(text, baseIRI);
    if (index.degraded) {
      return undefined;
    }
    const term = findNamedTermAt(index, position);
    if (!term || term.kind !== "NamedNode") {
      return undefined;
    }

    const known = lookupKnownTerm(term.value);
    const parsed = await parseOntology(text, format, baseIRI);
    const label = findLiteralObject(parsed.quads, term.value, RDFS_LABEL);
    const comment = findLiteralObject(parsed.quads, term.value, RDFS_COMMENT);

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${label ?? known?.label ?? term.value}**\n\n`);
    md.appendCodeblock(term.value, "text");
    const description = comment ?? known?.comment;
    if (description) {
      md.appendMarkdown(`\n${description}`);
    }
    return new vscode.Hover(md, spanToRange(term.span));
  },
};
