import { describe, expect, it } from "vitest";
import { parseOntology } from "./parse";
import { buildPositionIndex, type IndexedStatement, type Position } from "./positionIndex";

const BASE = "http://example.org/doc.ttl";

async function indexFor(ttl: string) {
  const parsed = await parseOntology(ttl, "turtle", BASE);
  expect(parsed.errors, "fixture must parse cleanly").toEqual([]);
  const index = buildPositionIndex(ttl, BASE);
  return { parsed, index };
}

/** Extracts the exact source substring a span covers, for round-trip assertions. */
function textAt(source: string, start: Position, end: Position): string {
  const lines = source.split("\n");
  if (start.line === end.line) {
    return lines[start.line].slice(start.character, end.character);
  }
  const parts = [lines[start.line].slice(start.character)];
  for (let l = start.line + 1; l < end.line; l++) {
    parts.push(lines[l]);
  }
  parts.push(lines[end.line].slice(0, end.character));
  return parts.join("\n");
}

function findStatement(
  statements: IndexedStatement[],
  predicate: string,
  objectValue?: string,
): IndexedStatement | undefined {
  return statements.find((s) => s.predicate.value === predicate && (objectValue === undefined || s.object.value === objectValue));
}

describe("buildPositionIndex — basic shape", () => {
  it("indexes a simple flat statement with exact term spans", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:Person ex:label "Person" .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(1);
    const [stmt] = index.statements;
    expect(stmt.editable).toBe(true);
    expect(stmt.subject.value).toBe("http://ex.org/Person");
    expect(stmt.predicate.value).toBe("http://ex.org/label");
    expect(stmt.object.value).toBe("Person");
    expect(textAt(ttl, stmt.subject.span.start, stmt.subject.span.end)).toBe("ex:Person");
    expect(textAt(ttl, stmt.predicate.span.start, stmt.predicate.span.end)).toBe("ex:label");
    expect(textAt(ttl, stmt.object.span.start, stmt.object.span.end)).toBe('"Person"');
  });

  it("resolves the abbreviated 'a' keyword to rdf:type with a tight span", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\nex:Person a rdfs:Class .\n`;
    const { index } = await indexFor(ttl);
    const stmt = findStatement(index.statements, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
    expect(stmt).toBeDefined();
    expect(textAt(ttl, stmt!.predicate.span.start, stmt!.predicate.span.end)).toBe("a");
    expect(stmt!.object.value).toBe("http://www.w3.org/2000/01/rdf-schema#Class");
  });

  it("handles predicate-lists (;) and object-lists (,) sharing spans correctly", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:x, ex:y ;\n  ex:q ex:z .\n`;
    const { index } = await indexFor(ttl);
    expect(index.statements).toHaveLength(3);
    for (const stmt of index.statements) {
      expect(stmt.subject.value).toBe("http://ex.org/a");
      expect(textAt(ttl, stmt.subject.span.start, stmt.subject.span.end)).toBe("ex:a");
    }
    const targets = index.statements.map((s) => s.object.value).sort();
    expect(targets).toEqual(["http://ex.org/x", "http://ex.org/y", "http://ex.org/z"].sort());
  });
});

describe("buildPositionIndex — prefix/base position-dependence (the critical trap)", () => {
  it("resolves a redeclared prefix using the mapping in effect at each occurrence", async () => {
    const ttl =
      `@prefix ex: <http://first.org/> .\n` +
      `ex:a ex:p ex:b .\n` +
      `@prefix ex: <http://second.org/> .\n` +
      `ex:a ex:p ex:b .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(2);
    expect(index.statements[0].subject.value).toBe("http://first.org/a");
    expect(index.statements[1].subject.value).toBe("http://second.org/a");
  });

  it("resolves relative IRIs against the @base in effect at each occurrence", async () => {
    const ttl = `@base <http://first.org/> .\n<a> <p> <b> .\n@base <http://second.org/> .\n<a> <p> <b> .\n`;
    const { index } = await indexFor(ttl);
    expect(index.statements[0].subject.value).toBe("http://first.org/a");
    expect(index.statements[1].subject.value).toBe("http://second.org/a");
  });

  it("supports SPARQL-style PREFIX/BASE without the trailing dot", async () => {
    const ttl = `BASE <http://ex.org/>\nPREFIX ex: <http://ex.org/vocab#>\n<a> ex:p <b> .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(1);
    expect(index.statements[0].subject.value).toBe("http://ex.org/a");
    expect(index.statements[0].predicate.value).toBe("http://ex.org/vocab#p");
  });

  it("resolves the same raw IRI text to different absolute IRIs when @base changes mid-document", async () => {
    // Same *token text* <x>, two different resolved values — exactly the
    // scenario a naive "index by raw text" design would get wrong.
    const ttl = `@base <http://a.org/> .\n<x> <p> <x> .\n@base <http://b.org/> .\n<x> <p> <x> .\n`;
    const { index } = await indexFor(ttl);
    expect(index.statements[0].subject.value).toBe("http://a.org/x");
    expect(index.statements[1].subject.value).toBe("http://b.org/x");
    expect(index.statements[0].subject.value).not.toBe(index.statements[1].subject.value);
  });
});

