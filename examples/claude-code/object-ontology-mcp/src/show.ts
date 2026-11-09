import { resolve } from "node:path";
import { loadOntology } from "./ontology.ts";
import { describeObject, loadStore } from "./store.ts";
import { openWorkspace } from "./workspace.ts";

/**
 * `npm run show -- delivery`                  the audit log and the outbox
 * `npm run show -- delivery Shipment S-5001`  one object, with its links
 */
const [dir = ".", type, id] = process.argv.slice(2);
const workspace = openWorkspace(resolve(dir));
const ontology = loadOntology(workspace.ontologyPath);
const store = loadStore(workspace.statePath, ontology);

if (type && id) {
  console.log(JSON.stringify(describeObject(ontology, store, type, id) ?? `There is no ${type} "${id}".`, null, 2));
} else {
  console.log("Log:");
  for (const entry of store.log) {
    console.log(`  ${entry.outcome.padEnd(8)} ${entry.action} ${JSON.stringify(entry.arguments)}`);
    for (const detail of entry.details) {
      console.log(`           - ${detail}`);
    }
  }
  console.log("Outbox (simulated side effects):");
  for (const entry of store.outbox) {
    console.log(`  ${entry.action}: ${entry.sideEffect}`);
  }
}
