import type { SchemaModel } from "../src/rdf/schemaModel";

export type SchemaSearchResultKind = "entity" | "relation" | "property";

export interface SchemaSearchResult {
  id: string;
  kind: SchemaSearchResultKind;
  label: string;
  meta: string;
  /** Entity to select when the result represents one of its properties. */
  ownerId?: string;
}

interface RankedSearchResult extends SchemaSearchResult {
  score: number;
}

export interface SearchResultLabels {
  propertiesLabel: string;
  /** Localized template containing a single `{0}` count placeholder. */
  instancesLabel: string;
}

const KIND_ORDER: Record<SchemaSearchResultKind, number> = {
  entity: 0,
  relation: 1,
  property: 2,
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function labelScore(label: string, query: string): number | undefined {
  const normalizedLabel = normalize(label);
  if (normalizedLabel === query) {
    return 0;
  }
  if (normalizedLabel.startsWith(query)) {
    return 1;
  }
  if (normalizedLabel.split(/[\s._:/-]+/).some((part) => part.startsWith(query))) {
    return 2;
  }
  if (normalizedLabel.includes(query)) {
    return 3;
  }
  return undefined;
}

function contextualScore(context: string, query: string): number | undefined {
  return normalize(context).includes(query) ? 10 : undefined;
}

export function searchSchema(
  schema: SchemaModel,
  rawQuery: string,
  limit = 8,
  labels: SearchResultLabels = { propertiesLabel: "properties", instancesLabel: "{0} instances" },
): SchemaSearchResult[] {
  const query = normalize(rawQuery.trim());
  if (!query || limit <= 0) {
    return [];
  }

  const entityNames = new Map(schema.entities.map((entity) => [entity.id, entity.name]));
  const ranked: RankedSearchResult[] = [];

  for (const entity of schema.entities) {
    const score = labelScore(entity.name, query);
    if (score !== undefined) {
      ranked.push({
        id: entity.id,
        kind: "entity",
        label: entity.name,
        meta: `${entity.properties.length} ${labels.propertiesLabel} · ${labels.instancesLabel.replace("{0}", String(entity.instanceCount))}`,
        score,
      });
    }

    for (const property of entity.properties) {
      const propertyScore = labelScore(property.name, query);
      if (propertyScore !== undefined) {
        ranked.push({
          id: property.iri,
          ownerId: entity.id,
          kind: "property",
          label: property.name,
          meta: `${entity.name} · ${property.type}`,
          score: propertyScore,
        });
      }
    }
  }

  for (const relation of schema.relations) {
    const sourceName = entityNames.get(relation.source) ?? relation.source;
    const targetName = entityNames.get(relation.target) ?? relation.target;
    const score =
      labelScore(relation.name, query) ??
      contextualScore(`${sourceName} ${targetName} ${relation.description ?? ""}`, query);
    if (score !== undefined) {
      ranked.push({
        id: relation.id,
        kind: "relation",
        label: relation.name,
        meta: `${sourceName} → ${targetName}`,
        score,
      });
    }
  }

  return ranked
    .sort(
      (left, right) =>
        left.score - right.score ||
        KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result);
}
