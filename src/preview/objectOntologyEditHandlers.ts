import * as vscode from "vscode";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../shared/messages";
import {
  planAddLinkType,
  planAddObjectType,
  planAddProperty,
  planDeleteElement,
  planSetDescription,
  planSetDisplayName,
  planSetPropertyType,
  type EditPlan,
} from "../objectOntology/edit/operations";
import { detectDocumentObjectOntology } from "../objectOntology/detectDocument";

type EditMessage = Extract<
  WebviewToHostMessage,
  { type: "editLabel" | "editComment" | "addClass" | "addRelation" | "addProperty" | "updatePropertyType" | "deleteDeclaration" }
>;

export function isObjectOntologyEditMessage(message: WebviewToHostMessage): message is EditMessage {
  return [
    "editLabel",
    "editComment",
    "addClass",
    "addRelation",
    "addProperty",
    "updatePropertyType",
    "deleteDeclaration",
  ].includes(message.type);
}

function plan(text: string, message: EditMessage): EditPlan {
  switch (message.type) {
    case "editLabel":
      return planSetDisplayName(text, message.nodeId, message.newLabel);
    case "editComment":
      return planSetDescription(text, message.subjectIri, message.newComment);
    case "addClass":
      return planAddObjectType(text, message.name, message.description);
    case "addRelation":
      return planAddLinkType(text, message.sourceIri, message.targetIri, message.name);
    case "addProperty":
      return planAddProperty(text, message.entityIri, message.name, message.propertyType);
    case "updatePropertyType":
      return planSetPropertyType(text, message.propertyIri, message.propertyType);
    case "deleteDeclaration":
      return planDeleteElement(text, message.iri);
  }
}

/**
 * Applies a diagram edit to an Object Ontology YAML document. Same contract
 * as the Turtle handlers in ./editHandlers.ts: plan + verify against the
 * proposed text, apply one WorkspaceEdit, always answer with `editResult`,
 * and return whether the caller should push a fresh model.
 */
export async function handleObjectOntologyEdit(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  message: EditMessage,
): Promise<boolean> {
  const post = (result: HostToWebviewMessage): Thenable<boolean> => panel.webview.postMessage(result);
  const requestId = message.requestId;

  if (detectDocumentObjectOntology(document) !== "yaml") {
    await post({
      type: "editResult",
      requestId,
      ok: false,
      message: vscode.l10n.t("Object Ontology JSON is view-only in the diagram. Convert it to YAML to edit."),
    });
    return false;
  }

  const result = plan(document.getText(), message);
  if (!result.ok) {
    await post({ type: "editResult", requestId, ok: false, message: result.reason });
    return false;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(result.splice.start), document.positionAt(result.splice.end)),
    result.splice.newText,
  );
  if (!(await vscode.workspace.applyEdit(edit))) {
    await post({ type: "editResult", requestId, ok: false, message: vscode.l10n.t("VS Code rejected the edit.") });
    return false;
  }
  await post({ type: "editResult", requestId, ok: true, newIri: result.newIri });
  return true;
}
