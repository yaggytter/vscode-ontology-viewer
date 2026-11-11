import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { openWorkspace } from "./workspace.ts";

/** `npm run reset -- delivery`: delete the state file; the next tool call re-seeds it from the ontology. */
const workspace = openWorkspace(resolve(process.argv[2] ?? "."));
rmSync(workspace.statePath, { force: true });
console.log(`Reset ${workspace.statePath}. It is re-created from the ontology's example objects on the next tool call.`);
