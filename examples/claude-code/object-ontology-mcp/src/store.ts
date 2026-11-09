import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { LinkSide, LinkType, ObjectRecord, Ontology } from "./ontology.ts";

/**
 * The example's "database": a JSON file seeded from the ontology's example
 * objects. Every action the agent runs is written here, together with an
 * audit log and an outbox of simulated side effects (emails, route updates),
 * so you can open the file and see exactly what changed.
 */

export interface LogEntry {
  at: string;
  action: string;
  arguments: Record<string, unknown>;
  outcome: "applied" | "rejected";
  details: string[];
}

export interface OutboxEntry {
  at: string;
  action: string;
  arguments: Record<string, unknown>;
  sideEffect: string;
}

export interface Store {
  /** Object type -> primary key -> record. */
  objects: Record<string, Record<string, ObjectRecord>>;
  log: LogEntry[];
  outbox: OutboxEntry[];
}

export function seedStore(ontology: Ontology): Store {
  const objects: Store["objects"] = {};
  for (const [type, records] of Object.entries(ontology.objects)) {
    const primaryKey = ontology.objectTypes.get(type)?.primaryKey;
    if (!primaryKey) {
      continue;
    }
    objects[type] = Object.fromEntries(records.map((record) => [String(record[primaryKey]), { ...record }]));
  }
  return { objects, log: [], outbox: [] };
}

export function loadStore(path: string, ontology: Ontology): Store {
  if (!existsSync(path)) {
    const seeded = seedStore(ontology);
    saveStore(path, seeded);
    return seeded;
  }
  return JSON.parse(readFileSync(path, "utf8")) as Store;
}

export function saveStore(path: string, store: Store): void {
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

export function getObject(store: Store, type: string, id: string): ObjectRecord | undefined {
  return store.objects[type]?.[id];
}

/** Where a link is stored: on the `from` object, under its foreign-key property or its side name. */
export function linkField(link: LinkType): string {
  return link.foreignKey ?? link.from.name;
}

function idsIn(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/** Every link side an object type can be followed through, keyed by side name. */
export function linkSidesOf(ontology: Ontology, type: string): Map<string, { link: LinkType; side: LinkSide; isFrom: boolean }> {
  const sides = new Map<string, { link: LinkType; side: LinkSide; isFrom: boolean }>();
  for (const link of ontology.linkTypes) {
    if (link.from.objectType === type) {
      sides.set(link.from.name, { link, side: link.from, isFrom: true });
    }
    if (link.to.objectType === type) {
      sides.set(link.to.name, { link, side: link.to, isFrom: false });
    }
  }
  return sides;
}

/** Primary keys of the objects reached from `type`/`id` through the link side `sideName`. */
export function followLink(ontology: Ontology, store: Store, type: string, id: string, sideName: string): string[] {
  const entry = linkSidesOf(ontology, type).get(sideName);
  if (!entry) {
    return [];
  }
  const { link, isFrom } = entry;
  if (isFrom) {
    return idsIn(getObject(store, type, id)?.[linkField(link)]);
  }
  const owners = store.objects[link.from.objectType] ?? {};
  return Object.entries(owners)
    .filter(([, record]) => idsIn(record[linkField(link)]).includes(id))
    .map(([ownerId]) => ownerId);
}

/** An object's own fields plus every link resolved to primary keys, for the `get_object` read tool. */
export function describeObject(ontology: Ontology, store: Store, type: string, id: string): Record<string, unknown> | undefined {
  const record = getObject(store, type, id);
  if (!record) {
    return undefined;
  }
  const links: Record<string, string | string[] | null> = {};
  for (const [name, { side }] of linkSidesOf(ontology, type)) {
    const ids = followLink(ontology, store, type, id, name);
    // A side's cardinality says how many objects of the *other* side it reaches.
    links[name] = side.cardinality === "one" ? (ids[0] ?? null) : ids;
  }
  return { objectType: type, ...record, links };
}
