/** File names this extension claims as Object Ontology documents. */
export const OBJECT_ONTOLOGY_FILE_PATTERN = /\.oont\.(ya?ml|json)$/i;

/** Glob form of {@link OBJECT_ONTOLOGY_FILE_PATTERN}, for document selectors. */
export const OBJECT_ONTOLOGY_GLOB = "**/*.oont.{yaml,yml,json}";

const MARKER = /^\s*(?:#[^\n]*\n\s*)*\{?\s*["']?objectOntology["']?\s*:/;
const SNIFF_LENGTH = 4096;

export type ObjectOntologySyntax = "yaml" | "json";

/**
 * Decides whether a document is an Object Ontology, and in which syntax.
 *
 * The file name is authoritative (`*.oont.yaml`, `*.oont.json`). Untitled
 * documents — e.g. a sample opened via "New sample" — have no useful name,
 * so a YAML/JSON document whose first key is `objectOntology` also counts.
 * Bare `.yaml`/`.json` files are otherwise never claimed. `text` may be a
 * function so callers can defer reading the document until it matters.
 */
export function detectObjectOntology(
  fileName: string,
  languageId: string,
  text: string | (() => string),
): ObjectOntologySyntax | undefined {
  const byName = OBJECT_ONTOLOGY_FILE_PATTERN.exec(fileName);
  if (byName) {
    return byName[1].toLowerCase() === "json" ? "json" : "yaml";
  }
  if (languageId !== "yaml" && languageId !== "json" && languageId !== "jsonc") {
    return undefined;
  }
  // Only read the text once the cheap checks pass: RDF documents (and any
  // other language) never pay for a copy of their contents here.
  const head = typeof text === "function" ? text() : text;
  if (!MARKER.test(head.slice(0, SNIFF_LENGTH))) {
    return undefined;
  }
  return languageId === "yaml" ? "yaml" : "json";
}
