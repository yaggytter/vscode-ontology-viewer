import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseObjectOntology } from "../parse";
import { applySplice, formatScalar } from "./yamlEdit";
import {
  planAddLinkType,
  planAddObjectType,
  planAddProperty,
  planDeleteElement,
  planSetDescription,
  planSetDisplayName,
  planSetPropertyType,
  type EditPlan,
} from "./operations";

const NS = "urn:object-ontology:fleet#";

const DOC = `objectOntology: 1
name: Fleet
# Trucks and parcels.
objectTypes:
  Vehicle:
    primaryKey: vehicleId # the plate is not stable
    properties:
      vehicleId: { type: string }
      plate: string
      capacityKg:
        type: integer
        unit: kg

  Shipment:
    primaryKey: shipmentId
    properties: { shipmentId: { type: string } }
linkTypes:
  shipmentVehicle:
    from: { objectType: Shipment, name: vehicle, cardinality: one }
    to: { objectType: Vehicle, name: shipments, cardinality: many }
`;

function apply(text: string, plan: EditPlan): string {
  if (!plan.ok) {
    throw new Error(plan.reason);
  }
  return applySplice(text, plan.splice);
}

function cleanParse(text: string) {
  const parsed = parseObjectOntology(text);
  expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return parsed.ontology!;
}

describe("formatScalar", () => {
  it("quotes values YAML would otherwise reinterpret", () => {
    expect(formatScalar("plain")).toBe("plain");
    expect(formatScalar("yes")).toBe('"yes"');
    expect(formatScalar("12")).toBe('"12"');
    expect(formatScalar("a: b")).toBe('"a: b"');
    expect(formatScalar("配送")).toBe('"配送"');
    expect(formatScalar("line\nbreak")).toBe('"line\\nbreak"');
  });
});

