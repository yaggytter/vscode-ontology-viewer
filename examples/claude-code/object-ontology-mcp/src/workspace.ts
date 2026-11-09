import { readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Checks } from "./guards.ts";

/**
 * A workspace is a folder you start Claude Code in (`delivery/`,
 * `support/`). Its `workspace.json` names the ontology, the tool
 * definitions exported from the Ontology Viewer, the guards module and the
 * state file. Everything is re-read on every tool call, so edits to the YAML,
 * the export or the guards take effect without restarting the server.
 */

export interface ExportedTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
}

export interface Workspace {
  dir: string;
  ontologyPath: string;
  toolsPath: string;
  statePath: string;
  guardsPath: string;
  /** The guards module as a path you can open from the example's root. */
  guardsFile: string;
  /** A fixed clock for the scenario, or the real one. */
  now(): Date;
}

const SRC_DIR = import.meta.dirname;
const GUARDS_NAME = /^[a-z0-9-]+$/;

interface WorkspaceFile {
  ontology: string;
  tools: string;
  guards: string;
  state?: string;
  now?: string;
}

export function openWorkspace(dir: string): Workspace {
  const absolute = resolve(dir);
  const config = JSON.parse(readFileSync(join(absolute, "workspace.json"), "utf8")) as WorkspaceFile;
  if (!GUARDS_NAME.test(config.guards)) {
    throw new Error(`workspace.json: "guards" must be a module name in src/guards/, got ${JSON.stringify(config.guards)}`);
  }
  const guardsPath = join(SRC_DIR, "guards", `${config.guards}.ts`);
  return {
    dir: absolute,
    ontologyPath: join(absolute, config.ontology),
    toolsPath: join(absolute, config.tools),
    statePath: join(absolute, config.state ?? "state.json"),
    guardsPath,
    guardsFile: relative(resolve(SRC_DIR, ".."), guardsPath),
    now: () => (config.now ? new Date(config.now) : new Date()),
  };
}

/** The `tools` array of the file exported by "Export Actions as AI Agent Tools". */
export function readExportedTools(workspace: Workspace): ExportedTool[] {
  const exported = JSON.parse(readFileSync(workspace.toolsPath, "utf8")) as { tools?: ExportedTool[] };
  return exported.tools ?? [];
}

/** Imports the guards module, bypassing the module cache when the file has changed. */
export async function loadChecks(workspace: Workspace): Promise<Checks> {
  const url = pathToFileURL(workspace.guardsPath);
  url.searchParams.set("v", String(statSync(workspace.guardsPath).mtimeMs));
  const module = (await import(url.href)) as { checks: Checks };
  return module.checks;
}
