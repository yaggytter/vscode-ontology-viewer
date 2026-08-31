/**
 * The example queries offered by the SPARQL panel, as language-neutral text.
 *
 * Deliberately free of any `vscode` import so the set can be unit-tested by
 * actually executing every query (see sampleQueries.test.ts) — a broken
 * beginner example is worse than none. Localized names and descriptions are
 * attached separately in src/preview/sparqlSamples.ts.
 */

/**
 * Prefixes every sample declares so it is self-contained and can be run, or
 * copied elsewhere, without editing. Only standard vocabularies appear here: a
 * sample must work against *any* open ontology, so it can never assume a
 * document-specific namespace.
 */
const STANDARD_PREFIXES = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>`;

export interface SparqlSampleQuery {
  id: string;
  query: string;
}

function withPrefixes(id: string, body: string): SparqlSampleQuery {
  return { id, query: `${STANDARD_PREFIXES}\n\n${body.trim()}\n` };
}

/**
 * Ordered as a beginner-first ladder rather than alphabetically: it opens with
 * the smallest query that returns something against any document, then adds
 * one idea at a time — typed patterns, OPTIONAL, FILTER, aggregation, ASK,
 * CONSTRUCT.
 */
export const SPARQL_SAMPLE_QUERIES: readonly SparqlSampleQuery[] = [
  withPrefixes(
    "first-triples",
    `SELECT ?subject ?predicate ?object
WHERE {
  ?subject ?predicate ?object .
}
LIMIT 20`,
  ),
  withPrefixes(
    "all-classes",
    `SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  OPTIONAL { ?class rdfs:label ?label }
}`,
  ),
  withPrefixes(
    "instances-by-class",
    `SELECT ?instance ?class
WHERE {
  ?instance a ?class .
  FILTER(!STRSTARTS(STR(?class), "http://www.w3.org/2002/07/owl#"))
  FILTER(!STRSTARTS(STR(?class), "http://www.w3.org/2000/01/rdf-schema#"))
}`,
  ),
  withPrefixes(
    "count-per-class",
    `SELECT ?class (COUNT(?instance) AS ?instances)
WHERE {
  ?instance a ?class .
}
GROUP BY ?class
ORDER BY DESC(?instances)`,
  ),
  withPrefixes(
    "class-hierarchy",
    `SELECT ?subclass ?superclass
WHERE {
  ?subclass rdfs:subClassOf ?superclass .
}`,
  ),
  withPrefixes(
    "relations",
    `SELECT ?relation ?domain ?range
WHERE {
  ?relation a owl:ObjectProperty .
  OPTIONAL { ?relation rdfs:domain ?domain }
  OPTIONAL { ?relation rdfs:range ?range }
}`,
  ),
  withPrefixes(
    "search-labels",
    `SELECT ?resource ?label
WHERE {
  ?resource rdfs:label ?label .
  FILTER(CONTAINS(LCASE(STR(?label)), "a"))
}`,
  ),
  withPrefixes(
    "ask-has-classes",
    `ASK {
  ?class a owl:Class .
}`,
  ),
  withPrefixes(
    "construct-links",
    `CONSTRUCT {
  ?subject ?predicate ?object
}
WHERE {
  ?subject ?predicate ?object .
  FILTER(isIRI(?object))
}
LIMIT 50`,
  ),
];
