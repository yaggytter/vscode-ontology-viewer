import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseOntology } from "../rdf/parse";
import { runSparqlQuery } from "./engine";
import { resolveMatchedResources } from "./resourceResolution";
import { SPARQL_SAMPLE_QUERIES } from "./sampleQueries";

/**
 * Every sample is executed against real bundled ontologies. A beginner's first
 * experience of the feature is one of these queries, so a sample that throws
 * (or silently returns nothing anywhere) is a user-facing bug, not a cosmetic
 * one — these tests are the guard against that.
 */
const SAMPLE_FILES = ["samples/harbor-market.ttl", "samples/city-mobility.ttl"];

async function quadsForFile(path: string) {
  const { quads, errors } = await parseOntology(readFileSync(path, "utf8"), "turtle", `file:///${path}`);
  expect(errors).toEqual([]);
  return quads;
}

describe("SPARQL_SAMPLE_QUERIES", () => {
  it("declares unique ids", () => {
    const ids = SPARQL_SAMPLE_QUERIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships a non-trivial ladder of examples", () => {
    expect(SPARQL_SAMPLE_QUERIES.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of SAMPLE_FILES) {
    describe(`against ${file}`, () => {
      for (const { id, query } of SPARQL_SAMPLE_QUERIES) {
        it(`runs "${id}" without error`, async () => {
          const quads = await quadsForFile(file);
          const result = await runSparqlQuery(quads, query);
          expect(["bindings", "boolean", "quads"]).toContain(result.kind);
          // Resolution must also survive every result shape.
          expect(() => resolveMatchedResources(quads, result)).not.toThrow();
        });
      }
    });
  }

  it("returns rows for the introductory query on a real ontology", async () => {
    const quads = await quadsForFile("samples/harbor-market.ttl");
    const intro = SPARQL_SAMPLE_QUERIES.find((s) => s.id === "first-triples");
    const result = await runSparqlQuery(quads, intro?.query ?? "");
    if (result.kind !== "bindings") {
      throw new Error("expected bindings");
    }
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("finds the harbor-market classes with the class-listing query", async () => {
    const quads = await quadsForFile("samples/harbor-market.ttl");
    const classes = SPARQL_SAMPLE_QUERIES.find((s) => s.id === "all-classes");
    const result = await runSparqlQuery(quads, classes?.query ?? "");
    if (result.kind !== "bindings") {
      throw new Error("expected bindings");
    }
    const found = result.rows.map((r) => r.class.value);
    expect(found).toContain("https://example.org/ontology/harbor-market#Stall");
  });

  it("produces a graph effect for the instance-listing query", async () => {
    // Guards the reported bug class: a sample must not merely return text, it
    // must resolve to something the diagram can react to.
    const quads = await quadsForFile("samples/harbor-market.ttl");
    const instances = SPARQL_SAMPLE_QUERIES.find((s) => s.id === "instances-by-class");
    const result = await runSparqlQuery(quads, instances?.query ?? "");
    const { iris } = resolveMatchedResources(quads, result);
    expect(iris.length).toBeGreaterThan(0);
  });

  it("answers true for the ASK sample on an ontology that has classes", async () => {
    const quads = await quadsForFile("samples/harbor-market.ttl");
    const ask = SPARQL_SAMPLE_QUERIES.find((s) => s.id === "ask-has-classes");
    expect(await runSparqlQuery(quads, ask?.query ?? "")).toEqual({ kind: "boolean", value: true });
  });
});
