import { describe, expect, it } from "vitest";
import { parseOntology } from "../rdf/parse";
import { buildSchemaModel } from "../rdf/schemaModel";
import {
  expectOnlySubjectRemoved,
  findExternalReferences,
  planAndVerifyDeleteStatement,
  planDeleteStatement,
} from "./deleteStatement";

const BASE = "http://ex.org/onto#";

describe("planDeleteStatement", () => {
  const PREFIXES = `@prefix : <http://ex.org/onto#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n`;

  it("deletes a simple single-statement declaration, leaving the rest of the document untouched", () => {
    const doc = `${PREFIXES}:Pizza a owl:Class .\n:calories a owl:DatatypeProperty .\n:Topping a owl:Class .\n`;
    const plan = planDeleteStatement(doc, BASE, "http://ex.org/onto#calories");
    expect(plan.ok).toBe(true);
    expect(plan.proposedText).toBe(`${PREFIXES}:Pizza a owl:Class .\n:Topping a owl:Class .\n`);
  });

  it("deletes an entire ;-joined block as one unit, not just its first statement", () => {
    const doc =
      `${PREFIXES}` +
      `:calories a owl:DatatypeProperty ;\n` +
      `  rdfs:label "calories" ;\n` +
      `  rdfs:domain :Pizza .\n` +
      `:Topping a owl:Class .\n`;
    const plan = planDeleteStatement(doc, BASE, "http://ex.org/onto#calories");
    expect(plan.ok).toBe(true);
    // Exact-output, not just toContain/not.toContain — this is the case most
    // likely to break if the block span ever over- or under-shoots: a
    // widened span could still pass a substring check while eating the
    // preceding @prefix line or a trailing sibling declaration.
    expect(plan.proposedText).toBe(`${PREFIXES}:Topping a owl:Class .\n`);
  });

  it("does not swallow a trailing statement or comment that shares the closing '.'s line", () => {
    const doc = `${PREFIXES}:calories a owl:DatatypeProperty . :Topping a owl:Class .\n`;
    const plan = planDeleteStatement(doc, BASE, "http://ex.org/onto#calories");
    expect(plan.ok).toBe(true);
    expect(plan.proposedText).toContain(":Topping a owl:Class .");
  });

  it("fails when the subject has no declaration in the document at all", () => {
    const doc = `${PREFIXES}:Pizza a owl:Class .\n`;
    const plan = planDeleteStatement(doc, BASE, "http://ex.org/onto#ghost");
    expect(plan.ok).toBe(false);
  });

  it("fails when the subject is declared in more than one separate top-level statement", () => {
    const doc = `${PREFIXES}:calories a owl:DatatypeProperty .\n:calories rdfs:label "calories" .\n`;
    const plan = planDeleteStatement(doc, BASE, "http://ex.org/onto#calories");
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/more than one place/);
  });

  it("fails when the declaration is not in a simple enough form (e.g. a blank-node object)", () => {
    const doc = `${PREFIXES}:calories a owl:DatatypeProperty ;\n  rdfs:seeAlso [ :x :y ] .\n`;
    const plan = planDeleteStatement(doc, BASE, "http://ex.org/onto#calories");
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/not in a simple enough form/);
  });
});

