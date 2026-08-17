import { RDFS_COMMENT } from "../rdf/vocabulary";
import { quadMatches, verifyProposedText } from "./verify";
import { computeEditablePredicateSubjects, planSetLiteralPredicate, type SetLiteralPlan } from "./setLiteralPredicate";

export type CommentEditPlan = SetLiteralPlan;

/** `rdfs:comment`-specific entry point over the shared `planSetLiteralPredicate` — mirrors `editLiteral.ts`. */
export function planCommentEdit(documentText: string, baseIRI: string, subjectIri: string, newComment: string): CommentEditPlan {
  return planSetLiteralPredicate(documentText, baseIRI, subjectIri, RDFS_COMMENT, newComment);
}

export async function planAndVerifyCommentEdit(
  documentText: string,
  baseIRI: string,
  subjectIri: string,
  newComment: string,
): Promise<CommentEditPlan & { verified: boolean; verifyReason?: string }> {
  const plan = planCommentEdit(documentText, baseIRI, subjectIri, newComment);
  if (!plan.ok || !plan.proposedText) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const result = await verifyProposedText(plan.proposedText, baseIRI, (quads) => {
    const found = quads.some((q) =>
      quadMatches(q, subjectIri, RDFS_COMMENT, newComment, plan.expectedLanguage, plan.expectedDatatype),
    );
    return found ? { ok: true } : { ok: false, reason: "resulting document does not contain the expected rdfs:comment triple" };
  });
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}

export function computeCommentEditableSubjects(documentText: string, baseIRI: string, candidateIds: string[]): Set<string> {
  return computeEditablePredicateSubjects(documentText, baseIRI, RDFS_COMMENT, candidateIds);
}
