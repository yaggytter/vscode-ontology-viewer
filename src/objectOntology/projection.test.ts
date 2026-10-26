import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseObjectOntology } from "./parse";
import { objectOntologyToSchemaModel } from "./toSchemaModel";
import { objectOntologyToQuads } from "./toQuads";
import { OBJECT_ONTOLOGY_SAMPLE_QUERIES } from "./sampleQueries";
import { runSparqlQuery } from "../sparql/engine";
import type { ObjectOntology } from "./model";

const SAMPLES_DIR = join(__dirname, "..", "..", "samples");

function load(text: string): ObjectOntology {
  const { ontology, diagnostics } = parseObjectOntology(text);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return ontology!;
}

const FLEET = `objectOntology: 1
name: Fleet
objectTypes:
  Vehicle:
    displayName: 車両
    primaryKey: vehicleId
    titleProperty: plate
    implements: [Trackable]
    color: "#3a7bd5"
    icon: "javascript:alert(1)"
    properties:
      vehicleId: { type: string }
      plate: { type: string }
      lat: double
      status: { type: string, enum: [available, onRoute] }
  Shipment:
    primaryKey: shipmentId
    properties:
      shipmentId: { type: string }
      vehicleId: { type: string }
interfaces:
  Trackable:
    properties: { lat: double }
linkTypes:
  shipmentVehicle:
    from: { objectType: Shipment, name: vehicle, cardinality: one }
    to: { objectType: Vehicle, name: shipments, cardinality: many }
    foreignKey: Shipment.vehicleId
objects:
  Vehicle:
    - { vehicleId: V-01, plate: 品川 100 あ 12-34, lat: 35.6, status: available }
  Shipment:
    - { shipmentId: S-1, vehicleId: V-01 }
    - { shipmentId: S-2, vehicleId: V-01 }
`;

describe("objectOntologyToSchemaModel", () => {
  it("maps types, interfaces, links and implements onto the schema model", () => {
    const schema = objectOntologyToSchemaModel(load(FLEET));
    expect(schema.title).toBe("Fleet");
    expect(schema.entities.map((e) => [e.name, e.origin, e.instanceCount])).toEqual([
      ["車両", "objectType", 1],
      ["Shipment", "objectType", 2],
      ["Trackable", "interface", 0],
    ]);
    const vehicle = schema.entities[0];
    expect(vehicle.properties.find((p) => p.isIdentifier)?.name).toBe("vehicleId");
    expect(vehicle.properties.find((p) => p.name === "status")).toMatchObject({ type: "enum", enumValues: ["available", "onRoute"] });
    expect(vehicle.colorOverride).toBe("#3a7bd5");
    expect(schema.relations.map((r) => [r.kind, r.name, r.cardinality])).toEqual([
      ["linkType", "vehicle", "many-to-one"],
      ["implements", "", "unspecified"],
    ]);
  });

  it("never passes an unsafe icon value through to the diagram", () => {
    const vehicle = objectOntologyToSchemaModel(load(FLEET)).entities[0];
    expect(vehicle.icon).not.toContain("javascript");
  });

  it("is empty for a document with no types", () => {
    expect(objectOntologyToSchemaModel(load("objectOntology: 1\n")).isEmpty).toBe(true);
  });
});

describe("objectOntologyToQuads + SPARQL", () => {
  it("derives foreign-key links between example objects in both directions", async () => {
    const quads = objectOntologyToQuads(load(FLEET));
    const result = await runSparqlQuery(
      quads,
      `PREFIX oont: <urn:object-ontology:vocab#>
       PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
       SELECT ?shipment WHERE {
         ?vehicle rdfs:label "品川 100 あ 12-34" .
         ?side oont:apiName "shipments" .
         ?vehicle ?side ?shipment .
       } ORDER BY ?shipment`,
    );
    expect(result.kind).toBe("bindings");
    if (result.kind === "bindings") {
      expect(result.rows.map((r) => r.shipment.value)).toEqual([
        "urn:object-ontology:fleet#Shipment/S-1",
        "urn:object-ontology:fleet#Shipment/S-2",
      ]);
    }
  });

  it("lets RDFS-style queries see implementers through rdfs:subClassOf", async () => {
    const result = await runSparqlQuery(
      objectOntologyToQuads(load(FLEET)),
      `ASK { <urn:object-ontology:fleet#Vehicle> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <urn:object-ontology:fleet#Trackable> }`,
    );
    expect(result).toEqual({ kind: "boolean", value: true });
  });

  for (const sample of OBJECT_ONTOLOGY_SAMPLE_QUERIES) {
    it(`sample query ${sample.id} runs and returns rows on the cafe sample`, async () => {
      const text = readFileSync(join(SAMPLES_DIR, "cafe-orders.oont.yaml"), "utf8");
      const quads = objectOntologyToQuads(load(text));
      const result = await runSparqlQuery(quads, sample.query);
      expect(result.kind).toBe("bindings");
      if (result.kind === "bindings" && sample.id !== "oo-interfaces") {
        expect(result.rows.length).toBeGreaterThan(0);
      }
    });
  }
});
