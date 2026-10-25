import type { PropertyType } from "../../rdf/schemaModel";
import type { ObjectOntology, OoPropertyType } from "../model";
import { isValidApiName, linkTypeIri, memberIri, parseElementIri, typeIri } from "../iris";
import { isScalar, type Document } from "yaml";
import { nodeAt, pathForElement, type YamlPath } from "../locate";
import { parseObjectOntology, type ParsedObjectOntology } from "../parse";
import { applySplice, formatFlow, insertEntry, removeEntry, setScalar, type SpliceResult, type TextSplice, type YamlValue } from "./yamlEdit";

/**
 * Diagram-originated edits to an Object Ontology YAML document.
 *
 * Mirrors the RDF side's discipline (src/edit/verify.ts): every operation
 * plans one surgical text splice, re-parses the *proposed* text, and only
 * returns the splice if that text is still a clean document in which the
 * intended change is visible. Nothing here touches VS Code — the host turns
 * the splice into a WorkspaceEdit.
 */
export type EditPlan =
  | { ok: true; splice: TextSplice; newIri?: string }
  | { ok: false; reason: string };

type Expectation = (ontology: ObjectOntology) => string | undefined;

function verify(text: string, planned: SpliceResult, expectation: Expectation, newIri?: string): EditPlan {
  if (!planned.ok) {
    return planned;
  }
  const proposed = parseObjectOntology(applySplice(text, planned.splice));
  const syntaxErrors = proposed.document.errors;
  if (syntaxErrors.length > 0 || !proposed.ontology) {
    return { ok: false, reason: `The edit would produce invalid YAML: ${syntaxErrors[0]?.message.split("\n")[0] ?? "not a mapping"}` };
  }
  const failure = expectation(proposed.ontology);
  return failure ? { ok: false, reason: failure } : { ok: true, splice: planned.splice, newIri };
}

function loadEditable(text: string): { parsed: ParsedObjectOntology; ontology: ObjectOntology } | { error: string } {
  const parsed = parseObjectOntology(text);
  if (!parsed.ontology || parsed.document.errors.length > 0) {
    return { error: "Fix the YAML syntax errors in the document before editing from the diagram." };
  }
  return { parsed, ontology: parsed.ontology };
}

/** `"delivery route"` -> `DeliveryRoute` / `deliveryRoute`; empty when nothing ASCII survives. */
function toApiName(name: string, upperFirst: boolean): string {
  const words = name
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const joined = words.map((w, i) => (i === 0 && !upperFirst ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1))).join("");
  const trimmed = joined.replace(/^[0-9]+/, "");
  return isValidApiName(trimmed) ? trimmed : "";
}

