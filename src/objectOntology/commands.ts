import * as vscode from "vscode";
import { stringify } from "yaml";
import { detectObjectOntology } from "./detect";
import { parseObjectOntology } from "./parse";
import type { ObjectOntology } from "./model";
import { buildAgentTools } from "./export/agentTools";
import { buildContextSummary } from "./export/contextSummary";
import { objectOntologyToTurtle } from "./export/turtle";

/**
 * Command implementations for Object Ontology documents. Every export opens
 * its result as a new *untitled* document rather than writing a file: the
 * user reviews it, then saves or copies it wherever their agent setup needs
 * it. Nothing is ever sent anywhere — the extension makes no network calls.
 */

async function targetDocument(uri: vscode.Uri | undefined): Promise<vscode.TextDocument | undefined> {
  const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
  if (!document || !detectObjectOntology(document.fileName, document.languageId, document.getText())) {
    void vscode.window.showWarningMessage(vscode.l10n.t("Open an Object Ontology file (*.oont.yaml) first."));
    return undefined;
  }
  return document;
}

async function loadOntology(uri: vscode.Uri | undefined): Promise<ObjectOntology | undefined> {
  const document = await targetDocument(uri);
  if (!document) {
    return undefined;
  }
  const parsed = parseObjectOntology(document.getText());
  const syntaxError = parsed.document.errors[0];
  if (!parsed.ontology || syntaxError) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t("Could not read the ontology: {0}", syntaxError?.message.split("\n")[0] ?? parsed.diagnostics[0]?.message ?? ""),
    );
    return undefined;
  }
  const errorCount = parsed.diagnostics.filter((d) => d.severity === "error").length;
  if (errorCount > 0) {
    void vscode.window.showWarningMessage(
      vscode.l10n.t("The ontology has {0} problems (see the Problems panel); the export may be incomplete.", String(errorCount)),
    );
  }
  return parsed.ontology;
}

async function showUntitled(language: string, content: string, message: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language, content });
  await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
  void vscode.window.showInformationMessage(message);
}

export async function exportAgentTools(uri?: vscode.Uri): Promise<void> {
  const ontology = await loadOntology(uri);
  if (!ontology) {
    return;
  }
  const tools = buildAgentTools(ontology);
  if (tools.tools.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t("This ontology declares no action types to export."));
    return;
  }
  await showUntitled(
    "json",
    `${JSON.stringify(tools, null, 2)}\n`,
    vscode.l10n.t("Exported {0} action types as agent tool definitions (MCP / function-calling JSON Schema).", String(tools.tools.length)),
  );
}

export async function exportContextSummary(uri?: vscode.Uri): Promise<void> {
  const ontology = await loadOntology(uri);
  if (!ontology) {
    return;
  }
  await showUntitled(
    "markdown",
    buildContextSummary(ontology),
    vscode.l10n.t("Exported an LLM context summary. Paste it into a system prompt, project knowledge or CLAUDE.md."),
  );
}

export async function exportTurtle(uri?: vscode.Uri): Promise<void> {
  const ontology = await loadOntology(uri);
  if (!ontology) {
    return;
  }
  await showUntitled(
    "turtle",
    await objectOntologyToTurtle(ontology),
    vscode.l10n.t("Exported the ontology as Turtle (OWL + oont: vocabulary)."),
  );
}

export async function convertToYaml(uri?: vscode.Uri): Promise<void> {
  const document = await targetDocument(uri);
  if (!document) {
    return;
  }
  if (detectObjectOntology(document.fileName, document.languageId, document.getText()) === "yaml") {
    void vscode.window.showInformationMessage(vscode.l10n.t("This file is already YAML."));
    return;
  }
  let data: unknown;
  try {
    data = JSON.parse(document.getText());
  } catch (error) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t("Could not convert: {0}", error instanceof Error ? error.message : String(error)),
    );
    return;
  }
  await showUntitled(
    "yaml",
    stringify(data, { lineWidth: 0 }),
    vscode.l10n.t("Converted to YAML in a new untitled file. Save it as *.oont.yaml to edit it from the diagram."),
  );
}
