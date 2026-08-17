import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOntology } from "./parse";
import { buildSchemaModel, type SchemaModel } from "./schemaModel";

const SAMPLES_DIR = join(__dirname, "..", "..", "samples");

async function schemaFor(ttl: string, baseIRI = "http://ex.org/doc"): Promise<SchemaModel> {
  const { quads, errors } = await parseOntology(ttl, "turtle", baseIRI);
  expect(errors).toEqual([]);
  return buildSchemaModel(quads);
}

async function schemaForRdfXml(xml: string, baseIRI: string): Promise<SchemaModel> {
  const { quads, errors } = await parseOntology(xml, "rdfxml", baseIRI);
  expect(errors).toEqual([]);
  return buildSchemaModel(quads);
}

async function schemaForSample(fileName: string, format: "turtle" | "rdfxml" = "turtle"): Promise<SchemaModel> {
  const text = readFileSync(join(SAMPLES_DIR, fileName), "utf8");
  const { quads, errors } = await parseOntology(text, format, `file:///samples/${fileName}`);
  expect(errors).toEqual([]);
  return buildSchemaModel(quads);
}

function relationBetween(schema: SchemaModel, sourceSuffix: string, targetSuffix: string) {
  return schema.relations.find((r) => r.source.endsWith(sourceSuffix) && r.target.endsWith(targetSuffix));
}

describe("buildSchemaModel — regression: no sample ever renders empty", () => {
  it.each([
    "neighborhood-garden.ttl",
    "tool-lending.ttl",
    "field-research.ttl",
    "community-services-skos.ttl",
    "harbor-market.ttl",
    "city-mobility.ttl",
  ])("%s is not empty", async (fileName) => {
    const schema = await schemaForSample(fileName);
    expect(schema.isEmpty).toBe(false);
    expect(schema.entities.length).toBeGreaterThan(0);
  });

  it("community-event.rdf (RDF/XML, zero owl:Class declarations) is not empty", async () => {
    const schema = await schemaForSample("community-event.rdf", "rdfxml");
    expect(schema.isEmpty).toBe(false);
    expect(schema.entities.map((entity) => entity.name).sort()).toEqual(["Activity", "Participant", "Venue"]);
    expect(relationBetween(schema, "Participant", "Activity")).toMatchObject({ name: "joins" });
    expect(relationBetween(schema, "Activity", "Venue")).toMatchObject({ name: "held At" });
  });
});

describe("buildSchemaModel — neighborhood-garden.ttl", () => {
  it("finds the 9 declared owl:Class entities, and the ontology title/description", async () => {
    const schema = await schemaForSample("neighborhood-garden.ttl");
    expect(schema.entities).toHaveLength(9);
    expect(schema.entities.every((e) => e.origin === "owlClass")).toBe(true);
    expect(schema.title).toBe("Neighborhood Garden");
    expect(schema.description).toBe("A compact fictional model of shared garden plots, plants, and volunteers.");
  });

  it("attaches typed properties to Plot instead of rendering them as nodes", async () => {
    const schema = await schemaForSample("neighborhood-garden.ttl");
    const plot = schema.entities.find((e) => e.id.endsWith("#Plot"));
    expect(plot?.properties).toEqual([
      expect.objectContaining({ name: "plot code", type: "string", provenance: "declared" }),
      expect.objectContaining({ name: "area (m²)", type: "decimal", provenance: "declared" }),
    ]);
  });

  it("renders all 7 rdfs:subClassOf statements as subClassOf-kind relations", async () => {
    const schema = await schemaForSample("neighborhood-garden.ttl");
    const subClassEdges = schema.relations.filter((r) => r.kind === "subClassOf");
    expect(subClassEdges).toHaveLength(7);
    expect(subClassEdges.every((r) => r.provenance === "declared")).toBe(true);
  });

  it("keeps containsPlot and resolves plotOf through owl:inverseOf", async () => {
    const schema = await schemaForSample("neighborhood-garden.ttl");
    const objectPropertyEdges = schema.relations.filter((r) => r.kind === "objectProperty");
    expect(objectPropertyEdges).toHaveLength(4);

    const containsPlot = relationBetween(schema, "#Garden", "#Plot");
    expect(containsPlot).toMatchObject({ name: "contains plot", provenance: "declared" });

    const plotOf = relationBetween(schema, "#Plot", "#Garden");
    expect(plotOf).toMatchObject({ name: "plot of", provenance: "inferred-inverse" });

    expect(schema.unattachedProperties).toEqual([]);
  });

  it("counts individuals against their class without turning them into entities", async () => {
    const schema = await schemaForSample("neighborhood-garden.ttl");
    const herb = schema.entities.find((e) => e.id.endsWith("#Herb"));
    const vegetable = schema.entities.find((e) => e.id.endsWith("#Vegetable"));
    expect(herb?.instanceCount).toBe(1);
    expect(vegetable?.instanceCount).toBe(1);
    expect(schema.entities.some((e) => e.id.endsWith("lemonBalm"))).toBe(false);
  });
});

