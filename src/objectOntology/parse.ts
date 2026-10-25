import { isAlias, isMap, isScalar, isSeq, parseDocument, type Document, type Node, type YAMLMap } from "yaml";
import {
  OBJECT_ONTOLOGY_FORMAT_VERSION,
  PARAMETER_TYPES,
  PROPERTY_TYPES,
  RULE_OPS,
  type ObjectOntology,
  type OoActionType,
  type OoCardinality,
  type OoDiagnostic,
  type OoInterface,
  type OoLinkSide,
  type OoLinkType,
  type OoObjectRecord,
  type OoObjectType,
  type OoParameter,
  type OoParameterType,
  type OoProperty,
  type OoPropertyType,
  type OoRule,
  type OoRuleOp,
  type OoSeverity,
  type SourceRange,
} from "./model";
import { defaultNamespace, isValidApiName } from "./iris";
import { validateOntology } from "./validate";

export interface ParsedObjectOntology {
  /** Undefined only when the text is not even a YAML/JSON mapping. */
  ontology?: ObjectOntology;
  diagnostics: OoDiagnostic[];
  /** The YAML document — kept for source locations and surgical edits. */
  document: Document.Parsed;
}

/**
 * Hard cap on the number of example object records read from `objects:`.
 * The diagram and the in-memory SPARQL store are sized for hand-written
 * sample data, not data dumps; a runaway file degrades gracefully instead of
 * stalling the extension host.
 */
export const MAX_OBJECT_RECORDS = 5000;

type Entry = { key: string; keyNode: Node; value: Node | null };

class Reader {
  readonly diagnostics: OoDiagnostic[] = [];

  constructor(private readonly doc: Document.Parsed) {}

  report(node: Node | null | undefined, message: string, severity: OoSeverity = "error"): void {
    this.diagnostics.push({ message, severity, range: rangeOf(node) });
  }

  resolve(node: unknown): Node | null {
    if (isAlias(node)) {
      return (node.resolve(this.doc) as Node | undefined) ?? null;
    }
    return (node as Node | null) ?? null;
  }

  /** Entries of a mapping node. A null node (an empty `key:`) reads as an empty map. */
  entries(node: Node | null, what: string): Entry[] {
    if (node === null || (isScalar(node) && node.value === null)) {
      return [];
    }
    if (!isMap(node)) {
      this.report(node, `${what} must be a mapping.`);
      return [];
    }
    const out: Entry[] = [];
    for (const pair of (node as YAMLMap<unknown, unknown>).items) {
      const keyNode = this.resolve(pair.key);
      if (!isScalar(keyNode) || typeof keyNode.value !== "string" && typeof keyNode.value !== "number") {
        this.report(keyNode, `Keys in ${what} must be plain names.`);
        continue;
      }
      out.push({ key: String(keyNode.value), keyNode, value: this.resolve(pair.value) });
    }
    return out;
  }

  fields(node: Node | null, what: string, allowed: readonly string[]): Map<string, Entry> {
    const map = new Map<string, Entry>();
    for (const entry of this.entries(node, what)) {
      if (!allowed.includes(entry.key)) {
        this.report(entry.keyNode, `Unknown field "${entry.key}" in ${what}. Expected one of: ${allowed.join(", ")}.`, "warning");
      }
      map.set(entry.key, entry);
    }
    return map;
  }

  string(entry: Entry | undefined, what: string): string | undefined {
    if (!entry || entry.value === null) {
      return undefined;
    }
    if (isScalar(entry.value) && entry.value.value !== null && typeof entry.value.value !== "object") {
      return String(entry.value.value);
    }
    this.report(entry.value, `${what} must be a single value.`);
    return undefined;
  }

  boolean(entry: Entry | undefined, what: string): boolean | undefined {
    if (!entry || entry.value === null) {
      return undefined;
    }
    if (isScalar(entry.value) && typeof entry.value.value === "boolean") {
      return entry.value.value;
    }
    this.report(entry.value, `${what} must be true or false.`);
    return undefined;
  }

