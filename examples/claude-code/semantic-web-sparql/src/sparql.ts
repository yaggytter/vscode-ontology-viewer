import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { QueryEngine } from "@comunica/query-sparql-rdfjs";
import type * as RDF from "@rdfjs/types";
import { Parser, Store, Writer, type Quad } from "n3";

/**
 * Runs a SPARQL query over local Turtle files and prints the result as text
 * an agent (and you) can read: a Markdown table for SELECT, true/false for
 * ASK, Turtle for CONSTRUCT/DESCRIBE.
 *
 *   npm run --silent sparql -- data/product-compatibility.ttl -q 'ASK { ... }'
 *   npm run --silent sparql -- data/a.ttl data/b.ttl -f query.rq
 *
 * It uses the same engine as the Ontology Viewer's SPARQL panel (Comunica
 * over an in-memory store), so a query that works here works in the panel.
 * Several files are loaded into one graph, which is how you query an
 * exported Object Ontology together with a glossary.
 *
 * Only the named files are read. The engine has no HTTP support, so nothing
 * can reach the network; SERVICE, LOAD and FROM are rejected up front with a
 * clear message instead of failing or silently returning no rows.
 */

const XSD = "http://www.w3.org/2001/XMLSchema#";

export interface LoadedGraph {
  store: Store;
  /** Prefix -> namespace, from every file's @prefix lines; a prefix bound differently in two files is dropped. */
  prefixes: Record<string, string>;
}

export function loadTurtle(paths: string[]): LoadedGraph {
  const store = new Store();
  const prefixes: Record<string, string> = {};
  const conflicting = new Set<string>();
  for (const path of paths) {
    const absolute = resolve(path);
    const parser = new Parser({ baseIRI: pathToFileURL(absolute).href });
    const quads = parser.parse(readFileSync(absolute, "utf8"), null, (prefix, namespace) => {
      const iri = typeof namespace === "string" ? namespace : namespace.value;
      if (prefix in prefixes && prefixes[prefix] !== iri) {
        conflicting.add(prefix);
      }
      prefixes[prefix] = iri;
    });
    store.addQuads(quads as Quad[]);
  }
  for (const prefix of conflicting) {
    delete prefixes[prefix];
  }
  return { store, prefixes };
}

/** Rejects clauses that point outside the files on the command line. */
export function refuseRemoteClauses(query: string): void {
  const code = query.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|<[^>\s]*>|#[^\n]*|[?$][A-Za-z0-9_]+/g, " ");
  if (/\b(?:SERVICE|LOAD)\b/i.test(code)) {
    throw new Error("This command only queries the local files you pass it; SERVICE and LOAD are not allowed.");
  }
  if (/\bFROM\b/i.test(code)) {
    throw new Error("Remove FROM / FROM NAMED: every file you pass is already loaded into the default graph.");
  }
}

function compactIri(iri: string, prefixes: Record<string, string>): string {
  let best: [string, string] | undefined;
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (iri.startsWith(namespace) && namespace.length > (best?.[1].length ?? 0)) {
      best = [prefix, namespace];
    }
  }
  if (best) {
    const local = iri.slice(best[1].length);
    if (/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(local) && !local.endsWith(".")) {
      return `${best[0]}:${local}`;
    }
  }
  return `<${iri}>`;
}

export function formatTerm(term: RDF.Term, prefixes: Record<string, string>): string {
  if (term.termType === "NamedNode") {
    return compactIri(term.value, prefixes);
  }
  if (term.termType === "BlankNode") {
    return `_:${term.value}`;
  }
  if (term.termType === "Literal") {
    if (term.language) {
      return `"${term.value}"@${term.language}`;
    }
    const datatype = term.datatype.value;
    if (datatype === `${XSD}string` || [`${XSD}integer`, `${XSD}decimal`, `${XSD}boolean`].includes(datatype)) {
      return term.value;
    }
    return `"${term.value}"^^${compactIri(datatype, { ...prefixes, xsd: XSD })}`;
  }
  return term.value;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Runs the query and returns the printed result. */
export async function runQuery(graph: LoadedGraph, query: string): Promise<string> {
  refuseRemoteClauses(query);
  const engine = new QueryEngine();
  // n3's Store type omits the RDF/JS Source surface Comunica checks for; the runtime object has it.
  const context = { sources: [graph.store] } as unknown as Parameters<QueryEngine["query"]>[1];
  const result = await engine.query(query, context);

  if (result.resultType === "boolean") {
    return String(await result.execute());
  }
  if (result.resultType === "bindings") {
    const variables = (await result.metadata()).variables.map((v) => v.value);
    const rows = await (await result.execute()).toArray();
    const lines = [`${rows.length} ${rows.length === 1 ? "row" : "rows"}`, ""];
    lines.push(`| ${variables.join(" | ")} |`, `| ${variables.map(() => "---").join(" | ")} |`);
    for (const row of rows) {
      lines.push(`| ${variables.map((v) => { const term = row.get(v); return term ? cell(formatTerm(term, graph.prefixes)) : ""; }).join(" | ")} |`);
    }
    return lines.join("\n");
  }
  if (result.resultType === "quads") {
    const quads = await (await result.execute()).toArray();
    const writer = new Writer({ prefixes: graph.prefixes });
    writer.addQuads(quads as Quad[]);
    return new Promise((done, fail) => writer.end((error, text) => (error ? fail(error) : done(`${quads.length} triples\n\n${text}`))));
  }
  throw new Error(`Unsupported result type: ${result.resultType}`);
}

function usage(): never {
  console.error("Usage: npm run --silent sparql -- <file.ttl>... (-q '<query>' | -f <query.rq>)");
  process.exit(2);
}

async function main(argv: string[]): Promise<void> {
  const files: string[] = [];
  let query: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-q") {
      query = argv[++i];
    } else if (argv[i] === "-f") {
      query = readFileSync(argv[++i] ?? "", "utf8");
    } else {
      files.push(argv[i]);
    }
  }
  if (files.length === 0 || !query) {
    usage();
  }
  console.log(await runQuery(loadTurtle(files), query));
}

if (import.meta.filename === resolve(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