describe("buildSchemaModel — tool-lending.ttl: the domain/range fallback ladder", () => {
  it("keeps all 6 object properties, including relations resolved from inverse declarations or usage", async () => {
    const schema = await schemaForSample("tool-lending.ttl");
    expect(schema.entities).toHaveLength(3);
    expect(schema.relations.filter((r) => r.kind === "objectProperty")).toHaveLength(6);

    const byName = new Map(schema.relations.map((r) => [r.name, r]));
    expect(byName.get("lends to")).toMatchObject({ provenance: "declared" });
    expect(byName.get("borrows from")).toMatchObject({ provenance: "inferred-inverse" });
    expect(byName.get("can reach through")).toMatchObject({ provenance: "inferred-usage" });
    expect(byName.get("collaborates with")).toMatchObject({ provenance: "inferred-usage" });
  });

  it("counts 5 Member instances", async () => {
    const schema = await schemaForSample("tool-lending.ttl");
    const member = schema.entities.find((entity) => entity.id.endsWith("#Member"));
    expect(member?.instanceCount).toBe(5);
  });
});

describe("buildSchemaModel — field-research.ttl", () => {
  it("attaches typed observation properties", async () => {
    const schema = await schemaForSample("field-research.ttl");
    const observation = schema.entities.find((e) => e.id.endsWith("#Observation"));
    const byName = new Map(observation?.properties.map((p) => [p.name, p]));
    expect(byName.get("observed on")).toMatchObject({ type: "date" });
    expect(byName.get("count")).toMatchObject({ type: "integer" });
    expect(byName.get("note")).toMatchObject({ type: "string" });
  });

  it("relates Observation to Researcher via recordedBy", async () => {
    const schema = await schemaForSample("field-research.ttl");
    const rel = relationBetween(schema, "#Observation", "#Researcher");
    expect(rel).toMatchObject({ name: "recorded by", provenance: "declared" });
  });
});

describe("buildSchemaModel — community-services-skos.ttl: the SKOS fallback", () => {
  it("registers every skos:Concept as an entity even though no owl:Class exists", async () => {
    const schema = await schemaForSample("community-services-skos.ttl");
    expect(schema.entities).toHaveLength(7);
    expect(schema.entities.every((e) => e.origin === "skosConcept")).toBe(true);
    expect(schema.entities.map((e) => e.name).sort()).toEqual(
      ["Support", "Daily Life", "Learning", "Meal Delivery", "Home Visit", "Digital Workshop", "Language Exchange"].sort(),
    );
  });

  it("renders skos:broader as skosBroader-kind edges and skos:related as a normal relation", async () => {
    const schema = await schemaForSample("community-services-skos.ttl");
    expect(schema.relations.filter((r) => r.kind === "skosBroader")).toHaveLength(6);
    const related = schema.relations.filter((r) => r.kind === "objectProperty");
    expect(related).toHaveLength(2);
    expect(relationBetween(schema, "mealDelivery", "homeVisit")).toMatchObject({ kind: "objectProperty" });
  });
});

describe("buildSchemaModel — city-mobility.ttl", () => {
  it("keeps a readable medium-sized schema with hierarchy and cross-domain relations", async () => {
    const schema = await schemaForSample("city-mobility.ttl");
    expect(schema.entities).toHaveLength(16);
    expect(schema.relations.filter((relation) => relation.kind === "subClassOf")).toHaveLength(15);
    expect(schema.relations.filter((relation) => relation.kind === "objectProperty")).toHaveLength(9);
    expect(schema.entities.every((entity) => entity.connectionGroup.index === 1)).toBe(true);
    expect(schema.entities.every((entity) => entity.connectionGroup.size === 16)).toBe(true);
    expect(relationBetween(schema, "#Trip", "#Vehicle")).toMatchObject({
      name: "uses vehicle",
      cardinality: "many-to-one",
    });
  });
});

