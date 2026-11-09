import type { ObjectRecord } from "./ontology.ts";

/**
 * Preconditions are written in the ontology as a sentence for the model
 * (`description`) and a hint for the implementer (`expr`). The extension
 * never evaluates `expr`; the server that runs the tool has to. Each
 * ontology gets a module in ./guards/ that implements its checks, keyed by
 * the exact `expr` text (or the description when a validation has none).
 *
 * A validation with no implementation makes its action fail closed: the
 * server refuses to run it rather than skip a rule it does not understand.
 */

export interface CheckContext {
  /** The tool call's arguments. */
  args: Record<string, unknown>;
  /** The object an `objectRef` parameter points to. */
  ref(parameterId: string): ObjectRecord;
  /** Primary keys reached from an `objectRef` parameter through a link side, e.g. `linked("vehicle", "depot")`. */
  linked(parameterId: string, sideName: string): string[];
  /** The objects reached through a link side, e.g. `linkedObjects("ticket", "refunds")`. */
  linkedObjects(parameterId: string, sideName: string): ObjectRecord[];
  /** The server's clock (fixed by `now` in workspace.json, so the scenario stays reproducible). */
  now: Date;
}

export type Check = (context: CheckContext) => boolean;

/** `expr` (or description) -> implementation. */
export type Checks = Record<string, Check>;

export function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

export function daysSince(date: unknown, now: Date): number {
  return (now.getTime() - new Date(String(date)).getTime()) / 86_400_000;
}
