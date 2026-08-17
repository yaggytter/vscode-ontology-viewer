import { describe, expect, it } from "vitest";
import { parseOntology } from "../rdf/parse";
import { planAddClass, planAndVerifyAddClass } from "./addClass";

const BASE = "http://ex.org/onto#";

const DOC = `@prefix : <http://ex.org/onto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Pizza a owl:Class ;
  rdfs:label "Pizza" .
`;

describe("planAddClass", () => {
  it("mints a namespace-consistent IRI and appends a top-level owl:Class statement", () => {
    const plan = planAddClass(DOC, BASE, ["http://ex.org/onto#Pizza"], "Topping");
    expect(plan.ok).toBe(true);
    expect(plan.newIri).toBe("http://ex.org/onto#Topping");
    expect(plan.proposedText).toContain("<http://ex.org/onto#Topping>");
    expect(plan.proposedText).toContain('"Topping"');
  });

  it("includes an rdfs:comment line when a description is given", () => {
    const plan = planAddClass(DOC, BASE, ["http://ex.org/onto#Pizza"], "Topping", "Something you put on a pizza");
    expect(plan.proposedText).toContain("Something you put on a pizza");
  });

  it("rejects a blank name", () => {
    const plan = planAddClass(DOC, BASE, [], "   ");
    expect(plan.ok).toBe(false);
  });

  it("does not touch any existing statement — only appends", () => {
    const plan = planAddClass(DOC, BASE, ["http://ex.org/onto#Pizza"], "Topping");
    expect(plan.proposedText?.startsWith(DOC.trimEnd())).toBe(true);
  });
});

describe("planAndVerifyAddClass", () => {
  it("verifies against a real reparse: the new subject is typed owl:Class with the given label", async () => {
    const result = await planAndVerifyAddClass(DOC, BASE, ["http://ex.org/onto#Pizza"], "Topping");
    expect(result.verified).toBe(true);

    const reparsed = await parseOntology(result.proposedText as string, "turtle", BASE);
    expect(reparsed.errors).toEqual([]);
    const newIri = result.newIri as string;
    expect(reparsed.quads.some((q) => q.subject.value === newIri && q.predicate.value.endsWith("#type"))).toBe(true);
  });

  it("mints a colliding-safe IRI when the name already exists", async () => {
    const result = await planAndVerifyAddClass(DOC, BASE, ["http://ex.org/onto#Pizza"], "Pizza");
    expect(result.verified).toBe(true);
    expect(result.newIri).toBe("http://ex.org/onto#Pizza2");
  });
});