describe("buildSchemaModel — dangling subClassOf parent gets synthesized, never crashes", () => {
  it("synthesizes an inferred entity for an undeclared rdfs:subClassOf parent", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/onto#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      :Pizza a owl:Class ;
        rdfs:label "Pizza" ;
        rdfs:subClassOf :Food .
    `);
    expect(schema.entities).toHaveLength(2);
    const food = schema.entities.find((e) => e.id.endsWith("#Food"));
    expect(food).toMatchObject({ origin: "inferred", name: "Food" });
    expect(relationBetween(schema, "#Pizza", "#Food")).toMatchObject({ kind: "subClassOf" });
  });
});

describe("buildSchemaModel — owl:unionOf domain expansion", () => {
  it("attaches a property to every named member of a unionOf domain", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/onto#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      :Dog a owl:Class .
      :Cat a owl:Class .
      :name a owl:DatatypeProperty ;
        rdfs:domain [ owl:unionOf ( :Dog :Cat ) ] ;
        rdfs:range xsd:string .
    `);
    const dog = schema.entities.find((e) => e.id.endsWith("#Dog"));
    const cat = schema.entities.find((e) => e.id.endsWith("#Cat"));
    expect(dog?.properties).toHaveLength(1);
    expect(cat?.properties).toHaveLength(1);
    expect(dog?.properties[0]).toMatchObject({ type: "string", provenance: "inferred-union" });
  });
});

describe("buildSchemaModel — cardinality from real OWL", () => {
  it("derives many-to-one from owl:FunctionalProperty", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/onto#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      :Person a owl:Class .
      :Country a owl:Class .
      :bornIn a owl:ObjectProperty, owl:FunctionalProperty ;
        rdfs:domain :Person ;
        rdfs:range :Country .
    `);
    const rel = relationBetween(schema, "#Person", "#Country");
    expect(rel?.cardinality).toBe("many-to-one");
  });

  it("leaves cardinality unspecified with no owl:Functional*Property assertion", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/onto#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      :A a owl:Class .
      :B a owl:Class .
      :rel a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .
    `);
    expect(relationBetween(schema, "#A", "#B")?.cardinality).toBe("unspecified");
  });
});

describe("buildSchemaModel — unresolved relations are listed, never dropped", () => {
  it("lists an object property with neither domain/range nor instance data as unattached", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      :orphanRelates a owl:ObjectProperty .
    `);
    expect(schema.unattachedProperties).toEqual([
      expect.objectContaining({ kind: "object", iri: "http://ex.org/orphanRelates" }),
    ]);
    expect(schema.relations).toHaveLength(0);
  });

  it("lists a datatype property with no domain and no instance data as unattached", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      :orphanProp a owl:DatatypeProperty .
    `);
    expect(schema.unattachedProperties).toEqual([
      expect.objectContaining({ kind: "datatype", iri: "http://ex.org/orphanProp" }),
    ]);
  });
});

describe("buildSchemaModel — Ontology-Playground-style icon/color overrides", () => {
  it("prefers a document-local-namespace icon/color override over the derived default", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/onto#> .
      @prefix ont: <http://ex.org/onto#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      :Widget a owl:Class ;
        rdfs:label "Widget" ;
        ont:icon "🔧" ;
        ont:color "#123ABC" .
    `);
    const widget = schema.entities.find((e) => e.id.endsWith("#Widget"));
    expect(widget?.icon).toBe("🔧");
    expect(widget?.colorOverride).toBe("#123ABC");
  });

  it("rejects an invalid color literal rather than passing it through", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/onto#> .
      @prefix ont: <http://ex.org/onto#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      :Widget a owl:Class ; ont:color "javascript:alert(1)" .
    `);
    const widget = schema.entities.find((e) => e.id.endsWith("#Widget"));
    expect(widget).toBeDefined();
    expect(widget?.colorOverride).toBeUndefined();
  });
});

