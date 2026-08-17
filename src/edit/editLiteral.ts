import { RDFS_LABEL } from "../rdf/vocabulary";
import { quadMatches, verifyProposedText } from "./verify";
import { computeEditablePredicateSubjects, planSetLiteralPredicate, type SetLiteralPlan } from "./setLiteralPredicate";

export type { TextEdit } from "./textEdit";
export { escapeTurtleShortString } from "./textEdit";

export type LabelEditPlan = SetLiteralPlan;

/** `rdfs:label`-specific entry point over the shared `planSetLiteralPredicate` — see that module for the actual logic. */
export function planLabelEdit(documentText: string, baseIRI: string, subjectIri: string, newLabel: string): LabelEditPlan {
  return planSetLiteralPredicate(documentText, baseIRI, subjectIri, RDFS_LABEL, newLabel);
}

/** Runs the full plan → verify pipeline; only a caller-applied `edit` that passed verification should ever be written. */
export async function planAndVerifyLabelEdit(
  documentText: string,
  baseIRI: string,
  subjectIri: string,
  newLabel: string,
): Promise<LabelEditPlan & { verified: boolean; verifyReason?: string }> {
  const plan = planLabelEdit(documentText, baseIRI, subjectIri, newLabel);
  if (!plan.ok || !plan.proposedText) {
    return { ...plan, verified: false, verifyReason: plan.reason };
  }
  const result = await verifyProposedText(plan.proposedText, baseIRI, (quads) => {
    const found = quads.some((q) =>
      quadMatches(q, subjectIri, RDFS_LABEL, newLabel, plan.expectedLanguage, plan.expectedDatatype),
    );
    return found ? { ok: true } : { ok: false, reason: "resulting document does not contain the expected rdfs:label triple" };
  });
  return { ...plan, verified: result.ok, verifyReason: result.reason };
}

/**
 * Cheap, index-reused editability check for the diagram UI (which node IDs
 * should render with the "edit name" affordance in the Inspector).
 */
export function computeEditableSubjects(documentText: string, baseIRI: string, candidateIds: string[]): Set<string> {
  return computeEditablePredicateSubjects(documentText, baseIRI, RDFS_LABEL, candidateIds);
}