function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}${n}`)) {
      return `${base}${n}`;
    }
  }
}

function lowerFirst(name: string): string {
  return name[0].toLowerCase() + name.slice(1);
}

/** Names already used on a type: its properties and the link sides attached to it. */
function memberNames(ontology: ObjectOntology, typeName: string): Set<string> {
  const names = new Set<string>();
  const type = ontology.objectTypes.find((t) => t.apiName === typeName) ?? ontology.interfaces.find((i) => i.apiName === typeName);
  type?.properties.forEach((p) => names.add(p.apiName));
  for (const link of ontology.linkTypes) {
    if (link.from.objectType === typeName) {
      names.add(link.from.name);
    }
    if (link.to.objectType === typeName) {
      names.add(link.to.name);
    }
  }
  return names;
}

const OO_TYPE_FOR: Partial<Record<PropertyType, OoPropertyType>> = {
  string: "string",
  integer: "integer",
  decimal: "decimal",
  double: "double",
  boolean: "boolean",
  date: "date",
  datetime: "timestamp",
};

/**
 * Sets `field` on the element declared at `path`. A property written in the
 * `name: string` shorthand is expanded to `name: { type: string, field: ... }`
 * first, since a scalar cannot carry a second field.
 */
function setElementField(text: string, document: Document, path: YamlPath, field: string, value: string): SpliceResult {
  const declaration = nodeAt(document, path);
  if (isScalar(declaration) && declaration.value !== null && declaration.range) {
    return {
      ok: true,
      splice: {
        start: declaration.range[0],
        end: declaration.range[1],
        newText: formatFlow({ type: String(declaration.value), [field]: value }),
      },
    };
  }
  return setScalar(text, document, [...path, field], value);
}

export function planSetDisplayName(text: string, elementIri: string, newLabel: string): EditPlan {
  const loaded = loadEditable(text);
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }
  const label = newLabel.trim();
  if (!label) {
    return { ok: false, reason: "A name cannot be empty." };
  }
  const path = pathForElement(loaded.parsed.document, loaded.ontology.namespace, elementIri);
  if (!path) {
    return { ok: false, reason: "This element has no declaration in the document to rename." };
  }
  return verify(text, setElementField(text, loaded.parsed.document, path, "displayName", label), (o) => {
    const ns = o.namespace;
    const found = [...o.objectTypes, ...o.interfaces].find((t) => typeIri(ns, t.apiName) === elementIri)?.displayName ??
      o.linkTypes.find((l) => linkTypeIri(ns, l.apiName) === elementIri)?.displayName ??
      [...o.objectTypes, ...o.interfaces]
        .flatMap((t) => t.properties.map((p) => ({ iri: memberIri(ns, t.apiName, p.apiName), p })))
        .find((x) => x.iri === elementIri)?.p.displayName;
    return found === label ? undefined : "The new name did not take effect.";
  });
}

export function planSetDescription(text: string, elementIri: string, description: string): EditPlan {
  const loaded = loadEditable(text);
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }
  const value = description.trim();
  if (!value) {
    return { ok: false, reason: "Clearing a description isn't supported yet — edit it directly in the text editor." };
  }
  const path = pathForElement(loaded.parsed.document, loaded.ontology.namespace, elementIri);
  if (!path) {
    return { ok: false, reason: "This element has no declaration in the document." };
  }
  return verify(text, setElementField(text, loaded.parsed.document, path, "description", value), (o) => {
    const ns = o.namespace;
    const holder =
      [...o.objectTypes, ...o.interfaces].find((t) => typeIri(ns, t.apiName) === elementIri) ??
      o.linkTypes.find((l) => linkTypeIri(ns, l.apiName) === elementIri);
    return holder?.description === value ? undefined : "The new description did not take effect.";
  });
}

export function planAddObjectType(text: string, name: string, description: string | undefined): EditPlan {
  const loaded = loadEditable(text);
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }
  const label = name.trim();
  if (!label) {
    return { ok: false, reason: "An object type needs a name." };
  }
  const taken = new Set([...loaded.ontology.objectTypes, ...loaded.ontology.interfaces].map((t) => t.apiName));
  const apiName = uniqueName(toApiName(label, true) || "ObjectType", taken);
  const primaryKey = `${lowerFirst(apiName)}Id`;
  const definition: { [key: string]: YamlValue } = {};
  if (label !== apiName) {
    definition.displayName = label;
  }
  if (description?.trim()) {
    definition.description = description.trim();
  }
  definition.primaryKey = primaryKey;
  definition.properties = { [primaryKey]: { type: "string" } };
  const newIri = typeIri(loaded.ontology.namespace, apiName);
  return verify(
    text,
    insertEntry(text, loaded.parsed.document, ["objectTypes"], apiName, definition),
    (o) => (o.objectTypes.some((t) => t.apiName === apiName) ? undefined : "The new object type did not appear."),
    newIri,
  );
}

export function planAddLinkType(text: string, sourceIri: string, targetIri: string, name: string): EditPlan {
  const loaded = loadEditable(text);
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }
  const { ontology } = loaded;
  const ns = ontology.namespace;
  const source = ontology.objectTypes.find((t) => typeIri(ns, t.apiName) === sourceIri);
  const target = ontology.objectTypes.find((t) => typeIri(ns, t.apiName) === targetIri);
  if (!source || !target) {
    return { ok: false, reason: "Links can only connect object types (not interfaces)." };
  }
  const label = name.trim();
  if (!label) {
    return { ok: false, reason: "A link needs a name." };
  }
  const fromName = uniqueName(toApiName(label, false) || lowerFirst(target.apiName), memberNames(ontology, source.apiName));
  const toTaken = memberNames(ontology, target.apiName);
  if (source.apiName === target.apiName) {
    toTaken.add(fromName);
  }
  const toName = uniqueName(`${lowerFirst(source.apiName)}s`, toTaken);
  const apiName = uniqueName(`${lowerFirst(source.apiName)}${target.apiName}`, new Set(ontology.linkTypes.map((l) => l.apiName)));
  const definition: { [key: string]: YamlValue } = {};
  if (label !== fromName) {
    definition.displayName = label;
  }
  definition.from = { objectType: source.apiName, name: fromName, cardinality: "one" };
  definition.to = { objectType: target.apiName, name: toName, cardinality: "many" };
  return verify(
    text,
    insertEntry(text, loaded.parsed.document, ["linkTypes"], apiName, definition),
    (o) => (o.linkTypes.some((l) => l.apiName === apiName) ? undefined : "The new link type did not appear."),
    linkTypeIri(ns, apiName),
  );
}

export function planAddProperty(text: string, ownerIri: string, name: string, propertyType: PropertyType): EditPlan {
  const loaded = loadEditable(text);
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }
  const { ontology } = loaded;
  const ns = ontology.namespace;
  const parsedIri = parseElementIri(ns, ownerIri);
  const ownerPath = pathForElement(loaded.parsed.document, ns, ownerIri);
  if (parsedIri?.kind !== "type" || !ownerPath) {
    return { ok: false, reason: "Properties can be added to object types and interfaces." };
  }
  const ooType = OO_TYPE_FOR[propertyType] ?? "string";
  const label = name.trim();
  const apiName = uniqueName(toApiName(label, false) || "property", memberNames(ontology, parsedIri.typeName));
  const definition: { [key: string]: YamlValue } = { type: ooType };
  if (label && label !== apiName) {
    definition.displayName = label;
  }
  return verify(
    text,
    insertEntry(text, loaded.parsed.document, [...ownerPath, "properties"], apiName, definition),
    (o) =>
      [...o.objectTypes, ...o.interfaces]
        .find((t) => t.apiName === parsedIri.typeName)
        ?.properties.some((p) => p.apiName === apiName && p.type === ooType)
        ? undefined
        : "The new property did not appear.",
    memberIri(ns, parsedIri.typeName, apiName),
  );
}

export function planSetPropertyType(text: string, propertyIri: string, propertyType: PropertyType): EditPlan {
  const loaded = loadEditable(text);
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }
  const ooType = OO_TYPE_FOR[propertyType];
  if (!ooType) {
    return { ok: false, reason: "Enum values and other types are edited directly in the text editor." };
  }
  const { document } = loaded.parsed;
  const path = pathForElement(document, loaded.ontology.namespace, propertyIri);
  const parsedIri = parseElementIri(loaded.ontology.namespace, propertyIri);
  if (!path || parsedIri?.kind !== "member") {
    return { ok: false, reason: "This property has no declaration in the document." };
  }
  // `name: string` shorthand keeps its shape; `name: { type: ... }` gets its type replaced.
  const declaration = nodeAt(document, path);
  const isShorthand = isScalar(declaration) && declaration.value !== null;
  const planned = setScalar(text, document, isShorthand ? path : [...path, "type"], ooType);
  return verify(text, planned, (o) =>
    [...o.objectTypes, ...o.interfaces]
      .find((t) => t.apiName === parsedIri.typeName)
      ?.properties.find((p) => p.apiName === parsedIri.memberName)?.type === ooType
      ? undefined
      : "The new type did not take effect.",
  );
}

export function planDeleteElement(text: string, elementIri: string): EditPlan {
  const loaded = loadEditable(text);
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }
  const { ontology } = loaded;
  const ns = ontology.namespace;
  const parsedIri = parseElementIri(ns, elementIri);
  const path = pathForElement(loaded.parsed.document, ns, elementIri);
  if (!parsedIri || !path) {
    return { ok: false, reason: "This element has no declaration in the document." };
  }
  if (parsedIri.kind === "member") {
    const owner = ontology.objectTypes.find((t) => t.apiName === parsedIri.typeName);
    if (owner?.primaryKey === parsedIri.memberName || owner?.titleProperty === parsedIri.memberName) {
      return { ok: false, reason: "This property is the type's primaryKey or titleProperty — change that first." };
    }
  } else if (parsedIri.kind === "link") {
    const usedBy = ontology.actionTypes.find((a) => a.rules.some((r) => r.linkType === parsedIri.linkName));
    if (usedBy) {
      return { ok: false, reason: `Action ${usedBy.apiName} uses this link type — remove its rule first.` };
    }
  } else {
    return { ok: false, reason: "Only properties and link types can be deleted from the diagram." };
  }
  const key = String(path[path.length - 1]);
  return verify(text, removeEntry(text, loaded.parsed.document, path.slice(0, -1), key), (o) => {
    if (parsedIri.kind === "link") {
      return o.linkTypes.some((l) => l.apiName === parsedIri.linkName) ? "The link type is still there." : undefined;
    }
    const owner = [...o.objectTypes, ...o.interfaces].find((t) => t.apiName === parsedIri.typeName);
    return owner?.properties.some((p) => p.apiName === parsedIri.memberName) ? "The property is still there." : undefined;
  });
}
