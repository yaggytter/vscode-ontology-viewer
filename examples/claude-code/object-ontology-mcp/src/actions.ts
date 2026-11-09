import type { CheckContext, Checks } from "./guards.ts";
import type { ActionType, ObjectRecord, Ontology, Parameter, Rule } from "./ontology.ts";
import { followLink, getObject, linkField, linkSidesOf, type Store } from "./store.ts";

/**
 * Runs one action type the way the ontology declares it:
 *
 * 1. check the arguments against the parameters (required, type, enum, and
 *    that every object reference exists);
 * 2. check every precondition (see ./guards.ts) and report *all* that fail,
 *    so the agent can pick a better option in one step;
 * 3. apply the action's rules to a copy of the store, so a call is applied
 *    completely or not at all;
 * 4. record the call in the audit log and its side effects in the outbox.
 *
 * Rejections are part of the normal flow, not errors: they come back to the
 * agent as text it can read and act on.
 */

export interface ActionOutcome {
  applied: boolean;
  text: string;
  store: Store;
}

class RuleError extends Error {}

function show(value: unknown): string {
  return value === undefined ? "(none)" : JSON.stringify(value);
}

function callText(name: string, args: Record<string, unknown>): string {
  return `${name}(${Object.entries(args).map(([key, value]) => `${key}: ${show(value)}`).join(", ")})`;
}

function typeMatches(parameter: Parameter, value: unknown): boolean {
  switch (parameter.type) {
    case "integer":
      return Number.isInteger(value);
    case "decimal":
    case "double":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return typeof value === "string";
  }
}

function argumentProblems(ontology: Ontology, store: Store, action: ActionType, args: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const known = new Set(action.parameters.map((p) => p.id));
  for (const key of Object.keys(args)) {
    if (!known.has(key)) {
      problems.push(`Unknown argument "${key}".`);
    }
  }
  for (const parameter of action.parameters) {
    const value = args[parameter.id];
    if (value === undefined || value === null || value === "") {
      if (parameter.required) {
        problems.push(`Missing required argument "${parameter.id}".`);
      }
      continue;
    }
    if (!typeMatches(parameter, value)) {
      problems.push(`"${parameter.id}" must be of type ${parameter.type === "objectRef" ? "string" : parameter.type}.`);
      continue;
    }
    if (parameter.enumValues && !parameter.enumValues.includes(String(value))) {
      problems.push(`"${parameter.id}" must be one of: ${parameter.enumValues.join(", ")}.`);
    }
    if (parameter.type === "objectRef" && parameter.objectType && !getObject(store, parameter.objectType, String(value))) {
      problems.push(`There is no ${parameter.objectType} "${value}".`);
    }
    if (parameter.type === "objectRef" && parameter.objectType && !ontology.objectTypes.has(parameter.objectType)) {
      problems.push(`The ontology has no object type "${parameter.objectType}".`);
    }
  }
  return problems;
}

function checkContext(ontology: Ontology, store: Store, action: ActionType, args: Record<string, unknown>, now: Date): CheckContext {
  const typeOfParameter = (parameterId: string): string => {
    const parameter = action.parameters.find((p) => p.id === parameterId);
    if (!parameter?.objectType) {
      throw new Error(`"${parameterId}" is not an object reference of ${action.apiName}`);
    }
    return parameter.objectType;
  };
  const ref = (parameterId: string): ObjectRecord => {
    const record = getObject(store, typeOfParameter(parameterId), String(args[parameterId]));
    if (!record) {
      throw new Error(`no object for "${parameterId}"`);
    }
    return record;
  };
  const linked = (parameterId: string, sideName: string): string[] =>
    followLink(ontology, store, typeOfParameter(parameterId), String(args[parameterId]), sideName);
  const linkedObjects = (parameterId: string, sideName: string): ObjectRecord[] => {
    const entry = linkSidesOf(ontology, typeOfParameter(parameterId)).get(sideName);
    if (!entry) {
      throw new Error(`${typeOfParameter(parameterId)} has no link "${sideName}"`);
    }
    const otherType = entry.isFrom ? entry.link.to.objectType : entry.link.from.objectType;
    return linked(parameterId, sideName).flatMap((id): ObjectRecord[] => {
      const record = getObject(store, otherType, id);
      return record ? [record] : [];
    });
  };
  return { args, ref, linked, linkedObjects, now };
}

function failedPreconditions(checks: Checks, guardsFile: string, action: ActionType, context: CheckContext): string[] {
  const failures: string[] = [];
  for (const validation of action.validations) {
    const key = validation.expr ?? validation.description;
    const check = checks[key];
    if (!check) {
      failures.push(
        `${validation.description} (The server has no check for "${key}" yet, so it refuses the action instead of skipping the rule. Implement it in ${guardsFile}.)`,
      );
      continue;
    }
    let passed = false;
    try {
      passed = check(context);
    } catch (error) {
      failures.push(`${validation.description} (The check failed to run: ${error instanceof Error ? error.message : String(error)}.)`);
      continue;
    }
    if (!passed) {
      failures.push(validation.description);
    }
  }
  return failures;
}