  stringList(entry: Entry | undefined, what: string): string[] {
    if (!entry || entry.value === null) {
      return [];
    }
    if (isScalar(entry.value) && entry.value.value !== null && typeof entry.value.value !== "object") {
      return [String(entry.value.value)];
    }
    if (!isSeq(entry.value)) {
      this.report(entry.value, `${what} must be a list.`);
      return [];
    }
    const out: string[] = [];
    for (const item of entry.value.items) {
      const node = this.resolve(item);
      if (isScalar(node) && node.value !== null && typeof node.value !== "object") {
        out.push(String(node.value));
      } else {
        this.report(node, `Items of ${what} must be single values.`);
      }
    }
    return out;
  }

  sequence(entry: Entry | undefined, what: string): Node[] {
    if (!entry || entry.value === null) {
      return [];
    }
    if (!isSeq(entry.value)) {
      this.report(entry.value, `${what} must be a list.`);
      return [];
    }
    return entry.value.items.map((item) => this.resolve(item)).filter((n): n is Node => n !== null);
  }

  apiName(entry: Entry, what: string): boolean {
    if (isValidApiName(entry.key)) {
      return true;
    }
    this.report(
      entry.keyNode,
      `${what} "${entry.key}" is not a valid API name (letters, digits and _ only, starting with a letter).`,
    );
    return false;
  }

  /** Plain JS value of an object-record field: a scalar or a list of scalars. */
  plainValue(node: Node | null): unknown {
    if (node === null) {
      return null;
    }
    if (isScalar(node)) {
      return node.value;
    }
    if (isSeq(node)) {
      return node.items.map((item) => {
        const resolved = this.resolve(item);
        return isScalar(resolved) ? resolved.value : undefined;
      });
    }
    this.report(node, "Object field values must be single values or lists of values.", "warning");
    return undefined;
  }
}

export function rangeOf(node: Node | null | undefined): SourceRange {
  const range = node?.range;
  if (!range) {
    return { start: 0, end: 0 };
  }
  return { start: range[0], end: Math.max(range[0], range[1]) };
}

/** Splits `string[]` into its element type; anything unknown is reported by the caller. */
function parseTypeName(raw: string): { base: string; isArray: boolean } {
  const match = /^\s*([A-Za-z]+)\s*(\[\s*\])?\s*$/.exec(raw);
  if (!match) {
    return { base: raw, isArray: false };
  }
  return { base: match[1], isArray: match[2] !== undefined };
}

const PROPERTY_FIELDS = ["type", "displayName", "description", "unit", "enum", "required"];

function readProperties(reader: Reader, node: Node | null, owner: string): OoProperty[] {
  const out: OoProperty[] = [];
  for (const entry of reader.entries(node, `properties of ${owner}`)) {
    if (!reader.apiName(entry, "Property")) {
      continue;
    }
    // Shorthand `name: string` is accepted alongside `name: { type: string }`.
    const shorthand = isScalar(entry.value) ? reader.string(entry, `Type of ${owner}.${entry.key}`) : undefined;
    const fields = shorthand === undefined ? reader.fields(entry.value, `property ${owner}.${entry.key}`, PROPERTY_FIELDS) : new Map<string, Entry>();
    const rawType = shorthand ?? reader.string(fields.get("type"), `type of ${owner}.${entry.key}`);
    if (rawType === undefined) {
      reader.report(entry.keyNode, `Property ${owner}.${entry.key} needs a type (${PROPERTY_TYPES.join(", ")}).`);
      continue;
    }
    const { base, isArray } = parseTypeName(rawType);
    if (!(PROPERTY_TYPES as readonly string[]).includes(base)) {
      reader.report(fields.get("type")?.value ?? entry.value, `Unknown property type "${rawType}". Use one of: ${PROPERTY_TYPES.join(", ")} (append [] for a list).`);
      continue;
    }
    const enumValues = fields.has("enum") ? reader.stringList(fields.get("enum"), `enum of ${owner}.${entry.key}`) : undefined;
    out.push({
      apiName: entry.key,
      type: base as OoPropertyType,
      isArray,
      displayName: reader.string(fields.get("displayName"), "displayName"),
      description: reader.string(fields.get("description"), "description"),
      unit: reader.string(fields.get("unit"), "unit"),
      enumValues,
      required: reader.boolean(fields.get("required"), "required") ?? false,
    });
  }
  return out;
}

const OBJECT_TYPE_FIELDS = [
  "displayName",
  "pluralDisplayName",
  "description",
  "primaryKey",
  "titleProperty",
  "icon",
  "color",
  "implements",
  "properties",
];

