import { describe, expect, it } from "vitest";
import { parseOntology } from "../rdf/parse";
import { planAddRelation, planAndVerifyAddRelation } from "./addRelation";

const BASE = "http://ex.org/onto#";

const DOC = `@prefix : <http://ex.org/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Pizza a owl:Class ; rdfs:label "Pizza" .
:Topping a owl:Class ; rdfs:label "Topping" .
`;

const ENTITIES = ["http://ex.org/onto#Pizza", "http://ex.org/onto#Topping"];

describe("planAddRelation", () => {
  it("mints a camelCase property IRI and appends domain/range", () => {
    const plan = planAddRelation(DOC, BASE, ENTITIES, ENTITIES[0], ENTITIES[1], "has topping");
    expect(plan.ok).toBe(true);
    expect(plan.newIri).toBe("http://ex.org/onto#hasTopping");
    expect(plan.proposedText).toContain("<http://ex.org/onto#Pizza>");
    expect(plan.proposedText).toContain("<http://ex.org/onto#Topping>");
  });

  it("rejects an endpoint that isn't an existing entity", () => {
    const plan = planAddRelation(DOC, BASE, ENTITIES, ENTITIES[0], "http://ex.org/onto#Ghost", "hasGhost");
    expect(plan.ok).toBe(false);
  });

  it("rejects a blank name", () => {
    const plan = planAddRelation(DOC, BASE, ENTITIES, ENTITIES[0], ENTITIES[1], "  ");
    expect(plan.ok).toBe(false);
  });
});

describe("planAndVerifyAddRelation", () => {
  it("verifies against a real reparse: the new property has the given domain and range", async () => {
    const result = await planAndVerifyAddRelation(DOC, BASE, ENTITIES, ENTITIES[0], ENTITIES[1], "has topping");
    expect(result.verified).toBe(true);

    const reparsed = await parseOntology(result.proposedText as string, "turtle", BASE);
    expect(reparsed.errors).toEqual([]);
    const newIri = result.newIri as string;
    const domain = reparsed.quads.find((q) => q.subject.value === newIri && q.predicate.value.endsWith("#domain"));
    const range = reparsed.quads.find((q) => q.subject.value === newIri && q.predicate.value.endsWith("#range"));
    expect(domain?.object.value).toBe(ENTITIES[0]);
    expect(range?.object.value).toBe(ENTITIES[1]);
  });

  it("self-loop: source and target may be the same entity", async () => {
    const result = await planAndVerifyAddRelation(DOC, BASE, ENTITIES, ENTITIES[0], ENTITIES[0], "similarTo");
    expect(result.verified).toBe(true);
  });
});
