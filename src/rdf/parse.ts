import * as N3 from "n3";
import { Readable } from "node:stream";
import { RdfXmlParser } from "rdfxml-streaming-parser";
import { JsonLdParser } from "jsonld-streaming-parser";

export type OntologyFormat = "turtle" | "trig" | "ntriples" | "notation3" | "rdfxml" | "jsonld";

const FORMAT_BY_LANGUAGE_ID: Record<string, OntologyFormat> = {
  turtle: "turtle",
  trig: "trig",
  ntriples: "ntriples",
  notation3: "notation3",
  rdfxml: "rdfxml",
  jsonld: "jsonld",
};

const FORMAT_BY_EXTENSION: Record<string, OntologyFormat> = {
  ".ttl": "turtle",
  ".turtle": "turtle",
  ".trig": "trig",
  ".nt": "ntriples",
  ".n3": "notation3",
  ".rdf": "rdfxml",
  ".owl": "rdfxml",
  ".jsonld": "jsonld",
};

/** N3.Parser's `format` option string per serialization (drives its internal grammar mode). */
const N3_PARSER_FORMAT: Partial<Record<OntologyFormat, string>> = {
  turtle: "Turtle",
  trig: "TriG",
  ntriples: "N-Triples",
  notation3: "Notation3",
};

export function detectFormatFromLanguageId(languageId: string): OntologyFormat | undefined {
  return FORMAT_BY_LANGUAGE_ID[languageId];
}

export function detectFormatFromExtension(fileName: string): OntologyFormat | undefined {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) {
    return undefined;
  }
  return FORMAT_BY_EXTENSION[fileName.slice(dot).toLowerCase()];
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export interface ParsedOntology {
  format: OntologyFormat;
  quads: N3.Quad[];
  /** Prefixes declared anywhere in the document (best-effort union; last write wins for a given key). */
  prefixes: Record<string, string>;
  baseIRI: string;
  errors: ParseError[];
}

/**
 * Parses ontology source text into RDF/JS quads, dispatching to the right
 * library for the serialization. This is the single entry point both the
 * graph model (all formats) and the position index (Turtle only) build on.
 */
export async function parseOntology(
  text: string,
  format: OntologyFormat,
  baseIRI: string,
): Promise<ParsedOntology> {
  switch (format) {
    case "turtle":
    case "trig":
    case "ntriples":
    case "notation3":
      return parseWithN3(text, format, baseIRI);
    case "rdfxml":
      return parseWithStream(text, format, baseIRI, () => new RdfXmlParser({ baseIRI }));
    case "jsonld":
      return parseWithStream(text, format, baseIRI, () => new JsonLdParser({ baseIRI }));
  }
}

async function parseWithN3(text: string, format: OntologyFormat, baseIRI: string): Promise<ParsedOntology> {
  const parser = new N3.Parser({ format: N3_PARSER_FORMAT[format], baseIRI });
  const { quads, prefixes, errors } = await parseAllOrPartial(parser, text);
  return { format, quads, prefixes, baseIRI, errors };
}

/**
 * n3's callback-based `parse` is asynchronous (it never resolves anything
 * synchronously — verified empirically: quads/prefixes were still empty
 * immediately after the call returned) and reports quads incrementally, so
 * we keep whatever was produced before a syntax error instead of losing the
 * whole document to one bad line. Once an error fires, n3 does not call
 * back again (no further quads, no final "done" callback) — also verified
 * empirically — so an error is itself the terminal event here.
 */
function parseAllOrPartial(
  parser: N3.Parser,
  text: string,
): Promise<{ quads: N3.Quad[]; prefixes: Record<string, string>; errors: ParseError[] }> {
  const quads: N3.Quad[] = [];
  const prefixes: Record<string, string> = {};
  const errors: ParseError[] = [];

  return new Promise((resolve) => {
    (
      parser.parse as unknown as (
        input: string,
        onQuad: (error: Error | null, quad: N3.Quad | null, prefixes?: Record<string, string>) => void,
        onPrefix?: (prefix: string, iri: N3.NamedNode) => void,
      ) => void
    )(
      text,
      (error, quad) => {
        if (error) {
          errors.push(toParseError(error));
          resolve({ quads, prefixes, errors });
          return;
        }
        if (quad) {
          quads.push(quad);
          return;
        }
        // quad === null && error === null: parsing finished successfully.
        resolve({ quads, prefixes, errors });
      },
      (prefix, iri) => {
        prefixes[prefix] = iri.value;
      },
    );
  });
}

async function parseWithStream(
  text: string,
  format: OntologyFormat,
  baseIRI: string,
  makeParser: () => import("node:stream").Transform,
): Promise<ParsedOntology> {
  const quads: N3.Quad[] = [];
  const errors: ParseError[] = [];

  await new Promise<void>((resolve) => {
    const parser = makeParser();
    Readable.from([text])
      .pipe(parser)
      .on("data", (quad: N3.Quad) => quads.push(quad))
      .on("error", (error: Error) => {
        errors.push(toParseError(error));
        resolve();
      })
      .on("end", () => resolve());
  });

  return { format, quads, prefixes: {}, baseIRI, errors };
}

function toParseError(error: unknown): ParseError {
  const message = error instanceof Error ? error.message : String(error);
  // N3 syntax errors look like: "Unexpected \".\" on line 3."
  const match = /line (\d+)(?:\s*(?:,|:)?\s*column (\d+))?/i.exec(message);
  return {
    message,
    line: match ? Number(match[1]) : undefined,
    column: match?.[2] ? Number(match[2]) : undefined,
  };
}
