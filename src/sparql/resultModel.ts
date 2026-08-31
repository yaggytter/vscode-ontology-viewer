/**
 * Serialization-safe representation of a SPARQL query result.
 *
 * Comunica/RDF-JS produce `Bindings` and `Term` objects that are not
 * structured-clone-safe and therefore cannot cross the extension-host →
 * webview `postMessage` boundary. This module defines a plain-object form
 * (`SparqlResult`) that the engine normalizes into and that the webview can
 * both render as text and mine for highlight IRIs. It intentionally has no
 * dependency on `n3` or Comunica so it can be imported from either side.
 */

/** The RDF term kinds a result cell can carry, mirrored from RDF/JS term types. */
export type SparqlTermKind = "NamedNode" | "BlankNode" | "Literal";

/**
 * One value in a SELECT/CONSTRUCT result, flattened to primitives. `value`
 * is the lexical form (IRI string, blank node label, or literal text);
 * `datatype`/`language` are only meaningful for literals.
 */
export interface SparqlTerm {
  termKind: SparqlTermKind;
  value: string;
  datatype?: string;
  language?: string;
}

/** A CONSTRUCT/DESCRIBE triple flattened to serialization-safe terms. */
export interface SparqlTriple {
  subject: SparqlTerm;
  predicate: SparqlTerm;
  object: SparqlTerm;
}

export interface SparqlSelectResult {
  kind: "bindings";
  /** Projection variables in declaration order (without the leading `?`). */
  variables: string[];
  /**
   * One row per solution. A variable absent from a solution (e.g. under
   * OPTIONAL) is omitted from the row's map rather than set to a null term.
   */
  rows: Array<Record<string, SparqlTerm>>;
}

export interface SparqlAskResult {
  kind: "boolean";
  value: boolean;
}

export interface SparqlConstructResult {
  kind: "quads";
  triples: SparqlTriple[];
}

export type SparqlResult = SparqlSelectResult | SparqlAskResult | SparqlConstructResult;
