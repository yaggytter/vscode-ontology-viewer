import type { SparqlResult, SparqlTerm } from "./resultModel";

/**
 * Derives the set of IRIs a query result implies should be highlighted (or
 * kept, in filter mode) in the diagram. The rule set is intentionally simple
 * and matches how the graph model assigns node ids (see
 * src/rdf/graphModel.ts): only NamedNode IRIs can name a diagram node, so
 * literals and blank nodes never contribute.
 *
 * - SELECT: every NamedNode cell across all solutions.
 * - CONSTRUCT/DESCRIBE: subject and object IRIs of each produced triple.
 *   Predicates are edge labels, not nodes, so they are excluded.
 * - ASK: nothing — the result is a single boolean with no entities to point at.
 *
 * The returned IRIs are matched against `OntologyNode.id` on the webview
 * side; IRIs with no corresponding node are simply ignored there.
 */
export function extractHighlightIris(result: SparqlResult): Set<string> {
  const iris = new Set<string>();

  const addIfNamed = (term: SparqlTerm | undefined): void => {
    if (term?.termKind === "NamedNode") {
      iris.add(term.value);
    }
  };

  switch (result.kind) {
    case "bindings":
      for (const row of result.rows) {
        for (const term of Object.values(row)) {
          addIfNamed(term);
        }
      }
      break;
    case "quads":
      for (const triple of result.triples) {
        addIfNamed(triple.subject);
        addIfNamed(triple.object);
      }
      break;
    case "boolean":
      // No entities to highlight.
      break;
  }

  return iris;
}
