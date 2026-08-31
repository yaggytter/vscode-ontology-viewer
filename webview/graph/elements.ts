import type cytoscape from "cytoscape";
import type { Cardinality, SchemaModel, SchemaRelation } from "../../src/rdf/schemaModel";

function cardinalityBadge(cardinality: Cardinality): string {
  switch (cardinality) {
    case "one-to-one":
      return "1:1";
    case "one-to-many":
      return "1:N";
    case "many-to-one":
      return "N:1";
    case "many-to-many":
      return "N:N";
    default:
      // "unspecified" is deliberately not badged — the model doesn't assert
      // it, so showing a badge here would claim more than the ontology does.
      return "";
  }
}

function edgeLabel(relation: SchemaRelation): string {
  if (relation.kind === "subClassOf") {
    return "";
  }
  const badge = cardinalityBadge(relation.cardinality);
  return badge ? `${relation.name} (${badge})` : relation.name;
}

/**
 * Converts a `SchemaModel` into cytoscape elements. Relation ids are
 * deduplicated through a `Map` — `n3` emits one quad per occurrence of a
 * statement, so a repeated `rdfs:subClassOf` (or any relation) in the source
 * text would otherwise produce duplicate-id edges, which cytoscape's `add()`
 * rejects.
 */
export function schemaToElements(schema: SchemaModel, editableIds: Set<string>): cytoscape.ElementDefinition[] {
  const nodes = new Map<string, cytoscape.ElementDefinition>();
  for (const entity of schema.entities) {
    nodes.set(entity.id, {
      data: {
        id: entity.id,
        label: entity.name,
        displayLabel: `${entity.icon}  ${entity.name}`,
        icon: entity.icon,
        colorIndex: entity.colorIndex,
        colorOverride: entity.colorOverride ?? null,
        connectionGroupIndex: entity.connectionGroup.index,
        connectionGroupCount: entity.connectionGroup.count,
        connectionGroupSize: entity.connectionGroup.size,
        instanceCount: entity.instanceCount,
        comment: entity.description ?? "",
        origin: entity.origin,
      },
      classes: editableIds.has(entity.id) ? "editable" : "",
    });
  }

  // Self-loops (e.g. tool-lending.ttl's Member->Member relations) need a distinct
  // loop-direction per edge sharing the same (source, target) pair, or they
  // draw stacked exactly on top of one another.
  const selfLoopIndex = new Map<string, number>();

  const edges = new Map<string, cytoscape.ElementDefinition>();
  for (const relation of schema.relations) {
    if (edges.has(relation.id)) {
      continue;
    }
    let loopIndex = 0;
    if (relation.source === relation.target) {
      loopIndex = selfLoopIndex.get(relation.source) ?? 0;
      selfLoopIndex.set(relation.source, loopIndex + 1);
    }
    edges.set(relation.id, {
      data: {
        id: relation.id,
        source: relation.source,
        target: relation.target,
        edgeLabel: edgeLabel(relation),
        kind: relation.kind,
        provenance: relation.provenance,
        loopIndex,
        // Lets a SPARQL result that returned the predicate itself highlight
        // this relation — see webview/graph/sparqlHighlight.ts.
        relationIri: relation.iri ?? null,
      },
    });
  }

  return [...nodes.values(), ...edges.values()];
}