describe("buildSchemaModel — Ontology-Playground RDF/XML interop (cosmic-coffee-style excerpt)", () => {
  const BASE = "http://example.org/ontology/cosmic-coffee-company/";
  const COSMIC_COFFEE_EXCERPT = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xml:base="${BASE}"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
    xmlns:ont="${BASE}">

    <owl:Ontology rdf:about="${BASE}"/>

    <owl:Class rdf:about="${BASE}Customer">
        <rdfs:label>Customer</rdfs:label>
    </owl:Class>

    <owl:Class rdf:about="${BASE}Order">
        <rdfs:label>Order</rdfs:label>
    </owl:Class>

    <owl:DatatypeProperty rdf:about="${BASE}customer_customerId">
        <rdfs:label>customerId</rdfs:label>
        <rdfs:domain rdf:resource="${BASE}Customer"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <ont:isIdentifier rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean">true</ont:isIdentifier>
    </owl:DatatypeProperty>

    <owl:ObjectProperty rdf:about="${BASE}customer_places_order">
        <rdfs:label>places</rdfs:label>
        <ont:fromEntityId>customer</ont:fromEntityId>
        <ont:toEntityId>order</ont:toEntityId>
        <ont:cardinality>one-to-many</ont:cardinality>
    </owl:ObjectProperty>

    <owl:DatatypeProperty rdf:about="${BASE}order_contains_product_quantity">
        <rdfs:label>quantity</rdfs:label>
        <ont:relationshipAttributeOf>customer_places_order</ont:relationshipAttributeOf>
        <ont:attributeType>integer</ont:attributeType>
    </owl:DatatypeProperty>

</rdf:RDF>`;

  it("resolves fromEntityId/toEntityId + cardinality override, and reads isIdentifier as a real boolean", async () => {
    const schema = await schemaForRdfXml(COSMIC_COFFEE_EXCERPT, BASE);
    const rel = relationBetween(schema, "Customer", "Order") ?? schema.relations.find((r) => r.name === "places");
    expect(rel).toMatchObject({ cardinality: "one-to-many" });

    const customer = schema.entities.find((e) => e.id.endsWith("Customer"));
    const customerId = customer?.properties.find((p) => p.name === "customerId");
    expect(customerId).toMatchObject({ isIdentifier: true });
  });

  it("routes a relationshipAttributeOf-marked datatype property onto the relation's attributes, not unattachedProperties", async () => {
    const schema = await schemaForRdfXml(COSMIC_COFFEE_EXCERPT, BASE);
    const rel = schema.relations.find((r) => r.name === "places");
    expect(rel?.attributes).toEqual([{ name: "quantity", type: "integer" }]);
    expect(schema.unattachedProperties).toEqual([]);
  });
});

describe("buildSchemaModel — harbor-market.ttl (bundled original extension sample)", () => {
  it("resolves the icon/color overrides on its classes", async () => {
    const schema = await schemaForSample("harbor-market.ttl");
    const vendor = schema.entities.find((e) => e.id.endsWith("Vendor"));
    expect(vendor).toMatchObject({ icon: "⛺", colorOverride: "#2563EB" });
    const stall = schema.entities.find((e) => e.id.endsWith("Stall"));
    expect(stall).toMatchObject({ icon: "🏪", colorOverride: "#C2410C" });
    const product = schema.entities.find((e) => e.id.endsWith("Product"));
    expect(product).toMatchObject({ icon: "📦", colorOverride: "#15803D" });
  });

  it("resolves `operates` via endpoint hints and reads isIdentifier as a boolean", async () => {
    const schema = await schemaForSample("harbor-market.ttl");
    const operates = relationBetween(schema, "Vendor", "Stall");
    expect(operates).toMatchObject({ name: "operates", cardinality: "one-to-many" });

    const vendor = schema.entities.find((e) => e.id.endsWith("Vendor"));
    const vendorCode = vendor?.properties.find((p) => p.name === "vendor code");
    expect(vendorCode).toMatchObject({ isIdentifier: true });
  });

  it("routes stockCount onto the offers relation", async () => {
    const schema = await schemaForSample("harbor-market.ttl");
    const offers = relationBetween(schema, "Stall", "Product");
    expect(offers).toMatchObject({ name: "offers" });
    expect(offers?.attributes).toEqual([{ name: "stock count", type: "integer" }]);
    expect(schema.unattachedProperties).toEqual([]);
  });
});

describe("buildSchemaModel — ontology-header annotation predicates never become spurious unattached relations", () => {
  it("ignores owl:imports between two named resources", async () => {
    const schema = await schemaFor(`
      @prefix : <http://ex.org/onto#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      <http://ex.org/onto> a owl:Ontology ;
        owl:imports <http://other.example/imported-onto> .
      :Widget a owl:Class .
    `);
    expect(schema.unattachedProperties).toEqual([]);
    expect(schema.relations).toHaveLength(0);
  });
});
