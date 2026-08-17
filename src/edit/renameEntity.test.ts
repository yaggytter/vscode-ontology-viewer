import { describe, expect, it } from "vitest";
import { planAndVerifyRename } from "./renameEntity";
import { parseOntology } from "../rdf/parse";

const BASE = "http://example.org/doc.ttl";

describe("planAndVerifyRename", () => {
  it("renames every occurrence across subject, predicate, and object positions", async () => {
    const ttl =
      `@prefix ex: <http://ex.org/> .\n` +
      `ex:oldName ex:knows ex:oldName .\n` +
      `ex:other ex:oldName ex:oldName .\n`;
    const result = await planAndVerifyRename(ttl, BASE, "http://ex.org/oldName", "http://ex.org/newName");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).not.toContain("oldName");
    expect(result.proposedText).toContain("ex:newName");
    const parsed = await parseOntology(result.proposedText!, "turtle", BASE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.quads).toHaveLength(2);
  });

  it("keeps the prefixed shorthand when the rename stays within the same namespace", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:Person a ex:Class .\n`;
    const result = await planAndVerifyRename(ttl, BASE, "http://ex.org/Person", "http://ex.org/Human");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain("ex:Human a ex:Class");
  });

  it("falls back to a full <...> IRI when the rename crosses namespaces", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:Person a ex:Class .\n`;
    const result = await planAndVerifyRename(ttl, BASE, "http://ex.org/Person", "http://other.org/Human");
    expect(result.verified, result.verifyReason).toBe(true);
    expect(result.proposedText).toContain("<http://other.org/Human> a ex:Class");
  });

  it("refuses to rename an entity that only appears inside a nested blank-node structure", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p [ ex:has ex:target ] .\n`;
    const result = await planAndVerifyRename(ttl, BASE, "http://ex.org/target", "http://ex.org/renamed");
    expect(result.verified).toBe(false);
  });

  it("reports failure (not a thrown error) when the entity does not appear at all", async () => {
    const ttl = `@prefix ex: <http://ex.org/> .\nex:a ex:p ex:b .\n`;
    const result = await planAndVerifyRename(ttl, BASE, "http://ex.org/nonexistent", "http://ex.org/renamed");
    expect(result.verified).toBe(false);
    expect(result.ok).toBe(false);
  });
});
