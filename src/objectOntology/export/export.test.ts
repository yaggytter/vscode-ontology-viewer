import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseObjectOntology } from "../parse";
import { buildAgentTools } from "./agentTools";
import { buildContextSummary } from "./contextSummary";
import { objectOntologyToTurtle } from "./turtle";
import { parseOntology } from "../../rdf/parse";

const cafe = parseObjectOntology(
  readFileSync(join(__dirname, "..", "..", "..", "samples", "cafe-orders.oont.yaml"), "utf8"),
).ontology!;

describe("buildAgentTools", () => {
  const tools = buildAgentTools(cafe).tools;

  it("produces one tool per action with a strict JSON Schema", () => {
    expect(tools.map((t) => t.name)).toEqual(["placeOrder", "markServed", "restockIngredient"]);
    expect(tools[0].inputSchema).toMatchObject({
      type: "object",
      required: ["orderId", "items"],
      additionalProperties: false,
      properties: {
        orderId: { type: "string" },
        items: { type: "array", items: { type: "string" } },
      },
    });
  });

  it("describes object references by their primary key", () => {
    expect(tools[1].inputSchema.properties?.order.description).toMatch(/Primary key \(orderId\) of the Order/);
  });

  it("states preconditions and effects in the tool description", () => {
    expect(tools[1].description).toContain("Preconditions (the call is rejected otherwise): Only an order that is being prepared can be served.");
    expect(tools[1].description).toContain("Effects: modifyObject Order setting status.");
    expect(tools[2].description).toContain("Side effects: Notify the shift lead");
  });

  it("maps numeric parameter types", () => {
    expect(tools[2].inputSchema.properties?.amount.type).toBe("number");
  });
});

describe("buildContextSummary", () => {
  it("lists types, links, actions and examples using API names", () => {
    const summary = buildContextSummary(cafe);
    expect(summary).toContain("# Ontology: Corner Cafe Orders");
    expect(summary).toContain("  - itemId: string (primary key)");
    expect(summary).toContain("  - category: string (one of: drink | food | dessert)");
    expect(summary).toContain("each Order has many MenuItem via `items`");
    expect(summary).toContain("## Actions (the only allowed writes)");
    expect(summary).toContain("Rejected unless:\n  - Every ordered item must be available.");
    expect(summary).toContain("itemId=M-01, name=Drip coffee");
  });

  it("can omit example objects", () => {
    expect(buildContextSummary(cafe, { examplesPerType: 0 })).not.toContain("## Example objects");
  });
});

describe("objectOntologyToTurtle", () => {
  it("writes Turtle that the RDF side of the viewer parses back", async () => {
    const turtle = await objectOntologyToTurtle(cafe);
    expect(turtle).toContain("@prefix oont: <urn:object-ontology:vocab#>.");
    const parsed = await parseOntology(turtle, "turtle", "file:///cafe.ttl");
    expect(parsed.errors).toEqual([]);
    expect(parsed.quads.length).toBeGreaterThan(100);
  });
});
