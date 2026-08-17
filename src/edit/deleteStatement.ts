import type { Quad } from "n3";
import { buildPositionIndex, type IndexedBlock, type Span } from "../rdf/positionIndex";
import { parseOntology } from "../rdf/parse";
import { offsetOf, positionOf, splice, type TextEdit } from "./textEdit";
import { verifyProposedText, type VerifyResult } from "./verify";

export interface ExternalReference {
  subjectIri: string;
  predicateIri: string;
  objectValue: string;
}

/**
 * Finds triples elsewhere in the document that reference `subjectIri` —
 * either using it as a predicate (the property/relation is actually in
 * use, e.g. `:pizza :hasTopping :cheese`) or as another triple's object
 * (e.g. `:isToppingOf owl:inverseOf :hasTopping`) — excluding the
 * declaration's own statements (where `subjectIri` is the *subject*).
 * Deleting the declaration doesn't touch these; they'd be left pointing at
 * an IRI nothing declares anymore. Used to decide whether to warn before
 * deleting, per DevPlan.md's reference-check guidance for this operation.
 */
export function findExternalReferences(quads: Quad[], subjectIri: string): ExternalReference[] {
  return quads
    .filter(
      (q) =>
        q.subject.value !== subjectIri &&
        (q.predicate.value === subjectIri || (q.object.termType === "NamedNode" && q.object.value === subjectIri)),
    )
    .map((q) => ({ subjectIri: q.subject.value, predicateIri: q.predicate.value, objectValue: q.object.value }));
}

/**
 * A reparse succeeding and the target subject being gone is necessary but
 * not sufficient — a span that swallowed a neighboring declaration would
 * satisfy both just as well (this is exactly the "spanを間違えてもパースは
 * 通ってしまう" risk DevPlan.md calls out for deletion specifically). This
 * is the last line of defense: compare the full before/after quad sets,
 * not just "does the target still appear as a subject."
 *
 * Ground quads (no blank node anywhere in the triple) are compared as an
 * exact multiset — same triples, same counts. Quads involving a blank
 * node are compared by count only: N3.Parser's blank-node labels aren't
 * stable across two independent parses of similar-but-not-identical text,
 * so identity comparison would produce false failures — the same
 * constraint noted in DevPlan.md's `quadDelta` design notes, and why
 * blank-node-containing statements are already `editable: false` in
 * `positionIndex.ts`.
 */
function isGroundQuad(q: Quad): boolean {
  return q.subject.termType !== "BlankNode" && q.object.termType !== "BlankNode";
}

function groundQuadKey(q: Quad): string {
  const obj = q.object;
  const suffix = obj.termType === "Literal" ? `|${obj.language ?? ""}|${obj.datatype?.value ?? ""}` : "";
  return `${q.subject.value}|${q.predicate.value}|${obj.termType}|${obj.value}${suffix}`;
}

