import { describe, expect, it } from "vitest";
import { detectFormatFromExtension, detectFormatFromLanguageId, parseOntology } from "./parse";

describe("format detection", () => {
  it("maps known extensions to formats", () => {
    expect(detectFormatFromExtension("foo.ttl")).toBe("turtle");
    expect(detectFormatFromExtension("foo.owl")).toBe("rdfxml");
    expect(detectFormatFromExtension("foo.rdf")).toBe("rdfxml");
    expect(detectFormatFromExtension("foo.jsonld")).toBe("jsonld");
    expect(detectFormatFromExtension("foo.nt")).toBe("ntriples");
    expect(detectFormatFromExtension("foo.unknown")).toBeUndefined();
  });

  it("maps language ids to formats", () => {
    expect(detectFormatFromLanguageId("turtle")).toBe("turtle");
    expect(detectFormatFromLanguageId("plaintext")).toBeUndefined();
  });
});

describe("parseOntology (turtle)", () => {
  it("parses a simple class declaration", async () => {
    const text = `
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ex:Person a rdfs:Class ;
        rdfs:label "Person" .
    `;
    const result = await parseOntology(text, "turtle", "http://ex.org/doc");
    expect(result.errors).toEqual([]);
    expect(result.quads).toHaveLength(2);
    expect(result.prefixes).toEqual({ ex: "http://ex.org/", rdfs: "http://www.w3.org/2000/01/rdf-schema#" });
  });

  it("reports partial quads and a located error for malformed input", async () => {
    const text = `
      @prefix ex: <http://ex.org/> .
      ex:a ex:p ex:c .
      ex:b ex:q .
    `;
    const result = await parseOntology(text, "turtle", "http://ex.org/doc");
    expect(result.quads).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(4);
  });

  it("resolves relative IRIs against the supplied base", async () => {
    const text = `<a> <p> <b> .`;
    const result = await parseOntology(text, "turtle", "http://ex.org/doc/");
    expect(result.quads[0].subject.value).toBe("http://ex.org/doc/a");
  });
});

describe("parseOntology (rdfxml)", () => {
  it("parses RDF/XML into quads", async () => {
    const text = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:ex="http://ex.org/">
      <rdf:Description rdf:about="http://ex.org/Person">
        <rdf:type rdf:resource="http://www.w3.org/2000/01/rdf-schema#Class"/>
      </rdf:Description>
    </rdf:RDF>`;
    const result = await parseOntology(text, "rdfxml", "http://ex.org/doc");
    expect(result.errors).toEqual([]);
    expect(result.quads).toHaveLength(1);
    expect(result.quads[0].subject.value).toBe("http://ex.org/Person");
  });
});

describe("parseOntology (jsonld)", () => {
  it("parses JSON-LD into quads", async () => {
    const text = JSON.stringify({
      "@context": { ex: "http://ex.org/", rdfs: "http://www.w3.org/2000/01/rdf-schema#" },
      "@id": "ex:Person",
      "@type": "rdfs:Class",
    });
    const result = await parseOntology(text, "jsonld", "http://ex.org/doc");
    expect(result.errors).toEqual([]);
    expect(result.quads).toHaveLength(1);
  });
});
