import * as vscode from "vscode";
import { ALL_ONTOLOGY_LANGUAGES, EDITABLE_LANGUAGES } from "./util/languages";

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
  );

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
