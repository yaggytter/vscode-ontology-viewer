import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseOntology } from "../../src/rdf/parse";
import { buildGraphModel, LITERAL_NODE_PREFIX, type OntologyGraph } from "../../src/rdf/graphModel";
import { OONT } from "../../src/objectOntology/iris";
import { parseObjectOntology } from "../../src/objectOntology/parse";
import { objectOntologyToQuads } from "../../src/objectOntology/toQuads";
import { compactTriples } from "./compactTriples";

const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

function graph(
  nodes: Array<Partial<OntologyGraph["nodes"][number]> & { id: string }>,
  edges: Array<Partial<OntologyGraph["edges"][number]> & { source: string; target: string }>,
): OntologyGraph {
  return {
    nodes: nodes.map((n) => ({
      kind: "resource" as const,
      label: n.id.replace(/^.*[#/]/, ""),
      isBlankNode: false,
      ...n,
    })),
    edges: edges.map((e, i) => ({
      id: e.id ?? `e${i}`,
      predicate: e.predicate ?? `${RDFS}range`,
      predicateLabel: e.predicateLabel ?? "range",
      ...e,
    })),
  };
}

describe("compactTriples", () => {
  it("folds a datatype range into the property node and drops the sink", () => {
    const result = compactTriples(
      graph(
        [
          { id: "http://ex/createdAt", kind: "property", label: "createdAt" },
          { id: `${XSD}dateTime`, label: "dateTime" },
        ],
        [{ source: "http://ex/createdAt", target: `${XSD}dateTime`, predicateLabel: "range" }],
      ),
    );

    expect(result.nodes.map((n) => n.id)).toEqual(["http://ex/createdAt"]);
    expect(result.edges).toEqual([]);
    expect(result.foldedFacts.get("http://ex/createdAt")).toEqual(["range: dateTime"]);
    expect(result.removedNodeCount).toBe(1);
    expect(result.removedEdgeCount).toBe(1);
  });

  it("folds every incoming fact onto the same node, in edge order", () => {
    const result = compactTriples(
      graph(
        [
          { id: "http://ex/p", kind: "property", label: "p" },
          { id: `${RDFS}Resource`, label: "Resource" },
          { id: `${XSD}string`, label: "string" },
        ],
        [
          { source: "http://ex/p", target: `${RDFS}Resource`, predicateLabel: "domain" },
          { source: "http://ex/p", target: `${XSD}string`, predicateLabel: "range" },
        ],
      ),
    );
    expect(result.foldedFacts.get("http://ex/p")).toEqual(["domain: Resource", "range: string"]);
    expect(result.nodes).toHaveLength(1);
  });

  it("deduplicates identical folded facts", () => {
    const result = compactTriples(
      graph(
        [
          { id: "http://ex/p", kind: "property" },
          { id: `${XSD}string`, label: "string" },
        ],
        [
          { source: "http://ex/p", target: `${XSD}string`, predicateLabel: "range" },
          { source: "http://ex/p", target: `${XSD}string`, predicateLabel: "range" },
        ],
      ),
    );
    expect(result.foldedFacts.get("http://ex/p")).toEqual(["range: string"]);
  });

  it("trims the vocabulary prefix off the folded predicate label", () => {
    // buildGraphModel labels rdfs:range as "rdfs:range"; folded onto the node
    // the prefix is noise, so the fact should read "range: string".
    const result = compactTriples(
      graph(
        [
          { id: "http://ex/name", kind: "property", label: "name" },
          { id: `${XSD}string`, label: "string" },
        ],
        [{ source: "http://ex/name", target: `${XSD}string`, predicateLabel: "rdfs:range" }],
      ),
    );
    expect(result.foldedFacts.get("http://ex/name")).toEqual(["range: string"]);
  });

  it("keeps a vocabulary node that has outgoing edges of its own", () => {
    // The document says something *about* rdfs:Resource, so it carries
    // structure and folding it away would lose a stated fact.
    const result = compactTriples(
      graph(
        [
          { id: "http://ex/p", kind: "property" },
          { id: `${RDFS}Resource`, label: "Resource" },
          { id: "http://ex/Thing", label: "Thing" },
        ],
        [
          { source: "http://ex/p", target: `${RDFS}Resource`, predicateLabel: "range" },
          { source: `${RDFS}Resource`, target: "http://ex/Thing", predicateLabel: "subClassOf" },
        ],
      ),
    );
    expect(result.nodes.map((n) => n.id)).toContain(`${RDFS}Resource`);
    expect(result.removedNodeCount).toBe(0);
    expect(result.foldedFacts.size).toBe(0);
  });

  it("never folds a node from the document's own namespace", () => {
    const result = compactTriples(
      graph(
        [
          { id: "http://ex/p", kind: "property" },
          { id: "http://ex/Tenant", label: "Tenant" },
        ],
        [{ source: "http://ex/p", target: "http://ex/Tenant", predicateLabel: "domain" }],
      ),
    );
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.removedNodeCount).toBe(0);
  });

  it("leaves a graph with no vocabulary sinks untouched", () => {
    const input = graph(
      [{ id: "http://ex/a" }, { id: "http://ex/b" }],
      [{ source: "http://ex/a", target: "http://ex/b", predicateLabel: "knows" }],
    );
    const result = compactTriples(input);
    expect(result.nodes).toEqual(input.nodes);
    expect(result.edges).toEqual(input.edges);
    expect(result.removedNodeCount).toBe(0);
    expect(result.removedEdgeCount).toBe(0);
  });

  it("does not mutate the input graph", () => {
    const input = graph(
      [{ id: "http://ex/p", kind: "property" }, { id: `${XSD}string`, label: "string" }],
      [{ source: "http://ex/p", target: `${XSD}string`, predicateLabel: "range" }],
    );
    const nodeCount = input.nodes.length;
    const edgeCount = input.edges.length;
    compactTriples(input);
    expect(input.nodes).toHaveLength(nodeCount);
    expect(input.edges).toHaveLength(edgeCount);
  });

  it("folds Object Ontology vocabulary literals but keeps the document's own values", () => {
    const apiName = `${LITERAL_NODE_PREFIX}http://ex/Vehicle.status:${OONT}apiName:status`;
    const value = `${LITERAL_NODE_PREFIX}http://ex/Vehicle/V-1:http://ex/Vehicle.status:idle`;
    const result = compactTriples(
      graph(
        [
          { id: "http://ex/Vehicle.status", kind: "property", label: "status" },
          { id: apiName, label: "status", isBlankNode: true },
          { id: "http://ex/Vehicle/V-1", label: "V-1" },
          { id: value, label: "idle", isBlankNode: true },
        ],
        [
          { source: "http://ex/Vehicle.status", target: apiName, predicate: `${OONT}apiName`, predicateLabel: "apiName" },
          { source: "http://ex/Vehicle/V-1", target: value, predicate: "http://ex/Vehicle.status", predicateLabel: "status" },
        ],
      ),
    );
    expect(result.nodes.map((n) => n.id)).toEqual(["http://ex/Vehicle.status", "http://ex/Vehicle/V-1", value]);
    expect(result.foldedFacts.get("http://ex/Vehicle.status")).toEqual(["apiName: status"]);
    expect(result.edges.map((e) => e.target)).toEqual([value]);
  });

  it("keeps literal values of standard vocabulary such as dcterms:title", () => {
    const title = `${LITERAL_NODE_PREFIX}http://ex/doc:http://purl.org/dc/terms/title:Guide`;
    const result = compactTriples(
      graph(
        [{ id: "http://ex/doc" }, { id: title, label: "Guide", isBlankNode: true }],
        [{ source: "http://ex/doc", target: title, predicate: "http://purl.org/dc/terms/title", predicateLabel: "dcterms:title" }],
      ),
    );
    expect(result.nodes).toHaveLength(2);
    expect(result.removedNodeCount).toBe(0);
  });

  it("never folds a literal node of a bundled RDF sample", async () => {
    const files = readdirSync("samples").filter((name) => /\.(ttl|rdf)$/.test(name));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const { quads } = await parseOntology(
        readFileSync(`samples/${name}`, "utf8"),
        name.endsWith(".rdf") ? "rdfxml" : "turtle",
        `file:///${name}`,
      );
      const full = buildGraphModel(quads);
      const kept = new Set(compactTriples(full).nodes.map((n) => n.id));
      const literals = full.nodes.filter((n) => n.id.startsWith(LITERAL_NODE_PREFIX));
      expect(literals.filter((n) => !kept.has(n.id)), name).toEqual([]);
    }
  });

  it("halves an Object Ontology sample and leaves only example-object values as literals", () => {
    const parsed = parseObjectOntology(readFileSync("samples/delivery-ops.oont.yaml", "utf8"));
    const full = buildGraphModel(objectOntologyToQuads(parsed.ontology!));
    const compact = compactTriples(full);

    expect(compact.nodes.length).toBeLessThan(full.nodes.length / 2);
    const ids = new Set(compact.nodes.map((n) => n.id));
    for (const edge of compact.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
      if (edge.target.startsWith(LITERAL_NODE_PREFIX)) {
        expect(edge.predicate.startsWith(OONT)).toBe(false);
      }
    }
    expect(compact.foldedFacts.get("urn:object-ontology:harbor-city-delivery-ops#Trackable.lat")).toContain(
      "dataType: double",
    );
  });

  /**
   * The pathology that motivated the feature, reproduced deterministically: a
   * schema-heavy ontology where every datatype property's range converges on
   * `xsd:string`. That one node reaches degree N, which no force-directed
   * layout can arrange readably — and it carries no information as a node.
   */
  it("collapses a high-degree datatype hub without disconnecting the rest", async () => {
    const properties = Array.from({ length: 40 }, (_, i) => `ex:prop${i}`);
    const ttl = `
      @prefix ex: <http://ex.org/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      ex:Thing a owl:Class .
      ${properties
        .map((p) => `${p} a owl:DatatypeProperty ; rdfs:domain ex:Thing ; rdfs:range xsd:string .`)
        .join("\n      ")}
    `;
    const { quads } = await parseOntology(ttl, "turtle", "http://ex.org/");
    const full = buildGraphModel(quads);
    const compact = compactTriples(full);

    // Before: xsd:string absorbs one edge per property.
    const hubDegree = full.edges.filter((e) => e.target === `${XSD}string`).length;
    expect(hubDegree).toBe(properties.length);

    // After: the hub is gone along with all of its edges...
    expect(compact.nodes.map((n) => n.id)).not.toContain(`${XSD}string`);
    expect(compact.edges.filter((e) => e.target === `${XSD}string`)).toEqual([]);
    // ...and every property now states its range on itself instead.
    expect(compact.foldedFacts.size).toBe(properties.length);
    expect(compact.foldedFacts.get("http://ex.org/prop0")).toEqual(["range: string"]);
    // The domain edges are untouched, so nothing became isolated.
    expect(compact.edges).toHaveLength(properties.length);
  });

  /** Guards against the compaction misbehaving on a real bundled ontology. */
  it("reduces a bundled sample's edges while keeping every node reachable", async () => {
    const { quads } = await parseOntology(
      readFileSync("samples/city-mobility.ttl", "utf8"),
      "turtle",
      "file:///city-mobility.ttl",
    );
    const full = buildGraphModel(quads);
    const compact = compactTriples(full);

    expect(compact.edges.length).toBeLessThan(full.edges.length);
    expect(compact.foldedFacts.size).toBeGreaterThan(0);

    // No node that still has edges may reference a removed node.
    const ids = new Set(compact.nodes.map((n) => n.id));
    for (const edge of compact.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }

    // Compaction must not create *more* isolated nodes than it removed nodes:
    // folding a sink can orphan a property whose only statement was its range,
    // and that is the acceptable bound.
    const degree = new Map<string, number>();
    for (const edge of compact.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const isolatedBefore = full.nodes.filter(
      (n) => !full.edges.some((e) => e.source === n.id || e.target === n.id),
    ).length;
    const isolatedAfter = compact.nodes.filter((n) => (degree.get(n.id) ?? 0) === 0).length;
    expect(isolatedAfter - isolatedBefore).toBeLessThanOrEqual(compact.removedNodeCount);
  });
});
