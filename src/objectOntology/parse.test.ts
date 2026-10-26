import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_DOCUMENT_LENGTH, parseObjectOntology } from "./parse";
import { actionAffectedTypes } from "./model";

const SAMPLES_DIR = join(__dirname, "..", "..", "samples");

const MINIMAL = `objectOntology: 1
name: Fleet
objectTypes:
  Vehicle:
    primaryKey: vehicleId
    titleProperty: plate
    properties:
      vehicleId: { type: string }
      plate: string
      tags: { type: "string[]" }
  Shipment:
    primaryKey: shipmentId
    properties:
      shipmentId: { type: string }
      vehicleId: { type: string }
linkTypes:
  shipmentVehicle:
    from: { objectType: Shipment, name: vehicle, cardinality: one }
    to: { objectType: Vehicle, name: shipments, cardinality: many }
    foreignKey: Shipment.vehicleId
`;

function errorsOf(text: string): string[] {
  return parseObjectOntology(text)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message);
}

function warningsOf(text: string): string[] {
  return parseObjectOntology(text)
    .diagnostics.filter((d) => d.severity === "warning")
    .map((d) => d.message);
}

describe("parseObjectOntology", () => {
  it("reads object types, shorthand and list property types, and link types", () => {
    const { ontology, diagnostics } = parseObjectOntology(MINIMAL);
    expect(diagnostics).toEqual([]);
    expect(ontology?.name).toBe("Fleet");
    expect(ontology?.namespace).toBe("urn:object-ontology:fleet#");
    const vehicle = ontology?.objectTypes.find((t) => t.apiName === "Vehicle");
    expect(vehicle?.properties.map((p) => [p.apiName, p.type, p.isArray])).toEqual([
      ["vehicleId", "string", false],
      ["plate", "string", false],
      ["tags", "string", true],
    ]);
    expect(ontology?.linkTypes[0]).toMatchObject({
      apiName: "shipmentVehicle",
      from: { objectType: "Shipment", name: "vehicle", cardinality: "one" },
      to: { objectType: "Vehicle", name: "shipments", cardinality: "many" },
      foreignKey: { objectType: "Shipment", property: "vehicleId" },
    });
  });

  it("reports YAML syntax errors with a source range instead of throwing", () => {
    const result = parseObjectOntology("objectOntology: 1\nobjectTypes:\n  A: { primaryKey: id\n");
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
    expect(result.diagnostics[0].range.end).toBeGreaterThanOrEqual(result.diagnostics[0].range.start);
  });

  it("rejects a document that is not a mapping", () => {
    const result = parseObjectOntology("- just\n- a list\n");
    expect(result.ontology).toBeUndefined();
    expect(result.diagnostics[0].message).toMatch(/must be a mapping/);
  });

  it("requires the version marker and a supported version", () => {
    expect(errorsOf("name: x\n")).toEqual(expect.arrayContaining([expect.stringMatching(/Missing `objectOntology: 1`/)]));
    expect(errorsOf("objectOntology: 2\nname: x\n")).toEqual(
      expect.arrayContaining([expect.stringMatching(/Unsupported Object Ontology version/)]),
    );
  });

  it("flags invalid API names, unknown types and missing primary keys", () => {
    const errors = errorsOf(`objectOntology: 1
objectTypes:
  bad-name: { primaryKey: id, properties: { id: string } }
  Thing:
    properties:
      id: { type: text }
`);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/not a valid API name/),
        expect.stringMatching(/needs a primaryKey/),
        expect.stringMatching(/Unknown property type "text"/),
      ]),
    );
  });

  it("does not let __proto__ keys reach a plain object", () => {
    const { ontology } = parseObjectOntology(`objectOntology: 1
objectTypes:
  __proto__: { primaryKey: id, properties: { id: string } }
`);
    expect(ontology?.objectTypes).toEqual([]);
    expect(({} as Record<string, unknown>).primaryKey).toBeUndefined();
  });

  it("reads an exponential alias tree without expanding it", () => {
    const levels = ["a0: &a0 [x, x, x, x, x, x, x, x, x]"];
    for (let i = 1; i < 9; i++) {
      levels.push(`a${i}: &a${i} [${Array(9).fill(`*a${i - 1}`).join(", ")}]`);
    }
    const bomb = `objectOntology: 1\n${levels.join("\n")}\nobjects:\n  T:\n    - { id: *a8 }\n`;
    const started = Date.now();
    const result = parseObjectOntology(bomb);
    // The reader only follows the shapes the format defines, so a nested
    // alias is read one level deep rather than expanded.
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("refuses files beyond the size cap", () => {
    const result = parseObjectOntology(`objectOntology: 1\n#${"x".repeat(MAX_DOCUMENT_LENGTH)}`);
    expect(result.ontology).toBeUndefined();
    expect(result.diagnostics[0].message).toMatch(/too large/);
  });

  it("warns about unknown fields so typos do not pass silently", () => {
    expect(warningsOf("objectOntology: 1\nobjectTypez: {}\n")).toEqual([expect.stringMatching(/Unknown field "objectTypez"/)]);
  });

  it("cross-checks references between types, links, interfaces and actions", () => {
    const errors = errorsOf(`objectOntology: 1
objectTypes:
  A:
    primaryKey: id
    titleProperty: missing
    implements: [Nope]
    properties: { id: string }
interfaces:
  A: {}
linkTypes:
  ab:
    from: { objectType: A, name: id, cardinality: one }
    to: { objectType: B, name: as, cardinality: many }
actionTypes:
  doIt:
    parameters:
      target: { type: objectRef }
    rules:
      - { op: modifyObject, objectType: A, object: other, set: { nothing: $ghost } }
      - { op: createLink, linkType: nope }
`);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/titleProperty "missing"/),
        expect.stringMatching(/unknown interface "Nope"/),
        expect.stringMatching(/both an object type and an interface/),
        expect.stringMatching(/unknown object type "B"/),
        expect.stringMatching(/"id" is already a property or link name on A/),
        expect.stringMatching(/needs objectType/),
        expect.stringMatching(/unknown parameter "other"/),
        expect.stringMatching(/no property "nothing"/),
        expect.stringMatching(/Unknown parameter "\$ghost"/),
        expect.stringMatching(/Unknown link type "nope"/),
      ]),
    );
  });

  it("warns when an implementing type lacks an interface property", () => {
    expect(
      warningsOf(`objectOntology: 1
interfaces:
  Base: { properties: { lat: double } }
  Located: { extends: [Base], properties: { label: string } }
objectTypes:
  Site: { primaryKey: id, implements: [Located], properties: { id: string, label: string } }
`),
    ).toEqual([expect.stringMatching(/has no property "lat"/)]);
  });

  it("validates example objects against their types", () => {
    const errors = errorsOf(`${MINIMAL}objects:
  Vehicle:
    - { vehicleId: V1, plate: X }
    - { vehicleId: V1, plate: Y }
    - { plate: Z }
  Ghost:
    - { id: 1 }
`);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Duplicate primary key V1/),
        expect.stringMatching(/missing its primary key/),
        expect.stringMatching(/unknown object type "Ghost"/),
      ]),
    );
  });

  it("parses JSON documents through the same reader", () => {
    const json = JSON.stringify({
      objectOntology: 1,
      name: "Json",
      objectTypes: { A: { primaryKey: "id", properties: { id: { type: "string" } } } },
    });
    const { ontology, diagnostics } = parseObjectOntology(json);
    expect(diagnostics).toEqual([]);
    expect(ontology?.objectTypes[0].apiName).toBe("A");
  });

  it("parses the bundled cafe sample cleanly", () => {
    const text = readFileSync(join(SAMPLES_DIR, "cafe-orders.oont.yaml"), "utf8");
    const { ontology, diagnostics } = parseObjectOntology(text);
    expect(diagnostics).toEqual([]);
    expect(ontology?.actionTypes.map((a) => a.apiName)).toEqual(["placeOrder", "markServed", "restockIngredient"]);
    const placeOrder = ontology!.actionTypes[0];
    expect(actionAffectedTypes(ontology!, placeOrder)).toEqual(["MenuItem", "Order"]);
  });
});
