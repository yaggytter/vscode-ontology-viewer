import { readFileSync } from "node:fs";
import { parse } from "yaml";

/**
 * A deliberately small reader for `*.oont.yaml` files: just enough of the
 * format for a server to resolve links, check parameters and apply an
 * action's rules. The Ontology Viewer extension has the full parser and
 * reports problems in VS Code; this example assumes the file is valid.
 */

export type Cardinality = "one" | "many";
export type RuleOp = "createObject" | "modifyObject" | "deleteObject" | "createLink" | "deleteLink";

export interface ObjectType {
  apiName: string;
  primaryKey: string;
  titleProperty?: string;
  /** Property API name -> property type (`string`, `double`, `boolean`, ...). */
  properties: Record<string, string>;
}

export interface LinkSide {
  objectType: string;
  name: string;
  cardinality: Cardinality;
}

export interface LinkType {
  apiName: string;
  from: LinkSide;
  to: LinkSide;
  /** The property on the `from` object type that holds the other side's key. */
  foreignKey?: string;
}

export interface Parameter {
  id: string;
  type: string;
  objectType?: string;
  required: boolean;
  enumValues?: string[];
}

export interface Rule {
  op: RuleOp;
  objectType?: string;
  linkType?: string;
  object?: string;
  from?: string;
  to?: string;
  /** Property -> `$parameter` or a literal value. */
  set: Record<string, unknown>;
}

export interface Validation {
  description: string;
  expr?: string;
}

export interface ActionType {
  apiName: string;
  parameters: Parameter[];
  rules: Rule[];
  validations: Validation[];
  sideEffects: string[];
}

export type ObjectRecord = Record<string, unknown>;

export interface Ontology {
  name: string;
  objectTypes: Map<string, ObjectType>;
  linkTypes: LinkType[];
  actionTypes: Map<string, ActionType>;
  /** Example objects from the `objects:` section, by object type. */
  objects: Record<string, ObjectRecord[]>;
}

type Raw = Record<string, unknown>;

function asMap(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `name: string` is shorthand for `name: { type: string }`. */
function typeOf(value: unknown): string {
  return typeof value === "string" ? value : String(asMap(value).type ?? "string");
}

function readLinkSide(value: unknown): LinkSide {
  const side = asMap(value);
  return {
    objectType: String(side.objectType),
    name: String(side.name),
    cardinality: side.cardinality === "many" ? "many" : "one",
  };
}

function readParameter(id: string, value: unknown): Parameter {
  const raw = typeof value === "string" ? { type: value } : asMap(value);
  return {
    id,
    type: String(raw.type ?? "string"),
    objectType: raw.objectType === undefined ? undefined : String(raw.objectType),
    required: raw.required === true,
    enumValues: Array.isArray(raw.enum) ? raw.enum.map(String) : undefined,
  };
}

function readAction(apiName: string, value: unknown): ActionType {
  const raw = asMap(value);
  return {
    apiName,
    parameters: Object.entries(asMap(raw.parameters)).map(([id, p]) => readParameter(id, p)),
    rules: asList(raw.rules).map((r) => {
      const rule = asMap(r);
      return {
        op: rule.op as RuleOp,
        objectType: rule.objectType as string | undefined,
        linkType: rule.linkType as string | undefined,
        object: rule.object as string | undefined,
        from: rule.from as string | undefined,
        to: rule.to as string | undefined,
        set: asMap(rule.set),
      };
    }),
    validations: asList(raw.validations).map((v) => {
      const validation = asMap(v);
      return {
        description: String(validation.description ?? ""),
        expr: validation.expr === undefined ? undefined : String(validation.expr),
      };
    }),
    sideEffects: asList(raw.sideEffects).map(String),
  };
}

export function loadOntology(path: string): Ontology {
  const root = asMap(parse(readFileSync(path, "utf8")));
  const objectTypes = new Map<string, ObjectType>();
  for (const [apiName, value] of Object.entries(asMap(root.objectTypes))) {
    const raw = asMap(value);
    const properties: Record<string, string> = {};
    for (const [name, property] of Object.entries(asMap(raw.properties))) {
      properties[name] = typeOf(property);
    }
    objectTypes.set(apiName, {
      apiName,
      primaryKey: String(raw.primaryKey),
      titleProperty: raw.titleProperty === undefined ? undefined : String(raw.titleProperty),
      properties,
    });
  }
  const linkTypes = Object.entries(asMap(root.linkTypes)).map(([apiName, value]): LinkType => {
    const raw = asMap(value);
    const foreignKey = typeof raw.foreignKey === "string" ? raw.foreignKey.split(".")[1] : undefined;
    return { apiName, from: readLinkSide(raw.from), to: readLinkSide(raw.to), foreignKey };
  });
  const actionTypes = new Map<string, ActionType>();
  for (const [apiName, value] of Object.entries(asMap(root.actionTypes))) {
    actionTypes.set(apiName, readAction(apiName, value));
  }
  const objects: Record<string, ObjectRecord[]> = {};
  for (const [type, records] of Object.entries(asMap(root.objects))) {
    objects[type] = asList(records).map((r) => ({ ...asMap(r) }));
  }
  return { name: String(root.name ?? "Untitled"), objectTypes, linkTypes, actionTypes, objects };
}
