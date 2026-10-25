import type { ObjectOntology, OoRule } from "./model";
import { actionAffectedTypes } from "./model";
import { actionTypeIri, typeIri } from "./iris";

/**
 * What the webview's Actions panel needs to show one action type. Plain
 * data only (it crosses the postMessage boundary), with every reference to
 * an object type already resolved to its diagram node id.
 */
export interface ActionParameterView {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  objectTypeId?: string;
  objectTypeName?: string;
}

export interface ActionView {
  id: string;
  apiName: string;
  name: string;
  description?: string;
  parameters: ActionParameterView[];
  /** One human-readable line per logic rule, e.g. "modifyObject Order · sets status". */
  rules: string[];
  validations: string[];
  sideEffects: string[];
  affectedTypeIds: string[];
}

function describeRule(rule: OoRule): string {
  const target = rule.objectType ?? rule.linkType ?? "";
  const sets = Object.keys(rule.set);
  const ends = rule.from || rule.to ? ` (${rule.from ?? "?"} → ${rule.to ?? "?"})` : "";
  return `${rule.op} ${target}${ends}${sets.length > 0 ? ` · sets ${sets.join(", ")}` : ""}`.trim();
}

export function buildActionViews(ontology: ObjectOntology): ActionView[] {
  const ns = ontology.namespace;
  const nameOf = (apiName: string): string | undefined => {
    const type = ontology.objectTypes.find((t) => t.apiName === apiName) ?? ontology.interfaces.find((i) => i.apiName === apiName);
    return type ? type.displayName ?? type.apiName : undefined;
  };
  return ontology.actionTypes.map((action) => ({
    id: actionTypeIri(ns, action.apiName),
    apiName: action.apiName,
    name: action.displayName ?? action.apiName,
    description: action.description,
    parameters: action.parameters.map((p) => ({
      id: p.id,
      name: p.displayName ?? p.id,
      type: `${p.type === "objectRef" ? p.objectType ?? "objectRef" : p.type}${p.isArray ? "[]" : ""}`,
      required: p.required,
      description: p.description,
      objectTypeId: p.objectType && nameOf(p.objectType) ? typeIri(ns, p.objectType) : undefined,
      objectTypeName: p.objectType ? nameOf(p.objectType) : undefined,
    })),
    rules: action.rules.map(describeRule),
    validations: action.validations.map((v) => (v.expr ? `${v.description} (${v.expr})` : v.description)),
    sideEffects: action.sideEffects,
    affectedTypeIds: actionAffectedTypes(ontology, action).map((name) => typeIri(ns, name)),
  }));
}
