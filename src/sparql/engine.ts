import * as N3 from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs";
import type { Quad } from "n3";
import type {
  SparqlResult,
  SparqlTerm,
  SparqlTriple,
} from "./resultModel";

/**
 * Runs a SPARQL query over an in-memory set of parsed quads and normalizes
 * the result into a serialization-safe {@link SparqlResult}.
 *
 * The extension host owns query execution (Comunica is a Node-side
 * dependency); the webview only ever sees the plain-object result, which is
 * why every RDF/JS `Term` is flattened here rather than posted across the
 * message boundary as-is (RDF/JS Terms are class instances and would fail
 * structured clone).
 *
 * A fresh {@link N3.Store} and {@link QueryEngine} are created per call. The
 * result sets this viewer deals with are small (a single open document), so
 * the simplicity of a stateless call outweighs caching; callers that need to
 * run many queries against one document can be optimized later behind this
 * same signature.
 */
export async function runSparqlQuery(quads: Quad[], query: string): Promise<SparqlResult> {
  const store = new N3.Store();
  for (const quad of quads) {
    store.addQuad(quad);
  }

  const engine = new QueryEngine();
  // n3's hand-written Store type omits the RDF/JS `Source` surface Comunica
  // requires (`match`, async iteration); the runtime object implements it.
  const context = { sources: [store] } as unknown as Parameters<QueryEngine["query"]>[1];

  const result = await engine.query(query, context);

  switch (result.resultType) {
    case "boolean": {
      const value = await result.execute();
      return { kind: "boolean", value };
    }
    case "bindings": {
      const metadata = await result.metadata();
      const variables = metadata.variables.map((v) => v.value);
      const stream = await result.execute();
      const bindings = await stream.toArray();
      const rows = bindings.map((binding) => {
        const row: Record<string, SparqlTerm> = {};
        for (const variable of variables) {
          const term = binding.get(variable);
          if (term) {
            row[variable] = toSparqlTerm(term);
          }
        }
        return row;
      });
      return { kind: "bindings", variables, rows };
    }
    case "quads": {
      const stream = await result.execute();
      const producedQuads = await stream.toArray();
      const triples: SparqlTriple[] = producedQuads.map((quad) => ({
        subject: toSparqlTerm(quad.subject),
        predicate: toSparqlTerm(quad.predicate),
        object: toSparqlTerm(quad.object),
      }));
      return { kind: "quads", triples };
    }
    default:
      throw new Error(`Unsupported SPARQL result type: ${String(result.resultType)}`);
  }
}

/** Minimal structural shape of an RDF/JS term, enough to flatten one. */
interface RdfJsTermLike {
  termType: string;
  value: string;
  language?: string;
  datatype?: { value: string };
}

/**
 * Flattens an RDF/JS term into a plain {@link SparqlTerm}. Only NamedNode,
 * BlankNode, and Literal can appear in subject/predicate/object or a binding
 * cell for the queries this viewer runs; anything else (Variable,
 * DefaultGraph, Quad) is coerced to a NamedNode-shaped fallback so the UI has
 * a value to show rather than crashing.
 */
function toSparqlTerm(term: RdfJsTermLike): SparqlTerm {
  switch (term.termType) {
    case "NamedNode":
      return { termKind: "NamedNode", value: term.value };
    case "BlankNode":
      return { termKind: "BlankNode", value: term.value };
    case "Literal":
      return {
        termKind: "Literal",
        value: term.value,
        datatype: term.datatype?.value,
        language: term.language ? term.language : undefined,
      };
    default:
      return { termKind: "NamedNode", value: term.value };
  }
}
