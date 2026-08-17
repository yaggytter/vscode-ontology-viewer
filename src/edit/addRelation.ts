import { buildPositionIndex } from "../rdf/positionIndex";
import { OWL_OBJECT_PROPERTY, RDFS_DOMAIN, RDFS_LABEL, RDFS_RANGE, RDF_TYPE } from "../rdf/vocabulary";
import { planNewTopLevelStatement, type StatementLine } from "./addStatement";
import { mintIri } from "./mintIri";
import { escapeTurtleShortString, splice, type TextEdit } from "./textEdit";
import { verifyProposedText } from "./verify";

export interface AddRelationPlan {
  ok: boolean;
  reason?: string;
  newIri?: string;
  edit?: TextEdit;
  proposedText?: string;
}

/**
 * Plans a brand-new `owl:ObjectProperty` statement (`<newIri> a
 * owl:ObjectProperty ; rdfs:label "..." ; rdfs:domain <source> ; rdfs:range
 * <target> .`) appended at the end of the document — the two-click "connect
 * mode" write-back. `sourceIri`/`targetIri` must already be entities in the
 * document (this only creates the relation, not its endpoints).
 */
export function planAddRelation(
  documentText: string,
  baseIRI: string,
  existingIris: string[],
  sourceIri: string,
  targetIri: string,
  name: string,
): AddRelationPlan {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return { ok: false, reason: `document position index is unavailable: ${index.degradedReason}` };
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, reason: "a relation needs a name" };
  }
  if (!existingIris.includes(sourceIri) || !existingIris.includes(targetIri)) {
    return { ok: false, reason: "both endpoints must already be entities in the document" };
  }

  const newIri = mintIri(existingIris, baseIRI, trimmedName, "camelCase");
  const lines: StatementLine[] = [
    { predicateIri: RDF_TYPE, objectTurtle: `<${OWL_OBJECT_PROPERTY}>` },
    { predicateIri: RDFS_LABEL, objectTurtle: `"${escapeTurtleShortString(trimmedName)}"` },
    { predicateIri: RDFS_DOMAIN, objectTurtle: `<${sourceIri}>` },
    { predicateIri: RDFS_RANGE, objectTurtle: `<${targetIri}>` },
  ];

  const edit = planNewTopLevelStatement(documentText, newIri, lines);
  return { ok: true, newIri, edit, proposedText: splice(documentText, edit.span, edit.newText) };
}

export async function planAndVerifyAddRelation(
  documentText: string,
  baseIRI: string,
  existingIris: string[],
  sourceIri: string,
  targetIri: string,
  name: string,
): Promise<AddRelationPlan & { verified: boolean; verifyReason?: string }> {
  const plan = planAddRelation(documentText, baseIRI, existingIris, sourceIri, targetIri, name);
  if (!plan.ok || !plan.proposedText || !plan.newIri) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const result = await verifyProposedText(plan.proposedText, baseIRI, (quads) => {
    const hasType = quads.some(
      (q) => q.subject.value === plan.newIri && q.predicate.value === RDF_TYPE && q.object.value === OWL_OBJECT_PROPERTY,
    );
    if (!hasType) {
      return { ok: false, reason: "resulting document does not type the new predicate as owl:ObjectProperty" };
    }
    const hasDomain = quads.some((q) => q.subject.value === plan.newIri && q.predicate.value === RDFS_DOMAIN && q.object.value === sourceIri);
    const hasRange = quads.some((q) => q.subject.value === plan.newIri && q.predicate.value === RDFS_RANGE && q.object.value === targetIri);
    return hasDomain && hasRange
      ? { ok: true }
      : { ok: false, reason: "resulting document does not contain the expected rdfs:domain/rdfs:range triples" };
  });
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}
