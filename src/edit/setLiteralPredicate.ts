import { buildPositionIndex, type Span } from "../rdf/positionIndex";
import { endOfDocument, escapeTurtleShortString, splice, type TextEdit } from "./textEdit";

export interface SetLiteralPlan {
  ok: boolean;
  reason?: string;
  /** The single minimal patch to apply to the live document (preserves undo granularity). */
  edit?: TextEdit;
  /** Whole-document text with `edit` applied — used only for the pre-apply verify step. */
  proposedText?: string;
  /** Language tag the resulting triple is expected to carry (preserved from an existing value, if any). */
  expectedLanguage?: string;
  /** Datatype IRI the resulting triple is expected to carry (preserved from an existing value, if any). */
  expectedDatatype?: string;
}

/**
 * Plans (but does not apply) writing `newValue` as the literal object of
 * `predicateIri` on `subjectIri`: updates the existing value's text in place
 * if one exists in a simple, single-line, editable form; otherwise appends a
 * new statement — via `;` onto the subject's last existing statement if it
 * has one, or as a brand-new top-level statement at the end of the file
 * otherwise. Always emits the full `<...>` IRI form for the predicate
 * (never invents a prefix), trading a little verbosity for never risking a
 * wrong or colliding shorthand. Generalizes the original `planLabelEdit` —
 * see `editLiteral.ts`/`editComment.ts` for the (predicate-specific) public
 * entry points this backs.
 */
export function planSetLiteralPredicate(
  documentText: string,
  baseIRI: string,
  subjectIri: string,
  predicateIri: string,
  newValue: string,
): SetLiteralPlan {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return { ok: false, reason: `document position index is unavailable: ${index.degradedReason}` };
  }

  const forSubject = index.statements.filter((s) => s.subject.value === subjectIri);
  const existing = forSubject.find((s) => s.predicate.value === predicateIri);

  if (existing) {
    if (!existing.editable) {
      return {
        ok: false,
        reason: "the existing value is not in a simple single-line form; edit it directly in the text editor",
      };
    }
    const newText = `"${escapeTurtleShortString(newValue)}"`;
    const edit: TextEdit = { span: existing.object.span, newText };
    return {
      ok: true,
      edit,
      proposedText: splice(documentText, edit.span, edit.newText),
      expectedLanguage: existing.object.language,
      expectedDatatype: existing.object.datatype,
    };
  }

  const escaped = escapeTurtleShortString(newValue);
  const triple = `<${predicateIri}> "${escaped}"`;

  if (forSubject.length > 0) {
    const last = forSubject.reduce((a, b) => (b.object.span.end.line > a.object.span.end.line ||
      (b.object.span.end.line === a.object.span.end.line && b.object.span.end.character > a.object.span.end.character)
        ? b
        : a));
    const insertionPoint: Span = { start: last.object.span.end, end: last.object.span.end };
    const newText = ` ;\n  ${triple}`;
    const edit: TextEdit = { span: insertionPoint, newText };
    return { ok: true, edit, proposedText: splice(documentText, edit.span, edit.newText) };
  }

  // subjectIri never appears in a flat/editable statement — append a
  // brand-new top-level statement at the end of the document.
  const endPosition = endOfDocument(documentText);
  const needsLeadingNewline = documentText.length > 0 && !documentText.endsWith("\n");
  const newText = `${needsLeadingNewline ? "\n" : ""}<${subjectIri}> ${triple} .\n`;
  const insertionSpan: Span = { start: endPosition, end: endPosition };
  const edit: TextEdit = { span: insertionSpan, newText };
  return { ok: true, edit, proposedText: splice(documentText, edit.span, edit.newText) };
}

/**
 * Cheap, index-reused editability check for the diagram UI: which subjects
 * can accept a write to `predicateIri` via `planSetLiteralPredicate` without
 * needing to actually run the full plan for every candidate.
 */
export function computeEditablePredicateSubjects(
  documentText: string,
  baseIRI: string,
  predicateIri: string,
  candidateIds: string[],
): Set<string> {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return new Set();
  }
  const editable = new Set<string>();
  const candidates = new Set(candidateIds);
  const hasNonEditableValue = new Set<string>();
  for (const stmt of index.statements) {
    if (stmt.predicate.value === predicateIri && candidates.has(stmt.subject.value)) {
      if (stmt.editable) {
        editable.add(stmt.subject.value);
      } else {
        hasNonEditableValue.add(stmt.subject.value);
      }
    }
  }
  for (const id of candidateIds) {
    if (!hasNonEditableValue.has(id) && !editable.has(id)) {
      editable.add(id); // no existing value — inserting a new one is always structurally possible.
    }
  }
  for (const id of hasNonEditableValue) {
    editable.delete(id);
  }
  return editable;
}
