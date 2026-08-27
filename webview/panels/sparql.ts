import { h, clear } from "../dom";
import type { UiStrings } from "../../src/shared/messages";
import type { SparqlResult, SparqlTerm } from "../../src/sparql/resultModel";
import type { SparqlGraphMode } from "../graph/sparqlHighlight";

export interface SparqlPanel {
  element: HTMLDivElement;
  /** Show/hide the whole panel (toolbar toggle). */
  setVisible: (visible: boolean) => void;
  isVisible: () => boolean;
  /** Reflect the "running" state while a query is in flight. */
  setBusy: (busy: boolean) => void;
  /** Render a successful result. */
  showResult: (result: SparqlResult) => void;
  /** Render a query/parse error. */
  showError: (message: string) => void;
  /** The current graph-effect mode (highlight/filter/off). */
  getMode: () => SparqlGraphMode;
  focusInput: () => void;
}

export interface SparqlPanelCallbacks {
  /** Fired when the user runs a query. */
  onRun: (query: string) => void;
  /** Fired when the graph-effect mode changes (to re-apply to the last result). */
  onModeChange: (mode: SparqlGraphMode) => void;
}

/** Displays one term as text — the lexical value, that is what the user queried on. */
function termText(term: SparqlTerm): string {
  return term.value;
}

/**
 * Builds a DOM subtree presenting a SPARQL result as text. Kept separate from
 * the panel wiring so it can be unit-tested. Every value comes from untrusted
 * ontology content and is written via `textContent` (through `h`), never
 * `innerHTML` — see webview/dom.ts.
 */
