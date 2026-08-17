import { buildPositionIndex } from "../rdf/positionIndex";
import { OWL_CLASS, RDFS_COMMENT, RDFS_LABEL, RDF_TYPE } from "../rdf/vocabulary";
import { planNewTopLevelStatement, type StatementLine } from "./addStatement";
import { mintIri } from "./mintIri";
import { escapeTurtleShortString, splice, type TextEdit } from "./textEdit";
import { verifyProposedText } from "./verify";

export interface AddClassPlan {
  ok: boolean;
  reason?: string;
  newIri?: string;
  edit?: TextEdit;
  proposedText?: string;
}

/**
 * Plans a brand-new `owl:Class` statement (`<newIri> a owl:Class ;
 * rdfs:label "..." [; rdfs:comment "..."] .`) appended at the end of the
 * document. `existingIris` should be every entity IRI already in the
 * document (the schema model's entity ids) — used both to pick the
 * namespace new entities land in and to avoid minting a colliding IRI.
 */
export function planAddClass(
  documentText: string,
  baseIRI: string,
  existingIris: string[],
  name: string,
  description?: string,
): AddClassPlan {
  const index = buildPositionIndex(documentText, baseIRI);
  if (index.degraded) {
    return { ok: false, reason: `document position index is unavailable: ${index.degradedReason}` };
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, reason: "a class needs a name" };
  }

  const newIri = mintIri(existingIris, baseIRI, trimmedName, "PascalCase");
  const lines: StatementLine[] = [
    { predicateIri: RDF_TYPE, objectTurtle: `<${OWL_CLASS}>` },
    { predicateIri: RDFS_LABEL, objectTurtle: `"${escapeTurtleShortString(trimmedName)}"` },
  ];
  const trimmedDescription = description?.trim();
  if (trimmedDescription) {
    lines.push({ predicateIri: RDFS_COMMENT, objectTurtle: `"${escapeTurtleShortString(trimmedDescription)}"` });
  }

  const edit = planNewTopLevelStatement(documentText, newIri, lines);
  return { ok: true, newIri, edit, proposedText: splice(documentText, edit.span, edit.newText) };
}

export async function planAndVerifyAddClass(
  documentText: string,
  baseIRI: string,
  existingIris: string[],
  name: string,
  description?: string,
): Promise<AddClassPlan & { verified: boolean; verifyReason?: string }> {
  const plan = planAddClass(documentText, baseIRI, existingIris, name, description);
  if (!plan.ok || !plan.proposedText || !plan.newIri) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const trimmedName = name.trim();
  const result = await verifyProposedText(plan.proposedText, baseIRI, (quads) => {
    const hasType = quads.some((q) => q.subject.value === plan.newIri && q.predicate.value === RDF_TYPE && q.object.value === OWL_CLASS);
    if (!hasType) {
      return { ok: false, reason: "resulting document does not type the new subject as owl:Class" };
    }
    const hasLabel = quads.some(
      (q) => q.subject.value === plan.newIri && q.predicate.value === RDFS_LABEL && q.object.value === trimmedName,
    );
    return hasLabel ? { ok: true } : { ok: false, reason: "resulting document does not contain the expected rdfs:label triple" };
  });
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}
