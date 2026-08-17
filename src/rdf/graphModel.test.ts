import { describe, expect, it } from "vitest";
import { parseOntology } from "./parse";
import { buildGraphModel } from "./graphModel";

async function graphFor(ttl: string) {
  const { quads } = await parseOntology(ttl, "turtle", "http://ex.org/doc");
  return buildGraphModel(quads);
}

describe("buildGraphModel", () => {
  it("classifies a class, a property, and an individual", async () => {
    const graph = await graphFor(`
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      ex:Person a rdfs:Class .
      ex:knows a owl:ObjectProperty .
      ex:alice a ex:Person .
    `);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("http://ex.org/Person")?.kind).toBe("class");
    expect(byId.get("http://ex.org/knows")?.kind).toBe("property");
    expect(byId.get("http://ex.org/alice")?.kind).toBe("individual");
  });

  it("folds rdfs:label and rdfs:comment into the node instead of an edge", async () => {
    const graph = await graphFor(`
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ex:Person a rdfs:Class ;
        rdfs:label "Person" ;
        rdfs:comment "A human being." .
    `);
    const person = graph.nodes.find((n) => n.id === "http://ex.org/Person");
    expect(person?.label).toBe("Person");
    expect(person?.comment).toBe("A human being.");
    expect(graph.edges.some((e) => e.predicate.endsWith("label"))).toBe(false);
  });

  it("creates an edge for object properties", async () => {
    const graph = await graphFor(`
      @prefix ex: <http://ex.org/> .
      ex:alice ex:knows ex:bob .
    `);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      source: "http://ex.org/alice",
      predicate: "http://ex.org/knows",
      target: "http://ex.org/bob",
    });
  });

  it("falls back to a shortened IRI label when there is no rdfs:label", async () => {
    const graph = await graphFor(`@prefix ex: <http://ex.org/> . ex:Widget ex:p ex:Gadget .`);
    const widget = graph.nodes.find((n) => n.id === "http://ex.org/Widget");
    expect(widget?.label).toBe("Widget");
  });

  it("represents blank nodes distinctly from named nodes", async () => {
    const graph = await graphFor(`
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ex:alice ex:knows _:b0 .
      _:b0 rdfs:label "Anonymous" .
    `);
    const blank = graph.nodes.find((n) => n.isBlankNode && n.id.startsWith("_:"));
    expect(blank).toBeDefined();
    expect(blank?.label).toBe("Anonymous");
  });
});