export function renderSparqlResultTable(result: SparqlResult, strings: UiStrings): HTMLDivElement {
  const container = h("div", { className: "sparql-result-body" });

  if (result.kind === "boolean") {
    container.appendChild(
      h("p", {
        className: "sparql-ask-result",
        text: result.value ? strings.sparqlAskResultTrue : strings.sparqlAskResultFalse,
      }),
    );
    return container;
  }

  if (result.kind === "quads") {
    if (result.triples.length === 0) {
      container.appendChild(h("p", { className: "sparql-empty", text: strings.sparqlNoResults }));
      return container;
    }
    container.appendChild(h("h4", { className: "sparql-result-heading", text: strings.sparqlConstructHeading }));
    const table = h("table", { className: "sparql-table" });
    const thead = h("thead");
    thead.appendChild(
      h("tr", {
        children: ["subject", "predicate", "object"].map((c) => h("th", { text: c })),
      }),
    );
    table.appendChild(thead);
    const tbody = h("tbody");
    for (const triple of result.triples) {
      tbody.appendChild(
        h("tr", {
          children: [triple.subject, triple.predicate, triple.object].map((t) =>
            h("td", { text: termText(t), attrs: { title: termText(t) } }),
          ),
        }),
      );
    }
    table.appendChild(tbody);
    container.appendChild(table);
    return container;
  }

  // bindings (SELECT)
  container.appendChild(
    h("p", {
      className: "sparql-result-count",
      text: strings.sparqlResultCount.replace("{0}", String(result.rows.length)),
    }),
  );
  if (result.rows.length === 0) {
    container.appendChild(h("p", { className: "sparql-empty", text: strings.sparqlNoResults }));
    return container;
  }

  const table = h("table", { className: "sparql-table" });
  const thead = h("thead");
  thead.appendChild(h("tr", { children: result.variables.map((v) => h("th", { text: v })) }));
  table.appendChild(thead);
  const tbody = h("tbody");
  for (const row of result.rows) {
    tbody.appendChild(
      h("tr", {
        children: result.variables.map((variable) => {
          const term = row[variable];
          // An unbound (OPTIONAL) cell shows nothing rather than "undefined".
          const value = term ? termText(term) : "";
          const cellClass = term ? `sparql-cell sparql-cell-${term.termKind.toLowerCase()}` : "sparql-cell sparql-cell-unbound";
          return h("td", { className: cellClass, text: value, attrs: value ? { title: value } : {} });
        }),
      }),
    );
  }
  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

/**
 * The SPARQL query workbench: a textarea, Run/Clear buttons, a graph-effect
 * mode selector, and a results region. It owns no RDF logic — it posts the
 * query text out via `onRun` and renders whatever result the host returns.
 */
export function createSparqlPanel(strings: UiStrings, callbacks: SparqlPanelCallbacks): SparqlPanel {
  let visible = false;
  let mode: SparqlGraphMode = "highlight";

  const element = h("div", { className: "sparql-panel", attrs: { role: "region", "aria-label": strings.sparqlPanelTitle } });
  element.hidden = true;

  const header = h("div", { className: "sparql-panel-header" });
  header.appendChild(h("h3", { className: "sparql-panel-title", text: strings.sparqlPanelTitle }));

  const modeWrap = h("div", { className: "sparql-mode" });
  modeWrap.appendChild(h("label", { className: "sparql-mode-label", text: strings.sparqlModeLabel, attrs: { for: "sparql-mode-select" } }));
  const modeSelect = h("select", { className: "sparql-mode-select", attrs: { id: "sparql-mode-select" } });
  const modeOptions: Array<[SparqlGraphMode, string]> = [
    ["highlight", strings.sparqlModeHighlight],
    ["filter", strings.sparqlModeFilter],
    ["off", strings.sparqlModeOff],
  ];
  for (const [value, label] of modeOptions) {
    modeSelect.appendChild(h("option", { text: label, attrs: { value } }));
  }
  modeSelect.value = mode;
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value as SparqlGraphMode;
    callbacks.onModeChange(mode);
  });
  modeWrap.appendChild(modeSelect);
  header.appendChild(modeWrap);
  element.appendChild(header);

  const input = h("textarea", {
    className: "sparql-input",
    attrs: {
      rows: "4",
      spellcheck: "false",
      placeholder: strings.sparqlQueryPlaceholder,
      "aria-label": strings.sparqlPanelTitle,
    },
  });
  element.appendChild(input);

  const actions = h("div", { className: "sparql-actions" });
  const runButton = h("button", {
    className: "toolbar-btn toolbar-btn-primary sparql-run-btn",
    text: strings.sparqlRunLabel,
    attrs: { type: "button" },
  });
  const clearButton = h("button", {
    className: "toolbar-btn sparql-clear-btn",
    text: strings.sparqlClearLabel,
    attrs: { type: "button" },
  });
  actions.append(runButton, clearButton);
  element.appendChild(actions);

  const resultRegion = h("div", { className: "sparql-result", attrs: { "aria-live": "polite" } });
  element.appendChild(resultRegion);

  const run = () => {
    const query = input.value.trim();
    if (query) {
      callbacks.onRun(query);
    }
  };

  runButton.addEventListener("click", run);
  input.addEventListener("keydown", (event) => {
    // Ctrl/Cmd+Enter runs the query — a plain Enter must keep inserting
    // newlines so multi-line queries stay editable.
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });
  clearButton.addEventListener("click", () => {
    input.value = "";
    clear(resultRegion);
    callbacks.onModeChange("off");
    input.focus();
  });

  return {
    element,
    setVisible: (next) => {
      visible = next;
      element.hidden = !next;
    },
    isVisible: () => visible,
    setBusy: (busy) => {
      runButton.disabled = busy;
      runButton.textContent = busy ? strings.sparqlRunningLabel : strings.sparqlRunLabel;
    },
    showResult: (result) => {
      clear(resultRegion);
      resultRegion.appendChild(renderSparqlResultTable(result, strings));
    },
    showError: (message) => {
      clear(resultRegion);
      resultRegion.appendChild(h("p", { className: "sparql-error", text: message }));
    },
    getMode: () => mode,
    focusInput: () => input.focus(),
  };
}