describe("buildPositionIndex — literals", () => {
  it("captures language tags and datatypes without including them in the literal's own span", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p "hello"@en .\nex:a ex:q "5"^^ex:myType .\n`;
    const { index } = await indexFor(ttl);
    const langStmt = findStatement(index.statements, "http://ex.org/p");
    expect(langStmt!.object.language).toBe("en");
    expect(textAt(ttl, langStmt!.object.span.start, langStmt!.object.span.end)).toBe('"hello"');

    const dtStmt = findStatement(index.statements, "http://ex.org/q");
    expect(dtStmt!.object.datatype).toBe("http://ex.org/myType");
    expect(textAt(ttl, dtStmt!.object.span.start, dtStmt!.object.span.end)).toBe('"5"');
  });

  it("captures a full-IRI (non-prefixed) datatype", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p "5"^^<http://example.org/myType> .\n`;
    const { index } = await indexFor(ttl);
    expect(index.statements[0].object.datatype).toBe("http://example.org/myType");
  });

  it("handles escaped characters inside string literals without corrupting the span", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:label "line1\\nline2 \\"quoted\\" end" .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements[0].object.value).toBe('line1\nline2 "quoted" end');
    expect(index.statements[0].editable).toBe(true);
  });

  it("marks a multi-line triple-quoted literal statement as non-editable but still indexes it", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:body """line one\nline two""" .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(1);
    expect(index.statements[0].object.value).toBe("line one\nline two");
    expect(index.statements[0].editable).toBe(false);
  });

  it("still correctly resolves tokens that follow a multi-line literal on its closing line", async () => {
    // The N3.Lexer's own start/end columns are corrupted for tokens sharing
    // the physical line where a multi-line literal closes (verified
    // empirically) — this is exactly the case that would break a design
    // that trusted the lexer's numeric offsets directly.
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:body """line one\nline two""" ; ex:next ex:after .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(2);
    const after = findStatement(index.statements, "http://ex.org/next");
    expect(after!.object.value).toBe("http://ex.org/after");
    expect(textAt(ttl, after!.object.span.start, after!.object.span.end)).toBe("ex:after");
  });

  it("parses bare numeric and boolean literals", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:int 42 ; ex:dec 3.14 ; ex:dbl 2.5e10 ; ex:bool true .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(findStatement(index.statements, "http://ex.org/int")!.object.value).toBe("42");
    expect(findStatement(index.statements, "http://ex.org/bool")!.object.value).toBe("true");
  });
});

describe("buildPositionIndex — escaped local names and blank nodes", () => {
  it("resolves a prefixed name with a backslash-escaped local-name character", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:x\\-y .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements[0].object.value).toBe("http://ex.org/x-y");
    expect(textAt(ttl, index.statements[0].object.span.start, index.statements[0].object.span.end)).toBe("ex:x\\-y");
  });

  it("indexes a named blank node subject as an editable flat statement", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\n_:b0 ex:p ex:q .\n`;
    const { index } = await indexFor(ttl);
    expect(index.statements[0].subject.kind).toBe("BlankNode");
    expect(index.statements[0].editable).toBe(true);
  });
});

describe("buildPositionIndex — nested constructs are parsed but not editable", () => {
  it("marks a statement with a blank-node property-list object as non-editable", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p [ ex:x ex:y ] .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(1);
    expect(index.statements[0].editable).toBe(false);
  });

  it("marks a statement with an RDF collection object as non-editable", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ( ex:x ex:y ) .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(1);
    expect(index.statements[0].editable).toBe(false);
  });

  it("does not confuse nested ; and , inside [ ... ] with top-level statement structure", async () => {
    const ttl =
      `@prefix ex: <http://ex.org/> .\n` +
      `ex:a ex:p [ ex:x ex:y ; ex:z ex:w, ex:v ] ;\n` +
      `  ex:next ex:after .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(2);
    const after = findStatement(index.statements, "http://ex.org/next");
    expect(after!.editable).toBe(true);
    expect(after!.object.value).toBe("http://ex.org/after");
  });
});

describe("buildPositionIndex — comments and line endings", () => {
  it("skips comments adjacent to edited tokens without shifting positions", async () => {
    const ttl =
      `# leading comment\n` +
      `@prefix ex: <http://ex.org/> . # trailing comment\n` +
      `ex:a ex:p ex:b . # another comment\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(textAt(ttl, index.statements[0].object.span.start, index.statements[0].object.span.end)).toBe("ex:b");
  });

  it("handles CRLF line endings with vscode-compatible (line, character) positions", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\r\nex:a ex:p ex:b .\r\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    const stmt = index.statements[0];
    expect(stmt.subject.span.start).toEqual({ line: 1, character: 0 });
    expect(textAt(ttl.replace(/\r\n/g, "\n"), stmt.object.span.start, stmt.object.span.end)).toBe("ex:b");
  });

  it("handles a UTF-8 BOM at the start of the document", async () => {
    const ttl = `﻿@prefix ex: <http://ex.org/> .\nex:a ex:p ex:b .\n`;
    const { index } = await indexFor(ttl);
    expect(index.degraded).toBe(false);
    expect(index.statements).toHaveLength(1);
  });
});

