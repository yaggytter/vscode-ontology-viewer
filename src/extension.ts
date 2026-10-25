import * as vscode from "vscode";
import { ALL_ONTOLOGY_LANGUAGES, EDITABLE_LANGUAGES } from "./util/languages";
import { detectObjectOntology } from "./objectOntology/detect";

/**
 * `ontologyViewer.isObjectOntology` covers what a `resourceFilename` when-clause
 * cannot: an untitled YAML document (e.g. a freshly opened sample) whose first
 * key is `objectOntology`.
 */
function updateObjectOntologyContext(editor: vscode.TextEditor | undefined): void {
  const document = editor?.document;
  const isObjectOntology =
    document !== undefined && detectObjectOntology(document.fileName, document.languageId, document.getText()) !== undefined;
  void vscode.commands.executeCommand("setContext", "ontologyViewer.isObjectOntology", isObjectOntology);
}

export function activate(context: vscode.ExtensionContext): void {
  // Drives the `editorLangId in ontologyViewer.viewableLanguages` / `...editableLanguages`
  // `when`-clause guards used by package.json (commands, menus, keybinding).
  void vscode.commands.executeCommand("setContext", "ontologyViewer.viewableLanguages", ALL_ONTOLOGY_LANGUAGES);
  void vscode.commands.executeCommand("setContext", "ontologyViewer.editableLanguages", EDITABLE_LANGUAGES);
  void vscode.commands.executeCommand(
    "setContext",
    "ontologyViewer.viewOnlyLanguages",
    ALL_ONTOLOGY_LANGUAGES.filter((id) => !(EDITABLE_LANGUAGES as readonly string[]).includes(id)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ontologyViewer.openPreview", async () => {
      const { openPreview } = await import("./preview/previewPanel");
      await openPreview(context, vscode.window.activeTextEditor?.document);
    }),
    vscode.commands.registerCommand("ontologyViewer.convertToTurtle", async () => {
      const { convertActiveDocumentToTurtle } = await import("./edit/convertToTurtle");
      await convertActiveDocumentToTurtle();
    }),
    vscode.commands.registerCommand("ontologyViewer.exportLayout", async () => {
      const { exportActiveLayout } = await import("./preview/layoutStore");
      await exportActiveLayout(context);
    }),
    vscode.commands.registerCommand("ontologyViewer.newSample", async () => {
      const { createSampleOntology } = await import("./util/samples");
      await createSampleOntology(context.extensionUri);
    }),
    vscode.commands.registerCommand("ontologyViewer.exportAgentTools", async (uri?: vscode.Uri) => {
      const { exportAgentTools } = await import("./objectOntology/commands");
      await exportAgentTools(uri instanceof vscode.Uri ? uri : undefined);
    }),
    vscode.commands.registerCommand("ontologyViewer.exportContextSummary", async (uri?: vscode.Uri) => {
      const { exportContextSummary } = await import("./objectOntology/commands");
      await exportContextSummary(uri instanceof vscode.Uri ? uri : undefined);
    }),
    vscode.commands.registerCommand("ontologyViewer.exportObjectOntologyTurtle", async (uri?: vscode.Uri) => {
      const { exportTurtle } = await import("./objectOntology/commands");
      await exportTurtle(uri instanceof vscode.Uri ? uri : undefined);
    }),
    vscode.commands.registerCommand("ontologyViewer.convertObjectOntologyToYaml", async (uri?: vscode.Uri) => {
      const { convertToYaml } = await import("./objectOntology/commands");
      await convertToYaml(uri instanceof vscode.Uri ? uri : undefined);
    }),
    vscode.window.onDidChangeActiveTextEditor(updateObjectOntologyContext),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        updateObjectOntologyContext(vscode.window.activeTextEditor);
      }
    }),
  );
  updateObjectOntologyContext(vscode.window.activeTextEditor);

  registerLanguageFeatures(context);
}

function registerLanguageFeatures(context: vscode.ExtensionContext): void {
  // Deferred to keep activation fast; modules are only imported when a
  // matching document is actually opened. See src/language/*.
  import("./language/register").then((mod) => mod.registerLanguageFeatures(context));
}

export function deactivate(): void {
  // No-op: all disposables are owned by context.subscriptions.
}
