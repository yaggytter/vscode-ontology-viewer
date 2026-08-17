import * as N3 from "n3";
import { resolveIri } from "./iriResolution";

export interface Position {
  /** 0-based, vscode-compatible. */
  line: number;
  character: number;
}

export interface Span {
  start: Position;
  /** Exclusive. */
  end: Position;
}

export type TermKind = "NamedNode" | "BlankNode" | "Literal";

export interface IndexedTerm {
  span: Span;
  kind: TermKind;
  /** Resolved absolute IRI (NamedNode), blank node label (BlankNode), or lexical value (Literal). */
  value: string;
  language?: string;
  datatype?: string;
}

export interface IndexedStatement {
  subject: IndexedTerm;
  predicate: IndexedTerm;
  object: IndexedTerm;
  statementSpan: Span;
  /**
   * True only for "flat" statements — subject/predicate/object are each a
   * plain IRI, prefixed name, blank-node label, or (for the object) a
   * single-line literal. Nested blank-node property lists (`[ ... ]`),
   * RDF collections (`( ... )`), and multi-line literals are still parsed
   * for the graph model but are not surgically editable in v1 — see
   * DevPlan.md §4 and the design notes at the top of this file.
   */
  editable: boolean;
}

export interface IndexedBlock {
  /** The block's subject term — every statement in it shares this same subject. */
  subject: IndexedTerm;
  /** From the subject's own start through (and including) the terminating `.`. */
  span: Span;
  /** Indices into `PositionIndex.statements` for every statement in this block. */
  statementIndices: number[];
  /** True only if every member statement is itself `editable`. */
  editable: boolean;
}

export interface PositionIndex {
  statements: IndexedStatement[];
  /**
   * One entry per top-level, `.`-terminated statement group — i.e. a
   * subject and everything joined to it by `;`. `statementSpan` on
   * `IndexedStatement` is NOT a safe span for deleting a single statement
   * out of a multi-statement block (every statement sharing a subject
   * shares the same `statementSpan.start` — the subject's own start), so
   * whole-block deletion (the only deletion this extension supports; see
   * `src/edit/deleteStatement.ts`) goes through `blocks` instead.
   */
  blocks: IndexedBlock[];
  /**
   * True if the scanner could not confidently account for every character
   * of an already-error-free parse (i.e. a gap in this scanner's grammar
   * coverage, not a syntax error in the document). When true, callers must
   * treat the WHOLE document as non-editable via the diagram — degrading
   * gracefully is only safe at the per-statement level (see `editable`
   * above); a scanner desync means subsequent spans cannot be trusted.
   */
  degraded: boolean;
  degradedReason?: string;
}

/**
 * Turtle's own lexical grammar rules out '>' — unescaped or otherwise —
 * inside an IRIREF, so the first '>' after '<' is always the terminator.
 * (Verified against the Turtle 1.1 grammar's IRIREF production.)
 */
function scanIriRef(text: string, openAngle: number): number {
  const close = text.indexOf(">", openAngle + 1);
  return close < 0 ? text.length : close + 1;
}