describe("buildPositionIndex — blocks (whole-subject-declaration spans for deletion)", () => {
  it("groups a single flat statement into a one-statement block spanning through the terminating '.'", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:b .\n`;
    const { index } = await indexFor(ttl);
    expect(index.blocks).toHaveLength(1);
    const [block] = index.blocks;
    expect(block.subject.value).toBe("http://ex.org/a");
    expect(block.statementIndices).toEqual([0]);
    expect(block.editable).toBe(true);
    expect(textAt(ttl, block.span.start, block.span.end)).toBe("ex:a ex:p ex:b .");
  });

  it("groups every ;-joined statement sharing a subject into ONE block, not one per statement", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:x ;\n  ex:q ex:y ;\n  ex:r ex:z .\n`;
    const { index } = await indexFor(ttl);
    expect(index.statements).toHaveLength(3);
    expect(index.blocks).toHaveLength(1);
    const [block] = index.blocks;
    expect(block.statementIndices).toEqual([0, 1, 2]);
    expect(block.editable).toBe(true);
    // The block's span must extend through this statement's own '.', not
    // stop at the *first* statement's object end (statementSpan's own bug).
    expect(textAt(ttl, block.span.start, block.span.end)).toBe(ttl.trim().split("\n").slice(1).join("\n"));
  });

  it("gives each subject its own block when the document has multiple top-level statements", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:x .\nex:b ex:q ex:y .\n`;
    const { index } = await indexFor(ttl);
    expect(index.blocks).toHaveLength(2);
    expect(index.blocks[0].subject.value).toBe("http://ex.org/a");
    expect(index.blocks[1].subject.value).toBe("http://ex.org/b");
  });

  it("gives the same subject asserted in two separate top-level statements two separate blocks", async () => {
    // Turtle allows re-opening the same subject later in the document as an
    // entirely separate '.'-terminated group; each is its own deletable unit.
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:x .\nex:a ex:q ex:y .\n`;
    const { index } = await indexFor(ttl);
    expect(index.blocks).toHaveLength(2);
    expect(index.blocks[0].subject.value).toBe("http://ex.org/a");
    expect(index.blocks[1].subject.value).toBe("http://ex.org/a");
    expect(index.blocks[0].statementIndices).toEqual([0]);
    expect(index.blocks[1].statementIndices).toEqual([1]);
  });

  it("marks a block non-editable if ANY member statement is non-editable, even if others in the same block are flat", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:x ;\n  ex:q [ ex:x ex:y ] .\n`;
    const { index } = await indexFor(ttl);
    expect(index.blocks).toHaveLength(1);
    const [block] = index.blocks;
    expect(block.statementIndices).toHaveLength(2);
    expect(block.editable).toBe(false);
  });

  it("forms one non-editable block when the subject itself is a blank-node property list", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\n[ ex:x ex:y ] ex:p ex:q .\n`;
    const { index } = await indexFor(ttl);
    expect(index.blocks).toHaveLength(1);
    expect(index.blocks[0].statementIndices).toEqual([0]);
    expect(index.blocks[0].editable).toBe(false);
  });

  it("computes a correct block span with CRLF line endings", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\r\nex:a ex:p ex:x ;\r\n  ex:q ex:y .\r\nex:b ex:r ex:z .\r\n`;
    const { index } = await indexFor(ttl);
    expect(index.blocks).toHaveLength(2);
    const [first, second] = index.blocks;
    expect(first.subject.value).toBe("http://ex.org/a");
    expect(first.statementIndices).toEqual([0, 1]);
    expect(textAt(ttl.replace(/\r\n/g, "\n"), first.span.start, first.span.end)).toBe("ex:a ex:p ex:x ;\n  ex:q ex:y .");
    expect(second.subject.value).toBe("http://ex.org/b");
  });
});