function resolveValue(value: unknown, args: Record<string, unknown>): unknown {
  return typeof value === "string" && value.startsWith("$") ? args[value.slice(1)] : value;
}

function applyRule(ontology: Ontology, store: Store, rule: Rule, args: Record<string, unknown>, changes: string[]): void {
  if (rule.op === "createLink" || rule.op === "deleteLink") {
    const link = ontology.linkTypes.find((l) => l.apiName === rule.linkType);
    if (!link || !rule.from || !rule.to) {
      throw new RuleError(`The rule refers to an unknown link type "${rule.linkType}".`);
    }
    const fromId = String(args[rule.from]);
    const toId = String(args[rule.to]);
    const owner = getObject(store, link.from.objectType, fromId);
    if (!owner) {
      throw new RuleError(`There is no ${link.from.objectType} "${fromId}" to link from.`);
    }
    const field = linkField(link);
    const before = owner[field];
    if (link.from.cardinality === "one") {
      if (rule.op === "createLink") {
        owner[field] = toId;
      } else if (before === toId) {
        delete owner[field];
      } else {
        throw new RuleError(`${link.from.objectType} ${fromId} is not linked to ${toId} through ${link.apiName} (it is linked to ${show(before)}).`);
      }
    } else {
      const ids = Array.isArray(before) ? before.map(String) : [];
      if (rule.op === "createLink") {
        owner[field] = ids.includes(toId) ? ids : [...ids, toId];
      } else if (ids.includes(toId)) {
        owner[field] = ids.filter((id) => id !== toId);
      } else {
        throw new RuleError(`${link.from.objectType} ${fromId} is not linked to ${toId} through ${link.apiName}.`);
      }
    }
    changes.push(`${link.from.objectType} ${fromId}: ${link.from.name} ${show(before)} → ${show(owner[field])}`);
    return;
  }

  const type = rule.objectType ?? "";
  const objectType = ontology.objectTypes.get(type);
  if (!objectType) {
    throw new RuleError(`The rule refers to an unknown object type "${type}".`);
  }
  const table = (store.objects[type] ??= {});
  const values = Object.fromEntries(Object.entries(rule.set).map(([key, value]) => [key, resolveValue(value, args)]));

  if (rule.op === "createObject") {
    const id = String(values[objectType.primaryKey]);
    if (table[id]) {
      throw new RuleError(`${type} ${id} already exists.`);
    }
    table[id] = values;
    changes.push(`${type} ${id}: created ${show(values)}`);
    return;
  }

  const id = String(args[rule.object ?? ""]);
  const record = table[id];
  if (!record) {
    throw new RuleError(`There is no ${type} "${id}".`);
  }
  if (rule.op === "deleteObject") {
    delete table[id];
    changes.push(`${type} ${id}: deleted`);
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    changes.push(`${type} ${id}: ${key} ${show(record[key])} → ${show(value)}`);
    record[key] = value;
  }
}

export function executeAction(
  ontology: Ontology,
  checks: Checks,
  guardsFile: string,
  store: Store,
  name: string,
  args: Record<string, unknown>,
  now: Date,
): ActionOutcome {
  const at = now.toISOString();
  const reject = (reasons: string[]): ActionOutcome => {
    const next = structuredClone(store);
    next.log.push({ at, action: name, arguments: args, outcome: "rejected", details: reasons });
    return {
      applied: false,
      text: [`Rejected: ${callText(name, args)} was not applied.`, ...reasons.map((r) => `- ${r}`)].join("\n"),
      store: next,
    };
  };

  const action = ontology.actionTypes.get(name);
  if (!action) {
    return reject([`The ontology has no action type "${name}". Re-export the tools after renaming an action.`]);
  }
  const problems = argumentProblems(ontology, store, action, args);
  if (problems.length > 0) {
    return reject(problems);
  }
  const failures = failedPreconditions(checks, guardsFile, action, checkContext(ontology, store, action, args, now));
  if (failures.length > 0) {
    return reject(failures);
  }

  const next = structuredClone(store);
  const changes: string[] = [];
  try {
    for (const rule of action.rules) {
      applyRule(ontology, next, rule, args, changes);
    }
  } catch (error) {
    if (error instanceof RuleError) {
      return reject([error.message]);
    }
    throw error;
  }
  next.log.push({ at, action: name, arguments: args, outcome: "applied", details: changes });
  for (const sideEffect of action.sideEffects) {
    next.outbox.push({ at, action: name, arguments: args, sideEffect });
  }
  const lines = [`Applied: ${callText(name, args)}`, "Changes:", ...changes.map((c) => `- ${c}`)];
  if (action.sideEffects.length > 0) {
    lines.push("Side effects (simulated; recorded in the outbox of state.json):", ...action.sideEffects.map((s) => `- ${s}`));
  }
  return { applied: true, text: lines.join("\n"), store: next };
}