describe("planAndVerifyDeleteStatement", () => {
  it("verifies against a real reparse: the subject disappears, and other entities/properties survive", async () => {
    const doc =
      `@prefix : <http://ex.org/onto#> .\n` +
      `@prefix owl: <http://www.w3.org/2002/07/owl#> .\n` +
      `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
      `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n` +
      `:Pizza a owl:Class ; rdfs:label "Pizza" .\n` +
      `:calories a owl:DatatypeProperty ;\n` +
      `  rdfs:label "calories" ;\n` +
      `  rdfs:domain :Pizza ;\n` +
      `  rdfs:range xsd:integer .\n`;
    const result = await planAndVerifyDeleteStatement(doc, BASE, "http://ex.org/onto#calories");
    expect(result.verified).toBe(true);

    const reparsed = await parseOntology(result.proposedText as string, "turtle", BASE);
    expect(reparsed.errors).toEqual([]);
    const schema = buildSchemaModel(reparsed.quads);
    const pizza = schema.entities.find((e) => e.id === "http://ex.org/onto#Pizza");
    expect(pizza).toBeDefined();
    expect(pizza?.properties).toEqual([]);
  });
});

describe("expectOnlySubjectRemoved — the last line of defense against an over-wide deletion span", () => {
  const TARGET = "http://ex.org/onto#calories";

  it("passes when the after-quads are exactly the before-quads minus the target subject's own triples", async () => {
    const before = await parseOntology(
      `@prefix : <http://ex.org/onto#> .\n:calories a <http://x/DatatypeProperty> .\n:Pizza a <http://x/Class> .\n`,
      "turtle",
      BASE,
    );
    const after = await parseOntology(`@prefix : <http://ex.org/onto#> .\n:Pizza a <http://x/Class> .\n`, "turtle", BASE);
    const result = expectOnlySubjectRemoved(before.quads, TARGET)(after.quads);
    expect(result.ok).toBe(true);
  });

  it("FAILS when the after-quads are also missing an unrelated neighbor's triple — an over-wide span must be caught here", async () => {
    const before = await parseOntology(
      `@prefix : <http://ex.org/onto#> .\n:calories a <http://x/DatatypeProperty> .\n:Pizza a <http://x/Class> .\n`,
      "turtle",
      BASE,
    );
    // Simulates a deletion span that accidentally swallowed :Pizza's
    // declaration too (e.g. a block-span bug eating the next block).
    const overDeleted = await parseOntology(`@prefix : <http://ex.org/onto#> .\n`, "turtle", BASE);
    const result = expectOnlySubjectRemoved(before.quads, TARGET)(overDeleted.quads);
    expect(result.ok).toBe(false);
  });

  it("FAILS when the target subject is still present", async () => {
    const before = await parseOntology(`@prefix : <http://ex.org/onto#> .\n:calories a <http://x/DatatypeProperty> .\n`, "turtle", BASE);
    const result = expectOnlySubjectRemoved(before.quads, TARGET)(before.quads);
    expect(result.ok).toBe(false);
  });

  it("compares blank-node-involving triples by count only, tolerating relabeling across independent parses", async () => {
    const before = await parseOntology(
      `@prefix : <http://ex.org/onto#> .\n:calories a <http://x/DatatypeProperty> .\n:Pizza :seeAlso [ :x :y ] .\n`,
      "turtle",
      BASE,
    );
    // A wholly separate parse of the surviving text — N3 mints fresh blank
    // node labels each time, so this would fail an identity comparison but
    // must pass a count-only one.
    const after = await parseOntology(`@prefix : <http://ex.org/onto#> .\n:Pizza :seeAlso [ :x :y ] .\n`, "turtle", BASE);
    const result = expectOnlySubjectRemoved(before.quads, TARGET)(after.quads);
    expect(result.ok).toBe(true);
  });
});

describe("findExternalReferences", () => {
  it("finds a triple that uses the target IRI as a predicate", async () => {
    const doc =
      `@prefix : <http://ex.org/onto#> .\n` +
      `:pizza :hasTopping :cheese .\n`;
    const { quads } = await parseOntology(doc, "turtle", BASE);
    const refs = findExternalReferences(quads, "http://ex.org/onto#hasTopping");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ subjectIri: "http://ex.org/onto#pizza", predicateIri: "http://ex.org/onto#hasTopping" });
  });

  it("finds a triple that references the target IRI as an object (e.g. owl:inverseOf)", async () => {
    const doc =
      `@prefix : <http://ex.org/onto#> .\n` +
      `@prefix owl: <http://www.w3.org/2002/07/owl#> .\n` +
      `:isToppingOf owl:inverseOf :hasTopping .\n`;
    const { quads } = await parseOntology(doc, "turtle", BASE);
    const refs = findExternalReferences(quads, "http://ex.org/onto#hasTopping");
    expect(refs).toHaveLength(1);
    expect(refs[0].subjectIri).toBe("http://ex.org/onto#isToppingOf");
  });

  it("excludes the declaration's own statements (where the target IRI is the subject)", async () => {
    const doc =
      `@prefix : <http://ex.org/onto#> .\n` +
      `@prefix owl: <http://www.w3.org/2002/07/owl#> .\n` +
      `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
      `:hasTopping a owl:ObjectProperty ; rdfs:label "has topping" .\n`;
    const { quads } = await parseOntology(doc, "turtle", BASE);
    const refs = findExternalReferences(quads, "http://ex.org/onto#hasTopping");
    expect(refs).toEqual([]);
  });

  it("returns an empty list when nothing references the target IRI", async () => {
    const doc = `@prefix : <http://ex.org/onto#> .\n:Pizza a owl:Class .\n`;
    const { quads } = await parseOntology(doc, "turtle", BASE);
    expect(findExternalReferences(quads, "http://ex.org/onto#hasTopping")).toEqual([]);
  });
});
