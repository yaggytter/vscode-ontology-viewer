import type { Quad } from "n3";
import { RDF_TYPE } from "../rdf/vocabulary";
import type { SparqlResult, SparqlTerm } from "./resultModel";

/**
 * The resources a query result points at, plus the types that let a view
 * without a node for the resource itself still show the match.
 */
export interface MatchedResources {
  /**
   * Node ids (resolved IRIs, or `_:label` for blank nodes — matching
   * src/rdf/graphModel.ts's id scheme) of every resource the result matched.
   */
  iris: string[];
  /**
   * `rdf:type` IRIs per matched resource. The schema view draws classes, not
   * individuals, so an instance-level match needs its class to be visible
   * anywhere on that diagram.
   */
  types: Record<string, string[]>;
}

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const RDF_LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

/**
 * Distinguishes literal terms that differ only by language or datatype,
 * normalized per RDF 1.1: a plain literal *is* an `xsd:string`, and a
 * language-tagged literal's datatype is always `rdf:langString` and therefore
 * carries no information beyond the tag. Without this normalization a result
 * cell that reports `"Alice"^^xsd:string` would fail to match the very quad it
 * came from if that quad were written as a plain `"Alice"`.
 */
function literalKey(value: string, language: string | undefined, datatype: string | undefined): string {
  if (language) {
    return `${value}\u0000${language}\u0000${RDF_LANG_STRING}`;
  }
  return `${value}\u0000\u0000${datatype ?? XSD_STRING}`;
}

function quadSubjectId(quad: Quad): string {
  return quad.subject.termType === "BlankNode" ? `_:${quad.subject.value}` : quad.subject.value;
}

/**
 * Resolves a SPARQL result into the diagram resources it implies.
 *
 * Two things make this more than "collect the IRIs in the result", both of
 * which the naive version got wrong:
 *
 *  - **Literal-only projections.** A perfectly ordinary query such as
 *    `SELECT ?label WHERE { ?s a :Stall ; rdfs:label ?label }` never binds an
 *    IRI in its projection, yet the user clearly means "the stalls". Each
 *    literal is therefore resolved back to the subjects that carry that exact
 *    term (value plus language plus datatype), recovering the resource the
 *    query was really about without having to re-parse or rewrite the query.
 *  - **Instance matches in a class diagram.** Matching `:pierStall` is useless
 *    on a schema diagram whose nodes are `:Stall`, `:Product`, ... so every
 *    matched resource also reports its `rdf:type`. Choosing between the
 *    resource and its type is left to the view (see
 *    webview/graph/sparqlHighlight.ts) — only the view knows which ids it drew.
 *
 * Predicate IRIs from CONSTRUCT results are included: the schema view draws
 * relations as edges keyed by predicate IRI, so they are legitimately
 * highlightable even though they are not nodes.
 */
export function resolveMatchedResources(quads: Quad[], result: SparqlResult): MatchedResources {
  const terms = collectResultTerms(result);
  if (terms.length === 0) {
    return { iris: [], types: {} };
  }

  const matched = new Set<string>();
  const literalTerms: SparqlTerm[] = [];

  for (const term of terms) {
    if (term.termKind === "NamedNode") {
      matched.add(term.value);
    } else if (term.termKind === "BlankNode") {
      matched.add(`_:${term.value}`);
    } else {
      literalTerms.push(term);
    }
  }

  if (literalTerms.length > 0) {
    const subjectsByLiteral = indexSubjectsByLiteral(quads);
    for (const literal of literalTerms) {
      const subjects = subjectsByLiteral.get(literalKey(literal.value, literal.language, literal.datatype));
      for (const subject of subjects ?? []) {
        matched.add(subject);
      }
    }
  }

  return { iris: [...matched], types: collectTypes(quads, matched) };
}

/** Every term appearing anywhere in a result, in no particular order. */
function collectResultTerms(result: SparqlResult): SparqlTerm[] {
  switch (result.kind) {
    case "bindings":
      return result.rows.flatMap((row) => Object.values(row));
    case "quads":
      return result.triples.flatMap((t) => [t.subject, t.predicate, t.object]);
    case "boolean":
      // A boolean names no resource.
      return [];
  }
}

/** literalKey -> subject node ids carrying that literal. */
function indexSubjectsByLiteral(quads: Quad[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const quad of quads) {
    if (quad.object.termType !== "Literal") {
      continue;
    }
    const key = literalKey(quad.object.value, quad.object.language || undefined, quad.object.datatype?.value);
    const subjectId = quadSubjectId(quad);
    const existing = index.get(key);
    if (existing) {
      if (!existing.includes(subjectId)) {
        existing.push(subjectId);
      }
    } else {
      index.set(key, [subjectId]);
    }
  }
  return index;
}

/** rdf:type IRIs for each matched resource (absent entries are simply omitted). */
function collectTypes(quads: Quad[], matched: Set<string>): Record<string, string[]> {
  const types: Record<string, string[]> = {};
  for (const quad of quads) {
    if (quad.predicate.value !== RDF_TYPE || quad.object.termType !== "NamedNode") {
      continue;
    }
    const subjectId = quadSubjectId(quad);
    if (!matched.has(subjectId)) {
      continue;
    }
    const existing = types[subjectId];
    if (existing) {
      if (!existing.includes(quad.object.value)) {
        existing.push(quad.object.value);
      }
    } else {
      types[subjectId] = [quad.object.value];
    }
  }
  return types;
}
