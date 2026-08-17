import type { Span } from "../rdf/positionIndex";
import { endOfDocument, type TextEdit } from "./textEdit";

export interface StatementLine {
  predicateIri: string;
  /** Already-formatted Turtle object term, e.g. `"..."` or `<...>` — callers own escaping. */
  objectTurtle: string;
}

/**
 * Appends a brand-new top-level statement for a subject that doesn't exist
 * anywhere in the document yet (used for class/relation creation — an
 * existing-subject write goes through `setLiteralPredicate.ts` instead,
 * which can append via `;` onto a subject's last statement). Always emits
 * the full `<...>` IRI form for both the subject and every predicate, same
 * convention as `setLiteralPredicate.ts`.
 */
export function planNewTopLevelStatement(documentText: string, subjectIri: string, lines: StatementLine[]): TextEdit {
  const endPosition = endOfDocument(documentText);
  const needsLeadingNewline = documentText.length > 0 && !documentText.endsWith("\n");
  const body = lines.map((l) => `<${l.predicateIri}> ${l.objectTurtle}`).join(" ;\n  ");
  const newText = `${needsLeadingNewline ? "\n" : ""}<${subjectIri}>\n  ${body} .\n`;
  const insertionSpan: Span = { start: endPosition, end: endPosition };
  return { span: insertionSpan, newText };
}
