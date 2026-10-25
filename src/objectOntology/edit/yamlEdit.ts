import { isMap, isScalar, type Document, type Node, type YAMLMap } from "yaml";
import { nodeAt, pairAt, type YamlPath } from "../locate";

/** A single replacement of `[start, end)` in the source text. */
export interface TextSplice {
  start: number;
  end: number;
  newText: string;
}

export type YamlValue = string | number | boolean | YamlValue[] | { [key: string]: YamlValue };

export type SpliceResult = { ok: true; splice: TextSplice } | { ok: false; reason: string };

const INDENT_STEP = "  ";
const PLAIN_SAFE = /^[A-Za-z_][A-Za-z0-9_ ./-]*$/;
const PLAIN_RESERVED = /^(?:true|false|yes|no|on|off|null|~|y|n)$/i;

/**
 * Renders a scalar the way a person would type it: bare when unambiguous,
 * otherwise as a JSON string literal — which is always valid YAML and needs
 * no YAML-specific escaping rules.
 */
export function formatScalar(value: string | number | boolean): string {
  if (typeof value !== "string") {
    return String(value);
  }
  if (PLAIN_SAFE.test(value) && !PLAIN_RESERVED.test(value) && value.trim() === value && !value.includes(" #")) {
    return value;
  }
  return JSON.stringify(value);
}

function isRecord(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === "object" && !Array.isArray(value);
}

/** One-line flow rendering: `{ type: string, enum: [a, b] }`. */
export function formatFlow(value: YamlValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(formatFlow).join(", ")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return entries.length === 0 ? "{}" : `{ ${entries.map(([k, v]) => `${k}: ${formatFlow(v)}`).join(", ")} }`;
  }
  return formatScalar(value);
}

/**
 * Block rendering of one `key: value` entry at `indent`. Maps whose values
 * are all scalars or small collections stay on one line per key; leaf maps
 * (e.g. a property's `{ type: string }`) are written in flow style, matching
 * the bundled samples.
 */
function formatBlockEntry(key: string, value: YamlValue, indent: string): string[] {
  if (!isRecord(value) || Object.values(value).every((v) => !isRecord(v) && !Array.isArray(v))) {
    return [`${indent}${key}: ${formatFlow(value)}`];
  }
  return [`${indent}${key}:`, ...Object.entries(value).flatMap(([k, v]) => formatBlockEntry(k, v, indent + INDENT_STEP))];
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf("\n", offset - 1) + 1;
}

function lineEnd(text: string, offset: number): number {
  const index = text.indexOf("\n", offset);
  return index === -1 ? text.length : index;
}

function columnOf(text: string, offset: number): number {
  return offset - lineStart(text, offset);
}

function keyIndentOfPair(text: string, document: Document, parent: Node | null, key: string): string | undefined {
  const pair = pairAt(document, parent, key);
  const start = (pair?.key as Node | undefined)?.range?.[0];
  return start === undefined ? undefined : " ".repeat(columnOf(text, start));
}

/**
 * Adds `key: value` to the mapping at `mapPath`, creating missing parent
 * mappings on the way. The new text follows the surrounding style: a block
 * map gets a new line at the indentation of its existing keys, a flow map
 * gets `, key: value` before its closing brace.
 */
export function insertEntry(text: string, document: Document, mapPath: YamlPath, key: string, value: YamlValue): SpliceResult {
  const target = nodeAt(document, mapPath);

  if (target === undefined) {
    if (mapPath.length === 0) {
      return { ok: false, reason: "The document has no top-level mapping to add to." };
    }
    const parentPath = mapPath.slice(0, -1);
    const missingKey = mapPath[mapPath.length - 1];
    if (typeof missingKey !== "string") {
      return { ok: false, reason: "Cannot create a list item here." };
    }
    return insertEntry(text, document, parentPath, missingKey, { [key]: value });
  }

  // `key:` with no value (or an explicit null) — the mapping does not exist yet.
  if (target === null || (isScalar(target) && target.value === null)) {
    const parent = nodeAt(document, mapPath.slice(0, -1));
    const parentKey = mapPath[mapPath.length - 1];
    if (typeof parentKey !== "string" || !parent) {
      return { ok: false, reason: "Cannot add an entry here." };
    }
    const pair = pairAt(document, parent, parentKey);
    const keyNode = pair?.key as Node | undefined;
    const indent = keyIndentOfPair(text, document, parent, parentKey);
    if (!keyNode?.range || indent === undefined) {
      return { ok: false, reason: "Cannot locate the mapping to add to." };
    }
    if (isScalar(target) && target.range && target.range[1] > target.range[0]) {
      return { ok: true, splice: { start: target.range[0], end: target.range[1], newText: formatFlow({ [key]: value }) } };
    }
    const at = lineEnd(text, keyNode.range[1]);
    const lines = formatBlockEntry(key, value, indent + INDENT_STEP);
    return { ok: true, splice: { start: at, end: at, newText: `\n${lines.join("\n")}` } };
  }

  if (!isMap(target)) {
    return { ok: false, reason: `Expected a mapping at ${mapPath.join(".") || "the top level"}.` };
  }
  const map = target as YAMLMap<unknown, unknown>;
  if (pairAt(document, map, key)) {
    return { ok: false, reason: `"${key}" already exists.` };
  }
  const range = map.range;
  if (!range) {
    return { ok: false, reason: "Cannot locate the mapping to add to." };
  }

  if (map.flow) {
    const close = text.lastIndexOf("}", range[1]);
    if (close < range[0]) {
      return { ok: false, reason: "Cannot locate the end of the inline mapping." };
    }
    const entry = `${key}: ${formatFlow(value)}`;
    const before = text.slice(range[0] + 1, close);
    if (before.trim() === "") {
      return { ok: true, splice: { start: range[0], end: close + 1, newText: `{ ${entry} }` } };
    }
    const insertAt = range[0] + 1 + before.trimEnd().length;
    return { ok: true, splice: { start: insertAt, end: insertAt, newText: `, ${entry}` } };
  }

  const firstKey = map.items[0]?.key as Node | undefined;
  const indent = firstKey?.range ? " ".repeat(columnOf(text, firstKey.range[0])) : "";
  const lines = formatBlockEntry(key, value, indent).join("\n");
  const end = range[1];
  const atLineStart = end === 0 || text[end - 1] === "\n";
  return {
    ok: true,
    splice: atLineStart ? { start: end, end, newText: `${lines}\n` } : { start: end, end, newText: `\n${lines}` },
  };
}

