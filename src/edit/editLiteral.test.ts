import { describe, expect, it } from "vitest";
import { computeEditableSubjects, planAndVerifyLabelEdit, escapeTurtleShortString } from "./editLiteral";
import { parseOntology } from "../rdf/parse";

const BASE = "http://example.org/doc.ttl";

describe("escapeTurtleShortString", () => {
  it("escapes quotes, backslashes, and newlines", () => {
    expect(escapeTurtleShortString('He said "hi"')).toBe('He said \\"hi\\"');
    expect(escapeTurtleShortString("line1\nline2")).toBe("line1\\nline2");
    expect(escapeTurtleShortString("back\\slash")).toBe("back\\\\slash");
  });
});

describe("planAndVerifyLabelEdit — updating an existing label", () => {
  it("replaces just the quoted text, leaving everything else untouched", async () => {
    const ttl =
      `@prefix ex: <http://ex.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
      `ex:Person a ex:Class ;\n  rdfs:label "Old Name" .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/Person", "New Name");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain('"New Name"');
    expect(result.proposedText).not.toContain("Old Name");
    // Everything outside the literal is byte-for-byte unchanged.
    expect(result.proposedText).toContain("ex:Person a ex:Class ;");
  });

  it("preserves an existing language tag when updating the text", async () => {
    const ttl =
      `@prefix ex: <http://ex.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
      `ex:Person rdfs:label "Old"@en .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/Person", "New");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain('"New"@en');
  });

  it("refuses to touch a multi-line (non-editable) existing label", async () => {
    const ttl =
      `@prefix ex: <http://ex.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
      `ex:Person rdfs:label """multi\nline""" .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/Person", "New");
    expect(result.verified).toBe(false);
    expect(result.ok).toBe(false);
  });
});

describe("planAndVerifyLabelEdit — inserting a label where none exists", () => {
  it("appends via ';' onto the subject's last existing statement", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:Person a ex:Class .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/Person", "A Person");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain(
      'ex:Person a ex:Class ;\n  <http://www.w3.org/2000/01/rdf-schema#label> "A Person" .',
    );
    // Re-parses to exactly the original triple plus the one new label triple.
    const parsed = await parseOntology(result.proposedText!, "turtle", BASE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.quads).toHaveLength(2);
  });

  it("appends onto the LAST predicate-object group, not an earlier one sharing the subject", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:Person a ex:Class ;\n  ex:age 42 .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/Person", "A Person");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain("ex:age 42 ;\n  <http://www.w3.org/2000/01/rdf-schema#label>");
  });

  it("creates a brand-new top-level statement when the subject never appears as a subject", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:alice ex:knows ex:bob .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/bob", "Bob");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain('<http://ex.org/bob> <http://www.w3.org/2000/01/rdf-schema#label> "Bob" .');
    const parsed = await parseOntology(result.proposedText!, "turtle", BASE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.quads).toHaveLength(2);
  });

  it("handles a subject that is itself only ever seen as an object, with correct dedup across repeats", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:target .\nex:b ex:p ex:target .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/target", "Target");
    expect(result.verified, result.verifyReason).toBe(true);
    const parsed = await parseOntology(result.proposedText!, "turtle", BASE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.quads).toHaveLength(3);
  });
});

describe("computeEditableSubjects", () => {
  it("marks a subject with no label, and one with a simple label, as editable", async () => {
    const ttl =
      `@prefix ex: <http://ex.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
      `ex:NoLabel a ex:Class .\nex:HasLabel rdfs:label "Foo" .\n`;
    const editable = computeEditableSubjects(ttl, BASE, ["http://ex.org/NoLabel", "http://ex.org/HasLabel"]);
    expect(editable.has("http://ex.org/NoLabel")).toBe(true);
    expect(editable.has("http://ex.org/HasLabel")).toBe(true);
  });

  it("marks a subject whose existing label is multi-line as not editable", async () => {
    const ttl =
      `@prefix ex: <http://ex.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n` +
      `ex:HasMultiline rdfs:label """multi\nline""" .\n`;
    const editable = computeEditableSubjects(ttl, BASE, ["http://ex.org/HasMultiline"]);
    expect(editable.has("http://ex.org/HasMultiline")).toBe(false);
  });
});

describe("planAndVerifyLabelEdit — round trip preserves file structure", () => {
  it("does not disturb comments or unrelated statements elsewhere in the file", async () => {
    const ttl =
      `# An ontology about people\n` +
      `@prefix ex: <http://ex.org/> .\n` +
      `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n` +
      `ex:Animal a ex:Class . # unrelated\n\n` +
      `ex:Person a ex:Class ;\n` +
      `  rdfs:label "Person" .\n`;
    const result = await planAndVerifyLabelEdit(ttl, BASE, "http://ex.org/Person", "Human");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain("# An ontology about people");
    expect(result.proposedText).toContain("ex:Animal a ex:Class . # unrelated");
    expect(result.proposedText).toContain('"Human"');
  });
});
