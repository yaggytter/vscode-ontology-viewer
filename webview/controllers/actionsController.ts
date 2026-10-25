import type cytoscape from "cytoscape";
import type { UiStrings, WebviewToHostMessage } from "../../src/shared/messages";
import type { ActionView } from "../../src/objectOntology/actionView";
import { createActionsPanel, type ActionsPanel } from "../panels/actions";

export interface ActionsControllerDeps {
  toggleButton: HTMLButtonElement;
  mount: HTMLElement;
  getCy: () => cytoscape.Core | undefined;
  post: (message: WebviewToHostMessage) => void;
  /** Called when the panel opens, so a competing overlay (the SPARQL panel) can close. */
  onOpen: () => void;
}

export interface ActionsController {
  /** Builds the panel; `enabled` is false for RDF documents, which have no actions. */
  install: (strings: UiStrings, enabled: boolean) => void;
  update: (actions: readonly ActionView[]) => void;
  /** Re-applies the highlight after a full element rebuild (which drops classes). */
  reapply: () => void;
  close: () => void;
}

const HIGHLIGHT_CLASS = "action-target";

/**
 * Owns the Actions panel (Object Ontology documents only) and its one graph
 * effect: outlining the object types the selected action touches. Uses its
 * own cytoscape class so it never fights the SPARQL highlight or the shared
 * dim pass over who owns `sparql-match` / `dimmed`.
 */
export function createActionsController(deps: ActionsControllerDeps): ActionsController {
  let panel: ActionsPanel | undefined;
  let selected: ActionView | undefined;

  const reapply = (): void => {
    const cy = deps.getCy();
    if (!cy) {
      return;
    }
    cy.nodes().removeClass(HIGHLIGHT_CLASS);
    // The highlight belongs to the open panel: closing it clears the outline
    // (the selection is kept, so reopening restores it).
    const visibleSelection = panel?.isVisible() ? selected : undefined;
    for (const id of visibleSelection?.affectedTypeIds ?? []) {
      cy.getElementById(id).addClass(HIGHLIGHT_CLASS);
    }
  };

  const setVisible = (visible: boolean): void => {
    if (!panel) {
      return;
    }
    panel.setVisible(visible);
    deps.toggleButton.setAttribute("aria-pressed", String(visible));
    reapply();
    if (visible) {
      deps.onOpen();
    }
  };

  deps.toggleButton.addEventListener("click", () => setVisible(!(panel?.isVisible() ?? false)));

  return {
    install: (strings, enabled) => {
      deps.toggleButton.hidden = !enabled;
      deps.toggleButton.textContent = strings.actionsToggleLabel;
      deps.toggleButton.setAttribute("aria-label", strings.actionsPanelTitle);
      deps.toggleButton.setAttribute("aria-pressed", "false");
      selected = undefined;
      if (!enabled) {
        panel = undefined;
        deps.mount.replaceChildren();
        reapply();
        return;
      }
      panel = createActionsPanel(strings, {
        onSelect: (action) => {
          selected = action;
          reapply();
        },
        onRevealInSource: (actionId) => deps.post({ type: "jumpToNode", nodeId: actionId }),
        onExportTools: () => deps.post({ type: "exportAgentTools" }),
      });
      deps.mount.replaceChildren(panel.element);
    },
    update: (actions) => {
      panel?.update(actions);
    },
    reapply,
    close: () => setVisible(false),
  };
}