/** Replaces the scalar at `path`, or adds it to its parent mapping when absent. */
export function setScalar(text: string, document: Document, path: YamlPath, value: string | number | boolean): SpliceResult {
  const node = nodeAt(document, path);
  if (node === undefined || node === null) {
    const key = path[path.length - 1];
    if (typeof key !== "string") {
      return { ok: false, reason: "Cannot set a list item." };
    }
    return insertEntry(text, document, path.slice(0, -1), key, value);
  }
  if (!isScalar(node) || !node.range) {
    return { ok: false, reason: `${path.join(".")} is not a single value.` };
  }
  if (node.value === null && node.range[1] === node.range[0]) {
    const key = path[path.length - 1];
    const parent = nodeAt(document, path.slice(0, -1));
    const keyNode = typeof key === "string" ? (pairAt(document, parent ?? null, key)?.key as Node | undefined) : undefined;
    if (!keyNode?.range) {
      return { ok: false, reason: "Cannot locate the value to set." };
    }
    const at = keyNode.range[1] + 1; // just after the ':'
    return { ok: true, splice: { start: at, end: at, newText: ` ${formatScalar(value)}` } };
  }
  return { ok: true, splice: { start: node.range[0], end: node.range[1], newText: formatScalar(value) } };
}

/** Removes `key` (and its whole value) from the mapping at `mapPath`. */
export function removeEntry(text: string, document: Document, mapPath: YamlPath, key: string): SpliceResult {
  const map = nodeAt(document, mapPath);
  if (!isMap(map)) {
    return { ok: false, reason: `Nothing to remove at ${mapPath.join(".")}.` };
  }
  const index = map.items.findIndex((pair) => isScalar(pair.key) && String(pair.key.value) === key);
  if (index === -1) {
    return { ok: false, reason: `"${key}" does not exist.` };
  }
  const pair = map.items[index];
  const keyRange = (pair.key as Node).range;
  const valueRange = (pair.value as Node | null)?.range;
  if (!keyRange) {
    return { ok: false, reason: "Cannot locate the entry to remove." };
  }
  const valueEnd = valueRange ? valueRange[1] : keyRange[1];

  if (map.flow) {
    const next = map.items[index + 1]?.key as Node | undefined;
    const previous = map.items[index - 1]?.value as Node | null | undefined;
    if (next?.range) {
      return { ok: true, splice: { start: keyRange[0], end: next.range[0], newText: "" } };
    }
    if (previous?.range) {
      return { ok: true, splice: { start: previous.range[1], end: valueEnd, newText: "" } };
    }
    return { ok: true, splice: { start: keyRange[0], end: valueEnd, newText: "" } };
  }

  const start = lineStart(text, keyRange[0]);
  const fullEnd = valueRange ? valueRange[2] : keyRange[2];
  const end = fullEnd > 0 && text[fullEnd - 1] === "\n" ? fullEnd : Math.min(text.length, lineEnd(text, fullEnd) + 1);
  // Removing the last entry leaves `parent:` with an empty value, which the
  // reader treats as an empty mapping — still a valid document.
  return { ok: true, splice: { start, end, newText: "" } };
}

export function applySplice(text: string, splice: TextSplice): string {
  return text.slice(0, splice.start) + splice.newText + text.slice(splice.end);
}
