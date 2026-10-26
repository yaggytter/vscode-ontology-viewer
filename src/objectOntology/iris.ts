/**
 * Deterministic IRIs for Object Ontology elements.
 *
 * API names are restricted to `[A-Za-z][A-Za-z0-9_]*`, so the separators used
 * here (`.`, `/`) can never occur inside a name and no two element kinds can
 * collide: `Vehicle` (type) vs `Vehicle.plate` (property) vs `link/x`,
 * `action/x` and `Vehicle/V-01` (object).
 */

/** Vocabulary for the RDF projection (SPARQL, Turtle export). */
export const OONT = "urn:object-ontology:vocab#";

export const API_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export function isValidApiName(name: string): boolean {
  return API_NAME_PATTERN.test(name);
}

export function defaultNamespace(ontologyName: string): string {
  const slug = ontologyName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `urn:object-ontology:${slug || "ontology"}#`;
}

export function typeIri(ns: string, typeName: string): string {
  return `${ns}${typeName}`;
}

/** Properties and link sides both live under their owning type. */
export function memberIri(ns: string, typeName: string, memberName: string): string {
  return `${ns}${typeName}.${memberName}`;
}

export function linkTypeIri(ns: string, linkName: string): string {
  return `${ns}link/${linkName}`;
}

export function actionTypeIri(ns: string, actionName: string): string {
  return `${ns}action/${actionName}`;
}

export function parameterIri(ns: string, actionName: string, parameterId: string): string {
  return `${ns}action/${actionName}/parameter/${parameterId}`;
}

export function ruleIri(ns: string, actionName: string, index: number): string {
  return `${ns}action/${actionName}/rule/${index + 1}`;
}

export function objectIri(ns: string, typeName: string, primaryKey: string): string {
  return `${ns}${typeName}/${encodeURIComponent(primaryKey)}`;
}

export type ParsedIri =
  | { kind: "type"; typeName: string }
  | { kind: "member"; typeName: string; memberName: string }
  | { kind: "link"; linkName: string }
  | { kind: "action"; actionName: string };

/** Inverse of the minting functions above, for the element kinds the editor addresses by id. */
export function parseElementIri(ns: string, iri: string): ParsedIri | undefined {
  if (!iri.startsWith(ns)) {
    return undefined;
  }
  const rest = iri.slice(ns.length);
  const link = /^link\/([A-Za-z][A-Za-z0-9_]*)$/.exec(rest);
  if (link) {
    return { kind: "link", linkName: link[1] };
  }
  const action = /^action\/([A-Za-z][A-Za-z0-9_]*)$/.exec(rest);
  if (action) {
    return { kind: "action", actionName: action[1] };
  }
  const member = /^([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(rest);
  if (member) {
    return { kind: "member", typeName: member[1], memberName: member[2] };
  }
  if (isValidApiName(rest)) {
    return { kind: "type", typeName: rest };
  }
  return undefined;
}
