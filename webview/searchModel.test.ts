import { describe, expect, it } from "vitest";
import type { SchemaModel } from "../src/rdf/schemaModel";
import { searchSchema } from "./searchModel";

const schema: SchemaModel = {
  title: "Coffee supply chain",
  description: "A small commerce ontology",
  isEmpty: false,
  unattachedProperties: [],
  entities: [
    {
      id: "urn:Customer",
      name: "Customer",
      description: "A person who places an order",
      origin: "owlClass",
      instanceCount: 4,
      icon: "👤",
      colorIndex: 0,
      connectionGroup: { index: 1, count: 1, size: 2 },
      properties: [
        {
          iri: "urn:emailAddress",
          name: "emailAddress",
          type: "string",
          provenance: "declared",
        },
      ],
    },
    {
      id: "urn:Order",
      name: "Order",
      origin: "owlClass",
      instanceCount: 8,
      icon: "🧾",
      colorIndex: 1,
      connectionGroup: { index: 1, count: 1, size: 2 },
      properties: [],
    },
  ],
  relations: [
    {
      id: "relation:places",
      iri: "urn:places",
      name: "places",
      source: "urn:Customer",
      target: "urn:Order",
      kind: "objectProperty",
      cardinality: "one-to-many",
      provenance: "declared",
    },
  ],
};

describe("searchSchema", () => {
  it("returns no results for an empty query", () => {
    expect(searchSchema(schema, "   ")).toEqual([]);
  });

  it("finds entities, properties, and relations from user-facing text", () => {
    expect(searchSchema(schema, "customer").map((result) => result.kind)).toEqual([
      "entity",
      "relation",
    ]);
    expect(searchSchema(schema, "email")[0]).toMatchObject({
      kind: "property",
      id: "urn:emailAddress",
      ownerId: "urn:Customer",
    });
    expect(searchSchema(schema, "order").map((result) => result.kind)).toEqual([
      "entity",
      "relation",
    ]);
  });

  it("ranks an exact label before prefix and contextual matches", () => {
    const results = searchSchema(schema, "order");

    expect(results[0]).toMatchObject({ kind: "entity", label: "Order" });
    expect(results[1]).toMatchObject({ kind: "relation", label: "places" });
  });

  it("matches case-insensitively and respects the result limit", () => {
    expect(searchSchema(schema, "CUSTOMER", 1)).toHaveLength(1);
    expect(searchSchema(schema, "CUSTOMER", 1)[0]).toMatchObject({
      kind: "entity",
      label: "Customer",
    });
  });

  it("uses localized labels in entity result metadata", () => {
    expect(
      searchSchema(schema, "customer", 8, {
        propertiesLabel: "プロパティ",
        instancesLabel: "インスタンス {0} 件",
      })[0].meta,
    ).toBe("1 プロパティ · インスタンス 4 件");
  });
});
