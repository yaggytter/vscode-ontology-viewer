/**
 * Language ids this extension recognizes, split by write-back capability.
 *
 * Only Turtle has a position index precise enough to survive round-trip
 * editing safely (see src/rdf/positionIndex.ts). Every other serialization
 * is diagram-viewable but not diagram-editable in v1; see DevPlan.md §2.
 */
export const EDITABLE_LANGUAGES = ["turtle"] as const;

export const VIEWABLE_ONLY_LANGUAGES = ["trig", "ntriples", "notation3", "rdfxml", "jsonld"] as const;

export const ALL_ONTOLOGY_LANGUAGES = [...EDITABLE_LANGUAGES, ...VIEWABLE_ONLY_LANGUAGES] as const;

export type OntologyLanguageId = (typeof ALL_ONTOLOGY_LANGUAGES)[number];

export function isOntologyLanguage(languageId: string): languageId is OntologyLanguageId {
  return (ALL_ONTOLOGY_LANGUAGES as readonly string[]).includes(languageId);
}

export function isEditableLanguage(languageId: string): boolean {
  return (EDITABLE_LANGUAGES as readonly string[]).includes(languageId);
}
