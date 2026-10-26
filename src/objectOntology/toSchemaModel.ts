import type { Cardinality, PropertyType, SchemaEntity, SchemaModel, SchemaProperty, SchemaRelation } from "../rdf/schemaModel";
import { assignRelationalAppearance, DEFAULT_CLASS_ICON, iconFor, looksLikeColor, looksLikeIcon } from "../rdf/appearance";
import { XSD } from "../rdf/vocabulary";
import type { ObjectOntology, OoLinkType, OoProperty, OoPropertyType } from "./model";
import { linkTypeIri, memberIri, typeIri } from "./iris";

const DEFAULT_INTERFACE_ICON = "◇";

/** Schema-view property types (the inspector's type picker) per Object Ontology type. */
const SCHEMA_TYPE: Record<OoPropertyType, PropertyType> = {
  string: "string",
  integer: "integer",
  decimal: "decimal",
  double: "double",
  boolean: "boolean",
  date: "date",
  timestamp: "datetime",
  geopoint: "other",
};

export const XSD_DATATYPE: Record<OoPropertyType, string> = {
  string: `${XSD}string`,
  integer: `${XSD}integer`,
  decimal: `${XSD}decimal`,
  double: `${XSD}double`,
  boolean: `${XSD}boolean`,
  date: `${XSD}date`,
  timestamp: `${XSD}dateTime`,
  geopoint: `${XSD}string`,
};

/** `many-to-one` reads as "many sources per target, one target per source". */
export function linkCardinality(link: OoLinkType): Cardinality {
  return `${link.to.cardinality}-to-${link.from.cardinality}` as Cardinality;
}

function toSchemaProperty(ns: string, owner: string, property: OoProperty, primaryKey?: string): SchemaProperty {
  return {
    iri: memberIri(ns, owner, property.apiName),
    name: property.displayName ?? property.apiName,
    type: property.enumValues && property.enumValues.length > 0 ? "enum" : property.isArray ? "other" : SCHEMA_TYPE[property.type],
    datatypeIri: XSD_DATATYPE[property.type],
    isIdentifier: property.apiName === primaryKey ? true : undefined,
    unit: property.unit,
    enumValues: property.enumValues,
    description: property.description,
    provenance: "declared",
  };
}

/**
 * Projects an Object Ontology onto the schema model the diagram already
 * renders: object types and interfaces become entities, link types become
 * relations carrying their cardinality, and `implements`/`extends` become
 * hierarchy-style edges. Everything here is "declared" — there is no
 * inference ladder on this side; the document says exactly what exists.
 */
export function objectOntologyToSchemaModel(ontology: ObjectOntology): SchemaModel {
  const ns = ontology.namespace;
  const instanceCounts = new Map<string, number>();
  for (const record of ontology.objects) {
    instanceCounts.set(record.objectType, (instanceCounts.get(record.objectType) ?? 0) + 1);
  }

  const entities: SchemaEntity[] = [
    ...ontology.objectTypes.map((type): SchemaEntity => {
      const name = type.displayName ?? type.apiName;
      return {
        id: typeIri(ns, type.apiName),
        name,
        description: type.description,
        origin: "objectType",
        properties: type.properties.map((p) => toSchemaProperty(ns, type.apiName, p, type.primaryKey)),
        instanceCount: instanceCounts.get(type.apiName) ?? 0,
        icon: type.icon && looksLikeIcon(type.icon) ? type.icon : iconFor([name, type.apiName], DEFAULT_CLASS_ICON),
        colorIndex: 0,
        connectionGroup: { index: 1, count: 1, size: 1 },
        colorOverride: type.color && looksLikeColor(type.color) ? type.color.trim() : undefined,
      };
    }),
    ...ontology.interfaces.map((iface): SchemaEntity => ({
      id: typeIri(ns, iface.apiName),
      name: iface.displayName ?? iface.apiName,
      description: iface.description,
      origin: "interface",
      properties: iface.properties.map((p) => toSchemaProperty(ns, iface.apiName, p)),
      instanceCount: 0,
      icon: DEFAULT_INTERFACE_ICON,
      colorIndex: 0,
      connectionGroup: { index: 1, count: 1, size: 1 },
    })),
  ];
  const known = new Set(entities.map((e) => e.id));

  const relations: SchemaRelation[] = [];
  for (const link of ontology.linkTypes) {
    const source = typeIri(ns, link.from.objectType);
    const target = typeIri(ns, link.to.objectType);
    if (!known.has(source) || !known.has(target)) {
      continue;
    }
    const iri = linkTypeIri(ns, link.apiName);
    relations.push({
      id: iri,
      iri,
      name: link.displayName ?? link.from.displayName ?? link.from.name,
      source,
      target,
      kind: "linkType",
      cardinality: linkCardinality(link),
      description: link.description,
      provenance: "declared",
    });
  }
  const hierarchy = (kind: "implements" | "extends", child: string, parents: readonly string[]): void => {
    for (const parent of parents) {
      const source = typeIri(ns, child);
      const target = typeIri(ns, parent);
      if (known.has(target)) {
        relations.push({
          id: `${kind}|${source}|${target}`,
          name: "",
          source,
          target,
          kind,
          cardinality: "unspecified",
          provenance: "declared",
        });
      }
    }
  };
  ontology.objectTypes.forEach((t) => hierarchy("implements", t.apiName, t.implements));
  ontology.interfaces.forEach((i) => hierarchy("extends", i.apiName, i.extends));

  const appearance = assignRelationalAppearance(
    entities.map((e) => e.id),
    relations,
  );
  const colored = entities.map((entity) => {
    const look = appearance.get(entity.id);
    return look
      ? {
          ...entity,
          colorIndex: look.colorIndex,
          connectionGroup: { index: look.groupIndex, count: look.groupCount, size: look.groupSize },
        }
      : entity;
  });

  return {
    title: ontology.name,
    description: ontology.description,
    entities: colored,
    relations,
    unattachedProperties: [],
    isEmpty: colored.length === 0,
  };
}
