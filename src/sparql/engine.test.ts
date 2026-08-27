import { describe, expect, it } from "vitest";
import { parseOntology } from "../rdf/parse";
import { runSparqlQuery } from "./engine";

const TTL = `
  @prefix ex: <http://ex.org/> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix owl: <http://www.w3.org/2002/07/owl#> .
  ex:Person a owl:Class ; rdfs:label "Person" .
  ex:Company a owl:Class ; rdfs:label "Company" .
  ex:alice a ex:Person ; rdfs:label "Alice" ; ex:worksAt ex:acme .
  ex:bob a ex:Person ; rdfs:label "Bob" .
  ex:acme a ex:Company ; rdfs:label "Acme" .
`;

async function quadsFor(ttl: string) {
  const { quads } = await parseOntology(ttl, "turtle", "http://ex.org/");
  return quads;
}

describe("runSparqlQuery", () => {
  it("runs a SELECT and normalizes bindings into a serialization-safe shape", async () => {
    const quads = await quadsFor(TTL);
    const result = await runSparqlQuery(
      quads,
      "PREFIX ex: <http://ex.org/> SELECT ?person WHERE { ?person a ex:Person }",
    );
    expect(result.kind).toBe("bindings");
    if (result.kind !== "bindings") {
      throw new Error("expected bindings");
    }
    expect(result.variables).toEqual(["person"]);
    const values = result.rows.map((r) => r.person.value).sort();
    expect(values).toEqual(["http://ex.org/alice", "http://ex.org/bob"]);
    // Terms must be plain objects (structured-clone-safe), not RDF/JS Terms.
    expect(result.rows[0].person.termKind).toBe("NamedNode");
    expect(Object.getPrototypeOf(result.rows[0].person)).toBe(Object.prototype);
  });

  it("captures literal datatype and language on binding cells", async () => {
    const quads = await quadsFor(`
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ex:x rdfs:label "Hello"@en .
      ex:y ex:age 42 .
    `);
    const langResult = await runSparqlQuery(
      quads,
      "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?l WHERE { ?s rdfs:label ?l }",
    );
    if (langResult.kind !== "bindings") {
      throw new Error("expected bindings");
    }
    expect(langResult.rows[0].l).toMatchObject({ termKind: "Literal", value: "Hello", language: "en" });

    const intResult = await runSparqlQuery(
      quads,
      "PREFIX ex: <http://ex.org/> SELECT ?a WHERE { ?s ex:age ?a }",
    );
    if (intResult.kind !== "bindings") {
      throw new Error("expected bindings");
    }
    expect(intResult.rows[0].a.termKind).toBe("Literal");
    expect(intResult.rows[0].a.datatype).toContain("integer");
  });

  it("omits unbound OPTIONAL variables from a row rather than emitting a null term", async () => {
    const quads = await quadsFor(TTL);
    const result = await runSparqlQuery(
      quads,
      `PREFIX ex: <http://ex.org/>
       SELECT ?person ?employer WHERE {
         ?person a ex:Person .
         OPTIONAL { ?person ex:worksAt ?employer }
       }`,
    );
    if (result.kind !== "bindings") {
      throw new Error("expected bindings");
    }
    const bob = result.rows.find((r) => r.person.value === "http://ex.org/bob");
    const alice = result.rows.find((r) => r.person.value === "http://ex.org/alice");
    expect(bob && "employer" in bob).toBe(false);
    expect(alice?.employer?.value).toBe("http://ex.org/acme");
  });

  it("runs an ASK query returning a boolean", async () => {
    const quads = await quadsFor(TTL);
    const truthy = await runSparqlQuery(quads, "PREFIX ex: <http://ex.org/> ASK { ex:alice a ex:Person }");
    expect(truthy).toEqual({ kind: "boolean", value: true });
    const falsy = await runSparqlQuery(quads, "PREFIX ex: <http://ex.org/> ASK { ex:acme a ex:Person }");
    expect(falsy).toEqual({ kind: "boolean", value: false });
  });

  it("runs a CONSTRUCT query returning normalized triples", async () => {
    const quads = await quadsFor(TTL);
    const result = await runSparqlQuery(
      quads,
      `PREFIX ex: <http://ex.org/>
       CONSTRUCT { ?p ex:employer ?c } WHERE { ?p ex:worksAt ?c }`,
    );
    if (result.kind !== "quads") {
      throw new Error("expected quads");
    }
    expect(result.triples).toHaveLength(1);
    expect(result.triples[0]).toMatchObject({
      subject: { termKind: "NamedNode", value: "http://ex.org/alice" },
      predicate: { termKind: "NamedNode", value: "http://ex.org/employer" },
      object: { termKind: "NamedNode", value: "http://ex.org/acme" },
    });
  });

  it("rejects with a helpful error on a syntactically invalid query", async () => {
    const quads = await quadsFor(TTL);
    await expect(runSparqlQuery(quads, "SELECT ?s WHERE { this is not sparql")).rejects.toThrow();
  });
});
