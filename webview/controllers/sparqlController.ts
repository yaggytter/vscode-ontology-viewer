import type cytoscape from "cytoscape";
import type {
  HostToWebviewSparqlResult,
  SparqlSample,
  UiStrings,
  WebviewToHostMessage,
} from "../../src/shared/messages";
import { createSparqlPanel, type SparqlPanel } from "../panels/sparql";
import { applySparqlGraphEffect, type SparqlGraphEffect } from "../graph/sparqlHighlight";
import { applyDim } from "../graph/focus";

const NO_EFFECT: SparqlGraphEffect = { matchedIris: [], typeFallback: {} };

export interface SparqlControllerDeps {
  /** Toolbar button that shows/hides the panel. */
  toggleButton: HTMLButtonElement;
  /** Container the panel element is mounted into. */
  mount: HTMLElement;
  /** The live cytoscape instance, or undefined before the first render. */
  getCy: () => cytoscape.Core | undefined;
  post: (message: WebviewToHostMessage) => void;
  /** Allocates a unique id for an outgoing request. */
  nextRequestId: () => string;
}

export interface SparqlController {
  /** Builds (or rebuilds) the panel for a set of UI strings and examples. */
  install: (strings: UiStrings, samples: readonly SparqlSample[]) => void;
  /** Applies a `sparqlResult` reply from the host. */
  handleResult: (message: HostToWebviewSparqlResult) => void;
  /**
   * Re-applies the current graph effect and the shared dim pass. Must be
   * called after any full element rebuild, which drops cytoscape classes.
   */
  reapply: () => void;
}

/**
 * Owns everything about the SPARQL panel: its DOM, its visibility, the
 * in-flight request, and the last result's graph effect.
 *
 * This used to be a dozen loose variables and handlers threaded through
 * main.ts, which made every change to the feature touch unrelated code. The
 * controller keeps that state in one place and exposes only the three moments
 * main.ts genuinely participates in: chrome setup, an incoming reply, and a
 * graph rebuild.
 */
export function createSparqlController(deps: SparqlControllerDeps): SparqlController {
  let panel: SparqlPanel | undefined;
  /** requestId of the in-flight query, so a stale reply can be ignored. */
  let pendingRequestId: string | undefined;
  /** The most recent successful result, reduced to what the graph reacts to. */
  let effect: SparqlGraphEffect = NO_EFFECT;

  const reapply = (): void => {
    const cy = deps.getCy();
    if (!cy) {
      return;
    }
    if (panel) {
      applySparqlGraphEffect(cy, effect, panel.getMode());
    }
    // applyDim is the single owner of the `dimmed` class and must run even
    // when no SPARQL panel exists yet, so search and focus still take effect.
    applyDim(cy);
  };

  const setVisible = (visible: boolean): void => {
    if (!panel) {
      return;
    }
    panel.setVisible(visible);
    deps.toggleButton.setAttribute("aria-pressed", String(visible));
    if (visible) {
      panel.focusInput();
    }
  };

  deps.toggleButton.addEventListener("click", () => {
    setVisible(!(panel?.isVisible() ?? false));
  });

  return {
    install: (strings, samples) => {
      panel = createSparqlPanel(strings, samples, {
        onRun: (query) => {
          const requestId = deps.nextRequestId();
          pendingRequestId = requestId;
          panel?.setBusy(true);
          deps.post({ type: "runSparql", requestId, query });
        },
        onModeChange: () => reapply(),
      });
      deps.mount.replaceChildren(panel.element);
      deps.toggleButton.textContent = strings.sparqlToggleLabel;
      deps.toggleButton.setAttribute("aria-label", strings.sparqlPanelTitle);
      deps.toggleButton.setAttribute("aria-pressed", "false");
    },

    handleResult: (message) => {
      // A slow earlier query resolving after a newer one would otherwise
      // clobber the view with a stale result.
      if (message.requestId !== pendingRequestId) {
        return;
      }
      pendingRequestId = undefined;
      panel?.setBusy(false);

      if (!message.ok || !message.result) {
        effect = NO_EFFECT;
        reapply();
        panel?.showError(message.errorMessage ?? "Query failed.");
        return;
      }
      effect = {
        matchedIris: message.highlightIris ?? [],
        typeFallback: message.highlightTypeFallback ?? {},
      };
      panel?.showResult(message.result);
      reapply();
    },

    reapply,
  };
}
