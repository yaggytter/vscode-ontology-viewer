import { describe, expect, it } from "vitest";
import { parseOntology } from "../rdf/parse";
import { buildSchemaModel } from "../rdf/schemaModel";
import { planAddProperty, planAndVerifyAddProperty, xsdIriFor } from "./addProperty";

const BASE = "http://ex.org/onto#";

const DOC = `@prefix : <http://ex.org/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Pizza a owl:Class ; rdfs:label "Pizza" .
`;

const ENTITIES = ["http://ex.org/onto#Pizza"];

describe("xsdIriFor", () => {
  it("maps every declared PropertyType to an xsd datatype IRI", () => {
    expect(xsdIriFor("integer")).toBe("http://www.w3.org/2001/XMLSchema#integer");
    expect(xsdIriFor("datetime")).toBe("http://www.w3.org/2001/XMLSchema#dateTime");
    expect(xsdIriFor("enum")).toBe("http://www.w3.org/2001/XMLSchema#string");
    expect(xsdIriFor("other")).toBe("http://www.w3.org/2001/XMLSchema#string");
  });
});

describe("planAddProperty", () => {
  it("mints a camelCase property IRI with domain=entity and range=xsd type", () => {
    const plan = planAddProperty(DOC, BASE, ENTITIES, ENTITIES[0], "calories per slice", "integer");
    expect(plan.ok).toBe(true);
    expect(plan.newIri).toBe("http://ex.org/onto#caloriesPerSlice");
    expect(plan.proposedText).toContain("http://www.w3.org/2001/XMLSchema#integer");
  });

  it("rejects an owning entity that doesn't exist yet", () => {
    const plan = planAddProperty(DOC, BASE, ENTITIES, "http://ex.org/onto#Ghost", "x", "string");
    expect(plan.ok).toBe(false);
  });
});

describe("planAndVerifyAddProperty", () => {
  it("verifies against a real reparse and the property shows up on the entity in the schema model", async () => {
    const result = await planAndVerifyAddProperty(DOC, BASE, ENTITIES, ENTITIES[0], "calories", "integer");
    expect(result.verified).toBe(true);

    const reparsed = await parseOntology(result.proposedText as string, "turtle", BASE);
    expect(reparsed.errors).toEqual([]);
    const schema = buildSchemaModel(reparsed.quads);
    const pizza = schema.entities.find((e) => e.id === ENTITIES[0]);
    expect(pizza?.properties).toEqual([expect.objectContaining({ name: "calories", type: "integer" })]);
  });
});