describe("Object Ontology diagram edits", () => {
  it("adds an object type at the end of a block map and keeps comments", () => {
    const plan = planAddObjectType(DOC, "Delivery route", "A planned route.");
    expect(plan.ok && plan.newIri).toBe(`${NS}DeliveryRoute`);
    const next = apply(DOC, plan);
    expect(next).toContain("# the plate is not stable");
    expect(next).toContain("  DeliveryRoute:\n    displayName: Delivery route\n    description: A planned route.\n");
    const type = cleanParse(next).objectTypes.find((t) => t.apiName === "DeliveryRoute");
    expect(type?.primaryKey).toBe("deliveryRouteId");
  });

  it("derives a fallback API name for non-ASCII names and keeps the label as displayName", () => {
    const next = apply(DOC, planAddObjectType(DOC, "配送拠点", undefined));
    const type = cleanParse(next).objectTypes.find((t) => t.displayName === "配送拠点");
    expect(type?.apiName).toBe("ObjectType");
  });

  it("creates the objectTypes section when the document has none", () => {
    const text = "objectOntology: 1\nname: Empty\n";
    const next = apply(text, planAddObjectType(text, "Thing", undefined));
    expect(cleanParse(next).objectTypes.map((t) => t.apiName)).toEqual(["Thing"]);
  });

  it("adds into an empty `key:` section", () => {
    const text = "objectOntology: 1\nname: Empty\nobjectTypes:\n";
    const next = apply(text, planAddObjectType(text, "Thing", undefined));
    expect(cleanParse(next).objectTypes.map((t) => t.apiName)).toEqual(["Thing"]);
  });

  it("adds a property to a flow-style properties map", () => {
    const next = apply(DOC, planAddProperty(DOC, `${NS}Shipment`, "weight kg", "double"));
    expect(next).toContain("properties: { shipmentId: { type: string }, weightKg: { type: double, displayName: weight kg } }");
    expect(cleanParse(next).objectTypes[1].properties.map((p) => p.apiName)).toEqual(["shipmentId", "weightKg"]);
  });

  it("avoids clashing with an existing link-side name", () => {
    const next = apply(DOC, planAddProperty(DOC, `${NS}Shipment`, "vehicle", "string"));
    expect(cleanParse(next).objectTypes[1].properties.map((p) => p.apiName)).toContain("vehicle2");
  });

  it("changes a property type in flow, shorthand and block form", () => {
    let text = apply(DOC, planSetPropertyType(DOC, `${NS}Vehicle.vehicleId`, "integer"));
    text = apply(text, planSetPropertyType(text, `${NS}Vehicle.plate`, "date"));
    text = apply(text, planSetPropertyType(text, `${NS}Vehicle.capacityKg`, "datetime"));
    const types = cleanParse(text).objectTypes[0].properties.map((p) => [p.apiName, p.type]);
    expect(types).toEqual([
      ["vehicleId", "integer"],
      ["plate", "date"],
      ["capacityKg", "timestamp"],
    ]);
    expect(text).toContain("plate: date\n");
  });

  it("refuses property types it cannot express safely", () => {
    expect(planSetPropertyType(DOC, `${NS}Vehicle.plate`, "enum").ok).toBe(false);
  });

  it("adds a link type with one-to-many defaults and unique side names", () => {
    const plan = planAddLinkType(DOC, `${NS}Vehicle`, `${NS}Shipment`, "current load");
    const next = apply(DOC, plan);
    const link = cleanParse(next).linkTypes.find((l) => l.apiName === "vehicleShipment");
    expect(link).toMatchObject({
      displayName: "current load",
      from: { objectType: "Vehicle", name: "currentLoad", cardinality: "one" },
      to: { objectType: "Shipment", name: "vehicles", cardinality: "many" },
    });
    expect(plan.ok && plan.newIri).toBe(`${NS}link/vehicleShipment`);
  });

  it("refuses links to interfaces", () => {
    const text = `${DOC}interfaces:\n  Trackable: {}\n`;
    expect(planAddLinkType(text, `${NS}Vehicle`, `${NS}Trackable`, "x").ok).toBe(false);
  });

  it("renames and describes types, properties and links", () => {
    let text = apply(DOC, planSetDisplayName(DOC, `${NS}Vehicle`, "車両"));
    text = apply(text, planSetDisplayName(text, `${NS}Vehicle.plate`, "ナンバー"));
    text = apply(text, planSetDisplayName(text, `${NS}link/shipmentVehicle`, "Loaded on"));
    text = apply(text, planSetDescription(text, `${NS}Shipment`, "A parcel: tracked end to end."));
    const ontology = cleanParse(text);
    expect(ontology.objectTypes[0].displayName).toBe("車両");
    expect(ontology.objectTypes[1].description).toBe("A parcel: tracked end to end.");
    expect(ontology.linkTypes[0].displayName).toBe("Loaded on");
    // The shorthand property is expanded so it can carry a displayName.
    expect(text).toContain('plate: { type: string, displayName: "ナンバー" }');
  });

  it("deletes block, flow and link entries but protects primary keys", () => {
    let text = apply(DOC, planDeleteElement(DOC, `${NS}Vehicle.capacityKg`));
    expect(text).not.toContain("capacityKg");
    text = apply(text, planDeleteElement(text, `${NS}link/shipmentVehicle`));
    expect(cleanParse(text).linkTypes).toEqual([]);
    expect(planDeleteElement(text, `${NS}Vehicle.vehicleId`).ok).toBe(false);
    expect(planDeleteElement(text, `${NS}Vehicle`).ok).toBe(false);
  });

  it("refuses to edit a document with syntax errors", () => {
    expect(planAddObjectType("objectOntology: 1\nobjectTypes: {\n", "X", undefined).ok).toBe(false);
  });

  it("refuses to delete a link type an action rule depends on", () => {
    const text = readFileSync(join(__dirname, "..", "..", "..", "samples", "cafe-orders.oont.yaml"), "utf8");
    const ns = cleanParse(text).namespace;
    expect(planDeleteElement(text, `${ns}link/orderItems`)).toMatchObject({ ok: false });
  });

  it("can build a small ontology from scratch through the diagram", () => {
    let text = "objectOntology: 1\nname: Fleet\n";
    text = apply(text, planAddObjectType(text, "Depot", undefined));
    text = apply(text, planAddObjectType(text, "Truck", undefined));
    text = apply(text, planAddProperty(text, `${NS}Truck`, "plate", "string"));
    text = apply(text, planAddLinkType(text, `${NS}Truck`, `${NS}Depot`, "home depot"));
    const ontology = cleanParse(text);
    expect(ontology.objectTypes.map((t) => t.apiName)).toEqual(["Depot", "Truck"]);
    expect(ontology.linkTypes[0].from.name).toBe("homeDepot");
  });
});
