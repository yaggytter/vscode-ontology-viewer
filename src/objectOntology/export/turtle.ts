import { Writer } from "n3";
import type { ObjectOntology } from "../model";
import { objectOntologyPrefixes, objectOntologyToQuads } from "../toQuads";

/**
 * Serializes an Object Ontology's RDF projection as Turtle — the bridge for
 * hybrid setups that keep operational types here and shared vocabularies
 * (SKOS, DCAT, schema.org …) on the Semantic Web side: the exported file opens
 * in this viewer's Turtle editor and joins other RDF in one SPARQL store.
 */
export function objectOntologyToTurtle(ontology: ObjectOntology): Promise<string> {
  const writer = new Writer({ prefixes: objectOntologyPrefixes(ontology) });
  writer.addQuads(objectOntologyToQuads(ontology));
  return new Promise((resolve, reject) => {
    writer.end((error, result) => (error ? reject(error) : resolve(result)));
  });
}
