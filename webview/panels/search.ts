import { h } from "../dom";
import { setSearchQuery } from "../graph/focus";
import { searchSchema, type SchemaSearchResult } from "../searchModel";
import type { SchemaModel } from "../../src/rdf/schemaModel";
import type { UiStrings } from "../../src/shared/messages";

export interface SearchPanel {
  element: HTMLDivElement;
  input: HTMLInputElement;
  close: () => void;
  setValue: (value: string) => void;
  updateSchema: (schema: SchemaModel) => void;
}

interface SearchPanelCallbacks {
  onQueryChange: () => void;
  onSelect: (result: SchemaSearchResult) => void;
}

function kindLabel(strings: UiStrings, result: SchemaSearchResult): string {
  if (result.kind === "entity") {
    return strings.legendClass;
  }
  if (result.kind === "relation") {
    return strings.legendRelation;
  }
  return strings.propertiesLabel;
}

/**
 * Search is an actual navigator rather than a dim-only filter: results cover
 * classes, relations, and properties, support keyboard selection, and retain
 * the graph's existing live filtering while the user types.
 */
export function createSearchPanel(strings: UiStrings, callbacks: SearchPanelCallbacks): SearchPanel {
  let schema: SchemaModel = { entities: [], relations: [], unattachedProperties: [], isEmpty: true };
  let activeIndex = -1;
  let results: SchemaSearchResult[] = [];

  const element = h("div", { className: "search-shell" });
  element.appendChild(h("span", { className: "search-icon", text: "⌕", attrs: { "aria-hidden": "true" } }));
  const input = h("input", {
    className: "search-input",
    attrs: {
      type: "search",
      placeholder: strings.searchPlaceholder,
      "aria-label": strings.searchPlaceholder,
      autocomplete: "off",
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-controls": "search-results",
    },
  });
  const clearButton = h("button", {
    className: "search-clear",
    text: "×",
    attrs: { type: "button", "aria-label": strings.clearSearchLabel, title: strings.clearSearchLabel },
  });
  const resultsElement = h("div", {
    className: "search-results",
    attrs: { id: "search-results", role: "listbox" },
  });
  resultsElement.hidden = true;

  const close = () => {
    resultsElement.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  };

  const selectResult = (result: SchemaSearchResult) => {
    input.value = result.label;
    // Node-label filtering is meaningful for entity results. A property or
    // relation label does not live on a node, so keeping it as the active
    // dim filter would fade the entire graph just as the result is selected.
    setSearchQuery(result.kind === "entity" ? result.label : "");
    callbacks.onQueryChange();
    callbacks.onSelect(result);
    close();
  };

  const renderResults = () => {
    results = searchSchema(schema, input.value, 8, {
      propertiesLabel: strings.propertiesLabel,
      instancesLabel: strings.instancesLabel,
    });
    resultsElement.replaceChildren();
    activeIndex = results.length > 0 ? 0 : -1;
    clearButton.hidden = input.value.length === 0;

    if (!input.value.trim()) {
      close();
      return;
    }

    if (results.length === 0) {
      resultsElement.appendChild(h("div", { className: "search-empty", text: strings.noSearchResultsLabel }));
    } else {
      results.forEach((result, index) => {
        const optionId = `search-result-${index}`;
        const option = h("button", {
          className: `search-result${index === activeIndex ? " active" : ""}`,
          attrs: { id: optionId, type: "button", role: "option", "aria-selected": String(index === activeIndex) },
          onClick: () => selectResult(result),
          children: [
            h("span", { className: `search-result-kind kind-${result.kind}`, text: kindLabel(strings, result) }),
            h("span", {
              className: "search-result-copy",
              children: [
                h("strong", { className: "search-result-label", text: result.label }),
                h("span", { className: "search-result-meta", text: result.meta }),
              ],
            }),
          ],
        });
        resultsElement.appendChild(option);
      });
      input.setAttribute("aria-activedescendant", `search-result-${activeIndex}`);
    }
    resultsElement.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const updateActiveResult = (nextIndex: number) => {
    if (results.length === 0) {
      return;
    }
    activeIndex = (nextIndex + results.length) % results.length;
    const options = resultsElement.querySelectorAll<HTMLButtonElement>(".search-result");
    options.forEach((option, index) => {
      option.classList.toggle("active", index === activeIndex);
      option.setAttribute("aria-selected", String(index === activeIndex));
    });
    input.setAttribute("aria-activedescendant", `search-result-${activeIndex}`);
  };

  input.addEventListener("input", () => {
    setSearchQuery(input.value);
    callbacks.onQueryChange();
    renderResults();
  });
  input.addEventListener("focus", renderResults);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateActiveResult(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      updateActiveResult(activeIndex - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    } else if (event.key === "Escape") {
      close();
      input.select();
    }
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    setSearchQuery("");
    callbacks.onQueryChange();
    close();
    input.focus();
  });
  element.addEventListener("focusout", (event) => {
    if (!element.contains(event.relatedTarget as Node | null)) {
      close();
    }
  });

  element.append(input, clearButton, resultsElement);
  clearButton.hidden = true;

  return {
    element,
    input,
    close,
    setValue: (value) => {
      input.value = value;
      clearButton.hidden = value.length === 0;
      setSearchQuery(value);
      if (!value) {
        close();
      }
    },
    updateSchema: (nextSchema) => {
      schema = nextSchema;
      if (!resultsElement.hidden) {
        renderResults();
      }
    },
  };
}
