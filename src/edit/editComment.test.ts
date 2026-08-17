import { describe, expect, it } from "vitest";
import { computeCommentEditableSubjects, planAndVerifyCommentEdit, planCommentEdit } from "./editComment";

const BASE = "http://example.org/doc.ttl";

const DOC_NO_COMMENT = `@prefix : <http://example.org/doc.ttl#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Pizza a owl:Class ;
  rdfs:label "Pizza" .
`;

const DOC_WITH_COMMENT = `@prefix : <http://example.org/doc.ttl#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Pizza a owl:Class ;
  rdfs:label "Pizza" ;
  rdfs:comment "An old description" .
`;

describe("planCommentEdit", () => {
  it("appends a new rdfs:comment via ; when the subject exists but has none", () => {
    const plan = planCommentEdit(DOC_NO_COMMENT, BASE, "http://example.org/doc.ttl#Pizza", "A flatbread dish");
    expect(plan.ok).toBe(true);
    expect(plan.proposedText).toContain("A flatbread dish");
  });

  it("replaces an existing single-line rdfs:comment in place", () => {
    const plan = planCommentEdit(DOC_WITH_COMMENT, BASE, "http://example.org/doc.ttl#Pizza", "A new description");
    expect(plan.ok).toBe(true);
    expect(plan.proposedText).toContain("A new description");
    expect(plan.proposedText).not.toContain("An old description");
  });
});

describe("planAndVerifyCommentEdit", () => {
  it("verifies against a real reparse", async () => {
    const result = await planAndVerifyCommentEdit(DOC_NO_COMMENT, BASE, "http://example.org/doc.ttl#Pizza", "A flatbread dish");
    expect(result.verified).toBe(true);
  });
});

describe("computeCommentEditableSubjects", () => {
  it("marks a subject with no existing comment as editable (insertion is always possible)", () => {
    const editable = computeCommentEditableSubjects(DOC_NO_COMMENT, BASE, ["http://example.org/doc.ttl#Pizza"]);
    expect(editable.has("http://example.org/doc.ttl#Pizza")).toBe(true);
  });

  it("marks a subject with an existing single-line comment as editable", () => {
    const editable = computeCommentEditableSubjects(DOC_WITH_COMMENT, BASE, ["http://example.org/doc.ttl#Pizza"]);
    expect(editable.has("http://example.org/doc.ttl#Pizza")).toBe(true);
  });
});
