import * as vscode from "vscode";
import { runSparqlQuery } from "../sparql/engine";
import { resolveMatchedResources } from "../sparql/resourceResolution";
import type { HostToWebviewMessage } from "../shared/messages";
import { documentQuads } from "./documentModel";

/**
 * Executes a SPARQL query for the webview and posts back a `sparqlResult`.
 *
 * Like the edit handlers, this re-parses the current document text on demand
 * rather than relying on a cached quad set — the source may have changed
 * since the last diagram refresh, and re-parsing guarantees the query runs
 * against exactly what the user sees in the editor. Parse errors and query
 * errors are both surfaced as a failed result with a user-facing message
 * (never a silent failure — see the coding-style error-handling rule).
 */
export async function handleRunSparql(
  panel: vscode.WebviewPanel,
  document: vscode.TextDocument,
  requestId: string,
  query: string,
): Promise<void> {
  const post = (message: HostToWebviewMessage): Thenable<boolean> => panel.webview.postMessage(message);

  const trimmed = query.trim();
  if (!trimmed) {
    await post({
      type: "sparqlResult",
      requestId,
      ok: false,
      errorMessage: vscode.l10n.t("Enter a SPARQL query to run."),
    });
    return;
  }

  const quads = await documentQuads(document);
  if (!quads) {
    await post({
      type: "sparqlResult",
      requestId,
      ok: false,
      errorMessage: vscode.l10n.t("This file is not a recognized ontology format."),
    });
    return;
  }

  try {
    const result = await runSparqlQuery(quads, trimmed);
    const { iris, types } = resolveMatchedResources(quads, result);
    await post({
      type: "sparqlResult",
      requestId,
      ok: true,
      result,
      highlightIris: iris,
      highlightTypeFallback: types,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await post({
      type: "sparqlResult",
      requestId,
      ok: false,
      errorMessage: vscode.l10n.t("Query failed: {0}", detail),
    });
  }
}
