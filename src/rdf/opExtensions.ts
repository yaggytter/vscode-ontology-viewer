import type { Quad } from "n3";
import { isKnownVocabularyIri } from "./vocabulary";

/** Falls back to the fragment/last-path-segment of an IRI. */
export function localName(iri: string): string {
  const hashIndex = iri.lastIndexOf("#");
  const slashIndex = iri.lastIndexOf("/");
  const cut = Math.max(hashIndex, slashIndex);
  return cut >= 0 && cut < iri.length - 1 ? iri.slice(cut + 1) : iri;
}

/**
 * Microsoft's Ontology-Playground annotates classes/properties with extra
 * predicates (`icon`, `color`, `isIdentifier`, `cardinality`, `fromEntityId`,
 * ...) written in the *document's own* base namespace — verified by fetching
 * a real Ontology-Playground catalogue file, whose `ont:` prefix is bound to
 * `xml:base` rather than any fixed IRI. There is no fixed namespace to match
 * on, so these can only be recognized by local name, scoped to a specific
 * subject. `isKnownVocabularyIri` excludes RDF/RDFS/OWL/XSD/SKOS/DCTERMS/FOAF
 * predicates from matching here, so e.g. an unrelated `dcterms:something`
 * never gets misread as one of these extensions.
 */
export function findOverrideLiteral(quads: Quad[], subject: string, candidateLocalNames: readonly string[]): string | undefined {
  for (const quad of quads) {
    if (quad.subject.value !== subject || quad.object.termType !== "Literal") {
      continue;
    }
    if (isKnownVocabularyIri(quad.predicate.value)) {
      continue;
    }
    if (candidateLocalNames.includes(localName(quad.predicate.value))) {
      return quad.object.value;
    }
  }
  return undefined;
}
