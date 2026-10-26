import type { SparqlSampleQuery } from "../sparql/sampleQueries";

/**
 * Example SPARQL queries for Object Ontology documents, run against the RDF
 * projection in ./toQuads.ts. Like the RDF samples they never assume a
 * document-specific namespace — only the `oont:` vocabulary — so each works
 * against any `*.oont.yaml` file. Every query is executed in
 * sampleQueries.test.ts; localized labels live in src/preview/sparqlSamples.ts.
 *
 * Each comment names the object-set operation (filter / searchAround /
 * aggregate) the query corresponds to, for readers coming from that style.
 */
const PREFIXES = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX oont: <urn:object-ontology:vocab#>`;

function withPrefixes(id: string, body: string): SparqlSampleQuery {
  return { id, query: `${PREFIXES}\n\n${body.trim()}\n` };
}

export const OBJECT_ONTOLOGY_SAMPLE_QUERIES: readonly SparqlSampleQuery[] = [
  withPrefixes(
    "oo-object-types",
    `# Every object type with its primary key and number of properties.
SELECT ?type ?label ?primaryKey (COUNT(?property) AS ?properties)
WHERE {
  ?type a oont:ObjectType ;
        rdfs:label ?label .
  OPTIONAL { ?type oont:primaryKey/oont:apiName ?primaryKey }
  OPTIONAL { ?property a oont:Property ; rdfs:domain ?type }
}
GROUP BY ?type ?label ?primaryKey
ORDER BY ?label`,
  ),
  withPrefixes(
    "oo-links",
    `# Link types: which object types they connect, and how many on each side.
SELECT ?link ?from ?fromName ?fromCardinality ?to ?toName ?toCardinality
WHERE {
  ?link a oont:LinkType ;
        oont:fromType ?from ;
        oont:toType ?to ;
        oont:fromSide ?fromSide ;
        oont:toSide ?toSide .
  ?fromSide oont:apiName ?fromName ; oont:cardinality ?fromCardinality .
  ?toSide oont:apiName ?toName ; oont:cardinality ?toCardinality .
}`,
  ),
  withPrefixes(
    "oo-actions-by-type",
    `# What can be done to each object type? (The tool list an agent would get.)
SELECT ?type ?action ?actionLabel
WHERE {
  ?action a oont:ActionType ;
          rdfs:label ?actionLabel ;
          oont:affects ?type .
}
ORDER BY ?type ?actionLabel`,
  ),
  withPrefixes(
    "oo-action-parameters",
    `# Every action parameter, its type, and whether it is required.
SELECT ?action ?parameter ?dataType ?objectType ?required
WHERE {
  ?action a oont:ActionType ;
          oont:parameter ?p .
  ?p oont:apiName ?parameter ;
     oont:dataType ?dataType ;
     oont:required ?required .
  OPTIONAL { ?p oont:objectType ?objectType }
}
ORDER BY ?action ?parameter`,
  ),
  withPrefixes(
    "oo-count-objects",
    `# Aggregate: how many example objects each type has.
SELECT ?type (COUNT(?object) AS ?objects)
WHERE {
  ?type a oont:ObjectType .
  ?object a ?type .
}
GROUP BY ?type
ORDER BY DESC(?objects)`,
  ),
  withPrefixes(
    "oo-search-around",
    `# searchAround: follow every link from each example object to its neighbours.
SELECT ?object ?link ?neighbour
WHERE {
  ?side a oont:LinkSide .
  ?object ?side ?neighbour .
  ?side rdfs:label ?link .
}
LIMIT 50`,
  ),
  withPrefixes(
    "oo-filter-objects",
    `# filter: example objects whose title contains a word (replace "e").
SELECT ?object ?type ?title
WHERE {
  ?type a oont:ObjectType .
  ?object a ?type ;
          rdfs:label ?title .
  FILTER(CONTAINS(LCASE(STR(?title)), "e"))
}`,
  ),
  withPrefixes(
    "oo-interfaces",
    `# Interfaces and the object types that implement them.
SELECT ?interface ?implementer
WHERE {
  ?interface a oont:Interface .
  OPTIONAL { ?implementer oont:implements ?interface }
}`,
  ),
];