function readObjectTypes(reader: Reader, node: Node | null): OoObjectType[] {
  const out: OoObjectType[] = [];
  for (const entry of reader.entries(node, "objectTypes")) {
    if (!reader.apiName(entry, "Object type")) {
      continue;
    }
    const fields = reader.fields(entry.value, `object type ${entry.key}`, OBJECT_TYPE_FIELDS);
    const primaryKey = reader.string(fields.get("primaryKey"), "primaryKey");
    if (primaryKey === undefined) {
      reader.report(entry.keyNode, `Object type ${entry.key} needs a primaryKey.`);
    }
    out.push({
      apiName: entry.key,
      displayName: reader.string(fields.get("displayName"), "displayName"),
      pluralDisplayName: reader.string(fields.get("pluralDisplayName"), "pluralDisplayName"),
      description: reader.string(fields.get("description"), "description"),
      primaryKey: primaryKey ?? "",
      titleProperty: reader.string(fields.get("titleProperty"), "titleProperty"),
      icon: reader.string(fields.get("icon"), "icon"),
      color: reader.string(fields.get("color"), "color"),
      implements: reader.stringList(fields.get("implements"), "implements"),
      properties: readProperties(reader, fields.get("properties")?.value ?? null, entry.key),
    });
  }
  return out;
}

function readInterfaces(reader: Reader, node: Node | null): OoInterface[] {
  const out: OoInterface[] = [];
  for (const entry of reader.entries(node, "interfaces")) {
    if (!reader.apiName(entry, "Interface")) {
      continue;
    }
    const fields = reader.fields(entry.value, `interface ${entry.key}`, ["displayName", "description", "extends", "properties"]);
    out.push({
      apiName: entry.key,
      displayName: reader.string(fields.get("displayName"), "displayName"),
      description: reader.string(fields.get("description"), "description"),
      extends: reader.stringList(fields.get("extends"), "extends"),
      properties: readProperties(reader, fields.get("properties")?.value ?? null, entry.key),
    });
  }
  return out;
}

function readCardinality(reader: Reader, entry: Entry | undefined, what: string): OoCardinality {
  const raw = reader.string(entry, what)?.toLowerCase();
  if (raw === "one" || raw === "many") {
    return raw;
  }
  if (raw !== undefined) {
    reader.report(entry?.value, `${what} must be "one" or "many".`);
  }
  return "many";
}

function readLinkSide(reader: Reader, entry: Entry | undefined, linkName: string, role: "from" | "to"): OoLinkSide | undefined {
  if (!entry) {
    return undefined;
  }
  const fields = reader.fields(entry.value, `${role} side of link ${linkName}`, ["objectType", "name", "displayName", "cardinality"]);
  const objectType = reader.string(fields.get("objectType"), "objectType");
  const name = reader.string(fields.get("name"), "name");
  if (objectType === undefined || name === undefined) {
    reader.report(entry.keyNode, `The ${role} side of link ${linkName} needs objectType and name.`);
    return undefined;
  }
  if (!isValidApiName(name)) {
    reader.report(fields.get("name")?.value, `Link side name "${name}" is not a valid API name.`);
    return undefined;
  }
  return {
    objectType,
    name,
    displayName: reader.string(fields.get("displayName"), "displayName"),
    cardinality: readCardinality(reader, fields.get("cardinality"), "cardinality"),
  };
}

function readLinkTypes(reader: Reader, node: Node | null): OoLinkType[] {
  const out: OoLinkType[] = [];
  for (const entry of reader.entries(node, "linkTypes")) {
    if (!reader.apiName(entry, "Link type")) {
      continue;
    }
    const fields = reader.fields(entry.value, `link type ${entry.key}`, ["displayName", "description", "from", "to", "foreignKey"]);
    const from = readLinkSide(reader, fields.get("from"), entry.key, "from");
    const to = readLinkSide(reader, fields.get("to"), entry.key, "to");
    if (!from || !to) {
      if (!fields.has("from") || !fields.has("to")) {
        reader.report(entry.keyNode, `Link type ${entry.key} needs both a from and a to side.`);
      }
      continue;
    }
    const rawForeignKey = reader.string(fields.get("foreignKey"), "foreignKey");
    let foreignKey: OoLinkType["foreignKey"];
    if (rawForeignKey !== undefined) {
      const [objectType, property, ...rest] = rawForeignKey.split(".");
      if (!objectType || !property || rest.length > 0) {
        reader.report(fields.get("foreignKey")?.value, `foreignKey must be written as Type.property.`);
      } else {
        foreignKey = { objectType, property };
      }
    }
    out.push({
      apiName: entry.key,
      displayName: reader.string(fields.get("displayName"), "displayName"),
      description: reader.string(fields.get("description"), "description"),
      from,
      to,
      foreignKey,
    });
  }
  return out;
}

