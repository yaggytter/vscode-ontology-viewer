import { describe, expect, it } from "vitest";
import { extractHighlightIris } from "./highlightMapping";
import type { SparqlResult } from "./resultModel";

const iri = (value: string) => ({ termKind: "NamedNode" as const, value });
const lit = (value: string) => ({ termKind: "Literal" as const, value });
const blank = (value: string) => ({ termKind: "BlankNode" as const, value });

describe("extractHighlightIris", () => {
  it("collects NamedNode values from SELECT bindings", () => {
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["s", "label"],
      rows: [
        { s: iri("http://ex.org/Alice"), label: lit("Alice") },
        { s: iri("http://ex.org/Bob"), label: lit("Bob") },
      ],
    };
    expect(extractHighlightIris(result)).toEqual(
      new Set(["http://ex.org/Alice", "http://ex.org/Bob"]),
    );
  });

  it("ignores literals and blank nodes in SELECT bindings", () => {
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["x"],
      rows: [{ x: lit("just text") }, { x: blank("b0") }],
    };
    expect(extractHighlightIris(result)).toEqual(new Set());
  });

  it("deduplicates repeated IRIs across rows and columns", () => {
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["a", "b"],
      rows: [
        { a: iri("http://ex.org/X"), b: iri("http://ex.org/Y") },
        { a: iri("http://ex.org/X"), b: iri("http://ex.org/X") },
      ],
    };
    expect(extractHighlightIris(result)).toEqual(
      new Set(["http://ex.org/X", "http://ex.org/Y"]),
    );
  });

  it("collects subject and object IRIs from CONSTRUCT triples but not predicates", () => {
    const result: SparqlResult = {
      kind: "quads",
      triples: [
        {
          subject: iri("http://ex.org/Alice"),
          predicate: iri("http://ex.org/knows"),
          object: iri("http://ex.org/Bob"),
        },
      ],
    };
    // Subject and object are graph nodes; the predicate is an edge label, not
    // a node, so it is deliberately excluded from node highlighting.
    expect(extractHighlightIris(result)).toEqual(
      new Set(["http://ex.org/Alice", "http://ex.org/Bob"]),
    );
  });

  it("returns an empty set for ASK results", () => {
    const result: SparqlResult = { kind: "boolean", value: true };
    expect(extractHighlightIris(result)).toEqual(new Set());
  });

  it("returns an empty set for an empty SELECT result", () => {
    const result: SparqlResult = { kind: "bindings", variables: ["s"], rows: [] };
    expect(extractHighlightIris(result)).toEqual(new Set());
  });
});
