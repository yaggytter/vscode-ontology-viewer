import { isAlias, isMap, isScalar, isSeq, type Document, type Node, type Pair } from "yaml";
import type { SourceRange } from "./model";
import { parseElementIri } from "./iris";

export type YamlPath = readonly (string | number)[];

function resolve(document: Document, node: unknown): Node | null {
  if (isAlias(node)) {
    return (node.resolve(document) as Node | undefined) ?? null;
  }
  return (node as Node | null) ?? null;
}

/** The mapping pair at `key` inside `node`, if `node` is a map that has it. */
export function pairAt(document: Document, node: Node | null, key: string): Pair<Node, Node | null> | undefined {
  if (!isMap(node)) {
    return undefined;
  }
  for (const pair of node.items) {
    const keyNode = resolve(document, pair.key);
    if (isScalar(keyNode) && String(keyNode.value) === key) {
      return pair as Pair<Node, Node | null>;
    }
  }
  return undefined;
}

/** The value node at `path` (map keys and sequence indices), or undefined if any step is missing. */
export function nodeAt(document: Document, path: YamlPath): Node | null | undefined {
  let current: Node | null = resolve(document, document.contents);
  for (const step of path) {
    if (typeof step === "number") {
      if (!isSeq(current)) {
        return undefined;
      }
      current = resolve(document, current.items[step]);
      continue;
    }
    const pair = pairAt(document, current, step);
    if (!pair) {
      return undefined;
    }
    current = resolve(document, pair.value);
  }
  return current;
}

/**
 * Where to point the user for `path`: the key of the last map step (so
 * "reveal" lands on `Vehicle:` rather than the whole block), or the item
 * itself for a sequence index.
 */
export function keyRangeAt(document: Document, path: YamlPath): SourceRange | undefined {
  if (path.length === 0) {
    return undefined;
  }
  const last = path[path.length - 1];
  const parent = nodeAt(document, path.slice(0, -1));
  if (parent === undefined) {
    return undefined;
  }
  const target = typeof last === "number" ? (isSeq(parent) ? resolve(document, parent.items[last]) : null) : pairAt(document, parent, last)?.key;
  const range = (target as Node | null | undefined)?.range;
  return range ? { start: range[0], end: range[1] } : undefined;
}

/**
 * The document path of the element a diagram id names — the inverse of the
 * IRI minting in ./iris.ts. Members (`Type.name`) resolve to a property of
 * the type or interface first, then to a link side naming it.
 */
export function pathForElement(document: Document, namespace: string, iri: string): YamlPath | undefined {
  const parsed = parseElementIri(namespace, iri);
  if (!parsed) {
    return undefined;
  }
  switch (parsed.kind) {
    case "type":
      if (nodeAt(document, ["objectTypes", parsed.typeName]) !== undefined) {
        return ["objectTypes", parsed.typeName];
      }
      return nodeAt(document, ["interfaces", parsed.typeName]) !== undefined ? ["interfaces", parsed.typeName] : undefined;
    case "link":
      return ["linkTypes", parsed.linkName];
    case "action":
      return ["actionTypes", parsed.actionName];
    case "member":
      for (const section of ["objectTypes", "interfaces"]) {
        const path = [section, parsed.typeName, "properties", parsed.memberName];
        if (nodeAt(document, path) !== undefined) {
          return path;
        }
      }
      return undefined;
  }
}