const PN_LOCAL_CONTINUE = /[A-Za-z0-9_.~:\-]|%[0-9A-Fa-f]{2}|\\[!$&'()*+,;=/?#@%_~.\-]/y;

/**
 * Best-effort PN_LOCAL scanner used only when the fast literal-text match
 * fails (i.e. the local name contains a `\`-escaped character, so the raw
 * source differs from the lexer's already-decoded `token.value`). Consumes
 * greedily; the caller re-derives the true local name from the consumed
 * slice and moves on rather than trusting `token.value`'s length.
 */
function scanPnLocal(text: string, from: number): number {
  let pos = from;
  PN_LOCAL_CONTINUE.lastIndex = pos;
  while (pos < text.length) {
    PN_LOCAL_CONTINUE.lastIndex = pos;
    const match = PN_LOCAL_CONTINUE.exec(text);
    if (!match) {
      break;
    }
    pos += match[0].length;
  }
  // A trailing '.' is ambiguous with the statement terminator; PN_LOCAL may
  // only end in '.' if the '.' is itself part of an escape/percent sequence
  // already consumed above, so back off any *unescaped* trailing dots.
  while (pos > from && text[pos - 1] === "." && text[pos - 2] !== "\\") {
    pos--;
  }
  return pos;
}

const ESCAPE_MAP: Record<string, string> = {
  t: "\t",
  n: "\n",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "'": "'",
  "\\": "\\",
};

function decodeTurtleString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === "u" || next === "U") {
      const len = next === "u" ? 4 : 8;
      const hex = raw.slice(i + 2, i + 2 + len);
      out += String.fromCodePoint(parseInt(hex, 16));
      i += 1 + len;
      continue;
    }
    if (next !== undefined && next in ESCAPE_MAP) {
      out += ESCAPE_MAP[next];
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Scans a quoted string literal starting at `text[from]` (which must be a
 * `"` or `'`). Handles both short (`"..."`) and long (`"""..."""`) forms,
 * multi-line content, and backslash escapes. Returns the exclusive end
 * offset of the closing delimiter, or -1 if unterminated.
 */
function scanStringLiteral(text: string, from: number): number {
  const quote = text[from];
  const triple = text.startsWith(quote.repeat(3), from);
  const delimiter = triple ? quote.repeat(3) : quote;
  let pos = from + delimiter.length;
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === "\\") {
      pos += 2;
      continue;
    }
    if (!triple && (ch === "\n" || ch === "\r")) {
      return -1; // unterminated short literal
    }
    if (text.startsWith(delimiter, pos)) {
      return pos + delimiter.length;
    }
    pos += 1;
  }
  return -1;
}

const LANGTAG = /^@[A-Za-z]+(-[A-Za-z0-9]+)*/;
const BARE_LITERAL = /^(true|false|[+-]?\d+(\.\d+)?([eE][+-]?\d+)?|[+-]?\.\d+([eE][+-]?\d+)?)/;

interface Cursor {
  text: string;
  pos: number;
}

function skipInsignificant(c: Cursor): void {
  for (;;) {
    const ch = c.text[c.pos];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "﻿") {
      c.pos++;
      continue;
    }
    if (ch === "#") {
      const nl = c.text.indexOf("\n", c.pos);
      c.pos = nl < 0 ? c.text.length : nl;
      continue;
    }
    break;
  }
}

class ScanFailure extends Error {}

function expectLiteral(c: Cursor, literal: string): void {
  if (!c.text.startsWith(literal, c.pos)) {
    throw new ScanFailure(`expected "${literal}" at offset ${c.pos}`);
  }
  c.pos += literal.length;
}

function expectKeyword(c: Cursor, keyword: string): void {
  const re = new RegExp(`^${keyword}\\b`, "i");
  const match = re.exec(c.text.slice(c.pos));
  if (!match) {
    throw new ScanFailure(`expected keyword "${keyword}" at offset ${c.pos}`);
  }
  c.pos += match[0].length;
}

/** Consumes `prefix + ':' + local`, returning the raw span (start/end) of the whole prefixed name. */
function scanPrefixedName(c: Cursor, token: N3.LexerToken): { start: number; end: number } {
  const start = c.pos;
  const fast = `${token.prefix}:${token.value}`;
  if (c.text.startsWith(fast, c.pos)) {
    c.pos += fast.length;
    return { start, end: c.pos };
  }
  expectLiteral(c, `${token.prefix}:`);
  const localStart = c.pos;
  const localEnd = scanPnLocal(c.text, localStart);
  if (localEnd <= localStart && token.value.length > 0) {
    throw new ScanFailure(`could not locate local name for prefixed name at offset ${start}`);
  }
  c.pos = localEnd;
  return { start, end: c.pos };
}

function scanIri(c: Cursor): { start: number; end: number; value: string } {
  const start = c.pos;
  if (c.text[c.pos] !== "<") {
    throw new ScanFailure(`expected IRIREF at offset ${c.pos}`);
  }
  const end = scanIriRef(c.text, c.pos);
  c.pos = end;
  return { start, end, value: c.text.slice(start + 1, end - 1) };
}

