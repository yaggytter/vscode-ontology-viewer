import * as vscode from "vscode";
import { SPARQL_SAMPLE_QUERIES } from "../sparql/sampleQueries";
import type { SparqlSample } from "../shared/messages";

/**
 * Localized labels for each sample query, keyed by the id declared in
 * src/sparql/sampleQueries.ts. Kept here (not beside the query text) so every
 * `vscode.l10n.t` call stays a literal that `vscode-l10n-dev export` can
 * statically extract — a dynamically assembled key would silently vanish from
 * the translation bundles.
 */
function labelFor(id: string): { name: string; description: string } | undefined {
  switch (id) {
    case "first-triples":
      return {
        name: vscode.l10n.t("1. Show me anything (first 20 triples)"),
        description: vscode.l10n.t(
          "The simplest possible query: every subject-predicate-object statement, capped at 20 rows.",
        ),
      };
    case "all-classes":
      return {
        name: vscode.l10n.t("2. List all classes"),
        description: vscode.l10n.t("Finds every owl:Class. OPTIONAL means a class without a label is still listed."),
      };
    case "instances-by-class":
      return {
        name: vscode.l10n.t("3. List instances and their class"),
        description: vscode.l10n.t(
          "Individuals rather than schema. The FILTERs drop OWL/RDFS bookkeeping types so only your own classes remain.",
        ),
      };
    case "count-per-class":
      return {
        name: vscode.l10n.t("4. Count instances per class"),
        description: vscode.l10n.t(
          "Introduces aggregation: GROUP BY collapses rows per class and COUNT tallies them.",
        ),
      };
    case "class-hierarchy":
      return {
        name: vscode.l10n.t("5. Show the class hierarchy"),
        description: vscode.l10n.t("Every subclass-to-superclass link in the document."),
      };
    case "relations":
      return {
        name: vscode.l10n.t("6. List relations with domain and range"),
        description: vscode.l10n.t("Object properties and the classes they connect, where the document states them."),
      };
    case "search-labels":
      return {
        name: vscode.l10n.t("7. Search labels for a word"),
        description: vscode.l10n.t("Text search with FILTER and CONTAINS. Replace the \"a\" with the word you want."),
      };
    case "ask-has-classes":
      return {
        name: vscode.l10n.t("8. Ask a yes/no question"),
        description: vscode.l10n.t(
          "ASK returns true or false instead of rows — here, whether the document declares any class at all.",
        ),
      };
    case "construct-links":
      return {
        name: vscode.l10n.t("9. Build a resource-only graph (CONSTRUCT)"),
        description: vscode.l10n.t(
          "CONSTRUCT returns triples instead of a table. This one keeps only links between resources, dropping literal values.",
        ),
      };
    default:
      return undefined;
  }
}

/**
 * The sample queries with localized labels attached, ready to send to the
 * webview in the `init` message. A query whose id has no label entry is
 * dropped rather than shown untranslated, so the picker can never present a
 * blank option.
 */
export function sparqlSampleQueries(): SparqlSample[] {
  const samples: SparqlSample[] = [];
  for (const { id, query } of SPARQL_SAMPLE_QUERIES) {
    const label = labelFor(id);
    if (label) {
      samples.push({ id, name: label.name, description: label.description, query });
    }
  }
  return samples;
}
