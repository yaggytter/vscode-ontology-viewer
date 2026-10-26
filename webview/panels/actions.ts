import { h, clear } from "../dom";
import type { UiStrings } from "../../src/shared/messages";
import type { ActionView } from "../../src/objectOntology/actionView";

export interface ActionsPanelCallbacks {
  /** Fired when the user selects (or deselects, with `undefined`) an action. */
  onSelect: (action: ActionView | undefined) => void;
  onRevealInSource: (actionId: string) => void;
  onExportTools: () => void;
}

export interface ActionsPanel {
  element: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  isVisible: () => boolean;
  /** Re-renders the list, keeping the selection if the action still exists. */
  update: (actions: readonly ActionView[]) => void;
}

function section(title: string, items: readonly string[]): HTMLElement | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return h("div", {
    className: "action-section",
    children: [
      h("h5", { className: "action-section-title", text: title }),
      h("ul", { className: "action-section-list", children: items.map((item) => h("li", { text: item })) }),
    ],
  });
}

/**
 * Renders one action's details. Everything shown comes from the document and
 * goes through `h()`/textContent — never markup (see webview/dom.ts).
 */
export function renderActionDetails(action: ActionView, strings: UiStrings): HTMLDivElement {
  const parameters = action.parameters.map(
    (p) => `${p.name}: ${p.objectTypeName ?? p.type}${p.required ? ` (${strings.actionRequiredLabel})` : ""}${p.description ? ` — ${p.description}` : ""}`,
  );
  return h("div", {
    className: "action-details",
    children: [
      ...(action.description ? [h("p", { className: "action-description", text: action.description })] : []),
      ...[
        section(strings.actionParametersLabel, parameters),
        section(strings.actionRulesLabel, action.rules),
        section(strings.actionValidationsLabel, action.validations),
        section(strings.actionSideEffectsLabel, action.sideEffects),
      ].filter((el): el is HTMLElement => el !== undefined),
    ],
  });
}

export function createActionsPanel(strings: UiStrings, callbacks: ActionsPanelCallbacks): ActionsPanel {
  const list = h("div", { className: "actions-list" });
  const element = h("div", {
    className: "sparql-panel actions-panel",
    attrs: { role: "region", "aria-label": strings.actionsPanelTitle },
    children: [
      h("div", {
        className: "sparql-panel-header",
        children: [
          h("h3", { className: "sparql-panel-title", text: strings.actionsPanelTitle }),
          h("button", {
            className: "toolbar-btn",
            text: strings.actionExportToolsLabel,
            onClick: () => callbacks.onExportTools(),
          }),
        ],
      }),
      h("p", { className: "actions-hint", text: strings.actionsHint }),
      list,
    ],
  });
  element.hidden = true;

  let actions: readonly ActionView[] = [];
  let selectedId: string | undefined;

  const render = (): void => {
    clear(list);
    if (actions.length === 0) {
      list.appendChild(h("p", { className: "sparql-empty", text: strings.actionsEmpty }));
      return;
    }
    for (const action of actions) {
      const selected = action.id === selectedId;
      const item = h("div", { className: `action-item${selected ? " selected" : ""}` });
      const header = h("button", {
        className: "action-item-header",
        attrs: { type: "button", "aria-expanded": String(selected) },
        children: [
          h("span", { className: "action-item-icon", text: "⚡", attrs: { "aria-hidden": "true" } }),
          h("span", { className: "action-item-name", text: action.name }),
          h("code", { className: "action-item-api", text: action.apiName }),
        ],
        onClick: () => {
          selectedId = selected ? undefined : action.id;
          render();
          callbacks.onSelect(actions.find((a) => a.id === selectedId));
        },
      });
      item.appendChild(header);
      if (selected) {
        item.appendChild(renderActionDetails(action, strings));
        item.appendChild(
          h("button", {
            className: "inspector-reveal-btn-small",
            text: strings.revealInSource,
            onClick: () => callbacks.onRevealInSource(action.id),
          }),
        );
      }
      list.appendChild(item);
    }
  };

  return {
    element,
    setVisible: (visible) => {
      element.hidden = !visible;
    },
    isVisible: () => !element.hidden,
    update: (next) => {
      actions = next;
      if (selectedId && !actions.some((a) => a.id === selectedId)) {
        selectedId = undefined;
        callbacks.onSelect(undefined);
      }
      render();
    },
  };
}
