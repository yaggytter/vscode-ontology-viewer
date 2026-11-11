import { resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { executeAction } from "./actions.ts";
import { loadOntology } from "./ontology.ts";
import { describeObject, followLink, linkSidesOf, loadStore, saveStore } from "./store.ts";
import { loadChecks, openWorkspace, readExportedTools, type ExportedTool } from "./workspace.ts";

/**
 * An MCP server for one Object Ontology workspace.
 *
 * - Write tools are the action types, served exactly as the Ontology Viewer
 *   exported them (`tools/list` returns the exported `tools` array).
 * - Read tools are this server's own. The export only contains writes; an
 *   agent also needs to look things up before it acts.
 *
 * Usage: node --experimental-strip-types src/server.ts <workspace-dir>
 */

const READ_TOOLS: ExportedTool[] = [
  {
    name: "list_objects",
    description: "Read-only. List every object of one object type, with all of its properties.",
    inputSchema: {
      type: "object",
      properties: { objectType: { type: "string", description: "Object type API name, e.g. Shipment" } },
      required: ["objectType"],
      additionalProperties: false,
    },
  },
  {
    name: "get_object",
    description:
      "Read-only. Get one object by primary key: its properties, plus every link resolved to the primary keys it points to (in both directions).",
    inputSchema: {
      type: "object",
      properties: {
        objectType: { type: "string", description: "Object type API name, e.g. Vehicle" },
        id: { type: "string", description: "Primary key, e.g. V-101" },
      },
      required: ["objectType", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "follow_link",
    description:
      "Read-only. Follow one link from an object and return the objects on the other side, e.g. Depot D-01 -> vehicles.",
    inputSchema: {
      type: "object",
      properties: {
        objectType: { type: "string", description: "Object type API name of the starting object" },
        id: { type: "string", description: "Primary key of the starting object" },
        link: { type: "string", description: "Link name as it appears under `links` in get_object, e.g. vehicles" },
      },
      required: ["objectType", "id", "link"],
      additionalProperties: false,
    },
  },
];

const workspace = openWorkspace(resolve(process.argv[2] ?? "."));

function text(body: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text: body }], isError };
}

function readTool(name: string, args: Record<string, unknown>): CallToolResult {
  const ontology = loadOntology(workspace.ontologyPath);
  const store = loadStore(workspace.statePath, ontology);
  const type = String(args.objectType ?? "");
  if (!ontology.objectTypes.has(type)) {
    return text(`Unknown object type "${type}". Known types: ${[...ontology.objectTypes.keys()].join(", ")}.`, true);
  }
  if (name === "list_objects") {
    return text(JSON.stringify(Object.values(store.objects[type] ?? {}), null, 2));
  }
  const id = String(args.id ?? "");
  const object = describeObject(ontology, store, type, id);
  if (!object) {
    return text(`There is no ${type} "${id}".`, true);
  }
  if (name === "get_object") {
    return text(JSON.stringify(object, null, 2));
  }
  const link = String(args.link ?? "");
  const side = linkSidesOf(ontology, type).get(link);
  if (!side) {
    return text(`${type} has no link "${link}". Links: ${[...linkSidesOf(ontology, type).keys()].join(", ")}.`, true);
  }
  const otherType = side.isFrom ? side.link.to.objectType : side.link.from.objectType;
  const objects = followLink(ontology, store, type, id, link).map((otherId) => describeObject(ontology, store, otherType, otherId));
  return text(JSON.stringify(objects, null, 2));
}

async function writeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (!readExportedTools(workspace).some((tool) => tool.name === name)) {
    return text(`Unknown tool "${name}".`, true);
  }
  const ontology = loadOntology(workspace.ontologyPath);
  const store = loadStore(workspace.statePath, ontology);
  const checks = await loadChecks(workspace);
  const outcome = executeAction(ontology, checks, workspace.guardsFile, store, name, args, workspace.now());
  saveStore(workspace.statePath, outcome.store);
  return text(outcome.text, !outcome.applied);
}

const server = new Server({ name: "object-ontology-example", version: "0.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...READ_TOOLS, ...readExportedTools(workspace)],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    return READ_TOOLS.some((tool) => tool.name === name) ? readTool(name, args) : await writeTool(name, args);
  } catch (error) {
    return text(`Server error: ${error instanceof Error ? error.message : String(error)}`, true);
  }
});

await server.connect(new StdioServerTransport());
