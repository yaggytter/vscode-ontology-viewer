import type { ObjectOntology, OoActionType, OoParameter, OoPropertyType } from "../model";

/**
 * Converts action types into tool definitions an LLM agent can call.
 *
 * The output follows the shape shared by MCP's `tools/list` and most
 * function-calling APIs — `name`, `description`, and a JSON Schema
 * `inputSchema` — so it can be pasted into an MCP server, an Anthropic /
 * OpenAI tool list, or an agent framework with little or no glue. The
 * ontology is the single source of truth: parameter types, required flags,
 * enums and validation rules all come from the action definition, which is
 * exactly what keeps an agent's writes inside the guard rails the ontology
 * declares.
 */
export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: string[];
  format?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface AgentToolsDocument {
  /** Where the definitions came from — lets a reader trace a tool back to its ontology. */
  source: { ontology: string; format: "object-ontology/1" };
  tools: AgentToolDefinition[];
}

function scalarSchema(type: OoPropertyType): JsonSchema {
  switch (type) {
    case "integer":
      return { type: "integer" };
    case "decimal":
    case "double":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "date":
      return { type: "string", format: "date" };
    case "timestamp":
      return { type: "string", format: "date-time" };
    case "geopoint":
      return { type: "string", description: "Latitude,longitude" };
    case "string":
      return { type: "string" };
  }
}

function parameterSchema(ontology: ObjectOntology, parameter: OoParameter): JsonSchema {
  let schema: JsonSchema;
  if (parameter.type === "objectRef") {
    const target = ontology.objectTypes.find((t) => t.apiName === parameter.objectType);
    const keyType = target?.properties.find((p) => p.apiName === target.primaryKey)?.type ?? "string";
    schema = {
      ...scalarSchema(keyType),
      description: `Primary key (${target?.primaryKey ?? "id"}) of the ${parameter.objectType ?? "object"}`,
    };
  } else {
    schema = scalarSchema(parameter.type);
  }
  if (parameter.enumValues && parameter.enumValues.length > 0) {
    schema = { ...schema, enum: parameter.enumValues };
  }
  const description = [parameter.displayName, parameter.description, schema.description].filter(Boolean).join(" — ");
  if (description) {
    schema = { ...schema, description };
  }
  return parameter.isArray ? { type: "array", items: schema, description: schema.description } : schema;
}

function describeAction(ontology: ObjectOntology, action: OoActionType): string {
  const lines = [action.displayName ?? action.apiName];
  if (action.description) {
    lines.push(action.description);
  }
  const effects = action.rules.map((rule) => {
    if (rule.op === "createLink" || rule.op === "deleteLink") {
      const link = ontology.linkTypes.find((l) => l.apiName === rule.linkType);
      const ends = link ? ` (${link.from.objectType} → ${link.to.objectType})` : "";
      return `${rule.op} ${rule.linkType ?? ""}${ends}`;
    }
    const sets = Object.keys(rule.set);
    return `${rule.op} ${rule.objectType ?? ""}${sets.length ? ` setting ${sets.join(", ")}` : ""}`;
  });
  if (effects.length > 0) {
    lines.push(`Effects: ${effects.join("; ")}.`);
  }
  if (action.validations.length > 0) {
    lines.push(`Preconditions (the call is rejected otherwise): ${action.validations.map((v) => v.description).join(" ")}`);
  }
  if (action.sideEffects.length > 0) {
    lines.push(`Side effects: ${action.sideEffects.join(" ")}`);
  }
  return lines.join("\n");
}

/** Tool names must be safe identifiers for every major tool-calling API. */
function toolName(apiName: string): string {
  return apiName.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

export function buildAgentTools(ontology: ObjectOntology): AgentToolsDocument {
  return {
    source: { ontology: ontology.name, format: "object-ontology/1" },
    tools: ontology.actionTypes.map((action) => {
      const properties: Record<string, JsonSchema> = {};
      for (const parameter of action.parameters) {
        properties[parameter.id] = parameterSchema(ontology, parameter);
      }
      return {
        name: toolName(action.apiName),
        description: describeAction(ontology, action),
        inputSchema: {
          type: "object",
          properties,
          required: action.parameters.filter((p) => p.required).map((p) => p.id),
          additionalProperties: false,
        },
      };
    }),
  };
}
