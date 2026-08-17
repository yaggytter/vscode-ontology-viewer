import { describe, expect, it } from "vitest";
import { inferNamespace, mintIri, slugify } from "./mintIri";

describe("inferNamespace", () => {
  it("falls back to baseIRI# when there are no existing entities", () => {
    expect(inferNamespace([], "file:///doc.ttl")).toBe("file:///doc.ttl#");
  });

  it("picks the most common namespace among existing entities", () => {
    const iris = ["http://ex.org/onto#Pizza", "http://ex.org/onto#Topping", "http://other.example/x#Widget"];
    expect(inferNamespace(iris, "file:///doc.ttl")).toBe("http://ex.org/onto#");
  });

  it("handles slash-terminated namespaces", () => {
    expect(inferNamespace(["http://ex.org/Pizza"], "file:///doc.ttl")).toBe("http://ex.org/");
  });
});

describe("slugify", () => {
  it("PascalCases a multi-word class name", () => {
    expect(slugify("cheese topping", "PascalCase")).toBe("CheeseTopping");
  });

  it("camelCases a multi-word property name", () => {
    expect(slugify("has topping", "camelCase")).toBe("hasTopping");
  });

  it("strips non-alphanumeric separators", () => {
    expect(slugify("Order-Line_Item!!", "PascalCase")).toBe("OrderLineItem");
  });

  it("falls back to a default for an empty name", () => {
    expect(slugify("   ", "PascalCase")).toBe("Thing");
    expect(slugify("   ", "camelCase")).toBe("property");
  });
});

describe("mintIri", () => {
  it("mints a collision-free IRI in the inferred namespace", () => {
    const existing = ["http://ex.org/onto#Pizza"];
    expect(mintIri(existing, "file:///doc.ttl", "Topping", "PascalCase")).toBe("http://ex.org/onto#Topping");
  });

  it("appends a numeric suffix on collision", () => {
    const existing = ["http://ex.org/onto#Pizza", "http://ex.org/onto#Widget"];
    expect(mintIri(existing, "file:///doc.ttl", "Widget", "PascalCase")).toBe("http://ex.org/onto#Widget2");
  });

  it("keeps incrementing past multiple collisions", () => {
    const existing = ["http://ex.org/onto#Widget", "http://ex.org/onto#Widget2", "http://ex.org/onto#Widget3"];
    expect(mintIri(existing, "file:///doc.ttl", "Widget", "PascalCase")).toBe("http://ex.org/onto#Widget4");
  });
});
