/**
 * Domain model for "Object Ontology" documents (`*.oont.yaml` / `*.oont.json`):
 * an object-centric ontology in the style popularized by operational
 * platforms such as Palantir Foundry — object types with typed properties,
 * link types between them, interfaces that object types implement, and
 * action types that describe the changes users (or AI agents) may make.
 *
 * Unlike the RDF side of the extension, identity here is closed-world and
 * key-based: an object type is identified by its API name, an object by its
 * primary-key value. IRIs are minted deterministically from those names (see
 * ./iris.ts) only so the shared diagram/query machinery has stable ids.
 */

export const OBJECT_ONTOLOGY_FORMAT_VERSION = 1;

export const PROPERTY_TYPES = [
  "string",
  "integer",
  "decimal",
  "double",
  "boolean",
  "date",
  "timestamp",
  "geopoint",
] as const;
export type OoPropertyType = (typeof PROPERTY_TYPES)[number];

export type OoParameterType = OoPropertyType | "objectRef";
export const PARAMETER_TYPES: readonly OoParameterType[] = [...PROPERTY_TYPES, "objectRef"];

export const RULE_OPS = ["createObject", "modifyObject", "deleteObject", "createLink", "deleteLink"] as const;
export type OoRuleOp = (typeof RULE_OPS)[number];

export type OoCardinality = "one" | "many";

/** Offsets into the source text, `end` exclusive. */
export interface SourceRange {
  start: number;
  end: number;
}

export interface OoProperty {
  apiName: string;
  type: OoPropertyType;
  isArray: boolean;
  displayName?: string;
  description?: string;
  unit?: string;
  enumValues?: string[];
  required: boolean;
}

export interface OoObjectType {
  apiName: string;
  displayName?: string;
  pluralDisplayName?: string;
  description?: string;
  primaryKey: string;
  titleProperty?: string;
  icon?: string;
  color?: string;
  implements: string[];
  properties: OoProperty[];
}

export interface OoInterface {
  apiName: string;
  displayName?: string;
  description?: string;
  extends: string[];
  properties: OoProperty[];
}

export interface OoLinkSide {
  objectType: string;
  /** How this side's object type refers to the *other* side, e.g. `Shipment.vehicle`. */
  name: string;
  displayName?: string;
  /** How many objects of the other side one object of this side links to. */
  cardinality: OoCardinality;
}

export interface OoLinkType {
  apiName: string;
  displayName?: string;
  description?: string;
  from: OoLinkSide;
  to: OoLinkSide;
  /** `Type.property` holding the other side's primary key, when the link is foreign-key backed. */
  foreignKey?: { objectType: string; property: string };
}

export interface OoParameter {
  id: string;
  type: OoParameterType;
  isArray: boolean;
  objectType?: string;
  required: boolean;
  displayName?: string;
  description?: string;
  enumValues?: string[];
}

export interface OoRule {
  op: OoRuleOp;
  objectType?: string;
  linkType?: string;
  /** Parameter id naming the object a modify/delete rule acts on. */
  object?: string;
  /** Parameter ids naming the two ends of a createLink/deleteLink rule. */
  from?: string;
  to?: string;
  /** Property API name -> value expression (`$param` or a literal), kept as text. */
  set: Record<string, string>;
}

export interface OoValidation {
  description: string;
  expr?: string;
}

export interface OoActionType {
  apiName: string;
  displayName?: string;
  description?: string;
  parameters: OoParameter[];
  rules: OoRule[];
  validations: OoValidation[];
  sideEffects: string[];
}

export interface OoObjectRecord {
  objectType: string;
  /** Raw field values keyed by property API name or link-side name. */
  values: ReadonlyMap<string, unknown>;
}

export interface ObjectOntology {
  version: number;
  name: string;
  description?: string;
  namespace: string;
  objectTypes: OoObjectType[];
  interfaces: OoInterface[];
  linkTypes: OoLinkType[];
  actionTypes: OoActionType[];
  objects: OoObjectRecord[];
}

export type OoSeverity = "error" | "warning";

export interface OoDiagnostic {
  message: string;
  severity: OoSeverity;
  range: SourceRange;
}

/** Object types and interfaces share one name space — both become schema entities. */
export function findSchemaType(ontology: ObjectOntology, apiName: string): OoObjectType | OoInterface | undefined {
  return ontology.objectTypes.find((t) => t.apiName === apiName) ?? ontology.interfaces.find((i) => i.apiName === apiName);
}

/** Every object type and interface an action's parameters and rules touch. */
export function actionAffectedTypes(ontology: ObjectOntology, action: OoActionType): string[] {
  const affected = new Set<string>();
  for (const parameter of action.parameters) {
    if (parameter.objectType) {
      affected.add(parameter.objectType);
    }
  }
  for (const rule of action.rules) {
    if (rule.objectType) {
      affected.add(rule.objectType);
    }
    const link = rule.linkType ? ontology.linkTypes.find((l) => l.apiName === rule.linkType) : undefined;
    if (link) {
      affected.add(link.from.objectType);
      affected.add(link.to.objectType);
    }
  }
  return [...affected].filter((name) => findSchemaType(ontology, name) !== undefined).sort();
}