function readParameters(reader: Reader, node: Node | null, actionName: string): OoParameter[] {
  const out: OoParameter[] = [];
  for (const entry of reader.entries(node, `parameters of ${actionName}`)) {
    if (!reader.apiName(entry, "Parameter")) {
      continue;
    }
    const fields = reader.fields(entry.value, `parameter ${actionName}.${entry.key}`, [
      "type",
      "objectType",
      "required",
      "displayName",
      "description",
      "enum",
    ]);
    const rawType = reader.string(fields.get("type"), "type");
    if (rawType === undefined) {
      reader.report(entry.keyNode, `Parameter ${entry.key} of ${actionName} needs a type.`);
      continue;
    }
    const { base, isArray } = parseTypeName(rawType);
    if (!(PARAMETER_TYPES as readonly string[]).includes(base)) {
      reader.report(fields.get("type")?.value, `Unknown parameter type "${rawType}". Use one of: ${PARAMETER_TYPES.join(", ")}.`);
      continue;
    }
    out.push({
      id: entry.key,
      type: base as OoParameterType,
      isArray,
      objectType: reader.string(fields.get("objectType"), "objectType"),
      required: reader.boolean(fields.get("required"), "required") ?? false,
      displayName: reader.string(fields.get("displayName"), "displayName"),
      description: reader.string(fields.get("description"), "description"),
      enumValues: fields.has("enum") ? reader.stringList(fields.get("enum"), "enum") : undefined,
    });
  }
  return out;
}

function readRules(reader: Reader, entry: Entry | undefined, actionName: string): OoRule[] {
  const out: OoRule[] = [];
  for (const node of reader.sequence(entry, `rules of ${actionName}`)) {
    const fields = reader.fields(node, `a rule of ${actionName}`, ["op", "objectType", "linkType", "object", "from", "to", "set"]);
    const op = reader.string(fields.get("op"), "op");
    if (op === undefined || !(RULE_OPS as readonly string[]).includes(op)) {
      reader.report(fields.get("op")?.value ?? node, `A rule needs op: one of ${RULE_OPS.join(", ")}.`);
      continue;
    }
    const set: Record<string, string> = {};
    for (const setEntry of reader.entries(fields.get("set")?.value ?? null, "set")) {
      const value = reader.string(setEntry, `set.${setEntry.key}`);
      if (value !== undefined) {
        set[setEntry.key] = value;
      }
    }
    out.push({
      op: op as OoRuleOp,
      objectType: reader.string(fields.get("objectType"), "objectType"),
      linkType: reader.string(fields.get("linkType"), "linkType"),
      object: reader.string(fields.get("object"), "object"),
      from: reader.string(fields.get("from"), "from"),
      to: reader.string(fields.get("to"), "to"),
      set,
    });
  }
  return out;
}

function readActionTypes(reader: Reader, node: Node | null): OoActionType[] {
  const out: OoActionType[] = [];
  for (const entry of reader.entries(node, "actionTypes")) {
    if (!reader.apiName(entry, "Action type")) {
      continue;
    }
    const fields = reader.fields(entry.value, `action type ${entry.key}`, [
      "displayName",
      "description",
      "parameters",
      "rules",
      "validations",
      "sideEffects",
    ]);
    const validations = reader.sequence(fields.get("validations"), "validations").flatMap((item) => {
      if (isScalar(item) && item.value !== null) {
        return [{ description: String(item.value) }];
      }
      const v = reader.fields(item, "a validation", ["description", "expr"]);
      const description = reader.string(v.get("description"), "description");
      if (description === undefined) {
        reader.report(item, "A validation needs a description.");
        return [];
      }
      return [{ description, expr: reader.string(v.get("expr"), "expr") }];
    });
    out.push({
      apiName: entry.key,
      displayName: reader.string(fields.get("displayName"), "displayName"),
      description: reader.string(fields.get("description"), "description"),
      parameters: readParameters(reader, fields.get("parameters")?.value ?? null, entry.key),
      rules: readRules(reader, fields.get("rules"), entry.key),
      validations,
      sideEffects: reader.stringList(fields.get("sideEffects"), "sideEffects"),
    });
  }
  return out;
}

