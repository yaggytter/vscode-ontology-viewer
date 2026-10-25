import type { Document, Node } from "yaml";
import type { ObjectOntology, OoDiagnostic, OoObjectType, OoProperty, OoSeverity, SourceRange } from "./model";
import { keyRangeAt, nodeAt, type YamlPath } from "./locate";

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Cross-reference checks that need the whole model: every name an element
 * refers to must exist, keys must be unique across the shared name spaces,
 * and example objects must fit their types. Shape errors are reported by the
 * parser; this only sees well-formed elements.
 */
export function validateOntology(ontology: ObjectOntology, document: Document, objectNodes: readonly Node[]): OoDiagnostic[] {
  const diagnostics: OoDiagnostic[] = [];
  const at = (path: YamlPath, message: string, severity: OoSeverity = "error"): void => {
    diagnostics.push({ message, severity, range: keyRangeAt(document, path) ?? valueRange(document, path) });
  };

  const objectTypes = new Map(ontology.objectTypes.map((t) => [t.apiName, t]));
  const interfaces = new Map(ontology.interfaces.map((i) => [i.apiName, i]));
  const linkTypes = new Map(ontology.linkTypes.map((l) => [l.apiName, l]));

  for (const iface of ontology.interfaces) {
    if (objectTypes.has(iface.apiName)) {
      at(["interfaces", iface.apiName], `"${iface.apiName}" is both an object type and an interface; names must be unique.`);
    }
    for (const parent of iface.extends) {
      if (!interfaces.has(parent)) {
        at(["interfaces", iface.apiName, "extends"], `Interface ${iface.apiName} extends unknown interface "${parent}".`);
      }
    }
  }

  for (const type of ontology.objectTypes) {
    validateObjectType(type, interfaces, at);
  }

  // Link-side names become members of their object type, next to its properties.
  const memberNames = new Map<string, Set<string>>();
  const membersOf = (typeName: string): Set<string> => {
    let set = memberNames.get(typeName);
    if (!set) {
      set = new Set(objectTypes.get(typeName)?.properties.map((p) => p.apiName) ?? []);
      memberNames.set(typeName, set);
    }
    return set;
  };
  for (const link of ontology.linkTypes) {
    const base = ["linkTypes", link.apiName];
    for (const [role, side] of [["from", link.from], ["to", link.to]] as const) {
      if (!objectTypes.has(side.objectType)) {
        at([...base, role, "objectType"], `Link ${link.apiName} refers to unknown object type "${side.objectType}".`);
        continue;
      }
      const members = membersOf(side.objectType);
      if (members.has(side.name)) {
        at([...base, role, "name"], `"${side.name}" is already a property or link name on ${side.objectType}.`);
      }
      members.add(side.name);
    }
    if (link.foreignKey) {
      const holder = objectTypes.get(link.foreignKey.objectType);
      if (!holder || ![link.from.objectType, link.to.objectType].includes(holder.apiName)) {
        at([...base, "foreignKey"], `foreignKey must name a property of ${link.from.objectType} or ${link.to.objectType}.`);
      } else if (!holder.properties.some((p) => p.apiName === link.foreignKey!.property)) {
        at([...base, "foreignKey"], `${holder.apiName} has no property "${link.foreignKey.property}".`);
      }
    }
  }

  for (const action of ontology.actionTypes) {
    const base = ["actionTypes", action.apiName];
    const parameterIds = new Set(action.parameters.map((p) => p.id));
    for (const parameter of action.parameters) {
      if (parameter.type === "objectRef") {
        if (!parameter.objectType) {
          at([...base, "parameters", parameter.id], `Parameter ${parameter.id} is an objectRef and needs objectType.`);
        } else if (!objectTypes.has(parameter.objectType) && !interfaces.has(parameter.objectType)) {
          at([...base, "parameters", parameter.id, "objectType"], `Unknown object type "${parameter.objectType}".`);
        }
      }
    }
    action.rules.forEach((rule, index) => {
      const rulePath = [...base, "rules", index];
      const checkParam = (field: "object" | "from" | "to"): void => {
        const ref = rule[field];
        if (ref !== undefined && !parameterIds.has(ref.replace(/^\$/, ""))) {
          at([...rulePath, field], `Rule refers to unknown parameter "${ref}".`);
        }
      };
      if (rule.op === "createLink" || rule.op === "deleteLink") {
        if (!rule.linkType) {
          at(rulePath, `A ${rule.op} rule needs linkType.`);
        } else if (!linkTypes.has(rule.linkType)) {
          at([...rulePath, "linkType"], `Unknown link type "${rule.linkType}".`);
        }
        checkParam("from");
        checkParam("to");
        return;
      }
      if (!rule.objectType) {
        at(rulePath, `A ${rule.op} rule needs objectType.`);
        return;
      }
      const target = objectTypes.get(rule.objectType);
      if (!target && !interfaces.has(rule.objectType)) {
        at([...rulePath, "objectType"], `Unknown object type "${rule.objectType}".`);
        return;
      }
      checkParam("object");
      const knownProperties = new Set((target ?? interfaces.get(rule.objectType))!.properties.map((p) => p.apiName));
      for (const [property, value] of Object.entries(rule.set)) {
        if (!knownProperties.has(property)) {
          at([...rulePath, "set", property], `${rule.objectType} has no property "${property}".`);
        }
        if (value.startsWith("$") && !parameterIds.has(value.slice(1))) {
          at([...rulePath, "set", property], `Unknown parameter "${value}".`);
        }
      }
    });
  }

  validateObjects(ontology, objectTypes, objectNodes, diagnostics);
  return diagnostics;
}

