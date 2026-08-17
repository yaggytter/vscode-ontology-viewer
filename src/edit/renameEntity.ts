import { buildPositionIndex, type Span } from "../rdf/positionIndex";
import { verifyProposedText } from "./verify";

export interface RenamePlan {
  ok: boolean;
  reason?: string;
  edits?: { span: Span; newText: string }[];
  proposedText?: string;
}

function offsetOf(text: string, position: { line: number; character: number }): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < position.line; i++) {
    offset += lines[i].length + 1;
  }
  return offset + position.character;
}

function applyEdits(text: string, edits: { span: Span; newText: string }[]): string {
  // Apply from the end of the document backwards so earlier offsets stay valid.
  const sorted = [...edits].sort((a, b) => offsetOf(text, b.span.start) - offsetOf(text, a.span.start));
  let result = text;
  for (const e of sorted) {
    const start = offsetOf(result, e.span.start);
    const end = offsetOf(result, e.span.end);
    result = result.slice(0, start) + e.newText + result.slice(end);
  }
  return result;
}

/**
 * Finds every editable occurrence of `oldIri` (as a NamedNode term, in any
 * role) and rewrites it to `newIri`. Occurrences already written in a
 * prefixed form whose prefix's namespace still covers `newIri` keep that
 * shorthand; everything else becomes a full `<newIri>`. Used by the F2
 * "Rename Symbol" integration (src/language/rename.ts) — verification runs
 * BEFORE the caller ever constructs a WorkspaceEdit, since a RenameProvider
 * cannot undo an edit VS Code has already applied on its behalf.
 */
export function planRename(documentText: string, baseIRI: string, oldIri: string, newIri: string): RenamePlan {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return { ok: false, reason: `document position index is unavailable: ${index.degradedReason}` };
  }

  const occurrences: { term: Span; raw: string }[] = [];
  const seen = new Set<string>();
  const record = (term: { span: Span; value: string; kind: string }) => {
    if (term.kind !== "NamedNode" || term.value !== oldIri) {
      return;
    }
    const key = `${term.span.start.line}:${term.span.start.character}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const raw = sliceSpan(documentText, term.span);
    occurrences.push({ term: term.span, raw });
  };

  let anyNonEditable = false;
  for (const stmt of index.statements) {
    record(stmt.subject);
    record(stmt.predicate);
    record(stmt.object);
    if (
      !stmt.editable &&
      (stmt.subject.value === oldIri || stmt.predicate.value === oldIri || stmt.object.value === oldIri)
    ) {
      anyNonEditable = true;
    }
  }

  if (occurrences.length === 0) {
    return { ok: false, reason: "no editable occurrences of this entity were found" };
  }
  if (anyNonEditable) {
    return {
      ok: false,
      reason: "this entity also appears inside a nested blank-node/collection structure that cannot be safely renamed",
    };
  }

  const edits = occurrences.map(({ term, raw }) => ({ span: term, newText: rewriteOccurrence(raw, oldIri, newIri) }));
  const proposedText = applyEdits(documentText, edits);
  return { ok: true, edits, proposedText };
}

function sliceSpan(text: string, span: Span): string {
  const lines = text.split("\n");
  if (span.start.line === span.end.line) {
    return lines[span.start.line].slice(span.start.character, span.end.character);
  }
  const parts = [lines[span.start.line].slice(span.start.character)];
  for (let l = span.start.line + 1; l < span.end.line; l++) {
    parts.push(lines[l]);
  }
  parts.push(lines[span.end.line].slice(0, span.end.character));
  return parts.join("\n");
}

/** Splits an IRI into its namespace (up to and including the last `/` or `#`) and local part. */
function splitNamespace(iri: string): { namespace: string; local: string } {
  const cut = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
  return cut >= 0 ? { namespace: iri.slice(0, cut + 1), local: iri.slice(cut + 1) } : { namespace: iri, local: "" };
}

/**
 * Keeps an occurrence's existing `prefix:local` shorthand when the rename
 * stays within the same namespace (the common case — renaming an
 * identifier, not moving it to a different vocabulary); falls back to the
 * unambiguous full `<newIri>` form for anything else (`<...>` occurrences,
 * blank nodes, `a`, or a cross-namespace rename).
 */
function rewriteOccurrence(raw: string, oldIri: string, newIri: string): string {
  const prefixMatch = /^([A-Za-z][\w-]*)?:/.exec(raw);
  if (!prefixMatch) {
    return `<${newIri}>`;
  }
  const oldSplit = splitNamespace(oldIri);
  const newSplit = splitNamespace(newIri);
  if (oldSplit.namespace !== newSplit.namespace) {
    return `<${newIri}>`;
  }
  return `${prefixMatch[1] ?? ""}:${newSplit.local}`;
}

export async function planAndVerifyRename(
  documentText: string,
  baseIRI: string,
  oldIri: string,
  newIri: string,
): Promise<RenamePlan & { verified: boolean; verifyReason?: string }> {
  const plan = planRename(documentText, baseIRI, oldIri, newIri);
  if (!plan.ok || !plan.proposedText) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const result = await verifyProposedText(plan.proposedText, baseIRI, (quads) => {
    const stillHasOld = quads.some(
      (q) => q.subject.value === oldIri || q.predicate.value === oldIri || q.object.value === oldIri,
    );
    if (stillHasOld) {
      return { ok: false, reason: "the old IRI is still present somewhere in the resulting document" };
    }
    const hasNew = quads.some(
      (q) => q.subject.value === newIri || q.predicate.value === newIri || q.object.value === newIri,
    );
    return hasNew
      ? { ok: true }
      : { ok: false, reason: "the resulting document does not contain the renamed IRI" };
  });
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}