function readObjects(reader: Reader, node: Node | null): { records: OoObjectRecord[]; nodes: Node[] } {
  const records: OoObjectRecord[] = [];
  const nodes: Node[] = [];
  for (const entry of reader.entries(node, "objects")) {
    for (const item of reader.sequence(entry, `objects of ${entry.key}`)) {
      if (records.length >= MAX_OBJECT_RECORDS) {
        reader.report(item, `Only the first ${MAX_OBJECT_RECORDS} example objects are read.`, "warning");
        return { records, nodes };
      }
      const values = new Map<string, unknown>();
      for (const field of reader.entries(item, `an object of ${entry.key}`)) {
        values.set(field.key, reader.plainValue(field.value));
      }
      records.push({ objectType: entry.key, values });
      nodes.push(item);
    }
  }
  return { records, nodes };
}

const TOP_LEVEL_FIELDS = [
  "objectOntology",
  "name",
  "description",
  "namespace",
  "objectTypes",
  "interfaces",
  "linkTypes",
  "actionTypes",
  "objects",
];

/**
 * Parses and validates an Object Ontology document. Never throws: YAML
 * syntax errors, shape errors and semantic errors all come back as
 * diagnostics with source ranges, and a best-effort model is still returned
 * so the diagram can keep showing whatever is valid.
 */
export function parseObjectOntology(text: string): ParsedObjectOntology {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true, strict: false });
  const diagnostics: OoDiagnostic[] = [
    ...document.errors.map((e) => ({
      message: e.message.split("\n")[0],
      severity: "error" as const,
      range: { start: e.pos[0], end: Math.max(e.pos[0], e.pos[1]) },
    })),
    ...document.warnings.map((w) => ({
      message: w.message.split("\n")[0],
      severity: "warning" as const,
      range: { start: w.pos[0], end: Math.max(w.pos[0], w.pos[1]) },
    })),
  ];

  const reader = new Reader(document);
  const contents = reader.resolve(document.contents);
  if (!isMap(contents)) {
    diagnostics.push({
      message: "An Object Ontology document must be a mapping that starts with `objectOntology: 1`.",
      severity: "error",
      range: rangeOf(contents),
    });
    return { diagnostics, document };
  }

  const top = reader.fields(contents, "the document", TOP_LEVEL_FIELDS);
  const versionEntry = top.get("objectOntology");
  const version = Number(reader.string(versionEntry, "objectOntology"));
  if (!versionEntry) {
    reader.report(contents, "Missing `objectOntology: 1` — the format version marker.");
  } else if (version !== OBJECT_ONTOLOGY_FORMAT_VERSION) {
    reader.report(versionEntry.value, `Unsupported Object Ontology version. This extension reads version ${OBJECT_ONTOLOGY_FORMAT_VERSION}.`);
  }

  const name = reader.string(top.get("name"), "name") ?? "Untitled ontology";
  let namespace = reader.string(top.get("namespace"), "namespace");
  if (namespace !== undefined && !/^[A-Za-z][A-Za-z0-9+.-]*:\S*[#/:]$/.test(namespace)) {
    reader.report(top.get("namespace")?.value, "namespace must be an absolute IRI ending in #, / or :.");
    namespace = undefined;
  }

  const objects = readObjects(reader, top.get("objects")?.value ?? null);
  const ontology: ObjectOntology = {
    version: Number.isFinite(version) ? version : OBJECT_ONTOLOGY_FORMAT_VERSION,
    name,
    description: reader.string(top.get("description"), "description"),
    namespace: namespace ?? defaultNamespace(name),
    objectTypes: readObjectTypes(reader, top.get("objectTypes")?.value ?? null),
    interfaces: readInterfaces(reader, top.get("interfaces")?.value ?? null),
    linkTypes: readLinkTypes(reader, top.get("linkTypes")?.value ?? null),
    actionTypes: readActionTypes(reader, top.get("actionTypes")?.value ?? null),
    objects: objects.records,
  };

  diagnostics.push(...reader.diagnostics, ...validateOntology(ontology, document, objects.nodes));
  return { ontology, diagnostics, document };
}