function valueRange(document: Document, path: YamlPath): SourceRange {
  for (let depth = path.length; depth >= 0; depth--) {
    const node = nodeAt(document, path.slice(0, depth));
    if (node?.range) {
      return { start: node.range[0], end: node.range[1] };
    }
  }
  return { start: 0, end: 0 };
}

function validateObjectType(
  type: OoObjectType,
  interfaces: ReadonlyMap<string, { properties: OoProperty[]; extends: string[] }>,
  at: (path: YamlPath, message: string, severity?: OoSeverity) => void,
): void {
  const base = ["objectTypes", type.apiName];
  const names = new Set(type.properties.map((p) => p.apiName));
  if (type.primaryKey && !names.has(type.primaryKey)) {
    at([...base, "primaryKey"], `primaryKey "${type.primaryKey}" is not a property of ${type.apiName}.`);
  }
  if (type.titleProperty && !names.has(type.titleProperty)) {
    at([...base, "titleProperty"], `titleProperty "${type.titleProperty}" is not a property of ${type.apiName}.`);
  }
  if (type.color !== undefined && !HEX_COLOR.test(type.color)) {
    at([...base, "color"], `color must be a hex color such as #3a7bd5.`, "warning");
  }
  for (const property of type.properties) {
    if (property.enumValues && property.type !== "string") {
      at([...base, "properties", property.apiName], `enum is only meaningful on string properties.`, "warning");
    }
  }
  for (const name of type.implements) {
    const iface = interfaces.get(name);
    if (!iface) {
      at([...base, "implements"], `${type.apiName} implements unknown interface "${name}".`);
      continue;
    }
    for (const required of collectInterfaceProperties(name, interfaces)) {
      if (!names.has(required.apiName)) {
        at(
          [...base, "implements"],
          `${type.apiName} implements ${name} but has no property "${required.apiName}".`,
          "warning",
        );
      }
    }
  }
}

function collectInterfaceProperties(
  name: string,
  interfaces: ReadonlyMap<string, { properties: OoProperty[]; extends: string[] }>,
  seen = new Set<string>(),
): OoProperty[] {
  if (seen.has(name)) {
    return [];
  }
  seen.add(name);
  const iface = interfaces.get(name);
  if (!iface) {
    return [];
  }
  return [...iface.properties, ...iface.extends.flatMap((parent) => collectInterfaceProperties(parent, interfaces, seen))];
}

function validateObjects(
  ontology: ObjectOntology,
  objectTypes: ReadonlyMap<string, OoObjectType>,
  objectNodes: readonly Node[],
  diagnostics: OoDiagnostic[],
): void {
  const seenKeys = new Map<string, Set<string>>();
  const sidesByType = new Map<string, Set<string>>();
  for (const link of ontology.linkTypes) {
    for (const side of [link.from, link.to]) {
      const set = sidesByType.get(side.objectType) ?? new Set<string>();
      set.add(side.name);
      sidesByType.set(side.objectType, set);
    }
  }
  const unknownTypes = new Set<string>();

  ontology.objects.forEach((record, index) => {
    const node = objectNodes[index];
    const range: SourceRange = node?.range ? { start: node.range[0], end: node.range[1] } : { start: 0, end: 0 };
    const type = objectTypes.get(record.objectType);
    if (!type) {
      if (!unknownTypes.has(record.objectType)) {
        unknownTypes.add(record.objectType);
        diagnostics.push({ message: `Objects listed for unknown object type "${record.objectType}".`, severity: "error", range });
      }
      return;
    }
    const key = record.values.get(type.primaryKey);
    if (key === undefined || key === null || key === "") {
      diagnostics.push({ message: `An object of ${type.apiName} is missing its primary key "${type.primaryKey}".`, severity: "error", range });
      return;
    }
    const keys = seenKeys.get(type.apiName) ?? new Set<string>();
    if (keys.has(String(key))) {
      diagnostics.push({ message: `Duplicate primary key ${String(key)} for ${type.apiName}.`, severity: "error", range });
    }
    keys.add(String(key));
    seenKeys.set(type.apiName, keys);

    const properties = new Set(type.properties.map((p) => p.apiName));
    const sides = sidesByType.get(type.apiName) ?? new Set<string>();
    for (const field of record.values.keys()) {
      if (!properties.has(field) && !sides.has(field)) {
        diagnostics.push({ message: `${type.apiName} has no property or link named "${field}".`, severity: "warning", range });
      }
    }
  });
}
