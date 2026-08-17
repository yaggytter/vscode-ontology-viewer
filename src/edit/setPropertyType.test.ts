import { describe, expect, it } from "vitest";
import { parseOntology } from "../rdf/parse";
import { buildSchemaModel } from "../rdf/schemaModel";
import { planAndVerifySetPropertyType, planSetPropertyType } from "./setPropertyType";

const BASE = "http://ex.org/onto#";

const DOC_WITH_RANGE = `@prefix : <http://ex.org/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Pizza a owl:Class ; rdfs:label "Pizza" .
:calories a owl:DatatypeProperty ;
  rdfs:label "calories" ;
  rdfs:domain :Pizza ;
  rdfs:range xsd:integer .
`;

const DOC_WITHOUT_RANGE = `@prefix : <http://ex.org/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Pizza a owl:Class ; rdfs:label "Pizza" .
:calories a owl:DatatypeProperty ;
  rdfs:label "calories" ;
  rdfs:domain :Pizza .
`;

describe("planSetPropertyType", () => {
  it("replaces an existing rdfs:range in place", () => {
    const plan = planSetPropertyType(DOC_WITH_RANGE, BASE, "http://ex.org/onto#calories", "double");
    expect(plan.ok).toBe(true);
    expect(plan.proposedText).toContain("http://www.w3.org/2001/XMLSchema#double");
    expect(plan.proposedText).not.toContain("xsd:integer");
  });

  it("appends a new rdfs:range via ; when the property has no range yet", () => {
    const plan = planSetPropertyType(DOC_WITHOUT_RANGE, BASE, "http://ex.org/onto#calories", "integer");
    expect(plan.ok).toBe(true);
    expect(plan.proposedText).toContain("http://www.w3.org/2001/XMLSchema#integer");
  });

  it("fails for a property that isn't in the document at all", () => {
    const plan = planSetPropertyType(DOC_WITH_RANGE, BASE, "http://ex.org/onto#ghost", "string");
    expect(plan.ok).toBe(false);
  });
});

describe("planAndVerifySetPropertyType", () => {
  it("verifies against a real reparse: the schema model reflects the new type", async () => {
    const result = await planAndVerifySetPropertyType(DOC_WITH_RANGE, BASE, "http://ex.org/onto#calories", "double");
    expect(result.verified).toBe(true);

    const reparsed = await parseOntology(result.proposedText as string, "turtle", BASE);
    const schema = buildSchemaModel(reparsed.quads);
    const pizza = schema.entities.find((e) => e.id === "http://ex.org/onto#Pizza");
    expect(pizza?.properties).toEqual([expect.objectContaining({ name: "calories", type: "double" })]);
  });
});
