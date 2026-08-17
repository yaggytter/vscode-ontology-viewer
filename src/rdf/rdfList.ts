import type { Quad, Quad_Object } from "n3";
import { RDF_FIRST, RDF_REST } from "./vocabulary";

/**
 * Walks an RDF collection (`( :A :B :C )`, desugared by every parser into an
 * `rdf:first`/`rdf:rest` blank-node chain) starting at `head` and returns
 * the IRIs of its NamedNode members. Non-NamedNode members (nested lists,
 * literals) are skipped rather than causing a failure — callers that need
 * only named members (e.g. `owl:unionOf` class expansion) get a best-effort
 * result instead of nothing.
 *
 * Guards against malformed input: a head that isn't a blank node yields an
 * empty list, and a cycle in `rdf:rest` (which would otherwise loop forever)
 * is broken via a visited-set check.
 */
export function readRdfList(quads: Quad[], head: Quad_Object): string[] {
  const members: string[] = [];
  const visited = new Set<string>();
  let current = head;

  while (current.termType === "BlankNode") {
    if (visited.has(current.value)) {
      break;
    }
    visited.add(current.value);

    const firstQuad = quads.find(
      (q) => q.subject.termType === "BlankNode" && q.subject.value === current.value && q.predicate.value === RDF_FIRST,
    );
    if (!firstQuad) {
      break;
    }
    if (firstQuad.object.termType === "NamedNode") {
      members.push(firstQuad.object.value);
    }

    const restQuad = quads.find(
      (q) => q.subject.termType === "BlankNode" && q.subject.value === current.value && q.predicate.value === RDF_REST,
    );
    if (!restQuad) {
      break;
    }
    current = restQuad.object;
  }

  return members;
}