function groundQuadMultiset(quads: Quad[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of quads.filter(isGroundQuad)) {
    const key = groundQuadKey(q);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Builds the verify-step expectation for a delete: given the quads the
 * document had *before* the edit, returns a function that checks the
 * *after* quads contain exactly those minus `subjectIri`'s own triples —
 * nothing else changed.
 */
export function expectOnlySubjectRemoved(beforeQuads: Quad[], subjectIri: string): (afterQuads: Quad[]) => VerifyResult {
  const survivingBefore = beforeQuads.filter((q) => q.subject.value !== subjectIri);
  const expectedGround = groundQuadMultiset(survivingBefore);
  const expectedBlankCount = survivingBefore.length - survivingBefore.filter(isGroundQuad).length;

  return (afterQuads: Quad[]): VerifyResult => {
    if (afterQuads.some((q) => q.subject.value === subjectIri)) {
      return { ok: false, reason: "the entity would still appear as a subject after this edit" };
    }
    const actualBlankCount = afterQuads.length - afterQuads.filter(isGroundQuad).length;
    if (actualBlankCount !== expectedBlankCount) {
      return { ok: false, reason: "the edit changed more than the deleted entity's own triples (blank-node statement count differs)" };
    }
    const actualGround = groundQuadMultiset(afterQuads);
    if (actualGround.size !== expectedGround.size) {
      return { ok: false, reason: "the edit changed more than the deleted entity's own triples" };
    }
    for (const [key, count] of expectedGround) {
      if (actualGround.get(key) !== count) {
        return { ok: false, reason: "the edit changed more than the deleted entity's own triples" };
      }
    }
    return { ok: true };
  };
}

export interface DeleteStatementPlan {
  ok: boolean;
  reason?: string;
  edit?: TextEdit;
  proposedText?: string;
}

/**
 * Extends a block's span past its terminating `.` through one trailing
 * newline, so deleting the block doesn't leave behind an empty line where
 * it used to be — but only when everything between the `.` and that
 * newline is blank. If a comment or another statement shares the line,
 * the span is left untouched rather than risking deletion of content that
 * isn't part of this block.
 */
function extendThroughTrailingNewline(text: string, span: Span): Span {
  const endOffset = offsetOf(text, span.end);
  let i = endOffset;
  while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\r")) {
    i++;
  }
  if (text[i] !== "\n") {
    return span;
  }
  return { start: span.start, end: positionOf(text, i + 1) };
}

/**
 * Plans deleting `subjectIri`'s entire declaration — every statement
 * joined to it by `;`, from the subject's own start through its
 * terminating `.` (see positionIndex.ts's `blocks`, added specifically so
 * this doesn't reuse `IndexedStatement.statementSpan`, which shares its
 * `start` across every statement in a `;`-list and would delete far more
 * than intended).
 *
 * Deliberately narrow, matching DevPlan.md's own risk assessment of
 * deletion as the most bug-prone operation in this extension:
 *   - Refuses if the subject has zero blocks (nothing to delete) or more
 *     than one (the same subject re-opened as a separate top-level
 *     statement elsewhere) — the "one TextEdit per operation" shape this
 *     codebase's plan→verify→apply pattern assumes doesn't stretch to a
 *     multi-span delete, and re-opened subjects are rare enough that
 *     redirecting to manual editing is the honest answer.
 *   - Refuses if the block isn't `editable` (nested blank-node/RDF-collection
 *     content, or a multi-line literal) — same standard as every other
 *     write-back operation.
 *   - Does NOT check whether other subjects reference `subjectIri` (as a
 *     predicate, or as the object of e.g. `owl:inverseOf`) — that's a
 *     confirmation decision for the caller to make with the user *before*
 *     calling this, using the live document's parsed quads, not something
 *     this text-level planner can answer for a *proposed* edit.
 */
export function planDeleteStatement(documentText: string, baseIRI: string, subjectIri: string): DeleteStatementPlan {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return { ok: false, reason: `document position index is unavailable: ${index.degradedReason}` };
  }

  const blocks: IndexedBlock[] = index.blocks.filter((b) => b.subject.value === subjectIri);
  if (blocks.length === 0) {
    return { ok: false, reason: "no declaration for this entity was found in the document" };
  }
  if (blocks.length > 1) {
    return {
      ok: false,
      reason: "this entity is declared in more than one place in the document; delete it directly in the text editor",
    };
  }
  const [block] = blocks;
  if (!block.editable) {
    return { ok: false, reason: "this declaration is not in a simple enough form to delete from the diagram" };
  }

  const span = extendThroughTrailingNewline(documentText, block.span);
  const edit: TextEdit = { span, newText: "" };
  return { ok: true, edit, proposedText: splice(documentText, edit.span, edit.newText) };
}

export async function planAndVerifyDeleteStatement(
  documentText: string,
  baseIRI: string,
  subjectIri: string,
): Promise<DeleteStatementPlan & { verified: boolean; verifyReason?: string }> {
  const plan = planDeleteStatement(documentText, baseIRI, subjectIri);
  if (!plan.ok || plan.proposedText === undefined) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const before = await parseOntology(documentText, "turtle", baseIRI);
  if (before.errors.length > 0) {
    return { ...plan, verified: false, verifyReason: "the document did not parse cleanly before the edit was planned" };
  }
  const result = await verifyProposedText(plan.proposedText, baseIRI, expectOnlySubjectRemoved(before.quads, subjectIri));
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}
