import type { Quad } from "n3";
import { findOverrideLiteral } from "./opExtensions";

// 48 rather than 16: relational coloring (see assignRelationalColorIndices)
// spends its resolution on distinguishing "close" pairs of entities by a
// couple of slots' hue difference, which only reads as intentional with a
// finer-grained wheel than 16 (22.5° apart) allows.
export const COLOR_PALETTE_SIZE = 48;

export interface RelationalColorEdge {
  source: string;
  target: string;
}

export interface RelationalAppearance {
  colorIndex: number;
  /** Deterministic, one-based connected-component number. */
  groupIndex: number;
  groupCount: number;
  groupSize: number;
}

/**
 * Assigns each entity a position on the hue wheel derived from graph
 * structure rather than a per-name hash, so that color carries a second
 * signal beyond "distinct from its neighbors" — a rough visual cue for how
 * related two entities are:
 *
 *   1. Split entities into connected components (via relations/subClassOf/
 *      skosBroader edges — anything that becomes a `SchemaRelation`).
 *   2. Give each component its own base hue, spread evenly around the full
 *      wheel — unrelated parts of the graph end up as different colors.
 *   3. Within a component, spread members across an arc (capped at 1/3 of
 *      the wheel, ~120°) in DFS order — wide enough that entities in a
 *      typical single-component file (most schema diagrams are one
 *      component) are still individually distinguishable rather than all
 *      reading as the same shade, but narrow enough that the component
 *      still looks like a family rather than a rainbow. Directly-linked
 *      entities (visited next to each other by DFS) get closer hues than
 *      entities many hops apart in the same component.
 *
 * The arc-width cap in step 3 is the crux: without it, a single large
 * connected component (the common case — most schema diagrams are one
 * component, e.g. a class hierarchy hanging off one root) would spread its
 * members across the *entire* wheel just like the old per-name hash did,
 * which produces a rainbow with no visible grouping at all.
 *
 * The traversal within a component is DFS, not BFS: DFS descends one
 * branch fully before moving to the next, so an entire subtree (e.g. a
 * chain of `rdfs:subClassOf` descendants) is visited — and thus colored —
 * as one contiguous run. BFS would instead interleave every class at a
 * given depth regardless of which branch it's in.
 *
 * Deterministic: component and traversal order depend only on the entity
 * id set and the edge list, both already stable outputs of parsing the
 * same document text.
 */
