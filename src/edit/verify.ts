import type { Quad } from "n3";
import { parseOntology } from "../rdf/parse";

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * The safety gate every diagram-originated write-back must pass through
 * (see DevPlan.md §4): re-parse the text we are ABOUT to write, and only
 * accept it if it both parses cleanly and produces the graph the caller
 * intended. Callers never write to the document themselves before this
 * returns `ok: true` — verification happens against the *proposed* text,
 * before any `WorkspaceEdit` is applied.
 */
export async function verifyProposedText(
  proposedText: string,
  baseIRI: string,
  expectation: (quads: Quad[]) => VerifyResult,
): Promise<VerifyResult> {
  const parsed = await parseOntology(proposedText, "turtle", baseIRI);
  if (parsed.errors.length > 0) {
    return { ok: false, reason: `edit would produce invalid Turtle: ${parsed.errors[0].message}` };
  }
  return expectation(parsed.quads);
}

export function quadMatches(
  quad: Quad,
  subject: string,
  predicate: string,
  objectValue: string,
  language?: string,
  datatype?: string,
): boolean {
  if (quad.subject.value !== subject || quad.predicate.value !== predicate) {
    return false;
  }
  if (quad.object.termType !== "Literal") {
    return false;
  }
  if (quad.object.value !== objectValue) {
    return false;
  }
  if ((language ?? "") !== quad.object.language) {
    return false;
  }
  if (datatype && quad.object.datatype.value !== datatype) {
    return false;
  }
  return true;
}