interface ScannedLiteral {
  start: number;
  /** End of the literal's own quoted content, before any langtag/datatype suffix. */
  quoteEnd: number;
  value: string;
  isMultiLine: boolean;
}

function scanLiteral(c: Cursor, token: N3.LexerToken): ScannedLiteral {
  const start = c.pos;
  const ch = c.text[c.pos];
  if (ch === '"' || ch === "'") {
    const end = scanStringLiteral(c.text, c.pos);
    if (end < 0) {
      throw new ScanFailure(`unterminated string literal at offset ${c.pos}`);
    }
    const triple = c.text.startsWith(ch.repeat(3), c.pos);
    const delimLen = triple ? 3 : 1;
    const rawContent = c.text.slice(start + delimLen, end - delimLen);
    const decoded = decodeTurtleString(rawContent);
    if (decoded !== token.value) {
      throw new ScanFailure(`decoded literal did not match parser value at offset ${c.pos}`);
    }
    c.pos = end;
    return { start, quoteEnd: end, value: decoded, isMultiLine: /\r|\n/.test(rawContent) };
  }
  const match = BARE_LITERAL.exec(c.text.slice(c.pos));
  if (!match || match[0] !== token.value) {
    throw new ScanFailure(`expected numeric/boolean literal at offset ${c.pos}`);
  }
  c.pos += match[0].length;
  return { start, quoteEnd: c.pos, value: token.value, isMultiLine: false };
}

/** Converts an absolute character offset into a 0-based (line, character) position. */
function makePositionOf(lineStartOffsets: number[]): (offset: number) => Position {
  return (offset: number): Position => {
    let low = 0;
    let high = lineStartOffsets.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStartOffsets[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low, character: offset - lineStartOffsets[low] };
  };
}

function computeLineStartOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

type ResolvedTerm = IndexedTerm & { start: number; end: number };

/**
 * Builds the Turtle position index. Requires a document that already parsed
 * with zero errors (see src/rdf/parse.ts) — this function does not attempt
 * to recover from malformed Turtle; N3.Parser is the authority on validity.
 */
