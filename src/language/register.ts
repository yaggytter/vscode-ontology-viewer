import * as vscode from "vscode";
import { ALL_ONTOLOGY_LANGUAGES, EDITABLE_LANGUAGES } from "../util/languages";

/**
 * Wires up DocumentSymbolProvider / Hover / CompletionItem / Diagnostics /
 * RenameProvider (Phase 5). Split into its own lazily-imported module so
 * activation stays fast even before these providers are needed.
 */
export function registerLanguageFeatures(context: vscode.ExtensionContext): void {
  const selectors: vscode.DocumentSelector = ALL_ONTOLOGY_LANGUAGES.map((language) => ({ language }));
  // Renaming needs the write-back position index, which only Turtle has.
  const editableSelectors: vscode.DocumentSelector = EDITABLE_LANGUAGES.map((language) => ({ language }));

  Promise.all([
    import("./symbols"),
    import("./hover"),
    import("./completion"),
    import("./diagnostics"),
    import("./rename"),
  ]).then(([symbols, hover, completion, diagnostics, rename]) => {
    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(selectors, symbols.provider),
      vscode.languages.registerHoverProvider(selectors, hover.provider),
      vscode.languages.registerCompletionItemProvider(selectors, completion.provider, ":"),
      diagnostics.register(context),
      vscode.languages.registerRenameProvider(editableSelectors, rename.provider),
    );
  });
}
