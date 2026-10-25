import { describe, expect, it } from "vitest";
import { detectObjectOntology } from "./detect";
import { buildActionViews } from "./actionView";
import { parseObjectOntology } from "./parse";
import { keyRangeAt, nodeAt, pathForElement } from "./locate";
import { defaultNamespace, parseElementIri } from "./iris";

describe("detectObjectOntology", () => {
  it("claims *.oont.* files by name", () => {
    expect(detectObjectOntology("/w/fleet.oont.yaml", "yaml", "")).toBe("yaml");
    expect(detectObjectOntology("/w/fleet.OONT.yml", "yaml", "")).toBe("yaml");
    expect(detectObjectOntology("/w/fleet.oont.json", "json", "")).toBe("json");
  });

  it("never claims RDF documents or ordinary YAML/JSON", () => {
    expect(detectObjectOntology("/w/a.ttl", "turtle", "objectOntology: 1")).toBeUndefined();
    expect(detectObjectOntology("/w/a.jsonld", "jsonld", '{"objectOntology":1}')).toBeUndefined();
    expect(detectObjectOntology("/w/ci.yaml", "yaml", "name: build\n")).toBeUndefined();
    expect(detectObjectOntology("/w/package.json", "json", '{"name":"x"}')).toBeUndefined();
  });

  it("recognizes untitled documents by their first key", () => {
    expect(detectObjectOntology("Untitled-1", "yaml", "# sample\nobjectOntology: 1\n")).toBe("yaml");
    expect(detectObjectOntology("Untitled-2", "json", '{ "objectOntology": 1 }')).toBe("json");
    expect(detectObjectOntology("Untitled-3", "yaml", "name: x\nobjectOntology: 1\n")).toBeUndefined();
  });
});

const DOC = `objectOntology: 1
name: Fleet
objectTypes:
  Vehicle:
    primaryKey: vehicleId
    properties: { vehicleId: string }
  Shipment:
    displayName: Parcel
    primaryKey: shipmentId
    properties: { shipmentId: string }
interfaces:
  Trackable: {}
linkTypes:
  shipmentVehicle:
    from: { objectType: Shipment, name: vehicle, cardinality: one }
    to: { objectType: Vehicle, name: shipments, cardinality: many }
actionTypes:
  assignVehicle:
    parameters:
      shipment: { type: objectRef, objectType: Shipment, required: true }
      vehicles: { type: "objectRef[]", objectType: Vehicle }
      note: { type: string, description: Free text }
    rules:
      - { op: createLink, linkType: shipmentVehicle, from: shipment, to: vehicles }
      - { op: modifyObject, objectType: Shipment, object: shipment, set: { shipmentId: $note } }
    validations:
      - Vehicle must be available.
      - { description: Fits, expr: "a <= b" }
    sideEffects: [Driver is notified]
`;

describe("buildActionViews", () => {
  it("resolves parameter types to diagram ids and describes rules", () => {
    const ontology = parseObjectOntology(DOC).ontology!;
    const [view] = buildActionViews(ontology);
    expect(view).toMatchObject({
      id: "urn:object-ontology:fleet#action/assignVehicle",
      name: "assignVehicle",
      rules: ["createLink shipmentVehicle (shipment → vehicles)", "modifyObject Shipment · sets shipmentId"],
      validations: ["Vehicle must be available.", "Fits (a <= b)"],
      sideEffects: ["Driver is notified"],
      affectedTypeIds: ["urn:object-ontology:fleet#Shipment", "urn:object-ontology:fleet#Vehicle"],
    });
    expect(view.parameters).toEqual([
      expect.objectContaining({ id: "shipment", type: "Shipment", objectTypeName: "Parcel", objectTypeId: "urn:object-ontology:fleet#Shipment", required: true }),
      expect.objectContaining({ id: "vehicles", type: "Vehicle[]", required: false }),
      expect.objectContaining({ id: "note", type: "string", description: "Free text" }),
    ]);
  });
});

describe("locate", () => {
  const parsed = parseObjectOntology(DOC);
  const ns = parsed.ontology!.namespace;

  it("maps element ids back to their YAML paths", () => {
    expect(pathForElement(parsed.document, ns, `${ns}Vehicle`)).toEqual(["objectTypes", "Vehicle"]);
    expect(pathForElement(parsed.document, ns, `${ns}Trackable`)).toEqual(["interfaces", "Trackable"]);
    expect(pathForElement(parsed.document, ns, `${ns}Vehicle.vehicleId`)).toEqual(["objectTypes", "Vehicle", "properties", "vehicleId"]);
    expect(pathForElement(parsed.document, ns, `${ns}link/shipmentVehicle`)).toEqual(["linkTypes", "shipmentVehicle"]);
    expect(pathForElement(parsed.document, ns, `${ns}action/assignVehicle`)).toEqual(["actionTypes", "assignVehicle"]);
    expect(pathForElement(parsed.document, ns, `${ns}Nope`)).toBeUndefined();
    expect(pathForElement(parsed.document, ns, `${ns}Vehicle.nope`)).toBeUndefined();
    expect(pathForElement(parsed.document, ns, "http://elsewhere/x")).toBeUndefined();
  });

  it("points at the key of a declaration and at list items", () => {
    const range = keyRangeAt(parsed.document, ["objectTypes", "Shipment"])!;
    expect(DOC.slice(range.start, range.end)).toBe("Shipment");
    const rule = keyRangeAt(parsed.document, ["actionTypes", "assignVehicle", "rules", 1])!;
    expect(DOC.slice(rule.start, rule.end)).toMatch(/^\{ op: modifyObject/);
    expect(keyRangeAt(parsed.document, [])).toBeUndefined();
    expect(nodeAt(parsed.document, ["objectTypes", 0])).toBeUndefined();
  });
});

describe("iris", () => {
  it("slugifies ontology names into a default namespace", () => {
    expect(defaultNamespace("Harbor City Delivery Ops")).toBe("urn:object-ontology:harbor-city-delivery-ops#");
    expect(defaultNamespace("配送")).toBe("urn:object-ontology:ontology#");
  });

  it("rejects ids that are not minted element IRIs", () => {
    const ns = "urn:x#";
    expect(parseElementIri(ns, `${ns}Vehicle/V-01`)).toBeUndefined();
    expect(parseElementIri(ns, `${ns}link/bad-name`)).toBeUndefined();
  });
});