export function buildPositionIndex(text: string, baseIRI: string): PositionIndex {
  try {
    return buildPositionIndexUnsafe(text, baseIRI);
  } catch (error) {
    return {
      statements: [],
      blocks: [],
      degraded: true,
      degradedReason: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPositionIndexUnsafe(text: string, baseIRI: string): PositionIndex {
  const tokens = new N3.Lexer().tokenize(text).filter((t) => t.type !== "eof");
  const positionOf = makePositionOf(computeLineStartOffsets(text));
  const toSpan = (start: number, end: number): Span => ({ start: positionOf(start), end: positionOf(end) });

  const c: Cursor = { text, pos: 0 };
  const prefixes = new Map<string, string>();
  let currentBase = baseIRI;

  const statements: IndexedStatement[] = [];
  const blocks: IndexedBlock[] = [];
  let currentBlockStatementIndices: number[] = [];
  let depth = 0; // nesting inside [ ... ] or ( ... )
  let subject: ResolvedTerm | null = null;
  let subjectFlat = false;
  let predicate: ResolvedTerm | null = null;
  let predicateFlat = false;
  let statementStart = -1;
  let pendingComplexTerm: { role: "subject" | "object"; start: number; baseDepth: number } | null = null;

  const resolveTermToken = (i: number): { term: ResolvedTerm; consumed: number } => {
    const token = tokens[i];
    skipInsignificant(c);

    if (token.type === "prefixed" || token.type === "blank") {
      const { start, end } = scanPrefixedName(c, token);
      const namespace = token.type === "blank" ? "_" : prefixes.get(token.prefix);
      if (token.type === "prefixed" && namespace === undefined) {
        throw new ScanFailure(`undefined prefix "${token.prefix}:" at offset ${start}`);
      }
      const value = token.type === "blank" ? token.value : `${namespace}${token.value}`;
      return {
        consumed: 1,
        term: { start, end, span: toSpan(start, end), kind: token.type === "blank" ? "BlankNode" : "NamedNode", value },
      };
    }

    if (token.type === "IRI" || token.type === "typeIRI") {
      const { start, end, value } = scanIri(c);
      const resolved = resolveIri(value, currentBase);
      return { consumed: 1, term: { start, end, span: toSpan(start, end), kind: "NamedNode", value: resolved } };
    }

    if (token.type === "abbreviation" && token.value === "a") {
      const start = c.pos;
      expectLiteral(c, "a");
      return {
        consumed: 1,
        term: {
          start,
          end: c.pos,
          span: toSpan(start, c.pos),
          kind: "NamedNode",
          value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        },
      };
    }

    if (token.type === "literal") {
      const literal = scanLiteral(c, token);
      let language: string | undefined;
      let datatype: string | undefined;
      let consumed = 1;

      // The langtag/datatype suffix is consumed here (so the cursor lands in
      // the right place for whatever token comes next) but is deliberately
      // NOT included in the term's own `span` — editing a literal's text
      // should not risk clobbering its language tag or datatype alongside it.
      const next = tokens[i + 1];
      if (next?.type === "langcode") {
        skipInsignificant(c);
        const match = LANGTAG.exec(c.text.slice(c.pos));
        if (!match || match[0].slice(1) !== next.value) {
          throw new ScanFailure(`expected langtag at offset ${c.pos}`);
        }
        c.pos += match[0].length;
        language = next.value;
        consumed = 2;
      } else if (next?.type === "type" || next?.type === "typeIRI") {
        skipInsignificant(c);
        expectLiteral(c, "^^");
        if (next.type === "typeIRI") {
          const iri = scanIri(c);
          datatype = resolveIri(iri.value, currentBase);
        } else {
          scanPrefixedName(c, next);
          const namespace = prefixes.get(next.prefix);
          if (namespace === undefined) {
            throw new ScanFailure(`undefined prefix "${next.prefix}:" at offset ${c.pos}`);
          }
          datatype = `${namespace}${next.value}`;
        }
        consumed = 2;
      }

      const resolvedTerm: ResolvedTerm = {
        start: literal.start,
        end: literal.quoteEnd,
        span: toSpan(literal.start, literal.quoteEnd),
        kind: "Literal",
        value: literal.value,
        language,
        datatype,
      };
      return { consumed, term: resolvedTerm };
    }

    throw new ScanFailure(`unexpected token type "${token.type}" where a term was expected at offset ${c.pos}`);
  };

  const isMultiLineLiteral = (term: ResolvedTerm): boolean =>
    term.kind === "Literal" && term.span.start.line !== term.span.end.line;

  let i = 0;
  while (i < tokens.length) {
    skipInsignificant(c);
    const token = tokens[i];

    if (depth === 0 && subject === null && (token.type === "@prefix" || token.type === "PREFIX")) {
      if (token.type === "@prefix") {
        expectLiteral(c, "@prefix");
      } else {
        expectKeyword(c, "prefix");
      }
      skipInsignificant(c);
      const nameToken = tokens[i + 1];
      expectLiteral(c, `${nameToken.value}:`);
      skipInsignificant(c);
      const iriToken = tokens[i + 2];
      const iri = scanIri(c);
      prefixes.set(nameToken.value, resolveIri(iri.value, currentBase));
      void iriToken;
      skipInsignificant(c);
      if (token.type === "@prefix") {
        expectLiteral(c, ".");
        i += 4; // @prefix, name, iri, '.'
      } else {
        i += 3; // PREFIX, name, iri (SPARQL form has no trailing '.')
      }
      continue;
    }

    if (depth === 0 && subject === null && (token.type === "@base" || token.type === "BASE")) {
      if (token.type === "@base") {
        expectLiteral(c, "@base");
      } else {
        expectKeyword(c, "base");
      }
      skipInsignificant(c);
      const iri = scanIri(c);
      currentBase = resolveIri(iri.value, currentBase);
      skipInsignificant(c);
      if (token.type === "@base") {
        expectLiteral(c, ".");
        i += 3; // @base, iri, '.'
      } else {
        i += 2; // BASE, iri (SPARQL form has no trailing '.')
      }
      continue;
    }

    if (token.type === "[" || token.type === "(") {
      const start = c.pos;
      expectLiteral(c, token.type);
      if (pendingComplexTerm === null) {
        // The outermost bracket/paren opening a subject or object position —
        // its full span (to the matching close) becomes one opaque,
        // non-editable term. Nested brackets inside just track depth; see
        // the `depth > 0` skip branch below.
        pendingComplexTerm = { role: subject === null ? "subject" : "object", start, baseDepth: depth };
      }
      depth += 1;
      i += 1;
      continue;
    }
    if (token.type === "]" || token.type === ")") {
      expectLiteral(c, token.type);
      depth -= 1;
      const end = c.pos;
      if (pendingComplexTerm && depth === pendingComplexTerm.baseDepth) {
        const complexTerm: ResolvedTerm = {
          start: pendingComplexTerm.start,
          end,
          span: toSpan(pendingComplexTerm.start, end),
          kind: "BlankNode",
          value: "",
        };
        if (pendingComplexTerm.role === "subject") {
          subject = complexTerm;
          subjectFlat = false;
          statementStart = complexTerm.start;
        } else {
          statements.push({
            subject: stripInternal(subject as ResolvedTerm),
            predicate: stripInternal(predicate as ResolvedTerm),
            object: stripInternal(complexTerm),
            statementSpan: toSpan(statementStart, end),
            editable: false,
          });
          currentBlockStatementIndices.push(statements.length - 1);
          predicate = null;
          predicateFlat = false;
        }
        pendingComplexTerm = null;
      }
      i += 1;
      continue;
    }

    if (depth > 0) {
      // Skip nested content entirely; only bracket/paren balance matters.
      if (
        token.type === "prefixed" ||
        token.type === "blank" ||
        token.type === "IRI" ||
        token.type === "typeIRI" ||
        token.type === "literal" ||
        (token.type === "abbreviation" && token.value === "a")
      ) {
        const { consumed } = resolveTermToken(i);
        i += consumed;
        continue;
      }
      expectLiteral(c, token.type);
      i += 1;
      continue;
    }

    if (token.type === ".") {
      expectLiteral(c, ".");
      if (subject !== null && currentBlockStatementIndices.length > 0) {
        blocks.push({
          subject: stripInternal(subject),
          span: toSpan(statementStart, c.pos),
          statementIndices: currentBlockStatementIndices,
          editable: currentBlockStatementIndices.every((idx) => statements[idx].editable),
        });
      }
      currentBlockStatementIndices = [];
      subject = null;
      subjectFlat = false;
      predicate = null;
      predicateFlat = false;
      statementStart = -1;
      i += 1;
      continue;
    }
    if (token.type === ";") {
      expectLiteral(c, ";");
      predicate = null;
      predicateFlat = false;
      i += 1;
      continue;
    }
    if (token.type === ",") {
      expectLiteral(c, ",");
      i += 1;
      continue;
    }

    // A term token: subject, predicate, or object depending on state.
    const { term, consumed } = resolveTermToken(i);
    i += consumed;

    if (subject === null) {
      subject = term;
      subjectFlat = true;
      statementStart = term.start;
      continue;
    }
    if (predicate === null) {
      predicate = term;
      predicateFlat = true;
      continue;
    }

    const flat = subjectFlat && predicateFlat && !isMultiLineLiteral(term);
    statements.push({
      subject: stripInternal(subject),
      predicate: stripInternal(predicate),
      object: stripInternal(term),
      statementSpan: toSpan(statementStart, term.end),
      editable: flat,
    });
    currentBlockStatementIndices.push(statements.length - 1);
  }

  return { statements, blocks, degraded: false };
}

function stripInternal(term: ResolvedTerm): IndexedTerm {
  const { span, kind, value, language, datatype } = term;
  return { span, kind, value, language, datatype };
}
