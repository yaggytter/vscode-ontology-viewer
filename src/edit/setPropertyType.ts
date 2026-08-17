import { buildPositionIndex, type Span } from "../rdf/positionIndex";
import type { PropertyType } from "../rdf/schemaModel";
import { RDFS_RANGE } from "../rdf/vocabulary";
import { xsdIriFor } from "./addProperty";
import { splice, type TextEdit } from "./textEdit";
import { verifyProposedText } from "./verify";

export interface SetPropertyTypePlan {
  ok: boolean;
  reason?: string;
  edit?: TextEdit;
  proposedText?: string;
}

/**
 * Plans setting `propertyIri`'s `rdfs:range` to the xsd datatype for
 * `propertyType`: replaces an existing single-line `rdfs:range` object in
 * place, or appends one via `;` onto the property's last existing
 * statement. Requires the property to already exist in the document (it's
 * meant to follow `addProperty.ts`, which always writes an initial
 * `rdfs:range`) — unlike `setLiteralPredicate.ts`, there's no "fabricate a
 * brand-new top-level statement" fallback here. Unlike
 * `setLiteralPredicate.ts` more generally, the object is a NamedNode
 * (`<xsd:...>`), never a quoted literal, so it's a separate small planner
 * rather than a shared one — escaping/language/datatype tracking don't apply.
 */
export function planSetPropertyType(
  documentText: string,
  baseIRI: string,
  propertyIri: string,
  propertyType: PropertyType,
): SetPropertyTypePlan {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return { ok: false, reason: `document position index is unavailable: ${index.degradedReason}` };
  }

  const forSubject = index.statements.filter((s) => s.subject.value === propertyIri);
  const existingRange = forSubject.find((s) => s.predicate.value === RDFS_RANGE);
  const rangeTerm = `<${xsdIriFor(propertyType)}>`;

  if (existingRange) {
    if (!existingRange.editable || existingRange.object.kind !== "NamedNode") {
      return {
        ok: false,
        reason: "the existing rdfs:range is not in a simple single-line NamedNode form; edit it directly in the text editor",
      };
    }
    const edit: TextEdit = { span: existingRange.object.span, newText: rangeTerm };
    return { ok: true, edit, proposedText: splice(documentText, edit.span, edit.newText) };
  }

  const triple = `<${RDFS_RANGE}> ${rangeTerm}`;

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

  return { ok: false, reason: "this property was not found in the document" };
}

export async function planAndVerifySetPropertyType(
  documentText: string,
  baseIRI: string,
  propertyIri: string,
  propertyType: PropertyType,
): Promise<SetPropertyTypePlan & { verified: boolean; verifyReason?: string }> {
  const plan = planSetPropertyType(documentText, baseIRI, propertyIri, propertyType);
  if (!plan.ok || !plan.proposedText) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const expectedRange = xsdIriFor(propertyType);
  const result = await verifyProposedText(plan.proposedText, baseIRI, (quads) => {
    const found = quads.some((q) => q.subject.value === propertyIri && q.predicate.value === RDFS_RANGE && q.object.value === expectedRange);
    return found ? { ok: true } : { ok: false, reason: "resulting document does not contain the expected rdfs:range triple" };
  });
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}