export function assignRelationalAppearance(
  entityIds: readonly string[],
  edges: readonly RelationalColorEdge[],
  paletteSize: number = COLOR_PALETTE_SIZE,
): Map<string, RelationalAppearance> {
  const adjacency = new Map<string, string[]>();
  for (const id of entityIds) {
    adjacency.set(id, []);
  }
  for (const { source, target } of edges) {
    if (source === target || !adjacency.has(source) || !adjacency.has(target)) {
      continue;
    }
    adjacency.get(source)!.push(target);
    adjacency.get(target)!.push(source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  function collectComponent(start: string): string[] {
    const stack = [start];
    const members: string[] = [];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) {
        continue;
      }
      visited.add(node);
      members.push(node);
      // Sorted + reversed so that, given the stack is LIFO, neighbors get
      // pushed and popped in ascending sorted order — a second axis of
      // determinism beyond "some valid DFS order".
      const neighbors = [...new Set(adjacency.get(node))].sort().reverse();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
    return members;
  }

  for (const id of [...entityIds].sort()) {
    if (!visited.has(id)) {
      components.push(collectComponent(id));
    }
  }

  const appearanceById = new Map<string, RelationalAppearance>();
  if (components.length === 0) {
    return appearanceById;
  }

  const perComponentSlots = paletteSize / components.length;
  const maxArcSlots = paletteSize / 3;
  const arcSlots = Math.min(perComponentSlots * 0.6, maxArcSlots);

  components.forEach((members, componentIndex) => {
    const base = componentIndex * perComponentSlots;
    members.forEach((id, memberIndex) => {
      const offset = members.length > 1 ? (memberIndex / (members.length - 1)) * arcSlots : 0;
      appearanceById.set(id, {
        colorIndex: Math.round(base + offset) % paletteSize,
        groupIndex: componentIndex + 1,
        groupCount: components.length,
        groupSize: members.length,
      });
    });
  });

  return appearanceById;
}

export function assignRelationalColorIndices(
  entityIds: readonly string[],
  edges: readonly RelationalColorEdge[],
  paletteSize: number = COLOR_PALETTE_SIZE,
): Map<string, number> {
  return new Map(
    [...assignRelationalAppearance(entityIds, edges, paletteSize)].map(([id, appearance]) => [id, appearance.colorIndex]),
  );
}

/**
 * Ordered specific -> general so e.g. `CheeseTopping` matches "cheese"
 * before it can fall through to the generic "food" bucket.
 */
const ICON_RULES: { tokens: string[]; icon: string }[] = [
  { tokens: ["pizza"], icon: "🍕" },
  { tokens: ["cheese"], icon: "🧀" },
  { tokens: ["vegetable", "veggie", "plant"], icon: "🥬" },
  { tokens: ["meat"], icon: "🥩" },
  { tokens: ["food", "meal", "dish", "topping", "ingredient", "recipe"], icon: "🍽️" },
  { tokens: ["person", "people", "human", "agent", "user", "member", "customer"], icon: "👤" },
  { tokens: ["organization", "org", "company", "institution", "department", "team"], icon: "🏢" },
  { tokens: ["place", "location", "city", "country", "region", "address", "site"], icon: "📍" },
  { tokens: ["author", "writer", "creator"], icon: "✍️" },
  { tokens: ["book", "publication", "library", "catalog"], icon: "📚" },
  { tokens: ["document", "doc", "file", "report", "paper", "article"], icon: "📄" },
  { tokens: ["event", "meeting", "conference", "session"], icon: "📅" },
  { tokens: ["time", "date", "period", "interval", "duration"], icon: "🕐" },
  { tokens: ["money", "price", "cost", "payment", "invoice", "order"], icon: "💰" },
  { tokens: ["vehicle", "car", "truck", "ship", "aircraft", "train"], icon: "🚗" },
  { tokens: ["device", "sensor", "machine", "equipment", "asset", "component"], icon: "⚙️" },
  { tokens: ["project", "task", "activity", "process", "workflow", "step"], icon: "📋" },
  { tokens: ["system", "service", "application", "software", "platform"], icon: "💻" },
  { tokens: ["network", "graph", "link", "connection"], icon: "🔗" },
  { tokens: ["message", "email", "mail", "note", "comment"], icon: "✉️" },
  { tokens: ["role", "position", "job", "title"], icon: "🎖️" },
  { tokens: ["concept", "category", "type", "taxonomy", "scheme", "term"], icon: "🏷️" },
  { tokens: ["measurement", "metric", "unit", "quantity", "value"], icon: "📏" },
  { tokens: ["health", "patient", "medical", "disease", "treatment"], icon: "🏥" },
  { tokens: ["law", "policy", "rule", "regulation", "contract", "license"], icon: "⚖️" },
  { tokens: ["education", "course", "student", "teacher", "school", "lesson"], icon: "🎓" },
  { tokens: ["animal", "species", "organism"], icon: "🐾" },
  { tokens: ["energy", "power", "electricity"], icon: "⚡" },
  { tokens: ["store", "shop"], icon: "🏪" },
  { tokens: ["supplier", "shipment", "delivery"], icon: "📦" },
];

export const DEFAULT_CLASS_ICON = "📦";
export const DEFAULT_SKOS_ICON = "🏷️";
export const DEFAULT_INFERRED_ICON = "⬜";

/** Splits camelCase/`_`/`-`/digits into lowercase tokens for keyword matching. */
function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Matches whole tokens, never substrings — `Classification` tokenizes to
 * `["classification"]` and must not match the "class" keyword the way a
 * naive `.includes("class")` would.
 */
export function iconFor(candidateNames: string[], fallback: string): string {
  const tokens = new Set(candidateNames.flatMap(tokenize));
  for (const rule of ICON_RULES) {
    if (rule.tokens.some((t) => tokens.has(t))) {
      return rule.icon;
    }
  }
  return fallback;
}

const ICON_OVERRIDE_LOCAL_NAMES = ["icon", "emoji"];
const COLOR_OVERRIDE_LOCAL_NAMES = ["color", "colour", "fillColor"];

/**
 * A 1-4 code-point, non-ASCII value — guards against a document using an
 * unrelated `icon` predicate that happens to hold a URL or plain word.
 */
function looksLikeIcon(value: string): boolean {
  const codePoints = [...value];
  if (codePoints.length < 1 || codePoints.length > 4) {
    return false;
  }
  return !/[ -]/.test(value);
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Validates strictly as a security boundary, not a formatting nicety: this
 * value ultimately flows into a cytoscape stylesheet and from there into
 * canvas draw calls, so anything that isn't a plain hex color must be
 * rejected rather than passed through.
 */
function looksLikeColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

export function iconOverrideFor(quads: Quad[], subjectIri: string): string | undefined {
  const value = findOverrideLiteral(quads, subjectIri, ICON_OVERRIDE_LOCAL_NAMES);
  return value !== undefined && looksLikeIcon(value) ? value : undefined;
}

export function colorOverrideFor(quads: Quad[], subjectIri: string): string | undefined {
  const value = findOverrideLiteral(quads, subjectIri, COLOR_OVERRIDE_LOCAL_NAMES);
  return value !== undefined && looksLikeColor(value) ? value.trim() : undefined;
}
