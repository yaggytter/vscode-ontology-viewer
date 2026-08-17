/**
 * Hand-written ambient types for the RDF parsing libraries this extension
 * uses. None of `n3`, `rdfxml-streaming-parser`, or `jsonld-streaming-parser`
 * ship their own .d.ts files, and the community `@types/n3` package targets
 * n3's 1.x API (this project pins n3 2.1.1), so a mismatched @types package
 * would silently type-check against the wrong surface. These declarations
 * cover only the surface this extension actually calls, verified empirically
 * against the installed package versions (see src/rdf/*.ts call sites).
 */
declare module "n3" {
  export type TermType = "NamedNode" | "BlankNode" | "Literal" | "DefaultGraph" | "Variable";

  export interface Term {
    termType: TermType;
    value: string;
    equals(other: Term | null | undefined): boolean;
  }

  export interface NamedNode extends Term {
    termType: "NamedNode";
  }

  export interface BlankNode extends Term {
    termType: "BlankNode";
  }

  export interface Literal extends Term {
    termType: "Literal";
    language: string;
    datatype: NamedNode;
  }

  export interface DefaultGraph extends Term {
    termType: "DefaultGraph";
  }

  export type Quad_Subject = NamedNode | BlankNode;
  export type Quad_Predicate = NamedNode;
  export type Quad_Object = NamedNode | BlankNode | Literal;
  export type Quad_Graph = NamedNode | BlankNode | DefaultGraph;

  export interface Quad {
    termType: "Quad";
    subject: Quad_Subject;
    predicate: Quad_Predicate;
    object: Quad_Object;
    graph: Quad_Graph;
    equals(other: Quad | null | undefined): boolean;
  }

  export interface ParserOptions {
    format?: string;
    baseIRI?: string;
    blankNodePrefix?: string;
  }

  export class Parser {
    constructor(options?: ParserOptions);
    parse(input: string): Quad[];
  }

  export interface WriterOptions {
    prefixes?: Record<string, string>;
    format?: string;
  }

  export class Writer {
    constructor(options?: WriterOptions);
    addQuad(quad: Quad): void;
    addQuads(quads: Quad[]): void;
    end(callback: (error: Error | null, result: string) => void): void;
  }

  export interface LexerToken {
    type: string;
    value: string;
    prefix: string;
    line: number;
    start: number;
    end: number;
  }

  export interface LexerOptions {
    lineMode?: boolean;
    n3?: boolean;
    comments?: boolean;
  }

  export class Lexer {
    constructor(options?: LexerOptions);
    tokenize(input: string): LexerToken[];
  }

  export const DataFactory: {
    namedNode(value: string): NamedNode;
    blankNode(value?: string): BlankNode;
    literal(value: string, languageOrDatatype?: string | NamedNode): Literal;
    defaultGraph(): DefaultGraph;
  };
}

declare module "rdfxml-streaming-parser" {
  import { Transform } from "node:stream";
  import type { Quad } from "n3";

  export interface RdfXmlParserOptions {
    baseIRI?: string;
  }

  export class RdfXmlParser extends Transform {
    constructor(options?: RdfXmlParserOptions);
  }

  export interface RdfXmlParserEvents {
    data: Quad;
    error: Error;
    end: void;
  }
}

declare module "jsonld-streaming-parser" {
  import { Transform } from "node:stream";

  export interface JsonLdParserOptions {
    baseIRI?: string;
  }

  export class JsonLdParser extends Transform {
    constructor(options?: JsonLdParserOptions);
  }
}
