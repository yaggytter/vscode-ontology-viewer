import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseOntology } from "../rdf/parse";
import { buildSchemaModel } from "../rdf/schemaModel";
import { resolveMatchedResources } from "./resourceResolution";
import { runSparqlQuery } from "./engine";
import type { SparqlResult } from "./resultModel";

const HARBOR = "https://example.org/ontology/harbor-market#";

async function quadsFor(ttl: string) {
  const { quads } = await parseOntology(ttl, "turtle", "http://ex.org/");
  return quads;
}

describe("resolveMatchedResources", () => {
  it("collects IRIs bound directly in SELECT results", async () => {
    const quads = await quadsFor(`
      @prefix ex: <http://ex.org/> .
      ex:alice a ex:Person .
    `);
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["s"],
      rows: [{ s: { termKind: "NamedNode", value: "http://ex.org/alice" } }],
    };
    expect(resolveMatchedResources(quads, result).iris).toContain("http://ex.org/alice");
  });

  it("resolves a literal result back to the subjects that carry it", async () => {
    // The core of the reported bug: a query may project only literals, so the
    // resource the user actually asked about never appears in a binding cell.
    const quads = await quadsFor(`
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ex:alice rdfs:label "Alice" .
    `);
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["label"],
      rows: [{ label: { termKind: "Literal", value: "Alice" } }],
    };
    expect(resolveMatchedResources(quads, result).iris).toContain("http://ex.org/alice");
  });

  it("matches literals exactly, including language tag and datatype", async () => {
    const quads = await quadsFor(`
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ex:english rdfs:label "Bank"@en .
      ex:plain rdfs:label "Bank" .
    `);
    const englishOnly: SparqlResult = {
      kind: "bindings",
      variables: ["l"],
      rows: [{ l: { termKind: "Literal", value: "Bank", language: "en", datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString" } }],
    };
    const resolved = resolveMatchedResources(quads, englishOnly).iris;
    expect(resolved).toContain("http://ex.org/english");
    expect(resolved).not.toContain("http://ex.org/plain");
  });

  it("reports the rdf:type of every matched resource as a fallback", async () => {
    const quads = await quadsFor(`
      @prefix ex: <http://ex.org/> .
      ex:alice a ex:Person .
    `);
    const result: SparqlResult = {
      kind: "bindings",
      variables: ["s"],
      rows: [{ s: { termKind: "NamedNode", value: "http://ex.org/alice" } }],
    };
    expect(resolveMatchedResources(quads, result).types["http://ex.org/alice"]).toEqual([
      "http://ex.org/Person",
    ]);
  });

  it("collects subject and object IRIs from CONSTRUCT results", async () => {
    const quads = await quadsFor(`@prefix ex: <http://ex.org/> . ex:a ex:p ex:b .`);
    const result: SparqlResult = {
      kind: "quads",
      triples: [
        {
          subject: { termKind: "NamedNode", value: "http://ex.org/a" },
          predicate: { termKind: "NamedNode", value: "http://ex.org/p" },
          object: { termKind: "NamedNode", value: "http://ex.org/b" },
        },
      ],
    };
    const iris = resolveMatchedResources(quads, result).iris;
    expect(iris).toContain("http://ex.org/a");
    expect(iris).toContain("http://ex.org/b");
  });

  it("returns nothing for an ASK result", async () => {
    const quads = await quadsFor(`@prefix ex: <http://ex.org/> . ex:a ex:p ex:b .`);
    expect(resolveMatchedResources(quads, { kind: "boolean", value: true }).iris).toEqual([]);
  });

  /**
   * Regression for the reported bug: this exact query against the bundled
   * harbor-market.ttl produced no graph effect, because every projected
   * variable is a literal and the matched resources are individuals rather
   * than the classes the schema view draws.
   */
  it("resolves the reported harbor-market query to its instances and their classes", async () => {
    const ttl = readFileSync("samples/harbor-market.ttl", "utf8");
    const quads = await quadsFor(ttl);
    const result = await runSparqlQuery(
      quads,
      `PREFIX : <${HARBOR}>
       PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
       SELECT ?stallLabel ?productName ?price
       WHERE {
         ?stall a :Stall ;
                rdfs:label ?stallLabel ;
                :offers ?product .
         ?product :productName ?productName ;
                  :unitPrice ?price .
       }`,
    );
    const { iris, types } = resolveMatchedResources(quads, result);

    // The individuals behind the literal-only projection are recovered...
    expect(iris).toContain(`${HARBOR}pierStall`);
    expect(iris).toContain(`${HARBOR}seaSaltCrackers`);
    // ...and each carries the class the schema view actually draws.
    expect(types[`${HARBOR}pierStall`]).toContain(`${HARBOR}Stall`);
    expect(types[`${HARBOR}seaSaltCrackers`]).toContain(`${HARBOR}Product`);

    // Sanity check that those classes are real schema nodes.
    const schemaIds = new Set(buildSchemaModel(quads).entities.map((e) => e.id));
    expect(schemaIds.has(`${HARBOR}Stall`)).toBe(true);
    expect(schemaIds.has(`${HARBOR}Product`)).toBe(true);
  });
});
