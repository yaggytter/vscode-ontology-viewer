import * as vscode from "vscode";
import { detectDocumentObjectOntology } from "../objectOntology/detectDocument";
import { keyRangeAt, pathForElement } from "../objectOntology/locate";
import { parseObjectOntology } from "../objectOntology/parse";

/**
 * Source range of the declaration a diagram node id names in an Object
 * Ontology document (`Vehicle:`, `plate:`, `shipmentVehicle:` …), or
 * undefined for any other document or an id with no declaration.
 */
export function locateObjectOntologyElement(document: vscode.TextDocument, nodeId: string): vscode.Range | undefined {
  if (!detectDocumentObjectOntology(document)) {
    return undefined;
  }
  const parsed = parseObjectOntology(document.getText());
  if (!parsed.ontology) {
    return undefined;
  }
  const path = pathForElement(parsed.document, parsed.ontology.namespace, nodeId);
  const range = path ? keyRangeAt(parsed.document, path) : undefined;
  return range ? new vscode.Range(document.positionAt(range.start), document.positionAt(range.end)) : undefined;
}
